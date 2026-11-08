// The catalog index.json entry for a signed archive, built to the field rules
// of the app's catalog parser (electron/plugin-catalog.ts): exact key sets,
// trimmed control-free text, an allowed https host, ISO 8601 publishedAt.

import type { LoadedArchive } from './archive.ts'
import { archiveName } from './build.ts'
import { PACKAGE_LIMITS } from './package.ts'

/** Agent Pets 1.12.0 is the first app that accepts contributes.panelThemes. */
export const MIN_APP_VERSION = '1.12.0'
export const HOMEPAGE = 'https://github.com/Ponpon55837/agent-pets-theme-plugin'
export const PACKAGE_BASE_URL = 'https://raw.githubusercontent.com/Ponpon55837/agent-pets-plugins/main/packages/'
const DESCRIPTION = {
  'zh-TW': '可自訂面板顏色、字型與背景的主題（含淺色與深色）。',
  'en-US': 'Panel themes with colours, fonts and backgrounds for light and dark modes.',
}

/** The app's publishedAt pattern. */
export const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

// The app's catalog cleanText: 1-max characters, already trimmed, no control characters.
const isCleanText = (value: unknown, max: number): boolean => typeof value === 'string' && value.length > 0 && value.length <= max
  && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value)
const isCleanLocalized = (value: unknown, max: number): boolean => {
  const text = value as Record<string, unknown> | null | undefined
  return isCleanText(text?.['zh-TW'], max) && isCleanText(text?.['en-US'], max)
}

/** Catalog text rules the manifest text must also meet: [field, passes(entry), message]. */
export interface CatalogVersion {
  version: string
  apiVersion: string
  minAppVersion: string
  url: string
  sha256: string
  size: number
  publishedAt: string
}

export interface CatalogEntry {
  id: string
  name: unknown
  description: { 'zh-TW': string, 'en-US': string }
  author: unknown
  homepage: string
  publicKeyFingerprint: string
  versions: CatalogVersion[]
}

const TEXT_RULES: ReadonlyArray<readonly [string, (entry: CatalogEntry) => boolean, string]> = [
  ['name', entry => isCleanLocalized(entry.name, 48), 'needs zh-TW and en-US of 1-48 trimmed characters'],
  ['description', entry => isCleanLocalized(entry.description, 200), 'needs zh-TW and en-US of 1-200 trimmed characters'],
  ['author', entry => isCleanText(entry.author, 64), 'must be 1-64 trimmed characters'],
]

/** Parses --published-at with the app's ISO 8601 pattern; null when invalid. */
export function parsePublishedAt(value: string): Date | null {
  if (!ISO_8601.test(value)) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Builds the entry from a loaded, validly signed archive (see loadArchive).
 * Throws when a field would make the app's parser drop the entry.
 */
export function catalogEntry({ bytes, sha256, result, signature }: Pick<LoadedArchive, 'bytes' | 'sha256' | 'result' | 'signature'>, publishedAt: Date): CatalogEntry {
  const { manifest } = result
  if (!signature?.valid) throw new Error('the archive must carry a valid signature')
  if (!result.ok || !manifest) throw new Error('the archive must pass the package rules')
  if (bytes.length < 1 || bytes.length > PACKAGE_LIMITS.maxTotalBytes) throw new Error(`size must be 1-${PACKAGE_LIMITS.maxTotalBytes} bytes`)
  const entry: CatalogEntry = {
    id: manifest.id,
    name: manifest.name,
    description: DESCRIPTION,
    author: manifest.author,
    homepage: HOMEPAGE,
    publicKeyFingerprint: signature.fingerprint,
    versions: [{
      version: manifest.version,
      apiVersion: manifest.apiVersion,
      minAppVersion: MIN_APP_VERSION,
      url: `${PACKAGE_BASE_URL}${archiveName(manifest)}`,
      sha256,
      size: bytes.length,
      publishedAt: publishedAt.toISOString(),
    }],
  }
  const problems = TEXT_RULES.filter(([, passes]) => !passes(entry)).map(([key, , message]) => `${key}: ${message}`)
  if (!ISO_8601.test(entry.versions[0].publishedAt)) problems.push('publishedAt: must be a four-digit-year ISO 8601 time')
  if (problems.length > 0) throw new Error(`the catalog would drop this entry:\n  ${problems.join('\n  ')}`)
  return entry
}
