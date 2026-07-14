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

export type TokenPayload = { sub: string; email: string; role: string; exp: number }

export async function signToken(
  claims: Omit<TokenPayload, 'exp'>,
  secret: string,
  expSeconds = 60 * 60 * 24 * 30,
): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const exp = Math.floor(Date.now() / 1000) + expSeconds
  const payload = b64url(enc.encode(JSON.stringify({ ...claims, exp })))
  const data = `${header}.${payload}`
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data))
  return `${data}.${b64url(sig)}`
}

// Returns the verified payload, or null if the signature is bad, expired, or malformed.
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
    return claims
  } catch { return null }
}

// Extract the bearer token from a node (req.headers.authorization) or edge (req.headers.get) request.
export function bearer(headers: unknown): string {
  const h = headers as { get?: (k: string) => string | null; authorization?: string }
  const raw = typeof h?.get === 'function' ? h.get('authorization') : h?.authorization
  return (raw ?? '').replace(/^Bearer\s+/i, '').trim()
}
