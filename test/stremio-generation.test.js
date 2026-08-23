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
  CB3_REGRESSION_FILES,
  HB14_REGRESSION_FILES,
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
const EXPECTED_PREBOUNDARY_PREFIX = Object.freeze([
  'cb_1', 'cb_2', 'cb_3', 'cb_4', 'cb_5', 'cb_6', 'cb_7', 'cb_8', 'cb_9',
  'cb_10', 'cb_11', 'cb_12', 'cb_13', 'cb_14', 'cb_15', 'cb_16', 'cb_17',
  'cb_18', 'cb_19', 'cb_20', 'cb_21', 'cb_22', 'cb_23', 'cb_24', 'cb_25',
  'cb_26', 'cb_27', 'cb_27p5', 'cb_28', 'cb_29', 'cb_30', 'cb_31', 'cb_32',
  'cb_33', 'cb_34', 'cb_35', 'cb_0p0'
])
const EXPECTED_ARRANCAR_BATCH = Object.freeze([
  'cb_36', 'cb_37', 'cb_38', 'cb_39', 'cb_40', 'cb_41', 'cb_42', 'cb_43',
  'cb_44', 'cb_45', 'cb_46', 'cb_47', 'cb_48', 'cb_49', 'cb_50', 'cb_51'
])
const EXPECTED_PREVIOUS_LOCKED_PREFIX = Object.freeze([
  ...EXPECTED_PREBOUNDARY_PREFIX,
  ...EXPECTED_ARRANCAR_BATCH,
  'hb_14'
])
const EXPECTED_NEW_HOLLOWED_BATCH = Object.freeze([
  ...Array.from({ length: 15 }, (_, index) => `hb_${index + 15}`),
  'hb_0p8',
  ...Array.from({ length: 21 }, (_, index) => `hb_${index + 30}`)
])
const EXPECTED_PUBLISHED_PREFIX = Object.freeze([
  ...EXPECTED_PREVIOUS_LOCKED_PREFIX,
  ...EXPECTED_NEW_HOLLOWED_BATCH,
  'ch_1'
])
const EXPECTED_LOCKED_PREFIX = Object.freeze([
  ...EXPECTED_PREVIOUS_LOCKED_PREFIX,
  ...EXPECTED_NEW_HOLLOWED_BATCH
])
const CURRENT_AGGREGATE_HASHES = Object.freeze({
  'data/catalog/bleach-manga-cut.json': '279dd68b24cee6e1613f1081b4ff7ae69ade2b177d2f27fa73b8e425542c58c2',
  'data/meta/bleach-manga-cut.json': '74875b8d3c69736e2229b65cf267bbe655326816868daa30a0afb92874f42c88'
})
const LOCKED_STREAM_VECTOR_SHA256 =
  'f40b242bb47c2e0946f7b6d893b31ed75196d34eb9db1289ee9e9a55d02bfc37'
const LOCKED_CONCENTRATED_PRODUCTION_VECTOR_SHA256 =
  'ff8ba0f7a1f1ed3297272c7f1dfb99e89f4c49a8bfa598403aa31a3d8e5af802'
const LOCKED_ORIGINAL_STREAM_FILE_VECTOR_SHA256 =
  '919353b8063ea592b30082d3e755f7da4b487b56e0463c1d326b230b20d3e924'
const LOCKED_ORIGINAL_PROVENANCE_FILE_VECTOR_SHA256 =
  '553964547e62faed187cfeda82a24c11245d25c1f941ab7facedca93e948846a'
const CURRENT_STREAM_FILE_VECTOR_SHA256 =
  '5068fabfd4f6a2416c970e2401f8087124ec2a4936e24eeb473c69b9a30c7f48'
const CURRENT_PROVENANCE_FILE_VECTOR_SHA256 =
  'de30108db947d232b8634a5c2a77b3cfa6ec0b88863bb21e424df74f7cfd7e9e'

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

test('processing remains exactly projection-controlled at the current canonical prefix', () => {
  const generatedMeta = result.candidates['data/meta/bleach-manga-cut.json'].meta
  assert.deepEqual(inputs.projection.publicationPolicy.currentPublishedVideoIds, EXPECTED_PUBLISHED_PREFIX)
  assert.equal(inputs.evidenceRecords.some(({ value }) => (
    value.recordId === 'concentrated:0.0' && value.videoId === 'cb_0p0'
  )), true)
  assert.equal(inputs.projection.publicationPolicy.currentPublishedVideoIds.includes('cb_0p0'), true)
  assert.deepEqual(result.processedVideoIds, EXPECTED_PUBLISHED_PREFIX)
  assert.equal(result.processedVideoIds.at(-1), 'ch_1')
  assert.equal('data/stream/cb_0p0.json' in result.candidates, true)
  assert.equal('data/provenance/cb_0p0.json' in result.candidates, true)
  assert.equal(generatedMeta.videos.some(({ id }) => id === 'cb_0p0'), true)
  for (const videoId of ['cb_36', 'cb_51']) {
    assert.equal(inputs.evidenceRecords.some(({ value }) => value.videoId === videoId), true)
    assert.equal(inputs.projection.publicationPolicy.currentPublishedVideoIds.includes(videoId), true)
    assert.equal(result.processedVideoIds.includes(videoId), true)
    assert.equal(`data/stream/${videoId}.json` in result.candidates, true)
    assert.equal(`data/provenance/${videoId}.json` in result.candidates, true)
    assert.equal(generatedMeta.videos.some(({ id }) => id === videoId), true)
  }
  assert.equal(inputs.evidenceRecords.some(({ value }) => value.videoId === 'hb_14'), true)
  assert.equal(inputs.projection.publicationPolicy.currentPublishedVideoIds.includes('hb_14'), true)
  assert.equal(result.processedVideoIds.includes('hb_14'), true)
  assert.equal('data/stream/hb_14.json' in result.candidates, true)
  assert.equal('data/provenance/hb_14.json' in result.candidates, true)
  assert.equal(generatedMeta.videos.some(({ id }) => id === 'hb_14'), true)
  for (const videoId of ['hb_15', 'hb_0p8', 'hb_50']) {
    assert.equal(inputs.evidenceRecords.some(({ value }) => value.videoId === videoId), true)
    assert.equal(inputs.projection.publicationPolicy.currentPublishedVideoIds.includes(videoId), true)
    assert.equal(result.processedVideoIds.includes(videoId), true)
    assert.equal(`data/stream/${videoId}.json` in result.candidates, true)
    assert.equal(`data/provenance/${videoId}.json` in result.candidates, true)
    assert.equal(generatedMeta.videos.some(({ id }) => id === videoId), true)
  }
  assert.equal(inputs.evidenceRecords.some(({ value }) => value.videoId === 'ch_1'), true)
  assert.equal(inputs.projection.publicationPolicy.currentPublishedVideoIds.includes('ch_1'), true)
  assert.equal(result.processedVideoIds.includes('ch_1'), true)
  assert.equal('data/stream/ch_1.json' in result.candidates, true)
  assert.equal('data/provenance/ch_1.json' in result.candidates, true)
  assert.equal(generatedMeta.videos.some(({ id }) => id === 'ch_1'), true)
  assert.equal(inputs.projection.publicationPolicy.currentPublishedVideoIds.includes('cb_52'), false)
  assert.equal(result.processedVideoIds.includes('cb_52'), false)
  assert.equal('data/stream/cb_52.json' in result.candidates, false)
  assert.equal('data/provenance/cb_52.json' in result.candidates, false)
  assert.equal(generatedMeta.videos.some(({ id }) => id === 'cb_52'), false)
  assert.doesNotMatch(generatorSource, /INITIAL_ELIGIBLE_VIDEO_IDS/)
})

test('only Chipped 01 enters publication and presentation generation', () => {
  const chippedEvidence = inputs.evidenceRecords.filter(({ value }) => value.videoId.startsWith('ch_'))
  assert.equal(chippedEvidence.length, 12)
  assert.deepEqual(
    chippedEvidence.map(({ value }) => value.videoId).sort((left, right) => (
      Number(left.slice(3)) - Number(right.slice(3))
    )),
    Array.from({ length: 12 }, (_, index) => `ch_${index + 1}`)
  )
  for (const { value } of chippedEvidence) assert.doesNotThrow(() => validateVerifiedMedia(value))

  const registryEntries = inputs.registry.entries.filter(({ videoId }) => videoId.startsWith('ch_'))
  assert.equal(registryEntries.length, 12)
  for (const entry of registryEntries) {
    assert.equal(entry.locked, false)
    const published = entry.videoId === 'ch_1'
    assert.equal(entry.status, published ? 'published' : 'reserved')
    assert.equal(inputs.projection.publicationPolicy.currentPublishedVideoIds.includes(entry.videoId), published)
    assert.equal(result.processedVideoIds.includes(entry.videoId), published)
    assert.equal(`data/stream/${entry.videoId}.json` in result.candidates, published)
    assert.equal(`data/provenance/${entry.videoId}.json` in result.candidates, published)
  }
  assert.equal(result.processedVideoIds.length, 92)
  assert.equal(result.processedVideoIds.at(-1), 'ch_1')
})

test('resolutionRef provenance propagation is generic, optional, and exact', () => {
  const resolutionRef = 'editorial-resolution:concentrated-35.5-to-0.0'
  const ordinary = inputs.resolvedRecords.find(({ projectionEntry }) => projectionEntry.videoId === 'cb_35')
  const ordinaryPresentation = derivePresentation(ordinary.editorialRecord, ordinary.mediaEvidence)
  const ordinaryProvenance = buildProvenance(ordinary, ordinaryPresentation)
  assert.equal(Object.hasOwn(ordinaryProvenance.sourceInputs.projection, 'resolutionRef'), false)

  const synthetic = structuredClone(ordinary)
  synthetic.projectionEntry.resolutionRef = resolutionRef
  assert.equal(
    buildProvenance(synthetic, ordinaryPresentation).sourceInputs.projection.resolutionRef,
    resolutionRef
  )

  for (const invalid of [null, '', 'concentrated-35.5-to-0.0']) {
    const malformed = structuredClone(ordinary)
    malformed.projectionEntry.resolutionRef = invalid
    assert.throws(() => buildProvenance(malformed, ordinaryPresentation))
  }

  const cb0 = inputs.resolvedRecords.find(({ projectionEntry }) => projectionEntry.videoId === 'cb_0p0')
  const cb0Provenance = result.candidates['data/provenance/cb_0p0.json']
  assert.equal(cb0.projectionEntry.resolutionRef, resolutionRef)
  assert.equal(cb0Provenance.sourceInputs.projection.resolutionRef, resolutionRef)
  const provenanceSource = generatorSource.slice(
    generatorSource.indexOf('function buildProvenance'),
    generatorSource.indexOf('function candidatePaths')
  )
  assert.doesNotMatch(provenanceSource, /cb_0p0/u)
})

test('generated cb_0p0 meta, stream, and provenance are exact', () => {
  const meta = result.candidates['data/meta/bleach-manga-cut.json'].meta
  assert.deepEqual(meta.videos.filter(({ id }) => id === 'cb_0p0'), [{
    id: 'cb_0p0',
    season: 2,
    episode: 28,
    title: 'the rotator / the sand',
    runtime: '7'
  }])
  assert.deepEqual(result.candidates['data/stream/cb_0p0.json'], {
    streams: [{
      name: '[P2P🧲] 576p',
      title: '🎬 the rotator / the sand\n📖 [0 side A + side B] 🕒 07:32\n💾 53.09 MB\n🎞️ HEVC 🔊 AAC 2.0 • JPN + ENG',
      infoHash: 'cbdfdf3949a8f8c2d470dfc4f1d1a21571dca7bc',
      sources: [],
      fileIdx: 0,
      behaviorHints: {
        bingeGroup: 'bleach-manga-cut|p2p|standard',
        videoSize: 53091320,
        filename: '35.5 (0) - the rotator_ the sand.mkv'
      }
    }]
  })
  const provenance = result.candidates['data/provenance/cb_0p0.json']
  assert.equal(provenance.sourceInputs.editorial.recordId, 'concentrated:0.0')
  assert.deepEqual(provenance.sourceInputs.projection, {
    seriesId: 'bleach-manga-cut',
    videoId: 'cb_0p0',
    projectedPlacement: { season: 2, episode: 28 },
    publicationEligibility: { state: 'eligible', gateSet: 'verified-primary' },
    resolutionRef: 'editorial-resolution:concentrated-35.5-to-0.0'
  })
  assert.deepEqual(provenance.sourceInputs.verifiedMedia, {
    evidenceRecord: 'evidence/media/cb_0p0.json',
    videoId: 'cb_0p0',
    recordId: 'concentrated:0.0',
    verificationState: 'verified',
    verificationBases: [
      'cb0p0-local-torrent-verification',
      'cb0p0-local-media-ffprobe-inspection'
    ]
  })
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
  const expectedPaths = [
    'data/catalog/bleach-manga-cut.json',
    'data/meta/bleach-manga-cut.json',
    ...EXPECTED_PUBLISHED_PREFIX.flatMap((videoId) => [
      `data/stream/${videoId}.json`,
      `data/provenance/${videoId}.json`
    ])
  ]
  assert.equal(expectedPaths.length, 186)
  assert.deepEqual(Object.keys(result.candidates), expectedPaths)
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
  const resolvedByVideoId = new Map(
    inputs.resolvedRecords.map((resolved) => [resolved.projectionEntry.videoId, resolved])
  )
  assert.equal(
    derivePresentation(
      resolvedByVideoId.get('cb_1').editorialRecord,
      resolvedByVideoId.get('cb_1').mediaEvidence
    ).runtime.stremioWholeMinutes,
    '18'
  )
  assert.equal(
    derivePresentation(
      resolvedByVideoId.get('cb_2').editorialRecord,
      resolvedByVideoId.get('cb_2').mediaEvidence
    ).runtime.stremioWholeMinutes,
    '32'
  )
  assert.equal(
    derivePresentation(
      resolvedByVideoId.get('cb_3').editorialRecord,
      resolvedByVideoId.get('cb_3').mediaEvidence
    ).runtime.stremioWholeMinutes,
    '36'
  )

  const videos = result.candidates[CB1_REGRESSION_FILES.meta].meta.videos
  assert.equal(videos.length, 92)
  assert.deepEqual(videos.map((video) => video.id), EXPECTED_PUBLISHED_PREFIX)
  assert.deepEqual(
    videos.reduce((counts, video) => {
      counts[video.season] = (counts[video.season] || 0) + 1
      return counts
    }, {}),
    { 1: 9, 2: 28, 3: 54, 4: 1 }
  )
  const placement = (videoId) => {
    const { season, episode } = videos.find((video) => video.id === videoId)
    return { season, episode }
  }
  assert.deepEqual(placement('cb_1'), { season: 1, episode: 1 })
  assert.deepEqual(placement('cb_9'), { season: 1, episode: 9 })
  assert.deepEqual(placement('cb_10'), { season: 2, episode: 1 })
  assert.deepEqual(placement('cb_27'), { season: 2, episode: 18 })
  assert.deepEqual(placement('cb_27p5'), { season: 2, episode: 19 })
  assert.deepEqual(placement('cb_28'), { season: 2, episode: 20 })
  assert.deepEqual(placement('cb_32'), { season: 2, episode: 24 })
  assert.deepEqual(placement('cb_35'), { season: 2, episode: 27 })
  assert.deepEqual(placement('cb_0p0'), { season: 2, episode: 28 })
  assert.deepEqual(placement('cb_36'), { season: 3, episode: 1 })
  assert.deepEqual(placement('cb_51'), { season: 3, episode: 16 })
  assert.deepEqual(placement('hb_14'), { season: 3, episode: 17 })
  assert.deepEqual(placement('hb_0p8'), { season: 3, episode: 33 })
  assert.deepEqual(placement('hb_50'), { season: 3, episode: 54 })
  assert.deepEqual(placement('ch_1'), { season: 4, episode: 1 })
  assert.deepEqual(videos.slice(67, 72).map((video) => video.id), [
    'hb_28', 'hb_29', 'hb_0p8', 'hb_30', 'hb_31'
  ])
  assert.deepEqual(videos.slice(-3).map((video) => video.id), ['hb_49', 'hb_50', 'ch_1'])
  assert.equal(videos.some((video) => video.id === 'cb_52'), false)
  for (const resolved of inputs.resolvedRecords) {
    const video = videos.find((item) => item.id === resolved.projectionEntry.videoId)
    assert.equal(
      video.runtime,
      derivePresentation(resolved.editorialRecord, resolved.mediaEvidence).runtime.stremioWholeMinutes,
      resolved.projectionEntry.videoId
    )
  }
})

test('every current generated production candidate satisfies its exact derivation contract', () => {
  const relativePaths = Object.keys(result.candidates)
  assert.equal(relativePaths.length, 186)
  let exactResults = 0
  for (const relativePath of relativePaths) {
    assert.ok(read(relativePath, outputRoot).equals(jsonBytes(result.candidates[relativePath])), relativePath)
    if (relativePath === CB1_REGRESSION_FILES.provenance) {
      assertExpectedProvenanceDiff(lockedProvenance, result.candidates[relativePath])
      assert.equal(result.comparisons[relativePath].byteIdentical, false)
    } else {
      assert.ok(read(relativePath, outputRoot).equals(read(relativePath)), relativePath)
    }
    exactResults += 1
  }
  assert.equal(exactResults, 186)
})

test('all 91 locked stream and provenance artifacts retain their regression contracts', () => {
  for (const videoId of EXPECTED_LOCKED_PREFIX) {
    const streamPath = `data/stream/${videoId}.json`
    const provenancePath = `data/provenance/${videoId}.json`
    assert.ok(read(streamPath, outputRoot).equals(read(streamPath)), streamPath)
    assert.equal(
      Object.hasOwn(result.candidates[provenancePath].sourceInputs.projection, 'resolutionRef'),
      videoId === 'cb_0p0',
      provenancePath
    )
    if (provenancePath === CB1_REGRESSION_FILES.provenance) {
      assertExpectedProvenanceDiff(lockedProvenance, result.candidates[provenancePath])
    } else {
      assert.ok(read(provenancePath, outputRoot).equals(read(provenancePath)), provenancePath)
    }
  }
})

test('the original 91 streams and all 53 Concentrated production pairs retain starting bytes', () => {
  const vectorHash = (relativePaths) => crypto.createHash('sha256').update(Buffer.from(
    relativePaths.map((relativePath) => `${relativePath}\0${hash(relativePath)}\n`).join('')
  )).digest('hex')
  const streamPaths = EXPECTED_LOCKED_PREFIX.map((videoId) => `data/stream/${videoId}.json`)
  const concentratedPaths = EXPECTED_PUBLISHED_PREFIX
    .filter((videoId) => videoId.startsWith('cb_'))
    .flatMap((videoId) => [`data/stream/${videoId}.json`, `data/provenance/${videoId}.json`])
    .sort()

  assert.equal(vectorHash(streamPaths), LOCKED_STREAM_VECTOR_SHA256)
  assert.equal(vectorHash(concentratedPaths), LOCKED_CONCENTRATED_PRODUCTION_VECTOR_SHA256)
})

test('the original 91 stream and provenance file vectors retain starting bytes', () => {
  const vectorHash = (relativePaths) => crypto.createHash('sha256').update(Buffer.from(
    [...relativePaths].sort().map((relativePath) => `${hash(relativePath)}  ${relativePath}`).join('\n') + '\n'
  )).digest('hex')
  const streamPaths = EXPECTED_LOCKED_PREFIX.map((videoId) => `data/stream/${videoId}.json`)
  const provenancePaths = EXPECTED_LOCKED_PREFIX.map((videoId) => `data/provenance/${videoId}.json`)
  assert.equal(vectorHash(streamPaths), LOCKED_ORIGINAL_STREAM_FILE_VECTOR_SHA256)
  assert.equal(vectorHash(provenancePaths), LOCKED_ORIGINAL_PROVENANCE_FILE_VECTOR_SHA256)
})

test('the current 92 stream and provenance file vectors lock the one-entry extension', () => {
  const vectorHash = (relativePaths) => crypto.createHash('sha256').update(Buffer.from(
    [...relativePaths].sort().map((relativePath) => `${hash(relativePath)}  ${relativePath}`).join('\n') + '\n'
  )).digest('hex')
  const streamPaths = EXPECTED_PUBLISHED_PREFIX.map((videoId) => `data/stream/${videoId}.json`)
  const provenancePaths = EXPECTED_PUBLISHED_PREFIX.map((videoId) => `data/provenance/${videoId}.json`)
  assert.equal(vectorHash(streamPaths), CURRENT_STREAM_FILE_VECTOR_SHA256)
  assert.equal(vectorHash(provenancePaths), CURRENT_PROVENANCE_FILE_VECTOR_SHA256)
})

test('CB36-CB51 candidates derive exact verified evidence without invented resolution references', () => {
  const resolvedByVideoId = new Map(
    inputs.resolvedRecords.map((resolved) => [resolved.projectionEntry.videoId, resolved])
  )
  for (const videoId of EXPECTED_ARRANCAR_BATCH) {
    const resolved = resolvedByVideoId.get(videoId)
    const stream = result.candidates[`data/stream/${videoId}.json`].streams[0]
    const provenance = result.candidates[`data/provenance/${videoId}.json`]
    assert.equal(stream.infoHash, resolved.mediaEvidence.torrent.infoHash, videoId)
    assert.equal(stream.fileIdx, resolved.mediaEvidence.torrent.fileSelection.fileIdx, videoId)
    assert.equal(stream.behaviorHints.filename, resolved.mediaEvidence.torrent.fileSelection.filename, videoId)
    assert.equal(stream.behaviorHints.videoSize, resolved.mediaEvidence.torrent.fileSelection.byteSize, videoId)
    assert.equal(provenance.sourceInputs.verifiedMedia.evidenceRecord, `evidence/media/${videoId}.json`)
    assert.equal(Object.hasOwn(provenance.sourceInputs.projection, 'resolutionRef'), false, videoId)
  }
})

test('HB14 is generated through the ordinary evidence path without invented audio or subtitles', () => {
  const resolved = inputs.resolvedRecords.find(
    ({ projectionEntry }) => projectionEntry.videoId === 'hb_14'
  )
  const video = result.candidates['data/meta/bleach-manga-cut.json'].meta.videos
    .find((candidate) => candidate.id === 'hb_14')
  const stream = result.candidates['data/stream/hb_14.json'].streams[0]
  const provenance = result.candidates['data/provenance/hb_14.json']

  assert.equal(resolved.editorialRecord.recordId, 'hollowed:14')
  assert.deepEqual(resolved.editorialRecord.runtime, {
    state: 'known',
    raw: '0.5221296296296296',
    displayed: '31:52',
    seconds: 1912
  })
  assert.deepEqual(video, {
    id: 'hb_14',
    season: 3,
    episode: 17,
    title: 'The Slashing Opera',
    runtime: '31'
  })
  assert.deepEqual({
    infoHash: stream.infoHash,
    sources: stream.sources,
    fileIdx: stream.fileIdx,
    behaviorHints: stream.behaviorHints
  }, {
    infoHash: 'e0cf2b306e8f803ae01219e443d050fb831a712b',
    sources: [],
    fileIdx: 0,
    behaviorHints: {
      bingeGroup: 'bleach-manga-cut|p2p|standard',
      videoSize: 910624738,
      filename: 'Hollowed Bleach 14 - The Slashing Opera (sub).mp4'
    }
  })
  assert.equal(stream.title, '🎬 The Slashing Opera\n📖 [254-259] 🕒 31:52\n💾 910.62 MB\n🎞️ HEVC 🔊 AAC 2.0')
  assert.doesNotMatch(stream.title, /\bENG\b/)
  assert.doesNotMatch(stream.title, /\bJPN\b/)
  assert.equal('subtitles' in stream, false)
  assert.deepEqual(provenance.sourceInputs.verifiedMedia, {
    evidenceRecord: 'evidence/media/hb_14.json',
    videoId: 'hb_14',
    recordId: 'hollowed:14',
    verificationState: 'verified',
    verificationBases: [
      'hb14-local-torrent-verification',
      'hb14-local-media-ffprobe-inspection'
    ]
  })
  assert.deepEqual(provenance.localMediaInspection.audio, [
    { language: 'English', codec: 'AAC LC', channels: 'stereo / 2.0' }
  ])
  assert.deepEqual(provenance.localMediaInspection.embeddedSubtitles, [])
  assert.equal(provenance.presentation.stremioVideoRuntime, '31')
  assert.equal(provenance.transformations.stremioRuntime, '31:52 (1912 seconds) -> floor whole minutes -> 31')
  assert.equal(
    provenance.transformations.languagePresentation,
    'English normalization of raw/container tag eng retained in verified evidence; user-facing language token omitted because owner-confirmed spoken-language validation found it misleading.'
  )
  assert.equal(hash('evidence/media/hb_14.json'), '2b8914c71410d436f3aaa325ee5eea883058c2491e6f3db21ceaca94e6f03848')
  assert.equal(hash('evidence/media/hb_36.json'), 'ae082da0fc86c9911d94a659a644ee401837f843070212f865b90669692dcb9f')
  assert.equal(resolved.mediaEvidence.media.subtitleTracks.length, 0)
  assert.deepEqual(resolved.mediaEvidence.media.audioTracks, [
    { language: 'English', codec: 'AAC', profile: 'LC', channels: 2, channelLayout: 'stereo' }
  ])
})

test('Chipped 01 derives its exact stream and null-safe provenance from separate evidence domains', () => {
  const resolved = inputs.resolvedRecords.find(
    ({ projectionEntry }) => projectionEntry.videoId === 'ch_1'
  )
  const stream = result.candidates['data/stream/ch_1.json']
  const provenance = result.candidates['data/provenance/ch_1.json']

  assert.ok(resolved)
  assert.deepEqual(stream, {
    streams: [{
      name: '[P2P🧲] 1080p',
      title: '🎬 The Lost Agent\n📖 [424-428] 🕒 32:04\n💾 1162.27 MB\n🎞️ HEVC 🔊 PCM 2.0 • JPN + ENG',
      infoHash: '1a89d1f240600c70b0f4de4d32aeef9507e9385e',
      sources: [],
      fileIdx: 0,
      behaviorHints: {
        bingeGroup: 'bleach-manga-cut|p2p|standard',
        videoSize: 1162267608,
        filename: '[424-427] Chipped Bleach 01.mkv'
      }
    }]
  })
  assert.equal('subtitles' in stream.streams[0], false)
  assert.match(stream.streams[0].title, /\[424-428\]/u)
  assert.doesNotMatch(stream.streams[0].title, /\[424-427\]|stereo|null|undefined/u)
  assert.equal(provenance.editorial.mangaChapters, '424-428')
  assert.equal(provenance.torrentEvidence.filename, '[424-427] Chipped Bleach 01.mkv')
  assert.deepEqual(provenance.localMediaInspection.audio, [
    { language: 'Japanese', codec: 'PCM', channels: '2 channels' },
    { language: 'English', codec: 'PCM', channels: '2 channels' }
  ])
  assert.deepEqual(provenance.compatibilityMetadata.originalContentLanguage.inspectedAudioTracks, [
    'Japanese PCM, 2 channels',
    'English PCM, 2 channels'
  ])
  assert.deepEqual(provenance.localMediaInspection.embeddedSubtitles, [
    { language: 'English', title: 'English' },
    { language: 'English', title: 'Signs & Songs' }
  ])
  assert.equal(provenance.transformations.audioPresentation, 'verified PCM, 2 channels -> PCM 2.0')
  assert.equal(provenance.transformations.languagePresentation, 'Japanese + English -> JPN + ENG')
  assert.doesNotMatch(JSON.stringify(provenance), /PCM null|null \/ 2\.0|undefined|stereo/u)
  assert.equal(hash('evidence/media/ch_1.json'), '3d655c38412cdb57a12cd3141119a4f045dcb48861d4e433a2481e45866ce5e2')
  assert.equal(hash('evidence/acquisition/chipped-selected.json'), '50d208399da70ac461f786f929eb30432edbdce1e9156a3e8992882fa5984de7')
})

test('all 38 current-raw Hollowed candidates derive exact evidence and omit semantic language tokens', () => {
  const resolvedByVideoId = new Map(
    inputs.resolvedRecords.map((resolved) => [resolved.projectionEntry.videoId, resolved])
  )
  const hollowedVideoIds = ['hb_14', ...EXPECTED_NEW_HOLLOWED_BATCH]
  assert.deepEqual(SERIES_POLICY.presentation.languageTokenSuppressedProjectIds, ['hollowed'])

  for (const videoId of hollowedVideoIds) {
    const resolved = resolvedByVideoId.get(videoId)
    const stream = result.candidates[`data/stream/${videoId}.json`].streams[0]
    const provenance = result.candidates[`data/provenance/${videoId}.json`]
    assert.equal(resolved.editorialRecord.projectId, 'hollowed', videoId)
    assert.equal(stream.infoHash, resolved.mediaEvidence.torrent.infoHash, videoId)
    assert.equal(stream.fileIdx, resolved.mediaEvidence.torrent.fileSelection.fileIdx, videoId)
    assert.equal(stream.behaviorHints.filename, resolved.mediaEvidence.torrent.fileSelection.filename, videoId)
    assert.equal(stream.behaviorHints.videoSize, resolved.mediaEvidence.torrent.fileSelection.byteSize, videoId)
    assert.match(stream.title, /🎞️ HEVC 🔊 AAC 2\.0$/u, videoId)
    assert.doesNotMatch(stream.title, /\b(?:ENG|JPN)\b/u, videoId)
    assert.equal('subtitles' in stream, false, videoId)
    assert.equal(provenance.sourceInputs.verifiedMedia.evidenceRecord, `evidence/media/${videoId}.json`)
    assert.equal(provenance.sourceInputs.verifiedMedia.videoId, videoId)
    assert.equal(provenance.sourceInputs.verifiedMedia.recordId, resolved.editorialRecord.recordId)
    assert.equal(provenance.sourceInputs.verifiedMedia.verificationState, 'verified')
    assert.deepEqual(provenance.localMediaInspection.embeddedSubtitles, [], videoId)
    assert.deepEqual(resolved.mediaEvidence.media.audioTracks, [
      { language: 'English', codec: 'AAC', profile: 'LC', channels: 2, channelLayout: 'stereo' }
    ], videoId)
  }
})

test('HB14 owner validation is recorded without rewriting raw technical evidence', () => {
  const readme = read('README.md').toString('utf8')
  const projectionContract = read('docs/stremio-projection.md').toString('utf8')

  for (const document of [readme, projectionContract]) {
    assert.match(document, /On \*\*2026-08-22\*\*|On 2026-08-22/)
    assert.match(document, /actual spoken audio was (?:observed as )?Japanese/)
    assert.match(document, /Nuvio exposed and selected (?:the track as )?Japanese/)
    assert.match(document, /raw\/container language tag `eng`/)
    assert.match(document, /zero embedded subtitle streams/)
    assert.match(document, /focus trap reproduced/)
    assert.match(document, /accepted(?:,| and) non-blocking client\/UI limitation with unresolved attribution/)
  }

  assert.match(readme, /Seek forward, seek backward, resume preservation, Continue Watching visibility/)
  assert.match(readme, /Natural completion recognition: \*\*PASS\*\*/)
  assert.match(readme, /does not claim that ffprobe or the container identified Japanese/)
  assert.match(projectionContract, /not ffprobe\/container observations/)
  assert.doesNotMatch(projectionContract, /container (?:tag|identified|observation(?:s)?) (?:was|as) Japanese/i)
})

test('Hollowed batch validation is representative, scoped, and attribution-neutral', () => {
  const readme = read('README.md').toString('utf8')
  const projectionContract = read('docs/stremio-projection.md').toString('utf8')

  for (const document of [readme, projectionContract]) {
    assert.match(document, /91-entry/)
    assert.match(document, /HB29(?:→|->)HB0\.8(?:→|->)HB30/)
    assert.match(document, /HB34/)
    assert.match(document, /corrected[- ]HB36|HB36 corrected-torrent/)
    assert.match(document, /HB50/)
    assert.match(document, /did (?:\*\*)?not(?:\*\*)? manually play all 37/)
    assert.match(document, /33,764\/33,764 pieces|all 33,764 pieces/)
    assert.match(document, /38\/38 qBittorrent/)
    assert.match(document, /38\/38 TorBox Download Ready/)
    assert.match(document, /raw(?:\/container)? `eng`/)
    assert.match(document, /not generalized to (?:the other Hollowed files|untested files)/)
    assert.match(document, /terminal (?:Details-screen )?focus trap/)
    assert.match(document, /intermittent persistent audio|Intermittent Bleach audio/)
    assert.match(document, /transient all-video playback-unavailable incident/i)
    assert.match(document, /attribution remains unresolved|unresolved attribution/)
  }

  assert.match(readme, /Spoken audio was observed as Japanese/)
  assert.match(readme, /HB15, HB0\.8, HB34, HB36, and HB50/)
  assert.match(readme, /did not reproduce during the later HB34, HB36, or HB50 samples/)
  assert.match(readme, /manifest plus CB1, HB14, and HB15 stream endpoints each returned HTTP 200 with valid data/)
  assert.match(readme, /self-resolved without a repository or data fix/)
  assert.match(readme, /no Nuvio, addon, or TorBox cause is inferred/)
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
    CB2_REGRESSION_FILES.provenance,
    CB3_REGRESSION_FILES.stream,
    CB3_REGRESSION_FILES.provenance,
    HB14_REGRESSION_FILES.stream,
    HB14_REGRESSION_FILES.provenance
  ]) {
    assert.equal(hash(relativePath), LOCKED_HASHES[relativePath], relativePath)
  }
})

test('validated CB3 stream and provenance are permanent byte-identical regression fixtures', () => {
  assert.deepEqual(CB3_REGRESSION_FILES, {
    stream: 'data/stream/cb_3.json',
    provenance: 'data/provenance/cb_3.json'
  })
  assert.equal(
    hash(CB3_REGRESSION_FILES.stream),
    'ff1003ee7661fa3e601fac8f083b878334528ec0498f6b4403442061f56b7b8d'
  )
  assert.equal(
    hash(CB3_REGRESSION_FILES.provenance),
    '2ca7db7f246fef357afc252a40ab51fcdc2ba2ca4cf0c8e3212b7ebada7fd242'
  )
  for (const relativePath of Object.values(CB3_REGRESSION_FILES)) {
    assert.deepEqual(result.comparisons[relativePath], {
      byteIdentical: true,
      sha256: LOCKED_HASHES[relativePath]
    })
  }
})

test('stream sources is series policy and is absent from verified evidence', () => {
  assert.equal('outputPolicies' in evidence, false)
  assert.equal('sources' in evidence.torrent, false)
  assert.deepEqual(SERIES_POLICY.presentation.streamSources, [])
  for (const videoId of EXPECTED_PUBLISHED_PREFIX) {
    assert.deepEqual(result.candidates[`data/stream/${videoId}.json`].streams[0].sources, [])
  }
  assert.match(
    result.candidates[CB1_REGRESSION_FILES.provenance].transformations.streamSources,
    /series presentation policy.*not a torrent tracker\/announce\/web-seed evidence claim/
  )
})

test('all published streams derive their verified torrent selection without private material', () => {
  const resolvedByVideoId = new Map(
    inputs.resolvedRecords.map((resolved) => [resolved.projectionEntry.videoId, resolved])
  )
  for (const videoId of EXPECTED_PUBLISHED_PREFIX) {
    const streamRecord = result.candidates[`data/stream/${videoId}.json`]
    const resolved = resolvedByVideoId.get(videoId)
    const verified = resolved.mediaEvidence.torrent
    assert.equal(streamRecord.streams.length, 1, videoId)
    const stream = streamRecord.streams[0]
    assert.match(stream.infoHash, /^[0-9a-f]{40}$/, videoId)
    assert.equal(stream.infoHash, verified.infoHash, videoId)
    assert.equal(stream.fileIdx, 0, videoId)
    assert.equal(stream.fileIdx, verified.fileSelection.fileIdx, videoId)
    assert.deepEqual(stream.sources, [], videoId)
    assert.equal(stream.behaviorHints.bingeGroup, 'bleach-manga-cut|p2p|standard', videoId)
    assert.equal(stream.behaviorHints.filename, verified.fileSelection.filename, videoId)
    assert.equal(stream.behaviorHints.videoSize, verified.fileSelection.byteSize, videoId)
    assert.equal(typeof stream.title, 'string', videoId)
    assert.ok(stream.title.length > 0, videoId)
  }
  for (const videoId of ['cb_4', 'cb_9', 'cb_10', 'cb_27', 'cb_27p5', 'cb_28', 'cb_32', 'cb_35']) {
    assert.ok(result.candidates[`data/stream/${videoId}.json`], videoId)
    assert.ok(result.candidates[`data/provenance/${videoId}.json`], videoId)
  }
  assertNoPrivateOrNetworkMaterial(
    EXPECTED_PUBLISHED_PREFIX.flatMap((videoId) => [
      result.candidates[`data/stream/${videoId}.json`],
      result.candidates[`data/provenance/${videoId}.json`]
    ])
  )
})

test('CB32 provenance preserves unresolved embedded subtitle language without external subtitles', () => {
  const provenance = result.candidates['data/provenance/cb_32.json']
  assert.deepEqual(
    provenance.localMediaInspection.embeddedSubtitles[1].language,
    { state: 'unresolved' }
  )
  assert.equal('subtitles' in result.candidates['data/stream/cb_32.json'].streams[0], false)
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

test('audio and subtitle language schemas permit only non-empty strings or the exact unresolved state', () => {
  assert.deepEqual(verifiedMediaSchema.$defs.subtitleTrack.properties.language, {
    oneOf: [
      { type: 'string', minLength: 1 },
      { $ref: '#/$defs/unresolved' }
    ]
  })
  assert.deepEqual(verifiedMediaSchema.$defs.audioTrack.properties.language, {
    oneOf: [
      { type: 'string', minLength: 1 },
      { $ref: '#/$defs/unresolved' }
    ]
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
  validateVerifiedMedia(unresolvedAudio)

  for (const invalidLanguage of [
    null,
    '',
    { arbitrary: true },
    { state: 'unknown' },
    { state: 'unresolved', extra: true }
  ]) {
    const invalid = structuredClone(cb2Evidence)
    invalid.media.audioTracks[0].language = invalidLanguage
    assert.throws(() => validateVerifiedMedia(invalid))
  }
})

test('audio profile and channel layout accept observed strings or null only', () => {
  assert.deepEqual(verifiedMediaSchema.$defs.audioTrack.properties.profile, {
    oneOf: [
      { type: 'string', minLength: 1 },
      { type: 'null' }
    ]
  })
  assert.deepEqual(verifiedMediaSchema.$defs.audioTrack.properties.channelLayout, {
    oneOf: [
      { type: 'string', minLength: 1 },
      { type: 'null' }
    ]
  })

  const nullable = structuredClone(cb2Evidence)
  nullable.media.audioTracks[0].profile = null
  nullable.media.audioTracks[0].channelLayout = null
  validateVerifiedMedia(nullable)

  for (const [key, invalidValue] of [
    ['profile', ''],
    ['profile', { state: 'unresolved' }],
    ['channelLayout', ''],
    ['channelLayout', { state: 'unresolved' }]
  ]) {
    const invalid = structuredClone(cb2Evidence)
    invalid.media.audioTracks[0][key] = invalidValue
    assert.throws(() => validateVerifiedMedia(invalid))
  }
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
