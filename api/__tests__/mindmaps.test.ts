// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const queryMock = vi.fn()
vi.mock('../_lib/db.js', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }))
const notifyMock = vi.fn()
vi.mock('../../lib/share-alert.js', async () => {
  const real = await vi.importActual<Record<string, unknown>>('../../lib/share-alert.js')
  return { ...real, notifyShareView: (...a: unknown[]) => notifyMock(...a) }
})
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => { void p } }))

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
  type: 'graph',
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
  it('alerts the owner once when a person opens a shared map, and skips thumbnails and crawlers', async () => {
    const open = async (query: Record<string, string>, ua: string) => {
      notifyMock.mockClear()
      queryMock.mockResolvedValue({ rows: [sharedRow] })
      const req = mockReq({ method: 'GET', query })
      ;(req.headers as Record<string, string>)['user-agent'] = ua
      ;(req.headers as Record<string, string>)['x-forwarded-for'] = '73.159.109.147'
      const res = mockRes()
      await handler(req, res)
      expect(res.statusCode).toBe(200)
      return notifyMock.mock.calls
    }
    const human = await open({ id: 'map-1' }, 'Mozilla/5.0 (iPhone) Safari')
    expect(human).toHaveLength(1)
    expect(human[0][0]).toMatchObject({ id: sharedRow.id, title: sharedRow.name, kind: 'view', ip: '73.159.109.147', link: `https://mindmaps-bheng.vercel.app/s/${sharedRow.id}` })
    expect(await open({ id: 'map-1', thumb: '1' }, 'Mozilla/5.0 (iPhone) Safari')).toHaveLength(0)
    expect(await open({ id: 'map-1' }, 'Slackbot-LinkExpanding 1.0')).toHaveLength(0)
  })

  it('lists the shared demo maps without any auth, and never asks for a user', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 'd1', name: 'Demo', type: 'graph', sharing_enabled: true, tags: ['demo'], updated_at: 'x' }] })
    const res = mockRes()
    await handler(mockReq({ method: 'GET', query: { scope: 'demo' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual([expect.objectContaining({ id: 'd1' })])
    const [sql, params] = queryMock.mock.calls[0]
    expect(sql).toMatch(/sharing_enabled = true/)
    expect(sql).toMatch(/'demo' = ANY\(tags\)/)
    expect(params).toBeUndefined()
  })

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
