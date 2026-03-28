import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const BRANCH_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#84cc16', '#f43f5e',
]

const SYSTEM_PROMPT = `You are a mindmap generator. Create a structured, detailed mindmap based on the user's request.

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
  user, bot, server, database, zap, plug, git-branch, globe, brain, settings,
  folder, cloud, mail, lock, key, search, star, rocket, lightbulb, flame,
  check-circle, map-pin, trophy, message, phone, wrench, chart, eye, music,
  heart, flag, shield, flask, trending, paint, sparkles, smile, home, building,
  briefcase, graduate, gift, clock, calendar, file, cog, cpu, link, code,
  terminal, package, layers, bell, alert, info, help, refresh, share, download,
  upload, image, video, mic, headphones, camera, monitor, wifi, card, cart,
  dollar, pie, activity, target, crosshair, compass, map, bookmark, tag, hash, at, send
- Icons must semantically match the category content
- Subcategories should be specific and descriptive (4-10 words each)
- Return ONLY the JSON object, nothing else`

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

  const rootId = randomUUID()
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
      const id = randomUUID()
      colorById.set(id, parentColor)
      nodes.push({
        id, title: obj.trim(), parentId, depth,
        x: 0, y: 0,
        width: computeWidth(obj.trim(), depth),
        height: 40,
        color: parentColor, sortOrder, manuallyPositioned: false,
      })
      return
    }

    const titleKey = Object.keys(obj).find(k => !META_KEYS.has(k))
    if (!titleKey) return

    const icon = obj.icon as string | undefined
    const id = randomUUID()

    // L1 gets its own branch color; deeper nodes inherit from parent
    const color = depth === 1
      ? BRANCH_COLORS[branchColorIdx++ % BRANCH_COLORS.length]
      : parentColor
    colorById.set(id, color)

    nodes.push({
      id, title: titleKey.trim(), parentId, depth,
      x: 0, y: 0,
      width: computeWidth(titleKey.trim(), depth),
      height: 40,
      color, sortOrder, manuallyPositioned: false,
      icon,
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

export default async function handler(req: Request): Promise<Response> {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })

  // Auth
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  const expectedToken = process.env.MINDMAP_AI_API_KEY
  if (!expectedToken || token !== expectedToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors })
  }

  let body: { prompt?: string; userId?: string; type?: string; themeId?: string }
  try { body = await req.json() } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: cors })
  }

  const { prompt, userId = null, type = 'logic-chart', themeId = 'default' } = body
  if (!prompt?.trim()) {
    return Response.json({ error: 'prompt is required' }, { status: 400, headers: cors })
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    return Response.json({ error: 'Server misconfigured — missing ANTHROPIC_API_KEY' }, { status: 500, headers: cors })
  }

  // Call Claude
  let aiRes: Response
  try {
    aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt.trim() }],
      }),
    })
  } catch (e) {
    console.error('Anthropic fetch error:', e)
    return Response.json({ error: 'Failed to reach AI service' }, { status: 502, headers: cors })
  }

  if (!aiRes.ok) {
    const err = await aiRes.text()
    console.error('Anthropic API error:', err)
    return Response.json({ error: 'AI generation failed', detail: err.slice(0, 200) }, { status: 502, headers: cors })
  }

  const aiData = await aiRes.json() as { content: Array<{ type: string; text: string }> }
  let rawText = aiData.content?.find(b => b.type === 'text')?.text ?? ''

  // Strip markdown code fences if present
  rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  let parsed: unknown
  try { parsed = JSON.parse(rawText) } catch {
    console.error('AI returned non-JSON:', rawText.slice(0, 300))
    return Response.json({ error: 'AI returned invalid JSON' }, { status: 502, headers: cors })
  }

  const result = parseJsonOutline(parsed)
  if (!result) {
    return Response.json({ error: 'AI returned unexpected structure' }, { status: 502, headers: cors })
  }

  const { title, nodes } = result

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Server misconfigured — missing Supabase env vars' }, { status: 500, headers: cors })
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const id = randomUUID()

  const { error: dbError } = await supabase.from('mindmaps').insert({
    id,
    user_id: userId,
    name: title,
    type,
    line_style: 'orthogonal',
    sharing_enabled: false,
    theme_id: themeId,
    nodes,
  })

  if (dbError) {
    console.error('Supabase insert error:', dbError)
    return Response.json({ error: dbError.message }, { status: 500, headers: cors })
  }

  const appUrl = process.env.MINDMAP_APP_URL ?? 'https://mindmaps-bheng.vercel.app'
  return Response.json(
    { id, title, url: `${appUrl}/?id=${id}`, nodeCount: nodes.length },
    { status: 201, headers: cors },
  )
}
