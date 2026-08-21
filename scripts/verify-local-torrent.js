#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { TextDecoder } = require('node:util')

const repositoryRoot = path.resolve(__dirname, '..')
const NORMALIZED_PROJECT_IDS = Object.freeze(['concentrated', 'hollowed', 'chipped'])
const PIECE_READ_BUFFER_SIZE = 64 * 1024
const MAX_BENCODE_DEPTH = 100
const MAX_BENCODE_NODES = 1_000_000

class LocalTorrentVerificationError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'LocalTorrentVerificationError'
    this.verificationCode = code
  }
}

function fail(code, message) {
  throw new LocalTorrentVerificationError(code, message)
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('invalid-mapping', `${label} must be an object`)
  }
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail('invalid-mapping', `${label} has missing or unexpected fields`)
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail('invalid-mapping', `${label} must be a non-empty string`)
  }
}

function parseBencode(input) {
  if (!Buffer.isBuffer(input)) fail('malformed-bencode', 'torrent bencode must be bytes')
  let offset = 0
  let nodeCount = 0

  const nextNode = (depth) => {
    nodeCount += 1
    if (nodeCount > MAX_BENCODE_NODES || depth > MAX_BENCODE_DEPTH) {
      fail('malformed-bencode', 'torrent bencode exceeds structural limits')
    }
    if (offset >= input.length) fail('malformed-bencode', 'torrent bencode ended unexpectedly')

    const start = offset
    const marker = input[offset]
    if (marker >= 0x30 && marker <= 0x39) return parseByteString(depth, start)
    if (marker === 0x69) return parseInteger(start)
    if (marker === 0x6c) return parseList(depth, start)
    if (marker === 0x64) return parseDictionary(depth, start)
    fail('malformed-bencode', 'torrent bencode contains an invalid value marker')
  }

  const parseByteString = (_depth, start) => {
    const colon = input.indexOf(0x3a, offset)
    if (colon === -1) fail('malformed-bencode', 'bencoded byte string lacks a length separator')
    const lengthToken = input.subarray(offset, colon).toString('ascii')
    if (!/^(?:0|[1-9][0-9]*)$/u.test(lengthToken)) {
      fail('malformed-bencode', 'bencoded byte string has an invalid length')
    }
    const lengthBigInt = BigInt(lengthToken)
    if (lengthBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
      fail('unsafe-integer', 'bencoded byte string length exceeds safe integer handling')
    }
    const length = Number(lengthBigInt)
    const valueStart = colon + 1
    const end = valueStart + length
    if (!Number.isSafeInteger(end) || end > input.length) {
      fail('malformed-bencode', 'bencoded byte string exceeds the torrent bytes')
    }
    offset = end
    return {
      type: 'bytes',
      value: input.subarray(valueStart, end),
      start,
      end
    }
  }

  const parseInteger = (start) => {
    offset += 1
    const endMarker = input.indexOf(0x65, offset)
    if (endMarker === -1) fail('malformed-bencode', 'bencoded integer is unterminated')
    const token = input.subarray(offset, endMarker).toString('ascii')
    if (!/^(?:0|-?[1-9][0-9]*)$/u.test(token) || token === '-0') {
      fail('malformed-bencode', 'bencoded integer has an invalid representation')
    }
    let value
    try {
      value = BigInt(token)
    } catch {
      fail('malformed-bencode', 'bencoded integer is invalid')
    }
    offset = endMarker + 1
    return { type: 'integer', value, start, end: offset }
  }

  const parseList = (depth, start) => {
    offset += 1
    const values = []
    while (true) {
      if (offset >= input.length) fail('malformed-bencode', 'bencoded list is unterminated')
      if (input[offset] === 0x65) {
        offset += 1
        return { type: 'list', values, start, end: offset }
      }
      values.push(nextNode(depth + 1))
    }
  }

  const parseDictionary = (depth, start) => {
    offset += 1
    const entries = []
    const keys = new Set()
    while (true) {
      if (offset >= input.length) fail('malformed-bencode', 'bencoded dictionary is unterminated')
      if (input[offset] === 0x65) {
        offset += 1
        return { type: 'dictionary', entries, start, end: offset }
      }
      if (input[offset] < 0x30 || input[offset] > 0x39) {
        fail('malformed-bencode', 'bencoded dictionary key must be a byte string')
      }
      const key = parseByteString(depth + 1, offset)
      const keyIdentity = key.value.toString('hex')
      if (keys.has(keyIdentity)) fail('duplicate-bencode-key', 'bencoded dictionary contains a duplicate key')
      keys.add(keyIdentity)
      entries.push({ key, value: nextNode(depth + 1) })
    }
  }

  const root = nextNode(0)
  if (offset !== input.length) fail('malformed-bencode', 'torrent bencode contains trailing bytes')
  return root
}

function canonicalBencode(node) {
  if (!node || typeof node !== 'object') fail('malformed-bencode', 'cannot encode an invalid bencode node')
  if (node.type === 'bytes') {
    return Buffer.concat([Buffer.from(`${node.value.length}:`, 'ascii'), node.value])
  }
  if (node.type === 'integer') return Buffer.from(`i${node.value.toString()}e`, 'ascii')
  if (node.type === 'list') {
    return Buffer.concat([
      Buffer.from('l'),
      ...node.values.map(canonicalBencode),
      Buffer.from('e')
    ])
  }
  if (node.type === 'dictionary') {
    const entries = [...node.entries].sort((left, right) => Buffer.compare(left.key.value, right.key.value))
    return Buffer.concat([
      Buffer.from('d'),
      ...entries.flatMap(({ key, value }) => [canonicalBencode(key), canonicalBencode(value)]),
      Buffer.from('e')
    ])
  }
  fail('malformed-bencode', 'cannot encode an unknown bencode node type')
}

function dictionaryValue(dictionary, name) {
  if (!dictionary || dictionary.type !== 'dictionary') {
    fail('malformed-torrent-structure', 'torrent value must be a dictionary')
  }
  const keyBytes = Buffer.from(name, 'utf8')
  const match = dictionary.entries.find((entry) => entry.key.value.equals(keyBytes))
  return match ? match.value : null
}

function requiredDictionaryValue(dictionary, name) {
  const value = dictionaryValue(dictionary, name)
  if (value === null) fail('malformed-torrent-structure', `torrent info lacks required ${name}`)
  return value
}

function byteStringValue(node, label) {
  if (!node || node.type !== 'bytes') fail('malformed-torrent-structure', `${label} must be a byte string`)
  return node.value
}

function safeIntegerValue(node, label, minimum = 0) {
  if (!node || node.type !== 'integer') fail('malformed-torrent-structure', `${label} must be an integer`)
  if (node.value < BigInt(minimum)) fail('malformed-torrent-structure', `${label} is outside the supported range`)
  if (node.value > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail('unsafe-integer', `${label} exceeds safe integer handling`)
  }
  return Number(node.value)
}

function utf8Value(node, label) {
  const bytes = byteStringValue(node, label)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    fail('malformed-torrent-structure', `${label} must be valid UTF-8`)
  }
}

function inspectTorrentBytes(torrentBytes) {
  const torrentSha256 = crypto.createHash('sha256').update(torrentBytes).digest('hex')
  const root = parseBencode(torrentBytes)
  if (root.type !== 'dictionary') fail('malformed-torrent-structure', 'torrent root must be a dictionary')
  const info = requiredDictionaryValue(root, 'info')
  if (info.type !== 'dictionary') fail('malformed-torrent-structure', 'torrent info must be a dictionary')
  const rawInfo = torrentBytes.subarray(info.start, info.end)
  const infoHash = crypto.createHash('sha1').update(rawInfo).digest('hex')
  const rawInfoMatchesCanonicalEncoding = rawInfo.equals(canonicalBencode(info))

  if (dictionaryValue(info, 'files') !== null) {
    fail('unsupported-multifile-torrent', 'multifile torrents are not supported')
  }

  const payloadFilename = utf8Value(requiredDictionaryValue(info, 'name'), 'torrent info name')
  const pieceLength = safeIntegerValue(requiredDictionaryValue(info, 'piece length'), 'torrent piece length', 1)
  const declaredPayloadByteSize = safeIntegerValue(requiredDictionaryValue(info, 'length'), 'torrent payload length', 0)
  const pieceHashes = byteStringValue(requiredDictionaryValue(info, 'pieces'), 'torrent info pieces')
  if (pieceHashes.length % 20 !== 0) {
    fail('malformed-pieces-length', 'torrent pieces length must be a multiple of 20')
  }
  const pieceCount = pieceHashes.length / 20
  const expectedPieceCount = declaredPayloadByteSize === 0
    ? 0
    : Math.ceil(declaredPayloadByteSize / pieceLength)
  if (pieceCount !== expectedPieceCount) {
    fail('piece-count-mismatch', 'torrent piece count does not match declared payload length')
  }

  return {
    torrentSha256,
    infoHash,
    rawInfoMatchesCanonicalEncoding,
    payloadFilename,
    pieceLength,
    pieceCount,
    declaredPayloadByteSize,
    pieceHashes
  }
}

function lexicalPathError(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) return 'empty'
  if (relativePath.includes('\0')) return 'null-byte'
  if (path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) return 'absolute'
  const posixNormalized = path.posix.normalize(relativePath)
  const win32Normalized = path.win32.normalize(relativePath)
  if (
    posixNormalized === '..' || posixNormalized.startsWith('../') ||
    win32Normalized === '..' || win32Normalized.startsWith('..\\')
  ) return 'traversal'
  return null
}

function sanitizedReportedPath(relativePath) {
  return lexicalPathError(relativePath) === null ? relativePath : '[rejected-path]'
}

function resolveRegularFile(rootDir, relativePath, kind) {
  const pathError = lexicalPathError(relativePath)
  if (pathError !== null) fail(`invalid-${kind}-path`, `${kind} path must be repository-relative`)

  const resolved = path.resolve(rootDir, relativePath)
  const lexicalRelative = path.relative(rootDir, resolved)
  if (
    lexicalRelative === '..' || lexicalRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(lexicalRelative)
  ) fail(`${kind}-path-escape`, `${kind} path escapes the repository`)

  let realRoot
  let realFile
  try {
    realRoot = fs.realpathSync(rootDir)
    realFile = fs.realpathSync(resolved)
  } catch (error) {
    if (error && error.code === 'ENOENT') fail(`missing-${kind}-file`, `${kind} file is missing`)
    fail(`${kind}-file-unreadable`, `${kind} file is not readable`)
  }
  const canonicalRelative = path.relative(realRoot, realFile)
  if (
    canonicalRelative === '..' || canonicalRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(canonicalRelative)
  ) fail(`${kind}-path-escape`, `${kind} canonical path escapes the repository`)

  let stats
  try {
    stats = fs.statSync(realFile)
  } catch {
    fail(`${kind}-file-unreadable`, `${kind} file is not readable`)
  }
  if (!stats.isFile()) fail(`${kind}-not-regular-file`, `${kind} path must identify a regular file`)
  return {
    realPath: realFile,
    filename: path.basename(resolved),
    byteSize: stats.size
  }
}

function verifyPieces(mediaPath, declaredPayloadByteSize, pieceLength, pieceHashes) {
  const pieceCount = pieceHashes.length / 20
  const mismatchPieceIndexes = []
  const buffer = Buffer.alloc(Math.min(PIECE_READ_BUFFER_SIZE, pieceLength))
  let descriptor
  try {
    descriptor = fs.openSync(mediaPath, 'r')
    let position = 0
    for (let pieceIndex = 0; pieceIndex < pieceCount; pieceIndex += 1) {
      const bytesInPiece = Math.min(pieceLength, declaredPayloadByteSize - position)
      const digest = crypto.createHash('sha1')
      let pieceBytesRead = 0
      while (pieceBytesRead < bytesInPiece) {
        const wanted = Math.min(buffer.length, bytesInPiece - pieceBytesRead)
        const bytesRead = fs.readSync(descriptor, buffer, 0, wanted, position + pieceBytesRead)
        if (bytesRead <= 0) fail('media-read-failed', 'media file ended during piece verification')
        digest.update(buffer.subarray(0, bytesRead))
        pieceBytesRead += bytesRead
      }
      const actual = digest.digest()
      const expected = pieceHashes.subarray(pieceIndex * 20, pieceIndex * 20 + 20)
      if (!actual.equals(expected)) mismatchPieceIndexes.push(pieceIndex)
      position += bytesInPiece
    }
    if (position !== declaredPayloadByteSize) {
      fail('media-read-failed', 'media bytes did not match the declared payload length')
    }
  } catch (error) {
    if (error instanceof LocalTorrentVerificationError) throw error
    fail('media-read-failed', 'media file could not be read for piece verification')
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
  }
  return {
    pieceCount,
    verifiedPieces: pieceCount - mismatchPieceIndexes.length,
    mismatchedPieces: mismatchPieceIndexes.length,
    mismatchPieceIndexes
  }
}

function validateMapping(mapping) {
  assertExactKeys(mapping, ['schemaVersion', 'assignments'], 'mapping')
  if (mapping.schemaVersion !== 1) fail('invalid-mapping', 'unsupported mapping schemaVersion')
  if (!Array.isArray(mapping.assignments) || mapping.assignments.length === 0) {
    fail('invalid-mapping', 'mapping.assignments must be a non-empty array')
  }
  const recordIds = new Set()
  const videoIds = new Set()
  const mediaPaths = new Set()
  const torrentPaths = new Set()
  return mapping.assignments.map((assignment, index) => {
    const label = `mapping.assignments[${index}]`
    assertExactKeys(
      assignment,
      ['recordId', 'videoId', 'mediaRelativePath', 'torrentRelativePath'],
      label
    )
    assertNonEmptyString(assignment.recordId, `${label}.recordId`)
    assertNonEmptyString(assignment.videoId, `${label}.videoId`)
    if (recordIds.has(assignment.recordId)) fail('invalid-mapping', 'mapping contains a duplicate recordId')
    if (videoIds.has(assignment.videoId)) fail('invalid-mapping', 'mapping contains a duplicate videoId')
    recordIds.add(assignment.recordId)
    videoIds.add(assignment.videoId)
    if (typeof assignment.mediaRelativePath === 'string' && lexicalPathError(assignment.mediaRelativePath) === null) {
      if (mediaPaths.has(assignment.mediaRelativePath)) fail('invalid-mapping', 'mapping contains a duplicate mediaRelativePath')
      mediaPaths.add(assignment.mediaRelativePath)
    }
    if (typeof assignment.torrentRelativePath === 'string' && lexicalPathError(assignment.torrentRelativePath) === null) {
      if (torrentPaths.has(assignment.torrentRelativePath)) fail('invalid-mapping', 'mapping contains a duplicate torrentRelativePath')
      torrentPaths.add(assignment.torrentRelativePath)
    }
    return { ...assignment }
  })
}

function reportedAssignment(assignment) {
  return {
    recordId: assignment.recordId,
    videoId: assignment.videoId,
    mediaRelativePath: sanitizedReportedPath(assignment.mediaRelativePath),
    torrentRelativePath: sanitizedReportedPath(assignment.torrentRelativePath)
  }
}

function failureResult(assignment, error, observations = {}) {
  const known = error instanceof LocalTorrentVerificationError
  return {
    ...reportedAssignment(assignment),
    state: 'failed',
    error: {
      code: known ? error.verificationCode : 'verification-failed',
      message: known ? error.message : 'local torrent verification failed'
    },
    ...observations
  }
}

function validateIdentity(assignment, normalizedRecords, registry) {
  const records = normalizedRecords.filter((candidate) => candidate.recordId === assignment.recordId)
  if (records.length !== 1) {
    fail('unknown-record-id', 'recordId is not one unique normalized default record')
  }
  const matches = registry.entries.filter((candidate) => candidate.videoId === assignment.videoId)
  if (matches.length !== 1 || matches[0].recordType !== 'normalized-record') {
    fail('unknown-video-id', 'videoId is not one unique normalized default-record registry entry')
  }
  if (matches[0].recordId !== assignment.recordId) {
    fail('record-video-mismatch', 'recordId and videoId do not match the permanent registry')
  }
  if (matches[0].projectId !== records[0].projectId) {
    fail('record-video-mismatch', 'normalized record projectId and registry projectId do not match')
  }
  return registry.entries.indexOf(matches[0])
}

function verifyAssignment({ assignment, normalizedRecords, registry, rootDir = repositoryRoot }) {
  try {
    validateIdentity(assignment, normalizedRecords, registry)
    const mediaFile = resolveRegularFile(rootDir, assignment.mediaRelativePath, 'media')
    const torrentFile = resolveRegularFile(rootDir, assignment.torrentRelativePath, 'torrent')
    let torrentBytes
    try {
      torrentBytes = fs.readFileSync(torrentFile.realPath)
    } catch {
      fail('torrent-file-unreadable', 'torrent file is not readable')
    }
    const torrentInfo = inspectTorrentBytes(torrentBytes)
    const payloadFilenameMatchesLocalMedia = torrentInfo.payloadFilename === mediaFile.filename
    const payloadByteSizeMatchesLocalMedia = torrentInfo.declaredPayloadByteSize === mediaFile.byteSize
    const observations = {
      torrent: {
        torrentRelativePath: assignment.torrentRelativePath,
        torrentByteSize: torrentFile.byteSize,
        torrentSha256: torrentInfo.torrentSha256,
        infoHash: torrentInfo.infoHash,
        rawInfoMatchesCanonicalEncoding: torrentInfo.rawInfoMatchesCanonicalEncoding,
        payloadFilename: torrentInfo.payloadFilename,
        pieceLength: torrentInfo.pieceLength,
        pieceCount: torrentInfo.pieceCount,
        declaredPayloadByteSize: torrentInfo.declaredPayloadByteSize,
        fileIdx: 0
      },
      media: {
        mediaRelativePath: assignment.mediaRelativePath,
        filename: mediaFile.filename,
        byteSize: mediaFile.byteSize
      },
      comparisons: {
        payloadFilenameMatchesLocalMedia,
        payloadByteSizeMatchesLocalMedia
      }
    }
    if (!payloadFilenameMatchesLocalMedia) {
      return failureResult(
        assignment,
        new LocalTorrentVerificationError('payload-filename-mismatch', 'torrent payload filename does not match local media'),
        observations
      )
    }
    if (!payloadByteSizeMatchesLocalMedia) {
      return failureResult(
        assignment,
        new LocalTorrentVerificationError('payload-size-mismatch', 'torrent payload size does not match local media'),
        observations
      )
    }
    const pieces = verifyPieces(
      mediaFile.realPath,
      torrentInfo.declaredPayloadByteSize,
      torrentInfo.pieceLength,
      torrentInfo.pieceHashes
    )
    if (pieces.mismatchedPieces !== 0) {
      return failureResult(
        assignment,
        new LocalTorrentVerificationError('piece-hash-mismatch', 'one or more local media pieces do not match the torrent'),
        { ...observations, pieces }
      )
    }
    return {
      ...reportedAssignment(assignment),
      state: 'verified',
      ...observations,
      pieces
    }
  } catch (error) {
    return failureResult(assignment, error)
  }
}

function createVerificationReport({
  mapping,
  normalizedRecords,
  registry,
  rootDir = repositoryRoot
}) {
  const assignments = validateMapping(mapping)
  if (!Array.isArray(normalizedRecords) || !registry || !Array.isArray(registry.entries)) {
    fail('invalid-mapping', 'identity sources must contain normalized records and registry entries')
  }
  const registryIndex = new Map(registry.entries.map((entry, index) => [entry.videoId, index]))
  assignments.sort((left, right) => {
    const leftIndex = registryIndex.has(left.videoId) ? registryIndex.get(left.videoId) : Number.MAX_SAFE_INTEGER
    const rightIndex = registryIndex.has(right.videoId) ? registryIndex.get(right.videoId) : Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex ||
      left.videoId.localeCompare(right.videoId) ||
      left.recordId.localeCompare(right.recordId) ||
      String(left.mediaRelativePath).localeCompare(String(right.mediaRelativePath)) ||
      String(left.torrentRelativePath).localeCompare(String(right.torrentRelativePath))
  })
  const results = assignments.map((assignment) => verifyAssignment({
    assignment,
    normalizedRecords,
    registry,
    rootDir
  }))
  const verified = results.filter((result) => result.state === 'verified').length
  return {
    schemaVersion: 1,
    reportKind: 'local-torrent-verification',
    verificationSummary: {
      total: results.length,
      verified,
      failed: results.length - verified
    },
    assignments: results
  }
}

function reportExitCode(report) {
  return report.verificationSummary.failed === 0 ? 0 : 1
}

function emitVerificationReport(report, output = process.stdout) {
  output.write(`${JSON.stringify(report, null, 2)}\n`)
  return reportExitCode(report)
}

function parseArguments(argv) {
  try {
    assert.deepEqual(argv.slice(0, 1), ['--mapping'])
    assert.equal(argv.length, 2)
    assert.equal(typeof argv[1], 'string')
    assert.ok(argv[1].length > 0)
  } catch {
    fail('invalid-arguments', 'usage: verify-local-torrent.js --mapping <file>')
  }
  return { mappingPath: argv[1] }
}

function readJson(filename, label) {
  try {
    return JSON.parse(fs.readFileSync(filename, 'utf8'))
  } catch {
    fail('invalid-json', `${label} is not readable valid JSON`)
  }
}

function readNormalizedRecords() {
  return NORMALIZED_PROJECT_IDS.flatMap((projectId) => readJson(
    path.join(repositoryRoot, 'editorial', 'normalized', `${projectId}.json`),
    `normalized ${projectId} records`
  ).records)
}

function main() {
  try {
    const { mappingPath } = parseArguments(process.argv.slice(2))
    const report = createVerificationReport({
      mapping: readJson(path.resolve(process.cwd(), mappingPath), 'mapping file'),
      normalizedRecords: readNormalizedRecords(),
      registry: readJson(
        path.join(repositoryRoot, 'projection', 'stremio', 'video-id-registry.json'),
        'video-ID registry'
      )
    })
    process.exitCode = emitVerificationReport(report)
  } catch (error) {
    const known = error instanceof LocalTorrentVerificationError
    const message = known ? error.message : 'local torrent verification failed'
    process.stderr.write(`local torrent verification failed: ${message}\n`)
    process.exitCode = 1
  }
}

if (require.main === module) main()

module.exports = {
  LocalTorrentVerificationError,
  canonicalBencode,
  createVerificationReport,
  emitVerificationReport,
  inspectTorrentBytes,
  parseArguments,
  parseBencode,
  reportExitCode,
  validateMapping,
  verifyAssignment,
  verifyPieces
}
