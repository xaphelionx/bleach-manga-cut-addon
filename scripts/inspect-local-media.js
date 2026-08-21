#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const repositoryRoot = path.resolve(__dirname, '..')
const NORMALIZED_PROJECT_IDS = Object.freeze(['concentrated', 'hollowed', 'chipped'])
const FFPROBE_ARGUMENTS = Object.freeze([
  '-v', 'error',
  '-show_format',
  '-show_streams',
  '-of', 'json'
])

class MediaInspectionError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MediaInspectionError'
    this.inspectionCode = code
  }
}

function assertExactKeys(value, expected, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} has missing or unexpected fields`)
}

function assertNonEmptyString(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`)
  assert.ok(value.length > 0, `${label} must not be empty`)
}

function resolveRepositoryRelativePath(rootDir, relativePath) {
  assertNonEmptyString(relativePath, 'assignment.relativePath')
  assert.equal(relativePath.includes('\0'), false, 'assignment.relativePath contains a null byte')
  assert.equal(path.posix.isAbsolute(relativePath), false, 'assignment.relativePath must be repository-relative')
  assert.equal(path.win32.isAbsolute(relativePath), false, 'assignment.relativePath must be repository-relative')

  const posixNormalized = path.posix.normalize(relativePath)
  const win32Normalized = path.win32.normalize(relativePath)
  assert.ok(
    posixNormalized !== '..' && !posixNormalized.startsWith('../') &&
      win32Normalized !== '..' && !win32Normalized.startsWith('..\\'),
    'assignment.relativePath must not escape the repository root'
  )

  const resolvedPath = path.resolve(rootDir, relativePath)
  const resolvedRelative = path.relative(rootDir, resolvedPath)
  assert.ok(
    resolvedRelative !== '..' && !resolvedRelative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(resolvedRelative),
    'assignment.relativePath must not escape the repository root'
  )
  return {
    resolvedPath,
    canonicalKey: resolvedRelative.split(path.sep).join('/')
  }
}

function editorialRuntime(record) {
  if (record.runtime && record.runtime.state === 'known') {
    return {
      state: 'known',
      displayed: record.runtime.displayed,
      seconds: record.runtime.seconds
    }
  }
  return {
    state: record.runtime ? record.runtime.state : 'unresolved',
    displayed: null,
    seconds: null
  }
}

function validateAssignments({ mapping, normalizedRecords, registry, rootDir = repositoryRoot }) {
  assertExactKeys(mapping, ['schemaVersion', 'assignments'], 'mapping')
  assert.equal(mapping.schemaVersion, 1, 'unsupported mapping schemaVersion')
  assert.ok(Array.isArray(mapping.assignments), 'mapping.assignments must be an array')
  assert.ok(mapping.assignments.length > 0, 'mapping.assignments must not be empty')
  assert.ok(Array.isArray(normalizedRecords), 'normalized project records must be an array')
  assert.ok(registry && Array.isArray(registry.entries), 'video-ID registry must contain an entries array')

  const recordIds = new Set()
  const videoIds = new Set()
  const relativePaths = new Set()
  const validated = []

  for (const [index, assignment] of mapping.assignments.entries()) {
    const label = `mapping.assignments[${index}]`
    assertExactKeys(assignment, ['recordId', 'videoId', 'relativePath'], label)
    assertNonEmptyString(assignment.recordId, `${label}.recordId`)
    assertNonEmptyString(assignment.videoId, `${label}.videoId`)

    assert.ok(!recordIds.has(assignment.recordId), `duplicate recordId ${assignment.recordId}`)
    assert.ok(!videoIds.has(assignment.videoId), `duplicate videoId ${assignment.videoId}`)
    recordIds.add(assignment.recordId)
    videoIds.add(assignment.videoId)

    const records = normalizedRecords.filter((record) => record.recordId === assignment.recordId)
    assert.equal(records.length, 1, `recordId must resolve to one normalized default record: ${assignment.recordId}`)
    const record = records[0]

    const registeredMatches = registry.entries
      .map((entry, registryIndex) => ({ entry, registryIndex }))
      .filter(({ entry }) => entry.videoId === assignment.videoId)
    assert.equal(registeredMatches.length, 1, `videoId must resolve to one registry entry: ${assignment.videoId}`)
    const registered = registeredMatches[0]
    assert.equal(
      registered.entry.recordType,
      'normalized-record',
      `${assignment.videoId} is not a normalized default-record video ID`
    )
    assert.equal(
      registered.entry.recordId,
      assignment.recordId,
      `${assignment.videoId} is registered to ${registered.entry.recordId}, not ${assignment.recordId}`
    )
    assert.equal(
      registered.entry.projectId,
      record.projectId,
      `${assignment.videoId} project ${registered.entry.projectId} does not match ${assignment.recordId} project ${record.projectId}`
    )

    const localPath = resolveRepositoryRelativePath(rootDir, assignment.relativePath)
    assert.ok(!relativePaths.has(localPath.canonicalKey), `duplicate relativePath ${assignment.relativePath}`)
    relativePaths.add(localPath.canonicalKey)

    let stats
    try {
      stats = fs.statSync(localPath.resolvedPath)
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        throw new Error(`missing local media file ${assignment.relativePath}`)
      }
      throw new Error(
        `could not inspect local media file ${assignment.relativePath} (${error.code || 'unknown error'})`
      )
    }
    assert.ok(stats.isFile(), `local media path is not a file: ${assignment.relativePath}`)

    validated.push({
      assignment: {
        recordId: assignment.recordId,
        videoId: assignment.videoId,
        relativePath: assignment.relativePath
      },
      editorialRuntime: editorialRuntime(record),
      filename: path.basename(localPath.resolvedPath),
      byteSize: stats.size,
      resolvedPath: localPath.resolvedPath,
      registryIndex: registered.registryIndex
    })
  }

  return validated.sort((left, right) => left.registryIndex - right.registryIndex)
}

function parseFfprobeOutput(stdout) {
  let value
  try {
    value = JSON.parse(stdout)
  } catch {
    throw new MediaInspectionError('ffprobe-invalid-json', 'ffprobe returned invalid JSON')
  }
  validateFfprobeStructure(value)
  return value
}

function validateFfprobeStructure(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MediaInspectionError(
      'ffprobe-invalid-structure',
      'ffprobe output must be an object'
    )
  }
  if (!Array.isArray(value.streams)) {
    throw new MediaInspectionError(
      'ffprobe-invalid-structure',
      'ffprobe output must contain a streams array'
    )
  }
  if (!value.format || typeof value.format !== 'object' || Array.isArray(value.format)) {
    throw new MediaInspectionError(
      'ffprobe-invalid-structure',
      'ffprobe output must contain a format object'
    )
  }
}

function runFfprobe(filePath, spawnSync = childProcess.spawnSync) {
  const result = spawnSync('ffprobe', [...FFPROBE_ARGUMENTS, filePath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: false
  })
  if (result.error) {
    throw new MediaInspectionError('ffprobe-start-failed', 'ffprobe could not start')
  }
  if (result.status !== 0) {
    const status = Number.isInteger(result.status) ? result.status : 'unknown'
    throw new MediaInspectionError(
      'ffprobe-nonzero-exit',
      `ffprobe exited with status ${status}`
    )
  }
  return parseFfprobeOutput(result.stdout)
}

function createDefaultInspectFile(spawnSync = childProcess.spawnSync) {
  return function defaultInspectFile(filePath, _assignment) {
    return runFfprobe(filePath, spawnSync)
  }
}

function observed(value) {
  return value === undefined ? null : value
}

function observedTag(stream, name) {
  return stream.tags && Object.hasOwn(stream.tags, name) ? stream.tags[name] : null
}

function observedDisposition(stream, name) {
  return stream.disposition && Object.hasOwn(stream.disposition, name)
    ? stream.disposition[name]
    : null
}

function observedDuration(format) {
  if (!Object.hasOwn(format, 'duration')) return null
  const duration = Number(format.duration)
  return Number.isFinite(duration) ? duration : null
}

function durationDelta(measured, editorialSeconds) {
  if (!Number.isFinite(measured) || !Number.isFinite(editorialSeconds)) return null
  return Number((measured - editorialSeconds).toFixed(6))
}

function transformFfprobe(inspection, ffprobe) {
  const streams = [...ffprobe.streams].sort((left, right) => {
    const leftIndex = Number.isInteger(left.index) ? left.index : Number.MAX_SAFE_INTEGER
    const rightIndex = Number.isInteger(right.index) ? right.index : Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex
  })
  const video = []
  const audio = []
  const subtitles = []
  const attachments = []
  const other = []

  for (const stream of streams) {
    if (stream.codec_type === 'video') {
      video.push({
        index: observed(stream.index),
        codec_name: observed(stream.codec_name),
        profile: observed(stream.profile),
        width: observed(stream.width),
        height: observed(stream.height),
        pix_fmt: observed(stream.pix_fmt),
        r_frame_rate: observed(stream.r_frame_rate),
        avg_frame_rate: observed(stream.avg_frame_rate),
        disposition: {
          attached_pic: observedDisposition(stream, 'attached_pic'),
          default: observedDisposition(stream, 'default')
        }
      })
    } else if (stream.codec_type === 'audio') {
      audio.push({
        index: observed(stream.index),
        codec_name: observed(stream.codec_name),
        profile: observed(stream.profile),
        channels: observed(stream.channels),
        channel_layout: observed(stream.channel_layout),
        tags: {
          language: observedTag(stream, 'language'),
          title: observedTag(stream, 'title')
        },
        disposition: {
          default: observedDisposition(stream, 'default'),
          forced: observedDisposition(stream, 'forced')
        }
      })
    } else if (stream.codec_type === 'subtitle') {
      subtitles.push({
        index: observed(stream.index),
        codec_name: observed(stream.codec_name),
        tags: {
          language: observedTag(stream, 'language'),
          title: observedTag(stream, 'title')
        },
        disposition: {
          default: observedDisposition(stream, 'default'),
          forced: observedDisposition(stream, 'forced')
        }
      })
    } else if (stream.codec_type === 'attachment') {
      attachments.push({
        index: observed(stream.index),
        codec_name: observed(stream.codec_name),
        codec_type: 'attachment',
        tags: {
          filename: observedTag(stream, 'filename'),
          mimetype: observedTag(stream, 'mimetype')
        }
      })
    } else {
      other.push({
        index: observed(stream.index),
        codec_name: observed(stream.codec_name),
        codec_type: observed(stream.codec_type)
      })
    }
  }

  const measuredContainerDurationSeconds = observedDuration(ffprobe.format)
  const ordinaryVideo = video.filter((stream) => stream.disposition.attached_pic === 0)
  const unknownAttachedPictureDisposition = video.filter((stream) => (
    stream.disposition.attached_pic !== 0 && stream.disposition.attached_pic !== 1
  ))
  const warnings = []
  for (const stream of unknownAttachedPictureDisposition) {
    warnings.push({
      code: 'missing-video-attached-pic-disposition',
      streamIndex: stream.index
    })
  }
  if (ordinaryVideo.length === 0) warnings.push({ code: 'no-ordinary-video-stream' })
  if (ordinaryVideo.length > 1) {
    warnings.push({
      code: 'multiple-ordinary-video-streams',
      streamIndexes: ordinaryVideo.map((stream) => stream.index)
    })
  }
  if (measuredContainerDurationSeconds === null) {
    warnings.push({ code: 'missing-container-duration' })
  }
  for (const stream of audio) {
    if (stream.tags.language === null) {
      warnings.push({ code: 'missing-audio-language-tag', streamIndex: stream.index })
    }
  }
  for (const stream of subtitles) {
    if (stream.tags.language === null) {
      warnings.push({ code: 'missing-subtitle-language-tag', streamIndex: stream.index })
    }
    if (stream.tags.title === null) {
      warnings.push({ code: 'missing-subtitle-title-tag', streamIndex: stream.index })
    }
  }
  for (const stream of other) {
    warnings.push({
      code: 'unexpected-stream-type',
      streamIndex: stream.index,
      codecType: stream.codec_type
    })
  }

  return {
    assignment: inspection.assignment,
    inspection: {
      state: 'success'
    },
    filesystem: {
      filename: inspection.filename,
      byteSize: inspection.byteSize
    },
    editorialRuntime: inspection.editorialRuntime,
    container: {
      format_name: observed(ffprobe.format.format_name)
    },
    measuredContainerDurationSeconds,
    durationDeltaSeconds: durationDelta(
      measuredContainerDurationSeconds,
      inspection.editorialRuntime.seconds
    ),
    streams: {
      video,
      audio,
      subtitles,
      attachments,
      other
    },
    warnings
  }
}

function failedInspection(inspection, error) {
  const isKnownError = error instanceof MediaInspectionError
  return {
    assignment: inspection.assignment,
    inspection: {
      state: 'failed',
      error: {
        code: isKnownError ? error.inspectionCode : 'inspection-failed',
        message: isKnownError ? error.message : 'media inspection failed'
      }
    },
    filesystem: {
      filename: inspection.filename,
      byteSize: inspection.byteSize
    },
    editorialRuntime: inspection.editorialRuntime
  }
}

function createInspectionReport({
  mapping,
  normalizedRecords,
  registry,
  rootDir = repositoryRoot,
  inspectFile,
  spawnSync = childProcess.spawnSync
}) {
  const assignments = validateAssignments({ mapping, normalizedRecords, registry, rootDir })
  const batchInspectFile = inspectFile === undefined
    ? createDefaultInspectFile(spawnSync)
    : inspectFile
  const reports = assignments.map((inspection) => {
    try {
      const ffprobe = batchInspectFile(inspection.resolvedPath, inspection.assignment)
      validateFfprobeStructure(ffprobe)
      return transformFfprobe(inspection, ffprobe)
    } catch (error) {
      return failedInspection(inspection, error)
    }
  })
  const succeeded = reports.filter(({ inspection }) => inspection.state === 'success').length
  const failed = reports.length - succeeded

  return {
    schemaVersion: 1,
    reportKind: 'local-media-inspection-review',
    evidenceState: 'not-created',
    missingValuePolicy: 'null',
    inspectionSummary: {
      total: reports.length,
      succeeded,
      failed
    },
    assignments: reports
  }
}

function reportExitCode(report) {
  return report.inspectionSummary.failed === 0 ? 0 : 1
}

function emitInspectionReport(report, output = process.stdout) {
  output.write(`${JSON.stringify(report, null, 2)}\n`)
  return reportExitCode(report)
}

function parseArguments(argv) {
  assert.deepEqual(argv.slice(0, 1), ['--mapping'], 'usage: inspect-local-media.js --mapping <file>')
  assert.equal(argv.length, 2, 'usage: inspect-local-media.js --mapping <file>')
  assertNonEmptyString(argv[1], 'mapping filename')
  return { mappingPath: argv[1] }
}

function readJson(filename, label) {
  let value
  try {
    value = JSON.parse(fs.readFileSync(filename, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is not readable valid JSON: ${error.message}`)
  }
  return value
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
    const report = createInspectionReport({
      mapping: readJson(path.resolve(process.cwd(), mappingPath), 'mapping file'),
      normalizedRecords: readNormalizedRecords(),
      registry: readJson(
        path.join(repositoryRoot, 'projection', 'stremio', 'video-id-registry.json'),
        'video-ID registry'
      )
    })
    process.exitCode = emitInspectionReport(report)
  } catch (error) {
    process.stderr.write(`local-media inspection failed: ${error.message}\n`)
    process.exitCode = 1
  }
}

if (require.main === module) main()

module.exports = {
  FFPROBE_ARGUMENTS,
  createInspectionReport,
  emitInspectionReport,
  parseArguments,
  parseFfprobeOutput,
  resolveRepositoryRelativePath,
  reportExitCode,
  runFfprobe,
  transformFfprobe,
  validateAssignments
}
