#!/usr/bin/env node
// ─── mindmaps MCP server ─────────────────────────────────────────────────────
// Exposes the Mindmaps app (mindmaps-bheng.vercel.app) to any MCP-capable agent
// (Claude Code, Claude Desktop, etc.) so it can create the same mind maps the web
// app renders — from a structure the AGENT writes, not a server-side model call.
//
// Thin wrapper over the app's public render-only endpoint (POST /api/ai/mindmaps).
// It does NOT touch the database and NEVER spends Anthropic credits — the caller
// provides the outline and the app just renders it. All validation stays in the
// route handler, so the MCP path can't drift from the public API.
//
// Only create + schema are exposed: the Mindmaps CRUD API is signed-session-only,
// so a static Bearer can't list/read/delete. Creation is the public contract.
//
// Env: MINDMAP_AI_API_KEY (Bearer, required). Optional: MINDMAP_USER_ID (owner id
// so maps show in the home list; defaults to the known owner) and MINDMAP_APP_URL.
//
// NOTE: separate from the diagrams and system-design MCP servers — different app,
// API, and store. Mind maps ONLY.
import './load-env.mjs' // MUST be first — resolves the env before anything runs
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const APP_URL = (process.env.MINDMAP_APP_URL || 'https://mindmaps-bheng.vercel.app').replace(/\/$/, '')
const SECRET = process.env.MINDMAP_AI_API_KEY
const OWNER_ID = process.env.MINDMAP_USER_ID || '731ace87-64e5-44db-bf2a-82265f06f4d9'
const VALID_TYPES = ['logic-chart', 'mindmap', 'fishbone', 'timeline']

const ok = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] })
const fail = msg => ({ isError: true, content: [{ type: 'text', text: msg }] })

async function api(path, { method = 'POST', body } = {}) {
  if (!SECRET) throw new Error('MINDMAP_AI_API_KEY not set — export it or add it to .env.local')
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${SECRET}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
  if (!res.ok) {
    const detail = json?.error || json?.raw || res.statusText
    throw new Error(`${method} ${path} → ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
  }
  return json
}

const server = new McpServer({ name: 'mindmaps', version: '1.0.0' })

// ── Create ───────────────────────────────────────────────────────────────────
server.registerTool(
  'create_mindmap',
  {
    title: 'Create mindmap',
    description:
      'Create a mind map in the Mindmaps app from an outline YOU write (no server-side AI, no Anthropic spend). `outline` is a JSON string like {"Root":[{"icon":"brain","Category A":["item 1","item 2"]}]} OR indented text (2 spaces per level). Returns the id, shareable url, svg_url, and node count; pass format:"svg" to also get the inline SVG string.',
    inputSchema: {
      title: z.string().describe('The map title / root label, e.g. "Machine Learning"'),
      outline: z.string().describe('JSON-string outline (categories with items, optional per-category "icon") OR indented text. Omit for an empty root.').optional(),
      type: z.enum(VALID_TYPES).optional().describe('Layout (default logic-chart). "top 10"-style flat lists read well as logic-chart/mindmap.'),
      sharing: z.boolean().optional().describe('Make the map readable by URL without auth (default true so the link opens for anyone).'),
      colors: z.array(z.string()).optional().describe('Optional hex colors to override the branch palette.'),
      format: z.enum(['svg']).optional().describe('Pass "svg" to also return the rendered map as an inline self-contained SVG string.'),
    },
  },
  async ({ title, outline, type = 'logic-chart', sharing = true, colors, format }) => {
    try {
      const body = { title, type, userId: OWNER_ID, sharing }
      if (outline != null) body.outline = outline
      if (colors) body.colors = colors
      if (format === 'svg') body.format = 'svg'
      const r = await api('/api/ai/mindmaps', { method: 'POST', body })
      return ok({
        id: r.id, url: r.url, svg_url: r.svg_url, nodeCount: r.nodeCount,
        ...(r.svg ? { svg: r.svg } : {}),
        ...(r.svg_error ? { svg_error: r.svg_error } : {}),
      })
    } catch (e) { return fail(`create failed: ${e.message}`) }
  },
)

// ── Machine-readable schema + example ────────────────────────────────────────
server.registerTool(
  'get_mindmap_schema',
  {
    title: 'Get mindmap schema',
    description: 'Explain the exact structure to create a mind map in this app: field shapes, outline format, layout types, and a complete example.',
    inputSchema: {},
  },
  async () => ok({
    rules: [
      'A map is { title, outline, type? }. The agent writes the outline — the app renders it (no model call).',
      'outline is a JSON string OR indented text (2 spaces per level), auto-detected.',
      'JSON form: { "Root": [ { "icon": "brain", "Category A": ["item 1","item 2"] }, { "Category B": ["item 3"] } ] }. "icon" is optional per category.',
      'Indented form: the first line is the root; each 2-space indent is one level deeper.',
      `type is one of: ${VALID_TYPES.join(', ')} (default logic-chart). Unknown types fall back to logic-chart.`,
      '"top 10 X" / "5 best Y" phrasing → a flat list of items; "break down X by category" → categorized branches.',
      'The map is owned by the configured owner and (by default) shared so the returned url opens without auth.',
    ],
    example_json_outline: {
      title: 'Machine Learning',
      type: 'logic-chart',
      outline: '{"Machine Learning":[{"icon":"chart","Supervised":["Regression","Classification"]},{"icon":"shuffle","Unsupervised":["Clustering","Dimensionality Reduction"]},{"icon":"trophy","Reinforcement":["Q-Learning","Policy Gradient"]}]}',
    },
    example_indented_outline: {
      title: 'Trip Plan',
      outline: 'Trip Plan\n  Flights\n    Outbound\n    Return\n  Hotels\n  Activities\n    Museums\n    Hiking',
    },
  }),
)

const transport = new StdioServerTransport()
await server.connect(transport)
// stderr only — stdout is the MCP transport channel.
console.error(`mindmaps MCP server running on stdio (app: ${APP_URL})`)
