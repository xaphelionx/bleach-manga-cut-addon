'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  LOCKED_HASHES,
  encodeNormalizedId,
  encodeVariantId,
  validatePublicationPrefix,
  validate
} = require('../scripts/validate-stremio-projection')
const { validateVerifiedMedia } = require('../scripts/generate-stremio-data')

const root = path.resolve(__dirname, '..')
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
const hash = (relativePath) => crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(root, relativePath)))
  .digest('hex')

const projection = read('projection/stremio/public-projection.json')
const projectionSchema = read('schemas/projection/public-projection.schema.json')
const registry = read('projection/stremio/video-id-registry.json')
const optional = read('projection/stremio/optional-content.json')
const unresolved = read('editorial/unresolved.json')
const normalized = [
  ...read('editorial/normalized/concentrated.json').records,
  ...read('editorial/normalized/hollowed.json').records,
  ...read('editorial/normalized/chipped.json').records
]
const variants = read('editorial/variants/ex.json').variants
const normalizedById = new Map(normalized.map((record) => [record.recordId, record]))
const projectedById = new Map(projection.entries.map((entry) => [entry.recordId, entry]))
const optionalById = new Map(optional.entries.map((entry) => [entry.recordId, entry]))
const evidenceRecords = [
  { relativePath: 'evidence/media/cb_1.json', value: read('evidence/media/cb_1.json') },
  { relativePath: 'evidence/media/cb_2.json', value: read('evidence/media/cb_2.json') },
  { relativePath: 'evidence/media/cb_3.json', value: read('evidence/media/cb_3.json') }
]
const EXPECTED_PUBLISHED_PREFIX = Object.freeze(['cb_1', 'cb_2', 'cb_3'])

function publicationInputs() {
  return {
    projection: structuredClone(projection),
    registry: structuredClone(registry),
    optional: structuredClone(optional),
    evidenceRecords: structuredClone(evidenceRecords)
  }
}

function setPrefixBlocker(input, lastVideoId) {
  const blocker = `primary-publication-prefix-after-${lastVideoId}`
  input.projection.publicationGateSets['unpublished-pre-boundary'].blockedBy[1] = blocker
  input.projection.publicationGateSets['blocked-post-boundary'].blockedBy[1] = blocker
}

function syntheticEvidence(videoId, recordId) {
  const value = structuredClone(evidenceRecords[1].value)
  value.videoId = videoId
  value.recordId = recordId
  validateVerifiedMedia(value)
  return { relativePath: `test-only/${videoId}.json`, value }
}

function publishSynthetic(input, videoId, { withEvidence = true } = {}) {
  const entry = input.projection.entries.find((item) => item.videoId === videoId)
  assert.ok(entry, `missing synthetic projection entry ${videoId}`)
  input.projection.publicationPolicy.currentPublishedVideoIds.push(videoId)
  entry.publicationEligibility = { state: 'eligible', gateSet: 'verified-primary' }
  input.registry.entries.find((item) => item.videoId === videoId).status = 'published'
  setPrefixBlocker(input, videoId)
  if (withEvidence) input.evidenceRecords.push(syntheticEvidence(videoId, entry.recordId))
  return entry
}

test('primary projection keeps the locked Bleach Manga Cut series ID', () => {
  assert.equal(projection.series.id, 'bleach-manga-cut')
  assert.equal(registry.seriesId, 'bleach-manga-cut')
  assert.equal(optional.primarySeriesId, 'bleach-manga-cut')
})

test('projection schema preserves CB1/CB2 while allowing a longer approved prefix', () => {
  assert.deepEqual(
    projectionSchema.properties.publicationPolicy.properties.currentPublishedVideoIds,
    {
      type: 'array',
      minItems: 2,
      uniqueItems: true,
      prefixItems: [{ const: 'cb_1' }, { const: 'cb_2' }],
      items: { type: 'string', pattern: '^cb_[0-9]+(?:p[0-9]+)?$' }
    }
  )
  assert.ok(projectionSchema.properties.publicationGateSets.required.includes('verified-primary'))
  assert.deepEqual(projectionSchema.properties.publicationGateSets.properties, {
    'locked-cb1': { $ref: '#/$defs/lockedCb1GateSet' },
    'verified-primary': { $ref: '#/$defs/verifiedPrimaryGateSet' },
    'unpublished-pre-boundary': { $ref: '#/$defs/unpublishedPreBoundaryGateSet' },
    'blocked-post-boundary': { $ref: '#/$defs/blockedPostBoundaryGateSet' }
  })
  assert.deepEqual(
    projectionSchema.$defs.eligibility.properties.gateSet.enum,
    ['locked-cb1', 'verified-primary', 'unpublished-pre-boundary', 'blocked-post-boundary']
  )
  assert.deepEqual(
    projectionSchema.$defs.verifiedPrimaryGateSet.allOf[1].properties,
    {
      editorialAvailability: { const: 'passed' },
      resolvedPlacement: { const: 'passed' },
      mediaEvidence: { const: 'passed' },
      defaultTimelineContiguity: { const: 'passed' },
      blockedBy: { const: [] }
    }
  )
  assert.deepEqual(projectionSchema.properties.entries.prefixItems, [
    { $ref: '#/$defs/cb1PublishedEntry' },
    { $ref: '#/$defs/cb2PublishedEntry' }
  ])
  assert.deepEqual(projectionSchema.properties.entries.items.oneOf, [
    { $ref: '#/$defs/verifiedPrimaryPublishedEntry' },
    { $ref: '#/$defs/blockedEntry' }
  ])
  assert.deepEqual(
    projectionSchema.$defs.cb2PublishedEntry.allOf[1].properties.publicationEligibility.const,
    { state: 'eligible', gateSet: 'verified-primary' }
  )
  assert.deepEqual(
    projectionSchema.$defs.blockedEntry.allOf[1].properties.publicationEligibility.properties,
    {
      state: { const: 'blocked' },
      gateSet: { enum: ['unpublished-pre-boundary', 'blocked-post-boundary'] }
    }
  )
  const preBoundaryBlockers = projectionSchema.$defs.unpublishedPreBoundaryGateSet
    .allOf[1].properties.blockedBy
  const postBoundaryBlockers = projectionSchema.$defs.blockedPostBoundaryGateSet
    .allOf[1].properties.blockedBy
  assert.deepEqual(preBoundaryBlockers.prefixItems, [
    { const: 'media-evidence-not-approved' },
    { pattern: '^primary-publication-prefix-after-cb_[0-9]+(?:p[0-9]+)?$' }
  ])
  assert.deepEqual(postBoundaryBlockers.prefixItems, [
    { const: 'media-evidence-not-approved' },
    { pattern: '^primary-publication-prefix-after-cb_[0-9]+(?:p[0-9]+)?$' },
    { const: 'concentrated-35.5-vs-0.0' }
  ])
  assert.equal(projectionSchema.properties.publicationGateSets.additionalProperties, false)
  assert.equal(projectionSchema.$defs.gateSet.additionalProperties, false)
  assert.doesNotMatch(JSON.stringify(projectionSchema), /primary-publication-prefix-after-cb_[0-9]+"/)
})

test('CB1 remains cb_1, S1E1, and Death and Strawberry', () => {
  const cb1 = projectedById.get('concentrated:01')
  assert.equal(cb1.videoId, 'cb_1')
  assert.deepEqual(cb1.projectedPlacement, {
    seriesId: 'bleach-manga-cut',
    season: 1,
    episode: 1
  })
  assert.equal(cb1.title, 'Death and Strawberry')
  assert.deepEqual(cb1.publicationEligibility, { state: 'eligible', gateSet: 'locked-cb1' })
})

test('CB2 is cb_2, S1E2, Starter, and independently publication-gated', () => {
  const cb2 = projectedById.get('concentrated:02')
  assert.equal(cb2.videoId, 'cb_2')
  assert.deepEqual(cb2.projectedPlacement, {
    seriesId: 'bleach-manga-cut',
    season: 1,
    episode: 2
  })
  assert.equal(cb2.title, 'Starter')
  assert.deepEqual(cb2.publicationEligibility, { state: 'eligible', gateSet: 'verified-primary' })
  assert.deepEqual(projection.publicationGateSets['verified-primary'], {
    editorialAvailability: 'passed',
    resolvedPlacement: 'passed',
    mediaEvidence: 'passed',
    defaultTimelineContiguity: 'passed',
    blockedBy: []
  })
})

test('CB3 is cb_3, S1E3, eligible, and remains unlocked for compatibility testing', () => {
  const cb3 = projectedById.get('concentrated:03')
  assert.equal(cb3.videoId, 'cb_3')
  assert.deepEqual(cb3.projectedPlacement, {
    seriesId: 'bleach-manga-cut',
    season: 1,
    episode: 3
  })
  assert.equal(cb3.title, 'The Pink-Cheeked Cockatiel')
  assert.deepEqual(cb3.publicationEligibility, { state: 'eligible', gateSet: 'verified-primary' })
  assert.equal(registry.entries.find((entry) => entry.videoId === 'cb_3').locked, false)
})

test('permanent CB1/CB2 and unresolved-boundary artifacts match their exact hashes', () => {
  for (const [relativePath, expectedHash] of Object.entries(LOCKED_HASHES)) {
    assert.equal(hash(relativePath), expectedHash, relativePath)
  }
})

test('video IDs use the approved lexical encodings', () => {
  const examples = [
    ['concentrated:01', 'cb_1'],
    ['concentrated:50', 'cb_50'],
    ['concentrated:27.5', 'cb_27p5'],
    ['concentrated:0.0', 'cb_0p0'],
    ['concentrated:0.8', 'cb_0p8'],
    ['hollowed:14', 'hb_14'],
    ['hollowed:11.5', 'hb_11p5'],
    ['hollowed:0.8', 'hb_0p8'],
    ['chipped:#01', 'ch_1']
  ]
  for (const [recordId, expected] of examples) {
    assert.equal(encodeNormalizedId(normalizedById.get(recordId)), expected)
  }
  assert.equal(encodeVariantId(variants.find((item) => item.variantId === 'hollowed:ex:27')), 'hb_ex_27')
})

test('decimal ID encoding is lexical and independent of editorial kind', () => {
  const record = normalizedById.get('concentrated:27.5')
  assert.equal(encodeNormalizedId({ ...record, kind: 'base' }), 'cb_27p5')
  assert.equal(registry.policy.decimalSyntaxImpliesEditorialKind, false)
  assert.throws(() => encodeNormalizedId({
    projectId: 'concentrated',
    sourceIdentifier: { displayed: '27/5' }
  }), /Unknown concentrated identifier syntax/)
})

test('registry contains no duplicate IDs', () => {
  const ids = registry.entries.map((entry) => entry.videoId)
  assert.equal(new Set(ids).size, ids.length)
})

test('registry never reuses one assignment for another record', () => {
  const recordIds = registry.entries.map((entry) => entry.recordId)
  assert.equal(new Set(recordIds).size, recordIds.length)
  assert.equal(registry.policy.appendOnly, true)
})

test('projected public titles equal authoritative normalized titles exactly', () => {
  for (const entry of projection.entries) {
    assert.equal(entry.title, normalizedById.get(entry.recordId).title, entry.recordId)
    assert.doesNotMatch(entry.title, /^\[(?:CB|HB|CH)\b/)
  }
  const hb115 = optionalById.get('hollowed:11.5')
  assert.equal(hb115.title, normalizedById.get('hollowed:11.5').title)
})

test('Watch Guide 35.5 and concentrated 0.0 remain separate', () => {
  const edge = projection.unresolvedDefaultEdge
  assert.equal(edge.rawEndpointIdentifier, '35.5')
  assert.equal(edge.endpointRecordId, null)
  assert.equal(edge.independentRecord.recordId, 'concentrated:0.0')
  assert.equal(edge.independentRecord.sourceIdentifier.displayed, '0.0')
  assert.equal(edge.equivalent, false)
  assert.equal(edge.placeholderCreated, false)
})

test('no global timeline position is asserted after the unresolved edge', () => {
  const cb35 = projectedById.get('concentrated:35')
  const cb35Index = projection.entries.indexOf(cb35)
  assert.deepEqual(cb35.defaultTimelinePosition, { state: 'resolved', index: 36 })
  for (const entry of projection.entries.slice(cb35Index + 1)) {
    assert.deepEqual(entry.defaultTimelinePosition, {
      state: 'unresolved',
      blockedBy: 'concentrated-35.5-vs-0.0'
    })
    assert.equal('index' in entry.defaultTimelinePosition, false)
  }
})

test('CB36 retains projected placement S3E1 without a global index', () => {
  const cb36 = projectedById.get('concentrated:36')
  assert.deepEqual(cb36.projectedPlacement, {
    seriesId: 'bleach-manga-cut',
    season: 3,
    episode: 1
  })
  assert.equal(cb36.defaultTimelinePosition.state, 'unresolved')
  assert.equal('index' in cb36.defaultTimelinePosition, false)
})

test('no S3 or S4 record is publication-eligible', () => {
  const later = projection.entries.filter((entry) => entry.projectedPlacement.season >= 3)
  assert.ok(later.length > 0)
  assert.ok(later.every((entry) => entry.publicationEligibility.state === 'blocked'))
  assert.ok(later.every((entry) => entry.publicationEligibility.gateSet === 'blocked-post-boundary'))
})

test('current publication checkpoint is exactly the first three primary entries', () => {
  const sorted = [...projection.entries].sort((left, right) =>
    left.projectedPlacement.season - right.projectedPlacement.season ||
    left.projectedPlacement.episode - right.projectedPlacement.episode
  )
  const eligibility = sorted.map((entry) => entry.publicationEligibility.state === 'eligible')
  assert.deepEqual(projection.publicationPolicy.currentPublishedVideoIds, EXPECTED_PUBLISHED_PREFIX)
  assert.deepEqual(
    sorted.filter((entry) => entry.publicationEligibility.state === 'eligible').map((entry) => entry.videoId),
    EXPECTED_PUBLISHED_PREFIX
  )
  assert.equal(eligibility.indexOf(false), 3)
  assert.ok(eligibility.slice(3).every((state) => state === false))
  assert.equal(sorted[3].videoId, 'cb_4')
  assert.equal(sorted[3].publicationEligibility.state, 'blocked')
})

test('cross-file publication contract accepts the current approved prefix', () => {
  const result = validatePublicationPrefix(publicationInputs())
  assert.deepEqual(result.approvedIds, EXPECTED_PUBLISHED_PREFIX)
  assert.deepEqual(result.eligibleIds, EXPECTED_PUBLISHED_PREFIX)
  assert.deepEqual(result.publishedIds, EXPECTED_PUBLISHED_PREFIX)
})

test('cross-file publication contract rejects an extra registry publication', () => {
  const input = publicationInputs()
  input.registry.entries.find((entry) => entry.videoId === 'cb_4').status = 'published'
  assert.throws(
    () => validatePublicationPrefix(input),
    /registry published IDs must exactly match the approved prefix/
  )
})

test('cross-file publication contract rejects an approved ID whose projection remains blocked', () => {
  const input = publicationInputs()
  input.projection.publicationPolicy.currentPublishedVideoIds.push('cb_4')
  setPrefixBlocker(input, 'cb_4')
  assert.throws(() => validatePublicationPrefix(input))
})

test('cross-file publication contract rejects an eligible CB4 without verified media', () => {
  const input = publicationInputs()
  publishSynthetic(input, 'cb_4', { withEvidence: false })
  assert.throws(
    () => validatePublicationPrefix(input),
    /cb_4 must have exactly one matching verified-media record/
  )
})

test('cross-file publication contract rejects a cb_1, cb_2, cb_3, cb_5 publication gap', () => {
  const input = publicationInputs()
  publishSynthetic(input, 'cb_5')
  assert.throws(
    () => validatePublicationPrefix(input),
    /approved IDs must follow canonical primary timeline order/
  )
})

test('cross-file publication contract rejects eligibility after a blocked entry', () => {
  const input = publicationInputs()
  input.projection.entries.find((entry) => entry.videoId === 'cb_5').publicationEligibility = {
    state: 'eligible',
    gateSet: 'verified-primary'
  }
  assert.throws(
    () => validatePublicationPrefix(input),
    /eligible primary entries must form one contiguous prefix/
  )
})

test('additional evidence alone does not advance publication', () => {
  const input = publicationInputs()
  input.evidenceRecords.push(syntheticEvidence('cb_4', 'concentrated:04'))
  const result = validatePublicationPrefix(input)
  assert.deepEqual(result.approvedIds, EXPECTED_PUBLISHED_PREFIX)
  assert.deepEqual(result.eligibleIds, EXPECTED_PUBLISHED_PREFIX)
  assert.deepEqual(result.publishedIds, EXPECTED_PUBLISHED_PREFIX)
})

test('cross-file publication contract rejects optional or EX IDs in the primary prefix', () => {
  const input = publicationInputs()
  input.projection.publicationPolicy.currentPublishedVideoIds.push('hb_ex_27')
  assert.throws(
    () => validatePublicationPrefix(input),
    /optional ID hb_ex_27 cannot enter primary publication/
  )
})

test('cross-file publication contract rejects crossing the unresolved 35.5 boundary', () => {
  const input = publicationInputs()
  input.projection.publicationPolicy.currentPublishedVideoIds.push('cb_36')
  assert.throws(
    () => validatePublicationPrefix(input),
    /approved primary prefix cannot cross unresolved boundary concentrated-35.5-vs-0.0/
  )
})

test('cross-file publication contract accepts a fully related synthetic four-entry prefix', () => {
  const input = publicationInputs()
  publishSynthetic(input, 'cb_4')
  const result = validatePublicationPrefix(input)
  assert.deepEqual(result.approvedIds, ['cb_1', 'cb_2', 'cb_3', 'cb_4'])
  assert.deepEqual(result.eligibleIds, ['cb_1', 'cb_2', 'cb_3', 'cb_4'])
  assert.deepEqual(result.publishedIds, ['cb_1', 'cb_2', 'cb_3', 'cb_4'])
  assert.deepEqual(result.eligibleEntries.map((entry) => entry.videoId), ['cb_1', 'cb_2', 'cb_3', 'cb_4'])
})

test('optional and EX entries have no primary-series placement', () => {
  assert.equal(optional.entries.length, 4)
  for (const entry of optional.entries) {
    assert.equal(entry.primarySeriesPlacement, null)
    assert.equal(entry.defaultTimelineMembership, false)
    assert.equal(entry.publicationEligibility.state, 'unresolved')
  }
})

test('HB11.5 retains the exact pause, insertion, and resume instruction', () => {
  assert.deepEqual(optionalById.get('hollowed:11.5').instruction, {
    anchorRecordId: 'concentrated:50',
    pause: { rawTimestamp: '16:15', seconds: 975 },
    insertedRecordId: 'hollowed:11.5',
    resume: {
      recordId: 'concentrated:50',
      fromRawTimestamp: '16:15',
      fromSeconds: 975
    },
    ordinaryAdjacentEpisode: false
  })
})

test('EX27 retains the exact optional replacement route', () => {
  const ex27 = optionalById.get('hollowed:ex:27')
  assert.deepEqual(ex27.baseRecordIds, ['hollowed:27', 'hollowed:28', 'hollowed:29'])
  assert.deepEqual(ex27.branch.path, [
    { sequenceIndex: 1, type: 'record', recordId: 'hollowed:26' },
    { sequenceIndex: 2, type: 'variant', variantId: 'hollowed:ex:27' },
    { sequenceIndex: 3, type: 'record', recordId: 'hollowed:0.8' },
    { sequenceIndex: 4, type: 'record', recordId: 'hollowed:30' }
  ])
})

test('optional IDs cannot enter the primary default timeline', () => {
  const primaryIds = new Set(projection.entries.map((entry) => entry.videoId))
  for (const entry of optional.entries) assert.ok(!primaryIds.has(entry.videoId), entry.videoId)
  assert.equal(optional.primarySeriesPublicationAllowed, false)
})

test('registry reservation never implies publication', () => {
  assert.equal(registry.policy.registryPresenceImpliesPublication, false)
  assert.deepEqual(
    registry.entries.filter((entry) => entry.status === 'published').map(({ videoId, locked }) => ({
      videoId,
      locked
    })),
    [
      { videoId: 'cb_1', locked: true },
      { videoId: 'cb_2', locked: true },
      { videoId: 'cb_3', locked: false }
    ]
  )
  assert.deepEqual(
    registry.entries.find((entry) => entry.videoId === 'cb_4'),
    {
      recordType: 'normalized-record',
      recordId: 'concentrated:04',
      projectId: 'concentrated',
      sourceIdentifier: '04',
      videoId: 'cb_4',
      status: 'reserved',
      locked: false
    }
  )
  assert.ok(registry.entries.some((entry) => entry.status === 'reserved' && projectedById.has(entry.recordId)))
})

test('planned, deferred, and non-generatable records cannot become eligible', () => {
  for (const record of normalized) {
    if (record.availability !== 'released' || !record.generatable) {
      const entry = projectedById.get(record.recordId)
      assert.ok(!entry || entry.publicationEligibility.state !== 'eligible', record.recordId)
      assert.equal(registry.entries.find((item) => item.recordId === record.recordId).status, 'reserved')
    }
  }
})

test('projection artifacts contain no stream or media claims', () => {
  assert.doesNotMatch(
    JSON.stringify([projection, registry, optional]),
    /"(?:infoHash|fileIdx|behaviorHints|filename|videoSize|streams|torrentEvidence|localMediaInspection|playbackUrl|resolvedUrl|clientResolve)"\s*:/
  )
})

test('all six unresolved editorial issues remain byte-identical', () => {
  assert.equal(unresolved.issues.length, 6)
  assert.equal(hash('editorial/unresolved.json'), LOCKED_HASHES['editorial/unresolved.json'])
})

test('complete projection validator accepts the artifacts', () => {
  assert.deepEqual(validate(), {
    projectedEntries: 102,
    projectCounts: { concentrated: 52, hollowed: 38, chipped: 12 },
    eligibilityCounts: { eligible: 3, blocked: 99 },
    eligibleVideoIds: ['cb_1', 'cb_2', 'cb_3'],
    publishedVideoIds: ['cb_1', 'cb_2', 'cb_3'],
    registryEntries: 169,
    optionalEntries: 4,
    unresolvedIssues: 6
  })
})
