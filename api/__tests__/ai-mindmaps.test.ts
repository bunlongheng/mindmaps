// @vitest-environment node
//
// Issue 27: POST /api/ai/mindmaps used to save user_id = NULL whenever the caller
// omitted "userId", and still answered 201. The library lists with
// WHERE user_id=$1, so those maps were invisible forever - a silent loss.
// These tests pin the fixed contract: every API map is filed under the configured
// owner, a mismatched userId is refused, and a missing owner config fails loudly.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const queryMock = vi.fn()
vi.mock('../_lib/db.js', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }))

const KEY = 'static-agent-key-abc123'
const SECRET = 'jwt-signing-secret'
const OWNER_ID = 'owner-uuid-1'

process.env.MINDMAP_AI_API_KEY = KEY
process.env.MINDMAP_JWT_SECRET = SECRET
process.env.MINDMAP_USER_ID = OWNER_ID

const { default: aiHandler } = await import('../ai/mindmaps')
const { default: crudHandler } = await import('../mindmaps')

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    jsonBody: undefined as unknown,
    setHeader(name: string, value: string) { res.headers[name] = value },
    status(code: number) { res.statusCode = code; return res },
    json(body: unknown) { res.jsonBody = body; return res },
    send(body: unknown) { res.jsonBody = body; return res },
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

type Row = {
  id: string; user_id: string | null; name: string; type: string
  sharing_enabled: boolean; tags: string[]; updated_at: string
}

// Minimal in-memory stand-in for the mindmaps table: the AI endpoint inserts into it
// and the CRUD list endpoint reads back out of it, so "created" and "listed" are the
// same row rather than two independently-mocked fixtures.
function useFakeTable(): Row[] {
  const rows: Row[] = []
  queryMock.mockImplementation((sql: string, params: unknown[]) => {
    if (sql.includes('INSERT INTO mindmaps')) {
      rows.push({
        id: params[0] as string,
        user_id: params[1] as string | null,
        name: params[2] as string,
        type: params[3] as string,
        sharing_enabled: params[5] as boolean,
        tags: params[8] as string[],
        updated_at: new Date().toISOString(),
      })
      return Promise.resolve({ rows: [], rowCount: 1 })
    }
    if (sql.includes('WHERE user_id=$1')) {
      const owner = params[0]
      const listed = rows.filter(r => r.user_id === owner)
      return Promise.resolve({ rows: listed, rowCount: listed.length })
    }
    return Promise.resolve({ rows: [], rowCount: 0 })
  })
  return rows
}

// The insert parameter list of api/ai/mindmaps.ts, by position.
const P_ID = 0, P_USER = 1, P_NAME = 2, P_TAGS = 8

beforeEach(() => {
  queryMock.mockReset()
  process.env.MINDMAP_USER_ID = OWNER_ID
})
afterEach(() => { process.env.MINDMAP_USER_ID = OWNER_ID })

describe('POST /api/ai/mindmaps owner resolution (issue 27)', () => {
  it('files the map under the configured owner when the body omits userId', async () => {
    useFakeTable()
    const res = mockRes()
    await aiHandler(mockReq({
      method: 'POST',
      authorization: `Bearer ${KEY}`,
      body: { title: 'No Owner Sent', outline: 'Root\n  Branch' },
    }), res)

    expect(res.statusCode).toBe(201)
    expect(queryMock).toHaveBeenCalledTimes(1)
    const params = queryMock.mock.calls[0][1] as unknown[]
    expect(params[P_USER]).toBe(OWNER_ID)
    expect(params[P_USER]).not.toBeNull()
    expect(params[P_TAGS]).toEqual(['API'])
  })

  it('stamps created_at and updated_at with now() so a new map sorts to the top', async () => {
    useFakeTable()
    const res = mockRes()
    await aiHandler(mockReq({
      method: 'POST',
      authorization: `Bearer ${KEY}`,
      body: { title: 'Fresh Map' },
    }), res)

    expect(res.statusCode).toBe(201)
    const sql = queryMock.mock.calls[0][0] as string
    expect(sql).toMatch(/created_at, updated_at/)
    expect(sql).toMatch(/now\(\),\s*now\(\)/)
  })

  it('accepts a userId that matches the configured owner', async () => {
    useFakeTable()
    const res = mockRes()
    await aiHandler(mockReq({
      method: 'POST',
      authorization: `Bearer ${KEY}`,
      body: { title: 'Owner Sent', userId: OWNER_ID },
    }), res)

    expect(res.statusCode).toBe(201)
    const params = queryMock.mock.calls[0][1] as unknown[]
    expect(params[P_USER]).toBe(OWNER_ID)
  })

  it('rejects a userId that is not the owner with 403 and writes nothing', async () => {
    useFakeTable()
    const res = mockRes()
    await aiHandler(mockReq({
      method: 'POST',
      authorization: `Bearer ${KEY}`,
      body: { title: 'Someone Else', userId: 'not-the-owner' },
    }), res)

    expect(res.statusCode).toBe(403)
    expect(queryMock).not.toHaveBeenCalled()
    expect(res.jsonBody).toHaveProperty('error')
  })

  it('returns 500 and writes nothing when MINDMAP_USER_ID is unset', async () => {
    useFakeTable()
    delete process.env.MINDMAP_USER_ID
    const res = mockRes()
    await aiHandler(mockReq({
      method: 'POST',
      authorization: `Bearer ${KEY}`,
      body: { title: 'No Owner Configured' },
    }), res)

    expect(res.statusCode).toBe(500)
    expect(queryMock).not.toHaveBeenCalled()
    expect(String((res.jsonBody as { error: string }).error)).toMatch(/MINDMAP_USER_ID/)
  })

  it('returns 500 when MINDMAP_USER_ID is blank whitespace', async () => {
    useFakeTable()
    process.env.MINDMAP_USER_ID = '   '
    const res = mockRes()
    await aiHandler(mockReq({
      method: 'POST',
      authorization: `Bearer ${KEY}`,
      body: { title: 'Blank Owner' },
    }), res)

    expect(res.statusCode).toBe(500)
    expect(queryMock).not.toHaveBeenCalled()
  })
})

describe('a map created through the AI endpoint shows up in the library', () => {
  it('is returned by GET /api/mindmaps for the configured owner', async () => {
    useFakeTable()

    const createRes = mockRes()
    await aiHandler(mockReq({
      method: 'POST',
      authorization: `Bearer ${KEY}`,
      body: { title: 'Visible In Library', outline: 'Root\n  Branch' },
    }), createRes)
    expect(createRes.statusCode).toBe(201)
    const createdId = (createRes.jsonBody as { id: string }).id
    const insertParams = queryMock.mock.calls[0][1] as unknown[]
    expect(insertParams[P_ID]).toBe(createdId)
    expect(insertParams[P_NAME]).toBe('Visible In Library')

    const listRes = mockRes()
    await crudHandler(mockReq({ method: 'GET', authorization: `Bearer ${KEY}` }), listRes)

    expect(listRes.statusCode).toBe(200)
    const list = listRes.jsonBody as Row[]
    expect(list.map(r => r.id)).toContain(createdId)
    const card = list.find(r => r.id === createdId)!
    // Everything the home card renders comes back from the list query.
    expect(card).toMatchObject({ id: createdId, name: 'Visible In Library', tags: ['API'] })
    expect(card.type).toBeTruthy()
    expect(typeof card.sharing_enabled).toBe('boolean')
    expect(card.updated_at).toBeTruthy()
  })
})
