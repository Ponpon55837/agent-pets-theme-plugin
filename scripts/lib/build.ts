// Builds the .agentpet-plugin archive from the package folder.

import type { KeyObject } from 'node:crypto'
import { collectFiles, validatePackage, type Manifest, type PackageResult } from './package.ts'
import { createSignatureFile, sha256Hex, SIGNATURE_FILE, type SignatureFile } from './signature.ts'
import { writeZip } from './zip.ts'

export class ValidationError extends Error {
  readonly result: PackageResult

  constructor(result: PackageResult) {
    super(`package validation failed:\n  ${result.errors.join('\n  ')}`)
    this.result = result
  }
}

export function archiveName(manifest: Pick<Manifest, 'id' | 'version'>): string {
  return `${manifest.id}-${manifest.version}.agentpet-plugin`
}

/**
 * Validates `srcDir` and returns { bytes, files, result, signature? }.
 * With a privateKey, signature.json is computed over the exact files and added.
 */
/** A validated package: `result.manifest` is present. */
export type ValidPackage = PackageResult & { ok: true, manifest: Manifest }

export interface BuiltArchive {
  bytes: Buffer
  files: Map<string, Buffer>
  result: ValidPackage
  signature?: SignatureFile
}

export function buildArchive(srcDir: string, { privateKey }: { privateKey?: KeyObject } = {}): BuiltArchive {
  const files = collectFiles(srcDir)
  const result = validatePackage(files)
  if (!result.ok || !result.manifest) throw new ValidationError(result)
  let signature: SignatureFile | undefined
  if (privateKey) {
    signature = createSignatureFile(files, privateKey)
    files.set(SIGNATURE_FILE, signature.bytes)
  }
  return { bytes: writeZip(files), files, result: result as ValidPackage, signature }
}

/** The files / size / sha256 lines that build and sign print for a written archive. */
export function archiveSummary({ bytes, files }: { bytes: Uint8Array, files: ReadonlyMap<string, unknown> }): string[] {
  return [
    `files:       ${files.size}`,
    `size:        ${bytes.length} bytes`,
    `sha256:      ${sha256Hex(bytes)}`,
  ]
}
