'use strict'

const assert = require('node:assert/strict')
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

function acquisitionEntry(pair = PAIRS[0]) {
  const [recordId, videoId] = pair
  const marker = videoId === 'cb_2' ? '02' : '27.5'
  const filename = `${marker} - Synthetic.mkv`
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
