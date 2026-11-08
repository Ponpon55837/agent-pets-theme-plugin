// Small helpers shared by the command-line scripts.

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SRC_DIR = resolve(REPO_ROOT, 'src')
export const DIST_DIR = resolve(REPO_ROOT, 'dist')

/** Parses `--name value`, `--name=value` and `--flag` arguments plus positionals. */
export function parseArgs(argv) {
  const options = {}
  const positionals = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      positionals.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    if (eq > 0) options[arg.slice(2, eq)] = arg.slice(eq + 1)
    else if (index + 1 < argv.length && !argv[index + 1].startsWith('--')) options[arg.slice(2)] = argv[++index]
    else options[arg.slice(2)] = true
  }
  return { options, positionals }
}

export function die(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}
