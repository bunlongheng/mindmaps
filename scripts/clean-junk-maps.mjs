#!/usr/bin/env node
// Delete leftover test-template maps from the backing store.
// A map is "junk" ONLY if it exactly matches the blank-create template, so real
// maps (even unnamed ones with edits) are never touched:
//   - name === 'Untitled'
//   - exactly 6 nodes: one root titled 'Untitled' + children 'Main Topic 1..5'
// Dry-run by default. Pass --confirm to actually delete.

const APP = process.env.MINDMAP_APP_URL || 'https://mindmaps-bheng.vercel.app'
const USER_ID = process.env.MINDMAP_USER_ID || '731ace87-64e5-44db-bf2a-82265f06f4d9'
const CONFIRM = process.argv.includes('--confirm')

const TOPICS = ['Main Topic 1', 'Main Topic 2', 'Main Topic 3', 'Main Topic 4', 'Main Topic 5']

function isJunk(map) {
  if (map.name !== 'Untitled') return false
  const nodes = map.nodes
  if (!Array.isArray(nodes) || nodes.length !== 6) return false
  const root = nodes.find(n => n.parentId == null || n.depth === 0)
  if (!root || root.title !== 'Untitled') return false
  const childTitles = nodes.filter(n => n !== root).map(n => n.title).sort()
  return JSON.stringify(childTitles) === JSON.stringify([...TOPICS].sort())
}

async function main() {
  const listRes = await fetch(`${APP}/api/mindmaps?user_id=${USER_ID}`)
  const list = await listRes.json()
  const untitled = list.filter(m => m.name === 'Untitled')
  console.log(`Total maps: ${list.length} | named 'Untitled': ${untitled.length}`)

  const junk = []
  for (const m of untitled) {
    const r = await fetch(`${APP}/api/mindmaps?id=${m.id}&user_id=${USER_ID}`)
    const full = await r.json()
    if (isJunk(full)) junk.push(m)
  }
  console.log(`Exact test-template junk maps: ${junk.length}`)
  if (!junk.length) return

  if (!CONFIRM) {
    console.log('\nDRY RUN — re-run with --confirm to delete. Sample:')
    junk.slice(0, 5).forEach(m => console.log(`  - ${m.id} (updated ${m.updated_at})`))
    return
  }

  let deleted = 0
  for (const m of junk) {
    const res = await fetch(`${APP}/api/mindmaps?id=${m.id}&user_id=${USER_ID}`, { method: 'DELETE' })
    if (res.ok) deleted++
  }
  console.log(`Deleted ${deleted}/${junk.length} junk maps.`)
  const after = await (await fetch(`${APP}/api/mindmaps?user_id=${USER_ID}`)).json()
  console.log(`Total maps now: ${after.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
