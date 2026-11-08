import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { collectFiles } from '../scripts/lib/package.ts'
import { SRC_DIR } from '../scripts/lib/cli.ts'

// Loose shapes of the JSON the tests build and mutate. Tests deliberately break
// these fixtures, so every level stays open to unknown keys and values.

export interface TestOverlay {
  color: string
  opacity: number
}

export interface TestBackground {
  [key: string]: unknown
  type: string
  kind?: string
  angle?: number
  stops?: Array<{ color: string, at: number }>
  src?: string
  blur?: number
  opacity?: number
  overlay?: TestOverlay
}

export interface TestMode {
  [key: string]: unknown
  colors: Record<string, string>
  background?: TestBackground
  petStatus?: Record<string, string>
  userImage?: { allowed?: boolean, overlay?: TestOverlay }
}

export interface TestTheme {
  [key: string]: unknown
  id: string
  displayName: Record<string, string>
  modes: Record<string, TestMode>
  typography?: { body?: string[], scale?: number }
  shape?: Record<string, number>
  fonts?: Array<{ id: string, src: string, weight?: number, style?: string }>
}

export interface TestManifest {
  [key: string]: unknown
  id: string
  version: string
  contributes: { [key: string]: unknown, panelThemes: TestTheme[] }
}

export const clone = <T>(value: T): T => structuredClone(value)

export function loadManifest(): TestManifest {
  return JSON.parse(readFileSync(resolve(SRC_DIR, 'plugin.json'), 'utf8'))
}

/** The real package files with a replaced plugin.json (and optional extra/removed files). */
export function packageWith(manifest: unknown, { add = {}, remove = [] }: { add?: Record<string, string | Buffer>, remove?: string[] } = {}): Map<string, Buffer> {
  const files = collectFiles(SRC_DIR)
  files.set('plugin.json', Buffer.from(JSON.stringify(manifest)))
  for (const [path, bytes] of Object.entries(add)) files.set(path, typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes))
  for (const path of remove) files.delete(path)
  return files
}

export function themeById(manifest: TestManifest, id: string): TestTheme {
  const theme = manifest.contributes.panelThemes.find(theme => theme.id === id)
  assert.ok(theme, `no theme ${id}`)
  return theme
}

/** A minimal valid two-mode theme with solid backgrounds. */
export function minimalTheme(id = 'test'): TestTheme {
  return {
    id,
    displayName: { 'zh-TW': '測試', 'en-US': 'Test' },
    modes: {
      light: {
        colors: { bg: '#f5ead8', surface: '#f9f4ed', surface2: '#eee7db', text: '#201e1d', textSecondary: '#645c50', textMuted: '#6b6354', accent: '#c67139', accentHover: '#a85a28', accentText: '#8c491a', onAccent: '#fff2eb', border: 'rgba(32,30,29,.16)' },
      },
      dark: {
        colors: { bg: '#1f1b16', surface: '#292420', surface2: '#342e28', text: '#f3ede4', textSecondary: '#cfc5b6', textMuted: '#b0a592', accent: '#d98652', accentText: '#f0b48a', onAccent: '#201e1d', border: 'rgba(243,237,228,.18)' },
      },
    },
  }
}

/** Builds a PNG header-only byte string with the given size and optional chunks before IDAT. */
export function fakePng(width: number, height: number, chunks: Array<[string, Buffer]> = []): Buffer {
  const chunk = (type: string, data: Buffer = Buffer.alloc(0)) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...chunks.map(([type, data]) => chunk(type, data)),
    chunk('IDAT', Buffer.from([0])),
    chunk('IEND'),
  ])
}

/** Little-endian TIFF with a single Orientation entry. */
export function tiffOrientation(value: number): Buffer {
  const tiff = Buffer.alloc(26)
  tiff.write('II', 0, 'ascii')
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4)
  tiff.writeUInt16LE(1, 8)
  tiff.writeUInt16LE(0x0112, 10)
  tiff.writeUInt16LE(3, 12)
  tiff.writeUInt32LE(1, 14)
  tiff.writeUInt16LE(value, 18)
  return tiff
}
