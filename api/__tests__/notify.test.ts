// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../notify'
import { signToken } from '../_lib/auth'

const ORIGINAL_ENV = { ...process.env }

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://mindmaps-bheng.vercel.app/api/notify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  process.env.MINDMAP_AI_API_KEY = 'test-static-key'
  process.env.MINDMAP_JWT_SECRET = 'test-jwt-secret'
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.restoreAllMocks()
})

describe('POST /api/notify', () => {
  it('rejects without a valid token', async () => {
    const res = await handler(req({ message: 'hi' }, { authorization: 'Bearer garbage' }))
    expect(res.status).toBe(401)
  })

  it('accepts the static agent key and broadcasts', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    const res = await handler(req({ message: 'hello world' }, { authorization: 'Bearer test-static-key' }))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('accepts a valid session token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    const token = await signToken({ sub: 'user-1', email: 'a@b.com', role: 'authenticated' }, 'test-jwt-secret')
    const res = await handler(req({ message: 'hi' }, { authorization: `Bearer ${token}` }))
    expect(res.status).toBe(200)
  })

  it('requires a non-empty message', async () => {
    const res = await handler(req({ message: '  ' }, { authorization: 'Bearer test-static-key' }))
    expect(res.status).toBe(400)
  })

  it('rejects invalid JSON bodies', async () => {
    const badReq = new Request('https://mindmaps-bheng.vercel.app/api/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-static-key' },
      body: 'not json',
    })
    const res = await handler(badReq)
    expect(res.status).toBe(400)
  })

  it('rejects non-POST methods', async () => {
    const res = await handler(new Request('https://mindmaps-bheng.vercel.app/api/notify', { method: 'GET' }))
    expect(res.status).toBe(405)
  })

  it('handles OPTIONS preflight', async () => {
    const res = await handler(new Request('https://mindmaps-bheng.vercel.app/api/notify', { method: 'OPTIONS' }))
    expect(res.status).toBe(204)
  })

  it('returns 500 when Supabase env vars are missing', async () => {
    delete process.env.VITE_SUPABASE_URL
    const res = await handler(req({ message: 'hi' }, { authorization: 'Bearer test-static-key' }))
    expect(res.status).toBe(500)
  })

  it('returns 502 when the broadcast call fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('server error', { status: 500 }))
    const res = await handler(req({ message: 'hi' }, { authorization: 'Bearer test-static-key' }))
    expect(res.status).toBe(502)
  })
})
