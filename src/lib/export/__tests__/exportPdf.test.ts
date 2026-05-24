import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks (vi.mock is hoisted, so build shared mock fns via vi.hoisted) ─────────
const { addImage, save, jsPDFCtor, html2canvas, showToast } = vi.hoisted(() => {
  const addImage = vi.fn()
  const save = vi.fn()
  // jsPDF is invoked with `new`, so the mock must be constructable.
  const jsPDFCtor = vi.fn(function () { return { addImage, save } })
  const html2canvas = vi.fn(async () => ({
    toDataURL: vi.fn(() => 'data:image/jpeg;base64,AAAA'),
  }))
  const showToast = vi.fn()
  return { addImage, save, jsPDFCtor, html2canvas, showToast }
})

vi.mock('jspdf', () => ({ default: jsPDFCtor }))
vi.mock('html2canvas', () => ({ default: html2canvas }))
vi.mock('../../../components/CuteToast', () => ({ showToast }))

import { exportDiagramAsPdf } from '../exportPdf'

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

describe('exportDiagramAsPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('returns early when no diagram svg is present', async () => {
    await exportDiagramAsPdf('Empty')
    expect(html2canvas).not.toHaveBeenCalled()
    expect(jsPDFCtor).not.toHaveBeenCalled()
  })

  it('returns early when svg has no inner <g>', async () => {
    const root = document.createElement('div')
    root.className = 'diagram-canvas-root'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    root.appendChild(svg)
    document.body.appendChild(root)

    await exportDiagramAsPdf('NoGroup')
    expect(html2canvas).not.toHaveBeenCalled()
    expect(jsPDFCtor).not.toHaveBeenCalled()
  })

  it('captures the svg, builds a PDF, saves it, and toasts success', async () => {
    buildCanvasDom()

    await exportDiagramAsPdf('My Diagram')

    expect(html2canvas).toHaveBeenCalledTimes(1)
    expect(jsPDFCtor).toHaveBeenCalledTimes(1)
    expect(addImage).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('My Diagram.pdf')
    expect(showToast).toHaveBeenCalledWith('PDF exported!', expect.objectContaining({ color: '#22c55e' }))
    // wrapper appended during capture is removed afterwards
    expect(document.querySelectorAll('div').length).toBe(1) // only the canvas root remains
  })

  it('falls back to "diagram.pdf" when no name is provided', async () => {
    buildCanvasDom()
    await exportDiagramAsPdf('')
    expect(save).toHaveBeenCalledWith('diagram.pdf')
  })

  it('produces a portrait PDF when content is taller than wide', async () => {
    const root = buildCanvasDom()
    const g = root.querySelector('g') as SVGGElement
    // Tall bbox → vh > vw → portrait orientation (covers line 53/54/61 portrait branches)
    g.getBBox = () => ({ x: 0, y: 0, width: 40, height: 400, top: 0, left: 0, right: 40, bottom: 400, toJSON() {} }) as DOMRect

    await exportDiagramAsPdf('Tall')

    expect(jsPDFCtor).toHaveBeenCalledTimes(1)
    expect((jsPDFCtor.mock.calls[0] as unknown[])[0]).toEqual(expect.objectContaining({ orientation: 'portrait' }))
    expect(save).toHaveBeenCalledWith('Tall.pdf')
  })

  it('uses the canvas-root background color when one is set', async () => {
    const root = buildCanvasDom()
    root.style.backgroundColor = 'rgb(10, 20, 30)'
    // jsdom getComputedStyle reflects inline style → bg is truthy (covers line 22 "||" left side)
    await exportDiagramAsPdf('Colored')

    expect(html2canvas).toHaveBeenCalledTimes(1)
    expect((html2canvas.mock.calls[0] as unknown[])[1]).toEqual(
      expect.objectContaining({ backgroundColor: 'rgb(10, 20, 30)' })
    )
  })

  it('falls back to #ffffff when computed background color is empty', async () => {
    buildCanvasDom()
    // Force an empty backgroundColor so the `|| '#ffffff'` fallback fires (line 22)
    const gcsSpy = vi
      .spyOn(window, 'getComputedStyle')
      .mockReturnValue({ backgroundColor: '' } as CSSStyleDeclaration)

    await exportDiagramAsPdf('NoBg')

    expect(html2canvas).toHaveBeenCalledTimes(1)
    expect((html2canvas.mock.calls[0] as unknown[])[1]).toEqual(
      expect.objectContaining({ backgroundColor: '#ffffff' })
    )
    gcsSpy.mockRestore()
  })

  it('toasts failure and removes the wrapper when html2canvas throws', async () => {
    buildCanvasDom()
    html2canvas.mockRejectedValueOnce(new Error('canvas boom'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await exportDiagramAsPdf('Boom')

    expect(showToast).toHaveBeenCalledWith('PDF export failed', expect.objectContaining({ color: '#ef4444' }))
    expect(save).not.toHaveBeenCalled()
    // finally block always removes the wrapper
    expect(document.querySelectorAll('div').length).toBe(1)
    errSpy.mockRestore()
  })
})
