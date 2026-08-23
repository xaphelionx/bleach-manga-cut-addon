'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const childProcess = require('node:child_process')
const { test } = require('node:test')

const root = path.resolve(__dirname, '..')
const inventory = require('../editorial/source-inventory.json')
const extractedConcentrated = require('../editorial/extracted/concentrated.json')
const extractedHollowed = require('../editorial/extracted/hollowed.json')
const extractedChipped = require('../editorial/extracted/chipped.json')
const concentrated = require('../editorial/normalized/concentrated.json')
const hollowed = require('../editorial/normalized/hollowed.json')
const chipped = require('../editorial/normalized/chipped.json')
const watchOrder = require('../editorial/watch-orders/source-guide-v2.json')
const variants = require('../editorial/variants/ex.json')
const resolutionDocument = require('../editorial/resolutions.json')
const resolutionSchema = require('../schemas/editorial/resolutions.schema.json')
const unresolved = require('../editorial/unresolved.json')
const projection = require('../projection/stremio/public-projection.json')
const { validate } = require('../scripts/validate-editorial')
const { buildOutputs } = require('../scripts/extract-editorial-sources')

const expectedSourceHashes = {
  '!Concentrated Bleach Info.xlsx': 'f3eb61d7415800dcd105a3aea029b8cdd28c25e489874e6001f46106844660e2',
  'Bleach Watch Guide V2.pdf': 'd5eca40c6983542c7e4a7753f0ce42e996ef7b1b466c606c1e1557bb5837a351',
  'Chipped Bleach Info.xlsx': 'a13495e4ebb2b731b9e033c489136eb2bf2e9ae1ad26e84fa47f4cc155ea13f6',
  'EX Episodes Info.pdf': 'bbffbfcc0e8ee175530be3692175cc0674dfa34df33992f07a71a89931dc9f81',
  'Hollowed Bleach Info.xlsx': '58cdbe6ab95d1d28dc724eb114865cb1999050f545462a2b496128d7dde404ce'
}

const lockedRepositoryHashes = {
  'data/catalog/bleach-manga-cut.json': '279dd68b24cee6e1613f1081b4ff7ae69ade2b177d2f27fa73b8e425542c58c2',
  'data/meta/bleach-manga-cut.json': '74875b8d3c69736e2229b65cf267bbe655326816868daa30a0afb92874f42c88',
  'data/provenance/cb_1.json': '991843abb80a3c34d6646676cb9f9659dc3080ee7ba87ea38bfd9ad19985753b',
  'data/provenance/cb_2.json': '0202e5ec71962e05f872768e066f78f5083e454b8459b465b7ef2eda31e402bf',
  'data/stream/cb_1.json': '83dd2675d23da8fc557b327010e52c56c34c78f30f26c61cf18a6f6b2729da6b',
  'data/stream/cb_2.json': 'ce3df66c03ce61997e6913e32b21dd5c756e41e55a2ebb6c6a1681a6ba0b56c1',
  'src/addon.js': '70b67804c90ac29d4b59a2421eff24597b91114e124a10db652a86de38e00893',
  'src/video-id.js': '1de90e19e744b13e2d84c9851730972a25333ac0d853092c96e80b9cf70f7a36',
  'package.json': 'fafb31cdfca781af226a2fa99def0b52c5dbbbc2d187118c1271cf334e104c23',
  'package-lock.json': 'a1e290dec14dd2257ae8f6cb0d5d04a384c1acf0605aeb756ae85483027c8ec9'
}
const currentRawHollowedRecordIds = [
  ...Array.from({ length: 16 }, (_, index) => `hollowed:${index + 14}`),
  'hollowed:0.8',
  ...Array.from({ length: 21 }, (_, index) => `hollowed:${index + 30}`)
]
const hollowedV3EvidenceRefs = [
  'hollowed-xlsx:episode-list:I18',
  'hollowed-xlsx:episode-list:I22',
  'hollowed-xlsx:episode-list:I26',
  'hollowed-xlsx:episode-list:I38'
]

function hashFile(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relativePath))).digest('hex')
}

function jsonFilesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return jsonFilesUnder(absolutePath)
    return entry.isFile() && entry.name.endsWith('.json') ? [path.relative(root, absolutePath)] : []
  })
}

function findRecord(project, identifier) {
  const record = project.records.find((candidate) => candidate.sourceIdentifier.displayed === identifier)
  assert.ok(record, `Missing ${project.project.projectId} record ${identifier}`)
  return record
}

function availabilityCounts(project) {
  return project.records.reduce((counts, record) => {
    counts[record.availability] = (counts[record.availability] || 0) + 1
    return counts
  }, {})
}

test('authoritative source hashes match the approved five snapshots', () => {
  assert.deepEqual(
    Object.fromEntries(inventory.sources.map((source) => [source.filename, source.sha256])),
    expectedSourceHashes
  )
  for (const [filename, expected] of Object.entries(expectedSourceHashes)) {
    assert.equal(hashFile(`sources/${filename}`), expected, filename)
  }
})

test('sheet inventory is complete and has no hidden-sheet surprises', () => {
  const spreadsheets = inventory.sources.filter((source) => source.kind === 'xlsx')
  assert.deepEqual(
    Object.fromEntries(spreadsheets.map((source) => [source.filename, source.sheets.map((sheet) => sheet.name)])),
    {
      '!Concentrated Bleach Info.xlsx': ['Episode List', 'Arc List'],
      'Hollowed Bleach Info.xlsx': ['Episode List'],
      'Chipped Bleach Info.xlsx': ['Chipped Bleach Info', 'Sheet2']
    }
  )
  for (const source of spreadsheets) {
    for (const sheet of source.sheets) {
      assert.equal(sheet.state, 'visible', `${source.filename}/${sheet.name}`)
      assert.equal(sheet.commentsPresent, false)
      assert.equal(sheet.notesPresent, false)
    }
  }
  const chippedHelper = spreadsheets
    .find((source) => source.filename === 'Chipped Bleach Info.xlsx')
    .sheets.find((sheet) => sheet.name === 'Sheet2')
  assert.equal(chippedHelper.role, 'empty-helper')
  assert.equal(chippedHelper.substantiveCellCount, 0)
})

test('primary record counts exclude formatting-only and helper rows', () => {
  assert.equal(extractedConcentrated.episodeRows.length, 90)
  assert.equal(extractedHollowed.episodeRows.length, 64)
  assert.equal(extractedChipped.episodeRows.length, 12)
  assert.equal(concentrated.records.length, 90)
  assert.equal(hollowed.records.length, 64)
  assert.equal(chipped.records.length, 12)
})

test('source identifiers remain strings with exact meaningful formatting', () => {
  const values = [
    findRecord(concentrated, '0.0').sourceIdentifier.displayed,
    findRecord(concentrated, '0.8').sourceIdentifier.displayed,
    findRecord(hollowed, '0.8').sourceIdentifier.displayed,
    findRecord(hollowed, '11.5').sourceIdentifier.displayed,
    findRecord(concentrated, '45.5').sourceIdentifier.displayed,
    findRecord(concentrated, '50.5').sourceIdentifier.displayed,
    findRecord(chipped, '#01').sourceIdentifier.displayed,
    findRecord(concentrated, '01').sourceIdentifier.displayed
  ]
  assert.deepEqual(values, ['0.0', '0.8', '0.8', '11.5', '45.5', '50.5', '#01', '01'])
  for (const value of values) assert.equal(typeof value, 'string')
})

test('runtime display parsing preserves Hollowed mm:ss semantics', () => {
  assert.deepEqual(findRecord(concentrated, '01').runtime, {
    state: 'known',
    raw: '0.012673611111111111',
    displayed: '18:15',
    seconds: 1095
  })
  assert.deepEqual(findRecord(hollowed, '01').runtime, {
    state: 'known',
    raw: '0.06825231481481482',
    displayed: '38:17',
    seconds: 2297
  })
  assert.deepEqual(findRecord(hollowed, '50').runtime, {
    state: 'known',
    raw: '0.10243055555555555',
    displayed: '27:30',
    seconds: 1650
  })
})

test('availability and generatable classifications match approved decisions', () => {
  assert.deepEqual(availabilityCounts(concentrated), {
    released: 53,
    deferred: 1,
    'explicitly-not-planned': 1,
    planned: 35
  })
  assert.deepEqual(availabilityCounts(hollowed), {
    released: 52,
    planned: 12
  })
  assert.deepEqual(availabilityCounts(chipped), { released: 12 })
  for (const record of hollowed.records.filter((record) => Number(record.sourceIdentifier.displayed) >= 51)) {
    assert.equal(record.availability, 'planned')
    assert.equal(record.generatable, false)
    assert.equal(record.runtime.state, 'missing')
  }
  for (const record of concentrated.records.filter((record) => record.runtime.state === 'missing')) {
    assert.equal(record.availability, 'planned')
    assert.equal(record.generatable, false)
  }
})

test('Concentrated 45.5 and 50.5 preserve directive semantics', () => {
  const deferred = findRecord(concentrated, '45.5')
  assert.equal(deferred.availability, 'deferred')
  assert.equal(deferred.generatable, false)
  assert.deepEqual(deferred.runtime, {
    state: 'non-runtime-directive',
    raw: 'some other time',
    displayed: 'some other time',
    seconds: null
  })

  const notPlanned = findRecord(concentrated, '50.5')
  assert.equal(notPlanned.availability, 'explicitly-not-planned')
  assert.equal(notPlanned.generatable, false)
  assert.deepEqual(notPlanned.runtime, {
    state: 'non-runtime-directive',
    raw: 'not happening',
    displayed: 'not happening',
    seconds: null
  })
})

test('Concentrated and Hollowed 0.8 remain distinct records', () => {
  assert.equal(findRecord(concentrated, '0.8').recordId, 'concentrated:0.8')
  assert.equal(findRecord(hollowed, '0.8').recordId, 'hollowed:0.8')
  const issue = unresolved.issues.find((candidate) => candidate.issueId === 'cross-project-0.8-relationship')
  assert.ok(issue)
  assert.equal(issue.status, 'unresolved')
})

test('HB11.5 is a nested mid-episode insertion around CB50', () => {
  assert.deepEqual(watchOrder.optionalBranches, [
    {
      branchId: 'cb50-hb11.5-insertion',
      sequenceIndex: 1,
      type: 'nested-mid-episode-insertion',
      optional: true,
      mainlineAnchor: {
        recordId: 'concentrated:50',
        sourceIdentifier: '50'
      },
      pause: {
        rawTimestamp: '16:15',
        seconds: 975
      },
      insertedRecordId: 'hollowed:11.5',
      resume: {
        recordId: 'concentrated:50',
        fromRawTimestamp: '16:15',
        fromSeconds: 975
      },
      ordinaryAdjacentEpisode: false
    }
  ])
})

test('EX27 is an optional branch replacing Hollowed 27-29', () => {
  const ex27 = variants.variants.find((variant) => variant.variantId === 'hollowed:ex:27')
  assert.deepEqual(ex27.baseRecordIds, ['hollowed:27', 'hollowed:28', 'hollowed:29'])
  assert.equal(ex27.relationship, 'optional-combined-replacement')
  assert.equal(ex27.defaultLinearMembership, false)
  assert.deepEqual(ex27.branch, {
    branchId: 'hollowed-ex27-path',
    replacesRecordIds: ['hollowed:27', 'hollowed:28', 'hollowed:29'],
    path: [
      { sequenceIndex: 1, type: 'record', recordId: 'hollowed:26' },
      { sequenceIndex: 2, type: 'variant', variantId: 'hollowed:ex:27' },
      { sequenceIndex: 3, type: 'record', recordId: 'hollowed:0.8' },
      { sequenceIndex: 4, type: 'record', recordId: 'hollowed:30' }
    ]
  })
})

test('the owner resolution links guided 35.5 to source record 0.0 without altering either source claim', () => {
  const segment = watchOrder.segments.find((candidate) => candidate.rawRange === '10-35.5')
  assert.deepEqual(segment.end, {
    rawIdentifier: '35.5',
    resolutionState: 'resolved',
    recordId: 'concentrated:0.0',
    resolutionRef: 'editorial-resolution:concentrated-35.5-to-0.0'
  })
  assert.equal(segment.expanded, false)
  assert.equal(segment.rawRange, '10-35.5')
  assert.deepEqual(watchOrder.unresolvedEndpointReferences, [])
  assert.equal(concentrated.records.some((record) => record.sourceIdentifier.displayed === '35.5'), false)
  const sourceRecord = findRecord(concentrated, '0.0')
  assert.equal(sourceRecord.recordId, 'concentrated:0.0')
  assert.deepEqual(sourceRecord.sourceIdentifier, { raw: '0.0', displayed: '0.0' })
  assert.equal(sourceRecord.title, 'the rotator / the sand')

  const resolution = resolutionDocument.resolutions.find(
    (candidate) => candidate.resolutionId === 'editorial-resolution:concentrated-35.5-to-0.0'
  )
  assert.ok(resolution)
  assert.equal(resolutionDocument.authorityDomain, 'project-owner-editorial-decision')
  assert.equal(resolution.decisionAuthority, 'project-owner')
  assert.equal(resolution.decisionDate, '2026-08-17')
  assert.equal(resolution.originalIssueId, 'concentrated-35.5-vs-0.0')
  assert.deepEqual(resolution.sourceClaims, {
    guidedIdentifier: {
      evidenceRefs: ['watch-guide-pdf:page:6:watch-guide']
    },
    resolvedRecord: {
      evidenceRefs: [
        'concentrated-xlsx:episode-list:A38',
        'concentrated-xlsx:episode-list:B38'
      ]
    }
  })
  assert.deepEqual(unresolved.issues.map((issue) => issue.issueId), [
    'hollowed-v3-future-migration',
    'chipped-first-4.5-media-mapping',
    'ex-current-legacy-and-media-status',
    'cross-project-0.8-relationship',
    'chipped-03-04-time-saved'
  ])
})

test('the owner resolution selects current raw Hollowed membership without rewriting v3 source claims', () => {
  assert.equal(resolutionDocument.resolutions.length, 2)
  const resolution = resolutionDocument.resolutions.find(
    (candidate) => candidate.resolutionId === 'editorial-resolution:hollowed-current-raw-membership'
  )
  assert.ok(resolution)
  assert.equal(resolution.originalIssueId, 'hollowed-v3-membership')
  assert.equal(resolution.resolutionType, 'version-membership-selection')
  assert.equal(resolution.projectId, 'hollowed')
  assert.equal(resolution.selectedMembership, 'current-raw-records')
  assert.deepEqual(resolution.activeRecordIds, currentRawHollowedRecordIds)
  assert.deepEqual(resolution.sourceClaims.versionMembershipNotes.evidenceRefs, hollowedV3EvidenceRefs)
  assert.deepEqual(resolution.futureVersionPolicy, {
    automaticSupersession: false,
    revalidationRequired: true,
    revalidationTrigger: 'v3 media and sufficiently authoritative mapping become available'
  })

  const sourceClaim = hollowed.project.claims.find(
    (candidate) => candidate.claimId === 'hollowed-v3-membership'
  )
  assert.deepEqual(sourceClaim, {
    claimId: 'hollowed-v3-membership',
    kind: 'version-membership',
    raw: 'The spreadsheet contains v3 combination/rework notes whose active membership is unresolved.',
    interpretationState: 'unresolved',
    evidenceRefs: hollowedV3EvidenceRefs
  })
  assert.deepEqual(
    [18, 22, 26, 38].map((sourceRow) => {
      const record = hollowed.records.find((candidate) => candidate.sourceRow === sourceRow)
      return record.notes[0]
    }),
    [
      { text: 'Combined in v3 (Now 16)', evidenceRefs: ['hollowed-xlsx:episode-list:I18'] },
      { text: 'Combined in v3 (Now 19)', evidenceRefs: ['hollowed-xlsx:episode-list:I22'] },
      { text: 'Pacing Reworked in v3                     (Now 22 - 25)', evidenceRefs: ['hollowed-xlsx:episode-list:I26'] },
      { text: 'Combined in v3 (Now 34)', evidenceRefs: ['hollowed-xlsx:episode-list:I38'] }
    ]
  )

  assert.equal(unresolved.issues.some((issue) => issue.issueId === 'hollowed-v3-membership'), false)
  const futureMigration = unresolved.issues.find(
    (issue) => issue.issueId === 'hollowed-v3-future-migration'
  )
  assert.ok(futureMigration)
  assert.equal(futureMigration.kind, 'future-version-migration')
  assert.deepEqual(futureMigration.blocks, ['future Hollowed v3 migration/adoption'])
  assert.equal(futureMigration.blocks.some((block) => /current raw|technical acquisition/i.test(block)), false)
})

test('the editorial resolution schema is a closed union of placement and membership decisions', () => {
  assert.deepEqual(resolutionSchema.$defs.resolution.oneOf, [
    { $ref: '#/$defs/guidedPlacementResolution' },
    { $ref: '#/$defs/versionMembershipSelectionResolution' }
  ])
  assert.equal(resolutionSchema.$defs.guidedPlacementResolution.additionalProperties, false)
  assert.equal(resolutionSchema.$defs.versionMembershipSelectionResolution.additionalProperties, false)
  assert.equal(
    resolutionSchema.$defs.versionMembershipSelectionResolution.properties.resolutionType.const,
    'version-membership-selection'
  )
  assert.equal(
    resolutionSchema.$defs.versionMembershipSelectionResolution.properties.selectedMembership.const,
    'current-raw-records'
  )
  assert.equal(resolutionSchema.$defs.futureVersionPolicy.additionalProperties, false)
  assert.equal(resolutionSchema.$defs.futureVersionPolicy.properties.automaticSupersession.const, false)
  assert.equal(resolutionSchema.$defs.futureVersionPolicy.properties.revalidationRequired.const, true)
})

test('Chipped uncertainty and raw first-4.5 update claim are preserved', () => {
  for (const identifier of ['#03', '#04']) {
    const record = findRecord(chipped, identifier)
    assert.equal(record.timeSaved.uncertain, true)
    assert.equal(record.timeSaved.seconds, null)
    assert.equal(record.timeSaved.percent, null)
    assert.match(record.timeSaved.raw, /\*$/)
  }
  const claim = chipped.project.claims.find((candidate) => candidate.claimId === 'chipped-first-4.5-updated')
  assert.deepEqual(claim, {
    claimId: 'chipped-first-4.5-updated',
    kind: 'version-update',
    raw: 'Only the first 4.5 episodes are updated. The rest of them are older, so don’t report any issues to the creator as he’s retired from doing this',
    interpretationState: 'unresolved',
    evidenceRefs: ['watch-guide-pdf:page:5:chipped-bleach-breakdown']
  })
  assert.equal(chipped.records.some((record) => record.sourceIdentifier.displayed === '4.5'), false)
})

test('editorial records and relationships satisfy the local schemas and invariants', () => {
  assert.deepEqual(validate(), {
    sources: 5,
    projects: 3,
    records: 166,
    variants: 3,
    resolutions: 2,
    unresolvedIssues: 5
  })
})

test('re-extraction is byte-stable against unchanged source hashes', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bleach-editorial-'))
  try {
    childProcess.execFileSync(
      process.execPath,
      [path.join(root, 'scripts', 'extract-editorial-sources.js'), '--output-root', temporaryRoot],
      { cwd: root, stdio: 'pipe' }
    )
    const extractorOwnedFiles = [...buildOutputs().keys()].sort()
    assert.equal(extractorOwnedFiles.length, 12)
    assert.deepEqual(
      jsonFilesUnder(path.join(root, 'editorial')).sort(),
      [...extractorOwnedFiles, 'editorial/resolutions.json'].sort()
    )
    for (const relativePath of extractorOwnedFiles) {
      assert.equal(
        fs.readFileSync(path.join(temporaryRoot, relativePath), 'utf8'),
        fs.readFileSync(path.join(root, relativePath), 'utf8'),
        relativePath
      )
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('current 92-entry prefix preserves the original locked prefix and Chipped 01 boundary', () => {
  for (const [relativePath, expectedHash] of Object.entries(lockedRepositoryHashes)) {
    assert.equal(hashFile(relativePath), expectedHash, relativePath)
  }

  const catalog = require('../data/catalog/bleach-manga-cut.json')
  const meta = require('../data/meta/bleach-manga-cut.json')
  const stream = require('../data/stream/cb_1.json')
  const torrent = stream.streams[0]
  assert.equal(catalog.metas[0].id, 'bleach-manga-cut')
  assert.equal(meta.meta.id, 'bleach-manga-cut')
  assert.equal(meta.meta.videos.length, 92)
  assert.deepEqual(
    meta.meta.videos.map((video) => video.id),
    projection.publicationPolicy.currentPublishedVideoIds
  )
  assert.equal(meta.meta.videos.filter((video) => video.season === 1).length, 9)
  assert.equal(meta.meta.videos.filter((video) => video.season === 2).length, 28)
  assert.equal(meta.meta.videos.filter((video) => video.season === 3).length, 54)
  assert.equal(meta.meta.videos.filter((video) => video.season === 4).length, 1)
  assert.equal(meta.meta.videos.some((video) => video.id === 'ch_2' || video.id === 'cb_52'), false)
  const video = (videoId) => meta.meta.videos.find((candidate) => candidate.id === videoId)
  assert.deepEqual(video('cb_1'), {
    id: 'cb_1',
    season: 1,
    episode: 1,
    title: 'Death and Strawberry',
    runtime: '18'
  })
  assert.deepEqual(video('cb_9'), {
    id: 'cb_9',
    season: 1,
    episode: 9,
    title: 'Menos Grande',
    runtime: '27'
  })
  assert.deepEqual(video('cb_10'), {
    id: 'cb_10',
    season: 2,
    episode: 1,
    title: 'The Death Trilogy Overture',
    runtime: '44'
  })
  assert.deepEqual(video('cb_27'), {
    id: 'cb_27',
    season: 2,
    episode: 18,
    title: 'memories in the rain2',
    runtime: '31'
  })
  assert.deepEqual(video('cb_27p5'), {
    id: 'cb_27p5',
    season: 2,
    episode: 19,
    title: 'Meanwhile, in the Living World',
    runtime: '4'
  })
  assert.deepEqual(video('cb_28'), {
    id: 'cb_28',
    season: 2,
    episode: 20,
    title: 'Surrounding Clutch',
    runtime: '21'
  })
  assert.deepEqual(video('cb_32'), {
    id: 'cb_32',
    season: 2,
    episode: 24,
    title: 'Cat and Hornet',
    runtime: '25'
  })
  assert.deepEqual(video('cb_35'), {
    id: 'cb_35',
    season: 2,
    episode: 27,
    title: 'AND THE RAIN LEFT OFF',
    runtime: '28'
  })
  assert.deepEqual(video('cb_0p0'), {
    id: 'cb_0p0',
    season: 2,
    episode: 28,
    title: 'the rotator / the sand',
    runtime: '7'
  })
  assert.equal(video('cb_36').season, 3)
  assert.equal(video('cb_36').episode, 1)
  assert.equal(video('cb_51').season, 3)
  assert.equal(video('cb_51').episode, 16)
  assert.deepEqual(video('hb_14'), {
    id: 'hb_14',
    season: 3,
    episode: 17,
    title: 'The Slashing Opera',
    runtime: '31'
  })
  assert.equal(video('hb_0p8').season, 3)
  assert.equal(video('hb_0p8').episode, 33)
  assert.equal(video('hb_50').season, 3)
  assert.equal(video('hb_50').episode, 54)
  assert.deepEqual(video('ch_1'), {
    id: 'ch_1',
    season: 4,
    episode: 1,
    title: 'The Lost Agent',
    runtime: '32'
  })
  assert.equal(torrent.name, '[P2P🧲] 576p')
  assert.equal(torrent.title, '🎬 Death and Strawberry\n📖 [001] 🕒 18:15\n💾 186.52 MB\n🎞️ HEVC 🔊 AAC 2.0 • JPN + ENG')
  assert.equal(torrent.infoHash, 'd0cb7e0c8bad014c055bf2becf2694dcfde2b8e8')
  assert.deepEqual(torrent.sources, [])
  assert.equal(torrent.fileIdx, 0)
  assert.deepEqual(torrent.behaviorHints, {
    bingeGroup: 'bleach-manga-cut|p2p|standard',
    videoSize: 186522416,
    filename: '01 - Death and Strawberry.mkv'
  })
})
