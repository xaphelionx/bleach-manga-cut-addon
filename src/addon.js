'use strict'

const path = require('node:path')
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk')
const { isSafeStreamFileVideoId } = require('./video-id')

const catalog = require(path.join('..', 'data', 'catalog', 'bleach-manga-cut.json'))
const meta = require(path.join('..', 'data', 'meta', 'bleach-manga-cut.json'))

const publishedVideoIds = meta.meta.videos.map((video) => video.id)
if (
  new Set(publishedVideoIds).size !== publishedVideoIds.length ||
  publishedVideoIds.some((videoId) => !isSafeStreamFileVideoId(videoId))
) {
  throw new Error('Generated meta contains an unsafe or duplicate published video ID')
}
const streamsByVideoId = new Map(publishedVideoIds.map((videoId) => [
  videoId,
  require(path.join('..', 'data', 'stream', `${videoId}.json`))
]))

const manifest = {
  id: 'community.xaphelionx.bleach-manga-cut',
  version: '0.0.1',
  name: 'Bleach Manga Cut',
  description: 'Two-episode Bleach Manga Cut proof of concept.',
  resources: [
    'catalog',
    {
      name: 'meta',
      types: ['series'],
      idPrefixes: ['bleach-manga-cut']
    },
    {
      name: 'stream',
      types: ['series'],
      idPrefixes: ['cb_', 'hb_']
    }
  ],
  types: ['series'],
  catalogs: [
    {
      type: 'series',
      id: 'bleach-manga-cut',
      name: 'Bleach Manga Cut'
    }
  ]
}

const builder = new addonBuilder(manifest)

const catalogHandler = (args) => {
  if (args.type !== 'series' || args.id !== 'bleach-manga-cut') {
    return Promise.resolve({ metas: [] })
  }

  return Promise.resolve(catalog)
}

const metaHandler = (args) => {
  if (args.type !== 'series' || args.id !== 'bleach-manga-cut') {
    return Promise.resolve({ meta: {} })
  }

  return Promise.resolve(meta)
}

const streamHandler = (args) => {
  if (args.type !== 'series' || !streamsByVideoId.has(args.id)) {
    return Promise.resolve({ streams: [] })
  }

  return Promise.resolve(streamsByVideoId.get(args.id))
}

builder.defineCatalogHandler(catalogHandler)
builder.defineMetaHandler(metaHandler)
builder.defineStreamHandler(streamHandler)

const addonInterface = builder.getInterface()

if (require.main === module) {
  const port = Number.parseInt(process.env.PORT || '7000', 10)
  serveHTTP(addonInterface, { port })
}

module.exports = addonInterface
