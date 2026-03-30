import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { NODE_ICONS } from '../../lib/icons'
import { useMindmapStore } from '../../store/mindmapStore'
import { getTheme, THEMES } from '../../lib/themes'
import { X, AlignLeft, AlignCenter, AlignRight, Copy, Check, RefreshCw, Download, Upload, FileDown, Trash2, Sparkles } from 'lucide-react'
import { getLucideIcon } from '../canvas/NodeIcon'
import { showToast, dismissToast } from '../CuteToast'
import { soundChaChing } from '../../lib/sounds'
import type { LineStyle, DiagramType } from '../../types'
import { QRCodeSVG } from 'qrcode.react'
import { downloadJSON } from '../../lib/export/json'
import { exportDiagramAsPdf } from '../../lib/export/exportPdf'

interface SidePanelProps {
  nodeId: string | null
  onClose: () => void
  onImport: () => void
  onDelete?: () => void
}

const DIAGRAM_TYPES: { value: DiagramType; label: string }[] = [
  { value: 'logic-chart',     label: 'Logic Chart' },
  { value: 'mindmap',         label: 'Mind Map' },
  { value: 'tree-vertical',   label: 'Tree ↓' },
  { value: 'tree-horizontal', label: 'Tree →' },
  { value: 'fishbone',        label: 'Fishbone' },
  { value: 'timeline',        label: 'Timeline' },
]

function DiagramTypeIcon({ value, color }: { value: string; color: string }) {
  if (value === 'logic-chart') return (
    <svg width="36" height="26" viewBox="0 0 36 26" fill="none">
      <circle cx="7" cy="13" r="5" fill={color} opacity="0.9"/>
      <line x1="12" y1="13" x2="17" y2="13" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="17" y1="6" x2="17" y2="20" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="17" y1="6"  x2="25" y2="6"  stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="17" y1="13" x2="25" y2="13" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="17" y1="20" x2="25" y2="20" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <rect x="25" y="3"  width="10" height="5" rx="1.5" fill={color} opacity="0.3"/>
      <rect x="25" y="10" width="10" height="5" rx="1.5" fill={color} opacity="0.3"/>
      <rect x="25" y="17" width="10" height="5" rx="1.5" fill={color} opacity="0.3"/>
    </svg>
  )
  if (value === 'mindmap') return (
    <svg width="36" height="26" viewBox="0 0 36 26" fill="none">
      <circle cx="18" cy="13" r="4" fill={color} opacity="0.9"/>
      {/* radial branches: top, right, bottom, left, top-right, bottom-left */}
      <line x1="18" y1="9"  x2="18" y2="3"  stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="22" y1="13" x2="30" y2="13" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="18" y1="17" x2="18" y2="23" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="14" y1="13" x2="6"  y2="13" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="21" y1="10" x2="27" y2="5"  stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="15" y1="16" x2="9"  y2="21" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <rect x="14" y="1"  width="8" height="4" rx="1.5" fill={color} opacity="0.3"/>
      <rect x="28" y="11" width="7" height="4" rx="1.5" fill={color} opacity="0.3"/>
      <rect x="14" y="21" width="8" height="4" rx="1.5" fill={color} opacity="0.3"/>
      <rect x="1"  y="11" width="7" height="4" rx="1.5" fill={color} opacity="0.3"/>
    </svg>
  )
  if (value === 'tree-vertical') return (
    <svg width="36" height="26" viewBox="0 0 36 26" fill="none">
      <rect x="13" y="1" width="10" height="6" rx="1.5" fill={color} opacity="0.9"/>
      <line x1="18" y1="7" x2="18" y2="12" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="8" y1="12" x2="28" y2="12" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="8"  y1="12" x2="8"  y2="16" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="18" y1="12" x2="18" y2="16" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="28" y1="12" x2="28" y2="16" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <rect x="3"  y="16" width="10" height="6" rx="1.5" fill={color} opacity="0.3"/>
      <rect x="13" y="16" width="10" height="6" rx="1.5" fill={color} opacity="0.3"/>
      <rect x="23" y="16" width="10" height="6" rx="1.5" fill={color} opacity="0.3"/>
    </svg>
  )
  if (value === 'tree-horizontal') return (
    <svg width="36" height="26" viewBox="0 0 36 26" fill="none">
      <rect x="1" y="10" width="9" height="6" rx="1.5" fill={color} opacity="0.9"/>
      <line x1="10" y1="13" x2="15" y2="13" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="15" y1="6" x2="15" y2="20" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="15" y1="6"  x2="20" y2="6"  stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="15" y1="13" x2="20" y2="13" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="15" y1="20" x2="20" y2="20" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <rect x="20" y="3"  width="10" height="6" rx="1.5" fill={color} opacity="0.3"/>
      <rect x="20" y="10" width="10" height="6" rx="1.5" fill={color} opacity="0.3"/>
      <rect x="20" y="17" width="10" height="6" rx="1.5" fill={color} opacity="0.3"/>
    </svg>
  )
  if (value === 'fishbone') return (
    <svg width="36" height="26" viewBox="0 0 36 26" fill="none">
      <line x1="3" y1="13" x2="30" y2="13" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <line x1="10" y1="13" x2="15" y2="7"  stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="20" y1="13" x2="25" y2="7"  stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="10" y1="13" x2="15" y2="19" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="20" y1="13" x2="25" y2="19" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <rect x="28" y="9" width="7" height="8" rx="2" fill={color} opacity="0.9"/>
      <line x1="15" y1="7"  x2="22" y2="7"  stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.45"/>
      <line x1="15" y1="19" x2="22" y2="19" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.45"/>
    </svg>
  )
  return (
    <svg width="36" height="26" viewBox="0 0 36 26" fill="none">
      <line x1="2" y1="13" x2="34" y2="13" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      {([8, 18, 28] as number[]).map((x, i) => (
        <g key={x}>
          <line x1={x} y1="13" x2={x} y2={i % 2 === 0 ? 7 : 19} stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
          <rect x={x - 5} y={i % 2 === 0 ? 2 : 19} width="10" height="5" rx="1.5" fill={color} opacity="0.3"/>
        </g>
      ))}
      <polyline points="31,10 34,13 31,16" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

type Tab = 'style' | 'map' | 'share'


export function SidePanel({ nodeId, onClose, onImport, onDelete }: SidePanelProps) {
  const {
    activeMindmap, updateNode, batchUpdateNodes, selectedNodeIds,
    lineStyle, setLineStyle, diagramType, setDiagramType, rerunLayout, setShareEnabled,
    themeId, setTheme, showOrderNumbers, setShowOrderNumbers, hideDetails, setHideDetails, autoAssignIcons,
    resizeNodeDepth,
  } = useMindmapStore()
  const themeColors = getTheme(themeId).colors

  const [tab, setTab] = useState<Tab>('map')
  const [iconLoading, setIconLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const node = nodeId ? (activeMindmap?.nodes.find(n => n.id === nodeId) ?? null) : null
  const [title, setTitle] = useState(node?.title ?? '')

  useEffect(() => { setTitle(node?.title ?? '') }, [nodeId, node?.title])

  // Auto-switch to style tab when a node is selected
  useEffect(() => { if (nodeId) setTab('style') }, [nodeId])
  // Auto-switch to map tab when no node selected
  useEffect(() => { if (!nodeId) setTab('map') }, [nodeId])

  function save(updates: Parameters<typeof updateNode>[1]) {
    const ids = selectedNodeIds.length > 1 ? selectedNodeIds : (nodeId ? [nodeId] : [])
    if (ids.length === 0) return
    batchUpdateNodes(ids, updates)
  }

  const runAIIcons = useCallback(async () => {
    if (!activeMindmap || iconLoading) return
    const nodes = activeMindmap.nodes.filter(n => n.depth > 0)
    if (nodes.length === 0) return
    setIconLoading(true)

    const FALLBACK_POOL = ['star','sparkles','zap','rocket','brain','lightbulb','heart','globe','folder','code','flame','trophy','target','compass','map','layers','cpu','shield','cloud','smile']
    function forcedIcon(title: string): string {
      // pick from fallback pool based on title hash so it's consistent
      const h = (title ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
      return FALLBACK_POOL[h % FALLBACK_POOL.length]
    }

    showToast('✦ Assigning icons…', { color: '#1a1d2e', duration: 120000 })
    let tokenCount = 0
    try {
      const nodeList = nodes.map(n => ({ id: n.id, title: n.title, depth: n.depth }))
      const prompt = `You are an icon assignment expert. For each mindmap node, pick the single best icon name.\n\nYou may use ANY icon from Lucide (lucide.dev) or Heroicons (heroicons.com) — use kebab-case names like: academic-cap, adjustments-horizontal, arrow-trending-up, banknotes, beaker, bolt, book-open, briefcase, building-office, calendar-days, chart-bar, chat-bubble-left, check-circle, chip, clock, cloud, code-bracket, cog, command-line, cpu-chip, credit-card, cube, currency-dollar, device-phone-mobile, document, eye, fire, flag, folder, gift, globe-alt, heart, home, key, light-bulb, link, lock-closed, magnifying-glass, map, map-pin, microphone, moon, musical-note, paint-brush, paper-airplane, photo, puzzle-piece, rocket-launch, server, shield-check, shopping-cart, signal, sparkles, star, sun, tag, trophy, user, video-camera, wifi, wrench, or any other valid lucide/heroicons icon name.\n\nRules:\n- You MUST assign an icon to EVERY node in the list. No exceptions.\n- Pick the most contextually relevant icon.\n- Respond ONLY with a valid JSON array, no explanation: [{\"id\":\"...\",\"icon\":\"...\"}, ...]\n\nNodes:\n${JSON.stringify(nodeList)}`
      const res = await fetch('https://mindmaps-bheng.vercel.app/api/ai/generate-mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer REDACTED_ROTATED_KEY' },
        body: JSON.stringify({ prompt, mode: 'icons' }),
      })
      const data = await res.json()
      tokenCount = data.usage?.total_tokens ?? data.tokens ?? 0
      const raw = data.outline ?? data.result ?? data.content ?? ''
      const match = raw.match(/\[[\s\S]*\]/)
      if (!match) throw new Error('No JSON array in response')
      const assignments: { id: string; icon: string }[] = JSON.parse(match[0])

      const assigned = new Set<string>()
      // Stagger icon pop-ins so user sees them appear one by one
      for (let i = 0; i < assignments.length; i++) {
        const { id, icon } = assignments[i]
        if (!id) continue
        const valid = icon && getLucideIcon(icon) ? icon : forcedIcon(nodes.find(n => n.id === id)?.title ?? '')
        updateNode(id, { icon: valid })
        assigned.add(id)
        await new Promise(r => setTimeout(r, 60))
      }
      // Any node AI missed → force an icon with stagger too
      const missed = nodes.filter(n => !assigned.has(n.id))
      for (const n of missed) {
        updateNode(n.id, { icon: forcedIcon(n.title) })
        await new Promise(r => setTimeout(r, 60))
      }
      useMindmapStore.getState().setIsDirty(true)
    } catch {
      // Fallback: force icons on ALL nodes immediately
      nodes.forEach(n => updateNode(n.id, { icon: forcedIcon(n.title) }))
      useMindmapStore.getState().setIsDirty(true)
    } finally {
      dismissToast()
      soundChaChing()
      const label = tokenCount > 0 ? `✦ ${tokenCount.toLocaleString()} tokens` : '✦ Icons ready!'
      showToast(label, { color: '#1a1d2e', confetti: true, duration: 3500 })
      setIconLoading(false)
    }
  }, [activeMindmap, iconLoading, updateNode, autoAssignIcons])


  const shareUrl = activeMindmap
    ? `${window.location.origin}${window.location.pathname}?share=${activeMindmap.id}`
    : ''


  function copyShare() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 256,
      background: '#f8f9fb', borderLeft: '1px solid #e8eaed',
      display: 'flex', flexDirection: 'column',
      boxShadow: '-2px 0 16px rgba(0,0,0,0.07)', zIndex: 30,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>

      {/* ── Tabs ── */}
      <div style={{
        display: 'flex', borderBottom: '1px solid #e8eaed',
        background: '#fff', flexShrink: 0,
        padding: '0 4px',
      }}>
        {(['map', 'style', 'share'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, height: 42, border: 'none', background: 'transparent',
            cursor: 'pointer', fontSize: 12, fontWeight: tab === t ? 600 : 500,
            color: tab === t ? '#111827' : '#9ca3af', fontFamily: 'inherit',
            borderBottom: `2px solid ${tab === t ? '#111827' : 'transparent'}`,
            transition: 'all 0.15s', textTransform: 'capitalize',
          }}>
            {t === 'style' ? 'Style' : t === 'map' ? 'Map' : 'Share'}
          </button>
        ))}
        <button onClick={onClose} style={{
          width: 30, height: 42, border: 'none', background: 'transparent',
          cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <X size={14} />
        </button>
      </div>

      {/* ── Style tab ── */}
      {tab === 'style' && (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {!node ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 40 }}>
              Select a node to style it
            </div>
          ) : (
            <>


              {/* Text */}
              <SBlock title="Text">
                <PRow label="Label">
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { save({ title }); (e.target as HTMLInputElement).blur() } }}
                    onBlur={() => { if (title !== node.title) save({ title }) }}
                    style={{
                      flex: 1, minWidth: 0, boxSizing: 'border-box', fontSize: 12,
                      border: '1px solid #e0e2e7', borderRadius: 7, padding: '6px 9px',
                      outline: 'none', fontFamily: 'inherit', color: '#111827', background: '#fff',
                      width: '100%',
                    }}
                    onFocus={e => (e.target.style.borderColor = '#3b82f6')}
                    onBlurCapture={e => (e.target.style.borderColor = '#e0e2e7')}
                  />
                </PRow>
                <PRow label="Format">
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button onClick={() => save({ bold: !node.bold })}
                      style={{ ...chip(!!node.bold), width: 30, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                      B
                    </button>
                    <button onClick={() => save({ italic: !node.italic })}
                      style={{ ...chip(!!node.italic), width: 30, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontStyle: 'italic', fontSize: 13 }}>
                      I
                    </button>
                    <div style={{ width: 1, height: 18, background: '#e0e2e7', margin: '0 2px' }} />
                    {([
                      { v: 'left' as const,   icon: <AlignLeft size={12}/>   },
                      { v: 'center' as const, icon: <AlignCenter size={12}/> },
                      { v: 'right' as const,  icon: <AlignRight size={12}/>  },
                    ] as const).map(({ v, icon }) => (
                      <button key={v} onClick={() => save({ textAlign: v })}
                        style={{ ...chip((node.textAlign ?? 'left') === v), flex: 1, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {icon}
                      </button>
                    ))}
                  </div>
                </PRow>
              </SBlock>
              <HR />

              {/* Shape */}
              <SBlock title="Shape">
                <PRow label="Fill">
                  <ColorField color={node.color} onChange={c => save({ color: c })} swatches={themeColors} />
                </PRow>
                {node.depth >= 1 && !(diagramType === 'mindmap' && node.depth <= 2) && (
                  <PRow label="Width">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="range" min={80} max={500} step={4}
                        value={node.width}
                        onChange={e => resizeNodeDepth(node.depth, parseInt(e.target.value))}
                        style={{ flex: 1, accentColor: '#3b82f6' }}
                      />
                      <span style={{ fontSize: 11, color: '#6b7280', minWidth: 26, textAlign: 'right' }}>{node.width}</span>
                    </div>
                  </PRow>
                )}
              </SBlock>
              <HR />

              {/* Visual: Icon / Emoji / Text tabs */}
              {node.depth >= 1 && (
                <>
                  <VisualPickerBlock
                    icon={node.icon}
                    emoji={node.emoji}
                    onSave={save}
                  />
                  <HR />
                </>
              )}

              {/* Branch — root only */}
              {node.depth === 0 && <SBlock title="Branch">
                <PRow label="Line">
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([
                      {
                        value: 'curved' as LineStyle, label: 'Brace',
                        icon: (c: string) => (
                          <svg width="32" height="22" viewBox="0 0 32 22" fill="none">
                            {/* vertical bar */}
                            <line x1="10" y1="4" x2="10" y2="18" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
                            {/* stubs to nodes */}
                            <line x1="10" y1="7" x2="20" y2="7" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
                            <line x1="10" y1="11" x2="20" y2="11" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
                            <line x1="10" y1="15" x2="20" y2="15" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
                            {/* mini node rects */}
                            <rect x="20" y="4.5" width="10" height="5" rx="1.5" fill={c} opacity="0.18"/>
                            <rect x="20" y="8.5" width="10" height="5" rx="1.5" fill={c} opacity="0.18"/>
                            <rect x="20" y="12.5" width="10" height="5" rx="1.5" fill={c} opacity="0.18"/>
                            {/* connector from left */}
                            <line x1="2" y1="11" x2="10" y2="11" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
                          </svg>
                        ),
                      },
                      {
                        value: 'straight' as LineStyle, label: 'Straight',
                        icon: (c: string) => (
                          <svg width="32" height="22" viewBox="0 0 32 22" fill="none">
                            {/* root dot */}
                            <circle cx="5" cy="11" r="2.5" fill={c}/>
                            {/* straight lines to nodes */}
                            <line x1="5" y1="11" x2="20" y2="5" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
                            <line x1="5" y1="11" x2="20" y2="11" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
                            <line x1="5" y1="11" x2="20" y2="17" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
                            {/* mini node rects */}
                            <rect x="20" y="2" width="10" height="5" rx="1.5" fill={c} opacity="0.18"/>
                            <rect x="20" y="8.5" width="10" height="5" rx="1.5" fill={c} opacity="0.18"/>
                            <rect x="20" y="14.5" width="10" height="5" rx="1.5" fill={c} opacity="0.18"/>
                          </svg>
                        ),
                      },
                      {
                        value: 'orthogonal' as LineStyle, label: 'Square',
                        icon: (c: string) => (
                          <svg width="32" height="22" viewBox="0 0 32 22" fill="none">
                            {/* root dot */}
                            <circle cx="5" cy="11" r="2.5" fill={c}/>
                            {/* horizontal from root */}
                            <line x1="5" y1="11" x2="13" y2="11" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
                            {/* vertical bar */}
                            <line x1="13" y1="5" x2="13" y2="17" stroke={c} strokeWidth="1.8" strokeLinecap="square"/>
                            {/* right-angle stubs */}
                            <line x1="13" y1="5" x2="20" y2="5" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
                            <line x1="13" y1="11" x2="20" y2="11" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
                            <line x1="13" y1="17" x2="20" y2="17" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
                            {/* mini node rects */}
                            <rect x="20" y="2" width="10" height="5" rx="1.5" fill={c} opacity="0.18"/>
                            <rect x="20" y="8.5" width="10" height="5" rx="1.5" fill={c} opacity="0.18"/>
                            <rect x="20" y="14.5" width="10" height="5" rx="1.5" fill={c} opacity="0.18"/>
                          </svg>
                        ),
                      },
                    ]).map(({ value, label, icon }) => {
                      const active = lineStyle === value
                      const c = active ? '#3b82f6' : '#64748b'
                      return (
                        <button key={value} onClick={() => setLineStyle(value)}
                          style={{
                            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                            gap: 5, padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                            border: `1.5px solid ${active ? '#3b82f6' : '#e0e2e7'}`,
                            background: active ? '#eff6ff' : '#fff', fontFamily: 'inherit',
                          }}>
                          {icon(c)}
                          <span style={{ fontSize: 9, fontWeight: active ? 600 : 500, color: active ? '#3b82f6' : '#64748b' }}>{label}</span>
                        </button>
                      )
                    })}
                  </div>
                </PRow>

              </SBlock>}
              {node.depth === 0 && <HR />}

            </>
          )}

        </div>
      )}

      {/* ── Map tab ── */}
      {tab === 'map' && (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <SBlock title="Type">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {DIAGRAM_TYPES.map(({ value, label }) => {
                const active = diagramType === value
                const c = active ? '#3b82f6' : '#94a3b8'
                return (
                  <button key={value} onClick={() => setDiagramType(value)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                      padding: '10px 6px 8px', borderRadius: 10,
                      border: `1.5px solid ${active ? '#3b82f6' : '#e0e2e7'}`,
                      background: active ? '#eff6ff' : '#fff', cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    <DiagramTypeIcon value={value} color={c} />
                    <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? '#3b82f6' : '#64748b' }}>
                      {label}
                    </span>
                  </button>
                )
              })}
            </div>
          </SBlock>
          {diagramType !== 'fishbone' && diagramType !== 'timeline' && (
            <>
              <HR />
              <SBlock title="Line">
                <div style={{ display: 'flex', gap: 6 }}>
                  {([
                    { value: 'curved' as LineStyle,     label: 'Brace',    d: 'M1,2 L5,2 M1,5 L5,5 M1,8 L5,8 M5,2 L5,8 L9,5' },
                    { value: 'straight' as LineStyle,   label: 'Straight', d: 'M1,8 L15,2' },
                    { value: 'orthogonal' as LineStyle, label: 'Square',   d: 'M1,8 L8,8 L8,2 L15,2' },
                  ]).map(({ value, label, d }) => {
                    const active = lineStyle === value
                    return (
                      <button key={value} onClick={() => setLineStyle(value)}
                        style={{
                          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                          gap: 5, padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                          border: `1.5px solid ${active ? '#3b82f6' : '#e0e2e7'}`,
                          background: active ? '#eff6ff' : '#fff', fontFamily: 'inherit',
                        }}>
                        <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
                          <path d={d} stroke={active ? '#3b82f6' : '#64748b'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span style={{ fontSize: 9, fontWeight: active ? 600 : 500, color: active ? '#3b82f6' : '#64748b' }}>{label}</span>
                      </button>
                    )
                  })}
                </div>
              </SBlock>
            </>
          )}
          <HR />
          <SBlock title="Display">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#374151' }}>Show order #</span>
              <button
                onClick={() => setShowOrderNumbers(!showOrderNumbers)}
                style={{
                  width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', padding: 0,
                  background: showOrderNumbers ? '#1a1d2e' : '#d1d5db',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: showOrderNumbers ? 20 : 3,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', display: 'block',
                }} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#374151' }}>Hide details</span>
              <button
                onClick={() => setHideDetails(!hideDetails)}
                style={{
                  width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', padding: 0,
                  background: hideDetails ? '#1a1d2e' : '#d1d5db',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: hideDetails ? 20 : 3,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', display: 'block',
                }} />
              </button>
            </div>
          </SBlock>
          <HR />
          <SBlock title="Layout">
            <button onClick={rerunLayout} style={{
              width: '100%', padding: '9px 12px', borderRadius: 8, marginBottom: 6,
              border: '1px solid #e0e2e7', background: '#fff',
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
              color: '#374151', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
              <RefreshCw size={13} /> Re-run Layout
            </button>
            <button onClick={runAIIcons} disabled={iconLoading} style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: '1px solid #e0e2e7', background: iconLoading ? '#f3f4f6' : '#fff',
              cursor: iconLoading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 500,
              color: iconLoading ? '#9ca3af' : '#374151', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
              onMouseEnter={e => { if (!iconLoading) e.currentTarget.style.background = '#f3f4f6' }}
              onMouseLeave={e => { if (!iconLoading) e.currentTarget.style.background = '#fff' }}>
              {iconLoading
                ? <><span style={{ display: 'inline-flex', animation: '_aiSpin 1s linear infinite' }}><Sparkles size={13} /></span> Thinking…</>
                : '✦ Auto Icons (AI)'}
            </button>
          </SBlock>
          <HR />
          <SBlock title="Theme">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {THEMES.map(theme => {
                const active = themeId === theme.id
                return (
                  <button key={theme.id} onClick={() => setTheme(theme.id)}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 8, textAlign: 'left',
                      border: `1.5px solid ${active ? '#3b82f6' : '#e0e2e7'}`,
                      background: theme.canvasBg, cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 10,
                      boxShadow: active ? `0 0 0 2px #3b82f6` : 'none',
                    }}>
                    {/* mini palette preview */}
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      {theme.colors.slice(0, 6).map((c, i) => (
                        <div key={i} style={{
                          width: 10, height: 10, borderRadius: 3, background: c,
                          border: '1px solid rgba(0,0,0,0.12)',
                        }} />
                      ))}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: active ? 700 : 400, color: active ? '#3b82f6' : '#374151' }}>
                      {theme.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </SBlock>
        </div>
      )}

      {/* ── Share tab ── */}
      {tab === 'share' && (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <SBlock title="Public Link">
            {/* Toggle row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#374151' }}>
                {activeMindmap?.sharingEnabled ? 'Link active' : 'Link disabled'}
              </span>
              <button
                onClick={() => setShareEnabled(!activeMindmap?.sharingEnabled)}
                style={{
                  width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', padding: 0,
                  background: activeMindmap?.sharingEnabled ? '#1a1d2e' : '#d1d5db',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: activeMindmap?.sharingEnabled ? 20 : 3,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', display: 'block',
                }} />
              </button>
            </div>

            {/* QR + copy — only when enabled */}
            {activeMindmap?.sharingEnabled && (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 8px' }}>
                  <QRCodeSVG value={shareUrl} size={160} bgColor="#ffffff" fgColor="#1a1d2e" level="M" />
                </div>
                <button onClick={copyShare} style={{
                  width: '100%', padding: '9px', borderRadius: 8,
                  border: '1px solid #e0e2e7',
                  background: copied ? '#f0fdf4' : '#fff',
                  cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  color: copied ? '#16a34a' : '#374151', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  transition: 'all 0.15s',
                }}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
                <p style={{ fontSize: 10, color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
                  Anyone with the link can view (read only).
                </p>
              </>
            )}
          </SBlock>
          <HR />
          <SBlock title="File">
            <button onClick={() => activeMindmap && downloadJSON(activeMindmap)} style={{
              width: '100%', padding: '9px 12px', borderRadius: 8, marginBottom: 6,
              border: '1px solid #e0e2e7', background: '#fff',
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
              color: '#374151', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
              <Download size={13} /> Export JSON
            </button>
            <button onClick={onImport} style={{
              width: '100%', padding: '9px 12px', borderRadius: 8, marginBottom: 6,
              border: '1px solid #e0e2e7', background: '#fff',
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
              color: '#374151', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
              <Upload size={13} /> Import JSON
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => activeMindmap && exportDiagramAsPdf(activeMindmap.name)} style={{
                flex: 1, padding: '9px 12px', borderRadius: 8,
                border: '1px solid #e0e2e7', background: '#fff',
                cursor: 'pointer', fontSize: 12, fontWeight: 500,
                color: '#374151', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                <FileDown size={13} /> Export PDF
              </button>
              <button onClick={() => setShowDeleteConfirm(true)} style={{
                padding: '9px 12px', borderRadius: 8,
                border: '1px solid #fecaca', background: '#fff',
                cursor: 'pointer', fontSize: 12, fontWeight: 500,
                color: '#ef4444', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}>
                <Trash2 size={13} />
              </button>
            </div>
          </SBlock>

          {/* Delete confirmation modal */}
          {showDeleteConfirm && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
            }} onClick={() => setShowDeleteConfirm(false)}>
              <div style={{
                background: '#fff', borderRadius: 16, padding: 24, width: 320,
                boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              }} onClick={e => e.stopPropagation()}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Delete map?</h3>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                  "<strong>{activeMindmap?.name}</strong>" will be permanently deleted.
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowDeleteConfirm(false)} style={{
                    padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 9,
                    background: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: '#64748b',
                  }}>Cancel</button>
                  <button onClick={() => { setShowDeleteConfirm(false); onDelete?.() }} style={{
                    padding: '8px 18px', background: '#ef4444', color: '#fff',
                    border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                  }}>Delete</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 14px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
        <span style={{ fontSize: 9, color: '#6b7280' }}>▼</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{children}</div>
    </div>
  )
}

function PRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ fontSize: 11, color: '#9ca3af', width: 38, paddingTop: 7, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

function ColorField({ color, onChange, allowNone, swatches }: {
  color: string; onChange: (c: string) => void; allowNone?: boolean; swatches?: string[]
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isNone = color === 'none'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
      {(swatches ?? []).slice(0, 12).map(c => (
        <button key={c} onClick={() => onChange(c)} style={{
          width: '100%', aspectRatio: '1', borderRadius: 5, border: 'none',
          background: c, cursor: 'pointer', padding: 0,
          outline: !isNone && color === c ? `2.5px solid ${c === '#ffffff' ? '#94a3b8' : c}` : 'none', outlineOffset: 1.5,
          boxShadow: !isNone && color === c ? '0 0 0 1.5px #fff inset' : (c === '#ffffff' || c === '#f1f5f9' ? '0 0 0 1px #d1d5db inset' : '0 1px 2px rgba(0,0,0,0.15)'),
          transform: !isNone && color === c ? 'scale(1.1)' : 'scale(1)', transition: 'all 0.1s',
        }} />
      ))}
      {/* Custom color picker as last tile */}
      <label title="Custom color" style={{
        width: '100%', aspectRatio: '1', borderRadius: 5, cursor: 'pointer',
        border: '1.5px dashed #d1d5db', display: 'flex', alignItems: 'center',
        justifyContent: 'center', position: 'relative', overflow: 'hidden',
        background: '#fafafa',
      }}>
        <span style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1, pointerEvents: 'none' }}>+</span>
        <input ref={inputRef} type="color"
          value={color.startsWith('#') ? color : '#6366f1'}
          onChange={e => onChange(e.target.value)}
          style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }}
        />
      </label>
      {allowNone && (
        <button onClick={() => onChange('none')} style={{
          width: '100%', aspectRatio: '1', borderRadius: 5, cursor: 'pointer',
          background: 'transparent', border: isNone ? '1.5px solid #3b82f6' : '1.5px dashed #d1d5db',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: isNone ? '#3b82f6' : '#9ca3af',
        }}>✕</button>
      )}
    </div>
  )
}

const COMMON_EMOJIS = [
  '⭐','🔥','💡','✅','❌','⚠️','🎯','🚀','💎','🏆',
  '📌','📎','🔑','🔒','🔓','💰','📊','📈','📉','🗂️',
  '🧠','💪','👋','👍','❤️','🎉','🌟','⚡','🌈','🎨',
  '🏠','🏢','🌍','🔬','🎓','🛠️','📱','💻','🎵','🍎',
]

function VisualPickerBlock({ icon, emoji, onSave }: {
  icon?: string; emoji?: string;
  onSave: (updates: { icon?: string | undefined; emoji?: string | undefined }) => void
}) {
  const isText = !!emoji && /^[\x20-\x7E]{1,3}$/.test(emoji)
  const defaultTab = icon ? 'icon' : emoji ? (isText ? 'text' : 'emoji') : 'icon'
  const [tab, setTab] = useState<'icon' | 'emoji' | 'text'>(defaultTab)
  const [search, setSearch] = useState('')
  const [textDraft, setTextDraft] = useState(isText ? emoji : '')
  const [emojiDraft, setEmojiDraft] = useState(!isText && emoji ? emoji : '')

  const filtered = useMemo(() =>
    search.trim() ? NODE_ICONS.filter(e => e.label.includes(search.toLowerCase())) : NODE_ICONS
  , [search])

  // Sync tab when node changes externally
  useEffect(() => {
    const isT = !!emoji && /^[\x20-\x7E]{1,3}$/.test(emoji)
    setTab(icon ? 'icon' : emoji ? (isT ? 'text' : 'emoji') : 'icon')
    setTextDraft(isT ? emoji! : '')
    setEmojiDraft(!isT && emoji ? emoji : '')
  }, [icon, emoji])

  const tabBtn = (t: 'icon' | 'emoji' | 'text', label: string) => (
    <button onClick={() => setTab(t)} style={{
      flex: 1, height: 28, border: 'none', borderRadius: 6,
      background: tab === t ? '#1a1d2e' : 'transparent',
      color: tab === t ? '#fff' : '#6b7280',
      fontSize: 11, fontWeight: tab === t ? 600 : 500,
      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
    }}>{label}</button>
  )

  const hasAny = !!(icon || emoji)

  return (
    <SBlock title="Visual">
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 3, background: '#f3f4f6', borderRadius: 8, padding: 3, marginBottom: 10 }}>
        {tabBtn('icon', '⬡ Icon')}
        {tabBtn('emoji', '😊 Emoji')}
        {tabBtn('text', 'Aa Text')}
      </div>

      {/* Current value preview */}
      {hasAny && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 22, lineHeight: 1, minWidth: 28, textAlign: 'center' }}>
            {icon
              ? (() => { const found = NODE_ICONS.find(n => n.name === icon); return found ? <found.Icon style={{ width: 22, height: 22, color: '#3b82f6' }} /> : null })()
              : emoji}
          </div>
          <button onClick={() => onSave({ icon: undefined, emoji: undefined })} style={{
            fontSize: 10, color: '#9ca3af', background: 'none', border: '1px dashed #e0e2e7',
            borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit',
          }}>Clear</button>
        </div>
      )}

      {/* Icon tab */}
      {tab === 'icon' && (
        <>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search… (user, db, bot…)"
            style={{
              width: '100%', boxSizing: 'border-box', fontSize: 11,
              border: '1px solid #e0e2e7', borderRadius: 7, padding: '5px 8px',
              outline: 'none', fontFamily: 'inherit', color: '#374151',
              background: '#fff', marginBottom: 8,
            }}
            onFocus={e => (e.target.style.borderColor = '#3b82f6')}
            onBlur={e => (e.target.style.borderColor = '#e0e2e7')}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
            {filtered.map(({ name, label, Icon: Ic }) => {
              const active = icon === name
              return (
                <button key={name} onClick={() => onSave({ icon: name, emoji: undefined })} title={label} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '7px 4px 5px', borderRadius: 7, border: 'none',
                  background: active ? '#eff6ff' : 'transparent',
                  outline: active ? '1.5px solid #3b82f6' : 'none',
                  cursor: 'pointer',
                }}>
                  <Ic style={{ width: 18, height: 18, color: active ? '#3b82f6' : '#6b7280', strokeWidth: 1.6 }} />
                  <span style={{ fontSize: 9, color: active ? '#3b82f6' : '#9ca3af', fontFamily: 'inherit', lineHeight: 1 }}>{label}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Emoji tab */}
      {tab === 'emoji' && (
        <>
          <input
            value={emojiDraft}
            onChange={e => {
              setEmojiDraft(e.target.value)
              if (e.target.value) onSave({ emoji: e.target.value, icon: undefined })
            }}
            placeholder="Paste or type an emoji…"
            style={{
              width: '100%', boxSizing: 'border-box', fontSize: 18, textAlign: 'center',
              border: '1px solid #e0e2e7', borderRadius: 7, padding: '6px 8px',
              outline: 'none', fontFamily: 'inherit', color: '#374151',
              background: '#fff', marginBottom: 8,
            }}
            onFocus={e => (e.target.style.borderColor = '#3b82f6')}
            onBlur={e => (e.target.style.borderColor = '#e0e2e7')}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3 }}>
            {COMMON_EMOJIS.map(em => (
              <button key={em} onClick={() => { setEmojiDraft(em); onSave({ emoji: em, icon: undefined }) }}
                style={{
                  fontSize: 16, lineHeight: 1, padding: '5px 2px', border: 'none',
                  background: emoji === em ? '#eff6ff' : 'transparent',
                  outline: emoji === em ? '1.5px solid #3b82f6' : 'none',
                  borderRadius: 6, cursor: 'pointer',
                }}>
                {em}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Text tab */}
      {tab === 'text' && (
        <>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 8px', lineHeight: 1.4 }}>
            Enter 1–3 characters to use as a label icon (e.g. L, A1, ✓)
          </p>
          <input
            value={textDraft}
            maxLength={3}
            onChange={e => {
              setTextDraft(e.target.value)
              if (e.target.value) onSave({ emoji: e.target.value, icon: undefined })
            }}
            placeholder="L"
            style={{
              width: '100%', boxSizing: 'border-box', fontSize: 22, textAlign: 'center',
              fontWeight: 700,
              border: '1px solid #e0e2e7', borderRadius: 7, padding: '8px',
              outline: 'none', fontFamily: 'Inter, system-ui, sans-serif', color: '#374151',
              background: '#fff',
            }}
            onFocus={e => (e.target.style.borderColor = '#3b82f6')}
            onBlur={e => (e.target.style.borderColor = '#e0e2e7')}
          />
        </>
      )}
    </SBlock>
  )
}

function HR() { return <div style={{ height: 1, background: '#e8eaed', margin: '2px 0' }} /> }

function chip(active: boolean): React.CSSProperties {
  return {
    padding: '4px 8px', borderRadius: 6,
    border: `1px solid ${active ? '#3b82f6' : '#e0e2e7'}`,
    background: active ? '#eff6ff' : '#fff',
    cursor: 'pointer', fontSize: 11, fontWeight: active ? 600 : 500,
    color: active ? '#3b82f6' : '#4b5563', fontFamily: 'inherit',
  }
}
