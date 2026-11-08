// `contributes.panelThemes` rules: field grammar, token derivation and
// contrast, as written in the Plugin Panel Theme Contract (Agent Pets 1.12.0,
// §2.2, §3, §4.1, §6). Pure: no file system access. The app's runtime
// validator is authoritative; this copy exists so authors find problems before
// packaging.

import { BLACK, ColorError, WHITE, contrast, formatColor, luminance, mix, parseColor, withAlpha } from './color.mjs'

export const THEME_ID = /^[a-z0-9-]{1,32}$/
export const FONT_ID = /^[a-z0-9-]{1,32}$/
const LOCAL_FAMILY = /^[A-Za-z0-9](?:[A-Za-z0-9 -]{0,46}[A-Za-z0-9])?$/
const FONT_REF = /^@([a-z0-9-]{1,32})$/
export const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-rounded', 'ui-monospace'])
export const POSITIONS = new Set(['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'])
export const FITS = new Set(['cover', 'contain', 'tile'])
export const MODES = ['light', 'dark']

export const LIMITS = Object.freeze({
  themesMin: 1,
  themesMax: 8,
  fontFacesPerTheme: 4,
  fontFilesPerPlugin: 8,
  imagesPerPlugin: 16,
  stopsMin: 2,
  stopsMax: 5,
  overlayMin: 0.5,
  overlayMax: 0.95,
})

const REQUIRED_COLORS = ['bg', 'surface', 'surface2', 'text', 'textSecondary', 'textMuted', 'accent', 'accentText', 'onAccent', 'border']

// key -> { opaque, alpha range for translucent tokens, kind: R(equired) | D(erived) | B(uilt-in) }
const COLOR_TOKENS = {
  bg: { kind: 'R', opaque: true },
  surface: { kind: 'R', opaque: true },
  surface2: { kind: 'R', opaque: true },
  surfaceWarm: { kind: 'D', opaque: true },
  surfaceSage: { kind: 'D', opaque: true },
  surfaceSageSoft: { kind: 'D', opaque: true },
  surfaceOff: { kind: 'D', opaque: true },
  text: { kind: 'R', opaque: true },
  textSecondary: { kind: 'R', opaque: true },
  textMuted: { kind: 'R', opaque: true },
  textFaint: { kind: 'D', opaque: true },
  accent: { kind: 'R', opaque: true },
  accentHover: { kind: 'D', opaque: true },
  accentText: { kind: 'R', opaque: true },
  onAccent: { kind: 'R', opaque: true },
  accentGlow: { kind: 'D', alpha: [0.02, 0.95] },
  accentTrack: { kind: 'D', alpha: [0.02, 0.95] },
  accentOnHover: { kind: 'D', alpha: [0.02, 0.95] },
  sage: { kind: 'B', opaque: true },
  sageDeep: { kind: 'B', opaque: true },
  sageDark: { kind: 'B', opaque: true },
  sageTrack: { kind: 'D', alpha: [0.02, 0.95] },
  border: { kind: 'R', alpha: [0.08, 1] },
  borderSoft: { kind: 'D', alpha: [0.02, 0.95] },
  borderOnAccent: { kind: 'D', alpha: [0.02, 0.95] },
  dangerText: { kind: 'B', opaque: true },
  successText: { kind: 'B', opaque: true },
  warnText: { kind: 'B', opaque: true },
  scrim: { kind: 'B', alpha: [0.3, 0.9] },
}
export const COLOR_KEYS = Object.keys(COLOR_TOKENS)

/** Built-in values for "B" tokens (tokens.css, Agent Pets 1.11.x). */
export const BUILTIN = {
  light: { sage: '#7a8a5e', sageDeep: '#56633f', sageDark: '#3d472b', dangerText: '#a62f1e', successText: '#3f5a1c', warnText: '#7a5200', scrim: 'rgba(46,43,37,.42)' },
  dark: { sage: '#9db07b', sageDeep: '#aebf8c', sageDark: '#c9d6ad', dangerText: '#ff9a8a', successText: '#b6d48a', warnText: '#f0c866', scrim: 'rgba(0,0,0,.55)' },
}

/**
 * The complete built-in palettes (tokens.css, Agent Pets 1.11.x, spec §3.2),
 * used as a regression fixture: they must pass these rules. The "D" tokens are
 * given explicitly because the built-in accentHover is not the derived value;
 * deriving it (mix(accent, text, 0.2)) gives onAccent/accentHover 4.43:1 in light mode.
 */
export const BUILTIN_PALETTES = {
  light: {
    bg: '#f5ead8', surface: '#f9f4ed', surface2: '#eee7db', surfaceWarm: '#ffe1d0', surfaceSage: '#e1eecc', surfaceSageSoft: '#f0fae1', surfaceOff: '#dcd3c4',
    text: '#201e1d', textSecondary: '#645c50', textMuted: '#6b6354', textFaint: '#8a8070',
    accent: '#c67139', accentHover: '#a85a28', accentText: '#8c491a', onAccent: '#fff2eb',
    accentGlow: 'rgba(198,113,57,.2)', accentTrack: 'rgba(32,30,29,.08)', accentOnHover: 'rgba(32,30,29,.05)',
    sage: '#7a8a5e', sageDeep: '#56633f', sageDark: '#3d472b', sageTrack: 'rgba(61,71,43,.16)',
    border: 'rgba(32,30,29,.16)', borderSoft: 'rgba(32,30,29,.1)', borderOnAccent: 'rgba(255,242,235,.55)',
    dangerText: '#a62f1e', successText: '#3f5a1c', warnText: '#7a5200', scrim: 'rgba(46,43,37,.42)',
  },
  dark: {
    bg: '#1f1b16', surface: '#292420', surface2: '#342e28', surfaceWarm: '#4a3022', surfaceSage: '#2e3622', surfaceSageSoft: '#263019', surfaceOff: '#3f372e',
    text: '#f3ede4', textSecondary: '#cfc5b6', textMuted: '#b0a592', textFaint: '#8d8374',
    accent: '#d98652', accentHover: '#e39a6b', accentText: '#f0b48a', onAccent: '#201e1d',
    accentGlow: 'rgba(217,134,82,.28)', accentTrack: 'rgba(243,237,228,.1)', accentOnHover: 'rgba(243,237,228,.06)',
    sage: '#9db07b', sageDeep: '#aebf8c', sageDark: '#c9d6ad', sageTrack: 'rgba(201,214,173,.18)',
    border: 'rgba(243,237,228,.18)', borderSoft: 'rgba(243,237,228,.1)', borderOnAccent: 'rgba(32,30,29,.4)',
    dangerText: '#ff9a8a', successText: '#b6d48a', warnText: '#f0c866', scrim: 'rgba(0,0,0,.55)',
  },
}

const RADIUS = { radiusSm: { max: 16, fallback: 8 }, radiusMd: { max: 24, fallback: 16 }, radiusLg: { max: 32, fallback: 28 } }
const FONT_SIZES = { label: 12, bodySm: 12, bodyMd: 13, bodyLg: 15, headingSm: 15, headingMd: 18, panelTitle: 18, displaySm: 22, displayMd: 22 }

const TEXT_MIN = 4.5
const UI_MIN = 3

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value)
const isNumber = value => typeof value === 'number' && Number.isFinite(value)

function decimalsAtMost(value, places) {
  const scaled = value * 10 ** places
  return Math.abs(scaled - Math.round(scaled)) < 1e-9
}

class Collector {
  constructor() {
    this.errors = []
    this.warnings = []
  }

  error(path, message) {
    this.errors.push(`${path}: ${message}`)
  }

  warn(path, message) {
    this.warnings.push(`${path}: ${message}`)
  }

  onlyKeys(path, value, allowed) {
    const extra = Object.keys(value).filter(key => !allowed.includes(key))
    for (const key of extra) this.error(`${path}.${key}`, 'unknown key')
    return extra.length === 0
  }
}

/** Same rules as the app's normalizeRelativePath (plugin-manifest.ts). */
export function normalizeRelativePath(value, extensions) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return null
  const normalized = value.normalize('NFC')
  if (normalized.startsWith('/')
    || normalized.includes('\\')
    || normalized.includes('..')
    || normalized.includes(':')
    || /[\u0000-\u001f\u007f<>"|?*]/.test(normalized)) return null
  const segments = normalized.split('/')
  if (segments.some(segment => segment.length === 0 || segment === '.' || /[. ]$/.test(segment))) return null
  if (segments.some(segment => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(segment))) return null
  const suffix = `.${normalized.split('.').at(-1)?.toLowerCase() ?? ''}`
  return extensions.includes(suffix) ? normalized : null
}

/** Mirrors the app's parseLocalizedText(value, max). */
export function parseLocalizedText(value, maxLength) {
  if (!isRecord(value)) return null
  if (Object.keys(value).some(key => key !== 'zh-TW' && key !== 'en-US')) return null
  const out = {}
  for (const locale of ['zh-TW', 'en-US']) {
    const raw = value[locale]
    if (typeof raw !== 'string') return null
    const text = raw.normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim()
    if (text.length === 0 || text.length > maxLength) return null
    out[locale] = text
  }
  return out
}

function readColor(c, path, value) {
  try {
    return parseColor(value)
  } catch (error) {
    if (error instanceof ColorError) {
      c.error(path, `${error.message} (${error.code})`)
      return null
    }
    throw error
  }
}

function readOverlay(c, path, value) {
  if (!isRecord(value)) {
    c.error(path, 'must be an object { color, opacity }')
    return null
  }
  c.onlyKeys(path, value, ['color', 'opacity'])
  const color = readColor(c, `${path}.color`, value.color)
  if (color && color.a !== 1) c.error(`${path}.color`, 'overlay colour must be opaque')
  if (!isNumber(value.opacity) || value.opacity < LIMITS.overlayMin || value.opacity > LIMITS.overlayMax) {
    c.error(`${path}.opacity`, `must be a number ${LIMITS.overlayMin}-${LIMITS.overlayMax}`)
    return null
  }
  return color ? { color, opacity: value.opacity } : null
}

function readEnum(c, path, value, allowed, fallback) {
  if (value === undefined) return fallback
  if (!allowed.has(value)) {
    c.error(path, `must be one of ${[...allowed].join(', ')}`)
    return fallback
  }
  return value
}

function readBackground(c, path, value) {
  if (value === undefined) return { type: 'solid' }
  if (!isRecord(value)) {
    c.error(path, 'must be an object')
    return null
  }
  switch (value.type) {
    case 'solid':
      c.onlyKeys(path, value, ['type'])
      return { type: 'solid' }
    case 'gradient':
      return readGradient(c, path, value)
    case 'image':
      return readImageBackground(c, path, value)
    default:
      c.error(`${path}.type`, 'must be solid, gradient or image')
      return null
  }
}

function readGradient(c, path, value) {
  let angle = 180
  let position = 'center'
  if (value.kind === 'linear') {
    c.onlyKeys(path, value, ['type', 'kind', 'angle', 'stops'])
    if (value.angle !== undefined) {
      if (!Number.isInteger(value.angle) || value.angle < 0 || value.angle > 359) c.error(`${path}.angle`, 'must be an integer 0-359')
      else angle = value.angle
    }
  } else if (value.kind === 'radial') {
    c.onlyKeys(path, value, ['type', 'kind', 'position', 'stops'])
    position = readEnum(c, `${path}.position`, value.position, POSITIONS, 'center')
  } else {
    c.error(`${path}.kind`, 'must be linear or radial')
    return null
  }
  if (!Array.isArray(value.stops) || value.stops.length < LIMITS.stopsMin || value.stops.length > LIMITS.stopsMax) {
    c.error(`${path}.stops`, `must be an array of ${LIMITS.stopsMin}-${LIMITS.stopsMax} stops`)
    return null
  }
  const stops = []
  let previous = -1
  value.stops.forEach((stop, index) => {
    const stopPath = `${path}.stops[${index}]`
    if (!isRecord(stop)) {
      c.error(stopPath, 'must be { color, at }')
      return
    }
    c.onlyKeys(stopPath, stop, ['color', 'at'])
    const color = readColor(c, `${stopPath}.color`, stop.color)
    if (color && color.a !== 1) c.error(`${stopPath}.color`, 'gradient stops must be opaque')
    if (!Number.isInteger(stop.at) || stop.at < 0 || stop.at > 100) {
      c.error(`${stopPath}.at`, 'must be an integer 0-100')
      return
    }
    if (stop.at < previous) c.error(`${stopPath}.at`, 'stop positions must be non-decreasing')
    previous = stop.at
    if (color) stops.push({ color, at: stop.at })
  })
  if (stops.length !== value.stops.length) return null
  return value.kind === 'linear'
    ? { type: 'gradient', kind: 'linear', angle, stops }
    : { type: 'gradient', kind: 'radial', position, stops }
}

function readImageBackground(c, path, value) {
  c.onlyKeys(path, value, ['type', 'src', 'fit', 'position', 'opacity', 'blur', 'overlay'])
  const src = normalizeRelativePath(value.src, ['.png', '.webp'])
  if (!src) c.error(`${path}.src`, 'must be a safe package-relative .png or .webp path')
  const fit = readEnum(c, `${path}.fit`, value.fit, FITS, 'cover')
  const position = readEnum(c, `${path}.position`, value.position, POSITIONS, 'center')
  let opacity = 1
  if (value.opacity !== undefined) {
    if (!isNumber(value.opacity) || value.opacity < 0.2 || value.opacity > 1) c.error(`${path}.opacity`, 'must be a number 0.2-1')
    else opacity = value.opacity
  }
  let blur = 0
  if (value.blur !== undefined) {
    if (!Number.isInteger(value.blur) || value.blur < 0 || value.blur > 24) c.error(`${path}.blur`, 'must be an integer 0-24')
    else blur = value.blur
  }
  const overlay = readOverlay(c, `${path}.overlay`, value.overlay)
  if (!src || !overlay) return null
  return { type: 'image', src, fit, position, opacity, blur, overlay }
}

function readUserImage(c, path, value) {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    c.error(path, 'must be an object')
    return null
  }
  c.onlyKeys(path, value, ['allowed', 'fit', 'overlay'])
  if (value.allowed !== true) c.error(`${path}.allowed`, 'must be true (omit userImage to disallow)')
  const fit = readEnum(c, `${path}.fit`, value.fit, FITS, 'cover')
  const overlay = readOverlay(c, `${path}.overlay`, value.overlay)
  return overlay && value.allowed === true ? { fit, overlay } : null
}

/** Resolves all 29 colour tokens for a mode (§3.5). Returns null if a required colour is unusable. */
export function resolveColors(c, path, colors, mode) {
  if (!isRecord(colors)) {
    c.error(path, 'is required and must be an object')
    return null
  }
  c.onlyKeys(path, colors, COLOR_KEYS)
  for (const key of REQUIRED_COLORS) {
    if (colors[key] === undefined) c.error(`${path}.${key}`, 'is required')
  }
  const parsed = {}
  for (const key of COLOR_KEYS) {
    if (colors[key] !== undefined) {
      const color = readColor(c, `${path}.${key}`, colors[key])
      if (color) parsed[key] = color
    }
  }
  if (REQUIRED_COLORS.some(key => !parsed[key])) return null
  for (const [key, value] of Object.entries(BUILTIN[mode])) {
    if (!parsed[key] && colors[key] === undefined) parsed[key] = parseColor(value)
  }
  if (Object.keys(BUILTIN[mode]).some(key => !parsed[key])) return null

  const p = parsed
  const derived = {
    surfaceWarm: () => mix(p.surface, p.accent, 0.18),
    surfaceSage: () => mix(p.surface, p.sage, 0.18),
    surfaceSageSoft: () => mix(p.surface, p.sage, 0.08),
    surfaceOff: () => mix(p.surface2, p.text, 0.12),
    textFaint: () => p.textMuted,
    accentHover: () => mix(p.accent, p.text, 0.2),
    accentGlow: () => withAlpha(p.accent, 0.22),
    accentTrack: () => withAlpha(p.text, 0.08),
    accentOnHover: () => withAlpha(p.text, 0.05),
    sageTrack: () => withAlpha(p.sageDark, 0.16),
    borderSoft: () => withAlpha(p.border, Math.round(p.border.a * 0.625 * 1000) / 1000),
    borderOnAccent: () => withAlpha(p.onAccent, 0.55),
  }
  for (const [key, derive] of Object.entries(derived)) {
    if (!p[key] && colors[key] === undefined) p[key] = derive()
  }
  if (COLOR_KEYS.some(key => !p[key])) return null

  for (const [key, rule] of Object.entries(COLOR_TOKENS)) {
    const alpha = p[key].a
    if (rule.opaque && alpha !== 1) c.error(`${path}.${key}`, 'must be opaque (alpha 1)')
    if (rule.alpha && (alpha < rule.alpha[0] || alpha > rule.alpha[1])) {
      c.error(`${path}.${key}`, `alpha must be ${rule.alpha[0]}-${rule.alpha[1]}, got ${alpha}`)
    }
  }
  return p
}

function imageBackdrops(bg, overlayColor, overlayOpacity, imageOpacity) {
  return [BLACK, WHITE].map((k, index) => {
    const pk = {
      r: imageOpacity * k.r + (1 - imageOpacity) * bg.r,
      g: imageOpacity * k.g + (1 - imageOpacity) * bg.g,
      b: imageOpacity * k.b + (1 - imageOpacity) * bg.b,
    }
    return {
      label: index === 0 ? 'darkest image pixel' : 'lightest image pixel',
      color: {
        r: overlayOpacity * overlayColor.r + (1 - overlayOpacity) * pk.r,
        g: overlayOpacity * overlayColor.g + (1 - overlayOpacity) * pk.g,
        b: overlayOpacity * overlayColor.b + (1 - overlayOpacity) * pk.b,
        a: 1,
      },
    }
  })
}

/** Backdrop set of a background (§6.1). */
export function backdropsOf(bg, background) {
  const list = [{ label: 'bg', color: bg }]
  if (background.type === 'gradient') {
    background.stops.forEach((stop, index) => list.push({ label: `stop ${index}`, color: stop.color }))
    for (let index = 0; index + 1 < background.stops.length; index += 1) {
      for (const t of [0.25, 0.5, 0.75]) {
        list.push({ label: `stops ${index}-${index + 1} at ${t}`, color: mix(background.stops[index].color, background.stops[index + 1].color, t) })
      }
    }
  } else if (background.type === 'image') {
    list.push(...imageBackdrops(bg, background.overlay.color, background.overlay.opacity, background.opacity))
  }
  return list
}

function backdropPairs(colors, backdrops) {
  const pairs = []
  for (const backdrop of backdrops) {
    for (const key of ['text', 'textSecondary', 'textMuted', 'accentText']) pairs.push({ fg: key, bg: backdrop.label, fgColor: colors[key], bgColor: backdrop.color, min: TEXT_MIN })
    pairs.push({ fg: 'accent', bg: backdrop.label, fgColor: colors.accent, bgColor: backdrop.color, min: UI_MIN })
  }
  return pairs
}

function surfacePairs(colors) {
  const pairs = []
  const add = (fg, bg, min) => pairs.push({ fg, bg, fgColor: colors[fg], bgColor: colors[bg], min })
  for (const surface of ['surface', 'surface2']) {
    for (const key of ['text', 'textSecondary', 'textMuted', 'dangerText', 'successText', 'warnText']) add(key, surface, TEXT_MIN)
  }
  add('accentText', 'surface', TEXT_MIN)
  add('accentText', 'surfaceWarm', TEXT_MIN)
  add('text', 'surfaceWarm', TEXT_MIN)
  add('text', 'surfaceSage', TEXT_MIN)
  add('textFaint', 'surface', UI_MIN)
  add('accent', 'surface', UI_MIN)
  add('onAccent', 'accentHover', TEXT_MIN)
  add('onAccent', 'accent', UI_MIN)
  return pairs
}

function evaluate(pairs) {
  return pairs.map(pair => ({ ...pair, ratio: contrast(pair.fgColor, pair.bgColor) }))
}

const passes = results => results.every(result => result.ratio >= result.min)

/** Smallest overlay opacity in 0.50..0.95 (0.01 steps) at which every backdrop pair passes, or null. */
export function minOverlay(colors, overlayColor, imageOpacity) {
  for (let step = 50; step <= 95; step += 1) {
    const a = step / 100
    const backdrops = [{ label: 'bg', color: colors.bg }, ...imageBackdrops(colors.bg, overlayColor, a, imageOpacity)]
    if (passes(evaluate(backdropPairs(colors, backdrops)))) return a
  }
  return null
}

function checkMode(c, path, modeName, value) {
  if (!isRecord(value)) {
    c.error(path, 'must be an object')
    return null
  }
  c.onlyKeys(path, value, ['colors', 'background', 'userImage'])
  const colors = resolveColors(c, `${path}.colors`, value.colors, modeName)
  const background = readBackground(c, `${path}.background`, value.background)
  const userImage = readUserImage(c, `${path}.userImage`, value.userImage)
  if (!colors || !background || userImage === null) return null

  const bgLum = luminance(colors.bg)
  const textLum = luminance(colors.text)
  if (modeName === 'light') {
    if (!(textLum < bgLum)) c.error(`${path}.colors.text`, 'light mode text must be darker than bg')
    if (bgLum < 0.45) c.error(`${path}.colors.bg`, `light mode bg luminance ${bgLum.toFixed(3)} < 0.45`)
  } else {
    if (!(textLum > bgLum)) c.error(`${path}.colors.text`, 'dark mode text must be lighter than bg')
    if (bgLum > 0.12) c.error(`${path}.colors.bg`, `dark mode bg luminance ${bgLum.toFixed(3)} > 0.12`)
  }

  const report = { mode: modeName, bgLuminance: bgLum, background, userImage, colors }
  let backdrops = backdropsOf(colors.bg, background)
  if (background.type === 'image') {
    const min = minOverlay(colors, background.overlay.color, background.opacity)
    report.imageMinOverlay = min
    if (min === null) c.error(`${path}.background.overlay`, 'no overlay opacity from 0.50 to 0.95 makes every backdrop pair pass')
    else if (background.overlay.opacity < min) c.error(`${path}.background.overlay.opacity`, `${background.overlay.opacity} is below the minimum ${min}`)
  }
  if (userImage) {
    const min = minOverlay(colors, userImage.overlay.color, 1)
    report.userImageMinOverlay = min
    if (min === null) c.error(`${path}.userImage.overlay`, 'no overlay opacity from 0.50 to 0.95 makes every backdrop pair pass')
    else if (userImage.overlay.opacity < min) c.error(`${path}.userImage.overlay.opacity`, `${userImage.overlay.opacity} is below the minimum ${min}`)
    backdrops = backdrops.concat(imageBackdrops(colors.bg, userImage.overlay.color, userImage.overlay.opacity, 1)
      .map(entry => ({ ...entry, label: `user image ${entry.label}` })))
  }

  const results = evaluate([...backdropPairs(colors, backdrops), ...surfacePairs(colors)])
  for (const result of results) {
    if (result.ratio < result.min) {
      c.error(`${path}.colors.${result.fg}`, `${result.ratio.toFixed(2)}:1 < ${result.min}:1 on ${result.bg}`)
    }
  }
  report.pairs = results.length
  report.worst = results.reduce((worst, result) => (result.ratio / result.min < worst.ratio / worst.min ? result : worst))
  report.worstText = results.filter(r => r.min === TEXT_MIN).reduce((w, r) => (r.ratio < w.ratio ? r : w))
  report.worstUi = results.filter(r => r.min === UI_MIN).reduce((w, r) => (r.ratio < w.ratio ? r : w))
  report.properties = Object.fromEntries(COLOR_KEYS.map(key => [key, formatColor(colors[key])]))
  return report
}

function readFamilyList(c, path, value, fontIds) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) {
    c.error(path, 'must be an array of 1-5 family names')
    return null
  }
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`
    if (typeof entry !== 'string') {
      c.error(entryPath, 'must be a string')
      return
    }
    const ref = FONT_REF.exec(entry)
    if (ref) {
      if (!fontIds.has(ref[1])) c.error(entryPath, `@${ref[1]} is not declared in this theme's fonts`)
    } else if (!LOCAL_FAMILY.test(entry)) {
      c.error(entryPath, 'family names use letters, digits, spaces and hyphens only (1-48 chars)')
    }
  })
  if (!GENERIC_FAMILIES.has(value.at(-1))) c.error(`${path}[${value.length - 1}]`, `last entry must be a generic family (${[...GENERIC_FAMILIES].join(', ')})`)
  return value
}

function checkTheme(c, path, theme) {
  if (!isRecord(theme)) {
    c.error(path, 'must be an object')
    return null
  }
  c.onlyKeys(path, theme, ['id', 'displayName', 'description', 'fonts', 'typography', 'shape', 'modes'])
  if (typeof theme.id !== 'string' || !THEME_ID.test(theme.id)) c.error(`${path}.id`, 'must match ^[a-z0-9-]{1,32}$')
  if (!parseLocalizedText(theme.displayName, 48)) c.error(`${path}.displayName`, 'needs zh-TW and en-US, 1-48 characters each')
  if (theme.description !== undefined && !parseLocalizedText(theme.description, 120)) c.error(`${path}.description`, 'needs zh-TW and en-US, 1-120 characters each')

  const fontIds = new Set()
  const fontFiles = []
  if (theme.fonts !== undefined) {
    if (!Array.isArray(theme.fonts) || theme.fonts.length > LIMITS.fontFacesPerTheme) {
      c.error(`${path}.fonts`, `must be an array of at most ${LIMITS.fontFacesPerTheme} faces`)
    } else {
      const faces = new Set()
      theme.fonts.forEach((face, index) => {
        const facePath = `${path}.fonts[${index}]`
        if (!isRecord(face)) {
          c.error(facePath, 'must be an object')
          return
        }
        c.onlyKeys(facePath, face, ['id', 'src', 'weight', 'style'])
        if (typeof face.id !== 'string' || !FONT_ID.test(face.id)) c.error(`${facePath}.id`, 'must match ^[a-z0-9-]{1,32}$')
        else fontIds.add(face.id)
        const src = normalizeRelativePath(face.src, ['.woff2'])
        if (!src) c.error(`${facePath}.src`, 'must be a safe package-relative .woff2 path')
        else fontFiles.push(src)
        const weight = face.weight ?? 400
        if (![400, 600, 700].includes(weight)) c.error(`${facePath}.weight`, 'must be 400, 600 or 700')
        const style = face.style ?? 'normal'
        if (style !== 'normal' && style !== 'italic') c.error(`${facePath}.style`, 'must be normal or italic')
        const key = `${face.id}\0${weight}\0${style}`
        if (faces.has(key)) c.error(facePath, 'duplicate (id, weight, style)')
        faces.add(key)
      })
    }
  }

  let scale = 1
  if (theme.typography !== undefined) {
    if (!isRecord(theme.typography)) c.error(`${path}.typography`, 'must be an object')
    else {
      c.onlyKeys(`${path}.typography`, theme.typography, ['body', 'heading', 'scale'])
      readFamilyList(c, `${path}.typography.body`, theme.typography.body, fontIds)
      readFamilyList(c, `${path}.typography.heading`, theme.typography.heading, fontIds)
      const value = theme.typography.scale
      if (value !== undefined) {
        if (!isNumber(value) || value < 0.92 || value > 1.15 || !decimalsAtMost(value, 2)) c.error(`${path}.typography.scale`, 'must be a number 0.92-1.15 with at most 2 decimals')
        else scale = value
      }
    }
  }

  const radii = Object.fromEntries(Object.entries(RADIUS).map(([key, rule]) => [key, rule.fallback]))
  if (theme.shape !== undefined) {
    if (!isRecord(theme.shape)) c.error(`${path}.shape`, 'must be an object')
    else {
      c.onlyKeys(`${path}.shape`, theme.shape, Object.keys(RADIUS))
      for (const [key, rule] of Object.entries(RADIUS)) {
        const value = theme.shape[key]
        if (value === undefined) continue
        if (!Number.isInteger(value) || value < 0 || value > rule.max) c.error(`${path}.shape.${key}`, `must be an integer 0-${rule.max}`)
        else radii[key] = value
      }
      if (!(radii.radiusSm <= radii.radiusMd && radii.radiusMd <= radii.radiusLg)) c.error(`${path}.shape`, `radii must satisfy radiusSm <= radiusMd <= radiusLg (got ${radii.radiusSm}/${radii.radiusMd}/${radii.radiusLg} after defaults)`)
    }
  }

  const modes = {}
  if (!isRecord(theme.modes)) c.error(`${path}.modes`, 'must be an object with light and/or dark')
  else {
    c.onlyKeys(`${path}.modes`, theme.modes, MODES)
    const present = MODES.filter(mode => theme.modes[mode] !== undefined)
    if (present.length === 0) c.error(`${path}.modes`, 'needs at least one of light, dark')
    for (const mode of present) modes[mode] = checkMode(c, `${path}.modes.${mode}`, mode, theme.modes[mode])
  }

  const images = Object.values(modes).filter(Boolean).map(report => report.background).filter(bg => bg.type === 'image').map(bg => bg.src)
  const fontSizes = Object.fromEntries(Object.entries(FONT_SIZES).map(([key, base]) => [key, Math.max(11, Math.round(base * scale))]))
  return { id: theme.id, fontFiles, images, scale, fontSizes, radii, modes }
}

/**
 * Validates a `contributes.panelThemes` value. Returns { errors, warnings, themes }
 * where every error is "path: message" and themes carries per-mode contrast reports.
 */
export function validatePanelThemes(value, basePath = 'contributes.panelThemes') {
  const c = new Collector()
  const themes = []
  if (!Array.isArray(value) || value.length < LIMITS.themesMin || value.length > LIMITS.themesMax) {
    c.error(basePath, `must be an array of ${LIMITS.themesMin}-${LIMITS.themesMax} themes`)
    return { errors: c.errors, warnings: c.warnings, themes }
  }
  const ids = new Set()
  value.forEach((theme, index) => {
    const label = isRecord(theme) && typeof theme.id === 'string' ? theme.id : String(index)
    const report = checkTheme(c, `${basePath}[${label}]`, theme)
    if (!report) return
    if (ids.has(report.id)) c.error(`${basePath}[${label}].id`, 'duplicate theme id')
    ids.add(report.id)
    themes.push(report)
  })
  const fontFiles = new Set(themes.flatMap(theme => theme.fontFiles))
  if (fontFiles.size > LIMITS.fontFilesPerPlugin) c.error(basePath, `${fontFiles.size} distinct font files > ${LIMITS.fontFilesPerPlugin}`)
  const images = new Set(themes.flatMap(theme => theme.images))
  if (images.size > LIMITS.imagesPerPlugin) c.error(basePath, `${images.size} distinct background images > ${LIMITS.imagesPerPlugin}`)
  return { errors: c.errors, warnings: c.warnings, themes, fontFiles: [...fontFiles].sort(), images: [...images].sort() }
}
