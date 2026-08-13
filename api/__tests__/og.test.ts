// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const queryMock = vi.fn()
vi.mock('../_lib/db.js', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }))

const { default: handler } = await import('../og')

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    redirected: null as { status: number; url: string } | null,
    setHeader(name: string, value: string) { res.headers[name] = value },
    send(body: string) { res.body = body; return res },
    redirect(status: number, url: string) { res.redirected = { status, url }; return res },
  }
  return res as unknown as VercelResponse & typeof res
}

function mockReq(id?: string): VercelRequest {
  return { query: id ? { id } : {} } as unknown as VercelRequest
}

beforeEach(() => { queryMock.mockReset() })

// Valid UUIDs - the handler now rejects any id that is not a UUID (reflected-XSS / open-redirect guard).
const UUID = {
  missing: '11111111-1111-4111-8111-111111111111',
  real: '22222222-2222-4222-8222-222222222222',
  xss: '33333333-3333-4333-8333-333333333333',
  err: '44444444-4444-4444-8444-444444444444',
  solo: '55555555-5555-4555-8555-555555555555',
}

describe('GET /api/og', () => {
  it('redirects to home when no id is given', async () => {
    const res = mockRes()
    await handler(mockReq(), res)
    expect(res.redirected).toEqual({ status: 301, url: '/' })
  })

  it('redirects to home when id is not a valid UUID (XSS/open-redirect guard)', async () => {
    const res = mockRes()
    await handler(mockReq('"><script>alert(1)</script>'), res)
    expect(res.redirected).toEqual({ status: 301, url: '/' })
    expect(res.body).toBe('')
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('renders default meta tags when the map is not found or not shared', async () => {
    queryMock.mockResolvedValue({ rows: [] })
    const res = mockRes()
    await handler(mockReq(UUID.missing), res)
    expect(res.body).toContain('Mindmaps')
    expect(res.body).toContain('Visual mind map and diagram tool')
  })

  it('renders the map name and node count for a shared map', async () => {
    queryMock.mockResolvedValue({
      rows: [{ name: 'My Cool Map', type: 'mindmap', tags: ['AI'], nodes: [{ id: '1' }, { id: '2' }] }],
    })
    const res = mockRes()
    await handler(mockReq(UUID.real), res)
    expect(res.body).toContain('My Cool Map')
    expect(res.body).toContain('2 nodes')
    expect(res.body).toContain('og:image')
  })

  it('escapes HTML-unsafe characters in the map name', async () => {
    queryMock.mockResolvedValue({
      rows: [{ name: '<script>alert(1)</script>', type: 'logic-chart', tags: [], nodes: [] }],
    })
    const res = mockRes()
    await handler(mockReq(UUID.xss), res)
    expect(res.body).not.toContain('<script>alert(1)</script>')
    expect(res.body).toContain('&lt;script&gt;')
  })

  it('falls back to defaults when the DB query throws', async () => {
    queryMock.mockRejectedValue(new Error('connection lost'))
    const res = mockRes()
    await handler(mockReq(UUID.err), res)
    expect(res.body).toContain('Mindmaps')
  })

  it('singularizes "1 node"', async () => {
    queryMock.mockResolvedValue({ rows: [{ name: 'Solo', type: 'logic-chart', tags: [], nodes: [{ id: '1' }] }] })
    const res = mockRes()
    await handler(mockReq(UUID.solo), res)
    expect(res.body).toContain('1 node')
    expect(res.body).not.toContain('1 nodes')
  })
})
