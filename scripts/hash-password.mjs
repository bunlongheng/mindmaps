// Generates a MINDMAP_AUTH_PASSWORD_HASH value in the salted PBKDF2 format api/auth.ts expects.
// Run: node scripts/hash-password.mjs '<your password>'
import { webcrypto as crypto } from 'node:crypto'

const ITERATIONS = 310_000

function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

const password = process.argv[2]
if (!password) {
  console.error("Usage: node scripts/hash-password.mjs '<your password>'")
  process.exit(1)
}

const salt = crypto.getRandomValues(new Uint8Array(16))
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256)
const hash = bytesToHex(new Uint8Array(bits))

console.log(`${bytesToHex(salt)}:${ITERATIONS}:${hash}`)
console.log('\nSet this as MINDMAP_AUTH_PASSWORD_HASH in .env.local and Vercel prod env.')
