'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const concentrated = require('../editorial/normalized/concentrated.json');
const registry = require('../projection/stremio/video-id-registry.json');
const {
  FFPROBE_ARGUMENTS,
  createInspectionReport,
  emitInspectionReport,
  parseFfprobeOutput,
  reportExitCode,
  runFfprobe,
  validateAssignments,
} = require('../scripts/inspect-local-media');

const repositoryRoot = path.resolve(__dirname, '..');
let temporaryRepositoryRoot;

function assignment(recordId, videoId, relativePath) {
  return { recordId, videoId, relativePath };
}

function mapping(...assignments) {
  return { schemaVersion: 1, assignments };
}

function standardProbe(overrides = {}) {
  return {
    format: {
      format_name: 'matroska,webm',
      duration: '300.250000',
      ...overrides.format,
    },
    streams: overrides.streams || [
      {
        index: 0,
        codec_type: 'video',
        codec_name: 'hevc',
        profile: 'Main',
        width: 768,
        height: 576,
        pix_fmt: 'yuv420p',
        r_frame_rate: '24000/1001',
        avg_frame_rate: '24000/1001',
        disposition: { attached_pic: 0, default: 1 },
      },
      {
        index: 1,
        codec_type: 'audio',
        codec_name: 'aac',
        profile: 'LC',
        channels: 2,
        channel_layout: 'stereo',
        tags: { language: 'jpn', title: 'Original Audio' },
        disposition: { default: 1, forced: 0 },
      },
      {
        index: 2,
        codec_type: 'subtitle',
        codec_name: 'ass',
        tags: { language: 'eng', title: 'Full Subtitles' },
        disposition: { default: 1, forced: 0 },
      },
    ],
  };
}

function inspectWith(probe) {
  return () => structuredClone(probe);
}

function createReport(localMapping, probe = standardProbe()) {
  return createInspectionReport({
    mapping: localMapping,
    concentrated,
    registry,
    rootDir: temporaryRepositoryRoot,
    inspectFile: inspectWith(probe),
  });
}

before(() => {
  temporaryRepositoryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'bleach-local-media-inspection-'),
  );
  fs.mkdirSync(path.join(temporaryRepositoryRoot, 'sources'));
  fs.mkdirSync(path.join(temporaryRepositoryRoot, 'sources', 'directory.mkv'));
  fs.writeFileSync(path.join(temporaryRepositoryRoot, 'sources', 'three.mkv'), 'three');
  fs.writeFileSync(path.join(temporaryRepositoryRoot, 'sources', 'four.mkv'), 'four!');
  fs.writeFileSync(path.join(temporaryRepositoryRoot, 'sources', 'five.mkv'), 'five!!');
  fs.writeFileSync(path.join(temporaryRepositoryRoot, 'sources', 'decimal.mkv'), 'decimal');
});

after(() => {
  fs.rmSync(temporaryRepositoryRoot, { recursive: true, force: true });
});

test('accepts an explicit Concentrated record/video assignment without filename inference', () => {
  const report = createReport(
    mapping(assignment('concentrated:03', 'cb_3', 'sources/three.mkv')),
  );

  assert.equal(report.reportKind, 'local-media-inspection-review');
  assert.equal(report.evidenceState, 'not-created');
  assert.deepEqual(report.inspectionSummary, { total: 1, succeeded: 1, failed: 0 });
  assert.deepEqual(report.assignments[0].inspection, { state: 'success' });
  assert.equal(reportExitCode(report), 0);
  assert.deepEqual(report.assignments[0].assignment, {
    recordId: 'concentrated:03',
    videoId: 'cb_3',
    relativePath: 'sources/three.mkv',
  });
  assert.deepEqual(report.assignments[0].filesystem, {
    filename: 'three.mkv',
    byteSize: 5,
  });
  assert.equal(JSON.stringify(report).includes(temporaryRepositoryRoot), false);
});

test('rejects a mismatched recordId/videoId pair', () => {
  assert.throws(
    () => validateAssignments({
      mapping: mapping(assignment('concentrated:03', 'cb_4', 'sources/three.mkv')),
      concentrated,
      registry,
      rootDir: temporaryRepositoryRoot,
    }),
    /is registered to/,
  );
});

test('rejects an unknown recordId', () => {
  assert.throws(
    () => validateAssignments({
      mapping: mapping(assignment('concentrated:999', 'cb_3', 'sources/three.mkv')),
      concentrated,
      registry,
      rootDir: temporaryRepositoryRoot,
    }),
    /unknown Concentrated recordId/,
  );
});

test('rejects an unknown videoId', () => {
  assert.throws(
    () => validateAssignments({
      mapping: mapping(assignment('concentrated:03', 'cb_999', 'sources/three.mkv')),
      concentrated,
      registry,
      rootDir: temporaryRepositoryRoot,
    }),
    /unknown videoId/,
  );
});

test('rejects a duplicate recordId', () => {
  assert.throws(
    () => validateAssignments({
      mapping: mapping(
        assignment('concentrated:03', 'cb_3', 'sources/three.mkv'),
        assignment('concentrated:03', 'cb_4', 'sources/four.mkv'),
      ),
      concentrated,
      registry,
      rootDir: temporaryRepositoryRoot,
    }),
    /duplicate recordId/,
  );
});

test('rejects a duplicate videoId', () => {
  assert.throws(
    () => validateAssignments({
      mapping: mapping(
        assignment('concentrated:03', 'cb_3', 'sources/three.mkv'),
        assignment('concentrated:04', 'cb_3', 'sources/four.mkv'),
      ),
      concentrated,
      registry,
      rootDir: temporaryRepositoryRoot,
    }),
    /duplicate videoId/,
  );
});

test('rejects a duplicate relativePath', () => {
  assert.throws(
    () => validateAssignments({
      mapping: mapping(
        assignment('concentrated:03', 'cb_3', 'sources/three.mkv'),
        assignment('concentrated:04', 'cb_4', 'sources/three.mkv'),
      ),
      concentrated,
      registry,
      rootDir: temporaryRepositoryRoot,
    }),
    /duplicate relativePath/,
  );
});

test('rejects absolute media paths', () => {
  assert.throws(
    () => validateAssignments({
      mapping: mapping(assignment('concentrated:03', 'cb_3', '/tmp/three.mkv')),
      concentrated,
      registry,
      rootDir: temporaryRepositoryRoot,
    }),
    /repository-relative/,
  );
});

test('rejects POSIX and Windows-style path traversal', () => {
  for (const relativePath of ['../three.mkv', '..\\three.mkv']) {
    assert.throws(
      () => validateAssignments({
        mapping: mapping(assignment('concentrated:03', 'cb_3', relativePath)),
        concentrated,
        registry,
        rootDir: temporaryRepositoryRoot,
      }),
      /must not escape the repository root/,
    );
  }
});

test('rejects a missing local media file', () => {
  assert.throws(
    () => validateAssignments({
      mapping: mapping(assignment('concentrated:03', 'cb_3', 'sources/missing.mkv')),
      concentrated,
      registry,
      rootDir: temporaryRepositoryRoot,
    }),
    /missing local media file/,
  );
});

test('rejects a directory where a media file is expected', () => {
  assert.throws(
    () => validateAssignments({
      mapping: mapping(assignment('concentrated:03', 'cb_3', 'sources/directory.mkv')),
      concentrated,
      registry,
      rootDir: temporaryRepositoryRoot,
    }),
    /is not a file/,
  );
});

test('sorts assignments by permanent registry order regardless of mapping order', () => {
  const inOrder = mapping(
    assignment('concentrated:03', 'cb_3', 'sources/three.mkv'),
    assignment('concentrated:04', 'cb_4', 'sources/four.mkv'),
  );
  const reversed = mapping(...[...inOrder.assignments].reverse());

  const first = `${JSON.stringify(createReport(inOrder), null, 2)}\n`;
  const second = `${JSON.stringify(createReport(reversed), null, 2)}\n`;

  assert.equal(second, first);
  const report = createReport(reversed);
  assert.deepEqual(report.inspectionSummary, { total: 2, succeeded: 2, failed: 0 });
  assert.equal(reportExitCode(report), 0);
  let emittedJson = '';
  assert.equal(emitInspectionReport(report, {
    write(chunk) {
      emittedJson += chunk;
    },
  }), 0);
  assert.deepEqual(JSON.parse(emittedJson), report);
  assert.deepEqual(
    report.assignments.map(({ assignment: item }) => item.videoId),
    ['cb_3', 'cb_4'],
  );
});

test('distinguishes an attached picture from the ordinary video stream', () => {
  const report = createReport(mapping(
    assignment('concentrated:03', 'cb_3', 'sources/three.mkv'),
  ), standardProbe({
    streams: [
      {
        index: 0,
        codec_type: 'video',
        codec_name: 'mjpeg',
        profile: 'Baseline',
        width: 600,
        height: 600,
        pix_fmt: 'yuvj420p',
        disposition: { attached_pic: 1, default: 0 },
      },
      {
        index: 1,
        codec_type: 'video',
        codec_name: 'hevc',
        profile: 'Main',
        width: 768,
        height: 576,
        pix_fmt: 'yuv420p',
        disposition: { attached_pic: 0, default: 1 },
      },
    ],
  }));

  assert.equal(report.assignments[0].streams.video[0].disposition.attached_pic, 1);
  assert.equal(report.assignments[0].streams.video[1].disposition.attached_pic, 0);
  assert.equal(
    report.assignments[0].warnings.some(({ code }) => code === 'multiple-ordinary-video-streams'),
    false,
  );
  assert.equal(
    report.assignments[0].warnings.some(({ code }) => code === 'no-ordinary-video-stream'),
    false,
  );
});

test('does not treat an attached-picture-only stream as ordinary video', () => {
  const report = createReport(mapping(
    assignment('concentrated:03', 'cb_3', 'sources/three.mkv'),
  ), standardProbe({
    streams: [{
      index: 0,
      codec_type: 'video',
      codec_name: 'mjpeg',
      disposition: { attached_pic: 1, default: 0 },
    }],
  }));

  assert.deepEqual(report.assignments[0].warnings, [{ code: 'no-ordinary-video-stream' }]);
});

test('reports multiple ordinary video streams without selecting one', () => {
  const report = createReport(mapping(
    assignment('concentrated:03', 'cb_3', 'sources/three.mkv'),
  ), standardProbe({
    streams: [
      { index: 1, codec_type: 'video', codec_name: 'hevc', disposition: { attached_pic: 0 } },
      { index: 4, codec_type: 'video', codec_name: 'h264', disposition: { attached_pic: 0 } },
    ],
  }));
  const warning = report.assignments[0].warnings.find(
    ({ code }) => code === 'multiple-ordinary-video-streams',
  );

  assert.deepEqual(warning.streamIndexes, [1, 4]);
  assert.equal(Object.hasOwn(report.assignments[0], 'primaryVideoStream'), false);
});

test('preserves raw language tags and titles without translation', () => {
  const report = createReport(mapping(
    assignment('concentrated:03', 'cb_3', 'sources/three.mkv'),
  ));

  assert.deepEqual(report.assignments[0].streams.audio[0].tags, {
    language: 'jpn',
    title: 'Original Audio',
  });
  assert.deepEqual(report.assignments[0].streams.subtitles[0].tags, {
    language: 'eng',
    title: 'Full Subtitles',
  });
  assert.equal(JSON.stringify(report).includes('Japanese'), false);
});

test('represents missing optional ffprobe values as null rather than inventing them', () => {
  const report = createReport(mapping(
    assignment('concentrated:03', 'cb_3', 'sources/three.mkv'),
  ), {
    format: { format_name: 'matroska,webm' },
    streams: [
      { index: 0, codec_type: 'video', codec_name: 'hevc' },
      { index: 1, codec_type: 'audio', codec_name: 'aac' },
      { index: 2, codec_type: 'subtitle', codec_name: 'ass' },
    ],
  });

  assert.equal(report.assignments[0].measuredContainerDurationSeconds, null);
  assert.equal(report.assignments[0].streams.video[0].profile, null);
  assert.equal(report.assignments[0].streams.video[0].r_frame_rate, null);
  assert.deepEqual(report.assignments[0].streams.audio[0].tags, {
    language: null,
    title: null,
  });
  assert.deepEqual(report.assignments[0].streams.subtitles[0].tags, {
    language: null,
    title: null,
  });
  assert.deepEqual(
    report.assignments[0].warnings.map(({ code }) => code),
    [
      'missing-video-attached-pic-disposition',
      'no-ordinary-video-stream',
      'missing-container-duration',
      'missing-audio-language-tag',
      'missing-subtitle-language-tag',
      'missing-subtitle-title-tag',
    ],
  );
});

test('keeps measured duration separate from normalized editorial runtime', () => {
  const record = concentrated.records.find(({ recordId }) => recordId === 'concentrated:03');
  const measured = record.runtime.seconds + 0.25;
  const report = createReport(mapping(
    assignment('concentrated:03', 'cb_3', 'sources/three.mkv'),
  ), standardProbe({ format: { duration: String(measured) } }));
  const item = report.assignments[0];

  assert.deepEqual(item.editorialRuntime, {
    state: 'known',
    displayed: record.runtime.displayed,
    seconds: record.runtime.seconds,
  });
  assert.equal(item.measuredContainerDurationSeconds, measured);
  assert.equal(item.durationDeltaSeconds, 0.25);
});

test('uses the default inspector with an injected ffprobe process runner', () => {
  let invocation;
  const report = createInspectionReport({
    mapping: mapping(assignment('concentrated:03', 'cb_3', 'sources/three.mkv')),
    concentrated,
    registry,
    rootDir: temporaryRepositoryRoot,
    spawnSync(command, args, options) {
      invocation = { command, args, options };
      return {
        status: 0,
        stdout: JSON.stringify(standardProbe()),
        stderr: '',
      };
    },
  });

  assert.deepEqual(invocation, {
    command: 'ffprobe',
    args: [...FFPROBE_ARGUMENTS, path.join(temporaryRepositoryRoot, 'sources', 'three.mkv')],
    options: {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      shell: false,
    },
  });
  assert.deepEqual(report.assignments[0].inspection, { state: 'success' });
  assert.deepEqual(report.assignments[0].assignment, {
    recordId: 'concentrated:03',
    videoId: 'cb_3',
    relativePath: 'sources/three.mkv',
  });
  assert.deepEqual(report.assignments[0].container, { format_name: 'matroska,webm' });
  assert.equal(report.assignments[0].measuredContainerDurationSeconds, 300.25);
  assert.equal(report.assignments[0].streams.video[0].codec_name, 'hevc');
  assert.equal(report.assignments[0].streams.audio[0].tags.language, 'jpn');
  assert.equal(report.assignments[0].streams.subtitles[0].tags.language, 'eng');
});

test('preserves a default-inspector ffprobe failure without leaking private paths', () => {
  const report = createInspectionReport({
    mapping: mapping(assignment('concentrated:03', 'cb_3', 'sources/three.mkv')),
    concentrated,
    registry,
    rootDir: temporaryRepositoryRoot,
    spawnSync: () => ({
      status: 23,
      stdout: '',
      stderr: `${temporaryRepositoryRoot}/private ffprobe diagnostic`,
    }),
  });

  assert.deepEqual(report.assignments[0].assignment, {
    recordId: 'concentrated:03',
    videoId: 'cb_3',
    relativePath: 'sources/three.mkv',
  });
  assert.deepEqual(report.assignments[0].inspection, {
    state: 'failed',
    error: {
      code: 'ffprobe-nonzero-exit',
      message: 'ffprobe exited with status 23',
    },
  });
  assert.notEqual(report.assignments[0].inspection.error.code, 'inspection-failed');
  assert.equal(JSON.stringify(report).includes(temporaryRepositoryRoot), false);
});

test('passes the assignment as the custom inspector second argument', () => {
  let callbackArguments;
  const report = createInspectionReport({
    mapping: mapping(assignment('concentrated:03', 'cb_3', 'sources/three.mkv')),
    concentrated,
    registry,
    rootDir: temporaryRepositoryRoot,
    inspectFile(...args) {
      callbackArguments = args;
      return standardProbe();
    },
  });

  assert.equal(callbackArguments.length, 2);
  assert.equal(callbackArguments[0], path.join(temporaryRepositoryRoot, 'sources', 'three.mkv'));
  assert.deepEqual(callbackArguments[1], {
    recordId: 'concentrated:03',
    videoId: 'cb_3',
    relativePath: 'sources/three.mkv',
  });
  assert.deepEqual(report.assignments[0].inspection, { state: 'success' });
});

test('retains successes and continues after a failed assignment', () => {
  const localMapping = mapping(
    assignment('concentrated:05', 'cb_5', 'sources/five.mkv'),
    assignment('concentrated:04', 'cb_4', 'sources/four.mkv'),
    assignment('concentrated:03', 'cb_3', 'sources/three.mkv'),
  );
  const inspected = [];
  const inspectFile = (resolvedPath, explicitAssignment) => {
    inspected.push(explicitAssignment.videoId);
    if (explicitAssignment.videoId === 'cb_4') {
      return runFfprobe(resolvedPath, () => ({
        status: 9,
        stdout: '',
        stderr: `${temporaryRepositoryRoot}/private diagnostic`,
      }));
    }
    return standardProbe({
      format: { duration: explicitAssignment.videoId === 'cb_3' ? '301.5' : '302.5' },
    });
  };

  const report = createInspectionReport({
    mapping: localMapping,
    concentrated,
    registry,
    rootDir: temporaryRepositoryRoot,
    inspectFile,
  });

  assert.deepEqual(inspected, ['cb_3', 'cb_4', 'cb_5']);
  assert.deepEqual(report.inspectionSummary, { total: 3, succeeded: 2, failed: 1 });
  assert.equal(reportExitCode(report), 1);
  let emittedJson = '';
  assert.equal(emitInspectionReport(report, {
    write(chunk) {
      emittedJson += chunk;
    },
  }), 1);
  assert.deepEqual(JSON.parse(emittedJson), report);
  assert.deepEqual(
    report.assignments.map(({ assignment: item, inspection }) => [item.videoId, inspection.state]),
    [['cb_3', 'success'], ['cb_4', 'failed'], ['cb_5', 'success']],
  );
  assert.equal(report.assignments[0].measuredContainerDurationSeconds, 301.5);
  assert.equal(report.assignments[2].measuredContainerDurationSeconds, 302.5);
  assert.deepEqual(report.assignments[1].inspection, {
    state: 'failed',
    error: {
      code: 'ffprobe-nonzero-exit',
      message: 'ffprobe exited with status 9',
    },
  });
  assert.deepEqual(Object.keys(report.assignments[1]).sort(), [
    'assignment',
    'editorialRuntime',
    'filesystem',
    'inspection',
  ]);
  assert.equal(JSON.stringify(report).includes(temporaryRepositoryRoot), false);

  const secondReport = createInspectionReport({
    mapping: mapping(...[...localMapping.assignments].reverse()),
    concentrated,
    registry,
    rootDir: temporaryRepositoryRoot,
    inspectFile: (_, explicitAssignment) => {
      if (explicitAssignment.videoId === 'cb_4') {
        return runFfprobe('/not-reported/private-path', () => ({
          status: 9,
          stdout: '',
          stderr: 'ignored',
        }));
      }
      return standardProbe({
        format: { duration: explicitAssignment.videoId === 'cb_3' ? '301.5' : '302.5' },
      });
    },
  });
  assert.equal(JSON.stringify(secondReport), JSON.stringify(report));
});

test('sanitizes every supported ffprobe failure class into a failed result', () => {
  const cases = [
    {
      expectedCode: 'ffprobe-start-failed',
      spawn: () => ({ error: { code: 'ENOENT', message: `${temporaryRepositoryRoot}/ffprobe` } }),
    },
    {
      expectedCode: 'ffprobe-nonzero-exit',
      spawn: () => ({ status: 2, stdout: '', stderr: `${temporaryRepositoryRoot}/media` }),
    },
    {
      expectedCode: 'ffprobe-invalid-json',
      spawn: () => ({ status: 0, stdout: '{', stderr: '' }),
    },
    {
      expectedCode: 'ffprobe-invalid-structure',
      spawn: () => ({ status: 0, stdout: '{}', stderr: '' }),
    },
  ];

  for (const { expectedCode, spawn } of cases) {
    const report = createInspectionReport({
      mapping: mapping(assignment('concentrated:03', 'cb_3', 'sources/three.mkv')),
      concentrated,
      registry,
      rootDir: temporaryRepositoryRoot,
      inspectFile: (resolvedPath) => runFfprobe(resolvedPath, spawn),
    });
    assert.equal(report.assignments[0].inspection.state, 'failed');
    assert.equal(report.assignments[0].inspection.error.code, expectedCode);
    assert.equal(JSON.stringify(report).includes(temporaryRepositoryRoot), false);
  }
});

test('mapping and path validation remain fatal before inspection starts', () => {
  let inspectionCalls = 0;
  assert.throws(
    () => createInspectionReport({
      mapping: mapping(assignment('concentrated:03', 'cb_3', 'sources/missing.mkv')),
      concentrated,
      registry,
      rootDir: temporaryRepositoryRoot,
      inspectFile: () => {
        inspectionCalls += 1;
        return standardProbe();
      },
    }),
    /missing local media file/,
  );
  assert.equal(inspectionCalls, 0);
});

test('invokes ffprobe with an argument vector and shell disabled', () => {
  let invocation;
  const result = runFfprobe('/internal/file.mkv', (command, args, options) => {
    invocation = { command, args, options };
    return {
      status: 0,
      stdout: JSON.stringify({ format: {}, streams: [] }),
      stderr: '',
    };
  });

  assert.equal(invocation.command, 'ffprobe');
  assert.deepEqual(invocation.args, [...FFPROBE_ARGUMENTS, '/internal/file.mkv']);
  assert.equal(invocation.options.shell, false);
  assert.deepEqual(result, { format: {}, streams: [] });
});

test('rejects invalid ffprobe JSON and missing top-level structures', () => {
  assert.throws(() => parseFfprobeOutput('{'), /invalid JSON/);
  assert.throws(() => parseFfprobeOutput('{}'), /streams array/);
  assert.throws(
    () => parseFfprobeOutput(JSON.stringify({ streams: [], format: [] })),
    /format object/,
  );
});

test('retains attachment observations and warns about unsupported stream types', () => {
  const report = createReport(mapping(
    assignment('concentrated:03', 'cb_3', 'sources/three.mkv'),
  ), standardProbe({
    streams: [
      { index: 0, codec_type: 'video', codec_name: 'hevc', disposition: { attached_pic: 0 } },
      {
        index: 5,
        codec_type: 'attachment',
        codec_name: 'ttf',
        tags: { filename: 'font.ttf', mimetype: 'application/x-truetype-font' },
      },
      { index: 6, codec_type: 'data', codec_name: 'bin_data' },
    ],
  }));

  assert.deepEqual(report.assignments[0].streams.attachments, [{
    index: 5,
    codec_name: 'ttf',
    codec_type: 'attachment',
    tags: {
      filename: 'font.ttf',
      mimetype: 'application/x-truetype-font',
    },
  }]);
  assert.deepEqual(report.assignments[0].streams.other, [{
    index: 6,
    codec_name: 'bin_data',
    codec_type: 'data',
  }]);
  assert.deepEqual(
    report.assignments[0].warnings.find(({ code }) => code === 'unexpected-stream-type'),
    { code: 'unexpected-stream-type', streamIndex: 6, codecType: 'data' },
  );
});

test('supports the permanent decimal pairing concentrated:27.5 / cb_27p5 synthetically', () => {
  const report = createReport(mapping(
    assignment('concentrated:27.5', 'cb_27p5', 'sources/decimal.mkv'),
  ));

  assert.deepEqual(report.assignments[0].assignment, {
    recordId: 'concentrated:27.5',
    videoId: 'cb_27p5',
    relativePath: 'sources/decimal.mkv',
  });
});

test('does not write verified-media evidence while creating an inspection report', () => {
  const evidenceDirectory = path.join(repositoryRoot, 'evidence', 'media');
  const beforeEntries = fs.readdirSync(evidenceDirectory).sort();
  const report = createReport(mapping(
    assignment('concentrated:03', 'cb_3', 'sources/three.mkv'),
  ));
  const afterEntries = fs.readdirSync(evidenceDirectory).sort();

  assert.deepEqual(afterEntries, beforeEntries);
  assert.equal(report.evidenceState, 'not-created');
});
