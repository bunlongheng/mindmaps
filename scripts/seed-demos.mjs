// Seeds the 12 showcase maps - the ones behind the Demos tab on the home library
// and the only maps whose share page carries the social footer. Every map is
// tagged `demo`, shared by link, and kept deliberately small (1 root, 4 to 6
// branches, 2 to 4 leaves each) so the diagram reads at card size instead of
// collapsing into a grey mesh.
//
// Usage:
//   node scripts/seed-demos.mjs --dry                  # print what would be sent
//   node scripts/seed-demos.mjs                        # POST to http://localhost:5173
//   APP=https://mindmaps-bheng.vercel.app KEY=... node scripts/seed-demos.mjs
//
// The key comes from the environment (MINDMAPS_API_SECRET / MINDMAP_AI_API_KEY),
// never from this file. Against localhost the dev proxy signs the request, so no
// key is needed there.

// Each entry is { title, type, outline } where outline is the JSON outline the
// API renders: { Root: [ { emoji, Branch: [leaf, ...] } ] }. Emoji, not icon:
// the server renderer draws emoji as real glyphs but stands a lucide icon in as
// a neutral placeholder, and these maps are seen mostly through that renderer
// (share page, home card). The honeycomb pair carries no emoji at all - a hex
// cell is small and the short label alone fills it.
export const DEMOS = [
  // ── logic-chart: the default tree ─────────────────────────────────────────
  {
    title: 'System Design Basics',
    type: 'logic-chart',
    outline: {
      'System Design Basics': [
        { emoji: '📋', Requirements: ['Functional', 'Non-functional', 'Constraints'] },
        { emoji: '🗄️', Data: ['Schema', 'Indexes', 'Caching'] },
        { emoji: '📈', Scale: ['Load Balancer', 'Replicas', 'Sharding'] },
        { emoji: '🛡️', Reliability: ['Retries', 'Timeouts', 'Backups'] },
      ],
    },
  },
  {
    title: 'Product Launch',
    type: 'logic-chart',
    outline: {
      'Product Launch': [
        { emoji: '🔨', Build: ['Scope', 'Design', 'QA Pass'] },
        { emoji: '📣', 'Go To Market': ['Pricing', 'Landing Page', 'Launch Post'] },
        { emoji: '💬', Support: ['Docs', 'FAQ', 'Onboarding'] },
        { emoji: '📊', Measure: ['Signups', 'Retention', 'Feedback'] },
      ],
    },
  },
  {
    title: 'REST API Design',
    type: 'logic-chart',
    outline: {
      'REST API Design': [
        { emoji: '🔗', Resources: ['Plural Paths', 'Nouns Not Verbs', 'Shallow Nesting'] },
        { emoji: '🔁', Methods: ['GET', 'POST', 'PUT', 'DELETE'] },
        { emoji: '📦', Responses: ['Status Codes', 'Pagination', 'Error Shape'] },
        { emoji: '🔐', Security: ['Auth Tokens', 'Rate Limits', 'CORS'] },
      ],
    },
  },

  // ── mindmap: radial ───────────────────────────────────────────────────────
  {
    title: 'Machine Learning',
    type: 'mindmap',
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
  {
    title: 'Personal Finance',
    type: 'mindmap',
    outline: {
      'Personal Finance': [
        { emoji: '💼', Earn: ['Salary', 'Side Income', 'Raises'] },
        { emoji: '🏦', Save: ['Emergency Fund', 'Automate', 'High Yield'] },
        { emoji: '📈', Invest: ['Index Funds', '401k', 'Real Estate'] },
        { emoji: '🛡️', Protect: ['Insurance', 'Credit Score', 'Will'] },
        { emoji: '🧾', Spend: ['Budget', 'Needs First', 'Review Monthly'] },
      ],
    },
  },
  {
    title: 'Learn TypeScript',
    type: 'mindmap',
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

  // ── timeline: spine left to right ─────────────────────────────────────────
  {
    title: 'First 90 Days',
    type: 'timeline',
    outline: {
      'First 90 Days': [
        { emoji: '👋', 'Week 1': ['Meet the Team', 'Read the Docs', 'Set Up Local'] },
        { emoji: '🚢', 'Month 1': ['Ship Something Small', 'Map the System'] },
        { emoji: '🧩', 'Month 2': ['Own a Feature', 'Fix a Rough Edge'] },
        { emoji: '🏁', 'Month 3': ['Lead a Project', 'Set Next Goals'] },
      ],
    },
  },
  {
    title: 'History of the Web',
    type: 'timeline',
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
  {
    title: 'Developer Toolkit',
    type: 'honeycomb',
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
  {
    title: 'Design System',
    type: 'honeycomb',
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

async function main() {
  if (DRY) {
    for (const d of DEMOS) {
      const nodes = 1 + Object.values(d.outline)[0].reduce((n, b) => n + 1 + Object.values(b).filter(Array.isArray)[0].length, 0)
      console.log(`${d.type.padEnd(12)} ${String(nodes).padStart(3)} nodes  ${d.title}`)
    }
    return
  }
  for (const d of DEMOS) {
    const res = await fetch(`${APP}/api/ai/mindmaps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) },
      body: JSON.stringify({ title: d.title, type: d.type, outline: JSON.stringify(d.outline), sharing: true, tags: ['demo'] }),
    })
    const body = await res.json().catch(() => ({}))
    console.log(res.status, d.type.padEnd(12), d.title, body.id ?? body.error ?? '')
    if (!res.ok) process.exitCode = 1
  }
}

// Only seed when this file is RUN. Importing it (e.g. a preview script that
// renders the outlines locally) must not write 12 rows to the database.
if (process.argv[1] && process.argv[1].endsWith('seed-demos.mjs')) main()
