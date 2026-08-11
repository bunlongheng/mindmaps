import { signToken } from './_lib/auth.js'
import { corsHeaders } from './_lib/cors.js'
import { checkRateLimit, clientIp } from './_lib/rateLimit.js'

export const config = { runtime: 'edge' }

const RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 }

// Verifies a Google Identity Services ID token (pure Google, no third-party broker) and
// issues a Mindmaps session token for the single owner. The client signs in with
// the Google button, gets an ID token, and posts it here; we confirm it with
// Google (tokeninfo checks the signature + expiry), that its audience is our
// client, and that it belongs to the owner email, then mint our own JWT.
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

  let idToken = ''
  try {
    idToken = JSON.parse(await req.text()).idToken || ''
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400, headers: cors })
  }
  if (!idToken) return new Response(JSON.stringify({ ok: false, error: 'Missing token' }), { status: 400, headers: cors })

  const validEmail = (process.env.MINDMAP_AUTH_EMAIL ?? '').trim().toLowerCase()
  const secret = (process.env.MINDMAP_JWT_SECRET ?? '').trim()
  const userId = (process.env.MINDMAP_USER_ID ?? '').trim()
  const clientId = (process.env.GOOGLE_CLIENT_ID ?? '').trim()
  if (!validEmail || !secret || !userId || !clientId) {
    return new Response(JSON.stringify({ ok: false, error: 'Auth not configured' }), { status: 500, headers: cors })
  }

  // Google validates the token's signature and expiry; a bad/expired token fails here.
  const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`)
  if (!info.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid session' }), { status: 401, headers: cors })
  }
  const claims = (await info.json()) as { aud?: string; email?: string; email_verified?: string; iss?: string }

  const audOk = claims.aud === clientId
  const emailOk = (claims.email ?? '').trim().toLowerCase() === validEmail
  const verifiedOk = claims.email_verified === 'true'
  const issOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com'
  if (!audOk || !emailOk || !verifiedOk || !issOk) {
    return new Response(JSON.stringify({ ok: false, error: 'Not authorized' }), { status: 403, headers: cors })
  }

  const token = await signToken({ sub: userId, email: validEmail, role: 'authenticated' }, secret)
  return new Response(JSON.stringify({
    ok: true,
    token,
    user: { email: validEmail, name: 'Bunlong Heng', userId },
  }), { status: 200, headers: cors })
}
