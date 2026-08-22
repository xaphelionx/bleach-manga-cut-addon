'use strict'

const assert = require('node:assert/strict')

const PRIMARY_VIDEO_ID = /^(?:cb|hb)_[0-9]+(?:p[0-9]+)?$/
const VERIFIED_GATE = Object.freeze({
  editorialAvailability: 'passed',
  resolvedPlacement: 'passed',
  mediaEvidence: 'passed',
  defaultTimelineContiguity: 'passed',
  blockedBy: []
})

function compareProjectedEntries(left, right) {
  return left.projectedPlacement.season - right.projectedPlacement.season ||
    left.projectedPlacement.episode - right.projectedPlacement.episode ||
    left.videoId.localeCompare(right.videoId)
}

function evidenceValue(record) {
  return record && record.value ? record.value : record
}

function validatePublicationPrefix({ projection, registry, optional, evidenceRecords }) {
  assert.equal(projection.publicationPolicy.primarySeriesPrefixClosed, true)
  assert.equal(projection.publicationPolicy.projectionDoesNotAuthorizePublication, true)
  assert.equal(projection.publicationPolicy.playableOnly, true)

  const approvedIds = projection.publicationPolicy.currentPublishedVideoIds
  assert.ok(Array.isArray(approvedIds), 'currentPublishedVideoIds must be an array')
  assert.ok(approvedIds.length >= 2, 'the validated CB1/CB2 prefix must remain published')
  assert.deepEqual(approvedIds.slice(0, 2), ['cb_1', 'cb_2'], 'the approved prefix must retain CB1 then CB2')
  assert.equal(new Set(approvedIds).size, approvedIds.length, 'approved primary video IDs must be unique')
  const optionalIds = new Set(optional.entries.map((entry) => entry.videoId))
  for (const videoId of approvedIds) {
    assert.ok(!optionalIds.has(videoId), `optional ID ${videoId} cannot enter primary publication`)
    assert.match(videoId, PRIMARY_VIDEO_ID, `approved primary video ID is invalid: ${videoId}`)
  }

  assert.equal(optional.primarySeriesPublicationAllowed, false)
  for (const entry of optional.entries) {
    assert.equal(entry.primarySeriesPlacement, null, `optional entry ${entry.videoId} leaked a placement`)
    assert.notEqual(entry.publicationEligibility.state, 'eligible', `optional entry ${entry.videoId} leaked into publication`)
  }

  const sorted = [...projection.entries].sort(compareProjectedEntries)
  assert.ok(sorted.length > approvedIds.length, 'primary projection must retain a blocked suffix')
  assert.deepEqual(
    sorted.slice(0, 2).map((entry) => entry.videoId),
    ['cb_1', 'cb_2'],
    'the primary timeline must retain CB1 then CB2'
  )

  const projectionByVideoId = new Map()
  for (const entry of sorted) {
    assert.ok(!projectionByVideoId.has(entry.videoId), `duplicate projected video ID ${entry.videoId}`)
    projectionByVideoId.set(entry.videoId, entry)
  }

  const lastApprovedId = approvedIds.at(-1)
  const prefixBlocker = `primary-publication-prefix-after-${lastApprovedId}`
  assert.deepEqual(
    Object.keys(projection.publicationGateSets),
    ['locked-cb1', 'verified-primary', 'unpublished-primary'],
    'publication gate-set inventory changed'
  )
  assert.deepEqual(projection.publicationGateSets['locked-cb1'], VERIFIED_GATE)
  assert.deepEqual(projection.publicationGateSets['verified-primary'], VERIFIED_GATE)
  assert.deepEqual(projection.publicationGateSets['unpublished-primary'], {
    editorialAvailability: 'passed',
    resolvedPlacement: 'passed',
    mediaEvidence: 'unresolved',
    defaultTimelineContiguity: 'blocked',
    blockedBy: ['media-evidence-not-approved', prefixBlocker]
  })

  for (const [index, entry] of sorted.entries()) {
    if (index < approvedIds.length) {
      assert.equal(entry.videoId, approvedIds[index], 'approved IDs must follow canonical primary timeline order')
      assert.deepEqual(entry.publicationEligibility, {
        state: 'eligible',
        gateSet: index === 0 ? 'locked-cb1' : 'verified-primary'
      })
      assert.deepEqual(
        entry.defaultTimelinePosition,
        { state: 'resolved', index: index + 1 },
        `${entry.videoId} lacks the canonical resolved default position`
      )
      continue
    }

    assert.equal(entry.publicationEligibility.state, 'blocked', 'eligible primary entries must form one contiguous prefix')
    assert.equal(
      entry.publicationEligibility.gateSet,
      'unpublished-primary',
      `${entry.videoId} uses the wrong blocked publication gate`
    )
    assert.deepEqual(
      entry.defaultTimelinePosition,
      { state: 'resolved', index: index + 1 },
      `${entry.videoId} lacks the canonical resolved default position`
    )
  }

  const eligibleIds = sorted
    .filter((entry) => entry.publicationEligibility.state === 'eligible')
    .map((entry) => entry.videoId)
  assert.deepEqual(eligibleIds, approvedIds, 'eligible primary IDs must exactly match the approved prefix')

  const registryRecordIds = registry.entries.map((entry) => entry.recordId)
  const registryVideoIds = registry.entries.map((entry) => entry.videoId)
  assert.equal(new Set(registryRecordIds).size, registryRecordIds.length, 'duplicate registry record mappings')
  assert.equal(new Set(registryVideoIds).size, registryVideoIds.length, 'duplicate registry video IDs')
  const publishedIds = registry.entries
    .filter((entry) => entry.status === 'published')
    .map((entry) => entry.videoId)
  assert.deepEqual(publishedIds, approvedIds, 'registry published IDs must exactly match the approved prefix')

  const evidence = evidenceRecords.map(evidenceValue)
  assert.equal(new Set(evidence.map((record) => record.videoId)).size, evidence.length, 'duplicate media evidence video IDs')
  assert.equal(new Set(evidence.map((record) => record.recordId)).size, evidence.length, 'duplicate media evidence record IDs')
  for (const videoId of approvedIds) {
    const entry = projectionByVideoId.get(videoId)
    const registryMatches = registry.entries.filter((record) => record.videoId === videoId)
    assert.equal(registryMatches.length, 1, `${videoId} must have exactly one registry entry`)
    assert.equal(registryMatches[0].recordId, entry.recordId, `${videoId} registry recordId mismatch`)
    assert.equal(registryMatches[0].projectId, entry.projectId, `${videoId} registry projectId mismatch`)

    const evidenceMatches = evidence.filter(
      (record) => record.videoId === videoId && record.recordId === entry.recordId
    )
    assert.equal(evidenceMatches.length, 1, `${videoId} must have exactly one matching verified-media record`)
    assert.equal(evidenceMatches[0].verificationState, 'verified', `${videoId} media evidence must be verified`)
  }

  return {
    approvedIds,
    eligibleIds,
    publishedIds,
    eligibleEntries: sorted.slice(0, approvedIds.length)
  }
}

module.exports = {
  compareProjectedEntries,
  validatePublicationPrefix
}
