import { useRef, useState, useCallback } from 'react'
import type { MindmapNode } from '../../types'
import { useMindmapStore } from '../../store/mindmapStore'
import { NodeIcon, getLucideIcon } from './NodeIcon'
import { wrapText, initialFontSize, nodeInitial, radialLabelFor, LABEL_FONT, RADIAL_ROOT_FONT } from '../../lib/layout/mindmap'
import { rootPillWidth, rootPillFontSize, rootTitleNeedsPill, rootCircleDiameter, rootDrawnWidth, ROOT_FONT } from '../../lib/rootPill'
import { hexToRgb, darken, depthFill } from '../../lib/color'
import { shapeRx } from '../../lib/nodeShape'
import { nodeMetrics, ICON_GAP } from '../../lib/nodeMetrics'
import { parseLinkedTitle, sliceSegments, lineRanges, type LinkSegment } from '../../lib/links'
import { GLOSS_LINEAR_ID, GLOSS_RADIAL_ID, glossApplies, glossOpacity } from '../../lib/gloss'

interface NodeProps {
  node: MindmapNode
  isSelected: boolean
  onSelect: (id: string, multi: boolean) => void
  onDragEnd: (id: string, dx: number, dy: number) => void
  onDoubleClick: (node: MindmapNode) => void
  onDragMove?: (id: string, cx: number, cy: number) => void
  onRootDragOffset?: (offset: { dx: number; dy: number; clientX: number; clientY: number } | null) => void
  svgRef: React.RefObject<SVGSVGElement>
  readOnly?: boolean
  noInteract?: boolean
  l1Colors?: string[]
  paletteColor?: string | null  // 12-colour-wheel colour, precomputed once by DiagramCanvas (was an O(n) l1PaletteColor walk per node per render)
  childCount?: number       // direct children, precomputed once by DiagramCanvas (was an O(n) per-node selector)
  descendantCount?: number  // total subtree size, precomputed once (was an O(n^2) per-node selector)
  nodeCount?: number        // total nodes in the map, used to gate decorative animations on large maps
  rootCenter?: { x: number; y: number } | null  // the radial mind map measures "outward" from here; precomputed once by DiagramCanvas
}

// Decorative SMIL animations (fireflies, SiriWave) burn CPU/GPU at idle, so skip them
// on large maps and for reduced-motion users.
const DECOR_MAX_NODES = 60
const prefersReducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false

// Boost saturation so the palette reads brighter / more vivid (keeps hue + ~lightness).
function vivify(hex: string, sat = 1.35, light = 1.04): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return hex
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  let h = 0, s = 0
  const d = max - min
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  s = Math.min(1, s * sat)
  const l2 = Math.min(0.94, l * light)
  const q = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s
  const p = 2 * l2 - q
  const hue = (t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return s === 0 ? hex : `#${toHex(hue(h + 1/3))}${toHex(hue(h))}${toHex(hue(h - 1/3))}`
}

/** Open a node's hyperlink in a new tab, adding https:// if no protocol given */
function openNodeUrl(url: string) {
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
  window.open(href, '_blank', 'noopener,noreferrer')
}

/**
 * Draw parsed title runs as <tspan>s, linked runs wrapped in an SVG <a>. A plain click
 * on a link behaves like clicking the node (select, drag, double-click to edit), so a
 * node whose whole title is a link stays editable. Cmd/Ctrl-click (or middle-click)
 * opens the link. A link label split across 2 wrapped lines draws as one anchor per line.
 */
function renderRuns(segments: LinkSegment[], keyPrefix: string) {
  return segments.map((seg, i) => seg.url ? (
    <a
      key={`${keyPrefix}-${i}`}
      href={seg.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
      onClick={e => {
        if (e.metaKey || e.ctrlKey || e.button === 1) { e.stopPropagation(); return }
        e.preventDefault()  // plain click: let the node handle it, do not navigate
      }}
      onAuxClick={e => { if (e.button === 1) e.stopPropagation() }}
    >
      <tspan style={{ textDecoration: 'underline' }}>{seg.text}</tspan>
    </a>
  ) : (
    <tspan key={`${keyPrefix}-${i}`}>{seg.text}</tspan>
  ))
}

/** Returns true if the color is light enough that black text is readable */
function isLight(hex: string): boolean {
  if (!hex.startsWith('#')) return true
  const [r,g,b] = hexToRgb(hex)
  // Perceived luminance (WCAG formula)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 140
}

export function Node({ node, isSelected, onSelect, onDragEnd, onDoubleClick, onDragMove, onRootDragOffset, svgRef, readOnly, noInteract = false, l1Colors = [], paletteColor = null, childCount = 0, descendantCount = 0, nodeCount = 0, rootCenter = null }: NodeProps) {
  const isRoot = node.depth === 0
  const isL2Plus = node.depth >= 2
  // Brighter/more-vivid version of the node colour, used for all coloured fills.
  // L1 and descendants take their colour from the 12-colour wheel by L1 order;
  // fall back to the node's own (vivified) colour if there's no L1 ancestor.
  const paletteBase = isRoot ? null : paletteColor
  const col = paletteBase ?? (node.color.startsWith('#') ? vivify(node.color) : node.color)
  const showDecor = nodeCount <= DECOR_MAX_NODES && !prefersReducedMotion
  const rx = isRoot ? 4 : 3
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const resizePreview = useMindmapStore(s => s.resizePreview)
  const diagramType = useMindmapStore(s => s.diagramType)
  const showChildCount = useMindmapStore(s => s.showChildCount)
  const canDrag = (isRoot && diagramType !== 'mindmap') || diagramType === 'logic-chart'
  // Root shape: in mindmap mode always circle; otherwise user-set or auto from title length
  const isRootPill = isRoot && diagramType !== 'mindmap' && (
    node.shape === 'pill' ? true :
    node.shape === 'circle' ? false :
    rootTitleNeedsPill(node.title, node.fontSize ?? ROOT_FONT)
  )
  const isFishbone = diagramType === 'fishbone'
  // The Mind Map type draws a radial constellation (src/lib/layout/mindmap): every
  // node is a circle sized by the weight of its own subtree, with the label drawn
  // OUTSIDE the circle - under it at depth 1, beside it at depth 2, and only on
  // selection for the dots at depth 3 and deeper. An explicit per-node shape opts a
  // node out of the scheme and keeps its own box, as it does in every other type.
  const isRadial = diagramType === 'mindmap' && !isRoot && !node.shape
  const isRadialDot = isRadial && node.depth >= 3
  // An explicit per-node shape overrides the diagram's own default geometry
  // (fishbone parallelogram, mindmap L2 box). Absence keeps today's look.
  const nodeShape = isRoot ? undefined : node.shape
  const drawCircle = nodeShape === 'circle'
  const isFishboneNode = isFishbone && node.depth >= 1
  // Fishbone: detect if node is above or below the spine (Y=400) for parallelogram direction
  const fishboneAbove = isFishboneNode ? (node.y + node.height / 2) < 400 : false
  const effectiveRx = isRoot ? rx
    : nodeShape ? shapeRx(nodeShape, node.height, rx)
    : isFishboneNode ? 0 : rx
  const previewW = (!isRoot && resizePreview?.depth === node.depth) ? resizePreview.width : null

  // Styling per depth
  let bg: string, textColor: string, strokeColor: string, strokeW: number

  if (isRoot) {
    bg = '#1a1d2e'
    textColor = '#ffffff'
    strokeColor = '#1a1d2e'
    strokeW = 5
  } else if (isL2Plus) {
    // One shared depth ladder (src/lib/color depthFill) so the canvas and the
    // server renderer that draws the home-grid card previews never drift.
    bg = col.startsWith('#') ? depthFill(col, node.depth) : '#f8fafc'
    textColor = isLight(bg) ? '#1a1d2e' : '#ffffff'
    strokeColor = col
    strokeW = 2
  } else {
    // L1 all other diagrams: solid color fill, darker border so white badge is framed
    bg = col
    textColor = isLight(col) ? '#1a1d2e' : '#ffffff'
    strokeColor = col.startsWith('#') ? darken(col, 0.25) : col
    strokeW = 2
  }


  // Root, L1 and L2 boxes carry a soft top-of-box gloss; L3+ are already pale, so
  // it would be lost. Dark-background boxes get the stronger gradient stops (via
  // glossOpacity), light-background ones the softer scaled-down version.
  const showGloss = glossApplies(node.depth)
  const glossFillOpacity = glossOpacity(isLight(bg))

  // A dot is 5-8px across, so the 2px L2+ ring would swallow it whole.
  if (isRadialDot) strokeW = 1

  // Node-level overrides from panel
  if (node.borderColor) { strokeColor = node.borderColor; strokeW = Math.max(strokeW, node.borderWidth ?? 1.5) }

  // Depth-based font size + padding from the one shared box table (src/lib/nodeMetrics),
  // so the canvas, the server renderer and every layout agree on what a node holds.
  const metric = nodeMetrics(node.depth)
  // The mind map root is a centre circle, not a pill, so it takes its own size.
  const baseFontSize = node.fontSize
    ?? (isRoot && diagramType === 'mindmap' ? RADIAL_ROOT_FONT : metric.fontSize)
  const padX = metric.padX
  // Root pill grows to fit the title up to a max width; past that the font shrinks
  // so long titles never overflow. Shared with the layout (src/lib/rootPill) so
  // the trunk meets the pill's edge instead of starting inside it.
  const fontSize = isRootPill ? rootPillFontSize(node.title, baseFontSize) : baseFontSize
  const fontWeight = node.bold ? '700' : (isRoot ? '500' : node.depth === 1 ? '500' : '400')

  // Depth-based bg opacity only (text stays fully opaque)
  const bgOpacity = 1
  // L1 nodes get a diagonal gradient fill (lighter top-left -> base -> darker bottom-right).
  const nodeFill = bg
  const fontStyle = node.italic ? 'italic' : 'normal'
  // Text alignment — default left for non-root nodes
  const align = isRoot ? 'center' : node.depth === 1 ? (node.textAlign ?? 'left') : 'left'
  const textAnchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle'

  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<{ x: number; y: number; nodeX: number; nodeY: number; allSnap?: { id: string; x: number; y: number }[] } | null>(null)
  const didDrag = useRef(false)

  function getSVGPoint(e: React.PointerEvent) {
    const svg = svgRef.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    return pt.matrixTransform(svg.getScreenCTM()!.inverse())
  }

  function startEdit() {
    setDraft(node.title)
    setEditing(true)
    setTimeout(() => { inputRef.current?.select() }, 0)
  }

  function commitEdit() {
    setEditing(false)
    const val = draft.trim()
    if (!val || val === node.title) return
    const updates: Partial<MindmapNode> = { title: val }
    if (isRoot) {
      if (node.shape !== 'circle' && (node.shape === 'pill' || rootTitleNeedsPill(val, baseFontSize))) {
        // pill: auto width, fixed height
        updates.width = rootPillWidth(val, baseFontSize)
        updates.height = nodeMetrics(0).height
      } else {
        // circle: equal width and height, grown to fit the title
        const diameter = rootCircleDiameter(val, baseFontSize)
        updates.width = diameter
        updates.height = diameter
      }
    }
    useMindmapStore.getState().updateNode(node.id, updates)
    if (isRoot) setTimeout(() => useMindmapStore.getState().rerunLayout(), 0)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (editing || readOnly) return
    // Touch: don't stop propagation — let canvas handle pan/pinch
    if (e.pointerType === 'mouse') e.stopPropagation()
    didDrag.current = false
    onSelect(node.id, e.metaKey || e.ctrlKey || e.shiftKey)
    if (!canDrag) return
    if (e.pointerType !== 'mouse') return // touch = pinch/pan, not drag
    const pt = getSVGPoint(e)
    if (!pt) return
    dragStart.current = { x: pt.x, y: pt.y, nodeX: node.x, nodeY: node.y }
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (isRoot) onRootDragOffset?.({ dx: 0, dy: 0, clientX: e.clientX, clientY: e.clientY })
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return
    e.stopPropagation()
    const pt = getSVGPoint(e)
    if (!pt) return
    const dx = pt.x - dragStart.current.x
    const dy = pt.y - dragStart.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true
    let newX = dragStart.current.nodeX + dx
    if (isRoot) {
      const l1 = useMindmapStore.getState().activeMindmap?.nodes.find(n => n.depth === 1)
      if (l1) {
        const barX = l1.x - 60
        const minX = barX - 500 - node.width  // trunk = 500px
        const maxX = barX - node.width          // trunk = 0px
        newX = Math.max(minX, Math.min(maxX, newX))
      }
    }
    const newY = isRoot ? node.y : dragStart.current.nodeY + dy
    useMindmapStore.getState().updateNode(node.id, { x: newX, y: newY, manuallyPositioned: true })
    if (isRoot) onRootDragOffset?.({ dx: Math.round(dx), dy: Math.round(dy), clientX: e.clientX, clientY: e.clientY })
    onDragMove?.(node.id, newX + node.width / 2, newY + node.height / 2)
  }

  function onPointerUp(_e: React.PointerEvent) {
    if (!dragStart.current) return
    dragStart.current = null
    if (isRoot) onRootDragOffset?.(null)
    if (didDrag.current) onDragEnd(node.id, 0, 0)
  }

  function handleDoubleClick(e: React.MouseEvent) {
    if (readOnly) return
    e.stopPropagation()
    if (!didDrag.current) startEdit()
    else onDoubleClick(node)
  }

  const resolvedEmoji = isRoot ? undefined : node.emoji
  const hasEmoji = !!resolvedEmoji
  const resolvedIcon = isRoot ? undefined : (!hasEmoji ? node.icon : undefined)
  const hasIcon = !!resolvedIcon && !!getLucideIcon(resolvedIcon)
  // Root pill: always auto-size from title so it never relies on stale stored width.
  const autoPillW = isRootPill ? rootDrawnWidth(node, diagramType) : null
  // Circles draw in a square box: force width = height so it's always round
  const circleW = (isRadial || drawCircle) ? Math.max(node.width, node.height) : null
  const displayW = previewW ?? (autoPillW ?? circleW ?? node.width)
  // The title is stored raw (markdown and all); everything drawn and measured uses
  // the display text, so a box never sizes to characters nobody sees.
  const parsedTitle = parseLinkedTitle(node.title)
  const countSuffix = (showChildCount && node.depth >= 1 && childCount > 0) ? ` (${childCount})` : ''
  const label = parsedTitle.text + countSuffix
  const plainLabel = parsedTitle.text
  const labelSegments: LinkSegment[] = countSuffix
    ? [...parsedTitle.segments, { text: countSuffix }]
    : parsedTitle.segments
  const hasLinks = labelSegments.some(s => !!s.url)
  // All coordinates are relative to (node.x, node.y)
  // Circle-shaped nodes draw in a square box; the layout already sizes them square,
  // this Math.max is only a guard so a stale stored box can never clip the circle.
  const boxH = (isRadial || drawCircle) ? Math.max(displayW, node.height) : node.height
  const cx = displayW / 2
  const cy = boxH / 2
  const r = displayW / 2

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsDragging(true)
    onPointerDown(e)
  }, [onPointerDown])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false)
    onPointerUp(e)
  }, [onPointerUp])

  // Resize handle drag
  const resizeStart = useRef<{ startX: number; startW: number } | null>(null)
  function onResizePointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    const pt = getSVGPoint(e)
    if (!pt) return
    resizeStart.current = { startX: pt.x, startW: node.width }
    useMindmapStore.getState().setResizePreview({ depth: node.depth, width: node.width })
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }
  function onResizePointerMove(e: React.PointerEvent) {
    if (!resizeStart.current) return
    e.stopPropagation()
    const pt = getSVGPoint(e)
    if (!pt) return
    const newW = Math.max(100, Math.min(500, resizeStart.current.startW + (pt.x - resizeStart.current.startX)))
    useMindmapStore.getState().setResizePreview({ depth: node.depth, width: newW })
  }
  function onResizePointerUp(e: React.PointerEvent) {
    e.stopPropagation()
    const preview = useMindmapStore.getState().resizePreview
    if (resizeStart.current && preview) {
      useMindmapStore.getState().resizeNodeDepth(node.depth, preview.width)
    }
    resizeStart.current = null
    useMindmapStore.getState().setResizePreview(null)
  }

  const clipId = `clip-${node.id}`
  // Soft coloured glow under a mind map circle - the reference look's "alive" cue.
  // Only the root and the two labelled rings carry it; the dots are too small to
  // show a blur and one filter per dot would be pure cost.
  const glowId = `glow-${node.id}`
  const showGlow = diagramType === 'mindmap' && (isRoot || (isRadial && node.depth <= 2))
  // A parallelogram has no rx, so its gloss overlay needs a real clip to the polygon
  // rather than a matching corner radius.
  const glossFbClipId = `gloss-fb-${node.id}`
  const showFishboneGloss = isFishboneNode && !nodeShape && showGloss
  const hasBadge = (hasEmoji || hasIcon) && !isRoot && !isRadial && !drawCircle
  const editX = isRoot ? cx - r * 0.75 : hasBadge ? node.height : (align === 'left' ? 8 : 2)
  const editW = isRoot ? r * 1.5 : hasBadge ? displayW - node.height - 4 : displayW - editX - 2
  // The editor shows the raw title (markdown links included), which can be far longer
  // than the drawn label, so let the field grow past the box instead of clipping it.
  const rawEditW = Math.min(1100, Math.ceil(draft.length * fontSize * 0.6) + 24)
  const editWFit = editing ? Math.max(editW, rawEditW) : editW

  return (
    <g data-node-id={node.id} style={{
      transform: `translate(${node.x}px, ${node.y}px)`,
      transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
      pointerEvents: noInteract ? 'none' : undefined,
    }}>
    {(!isRoot && !isRadial) || showGlow || showFishboneGloss ? (
      <defs>
        {!isRoot && !isRadial && (
          <clipPath id={clipId}>
            <rect x={0} y={0} width={displayW} height={boxH} rx={effectiveRx} ry={effectiveRx} />
          </clipPath>
        )}
        {showGlow && (
          <filter id={glowId} x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation={Math.max(3, displayW * 0.11)} />
          </filter>
        )}
        {showFishboneGloss && (() => {
          const sk = node.height * 0.35
          const w = displayW, h = node.height
          const pts = fishboneAbove
            ? `${sk},0 ${w},0 ${w - sk},${h} 0,${h}`
            : `0,0 ${w - sk},0 ${w},${h} ${sk},${h}`
          return <clipPath id={glossFbClipId}><polygon points={pts} /></clipPath>
        })()}
      </defs>
    ) : null}
    <g
      onPointerDown={handlePointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onClick={noInteract ? undefined : readOnly && node.url ? () => openNodeUrl(node.url!) : undefined}
      style={{ cursor: editing ? 'default' : canDrag ? 'grab' : 'pointer', userSelect: 'none' }}
    >
      {/* Fireflies around nodes with children — count = all descendants */}
      {showDecor && diagramType !== 'mindmap' && node.depth >= 1 && descendantCount > 0 && (
        <Fireflies cx={displayW / 2} cy={node.height / 2} r={Math.max(displayW, node.height) * 0.45} color={col} count={descendantCount} />
      )}

      {isRoot ? (
        <>
          {/* Soft coloured glow under the mind map root */}
          {showGlow && (
            <circle cx={cx} cy={cy} r={r * 1.08} fill={col.startsWith('#') ? col : bg}
              opacity={0.22} filter={`url(#${glowId})`} style={{ pointerEvents: 'none' }} />
          )}

          {/* Siri glow + spinning rings — circle root only, never on the mind map */}
          {!isRootPill && diagramType !== 'mindmap' && (() => { const ar = r; return (
          <>
          {showDecor && <SiriWave cx={cx} cy={cy} r={ar} colors={l1Colors} />}

          {/* Back ring — horizontal orbit, spinning */}
          <ellipse cx={cx} cy={cy} rx={ar * 2.0} ry={ar * 0.32}
            stroke="#6b7280" strokeWidth={2} fill="none" opacity={0.25}
            style={{ pointerEvents: 'none' }}>
            <animateTransform attributeName="transform" type="rotate"
              from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="12s" repeatCount="indefinite" />
          </ellipse>
          {/* Second ring — vertical spine (90° to first), counter-spinning */}
          <ellipse cx={cx} cy={cy} rx={ar * 0.32} ry={ar * 2.0}
            stroke="#6b7280" strokeWidth={2} fill="none" opacity={0.25}
            style={{ pointerEvents: 'none' }}>
            <animateTransform attributeName="transform" type="rotate"
              from={`0 ${cx} ${cy}`} to={`-360 ${cx} ${cy}`} dur="12s" repeatCount="indefinite" />
          </ellipse>
          <ellipse cx={cx} cy={cy} rx={ar * 2.4} ry={ar * 0.38}
            stroke="#9ca3af" strokeWidth={1.2} fill="none" opacity={0.14}
            style={{ pointerEvents: 'none' }}>
            <animateTransform attributeName="transform" type="rotate"
              from={`0 ${cx} ${cy}`} to={`-360 ${cx} ${cy}`} dur="18s" repeatCount="indefinite" />
          </ellipse>
          </>)})()}

          {/* Root shape: pill rect for long titles, circle for short */}
          {isRootPill ? (
            <rect x={0} y={0} width={displayW} height={node.height}
              rx={node.height / 2} ry={node.height / 2}
              fill={bg} fillOpacity={1} stroke={strokeColor} strokeWidth={strokeW} />
          ) : (
            <circle cx={cx} cy={cy} r={r} fill={bg} fillOpacity={1}
              stroke={strokeColor} strokeWidth={strokeW} />
          )}

          {/* Gloss — soft top-of-box highlight, root pill or root circle */}
          {showGloss && (isRootPill ? (
            <rect x={0} y={0} width={displayW} height={node.height} rx={node.height / 2} ry={node.height / 2}
              fill={`url(#${GLOSS_LINEAR_ID})`} fillOpacity={glossFillOpacity} style={{ pointerEvents: 'none' }} />
          ) : (
            <circle cx={cx} cy={cy} r={r} fill={`url(#${GLOSS_RADIAL_ID})`} fillOpacity={glossFillOpacity}
              style={{ pointerEvents: 'none' }} />
          ))}

          {/* Front ring glints — circle root only, never on the mind map */}
          {!isRootPill && diagramType !== 'mindmap' && (() => { const ar = r; return (
          <>
          <ellipse cx={cx} cy={cy} rx={ar * 2.0} ry={ar * 0.32}
            stroke="#d1d5db" strokeWidth={2} fill="none" opacity={0.55}
            strokeDasharray={`${ar * 3.14} ${ar * 9.42}`}
            strokeDashoffset={`${ar * 1.57}`}
            style={{ pointerEvents: 'none' }}>
            <animateTransform attributeName="transform" type="rotate"
              from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="12s" repeatCount="indefinite" />
          </ellipse>
          <ellipse cx={cx} cy={cy} rx={ar * 0.32} ry={ar * 2.0}
            stroke="#d1d5db" strokeWidth={2} fill="none" opacity={0.55}
            strokeDasharray={`${ar * 3.14} ${ar * 9.42}`}
            strokeDashoffset={`${ar * 1.57}`}
            style={{ pointerEvents: 'none' }}>
            <animateTransform attributeName="transform" type="rotate"
              from={`0 ${cx} ${cy}`} to={`-360 ${cx} ${cy}`} dur="12s" repeatCount="indefinite" />
          </ellipse>
          </>)})()}

          {/* Roaming fireflies in the L1 colours — twinkle around the root */}
          {showDecor && diagramType !== 'mindmap' && l1Colors.length > 0 && (
            <Fireflies cx={cx} cy={cy} r={Math.max(displayW, node.height) / 2}
              colors={l1Colors} count={Math.min(20, Math.max(10, l1Colors.length))} color={l1Colors[0]} />
          )}
        </>
      ) : isRadial ? (
        <>
        <circle cx={cx} cy={cy} r={r} fill="transparent" />
        <g style={{ pointerEvents: 'none' }}>
          {showGlow && (
            <circle cx={cx} cy={cy} r={r * 1.1} fill={col} opacity={0.3} filter={`url(#${glowId})`} />
          )}
          <circle cx={cx} cy={cy} r={r} fill={nodeFill} fillOpacity={bgOpacity} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          {showGloss && (
            <circle cx={cx} cy={cy} r={r} fill={`url(#${GLOSS_RADIAL_ID})`} fillOpacity={glossFillOpacity} />
          )}
        </g>
        </>
      ) : drawCircle ? (
        <>
        <circle cx={cx} cy={cy} r={r} fill="transparent" />
        <g style={{ pointerEvents: 'none' }}
          filter="drop-shadow(0 1px 4px rgba(0,0,0,0.1))">
          <circle cx={cx} cy={cy} r={r} fill={nodeFill} fillOpacity={bgOpacity} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          {showGloss && (
            <circle cx={cx} cy={cy} r={r} fill={`url(#${GLOSS_RADIAL_ID})`} fillOpacity={glossFillOpacity} />
          )}
        </g>
        </>
      ) : isFishboneNode && !nodeShape ? (() => {
        // Parallelogram: skew matches the bone direction
        const sk = node.height * 0.35  // skew amount
        const w = displayW, h = node.height
        // Above spine: leans right (top shifts right)
        // Below spine: leans left (top shifts left)
        const pts = fishboneAbove
          ? `${sk},0 ${w},0 ${w - sk},${h} 0,${h}`
          : `0,0 ${w - sk},0 ${w},${h} ${sk},${h}`
        return (
        <>
        <polygon points={pts} fill="transparent" />
        <g style={{ pointerEvents: 'none' }}
          filter="drop-shadow(0 1px 4px rgba(0,0,0,0.1))">
          <polygon points={pts} fill={nodeFill} fillOpacity={bgOpacity} />
          {(hasEmoji || hasIcon) && (() => {
            // White badge area as a clipped rect inside the parallelogram
            const badgeW = node.height + 1
            const badgePts = fishboneAbove
              ? `${sk},0 ${sk + badgeW},0 ${badgeW},${h} 0,${h}`
              : `0,0 ${badgeW},0 ${badgeW + sk},${h} ${sk},${h}`
            return <polygon points={badgePts} fill="#ffffff" />
          })()}
          <polygon points={pts} fill="none" stroke={strokeColor} strokeWidth={strokeW} />
          {showGloss && (
            <rect x={0} y={0} width={w} height={h} clipPath={`url(#${glossFbClipId})`}
              fill={`url(#${GLOSS_LINEAR_ID})`} fillOpacity={glossFillOpacity} />
          )}
        </g>
        </>)
      })() : (
        <>
        {/* Invisible hit-area so pointer events reach the <g> handlers */}
        <rect x={0} y={0} width={displayW} height={node.height} fill="transparent" />
        {/* Filter on the clip group = shadow cast from clipped shape, no external rect needed,
           so no corner colour-bleed regardless of what's inside (white badge, coloured bg, etc.) */}
        <g clipPath={`url(#${clipId})`} style={{ pointerEvents: 'none' }}
          filter={previewW !== null ? 'drop-shadow(0 0 8px rgba(59,130,246,0.7))' : 'drop-shadow(0 1px 4px rgba(0,0,0,0.1))'}>
          <rect x={0} y={0} width={displayW} height={node.height} fill={nodeFill} fillOpacity={bgOpacity} />
          {/* Gloss — soft top-of-box highlight, root/L1/L2 boxes only */}
          {showGloss && (
            <rect x={0} y={0} width={displayW} height={node.height} rx={effectiveRx} ry={effectiveRx}
              fill={`url(#${GLOSS_LINEAR_ID})`} fillOpacity={glossFillOpacity} />
          )}
          {/* White badge behind border — border ring sits on top */}
          {(hasEmoji || hasIcon) && (
            <rect x={0} y={0} width={node.height + 1} height={node.height} fill="#ffffff" />
          )}
          {/* Border ring — doubled stroke so clip cuts outer half, stays inset */}
          {(strokeW > 0 || previewW !== null) && (
            <rect x={0} y={0} width={displayW} height={node.height} rx={effectiveRx} ry={effectiveRx}
              fill="none"
              stroke={previewW !== null ? '#3b82f6' : strokeColor}
              strokeWidth={(previewW !== null ? 3.5 : strokeW) * 2}
            />
          )}
        </g>
        </>
      )}

      {editing ? (
        <foreignObject
          x={isRoot ? Math.min(editX, cx - editWFit / 2) : editX}
          y={isRoot ? cy - fontSize * 0.7 : 2}
          width={editWFit}
          height={isRoot ? fontSize * 1.6 : node.height - 4}
        >
          <input
            ref={inputRef}
            value={draft}
            autoComplete="off"
            onChange={e => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
              if (e.key === 'Escape') setEditing(false)
              e.stopPropagation()
            }}
            style={{
              width: '100%', height: '100%', boxSizing: 'border-box',
              background: 'transparent', border: 'none', outline: 'none',
              color: textColor, fontSize, fontWeight, fontStyle,
              fontFamily: 'Inter, system-ui, sans-serif',
              textAlign: isRoot ? 'center' : align, padding: '0 4px', caretColor: textColor,
            }}
          />
        </foreignObject>
      ) : isRadial ? (() => {
        // Labels live OUTSIDE the circle, so this group is never clipped to the box.
        // Where each one sits, and how far it is cut, comes from the same helper the
        // layout used to reserve room for it (src/lib/layout/mindmap radialLabelFor),
        // so a label can never land where nothing was kept clear for it.
        const glyph = node.fontSize ?? initialFontSize(node.depth, displayW)
        // Selecting a node shows its whole title, however long; otherwise it is cut.
        const label = radialLabelFor(node, rootCenter?.x ?? 0, rootCenter?.y ?? 0, isSelected)
        // A markdown link in the title still renders as a real anchor in the label -
        // but only while the whole title is on show, since a cut one no longer lines
        // up with the runs.
        const hasLinkRuns = parsedTitle.segments.some(seg => !!seg.url)
        const titleBody = label && hasLinkRuns && label.text === plainLabel
          ? renderRuns(parsedTitle.segments, 'rl')
          : label?.text
        return (
        <g style={{ pointerEvents: 'none' }}>
          <title>{plainLabel}</title>
          {/* Inside the circle: the node's emoji or icon, else the title's initial */}
          {!isRadialDot && (
            hasEmoji && resolvedEmoji ? (
              <text x={cx} y={cy + glyph * 0.36} textAnchor="middle" fontSize={glyph}>{resolvedEmoji}</text>
            ) : hasIcon && resolvedIcon ? (
              <NodeIcon icon={resolvedIcon} x={cx - glyph / 2} y={cy - glyph / 2}
                size={glyph} color={textColor} strokeWidth={2} />
            ) : (
              <text x={cx} y={cy + glyph * 0.36} textAnchor="middle"
                fontSize={glyph} fontWeight="600" fontStyle={fontStyle}
                fontFamily="Inter, system-ui, sans-serif" fill={textColor}>{nodeInitial(node.title)}</text>
            )
          )}
          {/* Depth 1 carries the map: its name and its subtree size sit under the circle.
              Depth 2 reads outward, away from the root. A dot carries no drawn label. */}
          {label && (
            <>
              <text x={label.tx} y={label.ty} textAnchor={label.anchor}
                fontSize={node.depth === 1 ? LABEL_FONT.title1 : LABEL_FONT.title2}
                fontWeight={node.depth === 1 ? '600' : '400'}
                fontFamily="Inter, system-ui, sans-serif"
                fill={node.depth === 1 ? '#1a1d2e' : '#475569'}>{titleBody}</text>
              {label.countY !== null && descendantCount > 0 && (
                <text x={label.tx} y={label.countY} textAnchor={label.anchor}
                  fontSize={LABEL_FONT.count1} fontWeight="600"
                  fontFamily="Inter, system-ui, sans-serif" fill={col}>{descendantCount}</text>
              )}
            </>
          )}
        </g>
        )
      })() : (
        <g clipPath={isRoot ? undefined : `url(#${clipId})`}>
          {hasEmoji && resolvedEmoji && !drawCircle && (() => {
            const sq = node.height
            const emojiSize = Math.round(sq * 0.52)
            // For fishbone: shift icon center to account for parallelogram skew
            const skOff = isFishboneNode ? node.height * 0.35 / 2 : 0
            const emojiCX = sq / 2 + skOff
            const textX = sq + ICON_GAP + skOff
            const h = node.height
            return (
              <>
                <text
                  x={emojiCX} y={h / 2 + emojiSize * 0.36}
                  textAnchor="middle" fontSize={emojiSize}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >{resolvedEmoji}</text>
                <text
                  x={textX}
                  y={h / 2 + fontSize * 0.38}
                  textAnchor="start"
                  fontSize={fontSize} fontWeight={fontWeight} fontStyle={fontStyle}
                  fontFamily="Inter, system-ui, sans-serif"
                  fill={textColor}
                  style={{ pointerEvents: 'none' }}
                >{hasLinks ? renderRuns(labelSegments, 'lbl') : label}</text>
              </>
            )
          })()}
          {hasIcon && resolvedIcon && !drawCircle && (() => {
            const sq = node.height  // white square = full node height
            const iconSize = Math.round(sq * 0.48)
            // For fishbone: center icon within the skewed badge area
            const skOff = isFishboneNode ? node.height * 0.35 / 2 : 0
            const iconX = (sq - iconSize) / 2 + skOff
            const iconY = (sq - iconSize) / 2
            const textX = sq + ICON_GAP + skOff
            return (
              <>
                <NodeIcon icon={resolvedIcon} x={iconX} y={iconY} size={iconSize} color={col} strokeWidth={node.depth === 1 ? 2.5 : 1.8} />
                <text
                  x={textX}
                  y={node.height / 2 + fontSize * 0.38}
                  textAnchor="start"
                  fontSize={fontSize} fontWeight={fontWeight} fontStyle={fontStyle}
                  fontFamily="Inter, system-ui, sans-serif"
                  fill={textColor}
                  style={{ pointerEvents: 'none' }}
                >{hasLinks ? renderRuns(labelSegments, 'lbl') : label}</text>
              </>
            )
          })()}
          {((!hasIcon && !hasEmoji) || isRoot || drawCircle) && (() => {
            if (drawCircle) {
              const maxChars = Math.max(8, Math.ceil(Math.sqrt(label.length * 1.8)))
              const lines = wrapText(label, maxChars)
              const ranges = lineRanges(label, lines)
              const lineH = fontSize * 1.3
              const hasVisual = hasIcon || hasEmoji
              const iconSize = fontSize * 1.4
              const iconGap = 4
              const textBlockH = lines.length * lineH
              const totalH = hasVisual ? iconSize + iconGap + textBlockH : textBlockH
              const groupCY = boxH / 2
              // Icon sits above text, both centered as a group
              const iconY = groupCY - totalH / 2
              const firstLineY = hasVisual
                ? iconY + iconSize + iconGap + fontSize * 0.38
                : groupCY - textBlockH / 2 + fontSize * 0.38
              return (
                <g style={{ pointerEvents: 'none' }}>
                  {hasEmoji && resolvedEmoji && (
                    <text x={displayW / 2} y={iconY + iconSize * 0.8}
                      textAnchor="middle" fontSize={iconSize}
                      style={{ pointerEvents: 'none' }}>{resolvedEmoji}</text>
                  )}
                  {hasIcon && resolvedIcon && !hasEmoji && (
                    <NodeIcon icon={resolvedIcon}
                      x={displayW / 2 - iconSize / 2} y={iconY}
                      size={iconSize} color={textColor} strokeWidth={1.8} />
                  )}
                  <text
                    x={displayW / 2}
                    textAnchor="middle"
                    fontSize={fontSize} fontWeight={fontWeight} fontStyle={fontStyle}
                    fontFamily="Inter, system-ui, sans-serif"
                    fill={textColor}
                    style={{ pointerEvents: 'none' }}
                  >
                    {lines.map((line, i) => (
                      <tspan key={i} x={displayW / 2} y={i === 0 ? firstLineY : undefined} dy={i === 0 ? undefined : lineH}>
                        {hasLinks ? renderRuns(sliceSegments(labelSegments, ranges[i][0], ranges[i][1]), `l${i}`) : line}
                      </tspan>
                    ))}
                  </text>
                </g>
              )
            }
            if (isRoot && diagramType === 'mindmap') {
              const maxChars = Math.max(8, Math.ceil(Math.sqrt(label.length * 1.8)))
              const lines = wrapText(label, maxChars)
              const ranges = lineRanges(label, lines)
              const lineH = fontSize * 1.3
              const startY = cy - ((lines.length - 1) * lineH) / 2
              return (
                <text
                  x={cx} textAnchor="middle"
                  fontSize={fontSize} fontWeight={fontWeight} fontStyle={fontStyle}
                  fontFamily="Inter, system-ui, sans-serif"
                  fill={textColor}
                  style={{ pointerEvents: 'none' }}
                >
                  {lines.map((line, i) => (
                    <tspan key={i} x={cx} dy={i === 0 ? startY + fontSize * 0.38 : lineH}>
                      {hasLinks ? renderRuns(sliceSegments(labelSegments, ranges[i][0], ranges[i][1]), `r${i}`) : line}
                    </tspan>
                  ))}
                </text>
              )
            }
            return (
              <text
                x={isRoot ? cx : align === 'left' ? padX : align === 'right' ? displayW - padX : displayW / 2}
                y={isRoot ? cy + fontSize * 0.38 : node.height / 2 + fontSize * 0.38}
                textAnchor={isRoot ? 'middle' : textAnchor}
                fontSize={fontSize} fontWeight={fontWeight} fontStyle={fontStyle}
                fontFamily="Inter, system-ui, sans-serif"
                fill={textColor}
                style={{ pointerEvents: 'none' }}
              >{hasLinks ? renderRuns(labelSegments, 'lbl') : label}</text>
            )
          })()}
        </g>
      )}

      {/* Resize handle — right edge, non-root boxes only. A radial mind map circle
          takes its diameter from its subtree, so there is nothing to drag. */}
      {!isRoot && !readOnly && !isRadial && (
        <g style={{ cursor: 'ew-resize', userSelect: 'none' }}>
          {/* Hit area — all pointer events on this rect so capture works */}
          <rect
            x={displayW - 6} y={0} width={14} height={node.height}
            fill="transparent"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
          />
        </g>
      )}



      {/* Selection ring — always on top. Hidden on touch devices (noInteract), not merely on
          read-only maps (readOnly) — a desktop-mouse read-only/locked map should still show
          what's selected; only a touch device should never show the blue ring. */}
      {isSelected && !noInteract && (isRoot ? (
        isRootPill ? (
          <>
            <rect x={-5} y={-5} width={displayW + 10} height={node.height + 10}
              rx={node.height / 2 + 5} ry={node.height / 2 + 5}
              fill="none" stroke="rgba(59,130,246,0.18)" strokeWidth={6}
              style={{ pointerEvents: 'none' }} />
            <rect x={-2} y={-2} width={displayW + 4} height={node.height + 4}
              rx={node.height / 2 + 2} ry={node.height / 2 + 2}
              fill="none" stroke="#3b82f6" strokeWidth={3.5}
              filter="drop-shadow(0 0 8px rgba(59,130,246,0.7))"
              style={{ pointerEvents: 'none' }} />
          </>
        ) : (
          <>
            <circle cx={cx} cy={cy} r={r + 5}
              fill="none" stroke="rgba(59,130,246,0.18)" strokeWidth={6}
              style={{ pointerEvents: 'none' }} />
            <circle cx={cx} cy={cy} r={r + 3}
              fill="none" stroke="#3b82f6" strokeWidth={3.5}
              filter="drop-shadow(0 0 8px rgba(59,130,246,0.7))"
              style={{ pointerEvents: 'none' }} />
          </>
        )
      ) : (drawCircle || isRadial) ? (
        <>
          <circle cx={cx} cy={cy} r={r + 5}
            fill="none" stroke="rgba(59,130,246,0.18)" strokeWidth={6}
            style={{ pointerEvents: 'none' }} />
          <circle cx={cx} cy={cy} r={r + 3}
            fill="none" stroke="#3b82f6" strokeWidth={3.5}
            filter="drop-shadow(0 0 8px rgba(59,130,246,0.7))"
            style={{ pointerEvents: 'none' }} />
        </>
      ) : isFishboneNode && !nodeShape ? (() => {
        const sk = node.height * 0.35
        const w = displayW, h = node.height
        const pad1 = 5, pad2 = 2
        const outerPts = fishboneAbove
          ? `${sk - pad1},${-pad1} ${w + pad1},${-pad1} ${w - sk + pad1},${h + pad1} ${-pad1},${h + pad1}`
          : `${-pad1},${-pad1} ${w - sk + pad1},${-pad1} ${w + pad1},${h + pad1} ${sk - pad1},${h + pad1}`
        const innerPts = fishboneAbove
          ? `${sk - pad2},${-pad2} ${w + pad2},${-pad2} ${w - sk + pad2},${h + pad2} ${-pad2},${h + pad2}`
          : `${-pad2},${-pad2} ${w - sk + pad2},${-pad2} ${w + pad2},${h + pad2} ${sk - pad2},${h + pad2}`
        return (
        <>
          <polygon points={outerPts}
            fill="none" stroke="rgba(59,130,246,0.18)" strokeWidth={6}
            style={{ pointerEvents: 'none' }} />
          <polygon points={innerPts}
            fill="none" stroke="#3b82f6" strokeWidth={3.5}
            filter="drop-shadow(0 0 8px rgba(59,130,246,0.7))"
            style={{ pointerEvents: 'none' }} />
        </>)
      })() : (
        <>
          <rect
            x={-5} y={-5}
            width={displayW + 10} height={node.height + 10}
            rx={effectiveRx + 4} ry={effectiveRx + 4}
            fill="none" stroke="rgba(59,130,246,0.18)" strokeWidth={6}
            style={{ pointerEvents: 'none' }} />
          <rect
            x={-2} y={-2}
            width={displayW + 4} height={node.height + 4}
            rx={effectiveRx + 2} ry={effectiveRx + 2}
            fill="none" stroke="#3b82f6" strokeWidth={3.5}
            filter="drop-shadow(0 0 8px rgba(59,130,246,0.7))"
            style={{ pointerEvents: 'none' }} />
        </>
      ))}

      {/* Link badge — node has a hyperlink; click opens it in a new tab */}
      {node.url && !isRoot && (
        <g style={{ cursor: 'pointer' }}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); openNodeUrl(node.url!) }}>
          <circle cx={displayW - 15} cy={15} r={9.5} fill="#ffffff" stroke={strokeColor} strokeWidth={1.25} />
          <NodeIcon icon="link" x={displayW - 15 - 6} y={15 - 6} size={12} color={strokeColor} strokeWidth={2.2} />
        </g>
      )}
    </g>
    </g>
  )
}

const BLOB_OFFSETS = [
  { ox: 0.45, oy: -0.30, dur: '6s',   start: 0   },
  { ox: -0.50, oy: 0.40, dur: '8s',   start: 90  },
  { ox: 0.30,  oy: 0.50, dur: '7s',   start: 180 },
  { ox: -0.40, oy: -0.45, dur: '9s',  start: 270 },
  { ox: 0.55,  oy: 0.20, dur: '5.5s', start: 45  },
  { ox: -0.30, oy: -0.20, dur: '6.5s', start: 135 },
]
const FALLBACK_COLORS = ['#0080FF','#BF5AF2','#FF375F','#34C8E8','#FF9F0A','#30D158']

/** Generate shades of a color — lighter variations, same hue */
function colorShades(hex: string, count: number): string[] {
  if (!hex.startsWith('#')) return Array.from({ length: count }, () => hex)
  const [r, g, b] = hexToRgb(hex)
  return Array.from({ length: count }, (_, i) => {
    // Same random factor for all channels to preserve hue
    const mix = 0.3 + (i / count) * 0.4 + Math.random() * 0.2
    const nr = Math.round(r + (255 - r) * mix)
    const ng = Math.round(g + (255 - g) * mix)
    const nb = Math.round(b + (255 - b) * mix)
    return `rgb(${nr},${ng},${nb})`
  })
}

function Fireflies({ cx, cy, r, color, colors, count = 10 }: { cx: number; cy: number; r: number; color: string; colors?: string[]; count?: number }) {
  const n = Math.min(count, 20) // cap at 20 to avoid perf issues
  const [flies] = useState(() => {
    const shades = colors && colors.length
      ? Array.from({ length: n }, (_, i) => colors[i % colors.length])
      : colorShades(color, n)
    return Array.from({ length: n }, (_, i) => {
      const angle = Math.random() * Math.PI * 2
      const dist = r * (0.7 + Math.random() * 0.3)
      const maxDrift = r * 0.35
      return {
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        size: 1.0 + Math.random() * 1.5,
        color: shades[i],
        key: i,
        d1: { dx: (Math.random() - 0.5) * maxDrift, dy: (Math.random() - 0.5) * maxDrift },
        d2: { dx: (Math.random() - 0.5) * maxDrift, dy: (Math.random() - 0.5) * maxDrift },
        dur: 5 + Math.random() * 8,
        blinkDur: 1.2 + Math.random() * 2,
        blinkBegin: Math.random() * 3,
      }
    })
  })
  return (
    <g style={{ pointerEvents: 'none' }}>
      {flies.map(f => (
        <g key={f.key}>
          {/* Glow */}
          <circle cx={f.x} cy={f.y} r={f.size * 3.5} fill={f.color}>
            <animate attributeName="opacity" values="0.04;0.25;0.04"
              dur={`${f.blinkDur}s`} repeatCount="indefinite" begin={`${f.blinkBegin}s`} />
            <animateTransform attributeName="transform" type="translate"
              values={`0 0; ${f.d1.dx} ${f.d1.dy}; ${f.d2.dx} ${f.d2.dy}; 0 0`}
              dur={`${f.dur}s`} repeatCount="indefinite"
              calcMode="spline" keyTimes="0;0.33;0.67;1"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1" />
          </circle>
          {/* Core */}
          <circle cx={f.x} cy={f.y} r={f.size} fill={f.color}>
            <animate attributeName="opacity" values="0.3;0.9;0.3"
              dur={`${f.blinkDur}s`} repeatCount="indefinite" begin={`${f.blinkBegin}s`} />
            <animateTransform attributeName="transform" type="translate"
              values={`0 0; ${f.d1.dx} ${f.d1.dy}; ${f.d2.dx} ${f.d2.dy}; 0 0`}
              dur={`${f.dur}s`} repeatCount="indefinite"
              calcMode="spline" keyTimes="0;0.33;0.67;1"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1" />
          </circle>
        </g>
      ))}
    </g>
  )
}

function SiriWave({ cx, cy, r, colors }: { cx: number; cy: number; r: number; colors: string[] }) {
  const palette = colors.length > 0 ? colors : FALLBACK_COLORS
  const blobs = BLOB_OFFSETS.map((o, i) => ({
    color: palette[i % palette.length],
    ox: r * o.ox, oy: r * o.oy, dur: o.dur, start: o.start,
  }))
  const filterId = `siri-blur-${Math.round(cx)}`

  return (
    <g style={{ pointerEvents: 'none' }}>
      <defs>
        <filter id={filterId} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation={r * 0.30} />
        </filter>
      </defs>

      {/* Rotating colorful blobs */}
      <g filter={`url(#${filterId})`} opacity={0.72}>
        {blobs.map((b, i) => (
          <circle key={i} cx={cx + b.ox} cy={cy + b.oy} r={r * 0.88} fill={b.color}>
            <animateTransform attributeName="transform" type="rotate"
              from={`${b.start} ${cx} ${cy}`} to={`${b.start + 360} ${cx} ${cy}`}
              dur={b.dur} repeatCount="indefinite" />
            <animate attributeName="r" values={`${r * 0.8};${r * 1.0};${r * 0.8}`}
              dur={b.dur} repeatCount="indefinite" />
          </circle>
        ))}
      </g>

      {/* Fireflies moved to L1 nodes — no longer on root */}
    </g>
  )
}

