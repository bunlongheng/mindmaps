export const config = { runtime: "nodejs" }

import { Pool } from 'pg'
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const BRANCH_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#84cc16', '#f43f5e',
]

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0')
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

// Evenly spread branch hues across a smooth rainbow so colors flow gradually
// with no duplicates, regardless of how many branches there are.
function branchColor(i: number, total: number): string {
  if (total <= 1) return hslToHex(230, 68, 58)
  const hue = (i / total) * 300 // red → violet, stops short of wrapping back to red
  return hslToHex(hue, 68, 58)
}

const ICON_LIST = `user, bot, server, database, zap, plug, git-branch, globe, brain, settings,
  folder, cloud, mail, lock, key, search, star, rocket, lightbulb, flame,
  check-circle, map-pin, trophy, message, phone, wrench, chart, eye, music,
  heart, flag, shield, flask, trending, paint, sparkles, smile, home, building,
  briefcase, graduate, gift, clock, calendar, file, cog, cpu, link, code,
  terminal, package, layers, bell, alert, info, help, refresh, share, download,
  upload, image, video, mic, headphones, camera, monitor, wifi, card, cart,
  dollar, pie, activity, target, crosshair, compass, map, bookmark, tag, hash, at, send`

const MINDMAP_TOOL = {
  name: 'create_mindmap',
  description: 'Build a mindmap from the user request by emitting a root title and a list of branches.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Concise root title, 2-5 words' },
      branches: {
        type: 'array',
        description: 'Top-level branches of the mindmap',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Branch label, specific and descriptive (4-10 words)' },
            icon: { type: 'string', description: `One icon name from: ${ICON_LIST}` },
            children: {
              type: 'array',
              description: 'Sub-items as plain strings (empty for a flat list)',
              items: { type: 'string' },
            },
          },
          required: ['label', 'icon', 'children'],
        },
      },
    },
    required: ['title', 'branches'],
  },
} as const

const SYSTEM_PROMPT_CATEGORIZED = `You are a mindmap generator. Build a structured, detailed mindmap by calling the create_mindmap tool.

RULES:
- title: concise, 2-5 words
- Maximum 12 branches (top-level categories)
- Each branch has 3-10 children (subcategory strings)
- Every branch MUST have an icon semantically matching its content
- Children should be specific and descriptive (4-10 words each)
- Always call the create_mindmap tool; never reply with plain text`

const SYSTEM_PROMPT_FLAT = `You are a mindmap generator. Build a flat, single-level mindmap by calling the create_mindmap tool.

The user wants a simple list — NOT grouped by category. Each branch is a direct item with NO children.

RULES:
- title: concise, 2-5 words
- Return exactly the number of branches the user asked for (e.g. "top 10" = 10 branches)
- Each branch's children array MUST be empty []
- Every branch MUST have an icon semantically matching its content
- Branch labels should be specific and descriptive (4-10 words each)
- Always call the create_mindmap tool; never reply with plain text`

// Detect if the user wants a flat list vs categorized breakdown
function wantsFlatList(prompt: string): boolean {
  const p = prompt.toLowerCase()
  // Explicit category request — always use categorized
  if (/\b(categor|group\s*by|break\s*down|breakdown|organize\s*by|sort\s*by|classify)\b/.test(p)) return false
  // Flat list signals: "top N", "N best", "list of N", "give me N", "name N", etc.
  if (/\b(top\s+\d|best\s+\d|\d+\s+best|\d+\s+top|list\s+(of\s+)?\d|\d+\s+things|\d+\s+ways|\d+\s+tips|\d+\s+ideas|\d+\s+reasons|give\s+me\s+\d|name\s+\d|rank\s+\d)\b/.test(p)) return true
  // "just list", "simple list", "flat list", "straight list"
  if (/\b(just\s+list|simple\s+list|flat\s+list|straight\s+list|just\s+give\s+me|no\s+categor)\b/.test(p)) return true
  return false
}

const META_KEYS = new Set([
  'icon', 'emoji', 'bold', 'italic', 'fontSize',
  'textAlign', 'title', 'name', 'children', 'type', 'lineStyle',
])

interface MindmapNode {
  id: string
  title: string
  parentId: string | null
  depth: number
  x: number
  y: number
  width: number
  height: number
  color: string
  sortOrder: number
  manuallyPositioned: boolean
  icon?: string
}

// Pull a JSON object out of whatever the model returns: tolerates markdown
// fences, leading/trailing prose, and trailing commas. Returns undefined if
// nothing parseable is found.
function extractJson(text: string): unknown {
  if (!text) return undefined
  let s = text.replace(/```(?:json)?/gi, '').trim()

  // Try the whole thing first.
  const tryParse = (str: string): unknown => {
    try { return JSON.parse(str) } catch { /* fall through */ }
    try { return JSON.parse(str.replace(/,\s*([}\]])/g, '$1')) } catch { return undefined }
  }

  const direct = tryParse(s)
  if (direct !== undefined) return direct

  // Otherwise grab the outermost {...} by brace matching.
  const start = s.indexOf('{')
  if (start === -1) return undefined
  let depth = 0
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        const candidate = s.slice(start, i + 1)
        const out = tryParse(candidate)
        if (out !== undefined) return out
      }
    }
  }
  return undefined
}

function computeWidth(title: string, depth: number): number {
  if (depth === 0) return 180
  const charW = depth === 1 ? 10.24 : depth === 2 ? 8.19 : 7.04
  return Math.max(120, Math.min(300, Math.ceil(title.length * charW) + 32))
}

function parseJsonOutline(json: unknown): { title: string; nodes: MindmapNode[] } | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null
  const entries = Object.entries(json as Record<string, unknown>)
  if (!entries.length) return null

  const [rootKey, rootChildren] = entries[0]
  const nodes: MindmapNode[] = []
  let branchColorIdx = 0
  const colorById = new Map<string, string>()

  const rootId = crypto.randomUUID()
  colorById.set(rootId, BRANCH_COLORS[0])
  nodes.push({
    id: rootId, title: rootKey.trim(), parentId: null, depth: 0,
    x: 0, y: 0, width: 180, height: 180,
    color: BRANCH_COLORS[0], sortOrder: 0, manuallyPositioned: false,
  })

  function flattenNode(
    obj: Record<string, unknown> | string,
    parentId: string,
    depth: number,
    sortOrder: number,
    maxChildren: number,
    branchTotal: number,
  ) {
    const parentColor = colorById.get(parentId) ?? BRANCH_COLORS[0]

    if (typeof obj === 'string') {
      const id = crypto.randomUUID()
      colorById.set(id, parentColor)
      nodes.push({
        id, title: obj.trim(), parentId, depth,
        x: 0, y: 0, width: computeWidth(obj.trim(), depth), height: 40,
        color: parentColor, sortOrder, manuallyPositioned: false,
      })
      return
    }

    const titleKey = Object.keys(obj).find(k => !META_KEYS.has(k))
    if (!titleKey) return

    const icon = obj.icon as string | undefined
    const id = crypto.randomUUID()
    const color = depth === 1
      ? branchColor(branchColorIdx++, branchTotal)
      : parentColor
    colorById.set(id, color)

    nodes.push({
      id, title: titleKey.trim(), parentId, depth,
      x: 0, y: 0, width: computeWidth(titleKey.trim(), depth), height: 40,
      color, sortOrder, manuallyPositioned: false, icon,
    })

    const kids = obj[titleKey]
    if (Array.isArray(kids)) {
      kids.slice(0, maxChildren).forEach((child, i) => {
        flattenNode(child as Record<string, unknown> | string, id, depth + 1, i, 10, branchTotal)
      })
    }
  }

  if (Array.isArray(rootChildren)) {
    const branches = rootChildren.slice(0, 12)
    branches.forEach((child, i) => {
      flattenNode(child as Record<string, unknown> | string, rootId, 1, i, 10, branches.length)
    })
  }

  return { title: rootKey.trim(), nodes }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const rawAuth = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  const staticKey = (process.env.MINDMAP_AI_API_KEY ?? '').trim()
  if (!staticKey || rawAuth !== staticKey) return res.status(401).json({ error: 'Unauthorized' })

  const { prompt, userId = null, type = 'logic-chart', themeId = 'default' } = req.body || {}
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' })

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.replace(/\\n/g, '').trim()
  if (!anthropicKey) return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY' })

  let aiRes
  try {
    aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: wantsFlatList(prompt) ? SYSTEM_PROMPT_FLAT : SYSTEM_PROMPT_CATEGORIZED,
        tools: [MINDMAP_TOOL],
        tool_choice: { type: 'tool', name: MINDMAP_TOOL.name },
        messages: [{ role: 'user', content: prompt.trim() }],
      }),
    })
  } catch (e: any) {
    return res.status(502).json({ error: 'Failed to reach AI service', detail: e.message })
  }

  if (!aiRes.ok) {
    const err = await aiRes.text()
    return res.status(502).json({ error: 'AI generation failed', detail: err.slice(0, 200) })
  }

  const aiData = await aiRes.json() as { content: Array<{ type: string; text?: string; name?: string; input?: any }> }

  // Preferred path: forced tool_use returns a guaranteed-valid object.
  const toolUse = aiData.content?.find((b: any) => b.type === 'tool_use' && b.name === MINDMAP_TOOL.name)
  let parsed: unknown
  if (toolUse?.input && typeof toolUse.input === 'object') {
    const { title, branches } = toolUse.input as { title?: string; branches?: Array<{ label?: string; icon?: string; children?: string[] }> }
    if (title && Array.isArray(branches)) {
      parsed = {
        [title]: branches
          .filter(b => b?.label)
          .map(b => ({ icon: b.icon, [b.label as string]: Array.isArray(b.children) ? b.children : [] })),
      }
    }
  }

  // Fallback: tolerant text extraction (in case the model emits text anyway).
  if (parsed === undefined) {
    const rawText = aiData.content?.find((b: any) => b.type === 'text')?.text ?? ''
    parsed = extractJson(rawText)
    if (parsed === undefined) {
      return res.status(502).json({ error: 'AI returned invalid JSON', raw: rawText.slice(0, 200) })
    }
  }

  const result = parseJsonOutline(parsed)
  if (!result) return res.status(502).json({ error: 'AI returned unexpected structure' })

  const { title, nodes } = result
  const id = crypto.randomUUID()

  try {
    await pool.query(
      `INSERT INTO mindmaps (id, user_id, name, type, line_style, sharing_enabled, theme_id, nodes, tags)
       VALUES ($1,$2,$3,$4,'orthogonal',true,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET name=$3, nodes=$6, updated_at=now()`,
      [id, userId ?? null, title, type, themeId, JSON.stringify(nodes), ['AI']]
    )
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to save diagram', detail: e.message })
  }

  const appUrl = process.env.MINDMAP_APP_URL ?? 'https://mindmaps-bheng.vercel.app'
  return res.status(201).json({ id, title, url: `${appUrl}/?id=${id}`, nodeCount: nodes.length })
}
