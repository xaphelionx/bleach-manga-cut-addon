'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  LocalTorrentVerificationError,
  canonicalBencode,
  createVerificationReport,
  emitVerificationReport,
  inspectTorrentBytes,
  parseBencode,
  reportExitCode,
} = require('../scripts/verify-local-torrent');

function dictionary(entries) {
  return { dictionaryEntries: entries };
}

function encode(value, { canonical = true } = {}) {
  if (Buffer.isBuffer(value)) {
    return Buffer.concat([Buffer.from(`${value.length}:`), value]);
  }
  if (typeof value === 'string') return encode(Buffer.from(value));
  if (typeof value === 'number' || typeof value === 'bigint') {
    return Buffer.from(`i${value.toString()}e`);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([Buffer.from('l'), ...value.map((item) => encode(item, { canonical })), Buffer.from('e')]);
  }
  if (value && Array.isArray(value.dictionaryEntries)) {
    const entries = value.dictionaryEntries.map(([key, child]) => [Buffer.from(key), child]);
    if (canonical) entries.sort((left, right) => Buffer.compare(left[0], right[0]));
    return Buffer.concat([
      Buffer.from('d'),
      ...entries.flatMap(([key, child]) => [encode(key), encode(child, { canonical })]),
      Buffer.from('e'),
    ]);
  }
  throw new Error('unsupported synthetic bencode value');
}

function hashesFor(payload, pieceLength) {
  const hashes = [];
  for (let offset = 0; offset < payload.length; offset += pieceLength) {
    hashes.push(crypto.createHash('sha1').update(payload.subarray(offset, offset + pieceLength)).digest());
  }
  return Buffer.concat(hashes);
}

function makeTorrent({
  payload,
  name = '02 - Starter.mkv',
  pieceLength = 4,
  declaredLength = payload.length,
  pieces = hashesFor(payload, pieceLength),
  nonCanonicalInfo = false,
  multifile = false,
  announce = null,
} = {}) {
  const infoEntries = multifile
    ? [
        ['name', name],
        ['piece length', pieceLength],
        ['pieces', pieces],
        ['files', [dictionary([['length', payload.length], ['path', [name]]])]],
      ]
    : [
        ['name', name],
        ['piece length', pieceLength],
        ['pieces', pieces],
        ['length', declaredLength],
      ];
  const rawInfo = encode(dictionary(infoEntries), { canonical: !nonCanonicalInfo });
  const topLevelParts = [Buffer.from('d')];
  if (announce !== null) topLevelParts.push(encode('announce'), encode(announce));
  topLevelParts.push(encode('info'), rawInfo, Buffer.from('e'));
  return { bytes: Buffer.concat(topLevelParts), rawInfo };
}

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bleach-local-torrent-verification-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeCase(root, {
  stem = 'cb2',
  payload = Buffer.from('abcdefghij'),
  mediaPayload = payload,
  mediaFilename = '02 - Starter.mkv',
  torrentOptions = {},
  torrentBytes,
} = {}) {
  const mediaDirectory = path.join(root, 'media');
  const torrentDirectory = path.join(root, 'torrents');
  fs.mkdirSync(mediaDirectory, { recursive: true });
  fs.mkdirSync(torrentDirectory, { recursive: true });
  const mediaRelativePath = path.posix.join('media', mediaFilename);
  const torrentRelativePath = path.posix.join('torrents', `${stem}.torrent`);
  fs.writeFileSync(path.join(root, mediaRelativePath), mediaPayload);
  const built = makeTorrent({ payload, name: mediaFilename, ...torrentOptions });
  fs.writeFileSync(path.join(root, torrentRelativePath), torrentBytes || built.bytes);
  return { mediaRelativePath, torrentRelativePath, payload, built };
}

function assignment(fixture, recordId = 'concentrated:02', videoId = 'cb_2') {
  return {
    recordId,
    videoId,
    mediaRelativePath: fixture.mediaRelativePath,
    torrentRelativePath: fixture.torrentRelativePath,
  };
}

function projectIdFor(recordId) {
  return recordId.split(':', 1)[0];
}

function identity(pairs = [['concentrated:02', 'cb_2']]) {
  return {
    normalizedRecords: pairs.map(([recordId]) => ({ recordId, projectId: projectIdFor(recordId) })),
    registry: {
      entries: pairs.map(([recordId, videoId]) => ({
        recordType: 'normalized-record',
        recordId,
        videoId,
        projectId: projectIdFor(recordId),
      })),
    },
  };
}

function reportFor(root, assignments, pairs) {
  const inputs = identity(pairs);
  return createVerificationReport({
    mapping: { schemaVersion: 1, assignments },
    normalizedRecords: inputs.normalizedRecords,
    registry: inputs.registry,
    rootDir: root,
  });
}

function first(report) {
  assert.equal(report.assignments.length, 1);
  return report.assignments[0];
}

test('valid v1 single-file torrent verifies', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root);
  const report = reportFor(root, [assignment(fixture)]);
  assert.deepEqual(report.verificationSummary, { total: 1, verified: 1, failed: 0 });
  assert.equal(first(report).state, 'verified');
  assert.equal(first(report).pieces.verifiedPieces, 3);
  assert.deepEqual(first(report).pieces.mismatchPieceIndexes, []);
});

test('synthetic Hollowed MP4 torrent verifies all canonical identity and payload facts', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root, {
    mediaFilename: '14 - The Slashing Opera (sub).mp4',
    payload: Buffer.from('synthetic-hollowed-media'),
    torrentOptions: { pieceLength: 7 },
  });
  const result = first(reportFor(
    root,
    [assignment(fixture, 'hollowed:14', 'hb_14')],
    [['hollowed:14', 'hb_14']],
  ));
  assert.equal(result.state, 'verified');
  assert.equal(result.pieces.verifiedPieces, result.pieces.pieceCount);
  assert.equal(result.pieces.mismatchedPieces, 0);
  assert.deepEqual(result.pieces.mismatchPieceIndexes, []);
  assert.equal(result.torrent.rawInfoMatchesCanonicalEncoding, true);
  assert.equal(result.comparisons.payloadFilenameMatchesLocalMedia, true);
  assert.equal(result.comparisons.payloadByteSizeMatchesLocalMedia, true);
  assert.equal(result.torrent.payloadFilename, '14 - The Slashing Opera (sub).mp4');
});

test('torrent verification rejects a cross-project record/video pairing', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root, { mediaFilename: 'hollowed.mp4' });
  const result = first(reportFor(
    root,
    [assignment(fixture, 'hollowed:14', 'cb_14')],
    [
      ['hollowed:14', 'hb_14'],
      ['concentrated:14', 'cb_14'],
    ],
  ));
  assert.equal(result.state, 'failed');
  assert.equal(result.error.code, 'record-video-mismatch');
});

test('infoHash is computed from the exact raw info bytes', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root);
  const result = first(reportFor(root, [assignment(fixture)]));
  const expected = crypto.createHash('sha1').update(fixture.built.rawInfo).digest('hex');
  assert.equal(result.torrent.infoHash, expected);
});

test('canonical info comparison is true for canonical input', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root);
  assert.equal(first(reportFor(root, [assignment(fixture)])).torrent.rawInfoMatchesCanonicalEncoding, true);
});

test('non-canonical info order retains raw infoHash and reports canonical comparison false', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root, { torrentOptions: { nonCanonicalInfo: true } });
  const result = first(reportFor(root, [assignment(fixture)]));
  assert.equal(result.state, 'verified');
  assert.equal(result.torrent.infoHash, crypto.createHash('sha1').update(fixture.built.rawInfo).digest('hex'));
  assert.equal(result.torrent.rawInfoMatchesCanonicalEncoding, false);
});

test('canonical encoder sorts dictionary keys without mutating raw nodes', () => {
  const raw = Buffer.from('d1:bi2e1:ai1ee');
  const node = parseBencode(raw);
  assert.equal(canonicalBencode(node).toString(), 'd1:ai1e1:bi2ee');
  assert.equal(raw.toString(), 'd1:bi2e1:ai1ee');
});

test('malformed bencode is rejected safely', (t) => {
  const root = temporaryRoot(t);
  const valid = makeTorrent({ payload: Buffer.from('abc') });
  const fixture = writeCase(root, { payload: Buffer.from('abc'), torrentBytes: valid.bytes.subarray(0, valid.bytes.length - 1) });
  const result = first(reportFor(root, [assignment(fixture)]));
  assert.equal(result.state, 'failed');
  assert.equal(result.error.code, 'malformed-bencode');
});

test('duplicate dictionary keys are rejected', (t) => {
  const root = temporaryRoot(t);
  const valid = makeTorrent({ payload: Buffer.from('abc') });
  const duplicate = Buffer.concat([
    Buffer.from('d4:info'), valid.rawInfo,
    Buffer.from('4:info'), valid.rawInfo,
    Buffer.from('e'),
  ]);
  const fixture = writeCase(root, { payload: Buffer.from('abc'), torrentBytes: duplicate });
  const result = first(reportFor(root, [assignment(fixture)]));
  assert.equal(result.error.code, 'duplicate-bencode-key');
});

test('malformed pieces length is rejected', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root, { torrentOptions: { pieces: Buffer.alloc(21) } });
  assert.equal(first(reportFor(root, [assignment(fixture)])).error.code, 'malformed-pieces-length');
});

test('piece count inconsistent with declared length is rejected', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root, { torrentOptions: { pieces: Buffer.alloc(20) } });
  assert.equal(first(reportFor(root, [assignment(fixture)])).error.code, 'piece-count-mismatch');
});

test('unsafe declared payload integer fails closed', (t) => {
  const root = temporaryRoot(t);
  const payload = Buffer.from('abc');
  const rawInfo = encode(dictionary([
    ['length', 9007199254740992n],
    ['name', '02 - Starter.mkv'],
    ['piece length', 4],
    ['pieces', hashesFor(payload, 4)],
  ]));
  const torrentBytes = Buffer.concat([Buffer.from('d4:info'), rawInfo, Buffer.from('e')]);
  const fixture = writeCase(root, { payload, torrentBytes });
  assert.equal(first(reportFor(root, [assignment(fixture)])).error.code, 'unsafe-integer');
});

test('declared payload size mismatch fails explicitly', (t) => {
  const root = temporaryRoot(t);
  const payload = Buffer.from('abcdef');
  const fixture = writeCase(root, { payload, torrentOptions: { declaredLength: 7 } });
  const result = first(reportFor(root, [assignment(fixture)]));
  assert.equal(result.error.code, 'payload-size-mismatch');
  assert.equal(result.comparisons.payloadByteSizeMatchesLocalMedia, false);
});

test('payload filename mismatch fails explicitly', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root, { torrentOptions: { name: 'different.mkv' } });
  const result = first(reportFor(root, [assignment(fixture)]));
  assert.equal(result.error.code, 'payload-filename-mismatch');
  assert.equal(result.comparisons.payloadFilenameMatchesLocalMedia, false);
});

test('one mismatched piece is reported', (t) => {
  const root = temporaryRoot(t);
  const payload = Buffer.from('abcdefghijkl');
  const changed = Buffer.from(payload);
  changed[5] ^= 0xff;
  const fixture = writeCase(root, { payload, mediaPayload: changed, torrentOptions: { pieceLength: 4 } });
  const result = first(reportFor(root, [assignment(fixture)]));
  assert.equal(result.error.code, 'piece-hash-mismatch');
  assert.deepEqual(result.pieces.mismatchPieceIndexes, [1]);
});

test('multiple mismatched pieces use deterministic ascending indexes', (t) => {
  const root = temporaryRoot(t);
  const payload = Buffer.from('abcdefghijkl');
  const changed = Buffer.from(payload);
  changed[1] ^= 0xff;
  changed[9] ^= 0xff;
  const fixture = writeCase(root, { payload, mediaPayload: changed, torrentOptions: { pieceLength: 4 } });
  const result = first(reportFor(root, [assignment(fixture)]));
  assert.deepEqual(result.pieces.mismatchPieceIndexes, [0, 2]);
  assert.equal(result.pieces.verifiedPieces, 1);
  assert.equal(result.pieces.mismatchedPieces, 2);
});

test('final partial piece verifies', (t) => {
  const root = temporaryRoot(t);
  const payload = Buffer.from('abcdef');
  const fixture = writeCase(root, { payload, torrentOptions: { pieceLength: 4 } });
  const result = first(reportFor(root, [assignment(fixture)]));
  assert.equal(result.state, 'verified');
  assert.equal(result.pieces.pieceCount, 2);
});

test('unsupported multifile torrent fails explicitly', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root, { torrentOptions: { multifile: true } });
  assert.equal(first(reportFor(root, [assignment(fixture)])).error.code, 'unsupported-multifile-torrent');
});

test('mapping record/video mismatch is rejected', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root);
  const result = first(reportFor(
    root,
    [assignment(fixture, 'concentrated:03', 'cb_2')],
    [['concentrated:02', 'cb_2'], ['concentrated:03', 'cb_3']],
  ));
  assert.equal(result.error.code, 'record-video-mismatch');
});

test('missing media file is reported without a private path', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root);
  fs.unlinkSync(path.join(root, fixture.mediaRelativePath));
  const serialized = JSON.stringify(reportFor(root, [assignment(fixture)]));
  assert.match(serialized, /missing-media-file/u);
  assert.doesNotMatch(serialized, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
});

test('missing torrent file is reported', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root);
  fs.unlinkSync(path.join(root, fixture.torrentRelativePath));
  assert.equal(first(reportFor(root, [assignment(fixture)])).error.code, 'missing-torrent-file');
});

test('path traversal is rejected', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root);
  const changed = assignment(fixture);
  changed.mediaRelativePath = '../outside.mkv';
  const result = first(reportFor(root, [changed]));
  assert.equal(result.error.code, 'invalid-media-path');
  assert.equal(result.mediaRelativePath, '[rejected-path]');
});

test('POSIX absolute path is rejected', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root);
  const changed = assignment(fixture);
  changed.mediaRelativePath = '/private/media.mkv';
  assert.equal(first(reportFor(root, [changed])).error.code, 'invalid-media-path');
});

test('Windows absolute path is rejected', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root);
  const changed = assignment(fixture);
  changed.mediaRelativePath = 'C:\\private\\media.mkv';
  assert.equal(first(reportFor(root, [changed])).error.code, 'invalid-media-path');
});

test('empty and null-byte paths are rejected', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root);
  for (const mediaRelativePath of ['', 'media/bad\0name.mkv']) {
    const changed = { ...assignment(fixture), mediaRelativePath };
    const result = first(reportFor(root, [changed]));
    assert.equal(result.error.code, 'invalid-media-path');
    assert.equal(result.mediaRelativePath, '[rejected-path]');
  }
});

test('symlink canonical escape is rejected where symlinks are available', (t) => {
  const root = temporaryRoot(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bleach-local-torrent-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const payload = Buffer.from('abcdefgh');
  const fixture = writeCase(root, { payload, mediaFilename: 'escape.mkv' });
  fs.unlinkSync(path.join(root, fixture.mediaRelativePath));
  const outsideFile = path.join(outside, 'escape.mkv');
  fs.writeFileSync(outsideFile, payload);
  try {
    fs.symlinkSync(outsideFile, path.join(root, fixture.mediaRelativePath));
  } catch (error) {
    t.skip(`symlink unavailable: ${error.code || 'unknown'}`);
    return;
  }
  assert.equal(first(reportFor(root, [assignment(fixture)])).error.code, 'media-path-escape');
});

test('absolute input paths never leak through failure JSON', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root);
  const privatePath = path.join(root, 'private', 'media.mkv');
  const changed = { ...assignment(fixture), mediaRelativePath: privatePath };
  const serialized = JSON.stringify(reportFor(root, [changed]));
  assert.doesNotMatch(serialized, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  assert.match(serialized, /\[rejected-path\]/u);
});

test('batch continues after one assignment verification failure', (t) => {
  const root = temporaryRoot(t);
  const cb2 = writeCase(root, { stem: 'cb2', mediaFilename: '02.mkv', payload: Buffer.from('abcdefgh') });
  const original = Buffer.from('ijklmnop');
  const changed = Buffer.from(original);
  changed[0] ^= 0xff;
  const cb3 = writeCase(root, {
    stem: 'cb3',
    mediaFilename: '03.mkv',
    payload: original,
    mediaPayload: changed,
  });
  const pairs = [['concentrated:02', 'cb_2'], ['concentrated:03', 'cb_3']];
  const report = reportFor(root, [assignment(cb2), assignment(cb3, ...pairs[1])], pairs);
  assert.deepEqual(report.verificationSummary, { total: 2, verified: 1, failed: 1 });
  assert.deepEqual(report.assignments.map((item) => item.state), ['verified', 'failed']);
});

test('output ordering follows permanent registry order deterministically', (t) => {
  const root = temporaryRoot(t);
  const cb2 = writeCase(root, { stem: 'cb2', mediaFilename: '02.mkv' });
  const cb3 = writeCase(root, { stem: 'cb3', mediaFilename: '03.mkv', payload: Buffer.from('klmnopqrst') });
  const pairs = [['concentrated:02', 'cb_2'], ['concentrated:03', 'cb_3']];
  const reverse = [assignment(cb3, ...pairs[1]), assignment(cb2)];
  const firstReport = reportFor(root, reverse, pairs);
  const secondReport = reportFor(root, reverse, pairs);
  assert.deepEqual(firstReport.assignments.map((item) => item.videoId), ['cb_2', 'cb_3']);
  assert.equal(JSON.stringify(firstReport), JSON.stringify(secondReport));
});

test('tracker presence does not affect piece verification', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root, { torrentOptions: { announce: 'https://tracker.invalid/announce' } });
  assert.equal(first(reportFor(root, [assignment(fixture)])).state, 'verified');
});

test('emitVerificationReport is deterministic', (t) => {
  const root = temporaryRoot(t);
  const fixture = writeCase(root);
  const report = reportFor(root, [assignment(fixture)]);
  const outputs = [];
  const output = { write: (value) => outputs.push(value) };
  assert.equal(emitVerificationReport(report, output), 0);
  assert.equal(emitVerificationReport(report, output), 0);
  assert.equal(outputs[0], outputs[1]);
});

test('exit status is zero only when every assignment verifies', (t) => {
  const root = temporaryRoot(t);
  const verifiedFixture = writeCase(root, { stem: 'verified', mediaFilename: 'verified.mkv' });
  const failedFixture = writeCase(root, {
    stem: 'failed',
    mediaFilename: 'failed.mkv',
    torrentOptions: { name: 'different.mkv' },
  });
  assert.equal(reportExitCode(reportFor(root, [assignment(verifiedFixture)])), 0);
  assert.equal(reportExitCode(reportFor(root, [assignment(failedFixture)])), 1);
});

test('inspectTorrentBytes reports stable artifact facts', () => {
  const payload = Buffer.from('abcdef');
  const torrent = makeTorrent({ payload, name: 'episode.mkv', pieceLength: 4 });
  const observed = inspectTorrentBytes(torrent.bytes);
  assert.deepEqual({
    payloadFilename: observed.payloadFilename,
    pieceLength: observed.pieceLength,
    pieceCount: observed.pieceCount,
    declaredPayloadByteSize: observed.declaredPayloadByteSize,
  }, {
    payloadFilename: 'episode.mkv',
    pieceLength: 4,
    pieceCount: 2,
    declaredPayloadByteSize: 6,
  });
  assert.equal(observed.torrentSha256, crypto.createHash('sha256').update(torrent.bytes).digest('hex'));
});

test('parseBencode exposes stable sanitized error types', () => {
  assert.throws(
    () => parseBencode(Buffer.from('i-0e')),
    (error) => error instanceof LocalTorrentVerificationError && error.verificationCode === 'malformed-bencode',
  );
});
