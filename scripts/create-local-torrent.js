#!/usr/bin/env node
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const {
  canonicalBencode,
  inspectTorrentBytes
} = require('./verify-local-torrent')

const repositoryRoot = path.resolve(__dirname, '..')
const NORMALIZED_PROJECT_IDS = Object.freeze(['concentrated', 'hollowed', 'chipped'])
const PIECE_LENGTH = 1024 * 1024
const PIECE_READ_BUFFER_SIZE = 64 * 1024

class LocalTorrentCreationError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'LocalTorrentCreationError'
    this.creationCode = code
  }
}

function fail(code, message) {
  throw new LocalTorrentCreationError(code, message)
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

function isWithinDirectory(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (
    relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
  )
}

function resolveMediaFile(rootDir, relativePath) {
  if (lexicalPathError(relativePath) !== null) {
    fail('invalid-media-path', 'media path must be repository-relative')
  }

  const resolved = path.resolve(rootDir, relativePath)
  if (!isWithinDirectory(rootDir, resolved)) {
    fail('media-path-escape', 'media path escapes the repository')
  }

  let realRoot
  let realFile
  try {
    realRoot = fs.realpathSync(rootDir)
    realFile = fs.realpathSync(resolved)
  } catch (error) {
    if (error && error.code === 'ENOENT') fail('missing-media-file', 'media file is missing')
    fail('media-file-unreadable', 'media file is not readable')
  }
  if (!isWithinDirectory(realRoot, realFile)) {
    fail('media-path-escape', 'media canonical path escapes the repository')
  }

  let stats
  try {
    stats = fs.statSync(realFile)
  } catch {
    fail('media-file-unreadable', 'media file is not readable')
  }
  if (!stats.isFile()) fail('media-not-regular-file', 'media path must identify a regular file')
  if (!Number.isSafeInteger(stats.size) || stats.size < 0) {
    fail('media-size-unsupported', 'media file size exceeds safe integer handling')
  }
  if (stats.size === 0) {
    fail('empty-media-file', 'zero-byte media files are not supported')
  }

  return {
    realPath: realFile,
    filename: path.basename(resolved),
    byteSize: stats.size
  }
}

function resolveOutputDirectory(directory) {
  if (typeof directory !== 'string' || directory.length === 0 || directory.includes('\0')) {
    fail('invalid-output-directory', 'output directory must be a non-empty path')
  }
  let canonical
  try {
    canonical = fs.realpathSync(path.resolve(directory))
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      fail('missing-output-directory', 'output directory does not exist')
    }
    fail('output-directory-unreadable', 'output directory is not readable')
  }
  let stats
  try {
    stats = fs.statSync(canonical)
  } catch {
    fail('output-directory-unreadable', 'output directory is not readable')
  }
  if (!stats.isDirectory()) {
    fail('output-directory-not-directory', 'output path must identify an existing directory')
  }
  return canonical
}

function torrentFilenameForPayload(payloadFilename) {
  if (
    typeof payloadFilename !== 'string' || payloadFilename.length === 0 ||
    payloadFilename.includes('\0') ||
    path.posix.basename(payloadFilename) !== payloadFilename ||
    path.win32.basename(payloadFilename) !== payloadFilename ||
    payloadFilename === '.' || payloadFilename === '..'
  ) {
    fail('invalid-output-filename', 'derived torrent filename must remain a basename')
  }
  const torrentFilename = `${payloadFilename}.torrent`
  if (
    path.posix.basename(torrentFilename) !== torrentFilename ||
    path.win32.basename(torrentFilename) !== torrentFilename
  ) {
    fail('invalid-output-filename', 'derived torrent filename must remain a basename')
  }
  return torrentFilename
}

function generatePieceHashes(mediaPath, payloadByteSize, pieceLength = PIECE_LENGTH) {
  if (pieceLength !== PIECE_LENGTH) {
    fail('unsupported-piece-length', `piece length must be ${PIECE_LENGTH}`)
  }
  if (!Number.isSafeInteger(payloadByteSize) || payloadByteSize <= 0) {
    fail('empty-media-file', 'zero-byte media files are not supported')
  }

  const hashes = []
  const buffer = Buffer.alloc(Math.min(PIECE_READ_BUFFER_SIZE, pieceLength))
  let descriptor
  try {
    descriptor = fs.openSync(mediaPath, 'r')
    const startStats = fs.fstatSync(descriptor)
    if (startStats.size !== payloadByteSize) {
      fail('media-changed-during-read', 'media file size changed before piece generation')
    }
    let position = 0
    while (position < payloadByteSize) {
      const bytesInPiece = Math.min(pieceLength, payloadByteSize - position)
      const digest = crypto.createHash('sha1')
      let pieceBytesRead = 0
      while (pieceBytesRead < bytesInPiece) {
        const wanted = Math.min(buffer.length, bytesInPiece - pieceBytesRead)
        const bytesRead = fs.readSync(descriptor, buffer, 0, wanted, position + pieceBytesRead)
        if (bytesRead <= 0) fail('media-read-failed', 'media file ended during piece generation')
        digest.update(buffer.subarray(0, bytesRead))
        pieceBytesRead += bytesRead
      }
      hashes.push(digest.digest())
      position += bytesInPiece
    }
    const endStats = fs.fstatSync(descriptor)
    if (endStats.size !== payloadByteSize) {
      fail('media-changed-during-read', 'media file size changed during piece generation')
    }
  } catch (error) {
    if (error instanceof LocalTorrentCreationError) throw error
    fail('media-read-failed', 'media file could not be read for piece generation')
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
  }
  return Buffer.concat(hashes)
}

function bytesNode(value) {
  return { type: 'bytes', value: Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8') }
}

function integerNode(value) {
  return { type: 'integer', value: BigInt(value) }
}

function dictionaryNode(entries) {
  return {
    type: 'dictionary',
    entries: entries.map(([key, value]) => ({ key: bytesNode(key), value }))
  }
}

function buildTorrentBytes({ payloadFilename, payloadByteSize, pieceHashes }) {
  const infoNode = dictionaryNode([
    ['length', integerNode(payloadByteSize)],
    ['name', bytesNode(payloadFilename)],
    ['piece length', integerNode(PIECE_LENGTH)],
    ['pieces', bytesNode(pieceHashes)]
  ])
  const infoBytes = canonicalBencode(infoNode)
  const torrentBytes = canonicalBencode(dictionaryNode([['info', infoNode]]))
  const observed = inspectTorrentBytes(torrentBytes)
  if (
    !observed.rawInfoMatchesCanonicalEncoding ||
    observed.payloadFilename !== payloadFilename ||
    observed.declaredPayloadByteSize !== payloadByteSize ||
    observed.pieceLength !== PIECE_LENGTH ||
    !observed.pieceHashes.equals(pieceHashes)
  ) {
    fail('generated-torrent-invalid', 'generated torrent failed independent structural inspection')
  }
  const infoHash = crypto.createHash('sha1').update(infoBytes).digest('hex')
  if (observed.infoHash !== infoHash) {
    fail('generated-torrent-invalid', 'generated torrent infoHash failed independent inspection')
  }
  return {
    torrentBytes,
    facts: {
      torrentByteSize: torrentBytes.length,
      torrentSha256: observed.torrentSha256,
      infoHash,
      payloadFilename,
      payloadByteSize,
      pieceLength: PIECE_LENGTH,
      pieceCount: observed.pieceCount,
      fileIdx: 0,
      rawInfoMatchesCanonicalEncoding: true
    }
  }
}

function readExistingOutput(outputPath) {
  let stats
  try {
    stats = fs.lstatSync(outputPath)
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    fail('output-file-unreadable', 'existing output torrent is not readable')
  }
  if (!stats.isFile()) fail('output-conflict', 'existing output path conflicts with generated torrent')
  try {
    return fs.readFileSync(outputPath)
  } catch {
    fail('output-file-unreadable', 'existing output torrent is not readable')
  }
}

function writeTorrentWithoutOverwrite(outputDirectory, torrentFilename, torrentBytes) {
  const outputPath = path.join(outputDirectory, torrentFilename)
  if (!isWithinDirectory(outputDirectory, outputPath) || path.dirname(outputPath) !== outputDirectory) {
    fail('invalid-output-filename', 'derived torrent filename escapes the output directory')
  }

  const existing = readExistingOutput(outputPath)
  if (existing !== null) {
    if (existing.equals(torrentBytes)) return 'already-identical'
    fail('output-conflict', 'existing output torrent differs from generated torrent')
  }

  let descriptor
  try {
    descriptor = fs.openSync(outputPath, 'wx', 0o644)
    fs.writeFileSync(descriptor, torrentBytes)
    fs.closeSync(descriptor)
    descriptor = undefined
    return 'created'
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor)
      } catch {}
    }
    if (error && error.code === 'EEXIST') {
      const raced = readExistingOutput(outputPath)
      if (raced !== null && raced.equals(torrentBytes)) return 'already-identical'
      fail('output-conflict', 'existing output torrent differs from generated torrent')
    }
    fail('output-write-failed', 'output torrent could not be created')
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
  return mapping.assignments.map((assignment, index) => {
    const label = `mapping.assignments[${index}]`
    assertExactKeys(assignment, ['recordId', 'videoId', 'mediaRelativePath'], label)
    assertNonEmptyString(assignment.recordId, `${label}.recordId`)
    assertNonEmptyString(assignment.videoId, `${label}.videoId`)
    if (recordIds.has(assignment.recordId)) fail('invalid-mapping', 'mapping contains a duplicate recordId')
    if (videoIds.has(assignment.videoId)) fail('invalid-mapping', 'mapping contains a duplicate videoId')
    recordIds.add(assignment.recordId)
    videoIds.add(assignment.videoId)
    if (typeof assignment.mediaRelativePath === 'string' && lexicalPathError(assignment.mediaRelativePath) === null) {
      if (mediaPaths.has(assignment.mediaRelativePath)) {
        fail('invalid-mapping', 'mapping contains a duplicate mediaRelativePath')
      }
      mediaPaths.add(assignment.mediaRelativePath)
    }
    return { ...assignment }
  })
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
}

function reportedAssignment(assignment) {
  return {
    recordId: assignment.recordId,
    videoId: assignment.videoId,
    mediaRelativePath: sanitizedReportedPath(assignment.mediaRelativePath)
  }
}

function failureResult(assignment, error) {
  const known = error instanceof LocalTorrentCreationError
  return {
    ...reportedAssignment(assignment),
    state: 'failed',
    error: {
      code: known ? error.creationCode : 'creation-failed',
      message: known ? error.message : 'local torrent creation failed'
    }
  }
}

function createAssignment({ assignment, normalizedRecords, registry, rootDir, outputDirectory }) {
  try {
    validateIdentity(assignment, normalizedRecords, registry)
    const media = resolveMediaFile(rootDir, assignment.mediaRelativePath)
    const torrentFilename = torrentFilenameForPayload(media.filename)
    const pieceHashes = generatePieceHashes(media.realPath, media.byteSize)
    const generated = buildTorrentBytes({
      payloadFilename: media.filename,
      payloadByteSize: media.byteSize,
      pieceHashes
    })
    const state = writeTorrentWithoutOverwrite(
      outputDirectory,
      torrentFilename,
      generated.torrentBytes
    )
    return {
      ...reportedAssignment(assignment),
      state,
      torrentFilename,
      ...generated.facts
    }
  } catch (error) {
    return failureResult(assignment, error)
  }
}

function createCreationReport({
  mapping,
  normalizedRecords,
  registry,
  rootDir = repositoryRoot,
  outputDirectory
}) {
  const assignments = validateMapping(mapping)
  if (!Array.isArray(normalizedRecords) || !registry || !Array.isArray(registry.entries)) {
    fail('invalid-mapping', 'identity sources must contain normalized records and registry entries')
  }
  const resolvedOutputDirectory = resolveOutputDirectory(outputDirectory)
  const registryIndex = new Map(registry.entries.map((entry, index) => [entry.videoId, index]))
  assignments.sort((left, right) => {
    const leftIndex = registryIndex.has(left.videoId) ? registryIndex.get(left.videoId) : Number.MAX_SAFE_INTEGER
    const rightIndex = registryIndex.has(right.videoId) ? registryIndex.get(right.videoId) : Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex ||
      left.videoId.localeCompare(right.videoId) ||
      left.recordId.localeCompare(right.recordId) ||
      String(left.mediaRelativePath).localeCompare(String(right.mediaRelativePath))
  })
  const results = assignments.map((assignment) => createAssignment({
    assignment,
    normalizedRecords,
    registry,
    rootDir,
    outputDirectory: resolvedOutputDirectory
  }))
  const created = results.filter((result) => result.state === 'created').length
  const alreadyIdentical = results.filter((result) => result.state === 'already-identical').length
  return {
    schemaVersion: 1,
    reportKind: 'local-torrent-creation',
    creationSummary: {
      total: results.length,
      created,
      alreadyIdentical,
      failed: results.length - created - alreadyIdentical
    },
    assignments: results
  }
}

function reportExitCode(report) {
  return report.creationSummary.failed === 0 ? 0 : 1
}

function emitCreationReport(report, output = process.stdout) {
  output.write(`${JSON.stringify(report, null, 2)}\n`)
  return reportExitCode(report)
}

function parseArguments(argv) {
  if (
    argv.length !== 4 || argv[0] !== '--mapping' || argv[2] !== '--output-directory' ||
    typeof argv[1] !== 'string' || argv[1].length === 0 ||
    typeof argv[3] !== 'string' || argv[3].length === 0
  ) {
    fail(
      'invalid-arguments',
      'usage: create-local-torrent.js --mapping <file> --output-directory <directory>'
    )
  }
  return { mappingPath: argv[1], outputDirectory: argv[3] }
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
    const args = parseArguments(process.argv.slice(2))
    const report = createCreationReport({
      mapping: readJson(path.resolve(process.cwd(), args.mappingPath), 'mapping file'),
      normalizedRecords: readNormalizedRecords(),
      registry: readJson(
        path.join(repositoryRoot, 'projection', 'stremio', 'video-id-registry.json'),
        'video-ID registry'
      ),
      outputDirectory: args.outputDirectory
    })
    process.exitCode = emitCreationReport(report)
  } catch (error) {
    const known = error instanceof LocalTorrentCreationError
    const message = known ? error.message : 'local torrent creation failed'
    process.stderr.write(`local torrent creation failed: ${message}\n`)
    process.exitCode = 1
  }
}

if (require.main === module) main()

module.exports = {
  LocalTorrentCreationError,
  PIECE_LENGTH,
  buildTorrentBytes,
  createAssignment,
  createCreationReport,
  emitCreationReport,
  generatePieceHashes,
  parseArguments,
  reportExitCode,
  resolveOutputDirectory,
  torrentFilenameForPayload,
  validateMapping,
  writeTorrentWithoutOverwrite
}
