import { randomBytes } from 'node:crypto'
import { pool } from './_lib/db.js'
import { checkRateLimit, clientIp } from './_lib/rateLimit.js'
import { verifyPasscode, unlockToken, unlockCookieName } from './_lib/passcode.js'
import { gatePage, unlockedPage } from './_lib/passcode-pages.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// GET  /api/unlock?id=<map> -> the lock screen (the app sends a visitor here
//                              when the map answers 401 passcode_required).
// POST /api/unlock?id=<map> -> check the passcode; right sets a 30-day unlock
//                              cookie and plays the access-granted beat on the
//                              way back to /?share=, wrong redraws the safe.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type LockRow = { id: string; name: string | null; sharing_enabled: boolean; passcode_hash: string | null }

async function load(id: string): Promise<LockRow | null> {
  if (!UUID_RE.test(id)) return null
  try {
    const r = await pool.query('SELECT id, name, sharing_enabled, passcode_hash FROM mindmaps WHERE id=$1', [id])
    return (r.rows[0] as LockRow | undefined) ?? null
  } catch { return null }
}

const back = (id: string) => `/?share=${id}`
const action = (id: string) => `/api/unlock?id=${id}`

function html(res: VercelResponse, body: string, status = 200, nonce?: string) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (nonce) res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`)
  return res.status(status).send(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = String(req.query.id ?? '')

  if (req.method === 'GET') {
    const row = await load(id)
    if (!row || !row.sharing_enabled) return res.status(404).send('Not found')
    if (!row.passcode_hash) return res.redirect(302, back(row.id))
    return html(res, gatePage({ action: action(row.id), title: row.name || 'Locked map' }))
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
    return html(res, gatePage({ action: action(row.id), title: row.name || 'Locked map', bad: true }), 401)
  }
  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.VERCEL ? '; Secure' : ''
  res.setHeader('Set-Cookie',
    `${unlockCookieName(row.id)}=${unlockToken(row.id, row.passcode_hash)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure}`)
  const nonce = randomBytes(16).toString('base64')
  return html(res, unlockedPage({ target: back(row.id), nonce }), 200, nonce)
}
