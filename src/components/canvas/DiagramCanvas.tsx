import { useRef, useState, useCallback, useEffect } from 'react'
import { useDiagramStore } from '../../store/diagramStore'
import { getTheme } from '../../lib/themes'
import { EdgeLayer } from './EdgeLayer'
import { Node } from './Node'
import { useKeyboard } from '../../hooks/useKeyboard'

interface DiagramCanvasProps {
  onNodeSelect: (nodeId: string | null) => void
  readOnly?: boolean
}

export function DiagramCanvas({ onNodeSelect, readOnly }: DiagramCanvasProps) {
  const { activeDiagram, selectedNodeIds, setSelectedNodeIds, diagramType, lineStyle, themeId, addNode, reorderNode } = useDiagramStore()
  const canvasBg = getTheme(themeId).canvasBg
  const svgRef = useRef<SVGSVGElement>(null!)
  const gRef = useRef<SVGGElement>(null!)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  // Auto-recover: if diagram has no nodes, add a root
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activeDiagram) return
    if (activeDiagram.nodes.length === 0) {
      addNode(null, activeDiagram.name || 'Root')
    }
  }, [activeDiagram?.id])

  // Center on root whenever the root node first appears (covers both normal load & auto-recovery)
  const rootNodeId = activeDiagram?.nodes.find(n => n.parentId === null)?.id
  useEffect(() => {
    if (!rootNodeId || !activeDiagram) return
    const root = activeDiagram.nodes.find(n => n.id === rootNodeId)
    if (!root) return
    const centerRoot = () => {
      const svg = svgRef.current
      if (!svg) return
      const { width, height } = svg.getBoundingClientRect()
      if (width === 0 || height === 0) return
      const rootCX = root.x + root.width / 2
      const rootCY = root.y + root.height / 2
      setPan({ x: width / 2 - rootCX, y: height / 2 - rootCY })
    }
    // Use rAF so the SVG is fully laid out before we read its dimensions
    const raf = requestAnimationFrame(centerRoot)
    return () => cancelAnimationFrame(raf)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootNodeId])

  // Smooth zoom via lerp animation
  const zoomCurrentRef = useRef(1)
  const zoomTargetRef = useRef(1)
  const zoomRafRef = useRef<number | null>(null)
  const animateZoomRef = useRef<(() => void) | null>(null)
  animateZoomRef.current = () => {
    const diff = zoomTargetRef.current - zoomCurrentRef.current
    if (Math.abs(diff) < 0.002) {
      zoomCurrentRef.current = zoomTargetRef.current
      setZoom(zoomTargetRef.current)
      zoomRafRef.current = null
      return
    }
    zoomCurrentRef.current += diff * 0.18
    setZoom(zoomCurrentRef.current)
    zoomRafRef.current = requestAnimationFrame(() => animateZoomRef.current?.())
  }

  // Rubber-band selection state
  const [selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const selStart = useRef<{ cx: number; cy: number } | null>(null)
  const isDragging = useRef(false)

  // Drag-reorder state: snap line between siblings
  const [, setSnapLine] = useState<{ x1: number; x2: number; y: number } | null>(null)
  const snapTargetRef = useRef<{ insertBeforeId: string | null } | null>(null)

  useKeyboard()

  function screenToCanvas(screenX: number, screenY: number) {
    const g = gRef.current
    if (!g) return { x: 0, y: 0 }
    const pt = g.ownerSVGElement!.createSVGPoint()
    pt.x = screenX
    pt.y = screenY
    const r = pt.matrixTransform(g.getScreenCTM()!.inverse())
    return { x: r.x, y: r.y }
  }

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey) {
      const factor = 1 - Math.max(-0.08, Math.min(0.08, e.deltaY * 0.004))
      zoomTargetRef.current = Math.min(3, Math.max(0.15, zoomTargetRef.current * factor))
      if (!zoomRafRef.current) {
        zoomRafRef.current = requestAnimationFrame(() => animateZoomRef.current?.())
      }
    } else {
      setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
    }
  }, [])


  const handleBgPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && (e.target as Element).tagName !== 'svg') return
    e.preventDefault()
    isDragging.current = false
    const { x, y } = screenToCanvas(e.clientX, e.clientY)
    selStart.current = { cx: x, cy: y }
    setSelBox({ x, y, w: 0, h: 0 })
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }, [])

  const handleBgPointerMove = useCallback((e: React.PointerEvent) => {
    if (!selStart.current || !activeDiagram) return
    const { x, y } = screenToCanvas(e.clientX, e.clientY)
    const sx = selStart.current.cx
    const sy = selStart.current.cy
    const box = {
      x: Math.min(sx, x), y: Math.min(sy, y),
      w: Math.abs(x - sx), h: Math.abs(y - sy),
    }
    if (box.w > 4 || box.h > 4) {
      isDragging.current = true
      setSelBox(box)
      const hits = activeDiagram.nodes.filter(n =>
        n.x < box.x + box.w && n.x + n.width > box.x &&
        n.y < box.y + box.h && n.y + n.height > box.y
      )
      setSelectedNodeIds(hits.map(n => n.id))
      onNodeSelect(hits.length === 1 ? hits[0].id : null)
    }
  }, [activeDiagram, setSelectedNodeIds, onNodeSelect])

  const handleBgPointerUp = useCallback(() => {
    // Only act if the drag started on the background (selStart was set)
    if (selStart.current && !isDragging.current) {
      setSelectedNodeIds([])
      onNodeSelect(null)
    }
    selStart.current = null
    isDragging.current = false
    setSelBox(null)
  }, [setSelectedNodeIds, onNodeSelect])

  const handleDragMove = useCallback((id: string, _cx: number, cy: number) => {
    if (!activeDiagram) return
    const node = activeDiagram.nodes.find(n => n.id === id)
    if (!node) return
    // Find siblings (same parent), sorted by Y
    const siblings = activeDiagram.nodes
      .filter(n => n.parentId === node.parentId && n.id !== id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    if (siblings.length === 0) { setSnapLine(null); snapTargetRef.current = null; return }
    // Find insertion point: which gap does cy fall into?
    let insertBefore: string | null = null
    let snapY = siblings[siblings.length - 1].y + siblings[siblings.length - 1].height + 8
    for (let i = 0; i < siblings.length; i++) {
      const sib = siblings[i]
      const sibCY = sib.y + sib.height / 2
      if (cy < sibCY) {
        insertBefore = sib.id
        snapY = i === 0 ? sib.y - 8 : (siblings[i - 1].y + siblings[i - 1].height + sib.y) / 2
        break
      }
    }
    const minX = Math.min(...siblings.map(s => s.x))
    const maxX = Math.max(...siblings.map(s => s.x + s.width))
    snapTargetRef.current = { insertBeforeId: insertBefore }
    setSnapLine({ x1: minX - 6, x2: maxX + 6, y: snapY })
  }, [activeDiagram])

  const handleDragEnd = useCallback((id: string) => {
    const snap = snapTargetRef.current
    snapTargetRef.current = null
    setSnapLine(null)
    if (!snap) return
    reorderNode(id, snap.insertBeforeId)
  }, [reorderNode])

  const handleSelect = useCallback((id: string, multi: boolean) => {
    if (multi) {
      const next = selectedNodeIds.includes(id) ? selectedNodeIds.filter(n => n !== id) : [...selectedNodeIds, id]
      setSelectedNodeIds(next)
      onNodeSelect(next.length === 1 ? next[0] : null)
    } else {
      setSelectedNodeIds([id])
      onNodeSelect(id)
    }
  }, [selectedNodeIds, setSelectedNodeIds, onNodeSelect])

  if (!activeDiagram) {
    return <div style={{ position: 'absolute', inset: 0, background: canvasBg }} />
  }

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: canvasBg, cursor: 'default' }}>
      <svg ref={svgRef} width="100%" height="100%"
        onWheel={handleWheel}
        onPointerDown={handleBgPointerDown}
        onPointerMove={handleBgPointerMove}
        onPointerUp={handleBgPointerUp}
        style={{ userSelect: 'none' }}
      >
        <g ref={gRef} transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          <EdgeLayer nodes={activeDiagram.nodes} lineStyle={lineStyle} diagramType={diagramType} />
          {activeDiagram.nodes.map(node => (
            <Node
              key={node.id}
              node={node}
              isSelected={selectedNodeIds.includes(node.id)}
              onSelect={handleSelect}
              onDragEnd={handleDragEnd}
              onDragMove={handleDragMove}
              onDoubleClick={n => { setSelectedNodeIds([n.id]); onNodeSelect(n.id) }}
              onAddChild={id => addNode(id)}
              svgRef={svgRef}
              readOnly={readOnly}
            />
          ))}
          {/* Rubber-band selection box */}
          {selBox && selBox.w > 4 && (
            <rect
              x={selBox.x} y={selBox.y}
              width={selBox.w} height={selBox.h}
              fill="rgba(59,130,246,0.07)"
              stroke="#3b82f6"
              strokeWidth={1.5 / zoom}
              strokeDasharray={`${5 / zoom} ${3 / zoom}`}
              rx={3 / zoom}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </g>
      </svg>

    </div>
  )
}
