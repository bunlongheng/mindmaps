import { useEffect, useRef } from 'react'

const COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444',
  '#f97316','#eab308','#22c55e','#14b8a6',
  '#3b82f6','#06b6d4','#84cc16','#fff',
]

interface Flake {
  x: number; y: number
  vx: number; vy: number
  size: number; color: string
  rot: number; rotSpd: number
  shape: 'circle' | 'rect' | 'tri'
  opacity: number
}

export function Confetti({ onDone }: { onDone?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const delay = setTimeout(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')!
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight

      const N = 160
      const flakes: Flake[] = Array.from({ length: N }, (_, i) => ({
        x: (i / N) * canvas.width + (Math.random() - 0.5) * 80,
        y: -10 - Math.random() * 60,
        vx: (Math.random() - 0.5) * 2.5,
        vy: 4 + Math.random() * 5,
        size: 6 + Math.random() * 10,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rot: Math.random() * Math.PI * 2,
        rotSpd: (Math.random() - 0.5) * 0.18,
        shape: (['circle','rect','tri'] as const)[Math.floor(Math.random() * 3)],
        opacity: 1,
      }))

      const start = performance.now()
      const DURATION = 1500
      let raf = 0

      function draw(now: number) {
        const elapsed = now - start
        const prog = elapsed / DURATION
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        for (const f of flakes) {
          f.x += f.vx
          f.y += f.vy
          f.rot += f.rotSpd
          // Snow: particles fall straight, slight drift
          f.vx += (Math.random() - 0.5) * 0.06

          // Fade out in last 35%
          f.opacity = prog > 0.65 ? Math.max(0, 1 - (prog - 0.65) / 0.35) : 1

          ctx.save()
          ctx.globalAlpha = f.opacity
          ctx.translate(f.x, f.y)
          ctx.rotate(f.rot)
          ctx.fillStyle = f.color

          if (f.shape === 'circle') {
            ctx.beginPath()
            ctx.arc(0, 0, f.size / 2, 0, Math.PI * 2)
            ctx.fill()
          } else if (f.shape === 'rect') {
            ctx.fillRect(-f.size / 2, -f.size / 4, f.size, f.size / 2)
          } else {
            ctx.beginPath()
            ctx.moveTo(0, -f.size / 2)
            ctx.lineTo(f.size / 2, f.size / 2)
            ctx.lineTo(-f.size / 2, f.size / 2)
            ctx.closePath()
            ctx.fill()
          }
          ctx.restore()
        }

        if (elapsed < DURATION) {
          raf = requestAnimationFrame(draw)
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          onDone?.()
        }
      }

      raf = requestAnimationFrame(draw)
      return () => cancelAnimationFrame(raf)
    }, 400)

    return () => clearTimeout(delay)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        pointerEvents: 'none', width: '100%', height: '100%',
      }}
    />
  )
}
