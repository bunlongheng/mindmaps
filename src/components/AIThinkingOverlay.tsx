import { useEffect, useRef, useState } from 'react'

const AI_WORDS = [
  'tokens','context','embedding','inference','neural','attention',
  'transformer','gradient','weight','latent','vector','semantic',
  'entropy','logit','softmax','decode','encode','tensor','backprop',
  'synapse','neuron','pattern','classify','predict','generate',
  'reason','analyze','parse','query','memory','chain','cluster',
  'feature','kernel','dropout','sigmoid','relu','normalize','sample',
  'prompt','stream','output','input','layer','epoch','batch','loss',
  'node','graph','recursion',
]

const VIVID_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444',
  '#f97316','#eab308','#22c55e','#14b8a6',
  '#3b82f6','#06b6d4','#84cc16','#f43f5e',
]

const PHRASES = [
  'Thinking…','Tokenizing…','Building graph…','Reasoning…',
  'Encoding…','Mapping flow…','Inferring…','Generating…',
  'Assembling…','Almost there…',
]

const RAND_CHARS = '01ABCDEFxyz!@#[]{}|<>?/*+-=~'

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

interface Particle {
  x: number; y: number; vx: number; vy: number
  text: string; color: string; size: number
  opacity: number; flipIn: number; isWord: boolean
}

function makeParticle(w: number, h: number): Particle {
  const isWord = Math.random() < 0.35
  const angle = Math.random() * Math.PI * 2
  const spd = 0.25 + Math.random() * 0.6
  return {
    x: Math.random() * w, y: Math.random() * h,
    vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd,
    text: isWord ? pick(AI_WORDS) : pick(RAND_CHARS),
    color: pick(VIVID_COLORS),
    size: isWord ? 10 + Math.random() * 5 : 8 + Math.random() * 5,
    opacity: 0.25 + Math.random() * 0.6,
    flipIn: 0.6 + Math.random() * 1.4,
    isWord,
  }
}

export function AIThinkingOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const [phraseIdx, setPhraseIdx] = useState(0)

  // Rotate phrase every 1.3s
  useEffect(() => {
    const t = setInterval(() => setPhraseIdx(i => (i + 1) % PHRASES.length), 1300)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    function resize() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const particles: Particle[] = Array.from({ length: 140 }, () =>
      makeParticle(canvas.width, canvas.height)
    )

    let last = performance.now()

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const W = canvas.width, H = canvas.height
      const cx = W / 2, cy = H / 2
      const t = now / 1000
      const orbR = 75 + 18 * Math.sin(t * Math.PI)

      ctx.clearRect(0, 0, W, H)

      // ── Orb glow ─────────────────────────────────────────────────
      const outer = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbR * 2.2)
      outer.addColorStop(0,   'rgba(120,100,255,0.0)')
      outer.addColorStop(0.3, 'rgba( 99,102,241,0.25)')
      outer.addColorStop(1,   'rgba( 99,102,241,0)')
      ctx.beginPath(); ctx.arc(cx, cy, orbR * 2.2, 0, Math.PI * 2)
      ctx.fillStyle = outer; ctx.fill()

      const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbR)
      inner.addColorStop(0,   'rgba(200,195,255,0.98)')
      inner.addColorStop(0.45,'rgba( 99,102,241,0.88)')
      inner.addColorStop(1,   'rgba( 80, 60,200,0.45)')
      ctx.beginPath(); ctx.arc(cx, cy, orbR, 0, Math.PI * 2)
      ctx.fillStyle = inner; ctx.fill()

      // ── Particles ────────────────────────────────────────────────
      for (const p of particles) {
        // Flip timer
        p.flipIn -= dt
        if (p.flipIn <= 0) {
          p.isWord = Math.random() < 0.35
          p.text   = p.isWord ? pick(AI_WORDS) : pick(RAND_CHARS)
          p.color  = pick(VIVID_COLORS)
          p.flipIn = 0.6 + Math.random() * 1.4
          p.opacity = 0.25 + Math.random() * 0.6
        }

        // Repel from orb
        const dx = p.x - cx, dy = p.y - cy
        const dist = Math.hypot(dx, dy)
        const repelR = orbR + 28
        if (dist < repelR && dist > 0.5) {
          const f = ((repelR - dist) / repelR) * 2.4
          p.vx += (dx / dist) * f * dt * 12
          p.vy += (dy / dist) * f * dt * 12
        }

        // Damp + clamp
        p.vx *= 0.994; p.vy *= 0.994
        const spd = Math.hypot(p.vx, p.vy)
        if (spd > 1.4) { p.vx = p.vx / spd * 1.4; p.vy = p.vy / spd * 1.4 }
        if (spd < 0.15) { const a = Math.random() * Math.PI * 2; p.vx += Math.cos(a) * 0.18; p.vy += Math.sin(a) * 0.18 }

        p.x += p.vx; p.y += p.vy

        // Wrap
        if (p.x < -60) p.x = W + 60
        else if (p.x > W + 60) p.x = -60
        if (p.y < -60) p.y = H + 60
        else if (p.y > H + 60) p.y = -60

        // Skip inside orb
        if (dist < orbR + 2) continue

        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color
        ctx.font = `${p.isWord ? 'bold ' : ''}${p.size}px "JetBrains Mono",monospace`
        ctx.fillText(p.text, p.x, p.y)
      }

      ctx.globalAlpha = 1
      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(8,8,18,0.91)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Rotating phrase — remount on phraseIdx change triggers fade-in */}
      <div key={phraseIdx} style={{
        position: 'absolute', bottom: 64,
        left: '50%', transform: 'translateX(-50%)',
        color: '#a5b4fc', fontSize: 14, fontWeight: 500,
        fontFamily: 'Inter, system-ui, sans-serif',
        letterSpacing: '0.06em', whiteSpace: 'nowrap',
        animation: 'phraseIn 0.35s ease',
        zIndex: 1,
      }}>
        {PHRASES[phraseIdx]}
      </div>

      <style>{`
        @keyframes phraseIn {
          from { opacity: 0; transform: translateX(-50%) translateY(6px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  )
}
