'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { after, before, test } = require('node:test')
const { serveHTTP } = require('stremio-addon-sdk')

const addon = require('../src/addon')
const catalog = require('../data/catalog/bleach-manga-cut.json')
const meta = require('../data/meta/bleach-manga-cut.json')
const cb1Stream = require('../data/stream/cb_1.json')
const cb1Provenance = require('../data/provenance/cb_1.json')
const cb2Stream = require('../data/stream/cb_2.json')
const cb2Provenance = require('../data/provenance/cb_2.json')

const root = path.resolve(__dirname, '..')
let baseUrl
let server

before(async () => {
  const running = await serveHTTP(addon, { port: 0 })
  baseUrl = running.url.replace('/manifest.json', '')
  server = running.server
})

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
})

test('manifest declares only the POC series resources and identifiers', () => {
  assert.equal(addon.manifest.id, 'community.xaphelionx.bleach-manga-cut')
  assert.deepEqual(addon.manifest.types, ['series'])
  assert.deepEqual(addon.manifest.catalogs, [
    {
      type: 'series',
      id: 'bleach-manga-cut',
      name: 'Bleach Manga Cut'
    }
  ])
  assert.deepEqual(addon.manifest.resources, [
    'catalog',
    {
      name: 'meta',
      types: ['series'],
      idPrefixes: ['bleach-manga-cut']
    },
    {
      name: 'stream',
      types: ['series'],
      idPrefixes: ['cb_']
    }
  ])
  assert.equal('config' in addon.manifest, false)
  assert.equal('behaviorHints' in addon.manifest, false)
})

test('catalog and meta contain exactly the ordered two-episode POC', () => {
  assert.equal(catalog.metas.length, 1)
  assert.equal(meta.meta.videos.length, 2)

  const catalogItem = catalog.metas[0]
  const series = meta.meta

  assert.equal(catalogItem.id, 'bleach-manga-cut')
  assert.equal(catalogItem.id, series.id)
  assert.equal(catalogItem.type, series.type)
  assert.equal(catalogItem.name, series.name)
  assert.deepEqual(series.videos, [
    { id: 'cb_1', season: 1, episode: 1, title: 'Death and Strawberry', runtime: '18' },
    { id: 'cb_2', season: 1, episode: 2, title: 'Starter', runtime: '32' }
  ])
  assert.equal(cb1Provenance.id, series.videos[0].id)
  assert.equal(cb1Provenance.editorial.exactEditRuntime, '00:18:15')
  assert.equal(cb1Provenance.editorial.normalizedExactRuntime, '18:15')
  assert.equal(cb2Provenance.id, series.videos[1].id)
  assert.equal(cb2Provenance.editorial.exactEditRuntime, '00:32:47')
  assert.equal(cb2Provenance.editorial.normalizedExactRuntime, '32:47')
})

test('catalog and full meta classify the series as anime in Japanese', () => {
  assert.ok(meta.meta.genres.includes('Anime'))
  assert.ok(meta.meta.genres.includes('Animation'))
  assert.equal(meta.meta.language, 'Japanese')
  assert.ok(catalog.metas[0].genres.includes('Anime'))
  assert.deepEqual(catalog.metas[0].genres, meta.meta.genres)
  assert.equal('country' in meta.meta, false)
  assert.equal('country' in catalog.metas[0], false)
})

test('both streams present their verified local media metadata', () => {
  for (const stream of [cb1Stream, cb2Stream]) {
    assert.equal(stream.streams.length, 1)
    const torrent = stream.streams[0]
    assert.match(torrent.name, /576p/)
    assert.match(torrent.title, /HEVC/)
    assert.match(torrent.title, /AAC 2\.0/)
    assert.match(torrent.title, /JPN/)
    assert.match(torrent.title, /ENG/)
  }
})

test('series, video, and every locked torrent identity field remain unchanged', () => {
  const torrent = cb1Stream.streams[0]
  assert.equal(catalog.metas[0].id, 'bleach-manga-cut')
  assert.equal(meta.meta.id, 'bleach-manga-cut')
  assert.equal(meta.meta.videos[0].id, 'cb_1')
  assert.deepEqual({
    infoHash: torrent.infoHash,
    sources: torrent.sources,
    fileIdx: torrent.fileIdx,
    behaviorHints: torrent.behaviorHints
  }, {
    infoHash: 'd0cb7e0c8bad014c055bf2becf2694dcfde2b8e8',
    sources: [],
    fileIdx: 0,
    behaviorHints: {
      bingeGroup: 'bleach-manga-cut|p2p|standard',
      videoSize: 186522416,
      filename: '01 - Death and Strawberry.mkv'
    }
  })
  assert.match(torrent.infoHash, /^[0-9a-f]{40}$/)
  assert.equal(cb1Provenance.torrentEvidence.infoHash, torrent.infoHash)
  assert.equal(cb1Provenance.torrentEvidence.fileIdx, torrent.fileIdx)
  assert.equal(cb1Provenance.torrentEvidence.filename, torrent.behaviorHints.filename)
  assert.equal(cb1Provenance.torrentEvidence.videoSize, torrent.behaviorHints.videoSize)
})

test('CB1 provenance remains unchanged with verified ffprobe and subtitle evidence', () => {
  const inspection = cb1Provenance.localMediaInspection
  assert.equal(inspection.classification, 'verified local media inspection')
  assert.equal(inspection.method, 'ffprobe')
  assert.deepEqual(inspection.video, {
    width: 768,
    height: 576,
    resolutionLabel: '576p',
    codec: 'HEVC / H.265',
    profile: 'Main',
    pixelFormat: 'yuv420p'
  })
  assert.deepEqual(inspection.audio, [
    { language: 'Japanese', codec: 'AAC LC', channels: 'stereo / 2.0' },
    { language: 'English', codec: 'AAC LC', channels: 'stereo / 2.0' }
  ])
  assert.deepEqual(inspection.embeddedSubtitles, [
    { language: 'English', title: 'Full Subtitles [Edited ParanDark]' },
    { language: 'English', title: 'Signs and Songs [Edited ParanDark]' },
    { language: 'Spanish', title: 'Spanish [Vex]' }
  ])
})

test('CB1 provenance records intentional anime and original-language compatibility metadata', () => {
  assert.deepEqual(cb1Provenance.compatibilityMetadata, {
    animeClassification: {
      genres: ['Animation', 'Anime'],
      intent: 'Anime classification is intentional compatibility metadata for this Bleach anime edit.'
    },
    originalContentLanguage: {
      language: 'Japanese',
      inspectedAudioTracks: [
        'Japanese AAC LC, stereo / 2.0',
        'English AAC LC, stereo / 2.0'
      ],
      intent: 'Japanese is the intended original-language track for Nuvio Original Audio behavior.'
    }
  })
})

test('generated content contains exactly cb_1 and cb_2', () => {
  const generatedFiles = [
    ...fs.readdirSync(path.join(root, 'data', 'catalog')).map((name) => `catalog/${name}`),
    ...fs.readdirSync(path.join(root, 'data', 'meta')).map((name) => `meta/${name}`),
    ...fs.readdirSync(path.join(root, 'data', 'stream')).map((name) => `stream/${name}`),
    ...fs.readdirSync(path.join(root, 'data', 'provenance')).map((name) => `provenance/${name}`)
  ].sort()

  assert.deepEqual(generatedFiles, [
    'catalog/bleach-manga-cut.json',
    'meta/bleach-manga-cut.json',
    'provenance/cb_1.json',
    'provenance/cb_2.json',
    'stream/cb_1.json',
    'stream/cb_2.json'
  ])

  const episodeIds = JSON.stringify([
    catalog,
    meta,
    cb1Stream,
    cb1Provenance,
    cb2Stream,
    cb2Provenance
  ]).match(/cb_\d+/g) || []
  assert.deepEqual([...new Set(episodeIds)], ['cb_1', 'cb_2'])
})

test('content has no credential or resolved playback fields', () => {
  const forbiddenKeys = /^(apiKey|token|accessToken|authorization|credential|password|privateUrl|playbackUrl|resolvedUrl|url|externalUrl|clientResolve)$/i

  const inspect = (value) => {
    if (Array.isArray(value)) {
      value.forEach(inspect)
      return
    }

    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        assert.doesNotMatch(key, forbiddenKeys)
        inspect(child)
      }
    }
  }

  inspect([catalog, meta, cb1Stream, cb1Provenance, cb2Stream, cb2Provenance])
  assert.doesNotMatch(
    JSON.stringify([catalog, meta, cb1Stream, cb1Provenance, cb2Stream, cb2Provenance]),
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i
  )
})

test('handlers return empty protocol responses for unknown IDs', async () => {
  assert.deepEqual(
    await addon.get('meta', 'series', 'unknown-series'),
    { meta: {} }
  )
  assert.deepEqual(
    await addon.get('stream', 'series', 'cb_999'),
    { streams: [] }
  )
  for (const videoId of ['cb_3', 'hb_ex_27', '../data/stream/cb_1', 'cb_1/../../cb_2']) {
    assert.deepEqual(await addon.get('stream', 'series', videoId), { streams: [] }, videoId)
  }
  assert.deepEqual(await addon.get('stream', 'movie', 'cb_1'), { streams: [] })
})

test('normal Stremio HTTP endpoints return the deterministic JSON', async () => {
  const endpoints = [
    ['/manifest.json', addon.manifest],
    ['/catalog/series/bleach-manga-cut.json', catalog],
    ['/meta/series/bleach-manga-cut.json', meta],
    ['/stream/series/cb_1.json', cb1Stream],
    ['/stream/series/cb_2.json', cb2Stream],
    ['/stream/series/cb_3.json', { streams: [] }],
    ['/stream/series/hb_ex_27.json', { streams: [] }],
    ['/meta/series/unknown-series.json', { meta: {} }],
    ['/stream/series/cb_999.json', { streams: [] }]
  ]

  for (const [endpoint, expected] of endpoints) {
    const response = await fetch(`${baseUrl}${endpoint}`)
    assert.equal(response.status, 200, endpoint)
    assert.match(response.headers.get('content-type'), /^application\/json\b/)
    assert.deepEqual(await response.json(), expected, endpoint)
  }
})
