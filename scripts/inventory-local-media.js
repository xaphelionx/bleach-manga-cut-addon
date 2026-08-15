#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repositoryRoot = path.resolve(__dirname, '..')
const SUPPORTED_MEDIA_EXTENSIONS = Object.freeze([
  '.avi',
  '.m2ts',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.ts',
  '.webm'
])
const supportedMediaExtensions = new Set(SUPPORTED_MEDIA_EXTENSIONS)

function compareStrings(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function assertObject(value, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
}

function assertExactKeys(value, expected, label) {
  assertObject(value, label)
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} has missing or unexpected fields`)
}

function assertNonEmptyString(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`)
  assert.ok(value.length > 0, `${label} must not be empty`)
}

function repositoryRelativeDirectory(rootDir, directory) {
  assertNonEmptyString(directory, 'directory')
  assert.equal(directory.includes('\0'), false, 'directory contains a null byte')
  assert.equal(path.posix.isAbsolute(directory), false, 'directory must be repository-relative')
  assert.equal(path.win32.isAbsolute(directory), false, 'directory must be repository-relative')

  const posixNormalized = path.posix.normalize(directory)
  const win32Normalized = path.win32.normalize(directory)
  assert.ok(
    posixNormalized !== '..' && !posixNormalized.startsWith('../') &&
      win32Normalized !== '..' && !win32Normalized.startsWith('..\\'),
    'directory must not escape the repository root'
  )

  const resolved = path.resolve(rootDir, directory)
  const relative = path.relative(rootDir, resolved)
  assert.ok(
    relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    'directory must not escape the repository root'
  )
  return {
    resolved,
    relativePath: relative === '' ? '.' : relative.split(path.sep).join('/')
  }
}

function isWithinDirectory(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath)
  return relative === '' || (
    relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
  )
}

function scanMediaFiles({ rootDir = repositoryRoot, directory }) {
  const selectedDirectory = repositoryRelativeDirectory(rootDir, directory)
  let rootCanonical
  let directoryCanonical
  try {
    rootCanonical = fs.realpathSync(rootDir)
    directoryCanonical = fs.realpathSync(selectedDirectory.resolved)
  } catch {
    throw new Error(`inventory directory is not readable: ${selectedDirectory.relativePath}`)
  }
  assert.ok(
    isWithinDirectory(rootCanonical, directoryCanonical),
    'inventory directory must not escape the repository root'
  )
  assert.ok(
    fs.statSync(directoryCanonical).isDirectory(),
    `inventory path is not a directory: ${selectedDirectory.relativePath}`
  )

  const fileFacts = []
  const visit = (absoluteDirectory, relativeDirectory) => {
    let entries
    try {
      entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true })
    } catch {
      throw new Error(`inventory directory is not readable: ${relativeDirectory}`)
    }
    entries.sort((left, right) => compareStrings(left.name, right.name))

    for (const entry of entries) {
      const absolutePath = path.join(absoluteDirectory, entry.name)
      const relativePath = path.posix.join(relativeDirectory, entry.name)
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath)
        continue
      }

      const extension = path.extname(entry.name).toLowerCase()
      if (!supportedMediaExtensions.has(extension)) continue
      if (!entry.isFile() && !entry.isSymbolicLink()) continue

      let stats
      let canonicalPath
      try {
        stats = fs.statSync(absolutePath)
        canonicalPath = fs.realpathSync(absolutePath)
      } catch {
        throw new Error(`media file is not readable: ${relativePath}`)
      }
      if (!stats.isFile()) continue
      assert.ok(
        isWithinDirectory(rootCanonical, canonicalPath),
        `media file must not escape the repository root: ${relativePath}`
      )

      fileFacts.push({
        relativePath,
        filename: entry.name,
        byteSize: stats.size,
        extension,
        canonicalPath
      })
    }
  }

  visit(directoryCanonical, selectedDirectory.relativePath)
  return fileFacts.sort((left, right) => compareStrings(left.relativePath, right.relativePath))
}

function parseFilename(filename, extension) {
  const stem = filename.slice(0, filename.length - extension.length)
  const match = /^([0-9]+(?:\.[0-9]+)?) - (.+)$/u.exec(stem)
  if (!match) {
    return {
      identifierHint: null,
      titleText: null
    }
  }
  return {
    identifierHint: match[1],
    titleText: match[2]
  }
}

function matchingRecords(concentrated, identifierHint) {
  assertObject(concentrated, 'concentrated')
  assert.ok(Array.isArray(concentrated.records), 'concentrated.records must be an array')
  return concentrated.records.filter((record) => (
    record && record.projectId === 'concentrated' &&
    record.sourceIdentifier &&
    (record.sourceIdentifier.raw === identifierHint ||
      record.sourceIdentifier.displayed === identifierHint)
  ))
}

function registryEntriesForRecord(registry, recordId) {
  assertObject(registry, 'registry')
  assert.ok(Array.isArray(registry.entries), 'registry.entries must be an array')
  return registry.entries.filter((entry) => (
    entry && entry.projectId === 'concentrated' && entry.recordId === recordId
  )).sort((left, right) => compareStrings(left.videoId, right.videoId))
}

function ambiguousCandidates(records, registry) {
  return records.map((record) => ({
    recordId: record.recordId,
    videoIds: registryEntriesForRecord(registry, record.recordId).map(({ videoId }) => videoId)
  })).sort((left, right) => compareStrings(left.recordId, right.recordId))
}

function proposeMapping(filenameObservation, concentrated, registry) {
  const { identifierHint } = filenameObservation
  if (identifierHint === null) {
    return {
      state: 'unresolved',
      reason: 'no-usable-filename-prefix',
      authoritative: false,
      reviewRequired: true
    }
  }

  const records = matchingRecords(concentrated, identifierHint)
  if (records.length === 0) {
    return {
      state: 'unresolved',
      reason: 'filename-prefix-matches-no-record',
      basis: 'filename-prefix',
      identifierHint,
      authoritative: false,
      reviewRequired: true
    }
  }
  if (records.length > 1) {
    return {
      state: 'ambiguous',
      reason: 'filename-prefix-matches-multiple-records',
      basis: 'filename-prefix',
      identifierHint,
      candidates: ambiguousCandidates(records, registry),
      authoritative: false,
      reviewRequired: true
    }
  }

  const record = records[0]
  const registered = registryEntriesForRecord(registry, record.recordId)
  if (registered.length === 0) {
    return {
      state: 'unresolved',
      reason: 'matched-record-has-no-permanent-video-id',
      basis: 'filename-prefix',
      identifierHint,
      recordId: record.recordId,
      authoritative: false,
      reviewRequired: true
    }
  }
  if (registered.length > 1) {
    return {
      state: 'ambiguous',
      reason: 'matched-record-has-multiple-video-ids',
      basis: 'filename-prefix',
      identifierHint,
      candidates: [{
        recordId: record.recordId,
        videoIds: registered.map(({ videoId }) => videoId)
      }],
      authoritative: false,
      reviewRequired: true
    }
  }

  return {
    state: 'suggested',
    basis: 'filename-prefix',
    identifierHint,
    recordId: record.recordId,
    videoId: registered[0].videoId,
    authoritative: false,
    approvalRequired: true
  }
}

function addProposalCollisionStates(files) {
  const byRecordId = new Map()
  const byVideoId = new Map()
  for (const file of files) {
    if (file.mappingProposal.state !== 'suggested') continue
    const { recordId, videoId } = file.mappingProposal
    if (!byRecordId.has(recordId)) byRecordId.set(recordId, [])
    if (!byVideoId.has(videoId)) byVideoId.set(videoId, [])
    byRecordId.get(recordId).push(file.relativePath)
    byVideoId.get(videoId).push(file.relativePath)
  }

  return files.map((file) => {
    const proposal = file.mappingProposal
    if (proposal.state !== 'suggested') return file
    const recordPaths = byRecordId.get(proposal.recordId)
    const videoPaths = byVideoId.get(proposal.videoId)
    if (recordPaths.length === 1 && videoPaths.length === 1) return file

    const conflictingRelativePaths = [...new Set([...recordPaths, ...videoPaths])]
      .sort(compareStrings)
    return {
      ...file,
      mappingProposal: {
        state: 'ambiguous',
        reason: 'duplicate-record-or-video-proposal',
        basis: proposal.basis,
        identifierHint: proposal.identifierHint,
        recordId: proposal.recordId,
        videoId: proposal.videoId,
        conflictingRelativePaths,
        authoritative: false,
        reviewRequired: true
      }
    }
  })
}

function filesystemAmbiguities(fileFacts) {
  const relativeGroups = new Map()
  const canonicalGroups = new Map()
  for (const [index, fact] of fileFacts.entries()) {
    if (!relativeGroups.has(fact.relativePath)) relativeGroups.set(fact.relativePath, [])
    if (!canonicalGroups.has(fact.canonicalPath)) canonicalGroups.set(fact.canonicalPath, [])
    relativeGroups.get(fact.relativePath).push(index)
    canonicalGroups.get(fact.canonicalPath).push(index)
  }

  const ambiguities = new Map()
  const mark = (indexes, reason) => {
    if (indexes.length < 2) return
    const conflictingRelativePaths = [...new Set(indexes.map((index) => fileFacts[index].relativePath))]
      .sort(compareStrings)
    for (const index of indexes) {
      if (!ambiguities.has(index) || reason === 'duplicate-relative-path') {
        ambiguities.set(index, { reason, conflictingRelativePaths })
      }
    }
  }
  for (const indexes of relativeGroups.values()) mark(indexes, 'duplicate-relative-path')
  for (const indexes of canonicalGroups.values()) mark(indexes, 'duplicate-canonical-filesystem-path')
  return ambiguities
}

function verifiedEvidenceVideoIds(evidenceRecords, registry) {
  assert.ok(Array.isArray(evidenceRecords), 'evidenceRecords must be an array')
  const concentratedVideoIds = new Set(registry.entries
    .filter(({ projectId }) => projectId === 'concentrated')
    .map(({ videoId }) => videoId))
  return [...new Set(evidenceRecords
    .filter((evidence) => (
      evidence && evidence.verificationState === 'verified' &&
      concentratedVideoIds.has(evidence.videoId)
    ))
    .map(({ videoId }) => videoId))].sort(compareStrings)
}

function buildInventoryReport({ directory, fileFacts, concentrated, registry, evidenceRecords = [] }) {
  const ambiguities = filesystemAmbiguities(fileFacts)
  let files = fileFacts.map((fact, index) => {
    const filenameObservation = parseFilename(fact.filename, fact.extension)
    let mappingProposal
    const filesystemAmbiguity = ambiguities.get(index)
    if (filesystemAmbiguity) {
      mappingProposal = {
        state: 'ambiguous',
        reason: filesystemAmbiguity.reason,
        conflictingRelativePaths: filesystemAmbiguity.conflictingRelativePaths,
        authoritative: false,
        reviewRequired: true
      }
    } else {
      mappingProposal = proposeMapping(filenameObservation, concentrated, registry)
    }

    const warnings = []
    if (mappingProposal.state === 'suggested') {
      const record = concentrated.records.find(({ recordId }) => recordId === mappingProposal.recordId)
      if (filenameObservation.titleText !== record.title) {
        warnings.push({ code: 'filename-title-differs-from-editorial' })
      }
    }

    return {
      relativePath: fact.relativePath,
      filename: fact.filename,
      byteSize: fact.byteSize,
      extension: fact.extension,
      filenameObservation,
      mappingProposal,
      warnings
    }
  })
  files = addProposalCollisionStates(files)
  files.sort((left, right) => compareStrings(left.relativePath, right.relativePath))

  const existingVerifiedEvidenceVideoIds = verifiedEvidenceVideoIds(evidenceRecords, registry)
  const counts = { suggested: 0, unresolved: 0, ambiguous: 0 }
  for (const file of files) counts[file.mappingProposal.state] += 1

  return {
    schemaVersion: 1,
    reportKind: 'local-media-inventory-review',
    identityPolicy: 'filename proposals are non-authoritative and require explicit approval',
    directory,
    supportedMediaExtensions: [...SUPPORTED_MEDIA_EXTENSIONS],
    coverageSummary: {
      totalMediaFiles: files.length,
      suggested: counts.suggested,
      unresolved: counts.unresolved,
      ambiguous: counts.ambiguous,
      alreadyVerifiedEvidence: existingVerifiedEvidenceVideoIds.length
    },
    existingVerifiedEvidenceVideoIds,
    files
  }
}

function createInventoryReport({
  rootDir = repositoryRoot,
  directory,
  concentrated,
  registry,
  evidenceRecords = []
}) {
  const selectedDirectory = repositoryRelativeDirectory(rootDir, directory)
  const fileFacts = scanMediaFiles({ rootDir, directory })
  return buildInventoryReport({
    directory: selectedDirectory.relativePath,
    fileFacts,
    concentrated,
    registry,
    evidenceRecords
  })
}

function createInspectorMapping(inventoryReport, approval) {
  assertObject(inventoryReport, 'inventoryReport')
  assert.equal(inventoryReport.reportKind, 'local-media-inventory-review')
  assert.ok(Array.isArray(inventoryReport.files), 'inventoryReport.files must be an array')
  assertExactKeys(approval, ['schemaVersion', 'approvals'], 'approval')
  assert.equal(approval.schemaVersion, 1, 'unsupported approval schemaVersion')
  assert.ok(Array.isArray(approval.approvals), 'approval.approvals must be an array')
  assert.ok(approval.approvals.length > 0, 'approval.approvals must not be empty')

  const filesByRelativePath = new Map()
  for (const file of inventoryReport.files) {
    if (!filesByRelativePath.has(file.relativePath)) filesByRelativePath.set(file.relativePath, [])
    filesByRelativePath.get(file.relativePath).push(file)
  }

  const relativePaths = new Set()
  const recordIds = new Set()
  const videoIds = new Set()
  const assignments = approval.approvals.map((decision, index) => {
    const label = `approval.approvals[${index}]`
    assertExactKeys(decision, ['relativePath', 'approved', 'recordId', 'videoId'], label)
    assertNonEmptyString(decision.relativePath, `${label}.relativePath`)
    assert.equal(decision.approved, true, `${label} must be explicitly approved`)
    assertNonEmptyString(decision.recordId, `${label}.recordId`)
    assertNonEmptyString(decision.videoId, `${label}.videoId`)
    assert.ok(!relativePaths.has(decision.relativePath), `duplicate approval relativePath ${decision.relativePath}`)
    relativePaths.add(decision.relativePath)

    const matchingFiles = filesByRelativePath.get(decision.relativePath) || []
    assert.equal(matchingFiles.length, 1, `${label}.relativePath must identify exactly one inventory file`)
    const proposal = matchingFiles[0].mappingProposal
    assert.equal(proposal.state, 'suggested', `${label} cannot approve a ${proposal.state} proposal`)
    assert.equal(decision.recordId, proposal.recordId, `${label}.recordId does not match the suggestion`)
    assert.equal(decision.videoId, proposal.videoId, `${label}.videoId does not match the suggestion`)
    assert.ok(!recordIds.has(decision.recordId), `duplicate approved recordId ${decision.recordId}`)
    assert.ok(!videoIds.has(decision.videoId), `duplicate approved videoId ${decision.videoId}`)
    recordIds.add(decision.recordId)
    videoIds.add(decision.videoId)

    return {
      recordId: decision.recordId,
      videoId: decision.videoId,
      relativePath: decision.relativePath
    }
  }).sort((left, right) => compareStrings(left.relativePath, right.relativePath))

  return {
    schemaVersion: 1,
    assignments
  }
}

function reportExitCode(report) {
  return report.coverageSummary.ambiguous === 0 ? 0 : 1
}

function emitInventoryReport(report, output = process.stdout) {
  output.write(`${JSON.stringify(report, null, 2)}\n`)
  return reportExitCode(report)
}

function parseArguments(argv) {
  assert.deepEqual(argv.slice(0, 1), ['--directory'], 'usage: inventory-local-media.js --directory <directory>')
  assert.equal(argv.length, 2, 'usage: inventory-local-media.js --directory <directory>')
  assertNonEmptyString(argv[1], 'directory')
  return { directory: argv[1] }
}

function readJson(filename, label) {
  try {
    return JSON.parse(fs.readFileSync(filename, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is not readable valid JSON: ${error.message}`)
  }
}

function loadEvidenceRecords(evidenceDirectory) {
  return fs.readdirSync(evidenceDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.json')
    .sort((left, right) => compareStrings(left.name, right.name))
    .map((entry) => readJson(path.join(evidenceDirectory, entry.name), 'verified-media evidence'))
}

function main() {
  try {
    const { directory } = parseArguments(process.argv.slice(2))
    const report = createInventoryReport({
      rootDir: repositoryRoot,
      directory,
      concentrated: readJson(
        path.join(repositoryRoot, 'editorial', 'normalized', 'concentrated.json'),
        'normalized Concentrated records'
      ),
      registry: readJson(
        path.join(repositoryRoot, 'projection', 'stremio', 'video-id-registry.json'),
        'video-ID registry'
      ),
      evidenceRecords: loadEvidenceRecords(path.join(repositoryRoot, 'evidence', 'media'))
    })
    process.exitCode = emitInventoryReport(report)
  } catch (error) {
    process.stderr.write(`local-media inventory failed: ${error.message}\n`)
    process.exitCode = 1
  }
}

if (require.main === module) main()

module.exports = {
  SUPPORTED_MEDIA_EXTENSIONS,
  buildInventoryReport,
  createInspectorMapping,
  createInventoryReport,
  emitInventoryReport,
  parseArguments,
  parseFilename,
  proposeMapping,
  reportExitCode,
  scanMediaFiles
}
