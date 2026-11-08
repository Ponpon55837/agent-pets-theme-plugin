#!/usr/bin/env node
// Validates src/, signs the exact package files with Ed25519 and writes the
// signed archive to dist/<id>-<version>.agentpet-plugin (signature.json is
// added at the archive root; src/ is not modified).
//
// The private key (PKCS#8 PEM) is read from the path given by --key or the
// AGENT_PETS_SIGNING_KEY environment variable. There is no default path. The
// key must be a regular file (not a symbolic link) outside this repository and
// any git work tree, with no group or other permissions (chmod 600). The key
// is never printed, copied or written anywhere; only the public key is shown.
//
// Usage: AGENT_PETS_SIGNING_KEY=/path/outside/repo/key.pem node scripts/sign.mjs
//        node scripts/sign.mjs --key /path/outside/repo/key.pem [--src <folder>] [--out <dir>]

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { archiveName, archiveSummary, buildArchive } from './lib/build.mjs'
import { cliArgs, DIST_DIR, die, expandHome, REPO_ROOT, SRC_DIR } from './lib/cli.mjs'
import { assertKeyPathOutsideRepos, readPrivateKeyFile } from './lib/keyfile.mjs'
import { formatFingerprint, loadPrivateKey, verifySignature } from './lib/signature.mjs'

const USAGE = 'node scripts/sign.mjs [--key <path>] [--src <folder>] [--out <dir>]'
const { options, positionals } = cliArgs({ string: ['key', 'src', 'out'] }, USAGE)
if (positionals.length > 0) die(`unexpected argument ${positionals[0]}; usage: ${USAGE}`)
const keyOption = options.key ?? process.env.AGENT_PETS_SIGNING_KEY
if (!keyOption) die('no signing key: pass --key <path> or set AGENT_PETS_SIGNING_KEY to the private key path')
const keyPath = resolve(expandHome(keyOption))
let privateKey
try {
  assertKeyPathOutsideRepos(keyPath)
  privateKey = loadPrivateKey(readPrivateKeyFile(keyPath))
} catch (error) {
  die(`cannot use the signing key: ${error.message}`)
}

const src = options.src ? resolve(options.src) : SRC_DIR
const outDir = options.out ? resolve(options.out) : DIST_DIR
let built
try {
  built = buildArchive(src, { privateKey })
} catch (error) {
  die(error.message)
}
const check = verifySignature(built.files)
if (!check.valid) die(`self-check failed: ${check.reason}`)

mkdirSync(outDir, { recursive: true })
const target = join(outDir, archiveName(built.result.manifest))
writeFileSync(target, built.bytes)
console.log(`signed package: ${relative(REPO_ROOT, target)}`)
for (const line of archiveSummary(built)) console.log(line)
console.log(`public key:  ${check.publicKey}`)
console.log(`fingerprint: ${check.fingerprint} (${formatFingerprint(check.fingerprint)})`)
