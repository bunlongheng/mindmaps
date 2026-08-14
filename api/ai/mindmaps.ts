export const config = { runtime: "nodejs" }
import type { VercelRequest, VercelResponse } from '@vercel/node'

import { pool } from '../_lib/db.js'
import { corsHeaders } from '../_lib/cors.js'
import { authorizeOwner } from '../_lib/authorizeOwner.js'
import {
  parseIndentedOutline, normalizeOutlineRoots, assembleOutlineTree,
  flattenJsonOutline, computeImportNodeWidth, OUTLINE_META_KEYS,
  type OutlineNode,
} from '../../src/lib/outline.js'

const DEFAULT_BRANCH_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4',
]

function parseOutline(text: string, BRANCH_COLORS: string[] = DEFAULT_BRANCH_COLORS): OutlineNode[] {
  const parsed = normalizeOutlineRoots(parseIndentedOutline(text))
  if (!parsed.length) return []

  const { parentIndex, depths, siblingTotals } = assembleOutlineTree(parsed)
  const nodeIds = parsed.map(() => crypto.randomUUID())

  let branchIdx = 0
  const colorById = new Map<string, string>()

  return parsed.map((p, i) => {
    const depth = depths[i]
    const parentIdx = parentIndex[i]
    const parentId = parentIdx !== null ? nodeIds[parentIdx] : null
    let color: string
    if (depth === 0) color = BRANCH_COLORS[0]
    else if (depth === 1) color = BRANCH_COLORS[branchIdx++ % BRANCH_COLORS.length]
    else color = parentId ? (colorById.get(parentId) ?? BRANCH_COLORS[0]) : BRANCH_COLORS[0]
    colorById.set(nodeIds[i], color)

    return {
      id: nodeIds[i], title: p.title, parentId,
      depth, x: 0, y: 0,
      width: computeImportNodeWidth(p.title, depth),
      height: depth === 0 ? 180 : 40,
      // Legacy quirk kept as-is: sortOrder here is the parent's total child count, not
      // the per-child index. Layouts sort stably, so render order is unchanged.
      color, sortOrder: siblingTotals.get(parentIdx) ?? 0,
      manuallyPositioned: false,
    }
  })
}

function parseJsonOutline(json: unknown, BRANCH_COLORS: string[] = DEFAULT_BRANCH_COLORS): { title: string; nodes: OutlineNode[] } | null {
  return flattenJsonOutline(json, {
    metaKeys: OUTLINE_META_KEYS,
    computeWidth: computeImportNodeWidth,
    rootColor: BRANCH_COLORS[0],
    branchColor: (i) => BRANCH_COLORS[i % BRANCH_COLORS.length],
    useExplicitColor: true,
    useEmoji: true,
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(corsHeaders(req.headers?.origin, 'POST, OPTIONS')).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Public RENDER-ONLY endpoint: static Bearer key (external agents), owner session, or
  // local dev. It never calls a model - it renders the caller's own structure.
  if (!(await authorizeOwner(req.headers, { allowBearer: true }))) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

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
        userId: 'optional; must equal the configured owner id, otherwise the map is created unowned',
        sharing: 'optional bool, default false; set true to make the map readable by id without auth',
        colors: 'optional hex array to override the branch palette',
      },
      note: 'This static key authorizes only the AI/import endpoints. The CRUD API (/api/mindmaps) needs a signed session token.',
    })
  }

  const { title, outline, type: rawType = 'logic-chart', themeId = 'default', lineStyle = 'orthogonal', userId = null, sharing = false, colors } = body
  // Coerce unknown diagram types to the safe default (matches the documented behavior + client legacy-type healing).
  const VALID_TYPES = new Set(['logic-chart', 'mindmap', 'fishbone', 'timeline'])
  const type = VALID_TYPES.has(rawType) ? rawType : 'logic-chart'

  // The static key is shared by any external agent, so it must not be able to attribute a
  // map to an arbitrary owner - only accept a userId that matches the configured owner.
  const ownerId = (process.env.MINDMAP_USER_ID ?? '').trim()
  const ownedUserId = userId && userId === ownerId ? userId : null

  // Per-request palette (no cross-request mutation of the shared default).
  const palette = [...DEFAULT_BRANCH_COLORS]
  if (Array.isArray(colors)) {
    colors.forEach((c: string, i: number) => { if (typeof c === 'string') palette[i % palette.length] = c })
  }
  if (!title) return res.status(400).json({ error: 'title is required' })

  const id = crypto.randomUUID()

  let nodes: OutlineNode[] = []
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
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET name=$3, nodes=$8, updated_at=now()`,
      [id, ownedUserId, title, type, lineStyle, sharing === true, themeId, JSON.stringify(nodes), ['API']]
    )
  } catch (e: unknown) {
    console.error('ai/mindmaps: save failed', e)
    return res.status(500).json({ error: 'Failed to save diagram' })
  }

  const appUrl = process.env.MINDMAP_APP_URL ?? 'https://mindmaps-bheng.vercel.app'
  return res.status(201).json({ id, url: `${appUrl}/?id=${id}`, nodeCount: nodes.length })
}
