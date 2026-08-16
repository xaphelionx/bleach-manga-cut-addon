'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const { validatePublicationPrefix } = require('./validate-publication-prefix')
const { validateVerifiedMedia } = require('./generate-stremio-data')

const root = path.resolve(__dirname, '..')

const LOCKED_HASHES = Object.freeze({
  'data/provenance/cb_1.json': '991843abb80a3c34d6646676cb9f9659dc3080ee7ba87ea38bfd9ad19985753b',
  'data/provenance/cb_2.json': '0202e5ec71962e05f872768e066f78f5083e454b8459b465b7ef2eda31e402bf',
  'data/provenance/cb_3.json': '2ca7db7f246fef357afc252a40ab51fcdc2ba2ca4cf0c8e3212b7ebada7fd242',
  'data/stream/cb_1.json': '83dd2675d23da8fc557b327010e52c56c34c78f30f26c61cf18a6f6b2729da6b',
  'data/stream/cb_2.json': 'ce3df66c03ce61997e6913e32b21dd5c756e41e55a2ebb6c6a1681a6ba0b56c1',
  'data/stream/cb_3.json': 'ff1003ee7661fa3e601fac8f083b878334528ec0498f6b4403442061f56b7b8d',
  'evidence/media/cb_1.json': '7b84d24d4186163f39e3622a496c244dc3c5f5d5144d9513d6fb41e3be60f80f',
  'evidence/media/cb_2.json': '4a68bbc82f83e845c2e8ec02d36061796d1876ff95e4eb4a2fe7e6707bba30f2',
  'evidence/media/cb_3.json': 'b3604ed951e34e211003da1adc08acaefe7082b70ad0c972fb76a6ef78438526',
  'editorial/unresolved.json': '95a8343690054e7808af829b125753235b5f58fb559602ffc32872c4684518d8'
})

function load(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
}

function hash(relativePath) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(root, relativePath)))
    .digest('hex')
}

function encodeNormalizedId(record) {
  const identifier = record.sourceIdentifier.displayed
  const projectPrefixes = {
    concentrated: 'cb',
    hollowed: 'hb'
  }
  const prefix = projectPrefixes[record.projectId]

  if (prefix) {
    if (/^\d+$/.test(identifier)) return `${prefix}_${Number(identifier)}`
    const decimal = /^(\d+)\.(\d+)$/.exec(identifier)
    if (decimal) return `${prefix}_${decimal[1]}p${decimal[2]}`
    throw new Error(`Unknown ${record.projectId} identifier syntax: ${identifier}`)
  }

  const chipped = /^#(\d+)$/.exec(identifier)
  if (record.projectId === 'chipped' && chipped) return `ch_${Number(chipped[1])}`

  throw new Error(`Unknown ${record.projectId} identifier syntax: ${identifier}`)
}

function encodeVariantId(variant) {
  const identifier = /^EX (\d+)$/.exec(variant.sourceLabel)
  if (!identifier) throw new Error(`Unknown EX identifier syntax: ${variant.sourceLabel}`)
  return `hb_ex_${Number(identifier[1])}`
}

function expectedDefaultProjection(recordsByProject) {
  const recordById = new Map(
    Object.values(recordsByProject).flat().map((record) => [record.recordId, record])
  )
  const entries = []

  const add = (recordIds, season, startingEpisode) => {
    for (const [offset, recordId] of recordIds.entries()) {
      assert.ok(recordById.has(recordId), `Missing normalized record ${recordId}`)
      entries.push({
        recordId,
        projectedPlacement: {
          seriesId: 'bleach-manga-cut',
          season,
          episode: startingEpisode + offset
        }
      })
    }
  }

  add(
    Array.from({ length: 9 }, (_, index) => `concentrated:${String(index + 1).padStart(2, '0')}`),
    1,
    1
  )
  add(
    recordsByProject.concentrated
      .filter((record) => record.sourceRow >= 11 && record.sourceRow <= 37)
      .map((record) => record.recordId),
    2,
    1
  )
  add(
    Array.from({ length: 16 }, (_, index) => `concentrated:${index + 36}`),
    3,
    1
  )
  add(
    recordsByProject.hollowed
      .filter((record) => record.sourceRow >= 16 && record.sourceRow <= 53)
      .map((record) => record.recordId),
    3,
    17
  )
  add(recordsByProject.chipped.map((record) => record.recordId), 4, 1)

  return entries
}

function assertNoMediaClaims(documents) {
  const forbiddenKeys = new Set([
    'infoHash',
    'sources',
    'fileIdx',
    'behaviorHints',
    'filename',
    'videoSize',
    'streams',
    'torrentEvidence',
    'localMediaInspection',
    'playbackUrl',
    'resolvedUrl',
    'clientResolve'
  ])

  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!forbiddenKeys.has(key), `Projection contains forbidden media/runtime claim: ${key}`)
      visit(child)
    }
  }

  documents.forEach(visit)
}

function assertSchemaHeaders() {
  for (const name of [
    'public-projection.schema.json',
    'video-id-registry.schema.json',
    'optional-content.schema.json'
  ]) {
    const schema = load(`schemas/projection/${name}`)
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
    assert.equal(schema.type, 'object')
  }
}

function validate() {
  assertSchemaHeaders()
  for (const [relativePath, expectedHash] of Object.entries(LOCKED_HASHES)) {
    assert.equal(hash(relativePath), expectedHash, `${relativePath} changed from its locked checkpoint`)
  }

  const projection = load('projection/stremio/public-projection.json')
  const registry = load('projection/stremio/video-id-registry.json')
  const optional = load('projection/stremio/optional-content.json')
  const evidenceRecords = fs.readdirSync(path.join(root, 'evidence', 'media'))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({
      relativePath: `evidence/media/${name}`,
      value: load(`evidence/media/${name}`)
    }))
  for (const record of evidenceRecords) validateVerifiedMedia(record.value)
  const unresolved = load('editorial/unresolved.json')
  const watchOrder = load('editorial/watch-orders/source-guide-v2.json')
  const variants = load('editorial/variants/ex.json')
  const recordsByProject = {
    concentrated: load('editorial/normalized/concentrated.json').records,
    hollowed: load('editorial/normalized/hollowed.json').records,
    chipped: load('editorial/normalized/chipped.json').records
  }
  const normalizedRecords = Object.values(recordsByProject).flat()
  const normalizedById = new Map(normalizedRecords.map((record) => [record.recordId, record]))

  assert.equal(projection.schemaVersion, 1)
  assert.equal(projection.series.id, 'bleach-manga-cut')
  assert.equal(projection.series.type, 'series')
  assert.deepEqual(projection.series.seasons, [
    { season: 1, name: 'Substitute Soul Reaper' },
    { season: 2, name: 'Soul Society' },
    { season: 3, name: 'Arrancar' },
    { season: 4, name: 'The Lost Agent' }
  ])
  assert.deepEqual(projection.clientCompatibility.nextEpisodeOrdering, ['season', 'episode'])
  assert.equal(projection.clientCompatibility.seasonBoundariesSuppressNextEpisode, false)
  assert.equal(projection.clientCompatibility.seasonZeroIsolated, false)
  assert.equal(projection.publicationPolicy.primarySeriesPrefixClosed, true)
  assert.equal(projection.publicationPolicy.projectionDoesNotAuthorizePublication, true)

  assert.equal(unresolved.issues.length, 6)
  const boundaryIssue = unresolved.issues.find(
    (issue) => issue.issueId === 'concentrated-35.5-vs-0.0'
  )
  assert.ok(boundaryIssue)
  assert.equal(boundaryIssue.status, 'unresolved')
  assert.deepEqual(boundaryIssue.claims.map((claim) => claim.value), ['35.5', '0.0'])

  const endpoint = watchOrder.unresolvedEndpointReferences.find(
    (reference) => reference.issueId === boundaryIssue.issueId
  )
  assert.ok(endpoint)
  assert.equal(endpoint.rawIdentifier, '35.5')
  assert.equal(endpoint.resolutionState, 'unresolved')
  assert.equal('recordId' in endpoint, false)

  const edge = projection.unresolvedDefaultEdge
  assert.equal(edge.issueId, boundaryIssue.issueId)
  assert.equal(edge.afterRecordId, 'concentrated:35')
  assert.equal(edge.rawEndpointIdentifier, '35.5')
  assert.equal(edge.endpointRecordId, null)
  assert.equal(edge.independentRecord.recordId, 'concentrated:0.0')
  assert.equal(edge.independentRecord.videoId, 'cb_0p0')
  assert.equal(edge.independentRecord.projectedPlacement, null)
  assert.equal(edge.equivalent, false)
  assert.equal(edge.placeholderCreated, false)
  assert.equal(edge.blocksPublicationAfterEdge, true)

  const zero = normalizedById.get('concentrated:0.0')
  assert.ok(zero)
  assert.deepEqual(edge.independentRecord.sourceIdentifier, zero.sourceIdentifier)
  assert.equal(edge.independentRecord.title, zero.title)

  const expected = expectedDefaultProjection(recordsByProject)
  assert.equal(expected.length, 102)
  assert.equal(projection.entries.length, expected.length)
  const expectedIds = expected.map((entry) => entry.recordId)
  const projectedIds = projection.entries.map((entry) => entry.recordId)
  assert.deepEqual(projectedIds, expectedIds)

  const videoIds = new Set()
  const placements = new Set()
  for (const [index, entry] of projection.entries.entries()) {
    const record = normalizedById.get(entry.recordId)
    assert.ok(record, `Projection references unknown normalized record ${entry.recordId}`)
    assert.equal(entry.projectId, record.projectId)
    assert.deepEqual(entry.sourceIdentifier, record.sourceIdentifier)
    assert.equal(entry.videoId, encodeNormalizedId(record))
    assert.equal(entry.title, record.title, `${entry.recordId} title changed`)
    assert.equal(entry.timelineMembership, 'default')
    assert.deepEqual(entry.projectedPlacement, expected[index].projectedPlacement)
    assert.ok(!videoIds.has(entry.videoId), `Duplicate projected video ID ${entry.videoId}`)
    videoIds.add(entry.videoId)
    const placementKey = `${entry.projectedPlacement.season}:${entry.projectedPlacement.episode}`
    assert.ok(!placements.has(placementKey), `Duplicate projected placement ${placementKey}`)
    placements.add(placementKey)

    if (index < 36) {
      assert.deepEqual(entry.defaultTimelinePosition, { state: 'resolved', index: index + 1 })
    } else {
      assert.deepEqual(entry.defaultTimelinePosition, {
        state: 'unresolved',
        blockedBy: boundaryIssue.issueId
      })
      assert.equal('index' in entry.defaultTimelinePosition, false)
    }

    if (entry.recordId === 'concentrated:01') {
      assert.deepEqual(entry.publicationEligibility, {
        state: 'eligible',
        gateSet: 'locked-cb1'
      })
    } else if (entry.recordId === 'concentrated:02') {
      assert.deepEqual(entry.publicationEligibility, {
        state: 'eligible',
        gateSet: 'verified-primary'
      })
    } else if (entry.recordId === 'concentrated:03') {
      assert.deepEqual(entry.publicationEligibility, {
        state: 'eligible',
        gateSet: 'verified-primary'
      })
    }
  }

  const globallySorted = [...projection.entries].sort((left, right) =>
    left.projectedPlacement.season - right.projectedPlacement.season ||
    left.projectedPlacement.episode - right.projectedPlacement.episode
  )
  assert.deepEqual(globallySorted.map((entry) => entry.recordId), expectedIds)
  const cb1 = projection.entries[0]
  assert.equal(cb1.recordId, 'concentrated:01')
  assert.equal(cb1.videoId, 'cb_1')
  assert.equal(cb1.title, 'Death and Strawberry')
  assert.deepEqual(cb1.projectedPlacement, {
    seriesId: 'bleach-manga-cut',
    season: 1,
    episode: 1
  })

  const cb2 = projection.entries[1]
  assert.equal(cb2.recordId, 'concentrated:02')
  assert.equal(cb2.videoId, 'cb_2')
  assert.equal(cb2.title, 'Starter')
  assert.deepEqual(cb2.projectedPlacement, {
    seriesId: 'bleach-manga-cut',
    season: 1,
    episode: 2
  })

  const cb3 = projection.entries[2]
  assert.equal(cb3.recordId, 'concentrated:03')
  assert.equal(cb3.videoId, 'cb_3')
  assert.deepEqual(cb3.publicationEligibility, {
    state: 'eligible',
    gateSet: 'verified-primary'
  })

  const cb36 = projection.entries.find((entry) => entry.recordId === 'concentrated:36')
  assert.ok(cb36)
  assert.deepEqual(cb36.projectedPlacement, {
    seriesId: 'bleach-manga-cut',
    season: 3,
    episode: 1
  })
  assert.equal(cb36.defaultTimelinePosition.state, 'unresolved')
  assert.equal('index' in cb36.defaultTimelinePosition, false)

  for (const entry of projection.entries) {
    if (entry.projectedPlacement.season >= 3) {
      assert.equal(entry.publicationEligibility.state, 'blocked')
      assert.equal(entry.publicationEligibility.gateSet, 'blocked-post-boundary')
      assert.equal(entry.defaultTimelinePosition.state, 'unresolved')
      assert.equal('index' in entry.defaultTimelinePosition, false)
    }
  }

  assert.equal(registry.schemaVersion, 1)
  assert.equal(registry.seriesId, projection.series.id)
  assert.equal(registry.policy.appendOnly, true)
  assert.equal(registry.policy.registryPresenceImpliesPublication, false)
  assert.equal(registry.policy.identifiersDependOnPlacement, false)
  assert.equal(registry.policy.decimalEncoding, 'lexical-p-delimiter')
  assert.equal(registry.policy.decimalSyntaxImpliesEditorialKind, false)
  assert.equal(registry.policy.unknownSyntax, 'validation-error')
  assert.equal(registry.entries.length, normalizedRecords.length + variants.variants.length)

  const registryRecordIds = new Set()
  const registryVideoIds = new Set()
  for (const entry of registry.entries) {
    assert.ok(!registryRecordIds.has(entry.recordId), `Registry reuses record ${entry.recordId}`)
    assert.ok(!registryVideoIds.has(entry.videoId), `Registry reuses ID ${entry.videoId}`)
    registryRecordIds.add(entry.recordId)
    registryVideoIds.add(entry.videoId)

    if (entry.recordType === 'normalized-record') {
      const record = normalizedById.get(entry.recordId)
      assert.ok(record, `Registry references unknown record ${entry.recordId}`)
      assert.equal(entry.projectId, record.projectId)
      assert.equal(entry.sourceIdentifier, record.sourceIdentifier.displayed)
      assert.equal(entry.videoId, encodeNormalizedId(record))
    } else {
      const variant = variants.variants.find((item) => item.variantId === entry.recordId)
      assert.ok(variant, `Registry references unknown variant ${entry.recordId}`)
      assert.equal(entry.sourceIdentifier, variant.sourceLabel)
      assert.equal(entry.videoId, encodeVariantId(variant))
    }
  }

  for (const expected of [
    {
      recordType: 'normalized-record',
      recordId: 'concentrated:01',
      projectId: 'concentrated',
      sourceIdentifier: '01',
      videoId: 'cb_1',
      status: 'published',
      locked: true
    },
    {
      recordType: 'normalized-record',
      recordId: 'concentrated:02',
      projectId: 'concentrated',
      sourceIdentifier: '02',
      videoId: 'cb_2',
      status: 'published',
      locked: true
    },
    {
      recordType: 'normalized-record',
      recordId: 'concentrated:03',
      projectId: 'concentrated',
      sourceIdentifier: '03',
      videoId: 'cb_3',
      status: 'published',
      locked: true
    }
  ]) {
    assert.deepEqual(registry.entries.find((entry) => entry.videoId === expected.videoId), expected)
  }
  assert.ok(registry.entries.filter((entry) => entry.status === 'reserved').length > 0)

  for (const record of normalizedRecords) {
    if (!record.generatable || record.availability !== 'released') {
      const projected = projection.entries.find((entry) => entry.recordId === record.recordId)
      assert.ok(!projected || projected.publicationEligibility.state !== 'eligible')
      const registered = registry.entries.find((entry) => entry.recordId === record.recordId)
      assert.equal(registered.status, 'reserved')
    }
  }

  assert.equal(optional.schemaVersion, 1)
  assert.equal(optional.primarySeriesId, projection.series.id)
  assert.equal(optional.primarySeriesPublicationAllowed, false)
  assert.equal(optional.navigationModel.state, 'unresolved')
  assert.equal(optional.navigationModel.selectedRuntimeRepresentation, null)
  assert.equal(optional.entries.length, 4)

  const optionalIds = new Set(optional.entries.map((entry) => entry.videoId))
  assert.equal(optionalIds.size, optional.entries.length)
  for (const entry of optional.entries) {
    assert.equal(entry.primarySeriesPlacement, null)
    assert.equal(entry.defaultTimelineMembership, false)
    assert.equal(entry.publicationEligibility.state, 'unresolved')
    assert.ok(!videoIds.has(entry.videoId), `${entry.videoId} entered the primary timeline`)
  }

  const hb115 = optional.entries.find((entry) => entry.recordId === 'hollowed:11.5')
  assert.ok(hb115)
  assert.equal(hb115.videoId, 'hb_11p5')
  assert.equal(hb115.title, normalizedById.get('hollowed:11.5').title)
  assert.deepEqual(hb115.instruction, {
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

  const ex27 = optional.entries.find((entry) => entry.recordId === 'hollowed:ex:27')
  const sourceEx27 = variants.variants.find((variant) => variant.variantId === 'hollowed:ex:27')
  assert.ok(ex27)
  assert.equal(ex27.videoId, 'hb_ex_27')
  assert.equal(ex27.currentLegacyStatus, 'unresolved')
  assert.equal(ex27.mediaAvailability, 'unresolved')
  assert.deepEqual(ex27.baseRecordIds, ['hollowed:27', 'hollowed:28', 'hollowed:29'])
  assert.deepEqual(ex27.branch, sourceEx27.branch)
  assert.deepEqual(ex27.branch.path, [
    { sequenceIndex: 1, type: 'record', recordId: 'hollowed:26' },
    { sequenceIndex: 2, type: 'variant', variantId: 'hollowed:ex:27' },
    { sequenceIndex: 3, type: 'record', recordId: 'hollowed:0.8' },
    { sequenceIndex: 4, type: 'record', recordId: 'hollowed:30' }
  ])

  assertNoMediaClaims([projection, registry, optional])

  const publication = validatePublicationPrefix({
    projection,
    registry,
    optional,
    evidenceRecords
  })

  const projectCounts = projection.entries.reduce((counts, entry) => {
    counts[entry.projectId] = (counts[entry.projectId] || 0) + 1
    return counts
  }, {})
  const eligibilityCounts = projection.entries.reduce((counts, entry) => {
    const state = entry.publicationEligibility.state
    counts[state] = (counts[state] || 0) + 1
    return counts
  }, {})

  return {
    projectedEntries: projection.entries.length,
    projectCounts,
    eligibilityCounts,
    eligibleVideoIds: publication.eligibleIds,
    publishedVideoIds: publication.publishedIds,
    registryEntries: registry.entries.length,
    optionalEntries: optional.entries.length,
    unresolvedIssues: unresolved.issues.length
  }
}

if (require.main === module) {
  const result = validate()
  process.stdout.write(
    `validated ${result.projectedEntries} projected entries, ` +
    `${result.registryEntries} registered IDs, ${result.optionalEntries} optional entries, ` +
    `and ${result.unresolvedIssues} unresolved editorial issues\n` +
    `eligible primary IDs: ${JSON.stringify(result.eligibleVideoIds)}\n` +
    `published registry IDs: ${JSON.stringify(result.publishedVideoIds)}\n`
  )
}

module.exports = {
  LOCKED_HASHES,
  encodeNormalizedId,
  encodeVariantId,
  expectedDefaultProjection,
  validatePublicationPrefix,
  validate
}
