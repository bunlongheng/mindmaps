import { verifyToken, bearer, secretEquals } from './_lib/auth.js'
import { corsHeaders } from './_lib/cors.js'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const CORS = corsHeaders(req.headers.get('origin'), 'POST, OPTIONS')
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Auth: a cryptographically verified session token, or the static agent key.
  const raw = bearer(req.headers)
  const staticKey = (process.env.MINDMAP_AI_API_KEY ?? '').trim()
  const keyOk = await secretEquals(raw, staticKey)
  const session = keyOk ? null : await verifyToken(raw, (process.env.MINDMAP_JWT_SECRET ?? '').trim())
  if (!keyOk && !session) return json({ error: 'Unauthorized' }, 401)

  let body: { message?: string; color?: string; confetti?: boolean }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { message, color = '#6366f1', confetti = false } = body
  if (!message?.trim()) return json({ error: 'message is required' }, 400)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return json({ error: 'Missing Supabase env vars' }, 500)

  // Broadcast via Supabase Realtime REST API — no SDK, no table needed
  const broadcastRes = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'apikey': serviceKey,
    },
    body: JSON.stringify({
      messages: [{
        topic: 'realtime:app-notifications',
        event: 'broadcast',
        payload: {
          type: 'broadcast',
          event: 'toast',
          payload: { message: message.trim(), color, confetti },
        },
      }],
    }),
  })

  if (!broadcastRes.ok) {
    console.error('notify: broadcast failed', (await broadcastRes.text()).slice(0, 500))
    return json({ error: 'Broadcast failed' }, 502)
  }

  return json({ ok: true, message: message.trim() })
}
