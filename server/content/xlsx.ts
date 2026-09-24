import { inflateRawSync } from 'node:zlib'

/**
 * Minimal read-only .xlsx reader.
 *
 * An .xlsx file is a ZIP archive of XML parts. The content import runs once per
 * client delivery of the mapping spreadsheet, so a dependency-free reader is
 * cheaper than adding a spreadsheet library to the build: it only has to handle
 * the two compression methods Excel actually emits (stored and deflate) and the
 * handful of XML shapes that appear in a sheet.
 */

interface ZipEntry {
  name: string
  data: Buffer
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_FILE_HEADER = 0x02014b50

function findEndOfCentralDirectory(buffer: Buffer): number {
  // The record is at the very end of the archive, after a comment of unknown
  // length, so it has to be located by scanning backwards for its signature.
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
      return offset
    }
  }

  throw new Error('Not a ZIP archive: end of central directory not found')
}

export function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const endOffset = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(endOffset + 10)
  let cursor = buffer.readUInt32LE(endOffset + 16)

  const entries = new Map<string, Buffer>()

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_FILE_HEADER) {
      throw new Error(`Corrupt ZIP central directory at entry ${index}`)
    }

    const compressionMethod = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString('utf8')

    // The local header repeats the name and extra fields with its own lengths,
    // which is where the payload actually starts.
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28)
    const dataStart =
      localHeaderOffset + 30 + localNameLength + localExtraLength
    const raw = buffer.subarray(dataStart, dataStart + compressedSize)

    const entry: ZipEntry = {
      name,
      data: compressionMethod === 0 ? Buffer.from(raw) : inflateRawSync(raw),
    }

    entries.set(entry.name, entry.data)
    cursor += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

export function decodeXmlText(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
    }

    if (entity.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10))
    }

    return XML_ENTITIES[entity] ?? match
  })
}

/**
 * Shared strings are Excel's string pool. A single cell's text can be split
 * across several <t> runs when parts of it carry different formatting, so every
 * run inside one <si> has to be concatenated.
 */
export function parseSharedStrings(xml: string): string[] {
  const items = xml.match(/<si>[\s\S]*?<\/si>/g) ?? []

  return items.map((item) => {
    const runs = item.match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? []
    return runs
      .map((run) => decodeXmlText(run.replace(/<t[^>]*>([\s\S]*?)<\/t>/, '$1')))
      .join('')
  })
}

export type SheetRow = Map<string, string>

/**
 * Parses a worksheet into rows keyed by column letter. Empty cells are absent
 * rather than blank, which is how Excel stores them.
 */
export function parseSheetRows(
  xml: string,
  sharedStrings: readonly string[],
): Map<number, SheetRow> {
  const rows = new Map<number, SheetRow>()
  const rowMatches =
    xml.match(/<row[^>]*r="\d+"[^>]*>[\s\S]*?<\/row>/g) ?? []

  for (const rowXml of rowMatches) {
    const rowNumber = Number.parseInt(
      /<row[^>]*r="(\d+)"/.exec(rowXml)?.[1] ?? '0',
      10,
    )

    if (!rowNumber) {
      continue
    }

    const cells: SheetRow = new Map()
    const cellMatches =
      rowXml.match(/<c [^>]*r="[A-Z]+\d+"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) ?? []

    for (const cellXml of cellMatches) {
      const column = /r="([A-Z]+)\d+"/.exec(cellXml)?.[1]

      if (!column) {
        continue
      }

      const isSharedString = /t="s"/.test(cellXml)
      const isInlineString = /t="(?:inlineStr|str)"/.test(cellXml)

      if (isInlineString) {
        const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cellXml)?.[1]
        if (inline !== undefined) {
          cells.set(column, decodeXmlText(inline))
        }
        continue
      }

      const value = /<v>([\s\S]*?)<\/v>/.exec(cellXml)?.[1]

      if (value === undefined) {
        continue
      }

      if (isSharedString) {
        const resolved = sharedStrings[Number.parseInt(value, 10)]
        if (resolved !== undefined) {
          cells.set(column, resolved)
        }
        continue
      }

      cells.set(column, decodeXmlText(value))
    }

    rows.set(rowNumber, cells)
  }

  return rows
}
