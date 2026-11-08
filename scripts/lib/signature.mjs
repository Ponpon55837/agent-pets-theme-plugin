// Package signatures as described in the Agent Pets plugin signing guide:
// sorted "<path>\t<sha256 hex>\n" lines over every file except the root
// signature.json, signed with Ed25519. node:crypto only.

import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'

export const SIGNATURE_FILE = 'signature.json'
/** The app refuses a larger signature.json (plugin-signature.ts). */
export const SIGNATURE_MAX_BYTES = 4 * 1024
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/** The exact bytes that are signed. */
export function signaturePayload(files) {
  return Buffer.from(
    [...files.entries()]
      .filter(([path]) => path !== SIGNATURE_FILE)
      .sort(([a], [b]) => compare(a, b))
      .map(([path, bytes]) => `${path}\t${sha256Hex(bytes)}\n`)
      .join(''),
    'utf8',
  )
}

/** First 16 lowercase hex characters of SHA-256 over the raw 32-byte public key. */
export function fingerprint(rawPublicKey) {
  return sha256Hex(rawPublicKey).slice(0, 16)
}

export function formatFingerprint(value) {
  return value.match(/.{4}/g).join(' ')
}

/** Loads an Ed25519 private key from PEM (PKCS#8) bytes. Throws if it is not Ed25519. */
export function loadPrivateKey(pem) {
  const key = createPrivateKey(pem)
  if (key.asymmetricKeyType !== 'ed25519') throw new Error(`signing key must be Ed25519, got ${key.asymmetricKeyType}`)
  return key
}

export function rawPublicKeyOf(privateKey) {
  return createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32)
}

/** Returns the signature.json bytes for the given files and key. */
export function createSignatureFile(files, privateKey) {
  const payload = signaturePayload(files)
  const rawPublicKey = rawPublicKeyOf(privateKey)
  const signature = sign(null, payload, privateKey)
  const bytes = Buffer.from(JSON.stringify({
    alg: 'ed25519',
    publicKey: rawPublicKey.toString('base64'),
    signature: signature.toString('base64'),
  }), 'utf8')
  return { bytes, rawPublicKey, fingerprint: fingerprint(rawPublicKey) }
}

const UTF8 = new TextDecoder('utf-8', { fatal: true })
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/** Same rule as the app: padded, canonical base64 of exactly `length` bytes. */
function canonicalBase64(value, length) {
  if (typeof value !== 'string' || value.length > 128 || !BASE64.test(value)) return null
  const decoded = Buffer.from(value, 'base64')
  return decoded.length === length && decoded.toString('base64') === value ? decoded : null
}

/**
 * Verifies signature.json inside `files`. Returns
 * { signed: false } | { signed: true, valid: true, fingerprint } | { signed: true, valid: false, reason }.
 */
export function verifySignature(files) {
  const bytes = files.get(SIGNATURE_FILE)
  if (!bytes) return { signed: false }
  const invalid = reason => ({ signed: true, valid: false, reason })
  if (bytes.length > SIGNATURE_MAX_BYTES) return invalid(`signature.json is larger than ${SIGNATURE_MAX_BYTES} bytes`)
  let document
  try {
    document = JSON.parse(UTF8.decode(bytes))
  } catch {
    return invalid('signature.json is not valid UTF-8 JSON')
  }
  if (typeof document !== 'object' || document === null || Array.isArray(document)) return invalid('signature.json must be an object')
  const keys = Object.keys(document).sort()
  if (keys.join(',') !== 'alg,publicKey,signature') return invalid('signature.json must have exactly alg, publicKey and signature')
  if (document.alg !== 'ed25519') return invalid('unknown signature algorithm')
  const publicKey = canonicalBase64(document.publicKey, 32)
  const signature = canonicalBase64(document.signature, 64)
  if (!publicKey) return invalid('publicKey must be canonical base64 of 32 bytes')
  if (!signature) return invalid('signature must be canonical base64 of 64 bytes')
  let valid
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, publicKey]), format: 'der', type: 'spki' })
    valid = verify(null, signaturePayload(files), key, signature)
  } catch {
    return invalid('publicKey is not a usable Ed25519 key')
  }
  return valid
    ? { signed: true, valid: true, fingerprint: fingerprint(publicKey), publicKey: document.publicKey }
    : invalid('signature does not match the package contents')
}
