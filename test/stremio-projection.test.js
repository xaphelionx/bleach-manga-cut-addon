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
  validate
} = require('../scripts/validate-stremio-projection')

const root = path.resolve(__dirname, '..')
const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
const hash = (relativePath) => crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(root, relativePath)))
  .digest('hex')

const projection = read('projection/stremio/public-projection.json')
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

test('primary projection keeps the locked Bleach Manga Cut series ID', () => {
  assert.equal(projection.series.id, 'bleach-manga-cut')
  assert.equal(registry.seriesId, 'bleach-manga-cut')
  assert.equal(optional.primarySeriesId, 'bleach-manga-cut')
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

test('all locked CB1 artifacts remain byte-identical', () => {
  for (const relativePath of [
    'data/catalog/bleach-manga-cut.json',
    'data/meta/bleach-manga-cut.json',
    'data/provenance/cb_1.json',
    'data/stream/cb_1.json'
  ]) {
    assert.equal(hash(relativePath), LOCKED_HASHES[relativePath], relativePath)
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

test('primary publication is a globally sorted contiguous prefix', () => {
  const sorted = [...projection.entries].sort((left, right) =>
    left.projectedPlacement.season - right.projectedPlacement.season ||
    left.projectedPlacement.episode - right.projectedPlacement.episode
  )
  const eligibility = sorted.map((entry) => entry.publicationEligibility.state === 'eligible')
  assert.deepEqual(sorted.filter((entry) => entry.publicationEligibility.state === 'eligible').map((entry) => entry.videoId), ['cb_1'])
  assert.equal(eligibility.indexOf(false), 1)
  assert.ok(eligibility.slice(1).every((state) => state === false))
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
    registry.entries.filter((entry) => entry.status === 'published').map((entry) => entry.videoId),
    ['cb_1']
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
    eligibilityCounts: { eligible: 1, blocked: 101 },
    registryEntries: 169,
    optionalEntries: 4,
    unresolvedIssues: 6
  })
})
