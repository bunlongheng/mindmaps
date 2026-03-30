import { useRef, useState, useCallback } from 'react'
import type { MindmapNode } from '../../types'
import { useMindmapStore } from '../../store/mindmapStore'
import { NodeIcon, getLucideIcon } from './NodeIcon'

interface NodeProps {
  node: MindmapNode
  isSelected: boolean
  onSelect: (id: string, multi: boolean) => void
  onDragEnd: (id: string, dx: number, dy: number) => void
  onDoubleClick: (node: MindmapNode) => void
  onAddChild?: (parentId: string) => void
  onDragMove?: (id: string, cx: number, cy: number) => void
  onRootDragOffset?: (offset: { dx: number; dy: number; clientX: number; clientY: number } | null) => void
  svgRef: React.RefObject<SVGSVGElement>
  readOnly?: boolean
  l1Colors?: string[]
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}

function lighten(hex: string, amount = 0.85): string {
  const [r,g,b] = hexToRgb(hex)
  const nr = Math.round(r + (255 - r) * amount)
  const ng = Math.round(g + (255 - g) * amount)
  const nb = Math.round(b + (255 - b) * amount)
  return `rgb(${nr},${ng},${nb})`
}

function darkenColor(hex: string, amount = 0.35): string {
  const [r,g,b] = hexToRgb(hex)
  const nr = Math.round(r * (1 - amount))
  const ng = Math.round(g * (1 - amount))
  const nb = Math.round(b * (1 - amount))
  return `rgb(${nr},${ng},${nb})`
}

/** Returns true if the color is light enough that black text is readable */
function isLight(hex: string): boolean {
  if (!hex.startsWith('#')) return true
  const [r,g,b] = hexToRgb(hex)
  // Perceived luminance (WCAG formula)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 140
}

export function Node({ node, isSelected, onSelect, onDragEnd, onDoubleClick, onDragMove, onRootDragOffset, svgRef, readOnly, l1Colors = [] }: NodeProps) {
  const isRoot = node.depth === 0
  const isL2Plus = node.depth >= 2
  const rx = isRoot ? 10 : 8
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const resizePreview = useMindmapStore(s => s.resizePreview)
  const diagramType = useMindmapStore(s => s.diagramType)
  const parentNode = useMindmapStore(s =>
    diagramType === 'mindmap' && node.depth >= 2
      ? s.activeMindmap?.nodes.find(n => n.id === node.parentId)
      : undefined
  )
  const canDrag = (isRoot && diagramType !== 'mindmap') || diagramType === 'logic-chart'
  // Root becomes a pill when title is long (≥15 chars) or when stored dims are non-square
  const isRootPill = isRoot && (node.title.length >= 15 || node.width !== node.height)
  const isMindmapCircle = diagramType === 'mindmap' && node.depth === 1
  const isMindmapL2Plus = diagramType === 'mindmap' && node.depth >= 2
  const previewW = (!isRoot && resizePreview?.depth === node.depth) ? resizePreview.width : null

  // For mindmap L2+ nodes: rotate along the edge direction
  const mindmapAngle = (() => {
    if (diagramType !== 'mindmap' || node.depth < 2 || !parentNode) return null
    const dx = (node.x + node.width / 2) - (parentNode.x + parentNode.width / 2)
    const dy = (node.y + node.height / 2) - (parentNode.y + parentNode.height / 2)
    let angle = Math.atan2(dy, dx) * 180 / Math.PI
    // Flip upside-down text so it always reads left→right
    if (angle > 90 || angle <= -90) angle += 180
    return angle
  })()

  // Styling per depth
  let bg: string, textColor: string, strokeColor: string, strokeW: number

  if (isRoot) {
    bg = '#1a1d2e'
    textColor = '#ffffff'
    strokeColor = '#1a1d2e'
    strokeW = 5
  } else if (isL2Plus) {
    const lightenAmt = node.depth === 2 ? 0.58 : node.depth === 3 ? 0.68 : 0.76
    bg = node.color.startsWith('#') ? lighten(node.color, lightenAmt) : '#f8fafc'
    textColor = node.color.startsWith('#') ? darkenColor(node.color, 0.55) : node.color
    strokeColor = node.color
    strokeW = 2
  } else if (isMindmapCircle) {
    // L1 mindmap: solid black pill like root, white text
    bg = '#1a1d2e'
    textColor = '#ffffff'
    strokeColor = '#1a1d2e'
    strokeW = 0
  } else {
    // L1 all other diagrams: solid color fill, auto text, no border
    bg = node.color
    textColor = isLight(node.color) ? '#1a1d2e' : '#ffffff'
    strokeColor = node.color
    strokeW = 0
  }

  // Icon color: on white circles use node.color, on light text nodes use darkened color
  const iconColor = isRoot
    ? textColor
    : isMindmapCircle
      ? '#ffffff'
      : node.depth === 1
        ? (isLight(node.color) ? '#1a1d2e' : '#ffffff')
        : (node.color.startsWith('#') ? darkenColor(node.color, 0.35) : node.color)

  // Node-level overrides from panel
  if (node.borderColor) { strokeColor = node.borderColor; strokeW = Math.max(strokeW, node.borderWidth ?? 1.5) }

  // Depth-based font sizes
  const defaultFontSize = node.depth === 0 ? 28 : node.depth === 1 ? 22 : node.depth === 2 ? 16 : node.depth === 3 ? 13 : 11
  const fontSize = node.fontSize ?? defaultFontSize
  const fontWeight = node.bold ? '700' : (isRoot ? '500' : node.depth === 1 ? '500' : '400')

  // Depth-based bg opacity only (text stays fully opaque)
  const bgOpacity = 1
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
      const textW = val.length * fontSize * 0.55
      if (val.length >= 15) {
        // pill: auto width, fixed height
        updates.width = Math.max(240, Math.round(textW + 72))
        updates.height = 90
      } else {
        // circle: equal width and height
        const diameter = Math.max(180, Math.round(textW + 56))
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
  // Use live preview width during resize drag, otherwise committed node width
  const displayW = previewW ?? node.width
  void ((hasIcon || hasEmoji) ? displayW * 0.2 : 0) // iconZoneW — reserved for future use
  const label = node.title
  // All coordinates are relative to (node.x, node.y)
  const cx = displayW / 2
  const cy = node.height / 2
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

  return (
    <g style={{
      transform: mindmapAngle !== null
        ? `translate(${node.x + node.width / 2}px, ${node.y + node.height / 2}px) rotate(${mindmapAngle}deg) translate(${-node.width / 2}px, ${-node.height / 2}px)`
        : `translate(${node.x}px, ${node.y}px)`,
      transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
    }}>
    {!isRoot && (
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={displayW - 4} height={node.height} rx={rx} ry={rx} />
        </clipPath>
      </defs>
    )}
    <g
      onPointerDown={handlePointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: editing ? 'default' : canDrag ? 'grab' : 'pointer', userSelect: 'none' }}
    >
      {isRoot ? (
        <>
          {/* Siri-style animated wave glow — use half-height as radius for pills */}
          {(() => { const ar = isRootPill ? node.height / 2 : r; return (
          <>
          <SiriWave cx={cx} cy={cy} r={ar} colors={l1Colors} />

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

          {/* Root shape: pill rect for long titles, circle for short */}
          {isRootPill ? (
            <rect x={0} y={0} width={displayW} height={node.height}
              rx={node.height / 2} ry={node.height / 2}
              fill={bg} fillOpacity={0.8} stroke={strokeColor} strokeWidth={strokeW}
              filter="drop-shadow(0 4px 16px rgba(0,0,0,0.35))" />
          ) : (
            <circle cx={cx} cy={cy} r={r} fill={bg} fillOpacity={0.8}
              stroke={strokeColor} strokeWidth={strokeW}
              filter="drop-shadow(0 4px 16px rgba(0,0,0,0.35))" />
          )}

          {/* Front ring glint — horizontal */}
          <ellipse cx={cx} cy={cy} rx={ar * 2.0} ry={ar * 0.32}
            stroke="#d1d5db" strokeWidth={2} fill="none" opacity={0.55}
            strokeDasharray={`${ar * 3.14} ${ar * 9.42}`}
            strokeDashoffset={`${ar * 1.57}`}
            style={{ pointerEvents: 'none' }}>
            <animateTransform attributeName="transform" type="rotate"
              from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="12s" repeatCount="indefinite" />
          </ellipse>
          {/* Front ring glint — vertical spine */}
          <ellipse cx={cx} cy={cy} rx={ar * 0.32} ry={ar * 2.0}
            stroke="#d1d5db" strokeWidth={2} fill="none" opacity={0.55}
            strokeDasharray={`${ar * 3.14} ${ar * 9.42}`}
            strokeDashoffset={`${ar * 1.57}`}
            style={{ pointerEvents: 'none' }}>
            <animateTransform attributeName="transform" type="rotate"
              from={`0 ${cx} ${cy}`} to={`-360 ${cx} ${cy}`} dur="12s" repeatCount="indefinite" />
          </ellipse>
          </>)})()}
        </>
      ) : isMindmapL2Plus ? (
        <rect x={0} y={0} width={displayW} height={node.height} fill="transparent" />
      ) : (
        <rect
          x={0} y={0} width={displayW} height={node.height}
          rx={rx} ry={rx} fill={bg} fillOpacity={bgOpacity}
          stroke={previewW !== null ? '#3b82f6' : strokeColor} strokeWidth={previewW !== null ? 3.5 : strokeW}
          filter={previewW !== null ? 'drop-shadow(0 0 8px rgba(59,130,246,0.7))' : 'drop-shadow(0 1px 4px rgba(0,0,0,0.1))'}
        />
      )}

      {editing ? (
        <foreignObject
          x={isRoot ? cx - r * 0.75 : 2}
          y={isRoot ? cy - fontSize * 0.7 : 2}
          width={isRoot ? r * 1.5 : displayW - 4}
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
              textAlign: 'center', padding: '0 4px', caretColor: textColor,
            }}
          />
        </foreignObject>
      ) : (
        <g clipPath={isRoot ? undefined : `url(#${clipId})`}>
          {hasEmoji && resolvedEmoji && !isMindmapL2Plus && (() => {
            const zoneW = displayW * 0.2
            const emojiSize = Math.min(node.height * 0.52, 22)
            const textAreaX = zoneW + (displayW - zoneW) / 2
            const sw = strokeW / 2
            const h = node.height
            return (
              <>
                <path
                  d={`M ${rx},${sw} L ${zoneW},${sw} L ${zoneW},${h - sw} L ${rx},${h - sw} Q ${sw},${h - sw} ${sw},${h - rx} L ${sw},${rx} Q ${sw},${sw} ${rx},${sw} Z`}
                  fill="rgba(255,255,255,0.95)"
                  style={{ pointerEvents: 'none' }}
                />
                <text
                  x={zoneW / 2} y={h / 2 + emojiSize * 0.36}
                  textAnchor="middle" fontSize={emojiSize}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >{resolvedEmoji}</text>
                <text
                  x={align === 'left' ? zoneW + 8 : align === 'right' ? displayW - 8 : textAreaX}
                  y={h / 2 + fontSize * 0.38}
                  textAnchor={textAnchor}
                  fontSize={fontSize} fontWeight={fontWeight} fontStyle={fontStyle}
                  fontFamily="Inter, system-ui, sans-serif"
                  fill={textColor}
                  style={{ pointerEvents: 'none' }}
                >{label}</text>
              </>
            )
          })()}
          {hasIcon && resolvedIcon && !isMindmapL2Plus && (() => {
            const zoneW = displayW * 0.2
            const iconSize = Math.min(fontSize + 4, zoneW * 0.65)
            const iconX = (zoneW - iconSize) / 2
            const iconY = (node.height - iconSize) / 2
            const textAreaX = zoneW + (displayW - zoneW) / 2
            return (
              <>
                <NodeIcon icon={resolvedIcon} x={iconX} y={iconY} size={iconSize} color={iconColor} strokeWidth={node.depth === 1 ? 2.8 : 1.8} />
                <text
                  x={align === 'left' ? zoneW + 8 : align === 'right' ? displayW - 8 : textAreaX}
                  y={node.height / 2 + fontSize * 0.38}
                  textAnchor={textAnchor}
                  fontSize={fontSize} fontWeight={fontWeight} fontStyle={fontStyle}
                  fontFamily="Inter, system-ui, sans-serif"
                  fill={textColor}
                  style={{ pointerEvents: 'none' }}
                >{label}</text>
              </>
            )
          })()}
          {((!hasIcon && !hasEmoji) || isRoot || isMindmapL2Plus) && (
            <text
              x={isRoot ? cx : isMindmapL2Plus ? ((hasEmoji || hasIcon) ? 26 : 12) : align === 'left' ? 12 : align === 'right' ? displayW - 12 : displayW / 2}
              y={isRoot ? cy + fontSize * 0.38 : node.height / 2 + fontSize * 0.38}
              textAnchor={isRoot ? 'middle' : textAnchor}
              fontSize={fontSize} fontWeight={fontWeight} fontStyle={fontStyle}
              fontFamily="Inter, system-ui, sans-serif"
              fill={textColor}
              style={{ pointerEvents: 'none' }}
            >{label}</text>
          )}
        </g>
      )}

      {/* Resize handle — right edge, non-root only, not mindmap circles */}
      {!isRoot && !readOnly && (
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

      {/* Mindmap L2+: emoji/icon circle at the near edge (toward parent), rendered outside clip */}
      {isMindmapL2Plus && (hasEmoji || hasIcon) && (() => {
        const emojiR = 10
        const cx2 = emojiR + 2   // sits at the beginning (left edge) of the node
        const cy2 = node.height / 2
        const iconS = emojiR * 1.4
        return (
          <g style={{ pointerEvents: 'none', animation: 'iconPop 0.4s cubic-bezier(0.34,1.56,0.64,1)', transformBox: 'fill-box', transformOrigin: `${cx2}px ${cy2}px` }}>
            <circle cx={cx2} cy={cy2} r={emojiR} fill={node.color} stroke="white" strokeWidth={1.5} />
            {hasEmoji && resolvedEmoji
              ? <text x={cx2} y={cy2} textAnchor="middle" dominantBaseline="central"
                  fontSize={emojiR * 1.3} style={{ pointerEvents: 'none' }}>{resolvedEmoji}</text>
              : hasIcon && resolvedIcon
                ? <NodeIcon icon={resolvedIcon} x={cx2 - iconS / 2} y={cy2 - iconS / 2}
                    size={iconS} color="#fff" strokeWidth={1.8} />
                : null
            }
          </g>
        )
      })()}


      {/* Selection ring — always on top */}
      {isSelected && (isRoot ? (
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
      ) : (
        <>
          <rect
            x={-5} y={-5}
            width={displayW + 10} height={node.height + 10}
            rx={rx + 4} ry={rx + 4}
            fill="none" stroke="rgba(59,130,246,0.18)" strokeWidth={6}
            style={{ pointerEvents: 'none' }} />
          <rect
            x={-2} y={-2}
            width={displayW + 4} height={node.height + 4}
            rx={rx + 2} ry={rx + 2}
            fill="none" stroke="#3b82f6" strokeWidth={3.5}
            filter="drop-shadow(0 0 8px rgba(59,130,246,0.7))"
            style={{ pointerEvents: 'none' }} />
        </>
      ))}
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

function randPos(cx: number, cy: number, r: number) {
  const angle = Math.random() * Math.PI * 2
  const dist = r * (1.4 + Math.random() * 1.4)
  return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist, size: 1.0 + Math.random() * 1.5 }
}
function randDrift(r: number) {
  return { dx: (Math.random() - 0.5) * r * 1.2, dy: (Math.random() - 0.5) * r * 1.2 }
}

function RoamingStars({ cx, cy, r, colors }: { cx: number; cy: number; r: number; colors: string[] }) {
  const palette = colors.length > 0 ? colors : FALLBACK_COLORS
  const [stars] = useState(() =>
    Array.from({ length: 12 }, (_, i) => ({
      ...randPos(cx, cy, r),
      color: palette[i % palette.length],
      key: i,
      d1: randDrift(r),
      d2: randDrift(r),
      dur: 7 + Math.random() * 6,
      blinkDur: 1.6 + Math.random() * 1.4,
      blinkBegin: Math.random() * 2,
    }))
  )
  return (
    <>
      {stars.map(st => (
        <g key={st.key} style={{ pointerEvents: 'none' }}>
          <circle cx={st.x} cy={st.y} r={st.size * 3} fill={st.color}>
            <animate attributeName="opacity" values="0.08;0.3;0.08"
              dur={`${st.blinkDur}s`} repeatCount="indefinite" begin={`${st.blinkBegin}s`} />
            <animateTransform attributeName="transform" type="translate"
              values={`0 0; ${st.d1.dx} ${st.d1.dy}; ${st.d2.dx} ${st.d2.dy}; 0 0`}
              dur={`${st.dur}s`} repeatCount="indefinite"
              calcMode="spline" keyTimes="0;0.33;0.67;1"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1" />
          </circle>
          <circle cx={st.x} cy={st.y} r={st.size} fill={st.color}>
            <animate attributeName="opacity" values="0.5;1;0.5"
              dur={`${st.blinkDur}s`} repeatCount="indefinite" begin={`${st.blinkBegin}s`} />
            <animateTransform attributeName="transform" type="translate"
              values={`0 0; ${st.d1.dx} ${st.d1.dy}; ${st.d2.dx} ${st.d2.dy}; 0 0`}
              dur={`${st.dur}s`} repeatCount="indefinite"
              calcMode="spline" keyTimes="0;0.33;0.67;1"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1" />
          </circle>
        </g>
      ))}
    </>
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

      {/* Roaming star dots using L1 colors */}
      <RoamingStars cx={cx} cy={cy} r={r} colors={colors} />
    </g>
  )
}

