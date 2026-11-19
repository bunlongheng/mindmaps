import { useState } from 'react'
import { Braces, CornerDownRight, List, Plus, RectangleHorizontal, StickyNote, Type } from 'lucide-react'
import { useMindmapStore } from '../../store/mindmapStore'
import { showToast } from '../CuteToast'
import type { LegendItem, MapFloat, MindmapNode } from '../../types'

type ToCanvas = (screenX: number, screenY: number) => { x: number; y: number }

const NOTE_W = 220
const NOTE_H = 150
const GAP = 12
// Text labels are big italic serif, like a quote written on the board
const SCRIBBLE_FONT = "'Source Serif 4', Georgia, serif"
const SCRIBBLE_SIZE = 64

const floatSize = (f: Pick<MapFloat, 'kind' | 'text'>) =>
  f.kind === 'note' ? { w: NOTE_W, h: NOTE_H } : { w: Math.min(1600, Math.max(140, f.text.length * 32 + 60)), h: 100 }

type Box = { id: string; x: number; y: number; width: number; height: number }

// Topics, notes and text are all things a new or moved item must not cover
function obstacles(nodes: MindmapNode[], floats: MapFloat[], skipId?: string): Box[] {
  return [...nodes, ...floats.filter(f => f.kind !== 'summary' && f.id !== skipId)
    .map(f => ({ id: f.id, x: f.x, y: f.y, width: floatSize(f).w, height: floatSize(f).h }))]
}

// Boxes a box at (x, y) would cover, with a small gap so it never touches one
function nodesUnder(x: number, y: number, w: number, h: number, nodes: Box[]) {
  return nodes.filter(n => x < n.x + n.width + GAP && x + w > n.x - GAP && y < n.y + n.height + GAP && y + h > n.y - GAP)
}

// The nearest spot to (x, y) where the box covers no topic, searched outward in rings
function freeSpot(x: number, y: number, w: number, h: number, nodes: Box[]) {
  if (!nodesUnder(x, y, w, h, nodes).length) return { x, y }
  for (let r = 1; r <= 120; r++) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      const cx = x + Math.cos(a) * r * 20
      const cy = y + Math.sin(a) * r * 20
      if (!nodesUnder(cx, cy, w, h, nodes).length) return { x: cx, y: cy }
    }
  }
  return { x, y }
}

function rootOf() {
  const m = useMindmapStore.getState().activeMindmap
  return m?.nodes.find(n => n.parentId === null)
}

function saveFloats(floats: MapFloat[]) {
  const root = rootOf()
  if (root) useMindmapStore.getState().updateNode(root.id, { floats })
}

// Sticky notes and text labels on the canvas. They live on the root node, so every
// save and share link carries them; drawn inside the zoomed group so they move with the map.
export function FloatItems({ toCanvas, readOnly, nodes }: { toCanvas: ToCanvas; readOnly?: boolean; nodes: MindmapNode[] }) {
  const floats = useMindmapStore(s => s.activeMindmap?.nodes.find(n => n.parentId === null)?.floats)
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; x: number; y: number } | null>(null)
  const edges = summaryEdges(floats ?? [], nodes)
  const [hover, setHover] = useState<string | null>(null)
  if (!floats?.length) return null

  const update = (id: string, patch: Partial<MapFloat>) => {
    const all = rootOf()?.floats ?? []
    saveFloats(all.map(f => {
      if (f.id !== id) return f
      const next = { ...f, ...patch }
      // Longer text makes a wider box: move it off anything it now covers
      if (patch.text === undefined || f.kind === 'summary') return next
      const { w, h } = floatSize(next)
      return { ...next, ...freeSpot(next.x, next.y, w, h, obstacles(nodes, all, id)) }
    }))
  }
  const remove = (id: string) => saveFloats((rootOf()?.floats ?? []).filter(f => f.id !== id))

  function startDrag(e: React.PointerEvent, f: MapFloat) {
    if (readOnly) return
    // Keep the press off the canvas so it does not pan or start a selection box
    e.stopPropagation()
    if ((e.target as HTMLElement).closest('textarea, input, button')) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = toCanvas(e.clientX, e.clientY)
    setDrag({ id: f.id, dx: p.x - f.x, dy: p.y - f.y, x: f.x, y: f.y })
  }
  function moveDrag(e: React.PointerEvent) {
    if (!drag) return
    const p = toCanvas(e.clientX, e.clientY)
    setDrag({ ...drag, x: p.x - drag.dx, y: p.y - drag.dy })
  }
  function endDrag() {
    if (!drag) return
    const f = floats?.find(v => v.id === drag.id)
    const { w, h } = f ? floatSize(f) : { w: 0, h: 0 }
    // Dropped on a topic: slide to the nearest free spot instead of covering it
    update(drag.id, freeSpot(drag.x, drag.y, w, h, obstacles(nodes, floats ?? [], drag.id)))
    setDrag(null)
  }

  // While dragging over topics, mark them in red so the drop is not a surprise
  const dragged = drag && floats.find(f => f.id === drag.id)
  const blocked = dragged ? nodesUnder(drag.x, drag.y, floatSize(dragged).w, floatSize(dragged).h, obstacles(nodes, floats, dragged.id)) : []

  return (
    <g data-testid="float-layer">
      {blocked.map(n => (
        <rect key={n.id} data-testid="drop-blocked" x={n.x - GAP} y={n.y - GAP} width={n.width + GAP * 2} height={n.height + GAP * 2}
          rx={10} fill="rgba(239,68,68,0.12)" stroke="#ef4444" strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" />
      ))}
      {floats.map(f => {
        if (f.kind === 'summary') return (
          <SummaryBrace key={f.id} f={f} nodes={nodes} edge={edges.get(f.id)} readOnly={readOnly} hovered={hover === f.id}
            onHover={on => setHover(h => (on ? f.id : h === f.id ? null : h))}
            onText={text => update(f.id, { text })} onNote={note => update(f.id, { note })} onBranches={branches => update(f.id, { branches })} onRemove={() => remove(f.id)} />
        )
        const x = drag?.id === f.id ? drag.x : f.x
        const y = drag?.id === f.id ? drag.y : f.y
        const isNote = f.kind === 'note'
        const { w, h } = floatSize(f)
        const showX = !readOnly && hover === f.id
        return (
          <g key={f.id} data-testid={`float-${f.kind}`}
            onMouseEnter={() => setHover(f.id)} onMouseLeave={() => setHover(h => (h === f.id ? null : h))}>
          <foreignObject x={x} y={y} width={w} height={h} style={{ overflow: 'visible' }}>
            <div
              onPointerDown={e => startDrag(e, f)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{
                width: '100%', height: '100%', boxSizing: 'border-box',
                cursor: readOnly ? 'default' : drag?.id === f.id ? 'grabbing' : 'grab',
                fontFamily: 'Inter, system-ui, sans-serif',
                // Blue like a selected node while it moves, a faint blue on hover so it reads as grabbable
                outline: drag?.id === f.id ? `3px solid ${blocked.length ? '#ef4444' : '#3b82f6'}` : showX ? '2px solid rgba(59,130,246,0.45)' : 'none',
                outlineOffset: 3,
                ...(isNote ? {
                  background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6,
                  boxShadow: '0 6px 18px rgba(0,0,0,0.12)', padding: '22px 12px 10px',
                } : { padding: '4px 6px', borderRadius: 4 }),
              }}
            >
              {readOnly ? (
                <div style={{
                  whiteSpace: 'pre-wrap', overflow: 'hidden', height: '100%',
                  color: isNote ? '#422006' : '#0f172a', fontSize: isNote ? 15 : SCRIBBLE_SIZE, fontWeight: 400,
                  ...(isNote ? {} : { fontFamily: SCRIBBLE_FONT, fontStyle: 'italic', lineHeight: 1.1 }),
                  lineHeight: 1.4,
                }}>{f.text}</div>
              ) : isNote ? (
                <textarea
                  key={f.text}
                  defaultValue={f.text}
                  placeholder="Write a note"
                  onPointerDown={e => e.stopPropagation()}
                  onBlur={e => { if (e.target.value !== f.text) update(f.id, { text: e.target.value }) }}
                  style={{
                    width: '100%', height: '100%', resize: 'none', border: 0, outline: 'none', padding: 0,
                    background: 'transparent', color: '#422006', fontSize: 15, lineHeight: 1.4, fontFamily: 'inherit',
                  }}
                />
              ) : (
                <input
                  key={f.text}
                  defaultValue={f.text}
                  placeholder="Text"
                  onPointerDown={e => e.stopPropagation()}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  onBlur={e => { if (e.target.value !== f.text) update(f.id, { text: e.target.value }) }}
                  style={{
                    width: '100%', border: 0, outline: 'none', padding: 0, background: 'transparent',
                    color: '#0f172a', fontSize: SCRIBBLE_SIZE, fontWeight: 400, fontFamily: SCRIBBLE_FONT, fontStyle: 'italic', lineHeight: 1.1, cursor: 'text',
                  }}
                />
              )}
            </div>
          </foreignObject>
          {showX && <SvgButton x={isNote ? x + w - 13 : x + w} y={isNote ? y + 13 : y} label="Remove" onClick={() => remove(f.id)} />}
          </g>
        )
      })}
    </g>
  )
}

// XMind-style summary: a brace beside a run of topics with its own label. It is drawn
// from the topics' live boxes, so it follows them through every re-layout.
const labelWidth = (t: string) => Math.min(600, Math.max(160, t.length * 9 + 36))
const branchWidth = (t: string) => Math.min(400, Math.max(70, t.length * 8 + 28))

// The area a summary covers: its topics plus every descendant, so the bracket clears them all
function branchBox(f: MapFloat, nodes: MindmapNode[]) {
  const spanned = nodes.filter(n => f.nodeIds?.includes(n.id))
  if (!spanned.length) return null
  const box = [...spanned]
  for (let i = 0; i < box.length; i++) {
    for (const c of nodes) if (c.parentId === box[i].id && !box.includes(c)) box.push(c)
  }
  const root = nodes.find(n => n.parentId === null)
  const midX = spanned.reduce((t, n) => t + n.x + n.width / 2, 0) / spanned.length
  return {
    top: Math.min(...box.map(n => n.y)), bottom: Math.max(...box.map(n => n.y + n.height)),
    left: Math.min(...box.map(n => n.x)), right: Math.max(...box.map(n => n.x + n.width)),
    onLeft: !!root && midX < root.x + root.width / 2,
  }
}

// Where each summary's bracket starts. Smaller summaries go first; a bigger one that
// overlaps them on the same side starts past their label and branches, so none overlap.
function summaryEdges(floats: MapFloat[], nodes: MindmapNode[]) {
  const placed: { onLeft: boolean; top: number; bottom: number; reach: number }[] = []
  const edges = new Map<string, number>()
  const items = floats.filter(f => f.kind === 'summary')
    .map(f => ({ f, b: branchBox(f, nodes) }))
    .filter((x): x is { f: MapFloat; b: NonNullable<ReturnType<typeof branchBox>> } => !!x.b)
    .sort((a, z) => (a.b.bottom - a.b.top) - (z.b.bottom - z.b.top))
  for (const { f, b } of items) {
    const dir = b.onLeft ? -1 : 1
    const mid = (b.top + b.bottom) / 2
    const kids = f.branches ?? []
    // Vertical reach: the bracket, the label and note below it, and the branch stack
    const top = Math.min(b.top, mid - 18, mid - kids.length * 20)
    const bottom = Math.max(b.bottom, mid + 70, mid + kids.length * 20)
    let edge = b.onLeft ? b.left : b.right
    for (const p of placed) {
      if (p.onLeft !== b.onLeft || p.bottom < top || p.top > bottom) continue
      edge = b.onLeft ? Math.min(edge, p.reach - 12) : Math.max(edge, p.reach + 12)
    }
    edges.set(f.id, edge)
    let reach = edge + dir * (18 + 12 + labelWidth(f.text))
    if (kids.length) reach += dir * (28 + Math.max(...kids.map(branchWidth)))
    placed.push({ onLeft: b.onLeft, top, bottom, reach })
  }
  return edges
}

function SummaryBrace({ f, nodes, edge, readOnly, hovered, onHover, onText, onNote, onRemove, onBranches }: {
  f: MapFloat; nodes: MindmapNode[]; edge?: number; readOnly?: boolean; hovered: boolean
  onHover: (on: boolean) => void; onText: (t: string) => void; onNote: (t: string) => void; onRemove: () => void
  onBranches: (b: string[]) => void
}) {
  // Keep the note field up while it is being typed in, even after the mouse leaves
  const [noteFocus, setNoteFocus] = useState(false)
  const b = branchBox(f, nodes)
  if (!b) return null
  const { top, bottom, left, right, onLeft } = b
  const dir = onLeft ? -1 : 1
  // Square bracket like XMind: caps at the top and bottom, a tick out to the label
  const pad = 4
  const bx = onLeft ? (edge ?? left) - 18 : (edge ?? right) + 18
  const y0 = top - pad
  const y1 = bottom + pad
  const mid = (top + bottom) / 2
  const cap = 8 * dir
  const tick = 12 * dir
  const path = `M ${bx - cap} ${y0} H ${bx} V ${y1} H ${bx - cap} M ${bx} ${mid} H ${bx + tick}`
  const color = '#111827'
  const labelW = labelWidth(f.text)
  const lx = onLeft ? bx + tick - labelW : bx + tick
  // Branches off the summary label, stacked on a short spine like a topic's children
  const branches = f.branches ?? []
  const sx = onLeft ? lx : lx + labelW
  const spineX = sx + 16 * dir
  const kidEdge = sx + 28 * dir
  const kidYs = branches.map((_, i) => mid - (branches.length * 40 - 10) / 2 + i * 40 + 15)
  const spine = branches.length
    ? `M ${sx} ${mid} H ${spineX} M ${spineX} ${kidYs[0]} V ${kidYs[kidYs.length - 1]} ` + kidYs.map(y => `M ${spineX} ${y} H ${kidEdge}`).join(' ')
    : ''
  const setBranch = (i: number, t: string) => onBranches(branches.map((b, j) => (j === i ? t : b)))
  return (
    <g data-testid="float-summary" onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="miter" />
      {spine && <path d={spine} fill="none" stroke="#94a3b8" strokeWidth={1.5} />}
      {branches.map((b, i) => {
        const w = branchWidth(b)
        return (
          <foreignObject key={i} x={onLeft ? kidEdge - w : kidEdge} y={kidYs[i] - 15} width={w} height={30} style={{ overflow: 'visible' }}>
            <div data-testid="summary-branch" onPointerDown={e => e.stopPropagation()} style={{
              height: 30, boxSizing: 'border-box', display: 'flex', alignItems: 'center',
              padding: '0 10px', borderRadius: 6, background: '#f1f5f9',
              fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, color: '#0f172a',
            }}>
              {readOnly ? <span style={{ whiteSpace: 'nowrap' }}>{b}</span> : (
                <input key={b} defaultValue={b} placeholder="Topic"
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  onBlur={e => { if (e.target.value !== b) setBranch(i, e.target.value) }}
                  style={{ width: '100%', border: 0, outline: 'none', padding: 0, background: 'transparent', font: 'inherit', color: 'inherit' }} />
              )}
            </div>
          </foreignObject>
        )
      })}
      <foreignObject x={lx} y={mid - 18} width={labelW} height={90} style={{ overflow: 'visible' }}>
        <div onPointerDown={e => e.stopPropagation()} style={{
          height: 36, boxSizing: 'border-box', display: 'flex', alignItems: 'center',
          padding: '0 10px', borderRadius: 8, background: '#fff', border: `1.5px solid ${color}`,
          outline: hovered && !readOnly ? '2px solid rgba(59,130,246,0.45)' : 'none', outlineOffset: 3,
          fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, fontWeight: 600, color: '#0f172a',
        }}>
          {readOnly ? <span style={{ whiteSpace: 'nowrap' }}>{f.text}</span> : (
            <input key={f.text} defaultValue={f.text} placeholder="Summary"
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              onBlur={e => { if (e.target.value !== f.text) onText(e.target.value) }}
              style={{ width: '100%', border: 0, outline: 'none', padding: 0, background: 'transparent', font: 'inherit', color: 'inherit' }} />
          )}
        </div>
        {/* Small note under the summary: shown when it has text, or on hover to add one */}
        {(f.note || noteFocus || (hovered && !readOnly)) && (
          readOnly ? (
            <div style={{ marginTop: 4, padding: '0 4px', fontSize: 12, color: '#64748b', fontFamily: 'Inter, system-ui, sans-serif', whiteSpace: 'pre-wrap' }}>{f.note}</div>
          ) : (
            <textarea key={f.note ?? ''} defaultValue={f.note ?? ''} placeholder="Add a note" rows={2}
              onPointerDown={e => e.stopPropagation()}
              onFocus={() => setNoteFocus(true)}
              onBlur={e => { setNoteFocus(false); if (e.target.value !== (f.note ?? '')) onNote(e.target.value) }}
              style={{
                display: 'block', width: '100%', marginTop: 4, boxSizing: 'border-box', resize: 'none',
                border: 0, outline: 'none', padding: '0 4px', background: 'transparent',
                fontSize: 12, lineHeight: 1.4, color: '#64748b', fontFamily: 'Inter, system-ui, sans-serif',
              }} />
          )
        )}
      </foreignObject>
      {/* Buttons are SVG, not positioned HTML: Safari draws positioned HTML in a
          foreignObject at full size, ignoring the map's zoom */}
      {hovered && !readOnly && branches.map((_, i) => {
        const w = branchWidth(branches[i])
        return <SvgButton key={i} x={onLeft ? kidEdge - w : kidEdge + w} y={kidYs[i] - 15} r={9} label="Remove branch"
          onClick={() => onBranches(branches.filter((_, j) => j !== i))} />
      })}
      {hovered && !readOnly && (
        <SvgButton x={onLeft ? lx - 19 : lx + labelW + 19} y={mid} r={11} label="Add branch" kind="plus"
          onClick={() => onBranches([...branches, 'Topic'])} />
      )}
      {hovered && !readOnly && <SvgButton x={lx + labelW} y={mid - 18} label="Remove" onClick={onRemove} />}
    </g>
  )
}

// A small round button drawn in SVG, so it scales with the map like everything else
function SvgButton({ x, y, r = 10, label, onClick, kind = 'x' }: {
  x: number; y: number; r?: number; label: string; onClick: () => void; kind?: 'x' | 'plus'
}) {
  const plus = kind === 'plus'
  const d = plus ? r * 0.45 : r * 0.35
  return (
    <g role="button" aria-label={label} style={{ cursor: 'pointer' }}
      onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onClick() }}>
      <title>{label}</title>
      <circle cx={x} cy={y} r={r} fill={plus ? '#3b82f6' : '#fff'} stroke={plus ? 'none' : '#e2e8f0'} />
      <path d={plus ? `M ${x - d} ${y} H ${x + d} M ${x} ${y - d} V ${y + d}` : `M ${x - d} ${y - d} L ${x + d} ${y + d} M ${x + d} ${y - d} L ${x - d} ${y + d}`}
        stroke={plus ? '#fff' : '#64748b'} strokeWidth={plus ? 2 : 1.6} strokeLinecap="round" />
    </g>
  )
}

const ITEMS = [
  { kind: 'note', label: 'Sticky note', Icon: StickyNote },
  { kind: 'text', label: 'Text', Icon: Type },
  { kind: 'summary', label: 'Summary', Icon: Braces },
  { kind: 'legend', label: 'Legend', Icon: List },
] as const

type AddKind = (typeof ITEMS)[number]['kind']
let dropCount = 0

// Shared by the + ring and the top toolbar: add a canvas item, a summary over the
// selected topics, or the legend.
function addItem(kind: AddKind, toCanvas: ToCanvas, rightInset: number) {
  const root = rootOf()
  if (!root) return
  if (kind === 'summary') {
    const { selectedNodeIds } = useMindmapStore.getState()
    const ids = selectedNodeIds.filter(id => id !== root.id)
    if (!ids.length) { showToast('Select the topics to summarize first', { color: '#ef4444' }); return }
    saveFloats([...(root.floats ?? []), { id: crypto.randomUUID(), kind: 'summary', x: 0, y: 0, text: 'Summary', nodeIds: ids }])
    return
  }
  if (kind === 'legend') {
    if (root.legend?.length) {
      // Toggles: a shown legend hides (dropping its filter), a hidden one comes back
      const show = root.showLegend === false
      if (!show) useMindmapStore.getState().setLegendFocus([])
      useMindmapStore.getState().updateNode(root.id, { showLegend: show })
      return
    }
    // No rows yet: 1 per main branch colour, so a click filters to that branch
    const nodes = useMindmapStore.getState().activeMindmap?.nodes ?? []
    const rows: LegendItem[] = []
    for (const n of nodes.filter(n => n.depth === 1).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
      if (rows.length < 20 && !rows.some(r => r.color === n.color)) rows.push({ label: n.title.slice(0, 80), color: n.color })
    }
    if (!rows.length) { showToast('Add a branch first, the legend lists them', { color: '#ef4444' }); return }
    useMindmapStore.getState().updateNode(root.id, { legend: rows, showLegend: true })
    return
  }
  // Drop it in the middle of the screen, nudged so repeated adds do not stack exactly
  const step = (dropCount++ % 5) * 24
  const c = toCanvas(window.innerWidth / 2 - rightInset / 2, window.innerHeight / 2)
  const f: MapFloat = {
    id: crypto.randomUUID(), kind,
    x: c.x - (kind === 'note' ? NOTE_W / 2 : 60) + step, y: c.y - (kind === 'note' ? NOTE_H / 2 : 22) + step,
    text: kind === 'note' ? '' : 'Text',
  }
  // New items land on a free spot too
  const nodes = useMindmapStore.getState().activeMindmap?.nodes ?? []
  const spot = freeSpot(f.x, f.y, floatSize(f).w, floatSize(f).h, obstacles(nodes, root.floats ?? []))
  saveFloats([...(root.floats ?? []), { ...f, ...spot }])
}

// The + button (bottom right) and its ring of add buttons, as on the Forensic board.
export function AddMenu({ toCanvas, rightInset = 0 }: { toCanvas: ToCanvas; rightInset?: number }) {
  const [open, setOpen] = useState(false)
  const add = (kind: AddKind) => { setOpen(false); addItem(kind, toCanvas, rightInset) }

  const R = 100
  return (
    <div style={{ position: 'fixed', right: 20 + rightInset, bottom: 20, zIndex: 25, width: 56, height: 56 }}>
      {open && ITEMS.map((it, i) => {
        // Fan out over the quarter circle above and to the left of the button
        const a = Math.PI / 2 + (i * (Math.PI / 2)) / (ITEMS.length - 1)
        return (
          <button key={it.kind} title={it.label} aria-label={`Add ${it.label}`} onClick={() => add(it.kind)}
            style={{
              position: 'absolute', left: 28 + R * Math.cos(a) - 24, top: 28 - R * Math.sin(a) - 24,
              width: 48, height: 48, borderRadius: 24, border: '1px solid #e2e8f0', background: '#fff',
              boxShadow: '0 4px 14px rgba(0,0,0,0.12)', color: '#1e293b', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}><it.Icon size={20} /></button>
        )
      })}
      <button title={open ? 'Close' : 'Add'} aria-label={open ? 'Close add menu' : 'Add to map'} aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          width: 56, height: 56, borderRadius: 28, border: 0, background: '#1e293b', color: '#fff', cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.18s ease', padding: 0,
        }}><Plus size={26} /></button>
    </div>
  )
}

// Top toolbar, XMind style: add topics to the selection, then the canvas items.
export function TopToolbar({ toCanvas, rightInset = 0 }: { toCanvas: ToCanvas; rightInset?: number }) {
  const selected = useMindmapStore(s => s.selectedNodeIds)
  const nodes = useMindmapStore(s => s.activeMindmap?.nodes)
  const sel = selected.length === 1 ? nodes?.find(n => n.id === selected[0]) : undefined

  function addTopic(child: boolean) {
    const st = useMindmapStore.getState()
    const root = rootOf()
    if (!root) return
    // Topic = a sibling of the selection (a main branch when the root or nothing is picked)
    const parentId = child ? (sel?.id ?? root.id) : (sel && sel.parentId ? sel.parentId : root.id)
    const n = st.addNode(parentId, child ? 'Subtopic' : 'Topic')
    st.setSelectedNodeIds([n.id])
  }

  const btn = (label: string, Icon: typeof Plus, onClick: () => void, disabled = false) => (
    <button key={label} onClick={onClick} disabled={disabled} title={label} aria-label={`Toolbar ${label}`} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 10px', minWidth: 56,
      border: 0, borderRadius: 8, background: 'transparent', cursor: disabled ? 'default' : 'pointer',
      color: disabled ? '#cbd5e1' : '#1e293b', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, fontWeight: 500,
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#f1f5f9' }}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <Icon size={18} />{label}
    </button>
  )

  return (
    <div data-testid="top-toolbar" style={{
      position: 'fixed', top: 'calc(env(safe-area-inset-top) + 10px)', left: `calc(50% - ${rightInset / 2}px)`,
      transform: 'translateX(-50%)', zIndex: 20, display: 'flex', alignItems: 'center', gap: 2, padding: 4,
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
    }}>
      {btn('Topic', RectangleHorizontal, () => addTopic(false))}
      {btn('Subtopic', CornerDownRight, () => addTopic(true))}
      <span style={{ width: 1, height: 28, background: '#e2e8f0', margin: '0 4px' }} />
      {btn('Summary', Braces, () => addItem('summary', toCanvas, rightInset), !selected.some(id => id !== rootOf()?.id))}
      {btn('Note', StickyNote, () => addItem('note', toCanvas, rightInset))}
      {btn('Text', Type, () => addItem('text', toCanvas, rightInset))}
      {btn('Legend', List, () => addItem('legend', toCanvas, rightInset))}
    </div>
  )
}
