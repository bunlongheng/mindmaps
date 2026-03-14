import jsPDF from 'jspdf'

export async function exportDiagramAsPdf(diagramName: string) {
  const svgEl = document.querySelector('.diagram-canvas-root svg') as SVGSVGElement | null
  if (!svgEl) return

  // Get the inner <g> that holds all nodes/edges (has the pan+zoom transform)
  const innerG = svgEl.querySelector('g') as SVGGElement | null
  if (!innerG) return

  // Compute actual bounding box of all content in SVG user space
  const bbox = innerG.getBBox()
  const pad = 60
  const vx = bbox.x - pad
  const vy = bbox.y - pad
  const vw = bbox.width + pad * 2
  const vh = bbox.height + pad * 2

  // Clone SVG and set viewBox to full content extent
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`)
  clone.setAttribute('width', String(vw))
  clone.setAttribute('height', String(vh))
  // Remove transform from inner g (viewBox already accounts for it via pan/zoom)
  const cloneG = clone.querySelector('g') as SVGGElement
  if (cloneG) cloneG.removeAttribute('transform')

  // Serialize and load as image
  const svgStr = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([svgStr], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)

  const img = new Image()
  img.src = url
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej })

  // Draw on canvas at 2× for sharpness
  const scale = 2
  const offscreen = document.createElement('canvas')
  offscreen.width = vw * scale
  offscreen.height = vh * scale
  const ctx = offscreen.getContext('2d')!

  // Fill background (use canvas bg color)
  const canvasRoot = document.querySelector('.diagram-canvas-root') as HTMLElement
  const bg = canvasRoot ? getComputedStyle(canvasRoot).backgroundColor : '#ffffff'
  ctx.fillStyle = bg || '#ffffff'
  ctx.fillRect(0, 0, offscreen.width, offscreen.height)
  ctx.drawImage(img, 0, 0, offscreen.width, offscreen.height)
  URL.revokeObjectURL(url)

  const imgData = offscreen.toDataURL('image/png')

  // A4 PDF — landscape if diagram is wider than tall
  const landscape = vw > vh
  const pdfW = landscape ? 297 : 210
  const pdfH = landscape ? 210 : 297
  const ratio = Math.min((pdfW - 10) / vw, (pdfH - 10) / vh)
  const drawW = vw * ratio
  const drawH = vh * ratio
  const dx = (pdfW - drawW) / 2
  const dy = (pdfH - drawH) / 2

  const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  pdf.addImage(imgData, 'PNG', dx, dy, drawW, drawH)
  pdf.save(`${diagramName || 'diagram'}.pdf`)
}
