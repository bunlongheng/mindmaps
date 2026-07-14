import { signToken, sha256Hex } from './_lib/auth'
import { corsHeaders } from './_lib/cors'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const cors = { ...corsHeaders(req.headers.get('origin'), 'POST, OPTIONS'), 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405, headers: cors })

  let email = '', password = ''
  try {
    const parsed = JSON.parse(await req.text())
    email = parsed.email || ''
    password = parsed.password || ''
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400, headers: cors })
  }

  const validEmail = (process.env.MINDMAP_AUTH_EMAIL ?? '').trim()
  const validHash = (process.env.MINDMAP_AUTH_PASSWORD_HASH ?? '').trim()
  const secret = (process.env.MINDMAP_JWT_SECRET ?? '').trim()
  const userId = (process.env.MINDMAP_USER_ID ?? '').trim()
  if (!validEmail || !validHash || !secret || !userId) {
    return new Response(JSON.stringify({ ok: false, error: 'Auth not configured' }), { status: 500, headers: cors })
  }

  const suppliedHash = await sha256Hex(password)
  if (email !== validEmail || suppliedHash !== validHash) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid credentials' }), { status: 401, headers: cors })
  }

  const token = await signToken({ sub: userId, email, role: 'authenticated' }, secret)
  return new Response(JSON.stringify({
    ok: true,
    token,
    user: { email, name: 'Bunlong Heng', userId },
  }), { status: 200, headers: cors })
}
