'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  LocalTorrentCreationError,
  PIECE_LENGTH,
  createCreationReport,
  emitCreationReport,
  reportExitCode,
  resolveOutputDirectory,
  torrentFilenameForPayload,
} = require('../scripts/create-local-torrent');
const {
  canonicalBencode,
  createVerificationReport,
  inspectTorrentBytes,
  parseBencode,
} = require('../scripts/verify-local-torrent');

function temporaryCase(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bleach-local-torrent-creation-'));
  const outputDirectory = path.join(root, 'torrents');
  fs.mkdirSync(outputDirectory);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, outputDirectory };
}

function writeMedia(root, relativePath, payload = Buffer.from('synthetic-media')) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, payload);
  return { relativePath, absolutePath, payload };
}

function assignment(media, recordId = 'concentrated:02', videoId = 'cb_2') {
  return { recordId, videoId, mediaRelativePath: media.relativePath };
}

function identity(pairs = [['concentrated:02', 'cb_2']]) {
  return {
    concentrated: {
      records: pairs.map(([recordId]) => ({ recordId, projectId: 'concentrated' })),
    },
    registry: {
      entries: pairs.map(([recordId, videoId]) => ({ recordId, videoId, projectId: 'concentrated' })),
    },
  };
}

function reportFor({ root, outputDirectory, assignments, pairs }) {
  const inputs = identity(pairs);
  return createCreationReport({
    mapping: { schemaVersion: 1, assignments },
    concentrated: inputs.concentrated,
    registry: inputs.registry,
    rootDir: root,
    outputDirectory,
  });
}

function first(report) {
  assert.equal(report.assignments.length, 1);
  return report.assignments[0];
}

function torrentBytes(outputDirectory, result) {
  return fs.readFileSync(path.join(outputDirectory, result.torrentFilename));
}

function dictionaryKeys(node) {
  assert.equal(node.type, 'dictionary');
  return node.entries.map((entry) => entry.key.value.toString('utf8'));
}

function dictionaryValue(node, key) {
  const match = node.entries.find((entry) => entry.key.value.equals(Buffer.from(key)));
  assert.ok(match, `missing dictionary key ${key}`);
  return match.value;
}

test('valid v1 single-file torrent creation succeeds', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/02 - Starter.mkv');
  const report = reportFor({ ...fixture, assignments: [assignment(media)] });
  assert.deepEqual(report.creationSummary, { total: 1, created: 1, alreadyIdentical: 0, failed: 0 });
  assert.equal(first(report).state, 'created');
  assert.ok(fs.statSync(path.join(fixture.outputDirectory, '02 - Starter.mkv.torrent')).isFile());
});

test('top-level dictionary contains only info', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  assert.deepEqual(dictionaryKeys(parseBencode(torrentBytes(fixture.outputDirectory, result))), ['info']);
});

test('info dictionary contains exactly the four project fields', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  const root = parseBencode(torrentBytes(fixture.outputDirectory, result));
  assert.deepEqual(dictionaryKeys(dictionaryValue(root, 'info')), [
    'length',
    'name',
    'piece length',
    'pieces',
  ]);
});

test('all generated dictionaries use canonical raw-byte key ordering', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  const bytes = torrentBytes(fixture.outputDirectory, result);
  const root = parseBencode(bytes);
  assert.ok(bytes.equals(canonicalBencode(root)));
  assert.deepEqual(dictionaryKeys(root), ['info']);
  assert.deepEqual(dictionaryKeys(dictionaryValue(root, 'info')), ['length', 'name', 'piece length', 'pieces']);
});

test('creator locks piece length to exactly 1 MiB', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  assert.equal(PIECE_LENGTH, 1048576);
  assert.equal(result.pieceLength, 1048576);
  assert.equal(inspectTorrentBytes(torrentBytes(fixture.outputDirectory, result)).pieceLength, 1048576);
});

test('piece hashes equal independent SHA1 digests of each media piece', (t) => {
  const fixture = temporaryCase(t);
  const payload = Buffer.concat([Buffer.alloc(PIECE_LENGTH, 0x61), Buffer.from('tail')]);
  const media = writeMedia(fixture.root, 'media/episode.mkv', payload);
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  const observed = inspectTorrentBytes(torrentBytes(fixture.outputDirectory, result));
  const expected = Buffer.concat([
    crypto.createHash('sha1').update(payload.subarray(0, PIECE_LENGTH)).digest(),
    crypto.createHash('sha1').update(payload.subarray(PIECE_LENGTH)).digest(),
  ]);
  assert.ok(observed.pieceHashes.equals(expected));
});

test('final partial piece is hashed without padding', (t) => {
  const fixture = temporaryCase(t);
  const payload = Buffer.alloc(PIECE_LENGTH + 3, 0x62);
  const media = writeMedia(fixture.root, 'media/episode.mkv', payload);
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  const observed = inspectTorrentBytes(torrentBytes(fixture.outputDirectory, result));
  const finalHash = observed.pieceHashes.subarray(20, 40);
  assert.ok(finalHash.equals(crypto.createHash('sha1').update(payload.subarray(PIECE_LENGTH)).digest()));
});

test('piece count follows payload length and fixed piece length', (t) => {
  const fixture = temporaryCase(t);
  const payload = Buffer.alloc((PIECE_LENGTH * 2) + 1, 0x63);
  const media = writeMedia(fixture.root, 'media/episode.mkv', payload);
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  assert.equal(result.pieceCount, 3);
});

test('infoHash is SHA1 of the exact generated raw info bytes', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  const bytes = torrentBytes(fixture.outputDirectory, result);
  const info = dictionaryValue(parseBencode(bytes), 'info');
  assert.equal(result.infoHash, crypto.createHash('sha1').update(bytes.subarray(info.start, info.end)).digest('hex'));
});

test('torrentSha256 is SHA256 of the exact complete torrent bytes', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  const bytes = torrentBytes(fixture.outputDirectory, result);
  assert.equal(result.torrentSha256, crypto.createHash('sha256').update(bytes).digest('hex'));
});

test('generated raw info always matches canonical encoding', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  assert.equal(result.rawInfoMatchesCanonicalEncoding, true);
  assert.equal(inspectTorrentBytes(torrentBytes(fixture.outputDirectory, result)).rawInfoMatchesCanonicalEncoding, true);
});

test('payload filename preserves the exact filesystem basename', (t) => {
  const fixture = temporaryCase(t);
  const filename = '02 - Starter.mkv';
  const media = writeMedia(fixture.root, `media/${filename}`);
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  assert.equal(result.payloadFilename, filename);
  assert.equal(result.torrentFilename, `${filename}.torrent`);
});

test('Unicode filename is preserved without normalization or loss', (t) => {
  const fixture = temporaryCase(t);
  const filename = '40 - ¡Mala Suerte!.mkv';
  const media = writeMedia(fixture.root, `media/${filename}`);
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  assert.equal(result.payloadFilename, filename);
  assert.equal(inspectTorrentBytes(torrentBytes(fixture.outputDirectory, result)).payloadFilename, filename);
});

test('spaces punctuation capitalization and underscores are preserved exactly', (t) => {
  const fixture = temporaryCase(t);
  const filename = '35.5 (0) - the rotator_ the Sand!.mkv';
  const media = writeMedia(fixture.root, `media/${filename}`);
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  assert.equal(result.payloadFilename, filename);
});

test('zero-length media is rejected explicitly', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/empty.mkv', Buffer.alloc(0));
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  assert.equal(result.state, 'failed');
  assert.equal(result.error.code, 'empty-media-file');
  assert.equal(fs.readdirSync(fixture.outputDirectory).length, 0);
});

test('record and video identity mismatch is rejected', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const pairs = [['concentrated:02', 'cb_2'], ['concentrated:03', 'cb_3']];
  const result = first(reportFor({
    ...fixture,
    assignments: [assignment(media, 'concentrated:03', 'cb_2')],
    pairs,
  }));
  assert.equal(result.error.code, 'record-video-mismatch');
});

test('unknown record is rejected', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const result = first(reportFor({
    ...fixture,
    assignments: [assignment(media, 'concentrated:999', 'cb_2')],
  }));
  assert.equal(result.error.code, 'unknown-record-id');
});

test('unknown video ID is rejected', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const result = first(reportFor({
    ...fixture,
    assignments: [assignment(media, 'concentrated:02', 'cb_999')],
  }));
  assert.equal(result.error.code, 'unknown-video-id');
});

test('missing media is rejected', (t) => {
  const fixture = temporaryCase(t);
  const media = { relativePath: 'media/missing.mkv' };
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  assert.equal(result.error.code, 'missing-media-file');
});

test('path traversal is rejected', (t) => {
  const fixture = temporaryCase(t);
  const media = { relativePath: '../outside.mkv' };
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  assert.equal(result.error.code, 'invalid-media-path');
  assert.equal(result.mediaRelativePath, '[rejected-path]');
});

test('POSIX absolute media path is rejected', (t) => {
  const fixture = temporaryCase(t);
  const result = first(reportFor({
    ...fixture,
    assignments: [assignment({ relativePath: '/private/episode.mkv' })],
  }));
  assert.equal(result.error.code, 'invalid-media-path');
});

test('Windows absolute media path is rejected', (t) => {
  const fixture = temporaryCase(t);
  const result = first(reportFor({
    ...fixture,
    assignments: [assignment({ relativePath: 'C:\\private\\episode.mkv' })],
  }));
  assert.equal(result.error.code, 'invalid-media-path');
});

test('canonical symlink escape is rejected where supported', (t) => {
  const fixture = temporaryCase(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bleach-torrent-creation-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const outsideMedia = path.join(outside, 'escape.mkv');
  fs.writeFileSync(outsideMedia, Buffer.from('outside'));
  const relativePath = 'media/escape.mkv';
  fs.mkdirSync(path.join(fixture.root, 'media'));
  try {
    fs.symlinkSync(outsideMedia, path.join(fixture.root, relativePath));
  } catch (error) {
    t.skip(`symlink unavailable: ${error.code || 'unknown'}`);
    return;
  }
  const result = first(reportFor({
    ...fixture,
    assignments: [assignment({ relativePath })],
  }));
  assert.equal(result.error.code, 'media-path-escape');
});

test('absolute media paths never leak in failure JSON', (t) => {
  const fixture = temporaryCase(t);
  const privatePath = path.join(fixture.root, 'private', 'episode.mkv');
  const report = reportFor({
    ...fixture,
    assignments: [assignment({ relativePath: privatePath })],
  });
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  assert.match(serialized, /\[rejected-path\]/u);
});

test('output directory must already exist', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const missing = path.join(fixture.root, 'missing-output');
  assert.throws(
    () => reportFor({ ...fixture, outputDirectory: missing, assignments: [assignment(media)] }),
    (error) => error instanceof LocalTorrentCreationError && error.creationCode === 'missing-output-directory',
  );
  assert.equal(fs.existsSync(missing), false);
});

test('output path must be a directory', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const outputFile = path.join(fixture.root, 'not-a-directory');
  fs.writeFileSync(outputFile, 'x');
  assert.throws(
    () => reportFor({ ...fixture, outputDirectory: outputFile, assignments: [assignment(media)] }),
    (error) => error instanceof LocalTorrentCreationError && error.creationCode === 'output-directory-not-directory',
  );
});

test('first creation reports created', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  assert.equal(result.state, 'created');
});

test('identical existing output reports already-identical without rewrite', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const created = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  const outputPath = path.join(fixture.outputDirectory, created.torrentFilename);
  const preservedTime = new Date(1_000_000);
  fs.utimesSync(outputPath, preservedTime, preservedTime);
  const before = fs.statSync(outputPath, { bigint: true });
  const repeated = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  const after = fs.statSync(outputPath, { bigint: true });
  assert.equal(repeated.state, 'already-identical');
  assert.equal(after.mtimeNs, before.mtimeNs);
  assert.equal(after.ino, before.ino);
  assert.equal(repeated.torrentSha256, created.torrentSha256);
});

test('different existing output reports output-conflict and is not overwritten', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const outputPath = path.join(fixture.outputDirectory, 'episode.mkv.torrent');
  const conflicting = Buffer.from('different-existing-torrent');
  fs.writeFileSync(outputPath, conflicting);
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  assert.equal(result.state, 'failed');
  assert.equal(result.error.code, 'output-conflict');
  assert.ok(fs.readFileSync(outputPath).equals(conflicting));
});

test('derived output filename cannot escape the output directory', () => {
  for (const payloadFilename of ['../escape.mkv', 'nested/escape.mkv', 'nested\\escape.mkv']) {
    assert.throws(
      () => torrentFilenameForPayload(payloadFilename),
      (error) => error instanceof LocalTorrentCreationError && error.creationCode === 'invalid-output-filename',
    );
  }
});

test('report ordering follows permanent registry order independent of input order', (t) => {
  const fixture = temporaryCase(t);
  const secondOutput = path.join(fixture.root, 'torrents-second');
  fs.mkdirSync(secondOutput);
  const cb2 = writeMedia(fixture.root, 'media/02.mkv', Buffer.from('cb2'));
  const cb3 = writeMedia(fixture.root, 'media/03.mkv', Buffer.from('cb3'));
  const pairs = [['concentrated:02', 'cb_2'], ['concentrated:03', 'cb_3']];
  const reverse = [assignment(cb3, ...pairs[1]), assignment(cb2, ...pairs[0])];
  const forward = [assignment(cb2, ...pairs[0]), assignment(cb3, ...pairs[1])];
  const firstReport = reportFor({ ...fixture, assignments: reverse, pairs });
  const secondReport = reportFor({ ...fixture, outputDirectory: secondOutput, assignments: forward, pairs });
  assert.deepEqual(firstReport.assignments.map((item) => item.videoId), ['cb_2', 'cb_3']);
  assert.equal(JSON.stringify(firstReport), JSON.stringify(secondReport));
  for (const result of firstReport.assignments) {
    assert.ok(fs.readFileSync(path.join(fixture.outputDirectory, result.torrentFilename)).equals(
      fs.readFileSync(path.join(secondOutput, result.torrentFilename)),
    ));
  }
});

test('batch continues after one per-assignment creation failure', (t) => {
  const fixture = temporaryCase(t);
  const cb2 = writeMedia(fixture.root, 'media/02.mkv', Buffer.from('cb2'));
  const missing = { relativePath: 'media/03-missing.mkv' };
  const pairs = [['concentrated:02', 'cb_2'], ['concentrated:03', 'cb_3']];
  const report = reportFor({
    ...fixture,
    assignments: [assignment(missing, ...pairs[1]), assignment(cb2, ...pairs[0])],
    pairs,
  });
  assert.deepEqual(report.creationSummary, { total: 2, created: 1, alreadyIdentical: 0, failed: 1 });
  assert.deepEqual(report.assignments.map((item) => item.state), ['created', 'failed']);
});

test('exit status is zero when all assignments are created or already-identical', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const created = reportFor({ ...fixture, assignments: [assignment(media)] });
  const identical = reportFor({ ...fixture, assignments: [assignment(media)] });
  assert.equal(reportExitCode(created), 0);
  assert.equal(reportExitCode(identical), 0);
});

test('exit status is one when any assignment fails', (t) => {
  const fixture = temporaryCase(t);
  const report = reportFor({
    ...fixture,
    assignments: [assignment({ relativePath: 'media/missing.mkv' })],
  });
  assert.equal(reportExitCode(report), 1);
});

test('generated torrent parses independently through verifier logic', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv', Buffer.from('independent-parse'));
  const result = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  const observed = inspectTorrentBytes(torrentBytes(fixture.outputDirectory, result));
  assert.deepEqual({
    payloadFilename: observed.payloadFilename,
    declaredPayloadByteSize: observed.declaredPayloadByteSize,
    pieceLength: observed.pieceLength,
    pieceCount: observed.pieceCount,
    rawInfoMatchesCanonicalEncoding: observed.rawInfoMatchesCanonicalEncoding,
  }, {
    payloadFilename: 'episode.mkv',
    declaredPayloadByteSize: media.payload.length,
    pieceLength: PIECE_LENGTH,
    pieceCount: 1,
    rawInfoMatchesCanonicalEncoding: true,
  });
});

test('generated piece hashes independently verify against synthetic media', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv', Buffer.alloc(PIECE_LENGTH + 7, 0x44));
  const created = first(reportFor({ ...fixture, assignments: [assignment(media)] }));
  const inputs = identity();
  const verification = createVerificationReport({
    mapping: {
      schemaVersion: 1,
      assignments: [{
        recordId: 'concentrated:02',
        videoId: 'cb_2',
        mediaRelativePath: media.relativePath,
        torrentRelativePath: path.posix.join('torrents', created.torrentFilename),
      }],
    },
    concentrated: inputs.concentrated,
    registry: inputs.registry,
    rootDir: fixture.root,
  });
  assert.deepEqual(verification.verificationSummary, { total: 1, verified: 1, failed: 0 });
  assert.equal(verification.assignments[0].pieces.verifiedPieces, 2);
});

test('output directory absolute path is never included in the report', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const serialized = JSON.stringify(reportFor({ ...fixture, assignments: [assignment(media)] }));
  assert.doesNotMatch(serialized, new RegExp(fixture.outputDirectory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
});

test('emitted report formatting and facts are deterministic', (t) => {
  const fixture = temporaryCase(t);
  const media = writeMedia(fixture.root, 'media/episode.mkv');
  const report = reportFor({ ...fixture, assignments: [assignment(media)] });
  const writes = [];
  const output = { write: (value) => writes.push(value) };
  assert.equal(emitCreationReport(report, output), 0);
  assert.equal(emitCreationReport(report, output), 0);
  assert.equal(writes[0], writes[1]);
});

test('output directory resolver returns an existing canonical directory only', (t) => {
  const fixture = temporaryCase(t);
  assert.equal(resolveOutputDirectory(fixture.outputDirectory), fs.realpathSync(fixture.outputDirectory));
});
