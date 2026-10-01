import { useEffect, useState } from 'react'
import { DiagramMinimap } from '../home/HomePage'
import { Wordmark } from '../viewer/ViewerPage'
import { SocialFooter } from '../viewer/SocialFooter'

type DemoRow = { id: string; name: string; type: string; updated_at: string; tags?: string[] }

// The public showcase at /demo, mirroring the Sequences demo wall: no sign-in,
// a wordmark, 1 hero line, and a grid of the shared maps tagged `demo`. Each card
// opens the read-only viewer, which is public for shared maps.
export function DemoWall() {
  const [rows, setRows] = useState<DemoRow[] | null>(null)

  useEffect(() => {
    const prev = document.title
    document.title = 'Demos · Mindmaps'
    fetch('/api/mindmaps?scope=demo')
      .then(r => (r.ok ? r.json() : []))
      .then((list: DemoRow[]) => setRows(list))
      .catch(() => setRows([]))
    return () => { document.title = prev }
  }, [])

  return (
    <main style={{ minHeight: '100dvh', background: '#eceef2', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .dw-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
        @media (max-width:1100px){.dw-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media (max-width:760px){.dw-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media (max-width:460px){.dw-grid{grid-template-columns:1fr}}
        .dw-card{display:block;text-decoration:none;color:inherit;background:#fff;border:1px solid #e6e8ee;border-radius:14px;overflow:hidden;
          box-shadow:0 1px 2px rgba(15,23,42,.04);transition:transform .14s,box-shadow .14s,border-color .14s;
          opacity:0;transform:translateY(8px);animation:dw-in .36s ease-out forwards}
        .dw-card:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(15,23,42,.10);border-color:#cbd0dc}
        @keyframes dw-in{to{opacity:1;transform:none}}
      `}</style>

      <header style={{ height: 56, background: '#fff', borderBottom: '1px solid #e6e8ee', display: 'flex', alignItems: 'center', padding: '0 20px', position: 'sticky', top: 0, zIndex: 10 }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Wordmark size={28} />
        </a>
      </header>

      <section style={{ textAlign: 'center', padding: '56px 20px 36px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(30px, 4.6vw, 46px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, color: '#111827' }}>
          Mindmaps, <span style={{ color: '#7c3aed' }}>mapped</span> out in the open.
        </h1>
        <p style={{ margin: '14px auto 0', maxWidth: 560, fontSize: 16, lineHeight: 1.55, color: '#64748b' }}>
          A dozen maps you can open and poke at, no account needed. All of them were made with the editor you get after signing in.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#5b21b6', background: '#ede9fe', border: '1px solid #ddd6fe', borderRadius: 999, padding: '6px 12px' }}>
            {rows ? `${rows.length} demo${rows.length === 1 ? '' : 's'}` : 'Loading'}
          </span>
          <a href="/" style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid #e6e8ee', borderRadius: 999, padding: '6px 12px', textDecoration: 'none' }}>
            Make your own
          </a>
        </div>
      </section>

      <section style={{ flex: 1, width: '100%', maxWidth: 1240, margin: '0 auto', padding: '0 20px 40px', boxSizing: 'border-box' }}>
        {rows && rows.length === 0 && (
          <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>No demos are shared yet.</p>
        )}
        <div className="dw-grid">
          {(rows ?? []).map((d, i) => (
            <a key={d.id} className="dw-card" href={`/?share=${d.id}`} data-demo-id={d.id} style={{ animationDelay: `${Math.min(i, 11) * 45}ms` }}>
              <div style={{ aspectRatio: '4 / 3', background: '#f8f9fb', borderBottom: '1px solid #eef0f4' }}>
                <DiagramMinimap id={d.id} name={d.name} type={d.type} updatedAt={d.updated_at} eager={i < 8} />
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
              </div>
            </a>
          ))}
        </div>
      </section>

      <div style={{ padding: '0 20px 24px' }}>
        <SocialFooter />
      </div>
    </main>
  )
}
