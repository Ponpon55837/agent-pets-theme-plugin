// Merges one catalog-entry.mjs entry into the catalog's index.json: a new
// plugin is added as a whole, a new version of a listed plugin goes first in
// its versions list and every other field is kept. Published versions are
// immutable, so a version the catalog already lists (by semver precedence,
// as the catalog validator matches them) is refused. The file is written in
// the catalog's own form (2-space indent, trailing newline), so the diff only
// adds lines.

/** The catalog validator's per-plugin cap (CATALOG_MAX_VERSIONS). */
export const CATALOG_MAX_VERSIONS = 20

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const FINGERPRINT = /^[0-9a-f]{16}$/
const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value)

/** { core: [major, minor, patch], pre: [identifiers] }, or null when not semver. Build metadata is dropped. */
export function parseSemver(version) {
  const match = typeof version === 'string' ? SEMVER.exec(version) : null
  if (!match) return null
  return { core: match.slice(1, 4).map(Number), pre: match[4] ? match[4].split('.') : [] }
}

function compareIdentifiers(a, b) {
  const numeric = [/^\d+$/.test(a), /^\d+$/.test(b)]
  if (numeric[0] && numeric[1]) return Math.sign(Number(a) - Number(b))
  if (numeric[0] !== numeric[1]) return numeric[0] ? -1 : 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** Semver precedence: -1, 0 or 1. Build metadata is ignored, so 1.0.0+x equals 1.0.0. Throws on a non-semver value. */
export function compareSemver(a, b) {
  const [left, right] = [parseSemver(a), parseSemver(b)]
  if (!left || !right) throw new Error(`not a semver version: ${JSON.stringify(left ? b : a)}`)
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return Math.sign(left.core[index] - right.core[index])
  }
  if (left.pre.length === 0 || right.pre.length === 0) return Math.sign(right.pre.length - left.pre.length)
  for (let index = 0; index < Math.min(left.pre.length, right.pre.length); index += 1) {
    const order = compareIdentifiers(left.pre[index], right.pre[index])
    if (order !== 0) return order
  }
  return Math.sign(left.pre.length - right.pre.length)
}

/** The catalog's file form. */
export function formatIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`
}

/**
 * Parses index.json and checks its outer shape. Refuses a file that is not
 * already in formatIndex form, because rewriting it would touch unrelated lines.
 */
export function parseIndex(text) {
  let index
  try {
    index = JSON.parse(text)
  } catch (error) {
    throw new Error(`index.json is not valid JSON: ${error.message}`)
  }
  if (!isObject(index) || index.schemaVersion !== 1 || !Array.isArray(index.plugins)) throw new Error('index.json needs schemaVersion 1 and a plugins array')
  if (formatIndex(index) !== text) throw new Error('index.json is not in its 2-space, trailing-newline form; rewriting it would change unrelated lines')
  return index
}

/** The plugin with `id`, or undefined. Throws when the catalog lists the id more than once. */
export function findPlugin(index, id) {
  const matches = index.plugins.filter(plugin => plugin?.id === id)
  if (matches.length > 1) throw new Error(`index.json lists ${id} ${matches.length} times`)
  return matches[0]
}

/** Throws when `plugin` already lists `version` (semver precedence) or a newer one. */
export function assertVersionIsNew(plugin, version) {
  const listed = Array.isArray(plugin?.versions) ? plugin.versions : []
  for (const published of listed) {
    if (parseSemver(published?.version) === null) throw new Error(`${plugin.id} lists a non-semver version ${JSON.stringify(published?.version)}`)
    const order = compareSemver(version, published.version)
    if (order === 0) throw new Error(`${plugin.id} ${published.version} is already published; published versions are immutable, raise the version`)
    if (order < 0) throw new Error(`${plugin.id} ${version} is older than the published ${published.version}`)
  }
}

function checkEntry(entry) {
  if (!isObject(entry) || typeof entry.id !== 'string' || entry.id === '') throw new Error('the entry needs an id')
  if (!FINGERPRINT.test(entry.publicKeyFingerprint ?? '')) throw new Error('the entry needs a 16-hex publicKeyFingerprint')
  if (!Array.isArray(entry.versions) || entry.versions.length !== 1 || !isObject(entry.versions[0])) throw new Error('the entry needs exactly one version')
  if (!parseSemver(entry.versions[0].version)) throw new Error('the entry version is not semver')
}

/**
 * Returns { index, added } with `entry` (one plugin, one version, as printed
 * by catalog-entry.mjs) merged in; `index` is not modified. `added` is
 * 'plugin' or 'version'. Throws on a duplicate or older version, a changed
 * signing key (a rotation is a hand-written pull request) or a full versions list.
 */
export function mergeCatalogEntry(index, entry) {
  checkEntry(entry)
  const [version] = entry.versions
  const existing = findPlugin(index, entry.id)
  if (!existing) return { index: { ...index, plugins: [...index.plugins, structuredClone(entry)] }, added: 'plugin' }

  if (existing.publicKeyFingerprint !== entry.publicKeyFingerprint) {
    throw new Error(`${entry.id} is listed with key ${existing.publicKeyFingerprint ?? '(none)'}, the archive is signed by ${entry.publicKeyFingerprint}; a key change needs a reviewed pull request`)
  }
  assertVersionIsNew(existing, version.version)
  if (existing.versions.length >= CATALOG_MAX_VERSIONS) throw new Error(`${entry.id} already lists ${CATALOG_MAX_VERSIONS} versions, the catalog maximum; remove an old one by hand first`)
  const plugin = { ...existing, versions: [structuredClone(version), ...existing.versions] }
  return { index: { ...index, plugins: index.plugins.map(item => (item === existing ? plugin : item)) }, added: 'version' }
}
