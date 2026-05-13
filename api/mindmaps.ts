import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mindmaps (
      id              text        PRIMARY KEY,
      user_id         text,
      name            text        NOT NULL DEFAULT 'Untitled',
      type            text        NOT NULL DEFAULT 'logic-chart',
      line_style      text        NOT NULL DEFAULT 'orthogonal',
      sharing_enabled boolean     NOT NULL DEFAULT false,
      theme_id        text        NOT NULL DEFAULT 'default',
      nodes           jsonb       NOT NULL DEFAULT '[]',
      tags            text[]      NOT NULL DEFAULT '{}',
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )
  `)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()

  await ensureTable()

  const { id, user_id } = req.query as Record<string, string>

  if (req.method === 'GET') {
    if (id) {
      const r = await pool.query('SELECT * FROM mindmaps WHERE id=$1', [id])
      if (!r.rows.length) return res.status(404).json({ error: 'Not found' })
      return res.json(r.rows[0])
    }
    if (!user_id) return res.status(400).json({ error: 'user_id required' })
    const r = await pool.query(
      'SELECT id, name, type, sharing_enabled, tags, updated_at FROM mindmaps WHERE user_id=$1 ORDER BY updated_at DESC',
      [user_id]
    )
    return res.json(r.rows)
  }

  if (req.method === 'POST') {
    const b = req.body
    await pool.query(
      `INSERT INTO mindmaps (id, user_id, name, type, line_style, sharing_enabled, theme_id, nodes, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         name=$3, type=$4, line_style=$5, sharing_enabled=$6, theme_id=$7, nodes=$8, tags=$9, updated_at=now()`,
      [b.id, b.user_id ?? null, b.name ?? 'Untitled', b.type ?? 'logic-chart',
       b.line_style ?? 'orthogonal', b.sharing_enabled ?? false,
       b.theme_id ?? 'default', JSON.stringify(b.nodes ?? []), b.tags ?? []]
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
    vals.push(targetId)
    await pool.query(`UPDATE mindmaps SET ${fields.join(',')} WHERE id=$${i}`, vals)
    return res.json({ ok: true })
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id required' })
    await pool.query('DELETE FROM mindmaps WHERE id=$1', [id])
    return res.json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
