import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }))
vi.mock('../../../components/CuteToast', () => ({ showToast }))

import { buildDiagramSvg, copyDiagramSvg } from '../copySvg'

type Write = (items: unknown[]) => Promise<void>

class FakeClipboardItem {
  data: Record<string, Blob>
  constructor(data: Record<string, Blob>) { this.data = data }
}

function installClipboard(opts: { write?: Write; writeText?: (t: string) => Promise<void> }) {
  if (opts.write) (globalThis as unknown as { ClipboardItem: unknown }).ClipboardItem = FakeClipboardItem
  Object.defineProperty(navigator, 'clipboard', {
    value: { write: opts.write, writeText: opts.writeText }, configurable: true,
  })
}

function uninstallClipboard() {
  delete (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
}

/** Read back what a fake ClipboardItem was handed, per mime type. */
async function written(items: unknown[], type: string) {
  const item = (items as FakeClipboardItem[])[0]
  return item.data[type] ? await item.data[type].text() : null
}

function buildCanvasDom() {
  const root = document.createElement('div')
  root.className = 'diagram-canvas-root'
  root.style.backgroundColor = 'rgb(248, 249, 251)'
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  g.setAttribute('transform', 'translate(10,10) scale(2)')
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  text.textContent = 'Root Topic'
  g.appendChild(text)
  svg.appendChild(g)
  root.appendChild(svg)
  document.body.appendChild(root)
  return root
}

describe('buildDiagramSvg', () => {
  beforeEach(() => { document.body.innerHTML = '' })
  afterEach(() => { document.body.innerHTML = '' })

  it('throws when there is no diagram on screen', () => {
    expect(() => buildDiagramSvg()).toThrow(/no diagram/)
  })

  it('fits the viewBox to the content and drops the pan/zoom transform', () => {
    const root = buildCanvasDom()
    const g = root.querySelector('g') as SVGGElement
    g.getBBox = () => ({ x: 0, y: 0, width: 800, height: 400, top: 0, left: 0, right: 800, bottom: 400, toJSON() {} }) as DOMRect

    const svg = buildDiagramSvg()

    expect(svg).toContain('viewBox="-60 -60 920 520"')
    expect(svg).toContain('width="920"')
    expect(svg).not.toContain('translate(10,10) scale(2)')
    // the live canvas keeps its transform — only the copy drops it
    expect(g.getAttribute('transform')).toBe('translate(10,10) scale(2)')
  })

  it('is standalone: namespace, font and a painted background', () => {
    buildCanvasDom()
    const svg = buildDiagramSvg()

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('font-family="Inter, system-ui, sans-serif"')
    expect(svg).toContain('fill="rgb(248, 249, 251)"')
    expect(svg).toContain('Root Topic')
  })

  it('falls back to a white background when the canvas has none', () => {
    buildCanvasDom()
    const spy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({ backgroundColor: '' } as CSSStyleDeclaration)
    expect(buildDiagramSvg()).toContain('fill="#ffffff"')
    spy.mockRestore()
  })
})

describe('copyDiagramSvg', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })
  afterEach(() => {
    document.body.innerHTML = ''
    uninstallClipboard()
  })

  it('writes the markup as text plus an svg flavour', async () => {
    const write: Write & { mock: { calls: unknown[][] } } = vi.fn(async () => {}) as never
    installClipboard({ write })
    buildCanvasDom()

    expect(await copyDiagramSvg()).toBe(true)
    const items = write.mock.calls[0][0] as unknown[]
    expect(await written(items, 'text/plain')).toContain('<svg')
    expect(await written(items, 'web image/svg+xml')).toContain('<svg')
    expect(showToast).toHaveBeenCalledWith('SVG copied!', expect.objectContaining({ color: '#22c55e' }))
  })

  it('retries with text alone when the browser refuses the svg flavour', async () => {
    const write: Write & { mock: { calls: unknown[][] } } = vi.fn()
      .mockRejectedValueOnce(new Error('unsupported type'))
      .mockResolvedValueOnce(undefined) as never
    installClipboard({ write })
    buildCanvasDom()

    expect(await copyDiagramSvg()).toBe(true)
    expect(write).toHaveBeenCalledTimes(2)
    const retry = write.mock.calls[1][0] as unknown[]
    expect(await written(retry, 'text/plain')).toContain('<svg')
    expect(await written(retry, 'web image/svg+xml')).toBeNull()
  })

  it('uses writeText when ClipboardItem is unavailable', async () => {
    const writeText: ((t: string) => Promise<void>) & { mock: { calls: string[][] } } = vi.fn(async () => {}) as never
    installClipboard({ writeText })
    buildCanvasDom()

    expect(await copyDiagramSvg()).toBe(true)
    expect(writeText.mock.calls[0][0]).toContain('<svg')
  })

  it('reports unsupported when the clipboard is missing entirely', async () => {
    installClipboard({})
    buildCanvasDom()

    expect(await copyDiagramSvg()).toBe(false)
    expect(showToast).toHaveBeenCalledWith('Clipboard not supported here', { color: '#ef4444' })
  })

  it('fails cleanly when there is no diagram on screen', async () => {
    installClipboard({ write: vi.fn(async () => {}) })

    expect(await copyDiagramSvg()).toBe(false)
    expect(showToast).toHaveBeenCalledWith('Copy SVG failed', { color: '#ef4444' })
  })

  it('fails cleanly when both clipboard writes are rejected', async () => {
    installClipboard({ write: vi.fn(async () => { throw new Error('denied') }) })
    buildCanvasDom()

    expect(await copyDiagramSvg()).toBe(false)
    expect(showToast).toHaveBeenCalledWith('Copy SVG failed', { color: '#ef4444' })
  })
})
