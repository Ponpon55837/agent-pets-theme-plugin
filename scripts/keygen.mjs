#!/usr/bin/env node
// Generates an Ed25519 signing key (PKCS#8 PEM). Run once per publisher key.
// Refuses any --out inside this repository or a git work tree, never
// overwrites an existing file, and writes the key with mode 0600 in a
// directory created with mode 0700. Back the key up offline; never commit it
// or put it in CI.
//
// Usage: node scripts/keygen.mjs --out ~/.agent-pets/keys/panel-theme-collection.ed25519.pem

import { generateKeyPairSync } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { cliArgs, die } from './lib/cli.mjs'
import { assertKeyPathOutsideRepos } from './lib/keyfile.mjs'
import { fingerprint, formatFingerprint, rawPublicKeyOf } from './lib/signature.mjs'

const { options, positionals } = cliArgs({ string: ['out'] }, 'node scripts/keygen.mjs --out <path outside any repository>')
if (!options.out || positionals.length > 0) die('pass --out <path outside any repository>')
const out = resolve(options.out.replace(/^~(?=\/|$)/, homedir()))
try {
  assertKeyPathOutsideRepos(out)
} catch (error) {
  die(error.message)
}

const { privateKey } = generateKeyPairSync('ed25519')
mkdirSync(dirname(out), { recursive: true, mode: 0o700 })
try {
  writeFileSync(out, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' })
} catch (error) {
  die(error.code === 'EEXIST' ? 'the output file already exists; refusing to overwrite a key' : `cannot write the key: ${error.message}`)
}
const raw = rawPublicKeyOf(privateKey)
const print = fingerprint(raw)
console.log(`private key written (mode 0600). Back it up offline.`)
console.log(`public key:  ${raw.toString('base64')}`)
console.log(`fingerprint: ${print} (${formatFingerprint(print)})`)
