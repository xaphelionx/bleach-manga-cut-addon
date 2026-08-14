'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { after, before, test } = require('node:test')

const {
  CB1_BYTE_IDENTICAL_FILES,
  CB1_REGRESSION_FILES,
  EXPECTED_PROVENANCE_DIFF_CONTRACT,
  INITIAL_ELIGIBLE_VIDEO_IDS,
  PROJECT_INPUTS,
  SERIES_POLICY,
  assertExpectedProvenanceDiff,
  assertNoPrivateOrNetworkMaterial,
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
const generatorSource = fs.readFileSync(path.join(root, 'scripts/generate-stremio-data.js'), 'utf8')

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

test('only the initial orchestration guard restricts eligible IDs to cb_1', () => {
  assert.deepEqual(INITIAL_ELIGIBLE_VIDEO_IDS, ['cb_1'])
  assert.deepEqual(result.processedVideoIds, INITIAL_ELIGIBLE_VIDEO_IDS)
  assert.equal(
    [...generatorSource.matchAll(/INITIAL_ELIGIBLE_VIDEO_IDS/g)].length,
    3,
    'the guard should be declared, enforced once, and exported only'
  )
})

test('ordinary candidate construction contains no CB1 editorial or media constants', () => {
  const ordinaryStart = generatorSource.indexOf('function validateVerificationBasis')
  const ordinaryEnd = generatorSource.indexOf('function compareCb1Regression')
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
    '576'
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

test('current editorial runtime naturally produces locked Stremio runtime', () => {
  const resolved = inputs.resolvedRecords[0]
  const presentation = derivePresentation(resolved.editorialRecord, resolved.mediaEvidence)
  assert.equal(presentation.runtime.stremioWholeMinutes, '18')
  assert.equal(result.candidates[CB1_REGRESSION_FILES.meta].meta.videos[0].runtime, '18')
})

for (const relativePath of CB1_BYTE_IDENTICAL_FILES) {
  test(`${relativePath} is generated byte-identically`, () => {
    assert.equal(result.comparisons[relativePath].byteIdentical, true)
    assert.ok(read(relativePath, outputRoot).equals(read(relativePath)))
    assert.ok(read(relativePath, outputRoot).equals(jsonBytes(result.candidates[relativePath])))
  })
}

test('production catalog, meta, stream, and provenance fixtures remain untouched', () => {
  for (const relativePath of Object.values(CB1_REGRESSION_FILES)) {
    assert.equal(hash(relativePath), LOCKED_HASHES[relativePath], relativePath)
  }
})

test('stream sources is series policy and is absent from verified evidence', () => {
  assert.equal('outputPolicies' in evidence, false)
  assert.equal('sources' in evidence.torrent, false)
  assert.deepEqual(SERIES_POLICY.presentation.streamSources, [])
  assert.deepEqual(result.candidates[CB1_REGRESSION_FILES.stream].streams[0].sources, [])
  assert.match(
    result.candidates[CB1_REGRESSION_FILES.provenance].transformations.streamSources,
    /series presentation policy.*not a torrent tracker\/announce\/web-seed evidence claim/
  )
})

test('verified-media record contains only evidence and technical state', () => {
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
