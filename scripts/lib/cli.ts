// Small helpers shared by the command-line scripts.

import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SRC_DIR = resolve(REPO_ROOT, 'src')
export const DIST_DIR = resolve(REPO_ROOT, 'dist')

export class UsageError extends Error {}

/** `~` or `~/…` to the home directory, for paths the shell did not expand (`--key=~/…`, quoted values). */
export function expandHome(path: string): string {
  return path.replace(/^~(?=[\\/]|$)/, homedir())
}

/** process.env without any GIT_* variable (matched case-insensitively), so GIT_DIR and friends cannot redirect git. */
export function gitFreeEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')))
}

/**
 * Parses arguments against a declared option set, in any order.
 * `boolean` flags never take a value (`--flag`), so they never swallow the next
 * positional; `string` options take one (`--name value` or `--name=value`).
 * Unknown, repeated or value-less options throw a UsageError, so a mistyped
 * safety flag such as `--require-signatures` cannot be silently ignored.
 * Everything after `--` is positional.
 */
export interface ArgSpec {
  boolean?: readonly string[]
  string?: readonly string[]
}

export interface ParsedArgs {
  options: Record<string, string | true>
  positionals: string[]
}

export function parseArgs(argv: readonly string[], { boolean = [], string = [] }: ArgSpec = {}): ParsedArgs {
  // Set lookups: O(1) per argument instead of a scan of the declared names.
  const flags = new Set(boolean)
  const valued = new Set(string)
  const options: Record<string, string | true> = {}
  const positionals: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') {
      positionals.push(...argv.slice(index + 1))
      break
    }
    if (!arg.startsWith('-') || arg === '-') {
      positionals.push(arg)
      continue
    }
    if (!arg.startsWith('--')) throw new UsageError(`unknown option ${arg}`)
    const eq = arg.indexOf('=')
    const name = eq > 0 ? arg.slice(2, eq) : arg.slice(2)
    if (Object.hasOwn(options, name)) throw new UsageError(`--${name} is given more than once`)
    if (flags.has(name)) {
      if (eq > 0) throw new UsageError(`--${name} takes no value`)
      options[name] = true
    } else if (valued.has(name)) {
      let value: string | undefined
      if (eq > 0) value = arg.slice(eq + 1)
      else if (index + 1 < argv.length && !argv[index + 1].startsWith('--')) value = argv[++index]
      if (!value) throw new UsageError(`--${name} needs a value`)
      options[name] = value
    } else {
      throw new UsageError(`unknown option --${name}`)
    }
  }
  return { options, positionals }
}

/**
 * Typed view of parsed options: every declared boolean is `true | undefined`,
 * every declared string option is `string | undefined`.
 */
export type CliOptions<B extends string, S extends string> = { [K in B]?: true } & { [K in S]?: string }

/** parseArgs over process.argv that exits with the usage line on a UsageError. */
export function cliArgs<B extends string = never, S extends string = never>(
  spec: { boolean?: readonly B[], string?: readonly S[] },
  usage: string,
): { options: CliOptions<B, S>, positionals: string[] } {
  try {
    const { options, positionals } = parseArgs(process.argv.slice(2), spec)
    return { options: options as CliOptions<B, S>, positionals }
  } catch (error) {
    if (error instanceof UsageError) die(`${error.message}; usage: ${usage}`)
    throw error
  }
}

/**
 * Text that is safe to print in a GitHub Actions log: carriage returns are
 * escaped and no line can start a workflow command (`::name::`), so a value
 * read from a file (a catalog index.json, say) cannot drive the runner.
 */
export function logSafe(text: unknown): string {
  return String(text).replace(/\r/g, '\\r').replace(/^(\s*):(?=:)/gm, '$1: ')
}

export function die(message: string): never {
  console.error(logSafe(`error: ${message}`))
  process.exit(1)
}

/** The message of a caught value (`catch` binds `unknown`). */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
