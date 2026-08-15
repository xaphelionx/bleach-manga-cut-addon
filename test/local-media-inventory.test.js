'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');

const concentrated = require('../editorial/normalized/concentrated.json');
const registry = require('../projection/stremio/video-id-registry.json');
const cb1Evidence = require('../evidence/media/cb_1.json');
const cb2Evidence = require('../evidence/media/cb_2.json');
const {
  SUPPORTED_MEDIA_EXTENSIONS,
  buildInventoryReport,
  createInspectorMapping,
  createInventoryReport,
  reportExitCode,
} = require('../scripts/inventory-local-media');

const repositoryRoot = path.resolve(__dirname, '..');
const temporaryRoots = [];

function createSyntheticRoot(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bleach-local-media-inventory-'));
  temporaryRoots.push(root);
  for (const [relativePath, contents] of files) {
    const filename = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, contents);
  }
  return root;
}

function createReport(files, options = {}) {
  const rootDir = createSyntheticRoot(files.map(([relativePath, contents]) => [
    path.join('media', relativePath),
    contents,
  ]));
  return {
    rootDir,
    report: createInventoryReport({
      rootDir,
      directory: 'media',
      concentrated: options.concentrated || concentrated,
      registry: options.registry || registry,
      evidenceRecords: options.evidenceRecords || [],
    }),
  };
}

function approvalFor(file, overrides = {}) {
  return {
    relativePath: file.relativePath,
    approved: true,
    recordId: file.mappingProposal.recordId,
    videoId: file.mappingProposal.videoId,
    ...overrides,
  };
}

function snapshotTree(relativeDirectory) {
  const root = path.join(repositoryRoot, relativeDirectory);
  const snapshot = {};
  const visit = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile()) {
        const relativePath = path.relative(repositoryRoot, filename).split(path.sep).join('/');
        snapshot[relativePath] = crypto.createHash('sha256')
          .update(fs.readFileSync(filename))
          .digest('hex');
      }
    }
  };
  visit(root);
  return snapshot;
}

after(() => {
  for (const root of temporaryRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('defines the supported local-media extension policy explicitly', () => {
  assert.deepEqual(SUPPORTED_MEDIA_EXTENSIONS, [
    '.avi',
    '.m2ts',
    '.m4v',
    '.mkv',
    '.mov',
    '.mp4',
    '.mpeg',
    '.mpg',
    '.ts',
    '.webm',
  ]);
  assert.equal(Object.isFrozen(SUPPORTED_MEDIA_EXTENSIONS), true);
});

test('suggests an ordinary integer filename mapping for explicit review', () => {
  const { report } = createReport([
    ['03 - The Pink-Cheeked Cockatiel.mkv', 'three'],
  ]);
  const file = report.files[0];

  assert.deepEqual(report.coverageSummary, {
    totalMediaFiles: 1,
    suggested: 1,
    unresolved: 0,
    ambiguous: 0,
    alreadyVerifiedEvidence: 0,
  });
  assert.deepEqual(file.filenameObservation, {
    identifierHint: '03',
    titleText: 'The Pink-Cheeked Cockatiel',
  });
  assert.deepEqual(file.mappingProposal, {
    state: 'suggested',
    basis: 'filename-prefix',
    identifierHint: '03',
    recordId: 'concentrated:03',
    videoId: 'cb_3',
    authoritative: false,
    approvalRequired: true,
  });
  assert.deepEqual(file.warnings, []);
  assert.equal(reportExitCode(report), 0);
});

test('preserves lexical decimal identity for concentrated:27.5 and cb_27p5', () => {
  const { report } = createReport([
    ['27.5 - Meanwhile, in the Living World.mkv', 'decimal'],
  ]);

  assert.deepEqual(report.files[0].mappingProposal, {
    state: 'suggested',
    basis: 'filename-prefix',
    identifierHint: '27.5',
    recordId: 'concentrated:27.5',
    videoId: 'cb_27p5',
    authoritative: false,
    approvalRequired: true,
  });
});

test('leaves an unknown numeric prefix unresolved without inventing a record', () => {
  const { report } = createReport([['999 - Unknown.mkv', 'unknown']]);

  assert.deepEqual(report.files[0].mappingProposal, {
    state: 'unresolved',
    reason: 'filename-prefix-matches-no-record',
    basis: 'filename-prefix',
    identifierHint: '999',
    authoritative: false,
    reviewRequired: true,
  });
  assert.deepEqual(report.coverageSummary, {
    totalMediaFiles: 1,
    suggested: 0,
    unresolved: 1,
    ambiguous: 0,
    alreadyVerifiedEvidence: 0,
  });
});

test('leaves a filename with no safely parseable prefix unresolved', () => {
  const { report } = createReport([['Episode Three.mkv', 'unknown']]);

  assert.deepEqual(report.files[0].filenameObservation, {
    identifierHint: null,
    titleText: null,
  });
  assert.deepEqual(report.files[0].mappingProposal, {
    state: 'unresolved',
    reason: 'no-usable-filename-prefix',
    authoritative: false,
    reviewRequired: true,
  });
});

test('fails closed when one lexical filename hint matches multiple records', () => {
  const syntheticConcentrated = {
    records: [
      {
        recordId: 'concentrated:alpha',
        projectId: 'concentrated',
        sourceIdentifier: { raw: '3', displayed: '03' },
        title: 'Alpha',
      },
      {
        recordId: 'concentrated:beta',
        projectId: 'concentrated',
        sourceIdentifier: { raw: '03', displayed: '3' },
        title: 'Beta',
      },
    ],
  };
  const syntheticRegistry = {
    entries: [
      { projectId: 'concentrated', recordId: 'concentrated:alpha', videoId: 'cb_alpha' },
      { projectId: 'concentrated', recordId: 'concentrated:beta', videoId: 'cb_beta' },
    ],
  };
  const { report } = createReport([['03 - Review Me.mkv', 'ambiguous']], {
    concentrated: syntheticConcentrated,
    registry: syntheticRegistry,
  });

  assert.equal(report.files[0].mappingProposal.state, 'ambiguous');
  assert.equal(
    report.files[0].mappingProposal.reason,
    'filename-prefix-matches-multiple-records',
  );
  assert.deepEqual(report.files[0].mappingProposal.candidates, [
    { recordId: 'concentrated:alpha', videoIds: ['cb_alpha'] },
    { recordId: 'concentrated:beta', videoIds: ['cb_beta'] },
  ]);
  assert.equal(report.coverageSummary.ambiguous, 1);
  assert.equal(reportExitCode(report), 1);
});

test('marks every duplicate record/video proposal as ambiguous', () => {
  const { report } = createReport([
    ['03 - First Copy.mkv', 'first'],
    ['03 - Second Copy.mp4', 'second'],
  ]);

  assert.deepEqual(
    report.files.map(({ mappingProposal }) => [mappingProposal.state, mappingProposal.reason]),
    [
      ['ambiguous', 'duplicate-record-or-video-proposal'],
      ['ambiguous', 'duplicate-record-or-video-proposal'],
    ],
  );
  assert.deepEqual(report.coverageSummary, {
    totalMediaFiles: 2,
    suggested: 0,
    unresolved: 0,
    ambiguous: 2,
    alreadyVerifiedEvidence: 0,
  });
  assert.equal(reportExitCode(report), 1);
});

test('detects a duplicate videoId proposal across distinct records', () => {
  const syntheticConcentrated = {
    records: [
      {
        recordId: 'concentrated:03',
        projectId: 'concentrated',
        sourceIdentifier: { raw: '3', displayed: '03' },
        title: 'Three',
      },
      {
        recordId: 'concentrated:04',
        projectId: 'concentrated',
        sourceIdentifier: { raw: '4', displayed: '04' },
        title: 'Four',
      },
    ],
  };
  const syntheticRegistry = {
    entries: [
      { projectId: 'concentrated', recordId: 'concentrated:03', videoId: 'cb_shared' },
      { projectId: 'concentrated', recordId: 'concentrated:04', videoId: 'cb_shared' },
    ],
  };
  const { report } = createReport([
    ['03 - Three.mkv', 'three'],
    ['04 - Four.mkv', 'four'],
  ], {
    concentrated: syntheticConcentrated,
    registry: syntheticRegistry,
  });

  assert.deepEqual(
    report.files.map(({ mappingProposal }) => ({
      state: mappingProposal.state,
      reason: mappingProposal.reason,
      recordId: mappingProposal.recordId,
      videoId: mappingProposal.videoId,
    })),
    [
      {
        state: 'ambiguous',
        reason: 'duplicate-record-or-video-proposal',
        recordId: 'concentrated:03',
        videoId: 'cb_shared',
      },
      {
        state: 'ambiguous',
        reason: 'duplicate-record-or-video-proposal',
        recordId: 'concentrated:04',
        videoId: 'cb_shared',
      },
    ],
  );
  assert.equal(report.coverageSummary.ambiguous, 2);
  assert.equal(reportExitCode(report), 1);
});

test('warns about title text differences without changing numeric identity', () => {
  const { report } = createReport([['03 - Deliberately Different.mkv', 'three']]);
  const file = report.files[0];

  assert.equal(file.mappingProposal.recordId, 'concentrated:03');
  assert.equal(file.mappingProposal.videoId, 'cb_3');
  assert.deepEqual(file.warnings, [{ code: 'filename-title-differs-from-editorial' }]);
});

test('orders output byte-deterministically regardless of creation order', () => {
  const files = [
    ['04 - Bad Standard.mkv', 'four'],
    ['nested/27.5 - Meanwhile, in the Living World.webm', 'decimal'],
    ['03 - The Pink-Cheeked Cockatiel.mp4', 'three'],
  ];
  const first = createReport(files).report;
  const second = createReport([...files].reverse()).report;

  assert.equal(JSON.stringify(second), JSON.stringify(first));
  assert.deepEqual(first.files.map(({ relativePath }) => relativePath), [
    'media/03 - The Pink-Cheeked Cockatiel.mp4',
    'media/04 - Bad Standard.mkv',
    'media/nested/27.5 - Meanwhile, in the Living World.webm',
  ]);
});

test('ignores torrent artifacts even when their basename looks like media', () => {
  const { report } = createReport([
    ['03 - The Pink-Cheeked Cockatiel.mkv', 'media'],
    ['03 - The Pink-Cheeked Cockatiel.mkv.torrent', 'torrent'],
  ]);

  assert.equal(report.coverageSummary.totalMediaFiles, 1);
  assert.equal(report.files[0].extension, '.mkv');
});

test('ignores JSON mapping/report files and other unsupported non-media files', () => {
  const { report } = createReport([
    ['inventory.json', '{}'],
    ['mapping.JSON', '{}'],
    ['notes.txt', 'notes'],
    ['episode.nfo', 'metadata'],
  ]);

  assert.equal(report.coverageSummary.totalMediaFiles, 0);
  assert.deepEqual(report.files, []);
});

test('emits repository-relative paths only and never leaks the temporary root', () => {
  const { rootDir, report } = createReport([
    ['nested/03 - The Pink-Cheeked Cockatiel.MKV', 'three'],
  ]);
  const serialized = JSON.stringify(report);

  assert.equal(report.directory, 'media');
  assert.equal(report.files[0].relativePath, 'media/nested/03 - The Pink-Cheeked Cockatiel.MKV');
  assert.equal(report.files[0].extension, '.mkv');
  assert.equal(path.isAbsolute(report.files[0].relativePath), false);
  assert.equal(serialized.includes(rootDir), false);
  assert.equal(serialized.includes(os.tmpdir()), false);
});

test('recognizes existing CB1 and CB2 verified evidence by videoId without mutation', () => {
  const { report } = createReport([
    ['01 - Death and Strawberry.mkv', 'one'],
    ['02 - Starter.mkv', 'two'],
  ], { evidenceRecords: [cb2Evidence, cb1Evidence] });

  assert.deepEqual(report.existingVerifiedEvidenceVideoIds, ['cb_1', 'cb_2']);
  assert.equal(report.coverageSummary.alreadyVerifiedEvidence, 2);
  assert.deepEqual(
    report.files.map(({ mappingProposal }) => mappingProposal.videoId),
    ['cb_1', 'cb_2'],
  );
});

test('converts explicitly approved suggestions to the inspector mapping schema', () => {
  const { report } = createReport([
    ['27.5 - Meanwhile, in the Living World.mkv', 'decimal'],
    ['03 - The Pink-Cheeked Cockatiel.mkv', 'three'],
  ]);
  const byVideoId = new Map(report.files.map((file) => [file.mappingProposal.videoId, file]));
  const inspectorMapping = createInspectorMapping(report, {
    schemaVersion: 1,
    approvals: [
      approvalFor(byVideoId.get('cb_27p5')),
      approvalFor(byVideoId.get('cb_3')),
    ],
  });

  assert.deepEqual(inspectorMapping, {
    schemaVersion: 1,
    assignments: [
      {
        recordId: 'concentrated:03',
        videoId: 'cb_3',
        relativePath: 'media/03 - The Pink-Cheeked Cockatiel.mkv',
      },
      {
        recordId: 'concentrated:27.5',
        videoId: 'cb_27p5',
        relativePath: 'media/27.5 - Meanwhile, in the Living World.mkv',
      },
    ],
  });
});

test('rejects conversion of a suggestion without explicit approval', () => {
  const { report } = createReport([
    ['03 - The Pink-Cheeked Cockatiel.mkv', 'three'],
  ]);

  assert.throws(
    () => createInspectorMapping(report, {
      schemaVersion: 1,
      approvals: [approvalFor(report.files[0], { approved: false })],
    }),
    /must be explicitly approved/,
  );
  assert.throws(
    () => createInspectorMapping(report, { schemaVersion: 1, approvals: [] }),
    /must not be empty/,
  );
});

test('rejects conversion of an explicitly selected unresolved proposal', () => {
  const { report } = createReport([['999 - Unknown.mkv', 'unknown']]);

  assert.throws(
    () => createInspectorMapping(report, {
      schemaVersion: 1,
      approvals: [{
        relativePath: report.files[0].relativePath,
        approved: true,
        recordId: 'concentrated:999',
        videoId: 'cb_999',
      }],
    }),
    /cannot approve a unresolved proposal/,
  );
});

test('rejects conversion of an explicitly selected ambiguous proposal', () => {
  const { report } = createReport([
    ['03 - First Copy.mkv', 'first'],
    ['03 - Second Copy.mp4', 'second'],
  ]);
  const file = report.files[0];

  assert.throws(
    () => createInspectorMapping(report, {
      schemaVersion: 1,
      approvals: [{
        relativePath: file.relativePath,
        approved: true,
        recordId: file.mappingProposal.recordId,
        videoId: file.mappingProposal.videoId,
      }],
    }),
    /cannot approve a ambiguous proposal/,
  );
});

test('rejects unsafe conversion of a mixed suggested and unresolved batch', () => {
  const { report } = createReport([
    ['03 - The Pink-Cheeked Cockatiel.mkv', 'three'],
    ['999 - Unknown.mkv', 'unknown'],
  ]);
  const suggested = report.files.find(({ mappingProposal }) => (
    mappingProposal.state === 'suggested'
  ));
  const unresolved = report.files.find(({ mappingProposal }) => (
    mappingProposal.state === 'unresolved'
  ));

  assert.throws(
    () => createInspectorMapping(report, {
      schemaVersion: 1,
      approvals: [
        approvalFor(suggested),
        {
          relativePath: unresolved.relativePath,
          approved: true,
          recordId: 'concentrated:999',
          videoId: 'cb_999',
        },
      ],
    }),
    /cannot approve a unresolved proposal/,
  );
});

test('rejects duplicate approved assignments even for a malformed prebuilt report', () => {
  const inventoryReport = {
    reportKind: 'local-media-inventory-review',
    files: [
      {
        relativePath: 'media/first.mkv',
        mappingProposal: {
          state: 'suggested',
          recordId: 'concentrated:03',
          videoId: 'cb_3',
        },
      },
      {
        relativePath: 'media/second.mkv',
        mappingProposal: {
          state: 'suggested',
          recordId: 'concentrated:03',
          videoId: 'cb_3',
        },
      },
    ],
  };

  assert.throws(
    () => createInspectorMapping(inventoryReport, {
      schemaVersion: 1,
      approvals: [
        {
          relativePath: 'media/first.mkv',
          approved: true,
          recordId: 'concentrated:03',
          videoId: 'cb_3',
        },
        {
          relativePath: 'media/second.mkv',
          approved: true,
          recordId: 'concentrated:03',
          videoId: 'cb_3',
        },
      ],
    }),
    /duplicate approved recordId concentrated:03/,
  );
});

test('fails closed when two inventory names resolve to one canonical file', () => {
  const rootDir = createSyntheticRoot([
    [path.join('media', '03 - The Pink-Cheeked Cockatiel.mkv'), 'three'],
  ]);
  fs.symlinkSync(
    '03 - The Pink-Cheeked Cockatiel.mkv',
    path.join(rootDir, 'media', '04 - Bad Standard.mkv'),
  );
  const report = createInventoryReport({
    rootDir,
    directory: 'media',
    concentrated,
    registry,
  });

  assert.equal(report.coverageSummary.ambiguous, 2);
  assert.deepEqual(
    report.files.map(({ mappingProposal }) => mappingProposal.reason),
    ['duplicate-canonical-filesystem-path', 'duplicate-canonical-filesystem-path'],
  );
  assert.equal(JSON.stringify(report).includes(rootDir), false);
  assert.equal(reportExitCode(report), 1);
});

test('detects duplicate relative paths in pre-observed file facts', () => {
  const report = buildInventoryReport({
    directory: 'media',
    fileFacts: [
      {
        relativePath: 'media/03 - The Pink-Cheeked Cockatiel.mkv',
        filename: '03 - The Pink-Cheeked Cockatiel.mkv',
        byteSize: 3,
        extension: '.mkv',
        canonicalPath: '/synthetic/first',
      },
      {
        relativePath: 'media/03 - The Pink-Cheeked Cockatiel.mkv',
        filename: '03 - The Pink-Cheeked Cockatiel.mkv',
        byteSize: 3,
        extension: '.mkv',
        canonicalPath: '/synthetic/second',
      },
    ],
    concentrated,
    registry,
  });

  assert.equal(report.coverageSummary.ambiguous, 2);
  assert.deepEqual(
    report.files.map(({ mappingProposal }) => mappingProposal.reason),
    ['duplicate-relative-path', 'duplicate-relative-path'],
  );
  assert.equal(JSON.stringify(report).includes('/synthetic/'), false);
});

test('does not write evidence, generated data, or projection artifacts', () => {
  const before = {
    evidence: snapshotTree('evidence'),
    data: snapshotTree('data'),
    projection: snapshotTree('projection'),
  };
  const { report } = createReport([
    ['03 - The Pink-Cheeked Cockatiel.mkv', 'three'],
  ], { evidenceRecords: [cb1Evidence, cb2Evidence] });
  createInspectorMapping(report, {
    schemaVersion: 1,
    approvals: [approvalFor(report.files[0])],
  });
  const after = {
    evidence: snapshotTree('evidence'),
    data: snapshotTree('data'),
    projection: snapshotTree('projection'),
  };

  assert.deepEqual(after, before);
});

test('scan implementation does not invoke ffprobe or a subprocess runner', () => {
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'scripts', 'inventory-local-media.js'),
    'utf8',
  );

  assert.doesNotMatch(source, /ffprobe/u);
  assert.doesNotMatch(source, /node:child_process/u);
  assert.doesNotMatch(source, /\bspawn(?:Sync)?\s*\(/u);
});

test('scan implementation does not hash media files', () => {
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'scripts', 'inventory-local-media.js'),
    'utf8',
  );

  assert.doesNotMatch(source, /node:crypto/u);
  assert.doesNotMatch(source, /\bcreateHash\s*\(/u);
});
