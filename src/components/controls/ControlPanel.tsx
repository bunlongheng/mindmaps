import { useDiagramStore } from '../../store/diagramStore'
import { ROOT_COLORS } from '../../lib/color'
import type { DiagramType, LineStyle } from '../../types'
import { Share2, Download, Upload, RefreshCw, Plus, GitBranch, Network, Fish, TreePine, Menu } from 'lucide-react'
import { downloadJSON } from '../../lib/export/json'
import { encodeShareURL } from '../../lib/export/share'

const DIAGRAM_TYPES: { value: DiagramType; label: string; Icon: React.ElementType }[] = [
  { value: 'mindmap',         label: 'Mind Map',  Icon: Network   },
  { value: 'tree-vertical',   label: 'Tree ↓',    Icon: TreePine  },
  { value: 'tree-horizontal', label: 'Tree →',     Icon: GitBranch },
  { value: 'fishbone',        label: 'Fishbone',  Icon: Fish      },
]

const LINE_STYLES: { value: LineStyle; label: string; symbol: string }[] = [
  { value: 'curved',     label: 'Curved',     symbol: '⌒' },
  { value: 'straight',   label: 'Straight',   symbol: '—' },
  { value: 'orthogonal', label: 'Orthogonal', symbol: '⌐' },
]

interface ControlPanelProps {
  onAddNode: () => void
  onImport: () => void
  onShare: (url: string) => void
  onBack: () => void
}

const Sep = () => <div style={{ width: 1, height: 22, background: '#e2e8f0', flexShrink: 0 }} />

export function ControlPanel({ onAddNode, onImport, onShare, onBack }: ControlPanelProps) {
  const { diagramType, lineStyle, setDiagramType, setLineStyle, activeDiagram, rerunLayout, selectedNodeIds, updateNode } = useDiagramStore()
  const selectedNode = activeDiagram?.nodes.find(n => selectedNodeIds[0] === n.id)

  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.12s',
    background: 'transparent', color: '#64748b',
  }

  return (
    <div style={{
      position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
      zIndex: 20, display: 'flex', alignItems: 'center', gap: 4,
      background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      padding: '5px 10px', userSelect: 'none',
    }}>

      {/* Back to home */}
      <button onClick={onBack} title="All maps"
        style={{ ...btnBase, padding: '5px 8px', marginRight: 2 }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
        <Menu size={16} />
      </button>

      <Sep />

      {/* Diagram types */}
      <div style={{ display: 'flex', gap: 2 }}>
        {DIAGRAM_TYPES.map(({ value, label, Icon }) => {
          const active = diagramType === value
          return (
            <button key={value} onClick={() => setDiagramType(value)} title={label}
              style={{ ...btnBase, fontWeight: active ? 600 : 500, background: active ? '#6366f1' : 'transparent', color: active ? '#fff' : '#64748b' }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9' }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
              <Icon size={13} />{label}
            </button>
          )
        })}
      </div>

      <Sep />

      {/* Line styles */}
      <div style={{ display: 'flex', gap: 2 }}>
        {LINE_STYLES.map(({ value, label, symbol }) => {
          const active = lineStyle === value
          return (
            <button key={value} onClick={() => setLineStyle(value)} title={label}
              style={{ ...btnBase, background: active ? '#f0f0ff' : 'transparent', color: active ? '#6366f1' : '#64748b', fontWeight: active ? 600 : 500 }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9' }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
              <span style={{ fontSize: 14 }}>{symbol}</span>{label}
            </button>
          )
        })}
      </div>

      {/* Color swatches for selected node */}
      {selectedNode && (
        <>
          <Sep />
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '0 2px' }}>
            {ROOT_COLORS.map(c => (
              <button key={c} onClick={() => updateNode(selectedNode.id, { color: c })} title={c}
                style={{
                  width: 18, height: 18, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: c, flexShrink: 0, transition: 'all 0.12s',
                  boxShadow: selectedNode.color === c ? `0 0 0 2px #fff, 0 0 0 3.5px ${c}` : '0 1px 3px rgba(0,0,0,0.2)',
                  transform: selectedNode.color === c ? 'scale(1.2)' : 'scale(1)',
                }} />
            ))}
          </div>
        </>
      )}

      <Sep />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 2 }}>
        {[
          { icon: <Plus size={15}/>, title: 'Add node (Tab)', onClick: onAddNode },
          { icon: <RefreshCw size={14}/>, title: 'Re-run layout', onClick: rerunLayout },
          { icon: <Download size={14}/>, title: 'Export JSON', onClick: () => activeDiagram && downloadJSON(activeDiagram) },
          { icon: <Upload size={14}/>, title: 'Import JSON', onClick: onImport },
          { icon: <Share2 size={14}/>, title: 'Share link', onClick: () => activeDiagram && onShare(encodeShareURL(activeDiagram)) },
        ].map((btn, i) => (
          <button key={i} onClick={btn.onClick} title={btn.title}
            style={{ ...btnBase, width: 30, height: 30, padding: 0, justifyContent: 'center' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f1f5f9' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}>
            {btn.icon}
          </button>
        ))}
      </div>
    </div>
  )
}
