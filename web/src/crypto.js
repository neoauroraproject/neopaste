const te = new TextEncoder()
const td = new TextDecoder()

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

async function deriveBits(password, salt, purpose) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    te.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const purposeSalt = new Uint8Array(salt.length + purpose.length)
  purposeSalt.set(salt, 0)
  purposeSalt.set(te.encode(purpose), salt.length)
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: purposeSalt, iterations: 210000, hash: 'SHA-256' },
    baseKey,
    256,
  )
}

async function deriveAesKey(password, salt) {
  const bits = await deriveBits(password, salt, 'enc')
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encryptPaste(plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(password, salt)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    te.encode(plaintext),
  )
  const verifyBits = await deriveBits(password, salt, 'verify')
  return {
    ciphertext: b64encode(ciphertext),
    salt: b64encode(salt),
    iv: b64encode(iv),
    password_verify: b64encode(verifyBits),
  }
}

export async function decryptPaste({ ciphertext, salt, iv }, password) {
  const key = await deriveAesKey(password, b64decode(salt))
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(iv) },
    key,
    b64decode(ciphertext),
  )
  return td.decode(plain)
}

export async function passwordVerify(password, saltB64) {
  const bits = await deriveBits(password, b64decode(saltB64), 'verify')
  return b64encode(bits)
}
