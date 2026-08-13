#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const root = path.resolve(__dirname, '..')
const sourceRoot = path.join(root, 'sources')

const SOURCES = [
  {
    sourceId: 'watch-guide-pdf',
    filename: 'Bleach Watch Guide V2.pdf',
    sha256: 'd5eca40c6983542c7e4a7753f0ce42e996ef7b1b466c606c1e1557bb5837a351',
    kind: 'pdf',
    role: 'watch-order-authority',
    pageCount: 6,
    sections: [
      'Title and contact',
      'Edit Breakdown',
      'Concentrated Bleach Breakdown',
      'Hollowed Bleach Breakdown',
      'Chipped Bleach Breakdown',
      'Watch Guide'
    ]
  },
  {
    sourceId: 'concentrated-xlsx',
    filename: '!Concentrated Bleach Info.xlsx',
    sha256: 'f3eb61d7415800dcd105a3aea029b8cdd28c25e489874e6001f46106844660e2',
    kind: 'xlsx',
    role: 'project-editorial-authority',
    projectId: 'concentrated',
    episodeSheet: 'Episode List',
    episodeColumns: {
      identifier: 'A',
      title: 'B',
      manga: 'C',
      anime: 'D',
      runtime: 'E',
      timeSaved: 'F',
      releaseDate: 'G',
      lastUpdate: 'H',
      noteStart: 'I',
      noteEnd: 'P',
      noteRows: [49, 55, 77]
    },
    sheetRoles: {
      'Episode List': {
        role: 'episode-data',
        primaryDataRange: 'A1:H91'
      },
      'Arc List': {
        role: 'project-summary',
        primaryDataRange: 'A1:M10'
      }
    }
  },
  {
    sourceId: 'hollowed-xlsx',
    filename: 'Hollowed Bleach Info.xlsx',
    sha256: '58cdbe6ab95d1d28dc724eb114865cb1999050f545462a2b496128d7dde404ce',
    kind: 'xlsx',
    role: 'project-editorial-authority',
    projectId: 'hollowed',
    episodeSheet: 'Episode List',
    episodeColumns: {
      identifier: 'A',
      title: 'B',
      manga: 'C',
      anime: 'D',
      runtime: 'E',
      exRuntime: 'F',
      releaseDate: 'G',
      lastUpdate: 'H',
      noteStart: 'I',
      noteEnd: 'I'
    },
    sheetRoles: {
      'Episode List': {
        role: 'episode-data',
        primaryDataRange: 'A1:I65'
      }
    }
  },
  {
    sourceId: 'chipped-xlsx',
    filename: 'Chipped Bleach Info.xlsx',
    sha256: 'a13495e4ebb2b731b9e033c489136eb2bf2e9ae1ad26e84fa47f4cc155ea13f6',
    kind: 'xlsx',
    role: 'project-editorial-authority',
    projectId: 'chipped',
    episodeSheet: 'Chipped Bleach Info',
    episodeColumns: {
      identifier: 'A',
      title: 'B',
      status: 'C',
      releaseDate: 'D',
      lastUpdate: 'E',
      runtime: 'F',
      timeSaved: 'G',
      manga: 'H',
      anime: 'I',
      noteStart: 'J',
      noteEnd: 'J'
    },
    sheetRoles: {
      'Chipped Bleach Info': {
        role: 'episode-data',
        primaryDataRange: 'A1:J13'
      },
      Sheet2: {
        role: 'empty-helper',
        primaryDataRange: null
      }
    }
  },
  {
    sourceId: 'ex-episodes-pdf',
    filename: 'EX Episodes Info.pdf',
    sha256: 'bbffbfcc0e8ee175530be3692175cc0674dfa34df33992f07a71a89931dc9f81',
    kind: 'pdf',
    role: 'variant-semantics-authority',
    pageCount: 1,
    sections: [
      'EX overview, legacy status, and EX 1/27/50 semantics'
    ]
  }
]

const BUILTIN_NUMBER_FORMATS = new Map([
  [0, 'General'],
  [1, '0'],
  [2, '0.00'],
  [3, '#,##0'],
  [4, '#,##0.00'],
  [9, '0%'],
  [10, '0.00%'],
  [14, 'mm-dd-yy'],
  [15, 'd-mmm-yy'],
  [16, 'd-mmm'],
  [17, 'mmm-yy'],
  [18, 'h:mm AM/PM'],
  [19, 'h:mm:ss AM/PM'],
  [20, 'h:mm'],
  [21, 'h:mm:ss'],
  [22, 'm/d/yy h:mm'],
  [45, 'mm:ss'],
  [46, '[h]:mm:ss'],
  [47, 'mmss.0'],
  [49, '@']
])

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function writeJson(outputRoot, relativePath, value) {
  const destination = path.join(outputRoot, relativePath)
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, stableJson(value))
}

function decodeXml(value) {
  if (value === undefined || value === null) return value

  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hexadecimal) => String.fromCodePoint(Number.parseInt(hexadecimal, 16)))
    .replace(/&amp;/g, '&')
}

function parseAttributes(fragment) {
  const result = {}
  const expression = /([\w:.-]+)="([^"]*)"/g
  let match

  while ((match = expression.exec(fragment)) !== null) {
    result[match[1]] = decodeXml(match[2])
  }

  return result
}

function tagText(fragment, tagName) {
  const expression = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`)
  const match = expression.exec(fragment)
  return match ? decodeXml(match[1]) : null
}

function allTags(xml, tagName) {
  const expression = new RegExp(`<${tagName}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/${tagName}>)`, 'g')
  const values = []
  let match

  while ((match = expression.exec(xml)) !== null) {
    values.push({
      attributes: parseAttributes(match[1]),
      body: match[2] || ''
    })
  }

  return values
}

class ZipArchive {
  constructor(buffer) {
    this.buffer = buffer
    this.entries = new Map()
    this.#readCentralDirectory()
  }

  #readCentralDirectory() {
    const signature = 0x06054b50
    const minimum = Math.max(0, this.buffer.length - 65557)
    let offset = this.buffer.length - 22

    while (offset >= minimum && this.buffer.readUInt32LE(offset) !== signature) offset -= 1
    assert.ok(offset >= minimum, 'ZIP end-of-central-directory record was not found')

    const entryCount = this.buffer.readUInt16LE(offset + 10)
    let cursor = this.buffer.readUInt32LE(offset + 16)

    for (let index = 0; index < entryCount; index += 1) {
      assert.equal(this.buffer.readUInt32LE(cursor), 0x02014b50, 'Invalid ZIP central-directory entry')
      const compressionMethod = this.buffer.readUInt16LE(cursor + 10)
      const compressedSize = this.buffer.readUInt32LE(cursor + 20)
      const uncompressedSize = this.buffer.readUInt32LE(cursor + 24)
      const filenameLength = this.buffer.readUInt16LE(cursor + 28)
      const extraLength = this.buffer.readUInt16LE(cursor + 30)
      const commentLength = this.buffer.readUInt16LE(cursor + 32)
      const localHeaderOffset = this.buffer.readUInt32LE(cursor + 42)
      const filename = this.buffer.subarray(cursor + 46, cursor + 46 + filenameLength).toString('utf8')

      this.entries.set(filename, {
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset
      })
      cursor += 46 + filenameLength + extraLength + commentLength
    }
  }

  names() {
    return [...this.entries.keys()]
  }

  has(filename) {
    return this.entries.has(filename)
  }

  read(filename) {
    const entry = this.entries.get(filename)
    assert.ok(entry, `ZIP entry is missing: ${filename}`)
    const offset = entry.localHeaderOffset
    assert.equal(this.buffer.readUInt32LE(offset), 0x04034b50, `Invalid ZIP local header for ${filename}`)
    const filenameLength = this.buffer.readUInt16LE(offset + 26)
    const extraLength = this.buffer.readUInt16LE(offset + 28)
    const dataStart = offset + 30 + filenameLength + extraLength
    const compressed = this.buffer.subarray(dataStart, dataStart + entry.compressedSize)
    let output

    if (entry.compressionMethod === 0) output = compressed
    else if (entry.compressionMethod === 8) output = zlib.inflateRawSync(compressed)
    else throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for ${filename}`)

    assert.equal(output.length, entry.uncompressedSize, `Unexpected uncompressed size for ${filename}`)
    return output
  }

  text(filename) {
    return this.read(filename).toString('utf8')
  }
}

function normalizeArchivePath(value) {
  const parts = []

  for (const segment of value.replace(/^\//, '').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }

  return parts.join('/')
}

function resolveRelationship(baseFilename, target) {
  return normalizeArchivePath(path.posix.join(path.posix.dirname(baseFilename), target))
}

function relationshipFilename(filename) {
  return path.posix.join(path.posix.dirname(filename), '_rels', `${path.posix.basename(filename)}.rels`)
}

function parseRelationships(archive, filename) {
  if (!archive.has(filename)) return new Map()
  const relationships = new Map()

  for (const relationship of allTags(archive.text(filename), 'Relationship')) {
    relationships.set(relationship.attributes.Id, {
      target: relationship.attributes.Target,
      type: relationship.attributes.Type,
      targetMode: relationship.attributes.TargetMode || 'Internal'
    })
  }

  return relationships
}

function parseSharedStrings(archive) {
  if (!archive.has('xl/sharedStrings.xml')) return []

  return allTags(archive.text('xl/sharedStrings.xml'), 'si').map(({ body }) => {
    return allTags(body, 't').map(({ body: text }) => decodeXml(text)).join('')
  })
}

function parseStyles(archive) {
  const xml = archive.text('xl/styles.xml')
  const customFormats = new Map()
  const numberFormatsMatch = /<numFmts\b[^>]*>([\s\S]*?)<\/numFmts>/.exec(xml)

  if (numberFormatsMatch) {
    for (const numberFormat of allTags(numberFormatsMatch[1], 'numFmt')) {
      customFormats.set(Number(numberFormat.attributes.numFmtId), numberFormat.attributes.formatCode)
    }
  }

  const cellFormatsMatch = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)
  assert.ok(cellFormatsMatch, 'Workbook cell styles are missing')

  return allTags(cellFormatsMatch[1], 'xf').map(({ attributes }) => {
    const numberFormatId = Number(attributes.numFmtId || 0)
    return {
      numberFormatId,
      numberFormat: customFormats.get(numberFormatId) || BUILTIN_NUMBER_FORMATS.get(numberFormatId) || `builtin:${numberFormatId}`
    }
  })
}

function excelDateParts(serial) {
  const epoch = Date.UTC(1899, 11, 30)
  const date = new Date(epoch + Math.round(Number(serial)) * 86400000)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  }
}

function pad(value, width = 2) {
  return String(value).padStart(width, '0')
}

function formatExcelNumber(raw, numberFormat) {
  const numeric = Number(raw)
  if (!Number.isFinite(numeric)) return raw

  const lowered = numberFormat.toLowerCase()
  const withoutQuoted = lowered.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '')

  if (/(?:yy|yyyy)/.test(withoutQuoted) && /(?:m|d)/.test(withoutQuoted)) {
    const date = excelDateParts(numeric)
    if (/yyyy/.test(lowered)) return `${date.month}/${date.day}/${date.year}`
    return `${pad(date.month)}/${pad(date.day)}/${pad(date.year % 100)}`
  }

  if (/mm:ss/.test(withoutQuoted) || /h:mm/.test(withoutQuoted) || /h:mm:ss/.test(withoutQuoted)) {
    const totalSeconds = Math.round(numeric * 86400)
    const seconds = totalSeconds % 60
    const totalMinutes = Math.floor(totalSeconds / 60)
    const minutes = totalMinutes % 60
    const totalHours = Math.floor(totalMinutes / 60)

    if (/\[h+h?\]/.test(lowered)) return `${pad(totalHours)}:${pad(minutes)}:${pad(seconds)}`
    if (!/h/.test(withoutQuoted) && /mm:ss/.test(withoutQuoted)) return `${pad(minutes)}:${pad(seconds)}`
    return `${pad(totalHours % 24)}:${pad(minutes)}:${pad(seconds)}`
  }

  if (/%/.test(withoutQuoted)) {
    const decimalMatch = /0\.(0+)%/.exec(withoutQuoted)
    const places = decimalMatch ? decimalMatch[1].length : 0
    return `${(numeric * 100).toFixed(places)}%`
  }

  if (/^0+$/.test(withoutQuoted)) return pad(Math.trunc(numeric), withoutQuoted.length)
  if (/^0+\.0+$/.test(withoutQuoted)) {
    const [integerPattern, decimalPattern] = withoutQuoted.split('.')
    return `${pad(Math.trunc(numeric), integerPattern.length)}.${Math.abs(numeric).toFixed(decimalPattern.length).split('.')[1]}`
  }
  if (/^0+\.#$/.test(withoutQuoted)) {
    const width = withoutQuoted.split('.')[0].length
    return Number.isInteger(numeric) ? pad(numeric, width) : `${pad(Math.trunc(numeric), width)}.${String(numeric).split('.')[1]}`
  }
  if (/^#?0(?:\.#+)?$/.test(withoutQuoted)) return String(numeric)

  return raw
}

function columnNumber(column) {
  let value = 0
  for (const character of column) value = value * 26 + character.charCodeAt(0) - 64
  return value
}

function columnName(number) {
  let value = number
  let result = ''

  while (value > 0) {
    value -= 1
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26)
  }

  return result
}

function splitCellReference(reference) {
  const match = /^([A-Z]+)(\d+)$/.exec(reference)
  assert.ok(match, `Invalid cell reference: ${reference}`)
  return {
    column: match[1],
    columnNumber: columnNumber(match[1]),
    row: Number(match[2])
  }
}

function evidenceSlug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function cellEvidenceId(sourceId, sheetName, reference) {
  return `${sourceId}:${evidenceSlug(sheetName)}:${reference}`
}

function sourceIdentity(config, sourceBuffer) {
  return {
    filename: config.filename,
    sha256: sha256(sourceBuffer)
  }
}

function parseWorkbook(config, sourceBuffer) {
  const archive = new ZipArchive(sourceBuffer)
  const workbookFilename = 'xl/workbook.xml'
  const workbookXml = archive.text(workbookFilename)
  const workbookRelationships = parseRelationships(archive, relationshipFilename(workbookFilename))
  const sharedStrings = parseSharedStrings(archive)
  const styles = parseStyles(archive)
  const source = sourceIdentity(config, sourceBuffer)
  const commentParts = archive.names().filter((name) => /comments?|notes?/i.test(name))
  const sheets = []

  for (const sheetTag of allTags(workbookXml, 'sheet')) {
    const attributes = sheetTag.attributes
    const relationship = workbookRelationships.get(attributes['r:id'])
    assert.ok(relationship, `Workbook relationship is missing for sheet ${attributes.name}`)
    const worksheetFilename = resolveRelationship(workbookFilename, relationship.target)
    const worksheetXml = archive.text(worksheetFilename)
    const worksheetRelationships = parseRelationships(archive, relationshipFilename(worksheetFilename))
    const cells = []
    let formattedOnlyCellCount = 0
    const cellExpression = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    let cellMatch

    while ((cellMatch = cellExpression.exec(worksheetXml)) !== null) {
      const cellAttributes = parseAttributes(cellMatch[1])
      const body = cellMatch[2] || ''
      const formula = tagText(body, 'f')
      const storedValue = tagText(body, 'v')
      const inlineStringMatch = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)
      const inlineString = inlineStringMatch
        ? allTags(inlineStringMatch[1], 't').map(({ body: text }) => decodeXml(text)).join('')
        : null
      const substantive = storedValue !== null || formula !== null || inlineString !== null

      if (!substantive) {
        formattedOnlyCellCount += 1
        continue
      }

      const styleIndex = Number(cellAttributes.s || 0)
      const style = styles[styleIndex] || {
        numberFormatId: 0,
        numberFormat: 'General'
      }
      const cellType = cellAttributes.t || 'n'
      let semanticRaw = storedValue
      let displayedValue = storedValue
      let transformation = null

      if (cellType === 's' && storedValue !== null) {
        semanticRaw = sharedStrings[Number(storedValue)]
        displayedValue = semanticRaw
        transformation = {
          operation: 'resolve-shared-string',
          detail: `Resolved sharedStrings index ${storedValue}`
        }
      } else if (cellType === 'inlineStr') {
        semanticRaw = inlineString
        displayedValue = inlineString
        transformation = {
          operation: 'resolve-inline-string',
          detail: 'Read inline string text'
        }
      } else if (cellType === 'b') {
        semanticRaw = storedValue === '1' ? 'TRUE' : 'FALSE'
        displayedValue = semanticRaw
      } else if (cellType === 'e') {
        semanticRaw = storedValue
        displayedValue = storedValue
      } else if (storedValue !== null && style.numberFormat !== 'General') {
        displayedValue = formatExcelNumber(storedValue, style.numberFormat)
        transformation = {
          operation: 'apply-excel-number-format',
          detail: `Applied number format ${style.numberFormat}`
        }
      }

      const reference = cellAttributes.r
      const location = splitCellReference(reference)
      cells.push({
        evidenceId: cellEvidenceId(config.sourceId, attributes.name, reference),
        authorityDomain: 'editorial',
        source,
        locator: {
          kind: 'xlsx',
          sheet: attributes.name,
          row: location.row,
          cell: reference,
          range: reference
        },
        rawValue: semanticRaw,
        displayedValue,
        formula,
        cachedValue: formula === null ? null : storedValue,
        numberFormat: style.numberFormat,
        transformation
      })
    }

    cells.sort((left, right) => {
      const leftLocation = splitCellReference(left.locator.cell)
      const rightLocation = splitCellReference(right.locator.cell)
      return leftLocation.row - rightLocation.row || leftLocation.columnNumber - rightLocation.columnNumber
    })

    const locations = cells.map((cell) => splitCellReference(cell.locator.cell))
    const substantiveRange = locations.length === 0
      ? null
      : `${columnName(Math.min(...locations.map((item) => item.columnNumber)))}${Math.min(...locations.map((item) => item.row))}:${columnName(Math.max(...locations.map((item) => item.columnNumber)))}${Math.max(...locations.map((item) => item.row))}`
    const hiddenRows = allTags(worksheetXml, 'row')
      .filter((row) => row.attributes.hidden === '1')
      .map((row) => Number(row.attributes.r))
    const hiddenColumns = allTags(worksheetXml, 'col')
      .filter((column) => column.attributes.hidden === '1')
      .map((column) => `${column.attributes.min}:${column.attributes.max}`)
    const mergedRanges = allTags(worksheetXml, 'mergeCell').map((merge) => merge.attributes.ref)
    const hyperlinkTags = allTags(worksheetXml, 'hyperlink')
    const hyperlinks = hyperlinkTags.map(({ attributes: hyperlink }) => {
      const linkedCell = cells.find((cell) => cell.locator.cell === hyperlink.ref)
      const hyperlinkRelationship = hyperlink['r:id'] ? worksheetRelationships.get(hyperlink['r:id']) : null
      return {
        evidenceId: `${config.sourceId}:${evidenceSlug(attributes.name)}:hyperlink:${hyperlink.ref}`,
        authorityDomain: 'editorial-reference-only',
        source,
        locator: {
          kind: 'xlsx',
          sheet: attributes.name,
          row: splitCellReference(hyperlink.ref).row,
          cell: hyperlink.ref,
          range: hyperlink.ref
        },
        rawValue: hyperlinkRelationship ? hyperlinkRelationship.target : hyperlink.location,
        displayedValue: linkedCell ? linkedCell.displayedValue : hyperlink.display || null,
        targetMode: hyperlinkRelationship ? hyperlinkRelationship.targetMode : 'Internal',
        openedDuringExtraction: false,
        authorityUse: 'inventory-only'
      }
    })
    const role = config.sheetRoles[attributes.name]
    assert.ok(role, `No configured role for sheet ${attributes.name} in ${config.filename}`)

    sheets.push({
      name: attributes.name,
      state: attributes.state || 'visible',
      role: role.role,
      primaryDataRange: role.primaryDataRange,
      substantiveRange,
      substantiveCellCount: cells.length,
      formattedOnlyCellCount,
      formulaCount: cells.filter((cell) => cell.formula !== null).length,
      hyperlinkCount: hyperlinks.length,
      hiddenRows,
      hiddenColumns,
      mergedRanges,
      commentsPresent: commentParts.some((name) => /comment/i.test(name)),
      notesPresent: commentParts.some((name) => /note/i.test(name)),
      hyperlinks,
      cells
    })
  }

  return {
    schemaVersion: 1,
    authorityDomain: 'editorial',
    source: {
      sourceId: config.sourceId,
      filename: config.filename,
      sha256: source.sha256,
      kind: 'xlsx'
    },
    archiveEntryCount: archive.names().length,
    hiddenSheetCount: sheets.filter((sheet) => sheet.state !== 'visible').length,
    commentOrNoteParts: commentParts,
    sheets
  }
}

function normalizePdfText(value) {
  return value
    .replace(/\r/g, '')
    .replace(/\f/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
}

function extractPdfLinks(filename) {
  const output = childProcess.execFileSync('pdfinfo', ['-url', filename], { encoding: 'utf8' })
  const links = []

  for (const line of output.split(/\r?\n/).slice(1)) {
    const match = /^\s*(\d+)\s+(\S+)\s+(\S.*)$/.exec(line)
    if (match) {
      links.push({
        page: Number(match[1]),
        type: match[2],
        target: match[3].trim(),
        openedDuringExtraction: false,
        authorityUse: 'inventory-only'
      })
    }
  }

  return links
}

function parsePdf(config, sourceBuffer) {
  const filename = path.join(sourceRoot, config.filename)
  const source = sourceIdentity(config, sourceBuffer)
  const pages = []

  for (let pageNumber = 1; pageNumber <= config.pageCount; pageNumber += 1) {
    const rawText = childProcess.execFileSync(
      'pdftotext',
      ['-layout', '-f', String(pageNumber), '-l', String(pageNumber), filename, '-'],
      { encoding: 'utf8' }
    )
    const text = normalizePdfText(rawText)
    pages.push({
      evidenceId: `${config.sourceId}:page:${pageNumber}:${evidenceSlug(config.sections[pageNumber - 1])}`,
      authorityDomain: 'editorial',
      source,
      locator: {
        kind: 'pdf',
        page: pageNumber,
        section: config.sections[pageNumber - 1]
      },
      rawValue: text,
      displayedValue: text,
      formula: null,
      cachedValue: null,
      numberFormat: null,
      transformation: {
        operation: 'pdftotext-layout',
        detail: 'Removed form-feed characters and trailing line whitespace; retained page-local ordering and wording'
      }
    })
  }

  const links = extractPdfLinks(filename)
  return {
    schemaVersion: 1,
    authorityDomain: 'editorial',
    source: {
      sourceId: config.sourceId,
      filename: config.filename,
      sha256: source.sha256,
      kind: 'pdf'
    },
    pageCount: pages.length,
    linkAnnotationCount: links.length,
    links,
    pages
  }
}

function cellMap(extractedWorkbook, sheetName) {
  const sheet = extractedWorkbook.sheets.find((candidate) => candidate.name === sheetName)
  assert.ok(sheet, `Extracted sheet is missing: ${sheetName}`)
  return new Map(sheet.cells.map((cell) => [cell.locator.cell, cell]))
}

function getCell(cells, column, row) {
  return cells.get(`${column}${row}`) || null
}

function evidenceRefs(...cells) {
  return cells.filter(Boolean).map((cell) => cell.evidenceId)
}

function mappingTokens(raw) {
  if (!raw) return []

  return String(raw).split(',').map((sourceToken) => {
    const token = sourceToken.trim()
    let match = /^(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)$/i.exec(token)
    if (match) return { kind: 'range', raw: token, start: match[1], end: match[2] }

    match = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(token)
    if (match) return { kind: 'range', raw: token, start: match[1], end: match[2] }

    if (/^-?\d+(?:\.\d+)?$/.test(token)) return { kind: 'number', raw: token, value: token }
    return { kind: 'literal', raw: token, value: token }
  })
}

function parseRuntime(displayedValue) {
  if (displayedValue === null || displayedValue === undefined || displayedValue === '') {
    return {
      state: 'missing',
      seconds: null
    }
  }

  const displayed = String(displayedValue)
  let match = /^(\d+):(\d{2}):(\d{2})$/.exec(displayed)
  if (match) {
    return {
      state: 'known',
      seconds: Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
    }
  }

  match = /^(\d+):(\d{2})$/.exec(displayed)
  if (match) {
    return {
      state: 'known',
      seconds: Number(match[1]) * 60 + Number(match[2])
    }
  }

  return {
    state: 'non-runtime-directive',
    seconds: null
  }
}

function parseDate(displayedValue) {
  if (displayedValue === null || displayedValue === undefined || displayedValue === '') return null
  const displayed = String(displayedValue)
  let match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(displayed)
  if (!match) return null
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
  return `${year}-${pad(Number(match[1]))}-${pad(Number(match[2]))}`
}

function parseTimeSaved(raw, uncertain) {
  if (!raw) {
    return {
      raw: null,
      seconds: null,
      percent: null,
      uncertain: false
    }
  }

  const value = String(raw)
  const match = /^(\d+)m(\d+)s \((\d+)%\)\*?$/.exec(value)
  return {
    raw: value,
    seconds: match && !uncertain ? Number(match[1]) * 60 + Number(match[2]) : null,
    percent: match && !uncertain ? Number(match[3]) : null,
    uncertain
  }
}

function noteCellsForRow(cells, columns, row) {
  if (!columns.noteStart || !columns.noteEnd) return []
  if (columns.noteRows && !columns.noteRows.includes(row)) return []
  const notes = []

  for (let number = columnNumber(columns.noteStart); number <= columnNumber(columns.noteEnd); number += 1) {
    const cell = getCell(cells, columnName(number), row)
    if (!cell || String(cell.displayedValue).trim() === '') continue
    notes.push({
      text: String(cell.displayedValue),
      evidenceRefs: [cell.evidenceId]
    })
  }

  return notes
}

function normalizeProject(config, extractedWorkbook, watchGuide) {
  const columns = config.episodeColumns
  const cells = cellMap(extractedWorkbook, config.episodeSheet)
  const records = []
  const pageByNumber = new Map(watchGuide.pages.map((page) => [page.locator.page, page]))
  const episodeRows = [...new Set([...cells.values()].map((cell) => cell.locator.row))].sort((left, right) => left - right)

  for (const row of episodeRows) {
    if (row === 1) continue
    const identifierCell = getCell(cells, columns.identifier, row)
    const titleCell = getCell(cells, columns.title, row)
    if (!identifierCell || !titleCell) continue

    const identifierRaw = String(identifierCell.rawValue)
    const identifierDisplayed = String(identifierCell.displayedValue)
    const title = String(titleCell.displayedValue)
    const mangaCell = getCell(cells, columns.manga, row)
    const animeCell = getCell(cells, columns.anime, row)
    const runtimeCell = getCell(cells, columns.runtime, row)
    const releaseCell = getCell(cells, columns.releaseDate, row)
    const lastUpdateCell = getCell(cells, columns.lastUpdate, row)
    const timeSavedCell = columns.timeSaved ? getCell(cells, columns.timeSaved, row) : null
    const statusCell = columns.status ? getCell(cells, columns.status, row) : null
    const runtimeParsed = parseRuntime(runtimeCell ? runtimeCell.displayedValue : null)
    let availability

    if (config.projectId === 'concentrated' && identifierDisplayed === '45.5') availability = 'deferred'
    else if (config.projectId === 'concentrated' && identifierDisplayed === '50.5') availability = 'explicitly-not-planned'
    else if (config.projectId === 'hollowed' && (!runtimeCell || (releaseCell && releaseCell.displayedValue === 'TBD'))) availability = 'planned'
    else if (config.projectId === 'concentrated' && (!runtimeCell || !releaseCell)) availability = 'planned'
    else if (config.projectId === 'chipped' && statusCell && statusCell.displayedValue === 'Released') availability = 'released'
    else if (runtimeParsed.state === 'known' && releaseCell) availability = 'released'
    else availability = 'unresolved'

    const uncertainTimeSaved = config.projectId === 'chipped' && ['#03', '#04'].includes(identifierDisplayed)
    const notes = noteCellsForRow(cells, columns, row)
    const rowEvidence = evidenceRefs(identifierCell, titleCell)
    const runtimeEvidence = runtimeCell ? evidenceRefs(runtimeCell) : evidenceRefs(identifierCell, getCell(cells, columns.runtime, 1))
    const releaseEvidence = releaseCell ? evidenceRefs(releaseCell) : evidenceRefs(identifierCell, getCell(cells, columns.releaseDate, 1))
    const timeSavedEvidence = timeSavedCell ? evidenceRefs(timeSavedCell) : rowEvidence

    records.push({
      recordId: `${config.projectId}:${identifierDisplayed}`,
      projectId: config.projectId,
      sourceIdentifier: {
        raw: identifierRaw,
        displayed: identifierDisplayed
      },
      sourceRow: row,
      kind: identifierDisplayed.includes('.') ? 'special' : 'base',
      availability,
      generatable: availability === 'released' && runtimeParsed.state === 'known',
      title,
      mangaMapping: {
        raw: mangaCell ? String(mangaCell.displayedValue) : '',
        tokens: mappingTokens(mangaCell ? mangaCell.displayedValue : '')
      },
      animeMapping: {
        raw: animeCell ? String(animeCell.displayedValue) : '',
        tokens: mappingTokens(animeCell ? animeCell.displayedValue : '')
      },
      runtime: {
        state: runtimeParsed.state,
        raw: runtimeCell ? String(runtimeCell.rawValue) : null,
        displayed: runtimeCell ? String(runtimeCell.displayedValue) : null,
        seconds: runtimeParsed.seconds
      },
      releaseDate: {
        raw: releaseCell ? String(releaseCell.rawValue) : null,
        displayed: releaseCell ? String(releaseCell.displayedValue) : null,
        iso: releaseCell ? parseDate(releaseCell.displayedValue) : null
      },
      lastUpdate: {
        raw: lastUpdateCell ? String(lastUpdateCell.rawValue) : null,
        displayed: lastUpdateCell ? String(lastUpdateCell.displayedValue) : null,
        iso: lastUpdateCell ? parseDate(lastUpdateCell.displayedValue) : null
      },
      timeSaved: parseTimeSaved(timeSavedCell ? timeSavedCell.displayedValue : null, uncertainTimeSaved),
      notes,
      fieldEvidence: {
        '/recordId': evidenceRefs(identifierCell),
        '/projectId': evidenceRefs(identifierCell),
        '/sourceIdentifier/raw': evidenceRefs(identifierCell),
        '/sourceIdentifier/displayed': evidenceRefs(identifierCell),
        '/sourceRow': evidenceRefs(identifierCell),
        '/kind': evidenceRefs(identifierCell),
        '/availability': evidenceRefs(identifierCell, statusCell, runtimeCell, releaseCell),
        '/generatable': evidenceRefs(identifierCell, statusCell, runtimeCell, releaseCell),
        '/title': evidenceRefs(titleCell),
        '/mangaMapping/raw': mangaCell ? evidenceRefs(mangaCell) : rowEvidence,
        '/mangaMapping/tokens': mangaCell ? evidenceRefs(mangaCell) : rowEvidence,
        '/animeMapping/raw': animeCell ? evidenceRefs(animeCell) : rowEvidence,
        '/animeMapping/tokens': animeCell ? evidenceRefs(animeCell) : rowEvidence,
        '/runtime': runtimeEvidence,
        '/releaseDate': releaseEvidence,
        '/lastUpdate': lastUpdateCell ? evidenceRefs(lastUpdateCell) : rowEvidence,
        '/timeSaved': timeSavedEvidence,
        '/notes': notes.length > 0 ? notes.flatMap((note) => note.evidenceRefs) : rowEvidence
      },
      fieldTransformations: {
        '/recordId': 'Prefix the exact displayed source identifier with the project namespace; preserve all identifier characters.',
        '/kind': 'Classify identifiers containing a decimal point as special; availability remains independent.',
        '/availability': 'Apply the approved project-specific release/planning/directive rules without date precedence.',
        '/generatable': 'True only when editorial availability is released and runtime state is known; media evidence is still separately required.',
        '/mangaMapping/tokens': 'Conservatively tokenize numeric items/ranges while retaining the complete raw mapping.',
        '/animeMapping/tokens': 'Conservatively tokenize numeric items/ranges while retaining the complete raw mapping.',
        '/runtime': runtimeCell
          ? 'Apply the source cell display semantics, then parse mm:ss or h:mm:ss to seconds; do not interpret Hollowed cached serials as elapsed multi-hour runtimes.'
          : 'Represent the absent runtime as state=missing without fabricating a value.',
        '/releaseDate': 'Parse unambiguous displayed M/D/YY or M/D/YYYY values to ISO while preserving raw and displayed values.',
        '/lastUpdate': 'Parse unambiguous displayed M/D/YY or M/D/YYYY values to ISO while preserving raw and displayed values.',
        '/timeSaved': uncertainTimeSaved
          ? 'Preserve the starred source text and uncertainty; do not emit exact seconds or percent.'
          : 'Parse exact m/s and percent only when the source supplies a matching unstarred value.'
      }
    })
  }

  let projectPage
  let claims
  if (config.projectId === 'concentrated') {
    projectPage = pageByNumber.get(3)
    claims = [
      {
        claimId: 'concentrated-editorial-purpose',
        kind: 'editorial-purpose',
        raw: 'Concentrated Bleach is an edit of the Bleach anime that removes filler/padding to make it closer to the manga. Some filler is occasionally kept in as well.',
        interpretationState: 'direct',
        evidenceRefs: [projectPage.evidenceId]
      },
      {
        claimId: 'concentrated-plans-subject-to-change',
        kind: 'planning-status',
        raw: '(episode plans are subject to change (and definitely will))',
        interpretationState: 'direct',
        evidenceRefs: [getCell(cells, 'B', 92).evidenceId]
      }
    ]
  } else if (config.projectId === 'hollowed') {
    projectPage = pageByNumber.get(4)
    claims = [
      {
        claimId: 'hollowed-current-guide-coverage',
        kind: 'coverage',
        raw: 'This edit only covers the Arrancar arc.',
        interpretationState: 'direct',
        evidenceRefs: [projectPage.evidenceId]
      },
      {
        claimId: 'hollowed-v3-membership',
        kind: 'version-membership',
        raw: 'The spreadsheet contains v3 combination/rework notes whose active membership is unresolved.',
        interpretationState: 'unresolved',
        evidenceRefs: evidenceRefs(getCell(cells, 'I', 18), getCell(cells, 'I', 22), getCell(cells, 'I', 26), getCell(cells, 'I', 38))
      }
    ]
  } else {
    projectPage = pageByNumber.get(5)
    const exactVersionClaim = 'Only the first 4.5 episodes are updated. The rest of them are older, so don’t report any issues to the creator as he’s retired from doing this'
    const flattenedPage = projectPage.displayedValue.replace(/\s+/g, ' ')
    assert.ok(flattenedPage.includes(exactVersionClaim), 'Chipped project version claim wording changed')
    claims = [
      {
        claimId: 'chipped-first-4.5-updated',
        kind: 'version-update',
        raw: exactVersionClaim,
        interpretationState: 'unresolved',
        evidenceRefs: [projectPage.evidenceId]
      },
      {
        claimId: 'chipped-current-guide-coverage',
        kind: 'coverage',
        raw: 'This edit only covers The Lost Agent arc. (This is also called the Fullbringer Arc unofficially by fans)',
        interpretationState: 'direct',
        evidenceRefs: [projectPage.evidenceId]
      }
    ]
  }

  const displayNames = {
    concentrated: 'Concentrated Bleach',
    hollowed: 'Hollowed Bleach',
    chipped: 'Chipped Bleach'
  }

  return {
    schemaVersion: 1,
    project: {
      projectId: config.projectId,
      displayName: displayNames[config.projectId],
      authoritySourceId: config.sourceId,
      claims,
      fieldEvidence: {
        '/projectId': [projectPage.evidenceId],
        '/displayName': [projectPage.evidenceId],
        '/authoritySourceId': [getCell(cells, columns.identifier, 1).evidenceId],
        '/claims': claims.flatMap((claim) => claim.evidenceRefs)
      }
    },
    records
  }
}

function extractedEpisodeRows(config, workbook) {
  const cells = cellMap(workbook, config.episodeSheet)
  const rows = []
  const rowNumbers = [...new Set([...cells.values()].map((cell) => cell.locator.row))].sort((left, right) => left - right)

  for (const row of rowNumbers) {
    if (row === 1) continue
    const identifier = getCell(cells, config.episodeColumns.identifier, row)
    const title = getCell(cells, config.episodeColumns.title, row)
    if (!identifier || !title) continue
    const cellEvidenceRefs = {}

    for (const cell of [...cells.values()].filter((candidate) => candidate.locator.row === row)) {
      cellEvidenceRefs[cell.locator.cell.replace(String(row), '')] = cell.evidenceId
    }

    rows.push({
      row,
      sourceIdentifierRaw: String(identifier.rawValue),
      sourceIdentifierDisplayed: String(identifier.displayedValue),
      cellEvidenceRefs
    })
  }

  return rows
}

function buildWatchOrder(watchGuide) {
  const page = watchGuide.pages.find((candidate) => candidate.locator.page === 6)
  assert.ok(page, 'Watch Guide page 6 is missing')
  const rawPage = page.displayedValue.replace(/\s+/g, ' ')
  for (const expected of [
    'Concentrated Bleach 01-09',
    'Concentrated Bleach 10-35.5',
    'Concentrated Bleach 36-51',
    'Pause CB 50 at 16:15, watch HB 11.5, then resume CB 50',
    'Hollowed Bleach 14-50',
    'Chipped Bleach 01-12',
    'TYBW Anime Episode 01-43',
    'Read from Chapter 668 or wait for the next 7 episodes in Cour 4 to release'
  ]) assert.ok(rawPage.includes(expected), `Watch Guide instruction changed: ${expected}`)

  const evidence = [page.evidenceId]
  return {
    schemaVersion: 1,
    watchOrderId: 'source-guide-v2',
    authoritySourceId: 'watch-guide-pdf',
    segments: [
      {
        sequenceIndex: 1,
        type: 'raw-range',
        arc: 'Substitute Soul Reaper Arc',
        projectId: 'concentrated',
        rawRange: '01-09',
        start: { rawIdentifier: '01', resolutionState: 'resolved', recordId: 'concentrated:01' },
        end: { rawIdentifier: '09', resolutionState: 'resolved', recordId: 'concentrated:09' },
        expanded: false
      },
      {
        sequenceIndex: 2,
        type: 'raw-range',
        arc: 'Soul Society Arc',
        projectId: 'concentrated',
        rawRange: '10-35.5',
        start: { rawIdentifier: '10', resolutionState: 'resolved', recordId: 'concentrated:10' },
        end: {
          rawIdentifier: '35.5',
          resolutionState: 'unresolved',
          recordId: null,
          unresolvedReferenceId: 'watch-endpoint:concentrated:35.5'
        },
        expanded: false
      },
      {
        sequenceIndex: 3,
        type: 'raw-range',
        arc: 'Arrancar Arc',
        projectId: 'concentrated',
        rawRange: '36-51',
        start: { rawIdentifier: '36', resolutionState: 'resolved', recordId: 'concentrated:36' },
        end: { rawIdentifier: '51', resolutionState: 'resolved', recordId: 'concentrated:51' },
        expanded: false
      },
      {
        sequenceIndex: 4,
        type: 'raw-range',
        arc: 'Arrancar Arc',
        projectId: 'hollowed',
        rawRange: '14-50',
        start: { rawIdentifier: '14', resolutionState: 'resolved', recordId: 'hollowed:14' },
        end: { rawIdentifier: '50', resolutionState: 'resolved', recordId: 'hollowed:50' },
        expanded: false
      },
      {
        sequenceIndex: 5,
        type: 'raw-range',
        arc: 'The Lost Agent Arc',
        projectId: 'chipped',
        rawRange: '01-12',
        start: { rawIdentifier: '01', resolutionState: 'resolved', recordId: 'chipped:#01' },
        end: { rawIdentifier: '12', resolutionState: 'resolved', recordId: 'chipped:#12' },
        expanded: false
      },
      {
        sequenceIndex: 6,
        type: 'external-handoff',
        arc: 'Thousand-Year Blood War Arc',
        rawInstruction: 'TYBW Anime Episode 01-43; Read from Chapter 668 or wait for the next 7 episodes in Cour 4 to release',
        addonGeneration: false
      }
    ],
    optionalBranches: [
      {
        branchId: 'cb50-hb11.5-insertion',
        sequenceIndex: 1,
        type: 'nested-mid-episode-insertion',
        optional: true,
        mainlineAnchor: {
          recordId: 'concentrated:50',
          sourceIdentifier: '50'
        },
        pause: {
          rawTimestamp: '16:15',
          seconds: 975
        },
        insertedRecordId: 'hollowed:11.5',
        resume: {
          recordId: 'concentrated:50',
          fromRawTimestamp: '16:15',
          fromSeconds: 975
        },
        ordinaryAdjacentEpisode: false
      }
    ],
    unresolvedEndpointReferences: [
      {
        referenceId: 'watch-endpoint:concentrated:35.5',
        projectId: 'concentrated',
        rawIdentifier: '35.5',
        resolutionState: 'unresolved',
        issueId: 'concentrated-35.5-vs-0.0'
      }
    ],
    fieldEvidence: {
      '/watchOrderId': evidence,
      '/authoritySourceId': evidence,
      '/segments/0': evidence,
      '/segments/1': evidence,
      '/segments/2': evidence,
      '/segments/3': evidence,
      '/segments/4': evidence,
      '/segments/5': evidence,
      '/optionalBranches/0': evidence,
      '/unresolvedEndpointReferences/0': evidence
    }
  }
}

function runtimeFromEvidence(cell) {
  const parsed = parseRuntime(cell ? cell.displayedValue : null)
  return {
    state: parsed.state,
    raw: cell ? String(cell.rawValue) : null,
    displayed: cell ? String(cell.displayedValue) : null,
    seconds: parsed.seconds
  }
}

function buildVariants(exInfo, hollowedWorkbook) {
  const page = exInfo.pages[0]
  const flattened = page.displayedValue.replace(/\s+/g, ' ')
  const semantics = {
    ex1: 'Changes the start of the episode so you can watch the filler Bount arc before it (idk why you would but its an option).',
    ex27: 'Combines episodes 27-29 into a movie length episode. That’s all it does there aren’t any added scene or anything.',
    ex27Path: 'Order goes 26 -> 27 EX -> 0.8 -> 30',
    ex50: 'Changes the ending to allow you to watch the filler Gotei 13 invading army arc after.'
  }
  for (const text of Object.values(semantics)) assert.ok(flattened.includes(text), `EX source wording changed: ${text}`)

  const cells = cellMap(hollowedWorkbook, 'Episode List')
  const variants = [
    {
      variantId: 'hollowed:ex:01',
      sourceLabel: 'EX 1',
      relationship: 'optional-transition-variant',
      baseRecordIds: ['hollowed:01'],
      optional: true,
      defaultLinearMembership: false,
      semantics: {
        raw: semantics.ex1,
        externalTransition: 'Bount arc'
      },
      runtime: runtimeFromEvidence(getCell(cells, 'F', 2)),
      currentLegacyStatus: 'unresolved',
      mediaAvailability: 'unresolved',
      branch: null,
      fieldEvidence: {
        '/variantId': [page.evidenceId],
        '/sourceLabel': [page.evidenceId],
        '/relationship': [page.evidenceId],
        '/baseRecordIds': [page.evidenceId],
        '/optional': [page.evidenceId],
        '/defaultLinearMembership': [page.evidenceId],
        '/semantics': [page.evidenceId],
        '/runtime': evidenceRefs(getCell(cells, 'F', 2)),
        '/currentLegacyStatus': [page.evidenceId],
        '/mediaAvailability': [page.evidenceId],
        '/branch': [page.evidenceId]
      }
    },
    {
      variantId: 'hollowed:ex:27',
      sourceLabel: 'EX 27',
      relationship: 'optional-combined-replacement',
      baseRecordIds: ['hollowed:27', 'hollowed:28', 'hollowed:29'],
      optional: true,
      defaultLinearMembership: false,
      semantics: {
        raw: `${semantics.ex27} ${semantics.ex27Path}`,
        externalTransition: null
      },
      runtime: runtimeFromEvidence(getCell(cells, 'F', 29)),
      currentLegacyStatus: 'unresolved',
      mediaAvailability: 'unresolved',
      branch: {
        branchId: 'hollowed-ex27-path',
        replacesRecordIds: ['hollowed:27', 'hollowed:28', 'hollowed:29'],
        path: [
          { sequenceIndex: 1, type: 'record', recordId: 'hollowed:26' },
          { sequenceIndex: 2, type: 'variant', variantId: 'hollowed:ex:27' },
          { sequenceIndex: 3, type: 'record', recordId: 'hollowed:0.8' },
          { sequenceIndex: 4, type: 'record', recordId: 'hollowed:30' }
        ]
      },
      fieldEvidence: {
        '/variantId': [page.evidenceId],
        '/sourceLabel': [page.evidenceId],
        '/relationship': [page.evidenceId],
        '/baseRecordIds': [page.evidenceId],
        '/optional': [page.evidenceId],
        '/defaultLinearMembership': [page.evidenceId],
        '/semantics': [page.evidenceId],
        '/runtime': evidenceRefs(getCell(cells, 'F', 29)),
        '/currentLegacyStatus': [page.evidenceId],
        '/mediaAvailability': [page.evidenceId],
        '/branch': [page.evidenceId]
      }
    },
    {
      variantId: 'hollowed:ex:50',
      sourceLabel: 'EX 50',
      relationship: 'optional-transition-variant',
      baseRecordIds: ['hollowed:50'],
      optional: true,
      defaultLinearMembership: false,
      semantics: {
        raw: semantics.ex50,
        externalTransition: 'Gotei 13 invading army arc'
      },
      runtime: runtimeFromEvidence(getCell(cells, 'F', 53)),
      currentLegacyStatus: 'unresolved',
      mediaAvailability: 'unresolved',
      branch: null,
      fieldEvidence: {
        '/variantId': [page.evidenceId],
        '/sourceLabel': [page.evidenceId],
        '/relationship': [page.evidenceId],
        '/baseRecordIds': [page.evidenceId],
        '/optional': [page.evidenceId],
        '/defaultLinearMembership': [page.evidenceId],
        '/semantics': [page.evidenceId],
        '/runtime': evidenceRefs(getCell(cells, 'F', 53)),
        '/currentLegacyStatus': [page.evidenceId],
        '/mediaAvailability': [page.evidenceId],
        '/branch': [page.evidenceId]
      }
    }
  ]

  return {
    schemaVersion: 1,
    collectionId: 'hollowed-ex',
    defaultLinearMembership: false,
    variants
  }
}

function buildUnresolved(watchGuide, exInfo, workbooks) {
  const concentratedCells = cellMap(workbooks.concentrated, 'Episode List')
  const hollowedCells = cellMap(workbooks.hollowed, 'Episode List')
  const chippedCells = cellMap(workbooks.chipped, 'Chipped Bleach Info')
  const watchPage6 = watchGuide.pages.find((page) => page.locator.page === 6)
  const watchPage5 = watchGuide.pages.find((page) => page.locator.page === 5)
  const exPage = exInfo.pages[0]

  return {
    schemaVersion: 1,
    policy: 'Conflicting or incomplete source claims remain explicit and block only the affected relationship or field; no document-date precedence is applied.',
    issues: [
      {
        issueId: 'concentrated-35.5-vs-0.0',
        status: 'unresolved',
        kind: 'watch-order-endpoint-conflict',
        claims: [
          {
            sourceClaim: 'Concentrated Bleach 10-35.5',
            value: '35.5',
            evidenceRefs: [watchPage6.evidenceId]
          },
          {
            sourceClaim: 'The corresponding primary spreadsheet record is numbered 0.0 and titled the rotator / the sand.',
            value: '0.0',
            evidenceRefs: evidenceRefs(getCell(concentratedCells, 'A', 38), getCell(concentratedCells, 'B', 38))
          }
        ],
        prohibitedResolution: 'Do not equate 35.5 with 0.0 and do not expand or finalize the affected watch-order boundary.',
        blocks: ['watch-orders/source-guide-v2:segments/1:end']
      },
      {
        issueId: 'hollowed-v3-membership',
        status: 'unresolved',
        kind: 'version-membership',
        claims: [
          {
            sourceClaim: 'Hollowed rows contain combined/reworked v3 notes but retain the raw source rows.',
            value: 'active and obsolete row membership is not selected',
            evidenceRefs: evidenceRefs(
              getCell(hollowedCells, 'I', 18),
              getCell(hollowedCells, 'I', 22),
              getCell(hollowedCells, 'I', 26),
              getCell(hollowedCells, 'I', 38)
            )
          }
        ],
        prohibitedResolution: 'Do not mark source rows as aliases or obsolete until explicitly approved.',
        blocks: ['hollowed version-specific sequence expansion']
      },
      {
        issueId: 'chipped-first-4.5-media-mapping',
        status: 'unresolved',
        kind: 'project-version-claim',
        claims: [
          {
            sourceClaim: 'Only the first 4.5 episodes are updated. The rest of them are older, so don’t report any issues to the creator as he’s retired from doing this',
            value: '4.5 is project-level wording, not an episode identifier',
            evidenceRefs: [watchPage5.evidenceId]
          }
        ],
        prohibitedResolution: 'Do not map 4.5 to a source episode or media edition without authority.',
        blocks: ['per-media Chipped version selection']
      },
      {
        issueId: 'ex-current-legacy-and-media-status',
        status: 'unresolved',
        kind: 'variant-gating',
        claims: [
          {
            sourceClaim: 'The EX source describes legacy EX episodes and the semantics of EX 1, EX 27, and EX 50.',
            value: 'current/legacy status and media availability are not selected',
            evidenceRefs: [exPage.evidenceId]
          }
        ],
        prohibitedResolution: 'Do not make EX variants default-linear or claim media availability.',
        blocks: ['EX generation', 'EX default watch-order membership']
      },
      {
        issueId: 'cross-project-0.8-relationship',
        status: 'unresolved',
        kind: 'cross-project-relationship',
        claims: [
          {
            sourceClaim: 'Concentrated has its own 0.8 record.',
            value: 'concentrated:0.8',
            evidenceRefs: evidenceRefs(getCell(concentratedCells, 'A', 68), getCell(concentratedCells, 'B', 68))
          },
          {
            sourceClaim: 'Hollowed has its own 0.8 record.',
            value: 'hollowed:0.8',
            evidenceRefs: evidenceRefs(getCell(hollowedCells, 'A', 32), getCell(hollowedCells, 'B', 32))
          }
        ],
        prohibitedResolution: 'Keep the records distinct; do not create equivalence or derivation relationships without authority.',
        blocks: ['cross-project 0.8 canonicalization']
      },
      {
        issueId: 'chipped-03-04-time-saved',
        status: 'unresolved',
        kind: 'uncertain-statistic',
        claims: [
          {
            sourceClaim: 'The exact time saved for Chipped 03 and 04 is unknown because a scene was moved.',
            value: 'source strings retained; exact seconds and percentages omitted',
            evidenceRefs: evidenceRefs(getCell(chippedCells, 'G', 4), getCell(chippedCells, 'G', 5), getCell(chippedCells, 'K', 9))
          }
        ],
        prohibitedResolution: 'Do not normalize the starred values as exact statistics.',
        blocks: ['exact Chipped 03/04 time-saved aggregates']
      }
    ]
  }
}

function sourceInventoryEntry(config, sourceBuffer, extracted) {
  const common = {
    sourceId: config.sourceId,
    filename: config.filename,
    relativePath: `sources/${config.filename}`,
    sha256: sha256(sourceBuffer),
    byteSize: sourceBuffer.length,
    kind: config.kind,
    role: config.role
  }

  if (config.kind === 'pdf') {
    return {
      ...common,
      pageCount: extracted.pageCount,
      linkAnnotationCount: extracted.linkAnnotationCount
    }
  }

  return {
    ...common,
    sheets: extracted.sheets.map((sheet) => ({
      name: sheet.name,
      state: sheet.state,
      role: sheet.role,
      primaryDataRange: sheet.primaryDataRange,
      substantiveRange: sheet.substantiveRange,
      substantiveCellCount: sheet.substantiveCellCount,
      formattedOnlyCellCount: sheet.formattedOnlyCellCount,
      formulaCount: sheet.formulaCount,
      hyperlinkCount: sheet.hyperlinkCount,
      hiddenRows: sheet.hiddenRows,
      hiddenColumns: sheet.hiddenColumns,
      commentsPresent: sheet.commentsPresent,
      notesPresent: sheet.notesPresent
    }))
  }
}

function buildOutputs() {
  const buffers = new Map()
  const extracted = new Map()

  for (const config of SOURCES) {
    const filename = path.join(sourceRoot, config.filename)
    const buffer = fs.readFileSync(filename)
    const actualHash = sha256(buffer)
    assert.equal(actualHash, config.sha256, `Authoritative source hash changed: ${config.filename}`)
    buffers.set(config.sourceId, buffer)
    extracted.set(config.sourceId, config.kind === 'xlsx' ? parseWorkbook(config, buffer) : parsePdf(config, buffer))
  }

  const watchGuide = extracted.get('watch-guide-pdf')
  const exInfo = extracted.get('ex-episodes-pdf')
  const projectConfigs = SOURCES.filter((source) => source.projectId)
  const normalizedProjects = new Map()

  for (const config of projectConfigs) {
    const workbook = extracted.get(config.sourceId)
    workbook.episodeRows = extractedEpisodeRows(config, workbook)
    normalizedProjects.set(config.projectId, normalizeProject(config, workbook, watchGuide))
  }

  const workbooks = {
    concentrated: extracted.get('concentrated-xlsx'),
    hollowed: extracted.get('hollowed-xlsx'),
    chipped: extracted.get('chipped-xlsx')
  }
  const outputs = new Map()
  outputs.set('editorial/source-inventory.json', {
    schemaVersion: 1,
    authorityScope: 'Bleach editorial metadata only; never torrent or media technical evidence',
    sources: SOURCES.map((config) => sourceInventoryEntry(config, buffers.get(config.sourceId), extracted.get(config.sourceId)))
  })
  outputs.set('editorial/extracted/concentrated.json', workbooks.concentrated)
  outputs.set('editorial/extracted/hollowed.json', workbooks.hollowed)
  outputs.set('editorial/extracted/chipped.json', workbooks.chipped)
  outputs.set('editorial/extracted/watch-guide.json', watchGuide)
  outputs.set('editorial/extracted/ex-episodes.json', exInfo)
  outputs.set('editorial/normalized/concentrated.json', normalizedProjects.get('concentrated'))
  outputs.set('editorial/normalized/hollowed.json', normalizedProjects.get('hollowed'))
  outputs.set('editorial/normalized/chipped.json', normalizedProjects.get('chipped'))
  outputs.set('editorial/variants/ex.json', buildVariants(exInfo, workbooks.hollowed))
  outputs.set('editorial/watch-orders/source-guide-v2.json', buildWatchOrder(watchGuide))
  outputs.set('editorial/unresolved.json', buildUnresolved(watchGuide, exInfo, workbooks))
  return outputs
}

function parseArguments(argv) {
  const options = {
    outputRoot: root,
    check: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--check') options.check = true
    else if (argv[index] === '--output-root') {
      index += 1
      assert.ok(argv[index], '--output-root requires a path')
      options.outputRoot = path.resolve(argv[index])
    } else throw new Error(`Unknown argument: ${argv[index]}`)
  }

  return options
}

function main() {
  const options = parseArguments(process.argv.slice(2))
  const outputs = buildOutputs()

  for (const [relativePath, value] of outputs) {
    const serialized = stableJson(value)
    const destination = path.join(options.outputRoot, relativePath)

    if (options.check) {
      assert.ok(fs.existsSync(destination), `Generated editorial file is missing: ${relativePath}`)
      assert.equal(fs.readFileSync(destination, 'utf8'), serialized, `Generated editorial file is stale: ${relativePath}`)
    } else writeJson(options.outputRoot, relativePath, value)
  }

  const mode = options.check ? 'verified' : 'wrote'
  process.stdout.write(`${mode} ${outputs.size} deterministic editorial JSON files\n`)
}

if (require.main === module) main()

module.exports = {
  SOURCES,
  buildOutputs,
  stableJson
}
