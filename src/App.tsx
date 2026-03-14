import { useEffect, useRef, useState, useCallback } from 'react'
import { CuteToast } from './components/CuteToast'
import { DiagramCanvas } from './components/canvas/DiagramCanvas'
import { SidePanel } from './components/panels/SidePanel'
import { ImportModal } from './components/modals/ImportModal'
import { HomePage } from './components/home/HomePage'
import { useDiagram } from './hooks/useDiagram'
import { useDiagramStore } from './store/diagramStore'
import { decodeShareURL } from './lib/export/share'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'

const DICE_ICONS = ['user','bot','server','database','zap','plug','git-branch','globe','brain','settings','folder','cloud','mail','lock','key','search','star','rocket','lightbulb','flame','check-circle','map-pin','trophy','message','phone','wrench','chart','eye','shield','flask','sparkles','smile','home','building','briefcase','clock','calendar','code','terminal','package','layers','bell','target','compass','map']
const DICE_WORDS: Record<string, string[]> = {
  user:['Alice','Bob','Carol','Dave','Grace','Hank'],bot:['ChatBot','AutoAgent','AI Helper','Smart Bot','Copilot','NLP Engine'],
  server:['API Server','Web Server','Auth Service','Worker Node','Gateway','Edge Node'],database:['Postgres DB','Redis Cache','Data Lake','MongoDB','Firestore','Analytics DB'],
  zap:['Trigger','Event Hook','Webhook','Automation','Pipeline','Quick Action'],plug:['Plugin','Extension','Connector','Integration','Bridge','Add-on'],
  'git-branch':['Feature Branch','Release v2','Hotfix','Dev Branch','Canary','Main'],globe:['Public API','Web App','Global CDN','DNS Zone','Edge Network','Proxy'],
  brain:['ML Model','Neural Net','AI Core','Decision Engine','Classifier','LLM'],settings:['Config','Admin Panel','Control Center','Preferences','Feature Flags','Env'],
  folder:['Assets','Resources','Archive','Media','Documents','Uploads'],cloud:['AWS S3','Cloud Storage','GCP Bucket','Blob Store','Object Store','R2'],
  mail:['Email Service','SMTP','Newsletter','Notification','Inbox','Digest'],lock:['Auth Layer','Security Gate','SSO','Firewall','2FA','RBAC'],
  key:['API Key','Secret Token','OAuth','JWT Auth','Credentials','PAT'],search:['Search Index','Elastic','Full-Text','Query Engine','Discovery','Algolia'],
  star:['Featured','Top Pick','Best Seller','Highlighted','Premium','Editor Pick'],rocket:['Launch Plan','Go-Live','Deploy v1','MVP Sprint','Release Day','Ship It'],
  lightbulb:['Idea Hub','Innovation','Brainstorm','Prototype','Concept','Experiment'],flame:['Hot Feature','Trending','Viral Loop','Growth Hack','Momentum','FOMO'],
  'check-circle':['Done','Complete','Verified','Shipped','Approved','Signed Off'],'map-pin':['HQ','Office','Region','Location','Branch','Datacenter'],
  trophy:['Top Goal','KPI Win','Milestone','Achievement','Record','OKR Hit'],message:['Support Chat','Feedback','Comments','Discussion','Slack Thread','Forum'],
  phone:['Mobile App','iOS App','Android','Push Notify','SMS','WhatsApp'],wrench:['Maintenance','Fix Mode','Debug','Patch','Repair','Refactor'],
  chart:['Analytics','Metrics','Dashboard','Reports','KPIs','Funnels'],eye:['Monitoring','Observability','Alerting','Logs','Traces','Sentry'],
  shield:['Security','Protection','WAF','Rate Limit','Guard','Compliance'],flask:['Lab Env','Experiment','A/B Test','Beta','Sandbox','Staging'],
  sparkles:['Magic Feature','AI Polish','Premium UX','Delight','Wow Factor','Easter Egg'],smile:['User Delight','Happy Path','NPS +10','Customer Joy','Onboarding','Flow'],
  home:['Home Page','Landing','Dashboard','Overview','Portal','Hub'],building:['Enterprise','Org Unit','HQ','Department','Division','Tenant'],
  briefcase:['Project','Client Work','Contract','Engagement','Mandate','Proposal'],clock:['Scheduler','Cron Job','Timer','Reminder','Deadline','SLA'],
  calendar:['Sprint Plan','Release Date','Roadmap','Q2 Plan','Milestone','Kickoff'],code:['Feature Code','Module','Library','Component','Hook','Utility'],
  terminal:['CLI Tool','Shell Script','Dev Env','Console','Bash','Makefile'],package:['npm Package','SDK','Library','Dependency','Bundle','Release'],
  layers:['Stack','Layer','Tier','Platform','Infrastructure','Monolith'],bell:['Notification','Alert','Reminder','Push','Ping','Pager'],
  target:['OKR','Goal','KPI','North Star','Target Metric','Outcome'],compass:['Direction','Strategy','Vision','North Star','Roadmap','Charter'],
  map:['Journey Map','Architecture','Sitemap','Flow','Diagram','Canvas'],
}
function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

type View = 'home' | 'editor' | 'viewer'

export default function App() {
  const { loadDiagramList, loadDiagram, saveDiagram } = useDiagram()
  const { activeDiagram, isDirty, setActiveDiagram, addNode, selectedNodeIds, setSelectedNodeIds, updateNode, batchUpdateNodes } = useDiagramStore()
  const [view, setView] = useState<View>(() => {
    if (decodeShareURL()) return 'viewer'
    const params = new URLSearchParams(window.location.search)
    if (params.get('map') || localStorage.getItem('activeDiagramId')) return 'editor'
    return 'home'
  })
  const [selectedPanelNodeId, setSelectedPanelNodeId] = useState<string | null>(null)
  const [showPanel, setShowPanel] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const shared = decodeShareURL()
    if (shared) { setActiveDiagram(shared); return }
    const params = new URLSearchParams(window.location.search)
    const mapId = params.get('map') || localStorage.getItem('activeDiagramId')
    if (mapId) {
      loadDiagram(mapId)
    } else {
      loadDiagramList()
    }
  }, [])

  useEffect(() => {
    if (!isDirty || !activeDiagram) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveDiagram(activeDiagram), 1500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [isDirty, activeDiagram])

  // Block macOS swipe-back/forward gesture in editor
  useEffect(() => {
    if (view !== 'editor') return
    function onWheel(e: WheelEvent) { e.preventDefault() }
    document.addEventListener('wheel', onWheel, { passive: false })
    return () => document.removeEventListener('wheel', onWheel)
  }, [view])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === 'Tab' && view === 'editor') {
        e.preventDefault()
        const parentId = selectedNodeIds[0] ?? activeDiagram?.nodes.find(n => n.parentId === null)?.id ?? null
        if (parentId) addNode(parentId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedNodeIds, activeDiagram, addNode, view])

  const handleOpenDiagram = useCallback(async (id: string) => {
    setShowPanel(false); setSelectedPanelNodeId(null)
    await loadDiagram(id)
    setView('editor')
    window.history.pushState({}, '', `?map=${id}`)
  }, [loadDiagram])

  const handleBack = useCallback(() => {
    setShowPanel(false); setSelectedPanelNodeId(null); setSelectedNodeIds([])
    loadDiagramList()
    setView('home')
    window.history.pushState({}, '', window.location.pathname)
  }, [setSelectedNodeIds, loadDiagramList])

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    if (nodeId) setSelectedPanelNodeId(nodeId)
  }, [])

  const rollAllDice = useCallback(() => {
    const nodes = activeDiagram?.nodes
    if (!nodes) return
    const targets = selectedNodeIds.length > 0
      ? nodes.filter(n => selectedNodeIds.includes(n.id) && n.parentId !== null)
      : nodes.filter(n => n.parentId !== null)
    targets.forEach(n => {
      const icon = pickRandom(DICE_ICONS)
      const words = DICE_WORDS[icon] ?? ['Node']
      updateNode(n.id, { title: pickRandom(words), icon })
    })
  }, [activeDiagram, selectedNodeIds, updateNode, batchUpdateNodes])

  if (view === 'home') return (
    <>
      <CuteToast />
      <HomePage onOpen={handleOpenDiagram} />
    </>
  )

  if (view === 'viewer') return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <DiagramCanvas onNodeSelect={() => {}} readOnly />
        <div style={{
          position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
          background: '#1a1d2e', color: '#fff', fontSize: 11, fontWeight: 600,
          padding: '5px 12px', borderRadius: 20, letterSpacing: '0.04em', zIndex: 20,
          pointerEvents: 'none',
        }}>
          VIEW ONLY
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <CuteToast />
      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <DiagramCanvas onNodeSelect={handleNodeSelect} />

        {/* Floating back button — top left */}
        <button
          onClick={handleBack}
          title="All maps"
          style={{
            position: 'fixed', top: 14, left: 14, zIndex: 20,
            width: 36, height: 36, borderRadius: 10,
            background: '#fff', border: '1px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#475569',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
        >
          <ArrowLeft size={16} />
        </button>

        {/* Roll Dice button — top left, next to back button */}
        {activeDiagram && <button
          onClick={rollAllDice}
          title={selectedNodeIds.length > 0 ? `Roll dice on ${selectedNodeIds.length} selected node(s)` : 'Roll dice on all nodes'}
          style={{
            position: 'fixed', top: 14, left: 58, zIndex: 20,
            height: 36, padding: '0 12px', borderRadius: 10,
            background: '#fff', border: '1px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            color: '#475569', fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
        >
          🎲 Roll
        </button>}

        {/* Format toggle button — top right, only when a diagram is loaded */}
        {activeDiagram && <button
          onClick={() => setShowPanel(p => !p)}
          title="Format"
          style={{
            position: 'fixed', top: 14, right: 14, zIndex: 20,
            height: 36, padding: '0 14px', borderRadius: 10,
            background: showPanel ? '#1a1d2e' : '#fff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
            color: showPanel ? '#fff' : '#475569',
            fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
          }}
          onMouseEnter={e => { if (!showPanel) e.currentTarget.style.background = '#f8fafc' }}
          onMouseLeave={e => { if (!showPanel) e.currentTarget.style.background = '#fff' }}
        >
          <SlidersHorizontal size={15} />
          Format
        </button>}
      </div>

      {/* Right side panel — shown when a node is selected */}
      {showPanel && (
        <SidePanel
          nodeId={selectedPanelNodeId}
          onClose={() => { setSelectedPanelNodeId(null); setSelectedNodeIds([]); setShowPanel(false) }}
          onImport={() => setShowImport(true)}
        />
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}
