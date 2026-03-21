import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { MindmapsLogo } from '../MindmapsLogo'

export function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setLoading(true)
    setError(null)

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })
      setLoading(false)
      if (error) { setError(error.message); return }
      // If no session yet, email confirmation is required
      if (!data.session) { setConfirm(true); return }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) { setError(error.message); return }
    }
  }

  const BG = '#eef0f5'

  if (confirm) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: '44px 40px', boxShadow: '0 4px 40px rgba(0,0,0,0.08)', width: 360, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>📬</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>Check your email</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 24px', lineHeight: 1.6 }}>
            We sent a confirmation link to <strong>{email}</strong>.<br />
            Click it to activate your account, then sign in.
          </p>
          <button onClick={() => { setConfirm(false); setMode('signin') }}
            style={{ fontSize: 13, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '44px 40px', boxShadow: '0 4px 40px rgba(0,0,0,0.08)', width: 360 }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <MindmapsLogo size={44} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '12px 0 4px', letterSpacing: '-0.02em' }}>Mindmaps</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
            {mode === 'signin' ? 'Sign in to your account' : 'Create an account'}
          </p>
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
            {loading ? (mode === 'signin' ? 'Signing in…' : 'Creating account…') : (mode === 'signin' ? 'Sign in' : 'Create account')}
          </button>
        </form>

        {/* Toggle mode */}
        <p style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8', marginTop: 20, marginBottom: 0 }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}
            style={{ color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: 0 }}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
