import { useState } from 'react'
import { useDiagramStore } from '../../store/diagramStore'
import { useDiagram } from '../../hooks/useDiagram'
import { Plus, Trash2, Map } from 'lucide-react'
import type { DiagramMeta } from '../../types'

interface DiagramSidebarProps {
  onSave: () => void
}

export function DiagramSidebar({ onSave }: DiagramSidebarProps) {
  const { diagrams, activeDiagram, isDirty } = useDiagramStore()
  const { loadDiagram, createDiagram, deleteDiagram } = useDiagram()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    const name = newName.trim() || 'Untitled'
    setCreating(true)
    await createDiagram(name)
    setNewName('')
    setCreating(false)
  }

  return (
    <aside className="w-56 bg-white border-r border-slate-200 flex flex-col h-full">
      <div className="p-3 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Map size={14} className="text-white" />
          </div>
          <span className="font-semibold text-slate-800 text-sm">MindMap</span>
        </div>
        <div className="flex gap-1">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="New diagram..."
            className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button onClick={handleCreate} disabled={creating}
            className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {diagrams.length === 0 && (
          <p className="text-xs text-slate-400 text-center mt-4">No diagrams yet</p>
        )}
        {diagrams.map(d => (
          <DiagramItem
            key={d.id} diagram={d}
            isActive={activeDiagram?.id === d.id}
            isDirty={isDirty && activeDiagram?.id === d.id}
            onLoad={() => { if (isDirty) onSave(); loadDiagram(d.id) }}
            onDelete={() => deleteDiagram(d.id)}
          />
        ))}
      </div>

      {isDirty && (
        <div className="p-2 border-t border-slate-100">
          <button onClick={onSave}
            className="w-full py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors">
            Save changes
          </button>
        </div>
      )}
    </aside>
  )
}

function DiagramItem({ diagram, isActive, isDirty, onLoad, onDelete }: {
  diagram: DiagramMeta; isActive: boolean; isDirty: boolean
  onLoad: () => void; onDelete: () => void
}) {
  return (
    <div
      onClick={onLoad}
      className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors mb-0.5 ${
        isActive ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'
      }`}
    >
      <Map size={13} className={isActive ? 'text-indigo-500' : 'text-slate-400'} />
      <span className="flex-1 text-xs font-medium truncate">{diagram.name}{isDirty ? ' *' : ''}</span>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 hover:text-red-500 transition-all">
        <Trash2 size={12} />
      </button>
    </div>
  )
}
