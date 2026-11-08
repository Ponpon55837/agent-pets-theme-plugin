// Merges one catalog-entry.ts entry into the catalog's index.json: a new
// plugin is added as a whole, a new version of a listed plugin goes first in
// its versions list and every other field is kept. Published versions are
// immutable, so a version the catalog already lists (by semver precedence,
// as the catalog validator matches them) is refused. The file is written in
// the catalog's own form (2-space indent, trailing newline), so the diff only
// adds lines.

import type { CatalogEntry } from './catalog.ts'
import { readRegularFile } from './files.ts'

/** The catalog validator's index.json limit. */
export const CATALOG_MAX_BYTES = 1024 * 1024
/** The catalog validator's per-plugin cap (CATALOG_MAX_VERSIONS). */
export const CATALOG_MAX_VERSIONS = 20
/** The catalog validator reads at most this many characters of a version. */
const SEMVER_MAX_LENGTH = 100

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const NUMERIC = /^\d+$/
const FINGERPRINT = /^[0-9a-f]{16}$/
type UnknownRecord = Record<string, unknown>
const isObject = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A catalog plugin as index.json lists it; only the fields the merge reads are typed. */
export interface CatalogPlugin extends UnknownRecord {
  id?: unknown
  publicKeyFingerprint?: unknown
  versions?: unknown
}

export interface CatalogIndex extends UnknownRecord {
  schemaVersion: 1
  plugins: CatalogPlugin[]
}

export interface Semver {
  core: bigint[]
  pre: string[]
}

/**
 * { core: [major, minor, patch] as BigInt, pre: [identifiers] }, or null when
 * not semver (as the catalog validator reads it: at most 100 characters, no
 * leading zero in a numeric pre-release identifier). Build metadata is dropped.
 */
export function parseSemver(version: unknown): Semver | null {
  const match = typeof version === 'string' && version.length <= SEMVER_MAX_LENGTH ? SEMVER.exec(version) : null
  if (!match) return null
  const pre = match[4] ? match[4].split('.') : []
  if (pre.some(part => NUMERIC.test(part) && part.length > 1 && part.startsWith('0'))) return null
  return { core: match.slice(1, 4).map(BigInt), pre }
}

const sign = <T extends bigint | number | string>(a: T, b: T): number => (a < b ? -1 : a > b ? 1 : 0)

function compareIdentifiers(a: string, b: string): number {
  const [left, right] = [NUMERIC.test(a), NUMERIC.test(b)]
  if (left && right) return sign(BigInt(a), BigInt(b))
  if (left !== right) return left ? -1 : 1
  return sign(a, b)
}

/** Semver precedence: -1, 0 or 1. Build metadata is ignored, so 1.0.0+x equals 1.0.0. Throws on a non-semver value. */
export function compareSemver(a: string, b: string): number {
  const [left, right] = [parseSemver(a), parseSemver(b)]
  if (!left || !right) throw new Error(`not a semver version: ${JSON.stringify(left ? b : a)}`)
  return compareParsed(left, right)
}

/** Precedence of two already parsed versions, so a caller comparing one version with many parses it once. */
function compareParsed(left: Semver, right: Semver): number {
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return sign(left.core[index], right.core[index])
  }
  if (left.pre.length === 0 || right.pre.length === 0) return sign(right.pre.length, left.pre.length)
  for (let index = 0; index < Math.min(left.pre.length, right.pre.length); index += 1) {
    const order = compareIdentifiers(left.pre[index], right.pre[index])
    if (order !== 0) return order
  }
  return sign(left.pre.length, right.pre.length)
}

/** The catalog's file form. */
export function formatIndex(index: unknown): string {
  return `${JSON.stringify(index, null, 2)}\n`
}

/**
 * Parses index.json and checks its outer shape. Refuses a file that is not
 * already in formatIndex form, because rewriting it would touch unrelated lines.
 */
export function parseIndex(text: string): CatalogIndex {
  let index: unknown
  try {
    index = JSON.parse(text)
  } catch (error) {
    throw new Error(`index.json is not valid JSON: ${(error as Error).message}`)
  }
  if (!isObject(index) || index.schemaVersion !== 1 || !Array.isArray(index.plugins)) throw new Error('index.json needs schemaVersion 1 and a plugins array')
  if (formatIndex(index) !== text) throw new Error('index.json is not in its 2-space, trailing-newline form; rewriting it would change unrelated lines')
  return index as CatalogIndex
}

/** Reads and parses an index.json file (bounded, no symbolic link). */
export function readIndex(path: string): CatalogIndex {
  return parseIndex(readRegularFile(path, CATALOG_MAX_BYTES, 'index.json').bytes.toString('utf8'))
}

/** The plugin with `id`, or undefined. Throws when the catalog lists the id more than once. */
export function findPlugin(index: CatalogIndex, id: string): CatalogPlugin | undefined {
  const matches = index.plugins.filter(plugin => plugin?.id === id)
  if (matches.length > 1) throw new Error(`index.json lists ${id} ${matches.length} times`)
  return matches[0]
}

/** Throws when `plugin` already lists `version` (semver precedence) or a newer one. */
export function assertVersionIsNew(plugin: CatalogPlugin | undefined, version: string): void {
  const listed: unknown[] = Array.isArray(plugin?.versions) ? plugin.versions : []
  const candidate = parseSemver(version)
  for (const item of listed) {
    const published = isObject(item) ? item : undefined
    const parsed = parseSemver(published?.version)
    if (parsed === null || !published) throw new Error(`${plugin?.id} lists a non-semver version ${JSON.stringify(published?.version)}`)
    if (candidate === null) throw new Error(`not a semver version: ${JSON.stringify(version)}`)
    const order = compareParsed(candidate, parsed)
    if (order === 0) throw new Error(`${plugin?.id} ${published.version} is already published; published versions are immutable, raise the version`)
    if (order < 0) throw new Error(`${plugin?.id} ${version} is older than the published ${published.version}`)
  }
}

function checkEntry(entry: unknown): asserts entry is CatalogEntry {
  if (!isObject(entry) || typeof entry.id !== 'string' || entry.id === '') throw new Error('the entry needs an id')
  if (typeof entry.publicKeyFingerprint !== 'string' || !FINGERPRINT.test(entry.publicKeyFingerprint)) throw new Error('the entry needs a 16-hex publicKeyFingerprint')
  if (!Array.isArray(entry.versions) || entry.versions.length !== 1 || !isObject(entry.versions[0])) throw new Error('the entry needs exactly one version')
  if (!parseSemver(entry.versions[0].version)) throw new Error('the entry version is not semver')
}

/**
 * Returns { index, added } with `entry` (one plugin, one version, as printed
 * by catalog-entry.ts) merged in; `index` is not modified. `added` is
 * 'plugin' or 'version'. Throws on a duplicate or older version, a changed
 * signing key (a rotation is a hand-written pull request) or a full versions list.
 */
export function mergeCatalogEntry(index: CatalogIndex, entry: CatalogEntry): { index: CatalogIndex, added: 'plugin' | 'version' } {
  checkEntry(entry)
  const [version] = entry.versions
  const existing = findPlugin(index, entry.id)
  if (!existing) return { index: { ...index, plugins: [...index.plugins, structuredClone(entry) as unknown as CatalogPlugin] }, added: 'plugin' }

  if (existing.publicKeyFingerprint !== entry.publicKeyFingerprint) {
    throw new Error(`${entry.id} is listed with key ${JSON.stringify(existing.publicKeyFingerprint ?? null)}, the archive is signed by ${entry.publicKeyFingerprint}; a key change needs a reviewed pull request`)
  }
  assertVersionIsNew(existing, version.version)
  if (!Array.isArray(existing.versions)) throw new Error(`${entry.id} has no versions list in index.json`)
  if (existing.versions.length >= CATALOG_MAX_VERSIONS) throw new Error(`${entry.id} already lists ${CATALOG_MAX_VERSIONS} versions, the catalog maximum; remove an old one by hand first`)
  const plugin: CatalogPlugin = { ...existing, versions: [structuredClone(version), ...existing.versions] }
  return { index: { ...index, plugins: index.plugins.map(item => (item === existing ? plugin : item)) }, added: 'version' }
}
