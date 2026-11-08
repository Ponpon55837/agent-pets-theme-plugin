// Package-level validation: manifest root fields (workerless panel-theme
// plugin), referenced and unreferenced assets, extension allowlist and size
// caps. Shared by validate, build, sign and verify.

import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { checkFont, checkPackagedImage } from './images.mjs'
import { appImageProblem, normalizeRelativePath, parseLocalizedText, validatePanelThemes } from './rules/panel-themes.mjs'
import { SIGNATURE_FILE } from './signature.mjs'

export const PACKAGE_LIMITS = Object.freeze({
  maxFiles: 64,
  maxTotalBytes: 25 * 1024 * 1024,
  maxManifestBytes: 256 * 1024,
  maxOtherFileBytes: 5 * 1024 * 1024,
})
/** Stricter than the app on purpose: this package is data only. */
export const ALLOWED_EXTENSIONS = ['.json', '.png', '.webp', '.woff2']

const PLUGIN_ID = /^(?!_host$|_shared$)[a-z0-9-]{3,48}$/
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const ROOT_KEYS = ['id', 'name', 'version', 'apiVersion', 'author', 'entry', 'icon', 'permissions', 'contributes']

const UTF8 = new TextDecoder('utf-8', { fatal: true })

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value)
const extensionOf = path => {
  const dot = path.lastIndexOf('.')
  return dot < 0 ? '' : path.slice(dot).toLowerCase()
}

/** Reads every file under `root` into Map<package-relative path, Buffer>. Refuses symlinks. */
export function collectFiles(root) {
  const files = new Map()
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name)
      const stat = lstatSync(full)
      const path = relative(root, full).split(sep).join('/')
      if (stat.isSymbolicLink()) throw new Error(`${path}: symbolic links are not allowed in the package`)
      if (stat.isDirectory()) walk(full)
      else if (stat.isFile()) files.set(path, readFileSync(full))
      else throw new Error(`${path}: not a regular file`)
    }
  }
  walk(root)
  return files
}

function checkManifestRoot(manifest, errors) {
  for (const key of Object.keys(manifest)) if (!ROOT_KEYS.includes(key)) errors.push(`${key}: unknown manifest field`)
  if (typeof manifest.id !== 'string' || !PLUGIN_ID.test(manifest.id)) errors.push('id: must be 3-48 lowercase letters, digits or -')
  if (!parseLocalizedText(manifest.name, 48)) errors.push('name: needs zh-TW and en-US, 1-48 characters each')
  if (typeof manifest.version !== 'string' || !SEMVER.test(manifest.version)) errors.push('version: must be major.minor.patch without leading zeroes')
  if (manifest.apiVersion !== '1') errors.push('apiVersion: must be "1"')
  if (typeof manifest.author !== 'string' || manifest.author.trim().length === 0 || manifest.author.length > 64) errors.push('author: must be 1-64 characters')
  if (manifest.entry !== undefined) errors.push('entry: this is a workerless theme package; remove entry')
  if (manifest.icon !== undefined && !normalizeRelativePath(manifest.icon, ['.png', '.webp'])) errors.push('icon: must be a safe relative .png or .webp path')
  if (!isRecord(manifest.permissions) || Object.keys(manifest.permissions).length > 0) errors.push('permissions: a workerless plugin must declare permissions {}')
  if (!isRecord(manifest.contributes)) errors.push('contributes: must be an object')
  else {
    for (const key of Object.keys(manifest.contributes)) {
      if (key !== 'panelThemes') errors.push(`contributes.${key}: this package only contributes panelThemes (workerless)`)
    }
    if (manifest.contributes.panelThemes === undefined) errors.push('contributes.panelThemes: is required')
  }
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

  const manifestBytes = files.get('plugin.json')
  if (!manifestBytes) return { ok: false, errors: [...errors, 'plugin.json: missing at the package root'], warnings, themes: [], totalBytes, fileCount: files.size }
  if (manifestBytes.length > PACKAGE_LIMITS.maxManifestBytes) errors.push('plugin.json: larger than 256 KB')
  let manifest
  try {
    manifest = JSON.parse(UTF8.decode(manifestBytes))
  } catch (error) {
    return { ok: false, errors: [...errors, `plugin.json: invalid UTF-8 JSON (${error.message})`], warnings, themes: [], totalBytes, fileCount: files.size }
  }
  if (!isRecord(manifest)) return { ok: false, errors: [...errors, 'plugin.json: must be an object'], warnings, themes: [], totalBytes, fileCount: files.size }
  checkManifestRoot(manifest, errors)

  const themeResult = validatePanelThemes(manifest.contributes?.panelThemes)
  errors.push(...themeResult.errors)

  const images = new Set(themeResult.images)
  const fonts = new Set(themeResult.fontFiles)
  const icon = typeof manifest.icon === 'string' ? normalizeRelativePath(manifest.icon, ['.png', '.webp']) : null
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
    const extension = extensionOf(path)
    if (extension === '.woff2' && !fonts.has(path)) errors.push(`${path}: font is not referenced by any fonts[].src`)
    if ((extension === '.png' || extension === '.webp') && !referenced.has(path)) warnings.push(`${path}: image is not referenced by the manifest`)
    if (extension === '.json' && path !== 'plugin.json' && path !== SIGNATURE_FILE) {
      try {
        JSON.parse(UTF8.decode(bytes))
      } catch {
        errors.push(`${path}: invalid UTF-8 JSON`)
      }
    }
    if (!['.png', '.webp', '.woff2'].includes(extension) && bytes.length > PACKAGE_LIMITS.maxOtherFileBytes) errors.push(`${path}: larger than 5 MiB`)
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
