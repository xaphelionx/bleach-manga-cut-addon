'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { after, before, test } = require('node:test')
const { serveHTTP } = require('stremio-addon-sdk')

const addon = require('../src/addon')
const catalog = require('../data/catalog/bleach-manga-cut.json')
const meta = require('../data/meta/bleach-manga-cut.json')
const stream = require('../data/stream/cb_1.json')
const provenance = require('../data/provenance/cb_1.json')

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

test('catalog, meta, and video contain exactly CB1 and line up', () => {
  assert.equal(catalog.metas.length, 1)
  assert.equal(meta.meta.videos.length, 1)

  const catalogItem = catalog.metas[0]
  const series = meta.meta
  const video = series.videos[0]

  assert.equal(catalogItem.id, 'bleach-manga-cut')
  assert.equal(catalogItem.id, series.id)
  assert.equal(catalogItem.type, series.type)
  assert.equal(catalogItem.name, series.name)
  assert.equal(video.id, 'cb_1')
  assert.equal(video.season, 1)
  assert.equal(video.episode, 1)
  assert.equal(video.runtime, '18')
  assert.equal(provenance.id, video.id)
  assert.equal(provenance.editorial.exactEditRuntime, '00:18:15')
  assert.equal(provenance.editorial.normalizedExactRuntime, '18:15')
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

test('stream presents the verified local media metadata', () => {
  assert.equal(stream.streams.length, 1)

  const torrent = stream.streams[0]
  assert.match(torrent.name, /576p/)
  assert.match(torrent.title, /HEVC/)
  assert.match(torrent.title, /AAC 2\.0/)
  assert.match(torrent.title, /JPN/)
  assert.match(torrent.title, /ENG/)
})

test('series, video, and every locked torrent identity field remain unchanged', () => {
  const torrent = stream.streams[0]
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
  assert.equal(provenance.torrentEvidence.infoHash, torrent.infoHash)
  assert.equal(provenance.torrentEvidence.fileIdx, torrent.fileIdx)
  assert.equal(provenance.torrentEvidence.filename, torrent.behaviorHints.filename)
  assert.equal(provenance.torrentEvidence.videoSize, torrent.behaviorHints.videoSize)
})

test('provenance records verified ffprobe media and embedded subtitle evidence', () => {
  const inspection = provenance.localMediaInspection
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

test('provenance records intentional anime and original-language compatibility metadata', () => {
  assert.deepEqual(provenance.compatibilityMetadata, {
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

test('generated content contains no second episode', () => {
  const generatedFiles = [
    ...fs.readdirSync(path.join(root, 'data', 'catalog')).map((name) => `catalog/${name}`),
    ...fs.readdirSync(path.join(root, 'data', 'meta')).map((name) => `meta/${name}`),
    ...fs.readdirSync(path.join(root, 'data', 'stream')).map((name) => `stream/${name}`)
  ].sort()

  assert.deepEqual(generatedFiles, [
    'catalog/bleach-manga-cut.json',
    'meta/bleach-manga-cut.json',
    'stream/cb_1.json'
  ])

  const episodeIds = JSON.stringify([catalog, meta, stream]).match(/cb_\d+/g) || []
  assert.deepEqual([...new Set(episodeIds)], ['cb_1'])
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

  inspect([catalog, meta, stream, provenance])
  assert.doesNotMatch(
    JSON.stringify([catalog, meta, stream, provenance]),
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
})

test('normal Stremio HTTP endpoints return the deterministic JSON', async () => {
  const endpoints = [
    ['/manifest.json', addon.manifest],
    ['/catalog/series/bleach-manga-cut.json', catalog],
    ['/meta/series/bleach-manga-cut.json', meta],
    ['/stream/series/cb_1.json', stream],
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
