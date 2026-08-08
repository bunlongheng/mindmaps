#!/usr/bin/env node
// SQL migration runner for supabase/migrations/*.sql, tracked in a schema_migrations ledger.
//
// Usage:
//   node scripts/migrate.mjs status     Show which migrations are applied vs pending (read-only)
//   node scripts/migrate.mjs backfill   Mark every migration currently in the repo as already-applied,
//                                       WITHOUT executing its SQL. Run this ONCE, first, on an existing
//                                       database (like prod) where these 13 files were already applied
//                                       by hand over time - re-running them for real would be destructive
//                                       (the oldest one does DROP TABLE ... CASCADE).
//   node scripts/migrate.mjs up         Apply only migrations NOT yet in the ledger, each in its own
//                                       transaction, recording it as it succeeds. Safe to use for any
//                                       migration added after the initial backfill.
//
// Reads DATABASE_URL (+ optional DATABASE_CA_CERT) from the environment, same as api/_lib/db.ts.

import { Pool } from 'pg'
import { readdirSync, readFileSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = resolve(__dirname, '..', 'supabase', 'migrations')

const mode = process.argv[2]
if (!['status', 'backfill', 'up'].includes(mode)) {
  console.error('Usage: node scripts/migrate.mjs <status|backfill|up>')
  process.exit(1)
}

const ca = process.env.DATABASE_CA_CERT
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
})

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
}

async function ensureLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

async function appliedSet(client) {
  const { rows } = await client.query('SELECT filename FROM schema_migrations')
  return new Set(rows.map(r => r.filename))
}

async function main() {
  const client = await pool.connect()
  try {
    await ensureLedger(client)
    const files = migrationFiles()
    const applied = await appliedSet(client)
    const pending = files.filter(f => !applied.has(f))

    if (mode === 'status') {
      console.log(`${files.length} migration(s) in repo, ${applied.size} applied, ${pending.length} pending.\n`)
      for (const f of files) console.log(`${applied.has(f) ? '[applied]' : '[pending]'} ${f}`)
      return
    }

    if (mode === 'backfill') {
      if (!pending.length) { console.log('Nothing to backfill - ledger already covers every file.'); return }
      await client.query('BEGIN')
      for (const f of pending) {
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [f])
        console.log(`marked applied (not executed): ${f}`)
      }
      await client.query('COMMIT')
      console.log(`\nBackfilled ${pending.length} file(s) into the ledger without running their SQL.`)
      return
    }

    if (mode === 'up') {
      if (!pending.length) { console.log('Nothing pending - database is up to date.'); return }
      for (const f of pending) {
        const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
        console.log(`applying ${f}...`)
        await client.query('BEGIN')
        try {
          await client.query(sql)
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f])
          await client.query('COMMIT')
          console.log(`  ok`)
        } catch (e) {
          await client.query('ROLLBACK')
          console.error(`  FAILED - rolled back. ${e instanceof Error ? e.message : e}`)
          process.exit(1)
        }
      }
      console.log(`\nApplied ${pending.length} migration(s).`)
      return
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
