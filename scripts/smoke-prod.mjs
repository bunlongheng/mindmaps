#!/usr/bin/env node
// Production smoke check - proves the live app + login-gated API actually work, so
// "I can log in AND see my data" stays true day to day (and a month from now).
// It authenticates headlessly with the static service key (owner-scoped), asserts the
// owner's map list is NON-EMPTY, and confirms /api/auth (login) is healthy - the exact
// failure classes that broke prod before (0 maps, 500s, auth drift). Runs anywhere,
// no browser needed. Exits non-zero on any failure (the daily health check alerts on that).

const APP = process.env.MINDMAP_APP_URL || 'https://mindmaps-bheng.vercel.app'
const AI_KEY = (process.env.MINDMAP_AI_API_KEY || '').trim()
const SAMPLE = Number(process.env.MINDMAP_SMOKE_SAMPLE || 8)
const VALID_TYPES = ['logic-chart', 'mindmap', 'fishbone', 'timeline']

const fails = []
const warns = []
const ok = (m) => console.log(`  ok   ${m}`)
const fail = (m) => { fails.push(m); console.log(`  FAIL ${m}`) }
const warn = (m) => { warns.push(m); console.log(`  warn ${m}`) }

const authHeaders = { 'Content-Type': 'application/json', ...(AI_KEY ? { Authorization: `Bearer ${AI_KEY}` } : {}) }

async function getJson(url) {
  const res = await fetch(url, { headers: authHeaders })
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { /* non-json */ }
  return { status: res.status, body }
}

async function main() {
  console.log(`Smoke check: ${APP}`)
  if (!AI_KEY) fail('MINDMAP_AI_API_KEY not set - cannot run the authenticated data check')

  // 1. App shell loads
  try {
    const res = await fetch(APP)
    res.ok ? ok(`app shell HTTP ${res.status}`) : fail(`app shell HTTP ${res.status}`)
  } catch (e) { fail(`app shell unreachable: ${e.message}`) }

  // 2. Login endpoint healthy - a bad request must be a clean 4xx, never a 5xx/crash
  try {
    const res = await fetch(`${APP}/api/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    res.status >= 500 ? fail(`/api/auth is ${res.status} - login endpoint is broken`) : ok(`/api/auth login endpoint healthy (HTTP ${res.status})`)
  } catch (e) { fail(`/api/auth unreachable: ${e.message}`) }

  // 3. Owner map list - authenticated, MUST be non-empty (the "I can see my data" guarantee)
  let list = []
  if (AI_KEY) {
    try {
      const { status, body } = await getJson(`${APP}/api/mindmaps`)
      if (status !== 200) fail(`map list HTTP ${status} (expected 200) - auth/data path broken`)
      else if (!Array.isArray(body)) fail('map list is not an array')
      else if (body.length === 0) fail('map list is EMPTY - owner sees 0 maps (owner-id / data problem)')
      else { list = body; ok(`map list HTTP 200 - ${body.length} maps`) }
    } catch (e) { fail(`map list error: ${e.message}`) }
  }

  // 4. Individual maps load + parse into a renderable shape
  for (const m of list.slice(0, SAMPLE)) {
    try {
      const { status, body } = await getJson(`${APP}/api/mindmaps?id=${m.id}`)
      if (status !== 200) { fail(`map "${m.name}" HTTP ${status}`); continue }
      if (!Array.isArray(body?.nodes)) { fail(`map "${m.name}" nodes not an array`); continue }
      if (!body.nodes.some(n => n.parentId === null || n.depth === 0)) fail(`map "${m.name}" has no root node`)
      else if (!VALID_TYPES.includes(body.type)) warn(`map "${m.name}" legacy type "${body.type}"`)
      else ok(`map "${m.name}" loads (${body.nodes.length} nodes)`)
    } catch (e) { fail(`map "${m.id}" error: ${e.message}`) }
  }

  console.log('')
  if (fails.length) {
    console.log(`SMOKE FAILED - ${fails.length} issue(s):`)
    fails.forEach(f => console.log(`  - ${f}`))
    process.exit(1)
  }
  console.log(`SMOKE OK${warns.length ? ` (${warns.length} warning(s))` : ''} - login endpoint healthy + ${list.length} maps readable`)
}

main().catch(e => { console.error('smoke crashed:', e); process.exit(1) })
