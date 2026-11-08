// Package signatures as described in the Agent Pets plugin signing guide:
// sorted "<path>\t<sha256 hex>\n" lines over every file except the root
// signature.json, signed with Ed25519. node:crypto only.

import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto'

/** A package as Map<package-relative path, bytes>. */
export type PackageFiles = Map<string, Uint8Array>

export const SIGNATURE_FILE = 'signature.json'
/** The app refuses a larger signature.json (plugin-signature.ts). */
export const SIGNATURE_MAX_BYTES = 4 * 1024
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** The exact bytes that are signed. */
export function signaturePayload(files: PackageFiles): Buffer {
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
export function fingerprint(rawPublicKey: Uint8Array): string {
  return sha256Hex(rawPublicKey).slice(0, 16)
}

export function formatFingerprint(value: string): string {
  return (value.match(/.{4}/g) ?? []).join(' ')
}

/** Loads an Ed25519 private key from PEM (PKCS#8) bytes. Throws if it is not Ed25519. */
export function loadPrivateKey(pem: Buffer | string): KeyObject {
  const key = createPrivateKey(pem)
  if (key.asymmetricKeyType !== 'ed25519') throw new Error(`signing key must be Ed25519, got ${key.asymmetricKeyType}`)
  return key
}

export function rawPublicKeyOf(privateKey: KeyObject): Buffer {
  return createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32)
}

/** Returns the signature.json bytes for the given files and key. */
export interface SignatureFile {
  bytes: Buffer
  rawPublicKey: Buffer
  fingerprint: string
}

export function createSignatureFile(files: PackageFiles, privateKey: KeyObject): SignatureFile {
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
function canonicalBase64(value: unknown, length: number): Buffer | null {
  if (typeof value !== 'string' || value.length > 128 || !BASE64.test(value)) return null
  const decoded = Buffer.from(value, 'base64')
  return decoded.length === length && decoded.toString('base64') === value ? decoded : null
}

/**
 * Verifies signature.json inside `files`. Returns
 * { signed: false } | { signed: true, valid: true, fingerprint } | { signed: true, valid: false, reason }.
 */
export type SignatureCheck =
  | { signed: false, valid?: undefined, fingerprint?: undefined, publicKey?: undefined, reason?: undefined }
  | { signed: true, valid: true, fingerprint: string, publicKey: string, reason?: undefined }
  | { signed: true, valid: false, reason: string, fingerprint?: undefined, publicKey?: undefined }

export function verifySignature(files: PackageFiles): SignatureCheck {
  const bytes = files.get(SIGNATURE_FILE)
  if (!bytes) return { signed: false }
  const invalid = (reason: string): SignatureCheck => ({ signed: true, valid: false, reason })
  if (bytes.length > SIGNATURE_MAX_BYTES) return invalid(`signature.json is larger than ${SIGNATURE_MAX_BYTES} bytes`)
  let document: unknown
  try {
    document = JSON.parse(UTF8.decode(bytes))
  } catch {
    return invalid('signature.json is not valid UTF-8 JSON')
  }
  if (typeof document !== 'object' || document === null || Array.isArray(document)) return invalid('signature.json must be an object')
  const fields = document as Record<string, unknown>
  const keys = Object.keys(fields).sort()
  if (keys.join(',') !== 'alg,publicKey,signature') return invalid('signature.json must have exactly alg, publicKey and signature')
  if (fields.alg !== 'ed25519') return invalid('unknown signature algorithm')
  const publicKey = canonicalBase64(fields.publicKey, 32)
  const signature = canonicalBase64(fields.signature, 64)
  if (!publicKey) return invalid('publicKey must be canonical base64 of 32 bytes')
  if (!signature) return invalid('signature must be canonical base64 of 64 bytes')
  let valid: boolean
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, publicKey]), format: 'der', type: 'spki' })
    valid = verify(null, signaturePayload(files), key, signature)
  } catch {
    return invalid('publicKey is not a usable Ed25519 key')
  }
  return valid
    ? { signed: true, valid: true, fingerprint: fingerprint(publicKey), publicKey: fields.publicKey as string }
    : invalid('signature does not match the package contents')
}
