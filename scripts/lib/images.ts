// Header-only inspection of packaged PNG/WebP images and WOFF2 fonts.
// Nothing is decoded: only signatures, dimensions, animation flags and the
// EXIF orientation tag are read, as the app does at install time.

import {
  isWoff2,
  PANEL_THEME_FONT_MAX_BYTES,
  PANEL_THEME_IMAGE_MAX_BYTES,
  PANEL_THEME_IMAGE_MAX_PIXELS,
  PANEL_THEME_IMAGE_MAX_SIDE,
  PANEL_THEME_IMAGE_MIN_SIDE,
} from './rules/panel-themes.ts'

// The limits are the vendored app constants, so they cannot drift from the app.
export const IMAGE_LIMITS = Object.freeze({
  maxBytes: PANEL_THEME_IMAGE_MAX_BYTES,
  minSide: PANEL_THEME_IMAGE_MIN_SIDE,
  maxSide: PANEL_THEME_IMAGE_MAX_SIDE,
  maxPixels: PANEL_THEME_IMAGE_MAX_PIXELS,
})
export const FONT_MAX_BYTES = PANEL_THEME_FONT_MAX_BYTES

const MIB = 1024 * 1024
const mib = (bytes: number): string => `${bytes / MIB} MiB`

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

type Bytes = Uint8Array

const u16be = (b: Bytes, o: number): number => (b[o] << 8) | b[o + 1]
const u32be = (b: Bytes, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
const u16le = (b: Bytes, o: number): number => b[o] | (b[o + 1] << 8)
const u24le = (b: Bytes, o: number): number => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)
const u32le = (b: Bytes, o: number): number => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
/** n bytes at o as Latin-1 (FourCCs and short tags). */
const ascii = (b: Bytes, o: number, n: number): string => {
  let text = ''
  for (let index = o; index < o + n && index < b.length; index += 1) text += String.fromCharCode(b[index])
  return text
}

export interface ImageInfo {
  type: 'png' | 'webp'
  width: number
  height: number
  animated: boolean
  orientation: number
}

export type ImageInspection = ImageInfo | { error: string }

/** EXIF (TIFF) orientation tag 0x0112 from IFD0; null when absent or unreadable. */
export function readTiffOrientation(tiff: Bytes): number | null {
  if (tiff.length < 8) return null
  const order = ascii(tiff, 0, 2)
  if (order !== 'II' && order !== 'MM') return null
  const little = order === 'II'
  const r16 = (o: number): number => (little ? u16le(tiff, o) : u16be(tiff, o))
  const r32 = (o: number): number => (little ? u32le(tiff, o) : u32be(tiff, o))
  if (r16(2) !== 42) return null
  const ifd = r32(4)
  if (ifd + 2 > tiff.length) return null
  const count = r16(ifd)
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12
    if (entry + 12 > tiff.length) return null
    if (r16(entry) === 0x0112) return r16(entry + 8)
  }
  return null
}

function inspectPng(bytes: Bytes): ImageInspection {
  if (bytes.length < 33 || ascii(bytes, 12, 4) !== 'IHDR') return { error: 'PNG has no IHDR chunk' }
  const info: ImageInfo = { type: 'png', width: u32be(bytes, 16), height: u32be(bytes, 20), animated: false, orientation: 1 }
  let offset = 8
  while (offset + 8 <= bytes.length) {
    const length = u32be(bytes, offset)
    const type = ascii(bytes, offset + 4, 4)
    if (offset + 12 + length > bytes.length) return { error: 'PNG chunk runs past the end of the file' }
    if (type === 'IDAT' || type === 'IEND') return info
    if (type === 'acTL') info.animated = true
    if (type === 'eXIf') info.orientation = readTiffOrientation(bytes.subarray(offset + 8, offset + 8 + length)) ?? 1
    offset += 12 + length
  }
  return { error: 'PNG has no image data' }
}

function inspectWebp(bytes: Bytes): ImageInspection {
  if (bytes.length < 30) return { error: 'WebP file is truncated' }
  if (u32le(bytes, 4) + 8 !== bytes.length) return { error: 'WebP RIFF size does not match the file size' }
  const first = ascii(bytes, 12, 4)
  const info: ImageInfo = { type: 'webp', width: 0, height: 0, animated: false, orientation: 1 }
  if (first === 'VP8 ') {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return { error: 'WebP VP8 frame header is invalid' }
    info.width = u16le(bytes, 26) & 0x3fff
    info.height = u16le(bytes, 28) & 0x3fff
  } else if (first === 'VP8L') {
    if (bytes[20] !== 0x2f) return { error: 'WebP VP8L signature is invalid' }
    const bits = u32le(bytes, 21)
    info.width = (bits & 0x3fff) + 1
    info.height = ((bits >>> 14) & 0x3fff) + 1
  } else if (first === 'VP8X') {
    if (bytes[20] & 0x02) info.animated = true
    info.width = u24le(bytes, 24) + 1
    info.height = u24le(bytes, 27) + 1
  } else {
    return { error: `WebP starts with an unknown chunk "${first}"` }
  }
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4)
    const length = u32le(bytes, offset + 4)
    if (offset + 8 + length > bytes.length) return { error: 'WebP chunk runs past the end of the file' }
    if (type === 'ANIM' || type === 'ANMF') info.animated = true
    if (type === 'EXIF') {
      const exif = bytes.subarray(offset + 8, offset + 8 + length)
      const tiff = ascii(exif, 0, 4) === 'Exif' ? exif.subarray(6) : exif
      info.orientation = readTiffOrientation(tiff) ?? 1
    }
    offset += 8 + length + (length & 1)
  }
  return info
}

/** Returns { type, width, height, animated, orientation } or { error }. */
export function inspectImage(bytes: Bytes): ImageInspection {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return inspectPng(bytes)
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return inspectWebp(bytes)
  return { error: 'not a PNG or WebP file (signature)' }
}

/** Packaged background/icon rules (§5.1, §5.3). Returns a list of problems. */
export function checkPackagedImage(bytes: Bytes, expectedExtension?: string): { info: ImageInfo | null, problems: string[] } {
  const problems: string[] = []
  if (bytes.length > IMAGE_LIMITS.maxBytes) problems.push(`${bytes.length} bytes > ${mib(IMAGE_LIMITS.maxBytes)}`)
  const info = inspectImage(bytes)
  if ('error' in info) return { info: null, problems: [...problems, info.error] }
  if (expectedExtension && `.${info.type}` !== expectedExtension) problems.push(`content is ${info.type.toUpperCase()} but the extension is ${expectedExtension}`)
  const { width, height } = info
  const { minSide, maxSide, maxPixels } = IMAGE_LIMITS
  if (Math.min(width, height) < minSide || Math.max(width, height) > maxSide) problems.push(`${width}x${height} is outside ${minSide}-${maxSide} px per side`)
  if (width * height > maxPixels) problems.push(`${width * height} pixels > ${maxPixels.toLocaleString('en-US')}`)
  if (info.animated) problems.push('animated images are not allowed')
  if (info.orientation !== 1) problems.push(`EXIF orientation ${info.orientation}; save it again without rotation`)
  return { info, problems }
}

export function checkFont(bytes: Bytes): string[] {
  const problems: string[] = []
  if (bytes.length > FONT_MAX_BYTES) problems.push(`${bytes.length} bytes > ${mib(FONT_MAX_BYTES)}`)
  if (!isWoff2(bytes)) problems.push('not a WOFF2 file (missing wOF2 signature)')
  return problems
}
