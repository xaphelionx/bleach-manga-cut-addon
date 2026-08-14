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
const unresolved = require('../editorial/unresolved.json')
const { validate } = require('../scripts/validate-editorial')

const expectedSourceHashes = {
  '!Concentrated Bleach Info.xlsx': 'f3eb61d7415800dcd105a3aea029b8cdd28c25e489874e6001f46106844660e2',
  'Bleach Watch Guide V2.pdf': 'd5eca40c6983542c7e4a7753f0ce42e996ef7b1b466c606c1e1557bb5837a351',
  'Chipped Bleach Info.xlsx': 'a13495e4ebb2b731b9e033c489136eb2bf2e9ae1ad26e84fa47f4cc155ea13f6',
  'EX Episodes Info.pdf': 'bbffbfcc0e8ee175530be3692175cc0674dfa34df33992f07a71a89931dc9f81',
  'Hollowed Bleach Info.xlsx': '58cdbe6ab95d1d28dc724eb114865cb1999050f545462a2b496128d7dde404ce'
}

const lockedRepositoryHashes = {
  'data/catalog/bleach-manga-cut.json': '279dd68b24cee6e1613f1081b4ff7ae69ade2b177d2f27fa73b8e425542c58c2',
  'data/meta/bleach-manga-cut.json': '62457501d66303d043fa9f2ae8bf4ffb8275b86bd078892ce33b66f1cc9a026e',
  'data/provenance/cb_1.json': '991843abb80a3c34d6646676cb9f9659dc3080ee7ba87ea38bfd9ad19985753b',
  'data/provenance/cb_2.json': '0202e5ec71962e05f872768e066f78f5083e454b8459b465b7ef2eda31e402bf',
  'data/stream/cb_1.json': '83dd2675d23da8fc557b327010e52c56c34c78f30f26c61cf18a6f6b2729da6b',
  'data/stream/cb_2.json': 'ce3df66c03ce61997e6913e32b21dd5c756e41e55a2ebb6c6a1681a6ba0b56c1',
  'src/addon.js': 'e24acb04a537b6954412c0c679796fb311d0665f3b5947866ff0ed6be1726b19',
  'src/video-id.js': 'be6101787d29dc1c613c951e6eb9dd9712f7368a3087a845621ec39f9bf65733',
  'package.json': 'fafb31cdfca781af226a2fa99def0b52c5dbbbc2d187118c1271cf334e104c23',
  'package-lock.json': 'a1e290dec14dd2257ae8f6cb0d5d04a384c1acf0605aeb756ae85483027c8ec9'
}

function hashFile(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relativePath))).digest('hex')
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

test('35.5 and 0.0 remain separate unresolved source claims', () => {
  const segment = watchOrder.segments.find((candidate) => candidate.rawRange === '10-35.5')
  assert.deepEqual(segment.end, {
    rawIdentifier: '35.5',
    resolutionState: 'unresolved',
    recordId: null,
    unresolvedReferenceId: 'watch-endpoint:concentrated:35.5'
  })
  assert.equal(segment.expanded, false)
  assert.equal(concentrated.records.some((record) => record.sourceIdentifier.displayed === '35.5'), false)
  assert.equal(findRecord(concentrated, '0.0').recordId, 'concentrated:0.0')
  const issue = unresolved.issues.find((candidate) => candidate.issueId === 'concentrated-35.5-vs-0.0')
  assert.deepEqual(issue.claims.map((claim) => claim.value), ['35.5', '0.0'])
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
    unresolvedIssues: 6
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
    const committedFiles = childProcess.execFileSync(
      'find',
      [path.join(root, 'editorial'), '-type', 'f', '-name', '*.json'],
      { encoding: 'utf8' }
    ).trim().split('\n').map((filename) => path.relative(root, filename)).sort()
    for (const relativePath of committedFiles) {
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

test('two-episode POC output preserves CB1 behavior and locked compatibility hashes', () => {
  for (const [relativePath, expectedHash] of Object.entries(lockedRepositoryHashes)) {
    assert.equal(hashFile(relativePath), expectedHash, relativePath)
  }

  const catalog = require('../data/catalog/bleach-manga-cut.json')
  const meta = require('../data/meta/bleach-manga-cut.json')
  const stream = require('../data/stream/cb_1.json')
  const torrent = stream.streams[0]
  assert.equal(catalog.metas[0].id, 'bleach-manga-cut')
  assert.equal(meta.meta.id, 'bleach-manga-cut')
  assert.deepEqual(meta.meta.videos, [
    {
      id: 'cb_1',
      season: 1,
      episode: 1,
      title: 'Death and Strawberry',
      runtime: '18'
    },
    {
      id: 'cb_2',
      season: 1,
      episode: 2,
      title: 'Starter',
      runtime: '32'
    }
  ])
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
