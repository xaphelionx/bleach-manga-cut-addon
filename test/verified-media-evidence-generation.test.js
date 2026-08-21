'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { validateVerifiedMedia } = require('../scripts/generate-stremio-data')
const {
  LOCAL_RETENTION,
  TORRENT_METHOD,
  VerifiedMediaEvidenceGenerationError,
  buildVerifiedMediaEvidence,
  evidencePrefix,
  generateEvidenceCandidates,
  jsonBytes,
  writeEvidenceCandidates
} = require('../scripts/generate-verified-media-evidence')

const PAIRS = [
  ['concentrated:02', 'cb_2'],
  ['concentrated:27.5', 'cb_27p5']
]

const REPOSITORY_ROOT = path.resolve(__dirname, '..')
const NORMALIZED_PROJECT_IDS = ['concentrated', 'hollowed', 'chipped']
const PRODUCTION_ACQUISITION_PATH = path.join(
  REPOSITORY_ROOT,
  'evidence',
  'acquisition',
  'concentrated-preboundary.json'
)
const ARRANCAR_ACQUISITION_PATH = path.join(
  REPOSITORY_ROOT,
  'evidence',
  'acquisition',
  'concentrated-arrancar.json'
)
const PRODUCTION_EVIDENCE_DIRECTORY = path.join(REPOSITORY_ROOT, 'evidence', 'media')
const PRODUCTION_SELECTION_ENTRIES = [
  { recordId: 'concentrated:03', videoId: 'cb_3' },
  { recordId: 'concentrated:04', videoId: 'cb_4' },
  { recordId: 'concentrated:05', videoId: 'cb_5' },
  { recordId: 'concentrated:06', videoId: 'cb_6' },
  { recordId: 'concentrated:07', videoId: 'cb_7' },
  { recordId: 'concentrated:08', videoId: 'cb_8' },
  { recordId: 'concentrated:09', videoId: 'cb_9' },
  { recordId: 'concentrated:10', videoId: 'cb_10' },
  { recordId: 'concentrated:11', videoId: 'cb_11' },
  { recordId: 'concentrated:12', videoId: 'cb_12' },
  { recordId: 'concentrated:13', videoId: 'cb_13' },
  { recordId: 'concentrated:14', videoId: 'cb_14' },
  { recordId: 'concentrated:15', videoId: 'cb_15' },
  { recordId: 'concentrated:16', videoId: 'cb_16' },
  { recordId: 'concentrated:17', videoId: 'cb_17' },
  { recordId: 'concentrated:18', videoId: 'cb_18' },
  { recordId: 'concentrated:19', videoId: 'cb_19' },
  { recordId: 'concentrated:20', videoId: 'cb_20' },
  { recordId: 'concentrated:21', videoId: 'cb_21' },
  { recordId: 'concentrated:22', videoId: 'cb_22' },
  { recordId: 'concentrated:23', videoId: 'cb_23' },
  { recordId: 'concentrated:24', videoId: 'cb_24' },
  { recordId: 'concentrated:25', videoId: 'cb_25' },
  { recordId: 'concentrated:26', videoId: 'cb_26' },
  { recordId: 'concentrated:27', videoId: 'cb_27' },
  { recordId: 'concentrated:27.5', videoId: 'cb_27p5' },
  { recordId: 'concentrated:28', videoId: 'cb_28' },
  { recordId: 'concentrated:29', videoId: 'cb_29' },
  { recordId: 'concentrated:30', videoId: 'cb_30' },
  { recordId: 'concentrated:31', videoId: 'cb_31' },
  { recordId: 'concentrated:32', videoId: 'cb_32' },
  { recordId: 'concentrated:33', videoId: 'cb_33' },
  { recordId: 'concentrated:34', videoId: 'cb_34' },
  { recordId: 'concentrated:35', videoId: 'cb_35' },
  { recordId: 'concentrated:0.0', videoId: 'cb_0p0' }
]
const LOCKED_PRODUCTION_EVIDENCE_INDEX_SHA256 =
  '071d4059c9711768f95ef14da8c3a558bb69ae99fa682ecc7aab01d05e6a1841'
const LOCKED_PRODUCTION_EVIDENCE_INDEX_BYTE_SIZE = 7033
const LOCKED_PRODUCTION_EVIDENCE_TOTAL_BYTE_SIZE = 132181
const ARRANCAR_SELECTION_ENTRIES = Array.from({ length: 16 }, (_, index) => ({
  recordId: `concentrated:${index + 36}`,
  videoId: `cb_${index + 36}`
}))
const LOCKED_ARRANCAR_EVIDENCE_INDEX_SHA256 =
  'deb13c1351260e6a8f125d8adacb56c1963885a95b601d0ed3f0763d0c2eea2c'
const LOCKED_ARRANCAR_EVIDENCE_INDEX_BYTE_SIZE = 3219
const LOCKED_ARRANCAR_EVIDENCE_TOTAL_BYTE_SIZE = 60357

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

function acquisitionEntry(pair = PAIRS[0]) {
  const [recordId, videoId] = pair
  const filename = videoId === 'hb_14'
    ? '14 - The Slashing Opera (sub).mp4'
    : `${videoId === 'cb_2' ? '02' : '27.5'} - Synthetic.mkv`
  return {
    recordId,
    videoId,
    media: {
      relativePath: `sources/media/${filename}`,
      byteSize: 2000000,
      container: {
        formatName: 'matroska,webm',
        durationSeconds: 180.25
      },
      videoStreams: [
        {
          index: 0,
          codecName: 'hevc',
          profile: 'Main',
          width: 768,
          height: 576,
          pixelFormat: 'yuv420p',
          attachedPic: 0,
          default: 1,
          forced: null
        },
        {
          index: 7,
          codecName: 'png',
          profile: null,
          width: 640,
          height: 480,
          pixelFormat: 'rgb24',
          attachedPic: 1,
          default: 0,
          forced: null
        }
      ],
      audioStreams: [
        {
          index: 1,
          codecName: 'aac',
          profile: 'LC',
          channels: 2,
          channelLayout: 'stereo',
          language: 'jpn',
          title: 'Original Audio',
          default: 1,
          forced: 0
        },
        {
          index: 2,
          codecName: 'aac',
          profile: 'LC',
          channels: 2,
          channelLayout: 'stereo',
          language: 'eng',
          title: 'Alternate Audio',
          default: 0,
          forced: 0
        }
      ],
      subtitleStreams: [
        {
          index: 3,
          codecName: 'ass',
          language: 'eng',
          title: 'Full Subtitles',
          default: 1,
          forced: 0
        },
        {
          index: 4,
          codecName: 'ass',
          language: null,
          title: 'Signs and Songs',
          default: 0,
          forced: 1
        }
      ],
      attachmentCount: 2,
      otherStreamCount: 0,
      warnings: [{ code: 'missing-subtitle-language-tag', streamIndex: 4 }]
    },
    torrent: {
      relativePath: `sources/torrents/${filename}.torrent`,
      torrentByteSize: 200,
      torrentSha256: videoId === 'cb_2' ? 'a'.repeat(64) : 'b'.repeat(64),
      infoHash: videoId === 'cb_2' ? 'c'.repeat(40) : 'd'.repeat(40),
      fileIdx: 0,
      payloadFilename: filename,
      payloadByteSize: 2000000,
      pieceLength: 1048576,
      pieceCount: 2,
      verifiedPieces: 2,
      mismatchedPieces: 0,
      mismatchPieceIndexes: [],
      rawInfoMatchesCanonicalEncoding: true,
      payloadFilenameMatchesLocalMedia: true,
      payloadByteSizeMatchesLocalMedia: true
    }
  }
}

function acquisitionManifest(entries = [acquisitionEntry()]) {
  return {
    schemaVersion: 1,
    authorityDomain: 'technical-acquisition',
    entries
  }
}

function selection(entries = [{ recordId: PAIRS[0][0], videoId: PAIRS[0][1] }]) {
  return { schemaVersion: 1, entries }
}

function validInputs() {
  return {
    acquisitionManifest: acquisitionManifest(),
    selection: selection(),
    ...identity()
  }
}

function generate(inputs = validInputs()) {
  return generateEvidenceCandidates(inputs)
}

function candidate(inputs = validInputs()) {
  const candidates = generate(inputs)
  assert.equal(candidates.length, 1)
  return candidates[0].value
}

function expectCode(code, callback) {
  assert.throws(callback, (error) => (
    error instanceof VerifiedMediaEvidenceGenerationError && error.generationCode === code
  ))
}

function twoEntryInputs({ reverseSelection = false } = {}) {
  const entries = PAIRS.map(acquisitionEntry)
  const selected = PAIRS.map(([recordId, videoId]) => ({ recordId, videoId }))
  if (reverseSelection) selected.reverse()
  return {
    acquisitionManifest: acquisitionManifest(entries),
    selection: selection(selected),
    ...identity()
  }
}

function temporaryDirectory(t, prefix = 'verified-media-evidence-') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

function readJsonFile(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'))
}

function productionCandidatesFor(acquisitionPath, selectionEntries) {
  const acquisitionManifest = readJsonFile(acquisitionPath)
  const normalizedRecords = NORMALIZED_PROJECT_IDS.flatMap((projectId) => (
    readJsonFile(path.join(REPOSITORY_ROOT, 'editorial', 'normalized', `${projectId}.json`)).records
  ))
  const candidates = generateEvidenceCandidates({
    acquisitionManifest,
    selection: {
      schemaVersion: 1,
      entries: selectionEntries.map((entry) => ({ ...entry }))
    },
    normalizedRecords,
    registry: readJsonFile(path.join(REPOSITORY_ROOT, 'projection', 'stremio', 'video-id-registry.json'))
  })
  return { acquisitionManifest, candidates }
}

function productionCandidates() {
  return productionCandidatesFor(PRODUCTION_ACQUISITION_PATH, PRODUCTION_SELECTION_ENTRIES)
}

function arrancarProductionCandidates() {
  return productionCandidatesFor(ARRANCAR_ACQUISITION_PATH, ARRANCAR_SELECTION_ENTRIES)
}

test('valid one-entry generation succeeds', () => {
  const result = generate()[0]
  assert.equal(result.videoId, 'cb_2')
  assert.equal(result.filename, 'cb_2.json')
})

test('deterministic output bytes are stable', () => {
  assert.ok(generate()[0].bytes.equals(generate()[0].bytes))
  assert.ok(generate()[0].bytes.equals(jsonBytes(candidate())))
})

test('registry ordering is independent of selection order', () => {
  assert.deepEqual(
    generate(twoEntryInputs({ reverseSelection: true })).map(({ videoId }) => videoId),
    ['cb_2', 'cb_27p5']
  )
})

test('explicit non-empty selection is required', () => {
  const inputs = validInputs()
  inputs.selection.entries = []
  expectCode('selection-required', () => generate(inputs))
})

test('selection unknown video is rejected', () => {
  const inputs = validInputs()
  inputs.selection.entries[0].videoId = 'cb_999'
  expectCode('unknown-video-id', () => generate(inputs))
})

test('selection unknown record is rejected', () => {
  const inputs = validInputs()
  inputs.selection.entries[0].recordId = 'concentrated:999'
  expectCode('unknown-record-id', () => generate(inputs))
})

test('selection record and video mismatch is rejected', () => {
  const inputs = validInputs()
  inputs.selection.entries[0].videoId = 'cb_27p5'
  expectCode('record-video-mismatch', () => generate(inputs))
})

test('cross-project selection identity is rejected', () => {
  const hollowedPair = ['hollowed:14', 'hb_14']
  const inputs = {
    acquisitionManifest: acquisitionManifest([acquisitionEntry(hollowedPair)]),
    selection: selection([{ recordId: 'hollowed:14', videoId: 'cb_14' }]),
    ...identity([
      hollowedPair,
      ['concentrated:14', 'cb_14']
    ])
  }
  expectCode('record-video-mismatch', () => generate(inputs))
})

test('selection entry absent from acquisition manifest is rejected', () => {
  const inputs = validInputs()
  inputs.selection = selection([{ recordId: PAIRS[1][0], videoId: PAIRS[1][1] }])
  expectCode('selection-not-in-acquisition', () => generate(inputs))
})

test('duplicate selection record is rejected', () => {
  const inputs = twoEntryInputs()
  inputs.selection.entries[1].recordId = inputs.selection.entries[0].recordId
  expectCode('duplicate-selection', () => generate(inputs))
})

test('duplicate selection video is rejected', () => {
  const inputs = twoEntryInputs()
  inputs.selection.entries[1].videoId = inputs.selection.entries[0].videoId
  expectCode('duplicate-selection', () => generate(inputs))
})

test('exactly one ordinary playback video is selected', () => {
  assert.equal(candidate().media.video.codec, 'HEVC')
})

test('zero ordinary videos is rejected', () => {
  const inputs = validInputs()
  inputs.acquisitionManifest.entries[0].media.videoStreams[0].attachedPic = 1
  expectCode('invalid-primary-video-count', () => generate(inputs))
})

test('multiple ordinary videos is rejected', () => {
  const inputs = validInputs()
  inputs.acquisitionManifest.entries[0].media.videoStreams[1].attachedPic = 0
  expectCode('invalid-primary-video-count', () => generate(inputs))
})

test('unresolved attached-picture disposition is rejected as ambiguous', () => {
  const inputs = validInputs()
  inputs.acquisitionManifest.entries[0].media.videoStreams[1].attachedPic = null
  expectCode('ambiguous-primary-video', () => generate(inputs))
})

test('attached picture is excluded from media.video', () => {
  const video = candidate().media.video
  assert.equal(video.codec, 'HEVC')
  assert.equal('png' in video, false)
  assert.equal('attachedPic' in video, false)
})

test('hevc normalizes to HEVC', () => {
  assert.equal(candidate().media.video.codec, 'HEVC')
})

test('hevc normalizes to H.265 standard', () => {
  assert.equal(candidate().media.video.standard, 'H.265')
})

test('unknown video codec is rejected', () => {
  const inputs = validInputs()
  inputs.acquisitionManifest.entries[0].media.videoStreams[0].codecName = 'av1'
  expectCode('unknown-video-codec', () => generate(inputs))
})

test('video profile, dimensions, and pixel format pass through', () => {
  assert.deepEqual(candidate().media.video, {
    codec: 'HEVC',
    standard: 'H.265',
    profile: 'Main',
    width: 768,
    height: 576,
    pixelFormat: 'yuv420p'
  })
})

test('aac normalizes to AAC', () => {
  assert.deepEqual(candidate().media.audioTracks.map(({ codec }) => codec), ['AAC', 'AAC'])
})

test('jpn audio normalizes to Japanese', () => {
  assert.equal(candidate().media.audioTracks[0].language, 'Japanese')
})

test('eng audio normalizes to English', () => {
  assert.equal(candidate().media.audioTracks[1].language, 'English')
})

test('unknown audio codec is rejected', () => {
  const inputs = validInputs()
  inputs.acquisitionManifest.entries[0].media.audioStreams[0].codecName = 'opus'
  expectCode('unknown-audio-codec', () => generate(inputs))
})

test('unknown audio language is rejected', () => {
  const inputs = validInputs()
  inputs.acquisitionManifest.entries[0].media.audioStreams[0].language = 'spa'
  expectCode('unknown-audio-language', () => generate(inputs))
})

test('null audio language is rejected', () => {
  const inputs = validInputs()
  inputs.acquisitionManifest.entries[0].media.audioStreams[0].language = null
  expectCode('unresolved-audio-language', () => generate(inputs))
})

test('audio stream order is preserved', () => {
  const inputs = validInputs()
  inputs.acquisitionManifest.entries[0].media.audioStreams.reverse()
  assert.deepEqual(candidate(inputs).media.audioTracks.map(({ language }) => language), ['English', 'Japanese'])
})

test('audio acquisition-only fields are omitted from evidence', () => {
  for (const track of candidate().media.audioTracks) {
    assert.deepEqual(Object.keys(track), ['language', 'codec', 'profile', 'channels', 'channelLayout'])
  }
})

test('subtitle eng normalizes to English', () => {
  assert.equal(candidate().media.subtitleTracks[0].language, 'English')
})

test('subtitle null normalizes to exact unresolved object', () => {
  assert.deepEqual(candidate().media.subtitleTracks[1].language, { state: 'unresolved' })
})

test('unknown non-null subtitle language is rejected', () => {
  const inputs = validInputs()
  inputs.acquisitionManifest.entries[0].media.subtitleStreams[0].language = 'spa'
  expectCode('unknown-subtitle-language', () => generate(inputs))
})

test('subtitle title is required', () => {
  const inputs = validInputs()
  inputs.acquisitionManifest.entries[0].media.subtitleStreams[0].title = null
  expectCode('missing-subtitle-title', () => generate(inputs))
})

test('subtitle stream order is preserved', () => {
  const inputs = validInputs()
  inputs.acquisitionManifest.entries[0].media.subtitleStreams.reverse()
  assert.deepEqual(candidate(inputs).media.subtitleTracks.map(({ title }) => title), ['Signs and Songs', 'Full Subtitles'])
})

test('subtitle acquisition-only fields are omitted from evidence', () => {
  for (const track of candidate().media.subtitleTracks) {
    assert.deepEqual(Object.keys(track), ['kind', 'language', 'title'])
  }
})

test('measured container duration is preserved exactly', () => {
  assert.deepEqual(candidate().media.duration, {
    state: 'verified',
    measurement: 'container',
    seconds: 180.25
  })
})

test('null measured container duration is rejected', () => {
  const inputs = validInputs()
  inputs.acquisitionManifest.entries[0].media.container.durationSeconds = null
  expectCode('missing-container-duration', () => generate(inputs))
})

test('evidence prefix removes underscore from cb_2', () => {
  assert.equal(evidencePrefix('cb_2'), 'cb2')
})

test('evidence prefix removes underscore from cb_27p5', () => {
  assert.equal(evidencePrefix('cb_27p5'), 'cb27p5')
})

test('torrent basis ID is exact', () => {
  assert.equal(candidate().verificationBases[0].evidenceId, 'cb2-local-torrent-verification')
})

test('media basis ID is exact', () => {
  assert.equal(candidate().verificationBases[1].evidenceId, 'cb2-local-media-ffprobe-inspection')
})

test('decimal evidence basis IDs are exact', () => {
  const value = buildVerifiedMediaEvidence(acquisitionEntry(PAIRS[1]))
  assert.deepEqual(value.verificationBases.map(({ evidenceId }) => evidenceId), [
    'cb27p5-local-torrent-verification',
    'cb27p5-local-media-ffprobe-inspection'
  ])
})

test('verification basis ordering is torrent then media', () => {
  assert.deepEqual(candidate().verificationBases.map(({ kind }) => kind), [
    'local-torrent-verification',
    'local-media-inspection'
  ])
})

test('torrent method constant is exact', () => {
  assert.equal(TORRENT_METHOD, 'canonical-bencode-v1-creation-and-independent-piece-verification')
  assert.equal(candidate().verificationBases[0].method, TORRENT_METHOD)
})

test('retention constant is exact on both bases', () => {
  assert.equal(LOCAL_RETENTION, 'ignored-local-workspace')
  assert.deepEqual(candidate().verificationBases.map(({ artifact }) => artifact.retention), [
    LOCAL_RETENTION,
    LOCAL_RETENTION
  ])
})

test('network evidence remains three unresolved states', () => {
  assert.deepEqual(candidate().torrent.networkEvidence, {
    trackers: { state: 'unresolved' },
    announceUrls: { state: 'unresolved' },
    webSeeds: { state: 'unresolved' }
  })
})

test('fieldEvidence pointer set and ordering are exact', () => {
  assert.deepEqual(Object.keys(candidate().fieldEvidence), [
    '/torrent/infoHash',
    '/torrent/fileSelection/fileIdx',
    '/torrent/fileSelection/filename',
    '/torrent/fileSelection/byteSize',
    '/media/duration',
    '/media/video/codec',
    '/media/video/standard',
    '/media/video/profile',
    '/media/video/width',
    '/media/video/height',
    '/media/video/pixelFormat',
    '/media/audioTracks',
    '/media/subtitleTracks'
  ])
})

test('fieldEvidence references exact generated basis IDs', () => {
  const refs = candidate().fieldEvidence
  for (const [pointer, evidenceIds] of Object.entries(refs)) {
    assert.deepEqual(evidenceIds, [pointer.startsWith('/torrent/')
      ? 'cb2-local-torrent-verification'
      : 'cb2-local-media-ffprobe-inspection'])
  }
})

test('generated candidate passes operative validateVerifiedMedia', () => {
  assert.doesNotThrow(() => validateVerifiedMedia(candidate()))
})

test('Hollowed English-only media with zero subtitles produces valid evidence', () => {
  const pair = ['hollowed:14', 'hb_14']
  const entry = acquisitionEntry(pair)
  entry.media.videoStreams = [entry.media.videoStreams[0]]
  entry.media.audioStreams = [{
    index: 1,
    codecName: 'aac',
    profile: 'LC',
    channels: 2,
    channelLayout: 'stereo',
    language: 'eng',
    title: 'English Audio',
    default: 1,
    forced: 0
  }]
  entry.media.subtitleStreams = []
  entry.media.attachmentCount = 0
  entry.media.warnings = []

  const value = candidate({
    acquisitionManifest: acquisitionManifest([entry]),
    selection: selection([{ recordId: pair[0], videoId: pair[1] }]),
    ...identity([pair])
  })

  assert.equal(value.recordId, 'hollowed:14')
  assert.equal(value.videoId, 'hb_14')
  assert.deepEqual(value.media.video, {
    codec: 'HEVC',
    standard: 'H.265',
    profile: 'Main',
    width: 768,
    height: 576,
    pixelFormat: 'yuv420p'
  })
  assert.deepEqual(value.media.audioTracks, [{
    language: 'English',
    codec: 'AAC',
    profile: 'LC',
    channels: 2,
    channelLayout: 'stereo'
  }])
  assert.deepEqual(value.media.subtitleTracks, [])
  assert.equal(value.torrent.fileSelection.fileIdx, 0)
  assert.deepEqual(value.torrent.networkEvidence, {
    trackers: { state: 'unresolved' },
    announceUrls: { state: 'unresolved' },
    webSeeds: { state: 'unresolved' }
  })
  assert.deepEqual(value.verificationBases.map(({ evidenceId }) => evidenceId), [
    'hb14-local-torrent-verification',
    'hb14-local-media-ffprobe-inspection'
  ])
  assert.doesNotThrow(() => validateVerifiedMedia(value))
})

test('first output is created', (t) => {
  const directory = temporaryDirectory(t)
  const report = writeEvidenceCandidates({ candidates: generate(), outputDirectory: directory })
  assert.deepEqual(report.summary, { total: 1, created: 1, alreadyIdentical: 0, failed: 0 })
  assert.equal(report.entries[0].state, 'created')
})

test('identical second output is already-identical', (t) => {
  const directory = temporaryDirectory(t)
  writeEvidenceCandidates({ candidates: generate(), outputDirectory: directory })
  const report = writeEvidenceCandidates({ candidates: generate(), outputDirectory: directory })
  assert.deepEqual(report.summary, { total: 1, created: 0, alreadyIdentical: 1, failed: 0 })
})

test('identical output is not rewritten', (t) => {
  const directory = temporaryDirectory(t)
  const output = path.join(directory, 'cb_2.json')
  writeEvidenceCandidates({ candidates: generate(), outputDirectory: directory })
  const before = fs.statSync(output, { bigint: true })
  writeEvidenceCandidates({ candidates: generate(), outputDirectory: directory })
  const after = fs.statSync(output, { bigint: true })
  assert.equal(after.ino, before.ino)
  assert.equal(after.mtimeNs, before.mtimeNs)
})

test('differing existing output is output-conflict and is not overwritten', (t) => {
  const directory = temporaryDirectory(t)
  const output = path.join(directory, 'cb_2.json')
  fs.writeFileSync(output, 'different\n')
  const report = writeEvidenceCandidates({ candidates: generate(), outputDirectory: directory })
  assert.equal(report.entries[0].state, 'failed')
  assert.equal(report.entries[0].error, 'output-conflict')
  assert.equal(fs.readFileSync(output, 'utf8'), 'different\n')
})

test('one batch transformation failure leaves no partial candidate files', (t) => {
  const directory = temporaryDirectory(t)
  const inputs = twoEntryInputs()
  inputs.acquisitionManifest.entries[1].media.videoStreams[0].codecName = 'av1'
  expectCode('unknown-video-codec', () => {
    const candidates = generate(inputs)
    writeEvidenceCandidates({ candidates, outputDirectory: directory })
  })
  assert.deepEqual(fs.readdirSync(directory), [])
})

test('one output conflict aborts all absent batch writes', (t) => {
  const directory = temporaryDirectory(t)
  fs.writeFileSync(path.join(directory, 'cb_27p5.json'), 'different\n')
  const report = writeEvidenceCandidates({ candidates: generate(twoEntryInputs()), outputDirectory: directory })
  assert.equal(report.summary.failed, 2)
  assert.equal(fs.existsSync(path.join(directory, 'cb_2.json')), false)
})

test('output report ordering follows permanent registry order', (t) => {
  const directory = temporaryDirectory(t)
  const report = writeEvidenceCandidates({
    candidates: generate(twoEntryInputs({ reverseSelection: true })),
    outputDirectory: directory
  })
  assert.deepEqual(report.entries.map(({ videoId }) => videoId), ['cb_2', 'cb_27p5'])
})

test('absolute and private input locations are not added to candidate bytes or reports', (t) => {
  const directory = temporaryDirectory(t)
  const candidates = generate()
  const report = writeEvidenceCandidates({ candidates, outputDirectory: directory })
  assert.equal(candidates[0].bytes.includes(Buffer.from(directory)), false)
  assert.equal(JSON.stringify(report).includes(directory), false)
})

test('generator has no child process, inspection, torrent creation, or network access', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'generate-verified-media-evidence.js'), 'utf8')
  assert.doesNotMatch(source, /node:child_process|\bspawn(?:Sync)?\b|\bexecFile(?:Sync)?\b|create-local-torrent|inspect-local-media/u)
  assert.doesNotMatch(source, /\bfetch\s*\(|node:(?:net|dns|http|https)|TorBox/u)
})

test('verified-media schemaVersion remains one', () => {
  assert.equal(candidate().schemaVersion, 1)
})

test('audio language unresolved object is never generated', () => {
  const inputs = validInputs()
  inputs.acquisitionManifest.entries[0].media.audioStreams[0].language = null
  expectCode('unresolved-audio-language', () => generate(inputs))
})

test('CB32-like raw null becomes unresolved exactly', () => {
  assert.deepEqual(candidate().media.subtitleTracks[1], {
    kind: 'embedded',
    language: { state: 'unresolved' },
    title: 'Signs and Songs'
  })
})

test('acquisition raw values are not modified in memory', () => {
  const inputs = validInputs()
  const before = JSON.stringify(inputs.acquisitionManifest)
  generate(inputs)
  assert.equal(JSON.stringify(inputs.acquisitionManifest), before)
})

test('committed preboundary evidence is byte-identical to the approved production generation batch', () => {
  const { acquisitionManifest, candidates } = productionCandidates()
  const expectedVideoIds = PRODUCTION_SELECTION_ENTRIES.map(({ videoId }) => videoId)
  assert.equal(candidates.length, 35)
  assert.deepEqual(candidates.map(({ videoId }) => videoId), expectedVideoIds)
  assert.deepEqual(PRODUCTION_SELECTION_ENTRIES.at(-1), {
    recordId: 'concentrated:0.0',
    videoId: 'cb_0p0'
  })
  assert.equal(expectedVideoIds.includes('cb_1'), false)
  assert.equal(expectedVideoIds.includes('cb_2'), false)

  for (const candidate of candidates) {
    const acquisitionEntry = acquisitionManifest.entries.find(({ videoId }) => videoId === candidate.videoId)
    assert.ok(acquisitionEntry)
    assert.equal(acquisitionEntry.recordId, candidate.recordId)
    const filename = path.join(PRODUCTION_EVIDENCE_DIRECTORY, candidate.filename)
    assert.equal(fs.existsSync(filename), true)
    const committedBytes = fs.readFileSync(filename)
    assert.ok(committedBytes.equals(candidate.bytes))
    assert.equal(crypto.createHash('sha256').update(committedBytes).digest('hex'), candidate.sha256)
    assert.equal(committedBytes.length, candidate.byteSize)
    const committed = JSON.parse(committedBytes)
    assert.doesNotThrow(() => validateVerifiedMedia(committed))
    assert.equal(committed.recordId, acquisitionEntry.recordId)
    assert.equal(committed.videoId, acquisitionEntry.videoId)
  }
})

test('committed preboundary evidence set matches the aggregate index lock', () => {
  let totalByteSize = 0
  const index = PRODUCTION_SELECTION_ENTRIES.map(({ recordId, videoId }) => {
    const filename = `${videoId}.json`
    const bytes = fs.readFileSync(path.join(PRODUCTION_EVIDENCE_DIRECTORY, filename))
    const committed = JSON.parse(bytes)
    assert.equal(committed.recordId, recordId)
    assert.equal(committed.videoId, videoId)
    totalByteSize += bytes.length
    return {
      recordId: committed.recordId,
      videoId: committed.videoId,
      filename,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      byteSize: bytes.length
    }
  })
  const indexBytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`)
  assert.equal(indexBytes.length, LOCKED_PRODUCTION_EVIDENCE_INDEX_BYTE_SIZE)
  assert.equal(totalByteSize, LOCKED_PRODUCTION_EVIDENCE_TOTAL_BYTE_SIZE)
  assert.equal(
    crypto.createHash('sha256').update(indexBytes).digest('hex'),
    LOCKED_PRODUCTION_EVIDENCE_INDEX_SHA256
  )
})

test('committed Arrancar evidence is byte-identical to its separate production generation batch', () => {
  const { acquisitionManifest, candidates } = arrancarProductionCandidates()
  const expectedVideoIds = ARRANCAR_SELECTION_ENTRIES.map(({ videoId }) => videoId)
  assert.equal(candidates.length, 16)
  assert.deepEqual(candidates.map(({ videoId }) => videoId), expectedVideoIds)
  assert.deepEqual(ARRANCAR_SELECTION_ENTRIES[0], { recordId: 'concentrated:36', videoId: 'cb_36' })
  assert.deepEqual(ARRANCAR_SELECTION_ENTRIES.at(-1), { recordId: 'concentrated:51', videoId: 'cb_51' })

  for (const candidate of candidates) {
    const acquisitionEntry = acquisitionManifest.entries.find(({ videoId }) => videoId === candidate.videoId)
    assert.ok(acquisitionEntry)
    assert.equal(acquisitionEntry.recordId, candidate.recordId)
    const filename = path.join(PRODUCTION_EVIDENCE_DIRECTORY, candidate.filename)
    assert.equal(fs.existsSync(filename), true)
    const committedBytes = fs.readFileSync(filename)
    assert.ok(committedBytes.equals(candidate.bytes))
    assert.equal(crypto.createHash('sha256').update(committedBytes).digest('hex'), candidate.sha256)
    assert.equal(committedBytes.length, candidate.byteSize)
    const committed = JSON.parse(committedBytes)
    assert.doesNotThrow(() => validateVerifiedMedia(committed))
    assert.deepEqual(committed.media.subtitleTracks.map(({ language }) => language), ['English', 'English'])
  }
})

test('committed Arrancar evidence set matches its separate aggregate index lock', () => {
  let totalByteSize = 0
  const index = ARRANCAR_SELECTION_ENTRIES.map(({ recordId, videoId }) => {
    const filename = `${videoId}.json`
    const bytes = fs.readFileSync(path.join(PRODUCTION_EVIDENCE_DIRECTORY, filename))
    const committed = JSON.parse(bytes)
    assert.equal(committed.recordId, recordId)
    assert.equal(committed.videoId, videoId)
    assert.deepEqual(committed.media.subtitleTracks.map(({ language }) => language), ['English', 'English'])
    totalByteSize += bytes.length
    return {
      recordId: committed.recordId,
      videoId: committed.videoId,
      filename,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      byteSize: bytes.length
    }
  })
  const indexBytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`)
  assert.equal(indexBytes.length, LOCKED_ARRANCAR_EVIDENCE_INDEX_BYTE_SIZE)
  assert.equal(totalByteSize, LOCKED_ARRANCAR_EVIDENCE_TOTAL_BYTE_SIZE)
  assert.equal(
    crypto.createHash('sha256').update(indexBytes).digest('hex'),
    LOCKED_ARRANCAR_EVIDENCE_INDEX_SHA256
  )
})
