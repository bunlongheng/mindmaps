import { signToken } from './_lib/auth.js'
import { corsHeaders } from './_lib/cors.js'
import { checkRateLimit, clientIp } from './_lib/rateLimit.js'

export const config = { runtime: 'edge' }

const RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 }

// Exchanges a Google session (via Supabase Auth) for a Mindmaps session token.
// The client signs in with Google through Supabase, then posts the resulting
// Supabase access token here; we confirm it with Supabase and that it belongs
// to the single owner email before minting our own JWT.
export default async function handler(req: Request): Promise<Response> {
  const cors = { ...corsHeaders(req.headers.get('origin'), 'POST, OPTIONS'), 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405, headers: cors })

  const rate = checkRateLimit(`login:${clientIp(req.headers)}`, RATE_LIMIT)
  if (!rate.allowed) {
    return new Response(JSON.stringify({ ok: false, error: 'Too many attempts, try again later' }), {
      status: 429,
      headers: { ...cors, 'Retry-After': String(rate.retryAfterSeconds) },
    })
  }

  let supabaseToken = ''
  try {
    const parsed = JSON.parse(await req.text())
    supabaseToken = parsed.supabaseToken || ''
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400, headers: cors })
  }
  if (!supabaseToken) return new Response(JSON.stringify({ ok: false, error: 'Missing token' }), { status: 400, headers: cors })

  const validEmail = (process.env.MINDMAP_AUTH_EMAIL ?? '').trim().toLowerCase()
  const secret = (process.env.MINDMAP_JWT_SECRET ?? '').trim()
  const userId = (process.env.MINDMAP_USER_ID ?? '').trim()
  const supabaseUrl = (process.env.SUPABASE_URL ?? '').trim().replace(/\\n/g, '').replace(/\/+$/, '')
  const supabaseAnon = (process.env.SUPABASE_ANON_KEY ?? '').trim()
  if (!validEmail || !secret || !userId || !supabaseUrl || !supabaseAnon) {
    return new Response(JSON.stringify({ ok: false, error: 'Auth not configured' }), { status: 500, headers: cors })
  }

  // Ask Supabase who this token belongs to; a bad/expired token fails here.
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${supabaseToken}`, apikey: supabaseAnon },
  })
  if (!userRes.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid session' }), { status: 401, headers: cors })
  }
  const gUser = (await userRes.json()) as { email?: string }
  const email = (gUser.email ?? '').trim().toLowerCase()
  if (!email || email !== validEmail) {
    return new Response(JSON.stringify({ ok: false, error: 'Not authorized' }), { status: 403, headers: cors })
  }

  const token = await signToken({ sub: userId, email, role: 'authenticated' }, secret)
  return new Response(JSON.stringify({
    ok: true,
    token,
    user: { email, name: 'Bunlong Heng', userId },
  }), { status: 200, headers: cors })
}
