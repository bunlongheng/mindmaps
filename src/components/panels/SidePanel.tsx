import { useState, useEffect, useRef, useMemo } from 'react'
import { NODE_ICONS } from '../../lib/icons'
import { useDiagramStore } from '../../store/diagramStore'
import { getTheme, THEMES } from '../../lib/themes'
import { X, AlignLeft, AlignCenter, AlignRight, Copy, Check, RefreshCw, Download, Upload } from 'lucide-react'
import type { LineStyle, DiagramType } from '../../types'
import { encodeShareURL } from '../../lib/export/share'
import { QRCodeSVG } from 'qrcode.react'
import { downloadJSON } from '../../lib/export/json'

interface SidePanelProps {
  nodeId: string | null
  onClose: () => void
  onImport: () => void
}

const DIAGRAM_TYPES: { value: DiagramType; label: string }[] = [
  { value: 'mindmap',         label: 'Mind Map' },
  { value: 'tree-vertical',   label: 'Tree ↓' },
  { value: 'tree-horizontal', label: 'Tree →' },
  { value: 'fishbone',        label: 'Fishbone' },
  { value: 'timeline',        label: 'Timeline' },
]

type Tab = 'style' | 'map' | 'share'

// ── Dice word banks ─────────────────────────────────────────────────────────────
const DICE_WORDS: Record<string, string[]> = {
  user:         ['Alice','Bob','Carol','Dave','Grace','Hank','Ivy','Jack'],
  bot:          ['ChatBot','AutoAgent','AI Helper','Smart Bot','NLP Engine','Copilot'],
  server:       ['API Server','Web Server','Auth Service','Worker Node','Edge Node','Gateway'],
  database:     ['Postgres DB','Redis Cache','Data Lake','MongoDB','Analytics DB','Firestore'],
  zap:          ['Trigger','Event Hook','Webhook','Automation','Quick Action','Pipeline'],
  plug:         ['Plugin','Extension','Connector','Integration','Add-on','Bridge'],
  'git-branch': ['Feature Branch','Release v2','Hotfix','Dev Branch','Canary','Main'],
  globe:        ['Public API','Web App','Global CDN','DNS Zone','Edge Network','Proxy'],
  brain:        ['ML Model','Neural Net','AI Core','Decision Engine','Classifier','LLM'],
  settings:     ['Config','Admin Panel','Control Center','Preferences','Feature Flags','Env'],
  folder:       ['Assets','Resources','Archive','Media','Documents','Uploads'],
  cloud:        ['AWS S3','Cloud Storage','GCP Bucket','Blob Store','Object Store','R2'],
  mail:         ['Email Service','SMTP','Newsletter','Notification','Inbox','Digest'],
  lock:         ['Auth Layer','Security Gate','SSO','Firewall','2FA','RBAC'],
  key:          ['API Key','Secret Token','OAuth','JWT Auth','Credentials','PAT'],
  search:       ['Search Index','Elastic','Full-Text','Query Engine','Discovery','Algolia'],
  star:         ['Featured','Top Pick','Best Seller','Highlighted','Premium','Editor Pick'],
  rocket:       ['Launch Plan','Go-Live','Deploy v1','MVP Sprint','Release Day','Ship It'],
  lightbulb:    ['Idea Hub','Innovation','Brainstorm','Prototype','Concept','Experiment'],
  flame:        ['Hot Feature','Trending','Viral Loop','Growth Hack','Momentum','FOMO'],
  'check-circle':['Done','Complete','Verified','Shipped','Approved','Signed Off'],
  'map-pin':    ['HQ','Office','Region','Location','Branch','Datacenter'],
  trophy:       ['Top Goal','KPI Win','Milestone','Achievement','Record','OKR Hit'],
  message:      ['Support Chat','Feedback','Comments','Discussion','Slack Thread','Forum'],
  phone:        ['Mobile App','iOS App','Android','Push Notify','SMS','WhatsApp'],
  wrench:       ['Maintenance','Fix Mode','Debug','Patch','Repair','Refactor'],
  chart:        ['Analytics','Metrics','Dashboard','Reports','KPIs','Funnels'],
  eye:          ['Monitoring','Observability','Alerting','Logs','Traces','Sentry'],
  music:        ['Media Player','Audio Stream','Podcast','Soundtrack','Beats','Playlist'],
  heart:        ['Favorites','Wishlist','Liked','Saved','Love','Reaction'],
  flag:         ['Feature Flag','Milestone','Checkpoint','Sprint Goal','Launch Gate','Marker'],
  shield:       ['Security','Protection','WAF','Rate Limit','Guard','Compliance'],
  flask:        ['Lab Env','Experiment','A/B Test','Beta','Sandbox','Staging'],
  trending:     ['Growth','Scaling','Momentum','Viral','Expanding','Hypergrowth'],
  paint:        ['Design System','UI Kit','Figma','Style Guide','Brand','Tokens'],
  sparkles:     ['Magic Feature','AI Polish','Premium UX','Delight','Wow Factor','Easter Egg'],
  smile:        ['User Delight','Happy Path','NPS +10','Customer Joy','Onboarding','Flow'],
  home:         ['Home Page','Landing','Dashboard','Overview','Portal','Hub'],
  building:     ['Enterprise','Org Unit','HQ','Department','Division','Tenant'],
  briefcase:    ['Project','Client Work','Contract','Engagement','Mandate','Proposal'],
  graduate:     ['Onboarding','Training','Academy','Certification','Learning','Docs'],
  gift:         ['Promo','Gift Card','Reward','Free Tier','Bonus','Perk'],
  clock:        ['Scheduler','Cron Job','Timer','Reminder','Deadline','SLA'],
  calendar:     ['Sprint Plan','Release Date','Roadmap','Q2 Plan','Milestone','Kickoff'],
  file:         ['Report','Spec','Readme','Changelog','ADR','RFC'],
  cog:          ['Background Job','Worker','Process','Daemon','Task','Queue'],
  cpu:          ['Compute','Processing','VM','Container','Cluster','GPU Node'],
  link:         ['Deep Link','Permalink','Shortlink','Redirect','URL','Alias'],
  code:         ['Feature Code','Module','Library','Component','Hook','Utility'],
  terminal:     ['CLI Tool','Shell Script','Dev Env','Console','Bash','Makefile'],
  package:      ['npm Package','SDK','Library','Dependency','Bundle','Release'],
  layers:       ['Stack','Layer','Tier','Platform','Infrastructure','Monolith'],
  bell:         ['Notification','Alert','Reminder','Push','Ping','Pager'],
  alert:        ['Warning','Error State','Critical Alert','P0 Issue','Incident','On-Call'],
  info:         ['Help Text','Tooltip','Guide','FAQ','Hint','Annotation'],
  help:         ['Support','FAQ','Helpdesk','Knowledge Base','Runbook','Escalation'],
  refresh:      ['Sync','Reload','Update','Retry','Refresh Token','Poll'],
  share:        ['Publish','Export','Broadcast','Post','Distribute','Syndicate'],
  download:     ['Download','Export','Fetch','Pull','Backup','Archive'],
  upload:       ['Upload','Push','Ingest','Submit','Deploy','Seed'],
  image:        ['Banner','Thumbnail','Avatar','Cover Photo','Asset','Artwork'],
  video:        ['Tutorial','Demo','Walkthrough','Webinar','Reel','Recording'],
  mic:          ['Voice Input','Podcast','Audio Note','Recording','Speech','Transcript'],
  headphones:   ['Support Audio','Podcast','Listen Mode','Playback','Music','Review'],
  camera:       ['Screenshot','Photo Upload','Profile Pic','Snapshot','Vision','Capture'],
  monitor:      ['Admin View','CMS','Control Panel','Screen','Command Center','Studio'],
  wifi:         ['Network','Internet','Connectivity','Uptime','Connection','Edge'],
  card:         ['Payment','Billing','Stripe','Credit Card','Checkout','Invoice'],
  cart:         ['Shopping','E-commerce','Cart','Order','Checkout','Storefront'],
  dollar:       ['Revenue','Pricing','Budget','Cost','MRR','ARR'],
  pie:          ['Market Share','Breakdown','Allocation','Distribution','Segments','Split'],
  activity:     ['Uptime','Health Check','Status','Pulse','Heartbeat','SLO'],
  target:       ['OKR','Goal','KPI','North Star','Target Metric','Outcome'],
  crosshair:    ['Focus Area','Priority','Objective','Aim','Precision','Sniper'],
  compass:      ['Direction','Strategy','Vision','North Star','Roadmap','Charter'],
  map:          ['Journey Map','Architecture','Sitemap','Flow','Diagram','Canvas'],
  bookmark:     ['Saved','Reading List','Reference','Pinned','Favorite','Quick Link'],
  tag:          ['Label','Category','Type','Badge','Segment','Attribute'],
  hash:         ['Topic','Channel','Tag','Hashtag','Group','Thread'],
  at:           ['Mention','Email','Contact','Handle','Alias','Address'],
  send:         ['Dispatch','Notify','Push','Deliver','Emit','Trigger'],
}

const GENERIC_DICE = [
  'Core Module','Key Feature','Main Flow','Entry Point','Critical Path',
  'Blue Ocean','Quick Win','Low Hanging','Game Changer','Differentiator',
  'Alpha Phase','Beta Launch','MVP','Proof of Concept','Prototype',
  'North Star','Big Bet','Moonshot','Stretch Goal','Baseline',
  'Sprint 1','Backlog Item','Epic','User Story','Acceptance Test',
]

function pickRandom(arr: string[]) { return arr[Math.floor(Math.random() * arr.length)] }

export function SidePanel({ nodeId, onClose, onImport }: SidePanelProps) {
  const {
    activeDiagram, updateNode, batchUpdateNodes, selectedNodeIds,
    lineStyle, setLineStyle, diagramType, setDiagramType, rerunLayout, setShareEnabled,
    themeId, setTheme, showOrderNumbers, setShowOrderNumbers,
  } = useDiagramStore()
  const themeColors = getTheme(themeId).colors

  const [tab, setTab] = useState<Tab>('style')
  const [copied, setCopied] = useState(false)
  const rootNode = activeDiagram?.nodes.find(n => n.parentId === null)
  const node = (nodeId ? activeDiagram?.nodes.find(n => n.id === nodeId) : null) ?? rootNode ?? null
  const [title, setTitle] = useState(node?.title ?? '')

  useEffect(() => { setTitle(node?.title ?? '') }, [nodeId, node?.title])

  // Auto-switch to style tab when a node is selected
  useEffect(() => { if (nodeId) setTab('style') }, [nodeId])

  function save(updates: Parameters<typeof updateNode>[1]) {
    const ids = selectedNodeIds.length > 1 ? selectedNodeIds : (nodeId ? [nodeId] : [])
    if (ids.length === 0) return
    batchUpdateNodes(ids, updates)
  }


  const shareUrl = activeDiagram ? encodeShareURL(activeDiagram) : ''

  function rollDice() {
    const store = useDiagramStore.getState()
    const ids = selectedNodeIds.length > 1 ? selectedNodeIds : (nodeId ? [nodeId] : [])
    const allNodes = activeDiagram?.nodes ?? []
    ids.forEach(id => {
      const n = allNodes.find(nd => nd.id === id)
      if (!n) return
      const pool = (n.icon && DICE_WORDS[n.icon]) ? DICE_WORDS[n.icon] : GENERIC_DICE
      store.updateNode(id, { title: pickRandom(pool) })
    })
  }

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
        {(['style', 'map', 'share'] as Tab[]).map(t => (
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

              {/* Root circle controls */}
              {node.depth === 0 && diagramType === 'mindmap' && (
                <>
                  <SBlock title="Circle">
                    <PRow label="Radius">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="range" min={60} max={260} step={4}
                          value={Math.round(node.width / 2)}
                          onChange={e => {
                            const d = parseInt(e.target.value) * 2
                            updateNode(node.id, { width: d, height: d, manuallyPositioned: false })
                            rerunLayout()
                          }}
                          style={{ flex: 1, accentColor: '#3b82f6' }}
                        />
                        <span style={{ fontSize: 11, color: '#6b7280', minWidth: 26, textAlign: 'right' }}>{Math.round(node.width / 2)}</span>
                      </div>
                    </PRow>
                    <PRow label="Gap">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="range" min={40} max={999} step={10}
                          value={node.branchGap ?? 120}
                          onChange={e => {
                            updateNode(node.id, { branchGap: parseInt(e.target.value) })
                            rerunLayout()
                          }}
                          style={{ flex: 1, accentColor: '#3b82f6' }}
                        />
                        <span style={{ fontSize: 11, color: '#6b7280', minWidth: 26, textAlign: 'right' }}>{node.branchGap ?? 120}</span>
                      </div>
                    </PRow>
                  </SBlock>
                  <HR />
                </>
              )}

              {/* Shape */}
              <SBlock title="Shape">
                <PRow label="Fill">
                  <ColorField color={node.color} onChange={c => save({ color: c })} swatches={themeColors} />
                </PRow>
                <PRow label="Border">
                  <ColorField
                    color={node.borderColor ?? 'none'}
                    onChange={c => c === 'none'
                      ? save({ borderColor: undefined, borderWidth: undefined })
                      : save({ borderColor: c, borderWidth: node.borderWidth ?? 1.5 })}
                    allowNone
                    swatches={themeColors}
                  />
                </PRow>
                {node.borderColor && (
                  <PRow label="Width">
                    <div style={{ display: 'flex', gap: 5 }}>
                      {(['Thin', 'Med', 'Thick', 'Bold'] as const).map((lbl, i) => {
                        const ws = [1, 1.5, 2.5, 4]
                        const active = node.borderWidth === ws[i] || (!node.borderWidth && i === 1)
                        return <button key={lbl} onClick={() => save({ borderWidth: ws[i] })} style={chip(active)}>{lbl}</button>
                      })}
                    </div>
                  </PRow>
                )}
              </SBlock>
              <HR />

              {/* Icon */}
              {node.depth >= 1 && (
                <>
                  <IconPickerBlock
                    selected={node.icon}
                    onSelect={name => save({ icon: name || undefined })}
                  />
                  <HR />
                </>
              )}

              {/* Text */}
              <SBlock title="Text">
                <PRow label="Label">
                  <div style={{ display: 'flex', gap: 5 }}>
                    <input
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { save({ title }); (e.target as HTMLInputElement).blur() } }}
                      onBlur={() => { if (title !== node.title) save({ title }) }}
                      style={{
                        flex: 1, minWidth: 0, boxSizing: 'border-box', fontSize: 12,
                        border: '1px solid #e0e2e7', borderRadius: 7, padding: '6px 9px',
                        outline: 'none', fontFamily: 'inherit', color: '#111827', background: '#fff',
                      }}
                      onFocus={e => (e.target.style.borderColor = '#3b82f6')}
                      onBlurCapture={e => (e.target.style.borderColor = '#e0e2e7')}
                    />
                    <button
                      onClick={rollDice}
                      title={`Roll random label${selectedNodeIds.length > 1 ? ` (${selectedNodeIds.length} nodes)` : ''}`}
                      style={{
                        width: 32, height: 32, borderRadius: 7, border: '1px solid #e0e2e7',
                        background: '#fff', cursor: 'pointer', fontSize: 15, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                    >🎲</button>
                  </div>
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
                        style={{ ...chip((node.textAlign ?? 'center') === v), flex: 1, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {icon}
                      </button>
                    ))}
                  </div>
                </PRow>
              </SBlock>
              <HR />

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
          <SBlock title="Diagram Type">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {DIAGRAM_TYPES.map(({ value, label }) => {
                const active = diagramType === value
                return (
                  <button key={value} onClick={() => setDiagramType(value)}
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: 8, textAlign: 'left',
                      border: `1.5px solid ${active ? '#3b82f6' : '#e0e2e7'}`,
                      background: active ? '#eff6ff' : '#fff', cursor: 'pointer',
                      fontSize: 12, fontWeight: active ? 600 : 400,
                      color: active ? '#3b82f6' : '#374151', fontFamily: 'inherit',
                    }}>
                    {label}
                  </button>
                )
              })}
            </div>
          </SBlock>
          <HR />
          <SBlock title="Line Style">
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
          <HR />
          <SBlock title="Display">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
          </SBlock>
          <HR />
          <SBlock title="Layout">
            <button onClick={rerunLayout} style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: '1px solid #e0e2e7', background: '#fff',
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
              color: '#374151', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
              <RefreshCw size={13} /> Re-run Layout
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
                      width: '100%', padding: '9px 12px', borderRadius: 8, textAlign: 'left',
                      border: `1.5px solid ${active ? '#3b82f6' : '#e0e2e7'}`,
                      background: active ? '#eff6ff' : '#fff', cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 10,
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
                    <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? '#3b82f6' : '#374151' }}>
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
                {activeDiagram?.sharingEnabled ? 'Link active' : 'Link disabled'}
              </span>
              <button
                onClick={() => setShareEnabled(!activeDiagram?.sharingEnabled)}
                style={{
                  width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', padding: 0,
                  background: activeDiagram?.sharingEnabled ? '#1a1d2e' : '#d1d5db',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: activeDiagram?.sharingEnabled ? 20 : 3,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', display: 'block',
                }} />
              </button>
            </div>

            {/* QR + copy — only when enabled */}
            {activeDiagram?.sharingEnabled && (
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
            <button onClick={() => activeDiagram && downloadJSON(activeDiagram)} style={{
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
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: '1px solid #e0e2e7', background: '#fff',
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
              color: '#374151', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
              <Upload size={13} /> Import JSON
            </button>
          </SBlock>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <label style={{
          width: 32, height: 24, borderRadius: 6, cursor: 'pointer', flexShrink: 0,
          background: isNone ? '#fff' : color,
          border: isNone ? '1.5px dashed #d1d5db' : '1px solid rgba(0,0,0,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden',
        }}>
          {isNone && <span style={{ fontSize: 10, color: '#9ca3af' }}>—</span>}
          <input ref={inputRef} type="color"
            value={isNone ? '#6366f1' : (color.startsWith('#') ? color : '#6366f1')}
            onChange={e => onChange(e.target.value)}
            style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }}
          />
        </label>
        {allowNone && (
          <button onClick={() => onChange('none')} style={{
            width: 32, height: 24, borderRadius: 6, cursor: 'pointer', flexShrink: 0,
            background: 'transparent', border: isNone ? '1.5px solid #3b82f6' : '1.5px dashed #d1d5db',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, color: isNone ? '#3b82f6' : '#9ca3af',
          }}>✕</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5, maxHeight: 52, overflowY: 'auto' }}>
        {(swatches ?? []).map(c => (
          <button key={c} onClick={() => onChange(c)} style={{
            width: 20, height: 20, borderRadius: 5, border: 'none',
            background: c, cursor: 'pointer', padding: 0,
            outline: color === c ? `2.5px solid ${c === '#ffffff' ? '#94a3b8' : c}` : 'none', outlineOffset: 1.5,
            boxShadow: color === c ? '0 0 0 1.5px #fff inset' : (c === '#ffffff' || c === '#f1f5f9' ? '0 0 0 1px #d1d5db inset' : '0 1px 2px rgba(0,0,0,0.15)'),
            transform: color === c ? 'scale(1.1)' : 'scale(1)', transition: 'all 0.1s',
          }} />
        ))}
      </div>
    </div>
  )
}

function IconPickerBlock({ selected, onSelect }: { selected?: string; onSelect: (name: string) => void }) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() =>
    search.trim() ? NODE_ICONS.filter(e => e.label.includes(search.toLowerCase())) : NODE_ICONS
  , [search])

  return (
    <SBlock title="Icon">
      {/* Search */}
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
      {/* Clear */}
      {selected && (
        <button onClick={() => onSelect('')} style={{
          width: '100%', padding: '5px', borderRadius: 6, border: '1px dashed #e0e2e7',
          background: 'transparent', cursor: 'pointer', fontSize: 10,
          color: '#9ca3af', fontFamily: 'inherit', marginBottom: 6,
        }}>Remove icon</button>
      )}
      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
        {filtered.map(({ name, label, Icon }) => {
          const active = selected === name
          return (
            <button key={name} onClick={() => onSelect(name)} title={label} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '7px 4px 5px', borderRadius: 7, border: 'none',
              background: active ? '#eff6ff' : 'transparent',
              outline: active ? '1.5px solid #3b82f6' : 'none',
              cursor: 'pointer',
            }}>
              <Icon style={{ width: 18, height: 18, color: active ? '#3b82f6' : '#6b7280', strokeWidth: 1.6 }} />
              <span style={{ fontSize: 9, color: active ? '#3b82f6' : '#9ca3af', fontFamily: 'inherit', lineHeight: 1 }}>{label}</span>
            </button>
          )
        })}
      </div>
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
