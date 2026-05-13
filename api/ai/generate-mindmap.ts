export const config = { runtime: "nodejs" }

import { Pool } from 'pg'
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const BRANCH_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#84cc16', '#f43f5e',
]

const ICON_LIST = `user, bot, server, database, zap, plug, git-branch, globe, brain, settings,
  folder, cloud, mail, lock, key, search, star, rocket, lightbulb, flame,
  check-circle, map-pin, trophy, message, phone, wrench, chart, eye, music,
  heart, flag, shield, flask, trending, paint, sparkles, smile, home, building,
  briefcase, graduate, gift, clock, calendar, file, cog, cpu, link, code,
  terminal, package, layers, bell, alert, info, help, refresh, share, download,
  upload, image, video, mic, headphones, camera, monitor, wifi, card, cart,
  dollar, pie, activity, target, crosshair, compass, map, bookmark, tag, hash, at, send`

const SYSTEM_PROMPT_CATEGORIZED = `You are a mindmap generator. Create a structured, detailed mindmap based on the user's request.

OUTPUT FORMAT — return ONLY valid JSON, no markdown fences, no explanation:
{
  "Root Title": [
    { "icon": "brain", "Category Name": ["subcategory 1", "subcategory 2", "subcategory 3"] },
    { "icon": "star", "Another Category": ["item 1", "item 2", "item 3"] }
  ]
}

RULES:
- Root Title: concise, 2-5 words
- Maximum 12 top-level categories
- Maximum 10 subcategories per category (minimum 3)
- Every top-level category MUST have exactly one "icon" field chosen from this list:
  ${ICON_LIST}
- Icons must semantically match the category content
- Subcategories should be specific and descriptive (4-10 words each)
- Return ONLY the JSON object, nothing else`

const SYSTEM_PROMPT_FLAT = `You are a mindmap generator. Create a flat, single-level mindmap based on the user's request.

The user wants a simple list — NOT grouped by category. Each item is a direct child of the root.

OUTPUT FORMAT — return ONLY valid JSON, no markdown fences, no explanation:
{
  "Root Title": [
    { "icon": "star", "Item one title here": [] },
    { "icon": "rocket", "Item two title here": [] },
    { "icon": "brain", "Item three title here": [] }
  ]
}

RULES:
- Root Title: concise, 2-5 words
- Return exactly the number of items the user asked for (e.g. "top 10" = 10 items)
- Each item is a direct child of root — NO subcategories, NO nesting
- Every item MUST have exactly one "icon" field chosen from this list:
  ${ICON_LIST}
- Icons must semantically match the item content
- Item titles should be specific and descriptive (4-10 words each)
- Return ONLY the JSON object, nothing else`

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
      ? BRANCH_COLORS[branchColorIdx++ % BRANCH_COLORS.length]
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
        flattenNode(child as Record<string, unknown> | string, id, depth + 1, i, 10)
      })
    }
  }

  if (Array.isArray(rootChildren)) {
    rootChildren.slice(0, 12).forEach((child, i) => {
      flattenNode(child as Record<string, unknown> | string, rootId, 1, i, 10)
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

  const aiData = await aiRes.json() as { content: Array<{ type: string; text: string }> }
  let rawText = aiData.content?.find((b: any) => b.type === 'text')?.text ?? ''
  rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  let parsed: unknown
  try { parsed = JSON.parse(rawText) } catch {
    return res.status(502).json({ error: 'AI returned invalid JSON', raw: rawText.slice(0, 200) })
  }

  const result = parseJsonOutline(parsed)
  if (!result) return res.status(502).json({ error: 'AI returned unexpected structure' })

  const { title, nodes } = result
  const id = crypto.randomUUID()

  try {
    await pool.query(
      `INSERT INTO mindmaps (id, user_id, name, type, line_style, sharing_enabled, theme_id, nodes, tags)
       VALUES ($1,$2,$3,$4,'orthogonal',false,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET name=$3, nodes=$6, updated_at=now()`,
      [id, userId ?? null, title, type, themeId, JSON.stringify(nodes), ['AI']]
    )
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to save diagram', detail: e.message })
  }

  const appUrl = process.env.MINDMAP_APP_URL ?? 'https://mindmaps-bheng.vercel.app'
  return res.status(201).json({ id, title, url: `${appUrl}/?id=${id}`, nodeCount: nodes.length })
}
