#!/usr/bin/env node
// Validates src/ and writes an UNSIGNED deterministic archive to
// dist/unsigned/<id>-<version>.agentpet-plugin. Use `npm run sign` for the
// signed archive you publish.
// Usage: node scripts/build.mjs [--src <folder>] [--out <dir>]

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { archiveName, buildArchive, ValidationError } from './lib/build.mjs'
import { DIST_DIR, die, parseArgs, REPO_ROOT, SRC_DIR } from './lib/cli.mjs'
import { describeThemes } from './lib/package.mjs'
import { sha256Hex } from './lib/signature.mjs'

const { options } = parseArgs(process.argv.slice(2))
const src = options.src ? resolve(options.src) : SRC_DIR
const outDir = options.out ? resolve(options.out) : join(DIST_DIR, 'unsigned')

let built
try {
  built = buildArchive(src)
} catch (error) {
  if (error instanceof ValidationError) die(error.message)
  throw error
}
for (const line of describeThemes(built.result)) console.log(line)
for (const warning of built.result.warnings) console.warn(`warning: ${warning}`)
mkdirSync(outDir, { recursive: true })
const target = join(outDir, archiveName(built.result.manifest))
writeFileSync(target, built.bytes)
console.log(`\nunsigned package: ${relative(REPO_ROOT, target)}`)
console.log(`files:  ${built.files.size}`)
console.log(`size:   ${built.bytes.length} bytes`)
console.log(`sha256: ${sha256Hex(built.bytes)}`)
