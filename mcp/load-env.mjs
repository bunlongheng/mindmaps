// Loaded FIRST so the MCP server sees MINDMAP_AI_API_KEY / MINDMAP_USER_ID no
// matter which working directory (or cloud shell) launched it. Env vars already
// in the process win; only missing ones are filled from the repo's .env.local.
//
// Dependency-free on purpose: a standalone MCP server shouldn't need dotenv.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const need = ['MINDMAP_AI_API_KEY', 'MINDMAP_USER_ID', 'MINDMAP_APP_URL']
if (need.some(k => !process.env[k])) {
  for (const file of ['../.env.local', '../.env']) {
    try {
      const envPath = fileURLToPath(new URL(file, import.meta.url))
      for (const line of readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (!m) continue
        const [, key, val] = m
        if (process.env[key]) continue // never override a real env var
        const clean = val.replace(/^(['"])(.*)\1$/, '$2')
        if (clean) process.env[key] = clean
      }
    } catch { /* no such file — rely on inherited env */ }
  }
}
