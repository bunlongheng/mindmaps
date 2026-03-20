import { useState, useEffect } from 'react'
import { useMindmapStore } from '../../store/mindmapStore'
import { ROOT_COLORS } from '../../lib/color'
import { X } from 'lucide-react'

interface NodeEditModalProps {
  nodeId: string | null
  onClose: () => void
}

export function NodeEditModal({ nodeId, onClose }: NodeEditModalProps) {
  const { activeMindmap, updateNode, addNode } = useMindmapStore()
  const node = nodeId ? activeMindmap?.nodes.find(n => n.id === nodeId) : null
  const [title, setTitle] = useState('')
  const [color, setColor] = useState('#6366f1')

  useEffect(() => {
    if (node) { setTitle(node.title); setColor(node.color) }
  }, [node])

  if (!node) return null

  function handleSave() {
    updateNode(node!.id, { title, color })
    onClose()
  }

  function handleAddChild() {
    addNode(node!.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">Edit Node</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="mb-4">
          <label className="text-xs font-medium text-slate-500 mb-1 block">Title</label>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div className="mb-5">
          <label className="text-xs font-medium text-slate-500 mb-2 block">Color</label>
          <div className="flex flex-wrap gap-2">
            {ROOT_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                style={{ background: c, borderColor: color === c ? '#1e293b' : 'transparent' }} />
            ))}
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="w-7 h-7 rounded-full cursor-pointer border border-slate-200" />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={handleAddChild}
            className="flex-1 py-2 border border-indigo-200 text-indigo-700 text-sm font-medium rounded-lg hover:bg-indigo-50 transition-colors">
            + Add Child
          </button>
          <button onClick={handleSave}
            className="flex-1 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
