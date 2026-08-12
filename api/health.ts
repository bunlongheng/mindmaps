import type { VercelRequest, VercelResponse } from '@vercel/node'
import { pool } from './_lib/db.js'
import { missingEnv } from './_lib/env.js'

// Readiness probe for the prod monitor: 200 only when required env is present AND the
// DB is reachable; 503 otherwise. No auth, no side effects, no secrets in the body.
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const auth = missingEnv().length === 0
  let database = false
  try { await pool.query('SELECT 1'); database = true } catch { database = false }
  const ok = auth && database
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', auth, database })
}
