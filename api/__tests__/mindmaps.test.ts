// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { signToken } from '../_lib/auth'
import { __resetLockedColumnCache } from '../_lib/locked'

const queryMock = vi.fn()
vi.mock('../_lib/db.js', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }))

const KEY = 'static-agent-key-abc123'
const SECRET = 'jwt-signing-secret'
const OWNER_ID = 'owner-uuid-1'

process.env.MINDMAP_AI_API_KEY = KEY
process.env.MINDMAP_JWT_SECRET = SECRET
process.env.MINDMAP_USER_ID = OWNER_ID

const { default: handler } = await import('../mindmaps')

// A real owner-session JWT (role: 'authenticated'), as issued by api/auth.ts at login -
// distinct from the static service key, which authenticates as role: 'service'.
async function ownerToken(): Promise<string> {
  return signToken({ sub: OWNER_ID, email: 'owner@example.com', role: 'authenticated' }, SECRET)
}

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

beforeEach(() => { queryMock.mockReset(); __resetLockedColumnCache() })

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

describe('locked diagrams', () => {
  // Every request first runs lockedColumnExists() (an information_schema check), then
  // (for PUT/POST/DELETE) a "SELECT locked" existence check, before the real write.
  // This mock answers all three by matching on the SQL text.
  function mockColumnExists(exists: boolean) {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('information_schema')) {
        return Promise.resolve({ rows: exists ? [{ '?column?': 1 }] : [], rowCount: exists ? 1 : 0 })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })
  }

  function mockLockedRow(locked: boolean) {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('information_schema')) return Promise.resolve({ rows: [{ '?column?': 1 }], rowCount: 1 })
      if (sql.startsWith('SELECT locked FROM mindmaps')) return Promise.resolve({ rows: [{ locked }], rowCount: 1 })
      return Promise.resolve({ rows: [], rowCount: 1 })
    })
  }

  it('PUT on a locked row returns 423', async () => {
    mockLockedRow(true)
    const res = mockRes()
    await handler(mockReq({
      method: 'PUT', query: { id: 'map-1' }, body: { name: 'renamed' }, authorization: `Bearer ${KEY}`,
    }), res)
    expect(res.statusCode).toBe(423)
    expect(res.jsonBody).toEqual({
      error: 'This diagram is locked',
      detail: 'It is linked from a README or Confluence page. Unlock it in the owner UI first.',
      locked: true,
    })
  })

  it('DELETE on a locked row returns 423', async () => {
    mockLockedRow(true)
    const res = mockRes()
    await handler(mockReq({ method: 'DELETE', query: { id: 'map-1' }, authorization: `Bearer ${KEY}` }), res)
    expect(res.statusCode).toBe(423)
    expect(res.jsonBody).toMatchObject({ locked: true })
  })

  it('POST upsert on a locked row returns 423', async () => {
    mockLockedRow(true)
    const res = mockRes()
    await handler(mockReq({ method: 'POST', body: { id: 'map-1', name: 'x' }, authorization: `Bearer ${KEY}` }), res)
    expect(res.statusCode).toBe(423)
    expect(res.jsonBody).toMatchObject({ locked: true })
  })

  it('unlocked row still updates and deletes as before', async () => {
    mockLockedRow(false)
    const put = mockRes()
    await handler(mockReq({ method: 'PUT', query: { id: 'map-1' }, body: { name: 'renamed' }, authorization: `Bearer ${KEY}` }), put)
    expect(put.statusCode).toBe(200)

    const del = mockRes()
    await handler(mockReq({ method: 'DELETE', query: { id: 'map-1' }, authorization: `Bearer ${KEY}` }), del)
    expect(del.statusCode).toBe(200)
  })

  it('PATCH { locked: false } with the Bearer service key is rejected', async () => {
    mockColumnExists(true)
    const res = mockRes()
    await handler(mockReq({
      method: 'PATCH', query: { id: 'map-1' }, body: { locked: false }, authorization: `Bearer ${KEY}`,
    }), res)
    expect([401, 403]).toContain(res.statusCode)
  })

  it('PATCH { locked: false } with an owner session succeeds, then a normal update works', async () => {
    mockColumnExists(true)
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('information_schema')) return Promise.resolve({ rows: [{ '?column?': 1 }], rowCount: 1 })
      if (sql.startsWith('UPDATE mindmaps SET locked')) return Promise.resolve({ rows: [], rowCount: 1 })
      if (sql.startsWith('SELECT locked FROM mindmaps')) return Promise.resolve({ rows: [{ locked: false }], rowCount: 1 })
      return Promise.resolve({ rows: [], rowCount: 1 })
    })
    const token = await ownerToken()
    const patchRes = mockRes()
    await handler(mockReq({
      method: 'PATCH', query: { id: 'map-1' }, body: { locked: false }, authorization: `Bearer ${token}`,
    }), patchRes)
    expect(patchRes.statusCode).toBe(200)
    expect(patchRes.jsonBody).toEqual({ ok: true, locked: false })

    const putRes = mockRes()
    await handler(mockReq({
      method: 'PUT', query: { id: 'map-1' }, body: { name: 'renamed' }, authorization: `Bearer ${token}`,
    }), putRes)
    expect(putRes.statusCode).toBe(200)
  })

  it('PATCH { locked: true } then DELETE returns 423', async () => {
    const token = await ownerToken()
    mockColumnExists(true)
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('information_schema')) return Promise.resolve({ rows: [{ '?column?': 1 }], rowCount: 1 })
      if (sql.startsWith('UPDATE mindmaps SET locked')) return Promise.resolve({ rows: [], rowCount: 1 })
      return Promise.resolve({ rows: [], rowCount: 1 })
    })
    const lockRes = mockRes()
    await handler(mockReq({ method: 'PATCH', query: { id: 'map-1' }, body: { locked: true }, authorization: `Bearer ${token}` }), lockRes)
    expect(lockRes.statusCode).toBe(200)

    mockLockedRow(true)
    const delRes = mockRes()
    await handler(mockReq({ method: 'DELETE', query: { id: 'map-1' }, authorization: `Bearer ${token}` }), delRes)
    expect(delRes.statusCode).toBe(423)
  })

  it('PATCH answers 503 when the locked column has not been migrated yet', async () => {
    mockColumnExists(false)
    const token = await ownerToken()
    const res = mockRes()
    await handler(mockReq({ method: 'PATCH', query: { id: 'map-1' }, body: { locked: false }, authorization: `Bearer ${token}` }), res)
    expect(res.statusCode).toBe(503)
    expect(res.jsonBody).toEqual({ error: 'Lock not available', detail: 'Run the locked migration first.' })
  })

  it('GET single includes locked', async () => {
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('information_schema')) return Promise.resolve({ rows: [{ '?column?': 1 }], rowCount: 1 })
      return Promise.resolve({ rows: [{ ...sharedRow, locked: true }], rowCount: 1 })
    })
    const res = mockRes()
    await handler(mockReq({ method: 'GET', query: { id: 'map-1' } }), res)
    expect(res.jsonBody).toMatchObject({ locked: true })
  })

  it('LIST includes locked (defaulting to false when the column is absent)', async () => {
    mockColumnExists(false)
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes('information_schema')) return Promise.resolve({ rows: [], rowCount: 0 })
      return Promise.resolve({ rows: [{ id: 'map-1', name: 'x' }], rowCount: 1 })
    })
    const res = mockRes()
    await handler(mockReq({ method: 'GET', query: {}, authorization: `Bearer ${KEY}` }), res)
    expect(res.jsonBody).toEqual([{ id: 'map-1', name: 'x', locked: false }])
  })
})
