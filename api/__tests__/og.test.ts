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

describe('GET /api/og', () => {
  it('redirects to home when no id is given', async () => {
    const res = mockRes()
    await handler(mockReq(), res)
    expect(res.redirected).toEqual({ status: 301, url: '/' })
  })

  it('renders default meta tags when the map is not found or not shared', async () => {
    queryMock.mockResolvedValue({ rows: [] })
    const res = mockRes()
    await handler(mockReq('missing-id'), res)
    expect(res.body).toContain('Mindmaps')
    expect(res.body).toContain('Visual mind map and diagram tool')
  })

  it('renders the map name and node count for a shared map', async () => {
    queryMock.mockResolvedValue({
      rows: [{ name: 'My Cool Map', type: 'mindmap', tags: ['AI'], nodes: [{ id: '1' }, { id: '2' }] }],
    })
    const res = mockRes()
    await handler(mockReq('real-id'), res)
    expect(res.body).toContain('My Cool Map')
    expect(res.body).toContain('2 nodes')
    expect(res.body).toContain('og:image')
  })

  it('escapes HTML-unsafe characters in the map name', async () => {
    queryMock.mockResolvedValue({
      rows: [{ name: '<script>alert(1)</script>', type: 'logic-chart', tags: [], nodes: [] }],
    })
    const res = mockRes()
    await handler(mockReq('xss-id'), res)
    expect(res.body).not.toContain('<script>alert(1)</script>')
    expect(res.body).toContain('&lt;script&gt;')
  })

  it('falls back to defaults when the DB query throws', async () => {
    queryMock.mockRejectedValue(new Error('connection lost'))
    const res = mockRes()
    await handler(mockReq('any-id'), res)
    expect(res.body).toContain('Mindmaps')
  })

  it('singularizes "1 node"', async () => {
    queryMock.mockResolvedValue({ rows: [{ name: 'Solo', type: 'logic-chart', tags: [], nodes: [{ id: '1' }] }] })
    const res = mockRes()
    await handler(mockReq('solo-id'), res)
    expect(res.body).toContain('1 node')
    expect(res.body).not.toContain('1 nodes')
  })
})
