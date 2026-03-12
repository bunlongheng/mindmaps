import { useDiagramStore } from '../../store/diagramStore'
import { ROOT_COLORS } from '../../lib/color'
import type { DiagramType, LineStyle } from '../../types'
import { Share2, Download, Upload, RefreshCw, Plus } from 'lucide-react'
import { downloadJSON } from '../../lib/export/json'
import { downloadUML } from '../../lib/export/uml'
import { encodeShareURL } from '../../lib/export/share'

const DIAGRAM_TYPES: { value: DiagramType; label: string }[] = [
  { value: 'mindmap', label: 'Mind Map' },
  { value: 'tree-vertical', label: 'Tree ↓' },
  { value: 'tree-horizontal', label: 'Tree →' },
  { value: 'fishbone', label: 'Fishbone' },
]

const LINE_STYLES: { value: LineStyle; label: string }[] = [
  { value: 'curved', label: '~~ Curved' },
  { value: 'straight', label: '⟵ Straight' },
  { value: 'orthogonal', label: '⌐ Orthogonal' },
]

interface ControlPanelProps {
  onAddNode: () => void
  onImport: () => void
  onShare: (url: string) => void
}

export function ControlPanel({ onAddNode, onImport, onShare }: ControlPanelProps) {
  const { diagramType, lineStyle, setDiagramType, setLineStyle, activeDiagram, rerunLayout, selectedNodeIds, updateNode } = useDiagramStore()

  const selectedNode = activeDiagram?.nodes.find(n => selectedNodeIds[0] === n.id)

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2">
      {/* Diagram Type */}
      <div className="flex gap-1 border-r border-slate-200 pr-2">
        {DIAGRAM_TYPES.map(dt => (
          <button key={dt.value}
            onClick={() => setDiagramType(dt.value)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              diagramType === dt.value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}>
            {dt.label}
          </button>
        ))}
      </div>

      {/* Line Style */}
      <div className="flex gap-1 border-r border-slate-200 pr-2">
        {LINE_STYLES.map(ls => (
          <button key={ls.value}
            onClick={() => setLineStyle(ls.value)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              lineStyle === ls.value ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
            }`}>
            {ls.label}
          </button>
        ))}
      </div>

      {/* Color picker for selected node */}
      {selectedNode && (
        <div className="flex gap-1 border-r border-slate-200 pr-2">
          {ROOT_COLORS.map(c => (
            <button key={c}
              onClick={() => updateNode(selectedNode.id, { color: c })}
              className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
              style={{ background: c, borderColor: selectedNode.color === c ? '#1e293b' : 'transparent' }}
            />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-1">
        <button onClick={onAddNode} title="Add node (Tab)"
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
          <Plus size={15} />
        </button>
        <button onClick={rerunLayout} title="Re-run layout"
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
          <RefreshCw size={15} />
        </button>
        <button onClick={() => activeDiagram && downloadJSON(activeDiagram)} title="Export JSON"
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
          <Download size={15} />
        </button>
        <button onClick={() => activeDiagram && downloadUML(activeDiagram)} title="Export PlantUML"
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors text-xs font-bold px-2">
          UML
        </button>
        <button onClick={onImport} title="Import JSON"
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
          <Upload size={15} />
        </button>
        <button onClick={() => activeDiagram && onShare(encodeShareURL(activeDiagram))} title="Share link"
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors">
          <Share2 size={15} />
        </button>
      </div>
    </div>
  )
}
