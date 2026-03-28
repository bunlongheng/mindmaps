export const config = { runtime: 'edge' }

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

  // Auth — same pattern as generate-mindmap
  const rawAuth = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const staticKey = (process.env.MINDMAP_AI_API_KEY ?? '').trim()

  let authorized = !!(staticKey && rawAuth === staticKey)
  if (!authorized && rawAuth) {
    try {
      const [, payloadB64] = rawAuth.split('.')
      if (payloadB64) {
        const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
        if (payload.role === 'authenticated' && payload.exp > Date.now() / 1000) authorized = true
      }
    } catch { /* invalid JWT */ }
  }
  if (!authorized) return json({ error: 'Unauthorized' }, 401)

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
    const err = await broadcastRes.text()
    return json({ error: 'Broadcast failed', detail: err.slice(0, 200) }, 502)
  }

  return json({ ok: true, message: message.trim() })
}
