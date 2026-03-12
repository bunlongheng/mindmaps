import { useRef, useState, useCallback } from 'react'
import { useDiagramStore } from '../../store/diagramStore'
import { EdgeLayer } from './EdgeLayer'
import { Node } from './Node'
import { useKeyboard } from '../../hooks/useKeyboard'
import type { MindNode } from '../../types'

interface DiagramCanvasProps {
  onEditNode: (nodeId: string) => void
}

export function DiagramCanvas({ onEditNode }: DiagramCanvasProps) {
  const { activeDiagram, selectedNodeIds, setSelectedNodeIds, diagramType, lineStyle, addNode } = useDiagramStore()
  const svgRef = useRef<SVGSVGElement>(null!)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  useKeyboard()

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(z => Math.min(3, Math.max(0.2, z * delta)))
  }, [])

  const handleBgPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && (e.target as Element).tagName !== 'svg') return
    setSelectedNodeIds([])
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }, [pan, setSelectedNodeIds])

  const handleBgPointerMove = useCallback((e: React.PointerEvent) => {
    if (!panStart.current) return
    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y
    setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy })
  }, [])

  const handleBgPointerUp = useCallback(() => { panStart.current = null }, [])

  const handleSelect = useCallback((id: string, multi: boolean) => {
    if (multi) {
      setSelectedNodeIds(
        selectedNodeIds.includes(id)
          ? selectedNodeIds.filter(n => n !== id)
          : [...selectedNodeIds, id]
      )
    } else {
      setSelectedNodeIds([id])
    }
  }, [selectedNodeIds, setSelectedNodeIds])

  const handleDragEnd = useCallback((_id: string, _dx: number, _dy: number) => {
    // drag already applied via updateNode in Node component
  }, [])

  const handleDoubleClick = useCallback((node: MindNode) => {
    onEditNode(node.id)
  }, [onEditNode])

  const handleAddChild = useCallback((parentId: string) => {
    addNode(parentId)
  }, [addNode])

  if (!activeDiagram) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-400">
          <div className="text-6xl mb-4">🗺️</div>
          <p className="text-lg font-medium">Select or create a diagram</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden relative" style={{ background: '#f8fafc' }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ cursor: panStart.current ? 'grabbing' : 'default' }}
        onWheel={handleWheel}
        onPointerDown={handleBgPointerDown}
        onPointerMove={handleBgPointerMove}
        onPointerUp={handleBgPointerUp}
      >
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          <EdgeLayer nodes={activeDiagram.nodes} lineStyle={lineStyle} diagramType={diagramType} />
          {activeDiagram.nodes.map(node => (
            <Node
              key={node.id}
              node={node}
              isSelected={selectedNodeIds.includes(node.id)}
              onSelect={handleSelect}
              onDragEnd={handleDragEnd}
              onDoubleClick={handleDoubleClick}
              onAddChild={handleAddChild}
              svgRef={svgRef}
              zoom={zoom}
            />
          ))}
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button onClick={() => setZoom(z => Math.min(3, z * 1.2))}
          className="w-8 h-8 bg-white border border-slate-200 rounded shadow text-slate-600 hover:bg-slate-50 text-lg font-bold flex items-center justify-center">+</button>
        <button onClick={() => setZoom(1)}
          className="w-8 h-8 bg-white border border-slate-200 rounded shadow text-slate-500 text-xs flex items-center justify-center font-medium">
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => setZoom(z => Math.max(0.2, z * 0.8))}
          className="w-8 h-8 bg-white border border-slate-200 rounded shadow text-slate-600 hover:bg-slate-50 text-lg font-bold flex items-center justify-center">−</button>
      </div>
    </div>
  )
}
