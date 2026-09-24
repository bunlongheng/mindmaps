// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const queryMock = vi.fn()
vi.mock('../_lib/db.js', () => ({ pool: { query: (...args: unknown[]) => queryMock(...args) } }))

// Wrap the real resvg so one run proves BOTH things at once: the SVG that was
// composed (what the diagram and the escaping look like) and the PNG it produced.
const seen = vi.hoisted(() => ({ svgs: [] as string[] }))
vi.mock('@resvg/resvg-js', async () => {
  const actual = await vi.importActual<typeof import('@resvg/resvg-js')>('@resvg/resvg-js')
  class SpyResvg extends actual.Resvg {
    constructor(svg: string, opts?: unknown) {
      seen.svgs.push(svg)
      super(svg, opts as never)
    }
  }
  return { ...actual, Resvg: SpyResvg }
})

const { default: handler } = await import('../og-image')

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as Buffer | null,
    json: null as unknown,
    setHeader(name: string, value: string) { res.headers[name] = value },
    send(body: Buffer) { res.body = body; return res },
    status(code: number) { res.statusCode = code; return res },
  }
  return res as unknown as VercelResponse & typeof res
}

function mockReq(id?: string): VercelRequest {
  return { query: id ? { id } : {} } as unknown as VercelRequest
}

const UUID = {
  shared: '22222222-2222-4222-8222-222222222222',
  private: '11111111-1111-4111-8111-111111111111',
  xss: '33333333-3333-4333-8333-333333333333',
}

function row(name: string) {
  return {
    name,
    type: 'logic-chart',
    line_style: 'orthogonal',
    theme_id: 'default',
    tags: [],
    updated_at: '2026-01-02T03:04:05Z',
    nodes: [
      { id: 'root', title: 'Root Topic', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 140, height: 140, sortOrder: 0 },
      { id: 'c1', title: 'Photosynthesis', color: '#ef4444', parentId: 'root', depth: 1, x: 0, y: 0, width: 160, height: 40, sortOrder: 0 },
      { id: 'c2', title: 'Respiration', color: '#22c55e', parentId: 'root', depth: 1, x: 0, y: 0, width: 160, height: 40, sortOrder: 1 },
    ],
  }
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** width/height live in the IHDR chunk, big-endian at byte 16 and 20. */
function pngSize(buf: Buffer) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

const lastSvg = () => seen.svgs[seen.svgs.length - 1]

beforeEach(() => {
  queryMock.mockReset()
  seen.svgs.length = 0
})

describe('GET /api/og-image', () => {
  it('renders the real diagram as a 1200x630 PNG for a shared map', async () => {
    queryMock.mockResolvedValue({ rows: [row('Biology Basics')] })
    const res = mockRes()
    await handler(mockReq(UUID.shared), res)

    expect(res.headers['Content-Type']).toBe('image/png')
    const png = res.body as Buffer
    expect(png.subarray(0, 8).equals(PNG_SIG)).toBe(true)
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 })

    // The composed SVG carries the title strip and the real node labels.
    expect(lastSvg()).toContain('Biology Basics')
    expect(lastSvg()).toContain('3 nodes, Logic Chart')
    expect(lastSvg()).toContain('Photosynthesis')
    expect(lastSvg()).toContain('Respiration')
  })

  it('sets the share cache headers and an ETag derived from updated_at', async () => {
    queryMock.mockResolvedValue({ rows: [row('Cached Map')] })
    const res = mockRes()
    await handler(mockReq(UUID.shared), res)
    expect(res.headers['Cache-Control']).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
    expect(res.headers['ETag']).toBe(`"og-${UUID.shared}-${new Date('2026-01-02T03:04:05Z').getTime()}"`)
  })

  it('serves the generic card - no content - for a private or missing map', async () => {
    queryMock.mockResolvedValue({ rows: [] })
    const res = mockRes()
    await handler(mockReq(UUID.private), res)

    const png = res.body as Buffer
    expect(png.subarray(0, 8).equals(PNG_SIG)).toBe(true)
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 })
    expect(lastSvg()).not.toContain('Photosynthesis')
    expect(lastSvg()).not.toContain('Respiration')
    expect(lastSvg()).toContain('Visual mind map and diagram tool')
    expect(res.headers['ETag']).toBe('"og-generic-0"')
  })

  it('never queries the DB for an id that is not a UUID', async () => {
    const res = mockRes()
    await handler(mockReq('../../etc/passwd'), res)
    expect(queryMock).not.toHaveBeenCalled()
    expect((res.body as Buffer).subarray(0, 8).equals(PNG_SIG)).toBe(true)
    expect(lastSvg()).toContain('Visual mind map and diagram tool')
  })

  it('escapes a <script> in the map name before it reaches the SVG', async () => {
    queryMock.mockResolvedValue({ rows: [row('<script>alert(1)</script>')] })
    const res = mockRes()
    await handler(mockReq(UUID.xss), res)
    expect(lastSvg()).not.toContain('<script>')
    expect(lastSvg()).toContain('&lt;script&gt;')
    expect((res.body as Buffer).subarray(0, 8).equals(PNG_SIG)).toBe(true)
  })

  it('falls back to the generic card when the DB throws', async () => {
    queryMock.mockRejectedValue(new Error('connection lost'))
    const res = mockRes()
    await handler(mockReq(UUID.shared), res)
    expect(lastSvg()).toContain('Visual mind map and diagram tool')
    expect((res.body as Buffer).subarray(0, 8).equals(PNG_SIG)).toBe(true)
  })
})
