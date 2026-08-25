'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { after, before, test } = require('node:test')
const { serveHTTP } = require('stremio-addon-sdk')

const addon = require('../src/addon')
const { isSafeStreamFileVideoId } = require('../src/video-id')
const catalog = require('../data/catalog/bleach-manga-cut.json')
const meta = require('../data/meta/bleach-manga-cut.json')
const cb1Stream = require('../data/stream/cb_1.json')
const cb1Provenance = require('../data/provenance/cb_1.json')
const cb2Stream = require('../data/stream/cb_2.json')
const cb2Provenance = require('../data/provenance/cb_2.json')
const cb3Stream = require('../data/stream/cb_3.json')
const cb3Provenance = require('../data/provenance/cb_3.json')
const ch1Stream = require('../data/stream/ch_1.json')
const ch2Stream = require('../data/stream/ch_2.json')
const projection = require('../projection/stremio/public-projection.json')

const root = path.resolve(__dirname, '..')
const publishedVideoIds = projection.publicationPolicy.currentPublishedVideoIds
const readGenerated = (kind, videoId) => JSON.parse(
  fs.readFileSync(path.join(root, 'data', kind, `${videoId}.json`), 'utf8')
)
const publishedStreams = new Map(publishedVideoIds.map((videoId) => [
  videoId,
  readGenerated('stream', videoId)
]))
const publishedProvenance = new Map(publishedVideoIds.map((videoId) => [
  videoId,
  readGenerated('provenance', videoId)
]))
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

test('manifest declares only the current series resources and identifiers', () => {
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
      idPrefixes: ['cb_', 'hb_', 'ch_']
    }
  ])
  assert.equal('config' in addon.manifest, false)
  assert.equal('behaviorHints' in addon.manifest, false)
})

test('stream fixture ID safety accepts ordinary normalized Concentrated, Hollowed, and integer Chipped IDs', () => {
  for (const videoId of [
    'cb_1',
    'cb_2',
    'cb_27',
    'cb_27p5',
    'cb_0p0',
    'cb_0p8',
    'cb_70p5',
    'hb_14',
    'hb_15',
    'hb_0p8',
    'ch_1',
    'ch_12'
  ]) {
    assert.equal(isSafeStreamFileVideoId(videoId), true, videoId)
  }

  for (const videoId of [
    'cb_',
    'cb_p5',
    'cb_27p',
    'cb_27.5',
    'cb_-1',
    'cb_27p5x',
    '../data/stream/cb_1',
    'cb_1/../../cb_2',
    'hb_',
    'hb_p5',
    'hb_27p',
    'hb_27.5',
    'hb_ex_27',
    'ch_',
    'ch_a',
    'ch_1p0',
    'ch_01p5',
    'ch_ex_1',
    '../ch_1',
    'ch_1.json',
    'CH_1',
    'arbitrary'
  ]) {
    assert.equal(isSafeStreamFileVideoId(videoId), false, videoId)
  }
})

test('safe stream fixture syntax does not grant publication permission', async () => {
  assert.equal(isSafeStreamFileVideoId('cb_55'), true)
  assert.equal(meta.meta.videos.some((video) => video.id === 'cb_55'), false)
  assert.deepEqual(await addon.get('stream', 'series', 'cb_55'), { streams: [] })
  assert.equal(isSafeStreamFileVideoId('hb_14'), true)
  assert.equal(meta.meta.videos.some((video) => video.id === 'hb_14'), false)
  assert.deepEqual(await addon.get('stream', 'series', 'hb_14'), { streams: [] })
  assert.equal(isSafeStreamFileVideoId('hb_51'), true)
  assert.equal(meta.meta.videos.some((video) => video.id === 'hb_51'), false)
  assert.deepEqual(await addon.get('stream', 'series', 'hb_51'), { streams: [] })
  assert.equal(isSafeStreamFileVideoId('ch_13'), true)
  assert.equal(meta.meta.videos.some((video) => video.id === 'ch_13'), false)
  assert.deepEqual(await addon.get('stream', 'series', 'ch_13'), { streams: [] })
})

test('catalog and meta contain the exact ordered 102-entry publication candidate ending Chipped 12', () => {
  assert.equal(catalog.metas.length, 1)
  assert.equal(meta.meta.videos.length, 102)

  const catalogItem = catalog.metas[0]
  const series = meta.meta

  assert.equal(catalogItem.id, 'bleach-manga-cut')
  assert.equal(catalogItem.id, series.id)
  assert.equal(catalogItem.type, series.type)
  assert.equal(catalogItem.name, series.name)
  assert.deepEqual(series.videos.map((video) => video.id), publishedVideoIds)
  assert.equal(series.videos.filter((video) => video.season === 1).length, 9)
  assert.equal(series.videos.filter((video) => video.season === 2).length, 28)
  assert.equal(series.videos.filter((video) => video.season === 3).length, 53)
  assert.equal(series.videos.filter((video) => video.season === 4).length, 12)
  const placement = (videoId) => {
    const { season, episode } = series.videos.find((video) => video.id === videoId)
    return { season, episode }
  }
  assert.deepEqual(placement('cb_1'), { season: 1, episode: 1 })
  assert.deepEqual(placement('cb_9'), { season: 1, episode: 9 })
  assert.deepEqual(placement('cb_10'), { season: 2, episode: 1 })
  assert.deepEqual(placement('cb_27'), { season: 2, episode: 18 })
  assert.deepEqual(placement('cb_27p5'), { season: 2, episode: 19 })
  assert.deepEqual(placement('cb_28'), { season: 2, episode: 20 })
  assert.deepEqual(placement('cb_32'), { season: 2, episode: 24 })
  assert.deepEqual(placement('cb_35'), { season: 2, episode: 27 })
  assert.deepEqual(placement('cb_0p0'), { season: 2, episode: 28 })
  assert.deepEqual(placement('cb_36'), { season: 3, episode: 1 })
  assert.deepEqual(placement('cb_51'), { season: 3, episode: 16 })
  assert.deepEqual(placement('cb_52'), { season: 3, episode: 17 })
  assert.deepEqual(placement('cb_53'), { season: 3, episode: 18 })
  assert.deepEqual(placement('cb_54'), { season: 3, episode: 19 })
  assert.equal(series.videos.some((video) => video.id === 'hb_14'), false)
  assert.deepEqual(placement('hb_18'), { season: 3, episode: 20 })
  assert.deepEqual(placement('hb_0p8'), { season: 3, episode: 32 })
  assert.deepEqual(placement('hb_50'), { season: 3, episode: 53 })
  assert.deepEqual(placement('ch_1'), { season: 4, episode: 1 })
  assert.deepEqual(placement('ch_2'), { season: 4, episode: 2 })
  assert.deepEqual(placement('ch_3'), { season: 4, episode: 3 })
  assert.deepEqual(placement('ch_6'), { season: 4, episode: 6 })
  assert.deepEqual(placement('ch_10'), { season: 4, episode: 10 })
  assert.deepEqual(placement('ch_12'), { season: 4, episode: 12 })
  assert.deepEqual(series.videos.slice(67, 72).map((video) => video.id), [
    'hb_29', 'hb_0p8', 'hb_30', 'hb_31', 'hb_32'
  ])
  assert.deepEqual(series.videos.at(-1), {
    id: 'ch_12',
    season: 4,
    episode: 12,
    title: 'Goodbye to our XCution',
    runtime: '41'
  })
  assert.equal(series.videos.some((video) => video.id === 'ch_13' || video.id === 'cb_55'), false)
  assert.equal(cb1Provenance.id, series.videos[0].id)
  assert.equal(cb1Provenance.editorial.exactEditRuntime, '00:18:15')
  assert.equal(cb1Provenance.editorial.normalizedExactRuntime, '18:15')
  assert.equal(cb2Provenance.id, series.videos[1].id)
  assert.equal(cb2Provenance.editorial.exactEditRuntime, '00:32:47')
  assert.equal(cb2Provenance.editorial.normalizedExactRuntime, '32:47')
  assert.equal(cb3Provenance.id, series.videos[2].id)
  assert.equal(cb3Provenance.editorial.exactEditRuntime, '00:36:14')
  assert.equal(cb3Provenance.editorial.normalizedExactRuntime, '36:14')
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

test('all published streams present their verified local media metadata', () => {
  for (const [videoId, stream] of publishedStreams) {
    assert.equal(stream.streams.length, 1)
    const torrent = stream.streams[0]
    assert.match(torrent.name, /(?:576|720|1080)p/, videoId)
    assert.match(torrent.title, /HEVC/, videoId)
    assert.match(torrent.title, videoId.startsWith('ch_') ? /PCM 2\.0/ : /AAC 2\.0/, videoId)
    if (videoId.startsWith('hb_')) {
      assert.doesNotMatch(torrent.title, /\b(?:ENG|JPN)\b/, videoId)
    } else {
      assert.match(torrent.title, /ENG/, videoId)
      assert.match(torrent.title, /JPN/, videoId)
    }
    assert.match(torrent.infoHash, /^[0-9a-f]{40}$/, videoId)
    assert.equal(torrent.fileIdx, 0, videoId)
    assert.deepEqual(torrent.sources, [], videoId)
    assert.equal(torrent.behaviorHints.bingeGroup, 'bleach-manga-cut|p2p|standard', videoId)
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

test('generated content contains exactly the 102 published stream and provenance pairs', () => {
  const generatedFiles = [
    ...fs.readdirSync(path.join(root, 'data', 'catalog')).map((name) => `catalog/${name}`),
    ...fs.readdirSync(path.join(root, 'data', 'meta')).map((name) => `meta/${name}`),
    ...fs.readdirSync(path.join(root, 'data', 'stream')).map((name) => `stream/${name}`),
    ...fs.readdirSync(path.join(root, 'data', 'provenance')).map((name) => `provenance/${name}`)
  ].sort()

  const expectedFiles = [
    'catalog/bleach-manga-cut.json',
    'meta/bleach-manga-cut.json',
    ...publishedVideoIds.map((videoId) => `provenance/${videoId}.json`),
    ...publishedVideoIds.map((videoId) => `stream/${videoId}.json`)
  ].sort()
  assert.equal(expectedFiles.length, 206)
  assert.deepEqual(generatedFiles, expectedFiles)

  const generatedDocuments = [
    catalog,
    meta,
    ...publishedStreams.values(),
    ...publishedProvenance.values()
  ]
  const episodeIds = JSON.stringify(generatedDocuments).match(/(?:(?:cb|hb)_\d+(?:p\d+)?|ch_\d+)/g) || []
  assert.deepEqual([...new Set(episodeIds)], publishedVideoIds)
})

test('no production artifacts exist beyond the selected 12 Chipped records', () => {
  assert.equal(fs.existsSync(path.join(root, 'data', 'stream', 'ch_13.json')), false)
  assert.equal(fs.existsSync(path.join(root, 'data', 'provenance', 'ch_13.json')), false)
  assert.equal(fs.existsSync(path.join(root, 'data', 'stream', 'cb_55.json')), false)
  assert.equal(fs.existsSync(path.join(root, 'data', 'provenance', 'cb_55.json')), false)
  for (const videoId of ['hb_14', 'hb_15', 'hb_16', 'hb_17']) {
    assert.equal(fs.existsSync(path.join(root, 'data', 'stream', `${videoId}.json`)), false)
    assert.equal(fs.existsSync(path.join(root, 'data', 'provenance', `${videoId}.json`)), false)
    assert.equal(fs.existsSync(path.join(root, 'evidence', 'media', `${videoId}.json`)), true)
  }
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

  const generatedDocuments = [
    catalog,
    meta,
    ...publishedStreams.values(),
    ...publishedProvenance.values()
  ]
  inspect(generatedDocuments)
  assert.doesNotMatch(
    JSON.stringify(generatedDocuments),
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
  for (const videoId of ['cb_55', 'hb_14', 'hb_51', 'hb_ex_27', '../data/stream/cb_1', 'cb_1/../../cb_2']) {
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
    ['/stream/series/cb_3.json', cb3Stream],
    ['/stream/series/cb_4.json', publishedStreams.get('cb_4')],
    ['/stream/series/cb_9.json', publishedStreams.get('cb_9')],
    ['/stream/series/cb_10.json', publishedStreams.get('cb_10')],
    ['/stream/series/cb_27p5.json', publishedStreams.get('cb_27p5')],
    ['/stream/series/cb_32.json', publishedStreams.get('cb_32')],
    ['/stream/series/cb_35.json', publishedStreams.get('cb_35')],
    ['/stream/series/cb_0p0.json', publishedStreams.get('cb_0p0')],
    ['/stream/series/cb_36.json', publishedStreams.get('cb_36')],
    ['/stream/series/cb_51.json', publishedStreams.get('cb_51')],
    ['/stream/series/cb_52.json', publishedStreams.get('cb_52')],
    ['/stream/series/cb_53.json', publishedStreams.get('cb_53')],
    ['/stream/series/cb_54.json', publishedStreams.get('cb_54')],
    ['/stream/series/hb_14.json', { streams: [] }],
    ['/stream/series/hb_15.json', { streams: [] }],
    ['/stream/series/hb_18.json', publishedStreams.get('hb_18')],
    ['/stream/series/hb_0p8.json', publishedStreams.get('hb_0p8')],
    ['/stream/series/hb_50.json', publishedStreams.get('hb_50')],
    ['/stream/series/ch_1.json', ch1Stream],
    ['/stream/series/ch_2.json', ch2Stream],
    ['/stream/series/ch_3.json', publishedStreams.get('ch_3')],
    ['/stream/series/ch_6.json', publishedStreams.get('ch_6')],
    ['/stream/series/ch_10.json', publishedStreams.get('ch_10')],
    ['/stream/series/ch_12.json', publishedStreams.get('ch_12')],
    ['/stream/series/ch_13.json', { streams: [] }],
    ['/stream/series/hb_51.json', { streams: [] }],
    ['/stream/series/cb_55.json', { streams: [] }],
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
