import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signInWithGoogle() {
    if (!supabase) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/' },
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8f9fb', fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '44px 40px',
        boxShadow: '0 4px 40px rgba(0,0,0,0.08)', width: 360,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
      }}>
        {/* Logo */}
        <div style={{
          width: 52, height: 52, borderRadius: 14, background: '#6366f1',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20,
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" fill="#fff" />
            <line x1="12" y1="12" x2="20" y2="7"  stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="12" x2="4"  y2="7"  stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="12" x2="12" y2="3"  stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="12" x2="20" y2="17" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="12" x2="4"  y2="17" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="12" x2="12" y2="21" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
          Ideas
        </h1>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 32px', textAlign: 'center' }}>
          Sign in to access your maps
        </p>

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '11px 16px', borderRadius: 10, cursor: loading ? 'wait' : 'pointer',
            border: '1px solid #e2e8f0', background: loading ? '#f8f9fb' : '#fff',
            fontSize: 14, fontWeight: 600, color: '#1e293b', fontFamily: 'inherit',
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#f8f9fb' }}
          onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#fff' }}
        >
          {/* Google logo */}
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
          </svg>
          {loading ? 'Signing in…' : 'Continue with Google'}
        </button>

        {error && (
          <p style={{ fontSize: 12, color: '#ef4444', marginTop: 16, textAlign: 'center' }}>{error}</p>
        )}
      </div>
    </div>
  )
}
