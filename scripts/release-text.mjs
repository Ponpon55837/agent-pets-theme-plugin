#!/usr/bin/env node
// Prints the text of a release, built only from a signed archive (which must
// be signed by the key pinned in publisher.json) and, for the notes, the tag
// message with its signature block removed.
//
// Usage: node scripts/release-text.mjs title|commit --archive <archive>
//        node scripts/release-text.mjs notes --archive <archive> [--tag-message <file>]
//        node scripts/release-text.mjs pr-title --archive <archive>
//        node scripts/release-text.mjs pr-body --archive <archive> --run-url <https URL> --release-url <https URL>

import { resolve } from 'node:path'
import { loadArchive } from './lib/archive.mjs'
import { cliArgs, die } from './lib/cli.mjs'
import { readRegularFile } from './lib/files.mjs'
import { catalogCommitMessage, catalogPullRequestBody, catalogPullRequestTitle, readPublisher, releaseFacts, releaseNotes, releaseTitle } from './lib/release.mjs'

/** GitHub's tag message limit is far below this; a larger file is not a tag message. */
const TAG_MESSAGE_MAX_BYTES = 64 * 1024
const USAGE = 'node scripts/release-text.mjs title|commit|notes|pr-title|pr-body --archive <archive> [--tag-message <file>] [--run-url <url> --release-url <url>]'
const { options, positionals } = cliArgs({ string: ['archive', 'tag-message', 'run-url', 'release-url'] }, USAGE)
const [kind] = positionals
const allowed = { title: [], commit: [], notes: ['tag-message'], 'pr-title': [], 'pr-body': ['run-url', 'release-url'] }
if (positionals.length !== 1 || !Object.hasOwn(allowed, kind) || !options.archive) die(`usage: ${USAGE}`)
const extra = Object.keys(options).find(name => name !== 'archive' && !allowed[kind].includes(name))
if (extra) die(`--${extra} does not apply to ${kind}; usage: ${USAGE}`)
if (kind === 'pr-body' && (!options['run-url'] || !options['release-url'])) die(`pr-body needs --run-url and --release-url; usage: ${USAGE}`)

try {
  const facts = releaseFacts(loadArchive(resolve(options.archive)), readPublisher().publicKeyFingerprint)
  const text = {
    title: () => `${releaseTitle(facts)}\n`,
    commit: () => `${catalogCommitMessage(facts)}\n`,
    notes: () => releaseNotes(facts, options['tag-message'] ? readRegularFile(resolve(options['tag-message']), TAG_MESSAGE_MAX_BYTES, 'the tag message').bytes.toString('utf8') : ''),
    'pr-title': () => `${catalogPullRequestTitle(facts)}\n`,
    'pr-body': () => catalogPullRequestBody(facts, { runUrl: options['run-url'], releaseUrl: options['release-url'] }),
  }
  process.stdout.write(text[kind]())
} catch (error) {
  die(error.message)
}
