import type { PluginLocalizedText } from './plugin.ts'

// 主程序 <-> 面板渲染端之間的插件面板主題共用契約。主程序
// 建構每個值；渲染端在呼叫 style.setProperty 之前，會以下方的 pattern
// 重新驗證名稱與值（spec §3、§7.3）。

export type PanelThemeMode = 'light' | 'dark'
export type PanelThemeFit = 'cover' | 'contain' | 'tile'
export type PanelThemePosition =
  | 'center' | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export const PANEL_THEME_MODES: readonly PanelThemeMode[] = ['light', 'dark']
export const PANEL_THEME_FITS: readonly PanelThemeFit[] = ['cover', 'contain', 'tile']
export const PANEL_THEME_POSITIONS: readonly PanelThemePosition[] = [
  'center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right',
]
export const PANEL_THEME_USER_BLURS = [0, 8, 16, 24] as const
export type PanelThemeUserBlur = typeof PANEL_THEME_USER_BLURS[number]

/** 31 個可套主題的顏色屬性，依表格順序（spec §3.2、§16.2）。 */
export const PANEL_THEME_COLOR_PROPERTIES = [
  '--organic-bg', '--organic-surface', '--organic-surface-2', '--organic-surface-warm', '--organic-surface-sage',
  '--organic-surface-sage-soft', '--organic-surface-off', '--organic-text', '--organic-text-secondary',
  '--organic-text-muted', '--organic-text-faint', '--organic-accent', '--organic-accent-hover',
  '--organic-accent-text', '--organic-accent-contrast', '--organic-accent-glow', '--organic-accent-track',
  '--organic-accent-on-hover', '--organic-sage', '--organic-sage-deep', '--organic-sage-dark',
  '--organic-sage-track', '--organic-border', '--organic-border-soft',
  '--organic-danger-text', '--organic-success-text', '--organic-warn-text', '--organic-scrim',
  '--organic-info-text', '--organic-shadow', '--organic-highlight',
] as const
export type PanelThemeColorProperty = typeof PANEL_THEME_COLOR_PROPERTIES[number]

/**
 * manifest 顏色鍵 → 可套主題的 CSS 屬性（與主程序 PANEL_THEME_COLOR_TOKENS 相同，測試比對）。
 * 主題編輯器以此把目錄裡的屬性對應回可編輯的鍵，或把草稿畫成預覽。
 */
export const PANEL_THEME_COLOR_KEY_PROPERTIES = {
  bg: '--organic-bg', surface: '--organic-surface', surface2: '--organic-surface-2', surfaceWarm: '--organic-surface-warm',
  surfaceSage: '--organic-surface-sage', surfaceSageSoft: '--organic-surface-sage-soft', surfaceOff: '--organic-surface-off',
  text: '--organic-text', textSecondary: '--organic-text-secondary', textMuted: '--organic-text-muted', textFaint: '--organic-text-faint',
  accent: '--organic-accent', accentHover: '--organic-accent-hover', accentText: '--organic-accent-text', onAccent: '--organic-accent-contrast',
  accentGlow: '--organic-accent-glow', accentTrack: '--organic-accent-track', accentOnHover: '--organic-accent-on-hover',
  sage: '--organic-sage', sageDeep: '--organic-sage-deep', sageDark: '--organic-sage-dark', sageTrack: '--organic-sage-track',
  border: '--organic-border', borderSoft: '--organic-border-soft',
  dangerText: '--organic-danger-text', successText: '--organic-success-text', warnText: '--organic-warn-text', scrim: '--organic-scrim',
  infoText: '--organic-info-text', shadow: '--organic-shadow', highlight: '--organic-highlight',
} as const satisfies Record<import('./plugin').PluginPanelThemeColorKey, PanelThemeColorProperty>

export const PANEL_THEME_FAMILY_PROPERTIES = ['--organic-font-body', '--organic-font-heading'] as const
export const PANEL_THEME_SIZE_PROPERTIES = [
  '--organic-font-label', '--organic-font-body-sm', '--organic-font-body-md', '--organic-font-body-lg',
  '--organic-font-heading-sm', '--organic-font-heading-md', '--organic-font-panel-title',
  '--organic-font-display-sm', '--organic-font-display-md',
] as const
export const PANEL_THEME_RADIUS_PROPERTIES = ['--organic-radius-sm', '--organic-radius-md', '--organic-radius-lg'] as const
export const PANEL_THEME_BACKGROUND_PROPERTY = '--panel-theme-background'

/** 寵物狀態膠囊屬性（設在寵物視窗的 `.desktop-pet` 根元素上；只由 `.status-line` 讀取）。 */
export const PET_STATUS_PROPERTIES = [
  '--pet-status-background', '--pet-status-border', '--pet-status-text', '--pet-status-text-muted',
  '--pet-status-quota-fill', '--pet-status-quota-track', '--pet-status-quota-warn', '--pet-status-background-opaque',
] as const
export type PetStatusProperty = typeof PET_STATUS_PROPERTIES[number]

/**
 * 寵物視窗實際用到的色盤屬性（tokens.css 中寵物用到的衍生 token 只依賴這些；
 * tests/panel-theme-pet-status.test.mts 從 CSS 反推並比對）。主程序只送這些，
 * 不送字型、圓角、背景或面板專用的顏色。
 */
export const PET_THEME_COLOR_PROPERTIES = [
  '--organic-bg', '--organic-surface', '--organic-text', '--organic-text-secondary',
  '--organic-text-muted', '--organic-text-faint', '--organic-accent', '--organic-accent-hover', '--organic-accent-text',
  '--organic-accent-contrast', '--organic-sage', '--organic-sage-deep', '--organic-sage-dark', '--organic-border',
  '--organic-border-soft', '--organic-danger-text', '--organic-success-text', '--organic-warn-text',
  '--organic-info-text', '--organic-shadow', '--organic-highlight',
] as const satisfies readonly PanelThemeColorProperty[]
export type PetThemeColorProperty = typeof PET_THEME_COLOR_PROPERTIES[number]

/** 一個模式的寵物視窗主題：色盤子集，加上（選填的）狀態膠囊顏色。 */
export interface PetThemeModeState {
  colors: Record<PetThemeColorProperty, string>
  status: Record<PetStatusProperty, string> | null
}

/** 主程序送給寵物視窗的內容：各模式啟用中的主題，內建則為 null。 */
export interface PetThemeState {
  light: PetThemeModeState | null
  dark: PetThemeModeState | null
}

export type PanelThemeSharedProperty =
  | typeof PANEL_THEME_FAMILY_PROPERTIES[number]
  | typeof PANEL_THEME_SIZE_PROPERTIES[number]
  | typeof PANEL_THEME_RADIUS_PROPERTIES[number]

export type PanelThemeCssProperty = PanelThemeColorProperty | PanelThemeSharedProperty | typeof PANEL_THEME_BACKGROUND_PROPERTY

/** 渲染端可在 `.status-panel` / `.panel-theme-preview` 上設定的完整允許清單。 */
export const PANEL_THEME_CSS_PROPERTIES: readonly PanelThemeCssProperty[] = Object.freeze([
  ...PANEL_THEME_COLOR_PROPERTIES,
  ...PANEL_THEME_FAMILY_PROPERTIES,
  ...PANEL_THEME_SIZE_PROPERTIES,
  ...PANEL_THEME_RADIUS_PROPERTIES,
  PANEL_THEME_BACKGROUND_PROPERTY,
])

const CHANNEL = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)'
const ALPHA = '(?:0|1|0\\.\\d{0,2}[1-9])'
export const PANEL_THEME_RGB_PATTERN = new RegExp(`^rgb\\(${CHANNEL} ${CHANNEL} ${CHANNEL} \\/ ${ALPHA}\\)$`)
/** 主程序輸出的一筆字型族清單項目：加引號的名稱（主機別名為 `"apt-<16 hex>"`）或關鍵字。 */
export const PANEL_THEME_FAMILY_ENTRY_PATTERN = /^(?:"[A-Za-z0-9](?:[A-Za-z0-9 -]{0,46}[A-Za-z0-9])?"|serif|sans-serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-rounded|ui-monospace|-apple-system|BlinkMacSystemFont)$/
export const PANEL_THEME_PX_PATTERN = /^(?:\d|[1-9]\d)px$/
export const PANEL_THEME_ASSET_URL_PATTERN = /^agent-pets:\/\/panel-theme\/[0-9a-f]{32}$/
export const PANEL_THEME_FONT_ALIAS_PATTERN = /^apt-[0-9a-f]{16}$/

export interface PanelThemeRef {
  pluginId: string
  themeId: string
}

export type PanelThemeSlotStatus = 'builtin' | 'active' | 'unavailable'
export type PanelThemeUnavailableReason = 'plugin_disabled' | 'plugins_off' | 'theme_removed'

export interface PanelThemeSlotState {
  ref: PanelThemeRef | null
  status: PanelThemeSlotStatus
  reason?: PanelThemeUnavailableReason
}

export interface PanelThemeGradientStop {
  color: string
  at: number
}

export type PanelThemeBackgroundState =
  | { type: 'solid' }
  | { type: 'gradient'; kind: 'linear'; angle: number; stops: PanelThemeGradientStop[] }
  | { type: 'gradient'; kind: 'radial'; position: PanelThemePosition; stops: PanelThemeGradientStop[] }
  | {
      type: 'image'
      url: string
      fit: PanelThemeFit
      position: PanelThemePosition
      opacity: number
      blur: number
      overlay: { color: string; opacity: number }
    }

export interface PanelThemeUserImageCurrent {
  url: string
  fit: PanelThemeFit
  position: PanelThemePosition
  dim: number
  blur: PanelThemeUserBlur
  width: number
  height: number
}

export interface PanelThemeUserImageState {
  minDim: number
  defaultDim: number
  fit: PanelThemeFit
  overlayColor: string
  current?: PanelThemeUserImageCurrent
}

export interface PanelThemeModeState {
  properties: Record<PanelThemeColorProperty, string>
  petStatus?: Record<PetStatusProperty, string>
  background: PanelThemeBackgroundState
  userImage?: PanelThemeUserImageState
}

export interface PanelThemeFontState {
  alias: string
  url: string
  weight: 400 | 600 | 700
  style: 'normal' | 'italic'
}

export interface PanelThemeCatalogEntry {
  ref: PanelThemeRef
  pluginName: PluginLocalizedText
  displayName: PluginLocalizedText
  description?: PluginLocalizedText
  shared: {
    properties: Partial<Record<PanelThemeSharedProperty, string>>
    fonts: PanelThemeFontState[]
  }
  modes: Partial<Record<PanelThemeMode, PanelThemeModeState>>
}

export interface PanelThemeState {
  slots: Record<PanelThemeMode, PanelThemeSlotState>
  themes: PanelThemeCatalogEntry[]
  /** 每個模式完整的內建色盤（供 Settings 預覽使用）。 */
  builtin: Record<PanelThemeMode, Record<PanelThemeColorProperty, string>>
}

export interface PanelThemeUserImageOptions {
  fit: PanelThemeFit
  position: PanelThemePosition
  dim: number
  blur: PanelThemeUserBlur
}

/** 一筆持久化的使用者圖片（`userData/panel-theme.json`，spec §7.1）。 */
export interface PanelThemeStoredUserImage extends PanelThemeUserImageOptions {
  file: string
  type: 'image/png' | 'image/jpeg' | 'image/webp'
  width: number
  height: number
  bytes: number
  importedAt: string
}

export interface PanelThemeStoreData {
  version: 1
  slots: Record<PanelThemeMode, PanelThemeRef | null>
  userImages: Record<string, Record<string, Partial<Record<PanelThemeMode, PanelThemeStoredUserImage>>>>
}

export type PanelThemeIpcResult =
  | { ok: true; value: PanelThemeState }
  | { ok: false; error: import('./ipc').IpcErrorCode; cancelled?: boolean; reason?: 'animated' }

export function isPanelThemeMode(value: unknown): value is PanelThemeMode {
  return value === 'light' || value === 'dark'
}

export function isPanelThemeFit(value: unknown): value is PanelThemeFit {
  return typeof value === 'string' && (PANEL_THEME_FITS as readonly string[]).includes(value)
}

export function isPanelThemePosition(value: unknown): value is PanelThemePosition {
  return typeof value === 'string' && (PANEL_THEME_POSITIONS as readonly string[]).includes(value)
}
