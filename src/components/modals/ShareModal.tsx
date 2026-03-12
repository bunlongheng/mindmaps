import { useState } from 'react'
import { X, Copy, Check } from 'lucide-react'

interface ShareModalProps { url: string; onClose: () => void }

export function ShareModal({ url, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-5 w-96" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">Share Diagram</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X size={16} /></button>
        </div>
        <p className="text-xs text-slate-500 mb-3">The full diagram is encoded in this URL — no login required to view.</p>
        <div className="flex gap-2">
          <input readOnly value={url}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-xs bg-slate-50 text-slate-600 truncate focus:outline-none" />
          <button onClick={copy}
            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
        {url.length > 50000 && (
          <p className="text-amber-600 text-xs mt-2">Warning: URL is very long. Consider saving to Supabase for sharing large diagrams.</p>
        )}
      </div>
    </div>
  )
}
