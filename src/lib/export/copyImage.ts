import html2canvas from 'html2canvas'
import { showToast } from '../../components/CuteToast'

// Long edge we aim for so the pasted image is at least HD, never downscaled below 100%.
const HD_EDGE = 1920
const MAX_EDGE = 8000

export function hdScale(vw: number, vh: number): number {
  const edge = Math.max(vw, vh)
  if (edge <= 0) return 1
  const wanted = Math.max(2, Math.min(4, HD_EDGE / edge))
  return Math.max(1, Math.min(wanted, MAX_EDGE / edge))
}

async function renderFittedPng(): Promise<Blob> {
  const svgEl = document.querySelector('.diagram-canvas-root svg') as SVGSVGElement | null
  const innerG = svgEl?.querySelector('g') as SVGGElement | null
  if (!svgEl || !innerG) throw new Error('no diagram on screen')

  // Content bounds in innerG local space — the whole map, not just what is panned into view.
  const bbox = innerG.getBBox()
  const pad = 60
  const vx = bbox.x - pad
  const vy = bbox.y - pad
  const vw = bbox.width + pad * 2
  const vh = bbox.height + pad * 2

  const canvasRoot = document.querySelector('.diagram-canvas-root') as HTMLElement | null
  const bg = (canvasRoot ? getComputedStyle(canvasRoot).backgroundColor : '') || '#ffffff'

  // Clone, fit the viewBox to the content, drop the pan/zoom transform.
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`)
  clone.setAttribute('width', String(vw))
  clone.setAttribute('height', String(vh))
  const cloneG = clone.querySelector('g') as SVGGElement | null
  if (cloneG) cloneG.removeAttribute('transform')

  const wrapper = document.createElement('div')
  wrapper.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${vw}px;height:${vh}px;background:${bg};overflow:hidden;`
  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)

  try {
    const canvas = await html2canvas(wrapper, {
      scale: hdScale(vw, vh),
      useCORS: true,
      allowTaint: true,
      backgroundColor: bg,
      width: vw,
      height: vh,
      imageTimeout: 0,
      logging: false,
    })
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('png encode failed'))), 'image/png')
    })
  } finally {
    document.body.removeChild(wrapper)
  }
}

export async function copyDiagramImage(): Promise<boolean> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    showToast('Clipboard images not supported here', { color: '#ef4444' })
    return false
  }
  try {
    // Hand the clipboard the promise, not the blob: Safari only allows the write
    // inside the click gesture, and awaiting the render first loses it.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderFittedPng() })])
    showToast('Diagram copied!', { color: '#22c55e', confetti: true })
    return true
  } catch (err) {
    console.error('Copy image failed', err)
    showToast('Copy image failed', { color: '#ef4444' })
    return false
  }
}
