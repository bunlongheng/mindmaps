// Shared auth: HMAC-SHA256 signed session tokens + password hashing.
// Uses Web Crypto (globalThis.crypto), available in both Vercel edge and node runtimes.
// Files under api/_lib are NOT treated as routes by Vercel (underscore prefix).

const enc = new TextEncoder()

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const byte of b) s += String.fromCharCode(byte)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Compare two secrets without leaking their contents via timing: compare SHA-256 digests,
// so the comparison time is independent of the secret bytes.
export async function secretEquals(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false
  return (await sha256Hex(a)) === (await sha256Hex(b))
}

const PBKDF2_ITERATIONS = 310_000

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

async function pbkdf2Hex(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256)
  return bytesToHex(new Uint8Array(bits))
}

// Stored format: "salt-hex:iterations:hash-hex" (see scripts/hash-password.mjs to generate one).
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2Hex(password, salt, PBKDF2_ITERATIONS)
  return `${bytesToHex(salt)}:${PBKDF2_ITERATIONS}:${hash}`
}

// Verifies against the "salt:iterations:hash" format. Compares digests (via secretEquals)
// rather than the raw hex so match time doesn't leak how many characters matched.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':')
  if (parts.length !== 3) return false
  const [saltHex, iterStr, hashHex] = parts
  const iterations = Number(iterStr)
  if (!saltHex || !hashHex || !Number.isFinite(iterations) || iterations <= 0) return false
  const candidate = await pbkdf2Hex(password, hexToBytes(saltHex), iterations)
  return secretEquals(candidate, hashHex)
}

export type TokenPayload = { sub: string; email: string; role: string; iat: number; exp: number }

export async function signToken(
  claims: Omit<TokenPayload, 'exp' | 'iat'>,
  secret: string,
  expSeconds = 60 * 60 * 24, // 24h - a stolen token now dies fast; see MINDMAP_TOKEN_MIN_IAT below for instant revocation.
): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + expSeconds
  const payload = b64url(enc.encode(JSON.stringify({ ...claims, iat, exp })))
  const data = `${header}.${payload}`
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data))
  return `${data}.${b64url(sig)}`
}

// Returns the verified payload, or null if the signature is bad, expired, malformed, or was
// issued before MINDMAP_TOKEN_MIN_IAT (set that env var to a future unix timestamp to
// instantly revoke every outstanding session - e.g. after a suspected token leak).
export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  if (!token || !secret) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, sig] = parts
  let ok = false
  try {
    ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(`${header}.${payload}`))
  } catch { return null }
  if (!ok) return null
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as TokenPayload
    if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null
    const minIat = Number(process.env.MINDMAP_TOKEN_MIN_IAT ?? '')
    if (Number.isFinite(minIat) && minIat > 0 && (!claims.iat || claims.iat < minIat)) return null
    return claims
  } catch { return null }
}

// Extract the bearer token from a node (req.headers.authorization) or edge (req.headers.get) request.
export function bearer(headers: unknown): string {
  const h = headers as { get?: (k: string) => string | null; authorization?: string }
  const raw = typeof h?.get === 'function' ? h.get('authorization') : h?.authorization
  return (raw ?? '').replace(/^Bearer\s+/i, '').trim()
}
