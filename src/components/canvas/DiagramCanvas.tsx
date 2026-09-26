import type { DiagramType } from '../../types'
import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useMindmapStore } from '../../store/mindmapStore'
import { getTheme } from '../../lib/themes'
import { EdgeLayer } from './EdgeLayer'
import { Node } from './Node'
import { useKeyboard } from '../../hooks/useKeyboard'
import { computeBranchColors } from '../../lib/branchColor'
import {
  isDarkBg, neonFilterSpecs,
  NEON_CORE_OPACITY, NEON_HALO_OPACITY, NEON_TEXT_BLUR, NEON_TEXT_FILTER,
} from '../../lib/color'
import { computeSubtreeCounts } from '../../lib/nodeCounts'
import { combSizeOf, combStyleOf, drawnCellRadius, hexDoorEdge, meshGroupOutlines, meshCellRadius } from '../../lib/hex'
import { darken } from '../../lib/color'
import { radialNodeExtent } from '../../lib/layout/mindmap'
import { GLOSS_LINEAR_ID, GLOSS_RADIAL_ID, GLOSS_RADIAL_CX, GLOSS_RADIAL_CY, GLOSS_RADIAL_R, GLOSS_STOPS } from '../../lib/gloss'

interface DiagramCanvasProps {
  onNodeSelect: (nodeId: string | null) => void
  readOnly?: boolean
  noInteract?: boolean
  rightInset?: number   // width of an overlay panel on the right, so a fit centres in what is actually visible
  onDelete?: () => void
}

export function DiagramCanvas({ onNodeSelect, readOnly, noInteract, rightInset = 0 }: DiagramCanvasProps) {
  // Shallow-selected slice so the canvas only re-renders when one of these actually changes,
  // not on unrelated store writes (resizePreview, HUD flags, showChildCount, etc.).
  const { activeMindmap, selectedNodeIds, setSelectedNodeIds, diagramType, lineStyle, themeId, addNode, reorderNode, isImporting, hideDetails } = useMindmapStore(
    useShallow(s => ({
      activeMindmap: s.activeMindmap, selectedNodeIds: s.selectedNodeIds, setSelectedNodeIds: s.setSelectedNodeIds,
      diagramType: s.diagramType, lineStyle: s.lineStyle, themeId: s.themeId, addNode: s.addNode,
      reorderNode: s.reorderNode, isImporting: s.isImporting, hideDetails: s.hideDetails,
    })),
  )
  // A locked map (embedded outside the app - README, Confluence, the demo wall) is
  // read-only the same way a touch device is: reuse the existing readOnly wiring.
  const effectiveReadOnly = readOnly || (activeMindmap?.locked ?? false)
  const counts = useMemo(() => computeSubtreeCounts(activeMindmap?.nodes ?? []), [activeMindmap?.nodes])
  // Honeycomb cells: 1 shared radius in a mesh, a text-fit radius each in a web; resolved
  // once per node set instead of inside every Node (a mesh radius scans the whole map).
  const cellRadii = useMemo(() => {
    const ns = activeMindmap?.nodes ?? []
    if (diagramType !== 'honeycomb' || !ns.length) return null
    const style = combStyleOf(ns), size = combSizeOf(ns)
    return new Map(ns.map(n => [n.id, drawnCellRadius(n, ns, style, size)]))
  }, [activeMindmap?.nodes, diagramType])
  // "Outward" in a radial mind map is measured from the root, so every Node needs the
  // root's centre. Resolved once here rather than by an O(n) find inside each node.
  const rootCenter = useMemo(() => {
    const r = activeMindmap?.nodes.find(n => n.parentId === null)
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
  }, [activeMindmap?.nodes])

  const paletteColors = useMemo(() => computeBranchColors(activeMindmap?.nodes ?? []), [activeMindmap?.nodes])
  // Mesh doorways: the wall a cell shares with its parent, painted in the branch colour.
  // Drawn as 1 layer above every cell, so no parent's own wall can paint over a door.
  const meshDoors = useMemo(() => {
    const ns = activeMindmap?.nodes ?? []
    if (diagramType !== 'honeycomb' || combStyleOf(ns) !== 'mesh' || !cellRadii) return null
    const byId = new Map(ns.map(n => [n.id, n]))
    return ns.flatMap(n => {
      const p = n.parentId ? byId.get(n.parentId) : undefined
      const r = cellRadii.get(n.id)
      if (!p || !r) return []
      const door = hexDoorEdge(n.x + n.width / 2, n.y + n.height / 2, r, p.x + p.width / 2, p.y + p.height / 2)
      // A shade darker than the branch, so the door reads against the solid parent and the pale child alike.
      const base = paletteColors.get(n.id) ?? n.color
      return door ? [{ id: n.id, door, color: base.startsWith('#') ? darken(base, 0.35) : base }] : []
    })
  }, [activeMindmap?.nodes, diagramType, cellRadii, paletteColors])
  // Mesh group outlines: a parent and its direct children, bounded by 1 line, so the eye
  // can tell where 1 comb group stops and the next begins. Topics thick, families thin.
  const meshGroups = useMemo(() => {
    const ns = activeMindmap?.nodes ?? []
    if (diagramType !== 'honeycomb' || combStyleOf(ns) !== 'mesh' || !ns.length) return null
    const R = meshCellRadius(ns, combSizeOf(ns))
    return meshGroupOutlines(ns, R).map(g => {
      const base = paletteColors.get(g.parentId) ?? ns.find(n => n.id === g.parentId)?.color ?? '#1a1d2e'
      return { ...g, color: g.depth === 0 ? '#1a1d2e' : base.startsWith('#') ? darken(base, 0.45) : base }
    })
  }, [activeMindmap?.nodes, diagramType, paletteColors])
  const canvasBg = getTheme(themeId).canvasBg
  // The radial mind map's neon glow on a dark canvas: one filter per distinct circle
  // size, defined once here and shared by every orb, so a 200-node map carries a
  // handful of filters instead of two per node. Empty on light themes.
  const neonFilters = useMemo(
    () => (diagramType === 'mindmap' && isDarkBg(canvasBg)
      ? neonFilterSpecs((activeMindmap?.nodes ?? []).map(n => Math.max(n.width, n.height)))
      : []),
    [diagramType, canvasBg, activeMindmap?.nodes])
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

  // Fit the whole map into the viewport (zoom capped at 100%). Used by the shared
  // view-only page on load and by Cmd+0 anywhere, so a visitor sees the entire map first.
  const fitToContent = useCallback(() => {
    const svg = svgRef.current
    if (!svg || !activeMindmap?.nodes.length) return
    const { width: svgW, height: svgH } = svg.getBoundingClientRect()
    if (svgW === 0 || svgH === 0) return
    const nodes = activeMindmap.nodes
    // A radial mind map hangs its names outside the circles, so the fit has to cover
    // the label boxes too or the outermost titles are cropped off the viewport.
    const root = nodes.find(n => n.parentId === null)
    const ext = diagramType === 'mindmap' && root
      ? nodes.map(n => radialNodeExtent(n, root.x + root.width / 2, root.y + root.height / 2))
      : nodes.map(n => ({ left: n.x, top: n.y, right: n.x + n.width, bottom: n.y + n.height }))
    const minX = Math.min(...ext.map(e => e.left))
    const minY = Math.min(...ext.map(e => e.top))
    const maxX = Math.max(...ext.map(e => e.right))
    const maxY = Math.max(...ext.map(e => e.bottom))
    const pad = 80
    const visW = Math.max(200, svgW - rightInset)
    const newZoom = Math.max(0.05, Math.min((visW - pad * 2) / Math.max(1, maxX - minX), (svgH - pad * 2) / Math.max(1, maxY - minY), 1))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    zoomCurrentRef.current = newZoom
    setZoom(newZoom)  // badge only
    const p = { x: visW / 2 - cx * newZoom, y: svgH / 2 - cy * newZoom }
    panRef.current = p
    setPan(p)         // keep pan state in sync for selBox coords
    applyTransform(p, newZoom)
  }, [activeMindmap, diagramType, applyTransform, rightInset])

  // Editor load: 100% so the text is readable, anchored on the root instead of shrinking
  // the whole map. Mind maps grow in every direction, so the root sits at the centre;
  // logic charts, fishbones and timelines read left to right, so the root sits near the
  // left edge and the branches get the width.
  const anchorRoot = useCallback(() => {
    const svg = svgRef.current
    if (!svg || !activeMindmap?.nodes.length) return
    const { width: svgW, height: svgH } = svg.getBoundingClientRect()
    if (svgW === 0 || svgH === 0) return
    const nodes = activeMindmap.nodes
    const root = nodes.find(n => n.parentId === null) ?? nodes[0]
    const newZoom = 1
    const cx = root.x + root.width / 2
    const cy = root.y + root.height / 2
    const anchorX = (diagramType === 'mindmap' || diagramType === 'honeycomb') ? svgW / 2 : Math.min(svgW / 2, Math.max(root.width / 2 + 40, svgW * 0.18))
    zoomCurrentRef.current = newZoom
    setZoom(newZoom)  // badge only
    const p = { x: anchorX - cx * newZoom, y: svgH / 2 - cy * newZoom }
    panRef.current = p
    setPan(p)         // keep pan state in sync for selBox coords
    applyTransform(p, newZoom)
  }, [activeMindmap, diagramType, applyTransform])

  // The shared view-only page fits the whole map; the editor opens at 100% on the root.
  const fitView = effectiveReadOnly ? fitToContent : anchorRoot

  // Cmd+0 / Ctrl+0 fits the whole map, in the editor and on the shared page alike.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '0') { e.preventDefault(); fitToContent() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fitToContent])

  // Opening a map anchors the root at 100%; switching its type fits the whole new
  // layout into view, since a re-laid-out map is otherwise mostly off screen.
  const prevFit = useRef<{ id: string | undefined; type: DiagramType }>({ id: undefined, type: diagramType })
  useEffect(() => {
    if (!activeMindmap) return
    const typeSwitched = prevFit.current.id === activeMindmap.id && prevFit.current.type !== diagramType
    prevFit.current = { id: activeMindmap.id, type: diagramType }
    const raf = requestAnimationFrame(typeSwitched ? fitToContent : fitView)
    return () => cancelAnimationFrame(raf)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMindmap?.id, diagramType])

  // Rubber-band selection state
  const [selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const selStart = useRef<{ cx: number; cy: number } | null>(null)
  const isDragging = useRef(false)

  // Middle-button hand-tool panning (Space+drag was removed: it fought with typing)
  const mousePanRef = useRef<{ x: number; y: number } | null>(null)

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
    // Look-only mode (touch devices): no marquee/selection-box, no node hit-testing —
    // pinch zoom and 1/2-finger pan above are unaffected since they return before this point.
    if (noInteract) return
    // Mouse on background: capture for pan/select
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    // Middle-button = hand-tool pan
    if (e.button === 1) {
      mousePanRef.current = { x: e.clientX, y: e.clientY }
      return
    }
    // Mouse: only start rubber-band selection on background clicks
    if (!onBg) return
    const { x, y } = screenToCanvas(e.clientX, e.clientY)
    selStart.current = { cx: x, cy: y }
    setSelBox({ x, y, w: 0, h: 0 })
  }, [noInteract])

  const handleBgPointerMove = useCallback((e: React.PointerEvent) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // Mouse hand-tool pan (middle-button)
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
        <defs>
          {/* Box gloss - defined once per render (root/L1/L2 boxes reference it, see Node.tsx) */}
          <linearGradient id={GLOSS_LINEAR_ID} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            {GLOSS_STOPS.map((s, i) => <stop key={i} offset={s.offset} stopColor="#ffffff" stopOpacity={s.opacity} />)}
          </linearGradient>
          <radialGradient id={GLOSS_RADIAL_ID} cx={GLOSS_RADIAL_CX} cy={GLOSS_RADIAL_CY} r={GLOSS_RADIAL_R} gradientUnits="objectBoundingBox">
            {GLOSS_STOPS.map((s, i) => <stop key={i} offset={s.offset} stopColor="#ffffff" stopOpacity={s.opacity} />)}
          </radialGradient>
          {/* Neon halo filters - one per distinct circle diameter, dark themes only */}
          {neonFilters.length > 0 && (
            <>
              {neonFilters.map(f => (
                <filter key={f.id} id={f.id} x="-75%" y="-75%" width="250%" height="250%"
                  colorInterpolationFilters="sRGB">
                  <feGaussianBlur in="SourceGraphic" stdDeviation={f.halo} result="wide" />
                  <feComponentTransfer in="wide" result="halo">
                    <feFuncA type="linear" slope={NEON_HALO_OPACITY} />
                  </feComponentTransfer>
                  <feGaussianBlur in="SourceGraphic" stdDeviation={f.core} result="tight" />
                  <feComponentTransfer in="tight" result="core">
                    <feFuncA type="linear" slope={NEON_CORE_OPACITY} />
                  </feComponentTransfer>
                  <feMerge>
                    <feMergeNode in="halo" />
                    <feMergeNode in="core" />
                  </feMerge>
                </filter>
              ))}
              <filter id={NEON_TEXT_FILTER} x="-60%" y="-60%" width="220%" height="220%"
                colorInterpolationFilters="sRGB">
                <feGaussianBlur stdDeviation={NEON_TEXT_BLUR} />
              </filter>
            </>
          )}
        </defs>
        <g ref={gRef}>
          <EdgeLayer nodes={hideDetails ? activeMindmap.nodes.filter(n => n.depth <= 2) : activeMindmap.nodes} lineStyle={lineStyle} diagramType={diagramType} paletteColors={paletteColors} />
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
              svgRef={svgRef}
              readOnly={effectiveReadOnly}
              noInteract={noInteract}
              l1Colors={node.depth === 0 ? activeMindmap.nodes.filter(n => n.depth === 1).map(n => n.color) : undefined}
              paletteColor={paletteColors.get(node.id) ?? null}
              rootCenter={rootCenter}
              childCount={counts.childCounts.get(node.id) ?? 0}
              descendantCount={counts.descendantCounts.get(node.id) ?? 0}
              cellRadius={cellRadii?.get(node.id)}
              nodeCount={activeMindmap.nodes.length}
            />
          ))}
          {meshDoors && meshDoors.length > 0 && (
            <g style={{ pointerEvents: 'none' }}>
              {meshDoors.map(d => <polyline key={`door-${d.id}`} points={d.door} fill="none" stroke={d.color} strokeWidth={5} strokeLinecap="butt" />)}
            </g>
          )}
          {meshGroups && meshGroups.length > 0 && (
            <g style={{ pointerEvents: 'none' }}>
              {/* Deeper groups first, topics last, so the thick topic line stays on top */}
              {[...meshGroups].sort((a, b) => b.depth - a.depth).map(g => (
                <path key={`group-${g.parentId}`} d={g.d} fill="none" stroke={g.color}
                  strokeWidth={g.depth <= 1 ? 7 : 3.5} strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </g>
          )}
          {/* Rubber-band selection box */}
          {selBox && selBox.w > 4 && (
            <rect
              x={selBox.x} y={selBox.y}
              width={selBox.w} height={selBox.h}
              fill="rgba(59,130,246,0.06)"
              stroke="rgba(59,130,246,0.55)"
              strokeWidth={1 / zoom}
              rx={2 / zoom}
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
