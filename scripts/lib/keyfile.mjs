// Guards for private-key paths: keys must live outside this repository and
// outside any git work tree or git directory, so they cannot be committed by
// accident. Every check fails closed.

import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { REPO_ROOT } from './cli.mjs'

const CASE_INSENSITIVE = process.platform === 'darwin' || process.platform === 'win32'
const fold = value => (CASE_INSENSITIVE ? value.toLowerCase() : value)

/** True when `path` is inside `root` (or equal to it). Case-insensitive on macOS and Windows. */
export function isInside(root, path) {
  const rel = relative(fold(resolve(root)), fold(resolve(path)))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Resolves symlinks: realpath of the nearest existing ancestor (or the path
 * itself) with the not-yet-existing remainder appended.
 */
export function realPathOf(path) {
  let current = resolve(path)
  const rest = []
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

function hasGitSegment(path) {
  return resolve(path).split(sep).some(segment => fold(segment) === '.git')
}

function nearestExistingDirectory(path) {
  let dir = resolve(path)
  while (!existsSync(dir) || !lstatSync(dir).isDirectory()) {
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return dir
}

/** First ancestor directory (including the start) that contains a `.git` entry, or null. */
export function ancestorWithGitEntry(path) {
  let dir = nearestExistingDirectory(path)
  while (dir) {
    let names = []
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
export function gitWorkTreeOf(path, { git = 'git' } = {}) {
  const dir = nearestExistingDirectory(path)
  if (!dir) return null
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')))
  try {
    const top = execFileSync(git, ['rev-parse', '--show-toplevel'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return top || null
  } catch (error) {
    return error.code === 'ENOENT' ? undefined : null
  }
}

/** Throws when a key path is inside this repository, a git work tree or a .git directory. */
export function assertKeyPathOutsideRepos(path, { git = 'git' } = {}) {
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
