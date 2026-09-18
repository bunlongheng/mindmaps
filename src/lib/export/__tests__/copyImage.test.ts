import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { html2canvas, showToast, toBlob } = vi.hoisted(() => {
  const toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })))
  const html2canvas = vi.fn(async () => ({ toBlob }))
  const showToast = vi.fn()
  return { html2canvas, showToast, toBlob }
})

vi.mock('html2canvas', () => ({ default: html2canvas }))
vi.mock('../../../components/CuteToast', () => ({ showToast }))

import { copyDiagramImage, hdScale } from '../copyImage'

type ClipboardWrite = (items: unknown[]) => Promise<void>

/** Stand-in ClipboardItem that resolves the promise the way a browser does. */
function installClipboard(write: ClipboardWrite) {
  ;(globalThis as unknown as { ClipboardItem: unknown }).ClipboardItem = class {
    data: Record<string, Promise<Blob>>
    constructor(data: Record<string, Promise<Blob>>) { this.data = data }
  }
  Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
}

function uninstallClipboard() {
  delete (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
}

/** Resolve every blob the caller handed to ClipboardItem, like a real clipboard does. */
const resolvingWrite: ClipboardWrite = async items => {
  for (const item of items as { data: Record<string, Promise<Blob>> }[]) {
    await Promise.all(Object.values(item.data))
  }
}

function buildCanvasDom() {
  const root = document.createElement('div')
  root.className = 'diagram-canvas-root'
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  g.setAttribute('transform', 'translate(10,10) scale(2)')
  svg.appendChild(g)
  root.appendChild(svg)
  document.body.appendChild(root)
  return root
}

describe('hdScale', () => {
  it('never downscales below 100%', () => {
    expect(hdScale(0, 0)).toBe(1)
    expect(hdScale(9000, 9000)).toBeGreaterThanOrEqual(1)
  })

  it('caps at 4x for small diagrams', () => {
    expect(hdScale(100, 80)).toBe(4)
  })

  it('targets a 1920px long edge for mid-size diagrams', () => {
    expect(hdScale(700, 350) * 700).toBeCloseTo(1920, 5)
  })

  it('keeps at least 2x once the content is already wide', () => {
    expect(hdScale(1200, 600)).toBe(2)
  })

  it('never exceeds an 8000px long edge', () => {
    expect(hdScale(6000, 3000) * 6000).toBeLessThanOrEqual(8000)
  })
})

describe('copyDiagramImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    toBlob.mockImplementation(cb => cb(new Blob(['png'], { type: 'image/png' })))
  })

  afterEach(() => {
    document.body.innerHTML = ''
    uninstallClipboard()
  })

  it('reports unsupported when the browser has no ClipboardItem', async () => {
    uninstallClipboard()
    buildCanvasDom()

    expect(await copyDiagramImage()).toBe(false)
    expect(html2canvas).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('Clipboard images not supported here', { color: '#ef4444' })
  })

  it('renders the fitted diagram, writes a png, and toasts success', async () => {
    const write = vi.fn(resolvingWrite)
    installClipboard(write)
    buildCanvasDom()

    expect(await copyDiagramImage()).toBe(true)
    expect(write).toHaveBeenCalledTimes(1)
    expect(html2canvas).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('Diagram copied!', expect.objectContaining({ color: '#22c55e' }))
    // The offscreen wrapper is torn down again.
    expect(document.querySelectorAll('div').length).toBe(1)
  })

  it('fits the whole map, not the viewport, and renders it at HD', async () => {
    installClipboard(vi.fn(resolvingWrite))
    const root = buildCanvasDom()
    const g = root.querySelector('g') as SVGGElement
    g.getBBox = () => ({ x: 0, y: 0, width: 800, height: 400, top: 0, left: 0, right: 800, bottom: 400, toJSON() {} }) as DOMRect

    await copyDiagramImage()

    const opts = (html2canvas.mock.calls[0] as unknown[])[1] as { width: number; height: number; scale: number }
    expect(opts.width).toBe(920)   // 800 + 60 padding on both sides
    expect(opts.height).toBe(520)
    expect(opts.width * opts.scale).toBeGreaterThanOrEqual(1920)
    // The clone drops the pan/zoom transform so the export is not panned.
    expect(g.getAttribute('transform')).toBe('translate(10,10) scale(2)')
  })

  it('fails cleanly when there is no diagram on screen', async () => {
    installClipboard(vi.fn(resolvingWrite))

    expect(await copyDiagramImage()).toBe(false)
    expect(showToast).toHaveBeenCalledWith('Copy image failed', { color: '#ef4444' })
  })

  it('fails cleanly when the png cannot be encoded', async () => {
    installClipboard(vi.fn(resolvingWrite))
    buildCanvasDom()
    toBlob.mockImplementation(cb => cb(null))

    expect(await copyDiagramImage()).toBe(false)
    expect(showToast).toHaveBeenCalledWith('Copy image failed', { color: '#ef4444' })
  })

  it('fails cleanly when the clipboard write is rejected', async () => {
    installClipboard(vi.fn(async () => { throw new Error('denied') }))
    buildCanvasDom()

    expect(await copyDiagramImage()).toBe(false)
    expect(showToast).toHaveBeenCalledWith('Copy image failed', { color: '#ef4444' })
  })
})
