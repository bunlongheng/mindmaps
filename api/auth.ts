export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  const body = await req.text()
  let email = '', password = ''
  try {
    const parsed = JSON.parse(body)
    email = parsed.email || ''
    password = parsed.password || ''
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  const validEmail = 'bheng.code@gmail.com'
  const validPassword = 'mindmaps2026'

  if (email === validEmail && password === validPassword) {
    const token = btoa(email + ':' + Date.now() + ':mindmaps')
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
