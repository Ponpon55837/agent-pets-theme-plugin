#!/usr/bin/env node
// Prints the text of a release, built only from a signed archive (which must
// be signed by the key pinned in publisher.json) and, for the notes, the tag
// message with its signature block removed.
//
// Usage: node scripts/release-text.ts title|commit --archive <archive>
//        node scripts/release-text.ts notes --archive <archive> [--tag-message <file>]
//        node scripts/release-text.ts pr-title --archive <archive>
//        node scripts/release-text.ts pr-body --archive <archive> --run-url <https URL> --release-url <https URL>

import { resolve } from 'node:path'
import { loadArchive } from './lib/archive.ts'
import { cliArgs, die, errorMessage } from './lib/cli.ts'
import { readRegularFile } from './lib/files.ts'
import { catalogCommitMessage, catalogPullRequestBody, catalogPullRequestTitle, readPublisher, releaseFacts, releaseNotes, releaseTitle } from './lib/release.ts'

/** GitHub's tag message limit is far below this; a larger file is not a tag message. */
const TAG_MESSAGE_MAX_BYTES = 64 * 1024
const USAGE = 'node scripts/release-text.ts title|commit|notes|pr-title|pr-body --archive <archive> [--tag-message <file>] [--run-url <url> --release-url <url>]'
const { options, positionals } = cliArgs({ string: ['archive', 'tag-message', 'run-url', 'release-url'] }, USAGE)
/** Each kind of text and the options it takes besides --archive. */
const allowed = { title: [], commit: [], notes: ['tag-message'], 'pr-title': [], 'pr-body': ['run-url', 'release-url'] } satisfies Record<string, string[]>
type Kind = keyof typeof allowed
const isKind = (value: string | undefined): value is Kind => value !== undefined && Object.hasOwn(allowed, value)
const [kindArg] = positionals
if (positionals.length !== 1 || !isKind(kindArg) || !options.archive) die(`usage: ${USAGE}`)
const kind: Kind = kindArg
const archivePath: string = options.archive
const extra = Object.keys(options).find(name => name !== 'archive' && !(allowed[kind] as readonly string[]).includes(name))
if (extra) die(`--${extra} does not apply to ${kind}; usage: ${USAGE}`)
if (kind === 'pr-body' && (!options['run-url'] || !options['release-url'])) die(`pr-body needs --run-url and --release-url; usage: ${USAGE}`)

try {
  const facts = releaseFacts(loadArchive(resolve(archivePath)), readPublisher().publicKeyFingerprint)
  const text: Record<Kind, () => string> = {
    title: () => `${releaseTitle(facts)}\n`,
    commit: () => `${catalogCommitMessage(facts)}\n`,
    notes: () => releaseNotes(facts, options['tag-message'] ? readRegularFile(resolve(options['tag-message']), TAG_MESSAGE_MAX_BYTES, 'the tag message').bytes.toString('utf8') : ''),
    'pr-title': () => `${catalogPullRequestTitle(facts)}\n`,
    'pr-body': () => catalogPullRequestBody(facts, { runUrl: options['run-url'], releaseUrl: options['release-url'] }),
  }
  process.stdout.write(text[kind]())
} catch (error) {
  die(errorMessage(error))
}
