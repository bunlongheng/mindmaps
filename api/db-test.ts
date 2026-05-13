import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

export default async function handler(req: any, res: any) {
  try {
    const result = await pool.query('SELECT count(*) as c FROM mindmaps')
    res.json({ ok: true, count: result.rows[0].c, url: process.env.DATABASE_URL?.replace(/:[^@]+@/, ':***@') })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message, code: e.code })
  }
}
