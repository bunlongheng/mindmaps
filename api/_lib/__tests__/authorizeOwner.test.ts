import { describe, it, expect, beforeEach } from 'vitest'
import { authorizeOwner } from '../authorizeOwner'
import { signToken } from '../auth'

const KEY = 'static-agent-key-abc123'
const SECRET = 'jwt-signing-secret'
const OWNER_EMAIL = 'owner@example.com'
const OWNER_ID = 'owner-uuid-1'

beforeEach(() => {
  process.env.VERCEL_ENV = 'production'   // force the local-dev bypass OFF
  process.env.NODE_ENV = 'production'
  process.env.MINDMAP_AI_API_KEY = KEY
  process.env.MINDMAP_JWT_SECRET = SECRET
  process.env.MINDMAP_AUTH_EMAIL = OWNER_EMAIL
  process.env.MINDMAP_USER_ID = OWNER_ID
})

const h = (authorization?: string) => ({ authorization })

describe('authorizeOwner', () => {
  it('accepts the static Bearer key on the public render endpoint (allowBearer:true)', async () => {
    expect(await authorizeOwner(h(`Bearer ${KEY}`), { allowBearer: true })).toBe(true)
  })

  // The important guarantee: a valid Bearer key must NOT be able to trigger AI spend.
  it('REJECTS a valid Bearer key when allowBearer is false (generate = admin only)', async () => {
    expect(await authorizeOwner(h(`Bearer ${KEY}`), { allowBearer: false })).toBe(false)
  })

  it('rejects a wrong Bearer key', async () => {
    expect(await authorizeOwner(h('Bearer not-the-key'), { allowBearer: true })).toBe(false)
  })

  it('rejects a request with no Authorization header', async () => {
    expect(await authorizeOwner(h(undefined), { allowBearer: true })).toBe(false)
  })

  it('accepts the owner session JWT even on an admin-only route', async () => {
    const token = await signToken({ sub: OWNER_ID, email: OWNER_EMAIL, role: 'authenticated' }, SECRET)
    expect(await authorizeOwner(h(`Bearer ${token}`), { allowBearer: false })).toBe(true)
  })

  it('rejects a valid JWT signed for a non-owner email', async () => {
    const token = await signToken({ sub: 'x', email: 'stranger@example.com', role: 'authenticated' }, SECRET)
    expect(await authorizeOwner(h(`Bearer ${token}`), { allowBearer: true })).toBe(false)
  })
})
