// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const queryMock = vi.fn()
vi.mock('../_lib/db.js', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }))

const KEY = 'static-agent-key-abc123'
const SECRET = 'jwt-signing-secret'
const OWNER_ID = 'owner-uuid-1'

process.env.MINDMAP_AI_API_KEY = KEY
process.env.MINDMAP_JWT_SECRET = SECRET
process.env.MINDMAP_USER_ID = OWNER_ID

const { default: handler } = await import('../mindmaps')

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    jsonBody: undefined as unknown,
    setHeader(name: string, value: string) { res.headers[name] = value },
    status(code: number) { res.statusCode = code; return res },
    json(body: unknown) { res.jsonBody = body; return res },
    end() { return res },
  }
  return res as unknown as VercelResponse & typeof res
}

function mockReq(opts: {
  method: string
  query?: Record<string, string>
  body?: unknown
  authorization?: string
}): VercelRequest {
  return {
    method: opts.method,
    query: opts.query ?? {},
    body: opts.body,
    headers: opts.authorization ? { authorization: opts.authorization } : {},
  } as unknown as VercelRequest
}

const sharedRow = {
  id: 'map-1',
  user_id: OWNER_ID,
  name: 'Shared Map',
  type: 'mindmap',
  line_style: 'orthogonal',
  sharing_enabled: true,
  theme_id: 'default',
  nodes: [{ id: 'n1' }],
  tags: ['ai'],
  updated_at: '2026-08-14T00:00:00Z',
}

beforeEach(() => { queryMock.mockReset() })

describe('GET /api/mindmaps?id= (public shared read)', () => {
  it('omits user_id from the response for unauthenticated callers', async () => {
    queryMock.mockResolvedValue({ rows: [{ ...sharedRow }], rowCount: 1 })
    const res = mockRes()
    await handler(mockReq({ method: 'GET', query: { id: 'map-1' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).not.toHaveProperty('user_id')
    expect(res.jsonBody).toMatchObject({ id: 'map-1', name: 'Shared Map', sharing_enabled: true })
  })

  it('keeps user_id for the authenticated owner (service key)', async () => {
    queryMock.mockResolvedValue({ rows: [{ ...sharedRow }], rowCount: 1 })
    const res = mockRes()
    await handler(mockReq({ method: 'GET', query: { id: 'map-1' }, authorization: `Bearer ${KEY}` }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toHaveProperty('user_id', OWNER_ID)
  })

  it('returns 403 for an unshared map without auth', async () => {
    queryMock.mockResolvedValue({ rows: [{ ...sharedRow, sharing_enabled: false }], rowCount: 1 })
    const res = mockRes()
    await handler(mockReq({ method: 'GET', query: { id: 'map-1' } }), res)
    expect(res.statusCode).toBe(403)
  })
})

describe('writes require a verified identity', () => {
  it('rejects a PUT with no Authorization header', async () => {
    const res = mockRes()
    await handler(mockReq({ method: 'PUT', query: { id: 'map-1' }, body: { name: 'x' } }), res)
    expect(res.statusCode).toBe(401)
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('rejects a POST with a wrong bearer key (non-owner)', async () => {
    const res = mockRes()
    await handler(mockReq({ method: 'POST', body: { id: 'map-1' }, authorization: 'Bearer not-the-key' }), res)
    expect(res.statusCode).toBe(401)
    expect(queryMock).not.toHaveBeenCalled()
  })
})

describe('writes matching 0 rows return 404', () => {
  it('PUT that updates no rows (id not owned) returns 404', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 })
    const res = mockRes()
    await handler(mockReq({
      method: 'PUT',
      query: { id: 'someone-elses-map' },
      body: { name: 'hijack' },
      authorization: `Bearer ${KEY}`,
    }), res)
    expect(res.statusCode).toBe(404)
    expect(res.jsonBody).toEqual({ error: 'Not found' })
  })

  it('POST upsert that writes no rows (id owned by another user) returns 404', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 })
    const res = mockRes()
    await handler(mockReq({
      method: 'POST',
      body: { id: 'someone-elses-map', name: 'hijack' },
      authorization: `Bearer ${KEY}`,
    }), res)
    expect(res.statusCode).toBe(404)
    expect(res.jsonBody).toEqual({ error: 'Not found' })
  })

  it('PUT that updates 1 row returns ok', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 })
    const res = mockRes()
    await handler(mockReq({
      method: 'PUT',
      query: { id: 'map-1' },
      body: { name: 'renamed' },
      authorization: `Bearer ${KEY}`,
    }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ ok: true })
  })
})

describe('DELETE /api/mindmaps - lock guard', () => {
  it('returns 423 for a locked map and never runs the delete query', async () => {
    queryMock.mockResolvedValue({ rows: [{ locked: true }], rowCount: 1 })
    const res = mockRes()
    await handler(mockReq({
      method: 'DELETE',
      query: { id: 'map-1' },
      authorization: `Bearer ${KEY}`,
    }), res)
    expect(res.statusCode).toBe(423)
    expect(res.jsonBody).toEqual({ error: 'This map is locked. Unlock it before deleting.' })
    // Only the lock lookup ran - nothing was deleted.
    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(queryMock.mock.calls.some(c => String(c[0]).startsWith('DELETE'))).toBe(false)
  })

  it('deletes an unlocked map', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ locked: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    const res = mockRes()
    await handler(mockReq({
      method: 'DELETE',
      query: { id: 'map-1' },
      authorization: `Bearer ${KEY}`,
    }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ ok: true })
    expect(queryMock.mock.calls[1][0]).toBe('DELETE FROM mindmaps WHERE id=$1 AND user_id=$2')
  })

  it('deletes when the map row does not exist (nothing to guard)', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 })
    const res = mockRes()
    await handler(mockReq({
      method: 'DELETE',
      query: { id: 'ghost' },
      authorization: `Bearer ${KEY}`,
    }), res)
    expect(res.statusCode).toBe(200)
    expect(queryMock).toHaveBeenCalledTimes(2)
  })

  it('DELETE without an id returns 400', async () => {
    const res = mockRes()
    await handler(mockReq({ method: 'DELETE', authorization: `Bearer ${KEY}` }), res)
    expect(res.statusCode).toBe(400)
    expect(queryMock).not.toHaveBeenCalled()
  })
})

describe('PUT /api/mindmaps - locked field', () => {
  it('writes the locked column', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 })
    const res = mockRes()
    await handler(mockReq({
      method: 'PUT',
      query: { id: 'map-1' },
      body: { locked: true },
      authorization: `Bearer ${KEY}`,
    }), res)
    expect(res.statusCode).toBe(200)
    expect(String(queryMock.mock.calls[0][0])).toContain('locked=$1')
    expect(queryMock.mock.calls[0][1]).toEqual([true, 'map-1', OWNER_ID])
  })
})
