import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { showToast } from '../../components/CuteToast'

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
    const canvas = await html2canvas(wrapper, {
      scale: 1.2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: bg,
      width: vw,
      height: vh,
      imageTimeout: 0,
      logging: false,
    })

    // JPEG at 85% quality — far smaller than PNG for diagram content
    const imgData = canvas.toDataURL('image/jpeg', 0.72)
    const landscape = vw > vh
    const pdfW = landscape ? 297 : 210
    const pdfH = landscape ? 210 : 297
    const ratio = Math.min((pdfW - 10) / vw, (pdfH - 10) / vh)
    const drawW = vw * ratio
    const drawH = vh * ratio
    const dx = (pdfW - drawW) / 2
    const dy = (pdfH - drawH) / 2

    const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true })
    pdf.addImage(imgData, 'JPEG', dx, dy, drawW, drawH, undefined, 'FAST')
    pdf.save(`${diagramName || 'diagram'}.pdf`)
    showToast('PDF exported!', { color: '#22c55e', confetti: true })
  } catch (err) {
    console.error('PDF export failed', err)
    showToast('PDF export failed', { color: '#ef4444' })
  } finally {
    document.body.removeChild(wrapper)
  }
}
