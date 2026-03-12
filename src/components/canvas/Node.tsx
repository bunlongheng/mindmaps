import { useRef } from 'react'
import type { MindNode } from '../../types'
import { applyDepthBackground, darken } from '../../lib/color'
import { useDiagramStore } from '../../store/diagramStore'

interface NodeProps {
  node: MindNode
  isSelected: boolean
  onSelect: (id: string, multi: boolean) => void
  onDragEnd: (id: string, dx: number, dy: number) => void
  onDoubleClick: (node: MindNode) => void
  onAddChild: (parentId: string) => void
  svgRef: React.RefObject<SVGSVGElement>
  zoom?: number
}

export function Node({ node, isSelected, onSelect, onDragEnd, onDoubleClick, onAddChild, svgRef, zoom: _zoom }: NodeProps) {
  const bg = applyDepthBackground(node.color, node.depth)
  const border = darken(node.color, node.depth === 0 ? 0.1 : 0.15)
  const textColor = node.depth === 0 ? '#fff' : '#1e293b'
  const fontSize = node.depth === 0 ? 14 : 13

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
    const dx = pt.x - dragStart.current.x
    const dy = pt.y - dragStart.current.y
    useDiagramStore.getState().updateNode(node.id, {
      x: dragStart.current.nodeX + dx,
      y: dragStart.current.nodeY + dy,
      manuallyPositioned: true,
    })
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!dragStart.current) return
    const pt = getSVGPoint(e)
    if (pt) {
      const dx = pt.x - dragStart.current.x
      const dy = pt.y - dragStart.current.y
      onDragEnd(node.id, dx, dy)
    }
    dragStart.current = null
  }

  const truncated = node.title.length > 18 ? node.title.slice(0, 16) + '…' : node.title

  return (
    <g
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(node) }}
      style={{ cursor: 'grab', userSelect: 'none' }}
    >
      <rect
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        rx={node.depth === 0 ? 8 : 6}
        ry={node.depth === 0 ? 8 : 6}
        fill={bg}
        stroke={isSelected ? '#6366f1' : border}
        strokeWidth={isSelected ? 2.5 : node.depth === 0 ? 0 : 1.5}
        filter={isSelected ? 'drop-shadow(0 0 6px rgba(99,102,241,0.5))' : undefined}
      />
      <text
        x={node.x + node.width / 2}
        y={node.y + node.height / 2 + fontSize * 0.35}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={node.depth === 0 ? '600' : '500'}
        fill={textColor}
        style={{ pointerEvents: 'none' }}
      >
        {truncated}
      </text>
      {/* Add child button on hover — shown as a subtle + on right edge */}
      <circle
        cx={node.x + node.width + 10}
        cy={node.y + node.height / 2}
        r={9}
        fill="#6366f1"
        opacity={0}
        className="add-child-btn"
        onClick={(e) => { e.stopPropagation(); onAddChild(node.id) }}
        style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
      />
    </g>
  )
}
