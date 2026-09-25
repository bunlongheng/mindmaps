import { readFileSync } from 'node:fs'
import { request } from '@playwright/test'
import { RUN_STAMP, TEST_MAP_NAMES } from './run-stamp'

// The per-test cleanup fires before the app's debounced autosave lands, so a deleted
// map comes straight back. This pass runs once after every spec has finished and
// removes each test-named map touched since the run began, so nothing is left in the
// library (owner rule 2026-09-24: never leave test maps behind).
export default async function globalTeardown() {
  let startedAt = 0
  try { startedAt = Number(readFileSync(RUN_STAMP, 'utf8')) } catch { return }
  const api = await request.newContext({ baseURL: 'http://localhost:5173' })
  try {
    const res = await api.get('/api/mindmaps')
    if (!res.ok()) return
    const maps = (await res.json()) as { id: string; name: string; updated_at: string }[]
    // 30s of slack in case a save was still in flight when the stamp was written.
    const cutoff = startedAt - 30_000
    const stale = maps.filter(m => TEST_MAP_NAMES.test(m.name) && Date.parse(m.updated_at) >= cutoff)
    for (const m of stale) await api.delete(`/api/mindmaps?id=${m.id}`).catch(() => {})
    if (stale.length) console.log(`[e2e teardown] removed ${stale.length} test map(s)`)
  } finally {
    await api.dispose()
  }
}
