// Package-level validation: manifest root fields (workerless panel-theme
// plugin), referenced and unreferenced assets, extension allowlist and size
// caps. Shared by validate, build, sign and verify.

import { lstatSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { readRegularFile } from './files.mjs'
import { checkFont, checkPackagedImage } from './images.mjs'
import { appImageProblem, normalizePlainText, normalizeRelativePath, parseLocalizedText, validatePanelThemes } from './rules/panel-themes.mjs'
import { SIGNATURE_FILE } from './signature.mjs'

export const PACKAGE_LIMITS = Object.freeze({
  maxFiles: 64,
  maxTotalBytes: 25 * 1024 * 1024,
  maxManifestBytes: 256 * 1024,
  maxOtherFileBytes: 5 * 1024 * 1024,
})
const IMAGE_EXTENSIONS = ['.png', '.webp']
const FONT_EXTENSION = '.woff2'
/** Stricter than the app on purpose: this package is data only. */
export const ALLOWED_EXTENSIONS = ['.json', ...IMAGE_EXTENSIONS, FONT_EXTENSION]

// Same patterns as the app's src/types/id-patterns.ts.
const PLUGIN_ID = /^[a-z0-9-]{3,48}$/
const SEMVER_CORE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

const UTF8 = new TextDecoder('utf-8', { fatal: true })

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value)
const extensionOf = path => {
  const dot = path.lastIndexOf('.')
  return dot < 0 ? '' : path.slice(dot).toLowerCase()
}

/**
 * Reads every file under `root` into Map<package-relative path, Buffer>.
 * Refuses symlinks and special files (each file is opened with O_NOFOLLOW, so
 * one swapped for a link after the directory scan is not followed either) and
 * stops as soon as the folder would exceed the file-count or total-size cap,
 * reading no file past the remaining budget. Directories count towards the
 * same entry budget, so a deep or wide tree of empty folders is bounded too.
 */
export function collectFiles(root, { maxFiles = PACKAGE_LIMITS.maxFiles, maxTotalBytes = PACKAGE_LIMITS.maxTotalBytes } = {}) {
  const files = new Map()
  let totalBytes = 0
  let directories = 0
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name)
      const stat = lstatSync(full)
      const path = relative(root, full).split(sep).join('/')
      if (stat.isSymbolicLink()) throw new Error(`${path}: symbolic links are not allowed in the package`)
      if (stat.isDirectory()) {
        directories += 1
        if (directories > maxFiles) throw new Error(`the package folder has more than ${maxFiles} directories`)
        walk(full)
      } else if (stat.isFile()) {
        if (files.size >= maxFiles) throw new Error(`the package has more than ${maxFiles} files`)
        const remaining = maxTotalBytes - totalBytes
        if (stat.size > remaining) throw new Error(`the package is larger than ${maxTotalBytes} bytes`)
        const { bytes } = readRegularFile(full, remaining, path)
        totalBytes += bytes.length
        files.set(path, bytes)
      } else throw new Error(`${path}: not a regular file`)
    }
  }
  walk(root)
  return files
}

const isPlainText = (value, maxLength) => normalizePlainText(value, maxLength) !== null
const isEmptyRecord = value => isRecord(value) && Object.keys(value).length === 0

/** Manifest root rules: [field, passes(manifest), message]. Text fields use the app's normalisation. */
const ROOT_RULES = [
  ['id', m => typeof m.id === 'string' && PLUGIN_ID.test(m.id), 'must be 3-48 lowercase letters, digits or -'],
  ['name', m => parseLocalizedText(m.name, 48) !== null, 'needs zh-TW and en-US, 1-48 characters each'],
  ['version', m => typeof m.version === 'string' && SEMVER_CORE.test(m.version), 'must be major.minor.patch without leading zeroes'],
  ['apiVersion', m => m.apiVersion === '1', 'must be "1"'],
  ['author', m => isPlainText(m.author, 64), 'must be 1-64 characters of plain text'],
  ['entry', m => m.entry === undefined, 'this is a workerless theme package; remove entry'],
  ['icon', m => m.icon === undefined || normalizeRelativePath(m.icon, IMAGE_EXTENSIONS) !== null, 'must be a safe relative .png or .webp path'],
  ['permissions', m => isEmptyRecord(m.permissions), 'a workerless plugin must declare permissions {}'],
  ['contributes', m => isRecord(m.contributes), 'must be an object'],
]
const ROOT_KEYS = ROOT_RULES.map(([key]) => key)

function checkManifestRoot(manifest, errors) {
  for (const key of Object.keys(manifest)) if (!ROOT_KEYS.includes(key)) errors.push(`${key}: unknown manifest field`)
  for (const [key, passes, message] of ROOT_RULES) if (!passes(manifest)) errors.push(`${key}: ${message}`)
  if (!isRecord(manifest.contributes)) return
  for (const key of Object.keys(manifest.contributes)) {
    if (key !== 'panelThemes') errors.push(`contributes.${key}: this package only contributes panelThemes (workerless)`)
  }
  if (manifest.contributes.panelThemes === undefined) errors.push('contributes.panelThemes: is required')
}

const unreferencedImage = (path, bytes, { referenced }) => (referenced.has(path) ? null : { warning: true, message: 'image is not referenced by the manifest' })
function otherJson(path, bytes) {
  if (path === 'plugin.json') return null
  if (bytes.length > PACKAGE_LIMITS.maxOtherFileBytes) return { message: 'larger than 5 MiB' }
  try {
    JSON.parse(UTF8.decode(bytes))
    return null
  } catch {
    return { message: 'invalid UTF-8 JSON' }
  }
}

/** Per-extension checks on every packaged file; images and fonts have their own size caps. */
const FILE_CHECKS = {
  '.json': otherJson,
  '.png': unreferencedImage,
  '.webp': unreferencedImage,
  [FONT_EXTENSION]: (path, bytes, { fonts }) => (fonts.has(path) ? null : { message: 'font is not referenced by any fonts[].src' }),
}

/**
 * Validates a package given as Map<path, bytes>. Returns
 * { ok, errors, warnings, manifest, themes, totalBytes, fileCount }.
 * `allowSignature` permits a root signature.json (archives); src/ must not have one.
 */
export function validatePackage(files, { allowSignature = false } = {}) {
  const errors = []
  const warnings = []
  let totalBytes = 0
  const seen = new Map()
  for (const [path, bytes] of files) {
    totalBytes += bytes.length
    if (path.normalize('NFC') !== path) errors.push(`${JSON.stringify(path)}: path must be in Unicode NFC form`)
    const key = path.normalize('NFC').toLowerCase()
    if (seen.has(key)) errors.push(`${path}: duplicates ${seen.get(key)} (paths are compared case-insensitively)`)
    else seen.set(key, path)
    if (path === SIGNATURE_FILE) {
      if (!allowSignature) errors.push(`${path}: remove it from src/; npm run sign adds it to the archive`)
      continue
    }
    if (!normalizeRelativePath(path, ALLOWED_EXTENSIONS)) {
      errors.push(`${path}: not allowed in the package (extensions ${ALLOWED_EXTENSIONS.join(' ')}, safe names only)`)
    }
  }
  if (files.size > PACKAGE_LIMITS.maxFiles) errors.push(`package has ${files.size} files > ${PACKAGE_LIMITS.maxFiles}`)
  if (totalBytes > PACKAGE_LIMITS.maxTotalBytes) errors.push(`package is ${totalBytes} bytes > 25 MiB`)

  const stop = message => ({ ok: false, errors: [...errors, message], warnings, themes: [], totalBytes, fileCount: files.size })
  const manifestBytes = files.get('plugin.json')
  if (!manifestBytes) return stop('plugin.json: missing at the package root')
  if (manifestBytes.length > PACKAGE_LIMITS.maxManifestBytes) return stop('plugin.json: larger than 256 KB')
  let manifest
  try {
    manifest = JSON.parse(UTF8.decode(manifestBytes))
  } catch (error) {
    return stop(`plugin.json: invalid UTF-8 JSON (${error.message})`)
  }
  if (!isRecord(manifest)) return stop('plugin.json: must be an object')
  checkManifestRoot(manifest, errors)

  const themeResult = validatePanelThemes(manifest.contributes?.panelThemes)
  errors.push(...themeResult.errors)

  const images = new Set(themeResult.images)
  const fonts = new Set(themeResult.fontFiles)
  const icon = typeof manifest.icon === 'string' ? normalizeRelativePath(manifest.icon, IMAGE_EXTENSIONS) : null
  const referenced = new Set(['plugin.json', ...images, ...fonts])
  if (icon) referenced.add(icon)

  for (const path of [...images, ...(icon ? [icon] : [])]) {
    const bytes = files.get(path)
    if (!bytes) {
      errors.push(`${path}: referenced but missing from the package`)
      continue
    }
    const { problems } = checkPackagedImage(bytes, extensionOf(path))
    for (const problem of problems) errors.push(`${path}: ${problem}`)
    // The app's own header check is the verdict; the lines above only explain it.
    const appProblem = problems.length === 0 && images.has(path) ? appImageProblem(bytes) : null
    if (appProblem) errors.push(`${path}: rejected by the app's image check (${appProblem})`)
  }
  for (const path of fonts) {
    const bytes = files.get(path)
    if (!bytes) errors.push(`${path}: referenced but missing from the package`)
    else for (const problem of checkFont(bytes)) errors.push(`${path}: ${problem}`)
  }
  for (const [path, bytes] of files) {
    if (path === SIGNATURE_FILE) continue
    const check = FILE_CHECKS[extensionOf(path)]
    const problem = check?.(path, bytes, { fonts, referenced })
    if (problem) (problem.warning ? warnings : errors).push(`${path}: ${problem.message}`)
  }

  return { ok: errors.length === 0, errors, warnings, manifest, themes: themeResult.themes, totalBytes, fileCount: files.size }
}

/** Human-readable per-theme, per-mode summary lines for a validation result. */
export function describeThemes(result) {
  const lines = []
  for (const theme of result.themes) {
    lines.push(`${theme.id}  scale ${theme.scale}  radii ${theme.radii.radiusSm}/${theme.radii.radiusMd}/${theme.radii.radiusLg}`)
    for (const [mode, report] of Object.entries(theme.modes)) {
      const parts = [`  ${mode.padEnd(5)} ${report.background.padEnd(8)}`, `bg L ${report.bgLuminance.toFixed(3)}`, `pet pill ${report.petStatus ? 'themed' : 'derived'}`]
      if (report.imageOverlay) parts.push(`image overlay ${report.imageOverlay.declared} (min ${report.imageOverlay.minimum?.toFixed(2)})`)
      if (report.userImageOverlay) parts.push(`user image dim ${report.userImageOverlay.declared} (min ${report.userImageOverlay.minimum.toFixed(2)})`)
      if (report.deprecated) parts.push(`ignored: ${report.deprecated.join(', ')}`)
      lines.push(parts.join('  '))
    }
  }
  return lines
}
