// Bounded reads of regular files. The final path component is opened with
// O_NOFOLLOW, so a symbolic link (or a file swapped for one after a directory
// scan) is refused instead of followed, and the size is checked on the open
// descriptor before anything is read.

import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'

const NO_FOLLOW = constants.O_NOFOLLOW ?? 0

/**
 * Reads `path` when it is a regular file of at most `maxBytes`. Returns
 * { bytes, mode }. Throws with `label` in the message otherwise.
 */
export interface RegularFile {
  bytes: Buffer
  mode: number
}

const errorCode = (error: unknown): string | undefined => (error as NodeJS.ErrnoException | null)?.code
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export function readRegularFile(path: string, maxBytes: number, label: string = path): RegularFile {
  let fd: number
  try {
    fd = openSync(path, constants.O_RDONLY | NO_FOLLOW)
  } catch (error) {
    const reasons: Record<string, string> = { ELOOP: 'is a symbolic link', ENOENT: 'does not exist', EACCES: 'is not readable' }
    const code = errorCode(error)
    throw new Error(`${label}: ${(code && reasons[code]) ?? errorMessage(error)}`)
  }
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile()) throw new Error(`${label}: not a regular file`)
    if (stat.size > maxBytes) throw new Error(`${label}: larger than ${maxBytes} bytes`)
    const bytes = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < bytes.length) {
      const read = readSync(fd, bytes, offset, bytes.length - offset, offset)
      if (read === 0) throw new Error(`${label}: changed while it was read`)
      offset += read
    }
    // One more byte means the file grew after fstat: refuse rather than read past the cap.
    if (readSync(fd, Buffer.alloc(1), 0, 1, offset) !== 0) throw new Error(`${label}: changed while it was read`)
    return { bytes, mode: stat.mode }
  } finally {
    closeSync(fd)
  }
}
