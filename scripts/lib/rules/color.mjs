// Colour grammar, normalisation and WCAG luminance for panel themes.
// Implements Plugin Panel Theme Contract §3.3 and §6.1 (Agent Pets 1.12.0).
// The app's runtime validator is authoritative; keep this file in step with it.

const NUM = String.raw`(?:\d{1,3}(?:\.\d{1,4})?|\.\d{1,4})`
const NUM_P = `(${NUM}%?)`

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const RGB_COMMA = new RegExp(`^rgba?\\(${NUM_P}, ?${NUM_P}, ?${NUM_P}(?:, ?${NUM_P})?\\)$`)
const RGB_SPACE = new RegExp(`^rgba?\\(${NUM_P} ${NUM_P} ${NUM_P}(?: / ${NUM_P})?\\)$`)
const HSL_COMMA = new RegExp(`^hsla?\\((${NUM})(?:deg)?, ?(${NUM})%, ?(${NUM})%(?:, ?${NUM_P})?\\)$`)
const HSL_SPACE = new RegExp(`^hsla?\\((${NUM})(?:deg)? (${NUM})% (${NUM})%(?: / ${NUM_P})?\\)$`)
const OKLCH = new RegExp(`^oklch\\(${NUM_P} (${NUM}) (${NUM})(?:deg)?(?: / ${NUM_P})?\\)$`)

/** Regex every host-emitted colour string matches (the renderer re-checks it). */
const BYTE = '(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)'
export const NORMALISED_COLOR = new RegExp(`^rgb\\(${BYTE} ${BYTE} ${BYTE} \\/ (?:0|1|0\\.\\d{1,3})\\)$`)

export class ColorError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function fail(code, message) {
  throw new ColorError(code, message)
}

function isPercent(token) {
  return token.endsWith('%')
}

function numberOf(token) {
  return Number(isPercent(token) ? token.slice(0, -1) : token)
}

function parseAlpha(token) {
  if (token === undefined) return 1
  const value = numberOf(token)
  if (isPercent(token)) {
    if (value > 100) fail('out_of_range', 'alpha percentage must be 0-100')
    return value / 100
  }
  if (value > 1) fail('out_of_range', 'alpha must be 0-1')
  return value
}

function parseHex(text) {
  let hex = text.slice(1)
  if (hex.length <= 4) hex = [...hex].map(char => char + char).join('')
  const channels = [0, 2, 4].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16))
  const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1
  return { r: channels[0], g: channels[1], b: channels[2], a: alpha }
}

function parseRgb(match) {
  const [, r, g, b, a] = match
  const tokens = [r, g, b]
  const percent = tokens.map(isPercent)
  if (percent.some(value => value !== percent[0])) fail('mixed_units', 'rgb channels must all use the same unit')
  const values = tokens.map(token => {
    const value = numberOf(token)
    if (percent[0]) {
      if (value > 100) fail('out_of_range', 'rgb percentage must be 0-100')
      return (value / 100) * 255
    }
    if (value > 255) fail('out_of_range', 'rgb channel must be 0-255')
    return value
  })
  return { r: values[0], g: values[1], b: values[2], a: parseAlpha(a) }
}

function hslToRgb(h, s, l) {
  const hue = (h % 360) / 360
  const sat = s / 100
  const light = l / 100
  if (sat === 0) return [light * 255, light * 255, light * 255]
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
  const p = 2 * light - q
  const channel = (t) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return [channel(hue + 1 / 3), channel(hue), channel(hue - 1 / 3)].map(value => value * 255)
}

function parseHsl(match) {
  const [, h, s, l, a] = match
  const hue = Number(h)
  const sat = Number(s)
  const light = Number(l)
  if (hue > 360) fail('out_of_range', 'hue must be 0-360')
  if (sat > 100 || light > 100) fail('out_of_range', 'saturation and lightness must be 0-100%')
  const [r, g, b] = hslToRgb(hue, sat, light)
  return { r, g, b, a: parseAlpha(a) }
}

function linearToSrgb(value) {
  const v = Math.min(1, Math.max(0, value))
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
}

function parseOklch(match) {
  const [, lToken, cToken, hToken, a] = match
  let lightness = numberOf(lToken)
  if (isPercent(lToken)) {
    if (lightness > 100) fail('out_of_range', 'oklch lightness must be 0-100%')
    lightness /= 100
  } else if (lightness > 1) {
    fail('out_of_range', 'oklch lightness must be 0-1')
  }
  const chroma = Number(cToken)
  const hue = Number(hToken)
  if (chroma > 0.4) fail('out_of_range', 'oklch chroma must be 0-0.4')
  if (hue > 360) fail('out_of_range', 'oklch hue must be 0-360')
  const radians = (hue * Math.PI) / 180
  const labA = chroma * Math.cos(radians)
  const labB = chroma * Math.sin(radians)
  // Björn Ottosson's OKLab -> LMS -> linear sRGB matrices.
  const l = (lightness + 0.3963377774 * labA + 0.2158037573 * labB) ** 3
  const m = (lightness - 0.1055613458 * labA - 0.0638541728 * labB) ** 3
  const s = (lightness - 0.0894841775 * labA - 1.291485548 * labB) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  if (linear.some(value => value < -0.0001 || value > 1.0001)) fail('out_of_gamut', 'oklch colour is outside the sRGB gamut')
  const [r, g, b] = linear.map(value => linearToSrgb(value) * 255)
  return { r, g, b, a: parseAlpha(a) }
}

function round3(value) {
  return Math.round(value * 1000) / 1000
}

function finish(color) {
  return {
    r: Math.min(255, Math.max(0, Math.round(color.r))),
    g: Math.min(255, Math.max(0, Math.round(color.g))),
    b: Math.min(255, Math.max(0, Math.round(color.b))),
    a: round3(color.a),
  }
}

/**
 * Parses a manifest colour string into integer sRGB channels and an alpha
 * rounded to 3 decimals. Throws ColorError on any violation.
 */
export function parseColor(input) {
  if (typeof input !== 'string') fail('not_string', 'colour must be a string')
  if (input.length === 0 || input.length > 64) fail('length', 'colour must be 1-64 characters')
  if (input !== input.trim()) fail('whitespace', 'colour must not have leading or trailing whitespace')
  if (/[\u0000-\u001f\u007f]/.test(input)) fail('control', 'colour must not contain control characters')
  if (HEX.test(input)) return finish(parseHex(input))
  let match = RGB_COMMA.exec(input) ?? RGB_SPACE.exec(input)
  if (match) return finish(parseRgb(match))
  match = HSL_COMMA.exec(input) ?? HSL_SPACE.exec(input)
  if (match) return finish(parseHsl(match))
  match = OKLCH.exec(input)
  if (match) return finish(parseOklch(match))
  fail('grammar', 'colour must be #hex, rgb()/rgba(), hsl()/hsla() or oklch()')
}

/** Host-normalised form: rgb(R G B / A). */
export function formatColor(color) {
  return `rgb(${color.r} ${color.g} ${color.b} / ${color.a})`
}

export function mix(a, b, t) {
  return {
    r: Math.round(a.r * (1 - t) + b.r * t),
    g: Math.round(a.g * (1 - t) + b.g * t),
    b: Math.round(a.b * (1 - t) + b.b * t),
    a: 1,
  }
}

export function withAlpha(color, alpha) {
  return { r: color.r, g: color.g, b: color.b, a: round3(alpha) }
}

/** Composites a (possibly translucent) colour over an opaque backdrop in sRGB gamma space. */
export function composite(foreground, background) {
  const a = foreground.a
  return {
    r: foreground.r * a + background.r * (1 - a),
    g: foreground.g * a + background.g * (1 - a),
    b: foreground.b * a + background.b * (1 - a),
    a: 1,
  }
}

function channelLuminance(value) {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.x relative luminance of an opaque colour. */
export function luminance(color) {
  return 0.2126 * channelLuminance(color.r) + 0.7152 * channelLuminance(color.g) + 0.0722 * channelLuminance(color.b)
}

/** Contrast ratio of a foreground (composited if translucent) over an opaque background. */
export function contrast(foreground, background) {
  const fg = foreground.a < 1 ? composite(foreground, background) : foreground
  const l1 = luminance(fg)
  const l2 = luminance(background)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

export const BLACK = Object.freeze({ r: 0, g: 0, b: 0, a: 1 })
export const WHITE = Object.freeze({ r: 255, g: 255, b: 255, a: 1 })
