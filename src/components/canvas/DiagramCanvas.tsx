import { useRef, useState, useCallback } from 'react'
import { useDiagramStore } from '../../store/diagramStore'
import { EdgeLayer } from './EdgeLayer'
import { Node } from './Node'
import { useKeyboard } from '../../hooks/useKeyboard'
interface DiagramCanvasProps {
  onNodeSelect: (nodeId: string | null) => void
}

export function DiagramCanvas({ onNodeSelect }: DiagramCanvasProps) {
  const { activeDiagram, selectedNodeIds, setSelectedNodeIds, diagramType, lineStyle, addNode } = useDiagramStore()
  const svgRef = useRef<SVGSVGElement>(null!)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  useKeyboard()

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom(z => Math.min(3, Math.max(0.2, z * (e.deltaY > 0 ? 0.9 : 1.1))))
  }, [])

  const handleBgPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && (e.target as Element).tagName !== 'svg') return
    setSelectedNodeIds([])
    onNodeSelect(null)
    setIsPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }, [pan, setSelectedNodeIds, onNodeSelect])

  const handleBgPointerMove = useCallback((e: React.PointerEvent) => {
    if (!panStart.current) return
    setPan({ x: panStart.current.panX + (e.clientX - panStart.current.x), y: panStart.current.panY + (e.clientY - panStart.current.y) })
  }, [])

  const handleBgPointerUp = useCallback(() => { panStart.current = null; setIsPanning(false) }, [])

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
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', boxShadow: '0 8px 32px rgba(99,102,241,0.25)',
          }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="5" fill="white" opacity="0.9"/>
              <line x1="16" y1="11" x2="16" y2="4" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
              <line x1="16" y1="21" x2="16" y2="28" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
              <line x1="11" y1="16" x2="4" y2="16" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
              <line x1="21" y1="16" x2="28" y2="16" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
              <circle cx="16" cy="4" r="2.5" fill="white" opacity="0.6"/>
              <circle cx="16" cy="28" r="2.5" fill="white" opacity="0.6"/>
              <circle cx="4" cy="16" r="2.5" fill="white" opacity="0.6"/>
              <circle cx="28" cy="16" r="2.5" fill="white" opacity="0.6"/>
            </svg>
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Open a map to start</p>
          <p style={{ fontSize: 13, color: '#94a3b8' }}>Click ≡ to go back to your maps</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#ffffff', cursor: isPanning ? 'grabbing' : 'default' }}>
      <svg ref={svgRef} width="100%" height="100%"
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
              onDragEnd={() => {}}
              onDoubleClick={n => { setSelectedNodeIds([n.id]); onNodeSelect(n.id) }}
              onAddChild={id => addNode(id)}
              svgRef={svgRef}
            />
          ))}
        </g>
      </svg>

      {/* Zoom pill */}
      <div style={{
        position: 'absolute', bottom: 20, right: 20,
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {[
          { label: '+', onClick: () => setZoom(z => Math.min(3, z * 1.2)) },
          { label: `${Math.round(zoom * 100)}%`, onClick: () => setZoom(1), small: true },
          { label: '−', onClick: () => setZoom(z => Math.max(0.2, z * 0.8)) },
        ].map((btn, i) => (
          <button key={i} onClick={btn.onClick}
            style={{
              width: 36, height: (btn as { small?: boolean }).small ? 30 : 36, border: 'none',
              borderBottom: i < 2 ? '1px solid #f1f5f9' : 'none',
              background: 'transparent', cursor: 'pointer', color: '#64748b',
              fontSize: (btn as { small?: boolean }).small ? 10 : 18, fontWeight: (btn as { small?: boolean }).small ? 600 : 400,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Keyboard hints */}
      <div style={{
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 14, alignItems: 'center',
        background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)',
        border: '1px solid #f1f5f9', borderRadius: 20, padding: '5px 16px',
        fontSize: 11, color: '#94a3b8',
      }}>
        {[['Tab', 'Add child'], ['Double-click', 'Edit'], ['Del', 'Delete'], ['⌘Z', 'Undo']].map(([key, action]) => (
          <span key={key}><kbd style={{ fontFamily: 'monospace', color: '#475569', fontWeight: 600 }}>{key}</kbd> {action}</span>
        ))}
      </div>
    </div>
  )
}
