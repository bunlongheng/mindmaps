// Shared "locked diagram" contract for api/mindmaps.ts.
//
// A locked row (see db/migrations/20260926_add_locked.sql) can't be updated or deleted
// by anything - only the unlock/lock PATCH itself, and that PATCH is owner-session only.
// The migration is applied by hand (`npm run migrate`), not automatically on deploy, so
// the column may not exist in prod yet. `lockedColumnExists` detects it once per process
// (cached) so every route keeps working either way: absent -> every row reads as
// unlocked, never selected/updated, and the lock/unlock PATCH answers 503 instead of
// crashing on "column does not exist".
import { pool } from './db.js'

let cached: boolean | null = null

export async function lockedColumnExists(): Promise<boolean> {
  if (cached !== null) return cached
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'mindmaps' AND column_name = 'locked'`,
  )
  cached = r.rows.length > 0
  return cached
}

// Test-only: the cache is per-process by design (it never changes while a server runs),
// so tests that flip between "column exists" and "column absent" need to reset it.
export function __resetLockedColumnCache(): void {
  cached = null
}

export const LOCKED_BODY = {
  error: 'This diagram is locked',
  detail: 'It is linked from a README or Confluence page. Unlock it in the owner UI first.',
  locked: true,
} as const

export const LOCK_UNAVAILABLE_BODY = {
  error: 'Lock not available',
  detail: 'Run the locked migration first.',
} as const
