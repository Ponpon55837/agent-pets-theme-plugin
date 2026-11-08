// Guards for private-key paths: keys must live outside this repository and
// outside any git work tree or git directory, so they cannot be committed by
// accident. Every check fails closed.

import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { gitFreeEnv, REPO_ROOT } from './cli.ts'
import { readRegularFile } from './files.ts'

/** An Ed25519 PKCS#8 PEM is about 120 bytes; anything far larger is not a key. */
export const KEY_FILE_MAX_BYTES = 16 * 1024

const CASE_INSENSITIVE = process.platform === 'darwin' || process.platform === 'win32'
const fold = (value: string): string => (CASE_INSENSITIVE ? value.toLowerCase() : value)

/** True when `path` is inside `root` (or equal to it). Case-insensitive on macOS and Windows. */
export function isInside(root: string, path: string): boolean {
  const rel = relative(fold(resolve(root)), fold(resolve(path)))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Resolves symlinks: realpath of the nearest existing ancestor (or the path
 * itself) with the not-yet-existing remainder appended.
 */
export function realPathOf(path: string): string {
  let current = resolve(path)
  const rest: string[] = []
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) break
    rest.unshift(basename(current))
    current = parent
  }
  let real
  try {
    real = realpathSync(current)
  } catch {
    real = current
  }
  return rest.length ? join(real, ...rest) : real
}

function hasGitSegment(path: string): boolean {
  return resolve(path).split(sep).some(segment => fold(segment) === '.git')
}

function nearestExistingDirectory(path: string): string | null {
  let dir = resolve(path)
  while (!existsSync(dir) || !lstatSync(dir).isDirectory()) {
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return dir
}

/** First ancestor directory (including the start) that contains a `.git` entry, or null. */
export function ancestorWithGitEntry(path: string): string | null {
  let dir = nearestExistingDirectory(path)
  while (dir) {
    let names: string[] = []
    try {
      names = readdirSync(dir)
    } catch {
      return dir // unreadable: fail closed
    }
    if (names.some(name => fold(name) === '.git')) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

/**
 * The git work-tree root containing `path`, or null. Runs git with every
 * GIT_* variable removed so GIT_DIR / GIT_WORK_TREE cannot redirect it.
 * Returns undefined when git itself cannot be run.
 */
export function gitWorkTreeOf(path: string, { git = 'git' }: { git?: string } = {}): string | null | undefined {
  const dir = nearestExistingDirectory(path)
  if (!dir) return null
  try {
    const top = execFileSync(git, ['rev-parse', '--show-toplevel'], { cwd: dir, env: gitFreeEnv(), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return top || null
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? undefined : null
  }
}

/** Throws when a key path is inside this repository, a git work tree or a .git directory. */
export function assertKeyPathOutsideRepos(path: string, { git = 'git' }: { git?: string } = {}): void {
  const candidates = [resolve(path), realPathOf(path)]
  const roots = [REPO_ROOT, realPathOf(REPO_ROOT)]
  for (const candidate of candidates) {
    if (roots.some(root => isInside(root, candidate))) throw new Error('the key path is inside this repository; keep signing keys outside it')
    if (hasGitSegment(candidate)) throw new Error('the key path is inside a .git directory; keep signing keys outside any repository')
    if (ancestorWithGitEntry(candidate)) throw new Error('the key path is inside a git work tree; keep signing keys outside any repository')
    const tree = gitWorkTreeOf(candidate, { git })
    if (tree) throw new Error('the key path is inside a git work tree; keep signing keys outside any repository')
  }
}

/**
 * Reads a private key file: a regular file, not a symbolic link, at most
 * KEY_FILE_MAX_BYTES, and (outside Windows) without group or other permission
 * bits. Errors never include the file contents.
 */
export function readPrivateKeyFile(path: string): Buffer {
  const { bytes, mode } = readRegularFile(path, KEY_FILE_MAX_BYTES, 'the key file')
  if (process.platform !== 'win32' && (mode & 0o077) !== 0) {
    throw new Error(`the key file is accessible to other users (mode ${(mode & 0o777).toString(8).padStart(3, '0')}); run chmod 600 on it`)
  }
  return bytes
}
