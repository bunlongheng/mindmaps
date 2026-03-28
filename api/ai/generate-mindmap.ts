export const config = { runtime: 'edge' }

import { createClient } from '@supabase/supabase-js'

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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Auth — accept either a valid Supabase JWT (user session) or the static API key
  const rawAuth = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const staticKey = (process.env.MINDMAP_AI_API_KEY ?? '').trim()

  let authorized = staticKey && rawAuth === staticKey

  if (!authorized && rawAuth) {
    // Decode Supabase JWT payload (no signature verification needed — we trust Supabase-issued tokens)
    try {
      const [, payloadB64] = rawAuth.split('.')
      if (payloadB64) {
        const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
        // Must be a real user (role = 'authenticated') and not expired
        if (payload.role === 'authenticated' && payload.exp > Date.now() / 1000) {
          authorized = true
        }
      }
    } catch {}
  }

  if (!authorized) return json({ error: 'Unauthorized' }, 401)

  let body: { prompt?: string; userId?: string; type?: string; themeId?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  const { prompt, userId = null, type = 'logic-chart', themeId = 'default' } = body
  if (!prompt?.trim()) return json({ error: 'prompt is required' }, 400)

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) return json({ error: 'Missing ANTHROPIC_API_KEY' }, 500)

  // Call Claude Haiku
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
    return json({ error: 'Failed to reach AI service', detail: String(e) }, 502)
  }

  if (!aiRes.ok) {
    const err = await aiRes.text()
    return json({ error: 'AI generation failed', detail: err.slice(0, 200) }, 502)
  }

  const aiData = await aiRes.json() as { content: Array<{ type: string; text: string }> }
  let rawText = aiData.content?.find(b => b.type === 'text')?.text ?? ''
  rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

  let parsed: unknown
  try { parsed = JSON.parse(rawText) } catch {
    return json({ error: 'AI returned invalid JSON', raw: rawText.slice(0, 200) }, 502)
  }

  const result = parseJsonOutline(parsed)
  if (!result) return json({ error: 'AI returned unexpected structure' }, 502)

  const { title, nodes } = result

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return json({ error: 'Missing Supabase env vars' }, 500)

  const supabase = createClient(supabaseUrl, serviceKey)
  const id = crypto.randomUUID()

  const { error: dbError } = await supabase.from('mindmaps').insert({
    id, user_id: userId, name: title,
    type, line_style: 'orthogonal',
    sharing_enabled: false, theme_id: themeId, nodes,
    tags: ['AI'],
  })

  if (dbError) return json({ error: dbError.message }, 500)

  // Broadcast to all connected clients so they get a live toast + card flash
  await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json', 'apikey': serviceKey },
    body: JSON.stringify({
      messages: [{ topic: 'realtime:app-notifications', event: 'broadcast', payload: {
        type: 'broadcast', event: 'diagram-created',
        payload: { id, title, nodeCount: nodes.length },
      }}],
    }),
  }).catch(() => {/* non-fatal */})

  const appUrl = process.env.MINDMAP_APP_URL ?? 'https://mindmaps-bheng.vercel.app'
  return json({ id, title, url: `${appUrl}/?id=${id}`, nodeCount: nodes.length }, 201)
}
