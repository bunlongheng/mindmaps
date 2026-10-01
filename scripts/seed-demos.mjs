// Seeds the 12 showcase maps - the ones behind the Demos tab on the home library
// and the only maps whose share page carries the social footer. Every map is
// tagged `demo`, shared by link, and kept deliberately small (1 root, 4 to 6
// branches, 2 to 4 leaves each) so the diagram reads at card size instead of
// collapsing into a grey mesh.
//
// Every demo also carries its own LOOK, not just its own type: the 3 line styles,
// the 4 node shapes, both honeycomb comb styles and both graph circle directions
// are each spent on at least one map, so the tab reads as 12 different diagrams
// instead of one diagram drawn 12 times.
//
// The THEME is the one thing deliberately NOT mixed. Every demo is `default`, the
// white canvas, so the Demos tab is one consistent light surface and the cards sit
// in a grid without a dark one punching a hole in it. The dark themes (cyberpunk,
// monokai) and the cream retro are still there for a person's own maps - they are
// just not what the showcase is showing off.
//
// Usage:
//   node scripts/seed-demos.mjs --dry                  # print what would be sent
//   node scripts/seed-demos.mjs                        # POST to http://localhost:5173
//   node scripts/seed-demos.mjs --replace              # delete the existing `demo` maps first
//   APP=https://mindmaps-bheng.vercel.app KEY=... node scripts/seed-demos.mjs --replace
//
// The key comes from the environment (MINDMAPS_API_SECRET / MINDMAP_AI_API_KEY),
// never from this file. Against localhost the dev proxy signs the request, so no
// key is needed there. --replace needs the key even locally: it calls the CRUD API.

// Each entry is { title, type, lines, outline, rootStyle? } where outline is
// the JSON outline the API renders: { Root: [ { emoji, Branch: [leaf, ...] } ] }.
//
// A branch may carry `shape` (rect | rounded | pill | circle) and its whole subtree
// inherits it, so one key turns a branch - or the whole map - round or square.
//
// `rootStyle` holds the root-only settings: `ringSize` for a graph, `combStyle` and
// `combSize` for a honeycomb, `gloss` for the top-of-box sheen.
//
// Emoji, not icon: the server renderer draws emoji as real glyphs but stands a
// lucide icon in as a neutral placeholder, and these maps are seen mostly through
// that renderer (share page, home card). The honeycomb pair carries no emoji at all
// - a hex cell is small and the short label alone fills it.
export const DEMOS = [
  // ── logic-chart: the default tree ─────────────────────────────────────────
  // The baseline look, kept untouched so there is something to read the rest against.
  {
    title: 'System Design Basics',
    type: 'logic-chart',
    lines: 'curved',
    outline: {
      'System Design Basics': [
        { emoji: '📋', Requirements: [
          { Functional: ['Use Cases', 'User Flows'] },
          { 'Non-functional': ['Latency', 'Availability'] },
          { Constraints: ['Budget', 'Team Size'] },
        ] },
        { emoji: '🗄️', Data: [
          { Schema: ['Entities', 'Relations'] },
          { Indexes: ['B-tree', 'Composite'] },
          { Caching: ['Redis', 'TTL'] },
        ] },
        { emoji: '📈', Scale: [
          { 'Load Balancer': ['Round Robin', 'Least Conn'] },
          { Replicas: ['Read Replicas', 'Failover'] },
          { Sharding: ['Hash Key', 'Range Key'] },
        ] },
        { emoji: '🛡️', Reliability: [
          { Retries: ['Backoff', 'Idempotency'] },
          { Timeouts: ['Per Call', 'Deadline'] },
          { Backups: ['Snapshots', 'Restore Drill'] },
        ] },
      ],
    },
  },
  // Square boxes on right-angled lines: the blueprint read of the same tree.
  {
    title: 'REST API Design',
    type: 'logic-chart',
    lines: 'orthogonal',
    outline: {
      'REST API Design': [
        { emoji: '🔗', shape: 'rect', Resources: ['Plural Paths', 'Nouns Not Verbs', 'Shallow Nesting'] },
        { emoji: '🔁', shape: 'rect', Methods: ['GET', 'POST', 'PUT', 'DELETE'] },
        { emoji: '📦', shape: 'rect', Responses: ['Status Codes', 'Pagination', 'Error Shape'] },
        { emoji: '🔐', shape: 'rect', Security: ['Auth Tokens', 'Rate Limits', 'CORS'] },
      ],
    },
  },

  // ── mindmap: the balanced left/right spread ───────────────────────────────
  {
    title: 'Learn TypeScript',
    type: 'mindmap',
    lines: 'curved',
    outline: {
      'Learn TypeScript': [
        { emoji: '🧱', Basics: ['Types', 'Interfaces', 'Unions'] },
        { emoji: '🧬', Generics: ['Constraints', 'Defaults', 'Inference'] },
        { emoji: '🔎', Narrowing: ['Type Guards', 'Discriminants', 'Assertions'] },
        { emoji: '🛠️', Tooling: ['tsconfig', 'ESLint', 'Vitest'] },
        { emoji: '⚛️', React: ['Props', 'Hooks', 'Events'] },
      ],
    },
  },
  // Every box a circle: 5 groups, 10 leaves, the whole top 10 drawn round.
  // Labels stay to 2 words - a circle sizes itself to fit its own text.
  {
    title: 'Claude Code Top 10',
    type: 'mindmap',
    lines: 'curved',
    rootStyle: { gloss: true },
    outline: {
      'Claude Code Top 10': [
        { emoji: '📁', shape: 'circle', Context: ['CLAUDE.md', 'Plan Mode'] },
        { emoji: '🧩', shape: 'circle', Extend: ['Skills', 'MCP Servers'] },
        { emoji: '🪝', shape: 'circle', Automate: ['Hooks', 'Scheduled Runs'] },
        { emoji: '👥', shape: 'circle', Delegate: ['Subagents', 'Worktrees'] },
        { emoji: '🧹', shape: 'circle', Hygiene: ['Session Recap', 'Model Routing'] },
      ],
    },
  },

  // ── graph: radial constellation, one map each way ─────────────────────────
  // ringSize inward (the default): big centre, topics smaller, leaves smaller again.
  {
    title: 'Machine Learning',
    type: 'graph',
    lines: 'curved',
    rootStyle: { ringSize: 'inward' },
    outline: {
      'Machine Learning': [
        { emoji: '🎯', Supervised: ['Regression', 'Classification', 'Trees'] },
        { emoji: '🧩', Unsupervised: ['Clustering', 'PCA', 'Anomalies'] },
        { emoji: '🧠', 'Deep Learning': ['CNN', 'RNN', 'Transformers'] },
        { emoji: '📐', Evaluation: ['Accuracy', 'Precision', 'Recall'] },
        { emoji: '🚀', Deployment: ['Serving', 'Monitoring', 'Drift'] },
      ],
    },
  },
  // ringSize outward: small centre, small topics, the leaves carry the weight.
  {
    title: 'How JEV Routes Local AI Agents',
    type: 'graph',
    lines: 'straight',
    rootStyle: { ringSize: 'outward' },
    outline: {
      'How JEV Routes Local AI Agents': [
        { emoji: '🎣', Hook: ['Reads the Prompt', 'Injects the Tier', 'Runs Before Claude'] },
        { emoji: '🧠', Decision: ['TypeSafe Model', 'Sub Cent Per Call', 'Returns One Tier'] },
        { emoji: '🪜', Ladder: ['Haiku', 'Sonnet', 'Opus', 'Fable'] },
        { emoji: '🔌', Keys: ['AI Gateway', 'Direct Key Fallback', 'Silent If Unset'] },
        { emoji: '🛡️', Guardrails: ['Judgment Stays Top', 'Escalate One Tier', 'Never Start High'] },
      ],
    },
  },

  // ── timeline: spine left to right ─────────────────────────────────────────
  {
    title: 'First 90 Days',
    type: 'timeline',
    lines: 'curved',
    outline: {
      'First 90 Days': [
        { emoji: '👋', shape: 'pill', 'Week 1': ['Meet the Team', 'Read the Docs', 'Set Up Local'] },
        { emoji: '🚢', shape: 'pill', 'Month 1': ['Ship Something Small', 'Map the System'] },
        { emoji: '🧩', shape: 'pill', 'Month 2': ['Own a Feature', 'Fix a Rough Edge'] },
        { emoji: '🏁', shape: 'pill', 'Month 3': ['Lead a Project', 'Set Next Goals'] },
      ],
    },
  },
  {
    title: 'History of the Web',
    type: 'timeline',
    lines: 'straight',
    outline: {
      'History of the Web': [
        { emoji: '📄', '1989': ['The Proposal', 'HTTP and HTML'] },
        { emoji: '🧭', '1995': ['JavaScript', 'First Browser War'] },
        { emoji: '🔄', '2004': ['Ajax', 'Web 2.0'] },
        { emoji: '⚡', '2008': ['Chrome', 'V8 Engine'] },
        { emoji: '📱', '2015': ['React Era', 'Mobile First'] },
        { emoji: '🤖', '2026': ['AI Agents', 'Edge Runtime'] },
      ],
    },
  },

  // ── fishbone: cause and effect ────────────────────────────────────────────
  {
    title: 'Slow Page Load',
    type: 'fishbone',
    lines: 'straight',
    outline: {
      'Slow Page Load': [
        { emoji: '🖥️', Frontend: ['Large Bundles', 'Blocking Scripts', 'Heavy Images'] },
        { emoji: '⚙️', Backend: ['Slow Queries', 'No Caching', 'Cold Starts'] },
        { emoji: '🌐', Network: ['No CDN', 'Big Payloads', 'Too Many Requests'] },
        { emoji: '📋', Process: ['No Budget', 'No Monitoring', 'Late Testing'] },
      ],
    },
  },
  {
    title: 'Customer Churn',
    type: 'fishbone',
    lines: 'curved',
    rootStyle: { gloss: true },
    outline: {
      'Customer Churn': [
        { emoji: '📦', Product: ['Missing Features', 'Known Bugs', 'Hard Onboarding'] },
        { emoji: '💵', Pricing: ['Too High', 'Unclear Tiers'] },
        { emoji: '🎧', Support: ['Slow Replies', 'Thin Docs'] },
        { emoji: '🎯', Fit: ['Wrong Audience', 'Weak Habit'] },
      ],
    },
  },

  // ── honeycomb: tiled hex cells, short labels, no emoji ────────────────────
  // mesh: equal cells tiled edge to edge, the default comb.
  {
    title: 'Developer Toolkit',
    type: 'honeycomb',
    lines: 'curved',
    rootStyle: { combStyle: 'mesh' },
    outline: {
      'Developer Toolkit': [
        { Editor: ['VS Code', 'Vim', 'Cursor'] },
        { Shell: ['zsh', 'tmux', 'fzf'] },
        { Git: ['GitHub', 'Lazygit'] },
        { Deploy: ['Vercel', 'Docker'] },
        { Debug: ['DevTools', 'Sentry'] },
      ],
    },
  },
  // web + outward: cells on rings around the root, growing as they go out.
  {
    title: 'Design System',
    type: 'honeycomb',
    lines: 'straight',
    rootStyle: { combStyle: 'web', combSize: 'outward' },
    outline: {
      'Design System': [
        { Color: ['Palette', 'Tokens', 'Contrast'] },
        { Type: ['Scale', 'Weights'] },
        { Space: ['Grid', 'Gaps'] },
        { Motion: ['Easing', 'Duration'] },
        { Components: ['Buttons', 'Inputs', 'Cards'] },
      ],
    },
  },
]

// ── Seeder ──────────────────────────────────────────────────────────────────
const APP = (process.env.APP ?? 'http://localhost:5173').replace(/\/$/, '')
const KEY = (process.env.KEY ?? process.env.MINDMAPS_API_SECRET ?? process.env.MINDMAP_AI_API_KEY ?? '').trim()
const DRY = process.argv.includes('--dry')
/** Every showcase map ships on the white canvas - see the note at the top of this file. */
const THEME = 'default'
const REPLACE = process.argv.includes('--replace')
// --only=<text>: seed (and with --replace, clear) just the demos whose title contains it.
const ONLY = (process.argv.find(a => a.startsWith('--only=')) ?? '').slice(7).toLowerCase()
const PICKED = DEMOS.filter(d => !ONLY || d.title.toLowerCase().includes(ONLY))

const auth = () => (KEY ? { Authorization: `Bearer ${KEY}` } : {})

function styleSummary(d) {
  const shapes = [...new Set(JSON.stringify(d.outline).match(/"shape":"(\w+)"/g) ?? [])]
    .map(s => s.split('"')[3])
  return [d.lines, ...shapes, ...Object.entries(d.rootStyle ?? {}).map(([k, v]) => `${k}=${v}`)].join(' ')
}

// Clears the existing showcase maps so a re-seed replaces them instead of stacking a
// second set of 12 next to the first. Only maps carrying the `demo` tag are touched.
async function clearDemos() {
  const res = await fetch(`${APP}/api/mindmaps`, { headers: auth() })
  if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`)
  const maps = (await res.json()).filter(m => (m.tags ?? []).includes('demo') && PICKED.some(d => d.title === m.name))
  console.log(`--replace: deleting ${maps.length} existing demo map(s)`)
  for (const m of maps) {
    const r = await fetch(`${APP}/api/mindmaps?id=${m.id}`, { method: 'DELETE', headers: auth() })
    console.log(`  ${r.status} ${m.name}`)
    if (!r.ok) process.exitCode = 1
  }
}

async function main() {
  if (DRY) {
    const count = kids => kids.reduce((n, k) => n + 1 + (typeof k === 'string' ? 0 : count(Object.values(k).find(Array.isArray) ?? [])), 0)
    for (const d of PICKED) {
      const nodes = 1 + count(Object.values(d.outline)[0])
      console.log(`${d.type.padEnd(12)} ${String(nodes).padStart(3)} nodes  ${d.title.padEnd(32)} ${styleSummary(d)}`)
    }
    return
  }
  if (REPLACE) await clearDemos()
  for (const d of PICKED) {
    const res = await fetch(`${APP}/api/ai/mindmaps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth() },
      body: JSON.stringify({
        title: d.title, type: d.type, outline: JSON.stringify(d.outline),
        themeId: THEME, lineStyle: d.lines, rootStyle: d.rootStyle,
        sharing: true, tags: ['demo'],
      }),
    })
    const body = await res.json().catch(() => ({}))
    console.log(res.status, d.type.padEnd(12), d.title.padEnd(32), body.id ?? body.error ?? '')
    if (!res.ok) process.exitCode = 1
  }
}

// Only seed when this file is RUN. Importing it (e.g. a preview script that
// renders the outlines locally) must not write 12 rows to the database.
if (process.argv[1] && process.argv[1].endsWith('seed-demos.mjs')) main()
