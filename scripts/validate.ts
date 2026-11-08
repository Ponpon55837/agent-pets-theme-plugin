#!/usr/bin/env node
// Validates the package folder (default src/) against the panel-theme rules
// and prints a per-theme, per-mode contrast summary.
// Usage: node scripts/validate.ts [folder] [--quiet]

import { resolve } from 'node:path'
import { cliArgs, die, SRC_DIR, errorMessage } from './lib/cli.ts'
import { collectFiles, describeThemes, validatePackage, type PackageResult } from './lib/package.ts'

const { options, positionals } = cliArgs({ boolean: ['quiet'] }, 'node scripts/validate.ts [folder] [--quiet]')
if (positionals.length > 1) die(`expected at most one folder, got ${positionals.length}`)
const dir = positionals[0] ? resolve(positionals[0]) : SRC_DIR
let result: PackageResult
try {
  result = validatePackage(collectFiles(dir))
} catch (error) {
  die(errorMessage(error))
}
if (!options.quiet) for (const line of describeThemes(result)) console.log(line)
for (const warning of result.warnings) console.warn(`warning: ${warning}`)
if (!result.ok || !result.manifest) {
  for (const error of result.errors) console.error(`error: ${error}`)
  console.error(`\n${result.errors.length} problem(s); the package would be rejected.`)
  process.exit(1)
}
console.log(`\nok: ${result.manifest.id}@${result.manifest.version}, ${result.themes.length} themes, ${result.fileCount} files, ${result.totalBytes} bytes`)
