'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { after, before, test } = require('node:test')

const {
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
  loadAndValidateSourceInputs,
  loadProjectInputs,
  parseNormalizedRuntime,
  resolveEligibleRecords,
  runDryRun,
  selectedEditorialEvidence,
  summarizeCellRange,
  validateVerifiedMedia
} = require('../scripts/generate-stremio-data')
const { LOCKED_HASHES } = require('../scripts/validate-stremio-projection')

const root = path.resolve(__dirname, '..')
const evidence = require('../evidence/media/cb_1.json')
const cb2Evidence = require('../evidence/media/cb_2.json')
const verifiedMediaSchema = require('../schemas/media/verified-media.schema.json')
const generatorSource = fs.readFileSync(path.join(root, 'scripts/generate-stremio-data.js'), 'utf8')
const EXPECTED_PUBLISHED_PREFIX = Object.freeze(['cb_1', 'cb_2'])
const CURRENT_AGGREGATE_HASHES = Object.freeze({
  'data/catalog/bleach-manga-cut.json': '279dd68b24cee6e1613f1081b4ff7ae69ade2b177d2f27fa73b8e425542c58c2',
  'data/meta/bleach-manga-cut.json': '62457501d66303d043fa9f2ae8bf4ffb8275b86bd078892ce33b66f1cc9a026e'
})

const read = (relativePath, base = root) => fs.readFileSync(path.join(base, relativePath))
const readJson = (relativePath, base = root) => JSON.parse(read(relativePath, base).toString('utf8'))
const hash = (relativePath, base = root) => crypto.createHash('sha256')
  .update(read(relativePath, base))
  .digest('hex')

let outputRoot
let result
let inputs
let lockedProvenance

before(() => {
  outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bleach-generation-test-'))
  result = runDryRun({ outputRoot })
  inputs = loadAndValidateSourceInputs()
  // Production provenance is intentionally first read after the dry-run has built,
  // written, and compared every candidate.
  lockedProvenance = readJson(CB1_REGRESSION_FILES.provenance)
})

after(() => {
  if (outputRoot) fs.rmSync(outputRoot, { recursive: true, force: true })
})

test('publication remains exactly cb_1 and cb_2 despite additional verified-media evidence', () => {
  const evidenceVideoIds = inputs.evidenceRecords.map(({ value }) => value.videoId)
  assert.deepEqual(inputs.projection.publicationPolicy.currentPublishedVideoIds, EXPECTED_PUBLISHED_PREFIX)
  assert.ok(
    evidenceVideoIds.length > EXPECTED_PUBLISHED_PREFIX.length,
    'test requires evidence beyond the published prefix'
  )
  for (const videoId of EXPECTED_PUBLISHED_PREFIX) assert.ok(evidenceVideoIds.includes(videoId))
  assert.ok(evidenceVideoIds.includes('cb_3'), 'CB3 evidence should be loaded without making CB3 published')
  assert.equal(inputs.projection.publicationPolicy.currentPublishedVideoIds.includes('cb_3'), false)
  assert.deepEqual(result.processedVideoIds, EXPECTED_PUBLISHED_PREFIX)
  assert.equal(result.processedVideoIds.includes('cb_3'), false)
  assert.doesNotMatch(generatorSource, /INITIAL_ELIGIBLE_VIDEO_IDS/)
})

test('ordinary candidate construction contains no CB1 or CB2 editorial or media constants', () => {
  const ordinaryStart = generatorSource.indexOf('function validateVerificationBasis')
  const ordinaryEnd = generatorSource.indexOf('function compareRegressionFixtures')
  assert.ok(ordinaryStart > 0 && ordinaryEnd > ordinaryStart)
  const ordinarySource = generatorSource.slice(ordinaryStart, ordinaryEnd)
  for (const literal of [
    'concentrated:01',
    'Death and Strawberry',
    '18:15',
    '1095',
    'A2:H2',
    "'HEVC'",
    "'Main'",
    '768',
    '576',
    'concentrated:02',
    'Starter',
    '32:47',
    '1966.785',
    '333401478',
    '786f4a6765d6e34d19d0cefd2f45616633386e84',
    '02 - Starter.mkv',
    '318',
    '1048576',
    '3a39b4b14770247bea77e740fb6764ca8a24190e3f289e8bb32b11fe36c57a3e'
  ]) {
    assert.equal(ordinarySource.includes(literal), false, `ordinary generation contains ${literal}`)
  }
})

test('candidate paths derive from seriesId and videoId', () => {
  assert.deepEqual(candidatePaths('synthetic-series', ['synthetic_a', 'synthetic_b']), [
    'data/catalog/synthetic-series.json',
    'data/meta/synthetic-series.json',
    'data/stream/synthetic_a.json',
    'data/provenance/synthetic_a.json',
    'data/stream/synthetic_b.json',
    'data/provenance/synthetic_b.json'
  ])

  const synthetic = structuredClone(inputs.resolvedRecords[0])
  synthetic.projectionEntry.videoId = 'cb_999'
  synthetic.registryEntry.videoId = 'cb_999'
  synthetic.mediaEvidence.videoId = 'cb_999'
  const candidates = generateCandidates([synthetic])
  assert.ok('data/stream/cb_999.json' in candidates)
  assert.ok('data/provenance/cb_999.json' in candidates)
})

test('current checkpoint candidate paths are exact and closed', () => {
  assert.deepEqual(Object.keys(result.candidates), [
    'data/catalog/bleach-manga-cut.json',
    'data/meta/bleach-manga-cut.json',
    'data/stream/cb_1.json',
    'data/provenance/cb_1.json',
    'data/stream/cb_2.json',
    'data/provenance/cb_2.json'
  ])
})

test('normalized projects resolve generically by projectId and recordId', () => {
  const projects = loadProjectInputs()
  assert.deepEqual([...projects.keys()], Object.keys(PROJECT_INPUTS))
  for (const [projectId, projectInput] of projects) {
    assert.equal(projectInput.project.projectId, projectId)
    assert.ok(projectInput.recordsById.size > 0)
  }

  const hollowedRecord = projects.get('hollowed').recordsById.get('hollowed:14')
  assert.ok(hollowedRecord)
  const projectionEntry = {
    recordId: hollowedRecord.recordId,
    projectId: hollowedRecord.projectId,
    videoId: 'hb_14',
    title: hollowedRecord.title,
    projectedPlacement: { seriesId: SERIES_POLICY.seriesId, season: 3, episode: 17 },
    publicationEligibility: { state: 'eligible', gateSet: 'synthetic-test-only' }
  }
  const registry = {
    entries: [{
      recordId: hollowedRecord.recordId,
      projectId: hollowedRecord.projectId,
      videoId: 'hb_14',
      status: 'published'
    }]
  }
  const syntheticEvidence = structuredClone(evidence)
  syntheticEvidence.videoId = 'hb_14'
  syntheticEvidence.recordId = hollowedRecord.recordId
  const resolved = resolveEligibleRecords({
    eligibleEntries: [projectionEntry],
    registry,
    projects,
    evidenceRecords: [{ relativePath: 'test-only/hb_14.json', value: syntheticEvidence }]
  })
  assert.equal(resolved.length, 1)
  assert.equal(resolved[0].editorialRecord, hollowedRecord)
  assert.equal(resolved[0].project.projectId, 'hollowed')
  const candidates = generateCandidates(resolved)
  assert.equal(candidates['data/meta/bleach-manga-cut.json'].meta.videos[0].id, 'hb_14')
  assert.equal(candidates['data/provenance/hb_14.json'].editorial.episode, hollowedRecord.sourceIdentifier.displayed)
})

test('candidate generation is collection-based', () => {
  const first = structuredClone(inputs.resolvedRecords[0])
  const second = structuredClone(inputs.resolvedRecords[0])
  second.projectionEntry.videoId = 'cb_999'
  second.projectionEntry.projectedPlacement.episode += 1
  second.registryEntry.videoId = 'cb_999'
  second.mediaEvidence.videoId = 'cb_999'
  const candidates = generateCandidates([first, second])
  assert.equal(candidates[`data/meta/${SERIES_POLICY.seriesId}.json`].meta.videos.length, 2)
  assert.ok('data/stream/cb_999.json' in candidates)
  assert.ok('data/provenance/cb_999.json' in candidates)
})

test('source identifiers remain lexical strings without Number coercion', () => {
  for (const projectInput of inputs.projects.values()) {
    for (const record of projectInput.recordsById.values()) {
      assert.equal(typeof record.sourceIdentifier.raw, 'string')
      assert.equal(typeof record.sourceIdentifier.displayed, 'string')
    }
  }
  assert.doesNotMatch(generatorSource, /Number\s*\(\s*[^)]*sourceIdentifier/)

  const synthetic = structuredClone(inputs.resolvedRecords[0])
  synthetic.editorialRecord.sourceIdentifier = { raw: '27.5', displayed: '27.5' }
  const candidate = generateCandidates([synthetic])
  assert.equal(
    candidate[`data/provenance/${synthetic.projectionEntry.videoId}.json`].editorial.episode,
    '27.5'
  )
})

test('runtime parsing handles normalized mm:ss and h:mm:ss generically', () => {
  assert.deepEqual(parseNormalizedRuntime({
    state: 'known',
    raw: 'test-only',
    displayed: '01:02:03',
    seconds: 3723
  }), {
    displayed: '01:02:03',
    seconds: 3723,
    exactClock: '01:02:03',
    stremioWholeMinutes: '62'
  })
  assert.deepEqual(parseNormalizedRuntime({
    state: 'known',
    raw: 'test-only',
    displayed: '03:07',
    seconds: 187
  }), {
    displayed: '03:07',
    seconds: 187,
    exactClock: '00:03:07',
    stremioWholeMinutes: '3'
  })
})

test('editorial runtimes produce ordered whole-minute Stremio runtimes', () => {
  const [cb1, cb2] = inputs.resolvedRecords
  assert.equal(derivePresentation(cb1.editorialRecord, cb1.mediaEvidence).runtime.stremioWholeMinutes, '18')
  assert.equal(derivePresentation(cb2.editorialRecord, cb2.mediaEvidence).runtime.stremioWholeMinutes, '32')
  assert.deepEqual(result.candidates[CB1_REGRESSION_FILES.meta].meta.videos, [
    { id: 'cb_1', season: 1, episode: 1, title: 'Death and Strawberry', runtime: '18' },
    { id: 'cb_2', season: 1, episode: 2, title: 'Starter', runtime: '32' }
  ])
})

for (const relativePath of BYTE_IDENTICAL_REGRESSION_FILES) {
  test(`${relativePath} is generated byte-identically`, () => {
    assert.equal(result.comparisons[relativePath].byteIdentical, true)
    assert.ok(read(relativePath, outputRoot).equals(read(relativePath)))
    assert.ok(read(relativePath, outputRoot).equals(jsonBytes(result.candidates[relativePath])))
  })
}

test('current aggregate fixtures and permanent per-video fixtures match their checkpoints', () => {
  for (const [relativePath, expectedHash] of Object.entries(CURRENT_AGGREGATE_HASHES)) {
    assert.equal(hash(relativePath), expectedHash, relativePath)
  }
  for (const relativePath of [
    CB1_REGRESSION_FILES.stream,
    CB1_REGRESSION_FILES.provenance,
    CB2_REGRESSION_FILES.stream,
    CB2_REGRESSION_FILES.provenance
  ]) {
    assert.equal(hash(relativePath), LOCKED_HASHES[relativePath], relativePath)
  }
})

test('stream sources is series policy and is absent from verified evidence', () => {
  assert.equal('outputPolicies' in evidence, false)
  assert.equal('sources' in evidence.torrent, false)
  assert.deepEqual(SERIES_POLICY.presentation.streamSources, [])
  assert.deepEqual(result.candidates[CB1_REGRESSION_FILES.stream].streams[0].sources, [])
  assert.deepEqual(result.candidates['data/stream/cb_2.json'].streams[0].sources, [])
  assert.match(
    result.candidates[CB1_REGRESSION_FILES.provenance].transformations.streamSources,
    /series presentation policy.*not a torrent tracker\/announce\/web-seed evidence claim/
  )
})

test('verified-media record contains only evidence and technical state', () => {
  assert.equal(hash('evidence/media/cb_1.json'), LOCKED_HASHES['evidence/media/cb_1.json'])
  assert.deepEqual(Object.keys(evidence).sort(), [
    'authorityDomain',
    'fieldEvidence',
    'media',
    'recordId',
    'schemaVersion',
    'torrent',
    'verificationBases',
    'verificationState',
    'videoId'
  ])
  const manual = evidence.verificationBases.find(
    (basis) => basis.kind === 'manually-verified-existing-torrent-evidence'
  )
  assert.deepEqual(manual.attestation, {
    scope: 'Claims linked to this evidence ID in fieldEvidence were manually verified from existing torrent evidence.',
    retainedOriginalArtifact: 'not-present-in-repository',
    repositoryOnlyReproduction: 'unavailable'
  })
  validateVerifiedMedia(evidence)
})

test('schema version 1 accepts unresolved or verified container duration and all basis kinds', () => {
  assert.equal(verifiedMediaSchema.properties.schemaVersion.const, 1)
  assert.deepEqual(verifiedMediaSchema.$defs.media.properties.duration.oneOf, [
    { $ref: '#/$defs/unresolved' },
    { $ref: '#/$defs/verifiedContainerDuration' }
  ])
  assert.deepEqual(
    verifiedMediaSchema.$defs.verificationBasis.oneOf.map((definition) => definition.properties.kind.const),
    [
      'manually-verified-existing-torrent-evidence',
      'local-torrent-verification',
      'local-media-inspection'
    ]
  )
  validateVerifiedMedia(evidence)
  validateVerifiedMedia(cb2Evidence)
})

test('subtitle language schema permits only non-empty strings or the exact unresolved state', () => {
  assert.deepEqual(verifiedMediaSchema.$defs.subtitleTrack.properties.language, {
    oneOf: [
      { type: 'string', minLength: 1 },
      { $ref: '#/$defs/unresolved' }
    ]
  })
  assert.deepEqual(verifiedMediaSchema.$defs.audioTrack.properties.language, {
    type: 'string',
    minLength: 1
  })

  const known = structuredClone(cb2Evidence)
  known.media.subtitleTracks[1].language = 'English'
  validateVerifiedMedia(known)

  const unresolved = structuredClone(cb2Evidence)
  unresolved.media.subtitleTracks[1].language = { state: 'unresolved' }
  validateVerifiedMedia(unresolved)

  for (const invalidLanguage of [
    null,
    '',
    { arbitrary: true },
    { state: 'unknown' },
    { state: 'unresolved', extra: true }
  ]) {
    const invalid = structuredClone(cb2Evidence)
    invalid.media.subtitleTracks[1].language = invalidLanguage
    assert.throws(() => validateVerifiedMedia(invalid))
  }

  const missing = structuredClone(cb2Evidence)
  delete missing.media.subtitleTracks[1].language
  assert.throws(() => validateVerifiedMedia(missing), /missing or unknown fields/)

  const unresolvedAudio = structuredClone(cb2Evidence)
  unresolvedAudio.media.audioTracks[0].language = { state: 'unresolved' }
  assert.throws(() => validateVerifiedMedia(unresolvedAudio), /audioTracks\[0\]\.language must be a string/)
})

test('CB32-like unresolved subtitle language validates and is preserved in provenance only', () => {
  const subtitleTracks = [
    {
      kind: 'embedded',
      language: 'English',
      title: 'Full Subtitles [Edited ParanDark]'
    },
    {
      kind: 'embedded',
      language: { state: 'unresolved' },
      title: 'Signs and Songs [Edited ParanDark]'
    }
  ]
  const synthetic = structuredClone(inputs.resolvedRecords[1])
  synthetic.mediaEvidence.media.subtitleTracks = subtitleTracks

  validateVerifiedMedia(synthetic.mediaEvidence)
  const presentation = derivePresentation(synthetic.editorialRecord, synthetic.mediaEvidence)
  const provenance = buildProvenance(synthetic, presentation)
  assert.deepEqual(provenance.localMediaInspection.embeddedSubtitles, [
    {
      language: 'English',
      title: 'Full Subtitles [Edited ParanDark]'
    },
    {
      language: { state: 'unresolved' },
      title: 'Signs and Songs [Edited ParanDark]'
    }
  ])
  assert.deepEqual(
    provenance.localMediaInspection.embeddedSubtitles[1].language,
    { state: 'unresolved' }
  )

  const candidates = generateCandidates([synthetic])
  assert.equal('subtitles' in candidates['data/stream/cb_2.json'].streams[0], false)
})

test('CB2 verified-media evidence contains the exact locked torrent and core media facts', () => {
  assert.equal(hash('evidence/media/cb_2.json'), LOCKED_HASHES['evidence/media/cb_2.json'])
  assert.equal(cb2Evidence.schemaVersion, 1)
  assert.equal(cb2Evidence.videoId, 'cb_2')
  assert.equal(cb2Evidence.recordId, 'concentrated:02')
  assert.deepEqual(cb2Evidence.torrent.fileSelection, {
    fileIdx: 0,
    filename: '02 - Starter.mkv',
    byteSize: 333401478
  })
  assert.equal(cb2Evidence.torrent.infoHash, '786f4a6765d6e34d19d0cefd2f45616633386e84')
  assert.deepEqual(cb2Evidence.media.duration, {
    state: 'verified',
    measurement: 'container',
    seconds: 1966.785
  })
  assert.deepEqual(cb2Evidence.media.video, {
    codec: 'HEVC',
    standard: 'H.265',
    profile: 'Main',
    width: 768,
    height: 576,
    pixelFormat: 'yuv420p'
  })
  assert.deepEqual(cb2Evidence.media.audioTracks, [
    { language: 'Japanese', codec: 'AAC', profile: 'LC', channels: 2, channelLayout: 'stereo' },
    { language: 'English', codec: 'AAC', profile: 'LC', channels: 2, channelLayout: 'stereo' }
  ])
  assert.deepEqual(cb2Evidence.media.subtitleTracks, [
    { kind: 'embedded', language: 'English', title: 'Full Subtitles [Edited ParanDark]' },
    { kind: 'embedded', language: 'English', title: 'Signs and Songs [Edited ParanDark]' }
  ])
  assert.deepEqual(cb2Evidence.torrent.networkEvidence, {
    trackers: { state: 'unresolved' },
    announceUrls: { state: 'unresolved' },
    webSeeds: { state: 'unresolved' }
  })
  validateVerifiedMedia(cb2Evidence)
})

test('CB2 stream derives exactly from repository editorial and media evidence', () => {
  assert.deepEqual(result.candidates['data/stream/cb_2.json'], {
    streams: [{
      name: '[P2P🧲] 576p',
      title: '🎬 Starter\n📖 [002-006] 🕒 32:47\n💾 333.40 MB\n🎞️ HEVC 🔊 AAC 2.0 • JPN + ENG',
      infoHash: '786f4a6765d6e34d19d0cefd2f45616633386e84',
      sources: [],
      fileIdx: 0,
      behaviorHints: {
        bingeGroup: 'bleach-manga-cut|p2p|standard',
        videoSize: 333401478,
        filename: '02 - Starter.mkv'
      }
    }]
  })
  assert.equal('subtitles' in result.candidates['data/stream/cb_2.json'].streams[0], false)
})

test('CB2 provenance separates editorial, projection, torrent, and local-media authority', () => {
  const provenance = result.candidates['data/provenance/cb_2.json']
  assert.deepEqual(provenance.sourceInputs.projection, {
    seriesId: 'bleach-manga-cut',
    videoId: 'cb_2',
    projectedPlacement: { season: 1, episode: 2 },
    publicationEligibility: { state: 'eligible', gateSet: 'verified-primary' }
  })
  assert.equal(provenance.sourceInputs.editorial.recordId, 'concentrated:02')
  assert.deepEqual(provenance.editorial, {
    edit: 'Concentrated Bleach',
    episode: '02',
    title: 'Starter',
    mangaChapters: '002-006',
    sourceAnimeEpisodes: '002-003',
    exactEditRuntime: '00:32:47',
    normalizedExactRuntime: '32:47',
    timeSaved: '12m53s (28%)',
    releaseDate: '2024-04-12',
    lastUpdate: '2026-04-01',
    source: {
      document: '!Concentrated Bleach Info.xlsx',
      sheet: 'Episode List',
      row: 3,
      cells: 'A3:H3'
    }
  })
  assert.deepEqual(provenance.torrentEvidence, {
    infoHash: '786f4a6765d6e34d19d0cefd2f45616633386e84',
    fileIdx: 0,
    filename: '02 - Starter.mkv',
    videoSize: 333401478,
    trackerEvidence: { state: 'unresolved' },
    announceEvidence: { state: 'unresolved' },
    webSeedEvidence: { state: 'unresolved' }
  })
  assert.deepEqual(provenance.localMediaInspection.duration, {
    state: 'verified',
    measurement: 'container',
    seconds: 1966.785
  })
  assert.deepEqual(provenance.localMediaInspection.embeddedSubtitles, [
    { language: 'English', title: 'Full Subtitles [Edited ParanDark]' },
    { language: 'English', title: 'Signs and Songs [Edited ParanDark]' }
  ])
  assert.equal(provenance.presentation.stremioVideoRuntime, '32')
  assert.equal(
    provenance.transformations.stremioRuntime,
    '32:47 (1967 seconds) -> floor whole minutes -> 32'
  )
})

test('CB2 verification bases retain local artifact summaries and exact field traceability', () => {
  const torrentBasis = cb2Evidence.verificationBases.find(
    (basis) => basis.kind === 'local-torrent-verification'
  )
  const mediaBasis = cb2Evidence.verificationBases.find(
    (basis) => basis.kind === 'local-media-inspection'
  )
  assert.deepEqual(torrentBasis.artifact, {
    relativePath: 'sources/02 - Starter.mkv.torrent',
    retention: 'ignored-local-workspace',
    sha256: '3a39b4b14770247bea77e740fb6764ca8a24190e3f289e8bb32b11fe36c57a3e'
  })
  assert.deepEqual(torrentBasis.verification, {
    pieceLength: 1048576,
    pieceCount: 318,
    verifiedPieces: 318,
    mismatches: 0,
    rawInfoMatchesCanonicalEncoding: true,
    payloadFilenameMatchesLocalMedia: true,
    payloadByteSizeMatchesLocalMedia: true
  })
  assert.deepEqual(mediaBasis.artifact, {
    relativePath: 'sources/01 - Substitute Soul Reaper/02 - Starter.mkv',
    retention: 'ignored-local-workspace',
    byteSize: 333401478
  })
  for (const pointer of [
    '/torrent/infoHash',
    '/torrent/fileSelection/fileIdx',
    '/torrent/fileSelection/filename',
    '/torrent/fileSelection/byteSize'
  ]) {
    assert.deepEqual(cb2Evidence.fieldEvidence[pointer], [torrentBasis.evidenceId])
  }
  for (const pointer of [
    '/media/duration',
    '/media/video/codec',
    '/media/video/standard',
    '/media/video/profile',
    '/media/video/width',
    '/media/video/height',
    '/media/video/pixelFormat',
    '/media/audioTracks',
    '/media/subtitleTracks'
  ]) {
    assert.deepEqual(cb2Evidence.fieldEvidence[pointer], [mediaBasis.evidenceId])
  }
})

test('verified duration requires positive finite container seconds and local-media field evidence', () => {
  for (const seconds of [0, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
    const changed = structuredClone(cb2Evidence)
    changed.media.duration.seconds = seconds
    assert.throws(() => validateVerifiedMedia(changed), /duration seconds must be finite and positive/)
  }

  const missingEvidence = structuredClone(cb2Evidence)
  delete missingEvidence.fieldEvidence['/media/duration']
  assert.throws(() => validateVerifiedMedia(missingEvidence), /fieldEvidence/)

  const wrongBasis = structuredClone(cb2Evidence)
  wrongBasis.fieldEvidence['/media/duration'] = ['cb2-local-torrent-verification']
  assert.throws(() => validateVerifiedMedia(wrongBasis), /must cite local-media inspection evidence/)
})

test('local torrent verification fails closed for malformed summaries and absolute artifact paths', () => {
  for (const mutate of [
    (basis) => { basis.verification.verifiedPieces = 317 },
    (basis) => { basis.verification.mismatches = 1 },
    (basis) => { basis.verification.rawInfoMatchesCanonicalEncoding = false },
    (basis) => { basis.verification.payloadFilenameMatchesLocalMedia = false },
    (basis) => { basis.verification.payloadByteSizeMatchesLocalMedia = false }
  ]) {
    const changed = structuredClone(cb2Evidence)
    const basis = changed.verificationBases.find((item) => item.kind === 'local-torrent-verification')
    mutate(basis)
    assert.throws(() => validateVerifiedMedia(changed))
  }

  const absoluteTorrent = structuredClone(cb2Evidence)
  absoluteTorrent.verificationBases.find(
    (basis) => basis.kind === 'local-torrent-verification'
  ).artifact.relativePath = '/tmp/cb_2.torrent'
  assert.throws(() => validateVerifiedMedia(absoluteTorrent), /must be relative/)

  const absoluteMedia = structuredClone(cb2Evidence)
  absoluteMedia.verificationBases.find(
    (basis) => basis.kind === 'local-media-inspection'
  ).artifact.relativePath = 'C:\\Users\\example\\cb_2.mkv'
  assert.throws(() => validateVerifiedMedia(absoluteMedia), /must be relative/)
})

test('CB2 evidence excludes payload material, secrets, private URLs, and absolute local paths', () => {
  const serialized = JSON.stringify(cb2Evidence)
  assertNoPrivateOrNetworkMaterial([cb2Evidence])
  assert.doesNotMatch(serialized, /"(?:pieces|pieceHashes|rawTorrent|mkvContents)":/i)
  assert.doesNotMatch(serialized, /(?:https?:\/\/|torbox|bearer\s|api.?key|access.?token)/i)
  assert.doesNotMatch(serialized, /(?:\/home\/|[A-Za-z]:\\\\)/)
})

test('unresolved network evidence produces no tracker, announce, or web-seed URLs', () => {
  assert.deepEqual(evidence.torrent.networkEvidence, {
    trackers: { state: 'unresolved' },
    announceUrls: { state: 'unresolved' },
    webSeeds: { state: 'unresolved' }
  })
  assert.doesNotMatch(JSON.stringify(evidence.torrent.networkEvidence), /https?:\/\//)
  assert.deepEqual(result.candidates[CB1_REGRESSION_FILES.provenance].torrentEvidence, {
    infoHash: 'd0cb7e0c8bad014c055bf2becf2694dcfde2b8e8',
    fileIdx: 0,
    filename: '01 - Death and Strawberry.mkv',
    videoSize: 186522416,
    trackerEvidence: { state: 'unresolved' },
    announceEvidence: { state: 'unresolved' },
    webSeedEvidence: { state: 'unresolved' }
  })
})

test('unresolved media duration never becomes a measured duration claim', () => {
  assert.deepEqual(evidence.media.duration, { state: 'unresolved' })
  const candidate = result.candidates[CB1_REGRESSION_FILES.provenance]
  assert.equal('duration' in candidate.localMediaInspection, false)
  assert.doesNotMatch(JSON.stringify(candidate), /measuredMediaDuration|measured media duration/i)
})

test('verified media duration stays in local provenance and never drives Stremio runtime', () => {
  const synthetic = structuredClone(inputs.resolvedRecords[0])
  synthetic.mediaEvidence.media.duration = {
    state: 'verified',
    measurement: 'container',
    seconds: 1966.785
  }
  synthetic.mediaEvidence.fieldEvidence['/media/duration'] = ['cb1-local-media-ffprobe-inspection']
  validateVerifiedMedia(synthetic.mediaEvidence)

  const candidates = generateCandidates([synthetic])
  const provenance = candidates[CB1_REGRESSION_FILES.provenance]
  assert.deepEqual(provenance.localMediaInspection.duration, {
    state: 'verified',
    measurement: 'container',
    seconds: 1966.785
  })
  assert.equal(candidates[CB1_REGRESSION_FILES.meta].meta.videos[0].runtime, '18')
  assert.equal(provenance.editorial.exactEditRuntime, '00:18:15')
  assert.equal(provenance.editorial.normalizedExactRuntime, '18:15')
  assert.equal(provenance.presentation.stremioVideoRuntime, '18')
  assert.equal(provenance.transformations.stremioRuntime, '18:15 (1095 seconds) -> floor whole minutes -> 18')
})

test('generic presentation derives the locked CB1 labels from verified facts', () => {
  const presentation = derivePresentation(
    inputs.resolvedRecords[0].editorialRecord,
    inputs.resolvedRecords[0].mediaEvidence
  )
  assert.equal(presentation.resolutionLabel, '576p')
  assert.equal(presentation.sizePresentation, '186.52 MB')
  assert.equal(presentation.audioPresentation, 'AAC 2.0')
  assert.equal(presentation.languagePresentation, 'JPN + ENG')
})

test('embedded subtitle evidence never generates external subtitle URLs', () => {
  assert.equal(evidence.media.subtitleTracks.length, 3)
  assert.ok(evidence.media.subtitleTracks.every((track) => track.kind === 'embedded'))
  assert.equal(SERIES_POLICY.presentation.embeddedSubtitlesBecomeExternalUrls, false)
  assert.equal('subtitles' in result.candidates[CB1_REGRESSION_FILES.stream].streams[0], false)
})

test('editorial evidence references derive from normalized fieldEvidence', () => {
  const resolved = inputs.resolvedRecords[0]
  const expectedRefs = [...new Set(Object.values(resolved.editorialRecord.fieldEvidence).flat())]
  const selected = selectedEditorialEvidence(
    resolved.editorialRecord,
    inputs.projects.get(resolved.editorialRecord.projectId).evidenceById
  )
  assert.deepEqual(new Set(selected.map((item) => item.evidenceId)), new Set(expectedRefs))
  assert.deepEqual(
    result.candidates[CB1_REGRESSION_FILES.provenance].sourceInputs.editorial.evidenceRefs,
    selected.map((item) => item.evidenceId)
  )
  assert.equal(summarizeCellRange(selected.map((item) => item.locator.cell)), 'A2:H2')
  assert.equal(generatorSource.includes("['A2', 'B2'"), false)
})

test('provenance migration requires exact operations and old/new values', () => {
  assert.equal(EXPECTED_PROVENANCE_DIFF_CONTRACT.length, 60)
  for (const difference of EXPECTED_PROVENANCE_DIFF_CONTRACT) {
    assert.ok(difference.pointer.startsWith('/'))
    assert.equal(difference.pointer.includes('*'), false)
    assert.ok(['add', 'remove', 'replace'].includes(difference.operation))
    if (difference.operation === 'add') {
      assert.deepEqual(difference.old, { state: 'missing' })
      assert.equal(difference.new.state, 'present')
    } else if (difference.operation === 'remove') {
      assert.equal(difference.old.state, 'present')
      assert.deepEqual(difference.new, { state: 'missing' })
    } else {
      assert.equal(difference.old.state, 'present')
      assert.equal(difference.new.state, 'present')
    }
  }
  assert.deepEqual(
    assertExpectedProvenanceDiff(
      lockedProvenance,
      result.candidates[CB1_REGRESSION_FILES.provenance]
    ),
    EXPECTED_PROVENANCE_DIFF_CONTRACT
  )
})

test('a third value at an approved provenance pointer fails closed', () => {
  const changed = structuredClone(result.candidates[CB1_REGRESSION_FILES.provenance])
  changed.sourceInputs.projection.projectedPlacement.season = 999
  assert.throws(
    () => assertExpectedProvenanceDiff(lockedProvenance, changed),
    /exact approved operation\/value contract/
  )
})

test('unexpected added and removed provenance paths fail closed', () => {
  const added = structuredClone(result.candidates[CB1_REGRESSION_FILES.provenance])
  added.unexpected = true
  assert.throws(
    () => assertExpectedProvenanceDiff(lockedProvenance, added),
    /exact approved operation\/value contract/
  )

  const removed = structuredClone(result.candidates[CB1_REGRESSION_FILES.provenance])
  delete removed.editorial.title
  assert.throws(
    () => assertExpectedProvenanceDiff(lockedProvenance, removed),
    /exact approved operation\/value contract/
  )
})

test('locked semantic changes outside provenance migration fail closed', () => {
  for (const mutate of [
    (candidate) => { candidate.torrentEvidence.infoHash = '0'.repeat(40) },
    (candidate) => { candidate.torrentEvidence.filename = 'unexpected.mkv' },
    (candidate) => { candidate.torrentEvidence.videoSize += 1 },
    (candidate) => { candidate.editorial.title = 'unexpected title' },
    (candidate) => { candidate.presentation.stremioVideoRuntime = '999' }
  ]) {
    const changed = structuredClone(result.candidates[CB1_REGRESSION_FILES.provenance])
    mutate(changed)
    assert.throws(
      () => assertExpectedProvenanceDiff(lockedProvenance, changed),
      /exact approved operation\/value contract/
    )
  }
})

test('verified-media validation fails closed for required evidence errors', () => {
  const badHash = structuredClone(evidence)
  badHash.torrent.infoHash = ''
  assert.throws(() => validateVerifiedMedia(badHash), /infoHash/)

  const unknownFile = structuredClone(evidence)
  unknownFile.torrent.fileSelection.fileIdx = null
  assert.throws(() => validateVerifiedMedia(unknownFile), /fileIdx/)

  const fabricatedDuration = structuredClone(evidence)
  fabricatedDuration.media.duration = { state: 'verified', seconds: 1 }
  assert.throws(() => validateVerifiedMedia(fabricatedDuration), /media duration/)

  const torrentSources = structuredClone(evidence)
  torrentSources.torrent.sources = []
  assert.throws(() => validateVerifiedMedia(torrentSources), /unknown fields|Stremio sources/)
})

test('inputs and candidates contain no private or network-resolved material', () => {
  assertNoPrivateOrNetworkMaterial([evidence, ...Object.values(result.candidates)])
  assert.doesNotMatch(generatorSource, /require\(['"](?:node:)?(?:http|https|net|tls|dgram|dns)['"]\)/)
  assert.doesNotMatch(generatorSource, /\bfetch\s*\(/)
})

test('candidate JSON formatting is deterministic', () => {
  for (const relativePath of Object.keys(result.candidates)) {
    const bytes = read(relativePath, outputRoot)
    assert.equal(bytes.includes(Buffer.from('\r')), false, relativePath)
    assert.match(bytes.toString('utf8'), /[^\n]\n$/)
    assert.equal(bytes.toString('utf8').endsWith('\n\n'), false)
  }
})
