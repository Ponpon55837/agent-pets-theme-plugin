#!/usr/bin/env node
// Validates the package folder (default src/) against the panel-theme rules
// and prints a per-theme, per-mode contrast summary.
// Usage: node scripts/validate.mjs [folder] [--quiet]

import { resolve } from 'node:path'
import { parseArgs, SRC_DIR } from './lib/cli.mjs'
import { collectFiles, describeThemes, validatePackage } from './lib/package.mjs'

const { options, positionals } = parseArgs(process.argv.slice(2))
const dir = positionals[0] ? resolve(positionals[0]) : SRC_DIR
let result
try {
  result = validatePackage(collectFiles(dir))
} catch (error) {
  console.error(`error: ${error.message}`)
  process.exit(1)
}
if (!options.quiet) for (const line of describeThemes(result)) console.log(line)
for (const warning of result.warnings) console.warn(`warning: ${warning}`)
if (!result.ok) {
  for (const error of result.errors) console.error(`error: ${error}`)
  console.error(`\n${result.errors.length} problem(s); the package would be rejected.`)
  process.exit(1)
}
console.log(`\nok: ${result.manifest.id}@${result.manifest.version}, ${result.themes.length} themes, ${result.fileCount} files, ${result.totalBytes} bytes`)
