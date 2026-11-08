// Adapter over the vendored app validator (./app/, pinned in vendor.json).
//
// The verdict is always the app's own `parsePanelThemes`: a manifest passes here
// exactly when Agent Pets 1.12.0 accepts it, with the same first diagnostic.
// Authors also get every other semantic issue per mode from the app's ordered
// check table (`panelThemeModeIssues`, what the theme editor lists), so one run
// shows all the colours to fix. Nothing here re-implements a rule.

import {
  PANEL_THEME_MAX_THEMES,
  PanelThemeValidationError,
  checkPanelThemePackagedImage,
  minimumPanelThemeOverlay,
  normalizePanelThemeAssetPath,
  normalizePanelThemePlainText,
  panelThemeAssetPaths,
  panelThemeModeCheckInput,
  panelThemeModeIssues,
  parsePanelThemes,
  type PanelThemeModeCheckInput,
  type PanelThemeParseResult,
  type ResolvedPanelThemeMode,
} from './app/plugin-panel-themes.ts'
import { relativeLuminance } from './app/panel-theme-color.ts'
import type { PanelThemeMode } from './src/types/panel-theme.ts'

export {
  builtinPanelThemeColors,
  isWoff2,
  PANEL_THEME_FONT_MAX_BYTES,
  PANEL_THEME_IMAGE_MAX_BYTES,
  PANEL_THEME_IMAGE_MAX_PIXELS,
  PANEL_THEME_IMAGE_MAX_SIDE,
  PANEL_THEME_IMAGE_MIN_SIDE,
} from './app/plugin-panel-themes.ts'
export { contrastRatio, formatPanelThemeColor, parsePanelThemeColor } from './app/panel-theme-color.ts'

type UnknownRecord = Record<string, unknown>

const MODES: readonly PanelThemeMode[] = ['light', 'dark']
const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null && !Array.isArray(value)
/** Same bound as the app's diagnostics, so a listed issue and the verdict compare equal. */
const bounded = (text: string): string => new PanelThemeValidationError(text).diagnostic

/** Per-mode summary of a theme that passed, as `describeThemes` prints it. */
export interface ModeReport {
  background: ResolvedPanelThemeMode['background']['type']
  bgLuminance: number
  petStatus: boolean
  imageOverlay?: { declared: number, minimum: number | null }
  userImageOverlay?: { declared: number, minimum: number }
  deprecated?: string[]
}

export interface ThemeReport {
  id: string
  scale: number
  radii: { radiusSm: number, radiusMd: number, radiusLg: number }
  modes: Partial<Record<PanelThemeMode, ModeReport>>
}

export interface PanelThemesResult {
  ok: boolean
  errors: string[]
  themes: ThemeReport[]
  fontFiles: string[]
  images: string[]
}

/** Same rules as the app's normalizeRelativePath (plugin-manifest.ts). */
export const normalizeRelativePath = normalizePanelThemeAssetPath
/** Same rules as the app's normalizePlainText (plugin-manifest.ts): NFKC, no control characters or angle brackets. */
export const normalizePlainText = normalizePanelThemePlainText

/** Mirrors the app's parseLocalizedText(value, max): exactly zh-TW and en-US. */
export function parseLocalizedText(value: unknown, maxLength: number): { 'zh-TW': string, 'en-US': string } | null {
  if (!isRecord(value) || Object.keys(value).some(key => key !== 'zh-TW' && key !== 'en-US')) return null
  const zhTW = normalizePlainText(value['zh-TW'], maxLength)
  const enUS = normalizePlainText(value['en-US'], maxLength)
  return zhTW && enUS ? { 'zh-TW': zhTW, 'en-US': enUS } : null
}

function diagnosticOf(run: () => void): string | null {
  try {
    run()
    return null
  } catch (error) {
    if (error instanceof PanelThemeValidationError) return error.diagnostic
    throw error
  }
}

/** Every issue of one raw theme: its first app diagnostic, then each mode's full issue list. */
function* themeIssues(theme: unknown): Generator<string> {
  const first = diagnosticOf(() => parsePanelThemes([theme]))
  if (first === null) return
  yield first
  if (!isRecord(theme) || typeof theme.id !== 'string' || !isRecord(theme.modes)) return
  for (const mode of MODES) {
    if (theme.modes[mode] === undefined) continue
    const modes = theme.modes
    let input: PanelThemeModeCheckInput | undefined
    const grammar = diagnosticOf(() => { input = panelThemeModeCheckInput(modes[mode], mode) })
    if (grammar !== null || input === undefined) {
      yield bounded(`${theme.id}.${grammar}`)
      continue
    }
    for (const issue of panelThemeModeIssues(input)) yield bounded(`${theme.id}.${mode}.${issue.path}: ${issue.problem}`)
  }
}

/** Asset paths named by raw themes, for package checks when the themes do not parse. */
function declaredAssetPaths(themes: unknown): { fonts: Set<string>, images: Set<string> } {
  const fonts = new Set<string>()
  const images = new Set<string>()
  for (const theme of Array.isArray(themes) ? themes : []) {
    if (!isRecord(theme)) continue
    for (const face of Array.isArray(theme.fonts) ? theme.fonts : []) {
      const src = isRecord(face) ? normalizePanelThemeAssetPath(face.src, ['.woff2']) : null
      if (src) fonts.add(src)
    }
    for (const mode of isRecord(theme.modes) ? Object.values(theme.modes) : []) {
      const src = isRecord(mode) && isRecord(mode.background) && mode.background.type === 'image' ? normalizePanelThemeAssetPath(mode.background.src, ['.png', '.webp']) : null
      if (src) images.add(src)
    }
  }
  return { fonts, images }
}

function modeReport(resolved: ResolvedPanelThemeMode, declared: unknown): ModeReport {
  const report: ModeReport = {
    background: resolved.background.type,
    bgLuminance: relativeLuminance(resolved.colors.bg),
    petStatus: Boolean(resolved.petStatus),
  }
  if (resolved.background.type === 'image') {
    const { overlay, opacity } = resolved.background
    report.imageOverlay = { declared: overlay.opacity, minimum: minimumPanelThemeOverlay(resolved.colors, overlay.color, opacity) }
  }
  if (resolved.userImage) report.userImageOverlay = { declared: resolved.userImage.defaultDim, minimum: resolved.userImage.minDim }
  if (isRecord(declared) && isRecord(declared.colors) && Object.hasOwn(declared.colors, 'borderOnAccent')) report.deprecated = ['borderOnAccent']
  return report
}

/**
 * Validates a `contributes.panelThemes` value with the app's validator. Returns
 * { ok, errors, themes, fontFiles, images }: `errors` starts with the app's
 * diagnostic and lists every further issue once; `themes` are per-mode reports.
 */
export function validatePanelThemes(value: unknown): PanelThemesResult {
  let parsed: PanelThemeParseResult | null = null
  const verdict = diagnosticOf(() => { parsed = parsePanelThemes(value) })
  if (verdict === null && parsed !== null) {
    const { contributions, themes: resolved } = parsed as PanelThemeParseResult
    const raw = value as UnknownRecord[]
    const assets = panelThemeAssetPaths(contributions)
    const themes = resolved.map((theme, index): ThemeReport => ({
      id: theme.id,
      scale: theme.typography.scale,
      radii: theme.shape,
      modes: Object.fromEntries(MODES.flatMap(mode => {
        const resolvedMode = theme.modes[mode]
        return resolvedMode ? [[mode, modeReport(resolvedMode, (raw[index].modes as UnknownRecord)[mode])]] : []
      })),
    }))
    return { ok: true, errors: [], themes, fontFiles: [...assets.fonts].sort(), images: [...assets.images].sort() }
  }
  const errors = new Set<string>(verdict === null ? [] : [verdict])
  // Past the theme cap the verdict is the count; listing thousands of themes would only cost time.
  if (Array.isArray(value) && value.length <= PANEL_THEME_MAX_THEMES) for (const theme of value) for (const issue of themeIssues(theme)) errors.add(issue)
  const assets = declaredAssetPaths(value)
  return { ok: false, errors: [...errors], themes: [], fontFiles: [...assets.fonts].sort(), images: [...assets.images].sort() }
}

/** The app's packaged-image verdict (type, size, animation, orientation), or null when it passes. */
export function appImageProblem(bytes: Uint8Array): string | null {
  const result = checkPanelThemePackagedImage(bytes)
  return result.ok ? null : result.error
}
