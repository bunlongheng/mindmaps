#!/usr/bin/env node
// Production smoke check — verifies the live app + API are actually working.
// Catches the failure class behind "every time I open it, it's broken":
//   1. the app HTML loads
//   2. the map list endpoint responds
//   3. individual maps load AND parse into a usable shape (nodes array + a type
//      the client can render) — the exact thing that was silently failing.
// Runs anywhere (no browser/dev-server needed). Exits non-zero on any failure.

const APP = process.env.MINDMAP_APP_URL || 'https://mindmaps-bheng.vercel.app'
const USER_ID = process.env.MINDMAP_USER_ID || '731ace87-64e5-44db-bf2a-82265f06f4d9'
const SAMPLE = Number(process.env.MINDMAP_SMOKE_SAMPLE || 8)
const VALID_TYPES = ['logic-chart', 'mindmap', 'fishbone', 'timeline']

const fails = []
const warns = []
const ok = (m) => console.log(`  ok   ${m}`)
const fail = (m) => { fails.push(m); console.log(`  FAIL ${m}`) }
const warn = (m) => { warns.push(m); console.log(`  warn ${m}`) }

async function getJson(url) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } })
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { /* non-json */ }
  return { status: res.status, body, text }
}

async function main() {
  console.log(`Smoke check: ${APP}`)

  // 1. App shell loads
  try {
    const res = await fetch(APP)
    if (res.ok) ok(`app shell HTTP ${res.status}`)
    else fail(`app shell HTTP ${res.status}`)
  } catch (e) { fail(`app shell unreachable: ${e.message}`) }

  // 2. Map list
  let list = []
  try {
    const { status, body } = await getJson(`${APP}/api/mindmaps?user_id=${USER_ID}`)
    if (status === 200 && Array.isArray(body)) { list = body; ok(`map list HTTP 200 (${body.length} maps)`) }
    else fail(`map list HTTP ${status} (expected 200 + array)`)
  } catch (e) { fail(`map list error: ${e.message}`) }

  // 3. Individual map loads + parse-ability
  const sample = list.slice(0, SAMPLE)
  for (const m of sample) {
    try {
      const { status, body } = await getJson(`${APP}/api/mindmaps?id=${m.id}&user_id=${USER_ID}`)
      if (status !== 200) { fail(`map "${m.name}" HTTP ${status}`); continue }
      if (!Array.isArray(body?.nodes)) { fail(`map "${m.name}" nodes not an array`); continue }
      if (!body.nodes.some(n => n.parentId === null || n.depth === 0)) fail(`map "${m.name}" has no root node`)
      if (!VALID_TYPES.includes(body.type)) warn(`map "${m.name}" has legacy type "${body.type}" (client normalizes, but resave to heal)`)
      else ok(`map "${m.name}" loads (${body.nodes.length} nodes)`)
    } catch (e) { fail(`map "${m.id}" error: ${e.message}`) }
  }

  console.log('')
  if (fails.length) {
    console.log(`SMOKE FAILED — ${fails.length} issue(s):`)
    fails.forEach(f => console.log(`  - ${f}`))
    process.exit(1)
  }
  console.log(`SMOKE OK${warns.length ? ` (${warns.length} warning(s))` : ''}`)
}

main().catch(e => { console.error('smoke crashed:', e); process.exit(1) })
