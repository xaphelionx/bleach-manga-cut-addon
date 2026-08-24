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
  'data/provenance/hb_14.json': '204798b2b001689aaa7c463cce3592b579c29501f05ebe1992f8a084a886f223',
  'data/stream/cb_1.json': '83dd2675d23da8fc557b327010e52c56c34c78f30f26c61cf18a6f6b2729da6b',
  'data/stream/cb_2.json': 'ce3df66c03ce61997e6913e32b21dd5c756e41e55a2ebb6c6a1681a6ba0b56c1',
  'data/stream/cb_3.json': 'ff1003ee7661fa3e601fac8f083b878334528ec0498f6b4403442061f56b7b8d',
  'data/stream/hb_14.json': '0ec6425d64c083e0681b03cc49e350343693455f45f0d61dc759279c1934eac8',
  'evidence/media/cb_1.json': '7b84d24d4186163f39e3622a496c244dc3c5f5d5144d9513d6fb41e3be60f80f',
  'evidence/media/cb_2.json': '4a68bbc82f83e845c2e8ec02d36061796d1876ff95e4eb4a2fe7e6707bba30f2',
  'evidence/media/cb_3.json': 'b3604ed951e34e211003da1adc08acaefe7082b70ad0c972fb76a6ef78438526',
  'evidence/media/hb_14.json': '2b8914c71410d436f3aaa325ee5eea883058c2491e6f3db21ceaca94e6f03848',
  'editorial/unresolved.json': 'ea4f1dbf2ba1b96596264f741590c4b5078e3f56b92067c2befb8d15a5c14092'
})
const LOCKED_VALIDATED_VIDEO_IDS = new Set([
  'cb_1', 'cb_2', 'cb_3', 'cb_4', 'cb_5', 'cb_6', 'cb_7', 'cb_8', 'cb_9',
  'cb_10', 'cb_11', 'cb_12', 'cb_13', 'cb_14', 'cb_15', 'cb_16', 'cb_17',
  'cb_18', 'cb_19', 'cb_20', 'cb_21', 'cb_22', 'cb_23', 'cb_24', 'cb_25',
  'cb_26', 'cb_27', 'cb_27p5', 'cb_28', 'cb_29', 'cb_30', 'cb_31', 'cb_32',
  'cb_33', 'cb_34', 'cb_35', 'cb_0p0',
  'cb_36', 'cb_37', 'cb_38', 'cb_39', 'cb_40', 'cb_41', 'cb_42', 'cb_43',
  'cb_44', 'cb_45', 'cb_46', 'cb_47', 'cb_48', 'cb_49', 'cb_50', 'cb_51',
  'hb_14', 'hb_15', 'hb_16', 'hb_17', 'hb_18', 'hb_19', 'hb_20', 'hb_21',
  'hb_22', 'hb_23', 'hb_24', 'hb_25', 'hb_26', 'hb_27', 'hb_28', 'hb_29',
  'hb_0p8',
  'hb_30', 'hb_31', 'hb_32', 'hb_33', 'hb_34', 'hb_35', 'hb_36', 'hb_37',
  'hb_38', 'hb_39', 'hb_40', 'hb_41', 'hb_42', 'hb_43', 'hb_44', 'hb_45',
  'hb_46', 'hb_47', 'hb_48', 'hb_49', 'hb_50',
  'ch_1', 'ch_2'
])
const CURRENT_RAW_HOLLOWED_RECORD_IDS = [
  'hollowed:14', 'hollowed:15', 'hollowed:16', 'hollowed:17',
  'hollowed:18', 'hollowed:19', 'hollowed:20', 'hollowed:21',
  'hollowed:22', 'hollowed:23', 'hollowed:24', 'hollowed:25',
  'hollowed:26', 'hollowed:27', 'hollowed:28', 'hollowed:29',
  'hollowed:0.8',
  'hollowed:30', 'hollowed:31', 'hollowed:32', 'hollowed:33',
  'hollowed:34', 'hollowed:35', 'hollowed:36', 'hollowed:37',
  'hollowed:38', 'hollowed:39', 'hollowed:40', 'hollowed:41',
  'hollowed:42', 'hollowed:43', 'hollowed:44', 'hollowed:45',
  'hollowed:46', 'hollowed:47', 'hollowed:48', 'hollowed:49',
  'hollowed:50'
]

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

function expectedDefaultProjection(recordsByProject, resolution) {
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
    [resolution.resolvedTarget.recordId],
    resolution.guidedPlacement.season,
    resolution.guidedPlacement.episode
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

function validateCompatibilityLockPrefix({ publishedVideoIds, registryEntries, lockedValidatedVideoIds }) {
  const explicitLockedIds = [...lockedValidatedVideoIds]
  const explicitLockedIdSet = new Set(explicitLockedIds)
  const publishedIdSet = new Set(publishedVideoIds)
  const registryByVideoId = new Map(registryEntries.map((entry) => [entry.videoId, entry]))

  assert.deepEqual(
    publishedVideoIds.slice(0, explicitLockedIds.length),
    explicitLockedIds,
    'Compatibility-locked IDs must remain an ordered prefix of current publication'
  )
  for (const videoId of explicitLockedIds) {
    assert.ok(publishedIdSet.has(videoId), `${videoId} is compatibility-locked but not published`)
  }
  for (const videoId of publishedVideoIds) {
    const registered = registryByVideoId.get(videoId)
    assert.ok(registered, `Approved video ${videoId} is missing from the registry`)
    assert.equal(registered.status, 'published', `${videoId} must be published in the registry`)
    assert.equal(
      registered.locked,
      explicitLockedIdSet.has(videoId),
      `${videoId} compatibility lock does not match its validated state`
    )
  }
  assert.deepEqual(
    registryEntries.filter((entry) => entry.status === 'published').map((entry) => entry.videoId),
    publishedVideoIds,
    'Registry published IDs must exactly match current publication'
  )
  assert.deepEqual(
    registryEntries.filter((entry) => entry.status === 'published' && entry.locked).map((entry) => entry.videoId),
    explicitLockedIds,
    'Registry published/locked IDs must exactly match the validated compatibility baseline'
  )
  for (const entry of registryEntries.filter((candidate) => candidate.status === 'reserved')) {
    assert.equal(entry.locked, false, `${entry.videoId} is reserved and must remain unlocked`)
  }

  return {
    lockedValidatedVideoIds: explicitLockedIds,
    publishedUnlockedVideoIds: publishedVideoIds.filter((videoId) => !explicitLockedIdSet.has(videoId))
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
  const approvedVideoIds = new Set(projection.publicationPolicy.currentPublishedVideoIds)
  const evidenceRecords = fs.readdirSync(path.join(root, 'evidence', 'media'))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({
      relativePath: `evidence/media/${name}`,
      value: load(`evidence/media/${name}`)
    }))
  for (const record of evidenceRecords) validateVerifiedMedia(record.value)
  const unresolved = load('editorial/unresolved.json')
  const resolutionDocument = load('editorial/resolutions.json')
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
  assert.equal('unresolvedDefaultEdge' in projection, false)

  assert.equal(unresolved.issues.length, 5)
  assert.equal(unresolved.issues.some((issue) => issue.issueId === 'concentrated-35.5-vs-0.0'), false)
  assert.equal(unresolved.issues.some((issue) => issue.issueId === 'hollowed-v3-membership'), false)
  assert.equal(unresolved.issues.some((issue) => issue.issueId === 'hollowed-v3-future-migration'), true)
  assert.equal(resolutionDocument.resolutions.length, 2, 'Expected exactly two editorial resolutions')
  const resolution = resolutionDocument.resolutions.find(
    (item) => item.resolutionId === 'editorial-resolution:concentrated-35.5-to-0.0'
  )
  assert.ok(resolution, 'Concentrated guided-placement resolution is missing')
  const hollowedMembershipResolution = resolutionDocument.resolutions.find(
    (item) => item.resolutionId === 'editorial-resolution:hollowed-current-raw-membership'
  )
  assert.ok(hollowedMembershipResolution, 'Hollowed current raw-membership resolution is missing')
  assert.equal(resolution.resolvedTarget.recordId, 'concentrated:0.0')
  assert.equal(resolution.resolvedTarget.sourceIdentifier, '0.0')
  assert.deepEqual(resolution.guidedPlacement, {
    seriesId: 'bleach-manga-cut',
    season: 2,
    episode: 28
  })
  assert.deepEqual(watchOrder.unresolvedEndpointReferences, [])
  const endpoint = watchOrder.segments.find((segment) => segment.rawRange === '10-35.5').end
  assert.deepEqual(endpoint, {
    rawIdentifier: '35.5',
    resolutionState: 'resolved',
    recordId: resolution.resolvedTarget.recordId,
    resolutionRef: resolution.resolutionId
  })

  const zero = normalizedById.get('concentrated:0.0')
  assert.ok(zero)
  assert.deepEqual(zero.sourceIdentifier, { raw: '0.0', displayed: '0.0' })
  assert.equal(zero.title, 'the rotator / the sand')

  const expected = expectedDefaultProjection(recordsByProject, resolution)
  assert.equal(expected.length, 103)
  assert.equal(projection.entries.length, expected.length)
  const expectedIds = expected.map((entry) => entry.recordId)
  const projectedIds = projection.entries.map((entry) => entry.recordId)
  assert.deepEqual(projectedIds, expectedIds)
  assert.equal(hollowedMembershipResolution.originalIssueId, 'hollowed-v3-membership')
  assert.equal(hollowedMembershipResolution.resolutionType, 'version-membership-selection')
  assert.equal(hollowedMembershipResolution.projectId, 'hollowed')
  assert.equal(hollowedMembershipResolution.selectedMembership, 'current-raw-records')
  assert.deepEqual(hollowedMembershipResolution.activeRecordIds, CURRENT_RAW_HOLLOWED_RECORD_IDS)
  assert.deepEqual(
    projection.entries
      .filter((entry) => entry.projectId === 'hollowed')
      .map((entry) => entry.recordId),
    hollowedMembershipResolution.activeRecordIds,
    'Projected Hollowed defaults must exactly match the owner-selected current raw membership'
  )
  const resolvedTargetIndex = projectedIds.indexOf(resolution.resolvedTarget.recordId)
  assert.equal(projectedIds[resolvedTargetIndex - 1], resolution.relativePlacement.afterRecordId)
  assert.equal(projectedIds[resolvedTargetIndex + 1], resolution.relativePlacement.beforeRecordId)

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

    assert.deepEqual(entry.defaultTimelinePosition, { state: 'resolved', index: index + 1 })

    if (entry.recordId === 'concentrated:01') {
      assert.deepEqual(entry.publicationEligibility, {
        state: 'eligible',
        gateSet: 'locked-cb1'
      })
    } else if (approvedVideoIds.has(entry.videoId)) {
      assert.deepEqual(entry.publicationEligibility, {
        state: 'eligible',
        gateSet: 'verified-primary'
      })
    } else {
      assert.deepEqual(entry.publicationEligibility, {
        state: 'blocked',
        gateSet: 'unpublished-primary'
      })
    }
  }

  const resolutionEntries = projection.entries.filter((entry) => entry.resolutionRef !== undefined)
  assert.equal(resolutionEntries.length, 1, 'Exactly one projection entry must reference an editorial resolution')
  const resolvedEntry = resolutionEntries[0]
  assert.equal(resolvedEntry.resolutionRef, resolution.resolutionId)
  assert.equal(resolvedEntry.recordId, resolution.resolvedTarget.recordId)
  assert.equal(resolvedEntry.videoId, 'cb_0p0')
  assert.deepEqual(resolvedEntry.sourceIdentifier, zero.sourceIdentifier)
  assert.deepEqual(resolvedEntry.projectedPlacement, resolution.guidedPlacement)
  assert.deepEqual(resolvedEntry.defaultTimelinePosition, { state: 'resolved', index: 37 })
  assert.deepEqual(resolvedEntry.publicationEligibility, {
    state: 'eligible',
    gateSet: 'verified-primary'
  })

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
  assert.deepEqual(cb36.defaultTimelinePosition, {
    state: 'resolved',
    index: 38
  })
  assert.deepEqual(cb36.publicationEligibility, {
    state: 'eligible',
    gateSet: 'verified-primary'
  })

  const cb51 = projection.entries.find((entry) => entry.recordId === 'concentrated:51')
  assert.ok(cb51)
  assert.deepEqual(cb51.projectedPlacement, {
    seriesId: 'bleach-manga-cut',
    season: 3,
    episode: 16
  })
  assert.deepEqual(cb51.defaultTimelinePosition, {
    state: 'resolved',
    index: 53
  })
  assert.deepEqual(cb51.publicationEligibility, {
    state: 'eligible',
    gateSet: 'verified-primary'
  })

  const hb14 = projection.entries.find((entry) => entry.recordId === 'hollowed:14')
  assert.ok(hb14)
  assert.deepEqual(hb14.projectedPlacement, {
    seriesId: 'bleach-manga-cut',
    season: 3,
    episode: 17
  })
  assert.deepEqual(hb14.defaultTimelinePosition, {
    state: 'resolved',
    index: 54
  })
  assert.deepEqual(hb14.publicationEligibility, {
    state: 'eligible',
    gateSet: 'verified-primary'
  })

  const hb50 = projection.entries.find((entry) => entry.recordId === 'hollowed:50')
  assert.ok(hb50)
  assert.deepEqual(hb50.projectedPlacement, {
    seriesId: 'bleach-manga-cut',
    season: 3,
    episode: 54
  })
  assert.deepEqual(hb50.defaultTimelinePosition, {
    state: 'resolved',
    index: 91
  })
  assert.deepEqual(hb50.publicationEligibility, {
    state: 'eligible',
    gateSet: 'verified-primary'
  })

  const ch1 = projection.entries.find((entry) => entry.recordId === 'chipped:#01')
  assert.ok(ch1)
  assert.deepEqual(ch1.projectedPlacement, {
    seriesId: 'bleach-manga-cut',
    season: 4,
    episode: 1
  })
  assert.deepEqual(ch1.defaultTimelinePosition, {
    state: 'resolved',
    index: 92
  })
  assert.deepEqual(ch1.publicationEligibility, {
    state: 'eligible',
    gateSet: 'verified-primary'
  })

  const ch2 = projection.entries.find((entry) => entry.recordId === 'chipped:#02')
  assert.ok(ch2)
  assert.deepEqual(ch2.projectedPlacement, {
    seriesId: 'bleach-manga-cut',
    season: 4,
    episode: 2
  })
  assert.deepEqual(ch2.defaultTimelinePosition, {
    state: 'resolved',
    index: 93
  })
  assert.deepEqual(ch2.publicationEligibility, {
    state: 'eligible',
    gateSet: 'verified-primary'
  })

  const EXPECTED_CHIPPED_03_12 = [
    ['chipped:#03', 3, 94],
    ['chipped:#04', 4, 95],
    ['chipped:#05', 5, 96],
    ['chipped:#06', 6, 97],
    ['chipped:#07', 7, 98],
    ['chipped:#08', 8, 99],
    ['chipped:#09', 9, 100],
    ['chipped:#10', 10, 101],
    ['chipped:#11', 11, 102],
    ['chipped:#12', 12, 103]
  ]
  for (const [recordId, episode, index] of EXPECTED_CHIPPED_03_12) {
    const entry = projection.entries.find((candidate) => candidate.recordId === recordId)
    assert.ok(entry, recordId)
    assert.deepEqual(entry.projectedPlacement, {
      seriesId: 'bleach-manga-cut',
      season: 4,
      episode
    }, recordId)
    assert.deepEqual(entry.defaultTimelinePosition, {
      state: 'resolved',
      index
    }, recordId)
    assert.deepEqual(entry.publicationEligibility, {
      state: 'eligible',
      gateSet: 'verified-primary'
    }, recordId)
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

  const registryByVideoId = new Map(registry.entries.map((entry) => [entry.videoId, entry]))
  const { lockedValidatedVideoIds, publishedUnlockedVideoIds } = validateCompatibilityLockPrefix({
    publishedVideoIds: projection.publicationPolicy.currentPublishedVideoIds,
    registryEntries: registry.entries,
    lockedValidatedVideoIds: LOCKED_VALIDATED_VIDEO_IDS
  })
  assert.deepEqual(registryByVideoId.get('cb_0p0'), {
    recordType: 'normalized-record',
    recordId: 'concentrated:0.0',
    projectId: 'concentrated',
    sourceIdentifier: '0.0',
    videoId: 'cb_0p0',
    status: 'published',
    locked: true
  })
  assert.deepEqual(registryByVideoId.get('cb_36'), {
    recordType: 'normalized-record',
    recordId: 'concentrated:36',
    projectId: 'concentrated',
    sourceIdentifier: '36',
    videoId: 'cb_36',
    status: 'published',
    locked: true
  })
  assert.deepEqual(registryByVideoId.get('cb_51'), {
    recordType: 'normalized-record',
    recordId: 'concentrated:51',
    projectId: 'concentrated',
    sourceIdentifier: '51',
    videoId: 'cb_51',
    status: 'published',
    locked: true
  })
  assert.deepEqual(registryByVideoId.get('hb_14'), {
    recordType: 'normalized-record',
    recordId: 'hollowed:14',
    projectId: 'hollowed',
    sourceIdentifier: '14',
    videoId: 'hb_14',
    status: 'published',
    locked: true
  })
  assert.deepEqual(registryByVideoId.get('hb_15'), {
    recordType: 'normalized-record',
    recordId: 'hollowed:15',
    projectId: 'hollowed',
    sourceIdentifier: '15',
    videoId: 'hb_15',
    status: 'published',
    locked: true
  })
  assert.deepEqual(registryByVideoId.get('hb_50'), {
    recordType: 'normalized-record',
    recordId: 'hollowed:50',
    projectId: 'hollowed',
    sourceIdentifier: '50',
    videoId: 'hb_50',
    status: 'published',
    locked: true
  })
  assert.deepEqual(registryByVideoId.get('ch_1'), {
    recordType: 'normalized-record',
    recordId: 'chipped:#01',
    projectId: 'chipped',
    sourceIdentifier: '#01',
    videoId: 'ch_1',
    status: 'published',
    locked: true
  })
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
  const seasonCounts = projection.entries.reduce((counts, entry) => {
    const season = entry.projectedPlacement.season
    counts[season] = (counts[season] || 0) + 1
    return counts
  }, {})
  assert.deepEqual(projectCounts, { concentrated: 53, hollowed: 38, chipped: 12 })
  assert.deepEqual(seasonCounts, { 1: 9, 2: 28, 3: 54, 4: 12 })
  assert.deepEqual(eligibilityCounts, { eligible: 103 })

  return {
    projectedEntries: projection.entries.length,
    projectCounts,
    seasonCounts,
    eligibilityCounts,
    eligibleVideoIds: publication.eligibleIds,
    publishedVideoIds: publication.publishedIds,
    lockedValidatedVideoIds,
    publishedUnlockedVideoIds,
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
    `project counts: ${JSON.stringify(result.projectCounts)}\n` +
    `season counts: ${JSON.stringify(result.seasonCounts)}\n` +
    `eligibility counts: ${JSON.stringify(result.eligibilityCounts)}\n` +
    `eligible primary IDs: ${JSON.stringify(result.eligibleVideoIds)}\n` +
    `published registry IDs: ${JSON.stringify(result.publishedVideoIds)}\n` +
    `locked validated IDs: ${JSON.stringify(result.lockedValidatedVideoIds)}\n` +
    `published unlocked IDs: ${JSON.stringify(result.publishedUnlockedVideoIds)}\n`
  )
}

module.exports = {
  LOCKED_HASHES,
  encodeNormalizedId,
  encodeVariantId,
  expectedDefaultProjection,
  validateCompatibilityLockPrefix,
  validatePublicationPrefix,
  validate
}
