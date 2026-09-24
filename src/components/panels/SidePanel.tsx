import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { NODE_ICONS } from '../../lib/icons'
import { useMindmapStore } from '../../store/mindmapStore'
import { useIsMobile } from '../../hooks/useIsMobile'
import { getTheme, THEMES, isDarkBg } from '../../lib/themes'
import type { Theme } from '../../lib/themes'
import { X, AlignLeft, AlignCenter, AlignRight, Copy, Check, FileDown, Trash2, Sparkles, Code2, Square, Squircle, Pill, Circle, Tag } from 'lucide-react'
import { getLucideIcon } from '../canvas/NodeIcon'
import { showToast, dismissToast } from '../CuteToast'
import { soundChaChing } from '../../lib/sounds'
import { authHeaders } from '../../hooks/useDiagram'
import { levelCounts } from '../../lib/nodeCounts'
import type { LineStyle, DiagramType, Diagram, DiagramMeta } from '../../types'
import type { NodeShape } from '../../lib/nodeShape'
import { QRCodeSVG } from 'qrcode.react'

interface SidePanelProps {
  nodeId: string | null
  onClose: () => void
  onDelete?: () => void
  onUpdateTags?: (id: string, tags: string[]) => void
}

// 8 cohesive colors — all Tailwind-500 level, same saturation family
const TAG_PALETTE = [
  '#6366f1', '#14b8a6', '#ec4899', '#f59e0b',
  '#22c55e', '#3b82f6', '#f97316', '#8b5cf6',
]
const PRESET_TAGS = ['AI', 'Work', 'Personal', 'Research']

function buildTagColorMap(allTags: string[]): Map<string, string> {
  const sorted = [...new Set(allTags)].sort()
  return new Map(sorted.map((tag, i) => [tag, TAG_PALETTE[i % TAG_PALETTE.length]]))
}
function tagBg(tag: string, colorMap: Map<string, string>): string {
  return colorMap.get(tag) ?? '#64748b'
}

const DIAGRAM_TYPES: { value: DiagramType; label: string }[] = [
  { value: 'logic-chart',     label: 'Logic Chart' },
  { value: 'mindmap',         label: 'Mind Map' },
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


export function SidePanel({ nodeId, onClose, onDelete, onUpdateTags }: SidePanelProps) {
  // Shallow-selected slice so the panel only re-renders when one of these actually
  // changes, not on every store write (resizePreview during drags, HUD flags, etc.).
  const {
    activeMindmap, updateNode, batchUpdateNodes, selectedNodeIds, diagrams,
    lineStyle, setLineStyle, diagramType, setDiagramType, setShareEnabled, rerunLayout,
    themeId, setTheme, showOrderNumbers, setShowOrderNumbers, showChildCount, setShowChildCount, autoAssignIcons,
    resizeNodeDepth,
  } = useMindmapStore(
    useShallow(s => ({
      activeMindmap: s.activeMindmap, updateNode: s.updateNode, batchUpdateNodes: s.batchUpdateNodes, selectedNodeIds: s.selectedNodeIds,
      diagrams: s.diagrams,
      lineStyle: s.lineStyle, setLineStyle: s.setLineStyle, diagramType: s.diagramType, setDiagramType: s.setDiagramType,
      setShareEnabled: s.setShareEnabled, rerunLayout: s.rerunLayout,
      themeId: s.themeId, setTheme: s.setTheme, showOrderNumbers: s.showOrderNumbers, setShowOrderNumbers: s.setShowOrderNumbers,
      showChildCount: s.showChildCount, setShowChildCount: s.setShowChildCount, autoAssignIcons: s.autoAssignIcons,
      resizeNodeDepth: s.resizeNodeDepth,
    })),
  )
  const mapInfo = useMemo(() => levelCounts(activeMindmap?.nodes ?? []), [activeMindmap?.nodes])
  const themeColors = getTheme(themeId).colors
  const isMobile = useIsMobile()

  const [tab, setTab] = useState<Tab>('map')
  const [iconLoading, setIconLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedSvg, setCopiedSvg] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const node = nodeId ? (activeMindmap?.nodes.find(n => n.id === nodeId) ?? null) : null
  const [title, setTitle] = useState(node?.title ?? '')
  const [url, setUrl] = useState(node?.url ?? '')

  useEffect(() => { setTitle(node?.title ?? '') }, [nodeId, node?.title])
  useEffect(() => { setUrl(node?.url ?? '') }, [nodeId, node?.url])

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
    // Only assign icons to nodes that don't already have one
    const nodesWithoutIcons = nodes.filter(n => !n.icon && !n.emoji)
    if (nodesWithoutIcons.length === 0) {
      showToast('All nodes already have icons', { color: '#64748b', duration: 2000 })
      return
    }
    setIconLoading(true)

    const FALLBACK_POOL = ['star','sparkles','zap','rocket','brain','lightbulb','heart','globe','folder','code','flame','trophy','target','compass','map','layers','cpu','shield','cloud','smile']
    function forcedIcon(title: string): string {
      const h = (title ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
      return FALLBACK_POOL[h % FALLBACK_POOL.length]
    }

    // Blink nodes that are waiting for icons
    const blinkIds = new Set(nodesWithoutIcons.map(n => n.id))
    const blinkStyle = document.createElement('style')
    blinkStyle.textContent = `@keyframes icon-blink { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`
    document.head.appendChild(blinkStyle)
    blinkIds.forEach(id => {
      const el = document.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null
      if (el) el.style.animation = 'icon-blink 0.8s ease-in-out infinite'
    })

    showToast('✦ Assigning icons…', { color: '#1a1d2e', duration: 120000 })
    let tokenCount = 0
    try {
      const nodeList = nodesWithoutIcons.map(n => ({ id: n.id, title: n.title, depth: n.depth }))
      const prompt = `You are an icon assignment expert. For each mindmap node, pick the single best icon name.\n\nYou may use ANY icon from Lucide (lucide.dev) or Heroicons (heroicons.com) — use kebab-case names like: academic-cap, adjustments-horizontal, arrow-trending-up, banknotes, beaker, bolt, book-open, briefcase, building-office, calendar-days, chart-bar, chat-bubble-left, check-circle, chip, clock, cloud, code-bracket, cog, command-line, cpu-chip, credit-card, cube, currency-dollar, device-phone-mobile, document, eye, fire, flag, folder, gift, globe-alt, heart, home, key, light-bulb, link, lock-closed, magnifying-glass, map, map-pin, microphone, moon, musical-note, paint-brush, paper-airplane, photo, puzzle-piece, rocket-launch, server, shield-check, shopping-cart, signal, sparkles, star, sun, tag, trophy, user, video-camera, wifi, wrench, or any other valid lucide/heroicons icon name.\n\nRules:\n- You MUST assign an icon to EVERY node in the list. No exceptions.\n- Pick the most contextually relevant icon.\n- Respond ONLY with a valid JSON array, no explanation: [{"id":"...","icon":"..."}, ...]\n\nNodes:\n${JSON.stringify(nodeList)}`
      const res = await fetch('/api/ai/generate-mindmap', {
        method: 'POST',
        headers: authHeaders(), // admin-only endpoint: must send the owner session token
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
      const missed = nodesWithoutIcons.filter(n => !assigned.has(n.id))
      for (const n of missed) {
        updateNode(n.id, { icon: forcedIcon(n.title) })
        await new Promise(r => setTimeout(r, 60))
      }
      useMindmapStore.getState().setIsDirty(true)
    } catch {
      // Fallback: force icons on nodes without icons
      nodesWithoutIcons.forEach(n => updateNode(n.id, { icon: forcedIcon(n.title) }))
      useMindmapStore.getState().setIsDirty(true)
    } finally {
      // Stop blinking
      blinkIds.forEach(id => {
        const el = document.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null
        if (el) el.style.animation = ''
      })
      blinkStyle.remove()
      dismissToast()
      soundChaChing()
      const tokLabel = tokenCount >= 1000 ? `${(tokenCount / 1000).toFixed(1)}k` : `${tokenCount}`
      const label = tokenCount > 0 ? `✦ ${tokLabel} tokens` : '✦ Icons ready!'
      showToast(label, { color: '#1a1d2e', confetti: true, duration: 3500 })
      setIconLoading(false)
    }
  }, [activeMindmap, iconLoading, updateNode, autoAssignIcons])


  const shareUrl = activeMindmap
    ? `${window.location.origin}/api/og?id=${activeMindmap.id}`
    : ''


  function copyShare() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: isMobile ? 256 : Math.round(256 * 1.2),
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
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0}}>
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
                <PRow label="Link">
                  <input
                    value={url}
                    placeholder="https://…"
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { save({ url: url.trim() || undefined }); (e.target as HTMLInputElement).blur() } }}
                    onBlur={() => { if ((url.trim() || undefined) !== node.url) save({ url: url.trim() || undefined }) }}
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
                {node.depth >= 1 && (
                  <PRow label="Box">
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {([
                        { v: 'rect' as const,    label: 'Rectangle', icon: <Square size={12}/> },
                        { v: 'rounded' as const, label: 'Rounded',   icon: <Squircle size={12}/> },
                        { v: 'pill' as const,    label: 'Pill',      icon: <Pill size={12}/> },
                        { v: 'circle' as const,  label: 'Circle',    icon: <Circle size={12}/> },
                      ] as const).map(({ v, label, icon }) => (
                        <button key={v} title={label} aria-label={label}
                          onClick={() => { save({ shape: v as NodeShape }); setTimeout(() => rerunLayout(), 0) }}
                          style={{ ...chip(node.shape === v), flex: 1, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {icon}
                        </button>
                      ))}
                    </div>
                  </PRow>
                )}
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

              {/* Branch — root only; Shape+Line hidden in mindmap mode (root always circle, lines always straight) */}
              {node.depth === 0 && <SBlock title="Branch">
                {diagramType !== 'mindmap' && <PRow label="Shape">
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([
                      { value: 'circle' as const, label: 'Circle', icon: (active: boolean) => (
                        <svg width="32" height="22" viewBox="0 0 32 22" fill="none">
                          <circle cx="16" cy="11" r="8" fill={active ? '#1a1d2e' : 'none'} stroke={active ? '#1a1d2e' : '#94a3b8'} strokeWidth="2"/>
                        </svg>
                      )},
                      { value: 'pill' as const, label: 'Pill', icon: (active: boolean) => (
                        <svg width="32" height="22" viewBox="0 0 32 22" fill="none">
                          <rect x="3" y="6" width="26" height="10" rx="5" fill={active ? '#1a1d2e' : 'none'} stroke={active ? '#1a1d2e' : '#94a3b8'} strokeWidth="2"/>
                        </svg>
                      )},
                    ]).map(({ value, label, icon }) => {
                      const currentShape = node.shape ?? (node.title.length >= 15 || node.width !== node.height ? 'pill' : 'circle')
                      const active = currentShape === value
                      return (
                        <button key={value} onClick={() => {
                          if (!node) return
                          const h = value === 'circle' ? 180 : 64
                          const w = value === 'circle' ? h : Math.max(180, Math.min(500, Math.ceil(node.title.length * 28 * 0.62 + 80)))
                          save({ shape: value, width: w, height: value === 'circle' ? w : h })
                          setTimeout(() => rerunLayout(), 0)
                        }}
                          style={{
                            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                            gap: 5, padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                            border: `1.5px solid ${active ? '#1a1d2e' : '#e0e2e7'}`,
                            background: active ? '#f1f5f9' : '#fff', fontFamily: 'inherit',
                          }}>
                          {icon(active)}
                          <span style={{ fontSize: 9, fontWeight: active ? 600 : 500, color: active ? '#1a1d2e' : '#64748b' }}>{label}</span>
                        </button>
                      )
                    })}
                  </div>
                </PRow>}
                {diagramType !== 'mindmap' && <PRow label="Line">
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
                </PRow>}

              </SBlock>}
              {node.depth === 0 && <HR />}

            </>
          )}

        </div>
      )}

      {/* ── Map tab ── */}
      {tab === 'map' && (
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0}}>
          <TagsBlock activeMindmap={activeMindmap} diagrams={diagrams} onUpdateTags={onUpdateTags} />
          <HR />
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
                    { value: 'curved' as LineStyle,     label: 'Brace',    d: '' },
                    { value: 'straight' as LineStyle,   label: 'Straight', d: 'M1,8 L15,2' },
                    { value: 'orthogonal' as LineStyle, label: 'Square',   d: 'M1,8 L8,8 L8,2 L15,2' },
                  ]).map(({ value, label, d }) => {
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
                        {label === 'Brace' ? (
                          <svg width="20" height="18" viewBox="0 0 22 20" fill="none" style={{ color: c }}>
                            {/* a right-facing brace: the trunk enters at the cusp, 3 leaders fan out to the right */}
                            <path d="M9 1.5 C6.5 1.5 6 3 6 5 L6 7.5 C6 9 5 10 3.5 10 C5 10 6 11 6 12.5 L6 15 C6 17 6.5 18.5 9 18.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                            <line x1="12" y1="3.5" x2="19" y2="3.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                            <line x1="12" y1="10" x2="19" y2="10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                            <line x1="12" y1="16.5" x2="19" y2="16.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                          </svg>
                        ) : (
                          <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
                            <path d={d} stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        <span style={{ fontSize: 9, fontWeight: active ? 600 : 500, color: c }}>{label}</span>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: '#374151' }}>Show count</span>
              <button
                onClick={() => setShowChildCount(!showChildCount)}
                style={{
                  width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', padding: 0,
                  background: showChildCount ? '#1a1d2e' : '#d1d5db',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: showChildCount ? 20 : 3,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', display: 'block',
                }} />
              </button>
            </div>
          </SBlock>
          <HR />
          <SBlock title="Layout">
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {THEMES.map(theme => (
                <ThemeCard key={theme.id} theme={theme} active={themeId === theme.id} onSelect={() => setTheme(theme.id)} />
              ))}
            </div>
          </SBlock>
          <HR />
          <SBlock title="Details" defaultOpen={false}>
            {mapInfo.byDepth.map((count, depth) => (
              <PRow key={depth} label={depth === 0 ? 'Root' : `L${depth}`}>
                <div style={{ fontSize: 12, color: '#111827', fontWeight: 600, textAlign: 'right' }}>{count}</div>
              </PRow>
            ))}
            <PRow label="Total">
              <div style={{ fontSize: 12, color: '#111827', fontWeight: 700, textAlign: 'right', paddingTop: 4, borderTop: '1px solid #e8eaed' }}>{mapInfo.total}</div>
            </PRow>
            {mapInfo.largestBranch && (
              <p style={{ fontSize: 10, color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
                Deepest: L{mapInfo.deepest}. Largest branch: {mapInfo.largestBranch.title}, {mapInfo.largestBranch.count} nodes.
              </p>
            )}
          </SBlock>
        </div>
      )}

      {/* ── Share tab ── */}
      {tab === 'share' && (
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0}}>
          <SBlock title="Public Link">
            {/* Toggle row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#374151' }}>
                {activeMindmap?.sharingEnabled ? 'Link active' : 'Link disabled'}
              </span>
              <button
                onClick={() => {
                  const next = !activeMindmap?.sharingEnabled
                  setShareEnabled(next)
                  if (next) {
                    navigator.clipboard.writeText(shareUrl).then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    })
                  }
                }}
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

            {/* QR + copy — always visible */}
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
            <button
              onClick={() => {
                import('../../lib/export/copySvg').then(async m => {
                  if (await m.copyDiagramSvg()) {
                    setCopiedSvg(true)
                    setTimeout(() => setCopiedSvg(false), 2000)
                  }
                })
              }}
              style={{
                width: '100%', padding: '9px', borderRadius: 8, marginTop: 6,
                border: '1px solid #e0e2e7',
                background: copiedSvg ? '#f0fdf4' : '#fff',
                cursor: 'pointer', fontSize: 12, fontWeight: 500,
                color: copiedSvg ? '#16a34a' : '#374151', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 0.15s',
              }}>
              {copiedSvg ? <Check size={13} /> : <Code2 size={13} />}
              {copiedSvg ? 'SVG copied!' : 'Copy SVG'}
            </button>
            <p style={{ fontSize: 10, color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
              Anyone with the link can view (read only).
            </p>
          </SBlock>
          <HR />
          <SBlock title="File">
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => activeMindmap && import('../../lib/export/exportPdf').then(m => m.exportDiagramAsPdf(activeMindmap.name))} style={{
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
              <button onClick={() => setShowDeleteConfirm(true)} title="Delete map" style={{
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

function SBlock({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ padding: '12px 14px 8px' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 5, marginBottom: open ? 10 : 0,
        background: 'none', border: 'none', padding: 0, width: '100%', textAlign: 'left',
        cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <span style={{
          fontSize: 9, color: '#6b7280', display: 'inline-block',
          transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 120ms ease',
        }}>▼</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</span>
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{children}</div>}
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

function TagsBlock({ activeMindmap, diagrams, onUpdateTags }: {
  activeMindmap: Diagram | null
  diagrams: DiagramMeta[]
  onUpdateTags?: (id: string, tags: string[]) => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const [tagInput, setTagInput] = useState('')

  const currentTags = useMemo(() => activeMindmap?.tags ?? [], [activeMindmap?.tags])
  const tagColorMap = useMemo(() => {
    const all = [...new Set([...PRESET_TAGS, ...diagrams.flatMap(d => d.tags ?? [])])]
    return buildTagColorMap(all)
  }, [diagrams])
  const available = useMemo(() => {
    const allTagsList = [...new Set([...PRESET_TAGS, ...diagrams.flatMap(d => d.tags ?? [])])]
    return allTagsList.filter(t => !currentTags.includes(t))
  }, [diagrams, currentTags])

  function addTag(tag: string) {
    const t = tag.trim()
    if (!t || !activeMindmap || currentTags.includes(t)) return
    onUpdateTags?.(activeMindmap.id, [...currentTags, t])
    setTagInput('')
  }
  function removeTag(tag: string) {
    if (!activeMindmap) return
    onUpdateTags?.(activeMindmap.id, currentTags.filter(t => t !== tag))
  }

  return (
    <SBlock title="Tags">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <Tag size={13} color="#94a3b8" style={{ flexShrink: 0 }} />
        {currentTags.map(t => (
          <span key={t} onClick={() => removeTag(t)} title="Remove tag" style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 10,
            background: tagBg(t, tagColorMap), color: '#fff',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {t} <X size={8} strokeWidth={3} />
          </span>
        ))}
        <button onClick={() => setShowPicker(p => !p)} style={{
          fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 10,
          background: showPicker ? '#1a1d2e' : '#f1f5f9',
          color: showPicker ? '#fff' : '#64748b',
          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          + Tag
        </button>
      </div>
      {showPicker && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
          {available.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {available.map(t => (
                <button key={t} onClick={() => { addTag(t); setShowPicker(false) }}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 10,
                    background: `${tagBg(t, tagColorMap)}22`, color: tagBg(t, tagColorMap),
                    border: `1px solid ${tagBg(t, tagColorMap)}55`,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>{t}</button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { addTag(tagInput); setShowPicker(false); e.preventDefault() } }}
              placeholder="Custom tag…"
              style={{ flex: 1, fontSize: 12, padding: '6px 10px', border: '1px solid #e0e2e7', borderRadius: 8, outline: 'none', fontFamily: 'inherit', color: '#111827' }}
              autoFocus
            />
            <button onClick={() => { addTag(tagInput); setShowPicker(false) }}
              style={{ padding: '6px 12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 600 }}>
              Add
            </button>
          </div>
        </div>
      )}
    </SBlock>
  )
}

function ColorField({ color, onChange, allowNone, swatches }: {
  color: string; onChange: (c: string) => void; allowNone?: boolean; swatches?: string[]
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isNone = color === 'none'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
      {(swatches ?? []).slice(0, 11).map(c => (
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


  return (
    <SBlock title="Visual">
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 3, background: '#f3f4f6', borderRadius: 8, padding: 3, marginBottom: 10 }}>
        {tabBtn('icon', '⬡ Icon')}
        {tabBtn('emoji', '😊 Emoji')}
        {tabBtn('text', 'Aa Text')}
      </div>

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, maxHeight: 180, overflowY: 'auto', padding: 2 }}>
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

// A 2-column tile that mirrors the Type tiles: same gap/radius/border/tinted-surface
// selected state, but the card itself always keeps the light tile surface - even for
// a dark theme - so the panel stays cohesive. Only the preview strip carries the
// theme's own canvas background.
function ThemeCard({ theme, active, onSelect }: { theme: Theme; active: boolean; onSelect: () => void }) {
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  const ring = (active || focused) ? '0 0 0 2px #3b82f6' : ''
  const lift = hover ? '0 4px 10px rgba(0,0,0,0.12)' : ''
  // Connector tone reads against the theme's own canvas - lighter for a dark canvas.
  const edgeColor = isDarkBg(theme.canvasBg) ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.28)'
  const root = theme.colors[0]
  const branches = [theme.colors[1], theme.colors[2], theme.colors[3]]
  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 5, padding: 6,
        borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
        border: `1.5px solid ${active ? '#3b82f6' : '#e0e2e7'}`,
        background: active ? '#eff6ff' : '#fff',
        boxShadow: [ring, lift].filter(Boolean).join(', ') || 'none',
        transform: hover ? 'translateY(-1px)' : 'none',
        transition: 'transform 120ms ease, box-shadow 120ms ease',
      }}>
      <div style={{ width: '100%', aspectRatio: '3 / 1', borderRadius: 6, overflow: 'hidden', background: theme.canvasBg }}>
        <svg width="100%" height="100%" viewBox="0 0 120 40" preserveAspectRatio="none">
          <rect x="6" y="17" width="22" height="6" rx="3" fill={root} />
          <path d="M28,20 C40,20 40,8 52,8" stroke={edgeColor} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <rect x="52" y="5" width="30" height="6" rx="3" fill={branches[0]} />
          <line x1="28" y1="20" x2="52" y2="20" stroke={edgeColor} strokeWidth="1.4" />
          <rect x="52" y="17" width="30" height="6" rx="3" fill={branches[1]} />
          <path d="M28,20 C40,20 40,32 52,32" stroke={edgeColor} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <rect x="52" y="29" width="30" height="6" rx="3" fill={branches[2]} />
        </svg>
      </div>
      <span style={{
        fontSize: 12, fontWeight: 600, color: active ? '#3b82f6' : '#374151',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {theme.label}
      </span>
    </button>
  )
}
