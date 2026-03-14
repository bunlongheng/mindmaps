import { useRef, useState, useCallback } from 'react'
import type { MindNode } from '../../types'
import { useDiagramStore } from '../../store/diagramStore'
import { NodeIcon } from './NodeIcon'

interface NodeProps {
  node: MindNode
  isSelected: boolean
  onSelect: (id: string, multi: boolean) => void
  onDragEnd: (id: string, dx: number, dy: number) => void
  onDoubleClick: (node: MindNode) => void
  onAddChild?: (parentId: string) => void
  onDragMove?: (id: string, cx: number, cy: number) => void
  svgRef: React.RefObject<SVGSVGElement>
  readOnly?: boolean
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

export function Node({ node, isSelected, onSelect, onDragEnd, onDoubleClick, onDragMove, svgRef, readOnly }: NodeProps) {
  const isRoot = node.depth === 0
  const isL2Plus = node.depth >= 2
  const rx = isRoot ? 10 : 8
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

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
  } else {
    // L1: solid fill, white text, black border
    bg = node.color
    textColor = '#ffffff'
    strokeColor = '#1a1d2e'
    strokeW = 3
  }

  // Icon color: in white zone so always use the node's brand color (not white)
  const iconColor = node.depth === 1
    ? (node.color.startsWith('#') ? darkenColor(node.color, 0.1) : node.color)
    : textColor

  // Node-level overrides from panel
  if (node.borderColor) { strokeColor = node.borderColor; strokeW = Math.max(strokeW, node.borderWidth ?? 1.5) }

  // Depth-based font sizes
  const defaultFontSize = node.depth === 0 ? 28 : node.depth === 1 ? 22 : node.depth === 2 ? 16 : node.depth === 3 ? 13 : 11
  const fontSize = node.fontSize ?? defaultFontSize
  const fontWeight = node.bold ? '700' : (isRoot ? '500' : node.depth === 1 ? '500' : '400')

  // Depth-based bg opacity only (text stays fully opaque)
  const bgOpacity = node.depth === 2 ? 0.9 : node.depth === 3 ? 0.8 : node.depth >= 4 ? 0.7 : 1
  const fontStyle = node.italic ? 'italic' : 'normal'
  // Relative coords (origin = node.x, node.y) — always center
  const textX = node.width / 2

  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<{ x: number; y: number; nodeX: number; nodeY: number } | null>(null)
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
    const updates: Partial<MindNode> = { title: val }
    if (isRoot) {
      const textW = val.length * fontSize * 0.55
      const diameter = Math.max(180, Math.round(textW + 56))
      updates.width = diameter
      updates.height = diameter
    }
    useDiagramStore.getState().updateNode(node.id, updates)
    if (isRoot) setTimeout(() => useDiagramStore.getState().rerunLayout(), 0)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (editing || readOnly) return
    e.stopPropagation()
    didDrag.current = false
    onSelect(node.id, e.metaKey || e.ctrlKey || e.shiftKey)
    const pt = getSVGPoint(e)
    if (!pt) return
    dragStart.current = { x: pt.x, y: pt.y, nodeX: node.x, nodeY: node.y }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return
    e.stopPropagation()
    const pt = getSVGPoint(e)
    if (!pt) return
    const dx = pt.x - dragStart.current.x
    const dy = pt.y - dragStart.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true
    const newX = dragStart.current.nodeX + dx
    const newY = dragStart.current.nodeY + dy
    useDiagramStore.getState().updateNode(node.id, {
      x: newX, y: newY, manuallyPositioned: true,
    })
    onDragMove?.(node.id, newX + node.width / 2, newY + node.height / 2)
  }

  function onPointerUp(_e: React.PointerEvent) {
    if (!dragStart.current) return
    dragStart.current = null
    if (didDrag.current) onDragEnd(node.id, 0, 0)
  }

  function handleDoubleClick(e: React.MouseEvent) {
    if (readOnly) return
    e.stopPropagation()
    if (!didDrag.current) startEdit()
    else onDoubleClick(node)
  }

  const maxChars = isRoot ? 12 : 22
  const label = node.title.length > maxChars ? node.title.slice(0, maxChars - 1) + '…' : node.title
  // All coordinates are relative to (node.x, node.y)
  const cx = node.width / 2
  const cy = node.height / 2
  const r = node.width / 2

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsDragging(true)
    onPointerDown(e)
  }, [onPointerDown])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false)
    onPointerUp(e)
  }, [onPointerUp])

  return (
    <g style={{
      transform: `translate(${node.x}px, ${node.y}px)`,
      transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
    }}>
    <g
      onPointerDown={handlePointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: editing ? 'default' : 'grab', userSelect: 'none' }}
    >
      {isRoot ? (
        <>
          {/* Glow halo — black/grey */}
          <circle cx={cx} cy={cy} r={r * 2.2} fill="#1a1d2e" opacity={0.06} style={{ pointerEvents: 'none' }} />
          <circle cx={cx} cy={cy} r={r * 1.5} fill="#374151" opacity={0.07} style={{ pointerEvents: 'none' }} />

          {/* Rainbow animated stars — random roaming positions */}
          <RainbowStars cx={cx} cy={cy} r={r} />

          {/* Back ring — grey, spinning */}
          <ellipse cx={cx} cy={cy} rx={r * 2.0} ry={r * 0.32}
            stroke="#6b7280" strokeWidth={2} fill="none" opacity={0.25}
            style={{ pointerEvents: 'none' }}>
            <animateTransform attributeName="transform" type="rotate"
              from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="12s" repeatCount="indefinite" />
          </ellipse>
          <ellipse cx={cx} cy={cy} rx={r * 2.4} ry={r * 0.38}
            stroke="#9ca3af" strokeWidth={1.2} fill="none" opacity={0.14}
            style={{ pointerEvents: 'none' }}>
            <animateTransform attributeName="transform" type="rotate"
              from={`0 ${cx} ${cy}`} to={`-360 ${cx} ${cy}`} dur="18s" repeatCount="indefinite" />
          </ellipse>

          {/* Root circle */}
          <circle
            cx={cx} cy={cy} r={r} fill={bg}
            stroke={strokeColor} strokeWidth={strokeW}
            filter="drop-shadow(0 4px 16px rgba(0,0,0,0.35))"
          />

          {/* Front ring glint — grey, spinning same speed as back ring */}
          <ellipse cx={cx} cy={cy} rx={r * 2.0} ry={r * 0.32}
            stroke="#d1d5db" strokeWidth={2} fill="none" opacity={0.55}
            strokeDasharray={`${r * 3.14} ${r * 9.42}`}
            strokeDashoffset={`${r * 1.57}`}
            style={{ pointerEvents: 'none' }}>
            <animateTransform attributeName="transform" type="rotate"
              from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="12s" repeatCount="indefinite" />
          </ellipse>
        </>
      ) : (
        <rect
          x={0} y={0} width={node.width} height={node.height}
          rx={rx} ry={rx} fill={bg} fillOpacity={bgOpacity}
          stroke={strokeColor} strokeWidth={strokeW}
          filter="drop-shadow(0 1px 4px rgba(0,0,0,0.1))"
        />
      )}

      {editing ? (
        <foreignObject
          x={isRoot ? cx - r * 0.75 : 2}
          y={isRoot ? cy - fontSize * 0.7 : 2}
          width={isRoot ? r * 1.5 : node.width - 4}
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
        <>
          {node.icon && !isRoot && (() => {
            const iconZoneW = node.width * 0.2
            const iconSize = Math.min(fontSize + 4, iconZoneW * 0.65)
            const iconX = (iconZoneW - iconSize) / 2
            const iconY = (node.height - iconSize) / 2
            const textAreaX = iconZoneW + (node.width - iconZoneW) / 2
            return (
              <>
                {/* White icon zone — left-rounded only */}
                <path
                  d={`M ${rx},0 L ${iconZoneW},0 L ${iconZoneW},${node.height} L ${rx},${node.height} Q 0,${node.height} 0,${node.height - rx} L 0,${rx} Q 0,0 ${rx},0 Z`}
                  fill="rgba(255,255,255,0.88)"
                  style={{ pointerEvents: 'none' }}
                />
                <NodeIcon icon={node.icon} x={iconX} y={iconY} size={iconSize} color={iconColor} strokeWidth={node.depth === 1 ? 2.8 : 1.8} />
                <text
                  x={textAreaX}
                  y={node.height / 2 + fontSize * 0.38}
                  textAnchor="middle"
                  fontSize={fontSize} fontWeight={fontWeight} fontStyle={fontStyle}
                  fontFamily="Inter, system-ui, sans-serif"
                  fill={textColor}
                  style={{ pointerEvents: 'none' }}
                >{label}</text>
              </>
            )
          })()}
          {(!node.icon || isRoot) && (
            <text
              x={isRoot ? cx : textX}
              y={isRoot ? cy + fontSize * 0.38 : node.height / 2 + fontSize * 0.38}
              textAnchor="middle"
              fontSize={fontSize} fontWeight={fontWeight} fontStyle={fontStyle}
              fontFamily="Inter, system-ui, sans-serif"
              fill={textColor}
              style={{ pointerEvents: 'none' }}
            >{label}</text>
          )}
        </>
      )}

      {/* Selection ring — always on top */}
      {isSelected && (isRoot ? (
        <>
          <circle cx={cx} cy={cy} r={r + 5}
            fill="none" stroke="rgba(59,130,246,0.18)" strokeWidth={6}
            style={{ pointerEvents: 'none' }} />
          <circle cx={cx} cy={cy} r={r + 3}
            fill="none" stroke="#3b82f6" strokeWidth={3.5}
            filter="drop-shadow(0 0 8px rgba(59,130,246,0.7))"
            style={{ pointerEvents: 'none' }} />
        </>
      ) : (
        <>
          <rect
            x={-5} y={-5}
            width={node.width + 10} height={node.height + 10}
            rx={rx + 4} ry={rx + 4}
            fill="none" stroke="rgba(59,130,246,0.18)" strokeWidth={6}
            style={{ pointerEvents: 'none' }} />
          <rect
            x={-2} y={-2}
            width={node.width + 4} height={node.height + 4}
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

const STAR_COLORS = ['#ff4d6d','#ff9f1c','#ffe066','#06d6a0','#4cc9f0','#a855f7','#f72585','#3a86ff','#fb5607','#8338ec']

function randPos(cx: number, cy: number, r: number) {
  const angle = Math.random() * Math.PI * 2
  const dist = r * (1.4 + Math.random() * 1.4)
  return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist, size: 1.0 + Math.random() * 1.5 }
}

function randDrift(r: number) {
  return { dx: (Math.random() - 0.5) * r * 1.2, dy: (Math.random() - 0.5) * r * 1.2 }
}

function RainbowStars({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const [stars] = useState(() =>
    STAR_COLORS.map((color, i) => ({
      ...randPos(cx, cy, r),
      color, key: i,
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
          {/* Glow halo */}
          <circle cx={st.x} cy={st.y} r={st.size * 3} fill={st.color}>
            <animate attributeName="opacity" values="0.08;0.3;0.08"
              dur={`${st.blinkDur}s`} repeatCount="indefinite" begin={`${st.blinkBegin}s`} />
            <animateTransform attributeName="transform" type="translate"
              values={`0 0; ${st.d1.dx} ${st.d1.dy}; ${st.d2.dx} ${st.d2.dy}; 0 0`}
              dur={`${st.dur}s`} repeatCount="indefinite"
              calcMode="spline" keyTimes="0;0.33;0.67;1"
              keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1" />
          </circle>
          {/* Star dot */}
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

