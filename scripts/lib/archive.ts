// Loads a built .agentpet-plugin for verify and catalog-entry: a bounded,
// no-follow read, the strict ZIP reader, the package rules and the signature.

import { readRegularFile } from './files.ts'
import { PACKAGE_LIMITS, validatePackage, type PackageResult } from './package.ts'
import { sha256Hex, verifySignature, type SignatureCheck } from './signature.ts'
import { readZip } from './zip.ts'

/**
 * Returns { bytes, sha256, files, result, signature }. Throws on an unreadable,
 * oversized or malformed archive; package-rule and signature verdicts are
 * returned for the caller to report.
 */
export interface LoadedArchive {
  bytes: Buffer
  sha256: string
  files: Map<string, Buffer>
  result: PackageResult
  /** null when the package rules failed (the signature is not checked then). */
  signature: SignatureCheck | null
}

export function loadArchive(path: string): LoadedArchive {
  const { bytes } = readRegularFile(path, PACKAGE_LIMITS.maxTotalBytes, 'archive')
  let files: Map<string, Buffer>
  try {
    files = readZip(bytes, { maxEntries: PACKAGE_LIMITS.maxFiles, maxTotalBytes: PACKAGE_LIMITS.maxTotalBytes })
  } catch (error) {
    throw new Error(`invalid archive: ${(error as Error).message}`)
  }
  const result = validatePackage(files, { allowSignature: true })
  return { bytes, sha256: sha256Hex(bytes), files, result, signature: result.ok ? verifySignature(files) : null }
}
