import { showToast } from '../../components/CuteToast.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Serialize the on-screen diagram as a standalone SVG: fitted to the whole map,
 * pan/zoom dropped, background painted in, fonts named on the root so the markup
 * renders the same outside the app.
 */
export function buildDiagramSvg(): string {
  const svgEl = document.querySelector('.diagram-canvas-root svg') as SVGSVGElement | null
  const innerG = svgEl?.querySelector('g') as SVGGElement | null
  if (!svgEl || !innerG) throw new Error('no diagram on screen')

  const bbox = innerG.getBBox()
  const pad = 60
  const vx = bbox.x - pad
  const vy = bbox.y - pad
  const vw = bbox.width + pad * 2
  const vh = bbox.height + pad * 2

  const canvasRoot = document.querySelector('.diagram-canvas-root') as HTMLElement | null
  const bg = (canvasRoot ? getComputedStyle(canvasRoot).backgroundColor : '') || '#ffffff'

  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', SVG_NS)
  clone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`)
  clone.setAttribute('width', String(vw))
  clone.setAttribute('height', String(vh))
  // The app's font comes from a CSS rule on an ancestor, which the clone leaves
  // behind — name it on the root or every label falls back to the default serif.
  clone.setAttribute('font-family', 'Inter, system-ui, sans-serif')
  const cloneG = clone.querySelector('g') as SVGGElement | null
  if (cloneG) cloneG.removeAttribute('transform')

  // Paint the canvas background so the paste is not transparent.
  const rect = document.createElementNS(SVG_NS, 'rect')
  rect.setAttribute('x', String(vx))
  rect.setAttribute('y', String(vy))
  rect.setAttribute('width', String(vw))
  rect.setAttribute('height', String(vh))
  rect.setAttribute('fill', bg)
  clone.insertBefore(rect, clone.firstChild)

  return new XMLSerializer().serializeToString(clone)
}

/**
 * Put the diagram on the clipboard as SVG. The markup goes on as text (what
 * Figma, Illustrator, editors and docs read on paste) and, where the browser
 * allows it, alongside a real image/svg+xml flavour.
 */
export async function copyDiagramSvg(): Promise<boolean> {
  try {
    const svg = buildDiagramSvg()

    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const text = new Blob([svg], { type: 'text/plain' })
      const image = new Blob([svg], { type: 'image/svg+xml' })
      try {
        // "web image/svg+xml" is the custom-format spelling browsers accept for
        // svg; plain text/plain is the flavour every paste target understands.
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/plain': text, 'web image/svg+xml': image }),
        ])
        showToast('SVG copied!', { color: '#22c55e', confetti: true })
        return true
      } catch {
        // Browser refused the custom flavour — text alone still pastes as vectors.
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text })])
        showToast('SVG copied!', { color: '#22c55e', confetti: true })
        return true
      }
    }

    if (!navigator.clipboard?.writeText) {
      showToast('Clipboard not supported here', { color: '#ef4444' })
      return false
    }
    await navigator.clipboard.writeText(svg)
    showToast('SVG copied!', { color: '#22c55e', confetti: true })
    return true
  } catch (err) {
    console.error('Copy SVG failed', err)
    showToast('Copy SVG failed', { color: '#ef4444' })
    return false
  }
}
