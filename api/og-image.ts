import sharp from 'sharp'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const name = (req.query.name as string) || 'Untitled'
  const nodes = (req.query.nodes as string) || '0'
  const type = (req.query.type as string) || 'logic-chart'
  const tags = ((req.query.tags as string) || '').split(',').filter(Boolean)

  const typeLabel: Record<string, string> = {
    'logic-chart': 'Logic Chart',
    'mindmap': 'Mind Map',
    'fishbone': 'Fishbone',
    'timeline': 'Timeline',
  }
  const label = typeLabel[type] || type

  const displayName = name.length > 50 ? name.slice(0, 47) + '...' : name
  const safeName = displayName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const fontSize = displayName.length > 30 ? 38 : 48

  const tagPills = tags.slice(0, 5).map((tag, i) => {
    const x = 600 - ((tags.slice(0, 5).length - 1) * 55) + i * 110
    const safeTag = (tag.length > 10 ? tag.slice(0, 9) + '..' : tag).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    return `<rect x="${x - 45}" y="410" width="90" height="30" rx="15" fill="rgba(99,102,241,0.3)" stroke="rgba(99,102,241,0.5)" stroke-width="1"/>
    <text x="${x}" y="430" text-anchor="middle" fill="#c7d2fe" font-size="13" font-weight="600" font-family="Inter, sans-serif">${safeTag}</text>`
  }).join('\n')

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="40%" stop-color="#312e81"/>
      <stop offset="100%" stop-color="#4338ca"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="50" y="35" width="40" height="40" rx="8" fill="#6366f1"/>
  <text x="70" y="63" text-anchor="middle" fill="#fff" font-size="22" font-weight="700" font-family="Inter, sans-serif">M</text>
  <text x="100" y="62" fill="rgba(255,255,255,0.6)" font-size="20" font-weight="500" font-family="Inter, sans-serif">Mindmaps</text>
  <rect x="1010" y="38" width="${label.length * 10 + 30}" height="32" rx="16" fill="rgba(255,255,255,0.08)"/>
  <text x="${1010 + (label.length * 10 + 30) / 2}" y="59" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-size="15" font-family="Inter, sans-serif">${label}</text>
  <text x="600" y="${fontSize > 40 ? 290 : 300}" text-anchor="middle" fill="#ffffff" font-size="${fontSize}" font-weight="700" font-family="Inter, sans-serif">${safeName}</text>
  <rect x="530" y="340" width="140" height="40" rx="12" fill="rgba(255,255,255,0.1)"/>
  <text x="600" y="366" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-size="20" font-family="Inter, sans-serif">${nodes} node${nodes !== '1' ? 's' : ''}</text>
  ${tagPills}
  <rect x="50" y="580" width="1100" height="1" fill="rgba(255,255,255,0.08)"/>
  <text x="600" y="610" text-anchor="middle" fill="rgba(255,255,255,0.25)" font-size="14" font-family="Inter, sans-serif">mindmaps-bheng.vercel.app</text>
</svg>`

  try {
    const png = await sharp(Buffer.from(svg)).png().toBuffer()
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(png)
  } catch (e: unknown) {
    console.error('og-image failed', e)
    res.status(500).json({ error: 'Failed to render image' })
  }
}
