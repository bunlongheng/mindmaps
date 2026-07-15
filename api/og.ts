import { pool } from './_lib/db.js'

function esc(s: string) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)) }

export default async function handler(req: any, res: any) {
  const id = (req.query.id ?? '') as string
  if (!id) return res.redirect(301, '/')

  let name = 'Mindmaps'
  let desc = 'Visual mind map and diagram tool'
  let nodeCount = 0
  let type = 'logic-chart'
  let tags: string[] = []

  try {
    const r = await pool.query('SELECT name, type, tags, nodes FROM mindmaps WHERE id=$1 AND sharing_enabled=true', [id])
    if (r.rows.length) {
      name = r.rows[0].name || 'Untitled'
      type = r.rows[0].type || 'logic-chart'
      tags = r.rows[0].tags || []
      const nodes = r.rows[0].nodes
      nodeCount = Array.isArray(nodes) ? nodes.length : 0
      desc = `${name} - ${nodeCount} node${nodeCount !== 1 ? 's' : ''}`
    }
  } catch { /* fall through with defaults */ }

  const base = 'https://mindmaps-bheng.vercel.app'
  const url = `${base}/?share=${id}`
  const imgParams = new URLSearchParams({ name, nodes: String(nodeCount), type, tags: tags.join(',') })
  const image = `${base}/api/og-image?${imgParams}`
  const safeName = esc(name)
  const safeDesc = esc(desc)

  res.setHeader('Content-Type', 'text/html')
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${safeName} - Mindmaps</title>
  <meta property="og:type" content="website"/>
  <meta property="og:title" content="${safeName}"/>
  <meta property="og:description" content="${safeDesc}"/>
  <meta property="og:image" content="${image}"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta property="og:url" content="${url}"/>
  <meta property="og:site_name" content="Mindmaps"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${safeName}"/>
  <meta name="twitter:description" content="${safeDesc}"/>
  <meta name="twitter:image" content="${image}"/>
  <meta http-equiv="refresh" content="0;url=/?share=${id}"/>
</head>
<body>Redirecting...</body>
</html>`)
}
