'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const schema = require('../schemas/media/acquisition-manifest.schema.json')
const {
  AcquisitionManifestError,
  buildAcquisitionManifest,
  jsonBytes,
  validateAcquisitionManifest,
  writeAcquisitionManifest
} = require('../scripts/generate-acquisition-manifest')

const repositoryRoot = path.resolve(__dirname, '..')
const PRODUCTION_MANIFEST_RELATIVE_PATH = 'evidence/acquisition/concentrated-preboundary.json'
const PRODUCTION_MANIFEST_PATH = path.join(repositoryRoot, PRODUCTION_MANIFEST_RELATIVE_PATH)
const LOCKED_PRODUCTION_MANIFEST_SHA256 = '9b7a8c1009998862ed412554db3ff372994189fd255509ff767356d96b4803db'
const LOCKED_PRODUCTION_MANIFEST_BYTE_SIZE = 97436
const ARRANCAR_MANIFEST_RELATIVE_PATH = 'evidence/acquisition/concentrated-arrancar.json'
const ARRANCAR_MANIFEST_PATH = path.join(repositoryRoot, ARRANCAR_MANIFEST_RELATIVE_PATH)
const LOCKED_ARRANCAR_MANIFEST_SHA256 = '7db2e19dca971507686132091faac781abf42da35a8868044dc0fc12b3deef4a'
const LOCKED_ARRANCAR_MANIFEST_BYTE_SIZE = 46013
const HOLLOWED_MANIFEST_RELATIVE_PATH = 'evidence/acquisition/hollowed-current-raw.json'
const HOLLOWED_MANIFEST_PATH = path.join(repositoryRoot, HOLLOWED_MANIFEST_RELATIVE_PATH)
const LOCKED_HOLLOWED_MANIFEST_SHA256 = 'd0b7c3c67fd103078183f0332926c8c8d62b99843d381983fb5a2f93b4f84c18'
const LOCKED_HOLLOWED_MANIFEST_BYTE_SIZE = 72844
const LOCKED_HOLLOWED_MEDIA_BYTE_SIZE = 35383015693
const LOCKED_HOLLOWED_PIECE_COUNT = 33764

const PAIRS = [
  ['concentrated:03', 'cb_3', '03 - Three.mkv'],
  ['concentrated:04', 'cb_4', '04 - Four.mkv']
]

function projectIdFor(recordId) {
  return recordId.split(':', 1)[0]
}

function identity(pairs = PAIRS) {
  return {
    normalizedRecords: pairs.map(([recordId]) => ({ recordId, projectId: projectIdFor(recordId) })),
    registry: {
      entries: pairs.map(([recordId, videoId]) => ({
        recordType: 'normalized-record',
        recordId,
        videoId,
        projectId: projectIdFor(recordId)
      }))
    }
  }
}

function mappingAssignment(pair = PAIRS[0]) {
  const [recordId, videoId, filename] = pair
  return {
    recordId,
    videoId,
    mediaRelativePath: `sources/media/${filename}`,
    torrentRelativePath: `sources/torrents/${filename}.torrent`
  }
}

function mapping(assignments = [mappingAssignment()]) {
  return { schemaVersion: 1, assignments }
}

function inspectionResult(pair = PAIRS[0]) {
  const assignment = mappingAssignment(pair)
  return {
    assignment: {
      recordId: assignment.recordId,
      videoId: assignment.videoId,
      relativePath: assignment.mediaRelativePath
    },
    inspection: { state: 'success' },
    filesystem: {
      filename: path.posix.basename(assignment.mediaRelativePath),
      byteSize: 2000000
    },
    editorialRuntime: { state: 'known', displayed: '03:00', seconds: 180 },
    container: { format_name: 'matroska,webm' },
    measuredContainerDurationSeconds: 180.25,
    durationDeltaSeconds: 0.25,
    streams: {
      video: [
        {
          index: 0,
          codec_name: 'hevc',
          profile: 'Main',
          width: 768,
          height: 576,
          pix_fmt: 'yuv420p',
          r_frame_rate: '24000/1001',
          avg_frame_rate: '24000/1001',
          disposition: { attached_pic: 0, default: 1 }
        },
        {
          index: 7,
          codec_name: 'mjpeg',
          profile: null,
          width: 640,
          height: 480,
          pix_fmt: 'yuvj420p',
          r_frame_rate: '90000/1',
          avg_frame_rate: '0/0',
          disposition: { attached_pic: 1, default: 0 }
        }
      ],
      audio: [
        {
          index: 1,
          codec_name: 'aac',
          profile: 'LC',
          channels: 2,
          channel_layout: 'stereo',
          tags: { language: 'jpn', title: 'Original Audio' },
          disposition: { default: 1, forced: 0 }
        },
        {
          index: 2,
          codec_name: 'aac',
          profile: 'LC',
          channels: 2,
          channel_layout: 'stereo',
          tags: { language: 'eng', title: 'Alternate Audio' },
          disposition: { default: 0, forced: 0 }
        }
      ],
      subtitles: [
        {
          index: 3,
          codec_name: 'ass',
          tags: { language: 'eng', title: 'Full Subtitles' },
          disposition: { default: 1, forced: 0 }
        },
        {
          index: 4,
          codec_name: 'ass',
          tags: { language: null, title: 'Signs and Songs' },
          disposition: { default: 0, forced: 1 }
        }
      ],
      attachments: [
        { index: 5, codec_name: 'ttf', codec_type: 'attachment', tags: { filename: 'private-font-name.ttf' } },
        { index: 6, codec_name: 'ttf', codec_type: 'attachment', tags: { filename: 'second-font.ttf' } }
      ],
      other: [
        { index: 8, codec_name: 'bin', codec_type: 'data' }
      ]
    },
    warnings: [
      { code: 'missing-subtitle-language-tag', streamIndex: 4 }
    ]
  }
}

function inspectionReport(results = [inspectionResult()]) {
  const succeeded = results.filter((result) => result.inspection.state === 'success').length
  return {
    schemaVersion: 1,
    reportKind: 'local-media-inspection-review',
    evidenceState: 'not-created',
    missingValuePolicy: 'null',
    inspectionSummary: {
      total: results.length,
      succeeded,
      failed: results.length - succeeded
    },
    assignments: results
  }
}

function verificationResult(pair = PAIRS[0]) {
  const assignment = mappingAssignment(pair)
  return {
    recordId: assignment.recordId,
    videoId: assignment.videoId,
    mediaRelativePath: assignment.mediaRelativePath,
    torrentRelativePath: assignment.torrentRelativePath,
    state: 'verified',
    torrent: {
      torrentRelativePath: assignment.torrentRelativePath,
      torrentByteSize: 200,
      torrentSha256: pair === PAIRS[0] ? 'a'.repeat(64) : 'b'.repeat(64),
      infoHash: pair === PAIRS[0] ? 'c'.repeat(40) : 'd'.repeat(40),
      rawInfoMatchesCanonicalEncoding: true,
      payloadFilename: path.posix.basename(assignment.mediaRelativePath),
      pieceLength: 1048576,
      pieceCount: 2,
      declaredPayloadByteSize: 2000000,
      fileIdx: 0
    },
    media: {
      mediaRelativePath: assignment.mediaRelativePath,
      filename: path.posix.basename(assignment.mediaRelativePath),
      byteSize: 2000000
    },
    comparisons: {
      payloadFilenameMatchesLocalMedia: true,
      payloadByteSizeMatchesLocalMedia: true
    },
    pieces: {
      pieceCount: 2,
      verifiedPieces: 2,
      mismatchedPieces: 0,
      mismatchPieceIndexes: []
    }
  }
}

function verificationReport(results = [verificationResult()]) {
  const verified = results.filter((result) => result.state === 'verified').length
  return {
    schemaVersion: 1,
    reportKind: 'local-torrent-verification',
    verificationSummary: {
      total: results.length,
      verified,
      failed: results.length - verified
    },
    assignments: results
  }
}

function validInputs() {
  const sources = identity()
  return {
    mapping: mapping(),
    inspectionReport: inspectionReport(),
    verificationReport: verificationReport(),
    ...sources
  }
}

function build(inputs = validInputs()) {
  return buildAcquisitionManifest(inputs)
}

function expectCode(code, callback) {
  assert.throws(callback, (error) => (
    error instanceof AcquisitionManifestError && error.manifestCode === code
  ))
}

function twoEntryInputs({ reverseMapping = false, reverseInspection = false, reverseVerification = false } = {}) {
  const assignments = PAIRS.map(mappingAssignment)
  const inspections = PAIRS.map(inspectionResult)
  const verifications = PAIRS.map(verificationResult)
  if (reverseMapping) assignments.reverse()
  if (reverseInspection) inspections.reverse()
  if (reverseVerification) verifications.reverse()
  return {
    mapping: mapping(assignments),
    inspectionReport: inspectionReport(inspections),
    verificationReport: verificationReport(verifications),
    ...identity()
  }
}

function schemaNode(reference) {
  assert.match(reference, /^#\/\$defs\//u)
  return schema.$defs[reference.slice('#/$defs/'.length)]
}

function matchesSchema(value, definition) {
  if (definition.$ref) return matchesSchema(value, schemaNode(definition.$ref))
  if (definition.const !== undefined) return Object.is(value, definition.const)
  if (definition.enum) return definition.enum.some((candidate) => Object.is(candidate, value))
  if (definition.oneOf) return definition.oneOf.filter((candidate) => matchesSchema(value, candidate)).length === 1
  if (definition.anyOf) return definition.anyOf.some((candidate) => matchesSchema(value, candidate))
  if (definition.not && matchesSchema(value, definition.not)) return false

  const types = Array.isArray(definition.type) ? definition.type : [definition.type]
  if (definition.type !== undefined) {
    const observed = value === null
      ? 'null'
      : Array.isArray(value)
        ? 'array'
        : Number.isInteger(value)
          ? 'integer'
          : typeof value
    if (!types.includes(observed) && !(observed === 'integer' && types.includes('number'))) return false
  }
  if (typeof value === 'string') {
    if (definition.minLength !== undefined && value.length < definition.minLength) return false
    if (definition.pattern !== undefined && !new RegExp(definition.pattern, 'u').test(value)) return false
  }
  if (typeof value === 'number') {
    if (definition.minimum !== undefined && value < definition.minimum) return false
    if (definition.exclusiveMinimum !== undefined && value <= definition.exclusiveMinimum) return false
  }
  if (Array.isArray(value)) {
    if (definition.minItems !== undefined && value.length < definition.minItems) return false
    if (definition.maxItems !== undefined && value.length > definition.maxItems) return false
    if (definition.items && !value.every((item) => matchesSchema(item, definition.items))) return false
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if ((definition.required || []).some((key) => !Object.hasOwn(value, key))) return false
    if (definition.additionalProperties === false && Object.keys(value).some((key) => !Object.hasOwn(definition.properties || {}, key))) {
      return false
    }
    for (const [key, child] of Object.entries(value)) {
      if (definition.properties && definition.properties[key] && !matchesSchema(child, definition.properties[key])) {
        return false
      }
    }
  }
  return true
}

test('one valid entry builds', () => {
  const manifest = build()
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.authorityDomain, 'technical-acquisition')
  assert.equal(manifest.entries.length, 1)
})

test('synthetic Hollowed identity flows through a technical-acquisition manifest', () => {
  const pair = ['hollowed:14', 'hb_14', '14 - The Slashing Opera (sub).mp4']
  const manifest = build({
    mapping: mapping([mappingAssignment(pair)]),
    inspectionReport: inspectionReport([inspectionResult(pair)]),
    verificationReport: verificationReport([verificationResult(pair)]),
    ...identity([pair])
  })
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.authorityDomain, 'technical-acquisition')
  assert.equal(manifest.entries.length, 1)
  assert.equal(manifest.entries[0].recordId, 'hollowed:14')
  assert.equal(manifest.entries[0].videoId, 'hb_14')
  assert.equal(manifest.entries[0].media.relativePath, 'sources/media/14 - The Slashing Opera (sub).mp4')
})

test('acquisition manifest generation rejects a cross-project identity', () => {
  const invalidPair = ['hollowed:14', 'cb_14', 'hollowed.mp4']
  const inputs = {
    mapping: mapping([mappingAssignment(invalidPair)]),
    inspectionReport: inspectionReport([inspectionResult(invalidPair)]),
    verificationReport: verificationReport([verificationResult(invalidPair)]),
    ...identity([
      ['hollowed:14', 'hb_14', 'hollowed.mp4'],
      ['concentrated:14', 'cb_14', 'concentrated.mkv']
    ])
  }
  expectCode('record-video-mismatch', () => build(inputs))
})

test('entry contains exactly identity, media, and torrent', () => {
  assert.deepEqual(Object.keys(build().entries[0]), ['recordId', 'videoId', 'media', 'torrent'])
})

test('deterministic JSON bytes use two spaces, LF, and a trailing newline', () => {
  const first = jsonBytes(build())
  const second = jsonBytes(structuredClone(build()))
  assert.ok(first.equals(second))
  assert.match(first.toString('utf8'), /\n  "authorityDomain"/u)
  assert.equal(first.at(-1), 0x0a)
  assert.equal(first.includes(0x0d), false)
})

test('permanent registry ordering wins over mapping order', () => {
  assert.deepEqual(
    build(twoEntryInputs({ reverseMapping: true })).entries.map(({ videoId }) => videoId),
    ['cb_3', 'cb_4']
  )
})

test('permuted mapping and report order produces identical bytes', () => {
  const ordered = jsonBytes(build(twoEntryInputs()))
  const permuted = jsonBytes(build(twoEntryInputs({
    reverseMapping: true,
    reverseInspection: true,
    reverseVerification: true
  })))
  assert.ok(ordered.equals(permuted))
})

test('duplicate mapping record identity is rejected', () => {
  const inputs = validInputs()
  const duplicate = { ...mappingAssignment(PAIRS[1]), recordId: PAIRS[0][0] }
  inputs.mapping.assignments.push(duplicate)
  expectCode('duplicate-mapping-identity', () => build(inputs))
})

test('duplicate mapping video identity is rejected', () => {
  const inputs = validInputs()
  const duplicate = { ...mappingAssignment(PAIRS[1]), videoId: PAIRS[0][1] }
  inputs.mapping.assignments.push(duplicate)
  expectCode('duplicate-mapping-identity', () => build(inputs))
})

test('unknown record is rejected', () => {
  const inputs = validInputs()
  inputs.mapping.assignments[0].recordId = 'concentrated:999'
  expectCode('unknown-record-id', () => build(inputs))
})

test('unknown video ID is rejected', () => {
  const inputs = validInputs()
  inputs.mapping.assignments[0].videoId = 'cb_999'
  expectCode('unknown-video-id', () => build(inputs))
})

test('record and video mismatch is rejected', () => {
  const inputs = validInputs()
  inputs.mapping.assignments[0].videoId = 'cb_4'
  expectCode('record-video-mismatch', () => build(inputs))
})

test('missing inspection result is rejected', () => {
  const inputs = validInputs()
  inputs.inspectionReport = inspectionReport([])
  expectCode('missing-inspection-result', () => build(inputs))
})

test('failed inspection result is rejected', () => {
  const inputs = validInputs()
  inputs.inspectionReport.assignments[0].inspection = { state: 'failed' }
  inputs.inspectionReport.inspectionSummary = { total: 1, succeeded: 0, failed: 1 }
  expectCode('failed-inspection-result', () => build(inputs))
})

test('duplicate inspection result is rejected', () => {
  const inputs = validInputs()
  inputs.inspectionReport = inspectionReport([
    inspectionResult(),
    inspectionResult()
  ])
  expectCode('duplicate-inspection-result', () => build(inputs))
})

test('missing verification result is rejected', () => {
  const inputs = validInputs()
  inputs.verificationReport = verificationReport([])
  expectCode('missing-verification-result', () => build(inputs))
})

test('failed verification result is rejected', () => {
  const inputs = validInputs()
  inputs.verificationReport.assignments[0].state = 'failed'
  inputs.verificationReport.verificationSummary = { total: 1, verified: 0, failed: 1 }
  expectCode('failed-verification-result', () => build(inputs))
})

test('duplicate verification result is rejected', () => {
  const inputs = validInputs()
  inputs.verificationReport = verificationReport([
    verificationResult(),
    verificationResult()
  ])
  expectCode('duplicate-verification-result', () => build(inputs))
})

test('inspection identity disagreement is rejected', () => {
  const inputs = validInputs()
  inputs.inspectionReport.assignments[0].assignment.recordId = 'concentrated:04'
  expectCode('inspection-identity-mismatch', () => build(inputs))
})

test('verification identity disagreement is rejected', () => {
  const inputs = validInputs()
  inputs.verificationReport.assignments[0].recordId = 'concentrated:04'
  expectCode('verification-identity-mismatch', () => build(inputs))
})

test('inspection media path disagreement is rejected', () => {
  const inputs = validInputs()
  inputs.inspectionReport.assignments[0].assignment.relativePath = 'sources/media/different.mkv'
  expectCode('media-path-mismatch', () => build(inputs))
})

test('verification media path disagreement is rejected', () => {
  const inputs = validInputs()
  inputs.verificationReport.assignments[0].mediaRelativePath = 'sources/media/different.mkv'
  expectCode('media-path-mismatch', () => build(inputs))
})

test('torrent path disagreement is rejected', () => {
  const inputs = validInputs()
  inputs.verificationReport.assignments[0].torrentRelativePath = 'sources/torrents/different.torrent'
  expectCode('torrent-path-mismatch', () => build(inputs))
})

test('inspection and verification byte-size disagreement is rejected', () => {
  const inputs = validInputs()
  inputs.verificationReport.assignments[0].media.byteSize += 1
  expectCode('media-byte-size-mismatch', () => build(inputs))
})

test('payload byte-size disagreement is rejected', () => {
  const inputs = validInputs()
  inputs.verificationReport.assignments[0].torrent.declaredPayloadByteSize += 1
  expectCode('payload-byte-size-mismatch', () => build(inputs))
})

test('payload filename disagreement is rejected', () => {
  const inputs = validInputs()
  inputs.verificationReport.assignments[0].torrent.payloadFilename = 'different.mkv'
  expectCode('payload-filename-mismatch', () => build(inputs))
})

test('mismatched torrent pieces are rejected', () => {
  const inputs = validInputs()
  const pieces = inputs.verificationReport.assignments[0].pieces
  pieces.verifiedPieces = 1
  pieces.mismatchedPieces = 1
  pieces.mismatchPieceIndexes = [1]
  expectCode('unverified-torrent-pieces', () => build(inputs))
})

test('noncanonical torrent verification is rejected', () => {
  const inputs = validInputs()
  inputs.verificationReport.assignments[0].torrent.rawInfoMatchesCanonicalEncoding = false
  expectCode('noncanonical-torrent-info', () => build(inputs))
})

test('failed filename comparison is rejected', () => {
  const inputs = validInputs()
  inputs.verificationReport.assignments[0].comparisons.payloadFilenameMatchesLocalMedia = false
  expectCode('payload-filename-comparison-failed', () => build(inputs))
})

test('failed byte-size comparison is rejected', () => {
  const inputs = validInputs()
  inputs.verificationReport.assignments[0].comparisons.payloadByteSizeMatchesLocalMedia = false
  expectCode('payload-byte-size-comparison-failed', () => build(inputs))
})

test('raw jpn and eng language values are preserved unchanged', () => {
  assert.deepEqual(build().entries[0].media.audioStreams.map(({ language }) => language), ['jpn', 'eng'])
})

test('raw hevc, aac, and ass codec values are preserved unchanged', () => {
  const media = build().entries[0].media
  assert.equal(media.videoStreams[0].codecName, 'hevc')
  assert.deepEqual(media.audioStreams.map(({ codecName }) => codecName), ['aac', 'aac'])
  assert.deepEqual(media.subtitleStreams.map(({ codecName }) => codecName), ['ass', 'ass'])
})

test('null subtitle language is preserved as raw null', () => {
  assert.equal(build().entries[0].media.subtitleStreams[1].language, null)
})

test('attached-picture video is retained separately', () => {
  const videos = build().entries[0].media.videoStreams
  assert.equal(videos.length, 2)
  assert.deepEqual(videos.map(({ attachedPic }) => attachedPic), [0, 1])
})

test('video forced disposition missing from inspector remains null', () => {
  assert.deepEqual(build().entries[0].media.videoStreams.map(({ forced }) => forced), [null, null])
})

test('video stream inspection order is preserved', () => {
  const inputs = validInputs()
  inputs.inspectionReport.assignments[0].streams.video.reverse()
  assert.deepEqual(build(inputs).entries[0].media.videoStreams.map(({ index }) => index), [7, 0])
})

test('attachment count is preserved', () => {
  assert.equal(build().entries[0].media.attachmentCount, 2)
})

test('other-stream count is preserved', () => {
  assert.equal(build().entries[0].media.otherStreamCount, 1)
})

test('warning code is preserved', () => {
  assert.equal(build().entries[0].media.warnings[0].code, 'missing-subtitle-language-tag')
})

test('warning stream index is preserved when directly attributable', () => {
  assert.equal(build().entries[0].media.warnings[0].streamIndex, 4)
})

test('warning without a direct stream index does not invent one', () => {
  const inputs = validInputs()
  inputs.inspectionReport.assignments[0].warnings = [{ code: 'no-ordinary-video-stream' }]
  assert.deepEqual(build(inputs).entries[0].media.warnings, [{ code: 'no-ordinary-video-stream' }])
})

test('attachment filenames are not emitted', () => {
  const serialized = JSON.stringify(build())
  assert.doesNotMatch(serialized, /private-font-name|second-font/u)
  assert.equal(serialized.includes('attachments'), false)
})

test('absolute input report paths are never emitted', () => {
  const inputs = validInputs()
  inputs.inspectionReport.sourcePath = '/private/inspection.json'
  inputs.verificationReport.sourcePath = 'C:\\private\\verification.json'
  const serialized = JSON.stringify(build(inputs))
  assert.doesNotMatch(serialized, /private[\\/](?:inspection|verification)/u)
})

test('absolute media artifact path is rejected', () => {
  const inputs = validInputs()
  inputs.mapping.assignments[0].mediaRelativePath = '/private/media.mkv'
  expectCode('invalid-artifact-path', () => build(inputs))
})

test('Windows absolute torrent artifact path is rejected', () => {
  const inputs = validInputs()
  inputs.mapping.assignments[0].torrentRelativePath = 'C:\\private\\file.torrent'
  expectCode('invalid-artifact-path', () => build(inputs))
})

test('traversal artifact path is rejected', () => {
  const inputs = validInputs()
  inputs.mapping.assignments[0].torrentRelativePath = 'sources/../outside.torrent'
  expectCode('invalid-artifact-path', () => build(inputs))
})

test('first output reports created', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acquisition-manifest-output-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const report = writeAcquisitionManifest({ manifest: build(), outputPath: path.join(root, 'manifest.json') })
  assert.equal(report.state, 'created')
  assert.equal(report.entryCount, 1)
})

test('identical second output reports already-identical', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acquisition-manifest-identical-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const outputPath = path.join(root, 'manifest.json')
  writeAcquisitionManifest({ manifest: build(), outputPath })
  assert.equal(writeAcquisitionManifest({ manifest: build(), outputPath }).state, 'already-identical')
})

test('identical second output does not rewrite the file', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acquisition-manifest-no-rewrite-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const outputPath = path.join(root, 'manifest.json')
  writeAcquisitionManifest({ manifest: build(), outputPath })
  const before = fs.statSync(outputPath, { bigint: true })
  writeAcquisitionManifest({ manifest: build(), outputPath })
  const after = fs.statSync(outputPath, { bigint: true })
  assert.equal(after.ino, before.ino)
  assert.equal(after.mtimeNs, before.mtimeNs)
})

test('different pre-existing output fails output-conflict without overwrite', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acquisition-manifest-conflict-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const outputPath = path.join(root, 'manifest.json')
  fs.writeFileSync(outputPath, 'different\n')
  expectCode('output-conflict', () => writeAcquisitionManifest({ manifest: build(), outputPath }))
  assert.equal(fs.readFileSync(outputPath, 'utf8'), 'different\n')
})

test('missing output parent directory is rejected', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acquisition-manifest-parent-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  expectCode('missing-output-directory', () => writeAcquisitionManifest({
    manifest: build(),
    outputPath: path.join(root, 'missing', 'manifest.json')
  }))
})

test('schema and runtime contracts agree on a representative manifest', () => {
  const manifest = validateAcquisitionManifest(build())
  assert.equal(matchesSchema(manifest, schema), true)
})

test('schema explicitly permits null raw subtitle language', () => {
  const language = schema.$defs.subtitleStream.properties.language
  assert.deepEqual(schemaNode(language.$ref).type, ['string', 'null'])
  assert.equal(matchesSchema(null, language), true)
})

test('schema closes every normalized manifest object shape', () => {
  for (const name of ['entry', 'media', 'container', 'videoStream', 'audioStream', 'subtitleStream', 'warning', 'torrent']) {
    assert.equal(schema.$defs[name].additionalProperties, false, name)
  }
  assert.equal(schema.additionalProperties, false)
})

test('torrent manifest contains exactly the contracted acquisition facts', () => {
  assert.deepEqual(Object.keys(build().entries[0].torrent), [
    'relativePath',
    'torrentByteSize',
    'torrentSha256',
    'infoHash',
    'fileIdx',
    'payloadFilename',
    'payloadByteSize',
    'pieceLength',
    'pieceCount',
    'verifiedPieces',
    'mismatchedPieces',
    'mismatchPieceIndexes',
    'rawInfoMatchesCanonicalEncoding',
    'payloadFilenameMatchesLocalMedia',
    'payloadByteSizeMatchesLocalMedia'
  ])
})

test('container null observations remain null', () => {
  const inputs = validInputs()
  inputs.inspectionReport.assignments[0].container.format_name = null
  inputs.inspectionReport.assignments[0].measuredContainerDurationSeconds = null
  assert.deepEqual(build(inputs).entries[0].media.container, {
    formatName: null,
    durationSeconds: null
  })
})

test('no normalized language or codec substitutions are introduced', () => {
  const serialized = JSON.stringify(build())
  assert.doesNotMatch(serialized, /Japanese|English|HEVC|H\.265/u)
  assert.match(serialized, /"hevc"/u)
  assert.match(serialized, /"jpn"/u)
  assert.match(serialized, /"eng"/u)
})

test('generator source does not invoke child processes, ffprobe, torrent hashing, or network access', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'generate-acquisition-manifest.js'), 'utf8')
  assert.doesNotMatch(source, /child_process|spawn|execFile|ffprobe|verifyPieces|create-local-torrent/u)
  assert.doesNotMatch(source, /https?\.|fetch\s*\(|net\.|dns\./u)
})

function readProductionManifestBytes() {
  return fs.readFileSync(PRODUCTION_MANIFEST_PATH)
}

function readProductionManifest() {
  return JSON.parse(readProductionManifestBytes().toString('utf8'))
}

function readArrancarManifestBytes() {
  return fs.readFileSync(ARRANCAR_MANIFEST_PATH)
}

function readArrancarManifest() {
  return JSON.parse(readArrancarManifestBytes().toString('utf8'))
}

function readHollowedManifestBytes() {
  return fs.readFileSync(HOLLOWED_MANIFEST_PATH)
}

function readHollowedManifest() {
  return JSON.parse(readHollowedManifestBytes().toString('utf8'))
}

test('durable production acquisition manifest has the exact locked bytes', () => {
  assert.equal(fs.existsSync(PRODUCTION_MANIFEST_PATH), true)
  const bytes = readProductionManifestBytes()
  assert.equal(bytes.length, LOCKED_PRODUCTION_MANIFEST_BYTE_SIZE)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    LOCKED_PRODUCTION_MANIFEST_SHA256
  )
})

test('durable production acquisition manifest satisfies the runtime contract', () => {
  const manifest = readProductionManifest()
  assert.equal(validateAcquisitionManifest(manifest), manifest)
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.authorityDomain, 'technical-acquisition')
  assert.equal(manifest.entries.length, 35)
})

test('durable production entries retain permanent registry order and exact scope', () => {
  const manifest = readProductionManifest()
  const registry = require('../projection/stremio/video-id-registry.json')
  const registryIndex = new Map(registry.entries.map((entry, index) => [entry.videoId, index]))
  const videoIds = manifest.entries.map(({ videoId }) => videoId)

  assert.equal(videoIds[0], 'cb_3')
  assert.equal(videoIds.at(-1), 'cb_0p0')
  assert.equal(videoIds.includes('cb_27p5'), true)
  assert.equal(videoIds.includes('cb_0p0'), true)
  assert.equal(videoIds.includes('cb_1'), false)
  assert.equal(videoIds.includes('cb_2'), false)
  assert.equal(videoIds.some((videoId) => {
    const match = /^cb_(\d+)$/u.exec(videoId)
    return match && Number(match[1]) >= 36
  }), false)
  assert.deepEqual(manifest.entries.filter((entry) => (
    entry.recordId === 'concentrated:0.0' ||
    entry.videoId === 'cb_0p0' ||
    entry.media.relativePath.includes('35.5 (0)')
  )).map((entry) => ({
    recordId: entry.recordId,
    videoId: entry.videoId,
    mediaRelativePath: entry.media.relativePath
  })), [{
    recordId: 'concentrated:0.0',
    videoId: 'cb_0p0',
    mediaRelativePath: 'sources/02 - Soul Society/35.5 (0) - the rotator_ the sand.mkv'
  }])
  for (let index = 1; index < videoIds.length; index += 1) {
    assert.ok(registryIndex.get(videoIds[index - 1]) < registryIndex.get(videoIds[index]))
  }
})

test('durable production identities and verified torrent totals remain exact', () => {
  const entries = readProductionManifest().entries
  assert.equal(new Set(entries.map(({ videoId }) => videoId)).size, 35)
  assert.equal(new Set(entries.map(({ recordId }) => recordId)).size, 35)
  assert.equal(new Set(entries.map(({ media }) => media.relativePath)).size, 35)
  assert.equal(new Set(entries.map(({ torrent }) => torrent.relativePath)).size, 35)
  assert.equal(new Set(entries.map(({ torrent }) => torrent.infoHash)).size, 35)
  assert.equal(entries.reduce((total, entry) => total + entry.torrent.verifiedPieces, 0), 10942)
  assert.equal(entries.reduce((total, entry) => total + entry.torrent.mismatchedPieces, 0), 0)

  for (const { torrent } of entries) {
    assert.equal(torrent.verifiedPieces, torrent.pieceCount)
    assert.equal(torrent.mismatchedPieces, 0)
    assert.deepEqual(torrent.mismatchPieceIndexes, [])
    assert.equal(torrent.rawInfoMatchesCanonicalEncoding, true)
    assert.equal(torrent.payloadFilenameMatchesLocalMedia, true)
    assert.equal(torrent.payloadByteSizeMatchesLocalMedia, true)
  }
})

test('durable production raw media vocabulary and stream totals remain exact', () => {
  const entries = readProductionManifest().entries
  const distinct = (values) => [...new Set(values)]

  assert.deepEqual(distinct(entries.flatMap(({ media }) => media.videoStreams.map(({ codecName }) => codecName))), ['hevc', 'png'])
  assert.deepEqual(distinct(entries.flatMap(({ media }) => media.videoStreams.map(({ profile }) => profile))), ['Main', null])
  assert.deepEqual(distinct(entries.flatMap(({ media }) => media.videoStreams.map(({ pixelFormat }) => pixelFormat))), ['yuv420p', 'rgb24'])
  assert.deepEqual(distinct(entries.flatMap(({ media }) => media.audioStreams.map(({ codecName }) => codecName))), ['aac'])
  assert.deepEqual(distinct(entries.flatMap(({ media }) => media.audioStreams.map(({ profile }) => profile))), ['LC'])
  assert.deepEqual(distinct(entries.flatMap(({ media }) => media.audioStreams.map(({ language }) => language))), ['jpn', 'eng'])
  assert.deepEqual(distinct(entries.flatMap(({ media }) => media.subtitleStreams.map(({ codecName }) => codecName))), ['ass'])
  assert.deepEqual(distinct(entries.flatMap(({ media }) => media.subtitleStreams.map(({ language }) => language))), ['eng', null])
  assert.equal(entries.reduce((total, entry) => total + entry.media.attachmentCount, 0), 177)
  assert.equal(entries.filter((entry) => entry.media.videoStreams.some(({ attachedPic }) => attachedPic === 1)).length, 23)
  assert.equal(entries.reduce((total, entry) => total + entry.media.otherStreamCount, 0), 0)
})

test('durable production manifest preserves the sole CB32 null language and warning', () => {
  const entries = readProductionManifest().entries
  const nullLanguages = entries.flatMap((entry) => entry.media.subtitleStreams
    .filter(({ language }) => language === null)
    .map((stream) => ({
      videoId: entry.videoId,
      recordId: entry.recordId,
      streamIndex: stream.index,
      language: stream.language
    })))
  const warnings = entries.flatMap((entry) => entry.media.warnings.map((warning) => ({
    videoId: entry.videoId,
    ...warning
  })))

  assert.deepEqual(nullLanguages, [{
    videoId: 'cb_32',
    recordId: 'concentrated:32',
    streamIndex: 4,
    language: null
  }])
  assert.deepEqual(warnings, [{
    videoId: 'cb_32',
    code: 'missing-subtitle-language-tag',
    streamIndex: 4
  }])
})

test('durable production CB3 acquisition identity remains locked', () => {
  const cb3 = readProductionManifest().entries.find(({ videoId }) => videoId === 'cb_3')
  assert.ok(cb3)
  assert.deepEqual({
    videoId: cb3.videoId,
    recordId: cb3.recordId,
    mediaRelativePath: cb3.media.relativePath,
    mediaByteSize: cb3.media.byteSize,
    durationSeconds: cb3.media.container.durationSeconds,
    torrentRelativePath: cb3.torrent.relativePath,
    torrentSha256: cb3.torrent.torrentSha256,
    infoHash: cb3.torrent.infoHash,
    pieceLength: cb3.torrent.pieceLength,
    pieceCount: cb3.torrent.pieceCount,
    verifiedPieces: cb3.torrent.verifiedPieces,
    mismatchedPieces: cb3.torrent.mismatchedPieces
  }, {
    videoId: 'cb_3',
    recordId: 'concentrated:03',
    mediaRelativePath: 'sources/01 - Substitute Soul Reaper/03 - The Pink-Cheeked Cockatiel.mkv',
    mediaByteSize: 348128661,
    durationSeconds: 2173.845,
    torrentRelativePath: 'sources/torrents/concentrated-preboundary/03 - The Pink-Cheeked Cockatiel.mkv.torrent',
    torrentSha256: '867eea7e14a69b0ec9a1df87ce0d849e3f7390936a5f3ff398359dccbf5b438e',
    infoHash: '52094de720ccaa6d4eb3ce82eef8516f726cbf63',
    pieceLength: 1048576,
    pieceCount: 333,
    verifiedPieces: 333,
    mismatchedPieces: 0
  })
})

test('durable production CB32 acquisition and torrent identity remain locked', () => {
  const cb32 = readProductionManifest().entries.find(({ videoId }) => videoId === 'cb_32')
  assert.ok(cb32)
  assert.deepEqual({
    videoId: cb32.videoId,
    recordId: cb32.recordId,
    mediaRelativePath: cb32.media.relativePath,
    mediaByteSize: cb32.media.byteSize,
    durationSeconds: cb32.media.container.durationSeconds,
    torrentRelativePath: cb32.torrent.relativePath,
    torrentSha256: cb32.torrent.torrentSha256,
    infoHash: cb32.torrent.infoHash,
    pieceLength: cb32.torrent.pieceLength,
    pieceCount: cb32.torrent.pieceCount,
    verifiedPieces: cb32.torrent.verifiedPieces,
    mismatchedPieces: cb32.torrent.mismatchedPieces
  }, {
    videoId: 'cb_32',
    recordId: 'concentrated:32',
    mediaRelativePath: 'sources/02 - Soul Society/32 - Cat and Hornet.mkv',
    mediaByteSize: 323345566,
    durationSeconds: 1547.159,
    torrentRelativePath: 'sources/torrents/concentrated-preboundary/32 - Cat and Hornet.mkv.torrent',
    torrentSha256: '30aa21b0bc57e24750be9ee1da0c119bbba87cde23e0e9913c3b213ef9339338',
    infoHash: '42892d7b2071a411bba2869a1177e265b2d33d93',
    pieceLength: 1048576,
    pieceCount: 309,
    verifiedPieces: 309,
    mismatchedPieces: 0
  })
})

test('durable production cb_0p0 acquisition and torrent identity remain locked', () => {
  const cb0p0 = readProductionManifest().entries.find(({ videoId }) => videoId === 'cb_0p0')
  assert.ok(cb0p0)
  assert.deepEqual({
    videoId: cb0p0.videoId,
    recordId: cb0p0.recordId,
    mediaRelativePath: cb0p0.media.relativePath,
    mediaByteSize: cb0p0.media.byteSize,
    formatName: cb0p0.media.container.formatName,
    durationSeconds: cb0p0.media.container.durationSeconds,
    videoStreams: cb0p0.media.videoStreams,
    audioStreams: cb0p0.media.audioStreams,
    subtitleStreams: cb0p0.media.subtitleStreams,
    attachmentCount: cb0p0.media.attachmentCount,
    otherStreamCount: cb0p0.media.otherStreamCount,
    warnings: cb0p0.media.warnings,
    torrentRelativePath: cb0p0.torrent.relativePath,
    torrentByteSize: cb0p0.torrent.torrentByteSize,
    torrentSha256: cb0p0.torrent.torrentSha256,
    infoHash: cb0p0.torrent.infoHash,
    fileIdx: cb0p0.torrent.fileIdx,
    payloadFilename: cb0p0.torrent.payloadFilename,
    payloadByteSize: cb0p0.torrent.payloadByteSize,
    pieceLength: cb0p0.torrent.pieceLength,
    pieceCount: cb0p0.torrent.pieceCount,
    verifiedPieces: cb0p0.torrent.verifiedPieces,
    mismatchedPieces: cb0p0.torrent.mismatchedPieces,
    mismatchPieceIndexes: cb0p0.torrent.mismatchPieceIndexes,
    rawInfoMatchesCanonicalEncoding: cb0p0.torrent.rawInfoMatchesCanonicalEncoding,
    payloadFilenameMatchesLocalMedia: cb0p0.torrent.payloadFilenameMatchesLocalMedia,
    payloadByteSizeMatchesLocalMedia: cb0p0.torrent.payloadByteSizeMatchesLocalMedia
  }, {
    videoId: 'cb_0p0',
    recordId: 'concentrated:0.0',
    mediaRelativePath: 'sources/02 - Soul Society/35.5 (0) - the rotator_ the sand.mkv',
    mediaByteSize: 53091320,
    formatName: 'matroska,webm',
    durationSeconds: 452.181,
    videoStreams: [{
      index: 0,
      codecName: 'hevc',
      profile: 'Main',
      width: 768,
      height: 576,
      pixelFormat: 'yuv420p',
      attachedPic: 0,
      default: 1,
      forced: null
    }],
    audioStreams: [{
      index: 1,
      codecName: 'aac',
      profile: 'LC',
      channels: 2,
      channelLayout: 'stereo',
      language: 'jpn',
      title: 'Japanese [ASC]',
      default: 1,
      forced: 0
    }, {
      index: 2,
      codecName: 'aac',
      profile: 'LC',
      channels: 2,
      channelLayout: 'stereo',
      language: 'eng',
      title: 'English [ASC]',
      default: 0,
      forced: 0
    }],
    subtitleStreams: [{
      index: 3,
      codecName: 'ass',
      language: 'eng',
      title: 'Full Subtitles [Edited ParanDark]',
      default: 1,
      forced: 0
    }, {
      index: 4,
      codecName: 'ass',
      language: 'eng',
      title: 'Signs and Songs [Edited ParanDark]',
      default: 0,
      forced: 1
    }],
    attachmentCount: 2,
    otherStreamCount: 0,
    warnings: [],
    torrentRelativePath: 'sources/torrents/concentrated-preboundary/35.5 (0) - the rotator_ the sand.mkv.torrent',
    torrentByteSize: 1130,
    torrentSha256: '9b2c22ecf5efb2bc846e10428d6d0d5f4d1809d657e79087538a24e295824ebc',
    infoHash: 'cbdfdf3949a8f8c2d470dfc4f1d1a21571dca7bc',
    fileIdx: 0,
    payloadFilename: '35.5 (0) - the rotator_ the sand.mkv',
    payloadByteSize: 53091320,
    pieceLength: 1048576,
    pieceCount: 51,
    verifiedPieces: 51,
    mismatchedPieces: 0,
    mismatchPieceIndexes: [],
    rawInfoMatchesCanonicalEncoding: true,
    payloadFilenameMatchesLocalMedia: true,
    payloadByteSizeMatchesLocalMedia: true
  })
})

test('durable Arrancar acquisition manifest has the exact locked bytes', () => {
  assert.equal(fs.existsSync(ARRANCAR_MANIFEST_PATH), true)
  const bytes = readArrancarManifestBytes()
  assert.equal(bytes.length, LOCKED_ARRANCAR_MANIFEST_BYTE_SIZE)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    LOCKED_ARRANCAR_MANIFEST_SHA256
  )
})

test('durable Arrancar acquisition manifest preserves exact scope and registry order', () => {
  const manifest = readArrancarManifest()
  const registry = require('../projection/stremio/video-id-registry.json')
  const registryIndex = new Map(registry.entries.map((entry, index) => [entry.videoId, index]))
  const expectedVideoIds = Array.from({ length: 16 }, (_, index) => `cb_${index + 36}`)
  const expectedRecordIds = Array.from({ length: 16 }, (_, index) => `concentrated:${index + 36}`)

  assert.equal(validateAcquisitionManifest(manifest), manifest)
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.authorityDomain, 'technical-acquisition')
  assert.equal(manifest.entries.length, 16)
  assert.deepEqual(manifest.entries.map(({ videoId }) => videoId), expectedVideoIds)
  assert.deepEqual(manifest.entries.map(({ recordId }) => recordId), expectedRecordIds)
  for (const excluded of ['cb_35', 'cb_0p0', 'cb_45p5', 'cb_50p5', 'cb_0p8']) {
    assert.equal(expectedVideoIds.includes(excluded), false)
  }
  for (let index = 1; index < expectedVideoIds.length; index += 1) {
    assert.ok(registryIndex.get(expectedVideoIds[index - 1]) < registryIndex.get(expectedVideoIds[index]))
  }

  for (const selector of [
    ({ recordId }) => recordId,
    ({ videoId }) => videoId,
    ({ media }) => media.relativePath,
    ({ torrent }) => torrent.relativePath,
    ({ torrent }) => torrent.infoHash
  ]) {
    assert.equal(new Set(manifest.entries.map(selector)).size, 16)
  }
})

test('durable Arrancar acquisition torrent and media aggregates remain exact', () => {
  const entries = readArrancarManifest().entries
  const distinct = (values) => [...new Set(values)]

  assert.equal(entries.reduce((total, entry) => total + entry.torrent.verifiedPieces, 0), 4771)
  assert.equal(entries.reduce((total, entry) => total + entry.torrent.mismatchedPieces, 0), 0)
  assert.equal(entries.reduce((total, entry) => total + entry.media.audioStreams.length, 0), 32)
  assert.equal(entries.reduce((total, entry) => total + entry.media.subtitleStreams.length, 0), 32)
  assert.equal(entries.reduce((total, entry) => total + entry.media.attachmentCount, 0), 84)
  assert.equal(entries.filter((entry) => entry.media.videoStreams.some(({ attachedPic }) => attachedPic === 1)).length, 16)
  assert.equal(entries.reduce((total, entry) => total + entry.media.otherStreamCount, 0), 0)
  assert.equal(entries.reduce((total, entry) => total + entry.media.warnings.length, 0), 0)

  assert.deepEqual(distinct(entries.flatMap(({ media }) => media.videoStreams.map(({ codecName }) => codecName))), ['hevc', 'png'])
  assert.deepEqual(distinct(entries.flatMap(({ media }) => media.audioStreams.map(({ codecName }) => codecName))), ['aac'])
  assert.deepEqual(distinct(entries.flatMap(({ media }) => media.audioStreams.map(({ language }) => language))), ['jpn', 'eng'])
  assert.deepEqual(distinct(entries.flatMap(({ media }) => media.subtitleStreams.map(({ codecName }) => codecName))), ['ass'])
  assert.deepEqual(distinct(entries.flatMap(({ media }) => media.subtitleStreams.map(({ language }) => language))), ['eng'])

  for (const { torrent } of entries) {
    assert.equal(torrent.verifiedPieces, torrent.pieceCount)
    assert.equal(torrent.mismatchedPieces, 0)
    assert.deepEqual(torrent.mismatchPieceIndexes, [])
    assert.equal(torrent.rawInfoMatchesCanonicalEncoding, true)
    assert.equal(torrent.payloadFilenameMatchesLocalMedia, true)
    assert.equal(torrent.payloadByteSizeMatchesLocalMedia, true)
  }
})

test('durable Hollowed current-raw acquisition manifest has the exact locked bytes', () => {
  assert.equal(fs.existsSync(HOLLOWED_MANIFEST_PATH), true)
  const bytes = readHollowedManifestBytes()
  assert.equal(bytes.length, LOCKED_HOLLOWED_MANIFEST_BYTE_SIZE)
  assert.equal(
    crypto.createHash('sha256').update(bytes).digest('hex'),
    LOCKED_HOLLOWED_MANIFEST_SHA256
  )
})

test('durable Hollowed current-raw manifest preserves exact scope and registry order', () => {
  const manifest = readHollowedManifest()
  const registry = require('../projection/stremio/video-id-registry.json')
  const registryIndex = new Map(registry.entries.map((entry, index) => [entry.videoId, index]))
  const expectedRecordIds = [
    ...Array.from({ length: 16 }, (_, index) => `hollowed:${index + 14}`),
    'hollowed:0.8',
    ...Array.from({ length: 21 }, (_, index) => `hollowed:${index + 30}`)
  ]
  const expectedVideoIds = [
    ...Array.from({ length: 16 }, (_, index) => `hb_${index + 14}`),
    'hb_0p8',
    ...Array.from({ length: 21 }, (_, index) => `hb_${index + 30}`)
  ]

  assert.equal(validateAcquisitionManifest(manifest), manifest)
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.authorityDomain, 'technical-acquisition')
  assert.equal(manifest.entries.length, 38)
  assert.deepEqual(manifest.entries.map(({ recordId }) => recordId), expectedRecordIds)
  assert.deepEqual(manifest.entries.map(({ videoId }) => videoId), expectedVideoIds)
  for (let index = 1; index < expectedVideoIds.length; index += 1) {
    assert.ok(registryIndex.get(expectedVideoIds[index - 1]) < registryIndex.get(expectedVideoIds[index]))
  }
  for (const excluded of ['hb_11p5', 'hb_ex_1', 'hb_ex_27', 'hb_ex_50', 'hb_13', 'hb_51']) {
    assert.equal(expectedVideoIds.includes(excluded), false)
  }
  for (const selector of [
    ({ recordId }) => recordId,
    ({ videoId }) => videoId,
    ({ media }) => media.relativePath,
    ({ torrent }) => torrent.relativePath,
    ({ torrent }) => torrent.infoHash
  ]) {
    assert.equal(new Set(manifest.entries.map(selector)).size, 38)
  }
})

test('durable Hollowed current-raw torrent and media aggregates remain exact', () => {
  const entries = readHollowedManifest().entries
  assert.equal(entries.reduce((total, entry) => total + entry.media.byteSize, 0), LOCKED_HOLLOWED_MEDIA_BYTE_SIZE)
  assert.equal(entries.reduce((total, entry) => total + entry.torrent.pieceCount, 0), LOCKED_HOLLOWED_PIECE_COUNT)
  assert.equal(entries.reduce((total, entry) => total + entry.torrent.verifiedPieces, 0), LOCKED_HOLLOWED_PIECE_COUNT)
  assert.equal(entries.reduce((total, entry) => total + entry.torrent.mismatchedPieces, 0), 0)
  assert.equal(entries.reduce((total, entry) => total + entry.media.videoStreams.filter(({ attachedPic }) => attachedPic === 0).length, 0), 38)
  assert.equal(entries.reduce((total, entry) => total + entry.media.audioStreams.length, 0), 38)
  assert.equal(entries.reduce((total, entry) => total + entry.media.subtitleStreams.length, 0), 0)
  assert.equal(entries.reduce((total, entry) => total + entry.media.attachmentCount, 0), 0)
  assert.equal(entries.reduce((total, entry) => total + entry.media.otherStreamCount, 0), 0)
  assert.equal(entries.reduce((total, entry) => total + entry.media.warnings.length, 0), 0)

  for (const { media, torrent } of entries) {
    assert.equal(media.videoStreams.length, 1)
    assert.equal(media.videoStreams[0].codecName, 'hevc')
    assert.equal(media.audioStreams.length, 1)
    assert.equal(media.audioStreams[0].codecName, 'aac')
    assert.equal(media.audioStreams[0].language, 'eng')
    assert.equal(torrent.fileIdx, 0)
    assert.equal(torrent.pieceLength, 1048576)
    assert.equal(torrent.verifiedPieces, torrent.pieceCount)
    assert.equal(torrent.mismatchedPieces, 0)
    assert.deepEqual(torrent.mismatchPieceIndexes, [])
    assert.equal(torrent.rawInfoMatchesCanonicalEncoding, true)
    assert.equal(torrent.payloadFilenameMatchesLocalMedia, true)
    assert.equal(torrent.payloadByteSizeMatchesLocalMedia, true)
  }
})

test('durable Hollowed current-raw witnesses preserve physical duration evidence', () => {
  const byVideoId = new Map(readHollowedManifest().entries.map((entry) => [entry.videoId, entry]))
  assert.deepEqual(
    ['hb_14', 'hb_0p8', 'hb_34', 'hb_36', 'hb_50'].map((videoId) => {
      const entry = byVideoId.get(videoId)
      return {
        recordId: entry.recordId,
        videoId,
        filename: entry.torrent.payloadFilename,
        durationSeconds: entry.media.container.durationSeconds
      }
    }),
    [{
      recordId: 'hollowed:14',
      videoId: 'hb_14',
      filename: 'Hollowed Bleach 14 - The Slashing Opera (sub).mp4',
      durationSeconds: 1912.535625
    }, {
      recordId: 'hollowed:0.8',
      videoId: 'hb_0p8',
      filename: 'Hollowed Bleach 29.5 (0.8) - a wonderful error (sub).mp4',
      durationSeconds: 377.610567
    }, {
      recordId: 'hollowed:34',
      videoId: 'hb_34',
      filename: 'Hollowed Bleach 34 - The Deathbringer Numbers (sub).mp4',
      durationSeconds: 2074.864458
    }, {
      recordId: 'hollowed:36',
      videoId: 'hb_36',
      filename: 'Hollowed Bleach 36 - heart (sub).mp4',
      durationSeconds: 2657.529875
    }, {
      recordId: 'hollowed:50',
      videoId: 'hb_50',
      filename: 'Hollowed Bleach 50 - Bleach My Soul (sub).mp4',
      durationSeconds: 1650.649
    }]
  )
})
