#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const repositoryRoot = path.resolve(__dirname, '..')

class AcquisitionManifestError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AcquisitionManifestError'
    this.manifestCode = code
  }
}

function fail(code, message) {
  throw new AcquisitionManifestError(code, message)
}

function assertObject(value, label, code = 'invalid-input') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} must be an object`)
  }
}

function assertExactKeys(value, expected, label, code = 'invalid-input') {
  assertObject(value, label, code)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(code, `${label} has missing or unexpected fields`)
  }
}

function assertNonEmptyString(value, label, code = 'invalid-input') {
  if (typeof value !== 'string' || value.length === 0) {
    fail(code, `${label} must be a non-empty string`)
  }
}

function assertNullableString(value, label, code = 'invalid-input') {
  if (value !== null && typeof value !== 'string') {
    fail(code, `${label} must be a string or null`)
  }
}

function assertInteger(value, label, minimum = 0, code = 'invalid-input') {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(code, `${label} must be a safe integer greater than or equal to ${minimum}`)
  }
}

function assertPositiveNumberOrNull(value, label, code = 'invalid-input') {
  if (value !== null && (!Number.isFinite(value) || value <= 0)) {
    fail(code, `${label} must be a positive finite number or null`)
  }
}

function assertNullableInteger(value, label, minimum = 0, code = 'invalid-input') {
  if (value !== null) assertInteger(value, label, minimum, code)
}

function assertNullableFlag(value, label, code = 'invalid-input') {
  if (value !== null && value !== 0 && value !== 1) {
    fail(code, `${label} must be 0, 1, or null`)
  }
}

function validateRelativeArtifactPath(value, label, code = 'invalid-artifact-path') {
  assertNonEmptyString(value, label, code)
  if (value.includes('\0')) fail(code, `${label} contains a null byte`)
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
    fail(code, `${label} must be repository-relative`)
  }
  const segments = value.split(/[\\/]/u)
  if (segments.includes('..')) fail(code, `${label} must not contain traversal`)
  const posixNormalized = path.posix.normalize(value)
  const win32Normalized = path.win32.normalize(value)
  if (
    posixNormalized === '..' || posixNormalized.startsWith('../') ||
    win32Normalized === '..' || win32Normalized.startsWith('..\\')
  ) {
    fail(code, `${label} must not escape repository semantics`)
  }
  return value
}

function validateMapping(mapping, concentrated, registry) {
  assertExactKeys(mapping, ['schemaVersion', 'assignments'], 'mapping', 'invalid-mapping')
  if (mapping.schemaVersion !== 1) fail('invalid-mapping', 'unsupported mapping schemaVersion')
  if (!Array.isArray(mapping.assignments) || mapping.assignments.length === 0) {
    fail('invalid-mapping', 'mapping.assignments must be a non-empty array')
  }
  assertObject(concentrated, 'normalized Concentrated records', 'invalid-identity-source')
  assertObject(registry, 'video-ID registry', 'invalid-identity-source')
  if (!Array.isArray(concentrated.records) || !Array.isArray(registry.entries)) {
    fail('invalid-identity-source', 'identity sources must contain record and registry arrays')
  }

  const recordIds = new Set()
  const videoIds = new Set()
  const mediaPaths = new Set()
  const torrentPaths = new Set()

  const validated = mapping.assignments.map((assignment, index) => {
    const label = `mapping.assignments[${index}]`
    assertExactKeys(
      assignment,
      ['recordId', 'videoId', 'mediaRelativePath', 'torrentRelativePath'],
      label,
      'invalid-mapping'
    )
    assertNonEmptyString(assignment.recordId, `${label}.recordId`, 'invalid-mapping')
    assertNonEmptyString(assignment.videoId, `${label}.videoId`, 'invalid-mapping')
    validateRelativeArtifactPath(assignment.mediaRelativePath, `${label}.mediaRelativePath`)
    validateRelativeArtifactPath(assignment.torrentRelativePath, `${label}.torrentRelativePath`)

    if (recordIds.has(assignment.recordId)) fail('duplicate-mapping-identity', 'duplicate mapping recordId')
    if (videoIds.has(assignment.videoId)) fail('duplicate-mapping-identity', 'duplicate mapping videoId')
    if (mediaPaths.has(assignment.mediaRelativePath)) fail('duplicate-mapping-path', 'duplicate mapping mediaRelativePath')
    if (torrentPaths.has(assignment.torrentRelativePath)) fail('duplicate-mapping-path', 'duplicate mapping torrentRelativePath')
    recordIds.add(assignment.recordId)
    videoIds.add(assignment.videoId)
    mediaPaths.add(assignment.mediaRelativePath)
    torrentPaths.add(assignment.torrentRelativePath)

    const records = concentrated.records.filter((record) => record.recordId === assignment.recordId)
    if (records.length !== 1 || records[0].projectId !== 'concentrated') {
      fail('unknown-record-id', 'recordId is not one unique normalized Concentrated record')
    }
    const videoMatches = registry.entries.filter((entry) => entry.videoId === assignment.videoId)
    if (videoMatches.length !== 1 || videoMatches[0].projectId !== 'concentrated') {
      fail('unknown-video-id', 'videoId is not one unique permanent Concentrated registry identity')
    }
    const recordMatches = registry.entries.filter((entry) => (
      entry.recordId === assignment.recordId && entry.projectId === 'concentrated'
    ))
    if (recordMatches.length !== 1) {
      fail('unknown-record-id', 'recordId does not have one unique permanent Concentrated registry identity')
    }
    if (videoMatches[0].recordId !== assignment.recordId || recordMatches[0].videoId !== assignment.videoId) {
      fail('record-video-mismatch', 'recordId and videoId disagree with the permanent registry')
    }

    return {
      recordId: assignment.recordId,
      videoId: assignment.videoId,
      mediaRelativePath: assignment.mediaRelativePath,
      torrentRelativePath: assignment.torrentRelativePath,
      registryIndex: registry.entries.indexOf(videoMatches[0])
    }
  })

  validated.sort((left, right) => (
    left.registryIndex - right.registryIndex ||
    left.videoId.localeCompare(right.videoId) ||
    left.recordId.localeCompare(right.recordId)
  ))
  return validated
}

function indexInspectionResults(report) {
  assertObject(report, 'inspection report', 'invalid-inspection-report')
  if (report.schemaVersion !== 1 || report.reportKind !== 'local-media-inspection-review') {
    fail('invalid-inspection-report', 'inspection report has an unsupported contract')
  }
  if (!Array.isArray(report.assignments)) {
    fail('invalid-inspection-report', 'inspection report assignments must be an array')
  }
  assertObject(report.inspectionSummary, 'inspection report summary', 'invalid-inspection-report')
  if (
    report.inspectionSummary.total !== report.assignments.length ||
    report.inspectionSummary.succeeded + report.inspectionSummary.failed !== report.assignments.length
  ) {
    fail('invalid-inspection-report', 'inspection report summary disagrees with its assignments')
  }

  const results = new Map()
  for (const [index, result] of report.assignments.entries()) {
    assertObject(result, `inspection report assignments[${index}]`, 'invalid-inspection-report')
    assertObject(result.assignment, `inspection report assignments[${index}].assignment`, 'invalid-inspection-report')
    assertNonEmptyString(result.assignment.videoId, 'inspection result videoId', 'invalid-inspection-report')
    if (results.has(result.assignment.videoId)) {
      fail('duplicate-inspection-result', 'inspection report contains a duplicate videoId result')
    }
    results.set(result.assignment.videoId, result)
  }
  return results
}

function indexVerificationResults(report) {
  assertObject(report, 'verification report', 'invalid-verification-report')
  if (report.schemaVersion !== 1 || report.reportKind !== 'local-torrent-verification') {
    fail('invalid-verification-report', 'verification report has an unsupported contract')
  }
  if (!Array.isArray(report.assignments)) {
    fail('invalid-verification-report', 'verification report assignments must be an array')
  }
  assertObject(report.verificationSummary, 'verification report summary', 'invalid-verification-report')
  if (
    report.verificationSummary.total !== report.assignments.length ||
    report.verificationSummary.verified + report.verificationSummary.failed !== report.assignments.length
  ) {
    fail('invalid-verification-report', 'verification report summary disagrees with its assignments')
  }

  const results = new Map()
  for (const [index, result] of report.assignments.entries()) {
    assertObject(result, `verification report assignments[${index}]`, 'invalid-verification-report')
    assertNonEmptyString(result.videoId, 'verification result videoId', 'invalid-verification-report')
    if (results.has(result.videoId)) {
      fail('duplicate-verification-result', 'verification report contains a duplicate videoId result')
    }
    results.set(result.videoId, result)
  }
  return results
}

function dispositionValue(disposition, key, label) {
  assertObject(disposition, `${label}.disposition`, 'invalid-inspection-result')
  const value = Object.hasOwn(disposition, key) ? disposition[key] : null
  assertNullableFlag(value, `${label}.disposition.${key}`, 'invalid-inspection-result')
  return value
}

function streamIndex(value, label) {
  assertNullableInteger(value, `${label}.index`, 0, 'invalid-inspection-result')
  return value
}

function mediaFromInspection(mappingAssignment, result) {
  if (!result.inspection || result.inspection.state !== 'success') {
    fail('failed-inspection-result', `inspection did not succeed for ${mappingAssignment.videoId}`)
  }
  const observedIdentity = result.assignment
  if (
    observedIdentity.recordId !== mappingAssignment.recordId ||
    observedIdentity.videoId !== mappingAssignment.videoId
  ) {
    fail('inspection-identity-mismatch', 'inspection identity disagrees with mapping')
  }
  if (observedIdentity.relativePath !== mappingAssignment.mediaRelativePath) {
    fail('media-path-mismatch', 'inspection media path disagrees with mapping')
  }
  validateRelativeArtifactPath(observedIdentity.relativePath, 'inspection media path')
  assertObject(result.filesystem, 'inspection filesystem', 'invalid-inspection-result')
  assertInteger(result.filesystem.byteSize, 'inspection filesystem byteSize', 1, 'invalid-inspection-result')
  if (result.filesystem.filename !== path.posix.basename(mappingAssignment.mediaRelativePath)) {
    fail('inspection-filename-mismatch', 'inspection filename disagrees with mapped media basename')
  }
  assertObject(result.container, 'inspection container', 'invalid-inspection-result')
  assertNullableString(result.container.format_name, 'inspection container format_name', 'invalid-inspection-result')
  assertPositiveNumberOrNull(
    result.measuredContainerDurationSeconds,
    'inspection measured container duration',
    'invalid-inspection-result'
  )
  assertObject(result.streams, 'inspection streams', 'invalid-inspection-result')
  for (const kind of ['video', 'audio', 'subtitles', 'attachments', 'other']) {
    if (!Array.isArray(result.streams[kind])) {
      fail('invalid-inspection-result', `inspection streams.${kind} must be an array`)
    }
  }
  if (!Array.isArray(result.warnings)) {
    fail('invalid-inspection-result', 'inspection warnings must be an array')
  }

  const videoStreams = result.streams.video.map((stream, index) => {
    const label = `inspection video stream[${index}]`
    assertObject(stream, label, 'invalid-inspection-result')
    assertNullableString(stream.codec_name, `${label}.codec_name`, 'invalid-inspection-result')
    assertNullableString(stream.profile, `${label}.profile`, 'invalid-inspection-result')
    assertNullableInteger(stream.width, `${label}.width`, 1, 'invalid-inspection-result')
    assertNullableInteger(stream.height, `${label}.height`, 1, 'invalid-inspection-result')
    assertNullableString(stream.pix_fmt, `${label}.pix_fmt`, 'invalid-inspection-result')
    return {
      index: streamIndex(stream.index, label),
      codecName: stream.codec_name,
      profile: stream.profile,
      width: stream.width,
      height: stream.height,
      pixelFormat: stream.pix_fmt,
      attachedPic: dispositionValue(stream.disposition, 'attached_pic', label),
      default: dispositionValue(stream.disposition, 'default', label),
      forced: dispositionValue(stream.disposition, 'forced', label)
    }
  })

  const audioStreams = result.streams.audio.map((stream, index) => {
    const label = `inspection audio stream[${index}]`
    assertObject(stream, label, 'invalid-inspection-result')
    assertObject(stream.tags, `${label}.tags`, 'invalid-inspection-result')
    assertNullableString(stream.codec_name, `${label}.codec_name`, 'invalid-inspection-result')
    assertNullableString(stream.profile, `${label}.profile`, 'invalid-inspection-result')
    assertNullableInteger(stream.channels, `${label}.channels`, 1, 'invalid-inspection-result')
    assertNullableString(stream.channel_layout, `${label}.channel_layout`, 'invalid-inspection-result')
    assertNullableString(stream.tags.language, `${label}.tags.language`, 'invalid-inspection-result')
    assertNullableString(stream.tags.title, `${label}.tags.title`, 'invalid-inspection-result')
    return {
      index: streamIndex(stream.index, label),
      codecName: stream.codec_name,
      profile: stream.profile,
      channels: stream.channels,
      channelLayout: stream.channel_layout,
      language: stream.tags.language,
      title: stream.tags.title,
      default: dispositionValue(stream.disposition, 'default', label),
      forced: dispositionValue(stream.disposition, 'forced', label)
    }
  })

  const subtitleStreams = result.streams.subtitles.map((stream, index) => {
    const label = `inspection subtitle stream[${index}]`
    assertObject(stream, label, 'invalid-inspection-result')
    assertObject(stream.tags, `${label}.tags`, 'invalid-inspection-result')
    assertNullableString(stream.codec_name, `${label}.codec_name`, 'invalid-inspection-result')
    assertNullableString(stream.tags.language, `${label}.tags.language`, 'invalid-inspection-result')
    assertNullableString(stream.tags.title, `${label}.tags.title`, 'invalid-inspection-result')
    return {
      index: streamIndex(stream.index, label),
      codecName: stream.codec_name,
      language: stream.tags.language,
      title: stream.tags.title,
      default: dispositionValue(stream.disposition, 'default', label),
      forced: dispositionValue(stream.disposition, 'forced', label)
    }
  })

  const warnings = result.warnings.map((warning, index) => {
    const label = `inspection warning[${index}]`
    assertObject(warning, label, 'invalid-inspection-result')
    assertNonEmptyString(warning.code, `${label}.code`, 'invalid-inspection-result')
    const normalized = { code: warning.code }
    if (Object.hasOwn(warning, 'streamIndex')) {
      assertInteger(warning.streamIndex, `${label}.streamIndex`, 0, 'invalid-inspection-result')
      normalized.streamIndex = warning.streamIndex
    }
    return normalized
  })

  return {
    relativePath: mappingAssignment.mediaRelativePath,
    byteSize: result.filesystem.byteSize,
    container: {
      formatName: result.container.format_name,
      durationSeconds: result.measuredContainerDurationSeconds
    },
    videoStreams,
    audioStreams,
    subtitleStreams,
    attachmentCount: result.streams.attachments.length,
    otherStreamCount: result.streams.other.length,
    warnings
  }
}

function torrentFromVerification(mappingAssignment, result, media) {
  if (result.state !== 'verified') {
    fail('failed-verification-result', `torrent verification did not succeed for ${mappingAssignment.videoId}`)
  }
  if (result.recordId !== mappingAssignment.recordId || result.videoId !== mappingAssignment.videoId) {
    fail('verification-identity-mismatch', 'verification identity disagrees with mapping')
  }
  if (result.mediaRelativePath !== mappingAssignment.mediaRelativePath) {
    fail('media-path-mismatch', 'verification media path disagrees with mapping')
  }
  if (result.torrentRelativePath !== mappingAssignment.torrentRelativePath) {
    fail('torrent-path-mismatch', 'verification torrent path disagrees with mapping')
  }
  validateRelativeArtifactPath(result.mediaRelativePath, 'verification media path')
  validateRelativeArtifactPath(result.torrentRelativePath, 'verification torrent path')
  assertObject(result.media, 'verification media', 'invalid-verification-result')
  assertObject(result.torrent, 'verification torrent', 'invalid-verification-result')
  assertObject(result.comparisons, 'verification comparisons', 'invalid-verification-result')
  assertObject(result.pieces, 'verification pieces', 'invalid-verification-result')
  if (result.media.mediaRelativePath !== mappingAssignment.mediaRelativePath) {
    fail('media-path-mismatch', 'verification nested media path disagrees with mapping')
  }
  if (result.torrent.torrentRelativePath !== mappingAssignment.torrentRelativePath) {
    fail('torrent-path-mismatch', 'verification nested torrent path disagrees with mapping')
  }
  validateRelativeArtifactPath(result.media.mediaRelativePath, 'verification nested media path')
  validateRelativeArtifactPath(result.torrent.torrentRelativePath, 'verification nested torrent path')

  assertInteger(result.media.byteSize, 'verification media byteSize', 1, 'invalid-verification-result')
  if (result.media.byteSize !== media.byteSize) {
    fail('media-byte-size-mismatch', 'inspection and verification media byte sizes disagree')
  }
  const expectedFilename = path.posix.basename(mappingAssignment.mediaRelativePath)
  if (result.media.filename !== expectedFilename || result.torrent.payloadFilename !== expectedFilename) {
    fail('payload-filename-mismatch', 'verified payload filename disagrees with mapped media basename')
  }
  if (result.torrent.declaredPayloadByteSize !== media.byteSize) {
    fail('payload-byte-size-mismatch', 'verified payload byte size disagrees with inspected media')
  }

  assertInteger(result.torrent.torrentByteSize, 'torrent byteSize', 1, 'invalid-verification-result')
  assertNonEmptyString(result.torrent.torrentSha256, 'torrent SHA256', 'invalid-verification-result')
  assertNonEmptyString(result.torrent.infoHash, 'torrent infoHash', 'invalid-verification-result')
  if (!/^[0-9a-f]{64}$/u.test(result.torrent.torrentSha256)) {
    fail('invalid-verification-result', 'torrent SHA256 must be lowercase hexadecimal')
  }
  if (!/^[0-9a-f]{40}$/u.test(result.torrent.infoHash)) {
    fail('invalid-verification-result', 'torrent infoHash must be lowercase hexadecimal')
  }
  assertInteger(result.torrent.fileIdx, 'torrent fileIdx', 0, 'invalid-verification-result')
  assertInteger(result.torrent.declaredPayloadByteSize, 'torrent payload byteSize', 1, 'invalid-verification-result')
  assertInteger(result.torrent.pieceLength, 'torrent pieceLength', 1, 'invalid-verification-result')
  assertInteger(result.torrent.pieceCount, 'torrent pieceCount', 1, 'invalid-verification-result')
  assertInteger(result.pieces.pieceCount, 'verified pieceCount', 1, 'invalid-verification-result')
  assertInteger(result.pieces.verifiedPieces, 'verified pieces', 0, 'invalid-verification-result')
  assertInteger(result.pieces.mismatchedPieces, 'mismatched pieces', 0, 'invalid-verification-result')
  if (!Array.isArray(result.pieces.mismatchPieceIndexes)) {
    fail('invalid-verification-result', 'mismatch piece indexes must be an array')
  }
  for (const value of result.pieces.mismatchPieceIndexes) {
    assertInteger(value, 'mismatch piece index', 0, 'invalid-verification-result')
  }
  if (
    result.pieces.pieceCount !== result.torrent.pieceCount ||
    result.pieces.verifiedPieces !== result.torrent.pieceCount ||
    result.pieces.mismatchedPieces !== 0 ||
    result.pieces.mismatchPieceIndexes.length !== 0
  ) {
    fail('unverified-torrent-pieces', 'torrent piece verification is not complete and mismatch-free')
  }
  if (result.torrent.rawInfoMatchesCanonicalEncoding !== true) {
    fail('noncanonical-torrent-info', 'torrent raw info does not match canonical encoding')
  }
  if (result.comparisons.payloadFilenameMatchesLocalMedia !== true) {
    fail('payload-filename-comparison-failed', 'torrent payload filename comparison did not pass')
  }
  if (result.comparisons.payloadByteSizeMatchesLocalMedia !== true) {
    fail('payload-byte-size-comparison-failed', 'torrent payload byte-size comparison did not pass')
  }

  return {
    relativePath: mappingAssignment.torrentRelativePath,
    torrentByteSize: result.torrent.torrentByteSize,
    torrentSha256: result.torrent.torrentSha256,
    infoHash: result.torrent.infoHash,
    fileIdx: result.torrent.fileIdx,
    payloadFilename: result.torrent.payloadFilename,
    payloadByteSize: result.torrent.declaredPayloadByteSize,
    pieceLength: result.torrent.pieceLength,
    pieceCount: result.torrent.pieceCount,
    verifiedPieces: result.pieces.verifiedPieces,
    mismatchedPieces: result.pieces.mismatchedPieces,
    mismatchPieceIndexes: [...result.pieces.mismatchPieceIndexes],
    rawInfoMatchesCanonicalEncoding: result.torrent.rawInfoMatchesCanonicalEncoding,
    payloadFilenameMatchesLocalMedia: result.comparisons.payloadFilenameMatchesLocalMedia,
    payloadByteSizeMatchesLocalMedia: result.comparisons.payloadByteSizeMatchesLocalMedia
  }
}

function validateWarning(warning, label) {
  const keys = Object.hasOwn(warning, 'streamIndex') ? ['code', 'streamIndex'] : ['code']
  assertExactKeys(warning, keys, label, 'invalid-manifest')
  assertNonEmptyString(warning.code, `${label}.code`, 'invalid-manifest')
  if (Object.hasOwn(warning, 'streamIndex')) {
    assertInteger(warning.streamIndex, `${label}.streamIndex`, 0, 'invalid-manifest')
  }
}

function validateVideoStream(stream, label) {
  assertExactKeys(stream, [
    'index', 'codecName', 'profile', 'width', 'height', 'pixelFormat',
    'attachedPic', 'default', 'forced'
  ], label, 'invalid-manifest')
  assertNullableInteger(stream.index, `${label}.index`, 0, 'invalid-manifest')
  assertNullableString(stream.codecName, `${label}.codecName`, 'invalid-manifest')
  assertNullableString(stream.profile, `${label}.profile`, 'invalid-manifest')
  assertNullableInteger(stream.width, `${label}.width`, 1, 'invalid-manifest')
  assertNullableInteger(stream.height, `${label}.height`, 1, 'invalid-manifest')
  assertNullableString(stream.pixelFormat, `${label}.pixelFormat`, 'invalid-manifest')
  assertNullableFlag(stream.attachedPic, `${label}.attachedPic`, 'invalid-manifest')
  assertNullableFlag(stream.default, `${label}.default`, 'invalid-manifest')
  assertNullableFlag(stream.forced, `${label}.forced`, 'invalid-manifest')
}

function validateAudioStream(stream, label) {
  assertExactKeys(stream, [
    'index', 'codecName', 'profile', 'channels', 'channelLayout', 'language',
    'title', 'default', 'forced'
  ], label, 'invalid-manifest')
  assertNullableInteger(stream.index, `${label}.index`, 0, 'invalid-manifest')
  assertNullableString(stream.codecName, `${label}.codecName`, 'invalid-manifest')
  assertNullableString(stream.profile, `${label}.profile`, 'invalid-manifest')
  assertNullableInteger(stream.channels, `${label}.channels`, 1, 'invalid-manifest')
  assertNullableString(stream.channelLayout, `${label}.channelLayout`, 'invalid-manifest')
  assertNullableString(stream.language, `${label}.language`, 'invalid-manifest')
  assertNullableString(stream.title, `${label}.title`, 'invalid-manifest')
  assertNullableFlag(stream.default, `${label}.default`, 'invalid-manifest')
  assertNullableFlag(stream.forced, `${label}.forced`, 'invalid-manifest')
}

function validateSubtitleStream(stream, label) {
  assertExactKeys(stream, [
    'index', 'codecName', 'language', 'title', 'default', 'forced'
  ], label, 'invalid-manifest')
  assertNullableInteger(stream.index, `${label}.index`, 0, 'invalid-manifest')
  assertNullableString(stream.codecName, `${label}.codecName`, 'invalid-manifest')
  assertNullableString(stream.language, `${label}.language`, 'invalid-manifest')
  assertNullableString(stream.title, `${label}.title`, 'invalid-manifest')
  assertNullableFlag(stream.default, `${label}.default`, 'invalid-manifest')
  assertNullableFlag(stream.forced, `${label}.forced`, 'invalid-manifest')
}

function validateAcquisitionManifest(manifest) {
  assertExactKeys(manifest, ['schemaVersion', 'authorityDomain', 'entries'], 'manifest', 'invalid-manifest')
  if (manifest.schemaVersion !== 1) fail('invalid-manifest', 'unsupported manifest schemaVersion')
  if (manifest.authorityDomain !== 'technical-acquisition') {
    fail('invalid-manifest', 'manifest authorityDomain must be technical-acquisition')
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    fail('invalid-manifest', 'manifest entries must be a non-empty array')
  }

  const recordIds = new Set()
  const videoIds = new Set()
  const mediaPaths = new Set()
  const torrentPaths = new Set()
  for (const [index, entry] of manifest.entries.entries()) {
    const label = `manifest.entries[${index}]`
    assertExactKeys(entry, ['recordId', 'videoId', 'media', 'torrent'], label, 'invalid-manifest')
    assertNonEmptyString(entry.recordId, `${label}.recordId`, 'invalid-manifest')
    assertNonEmptyString(entry.videoId, `${label}.videoId`, 'invalid-manifest')
    if (recordIds.has(entry.recordId) || videoIds.has(entry.videoId)) {
      fail('invalid-manifest', 'manifest identities must be unique')
    }
    recordIds.add(entry.recordId)
    videoIds.add(entry.videoId)

    assertExactKeys(entry.media, [
      'relativePath', 'byteSize', 'container', 'videoStreams', 'audioStreams',
      'subtitleStreams', 'attachmentCount', 'otherStreamCount', 'warnings'
    ], `${label}.media`, 'invalid-manifest')
    validateRelativeArtifactPath(entry.media.relativePath, `${label}.media.relativePath`, 'invalid-manifest')
    if (mediaPaths.has(entry.media.relativePath)) fail('invalid-manifest', 'manifest media paths must be unique')
    mediaPaths.add(entry.media.relativePath)
    assertInteger(entry.media.byteSize, `${label}.media.byteSize`, 1, 'invalid-manifest')
    assertExactKeys(entry.media.container, ['formatName', 'durationSeconds'], `${label}.media.container`, 'invalid-manifest')
    assertNullableString(entry.media.container.formatName, `${label}.media.container.formatName`, 'invalid-manifest')
    assertPositiveNumberOrNull(entry.media.container.durationSeconds, `${label}.media.container.durationSeconds`, 'invalid-manifest')
    if (!Array.isArray(entry.media.videoStreams) || !Array.isArray(entry.media.audioStreams) ||
      !Array.isArray(entry.media.subtitleStreams) || !Array.isArray(entry.media.warnings)) {
      fail('invalid-manifest', `${label}.media stream and warning fields must be arrays`)
    }
    entry.media.videoStreams.forEach((stream, streamNumber) => validateVideoStream(
      stream,
      `${label}.media.videoStreams[${streamNumber}]`
    ))
    entry.media.audioStreams.forEach((stream, streamNumber) => validateAudioStream(
      stream,
      `${label}.media.audioStreams[${streamNumber}]`
    ))
    entry.media.subtitleStreams.forEach((stream, streamNumber) => validateSubtitleStream(
      stream,
      `${label}.media.subtitleStreams[${streamNumber}]`
    ))
    assertInteger(entry.media.attachmentCount, `${label}.media.attachmentCount`, 0, 'invalid-manifest')
    assertInteger(entry.media.otherStreamCount, `${label}.media.otherStreamCount`, 0, 'invalid-manifest')
    entry.media.warnings.forEach((warning, warningNumber) => validateWarning(
      warning,
      `${label}.media.warnings[${warningNumber}]`
    ))

    assertExactKeys(entry.torrent, [
      'relativePath', 'torrentByteSize', 'torrentSha256', 'infoHash', 'fileIdx',
      'payloadFilename', 'payloadByteSize', 'pieceLength', 'pieceCount',
      'verifiedPieces', 'mismatchedPieces', 'mismatchPieceIndexes',
      'rawInfoMatchesCanonicalEncoding', 'payloadFilenameMatchesLocalMedia',
      'payloadByteSizeMatchesLocalMedia'
    ], `${label}.torrent`, 'invalid-manifest')
    validateRelativeArtifactPath(entry.torrent.relativePath, `${label}.torrent.relativePath`, 'invalid-manifest')
    if (torrentPaths.has(entry.torrent.relativePath)) fail('invalid-manifest', 'manifest torrent paths must be unique')
    torrentPaths.add(entry.torrent.relativePath)
    assertInteger(entry.torrent.torrentByteSize, `${label}.torrent.torrentByteSize`, 1, 'invalid-manifest')
    if (!/^[0-9a-f]{64}$/u.test(entry.torrent.torrentSha256)) fail('invalid-manifest', 'invalid torrent SHA256')
    if (!/^[0-9a-f]{40}$/u.test(entry.torrent.infoHash)) fail('invalid-manifest', 'invalid torrent infoHash')
    assertInteger(entry.torrent.fileIdx, `${label}.torrent.fileIdx`, 0, 'invalid-manifest')
    assertNonEmptyString(entry.torrent.payloadFilename, `${label}.torrent.payloadFilename`, 'invalid-manifest')
    assertInteger(entry.torrent.payloadByteSize, `${label}.torrent.payloadByteSize`, 1, 'invalid-manifest')
    assertInteger(entry.torrent.pieceLength, `${label}.torrent.pieceLength`, 1, 'invalid-manifest')
    assertInteger(entry.torrent.pieceCount, `${label}.torrent.pieceCount`, 1, 'invalid-manifest')
    assertInteger(entry.torrent.verifiedPieces, `${label}.torrent.verifiedPieces`, 0, 'invalid-manifest')
    assertInteger(entry.torrent.mismatchedPieces, `${label}.torrent.mismatchedPieces`, 0, 'invalid-manifest')
    if (!Array.isArray(entry.torrent.mismatchPieceIndexes)) fail('invalid-manifest', 'mismatch indexes must be an array')
    if (
      entry.torrent.verifiedPieces !== entry.torrent.pieceCount ||
      entry.torrent.mismatchedPieces !== 0 ||
      entry.torrent.mismatchPieceIndexes.length !== 0 ||
      entry.torrent.rawInfoMatchesCanonicalEncoding !== true ||
      entry.torrent.payloadFilenameMatchesLocalMedia !== true ||
      entry.torrent.payloadByteSizeMatchesLocalMedia !== true
    ) {
      fail('invalid-manifest', 'manifest torrent verification facts must all pass')
    }
  }
  return manifest
}

function buildAcquisitionManifest({ mapping, inspectionReport, verificationReport, concentrated, registry }) {
  const assignments = validateMapping(mapping, concentrated, registry)
  const inspections = indexInspectionResults(inspectionReport)
  const verifications = indexVerificationResults(verificationReport)
  const entries = []

  for (const assignment of assignments) {
    const inspection = inspections.get(assignment.videoId)
    if (!inspection) fail('missing-inspection-result', `missing inspection result for ${assignment.videoId}`)
    const verification = verifications.get(assignment.videoId)
    if (!verification) fail('missing-verification-result', `missing verification result for ${assignment.videoId}`)
    const media = mediaFromInspection(assignment, inspection)
    const torrent = torrentFromVerification(assignment, verification, media)
    entries.push({
      recordId: assignment.recordId,
      videoId: assignment.videoId,
      media,
      torrent
    })
  }
  if (inspections.size !== assignments.length) {
    fail('unexpected-inspection-result', 'inspection report contains an unmapped result')
  }
  if (verifications.size !== assignments.length) {
    fail('unexpected-verification-result', 'verification report contains an unmapped result')
  }

  return validateAcquisitionManifest({
    schemaVersion: 1,
    authorityDomain: 'technical-acquisition',
    entries
  })
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function writeAcquisitionManifest({ manifest, outputPath }) {
  validateAcquisitionManifest(manifest)
  assertNonEmptyString(outputPath, 'output path', 'invalid-output-path')
  if (outputPath.includes('\0')) fail('invalid-output-path', 'output path contains a null byte')
  const resolvedOutput = path.resolve(outputPath)
  const parent = path.dirname(resolvedOutput)
  let parentStats
  try {
    parentStats = fs.statSync(parent)
  } catch {
    fail('missing-output-directory', 'output parent directory does not exist')
  }
  if (!parentStats.isDirectory()) fail('invalid-output-directory', 'output parent must be a directory')

  const bytes = jsonBytes(manifest)
  const outputSha256 = sha256(bytes)
  if (fs.existsSync(resolvedOutput)) {
    let outputStats
    try {
      outputStats = fs.lstatSync(resolvedOutput)
    } catch {
      fail('output-unreadable', 'existing output is not readable')
    }
    if (!outputStats.isFile() || outputStats.isSymbolicLink()) {
      fail('invalid-output-file', 'existing output must be a regular non-symlink file')
    }
    let existing
    try {
      existing = fs.readFileSync(resolvedOutput)
    } catch {
      fail('output-unreadable', 'existing output is not readable')
    }
    if (!existing.equals(bytes)) fail('output-conflict', 'existing output differs and will not be overwritten')
    return {
      schemaVersion: 1,
      reportKind: 'acquisition-manifest-generation',
      state: 'already-identical',
      entryCount: manifest.entries.length,
      outputSha256
    }
  }

  try {
    fs.writeFileSync(resolvedOutput, bytes, { flag: 'wx' })
  } catch (error) {
    if (error && error.code === 'EEXIST') fail('output-conflict', 'output appeared and will not be overwritten')
    fail('output-write-failed', 'output could not be written')
  }
  return {
    schemaVersion: 1,
    reportKind: 'acquisition-manifest-generation',
    state: 'created',
    entryCount: manifest.entries.length,
    outputSha256
  }
}

function parseArguments(argv) {
  if (
    argv.length !== 8 ||
    argv[0] !== '--mapping' ||
    argv[2] !== '--inspection-report' ||
    argv[4] !== '--verification-report' ||
    argv[6] !== '--output' ||
    argv.some((value, index) => index % 2 === 1 && (typeof value !== 'string' || value.length === 0))
  ) {
    fail(
      'invalid-arguments',
      'usage: generate-acquisition-manifest.js --mapping <mapping-json> --inspection-report <inspection-json> --verification-report <verification-json> --output <manifest-json>'
    )
  }
  return {
    mappingPath: argv[1],
    inspectionReportPath: argv[3],
    verificationReportPath: argv[5],
    outputPath: argv[7]
  }
}

function readJson(filename, label) {
  try {
    return JSON.parse(fs.readFileSync(filename, 'utf8'))
  } catch {
    fail('invalid-json', `${label} is not readable valid JSON`)
  }
}

function emitStatus(report, output = process.stdout) {
  output.write(`${JSON.stringify(report, null, 2)}\n`)
}

function main() {
  try {
    const args = parseArguments(process.argv.slice(2))
    const manifest = buildAcquisitionManifest({
      mapping: readJson(path.resolve(process.cwd(), args.mappingPath), 'mapping'),
      inspectionReport: readJson(path.resolve(process.cwd(), args.inspectionReportPath), 'inspection report'),
      verificationReport: readJson(path.resolve(process.cwd(), args.verificationReportPath), 'verification report'),
      concentrated: readJson(
        path.join(repositoryRoot, 'editorial', 'normalized', 'concentrated.json'),
        'normalized Concentrated records'
      ),
      registry: readJson(
        path.join(repositoryRoot, 'projection', 'stremio', 'video-id-registry.json'),
        'video-ID registry'
      )
    })
    emitStatus(writeAcquisitionManifest({ manifest, outputPath: args.outputPath }))
  } catch (error) {
    const known = error instanceof AcquisitionManifestError
    emitStatus({
      schemaVersion: 1,
      reportKind: 'acquisition-manifest-generation',
      state: 'failed',
      entryCount: 0,
      outputSha256: null
    })
    process.stderr.write(`acquisition manifest generation failed: ${known ? error.manifestCode : 'unexpected-error'}\n`)
    process.exitCode = 1
  }
}

if (require.main === module) main()

module.exports = {
  AcquisitionManifestError,
  buildAcquisitionManifest,
  jsonBytes,
  parseArguments,
  validateAcquisitionManifest,
  validateMapping,
  validateRelativeArtifactPath,
  writeAcquisitionManifest
}
