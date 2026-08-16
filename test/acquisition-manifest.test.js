'use strict'

const assert = require('node:assert/strict')
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

const PAIRS = [
  ['concentrated:03', 'cb_3', '03 - Three.mkv'],
  ['concentrated:04', 'cb_4', '04 - Four.mkv']
]

function identity(pairs = PAIRS) {
  return {
    concentrated: {
      records: pairs.map(([recordId]) => ({ recordId, projectId: 'concentrated' }))
    },
    registry: {
      entries: pairs.map(([recordId, videoId]) => ({
        recordId,
        videoId,
        projectId: 'concentrated'
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
