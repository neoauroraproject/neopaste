import { pbkdf2 } from '@noble/hashes/pbkdf2.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { gcm } from '@noble/ciphers/aes.js'

const te = new TextEncoder()
const td = new TextDecoder()
const ITERATIONS = 210000

function b64encode(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64decode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function purposeSalt(salt, purpose) {
  const p = te.encode(purpose)
  const out = new Uint8Array(salt.length + p.length)
  out.set(salt, 0)
  out.set(p, salt.length)
  return out
}

function deriveBits(password, salt, purpose) {
  return pbkdf2(sha256, te.encode(password), purposeSalt(salt, purpose), {
    c: ITERATIONS,
    dkLen: 32,
  })
}

function randomBytes(n) {
  const out = new Uint8Array(n)
  crypto.getRandomValues(out)
  return out
}

/** Random passphrase when user disables custom password (embedded in URL hash). */
export function randomPassphrase() {
  return b64encode(randomBytes(18))
}

export async function encryptPaste(plaintext, password) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = deriveBits(password, salt, 'enc')
  const aes = gcm(key, iv)
  const ciphertext = aes.encrypt(te.encode(plaintext))
  const verifyBits = deriveBits(password, salt, 'verify')
  return {
    ciphertext: b64encode(ciphertext),
    salt: b64encode(salt),
    iv: b64encode(iv),
    password_verify: b64encode(verifyBits),
  }
}

export async function decryptPaste({ ciphertext, salt, iv }, password) {
  const key = deriveBits(password, b64decode(salt), 'enc')
  const aes = gcm(key, b64decode(iv))
  const plain = aes.decrypt(b64decode(ciphertext))
  return td.decode(plain)
}

export async function passwordVerify(password, saltB64) {
  const bits = deriveBits(password, b64decode(saltB64), 'verify')
  return b64encode(bits)
}
