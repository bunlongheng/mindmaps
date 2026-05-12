export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  const { email, password } = await req.json() as { email?: string; password?: string }

  const validEmail = process.env.AUTH_EMAIL ?? 'bheng.code@gmail.com'
  const validPassword = process.env.AUTH_PASSWORD ?? 'mindmaps2026'

  if (email === validEmail && password === validPassword) {
    // Simple token: base64(email:timestamp)
    const token = btoa(`${email}:${Date.now()}:mindmaps`)
    return new Response(JSON.stringify({
      ok: true,
      token,
      user: { email, name: 'Bunlong Heng', userId: '731ace87-64e5-44db-bf2a-82265f06f4d9' },
    }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ ok: false, error: 'Invalid credentials' }), {
    status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
