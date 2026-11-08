// Header-only inspection of packaged PNG/WebP images and WOFF2 fonts.
// Nothing is decoded: only signatures, dimensions, animation flags and the
// EXIF orientation tag are read, as the app does at install time.

export const IMAGE_LIMITS = Object.freeze({
  maxBytes: 8 * 1024 * 1024,
  minSide: 64,
  maxSide: 4096,
  maxPixels: 8_388_608,
})
export const FONT_MAX_BYTES = 1024 * 1024

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const u16be = (b, o) => (b[o] << 8) | b[o + 1]
const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
const u16le = (b, o) => b[o] | (b[o + 1] << 8)
const u24le = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n))

/** EXIF (TIFF) orientation tag 0x0112 from IFD0; null when absent or unreadable. */
export function readTiffOrientation(tiff) {
  if (tiff.length < 8) return null
  const order = ascii(tiff, 0, 2)
  if (order !== 'II' && order !== 'MM') return null
  const little = order === 'II'
  const r16 = o => (little ? u16le(tiff, o) : u16be(tiff, o))
  const r32 = o => (little ? u32le(tiff, o) : u32be(tiff, o))
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

function inspectPng(bytes) {
  if (bytes.length < 33 || ascii(bytes, 12, 4) !== 'IHDR') return { error: 'PNG has no IHDR chunk' }
  const info = { type: 'png', width: u32be(bytes, 16), height: u32be(bytes, 20), animated: false, orientation: 1 }
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

function inspectWebp(bytes) {
  if (bytes.length < 30) return { error: 'WebP file is truncated' }
  if (u32le(bytes, 4) + 8 !== bytes.length) return { error: 'WebP RIFF size does not match the file size' }
  const first = ascii(bytes, 12, 4)
  const info = { type: 'webp', width: 0, height: 0, animated: false, orientation: 1 }
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
export function inspectImage(bytes) {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return inspectPng(bytes)
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return inspectWebp(bytes)
  return { error: 'not a PNG or WebP file (signature)' }
}

/** Packaged background/icon rules (§5.1, §5.3). Returns a list of problems. */
export function checkPackagedImage(bytes, expectedExtension) {
  const problems = []
  if (bytes.length > IMAGE_LIMITS.maxBytes) problems.push(`${bytes.length} bytes > 8 MiB`)
  const info = inspectImage(bytes)
  if (info.error) return { info: null, problems: [...problems, info.error] }
  if (expectedExtension && `.${info.type}` !== expectedExtension) problems.push(`content is ${info.type.toUpperCase()} but the extension is ${expectedExtension}`)
  const { width, height } = info
  if (width < IMAGE_LIMITS.minSide || height < IMAGE_LIMITS.minSide || width > IMAGE_LIMITS.maxSide || height > IMAGE_LIMITS.maxSide) {
    problems.push(`${width}x${height} is outside 64-4096 px per side`)
  }
  if (width * height > IMAGE_LIMITS.maxPixels) problems.push(`${width * height} pixels > 8,388,608`)
  if (info.animated) problems.push('animated images are not allowed')
  if (info.orientation !== 1) problems.push(`EXIF orientation ${info.orientation}; save it again without rotation`)
  return { info, problems }
}

export function checkFont(bytes) {
  const problems = []
  if (bytes.length > FONT_MAX_BYTES) problems.push(`${bytes.length} bytes > 1 MiB`)
  if (bytes.length < 4 || ascii(bytes, 0, 4) !== 'wOF2') problems.push('not a WOFF2 file (missing wOF2 signature)')
  return problems
}
