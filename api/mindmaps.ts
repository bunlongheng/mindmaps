import { pool } from './_lib/db'
import { verifyToken, bearer } from './_lib/auth'
import { corsHeaders } from './_lib/cors'

const SECRET = () => (process.env.MINDMAP_JWT_SECRET ?? '').trim()

export default async function handler(req: any, res: any) {
  Object.entries(corsHeaders(req.headers?.origin)).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const { id, user_id } = req.query as Record<string, string>
    void user_id
    const auth = await verifyToken(bearer(req.headers), SECRET())

    // Public reads: a single shared map by id needs no token; everything else requires the owner.
    if (req.method === 'GET') {
      if (id) {
        const r = await pool.query('SELECT * FROM mindmaps WHERE id=$1', [id])
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' })
        const row = r.rows[0]
        const isOwner = auth && auth.sub === row.user_id
        if (!isOwner && !row.sharing_enabled) return res.status(403).json({ error: 'Not shared' })
        return res.json(row)
      }
      // Listing a user's maps requires being that user.
      if (!auth) return res.status(401).json({ error: 'Unauthorized' })
      const r = await pool.query(
        'SELECT id, name, type, sharing_enabled, tags, updated_at FROM mindmaps WHERE user_id=$1 ORDER BY updated_at DESC',
        [auth.sub],
      )
      return res.json(r.rows)
    }

    // All writes require a verified identity; user_id comes from the token, never the body.
    if (!auth) return res.status(401).json({ error: 'Unauthorized' })
    const uid = auth.sub

    if (req.method === 'POST') {
      const b = req.body
      await pool.query(
        `INSERT INTO mindmaps (id, user_id, name, type, line_style, sharing_enabled, theme_id, nodes, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           name=$3, type=$4, line_style=$5, sharing_enabled=$6, theme_id=$7, nodes=$8, tags=$9, updated_at=now()
         WHERE mindmaps.user_id=$2`,
        [b.id, uid, b.name ?? 'Untitled', b.type ?? 'logic-chart',
         b.line_style ?? 'orthogonal', b.sharing_enabled ?? false,
         b.theme_id ?? 'default', JSON.stringify(b.nodes ?? []), b.tags ?? []],
      )
      return res.status(201).json({ id: b.id })
    }

    if (req.method === 'PUT') {
      const b = req.body
      const targetId = id ?? b.id
      if (!targetId) return res.status(400).json({ error: 'id required' })
      const fields: string[] = []
      const vals: unknown[] = []
      let i = 1
      if (b.name !== undefined)            { fields.push(`name=$${i++}`);            vals.push(b.name) }
      if (b.nodes !== undefined)           { fields.push(`nodes=$${i++}`);           vals.push(JSON.stringify(b.nodes)) }
      if (b.tags !== undefined)            { fields.push(`tags=$${i++}`);            vals.push(b.tags) }
      if (b.sharing_enabled !== undefined) { fields.push(`sharing_enabled=$${i++}`); vals.push(b.sharing_enabled) }
      if (b.theme_id !== undefined)        { fields.push(`theme_id=$${i++}`);        vals.push(b.theme_id) }
      if (!fields.length) return res.status(400).json({ error: 'Nothing to update' })
      fields.push(`updated_at=now()`)
      vals.push(targetId, uid)
      await pool.query(`UPDATE mindmaps SET ${fields.join(',')} WHERE id=$${i++} AND user_id=$${i}`, vals)
      return res.json({ ok: true })
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required' })
      await pool.query('DELETE FROM mindmaps WHERE id=$1 AND user_id=$2', [id, uid])
      return res.json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: unknown) {
    console.error('mindmaps handler error', e)
    return res.status(500).json({ error: 'Internal error' })
  }
}
