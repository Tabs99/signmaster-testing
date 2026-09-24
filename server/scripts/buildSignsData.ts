import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, basename } from 'node:path'
import {
  parseSharedStrings,
  parseSheetRows,
  readZipEntries,
  type SheetRow,
} from '../content/xlsx.ts'
import { isSignCategory, resolveSignGroup } from '../content/signTaxonomy.ts'
import type { SignRecord } from '../content/signs.ts'

/**
 * Imports the client's flash card mapping spreadsheet into the canonical sign
 * dataset, and copies the matching artwork into `public/signs/`.
 *
 * Run once per delivery of the mapping file:
 *
 *   npm run build:signs -- "<path to Flash Cards - Mapping folder>"
 *
 * The spreadsheet is the source of truth for every meaning. This script never
 * invents or edits copy — it only reads, validates and reshapes. The shortened
 * wording used in option lists lives separately in `signAnswers.ts` so that
 * re-importing a new delivery cannot overwrite it.
 */

const SHEET_PATH = 'xl/worksheets/sheet2.xml'
const SHARED_STRINGS_PATH = 'xl/sharedStrings.xml'
const EXPECTED_SIGN_COUNT = 101

const COLUMN_ORDINAL = 'A'
const COLUMN_CATEGORY = 'B'
const COLUMN_DRAWINGS = 'C'
const COLUMN_DESCRIPTION = 'D'

interface ImportedSign extends SignRecord {
  sourceRow: number
}

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function fileDigest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function indexArtwork(root: string): Map<string, string> {
  const files = new Map<string, string>()

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry)

      if (statSync(path).isDirectory()) {
        walk(path)
        continue
      }

      if (!/\.jpe?g$/i.test(entry)) {
        continue
      }

      // The spreadsheet references artwork by bare filename, and the merged
      // images folder keeps its own copy of each component sign. Those copies
      // are identical, so a repeated name is fine as long as the bytes match —
      // two different images under one name would make the import ambiguous.
      const existing = files.get(entry)

      if (existing && existing !== path) {
        if (fileDigest(existing) !== fileDigest(path)) {
          fail(
            `Artwork filename "${entry}" refers to two different images: ${existing} and ${path}`,
          )
        }

        continue
      }

      files.set(entry, path)
    }
  }

  walk(root)

  return files
}

function readCell(row: SheetRow, column: string): string {
  return (row.get(column) ?? '').trim()
}

function parseOrdinal(raw: string, sourceRow: number): number {
  const ordinal = Number.parseFloat(raw)

  if (!Number.isFinite(ordinal) || !Number.isInteger(ordinal)) {
    fail(`Row ${sourceRow}: "${raw}" is not a whole sign number`)
  }

  return ordinal
}

function parseDrawings(raw: string, sourceRow: number): string[] {
  // Merged entries hold two or three filenames in one cell, separated by line
  // breaks, and render as a single question showing all of them together.
  const drawings = raw
    .split(/[\r\n]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  if (drawings.length === 0) {
    fail(`Row ${sourceRow}: no artwork filename`)
  }

  return drawings
}

function importSigns(mappingFolder: string): ImportedSign[] {
  const workbookPath = join(mappingFolder, 'Mapping File.xlsx')
  const artworkRoot = join(mappingFolder, 'Jpeg Files')
  const entries = readZipEntries(readFileSync(workbookPath))

  const sheetXml = entries.get(SHEET_PATH)
  const sharedStringsXml = entries.get(SHARED_STRINGS_PATH)

  if (!sheetXml || !sharedStringsXml) {
    fail(`${workbookPath} does not contain the expected worksheet parts`)
  }

  const sharedStrings = parseSharedStrings(sharedStringsXml.toString('utf8'))
  const rows = parseSheetRows(sheetXml.toString('utf8'), sharedStrings)
  const artwork = indexArtwork(artworkRoot)

  const signs: ImportedSign[] = []
  const seenOrdinals = new Set<number>()

  for (const [sourceRow, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    // Row 1 is the header.
    if (sourceRow === 1) {
      continue
    }

    const rawOrdinal = readCell(row, COLUMN_ORDINAL)
    const category = readCell(row, COLUMN_CATEGORY)
    const description = readCell(row, COLUMN_DESCRIPTION)

    if (!rawOrdinal && !category && !description) {
      continue
    }

    const ordinal = parseOrdinal(rawOrdinal, sourceRow)

    if (seenOrdinals.has(ordinal)) {
      fail(`Row ${sourceRow}: sign number ${ordinal} is used more than once`)
    }

    seenOrdinals.add(ordinal)

    if (!isSignCategory(category)) {
      fail(`Row ${sourceRow}: unknown category "${category}"`)
    }

    if (!description) {
      fail(`Row ${sourceRow}: no description, so the sign has no correct answer`)
    }

    const drawings = parseDrawings(readCell(row, COLUMN_DRAWINGS), sourceRow)
    const images = drawings.map((drawing) => {
      if (!artwork.has(drawing)) {
        fail(`Row ${sourceRow}: artwork "${drawing}" is not in ${artworkRoot}`)
      }

      return drawing
    })

    signs.push({
      id: `s${String(ordinal).padStart(3, '0')}`,
      ordinal,
      category,
      group: resolveSignGroup(category, ordinal),
      meaning: description,
      images,
      sourceRow,
    })
  }

  return signs.sort((a, b) => a.ordinal - b.ordinal)
}

function copyArtwork(signs: readonly ImportedSign[], mappingFolder: string, publicRoot: string): number {
  const artwork = indexArtwork(join(mappingFolder, 'Jpeg Files'))
  mkdirSync(publicRoot, { recursive: true })

  const copied = new Set<string>()

  for (const sign of signs) {
    for (const image of sign.images) {
      if (copied.has(image)) {
        continue
      }

      const source = artwork.get(image)

      if (!source) {
        fail(`Artwork "${image}" vanished between passes`)
      }

      copyFileSync(source, join(publicRoot, image))
      copied.add(image)
    }
  }

  return copied.size
}

function main(): void {
  const mappingFolder = resolve(
    process.argv[2] ??
      join(process.env.HOME ?? '', 'Downloads', 'Flash Cards - Mapping'),
  )
  const repoRoot = resolve(import.meta.dirname, '..', '..')
  const publicRoot = join(repoRoot, 'public', 'signs')
  const datasetPath = join(repoRoot, 'server', 'content', 'signs.json')

  const signs = importSigns(mappingFolder)

  if (signs.length !== EXPECTED_SIGN_COUNT) {
    fail(
      `Expected ${EXPECTED_SIGN_COUNT} signs in the deck, found ${signs.length}`,
    )
  }

  const imageCount = copyArtwork(signs, mappingFolder, publicRoot)

  const dataset = signs.map(({ sourceRow: _sourceRow, ...sign }) => sign)
  writeFileSync(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8')

  const merged = signs.filter((sign) => sign.images.length > 1)
  const categories = new Set(signs.map((sign) => sign.category))

  console.log(`✓ ${signs.length} signs imported from ${basename(mappingFolder)}`)
  console.log(`  ${categories.size} categories, ${merged.length} multi-image questions`)
  console.log(`  ${imageCount} artwork files copied to public/signs/`)
  console.log(`  dataset written to server/content/signs.json`)
}

main()
