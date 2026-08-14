#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { validate: validateEditorial } = require('./validate-editorial')
const { validatePublicationPrefix } = require('./validate-publication-prefix')

const root = path.resolve(__dirname, '..')

const SERIES_POLICY = Object.freeze({
  seriesId: 'bleach-manga-cut',
  name: 'Bleach Manga Cut',
  type: 'series',
  genres: Object.freeze(['Animation', 'Anime']),
  originalLanguage: 'Japanese',
  bingeGroup: 'bleach-manga-cut|p2p|standard',
  presentation: Object.freeze({
    streamNamePrefix: '[P2P🧲]',
    streamTitleFormat: 'four-line-emoji-v1',
    streamSources: Object.freeze([]),
    embeddedSubtitlesBecomeExternalUrls: false,
    runtimeRounding: 'floor-whole-minutes',
    resolutionLabelFormat: 'verified-height-p',
    megabyteDivisor: 1000000,
    megabyteDigits: 2,
    languageCodes: Object.freeze({
      Japanese: 'JPN',
      English: 'ENG',
      Spanish: 'SPA'
    })
  }),
  json: Object.freeze({
    indentation: 2,
    newline: '\n',
    trailingNewline: true
  })
})

const PROJECT_INPUTS = Object.freeze({
  concentrated: Object.freeze({
    normalized: 'editorial/normalized/concentrated.json',
    extracted: 'editorial/extracted/concentrated.json'
  }),
  hollowed: Object.freeze({
    normalized: 'editorial/normalized/hollowed.json',
    extracted: 'editorial/extracted/hollowed.json'
  }),
  chipped: Object.freeze({
    normalized: 'editorial/normalized/chipped.json',
    extracted: 'editorial/extracted/chipped.json'
  })
})

// These paths and expectations are intentionally CB1-specific regression logic.
// They never provide values to candidate construction.
const CB1_REGRESSION_FILES = Object.freeze({
  catalog: 'data/catalog/bleach-manga-cut.json',
  meta: 'data/meta/bleach-manga-cut.json',
  stream: 'data/stream/cb_1.json',
  provenance: 'data/provenance/cb_1.json'
})
const CB2_REGRESSION_FILES = Object.freeze({
  stream: 'data/stream/cb_2.json',
  provenance: 'data/provenance/cb_2.json'
})
const BYTE_IDENTICAL_REGRESSION_FILES = Object.freeze([
  CB1_REGRESSION_FILES.stream,
  CB2_REGRESSION_FILES.stream,
  CB2_REGRESSION_FILES.provenance
])

const missing = () => ({ state: 'missing' })
const present = (value) => ({ state: 'present', value })
const addDiff = (pointer, value) => ({ pointer, operation: 'add', old: missing(), new: present(value) })
const removeDiff = (pointer, value) => ({ pointer, operation: 'remove', old: present(value), new: missing() })
const replaceDiff = (pointer, oldValue, newValue) => ({
  pointer,
  operation: 'replace',
  old: present(oldValue),
  new: present(newValue)
})

// Exact CB1 provenance migration contract. Every approved leaf has an operation
// and exact before/after state. No candidate value is sourced from this contract.
const EXPECTED_PROVENANCE_DIFF_CONTRACT = Object.freeze([
  addDiff('/sourceInputs/editorial/evidenceRefs/0', 'concentrated-xlsx:episode-list:A2'),
  addDiff('/sourceInputs/editorial/evidenceRefs/1', 'concentrated-xlsx:episode-list:B2'),
  addDiff('/sourceInputs/editorial/evidenceRefs/2', 'concentrated-xlsx:episode-list:C2'),
  addDiff('/sourceInputs/editorial/evidenceRefs/3', 'concentrated-xlsx:episode-list:D2'),
  addDiff('/sourceInputs/editorial/evidenceRefs/4', 'concentrated-xlsx:episode-list:E2'),
  addDiff('/sourceInputs/editorial/evidenceRefs/5', 'concentrated-xlsx:episode-list:F2'),
  addDiff('/sourceInputs/editorial/evidenceRefs/6', 'concentrated-xlsx:episode-list:G2'),
  addDiff('/sourceInputs/editorial/evidenceRefs/7', 'concentrated-xlsx:episode-list:H2'),
  addDiff('/sourceInputs/editorial/recordId', 'concentrated:01'),
  addDiff('/sourceInputs/projection/projectedPlacement/episode', 1),
  addDiff('/sourceInputs/projection/projectedPlacement/season', 1),
  addDiff('/sourceInputs/projection/publicationEligibility/gateSet', 'locked-cb1'),
  addDiff('/sourceInputs/projection/publicationEligibility/state', 'eligible'),
  addDiff('/sourceInputs/projection/seriesId', 'bleach-manga-cut'),
  addDiff('/sourceInputs/projection/videoId', 'cb_1'),
  addDiff('/sourceInputs/verifiedMedia/evidenceRecord', 'evidence/media/cb_1.json'),
  addDiff('/sourceInputs/verifiedMedia/recordId', 'concentrated:01'),
  addDiff('/sourceInputs/verifiedMedia/verificationBases/0', 'cb1-torrent-metadata-inspection'),
  addDiff('/sourceInputs/verifiedMedia/verificationBases/1', 'cb1-local-media-ffprobe-inspection'),
  addDiff('/sourceInputs/verifiedMedia/verificationState', 'verified'),
  addDiff('/sourceInputs/verifiedMedia/videoId', 'cb_1'),
  replaceDiff('/editorial/episode', 1, '01'),
  removeDiff('/status/confirmed/0', 'CB1 editorial metadata'),
  removeDiff('/status/confirmed/1', 'infoHash'),
  removeDiff('/status/confirmed/2', 'fileIdx'),
  removeDiff('/status/confirmed/3', 'filename'),
  removeDiff('/status/confirmed/4', 'videoSize'),
  removeDiff('/status/confirmed/5', 'absence of torrent trackers'),
  removeDiff('/status/confirmed/6', 'local media video and audio metadata from ffprobe'),
  removeDiff('/status/confirmed/7', 'embedded subtitle metadata from ffprobe'),
  removeDiff('/status/confirmed/8', 'Stremio catalog/meta/stream structure'),
  removeDiff('/status/experiment/0', 'whether TorBox has this infoHash cached'),
  removeDiff('/status/experiment/1', 'Nuvio playback'),
  removeDiff('/status/experiment/2', 'seek/resume'),
  removeDiff('/status/experiment/3', 'Continue Watching'),
  removeDiff('/status/provisional/0', 'manifest/catalog/video identifier choices'),
  removeDiff('/status/provisional/1', 'display formatting'),
  removeDiff('/status/provisional/2', 'bingeGroup'),
  removeDiff('/status/provisional/3', 'runtime rounding to 18'),
  removeDiff('/status/unresolved/0', 'publicly reachable torrent swarm/source for CB1 if TorBox does not already cache this hash'),
  removeDiff('/status/unresolved/1', 'artwork'),
  removeDiff('/status/unresolved/2', 'full-series ordering/model'),
  removeDiff('/status/unresolved/3', 'every episode after CB1'),
  addDiff('/torrentEvidence/announceEvidence/state', 'unresolved'),
  removeDiff('/torrentEvidence/evidenceFile', '01 - Death and Strawberry.mkv.torrent'),
  removeDiff('/torrentEvidence/fileCount', 1),
  removeDiff('/torrentEvidence/hasAnnounceList', false),
  removeDiff('/torrentEvidence/hasAnnounceTracker', false),
  removeDiff('/torrentEvidence/hasWebSeed', false),
  removeDiff('/torrentEvidence/publicSwarmAvailability', 'not verified'),
  removeDiff('/torrentEvidence/torBoxCacheAvailability', 'not verified'),
  addDiff('/torrentEvidence/trackerEvidence/state', 'unresolved'),
  addDiff('/torrentEvidence/webSeedEvidence/state', 'unresolved'),
  addDiff('/transformations/audioPresentation', 'verified AAC LC, 2 channels/stereo -> AAC 2.0'),
  addDiff('/transformations/embeddedSubtitlePolicy', 'Verified embedded subtitle tracks remain provenance only; no external subtitle URLs are generated.'),
  addDiff('/transformations/languagePresentation', 'Japanese + English -> JPN + ENG'),
  addDiff('/transformations/resolutionLabel', 'verified height 576 -> 576p'),
  addDiff('/transformations/sizePresentation', '186522416 bytes / 1000000, fixed to two decimals -> 186.52 MB'),
  addDiff('/transformations/streamSources', '[] is emitted by locked series presentation policy and is not a torrent tracker/announce/web-seed evidence claim.'),
  addDiff('/transformations/stremioRuntime', '18:15 (1095 seconds) -> floor whole minutes -> 18')
].sort(compareDiffs))

function loadJson(relativePath, base = root) {
  return JSON.parse(fs.readFileSync(path.join(base, relativePath), 'utf8'))
}

function jsonBytes(value) {
  const formatted = JSON.stringify(value, null, SERIES_POLICY.json.indentation)
  return Buffer.from(SERIES_POLICY.json.trailingNewline
    ? `${formatted}${SERIES_POLICY.json.newline}`
    : formatted)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function assertExactKeys(value, keys, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} contains missing or unknown fields`)
}

function assertNonEmptyString(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`)
  assert.ok(value.length > 0, `${label} must not be empty`)
}

function assertUnresolved(value, label) {
  assertExactKeys(value, ['state'], label)
  assert.equal(value.state, 'unresolved', `${label} must remain unresolved`)
}

function validateMediaDuration(duration) {
  assert.ok(duration && typeof duration === 'object' && !Array.isArray(duration), 'media duration must be an object')
  if (duration.state === 'unresolved') {
    assertUnresolved(duration, 'media duration')
    return
  }
  assertExactKeys(duration, ['state', 'measurement', 'seconds'], 'media duration')
  assert.equal(duration.state, 'verified', 'media duration state is unsupported')
  assert.equal(duration.measurement, 'container', 'verified media duration must be a container measurement')
  assert.ok(Number.isFinite(duration.seconds) && duration.seconds > 0, 'verified media duration seconds must be finite and positive')
}

function assertRelativeArtifactPath(value, label) {
  assertNonEmptyString(value, label)
  assert.equal(path.posix.isAbsolute(value), false, `${label} must be relative`)
  assert.equal(path.win32.isAbsolute(value), false, `${label} must be relative`)
}

function validateVerificationBasis(basis, label) {
  assertNonEmptyString(basis.evidenceId, `${label}.evidenceId`)
  assert.equal(basis.verificationState, 'verified')
  if (basis.kind === 'manually-verified-existing-torrent-evidence') {
    assertExactKeys(basis, ['evidenceId', 'kind', 'verificationState', 'attestation'], label)
    assertExactKeys(basis.attestation, [
      'scope',
      'retainedOriginalArtifact',
      'repositoryOnlyReproduction'
    ], `${label}.attestation`)
    assertNonEmptyString(basis.attestation.scope, `${label}.attestation.scope`)
    assert.equal(basis.attestation.retainedOriginalArtifact, 'not-present-in-repository')
    assert.equal(basis.attestation.repositoryOnlyReproduction, 'unavailable')
    return
  }
  if (basis.kind === 'local-torrent-verification') {
    assertExactKeys(basis, [
      'evidenceId',
      'kind',
      'verificationState',
      'method',
      'artifact',
      'verification'
    ], label)
    assertNonEmptyString(basis.method, `${label}.method`)

    assertExactKeys(basis.artifact, ['relativePath', 'retention', 'sha256'], `${label}.artifact`)
    assertRelativeArtifactPath(basis.artifact.relativePath, `${label}.artifact.relativePath`)
    assert.equal(basis.artifact.retention, 'ignored-local-workspace')
    assert.match(basis.artifact.sha256, /^[0-9a-f]{64}$/, `${label}.artifact.sha256 must be lowercase SHA-256`)

    const verificationKeys = [
      'pieceLength',
      'pieceCount',
      'verifiedPieces',
      'mismatches',
      'rawInfoMatchesCanonicalEncoding',
      'payloadFilenameMatchesLocalMedia',
      'payloadByteSizeMatchesLocalMedia'
    ]
    assertExactKeys(basis.verification, verificationKeys, `${label}.verification`)
    assert.ok(Number.isSafeInteger(basis.verification.pieceLength) && basis.verification.pieceLength > 0, `${label}.verification.pieceLength must be positive`)
    assert.ok(Number.isSafeInteger(basis.verification.pieceCount) && basis.verification.pieceCount > 0, `${label}.verification.pieceCount must be positive`)
    assert.equal(basis.verification.verifiedPieces, basis.verification.pieceCount, `${label}.verification must verify every piece`)
    assert.equal(basis.verification.mismatches, 0, `${label}.verification must have zero mismatches`)
    assert.equal(basis.verification.rawInfoMatchesCanonicalEncoding, true)
    assert.equal(basis.verification.payloadFilenameMatchesLocalMedia, true)
    assert.equal(basis.verification.payloadByteSizeMatchesLocalMedia, true)
    return
  }
  assert.equal(basis.kind, 'local-media-inspection', `${label}.kind is unsupported`)
  const keys = ['evidenceId', 'kind', 'method', 'verificationState']
  if ('artifact' in basis) keys.push('artifact')
  assertExactKeys(basis, keys, label)
  assertNonEmptyString(basis.method, `${label}.method`)
  if ('artifact' in basis) {
    assertExactKeys(basis.artifact, ['relativePath', 'retention', 'byteSize'], `${label}.artifact`)
    assertRelativeArtifactPath(basis.artifact.relativePath, `${label}.artifact.relativePath`)
    assert.equal(basis.artifact.retention, 'ignored-local-workspace')
    assert.ok(Number.isSafeInteger(basis.artifact.byteSize) && basis.artifact.byteSize > 0, `${label}.artifact.byteSize must be positive`)
  }
}

function validateVerifiedMedia(evidence) {
  assertExactKeys(evidence, [
    'schemaVersion',
    'authorityDomain',
    'videoId',
    'recordId',
    'verificationState',
    'torrent',
    'media',
    'verificationBases',
    'fieldEvidence'
  ], 'verified-media record')
  assert.equal(evidence.schemaVersion, 1)
  assert.equal(evidence.authorityDomain, 'verified-media')
  assert.match(evidence.videoId, /^(?:cb_[0-9]+(?:p[0-9]+)?|hb_[0-9]+(?:p[0-9]+)?|ch_[0-9]+|hb_ex_[0-9]+)$/)
  assertNonEmptyString(evidence.recordId, 'recordId')
  assert.equal(evidence.verificationState, 'verified')

  assertExactKeys(evidence.torrent, ['infoHash', 'fileSelection', 'networkEvidence'], 'torrent')
  assert.match(evidence.torrent.infoHash, /^[0-9a-f]{40}$/, 'infoHash must be a verified lowercase v1 hash')
  assert.equal('sources' in evidence.torrent, false, 'Stremio sources must not be modeled as torrent evidence')

  const selection = evidence.torrent.fileSelection
  assertExactKeys(selection, ['fileIdx', 'filename', 'byteSize'], 'torrent.fileSelection')
  assert.ok(Number.isInteger(selection.fileIdx) && selection.fileIdx >= 0, 'fileIdx must be known')
  assertNonEmptyString(selection.filename, 'verified filename')
  assert.ok(Number.isSafeInteger(selection.byteSize) && selection.byteSize > 0, 'verified byte size must be known')

  assertExactKeys(evidence.torrent.networkEvidence, ['trackers', 'announceUrls', 'webSeeds'], 'torrent.networkEvidence')
  assertUnresolved(evidence.torrent.networkEvidence.trackers, 'tracker evidence')
  assertUnresolved(evidence.torrent.networkEvidence.announceUrls, 'announce evidence')
  assertUnresolved(evidence.torrent.networkEvidence.webSeeds, 'web-seed evidence')

  assertExactKeys(evidence.media, ['duration', 'video', 'audioTracks', 'subtitleTracks'], 'media')
  validateMediaDuration(evidence.media.duration)
  assertExactKeys(evidence.media.video, [
    'codec',
    'standard',
    'profile',
    'width',
    'height',
    'pixelFormat'
  ], 'media.video')
  for (const key of ['codec', 'standard', 'profile', 'pixelFormat']) {
    assertNonEmptyString(evidence.media.video[key], `media.video.${key}`)
  }
  assert.ok(Number.isInteger(evidence.media.video.width) && evidence.media.video.width > 0, 'video width must be known')
  assert.ok(Number.isInteger(evidence.media.video.height) && evidence.media.video.height > 0, 'video height must be known')

  assert.ok(Array.isArray(evidence.media.audioTracks) && evidence.media.audioTracks.length > 0, 'audio tracks must be known')
  for (const [index, track] of evidence.media.audioTracks.entries()) {
    assertExactKeys(track, ['language', 'codec', 'profile', 'channels', 'channelLayout'], `audioTracks[${index}]`)
    for (const key of ['language', 'codec', 'profile', 'channelLayout']) {
      assertNonEmptyString(track[key], `audioTracks[${index}].${key}`)
    }
    assert.ok(Number.isInteger(track.channels) && track.channels > 0, `audioTracks[${index}].channels must be known`)
  }

  assert.ok(Array.isArray(evidence.media.subtitleTracks), 'subtitleTracks must be an array')
  for (const [index, track] of evidence.media.subtitleTracks.entries()) {
    assertExactKeys(track, ['kind', 'language', 'title'], `subtitleTracks[${index}]`)
    assert.equal(track.kind, 'embedded')
    assertNonEmptyString(track.language, `subtitleTracks[${index}].language`)
    assertNonEmptyString(track.title, `subtitleTracks[${index}].title`)
  }

  assert.ok(Array.isArray(evidence.verificationBases) && evidence.verificationBases.length > 0)
  const basisById = new Map()
  for (const [index, basis] of evidence.verificationBases.entries()) {
    validateVerificationBasis(basis, `verificationBases[${index}]`)
    assert.ok(!basisById.has(basis.evidenceId), `duplicate verification basis ${basis.evidenceId}`)
    basisById.set(basis.evidenceId, basis)
  }

  const requiredEvidencePointers = [
    '/torrent/infoHash',
    '/torrent/fileSelection/fileIdx',
    '/torrent/fileSelection/filename',
    '/torrent/fileSelection/byteSize',
    '/media/video/codec',
    '/media/video/standard',
    '/media/video/profile',
    '/media/video/width',
    '/media/video/height',
    '/media/video/pixelFormat',
    '/media/audioTracks',
    '/media/subtitleTracks'
  ]
  if (evidence.media.duration.state === 'verified') requiredEvidencePointers.push('/media/duration')
  assertExactKeys(evidence.fieldEvidence, requiredEvidencePointers, 'fieldEvidence')
  for (const [pointer, refs] of Object.entries(evidence.fieldEvidence)) {
    assert.ok(Array.isArray(refs) && refs.length > 0, `${pointer} requires technical provenance`)
    assert.equal(new Set(refs).size, refs.length, `${pointer} repeats an evidence reference`)
    for (const ref of refs) assert.ok(basisById.has(ref), `${pointer} references unknown evidence ${ref}`)
  }
  if (evidence.media.duration.state === 'verified') {
    for (const ref of evidence.fieldEvidence['/media/duration']) {
      assert.equal(
        basisById.get(ref).kind,
        'local-media-inspection',
        '/media/duration must cite local-media inspection evidence'
      )
    }
  }
}

function assertNoPrivateOrNetworkMaterial(documents) {
  const forbiddenKey = /^(?:apiKey|token|accessToken|authorization|credential|password|privateUrl|playbackUrl|resolvedUrl|clientResolve|manifestUrl)$/i
  const forbiddenValue = /(?:https?:\/\/[^\s]*torbox|\bbearer\s+[a-z0-9._~-]+|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b)/i
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        assert.doesNotMatch(key, forbiddenKey, `private material key is forbidden: ${key}`)
        visit(child)
      }
      return
    }
    if (typeof value === 'string') assert.doesNotMatch(value, forbiddenValue, 'private TorBox or token material is forbidden')
  }
  documents.forEach(visit)
}

function buildExtractedEvidenceIndex(extractedDocument) {
  const index = new Map()
  for (const sheet of extractedDocument.sheets || []) {
    for (const cell of sheet.cells || []) index.set(cell.evidenceId, cell)
  }
  for (const page of extractedDocument.pages || []) index.set(page.evidenceId, page)
  return index
}

function loadProjectInputs() {
  const projects = new Map()
  for (const [projectId, paths] of Object.entries(PROJECT_INPUTS)) {
    const normalized = loadJson(paths.normalized)
    const extracted = loadJson(paths.extracted)
    assert.equal(normalized.project.projectId, projectId)
    const recordsById = new Map()
    for (const record of normalized.records) {
      assert.equal(record.projectId, projectId)
      assert.ok(!recordsById.has(record.recordId), `duplicate normalized record ${record.recordId}`)
      recordsById.set(record.recordId, record)
    }
    projects.set(projectId, {
      project: normalized.project,
      recordsById,
      evidenceById: buildExtractedEvidenceIndex(extracted)
    })
  }
  return projects
}

function loadEvidenceRecords() {
  const directory = path.join(root, 'evidence', 'media')
  const records = fs.readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({
      relativePath: `evidence/media/${name}`,
      value: loadJson(`evidence/media/${name}`)
    }))
  for (const record of records) validateVerifiedMedia(record.value)
  assert.equal(new Set(records.map((record) => record.value.videoId)).size, records.length, 'duplicate media evidence video IDs')
  assert.equal(new Set(records.map((record) => record.value.recordId)).size, records.length, 'duplicate media evidence record IDs')
  return records
}

function validateProjectionInputs(projection, registry, optional, evidenceRecords) {
  assert.equal(projection.series.id, SERIES_POLICY.seriesId)
  assert.equal(projection.series.type, SERIES_POLICY.type)
  return validatePublicationPrefix({
    projection,
    registry,
    optional,
    evidenceRecords
  }).eligibleEntries
}

function selectedEditorialEvidence(record, evidenceById) {
  const evidenceIds = [...new Set(Object.values(record.fieldEvidence).flat())]
  const evidenceItems = evidenceIds.map((evidenceId) => {
    const item = evidenceById.get(evidenceId)
    assert.ok(item, `${record.recordId} references missing editorial evidence ${evidenceId}`)
    return item
  })
  return evidenceItems.sort(compareEditorialEvidence)
}

function compareEditorialEvidence(left, right) {
  const leftLocator = left.locator
  const rightLocator = right.locator
  return String(left.source.filename).localeCompare(String(right.source.filename)) ||
    String(leftLocator.sheet || '').localeCompare(String(rightLocator.sheet || '')) ||
    Number(leftLocator.row || leftLocator.page || 0) - Number(rightLocator.row || rightLocator.page || 0) ||
    String(leftLocator.cell || '').localeCompare(String(rightLocator.cell || ''), undefined, { numeric: true })
}

function resolveEligibleRecords({ eligibleEntries, registry, projects, evidenceRecords }) {
  return eligibleEntries.map((entry) => {
    assertNonEmptyString(entry.recordId, 'eligible recordId')
    assertNonEmptyString(entry.projectId, `${entry.recordId}.projectId`)
    assertNonEmptyString(entry.videoId, `${entry.recordId}.videoId`)
    assert.equal(entry.projectedPlacement.seriesId, SERIES_POLICY.seriesId)
    assert.ok(Number.isInteger(entry.projectedPlacement.season) && entry.projectedPlacement.season >= 0)
    assert.ok(Number.isInteger(entry.projectedPlacement.episode) && entry.projectedPlacement.episode >= 0)

    const registryMatches = registry.entries.filter((registered) => registered.videoId === entry.videoId)
    assert.equal(registryMatches.length, 1, `${entry.videoId} must have exactly one registry entry`)
    const registryEntry = registryMatches[0]
    assert.equal(registryEntry.recordId, entry.recordId, `${entry.videoId} registry recordId mismatch`)
    assert.equal(registryEntry.projectId, entry.projectId, `${entry.videoId} registry projectId mismatch`)
    assert.equal(registryEntry.status, 'published', `${entry.videoId} must be published in the registry`)

    const projectInput = projects.get(entry.projectId)
    assert.ok(projectInput, `unknown normalized project ${entry.projectId}`)
    const editorialRecord = projectInput.recordsById.get(entry.recordId)
    assert.ok(editorialRecord, `missing normalized record ${entry.recordId}`)
    assert.equal(editorialRecord.projectId, entry.projectId)
    assert.equal(editorialRecord.recordId, registryEntry.recordId)
    assert.equal(typeof editorialRecord.sourceIdentifier.raw, 'string')
    assert.equal(typeof editorialRecord.sourceIdentifier.displayed, 'string')
    assert.equal(editorialRecord.title, entry.title, `${entry.recordId} title differs from projection`)
    assert.equal(editorialRecord.availability, 'released', `${entry.recordId} is not released`)
    assert.equal(editorialRecord.generatable, true, `${entry.recordId} is not editorially generatable`)
    assert.equal(editorialRecord.runtime.state, 'known', `${entry.recordId} lacks known editorial runtime`)

    const mediaMatches = evidenceRecords.filter(({ value }) =>
      value.videoId === entry.videoId && value.recordId === entry.recordId
    )
    assert.equal(mediaMatches.length, 1, `${entry.videoId} must have exactly one matching verified-media record`)
    const mediaEvidence = mediaMatches[0]
    assert.equal(mediaEvidence.value.videoId, entry.videoId, 'verified-media videoId mismatch')
    assert.equal(mediaEvidence.value.recordId, editorialRecord.recordId, 'verified-media recordId mismatch')

    return {
      projectionEntry: entry,
      registryEntry,
      project: projectInput.project,
      editorialRecord,
      editorialEvidence: selectedEditorialEvidence(editorialRecord, projectInput.evidenceById),
      mediaEvidence: mediaEvidence.value,
      mediaEvidenceRelativePath: mediaEvidence.relativePath
    }
  })
}

function loadAndValidateSourceInputs() {
  const editorialSummary = validateEditorial()
  assert.deepEqual(editorialSummary, {
    sources: 5,
    projects: 3,
    records: 166,
    variants: 3,
    unresolvedIssues: 6
  })
  const schema = loadJson('schemas/media/verified-media.schema.json')
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.equal(schema.type, 'object')

  const projection = loadJson('projection/stremio/public-projection.json')
  const registry = loadJson('projection/stremio/video-id-registry.json')
  const optional = loadJson('projection/stremio/optional-content.json')
  const projects = loadProjectInputs()
  const evidenceRecords = loadEvidenceRecords()
  const eligibleEntries = validateProjectionInputs(projection, registry, optional, evidenceRecords)
  const resolvedRecords = resolveEligibleRecords({
    eligibleEntries,
    registry,
    projects,
    evidenceRecords
  })
  assertNoPrivateOrNetworkMaterial(evidenceRecords.map((record) => record.value))
  return { projection, registry, optional, projects, evidenceRecords, eligibleEntries, resolvedRecords }
}

function parseNormalizedRuntime(runtime) {
  assertExactKeys(runtime, ['state', 'raw', 'displayed', 'seconds'], 'known normalized runtime')
  assert.equal(runtime.state, 'known')
  assert.equal(typeof runtime.raw, 'string')
  assert.equal(typeof runtime.displayed, 'string')
  assert.ok(Number.isSafeInteger(runtime.seconds) && runtime.seconds >= 0, 'runtime.seconds must be known')

  const parts = runtime.displayed.split(':')
  assert.ok(parts.length === 2 || parts.length === 3, `unsupported runtime display ${runtime.displayed}`)
  assert.ok(parts.every((part) => /^\d+$/.test(part)), `invalid runtime display ${runtime.displayed}`)
  const numbers = parts.map((part) => Number.parseInt(part, 10))
  const [hours, minutes, seconds] = parts.length === 2
    ? [0, numbers[0], numbers[1]]
    : numbers
  assert.ok(minutes >= 0 && (parts.length === 2 || minutes < 60), 'runtime minutes are invalid')
  assert.ok(seconds >= 0 && seconds < 60, 'runtime seconds are invalid')
  const parsedSeconds = hours * 3600 + minutes * 60 + seconds
  assert.equal(parsedSeconds, runtime.seconds, 'displayed runtime and normalized seconds disagree')
  return {
    displayed: runtime.displayed,
    seconds: parsedSeconds,
    exactClock: [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':'),
    stremioWholeMinutes: String(Math.floor(parsedSeconds / 60))
  }
}

function formatAudioPresentation(audioTracks) {
  const formats = []
  for (const track of audioTracks) {
    const label = `${track.codec} ${track.channels.toFixed(1)}`
    if (!formats.includes(label)) formats.push(label)
  }
  assert.ok(formats.length > 0, 'audio presentation requires verified tracks')
  return formats.join(' + ')
}

function describeAudioFormats(audioTracks) {
  const descriptions = []
  for (const track of audioTracks) {
    const description = `${track.codec} ${track.profile}, ${track.channels} channels/${track.channelLayout}`
    if (!descriptions.includes(description)) descriptions.push(description)
  }
  return descriptions.join(' + ')
}

function formatLanguagePresentation(audioTracks) {
  const languages = []
  for (const track of audioTracks) {
    const code = SERIES_POLICY.presentation.languageCodes[track.language]
    assertNonEmptyString(code, `approved abbreviation for ${track.language}`)
    if (!languages.includes(code)) languages.push(code)
  }
  return languages.join(' + ')
}

function derivePresentation(editorialRecord, mediaEvidence) {
  const runtime = parseNormalizedRuntime(editorialRecord.runtime)
  const video = mediaEvidence.media.video
  const audioTracks = mediaEvidence.media.audioTracks
  return {
    runtime,
    resolutionLabel: `${video.height}p`,
    sizePresentation: `${(
      mediaEvidence.torrent.fileSelection.byteSize / SERIES_POLICY.presentation.megabyteDivisor
    ).toFixed(SERIES_POLICY.presentation.megabyteDigits)} MB`,
    codecPresentation: video.codec,
    codecInspectionPresentation: `${video.codec} / ${video.standard}`,
    audioPresentation: formatAudioPresentation(audioTracks),
    languagePresentation: formatLanguagePresentation(audioTracks)
  }
}

function formatStreamName(presentation) {
  return `${SERIES_POLICY.presentation.streamNamePrefix} ${presentation.resolutionLabel}`
}

function formatStreamTitle(resolved, presentation) {
  const record = resolved.editorialRecord
  return `🎬 ${record.title}\n📖 [${record.mangaMapping.raw}] 🕒 ${presentation.runtime.displayed}\n💾 ${presentation.sizePresentation}\n🎞️ ${presentation.codecPresentation} 🔊 ${presentation.audioPresentation} • ${presentation.languagePresentation}`
}

function deriveEditorialSourceSummary(record, evidenceItems) {
  assert.ok(evidenceItems.length > 0, `${record.recordId} has no selected editorial evidence`)
  const spreadsheetItems = evidenceItems.filter((item) => item.locator.kind === 'xlsx')
  assert.equal(spreadsheetItems.length, evidenceItems.length, `${record.recordId} episode provenance must resolve to spreadsheet cells`)
  const filenames = new Set(spreadsheetItems.map((item) => item.source.filename))
  const sheets = new Set(spreadsheetItems.map((item) => item.locator.sheet))
  const rows = new Set(spreadsheetItems.map((item) => item.locator.row))
  assert.equal(filenames.size, 1, `${record.recordId} selected evidence spans source files`)
  assert.equal(sheets.size, 1, `${record.recordId} selected evidence spans sheets`)
  assert.equal(rows.size, 1, `${record.recordId} selected evidence spans rows`)
  const cells = spreadsheetItems.map((item) => item.locator.cell)
  return {
    document: [...filenames][0],
    sheet: [...sheets][0],
    row: [...rows][0],
    cells: summarizeCellRange(cells)
  }
}

function parseCellReference(cell) {
  const match = /^([A-Z]+)([1-9]\d*)$/.exec(cell)
  assert.ok(match, `unsupported spreadsheet cell reference ${cell}`)
  let column = 0
  for (const character of match[1]) column = column * 26 + character.charCodeAt(0) - 64
  return { cell, column, row: Number.parseInt(match[2], 10) }
}

function summarizeCellRange(cells) {
  const parsed = [...new Set(cells)].map(parseCellReference).sort((left, right) =>
    left.row - right.row || left.column - right.column
  )
  assert.ok(parsed.length > 0, 'cannot summarize an empty cell set')
  assert.equal(new Set(parsed.map((item) => item.row)).size, 1, 'cell range spans rows')
  const ranges = []
  let start = parsed[0]
  let previous = parsed[0]
  for (const current of parsed.slice(1)) {
    if (current.column !== previous.column + 1) {
      ranges.push(start.cell === previous.cell ? start.cell : `${start.cell}:${previous.cell}`)
      start = current
    }
    previous = current
  }
  ranges.push(start.cell === previous.cell ? start.cell : `${start.cell}:${previous.cell}`)
  return ranges.join(',')
}

function projectDisplayName(project, fallbackProjectId) {
  if (typeof project.displayName === 'string' && project.displayName.length > 0) return project.displayName
  return fallbackProjectId
}

function localInspectionBasis(mediaEvidence) {
  const matches = mediaEvidence.verificationBases.filter(
    (basis) => basis.kind === 'local-media-inspection'
  )
  assert.equal(matches.length, 1, `${mediaEvidence.videoId} requires one local-media inspection basis`)
  return matches[0]
}

function buildVideo(resolved, presentation) {
  const entry = resolved.projectionEntry
  return {
    id: entry.videoId,
    season: entry.projectedPlacement.season,
    episode: entry.projectedPlacement.episode,
    title: resolved.editorialRecord.title,
    runtime: presentation.runtime.stremioWholeMinutes
  }
}

function buildStream(resolved, presentation) {
  const media = resolved.mediaEvidence
  const selection = media.torrent.fileSelection
  const stream = {
    name: formatStreamName(presentation),
    title: formatStreamTitle(resolved, presentation),
    infoHash: media.torrent.infoHash,
    sources: [...SERIES_POLICY.presentation.streamSources],
    fileIdx: selection.fileIdx,
    behaviorHints: {
      bingeGroup: SERIES_POLICY.bingeGroup,
      videoSize: selection.byteSize,
      filename: selection.filename
    }
  }
  assert.equal('subtitles' in stream, false, 'embedded subtitles must not become external stream subtitles')
  return { streams: [stream] }
}

function buildProvenance(resolved, presentation) {
  const entry = resolved.projectionEntry
  const record = resolved.editorialRecord
  const media = resolved.mediaEvidence
  const selection = media.torrent.fileSelection
  const inspection = localInspectionBasis(media)
  const evidenceRefs = resolved.editorialEvidence.map((item) => item.evidenceId)
  const sourceSummary = deriveEditorialSourceSummary(record, resolved.editorialEvidence)
  const verificationBases = media.verificationBases.map((basis) => basis.evidenceId)
  const localMediaInspection = {
    classification: 'verified local media inspection',
    method: inspection.method,
    inspectedFile: selection.filename,
    video: {
      width: media.media.video.width,
      height: media.media.video.height,
      resolutionLabel: presentation.resolutionLabel,
      codec: presentation.codecInspectionPresentation,
      profile: media.media.video.profile,
      pixelFormat: media.media.video.pixelFormat
    },
    audio: media.media.audioTracks.map((track) => ({
      language: track.language,
      codec: `${track.codec} ${track.profile}`,
      channels: `${track.channelLayout} / ${track.channels.toFixed(1)}`
    })),
    embeddedSubtitles: media.media.subtitleTracks.map((track) => ({
      language: track.language,
      title: track.title
    })),
    subtitlePresentation: 'Embedded subtitle evidence is recorded for provenance only and is not converted into Stremio external subtitle URLs.'
  }
  if (media.media.duration.state === 'verified') {
    localMediaInspection.duration = {
      state: media.media.duration.state,
      measurement: media.media.duration.measurement,
      seconds: media.media.duration.seconds
    }
  }

  return {
    id: entry.videoId,
    sourceInputs: {
      editorial: {
        recordId: record.recordId,
        evidenceRefs
      },
      projection: {
        seriesId: entry.projectedPlacement.seriesId,
        videoId: entry.videoId,
        projectedPlacement: {
          season: entry.projectedPlacement.season,
          episode: entry.projectedPlacement.episode
        },
        publicationEligibility: {
          state: entry.publicationEligibility.state,
          gateSet: entry.publicationEligibility.gateSet
        }
      },
      verifiedMedia: {
        evidenceRecord: resolved.mediaEvidenceRelativePath,
        videoId: media.videoId,
        recordId: media.recordId,
        verificationState: media.verificationState,
        verificationBases
      }
    },
    editorial: {
      edit: projectDisplayName(resolved.project, record.projectId),
      episode: record.sourceIdentifier.displayed,
      title: record.title,
      mangaChapters: record.mangaMapping.raw,
      sourceAnimeEpisodes: record.animeMapping.raw,
      exactEditRuntime: presentation.runtime.exactClock,
      normalizedExactRuntime: presentation.runtime.displayed,
      timeSaved: record.timeSaved.raw,
      releaseDate: record.releaseDate.iso,
      lastUpdate: record.lastUpdate.iso,
      source: sourceSummary
    },
    presentation: {
      stremioVideoRuntime: presentation.runtime.stremioWholeMinutes,
      runtimeTransformation: `The exact ${presentation.runtime.displayed} source runtime is presented as ${presentation.runtime.stremioWholeMinutes} minutes, matching the observed One Pace convention.`
    },
    compatibilityMetadata: {
      animeClassification: {
        genres: [...SERIES_POLICY.genres],
        intent: 'Anime classification is intentional compatibility metadata for this Bleach anime edit.'
      },
      originalContentLanguage: {
        language: SERIES_POLICY.originalLanguage,
        inspectedAudioTracks: media.media.audioTracks.map((track) =>
          `${track.language} ${track.codec} ${track.profile}, ${track.channelLayout} / ${track.channels.toFixed(1)}`
        ),
        intent: `${SERIES_POLICY.originalLanguage} is the intended original-language track for Nuvio Original Audio behavior.`
      }
    },
    torrentEvidence: {
      infoHash: media.torrent.infoHash,
      fileIdx: selection.fileIdx,
      filename: selection.filename,
      videoSize: selection.byteSize,
      trackerEvidence: {
        state: media.torrent.networkEvidence.trackers.state
      },
      announceEvidence: {
        state: media.torrent.networkEvidence.announceUrls.state
      },
      webSeedEvidence: {
        state: media.torrent.networkEvidence.webSeeds.state
      }
    },
    localMediaInspection,
    transformations: {
      stremioRuntime: `${presentation.runtime.displayed} (${presentation.runtime.seconds} seconds) -> floor whole minutes -> ${presentation.runtime.stremioWholeMinutes}`,
      resolutionLabel: `verified height ${media.media.video.height} -> ${presentation.resolutionLabel}`,
      sizePresentation: `${selection.byteSize} bytes / ${SERIES_POLICY.presentation.megabyteDivisor}, fixed to two decimals -> ${presentation.sizePresentation}`,
      audioPresentation: `verified ${describeAudioFormats(media.media.audioTracks)} -> ${presentation.audioPresentation}`,
      languagePresentation: `${media.media.audioTracks.map((track) => track.language).join(' + ')} -> ${presentation.languagePresentation}`,
      streamSources: '[] is emitted by locked series presentation policy and is not a torrent tracker/announce/web-seed evidence claim.',
      embeddedSubtitlePolicy: 'Verified embedded subtitle tracks remain provenance only; no external subtitle URLs are generated.'
    }
  }
}

function candidatePaths(seriesId, videoIds) {
  return [
    `data/catalog/${seriesId}.json`,
    `data/meta/${seriesId}.json`,
    ...videoIds.flatMap((videoId) => [
      `data/stream/${videoId}.json`,
      `data/provenance/${videoId}.json`
    ])
  ]
}

function buildSeriesIdentity() {
  return {
    id: SERIES_POLICY.seriesId,
    type: SERIES_POLICY.type,
    name: SERIES_POLICY.name,
    genres: [...SERIES_POLICY.genres]
  }
}

function generateCandidates(resolvedRecords) {
  assert.ok(Array.isArray(resolvedRecords) && resolvedRecords.length > 0, 'generation requires eligible records')
  const prepared = resolvedRecords.map((resolved) => ({
    resolved,
    presentation: derivePresentation(resolved.editorialRecord, resolved.mediaEvidence)
  }))
  const series = buildSeriesIdentity()
  const catalog = { metas: [{ ...series }] }
  const meta = {
    meta: {
      ...series,
      language: SERIES_POLICY.originalLanguage,
      videos: prepared.map(({ resolved, presentation }) => buildVideo(resolved, presentation))
    }
  }
  const candidates = {
    [`data/catalog/${SERIES_POLICY.seriesId}.json`]: catalog,
    [`data/meta/${SERIES_POLICY.seriesId}.json`]: meta
  }
  for (const { resolved, presentation } of prepared) {
    const videoId = resolved.projectionEntry.videoId
    candidates[`data/stream/${videoId}.json`] = buildStream(resolved, presentation)
    candidates[`data/provenance/${videoId}.json`] = buildProvenance(resolved, presentation)
  }
  assert.deepEqual(
    Object.keys(candidates),
    candidatePaths(SERIES_POLICY.seriesId, prepared.map(({ resolved }) => resolved.projectionEntry.videoId))
  )
  assertNoPrivateOrNetworkMaterial(Object.values(candidates))
  return candidates
}

function writeCandidates(candidates, outputRoot) {
  for (const [relativePath, value] of Object.entries(candidates)) {
    const target = path.join(outputRoot, relativePath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, jsonBytes(value))
  }
}

function escapeJsonPointer(value) {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

function compareDiffs(left, right) {
  return left.pointer.localeCompare(right.pointer) || left.operation.localeCompare(right.operation)
}

function collectLeafDiffs(value, pointer, operation) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [operation === 'add' ? addDiff(pointer, value) : removeDiff(pointer, value)]
    }
    return value.flatMap((item, index) => collectLeafDiffs(item, `${pointer}/${index}`, operation))
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) {
      return [operation === 'add' ? addDiff(pointer, value) : removeDiff(pointer, value)]
    }
    return keys.flatMap((key) =>
      collectLeafDiffs(value[key], `${pointer}/${escapeJsonPointer(key)}`, operation)
    )
  }
  return [operation === 'add' ? addDiff(pointer, value) : removeDiff(pointer, value)]
}

function jsonDiffContract(oldValue, newValue, pointer = '') {
  if (Object.is(oldValue, newValue)) return []
  const oldArray = Array.isArray(oldValue)
  const newArray = Array.isArray(newValue)
  if (oldArray || newArray) {
    if (!(oldArray && newArray)) {
      return [
        ...collectLeafDiffs(oldValue, pointer, 'remove'),
        ...collectLeafDiffs(newValue, pointer, 'add')
      ].sort(compareDiffs)
    }
    const differences = []
    const maximum = Math.max(oldValue.length, newValue.length)
    for (let index = 0; index < maximum; index += 1) {
      const childPointer = `${pointer}/${index}`
      if (index >= oldValue.length) differences.push(...collectLeafDiffs(newValue[index], childPointer, 'add'))
      else if (index >= newValue.length) differences.push(...collectLeafDiffs(oldValue[index], childPointer, 'remove'))
      else differences.push(...jsonDiffContract(oldValue[index], newValue[index], childPointer))
    }
    return differences.sort(compareDiffs)
  }
  const oldObject = oldValue && typeof oldValue === 'object'
  const newObject = newValue && typeof newValue === 'object'
  if (oldObject || newObject) {
    if (!(oldObject && newObject)) {
      return [
        ...collectLeafDiffs(oldValue, pointer, 'remove'),
        ...collectLeafDiffs(newValue, pointer, 'add')
      ].sort(compareDiffs)
    }
    const differences = []
    for (const key of [...new Set([...Object.keys(oldValue), ...Object.keys(newValue)])].sort()) {
      const childPointer = `${pointer}/${escapeJsonPointer(key)}`
      if (!(key in oldValue)) differences.push(...collectLeafDiffs(newValue[key], childPointer, 'add'))
      else if (!(key in newValue)) differences.push(...collectLeafDiffs(oldValue[key], childPointer, 'remove'))
      else differences.push(...jsonDiffContract(oldValue[key], newValue[key], childPointer))
    }
    return differences.sort(compareDiffs)
  }
  return [replaceDiff(pointer, oldValue, newValue)]
}

function assertExpectedProvenanceDiff(locked, candidate) {
  const actual = jsonDiffContract(locked, candidate).sort(compareDiffs)
  const expected = [...EXPECTED_PROVENANCE_DIFF_CONTRACT].sort(compareDiffs)
  assert.ok(expected.every(({ pointer }) => pointer.startsWith('/') && !pointer.includes('*')), 'provenance contract must contain exact JSON Pointers only')
  assert.deepEqual(actual, expected, 'candidate provenance differs from the exact approved operation/value contract')
  return actual
}

function compareRegressionFixtures(candidates, outputRoot) {
  // This is the first point at which locked generated data is read. Candidate
  // objects have already been built and every candidate file has been written.
  for (const relativePath of Object.keys(candidates)) {
    assert.ok(fs.existsSync(path.join(outputRoot, relativePath)), `candidate was not written: ${relativePath}`)
  }
  const comparisons = {}
  for (const relativePath of BYTE_IDENTICAL_REGRESSION_FILES) {
    const candidateBytes = fs.readFileSync(path.join(outputRoot, relativePath))
    const lockedBytes = fs.readFileSync(path.join(root, relativePath))
    assert.ok(candidateBytes.equals(lockedBytes), `${relativePath} is not byte-identical to the locked fixture`)
    comparisons[relativePath] = { byteIdentical: true, sha256: sha256(candidateBytes) }
  }
  const lockedProvenance = loadJson(CB1_REGRESSION_FILES.provenance)
  const candidateProvenance = loadJson(CB1_REGRESSION_FILES.provenance, outputRoot)
  const provenanceDiff = assertExpectedProvenanceDiff(lockedProvenance, candidateProvenance)
  comparisons[CB1_REGRESSION_FILES.provenance] = {
    byteIdentical: false,
    lockedSha256: sha256(fs.readFileSync(path.join(root, CB1_REGRESSION_FILES.provenance))),
    candidateSha256: sha256(fs.readFileSync(path.join(outputRoot, CB1_REGRESSION_FILES.provenance))),
    expectedDiff: provenanceDiff
  }
  return comparisons
}

function runDryRun(options = {}) {
  const inputs = loadAndValidateSourceInputs()
  const eligibleVideoIds = inputs.resolvedRecords.map((resolved) => resolved.projectionEntry.videoId)
  const candidates = generateCandidates(inputs.resolvedRecords)
  const outputRoot = options.outputRoot || fs.mkdtempSync(path.join(os.tmpdir(), 'bleach-manga-cut-generation-'))
  writeCandidates(candidates, outputRoot)
  const comparisons = compareRegressionFixtures(candidates, outputRoot)
  return {
    outputRoot,
    processedVideoIds: eligibleVideoIds,
    candidates,
    comparisons,
    provenanceDiff: comparisons[CB1_REGRESSION_FILES.provenance].expectedDiff
  }
}

function main() {
  const result = runDryRun()
  process.stdout.write(`dry-run output: ${result.outputRoot}\n`)
  for (const relativePath of BYTE_IDENTICAL_REGRESSION_FILES) {
    const comparison = result.comparisons[relativePath]
    process.stdout.write(`${relativePath}: byte-identical PASS (${comparison.sha256})\n`)
  }
  process.stdout.write(`${CB1_REGRESSION_FILES.provenance}: exact operation/value migration PASS\n`)
  process.stdout.write(`approved provenance differences (${result.provenanceDiff.length} exact operations):\n`)
  for (const difference of result.provenanceDiff) {
    process.stdout.write(`  ${difference.operation} ${difference.pointer}\n`)
  }
  process.stdout.write(`processed eligible videos: ${JSON.stringify(result.processedVideoIds)}\n`)
  process.stdout.write('production data/* was read only for comparison and was not modified\n')
}

if (require.main === module) main()

module.exports = {
  BYTE_IDENTICAL_REGRESSION_FILES,
  CB1_REGRESSION_FILES,
  CB2_REGRESSION_FILES,
  EXPECTED_PROVENANCE_DIFF_CONTRACT,
  PROJECT_INPUTS,
  SERIES_POLICY,
  assertExpectedProvenanceDiff,
  assertNoPrivateOrNetworkMaterial,
  buildProvenance,
  candidatePaths,
  derivePresentation,
  generateCandidates,
  jsonBytes,
  jsonDiffContract,
  loadAndValidateSourceInputs,
  loadProjectInputs,
  parseNormalizedRuntime,
  resolveEligibleRecords,
  runDryRun,
  selectedEditorialEvidence,
  summarizeCellRange,
  validateProjectionInputs,
  validateVerifiedMedia
}
