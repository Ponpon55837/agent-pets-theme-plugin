// The pin for the vendored app validator (scripts/lib/rules/app/ and the
// type modules under scripts/lib/rules/src/types/): which app commit it was
// copied from and the SHA-256 of every file at that commit.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256Hex } from '../signature.ts'

export const RULES_DIR = dirname(fileURLToPath(import.meta.url))
export const VENDOR_FILE = resolve(RULES_DIR, 'vendor.json')

export interface VendoredFile {
  /** Path under scripts/lib/rules/. */
  path: string
  /** Path in the app repository. */
  source: string
  sha256: string
}

export interface VendorManifest {
  repository: string
  licence?: string
  commit: string
  files: VendoredFile[]
}

// Fixed shapes, so an edited vendor.json cannot point a sync anywhere else: the
// validator modules (app/ from electron/) and the type modules they import
// (src/types/, at the same relative path as in the app, so `../src/types/x.ts`
// resolves unchanged). All but pet-atlas.ts (the sprite grid constants) are
// type-only: erased at run time, read only by tsc.
const LOCAL_PATH = /^(?:app|src\/types)\/[a-z0-9-]+\.ts$/
const SOURCE_PATH = /^(?:electron|src\/types)\/[a-z0-9-]+\.ts$/
const SHA256 = /^[0-9a-f]{64}$/
const COMMIT = /^[0-9a-f]{40}$/

/** app/x.ts comes from electron/x.ts; src/types/x.ts from the same path. */
const pairs = (file: VendoredFile): boolean => (file.path.startsWith('app/')
  ? file.source === `electron/${file.path.slice('app/'.length)}`
  : file.path === file.source)

function isVendoredFile(value: unknown): value is VendoredFile {
  if (typeof value !== 'object' || value === null) return false
  const file = value as Record<string, unknown>
  return typeof file.path === 'string' && typeof file.source === 'string' && typeof file.sha256 === 'string'
    && LOCAL_PATH.test(file.path) && SOURCE_PATH.test(file.source) && SHA256.test(file.sha256) && pairs(file as unknown as VendoredFile)
}

export function readVendorManifest(): VendorManifest {
  const manifest = JSON.parse(readFileSync(VENDOR_FILE, 'utf8')) as Partial<VendorManifest> | null
  if (typeof manifest?.repository !== 'string' || !COMMIT.test(manifest.commit ?? '') || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('vendor.json: needs repository, a 40-hex commit and files')
  }
  const seen = new Set<string>()
  for (const file of manifest.files as unknown[]) {
    if (!isVendoredFile(file)) throw new Error(`vendor.json: bad entry ${JSON.stringify(file)}`)
    if (seen.has(file.path)) throw new Error(`vendor.json: ${file.path} is listed twice`)
    seen.add(file.path)
  }
  return manifest as VendorManifest
}

/** Vendored files whose bytes no longer match the recorded SHA-256 (local edits). */
export function vendoredDrift(manifest: VendorManifest = readVendorManifest()): string[] {
  return manifest.files
    .filter(file => sha256Hex(readFileSync(resolve(RULES_DIR, file.path))) !== file.sha256)
    .map(file => `${file.path}: SHA-256 differs from vendor.json`)
}
