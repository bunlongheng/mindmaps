import { Resvg } from '@resvg/resvg-js'
import { pool } from './_lib/db.js'
import { checkRateLimit, clientIp } from './_lib/rateLimit.js'
import { verifyPasscode, unlockToken, unlockCookieName } from './_lib/passcode.js'
import { gatePage } from './_lib/passcode-pages.js'
import { renderMindmapSvg, type MindmapRow } from './_lib/render-svg.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// GET  /api/unlock?id=<map> -> the lock screen (the app sends a visitor here
//                              when the map answers 401 passcode_required).
// POST /api/unlock?id=<map> -> check the passcode; right sets a 30-day unlock
//                              cookie and goes back to /?share=...&reveal=1,
//                              wrong redraws the lock screen.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type LockRow = MindmapRow & { id: string; name: string | null; sharing_enabled: boolean; passcode_hash: string | null }

async function load(id: string): Promise<LockRow | null> {
  if (!UUID_RE.test(id)) return null
  try {
    const r = await pool.query('SELECT id, name, type, line_style, theme_id, nodes, sharing_enabled, passcode_hash FROM mindmaps WHERE id=$1', [id])
    return (r.rows[0] as LockRow | undefined) ?? null
  } catch { return null }
}

const back = (id: string) => `/?share=${id}`

// The map behind the lock, as an 80 px wide PNG: a node is a few pixels, so
// nothing in it can be read, and the page blurs it further. Only this thumbnail
// ever leaves the server; null (a plain wash) if it cannot render.
function backdrop(row: LockRow): string | null {
  try {
    const png = new Resvg(renderMindmapSvg(row), { fitTo: { mode: 'width', value: 80 } }).render().asPng()
    return `data:image/png;base64,${Buffer.from(png).toString('base64')}`
  } catch { return null }
}
const action = (id: string) => `/api/unlock?id=${id}`

function html(res: VercelResponse, body: string, status = 200) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  return res.status(status).send(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = String(req.query.id ?? '')

  if (req.method === 'GET') {
    const row = await load(id)
    if (!row || !row.sharing_enabled) return res.status(404).send('Not found')
    if (!row.passcode_hash) return res.redirect(302, back(row.id))
    return html(res, gatePage({ action: action(row.id), title: row.name || 'Locked map', backdrop: backdrop(row) }))
  }

  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  // Before the DB hit and the deliberately slow scrypt: 10 guesses / 5 min.
  const limited = checkRateLimit(`unlock:${clientIp(req.headers)}`, { max: 10, windowMs: 300_000 })
  if (!limited.allowed) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Retry-After', String(limited.retryAfterSeconds))
    return res.status(429).send('Too many attempts. Wait a few minutes and try again.')
  }
  const row = await load(id)
  if (!row || !row.sharing_enabled) return res.status(404).send('Not found')
  if (!row.passcode_hash) return res.redirect(303, back(row.id))

  const body = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : (req.body ?? {})
  const passcode = String((body as Record<string, unknown>).passcode ?? '').trim().toLowerCase()
  if (!(await verifyPasscode(passcode, row.passcode_hash))) {
    return html(res, gatePage({ action: action(row.id), title: row.name || 'Locked map', bad: true, backdrop: backdrop(row) }), 401)
  }
  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.VERCEL ? '; Secure' : ''
  res.setHeader('Set-Cookie',
    `${unlockCookieName(row.id)}=${unlockToken(row.id, row.passcode_hash)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure}`)
  return res.redirect(303, `${back(row.id)}&reveal=1`)
}
