import { useState, useRef } from 'react'
import { importFromJSON } from '../../lib/export/json'
import { useMindmapStore } from '../../store/mindmapStore'
import { X, Upload } from 'lucide-react'

interface ImportModalProps { onClose: () => void }

export function ImportModal({ onClose }: ImportModalProps) {
  const [error, setError] = useState('')
  const { setActiveMindmap } = useMindmapStore()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const diagram = importFromJSON(text)
      if (!diagram) { setError('Invalid diagram file'); return }
      setActiveMindmap(diagram)
      onClose()
    }
    reader.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">Import JSON</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-300 transition-colors">
          <Upload size={24} className="text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Drop a .json file here or click to browse</p>
        </div>
        <input ref={inputRef} type="file" accept=".json" className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      </div>
    </div>
  )
}
