#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const { validateAcquisitionManifest } = require('./generate-acquisition-manifest')
const {
  jsonBytes,
  validateVerifiedMedia
} = require('./generate-stremio-data')

const repositoryRoot = path.resolve(__dirname, '..')
const NORMALIZED_PROJECT_IDS = Object.freeze(['concentrated', 'hollowed', 'chipped'])
const TORRENT_METHOD = 'canonical-bencode-v1-creation-and-independent-piece-verification'
const LOCAL_RETENTION = 'ignored-local-workspace'

class VerifiedMediaEvidenceGenerationError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'VerifiedMediaEvidenceGenerationError'
    this.generationCode = code
  }
}

function fail(code, message) {
  throw new VerifiedMediaEvidenceGenerationError(code, message)
}

function assertObject(value, label, code = 'invalid-input') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} must be an object`)
  }
}

function assertExactKeys(value, expected, label, code = 'invalid-input') {
  assertObject(value, label, code)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(code, `${label} has missing or unexpected fields`)
  }
}

function assertNonEmptyString(value, label, code = 'invalid-input') {
  if (typeof value !== 'string' || value.length === 0) {
    fail(code, `${label} must be a non-empty string`)
  }
}

function evidencePrefix(videoId) {
  assertNonEmptyString(videoId, 'videoId', 'invalid-evidence-id')
  const prefix = videoId.replaceAll('_', '')
  if (prefix.length === 0) fail('invalid-evidence-id', 'evidence prefix must not be empty')
  return prefix
}

function validateSelection({ selection, acquisitionManifest, normalizedRecords, registry }) {
  assertExactKeys(selection, ['schemaVersion', 'entries'], 'selection', 'invalid-selection')
  if (selection.schemaVersion !== 1) fail('invalid-selection', 'unsupported selection schemaVersion')
  if (!Array.isArray(selection.entries) || selection.entries.length === 0) {
    fail('selection-required', 'selection.entries must explicitly authorize at least one identity')
  }
  assertObject(registry, 'video-ID registry', 'invalid-identity-source')
  if (!Array.isArray(normalizedRecords) || !Array.isArray(registry.entries)) {
    fail('invalid-identity-source', 'identity sources must contain record and registry arrays')
  }

  const recordIds = new Set()
  const videoIds = new Set()
  const selected = selection.entries.map((entry, index) => {
    const label = `selection.entries[${index}]`
    assertExactKeys(entry, ['recordId', 'videoId'], label, 'invalid-selection')
    assertNonEmptyString(entry.recordId, `${label}.recordId`, 'invalid-selection')
    assertNonEmptyString(entry.videoId, `${label}.videoId`, 'invalid-selection')
    if (recordIds.has(entry.recordId) || videoIds.has(entry.videoId)) {
      fail('duplicate-selection', 'selection identities must be unique')
    }
    recordIds.add(entry.recordId)
    videoIds.add(entry.videoId)

    const records = normalizedRecords.filter((record) => record.recordId === entry.recordId)
    if (records.length !== 1) {
      fail('unknown-record-id', 'selection recordId is not one unique normalized default record')
    }
    const videoMatches = registry.entries.filter((candidate) => candidate.videoId === entry.videoId)
    if (videoMatches.length !== 1 || videoMatches[0].recordType !== 'normalized-record') {
      fail('unknown-video-id', 'selection videoId is not one unique normalized default-record identity')
    }
    const recordMatches = registry.entries.filter((candidate) => (
      candidate.recordId === entry.recordId && candidate.recordType === 'normalized-record'
    ))
    if (
      recordMatches.length !== 1 ||
      videoMatches[0].recordId !== entry.recordId ||
      recordMatches[0].videoId !== entry.videoId ||
      videoMatches[0].projectId !== records[0].projectId ||
      recordMatches[0].projectId !== records[0].projectId
    ) {
      fail('record-video-mismatch', 'selection recordId and videoId disagree with the permanent registry')
    }

    const acquisitionMatches = acquisitionManifest.entries.filter((candidate) => (
      candidate.videoId === entry.videoId && candidate.recordId === entry.recordId
    ))
    if (acquisitionMatches.length !== 1) {
      fail('selection-not-in-acquisition', 'selected identity is absent from the acquisition manifest')
    }
    return {
      recordId: entry.recordId,
      videoId: entry.videoId,
      registryIndex: registry.entries.indexOf(videoMatches[0]),
      acquisitionEntry: acquisitionMatches[0]
    }
  })

  selected.sort((left, right) => (
    left.registryIndex - right.registryIndex ||
    left.videoId.localeCompare(right.videoId) ||
    left.recordId.localeCompare(right.recordId)
  ))
  return selected
}

function normalizeVideo(media) {
  const ambiguous = media.videoStreams.filter(({ attachedPic }) => attachedPic === null)
  if (ambiguous.length > 0) {
    fail('ambiguous-primary-video', 'video attached-picture disposition is unresolved')
  }
  const ordinary = media.videoStreams.filter(({ attachedPic }) => attachedPic === 0)
  if (ordinary.length !== 1) {
    fail('invalid-primary-video-count', 'exactly one ordinary playback video is required')
  }
  const stream = ordinary[0]
  if (stream.codecName !== 'hevc') fail('unknown-video-codec', 'ordinary video codec is unsupported')
  assertNonEmptyString(stream.profile, 'ordinary video profile', 'missing-video-observation')
  assertNonEmptyString(stream.pixelFormat, 'ordinary video pixel format', 'missing-video-observation')
  if (!Number.isSafeInteger(stream.width) || stream.width <= 0) {
    fail('missing-video-observation', 'ordinary video width must be known')
  }
  if (!Number.isSafeInteger(stream.height) || stream.height <= 0) {
    fail('missing-video-observation', 'ordinary video height must be known')
  }
  return {
    codec: 'HEVC',
    standard: 'H.265',
    profile: stream.profile,
    width: stream.width,
    height: stream.height,
    pixelFormat: stream.pixelFormat
  }
}

function normalizeAudioTrack(stream, index) {
  const label = `audio stream[${index}]`
  if (stream.codecName !== 'aac') fail('unknown-audio-codec', `${label} codec is unsupported`)
  if (stream.language === null) fail('unresolved-audio-language', `${label} language must be known`)
  const languages = { jpn: 'Japanese', eng: 'English' }
  const language = languages[stream.language]
  if (!language) fail('unknown-audio-language', `${label} language is unsupported`)
  assertNonEmptyString(stream.profile, `${label} profile`, 'missing-audio-observation')
  assertNonEmptyString(stream.channelLayout, `${label} channel layout`, 'missing-audio-observation')
  if (!Number.isSafeInteger(stream.channels) || stream.channels <= 0) {
    fail('missing-audio-observation', `${label} channels must be known`)
  }
  return {
    language,
    codec: 'AAC',
    profile: stream.profile,
    channels: stream.channels,
    channelLayout: stream.channelLayout
  }
}

function normalizeSubtitleTrack(stream, index) {
  const label = `subtitle stream[${index}]`
  assertNonEmptyString(stream.title, `${label} title`, 'missing-subtitle-title')
  let language
  if (stream.language === null) {
    language = { state: 'unresolved' }
  } else if (stream.language === 'eng') {
    language = 'English'
  } else {
    fail('unknown-subtitle-language', `${label} language is unsupported`)
  }
  return {
    kind: 'embedded',
    language,
    title: stream.title
  }
}

function buildVerifiedMediaEvidence(acquisitionEntry) {
  assertObject(acquisitionEntry, 'acquisition entry', 'invalid-acquisition-entry')
  assertNonEmptyString(acquisitionEntry.recordId, 'acquisition recordId', 'invalid-acquisition-entry')
  assertNonEmptyString(acquisitionEntry.videoId, 'acquisition videoId', 'invalid-acquisition-entry')
  const durationSeconds = acquisitionEntry.media.container.durationSeconds
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    fail('missing-container-duration', 'acquisition container duration must be a positive finite number')
  }

  const prefix = evidencePrefix(acquisitionEntry.videoId)
  const torrentEvidenceId = `${prefix}-local-torrent-verification`
  const mediaEvidenceId = `${prefix}-local-media-ffprobe-inspection`
  if (torrentEvidenceId === mediaEvidenceId) fail('duplicate-evidence-id', 'generated evidence IDs must be unique')

  const candidate = {
    schemaVersion: 1,
    authorityDomain: 'verified-media',
    videoId: acquisitionEntry.videoId,
    recordId: acquisitionEntry.recordId,
    verificationState: 'verified',
    torrent: {
      infoHash: acquisitionEntry.torrent.infoHash,
      fileSelection: {
        fileIdx: acquisitionEntry.torrent.fileIdx,
        filename: acquisitionEntry.torrent.payloadFilename,
        byteSize: acquisitionEntry.torrent.payloadByteSize
      },
      networkEvidence: {
        trackers: { state: 'unresolved' },
        announceUrls: { state: 'unresolved' },
        webSeeds: { state: 'unresolved' }
      }
    },
    media: {
      duration: {
        state: 'verified',
        measurement: 'container',
        seconds: durationSeconds
      },
      video: normalizeVideo(acquisitionEntry.media),
      audioTracks: acquisitionEntry.media.audioStreams.map(normalizeAudioTrack),
      subtitleTracks: acquisitionEntry.media.subtitleStreams.map(normalizeSubtitleTrack)
    },
    verificationBases: [
      {
        evidenceId: torrentEvidenceId,
        kind: 'local-torrent-verification',
        verificationState: 'verified',
        method: TORRENT_METHOD,
        artifact: {
          relativePath: acquisitionEntry.torrent.relativePath,
          retention: LOCAL_RETENTION,
          sha256: acquisitionEntry.torrent.torrentSha256
        },
        verification: {
          pieceLength: acquisitionEntry.torrent.pieceLength,
          pieceCount: acquisitionEntry.torrent.pieceCount,
          verifiedPieces: acquisitionEntry.torrent.verifiedPieces,
          mismatches: acquisitionEntry.torrent.mismatchedPieces,
          rawInfoMatchesCanonicalEncoding: acquisitionEntry.torrent.rawInfoMatchesCanonicalEncoding,
          payloadFilenameMatchesLocalMedia: acquisitionEntry.torrent.payloadFilenameMatchesLocalMedia,
          payloadByteSizeMatchesLocalMedia: acquisitionEntry.torrent.payloadByteSizeMatchesLocalMedia
        }
      },
      {
        evidenceId: mediaEvidenceId,
        kind: 'local-media-inspection',
        method: 'ffprobe',
        verificationState: 'verified',
        artifact: {
          relativePath: acquisitionEntry.media.relativePath,
          retention: LOCAL_RETENTION,
          byteSize: acquisitionEntry.media.byteSize
        }
      }
    ],
    fieldEvidence: {
      '/torrent/infoHash': [torrentEvidenceId],
      '/torrent/fileSelection/fileIdx': [torrentEvidenceId],
      '/torrent/fileSelection/filename': [torrentEvidenceId],
      '/torrent/fileSelection/byteSize': [torrentEvidenceId],
      '/media/duration': [mediaEvidenceId],
      '/media/video/codec': [mediaEvidenceId],
      '/media/video/standard': [mediaEvidenceId],
      '/media/video/profile': [mediaEvidenceId],
      '/media/video/width': [mediaEvidenceId],
      '/media/video/height': [mediaEvidenceId],
      '/media/video/pixelFormat': [mediaEvidenceId],
      '/media/audioTracks': [mediaEvidenceId],
      '/media/subtitleTracks': [mediaEvidenceId]
    }
  }
  validateVerifiedMedia(candidate)
  return candidate
}

function generateEvidenceCandidates({ acquisitionManifest, selection, normalizedRecords, registry }) {
  validateAcquisitionManifest(acquisitionManifest)
  const selected = validateSelection({ selection, acquisitionManifest, normalizedRecords, registry })
  const evidenceIds = new Set()
  const candidates = selected.map(({ recordId, videoId, acquisitionEntry }) => {
    const value = buildVerifiedMediaEvidence(acquisitionEntry)
    for (const basis of value.verificationBases) {
      if (evidenceIds.has(basis.evidenceId)) fail('duplicate-evidence-id', 'generated evidence IDs must be unique')
      evidenceIds.add(basis.evidenceId)
    }
    const bytes = jsonBytes(value)
    return {
      recordId,
      videoId,
      filename: `${videoId}.json`,
      value,
      bytes,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      byteSize: bytes.length
    }
  })
  return candidates
}

function resolveOutputDirectory(outputDirectory) {
  assertNonEmptyString(outputDirectory, 'output directory', 'invalid-output-directory')
  if (outputDirectory.includes('\0')) fail('invalid-output-directory', 'output directory contains a null byte')
  let canonical
  try {
    canonical = fs.realpathSync(path.resolve(outputDirectory))
  } catch {
    fail('missing-output-directory', 'output directory does not exist')
  }
  let stats
  try {
    stats = fs.statSync(canonical)
  } catch {
    fail('invalid-output-directory', 'output directory is not readable')
  }
  if (!stats.isDirectory()) fail('invalid-output-directory', 'output path must be a directory')
  return canonical
}

function outputPath(directory, filename) {
  if (
    typeof filename !== 'string' || filename.length === 0 || filename.includes('\0') ||
    path.posix.basename(filename) !== filename || path.win32.basename(filename) !== filename ||
    !/^[a-z0-9_]+\.json$/u.test(filename)
  ) {
    fail('invalid-output-filename', 'candidate filename must be one safe JSON basename')
  }
  return path.join(directory, filename)
}

function reportEntry(candidate, state, error) {
  const entry = {
    recordId: candidate.recordId,
    videoId: candidate.videoId,
    state
  }
  if (error !== undefined) entry.error = error
  entry.filename = candidate.filename
  entry.sha256 = candidate.sha256
  entry.byteSize = candidate.byteSize
  return entry
}

function generationReport(entries) {
  return {
    schemaVersion: 1,
    reportKind: 'verified-media-evidence-generation',
    summary: {
      total: entries.length,
      created: entries.filter(({ state }) => state === 'created').length,
      alreadyIdentical: entries.filter(({ state }) => state === 'already-identical').length,
      failed: entries.filter(({ state }) => state === 'failed').length
    },
    entries
  }
}

function writeEvidenceCandidates({ candidates, outputDirectory }) {
  const directory = resolveOutputDirectory(outputDirectory)
  const preflight = candidates.map((candidate) => {
    const target = outputPath(directory, candidate.filename)
    if (!fs.existsSync(target)) return { candidate, target, state: 'created' }
    let stats
    let existing
    try {
      stats = fs.lstatSync(target)
      if (!stats.isFile() || stats.isSymbolicLink()) {
        return { candidate, target, state: 'failed', error: 'output-conflict' }
      }
      existing = fs.readFileSync(target)
    } catch {
      return { candidate, target, state: 'failed', error: 'output-conflict' }
    }
    return existing.equals(candidate.bytes)
      ? { candidate, target, state: 'already-identical' }
      : { candidate, target, state: 'failed', error: 'output-conflict' }
  })

  if (preflight.some(({ state }) => state === 'failed')) {
    return generationReport(preflight.map(({ candidate, state, error }) => (
      state === 'created'
        ? reportEntry(candidate, 'failed', 'batch-aborted')
        : reportEntry(candidate, state, error)
    )))
  }

  const entries = []
  for (const item of preflight) {
    if (item.state === 'created') {
      try {
        fs.writeFileSync(item.target, item.candidate.bytes, { flag: 'wx' })
      } catch {
        entries.push(reportEntry(item.candidate, 'failed', 'output-conflict'))
        continue
      }
    }
    entries.push(reportEntry(item.candidate, item.state))
  }
  return generationReport(entries)
}

function reportExitCode(report) {
  return report.summary.failed === 0 ? 0 : 1
}

function parseArguments(argv) {
  if (
    argv.length !== 6 ||
    argv[0] !== '--acquisition-manifest' ||
    argv[2] !== '--selection' ||
    argv[4] !== '--output-directory' ||
    argv.some((value, index) => index % 2 === 1 && (typeof value !== 'string' || value.length === 0))
  ) {
    fail(
      'invalid-arguments',
      'usage: generate-verified-media-evidence.js --acquisition-manifest <manifest-json> --selection <selection-json> --output-directory <directory>'
    )
  }
  return {
    acquisitionManifestPath: argv[1],
    selectionPath: argv[3],
    outputDirectory: argv[5]
  }
}

function readJson(filename, label) {
  try {
    return JSON.parse(fs.readFileSync(filename, 'utf8'))
  } catch {
    fail('invalid-json', `${label} is not readable valid JSON`)
  }
}

function readNormalizedRecords() {
  return NORMALIZED_PROJECT_IDS.flatMap((projectId) => readJson(
    path.join(repositoryRoot, 'editorial', 'normalized', `${projectId}.json`),
    `normalized ${projectId} records`
  ).records)
}

function emitReport(report, output = process.stdout) {
  output.write(`${JSON.stringify(report, null, 2)}\n`)
}

function main() {
  try {
    const args = parseArguments(process.argv.slice(2))
    const candidates = generateEvidenceCandidates({
      acquisitionManifest: readJson(path.resolve(process.cwd(), args.acquisitionManifestPath), 'acquisition manifest'),
      selection: readJson(path.resolve(process.cwd(), args.selectionPath), 'selection'),
      normalizedRecords: readNormalizedRecords(),
      registry: readJson(
        path.join(repositoryRoot, 'projection', 'stremio', 'video-id-registry.json'),
        'video-ID registry'
      )
    })
    const report = writeEvidenceCandidates({ candidates, outputDirectory: args.outputDirectory })
    emitReport(report)
    process.exitCode = reportExitCode(report)
  } catch (error) {
    const code = error instanceof VerifiedMediaEvidenceGenerationError
      ? error.generationCode
      : 'candidate-validation-failed'
    emitReport(generationReport([]))
    process.stderr.write(`verified-media evidence generation failed: ${code}\n`)
    process.exitCode = 1
  }
}

if (require.main === module) main()

module.exports = {
  LOCAL_RETENTION,
  TORRENT_METHOD,
  VerifiedMediaEvidenceGenerationError,
  buildVerifiedMediaEvidence,
  evidencePrefix,
  generateEvidenceCandidates,
  jsonBytes,
  parseArguments,
  reportExitCode,
  validateSelection,
  writeEvidenceCandidates
}
