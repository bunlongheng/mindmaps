import { pool } from './_lib/db.js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyToken, bearer, secretEquals } from './_lib/auth.js'
import { corsHeaders } from './_lib/cors.js'
import { renderMindmapSvg } from './_lib/render-svg.js'
import { lockedColumnExists, LOCKED_BODY, LOCK_UNAVAILABLE_BODY } from './_lib/locked.js'

const SECRET = () => (process.env.MINDMAP_JWT_SECRET ?? '').trim()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(corsHeaders(req.headers?.origin)).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()

  try {
    const { id, user_id } = req.query as Record<string, string>
    void user_id
    // Owner session token, OR a static service key (used by the prod smoke test /
    // AI agents / partners) which authenticates headlessly as the owner.
    const raw = bearer(req.headers)
    const aiKeys = [process.env.MINDMAPS_API_SECRET, process.env.MINDMAPS_API_SECRET_PARTNER, process.env.MINDMAP_AI_API_KEY, process.env.MINDMAP_AI_API_KEY_PARTNER]
      .map(k => (k ?? '').trim()).filter(Boolean)
    const ownerId = (process.env.MINDMAP_USER_ID ?? '').trim()
    let isServiceKey = false
    if (ownerId) {
      for (const key of aiKeys) {
        if (await secretEquals(raw, key)) { isServiceKey = true; break }
      }
    }
    const auth = isServiceKey
      ? { sub: ownerId, email: '', role: 'service' }
      : await verifyToken(raw, SECRET())

    // Public reads: a single shared map by id needs no token; everything else requires the owner.
    if (req.method === 'GET') {
      if (id) {
        const hasLocked = await lockedColumnExists()
        const r = await pool.query(
          `SELECT id, user_id, name, type, line_style, sharing_enabled, theme_id, nodes, tags,${hasLocked ? ' locked,' : ''} updated_at FROM mindmaps WHERE id=$1`,
          [id],
        )
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' })
        const row = r.rows[0]
        if (!hasLocked) row.locked = false
        const isOwner = auth && auth.sub === row.user_id
        if (!isOwner && !row.sharing_enabled) return res.status(403).json({ error: 'Not shared' })
        // ?format=svg -> render the map to a self-contained SVG (docs-ready).
        // Same visibility rules as the JSON read (public if shared, else owner).
        if ((req.query as Record<string, string>).format === 'svg') {
          try {
            const svg = renderMindmapSvg(row)
            res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
            res.setHeader('Cache-Control', 'public, max-age=60')
            return res.status(200).send(svg)
          } catch (e: unknown) {
            return res.status(500).json({ error: 'Failed to render SVG', detail: e instanceof Error ? e.message : String(e) })
          }
        }
        if (isOwner) return res.json(row)
        // Public share view: never expose the owner's user_id to unauthenticated callers.
        const { user_id: rowOwner, ...shared } = row
        void rowOwner
        return res.json(shared)
      }
      // Listing a user's maps requires being that user.
      if (!auth) return res.status(401).json({ error: 'Unauthorized' })
      const hasLocked = await lockedColumnExists()
      const r = await pool.query(
        `SELECT id, name, type, sharing_enabled, tags,${hasLocked ? ' locked,' : ''} updated_at FROM mindmaps WHERE user_id=$1 ORDER BY updated_at DESC`,
        [auth.sub],
      )
      if (!hasLocked) r.rows.forEach(row => { row.locked = false })
      return res.json(r.rows)
    }

    // The lock/unlock toggle: the only write a locked row ever accepts, and owner-session
    // only in both directions - never the static Bearer/MCP service key (issue: a locked
    // diagram is embedded outside the app, so nothing but a human in the owner UI may
    // change its lock state).
    if (req.method === 'PATCH') {
      if (!id) return res.status(400).json({ error: 'id required' })
      if (!auth) return res.status(401).json({ error: 'Unauthorized' })
      if (auth.role !== 'authenticated') {
        return res.status(403).json({ error: 'Owner session required', detail: 'Lock/unlock is not available to Bearer keys or MCP.' })
      }
      const b = req.body ?? {}
      const keys = Object.keys(b)
      if (keys.length !== 1 || keys[0] !== 'locked' || typeof b.locked !== 'boolean') {
        return res.status(400).json({ error: 'Body must be exactly { "locked": true } or { "locked": false }' })
      }
      if (!(await lockedColumnExists())) return res.status(503).json(LOCK_UNAVAILABLE_BODY)
      const result = await pool.query(
        'UPDATE mindmaps SET locked=$1, updated_at=now() WHERE id=$2 AND user_id=$3',
        [b.locked, id, auth.sub],
      )
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' })
      return res.json({ ok: true, locked: b.locked })
    }

    // All writes require a verified identity; user_id comes from the token, never the body.
    if (!auth) return res.status(401).json({ error: 'Unauthorized' })
    const uid = auth.sub
    const hasLocked = await lockedColumnExists()

    if (req.method === 'POST') {
      const b = req.body
      if (hasLocked && b.id) {
        const existing = await pool.query('SELECT locked FROM mindmaps WHERE id=$1 AND user_id=$2', [b.id, uid])
        if (existing.rows[0]?.locked) return res.status(423).json(LOCKED_BODY)
      }
      const result = await pool.query(
        `INSERT INTO mindmaps (id, user_id, name, type, line_style, sharing_enabled, theme_id, nodes, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           name=$3, type=$4, line_style=$5, sharing_enabled=$6, theme_id=$7, nodes=$8, tags=$9, updated_at=now()
         WHERE mindmaps.user_id=$2`,
        [b.id, uid, b.name ?? 'Untitled', b.type ?? 'logic-chart',
         b.line_style ?? 'curved', b.sharing_enabled ?? false,
         b.theme_id ?? 'default', JSON.stringify(b.nodes ?? []), b.tags ?? []],
      )
      // rowCount 0 means the id exists but belongs to someone else - nothing was written.
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' })
      return res.status(201).json({ id: b.id })
    }

    if (req.method === 'PUT') {
      const b = req.body
      const targetId = id ?? b.id
      if (!targetId) return res.status(400).json({ error: 'id required' })
      if (hasLocked) {
        const existing = await pool.query('SELECT locked FROM mindmaps WHERE id=$1 AND user_id=$2', [targetId, uid])
        if (existing.rows[0]?.locked) return res.status(423).json(LOCKED_BODY)
      }
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
      const result = await pool.query(`UPDATE mindmaps SET ${fields.join(',')} WHERE id=$${i++} AND user_id=$${i}`, vals)
      // rowCount 0 means no map with that id is owned by this user - nothing was updated.
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' })
      return res.json({ ok: true })
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required' })
      if (hasLocked) {
        const existing = await pool.query('SELECT locked FROM mindmaps WHERE id=$1 AND user_id=$2', [id, uid])
        if (existing.rows[0]?.locked) return res.status(423).json(LOCKED_BODY)
      }
      await pool.query('DELETE FROM mindmaps WHERE id=$1 AND user_id=$2', [id, uid])
      return res.json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: unknown) {
    console.error('mindmaps handler error', e)
    return res.status(500).json({ error: 'Internal error' })
  }
}
