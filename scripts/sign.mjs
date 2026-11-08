#!/usr/bin/env node
// Validates src/, signs the exact package files with Ed25519 and writes the
// signed archive to dist/<id>-<version>.agentpet-plugin (signature.json is
// added at the archive root; src/ is not modified).
//
// The private key (PKCS#8 PEM) is read from the path given by --key or the
// AGENT_PETS_SIGNING_KEY environment variable. There is no default path, and
// keys inside this repository or any git work tree are refused.
//
// Usage: AGENT_PETS_SIGNING_KEY=/path/outside/repo/key.pem node scripts/sign.mjs
//        node scripts/sign.mjs --key /path/outside/repo/key.pem [--src <folder>] [--out <dir>]

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { archiveName, buildArchive } from './lib/build.mjs'
import { cliArgs, DIST_DIR, die, REPO_ROOT, SRC_DIR } from './lib/cli.mjs'
import { assertKeyPathOutsideRepos } from './lib/keyfile.mjs'
import { formatFingerprint, loadPrivateKey, sha256Hex, verifySignature } from './lib/signature.mjs'

const USAGE = 'node scripts/sign.mjs [--key <path>] [--src <folder>] [--out <dir>]'
const { options, positionals } = cliArgs({ string: ['key', 'src', 'out'] }, USAGE)
if (positionals.length > 0) die(`unexpected argument ${positionals[0]}; usage: ${USAGE}`)
const keyOption = options.key ?? process.env.AGENT_PETS_SIGNING_KEY
if (!keyOption) die('no signing key: pass --key <path> or set AGENT_PETS_SIGNING_KEY to the private key path')
const keyPath = resolve(keyOption)
try {
  assertKeyPathOutsideRepos(keyPath)
} catch (error) {
  die(error.message)
}

let privateKey
try {
  const stat = statSync(keyPath)
  if (!stat.isFile()) die('the signing key path is not a regular file')
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) console.warn('warning: the signing key is readable by other users; run chmod 600 on it')
  privateKey = loadPrivateKey(readFileSync(keyPath))
} catch (error) {
  die(`cannot load the signing key: ${error.message}`)
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
console.log(`files:       ${built.files.size}`)
console.log(`size:        ${built.bytes.length} bytes`)
console.log(`sha256:      ${sha256Hex(built.bytes)}`)
console.log(`public key:  ${check.publicKey}`)
console.log(`fingerprint: ${check.fingerprint} (${formatFingerprint(check.fingerprint)})`)
