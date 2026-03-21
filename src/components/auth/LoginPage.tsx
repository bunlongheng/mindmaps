import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { MindmapsLogo } from '../MindmapsLogo'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
  }

  const BG = '#eef0f5'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '44px 40px', boxShadow: '0 4px 40px rgba(0,0,0,0.08)', width: 360 }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <MindmapsLogo size={44} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '12px 0 4px', letterSpacing: '-0.02em' }}>Mindmaps</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            required
            autoFocus
            style={{
              padding: '10px 14px', fontSize: 14, borderRadius: 10,
              border: '1px solid #e2e8f0', outline: 'none', fontFamily: 'inherit',
              color: '#1e293b', background: '#f8fafc', boxSizing: 'border-box', width: '100%',
            }}
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={6}
            style={{
              padding: '10px 14px', fontSize: 14, borderRadius: 10,
              border: '1px solid #e2e8f0', outline: 'none', fontFamily: 'inherit',
              color: '#1e293b', background: '#f8fafc', boxSizing: 'border-box', width: '100%',
            }}
          />

          {error && (
            <p style={{ fontSize: 12, color: '#ef4444', margin: '0', textAlign: 'center' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4, padding: '11px 16px', borderRadius: 10, border: 'none',
              background: loading ? '#a5b4fc' : '#6366f1', color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
              fontFamily: 'inherit', transition: 'background 0.15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

      </div>
    </div>
  )
}
