// Minimal deterministic ZIP writer and strict reader (node:zlib only).
// Writer: entries sorted by path, stored (method 0) so the bytes do not depend
// on the local zlib build, fixed DOS timestamp, Unix mode 0644, UTF-8 names,
// no directory entries, no data descriptors, no extra fields, no comment.
// Reader: the same structural rules as the app's zip-inspect.ts (one EOCD, no
// ZIP64/multi-disk/encryption, records inside the central directory, local
// headers that agree with it, no symlink or reparse-point entries, no unsafe
// or duplicate names, no overlapping data), plus a CRC-32 check of every entry.

import { crc32 as nativeCrc32, inflateRawSync } from 'node:zlib'

/** CRC-32 (IEEE) as ZIP and PNG use it. zlib's native slicing implementation, about 8x the old table loop. */
export function crc32(bytes: Uint8Array): number {
  return nativeCrc32(bytes) >>> 0
}

// 1980-01-01 00:00:00, the DOS epoch: the same for every build.
const DOS_TIME = 0
const DOS_DATE = (0 << 9) | (1 << 5) | 1
const FLAG_UTF8 = 0x0800
const VERSION_NEEDED = 20
const VERSION_MADE_BY = (3 << 8) | 20 // Unix host
const EXTERNAL_ATTRS = (0o100644 << 16) >>> 0 // regular file, rw-r--r--
const LOCAL_HEADER = 30
const CENTRAL_HEADER = 46
const END_RECORD = 22

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Builds a ZIP from a Map<path, Uint8Array>. The final size is known up front,
 * so every header and payload is written once into a single buffer (no
 * per-entry header buffers and no final concatenation copy).
 */
export function writeZip(files: Map<string, Uint8Array>): Buffer {
  const entries = [...files.entries()]
    .sort(([a], [b]) => compare(a, b))
    .map(([path, data]) => ({ name: Buffer.from(path, 'utf8'), data, crc: crc32(data), offset: 0 }))
  let dataSize = 0
  let centralSize = 0
  for (const entry of entries) {
    dataSize += LOCAL_HEADER + entry.name.length + entry.data.length
    centralSize += CENTRAL_HEADER + entry.name.length
  }
  const out = Buffer.alloc(dataSize + centralSize + END_RECORD)
  let cursor = 0
  for (const entry of entries) {
    const { name, data, crc } = entry
    entry.offset = cursor
    out.writeUInt32LE(0x04034b50, cursor)
    out.writeUInt16LE(VERSION_NEEDED, cursor + 4)
    out.writeUInt16LE(FLAG_UTF8, cursor + 6)
    out.writeUInt16LE(0, cursor + 8)
    out.writeUInt16LE(DOS_TIME, cursor + 10)
    out.writeUInt16LE(DOS_DATE, cursor + 12)
    out.writeUInt32LE(crc, cursor + 14)
    out.writeUInt32LE(data.length, cursor + 18)
    out.writeUInt32LE(data.length, cursor + 22)
    out.writeUInt16LE(name.length, cursor + 26)
    out.writeUInt16LE(0, cursor + 28)
    cursor += LOCAL_HEADER
    cursor += name.copy(out, cursor)
    out.set(data, cursor)
    cursor += data.length
  }
  for (const { name, data, crc, offset } of entries) {
    out.writeUInt32LE(0x02014b50, cursor)
    out.writeUInt16LE(VERSION_MADE_BY, cursor + 4)
    out.writeUInt16LE(VERSION_NEEDED, cursor + 6)
    out.writeUInt16LE(FLAG_UTF8, cursor + 8)
    out.writeUInt16LE(0, cursor + 10)
    out.writeUInt16LE(DOS_TIME, cursor + 12)
    out.writeUInt16LE(DOS_DATE, cursor + 14)
    out.writeUInt32LE(crc, cursor + 16)
    out.writeUInt32LE(data.length, cursor + 20)
    out.writeUInt32LE(data.length, cursor + 24)
    out.writeUInt16LE(name.length, cursor + 28)
    out.writeUInt32LE(EXTERNAL_ATTRS, cursor + 38)
    out.writeUInt32LE(offset, cursor + 42)
    cursor += CENTRAL_HEADER
    cursor += name.copy(out, cursor)
  }
  out.writeUInt32LE(0x06054b50, cursor)
  out.writeUInt16LE(entries.length, cursor + 8)
  out.writeUInt16LE(entries.length, cursor + 10)
  out.writeUInt32LE(centralSize, cursor + 12)
  out.writeUInt32LE(dataSize, cursor + 16)
  return out
}

export class ZipError extends Error {}

const utf8 = new TextDecoder('utf-8', { fatal: true })

/** Reads a ZIP into Map<path, Buffer>. Throws ZipError on anything unusual. */
export interface ReadZipLimits {
  maxEntries?: number
  maxTotalBytes?: number
}

export function readZip(input: Uint8Array, { maxEntries = 64, maxTotalBytes = 25 * 1024 * 1024 }: ReadZipLimits = {}): Map<string, Buffer> {
  // A read-only view over the caller's bytes: no copy of the whole archive.
  // Every returned entry is still its own copy (stored) or inflated buffer.
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  const fail = (message: string): never => {
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
  const centralSize = bytes.readUInt32LE(eocd + 12)
  const centralOffset = bytes.readUInt32LE(eocd + 16)
  if (count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) fail('ZIP64 archives are not supported')
  if (count !== bytes.readUInt16LE(eocd + 8)) fail('inconsistent entry counts')
  if (count > maxEntries) fail(`${count} entries > ${maxEntries}`)
  if (centralOffset + centralSize !== eocd) fail('central directory does not end at the EOCD record')

  const files = new Map<string, Buffer>()
  const seen = new Set<string>()
  const ranges: Array<[number, number]> = []
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
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength
    if (recordEnd > eocd) fail('corrupt central directory')
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) fail('ZIP64 entries are not supported')
    if (bytes.readUInt16LE(cursor + 34) !== 0) fail('multi-disk archives are not supported')
    if (flags & 0x41) fail('encrypted entries are not supported')
    if (method !== 0 && method !== 8) fail(`unsupported compression method ${method}`)
    const link = host === 3 ? ((external >>> 16) & 0o170000) === 0o120000 : (external & 0x400) !== 0
    if (link) fail('symbolic links and reparse points are not allowed')
    let name = ''
    try {
      name = utf8.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    } catch {
      fail('entry name is not valid UTF-8')
    }
    if (name.length === 0 || /[\u0000-\u001f\u007f]/.test(name) || name.startsWith('/') || name.includes('\\') || /^[a-zA-Z]:/.test(name) || name.split('/').includes('..')) {
      fail(`unsafe entry name ${JSON.stringify(name)}`)
    }
    const centralName = bytes.subarray(cursor + 46, cursor + 46 + nameLength)
    cursor = recordEnd
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
