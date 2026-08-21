#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const schemaRoot = path.join(root, 'schemas', 'editorial')
const editorialRoot = path.join(root, 'editorial')

const VALID_AVAILABILITY = new Set([
  'released',
  'planned',
  'deferred',
  'explicitly-not-planned',
  'unresolved'
])
const VALID_RUNTIME_STATES = new Set([
  'known',
  'missing',
  'non-runtime-directive'
])
const VALID_KINDS = new Set(['base', 'special'])
const KNOWN_RESOLVED_ISSUE_IDS = [
  'concentrated-35.5-vs-0.0',
  'hollowed-v3-membership'
]
const EXPECTED_STILL_UNRESOLVED_ISSUE_IDS = [
  'hollowed-v3-future-migration',
  'chipped-first-4.5-media-mapping',
  'ex-current-legacy-and-media-status',
  'cross-project-0.8-relationship',
  'chipped-03-04-time-saved'
]
const CURRENT_RAW_HOLLOWED_RECORD_IDS = [
  'hollowed:14',
  'hollowed:15',
  'hollowed:16',
  'hollowed:17',
  'hollowed:18',
  'hollowed:19',
  'hollowed:20',
  'hollowed:21',
  'hollowed:22',
  'hollowed:23',
  'hollowed:24',
  'hollowed:25',
  'hollowed:26',
  'hollowed:27',
  'hollowed:28',
  'hollowed:29',
  'hollowed:0.8',
  'hollowed:30',
  'hollowed:31',
  'hollowed:32',
  'hollowed:33',
  'hollowed:34',
  'hollowed:35',
  'hollowed:36',
  'hollowed:37',
  'hollowed:38',
  'hollowed:39',
  'hollowed:40',
  'hollowed:41',
  'hollowed:42',
  'hollowed:43',
  'hollowed:44',
  'hollowed:45',
  'hollowed:46',
  'hollowed:47',
  'hollowed:48',
  'hollowed:49',
  'hollowed:50'
]
const HOLLOWED_V3_EVIDENCE_REFS = [
  'hollowed-xlsx:episode-list:I18',
  'hollowed-xlsx:episode-list:I22',
  'hollowed-xlsx:episode-list:I26',
  'hollowed-xlsx:episode-list:I38'
]

function load(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertString(value, label, allowEmpty = false) {
  assert.equal(typeof value, 'string', `${label} must be a string`)
  if (!allowEmpty) assert.ok(value.length > 0, `${label} must not be empty`)
}

function assertEvidenceMap(value, label) {
  assert.ok(isObject(value), `${label} must be an object`)
  assert.ok(Object.keys(value).length > 0, `${label} must not be empty`)
  for (const [fieldPath, refs] of Object.entries(value)) {
    assert.ok(fieldPath.startsWith('/'), `${label} contains a non-pointer field: ${fieldPath}`)
    assert.ok(Array.isArray(refs) && refs.length > 0, `${label}.${fieldPath} must contain evidence references`)
    for (const ref of refs) assertString(ref, `${label}.${fieldPath} evidence reference`)
  }
}

function assertSchemaDocuments() {
  const expected = [
    'source-inventory.schema.json',
    'episode.schema.json',
    'project.schema.json',
    'provenance.schema.json',
    'resolutions.schema.json',
    'variant.schema.json',
    'watch-order.schema.json'
  ]
  assert.deepEqual(fs.readdirSync(schemaRoot).sort(), expected.sort())

  for (const filename of expected) {
    const schema = JSON.parse(fs.readFileSync(path.join(schemaRoot, filename), 'utf8'))
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
    assertString(schema.$id, `${filename}.$id`)
    assert.equal(schema.type, 'object')
  }
}

function validateInventory(inventory) {
  assert.equal(inventory.schemaVersion, 1)
  assert.equal(inventory.authorityScope, 'Bleach editorial metadata only; never torrent or media technical evidence')
  assert.equal(inventory.sources.length, 5)
  const sourceIds = inventory.sources.map((source) => source.sourceId)
  assert.equal(new Set(sourceIds).size, sourceIds.length, 'Source IDs must be unique')

  for (const source of inventory.sources) {
    assert.match(source.sha256, /^[0-9a-f]{64}$/)
    assert.ok(source.relativePath.startsWith('sources/'))
    if (source.kind === 'xlsx') {
      assert.ok(Array.isArray(source.sheets) && source.sheets.length > 0)
      for (const sheet of source.sheets) {
        assert.equal(sheet.state, 'visible', `Unexpected hidden sheet: ${source.filename} / ${sheet.name}`)
        assert.equal(sheet.commentsPresent, false)
        assert.equal(sheet.notesPresent, false)
        assert.ok(sheet.substantiveCellCount >= 0)
        assert.ok(sheet.formattedOnlyCellCount >= 0)
      }
    } else {
      assert.ok(source.pageCount > 0)
      assert.ok(source.linkAnnotationCount >= 0)
    }
  }
}

function validateRecord(record, seenRecordIds, evidenceIds) {
  assertString(record.recordId, 'recordId')
  assert.ok(!seenRecordIds.has(record.recordId), `Duplicate record ID: ${record.recordId}`)
  seenRecordIds.add(record.recordId)
  assertString(record.projectId, `${record.recordId}.projectId`)
  assertString(record.sourceIdentifier.raw, `${record.recordId}.sourceIdentifier.raw`)
  assertString(record.sourceIdentifier.displayed, `${record.recordId}.sourceIdentifier.displayed`)
  assert.ok(Number.isInteger(record.sourceRow) && record.sourceRow >= 2)
  assert.ok(VALID_KINDS.has(record.kind), `${record.recordId} has invalid kind ${record.kind}`)
  assert.ok(VALID_AVAILABILITY.has(record.availability), `${record.recordId} has invalid availability ${record.availability}`)
  assert.equal(typeof record.generatable, 'boolean')
  assertString(record.title, `${record.recordId}.title`)
  assertString(record.mangaMapping.raw, `${record.recordId}.mangaMapping.raw`, true)
  assertString(record.animeMapping.raw, `${record.recordId}.animeMapping.raw`, true)
  assert.ok(Array.isArray(record.mangaMapping.tokens))
  assert.ok(Array.isArray(record.animeMapping.tokens))
  assert.ok(VALID_RUNTIME_STATES.has(record.runtime.state), `${record.recordId} has invalid runtime state`)

  if (record.runtime.state === 'known') {
    assert.ok(Number.isInteger(record.runtime.seconds) && record.runtime.seconds > 0)
    assertString(record.runtime.displayed, `${record.recordId}.runtime.displayed`)
  } else {
    assert.equal(record.runtime.seconds, null)
  }

  if (record.availability !== 'released') assert.equal(record.generatable, false, `${record.recordId} is not released`)
  if (record.generatable) assert.equal(record.runtime.state, 'known', `${record.recordId} is generatable without a known runtime`)
  assert.ok(Array.isArray(record.notes))
  assertEvidenceMap(record.fieldEvidence, `${record.recordId}.fieldEvidence`)
  assert.ok(isObject(record.fieldTransformations), `${record.recordId}.fieldTransformations must be an object`)
  if (record.generatable) assert.ok(record.animeMapping.raw.length > 0, `${record.recordId} lacks an anime source mapping`)

  const requiredEvidencePaths = [
    '/recordId',
    '/projectId',
    '/sourceIdentifier/raw',
    '/sourceIdentifier/displayed',
    '/sourceRow',
    '/kind',
    '/availability',
    '/generatable',
    '/title',
    '/mangaMapping/raw',
    '/mangaMapping/tokens',
    '/animeMapping/raw',
    '/animeMapping/tokens',
    '/runtime',
    '/releaseDate',
    '/lastUpdate',
    '/timeSaved',
    '/notes'
  ]
  for (const fieldPath of requiredEvidencePaths) {
    assert.ok(record.fieldEvidence[fieldPath], `${record.recordId} lacks evidence for ${fieldPath}`)
  }
  assertEvidenceRefsResolve(record, evidenceIds, record.recordId)
}

function validateProject(projectDocument, seenRecordIds, evidenceIds) {
  assert.equal(projectDocument.schemaVersion, 1)
  assertString(projectDocument.project.projectId, 'project.projectId')
  assertString(projectDocument.project.displayName, 'project.displayName')
  assertString(projectDocument.project.authoritySourceId, 'project.authoritySourceId')
  assert.ok(Array.isArray(projectDocument.project.claims))
  assertEvidenceMap(projectDocument.project.fieldEvidence, `${projectDocument.project.projectId}.project.fieldEvidence`)
  assert.ok(Array.isArray(projectDocument.records))
  assertEvidenceRefsResolve(projectDocument.project, evidenceIds, `${projectDocument.project.projectId}.project`)

  const sourceIdentifiers = new Set()
  for (const record of projectDocument.records) {
    assert.equal(record.projectId, projectDocument.project.projectId)
    assert.ok(!sourceIdentifiers.has(record.sourceIdentifier.displayed), `Duplicate project source identifier: ${record.recordId}`)
    sourceIdentifiers.add(record.sourceIdentifier.displayed)
    validateRecord(record, seenRecordIds, evidenceIds)
  }
}

function validateWatchOrder(watchOrder, recordIds, evidenceIds) {
  assert.equal(watchOrder.schemaVersion, 1)
  assert.equal(watchOrder.watchOrderId, 'source-guide-v2')
  assert.equal(watchOrder.authoritySourceId, 'watch-guide-pdf')
  assert.ok(Array.isArray(watchOrder.segments))
  assert.ok(Array.isArray(watchOrder.optionalBranches))
  assert.ok(Array.isArray(watchOrder.unresolvedEndpointReferences))
  assertEvidenceMap(watchOrder.fieldEvidence, 'watchOrder.fieldEvidence')
  assertEvidenceRefsResolve(watchOrder, evidenceIds, 'watchOrder')

  const indexes = new Set()
  for (const segment of watchOrder.segments) {
    assert.ok(!indexes.has(segment.sequenceIndex), `Duplicate watch-order sequence index ${segment.sequenceIndex}`)
    indexes.add(segment.sequenceIndex)
    if (segment.type === 'raw-range') {
      assert.equal(segment.expanded, false)
      for (const endpoint of [segment.start, segment.end]) {
        if (endpoint.resolutionState === 'resolved') assert.ok(recordIds.has(endpoint.recordId), `Unknown watch-order record: ${endpoint.recordId}`)
        else {
          assert.equal(endpoint.recordId, null)
          assertString(endpoint.unresolvedReferenceId, 'unresolved endpoint reference')
        }
      }
    } else {
      assert.equal(segment.type, 'external-handoff')
      assert.equal(segment.addonGeneration, false)
    }
  }

  for (const branch of watchOrder.optionalBranches) {
    assert.equal(branch.type, 'nested-mid-episode-insertion')
    assert.equal(branch.optional, true)
    assert.equal(branch.ordinaryAdjacentEpisode, false)
    assert.ok(recordIds.has(branch.mainlineAnchor.recordId))
    assert.ok(recordIds.has(branch.insertedRecordId))
    assert.ok(recordIds.has(branch.resume.recordId))
    assert.ok(branch.pause.seconds > 0)
    assert.equal(branch.resume.fromSeconds, branch.pause.seconds)
  }
}

function validateVariants(variants, recordIds, evidenceIds) {
  assert.equal(variants.schemaVersion, 1)
  assert.equal(variants.collectionId, 'hollowed-ex')
  assert.equal(variants.defaultLinearMembership, false)
  const variantIds = new Set()

  for (const variant of variants.variants) {
    assert.ok(!variantIds.has(variant.variantId), `Duplicate variant ID: ${variant.variantId}`)
    variantIds.add(variant.variantId)
    assert.equal(variant.optional, true)
    assert.equal(variant.defaultLinearMembership, false)
    assert.equal(variant.currentLegacyStatus, 'unresolved')
    assert.equal(variant.mediaAvailability, 'unresolved')
    assertEvidenceMap(variant.fieldEvidence, `${variant.variantId}.fieldEvidence`)
    assertEvidenceRefsResolve(variant, evidenceIds, variant.variantId)
    for (const recordId of variant.baseRecordIds) assert.ok(recordIds.has(recordId), `Unknown variant base record: ${recordId}`)

    if (variant.branch) {
      const branchIndexes = variant.branch.path.map((entry) => entry.sequenceIndex)
      assert.equal(new Set(branchIndexes).size, branchIndexes.length, `Duplicate ${variant.variantId} branch sequence indexes`)
      for (const entry of variant.branch.path) {
        if (entry.type === 'record') assert.ok(recordIds.has(entry.recordId), `Unknown branch record: ${entry.recordId}`)
        else assert.equal(entry.variantId, variant.variantId)
      }
    }
  }
}

function validateUnresolved(unresolved, evidenceIds) {
  assert.equal(unresolved.schemaVersion, 1)
  assertString(unresolved.policy, 'unresolved.policy')
  assert.ok(Array.isArray(unresolved.issues) && unresolved.issues.length > 0)
  const issueIds = new Set()

  for (const issue of unresolved.issues) {
    assert.ok(!issueIds.has(issue.issueId), `Duplicate unresolved issue: ${issue.issueId}`)
    issueIds.add(issue.issueId)
    assert.equal(issue.status, 'unresolved')
    assert.ok(Array.isArray(issue.claims) && issue.claims.length > 0)
    for (const claim of issue.claims) {
      assertString(claim.sourceClaim, `${issue.issueId}.sourceClaim`)
      assert.ok(Array.isArray(claim.evidenceRefs) && claim.evidenceRefs.length > 0)
    }
    assertString(issue.prohibitedResolution, `${issue.issueId}.prohibitedResolution`)
    assert.ok(Array.isArray(issue.blocks) && issue.blocks.length > 0)
    assertEvidenceRefsResolve(issue, evidenceIds, issue.issueId)
  }

  assert.deepEqual([...issueIds], EXPECTED_STILL_UNRESOLVED_ISSUE_IDS)
  for (const issueId of KNOWN_RESOLVED_ISSUE_IDS) {
    assert.ok(!issueIds.has(issueId), `Resolved issue remains unresolved: ${issueId}`)
  }

  assert.deepEqual(unresolved.issues[0], {
    issueId: 'hollowed-v3-future-migration',
    status: 'unresolved',
    kind: 'future-version-migration',
    claims: [
      {
        sourceClaim: 'The Hollowed source contains combined/reworked v3 notes, but exact future v3 record/media correspondence is not fully represented by the currently available authoritative source set.',
        value: 'future v3 migration requires unavailable assets/mapping and a new owner-reviewed decision',
        evidenceRefs: HOLLOWED_V3_EVIDENCE_REFS
      }
    ],
    prohibitedResolution: 'Do not merge, renumber, alias, obsolete, or replace the current selected raw-record membership with future v3 units unless the v3 assets and mapping are available and a new deliberate owner-reviewed migration occurs.',
    blocks: ['future Hollowed v3 migration/adoption']
  })
}

function validateResolutions(resolutionDocument, recordsById, evidenceIds, watchOrder) {
  assert.equal(resolutionDocument.schemaVersion, 1)
  assert.equal(resolutionDocument.artifactType, 'editorial-resolutions')
  assert.equal(resolutionDocument.authorityDomain, 'project-owner-editorial-decision')
  assert.equal(resolutionDocument.resolutions.length, 2, 'Expected exactly two current editorial resolutions')
  assert.equal(
    new Set(resolutionDocument.resolutions.map((item) => item.resolutionId)).size,
    resolutionDocument.resolutions.length,
    'Editorial resolution IDs must be unique'
  )

  const guidedResolution = resolutionDocument.resolutions.find(
    (item) => item.resolutionId === 'editorial-resolution:concentrated-35.5-to-0.0'
  )
  assert.ok(guidedResolution, 'Concentrated guided-placement resolution is missing')
  assert.deepEqual(guidedResolution, {
    resolutionId: 'editorial-resolution:concentrated-35.5-to-0.0',
    originalIssueId: 'concentrated-35.5-vs-0.0',
    resolutionState: 'resolved',
    decisionAuthority: 'project-owner',
    decisionDate: '2026-08-17',
    guidedIdentity: {
      projectId: 'concentrated',
      rawIdentifier: '35.5'
    },
    resolvedTarget: {
      recordId: 'concentrated:0.0',
      sourceIdentifier: '0.0'
    },
    relativePlacement: {
      afterRecordId: 'concentrated:35',
      beforeRecordId: 'concentrated:36'
    },
    guidedPlacement: {
      seriesId: 'bleach-manga-cut',
      season: 2,
      episode: 28
    },
    sourceClaims: {
      guidedIdentifier: {
        evidenceRefs: ['watch-guide-pdf:page:6:watch-guide']
      },
      resolvedRecord: {
        evidenceRefs: [
          'concentrated-xlsx:episode-list:A38',
          'concentrated-xlsx:episode-list:B38'
        ]
      }
    },
    rationale: {
      classification: 'project-owner-decision',
      text: "The Concentrated spreadsheet identifies this record as 0.0. The project owner resolves it as the Watch Guide's guided 35.5 endpoint and places it after Concentrated 35 and before Concentrated 36."
    }
  })

  const hollowedResolution = resolutionDocument.resolutions.find(
    (item) => item.resolutionId === 'editorial-resolution:hollowed-current-raw-membership'
  )
  assert.ok(hollowedResolution, 'Hollowed current raw-membership resolution is missing')
  assert.deepEqual(hollowedResolution, {
    resolutionId: 'editorial-resolution:hollowed-current-raw-membership',
    originalIssueId: 'hollowed-v3-membership',
    resolutionState: 'resolved',
    decisionAuthority: 'project-owner',
    decisionDate: '2026-08-21',
    resolutionType: 'version-membership-selection',
    projectId: 'hollowed',
    selectedMembership: 'current-raw-records',
    activeRecordIds: CURRENT_RAW_HOLLOWED_RECORD_IDS,
    sourceClaims: {
      versionMembershipNotes: {
        evidenceRefs: HOLLOWED_V3_EVIDENCE_REFS
      }
    },
    futureVersionPolicy: {
      automaticSupersession: false,
      revalidationRequired: true,
      revalidationTrigger: 'v3 media and sufficiently authoritative mapping become available'
    },
    rationale: {
      classification: 'project-owner-decision',
      text: 'The Hollowed source contains unfinished and ambiguous v3 combination/rework notes. The project owner confirms that usable v3 material is not currently available to this project, so the current addon retains the existing raw-record Hollowed membership. Future v3 adoption requires a separate explicit review, and the source notes remain preserved.'
    }
  })
  assert.deepEqual(resolutionDocument.resolutions.map((item) => item.originalIssueId), KNOWN_RESOLVED_ISSUE_IDS)
  for (const resolution of resolutionDocument.resolutions) {
    assertEvidenceRefsResolve(resolution, evidenceIds, resolution.resolutionId)
  }

  const target = recordsById.get(guidedResolution.resolvedTarget.recordId)
  assert.ok(target, `Resolution target does not exist: ${guidedResolution.resolvedTarget.recordId}`)
  assert.equal(target.recordId, 'concentrated:0.0')
  assert.equal(target.sourceIdentifier.raw, '0.0')
  assert.equal(target.sourceIdentifier.displayed, '0.0')
  assert.equal(target.title, 'the rotator / the sand')

  const soulSociety = watchOrder.segments.find((segment) => segment.arc === 'Soul Society Arc')
  assert.ok(soulSociety, 'Soul Society watch-order segment is missing')
  assert.equal(soulSociety.rawRange, '10-35.5')
  assert.deepEqual(soulSociety.end, {
    rawIdentifier: '35.5',
    resolutionState: 'resolved',
    recordId: 'concentrated:0.0',
    resolutionRef: 'editorial-resolution:concentrated-35.5-to-0.0'
  })
  assert.deepEqual(watchOrder.unresolvedEndpointReferences, [])
  assert.deepEqual(watchOrder.fieldEvidence['/segments/1/rawRange'], ['watch-guide-pdf:page:6:watch-guide'])
  assert.deepEqual(watchOrder.fieldEvidence['/segments/1/end/rawIdentifier'], ['watch-guide-pdf:page:6:watch-guide'])
  assert.equal(watchOrder.fieldEvidence['/segments/1'], undefined)
  assert.equal(watchOrder.fieldEvidence['/segments/1/end/recordId'], undefined)
  assert.equal(watchOrder.fieldEvidence['/segments/1/end/resolutionRef'], undefined)
  assert.equal(watchOrder.fieldEvidence['/unresolvedEndpointReferences/0'], undefined)
  assert.equal(Object.hasOwn(guidedResolution, 'fieldEvidence'), false)
  assert.equal(Object.hasOwn(guidedResolution.rationale, 'evidenceRefs'), false)

  assert.equal(new Set(hollowedResolution.activeRecordIds).size, 38)
  assert.deepEqual(
    hollowedResolution.activeRecordIds.map((recordId) => {
      const record = recordsById.get(recordId)
      assert.ok(record, `Hollowed membership resolution references unknown record ${recordId}`)
      assert.equal(record.projectId, 'hollowed', `${recordId} must belong to Hollowed`)
      assert.equal(record.availability, 'released', `${recordId} must be released`)
      assert.equal(record.generatable, true, `${recordId} must be generatable`)
      return record.sourceRow
    }),
    Array.from({ length: 38 }, (_, index) => index + 16),
    'Hollowed current raw membership must match source rows 16 through 53 in source order'
  )
  assert.ok(!hollowedResolution.activeRecordIds.includes('hollowed:11.5'))
  assert.ok(!hollowedResolution.activeRecordIds.some((recordId) => recordId.startsWith('hollowed:ex:')))
  assert.ok(!hollowedResolution.activeRecordIds.includes('hollowed:51'))
}

function assertEvidenceRefsResolve(value, evidenceIds, label) {
  const visit = (current, key) => {
    if (Array.isArray(current)) {
      if (key === 'evidenceRefs') {
        for (const reference of current) assert.ok(evidenceIds.has(reference), `${label} references unknown evidence ${reference}`)
      } else {
        for (const child of current) visit(child, key)
      }
      return
    }
    if (!isObject(current)) return
    for (const [childKey, child] of Object.entries(current)) {
      if (childKey === 'fieldEvidence') {
        for (const references of Object.values(child)) {
          for (const reference of references) assert.ok(evidenceIds.has(reference), `${label} references unknown evidence ${reference}`)
        }
      } else visit(child, childKey)
    }
  }
  visit(value, null)
}

function extractedEvidenceIds(extractedDocuments) {
  const evidenceIds = new Set()
  for (const document of extractedDocuments) {
    if (document.source.kind === 'xlsx') {
      for (const sheet of document.sheets) {
        for (const cell of sheet.cells) {
          assertString(cell.evidenceId, 'cell.evidenceId')
          assert.equal(cell.authorityDomain, 'editorial')
          assert.equal(cell.source.filename, document.source.filename)
          assert.equal(cell.source.sha256, document.source.sha256)
          assert.equal(cell.locator.kind, 'xlsx')
          assert.equal(cell.locator.sheet, sheet.name)
          assert.ok(cell.rawValue !== undefined)
          assert.ok(cell.displayedValue !== undefined)
          evidenceIds.add(cell.evidenceId)
        }
        for (const hyperlink of sheet.hyperlinks) {
          assert.equal(hyperlink.openedDuringExtraction, false)
          assert.equal(hyperlink.authorityUse, 'inventory-only')
        }
      }
    } else {
      for (const page of document.pages) {
        assertString(page.evidenceId, 'page.evidenceId')
        assert.equal(page.authorityDomain, 'editorial')
        assert.equal(page.source.filename, document.source.filename)
        assert.equal(page.source.sha256, document.source.sha256)
        assert.equal(page.locator.kind, 'pdf')
        evidenceIds.add(page.evidenceId)
      }
      for (const hyperlink of document.links) {
        assert.equal(hyperlink.openedDuringExtraction, false)
        assert.equal(hyperlink.authorityUse, 'inventory-only')
      }
    }
  }
  return evidenceIds
}

function validate() {
  assertSchemaDocuments()
  const inventory = load('editorial/source-inventory.json')
  const projects = [
    load('editorial/normalized/concentrated.json'),
    load('editorial/normalized/hollowed.json'),
    load('editorial/normalized/chipped.json')
  ]
  const watchOrder = load('editorial/watch-orders/source-guide-v2.json')
  const variants = load('editorial/variants/ex.json')
  const resolutionDocument = load('editorial/resolutions.json')
  const unresolved = load('editorial/unresolved.json')
  const extractedDocuments = [
    load('editorial/extracted/concentrated.json'),
    load('editorial/extracted/hollowed.json'),
    load('editorial/extracted/chipped.json'),
    load('editorial/extracted/watch-guide.json'),
    load('editorial/extracted/ex-episodes.json')
  ]
  validateInventory(inventory)
  const evidenceIds = extractedEvidenceIds(extractedDocuments)
  const recordIds = new Set()
  for (const project of projects) validateProject(project, recordIds, evidenceIds)
  const recordsById = new Map(projects.flatMap((project) => project.records).map((record) => [record.recordId, record]))
  validateWatchOrder(watchOrder, recordIds, evidenceIds)
  validateResolutions(resolutionDocument, recordsById, evidenceIds, watchOrder)
  validateVariants(variants, recordIds, evidenceIds)
  validateUnresolved(unresolved, evidenceIds)

  return {
    sources: inventory.sources.length,
    projects: projects.length,
    records: recordIds.size,
    variants: variants.variants.length,
    resolutions: resolutionDocument.resolutions.length,
    unresolvedIssues: unresolved.issues.length
  }
}

function main() {
  const summary = validate()
  process.stdout.write(`validated ${summary.sources} sources, ${summary.projects} projects, ${summary.records} records, ${summary.variants} variants, ${summary.resolutions} resolutions, and ${summary.unresolvedIssues} unresolved issues\n`)
}

if (require.main === module) main()

module.exports = {
  validate
}
