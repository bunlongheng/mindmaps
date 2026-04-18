import { useRef, useState, useCallback, useEffect } from 'react'
import { useMindmapStore } from '../../store/mindmapStore'
import { getTheme } from '../../lib/themes'
import { EdgeLayer } from './EdgeLayer'
import { Node } from './Node'
import { useKeyboard } from '../../hooks/useKeyboard'
import { soundClick, soundCreate } from '../../lib/sounds'

interface DiagramCanvasProps {
  onNodeSelect: (nodeId: string | null) => void
  readOnly?: boolean
  onDelete?: () => void
}

export function DiagramCanvas({ onNodeSelect, readOnly }: DiagramCanvasProps) {
  const { activeMindmap, selectedNodeIds, setSelectedNodeIds, diagramType, lineStyle, themeId, addNode, reorderNode, isImporting, hideDetails } = useMindmapStore()
  const canvasBg = getTheme(themeId).canvasBg
  const svgRef = useRef<SVGSVGElement>(null!)
  const gRef = useRef<SVGGElement>(null!)
  const [, setPan] = useState({ x: 0, y: 0 })
  const panRef = useRef({ x: 0, y: 0 })
  const zoomCurrentRef = useRef(1)
  const [zoom, setZoom] = useState(1)
  const [rootDragOffset, setRootDragOffset] = useState<{ dx: number; dy: number } | null>(null)
  const rootDragClientRef = useRef<{ x: number; y: number } | null>(null)
  const rootAutoPanRafRef = useRef<number | null>(null)

  // Auto-recover: if diagram has no nodes, add a root
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activeMindmap) return
    if (activeMindmap.nodes.length === 0) {
      addNode(null, activeMindmap.name || 'Root')
    }
  }, [activeMindmap?.id])

  const [showZoomHud, setShowZoomHud] = useState(false)
  const zoomHudTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashZoomHud = useCallback(() => {
    setShowZoomHud(true)
    if (zoomHudTimer.current) clearTimeout(zoomHudTimer.current)
    zoomHudTimer.current = setTimeout(() => setShowZoomHud(false), 1500)
  }, [])

  // Block browser zoom (Ctrl+scroll / pinch) globally so only canvas zooms
  useEffect(() => {
    const handler = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault() }
    document.addEventListener('wheel', handler, { passive: false })
    return () => document.removeEventListener('wheel', handler)
  }, [])

  // Apply pan+zoom directly to the SVG group — no React re-render required
  const applyTransform = useCallback((p = panRef.current, z = zoomCurrentRef.current) => {
    if (gRef.current) gRef.current.setAttribute('transform', `translate(${p.x},${p.y}) scale(${z})`)
  }, [])

  const fitView = useCallback(() => {
    const svg = svgRef.current
    if (!svg || !activeMindmap?.nodes.length) return
    const { width: svgW, height: svgH } = svg.getBoundingClientRect()
    if (svgW === 0 || svgH === 0) return
    const nodes = activeMindmap.nodes
    const minX = Math.min(...nodes.map(n => n.x))
    const minY = Math.min(...nodes.map(n => n.y))
    const maxX = Math.max(...nodes.map(n => n.x + n.width))
    const maxY = Math.max(...nodes.map(n => n.y + n.height))
    const pad = 80
    const newZoom = Math.min((svgW - pad * 2) / (maxX - minX), (svgH - pad * 2) / (maxY - minY), 1)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    zoomCurrentRef.current = newZoom
    setZoom(newZoom)  // badge only

    const p = { x: svgW / 2 - cx * newZoom, y: svgH / 2 - cy * newZoom }
    panRef.current = p
    setPan(p)         // keep pan state in sync for selBox coords
    applyTransform(p, newZoom)
  }, [activeMindmap, applyTransform])


  // Auto-fit on initial diagram load or diagram type switch
  useEffect(() => {
    if (!activeMindmap) return
    const raf = requestAnimationFrame(fitView)
    return () => cancelAnimationFrame(raf)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMindmap?.id, diagramType])

  // Rubber-band selection state
  const [selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const selStart = useRef<{ cx: number; cy: number } | null>(null)
  const isDragging = useRef(false)

  // Space+drag (Figma-style hand tool) panning
  const spaceHeld = useRef(false)
  const mousePanRef = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { spaceHeld.current = true } }
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') spaceHeld.current = false }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [])

  // Pinch-to-zoom state
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const lastPinchDist = useRef<number | null>(null)
  const lastPinchMid = useRef<{ x: number; y: number } | null>(null)
  const touchPanRef = useRef<{ x: number; y: number } | null>(null)

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

  const handleWheelRef = useRef<((e: WheelEvent) => void) | null>(null)
  handleWheelRef.current = (e: WheelEvent) => {
    e.preventDefault()
    // Normalize deltaMode: trackpads may fire line (1) or page (2) mode
    const norm = e.deltaMode === 1 ? 15 : e.deltaMode === 2 ? 300 : 1
    const dx = e.deltaX * norm
    const dy = e.deltaY * norm

    if (e.ctrlKey) {
      // Figma-style fast zoom — 0.99 base for snappy response
      const factor = Math.pow(0.99, dy)
      const oldZoom = zoomCurrentRef.current
      if (!isFinite(oldZoom) || oldZoom <= 0) { zoomCurrentRef.current = 1; return }
      const newZoom = Math.max(0.02, Math.min(10, oldZoom * factor))
      if (!isFinite(newZoom) || newZoom === oldZoom) return
      const newPan = {
        x: e.clientX - ((e.clientX - panRef.current.x) / oldZoom) * newZoom,
        y: e.clientY - ((e.clientY - panRef.current.y) / oldZoom) * newZoom,
      }
      panRef.current = newPan
      zoomCurrentRef.current = newZoom
      applyTransform(newPan, newZoom)
      setZoom(newZoom)  // badge only
      flashZoomHud()
    } else {
      panRef.current = { x: panRef.current.x - dx, y: panRef.current.y - dy }
      applyTransform()
    }
  }

  // Attach as non-passive so preventDefault() actually blocks browser back/forward gesture
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const handler = (e: WheelEvent) => handleWheelRef.current?.(e)
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])


  const handleBgPointerDown = useCallback((e: React.PointerEvent) => {
    const onBg = e.target === e.currentTarget || (e.target as Element).tagName === 'svg'
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // Second finger — switch to pinch regardless of target
    if (activePointers.current.size >= 2) {
      e.preventDefault()
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      selStart.current = null
      isDragging.current = false
      setSelBox(null)
      mousePanRef.current = null
      lastPinchDist.current = null
      lastPinchMid.current = null
      return
    }
    isDragging.current = false
    // Touch: only capture + pan on background taps (not node taps)
    if (e.pointerType !== 'mouse') {
      if (onBg) {
        e.preventDefault()
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
        touchPanRef.current = { x: e.clientX, y: e.clientY }
      }
      // Node taps: don't preventDefault, don't capture — let node handle it
      return
    }
    // Mouse on background: capture for pan/select
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    // Space+drag or middle-button = Figma-style hand-tool pan
    if (spaceHeld.current || e.button === 1) {
      mousePanRef.current = { x: e.clientX, y: e.clientY }
      return
    }
    // Mouse: only start rubber-band selection on background clicks
    if (!onBg) return
    const { x, y } = screenToCanvas(e.clientX, e.clientY)
    selStart.current = { cx: x, cy: y }
    setSelBox({ x, y, w: 0, h: 0 })
  }, [])

  const handleBgPointerMove = useCallback((e: React.PointerEvent) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // Mouse hand-tool pan (space+drag or middle-button)
    if (mousePanRef.current) {
      const dx = e.clientX - mousePanRef.current.x
      const dy = e.clientY - mousePanRef.current.y
      panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy }
      applyTransform()
      mousePanRef.current = { x: e.clientX, y: e.clientY }
      return
    }
    // Single-finger touch pan
    if (activePointers.current.size === 1 && e.pointerType !== 'mouse' && touchPanRef.current) {
      const dx = e.clientX - touchPanRef.current.x
      const dy = e.clientY - touchPanRef.current.y
      panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy }
      applyTransform()
      touchPanRef.current = { x: e.clientX, y: e.clientY }
      return
    }
    // Pinch-to-zoom with two fingers — zoom toward midpoint + two-finger pan
    if (activePointers.current.size === 2) {
      const [p1, p2] = Array.from(activePointers.current.values())
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const mx = (p1.x + p2.x) / 2
      const my = (p1.y + p2.y) / 2
      if (lastPinchDist.current !== null && lastPinchMid.current !== null) {
        const factor = lastPinchDist.current > 0 ? dist / lastPinchDist.current : 1
        const oldZoom = zoomCurrentRef.current
        if (!isFinite(oldZoom) || oldZoom <= 0) { zoomCurrentRef.current = 1; return }
        const newZoom = Math.max(0.02, Math.min(10, oldZoom * factor))
        if (!isFinite(newZoom)) return
        const lm = lastPinchMid.current
        const newPan = {
          x: mx - ((lm.x - panRef.current.x) / oldZoom) * newZoom,
          y: my - ((lm.y - panRef.current.y) / oldZoom) * newZoom,
        }
        panRef.current = newPan
        zoomCurrentRef.current = newZoom
        applyTransform(newPan, newZoom)
        setZoom(newZoom)  // badge only
        flashZoomHud()
      }
      lastPinchDist.current = dist
      lastPinchMid.current = { x: mx, y: my }
      return
    }
    if (!selStart.current || !activeMindmap) return
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
      const hits = activeMindmap.nodes.filter(n =>
        n.x < box.x + box.w && n.x + n.width > box.x &&
        n.y < box.y + box.h && n.y + n.height > box.y
      )
      setSelectedNodeIds(hits.map(n => n.id))
      onNodeSelect(hits.length === 1 ? hits[0].id : null)
    }
  }, [activeMindmap, setSelectedNodeIds, onNodeSelect])

  const handleBgPointerUp = useCallback((e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId)
    if (activePointers.current.size < 2) {
      lastPinchDist.current = null
      lastPinchMid.current = null
      // Reset touch pan anchor so the remaining finger doesn't cause a jump
      if (activePointers.current.size === 1) {
        const remaining = Array.from(activePointers.current.values())[0]
        touchPanRef.current = { x: remaining.x, y: remaining.y }
      }
    }
    if (activePointers.current.size === 0) touchPanRef.current = null
    // If we were mouse-panning, just clean up — don't clear selection
    if (mousePanRef.current) {
      mousePanRef.current = null
      return
    }
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
    if (!activeMindmap) return
    const node = activeMindmap.nodes.find(n => n.id === id)
    if (!node) return
    // Find siblings (same parent), sorted by Y
    const siblings = activeMindmap.nodes
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
  }, [activeMindmap])

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
        const root = useMindmapStore.getState().activeMindmap?.nodes.find(n => n.depth === 0)
        if (root) {
          useMindmapStore.getState().updateNode(root.id, {
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
    soundClick()
    if (multi) {
      const next = selectedNodeIds.includes(id) ? selectedNodeIds.filter(n => n !== id) : [...selectedNodeIds, id]
      setSelectedNodeIds(next)
      onNodeSelect(next.length === 1 ? next[0] : null)
    } else {
      setSelectedNodeIds([id])
      onNodeSelect(id)
    }
  }, [selectedNodeIds, setSelectedNodeIds, onNodeSelect])

  if (!activeMindmap) {
    return <div style={{ position: 'absolute', inset: 0, background: canvasBg }} />
  }

  return (
    <div className="diagram-canvas-root" style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: canvasBg, cursor: 'default' }}>
      <svg ref={svgRef} width="100%" height="100%"
        onPointerDown={handleBgPointerDown}
        onPointerMove={handleBgPointerMove}
        onPointerUp={handleBgPointerUp}
        onPointerCancel={handleBgPointerUp}
        style={{ userSelect: 'none', touchAction: 'none' }}
      >
        <g ref={gRef}>
          <EdgeLayer nodes={hideDetails ? activeMindmap.nodes.filter(n => n.depth <= 2) : activeMindmap.nodes} lineStyle={lineStyle} diagramType={diagramType} />
          {(hideDetails ? activeMindmap.nodes.filter(n => n.depth <= 2) : activeMindmap.nodes).map(node => (
            <Node
              key={node.id}
              node={node}
              isSelected={selectedNodeIds.includes(node.id)}
              onSelect={handleSelect}
              onDragEnd={handleDragEnd}
              onDragMove={handleDragMove}
              onRootDragOffset={handleRootDragOffset}
              onDoubleClick={n => { setSelectedNodeIds([n.id]); onNodeSelect(n.id) }}
              onAddChild={id => { soundCreate(); addNode(id) }}
              svgRef={svgRef}
              readOnly={readOnly}
              l1Colors={node.depth === 0 ? activeMindmap.nodes.filter(n => n.depth === 1).map(n => n.color) : undefined}
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

      {/* Zoom badge — always visible in bottom-left, highlights when actively zooming */}
      <div style={{
        position: 'fixed', bottom: 18, left: 18,
        background: showZoomHud ? 'rgba(15,20,40,0.88)' : 'rgba(15,20,40,0.45)',
        backdropFilter: 'blur(8px)',
        color: showZoomHud ? '#fff' : 'rgba(255,255,255,0.55)',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12, fontWeight: 600, letterSpacing: '0.05em',
        padding: '4px 10px', borderRadius: 8,
        pointerEvents: 'none', zIndex: 9999,
        transition: 'background 0.2s, color 0.2s',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}>
        {Math.round(zoom * 100)}%
      </div>

      {/* Root drag HUD */}
      {rootDragOffset && (() => {
        const root = activeMindmap?.nodes.find(n => n.depth === 0)
        const l1 = activeMindmap?.nodes.find(n => n.depth === 1)
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

    </div>
  )
}
