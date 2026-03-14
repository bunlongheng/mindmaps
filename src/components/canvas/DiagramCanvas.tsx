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
  const { activeDiagram, selectedNodeIds, setSelectedNodeIds, diagramType, lineStyle, themeId, addNode, reorderNode, isImporting } = useDiagramStore()
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

  const [showZoomMenu, setShowZoomMenu] = useState(false)

  const fitView = useCallback(() => {
    const svg = svgRef.current
    if (!svg || !activeDiagram?.nodes.length) return
    const { width: svgW, height: svgH } = svg.getBoundingClientRect()
    if (svgW === 0 || svgH === 0) return
    const nodes = activeDiagram.nodes
    const minX = Math.min(...nodes.map(n => n.x))
    const minY = Math.min(...nodes.map(n => n.y))
    const maxX = Math.max(...nodes.map(n => n.x + n.width))
    const maxY = Math.max(...nodes.map(n => n.y + n.height))
    const pad = 80
    const newZoom = Math.min((svgW - pad * 2) / (maxX - minX), (svgH - pad * 2) / (maxY - minY), 1)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setZoom(newZoom)
    zoomCurrentRef.current = newZoom
    zoomTargetRef.current = newZoom
    setPan({ x: svgW / 2 - cx * newZoom, y: svgH / 2 - cy * newZoom })
  }, [activeDiagram])

  const setZoomLevel = useCallback((level: number) => {
    const svg = svgRef.current
    if (!svg) return
    const { width: svgW, height: svgH } = svg.getBoundingClientRect()
    setZoom(level)
    zoomCurrentRef.current = level
    zoomTargetRef.current = level
    setPan(p => {
      const cx = (svgW / 2 - p.x) / zoom
      const cy = (svgH / 2 - p.y) / zoom
      return { x: svgW / 2 - cx * level, y: svgH / 2 - cy * level }
    })
  }, [zoom])

  // Auto-fit on initial diagram load
  useEffect(() => {
    if (!activeDiagram) return
    const raf = requestAnimationFrame(fitView)
    return () => cancelAnimationFrame(raf)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDiagram?.id])

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
              l1Colors={node.depth === 0 ? activeDiagram.nodes.filter(n => n.depth === 1).map(n => n.color) : undefined}
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

      {/* Import overlay */}
      {isImporting && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 200,
          background: 'rgba(10,12,28,0.82)',
          backdropFilter: 'blur(6px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 18,
          animation: 'importFadeIn 0.22s ease',
        }}>
          <style>{`
            @keyframes importFadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes importPulse {
              0%,100% { transform: scale(1); opacity: 0.7; }
              50% { transform: scale(1.18); opacity: 1; }
            }
            @keyframes importOrbit {
              from { transform: rotate(0deg) translateX(38px) rotate(0deg); }
              to   { transform: rotate(360deg) translateX(38px) rotate(-360deg); }
            }
          `}</style>
          {/* Glowing blobs */}
          <div style={{ position: 'relative', width: 90, height: 90 }}>
            {['#22c55e','#3b82f6','#8b5cf6','#f59e0b','#ec4899','#06b6d4'].map((c, i) => (
              <div key={i} style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 10, height: 10, borderRadius: '50%',
                background: c,
                boxShadow: `0 0 12px 4px ${c}99`,
                animation: `importOrbit ${1.4 + i * 0.22}s linear infinite`,
                animationDelay: `${i * -0.22}s`,
                marginTop: -5, marginLeft: -5,
              }} />
            ))}
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              width: 28, height: 28, borderRadius: '50%',
              background: 'radial-gradient(circle, #22c55e88, #3b82f644)',
              boxShadow: '0 0 28px 8px #22c55e55',
              transform: 'translate(-50%,-50%)',
              animation: 'importPulse 1s ease-in-out infinite',
            }} />
          </div>
          <span style={{
            color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 13, fontWeight: 600, letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>Loading diagram…</span>
        </div>
      )}

      {/* Bottom bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 28,
        background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)',
        borderTop: '1px solid #e8eaed',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        padding: '0 8px',
      }}>
        {/* Zoom button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowZoomMenu(m => !m)}
            style={{
              height: 20, padding: '0 8px', border: '1px solid #e2e8f0', borderRadius: 5,
              background: showZoomMenu ? '#f1f5f9' : 'transparent',
              cursor: 'pointer', fontSize: 11, fontWeight: 500, color: '#64748b',
              fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {Math.round(zoom * 100)}% ▾
          </button>

          {showZoomMenu && (
            <div
              style={{
                position: 'absolute', bottom: 26, right: 0,
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                padding: '4px 0', minWidth: 110, zIndex: 50,
              }}
              onMouseLeave={() => setShowZoomMenu(false)}
            >
              {([
                { label: 'Fit', action: () => { fitView(); setShowZoomMenu(false) }, isFit: true },
                { label: '200%', action: () => { setZoomLevel(2); setShowZoomMenu(false) } },
                { label: '150%', action: () => { setZoomLevel(1.5); setShowZoomMenu(false) } },
                { label: '100%', action: () => { setZoomLevel(1); setShowZoomMenu(false) } },
                { label: '75%',  action: () => { setZoomLevel(0.75); setShowZoomMenu(false) } },
                { label: '50%',  action: () => { setZoomLevel(0.5); setShowZoomMenu(false) } },
                { label: '25%',  action: () => { setZoomLevel(0.25); setShowZoomMenu(false) } },
              ] as { label: string; action: () => void; isFit?: boolean }[]).map(({ label, action, isFit }) => (
                <button key={label} onClick={action} style={{
                  display: 'block', width: '100%', padding: '6px 12px',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 12, textAlign: 'left', fontFamily: 'inherit',
                  color: isFit ? '#3b82f6' : '#374151', fontWeight: isFit ? 600 : 400,
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >{label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
