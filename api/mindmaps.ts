export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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

  const apiBase = process.env.MINDMAP_DB_API ?? 'https://www.bunlongheng.com/api/mindmaps'
  const apiKey = process.env.MINDMAP_AI_API_KEY ?? ''

  // Forward the request to the Linode API
  const url = new URL(req.url)
  const targetUrl = `${apiBase}${url.search}`

  try {
    const res = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined,
    })

    const data = await res.text()
    return new Response(data, {
      status: res.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return json({ error: 'API unreachable', detail: String(e) }, 502)
  }
}
