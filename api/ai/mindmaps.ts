export const config = { runtime: "nodejs" }

import { pool } from '../_lib/db.js'
import { corsHeaders } from '../_lib/cors.js'

const DEFAULT_BRANCH_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4',
]

const META_KEYS = new Set(['icon', 'emoji', 'bold', 'italic', 'fontSize', 'textAlign', 'title', 'name', 'children', 'type', 'lineStyle', 'color'])

interface MindmapNode {
  id: string; title: string; parentId: string | null; depth: number
  x: number; y: number; width: number; height: number
  color: string; sortOrder: number; manuallyPositioned: boolean
  icon?: string; emoji?: string
}

function computeWidth(title: string, depth: number): number {
  if (depth === 0) return 180
  const base = Math.max(100, title.length * 7.5 + 32)
  return Math.min(base, 260)
}

function parseOutline(text: string, BRANCH_COLORS: string[] = DEFAULT_BRANCH_COLORS): MindmapNode[] {
  const lines = text.split('\n').filter(l => l.trim())
  if (!lines.length) return []

  type Item = { title: string; indent: number }
  const parsed: Item[] = lines.map(line => {
    const match = line.match(/^(\s*)(.+)$/)
    if (!match) return null
    const ws = match[1]
    const indent = ws.includes('\t') ? (ws.match(/\t/g)?.length ?? 0) : Math.floor(ws.length / 2)
    return { title: match[2].trim(), indent }
  }).filter(Boolean) as Item[]

  const minIndent = Math.min(...parsed.map(p => p.indent))
  parsed.forEach(p => { p.indent -= minIndent })

  const rootCount = parsed.filter(p => p.indent === 0).length
  if (rootCount > 1) {
    const firstTitle = parsed[0].title
    parsed.forEach(p => { p.indent += 1 })
    parsed.unshift({ title: firstTitle, indent: 0 })
  }

  const nodeIds = parsed.map(() => crypto.randomUUID())
  const parentIds: (string | null)[] = []
  const depths: number[] = []
  const siblingCount = new Map<string | null, number>()
  const parentStack: number[] = []

  for (let i = 0; i < parsed.length; i++) {
    const { indent } = parsed[i]
    while (parentStack.length > 0 && parsed[parentStack[parentStack.length - 1]].indent >= indent) {
      parentStack.pop()
    }
    const parentIdx = parentStack.length > 0 ? parentStack[parentStack.length - 1] : null
    const parentId = parentIdx !== null ? nodeIds[parentIdx] : null
    const order = siblingCount.get(parentId) ?? 0
    siblingCount.set(parentId, order + 1)
    parentIds.push(parentId)
    depths.push(indent)
    parentStack.push(i)
  }

  let branchIdx = 0
  const colorById = new Map<string, string>()

  return parsed.map((p, i) => {
    const depth = depths[i]
    const parentId = parentIds[i]
    let color: string
    if (depth === 0) color = BRANCH_COLORS[0]
    else if (depth === 1) color = BRANCH_COLORS[branchIdx++ % BRANCH_COLORS.length]
    else color = parentId ? (colorById.get(parentId) ?? BRANCH_COLORS[0]) : BRANCH_COLORS[0]
    colorById.set(nodeIds[i], color)

    return {
      id: nodeIds[i], title: p.title, parentId,
      depth, x: 0, y: 0,
      width: computeWidth(p.title, depth),
      height: depth === 0 ? 180 : 40,
      color, sortOrder: siblingCount.get(parentId) ?? 0,
      manuallyPositioned: false,
    }
  })
}

function parseJsonOutline(json: unknown, BRANCH_COLORS: string[] = DEFAULT_BRANCH_COLORS): { title: string; nodes: MindmapNode[] } | null {
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

  function flattenNode(obj: Record<string, unknown> | string, parentId: string, depth: number, sortOrder: number) {
    const parentColor = colorById.get(parentId) ?? BRANCH_COLORS[0]
    if (typeof obj === 'string') {
      const id = crypto.randomUUID()
      colorById.set(id, parentColor)
      nodes.push({ id, title: obj.trim(), parentId, depth, x: 0, y: 0, width: computeWidth(obj.trim(), depth), height: 40, color: parentColor, sortOrder, manuallyPositioned: false })
      return
    }
    const titleKey = Object.keys(obj).find(k => !META_KEYS.has(k))
    if (!titleKey) return
    const id = crypto.randomUUID()
    const autoColor = depth === 1 ? BRANCH_COLORS[branchColorIdx++ % BRANCH_COLORS.length] : parentColor
    const color = (typeof obj.color === 'string' && obj.color.trim()) ? obj.color.trim() : autoColor
    colorById.set(id, color)
    nodes.push({ id, title: titleKey.trim(), parentId, depth, x: 0, y: 0, width: computeWidth(titleKey.trim(), depth), height: 40, color, sortOrder, manuallyPositioned: false, icon: obj.icon as string | undefined, emoji: obj.emoji as string | undefined })
    const kids = obj[titleKey]
    if (Array.isArray(kids)) kids.slice(0, 10).forEach((child, i) => flattenNode(child as Record<string, unknown> | string, id, depth + 1, i))
  }

  if (Array.isArray(rootChildren)) rootChildren.slice(0, 12).forEach((child, i) => flattenNode(child as Record<string, unknown> | string, rootId, 1, i))
  return { title: rootKey.trim(), nodes }
}

export default async function handler(req: any, res: any) {
  Object.entries(corsHeaders(req.headers?.origin, 'POST, OPTIONS')).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  const expectedToken = (process.env.MINDMAP_AI_API_KEY ?? '').trim()
  if (!expectedToken || token !== expectedToken) return res.status(401).json({ error: 'Unauthorized' })

  // Self-documenting discovery: a call with no body returns a copy-paste-ready sample.
  const body = req.body || {}
  if (!body || Object.keys(body).length === 0) {
    return res.status(200).json({
      about: 'Create a mindmap in the mindmaps-bheng app. POST this shape with your Bearer key.',
      sample_request: {
        method: 'POST',
        url: 'https://mindmaps-bheng.vercel.app/api/ai/mindmaps',
        headers: { Authorization: 'Bearer $MINDMAP_AI_API_KEY', 'Content-Type': 'application/json' },
        body: {
          title: 'My Mindmap Title',
          type: 'logic-chart',
          outline: '{"Root":[{"icon":"brain","Category A":["item 1","item 2"]},{"icon":"zap","Category B":["item 3"]}]}',
        },
      },
      fields: {
        title: 'required string',
        outline: 'optional; indented text OR a JSON string (auto-detected); omit for an empty root',
        type: 'logic-chart | mindmap | fishbone | timeline (default logic-chart)',
        themeId: 'optional (default "default")',
        lineStyle: 'optional (default "orthogonal")',
        userId: 'optional owner id so the map shows in the library',
        colors: 'optional hex array to override the branch palette',
      },
      note: 'This static key authorizes only the AI/import endpoints. The CRUD API (/api/mindmaps) needs a signed session token.',
    })
  }

  const { title, outline, type = 'logic-chart', themeId = 'default', lineStyle = 'orthogonal', userId = null, colors } = body

  // Per-request palette (no cross-request mutation of the shared default).
  const palette = [...DEFAULT_BRANCH_COLORS]
  if (Array.isArray(colors)) {
    colors.forEach((c: string, i: number) => { if (typeof c === 'string') palette[i % palette.length] = c })
  }
  if (!title) return res.status(400).json({ error: 'title is required' })

  const id = crypto.randomUUID()

  let nodes: MindmapNode[] = []
  if (outline) {
    const trimmed = outline.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { const result = parseJsonOutline(JSON.parse(trimmed), palette); if (result) nodes = result.nodes } catch {}
    }
    if (!nodes.length) nodes = parseOutline(outline, palette)
  }

  try {
    await pool.query(
      `INSERT INTO mindmaps (id, user_id, name, type, line_style, sharing_enabled, theme_id, nodes, tags)
       VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET name=$3, nodes=$7, updated_at=now()`,
      [id, userId ?? null, title, type, lineStyle, themeId, JSON.stringify(nodes), ['API']]
    )
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to save diagram', detail: e.message })
  }

  const appUrl = process.env.MINDMAP_APP_URL ?? 'https://mindmaps-bheng.vercel.app'
  return res.status(201).json({ id, url: `${appUrl}/?id=${id}`, nodeCount: nodes.length })
}
