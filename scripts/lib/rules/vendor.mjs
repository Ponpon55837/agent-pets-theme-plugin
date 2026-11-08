// The pin for the vendored app validator (scripts/lib/rules/app/): which app
// commit it was copied from and the SHA-256 of every file at that commit.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256Hex } from '../signature.mjs'

export const RULES_DIR = dirname(fileURLToPath(import.meta.url))
export const VENDOR_FILE = resolve(RULES_DIR, 'vendor.json')

// Fixed shapes, so an edited vendor.json cannot point a sync outside app/ or electron/.
const LOCAL_PATH = /^app\/[a-z0-9-]+\.ts$/
const SOURCE_PATH = /^electron\/[a-z0-9-]+\.ts$/

export function readVendorManifest() {
  const manifest = JSON.parse(readFileSync(VENDOR_FILE, 'utf8'))
  if (typeof manifest.repository !== 'string' || !/^[0-9a-f]{40}$/.test(manifest.commit ?? '') || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('vendor.json: needs repository, a 40-hex commit and files')
  }
  for (const file of manifest.files) {
    if (!LOCAL_PATH.test(file.path) || !SOURCE_PATH.test(file.source) || !/^[0-9a-f]{64}$/.test(file.sha256)) {
      throw new Error(`vendor.json: bad entry ${JSON.stringify(file)}`)
    }
  }
  return manifest
}

/** Vendored files whose bytes no longer match the recorded SHA-256 (local edits). */
export function vendoredDrift(manifest = readVendorManifest()) {
  return manifest.files
    .filter(file => sha256Hex(readFileSync(resolve(RULES_DIR, file.path))) !== file.sha256)
    .map(file => `${file.path}: SHA-256 differs from vendor.json`)
}
