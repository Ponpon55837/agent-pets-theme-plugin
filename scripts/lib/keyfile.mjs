// Guards for private-key paths: keys must live outside this repository and
// outside any git work tree, so they cannot be committed by accident.

import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { REPO_ROOT } from './cli.mjs'

/** True when `path` is inside `root` (or equal to it). */
export function isInside(root, path) {
  const rel = relative(resolve(root), resolve(path))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** The git work-tree root containing `path` (or its nearest existing parent directory), or null. */
export function gitWorkTreeOf(path) {
  let dir = resolve(path)
  while (!existsSync(dir) || !statSync(dir).isDirectory()) {
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return top || null
  } catch {
    return null
  }
}

/** Throws when a key path is inside this repository or any git work tree. */
export function assertKeyPathOutsideRepos(path) {
  if (isInside(REPO_ROOT, path)) throw new Error('the key path is inside this repository; keep signing keys outside it')
  const tree = gitWorkTreeOf(path)
  if (tree) throw new Error('the key path is inside a git work tree; keep signing keys outside any repository')
}
