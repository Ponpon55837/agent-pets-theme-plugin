#!/usr/bin/env node
// Keeps scripts/lib/rules/app/ a byte-for-byte copy of the Agent Pets panel-theme
// validator at one pinned app commit (scripts/lib/rules/vendor.json).
//
//   node scripts/sync-rules.ts --app <agent-pets checkout> --check
//       compares the vendored files with the pinned commit (exit 1 on drift)
//   node scripts/sync-rules.ts --app <agent-pets checkout> --commit <rev>
//       copies the files from <rev> and pins vendor.json to its full hash
//
// Files are read with `git show <commit>:<path>`, so uncommitted edits in the
// checkout are never vendored. Without --app only the recorded hashes are checked.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cliArgs, die, gitFreeEnv } from './lib/cli.ts'
import { RULES_DIR, VENDOR_FILE, readVendorManifest, vendoredDrift } from './lib/rules/vendor.ts'
import { sha256Hex } from './lib/signature.ts'

const USAGE = 'node scripts/sync-rules.ts [--app <agent-pets checkout> [--check | --commit <rev>]]'
const { options, positionals } = cliArgs({ boolean: ['check'], string: ['app', 'commit'] }, USAGE)
if (positionals.length > 0) die(`unexpected argument ${positionals[0]}; usage: ${USAGE}`)
if (options.check && options.commit) die('--check and --commit are exclusive')
if (options.commit && !options.app) die('--commit needs --app')

const manifest = readVendorManifest()
// The checkout's own git config applies, but never GIT_* from this shell.
const gitEnv = gitFreeEnv()
function git(app: string, args: string[]): Buffer {
  try {
    return execFileSync('git', ['-C', app, ...args], { env: gitEnv, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const failure = error as { stderr?: Buffer, message?: string }
    return die(`git ${args[0]} failed: ${failure.stderr?.toString().trim() || failure.message}`)
  }
}
const showAt = (app: string, commit: string, source: string): Buffer => git(app, ['show', `${commit}:${source}`])

if (!options.app) {
  const drift = vendoredDrift(manifest)
  if (drift.length > 0) die(`vendored rules were edited:\n  ${drift.join('\n  ')}`)
  console.log(`ok: ${manifest.files.length} files match vendor.json (app ${manifest.commit.slice(0, 12)})`)
  process.exit(0)
}

const app = resolve(options.app)
if (options.check || !options.commit) {
  const problems = vendoredDrift(manifest)
  for (const file of manifest.files) {
    const upstream = showAt(app, manifest.commit, file.source)
    const local = readFileSync(resolve(RULES_DIR, file.path))
    if (!upstream.equals(local)) problems.push(`${file.path}: differs from ${file.source} at ${manifest.commit.slice(0, 12)}`)
  }
  if (problems.length > 0) die(`drift:\n  ${problems.join('\n  ')}`)
  const head = git(app, ['rev-parse', 'HEAD']).toString().trim()
  const changed = head === manifest.commit
    ? []
    : manifest.files.filter(file => !showAt(app, head, file.source).equals(showAt(app, manifest.commit, file.source))).map(file => file.source)
  console.log(`ok: vendored rules equal app ${manifest.commit.slice(0, 12)}`)
  if (changed.length > 0) console.warn(`warning: app HEAD ${head.slice(0, 12)} changed ${changed.join(', ')}; re-sync with --commit HEAD`)
  process.exit(0)
}

// A revision name only: no options or path syntax can reach git.
if (!/^[A-Za-z0-9][A-Za-z0-9._/~^-]{0,127}$/.test(options.commit)) die('--commit must be a revision name or hash')
const commit = git(app, ['rev-parse', '--verify', '--end-of-options', `${options.commit!}^{commit}`]).toString().trim()
if (!/^[0-9a-f]{40}$/.test(commit)) die(`cannot resolve ${options.commit}`)
const files = manifest.files.map(file => {
  const bytes = showAt(app, commit, file.source)
  const target = resolve(RULES_DIR, file.path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, bytes)
  return { ...file, sha256: sha256Hex(bytes) }
})
writeFileSync(VENDOR_FILE, `${JSON.stringify({ ...manifest, commit, files }, null, 2)}\n`)
console.log(`pinned ${files.length} files to app ${commit}`)
