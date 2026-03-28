import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

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
  emoji?: string
}

const BRANCH_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4',
]

function computeWidth(title: string, depth: number): number {
  if (depth === 0) return 180
  const base = Math.max(100, title.length * 7.5 + 32)
  return Math.min(base, 260)
}

function parseOutline(text: string): MindmapNode[] {
  const lines = text.split('\n').filter(l => l.trim())
  if (!lines.length) return []

  type Item = { title: string; indent: number }
  const parsed: Item[] = lines.map(line => {
    const match = line.match(/^(\s*)(.+)$/)
    if (!match) return null
    const ws = match[1]
    const indent = ws.includes('\t')
      ? (ws.match(/\t/g)?.length ?? 0)
      : Math.floor(ws.length / 2)
    return { title: match[2].trim(), indent }
  }).filter(Boolean) as Item[]

  // Normalize so minimum indent is 0
  const minIndent = Math.min(...parsed.map(p => p.indent))
  parsed.forEach(p => { p.indent -= minIndent })

  // Wrap multiple roots under the first item
  const rootCount = parsed.filter(p => p.indent === 0).length
  if (rootCount > 1) {
    const firstTitle = parsed[0].title
    parsed.forEach(p => { p.indent += 1 })
    parsed.unshift({ title: firstTitle, indent: 0 })
  }

  const nodeIds = parsed.map(() => randomUUID())
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

  // Assign branch colors — each root child gets its own color
  const rootId = nodeIds[0]
  const branchColorMap = new Map<string, string>()
  let branchIdx = 0
  parsed.forEach((_, i) => {
    if (parentIds[i] === rootId) {
      branchColorMap.set(nodeIds[i], BRANCH_COLORS[branchIdx++ % BRANCH_COLORS.length])
    }
  })

  function getBranchColor(nodeId: string, parentId: string | null, depth: number): string {
    if (depth === 0) return BRANCH_COLORS[0]
    if (branchColorMap.has(nodeId)) return branchColorMap.get(nodeId)!
    // Walk up to find branch ancestor
    if (parentId && branchColorMap.has(parentId)) return branchColorMap.get(parentId)!
    return BRANCH_COLORS[0]
  }

  return parsed.map((p, i) => ({
    id: nodeIds[i],
    title: p.title,
    parentId: parentIds[i],
    depth: depths[i],
    x: 0,
    y: 0,
    width: computeWidth(p.title, depths[i]),
    height: depths[i] === 0 ? 180 : 40,
    color: getBranchColor(nodeIds[i], parentIds[i], depths[i]),
    sortOrder: siblingCount.get(parentIds[i]) ?? 0,
    manuallyPositioned: false,
  }))
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  // Auth
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  const expectedToken = process.env.MINDMAP_AI_API_KEY
  if (!expectedToken || token !== expectedToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    title?: string
    outline?: string
    type?: string
    themeId?: string
    lineStyle?: string
    userId?: string
    isFavorite?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    title,
    outline,
    type = 'logic-chart',
    themeId = 'default',
    lineStyle = 'orthogonal',
    userId = null,
    isFavorite = false,
  } = body

  if (!title) return Response.json({ error: 'title is required' }, { status: 400 })

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Server misconfigured — missing Supabase env vars' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const id = randomUUID()
  const nodes = outline ? parseOutline(outline) : []

  const { error } = await supabase.from('mindmaps').insert({
    id,
    user_id: userId,
    name: title,
    type,
    line_style: lineStyle,
    sharing_enabled: true,
    theme_id: themeId,
    nodes,
    is_favorite: isFavorite,
  })

  if (error) {
    console.error('Supabase insert error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  const appUrl = process.env.MINDMAP_APP_URL ?? 'https://mindmaps-bheng.vercel.app'
  const url = `${appUrl}/?id=${id}`

  return Response.json(
    { id, url, nodeCount: nodes.length },
    {
      status: 201,
      headers: { 'Access-Control-Allow-Origin': '*' },
    }
  )
}
