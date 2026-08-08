// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import {
  sha256Hex, secretEquals, hashPassword, verifyPassword,
  signToken, verifyToken, bearer,
} from '../auth'

describe('sha256Hex / secretEquals', () => {
  it('hashes deterministically', async () => {
    expect(await sha256Hex('hello')).toBe(await sha256Hex('hello'))
  })

  it('secretEquals matches equal secrets and rejects different ones', async () => {
    expect(await secretEquals('foo', 'foo')).toBe(true)
    expect(await secretEquals('foo', 'bar')).toBe(false)
  })

  it('secretEquals rejects empty inputs', async () => {
    expect(await secretEquals('', 'foo')).toBe(false)
    expect(await secretEquals('foo', '')).toBe(false)
    expect(await secretEquals('', '')).toBe(false)
  })
})

describe('hashPassword / verifyPassword', () => {
  it('verifies the correct password', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true)
  })

  it('rejects the wrong password', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('wrong password', stored)).toBe(false)
  })

  it('produces a distinct salt per call (same password, different stored hash)', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    expect(a).not.toBe(b)
  })

  it('stores salt:iterations:hash', async () => {
    const stored = await hashPassword('x')
    const parts = stored.split(':')
    expect(parts).toHaveLength(3)
    expect(Number(parts[1])).toBeGreaterThan(0)
  })

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('x', 'not-the-right-format')).toBe(false)
    expect(await verifyPassword('x', 'a:b')).toBe(false)
    expect(await verifyPassword('x', ':1000:abcd')).toBe(false)
    expect(await verifyPassword('x', 'abcd:0:abcd')).toBe(false)
    expect(await verifyPassword('x', 'abcd:notanumber:abcd')).toBe(false)
  })
})

describe('signToken / verifyToken', () => {
  const secret = 'test-secret'
  const claims = { sub: 'user-1', email: 'a@b.com', role: 'authenticated' }

  it('round-trips valid claims', async () => {
    const token = await signToken(claims, secret)
    const verified = await verifyToken(token, secret)
    expect(verified?.sub).toBe('user-1')
    expect(verified?.email).toBe('a@b.com')
  })

  it('stamps iat and exp', async () => {
    const before = Math.floor(Date.now() / 1000)
    const token = await signToken(claims, secret, 3600)
    const verified = await verifyToken(token, secret)
    expect(verified!.iat).toBeGreaterThanOrEqual(before)
    expect(verified!.exp).toBe(verified!.iat + 3600)
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signToken(claims, secret)
    expect(await verifyToken(token, 'wrong-secret')).toBeNull()
  })

  it('rejects a tampered payload (signature no longer matches)', async () => {
    const token = await signToken(claims, secret)
    const [header, , sig] = token.split('.')
    const tamperedPayload = Buffer.from(JSON.stringify({ ...claims, sub: 'attacker', iat: 0, exp: 9999999999 })).toString('base64url')
    expect(await verifyToken(`${header}.${tamperedPayload}.${sig}`, secret)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await signToken(claims, secret, -10) // already expired
    expect(await verifyToken(token, secret)).toBeNull()
  })

  it('rejects malformed tokens', async () => {
    expect(await verifyToken('not.a.jwt.at.all', secret)).toBeNull()
    expect(await verifyToken('only-one-part', secret)).toBeNull()
    expect(await verifyToken('', secret)).toBeNull()
    expect(await verifyToken('a.b.c', secret)).toBeNull()
  })

  it('rejects malformed base64url in the signature without throwing', async () => {
    const token = await signToken(claims, secret)
    const [header, payload] = token.split('.')
    expect(await verifyToken(`${header}.${payload}.not-valid-base64!!!`, secret)).toBeNull()
  })

  it('returns null for empty token or empty secret', async () => {
    const token = await signToken(claims, secret)
    expect(await verifyToken('', secret)).toBeNull()
    expect(await verifyToken(token, '')).toBeNull()
  })

  describe('MINDMAP_TOKEN_MIN_IAT revocation', () => {
    afterEach(() => { delete process.env.MINDMAP_TOKEN_MIN_IAT })

    it('accepts a token issued after the cutoff', async () => {
      const token = await signToken(claims, secret)
      process.env.MINDMAP_TOKEN_MIN_IAT = String(Math.floor(Date.now() / 1000) - 3600)
      expect(await verifyToken(token, secret)).not.toBeNull()
    })

    it('rejects a token issued before the cutoff', async () => {
      const token = await signToken(claims, secret)
      process.env.MINDMAP_TOKEN_MIN_IAT = String(Math.floor(Date.now() / 1000) + 3600)
      expect(await verifyToken(token, secret)).toBeNull()
    })

    it('is a no-op when unset', async () => {
      const token = await signToken(claims, secret)
      expect(await verifyToken(token, secret)).not.toBeNull()
    })
  })
})

describe('bearer', () => {
  it('extracts from a node-style headers object', () => {
    expect(bearer({ authorization: 'Bearer abc123' })).toBe('abc123')
  })

  it('extracts from an edge-style Headers-like object with .get()', () => {
    const headers = { get: (k: string) => (k === 'authorization' ? 'Bearer xyz789' : null) }
    expect(bearer(headers)).toBe('xyz789')
  })

  it('is case-insensitive on the Bearer prefix', () => {
    expect(bearer({ authorization: 'bearer lower-case' })).toBe('lower-case')
  })

  it('trims trailing whitespace after the token', () => {
    expect(bearer({ authorization: 'Bearer   spaced  ' })).toBe('spaced')
  })

  it('returns empty string when there is no authorization header', () => {
    expect(bearer({})).toBe('')
    expect(bearer({ get: () => null })).toBe('')
  })
})
