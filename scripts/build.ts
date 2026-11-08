#!/usr/bin/env node
// Validates src/ and writes an UNSIGNED deterministic archive to
// dist/unsigned/<id>-<version>.agentpet-plugin. Use `pnpm sign` for the
// signed archive you publish.
// Usage: node scripts/build.ts [--src <folder>] [--out <dir>]

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { archiveName, archiveSummary, buildArchive } from './lib/build.ts'
import { cliArgs, DIST_DIR, die, REPO_ROOT, SRC_DIR, errorMessage } from './lib/cli.ts'
import { describeThemes } from './lib/package.ts'

const USAGE = 'node scripts/build.ts [--src <folder>] [--out <dir>]'
const { options, positionals } = cliArgs({ string: ['src', 'out'] }, USAGE)
if (positionals.length > 0) die(`unexpected argument ${positionals[0]}; usage: ${USAGE}`)
const src = options.src ? resolve(options.src) : SRC_DIR
const outDir = options.out ? resolve(options.out) : join(DIST_DIR, 'unsigned')

let built
try {
  built = buildArchive(src)
} catch (error) {
  die(errorMessage(error))
}
for (const line of describeThemes(built.result)) console.log(line)
for (const warning of built.result.warnings) console.warn(`warning: ${warning}`)
mkdirSync(outDir, { recursive: true })
const target = join(outDir, archiveName(built.result.manifest))
writeFileSync(target, built.bytes)
console.log(`\nunsigned package: ${relative(REPO_ROOT, target)}`)
for (const line of archiveSummary(built)) console.log(line)
