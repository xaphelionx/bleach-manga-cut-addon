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
const CONCENTRATED_AUGUST_UPDATE_ACQUISITION_PATH = path.join(
  REPOSITORY_ROOT,
  'evidence',
  'acquisition',
  'concentrated-2026-08-25-update.json'
)
const HOLLOWED_ACQUISITION_PATH = path.join(
  REPOSITORY_ROOT,
  'evidence',
  'acquisition',
  'hollowed-current-raw.json'
)
const CHIPPED_ACQUISITION_PATH = path.join(
  REPOSITORY_ROOT,
  'evidence',
  'acquisition',
  'chipped-selected.json'
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
  'c8ea5145bf862dfc0fd51085bd297e7c8f2fed11135675b9704a345b7aab9026'
const LOCKED_PRODUCTION_EVIDENCE_INDEX_BYTE_SIZE = 7033
const LOCKED_PRODUCTION_EVIDENCE_TOTAL_BYTE_SIZE = 132200
const ARRANCAR_SELECTION_ENTRIES = Array.from({ length: 16 }, (_, index) => ({
  recordId: `concentrated:${index + 36}`,
  videoId: `cb_${index + 36}`
}))
const LOCKED_ARRANCAR_EVIDENCE_INDEX_SHA256 =
  'deb13c1351260e6a8f125d8adacb56c1963885a95b601d0ed3f0763d0c2eea2c'
const LOCKED_ARRANCAR_EVIDENCE_INDEX_BYTE_SIZE = 3219
const LOCKED_ARRANCAR_EVIDENCE_TOTAL_BYTE_SIZE = 60357
const CONCENTRATED_AUGUST_UPDATE_CURRENT_SELECTION_ENTRIES = [
  { recordId: 'concentrated:52', videoId: 'cb_52' },
  { recordId: 'concentrated:53', videoId: 'cb_53' },
  { recordId: 'concentrated:54', videoId: 'cb_54' }
]
const LOCKED_CONCENTRATED_AUGUST_UPDATE_EVIDENCE_SHA256 = Object.freeze({
  cb_52: '8416f7b5528f20e57421231c96995164678c1d05e9d21fcbcf55460a46297da9',
  cb_53: 'ae5dbebcea5f11cce204afd1db062ce5c66c448da0dcda6d14f843fc5e742a40',
  cb_54: 'eef49c9e873e0b5497aa5793e8f634b7c51e20e44f49ae104c5e8737dbbce134'
})
const LOCKED_OLD_CB27_EVIDENCE_SHA256 =
  'b4ebb06ca53645a8831c2383fe8267bd57a549a8bff1a51f774db6514cef553f'
const LOCKED_CORRECTED_CB27_EVIDENCE_SHA256 =
  '1ec3b5182e20a5e10b4445c4d555924c195b39265811ce2cee82fe5958030906'
const HOLLOWED_SELECTION_ENTRIES = [
  ...Array.from({ length: 16 }, (_, index) => ({
    recordId: `hollowed:${index + 14}`,
    videoId: `hb_${index + 14}`
  })),
  { recordId: 'hollowed:0.8', videoId: 'hb_0p8' },
  ...Array.from({ length: 21 }, (_, index) => ({
    recordId: `hollowed:${index + 30}`,
    videoId: `hb_${index + 30}`
  }))
]
const LOCKED_HOLLOWED_EVIDENCE_INDEX_SHA256 =
  'edec0dd57d92eac449b6013dc0d661f782b1e3905f66a0fe1a30e6077d09b462'
const LOCKED_HOLLOWED_EVIDENCE_INDEX_BYTE_SIZE = 7492
const LOCKED_HOLLOWED_EVIDENCE_TOTAL_BYTE_SIZE = 130226
const LOCKED_HOLLOWED_OTHER_EVIDENCE_INDEX_SHA256 =
  'ae64a7986125170f601a5bba0ca4a75a66cdff078295ab2c84364152e3633216'
const LOCKED_HB36_EVIDENCE_SHA256 =
  'ae082da0fc86c9911d94a659a644ee401837f843070212f865b90669692dcb9f'
const CHIPPED_SELECTION_ENTRIES = Array.from({ length: 12 }, (_, index) => ({
  recordId: `chipped:#${String(index + 1).padStart(2, '0')}`,
  videoId: `ch_${index + 1}`
}))
const LOCKED_CHIPPED_EVIDENCE_SHA256 = Object.freeze({
  ch_1: '3d655c38412cdb57a12cd3141119a4f045dcb48861d4e433a2481e45866ce5e2',
  ch_2: 'd1fe1f667425abd2321322b10e31ec9cf0d5032742a482a4ebc3a290ac2cefa1',
  ch_3: 'beb02b9a5dfdc4a27a7b7bdd2e9cb8cf674a67dbd73168bd608c2ff5c3d612ad',
  ch_4: '0b33257696c646dce79fc485572cc48ad57cf3c3972be33ab4f3fbcda9da8f47',
  ch_5: '5f8ce1d4f694bb5a908bb72694f7a3dce232758a88eddc6eddc15bd891f51aef',
  ch_6: '8806c583f5342fa38c5f5208ce81aff360d3f3ebe6c9d769db5a111397d24abe',
  ch_7: 'ee795fbe8259d3e1c628b95a809689d8611628da0e3bced787e4188157161f5a',
  ch_8: '365e094cb67ded53484b94951fa6aa52ebb31c4d79e5a23c2297d8702293dbc8',
  ch_9: 'cc6ec67b6a54443d1a3b236ef53d55ee77f33bf02f3180c5748af135a264a97a',
  ch_10: '75bbb7dddc1575ab8af8a9f314a618bb5a189813b9200b685eb8e597ddc5d828',
  ch_11: '8baaa0b1b976751be33f48f1c626a5e4be1ced1587c1ae0efc03f640bf02f4f7',
  ch_12: '23c73a4c37eb7bab302e9a965024ec4755d31181a1eb8303be1d0f77ace8e8ff'
})
const LOCKED_CHIPPED_INFO_HASHES = Object.freeze({
  ch_1: '1a89d1f240600c70b0f4de4d32aeef9507e9385e',
  ch_2: '146c5e97d71459f7d6042b5dc60e374c87b326a3',
  ch_3: '9c5bbf5012611b8e82776e2af764476d69c8eefd',
  ch_4: '7a88ab6286e2d8645e78cffc13b589563f6b2ed2',
  ch_5: 'da7ac70cbadce11e3348197a5b2cdb4ec130edf0',
  ch_6: '178fe19d7b001c7de12985648d07ccbc67a6c7bc',
  ch_7: 'b4f16d928997a8daa39b4883302ccbd67654bd09',
  ch_8: '8229743318150b709664e7b41b33ea3482873052',
  ch_9: '3b5a11911b84787deb2c449f573bd98bb52d1ef4',
  ch_10: 'a2b55d1f5617b9854397488fd2c53df3983294c2',
  ch_11: '490d4cc3df4595c1cef84190478526cd65483352',
  ch_12: 'dbf72d88935f333fe7a6d3f4d9cb2fd0a34faa3f'
})
const LOCKED_CHIPPED_EVIDENCE_VECTOR_SHA256 =
  '75e3a0162f9d33181b30464802390661c9bab8ab7b70d3b465ed35bc76733506'

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

function concentratedAugustUpdateCandidates(selectionEntries = CONCENTRATED_AUGUST_UPDATE_CURRENT_SELECTION_ENTRIES) {
  return productionCandidatesFor(CONCENTRATED_AUGUST_UPDATE_ACQUISITION_PATH, selectionEntries)
}

function hollowedProductionCandidates() {
  return productionCandidatesFor(HOLLOWED_ACQUISITION_PATH, HOLLOWED_SELECTION_ENTRIES)
}

function chippedProductionCandidates() {
  return productionCandidatesFor(CHIPPED_ACQUISITION_PATH, CHIPPED_SELECTION_ENTRIES)
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

test('pcm_s16le normalizes to PCM without fabricating profile or channel layout', () => {
  const inputs = validInputs()
  const stream = inputs.acquisitionManifest.entries[0].media.audioStreams[0]
  stream.codecName = 'pcm_s16le'
  stream.profile = null
  stream.channelLayout = null
  assert.deepEqual(candidate(inputs).media.audioTracks[0], {
    language: 'Japanese',
    codec: 'PCM',
    profile: null,
    channels: 2,
    channelLayout: null
  })
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

test('null audio language normalizes to the exact unresolved object', () => {
  const inputs = validInputs()
  inputs.acquisitionManifest.entries[0].media.audioStreams[0].language = null
  assert.deepEqual(candidate(inputs).media.audioTracks[0].language, { state: 'unresolved' })
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

test('audio language unresolved object is generated only from a raw null tag', () => {
  const inputs = validInputs()
  inputs.acquisitionManifest.entries[0].media.audioStreams[0].language = null
  assert.deepEqual(candidate(inputs).media.audioTracks[0].language, { state: 'unresolved' })
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

test('committed preboundary evidence matches the historical generation batch except superseded CB27', () => {
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
    const committed = JSON.parse(committedBytes)
    assert.doesNotThrow(() => validateVerifiedMedia(committed))
    assert.equal(committed.recordId, acquisitionEntry.recordId)
    assert.equal(committed.videoId, acquisitionEntry.videoId)
    if (candidate.videoId === 'cb_27') {
      assert.equal(candidate.sha256, LOCKED_OLD_CB27_EVIDENCE_SHA256)
      assert.equal(committed.torrent.infoHash, '5fe5242a34e76d24c012c4982caa19c41f1d40ff')
      assert.equal(committed.torrent.fileSelection.byteSize, 330517264)
      assert.equal(
        crypto.createHash('sha256').update(committedBytes).digest('hex'),
        LOCKED_CORRECTED_CB27_EVIDENCE_SHA256
      )
      assert.equal(committedBytes.equals(candidate.bytes), false)
    } else {
      assert.ok(committedBytes.equals(candidate.bytes), candidate.videoId)
      assert.equal(crypto.createHash('sha256').update(committedBytes).digest('hex'), candidate.sha256)
      assert.equal(committedBytes.length, candidate.byteSize)
    }
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

test('committed Concentrated August update evidence is byte-identical to selected acquisition generation', () => {
  const { acquisitionManifest, candidates } = concentratedAugustUpdateCandidates()
  assert.equal(acquisitionManifest.entries.length, 4)
  assert.deepEqual(candidates.map(({ videoId }) => videoId), ['cb_52', 'cb_53', 'cb_54'])
  assert.equal(candidates.some(({ videoId }) => videoId === 'cb_27'), false)

  for (const candidate of candidates) {
    const acquisitionEntry = acquisitionManifest.entries.find(({ videoId }) => videoId === candidate.videoId)
    assert.ok(acquisitionEntry)
    assert.equal(acquisitionEntry.recordId, candidate.recordId)
    const filename = path.join(PRODUCTION_EVIDENCE_DIRECTORY, candidate.filename)
    assert.equal(fs.existsSync(filename), true)
    const committedBytes = fs.readFileSync(filename)
    const committed = JSON.parse(committedBytes)
    assert.ok(committedBytes.equals(candidate.bytes), candidate.videoId)
    assert.equal(candidate.sha256, LOCKED_CONCENTRATED_AUGUST_UPDATE_EVIDENCE_SHA256[candidate.videoId])
    assert.equal(crypto.createHash('sha256').update(committedBytes).digest('hex'), candidate.sha256)
    assert.doesNotThrow(() => validateVerifiedMedia(committed))
    assert.equal(committed.recordId, acquisitionEntry.recordId)
    assert.equal(committed.videoId, acquisitionEntry.videoId)
    assert.equal(committed.torrent.infoHash, acquisitionEntry.torrent.infoHash)
    assert.equal(committed.torrent.fileSelection.filename, acquisitionEntry.torrent.payloadFilename)
    assert.equal(committed.torrent.fileSelection.byteSize, acquisitionEntry.torrent.payloadByteSize)
    assert.deepEqual(committed.media.audioTracks.map(({ language, codec, profile, channels, channelLayout }) => (
      { language, codec, profile, channels, channelLayout }
    )), [
      { language: 'Japanese', codec: 'AAC', profile: 'LC', channels: 2, channelLayout: 'stereo' },
      { language: 'English', codec: 'AAC', profile: 'LC', channels: 2, channelLayout: 'stereo' }
    ])
    assert.deepEqual(committed.media.subtitleTracks.map(({ language, title }) => ({ language, title })), [
      { language: 'English', title: candidate.videoId === 'cb_52' ? 'Full Subtitles [Edited ParanDakr]' : 'Full Subtitles [Edited ParanDark]' },
      { language: 'English', title: 'Signs and Songs [Edited ParanDark]' }
    ])
  }
})

test('corrected CB27 candidate is now the committed current evidence while old generation remains historical', () => {
  const currentBytes = fs.readFileSync(path.join(PRODUCTION_EVIDENCE_DIRECTORY, 'cb_27.json'))
  const current = JSON.parse(currentBytes)
  assert.equal(
    crypto.createHash('sha256').update(currentBytes).digest('hex'),
    LOCKED_CORRECTED_CB27_EVIDENCE_SHA256
  )
  assert.equal(current.torrent.infoHash, '5fe5242a34e76d24c012c4982caa19c41f1d40ff')
  assert.equal(current.torrent.fileSelection.byteSize, 330517264)

  const { acquisitionManifest, candidates } = concentratedAugustUpdateCandidates([
    { recordId: 'concentrated:27', videoId: 'cb_27' }
  ])
  assert.equal(candidates.length, 1)
  const acquisition = acquisitionManifest.entries.find(({ videoId }) => videoId === 'cb_27')
  const candidate = candidates[0]
  assert.ok(acquisition)
  assert.equal(candidate.sha256, LOCKED_CORRECTED_CB27_EVIDENCE_SHA256)
  assert.equal(candidate.value.torrent.infoHash, acquisition.torrent.infoHash)
  assert.equal(candidate.value.torrent.infoHash, '5fe5242a34e76d24c012c4982caa19c41f1d40ff')
  assert.equal(candidate.value.torrent.fileSelection.filename, '27 - memories in the rain2.mkv')
  assert.equal(candidate.value.torrent.fileSelection.byteSize, 330517264)
  assert.deepEqual(candidate.value.media.duration, {
    state: 'verified',
    measurement: 'container',
    seconds: 1886.593
  })
  assert.doesNotThrow(() => validateVerifiedMedia(candidate.value))
  assert.ok(candidate.bytes.equals(currentBytes))

  const historical = productionCandidates().candidates.find(({ videoId }) => videoId === 'cb_27')
  assert.ok(historical)
  assert.equal(historical.sha256, LOCKED_OLD_CB27_EVIDENCE_SHA256)
  assert.equal(historical.value.torrent.infoHash, '9054e185c9d61ad0d9e8795e45029d83b7ebd4ab')
  assert.equal(historical.value.torrent.fileSelection.byteSize, 330517255)
  assert.equal(historical.bytes.equals(currentBytes), false)
})

test('committed Hollowed evidence is byte-identical to its separate production generation batch', () => {
  const { acquisitionManifest, candidates } = hollowedProductionCandidates()
  const expectedVideoIds = HOLLOWED_SELECTION_ENTRIES.map(({ videoId }) => videoId)
  assert.equal(candidates.length, 38)
  assert.deepEqual(candidates.map(({ videoId }) => videoId), expectedVideoIds)
  assert.deepEqual(HOLLOWED_SELECTION_ENTRIES[0], { recordId: 'hollowed:14', videoId: 'hb_14' })
  assert.deepEqual(HOLLOWED_SELECTION_ENTRIES[16], { recordId: 'hollowed:0.8', videoId: 'hb_0p8' })
  assert.deepEqual(HOLLOWED_SELECTION_ENTRIES.at(-1), { recordId: 'hollowed:50', videoId: 'hb_50' })

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
    assert.deepEqual(committed.media.audioTracks, [{
      language: 'English',
      codec: 'AAC',
      profile: 'LC',
      channels: 2,
      channelLayout: 'stereo'
    }])
    assert.deepEqual(committed.media.subtitleTracks, [])
    assert.deepEqual(committed.torrent.networkEvidence, {
      trackers: { state: 'unresolved' },
      announceUrls: { state: 'unresolved' },
      webSeeds: { state: 'unresolved' }
    })
  }
})

test('committed HB36 evidence locks the corrected torrent identity', () => {
  const acquisitionManifest = readJsonFile(HOLLOWED_ACQUISITION_PATH)
  const acquisition = acquisitionManifest.entries.find(({ videoId }) => videoId === 'hb_36')
  const evidenceBytes = fs.readFileSync(path.join(PRODUCTION_EVIDENCE_DIRECTORY, 'hb_36.json'))
  const evidence = JSON.parse(evidenceBytes)
  const torrentBasis = evidence.verificationBases.find(({ kind }) => kind === 'local-torrent-verification')

  assert.ok(acquisition)
  assert.ok(torrentBasis)
  assert.equal(crypto.createHash('sha256').update(evidenceBytes).digest('hex'), LOCKED_HB36_EVIDENCE_SHA256)
  assert.equal(evidence.torrent.infoHash, acquisition.torrent.infoHash)
  assert.equal(torrentBasis.artifact.sha256, acquisition.torrent.torrentSha256)
  assert.deepEqual(torrentBasis.verification, {
    pieceLength: 1048576,
    pieceCount: 1210,
    verifiedPieces: 1210,
    mismatches: 0,
    rawInfoMatchesCanonicalEncoding: true,
    payloadFilenameMatchesLocalMedia: true,
    payloadByteSizeMatchesLocalMedia: true
  })
})

test('committed Hollowed evidence set matches its separate aggregate index lock', () => {
  let totalByteSize = 0
  const index = HOLLOWED_SELECTION_ENTRIES.map(({ recordId, videoId }) => {
    const filename = `${videoId}.json`
    const bytes = fs.readFileSync(path.join(PRODUCTION_EVIDENCE_DIRECTORY, filename))
    const committed = JSON.parse(bytes)
    assert.equal(committed.recordId, recordId)
    assert.equal(committed.videoId, videoId)
    assert.deepEqual(committed.media.subtitleTracks, [])
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
  const otherEvidenceIndexBytes = Buffer.from(JSON.stringify(
    index.filter(({ videoId }) => videoId !== 'hb_36')
  ))
  assert.equal(indexBytes.length, LOCKED_HOLLOWED_EVIDENCE_INDEX_BYTE_SIZE)
  assert.equal(totalByteSize, LOCKED_HOLLOWED_EVIDENCE_TOTAL_BYTE_SIZE)
  assert.equal(
    crypto.createHash('sha256').update(indexBytes).digest('hex'),
    LOCKED_HOLLOWED_EVIDENCE_INDEX_SHA256
  )
  assert.equal(
    crypto.createHash('sha256').update(otherEvidenceIndexBytes).digest('hex'),
    LOCKED_HOLLOWED_OTHER_EVIDENCE_INDEX_SHA256
  )
})

test('representative Hollowed verified-media facts retain exact physical observations', () => {
  const expected = {
    hb_14: ['hollowed:14', 'Hollowed Bleach 14 - The Slashing Opera (sub).mp4', 910624738, 1912.535625],
    hb_0p8: ['hollowed:0.8', 'Hollowed Bleach 29.5 (0.8) - a wonderful error (sub).mp4', 188759844, 377.610567],
    hb_34: ['hollowed:34', 'Hollowed Bleach 34 - The Deathbringer Numbers (sub).mp4', 1001959714, 2074.864458],
    hb_36: ['hollowed:36', 'Hollowed Bleach 36 - heart (sub).mp4', 1267992742, 2657.529875],
    hb_50: ['hollowed:50', 'Hollowed Bleach 50 - Bleach My Soul (sub).mp4', 788212493, 1650.649]
  }
  for (const [videoId, [recordId, filename, byteSize, durationSeconds]] of Object.entries(expected)) {
    const evidence = readJsonFile(path.join(PRODUCTION_EVIDENCE_DIRECTORY, `${videoId}.json`))
    assert.equal(evidence.recordId, recordId)
    assert.equal(evidence.torrent.fileSelection.filename, filename)
    assert.equal(evidence.torrent.fileSelection.byteSize, byteSize)
    assert.deepEqual(evidence.media.duration, {
      state: 'verified',
      measurement: 'container',
      seconds: durationSeconds
    })
    assert.deepEqual(evidence.media.subtitleTracks, [])
  }
})

test('committed Chipped evidence is byte-identical to deterministic acquisition generation', () => {
  const { acquisitionManifest, candidates } = chippedProductionCandidates()
  assert.equal(candidates.length, 12)
  assert.deepEqual(candidates.map(({ videoId }) => videoId), CHIPPED_SELECTION_ENTRIES.map(({ videoId }) => videoId))

  for (const candidate of candidates) {
    const acquisitionEntry = acquisitionManifest.entries.find(({ videoId }) => videoId === candidate.videoId)
    const committedBytes = fs.readFileSync(path.join(PRODUCTION_EVIDENCE_DIRECTORY, candidate.filename))
    const committed = JSON.parse(committedBytes)
    assert.ok(acquisitionEntry)
    assert.ok(committedBytes.equals(candidate.bytes), candidate.videoId)
    assert.equal(candidate.sha256, LOCKED_CHIPPED_EVIDENCE_SHA256[candidate.videoId])
    assert.equal(crypto.createHash('sha256').update(committedBytes).digest('hex'), candidate.sha256)
    assert.doesNotThrow(() => validateVerifiedMedia(committed))
    assert.equal(committed.recordId, acquisitionEntry.recordId)
    assert.equal(committed.torrent.infoHash, acquisitionEntry.torrent.infoHash)
    assert.equal(committed.torrent.infoHash, LOCKED_CHIPPED_INFO_HASHES[candidate.videoId])
    assert.equal(committed.torrent.fileSelection.fileIdx, 0)
    assert.equal(committed.torrent.fileSelection.filename, acquisitionEntry.torrent.payloadFilename)
    assert.equal(committed.torrent.fileSelection.byteSize, acquisitionEntry.torrent.payloadByteSize)
  }
})

test('Chipped evidence has a stable sorted combined identity vector', () => {
  const vector = Object.keys(LOCKED_CHIPPED_EVIDENCE_SHA256).sort().map((videoId) => ({
    videoId,
    sha256: crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(PRODUCTION_EVIDENCE_DIRECTORY, `${videoId}.json`)))
      .digest('hex')
  }))
  const vectorBytes = Buffer.from(`${JSON.stringify(vector, null, 2)}\n`)
  assert.equal(vectorBytes.length, 1362)
  assert.equal(
    crypto.createHash('sha256').update(vectorBytes).digest('hex'),
    LOCKED_CHIPPED_EVIDENCE_VECTOR_SHA256
  )
})

test('Chipped PCM tracks preserve stream order and nullable observations without inference', () => {
  for (const { videoId } of CHIPPED_SELECTION_ENTRIES.filter(({ videoId }) => videoId !== 'ch_10')) {
    const evidence = readJsonFile(path.join(PRODUCTION_EVIDENCE_DIRECTORY, `${videoId}.json`))
    assert.deepEqual(evidence.media.audioTracks, [
      { language: 'Japanese', codec: 'PCM', profile: null, channels: 2, channelLayout: null },
      { language: 'English', codec: 'PCM', profile: null, channels: 2, channelLayout: null }
    ])
  }
})

test('ch_10 preserves all three audio tracks and leaves its untagged AAC language unresolved', () => {
  const evidence = readJsonFile(path.join(PRODUCTION_EVIDENCE_DIRECTORY, 'ch_10.json'))
  assert.deepEqual(evidence.media.audioTracks, [
    { language: 'Japanese', codec: 'PCM', profile: null, channels: 2, channelLayout: null },
    { language: 'English', codec: 'PCM', profile: null, channels: 2, channelLayout: null },
    {
      language: { state: 'unresolved' },
      codec: 'AAC',
      profile: 'LC',
      channels: 2,
      channelLayout: 'stereo'
    }
  ])
})

test('ch_6 preserves measured container duration independently of editorial runtime', () => {
  const evidence = readJsonFile(path.join(PRODUCTION_EVIDENCE_DIRECTORY, 'ch_6.json'))
  const editorial = readJsonFile(path.join(REPOSITORY_ROOT, 'editorial', 'normalized', 'chipped.json'))
    .records.find(({ recordId }) => recordId === 'chipped:#06')
  assert.deepEqual(evidence.media.duration, {
    state: 'verified',
    measurement: 'container',
    seconds: 1504.128
  })
  assert.equal(editorial.runtime.seconds, 1534)
})
