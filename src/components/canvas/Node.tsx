import { useRef } from 'react'
import type { MindNode } from '../../types'
import { useDiagramStore } from '../../store/diagramStore'

interface NodeProps {
  node: MindNode
  isSelected: boolean
  onSelect: (id: string, multi: boolean) => void
  onDragEnd: (id: string, dx: number, dy: number) => void
  onDoubleClick: (node: MindNode) => void
  onAddChild?: (parentId: string) => void
  svgRef: React.RefObject<SVGSVGElement>
  _zoom?: number
}

export function Node({ node, isSelected, onSelect, onDragEnd, onDoubleClick, svgRef }: NodeProps) {
  const isRoot = node.depth === 0
  const rx = isRoot ? 10 : 8

  // Root: dark navy. Children: their color. Grandchildren: lighter
  let bg: string
  let textColor: string
  let borderColor: string

  if (isRoot) {
    bg = '#1a1d2e'
    textColor = '#ffffff'
    borderColor = isSelected ? '#6366f1' : '#1a1d2e'
  } else {
    bg = node.color
    // Determine if color is light or dark for text
    const hex = node.color.replace('#', '')
    const r = parseInt(hex.slice(0,2), 16)
    const g = parseInt(hex.slice(2,4), 16)
    const b = parseInt(hex.slice(4,6), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    textColor = luminance > 0.6 ? '#1a1d2e' : '#ffffff'
    borderColor = isSelected ? '#6366f1' : node.color
  }

  const fontSize = node.fontSize ?? (isRoot ? 15 : node.depth === 1 ? 13 : 12)
  const fontWeight = isRoot ? '700' : node.depth === 1 ? '600' : '500'

  const dragStart = useRef<{ x: number; y: number; nodeX: number; nodeY: number } | null>(null)

  function getSVGPoint(e: React.PointerEvent) {
    const svg = svgRef.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    return pt.matrixTransform(svg.getScreenCTM()!.inverse())
  }

  function onPointerDown(e: React.PointerEvent) {
    e.stopPropagation()
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
    useDiagramStore.getState().updateNode(node.id, {
      x: dragStart.current.nodeX + (pt.x - dragStart.current.x),
      y: dragStart.current.nodeY + (pt.y - dragStart.current.y),
      manuallyPositioned: true,
    })
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragStart.current) return
    const pt = getSVGPoint(e)
    if (pt) onDragEnd(node.id, pt.x - dragStart.current.x, pt.y - dragStart.current.y)
    dragStart.current = null
  }

  const maxChars = isRoot ? 20 : 16
  const label = node.title.length > maxChars ? node.title.slice(0, maxChars - 1) + '…' : node.title

  return (
    <g
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={e => { e.stopPropagation(); onDoubleClick(node) }}
      style={{ cursor: 'grab', userSelect: 'none' }}
    >
      <rect
        x={node.x} y={node.y}
        width={node.width} height={node.height}
        rx={rx} ry={rx}
        fill={bg}
        stroke={borderColor}
        strokeWidth={isSelected ? 2.5 : 0}
        filter={isSelected ? 'drop-shadow(0 0 8px rgba(99,102,241,0.45))' : isRoot ? 'drop-shadow(0 3px 8px rgba(26,29,46,0.25))' : 'drop-shadow(0 2px 6px rgba(0,0,0,0.15))'}
      />
      <text
        x={node.x + node.width / 2}
        y={node.y + node.height / 2 + fontSize * 0.38}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={fontWeight}
        fontFamily="Inter, system-ui, sans-serif"
        fill={textColor}
        style={{ pointerEvents: 'none' }}
      >
        {label}
      </text>
    </g>
  )
}
