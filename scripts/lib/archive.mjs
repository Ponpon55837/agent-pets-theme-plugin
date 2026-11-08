// Loads a built .agentpet-plugin for verify and catalog-entry: a bounded,
// no-follow read, the strict ZIP reader, the package rules and the signature.

import { readRegularFile } from './files.mjs'
import { PACKAGE_LIMITS, validatePackage } from './package.mjs'
import { sha256Hex, verifySignature } from './signature.mjs'
import { readZip } from './zip.mjs'

/**
 * Returns { bytes, sha256, files, result, signature }. Throws on an unreadable,
 * oversized or malformed archive; package-rule and signature verdicts are
 * returned for the caller to report.
 */
export function loadArchive(path) {
  const { bytes } = readRegularFile(path, PACKAGE_LIMITS.maxTotalBytes, 'archive')
  let files
  try {
    files = readZip(bytes, { maxEntries: PACKAGE_LIMITS.maxFiles, maxTotalBytes: PACKAGE_LIMITS.maxTotalBytes })
  } catch (error) {
    throw new Error(`invalid archive: ${error.message}`)
  }
  const result = validatePackage(files, { allowSignature: true })
  return { bytes, sha256: sha256Hex(bytes), files, result, signature: result.ok ? verifySignature(files) : null }
}
