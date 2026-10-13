// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const queryMock = vi.fn()
vi.mock('../_lib/db.js', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }))
vi.mock('../../lib/share-alert.js', async () => {
  const real = await vi.importActual<Record<string, unknown>>('../../lib/share-alert.js')
  return { ...real, notifyShareView: () => Promise.resolve() }
})
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => { void p } }))

const KEY = 'static-agent-key-abc123'
const OWNER_ID = 'owner-uuid-1'
process.env.MINDMAP_AI_API_KEY = KEY
process.env.MINDMAP_JWT_SECRET = 'jwt-signing-secret'
process.env.MINDMAP_USER_ID = OWNER_ID

const { default: mindmaps } = await import('../mindmaps')
const { default: unlock } = await import('../unlock')
const { default: og } = await import('../og')
const { hashPasscode, verifyPasscode, unlockToken, unlockCookieName, sealPasscode, openPasscode } = await import('../_lib/passcode')

const ID = '11111111-2222-4333-8444-555555555555'

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    jsonBody: undefined as unknown,
    body: '' as unknown,
    setHeader(name: string, value: string) { res.headers[name] = value; return res },
    status(code: number) { res.statusCode = code; return res },
    json(body: unknown) { res.jsonBody = body; return res },
    send(body: unknown) { res.body = body; return res },
    redirect(code: number, url: string) { res.statusCode = code; res.headers.Location = url; return res },
    end() { return res },
  }
  return res as unknown as VercelResponse & typeof res
}

function mockReq(opts: { method: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string> }): VercelRequest {
  return { method: opts.method, query: opts.query ?? {}, body: opts.body, headers: opts.headers ?? {} } as unknown as VercelRequest
}

let HASH = ''
const lockedRow = () => ({
  id: ID, user_id: OWNER_ID, name: 'Secret Map', type: 'graph', line_style: 'orthogonal',
  sharing_enabled: true, theme_id: 'default', nodes: [{ id: 'n1', title: 'hidden' }], tags: [],
  updated_at: '2026-10-13T00:00:00Z', passcode_hash: HASH, passcode_enc: sealPasscode('open sesame'),
})

beforeEach(async () => {
  queryMock.mockReset()
  if (!HASH) HASH = await hashPasscode('open sesame')
})

describe('a passcode-locked shared map', () => {
  it('answers 401 passcode_required to a visitor without the unlock cookie, and leaks nothing', async () => {
    queryMock.mockResolvedValue({ rows: [lockedRow()] })
    const res = mockRes()
    await mindmaps(mockReq({ method: 'GET', query: { id: ID } }), res)
    expect(res.statusCode).toBe(401)
    expect(res.jsonBody).toEqual({ error: 'Passcode required', passcode_required: true, id: ID })
    expect(res.headers['Cache-Control']).toBe('no-store')
  })

  it('gates the svg render too', async () => {
    queryMock.mockResolvedValue({ rows: [lockedRow()] })
    const res = mockRes()
    await mindmaps(mockReq({ method: 'GET', query: { id: ID, format: 'svg' } }), res)
    expect(res.statusCode).toBe(401)
  })

  it('opens for a visitor holding a valid unlock cookie, privately and without the hash', async () => {
    queryMock.mockResolvedValue({ rows: [lockedRow()] })
    const res = mockRes()
    const cookie = `other=1; ${unlockCookieName(ID)}=${unlockToken(ID, HASH)}`
    await mindmaps(mockReq({ method: 'GET', query: { id: ID }, headers: { cookie } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.headers['Cache-Control']).toBe('private, no-store')
    expect(res.jsonBody).toMatchObject({ id: ID, has_passcode: true })
    expect(res.jsonBody).not.toHaveProperty('passcode_hash')
    expect(res.jsonBody).not.toHaveProperty('passcode_enc')
    expect(res.jsonBody).not.toHaveProperty('passcode')
    expect(res.jsonBody).not.toHaveProperty('user_id')
  })

  it('rejects a cookie signed for an older passcode', async () => {
    queryMock.mockResolvedValue({ rows: [lockedRow()] })
    const res = mockRes()
    const stale = await hashPasscode('old one')
    await mindmaps(mockReq({ method: 'GET', query: { id: ID }, headers: { cookie: `${unlockCookieName(ID)}=${unlockToken(ID, stale)}` } }), res)
    expect(res.statusCode).toBe(401)
  })

  it('lets the owner straight through and hands back the plain passcode', async () => {
    queryMock.mockResolvedValue({ rows: [lockedRow()] })
    const res = mockRes()
    await mindmaps(mockReq({ method: 'GET', query: { id: ID }, headers: { authorization: `Bearer ${KEY}` } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toMatchObject({ has_passcode: true, passcode: 'open sesame', user_id: OWNER_ID })
    expect(res.jsonBody).not.toHaveProperty('passcode_hash')
  })

  it('still serves an unlocked shared map publicly with has_passcode false', async () => {
    queryMock.mockResolvedValue({ rows: [{ ...lockedRow(), passcode_hash: null, passcode_enc: null }] })
    const res = mockRes()
    await mindmaps(mockReq({ method: 'GET', query: { id: ID } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toMatchObject({ id: ID, has_passcode: false })
    expect(res.headers['Cache-Control']).toBeUndefined()
  })

  it('keeps locked maps off the public demo wall', async () => {
    queryMock.mockResolvedValue({ rows: [] })
    await mindmaps(mockReq({ method: 'GET', query: { scope: 'demo' } }), mockRes())
    expect(String(queryMock.mock.calls[0][0])).toMatch(/passcode_hash IS NULL/)
  })
})

describe('PATCH { passcode }', () => {
  it('trims and lowercases, stores a hash plus a sealed copy, shares the map, returns the plain code', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: ID, sharing_enabled: true, has_passcode: true }] })
    const res = mockRes()
    await mindmaps(mockReq({ method: 'PATCH', query: { id: ID }, body: { passcode: '  Open SESAME ' }, headers: { authorization: `Bearer ${KEY}` } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toMatchObject({ has_passcode: true, sharing_enabled: true, passcode: 'open sesame' })
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/sharing_enabled=\(sharing_enabled OR \$1::text IS NOT NULL\)/)
    expect(await verifyPasscode('open sesame', params[0] as string)).toBe(true)
    expect(openPasscode(params[1] as string)).toBe('open sesame')
    expect(params.slice(2)).toEqual([ID, OWNER_ID])
  })

  it('"" clears both columns', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: ID, sharing_enabled: true, has_passcode: false }] })
    const res = mockRes()
    await mindmaps(mockReq({ method: 'PATCH', query: { id: ID }, body: { passcode: '' }, headers: { authorization: `Bearer ${KEY}` } }), res)
    expect(res.jsonBody).toMatchObject({ has_passcode: false, passcode: '' })
    expect((queryMock.mock.calls[0] as [string, unknown[]])[1].slice(0, 2)).toEqual([null, null])
  })

  it('needs the owner and caps the length', async () => {
    const anon = mockRes()
    await mindmaps(mockReq({ method: 'PATCH', query: { id: ID }, body: { passcode: 'x' } }), anon)
    expect(anon.statusCode).toBe(401)
    const long = mockRes()
    await mindmaps(mockReq({ method: 'PATCH', query: { id: ID }, body: { passcode: 'x'.repeat(201) }, headers: { authorization: `Bearer ${KEY}` } }), long)
    expect(long.statusCode).toBe(400)
    expect(queryMock).not.toHaveBeenCalled()
  })
})

describe('/api/unlock', () => {
  const post = async (passcode: string, ip: string) => {
    queryMock.mockResolvedValue({ rows: [{ id: ID, name: 'Secret Map', sharing_enabled: true, passcode_hash: HASH }] })
    const res = mockRes()
    await unlock(mockReq({ method: 'POST', query: { id: ID }, body: { passcode }, headers: { 'x-forwarded-for': ip } }), res)
    return res
  }

  it('draws the lock screen on GET', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: ID, name: 'Secret Map', sharing_enabled: true, passcode_hash: HASH }] })
    const res = mockRes()
    await unlock(mockReq({ method: 'GET', query: { id: ID } }), res)
    expect(res.statusCode).toBe(200)
    expect(String(res.body)).toContain(`action="/api/unlock?id=${ID}"`)
    expect(String(res.body)).toContain('Secret Map')
  })

  it('answers a wrong passcode with 401 and ACCESS DENIED, no cookie', async () => {
    const res = await post('nope', '10.0.0.1')
    expect(res.statusCode).toBe(401)
    expect(String(res.body)).toContain('ACCESS DENIED')
    expect(res.headers['Set-Cookie']).toBeUndefined()
  })

  it('accepts the passcode in any case and sets a 30-day HttpOnly cookie the read then honours', async () => {
    const res = await post('  OPEN Sesame ', '10.0.0.2')
    expect(res.statusCode).toBe(200)
    expect(String(res.body)).toContain('ACCESS GRANTED')
    const cookie = res.headers['Set-Cookie']
    expect(cookie).toMatch(/Max-Age=2592000; HttpOnly; SameSite=Lax/)
    queryMock.mockResolvedValue({ rows: [lockedRow()] })
    const read = mockRes()
    await mindmaps(mockReq({ method: 'GET', query: { id: ID }, headers: { cookie: cookie.split(';')[0] } }), read)
    expect(read.statusCode).toBe(200)
  })

  it('rate limits guesses to 10 per 5 minutes per IP', async () => {
    for (let i = 0; i < 10; i++) expect((await post('nope', '10.0.0.3')).statusCode).toBe(401)
    expect((await post('open sesame', '10.0.0.3')).statusCode).toBe(429)
  })

  it('404s a private map', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: ID, name: 'x', sharing_enabled: false, passcode_hash: HASH }] })
    const res = mockRes()
    await unlock(mockReq({ method: 'GET', query: { id: ID } }), res)
    expect(res.statusCode).toBe(404)
  })
})

describe('share preview of a locked map', () => {
  it('describes it as locked and asks for the locked image', async () => {
    queryMock.mockResolvedValue({ rows: [{ name: 'Secret Map', nodes: [{}, {}], locked: true }] })
    const res = mockRes()
    await og(mockReq({ method: 'GET', query: { id: ID } }), res)
    const html = String(res.body)
    expect(html).toContain('Passcode protected. Type the passcode to open it.')
    expect(html).not.toContain('2 nodes')
    expect(html).toContain(`/api/og-image?id=${ID}&l=1`)
  })
})
