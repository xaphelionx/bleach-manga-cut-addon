'use strict'

// This is a path-safety contract for generated default normalized stream fixture IDs.
// It does not authorize publication; the addon separately allows only IDs from
// generated published meta.
const SAFE_STREAM_FILE_VIDEO_ID = /^(?:cb|hb)_[0-9]+(?:p[0-9]+)?$/

function isSafeStreamFileVideoId(value) {
  return typeof value === 'string' && SAFE_STREAM_FILE_VIDEO_ID.test(value)
}

module.exports = {
  isSafeStreamFileVideoId
}
