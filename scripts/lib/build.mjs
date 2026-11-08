// Builds the .agentpet-plugin archive from the package folder.

import { collectFiles, validatePackage } from './package.mjs'
import { createSignatureFile, sha256Hex, SIGNATURE_FILE } from './signature.mjs'
import { writeZip } from './zip.mjs'

export class ValidationError extends Error {
  constructor(result) {
    super(`package validation failed:\n  ${result.errors.join('\n  ')}`)
    this.result = result
  }
}

export function archiveName(manifest) {
  return `${manifest.id}-${manifest.version}.agentpet-plugin`
}

/**
 * Validates `srcDir` and returns { bytes, files, result, signature? }.
 * With a privateKey, signature.json is computed over the exact files and added.
 */
export function buildArchive(srcDir, { privateKey } = {}) {
  const files = collectFiles(srcDir)
  const result = validatePackage(files)
  if (!result.ok) throw new ValidationError(result)
  let signature
  if (privateKey) {
    signature = createSignatureFile(files, privateKey)
    files.set(SIGNATURE_FILE, signature.bytes)
  }
  return { bytes: writeZip(files), files, result, signature }
}

/** The files / size / sha256 lines that build and sign print for a written archive. */
export function archiveSummary({ bytes, files }) {
  return [
    `files:       ${files.size}`,
    `size:        ${bytes.length} bytes`,
    `sha256:      ${sha256Hex(bytes)}`,
  ]
}
