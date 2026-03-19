import { useRef, useState, useCallback, useEffect } from 'react'
import { useIdeaStore } from '../../store/ideaStore'
import { getTheme } from '../../lib/themes'
import { EdgeLayer } from './EdgeLayer'
import { Node } from './Node'
import { useKeyboard } from '../../hooks/useKeyboard'
import { exportDiagramAsPdf } from '../../lib/export/exportPdf'
import { FileDown, Trash2, Star } from 'lucide-react'

interface DiagramCanvasProps {
  onNodeSelect: (nodeId: string | null) => void
  readOnly?: boolean
  onDelete?: () => void
  isFav?: boolean
  onToggleFav?: () => void
}

export function DiagramCanvas({ onNodeSelect, readOnly, onDelete, isFav, onToggleFav }: DiagramCanvasProps) {
  const { activeIdea, selectedNodeIds, setSelectedNodeIds, diagramType, lineStyle, themeId, addNode, reorderNode, isImporting } = useIdeaStore()
  const canvasBg = getTheme(themeId).canvasBg
  const svgRef = useRef<SVGSVGElement>(null!)
  const gRef = useRef<SVGGElement>(null!)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rootDragOffset, setRootDragOffset] = useState<{ dx: number; dy: number } | null>(null)
  const rootDragClientRef = useRef<{ x: number; y: number } | null>(null)
  const rootAutoPanRafRef = useRef<number | null>(null)

  // Auto-recover: if diagram has no nodes, add a root
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activeIdea) return
    if (activeIdea.nodes.length === 0) {
      addNode(null, activeIdea.name || 'Root')
    }
  }, [activeIdea?.id])

  const [showZoomMenu, setShowZoomMenu] = useState(false)
  const [showZoomHud, setShowZoomHud] = useState(false)
  const zoomHudTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isZoomingRef = useRef(false)

  const flashZoomHud = useCallback(() => {
    isZoomingRef.current = true
    setShowZoomHud(true)
    if (zoomHudTimer.current) clearTimeout(zoomHudTimer.current)
    zoomHudTimer.current = setTimeout(() => {
      isZoomingRef.current = false
      setShowZoomHud(false)
    }, 1200)
  }, [])

  const fitView = useCallback(() => {
    const svg = svgRef.current
    if (!svg || !activeIdea?.nodes.length) return
    const { width: svgW, height: svgH } = svg.getBoundingClientRect()
    if (svgW === 0 || svgH === 0) return
    const nodes = activeIdea.nodes
    const minX = Math.min(...nodes.map(n => n.x))
    const minY = Math.min(...nodes.map(n => n.y))
    const maxX = Math.max(...nodes.map(n => n.x + n.width))
    const maxY = Math.max(...nodes.map(n => n.y + n.height))
    const pad = 80
    const newZoom = Math.min((svgW - pad * 2) / (maxX - minX), (svgH - pad * 2) / (maxY - minY), MAX_ZOOM)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setZoom(newZoom)
    zoomCurrentRef.current = newZoom
    zoomTargetRef.current = newZoom
    setPan({ x: svgW / 2 - cx * newZoom, y: svgH / 2 - cy * newZoom })
  }, [activeIdea])

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
    flashZoomHud()
  }, [zoom, flashZoomHud])

  // Auto-fit on initial diagram load or diagram type switch
  useEffect(() => {
    if (!activeIdea) return
    const raf = requestAnimationFrame(fitView)
    return () => cancelAnimationFrame(raf)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdea?.id, diagramType])

  const MIN_ZOOM = 0.2
  const MAX_ZOOM = 9.99
  const RUBBER = 0.22 // resistance factor when past limits

  // Smooth zoom via lerp animation
  const zoomCurrentRef = useRef(1)
  const zoomTargetRef = useRef(1)
  const zoomRafRef = useRef<number | null>(null)
  const snapBackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  // Apply zoom with rubber-band past limits, snap back after input stops
  const applyZoom = useCallback((rawTarget: number) => {
    let target: number
    if (rawTarget < MIN_ZOOM) {
      target = MIN_ZOOM - (MIN_ZOOM - rawTarget) * RUBBER
    } else if (rawTarget > MAX_ZOOM) {
      target = MAX_ZOOM + (rawTarget - MAX_ZOOM) * RUBBER
    } else {
      target = rawTarget
    }
    zoomTargetRef.current = target
    if (!zoomRafRef.current) {
      zoomRafRef.current = requestAnimationFrame(() => animateZoomRef.current?.())
    }
    // Snap back to limits after input stops
    if (snapBackTimer.current) clearTimeout(snapBackTimer.current)
    snapBackTimer.current = setTimeout(() => {
      zoomTargetRef.current = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomTargetRef.current))
      if (!zoomRafRef.current) {
        zoomRafRef.current = requestAnimationFrame(() => animateZoomRef.current?.())
      }
    }, 180)
  }, [])

  // Rubber-band selection state
  const [selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const selStart = useRef<{ cx: number; cy: number } | null>(null)
  const isDragging = useRef(false)

  // Pinch-to-zoom state
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const lastPinchDist = useRef<number | null>(null)

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
      applyZoom(zoomTargetRef.current * factor)
      flashZoomHud()
    } else {
      setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
    }
  }, [flashZoomHud])


  const handleBgPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && (e.target as Element).tagName !== 'svg') return
    e.preventDefault()
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    ;(e.target as Element).setPointerCapture(e.pointerId)
    // Second finger landed — cancel rubber-band, switch to pinch
    if (activePointers.current.size >= 2) {
      selStart.current = null
      isDragging.current = false
      setSelBox(null)
      lastPinchDist.current = null
      return
    }
    isDragging.current = false
    if (e.pointerType !== 'mouse') return  // touch devices: no rubber-band select
    const { x, y } = screenToCanvas(e.clientX, e.clientY)
    selStart.current = { cx: x, cy: y }
    setSelBox({ x, y, w: 0, h: 0 })
  }, [])

  const handleBgPointerMove = useCallback((e: React.PointerEvent) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // Pinch-to-zoom with two fingers
    if (activePointers.current.size === 2) {
      const [p1, p2] = Array.from(activePointers.current.values())
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      if (lastPinchDist.current !== null) {
        const factor = dist / lastPinchDist.current
        applyZoom(zoomTargetRef.current * factor)
        flashZoomHud()
      }
      lastPinchDist.current = dist
      return
    }
    if (!selStart.current || !activeIdea) return
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
      const hits = activeIdea.nodes.filter(n =>
        n.x < box.x + box.w && n.x + n.width > box.x &&
        n.y < box.y + box.h && n.y + n.height > box.y
      )
      setSelectedNodeIds(hits.map(n => n.id))
      onNodeSelect(hits.length === 1 ? hits[0].id : null)
    }
  }, [activeIdea, setSelectedNodeIds, onNodeSelect])

  const handleBgPointerUp = useCallback((e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId)
    if (activePointers.current.size < 2) lastPinchDist.current = null
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
    if (!activeIdea) return
    const node = activeIdea.nodes.find(n => n.id === id)
    if (!node) return
    // Find siblings (same parent), sorted by Y
    const siblings = activeIdea.nodes
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
  }, [activeIdea])

  const handleDragEnd = useCallback((id: string) => {
    const snap = snapTargetRef.current
    snapTargetRef.current = null
    setSnapLine(null)
    if (!snap) return
    reorderNode(id, snap.insertBeforeId)
  }, [reorderNode])

  const handleRootDragOffset = useCallback((info: { dx: number; dy: number; clientX: number; clientY: number } | null) => {
    if (!info) {
      rootDragClientRef.current = null
      setRootDragOffset(null)
      if (rootAutoPanRafRef.current) {
        cancelAnimationFrame(rootAutoPanRafRef.current)
        rootAutoPanRafRef.current = null
      }
      return
    }
    rootDragClientRef.current = { x: info.clientX, y: info.clientY }
    if (info.dx !== 0 || info.dy !== 0) setRootDragOffset({ dx: info.dx, dy: info.dy })

    if (rootAutoPanRafRef.current) return // already running
    const EDGE_ZONE = 80
    const MAX_SPEED = 10
    function autoPanLoop() {
      const client = rootDragClientRef.current
      if (!client) { rootAutoPanRafRef.current = null; return }
      const vw = window.innerWidth
      const vh = window.innerHeight
      let panDx = 0, panDy = 0
      if (client.x < EDGE_ZONE) panDx = -MAX_SPEED * (1 - client.x / EDGE_ZONE)
      else if (client.x > vw - EDGE_ZONE) panDx = MAX_SPEED * (1 - (vw - client.x) / EDGE_ZONE)
      if (client.y < EDGE_ZONE) panDy = -MAX_SPEED * (1 - client.y / EDGE_ZONE)
      else if (client.y > vh - EDGE_ZONE) panDy = MAX_SPEED * (1 - (vh - client.y) / EDGE_ZONE)
      if (panDx !== 0 || panDy !== 0) {
        setPan(p => ({ x: p.x + panDx, y: p.y + panDy }))
        const z = zoomCurrentRef.current
        const root = useIdeaStore.getState().activeIdea?.nodes.find(n => n.depth === 0)
        if (root) {
          useIdeaStore.getState().updateNode(root.id, {
            x: root.x - panDx / z,
            y: root.y - panDy / z,
            manuallyPositioned: true,
          })
        }
      }
      rootAutoPanRafRef.current = requestAnimationFrame(autoPanLoop)
    }
    rootAutoPanRafRef.current = requestAnimationFrame(autoPanLoop)
  }, [])

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

  if (!activeIdea) {
    return <div style={{ position: 'absolute', inset: 0, background: canvasBg }} />
  }

  return (
    <div className="diagram-canvas-root" style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: canvasBg, cursor: 'default' }}>
      <svg ref={svgRef} width="100%" height="100%"
        onWheel={handleWheel}
        onPointerDown={handleBgPointerDown}
        onPointerMove={handleBgPointerMove}
        onPointerUp={handleBgPointerUp}
        onPointerCancel={handleBgPointerUp}
        style={{ userSelect: 'none' }}
      >
        <g ref={gRef} transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          <EdgeLayer nodes={activeIdea.nodes} lineStyle={lineStyle} diagramType={diagramType} />
          {activeIdea.nodes.map(node => (
            <Node
              key={node.id}
              node={node}
              isSelected={selectedNodeIds.includes(node.id)}
              onSelect={handleSelect}
              onDragEnd={handleDragEnd}
              onDragMove={handleDragMove}
              onRootDragOffset={handleRootDragOffset}
              onDoubleClick={n => { setSelectedNodeIds([n.id]); onNodeSelect(n.id) }}
              onAddChild={id => addNode(id)}
              svgRef={svgRef}
              readOnly={readOnly}
              l1Colors={node.depth === 0 ? activeIdea.nodes.filter(n => n.depth === 1).map(n => n.color) : undefined}
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

      {/* Zoom HUD — fixed to viewport top center, always above everything */}
      <div style={{
        position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(15,20,40,0.78)', backdropFilter: 'blur(10px)',
        color: '#fff', fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 14, fontWeight: 700, letterSpacing: '0.04em',
        padding: '6px 18px', borderRadius: 24,
        pointerEvents: 'none', zIndex: 9999,
        opacity: showZoomHud ? 1 : 0,
        transition: showZoomHud ? 'opacity 0.05s ease' : 'opacity 0.8s ease',
        whiteSpace: 'nowrap',
      }}>
        {Math.round(zoom * 100)}%
      </div>

      {/* Root drag HUD */}
      {rootDragOffset && (() => {
        const root = activeIdea?.nodes.find(n => n.depth === 0)
        const l1 = activeIdea?.nodes.find(n => n.depth === 1)
        if (!root || !l1) return null
        const trunkLen = Math.max(0, Math.round((l1.x - 60) - (root.x + root.width)))
        return (
          <div style={{
            position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(15,20,40,0.78)', backdropFilter: 'blur(10px)',
            color: '#fff', fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
            padding: '6px 18px', borderRadius: 24,
            pointerEvents: 'none', zIndex: 9999, whiteSpace: 'nowrap',
          }}>
            ↔ {trunkLen}px
          </div>
        )
      })()}

      {/* Bottom bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 28,
        background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)',
        borderTop: '1px solid #e8eaed',
        display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
        padding: '0 8px',
      }}>
        {/* Left: empty */}
        <div />

        {/* Center: PDF + Fav + Delete */}
        {activeIdea ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => exportDiagramAsPdf(activeIdea.name)}
              title="Download PDF"
              style={{
                height: 20, padding: '0 8px', border: '1px solid #e2e8f0', borderRadius: 5,
                background: 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                color: '#64748b', fontFamily: 'Inter, system-ui, sans-serif',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <FileDown size={11} /> PDF
            </button>
            {onToggleFav && (
              <button
                onClick={onToggleFav}
                title={isFav ? 'Unfavorite' : 'Favorite'}
                style={{
                  height: 20, padding: '0 8px', border: '1px solid #e2e8f0', borderRadius: 5,
                  background: 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                  color: isFav ? '#eab308' : '#94a3b8', fontFamily: 'Inter, system-ui, sans-serif',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Star size={10} fill={isFav ? '#eab308' : 'none'} /> Star
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                title="Delete map"
                style={{
                  height: 20, padding: '0 8px', border: '1px solid #fecaca', borderRadius: 5,
                  background: 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                  color: '#ef4444', fontFamily: 'Inter, system-ui, sans-serif',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <Trash2 size={10} /> Delete
              </button>
            )}
          </div>
        ) : <div />}

        {/* Right: Zoom */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>

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
    </div>
  )
}
