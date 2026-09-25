import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { showToast } from '../../components/CuteToast.js'

export async function exportDiagramAsPdf(diagramName: string) {
  const svgEl = document.querySelector('.diagram-canvas-root svg') as SVGSVGElement | null
  if (!svgEl) return

  const innerG = svgEl.querySelector('g') as SVGGElement | null
  if (!innerG) return

  // Content bounds in innerG local space
  const bbox = innerG.getBBox()
  const pad = 60
  const vx = bbox.x - pad
  const vy = bbox.y - pad
  const vw = bbox.width + pad * 2
  const vh = bbox.height + pad * 2

  // Get canvas background color
  const canvasRoot = document.querySelector('.diagram-canvas-root') as HTMLElement
  const bg = (canvasRoot ? getComputedStyle(canvasRoot).backgroundColor : '') || '#ffffff'

  // Clone SVG, set viewBox to full content, remove pan/zoom transform
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`)
  clone.setAttribute('width', String(vw))
  clone.setAttribute('height', String(vh))
  const cloneG = clone.querySelector('g') as SVGGElement | null
  if (cloneG) cloneG.removeAttribute('transform')

  // Wrap in an HTMLElement so html2canvas can capture it
  const wrapper = document.createElement('div')
  wrapper.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${vw}px;height:${vh}px;background:${bg};overflow:hidden;`
  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)

  try {
    // HD: 3x the CSS pixels, capped so a huge map cannot exhaust the canvas limit.
    const scale = Math.min(3, Math.sqrt(24_000_000 / (vw * vh)))
    const canvas = await html2canvas(wrapper, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: bg,
      width: vw,
      height: vh,
      imageTimeout: 0,
      logging: false,
    })

    // Lossless PNG (flat diagram colours compress well) on a page cut to the map's own
    // size, so nothing is shrunk onto A4 and the text stays crisp when zoomed.
    const imgData = canvas.toDataURL('image/png')
    const margin = 8
    const pdfW = vw * 0.2646 + margin * 2   // CSS px -> mm at 96 dpi
    const pdfH = vh * 0.2646 + margin * 2
    const pdf = new jsPDF({ orientation: pdfW > pdfH ? 'landscape' : 'portrait', unit: 'mm', format: [pdfW, pdfH], compress: true })
    // Paint the page in the canvas colour first, so the margin is not left transparent.
    const rgb = bg.match(/\d+/g)?.slice(0, 3).map(Number)
    if (rgb && rgb.length === 3) { pdf.setFillColor(rgb[0], rgb[1], rgb[2]); pdf.rect(0, 0, pdfW, pdfH, 'F') }
    pdf.addImage(imgData, 'PNG', margin, margin, vw * 0.2646, vh * 0.2646, undefined, 'FAST')
    pdf.save(`${diagramName || 'diagram'}.pdf`)
    showToast('PDF exported!', { color: '#22c55e', confetti: true })
  } catch (err) {
    console.error('PDF export failed', err)
    showToast('PDF export failed', { color: '#ef4444' })
  } finally {
    document.body.removeChild(wrapper)
  }
}
