// Minimal deterministic ZIP writer and strict reader (node:zlib only).
// Writer: entries sorted by path, stored (method 0) so the bytes do not depend
// on the local zlib build, fixed DOS timestamp, Unix mode 0644, UTF-8 names,
// no directory entries, no data descriptors, no extra fields, no comment.
// Reader: one EOCD, no ZIP64/multi-disk/encryption, local headers must agree
// with the central directory, CRC-32 checked, unsafe or duplicate names
// rejected. It is used to verify archives this repo produced.

import { inflateRawSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes) {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// 1980-01-01 00:00:00, the DOS epoch: the same for every build.
const DOS_TIME = 0
const DOS_DATE = (0 << 9) | (1 << 5) | 1
const FLAG_UTF8 = 0x0800
const VERSION_NEEDED = 20
const VERSION_MADE_BY = (3 << 8) | 20 // Unix host
const EXTERNAL_ATTRS = (0o100644 << 16) >>> 0 // regular file, rw-r--r--

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/** Builds a ZIP from a Map<path, Uint8Array>. */
export function writeZip(files) {
  const entries = [...files.entries()].sort(([a], [b]) => compare(a, b))
  const locals = []
  const centrals = []
  let offset = 0
  for (const [path, data] of entries) {
    const name = Buffer.from(path, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(VERSION_NEEDED, 4)
    local.writeUInt16LE(FLAG_UTF8, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, Buffer.from(data.buffer, data.byteOffset, data.byteLength))

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(VERSION_MADE_BY, 4)
    central.writeUInt16LE(VERSION_NEEDED, 6)
    central.writeUInt16LE(FLAG_UTF8, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(DOS_TIME, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(EXTERNAL_ATTRS, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += 30 + name.length + data.length
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

export class ZipError extends Error {}

const utf8 = new TextDecoder('utf-8', { fatal: true })

/** Reads a ZIP into Map<path, Buffer>. Throws ZipError on anything unusual. */
export function readZip(input, { maxEntries = 64, maxTotalBytes = 25 * 1024 * 1024 } = {}) {
  const bytes = Buffer.from(input)
  const fail = message => {
    throw new ZipError(message)
  }
  if (bytes.length < 22) fail('archive is too small')
  let eocd = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 22 - 0xffff); offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  if (eocd < 0 || eocd + 22 + bytes.readUInt16LE(eocd + 20) !== bytes.length) fail('end of central directory not found at the end of the archive')
  if (eocd >= 20 && bytes.readUInt32LE(eocd - 20) === 0x07064b50) fail('ZIP64 archives are not supported')
  if (bytes.readUInt16LE(eocd + 4) !== 0 || bytes.readUInt16LE(eocd + 6) !== 0) fail('multi-disk archives are not supported')
  const count = bytes.readUInt16LE(eocd + 10)
  if (count !== bytes.readUInt16LE(eocd + 8)) fail('inconsistent entry counts')
  if (count > maxEntries) fail(`${count} entries > ${maxEntries}`)
  const centralSize = bytes.readUInt32LE(eocd + 12)
  const centralOffset = bytes.readUInt32LE(eocd + 16)
  if (centralOffset + centralSize !== eocd) fail('central directory does not end at the EOCD record')

  const files = new Map()
  const seen = new Set()
  const ranges = []
  let total = 0
  let cursor = centralOffset
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > eocd || bytes.readUInt32LE(cursor) !== 0x02014b50) fail('corrupt central directory')
    const flags = bytes.readUInt16LE(cursor + 8)
    const method = bytes.readUInt16LE(cursor + 10)
    const crc = bytes.readUInt32LE(cursor + 16)
    const compressedSize = bytes.readUInt32LE(cursor + 20)
    const size = bytes.readUInt32LE(cursor + 24)
    const nameLength = bytes.readUInt16LE(cursor + 28)
    const extraLength = bytes.readUInt16LE(cursor + 30)
    const commentLength = bytes.readUInt16LE(cursor + 32)
    const host = bytes.readUInt16LE(cursor + 4) >> 8
    const external = bytes.readUInt32LE(cursor + 38)
    const localOffset = bytes.readUInt32LE(cursor + 42)
    if (flags & 0x41) fail('encrypted entries are not supported')
    if (method !== 0 && method !== 8) fail(`unsupported compression method ${method}`)
    if (host === 3 && ((external >>> 16) & 0o170000) === 0o120000) fail('symbolic links are not allowed')
    let name
    try {
      name = utf8.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    } catch {
      fail('entry name is not valid UTF-8')
    }
    if (name.length === 0 || /[\u0000-\u001f\u007f]/.test(name) || name.startsWith('/') || name.includes('\\') || /^[a-zA-Z]:/.test(name) || name.split('/').includes('..')) {
      fail(`unsafe entry name ${JSON.stringify(name)}`)
    }
    const centralName = bytes.subarray(cursor + 46, cursor + 46 + nameLength)
    cursor += 46 + nameLength + extraLength + commentLength
    if (method === 0 && compressedSize !== size) fail(`${name}: stored entry sizes differ`)

    // Same agreement rules as the app's zip-inspect.ts: flags, method, name
    // bytes and (without a data descriptor) CRC and both sizes must match.
    if (localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== 0x04034b50) fail(`${name}: bad local header`)
    const localFlags = bytes.readUInt16LE(localOffset + 6)
    const localNameLength = bytes.readUInt16LE(localOffset + 26)
    const localExtra = bytes.readUInt16LE(localOffset + 28)
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)
    const disagrees = localFlags !== flags
      || bytes.readUInt16LE(localOffset + 8) !== method
      || !localName.equals(centralName)
      || ((flags & 0x8) === 0 && (bytes.readUInt32LE(localOffset + 14) !== crc
        || bytes.readUInt32LE(localOffset + 18) !== compressedSize
        || bytes.readUInt32LE(localOffset + 22) !== size))
    if (disagrees) fail(`${name}: local header disagrees with the central directory`)
    const dataStart = localOffset + 30 + localNameLength + localExtra
    const dataEnd = dataStart + compressedSize
    if (dataEnd > centralOffset) fail(`${name}: data runs into the central directory`)
    ranges.push([localOffset, dataEnd])

    if (name.endsWith('/')) continue
    const key = name.normalize('NFC').toLowerCase()
    if (seen.has(key)) fail(`duplicate entry ${name}`)
    seen.add(key)
    total += size
    if (total > maxTotalBytes) fail(`uncompressed size exceeds ${maxTotalBytes} bytes`)
    const raw = bytes.subarray(dataStart, dataEnd)
    const data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: size + 1 })
    if (data.length !== size) fail(`${name}: size mismatch`)
    if (crc32(data) !== crc) fail(`${name}: CRC-32 mismatch`)
    files.set(name, data)
  }
  ranges.sort((a, b) => a[0] - b[0])
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index][0] < ranges[index - 1][1]) fail('overlapping entries')
  }
  return files
}
