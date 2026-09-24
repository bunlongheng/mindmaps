// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

interface Condition { type: string; key: string; value?: string }
interface Rewrite { source: string; destination: string; has?: Condition[] }
interface Header { key: string; value: string }

const config = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../vercel.json', import.meta.url)), 'utf8'),
) as { rewrites: Rewrite[]; headers: { source: string; headers: Header[] }[]; functions: Record<string, { includeFiles: string }> }

describe('vercel.json', () => {
  it('rewrites the canonical /s/:id share link to the OG handler', () => {
    const r = config.rewrites.find(x => x.source === '/s/:id')
    expect(r).toBeDefined()
    expect(r!.destination).toBe('/api/og?id=:id')
    expect(r!.has).toBeUndefined()
  })

  it('carries no rewrite on "/" - the filesystem beats rewrites there, so that is middleware.ts', () => {
    expect(config.rewrites).toHaveLength(1)
    expect(config.rewrites.some(x => x.source === '/')).toBe(false)
  })

  it('ships the Inter TTFs with the og-image function', () => {
    expect(config.functions['api/og-image.ts'].includeFiles).toBe('api/_fonts/**')
    // resvg loads no system fonts, so the TTFs have to be in the repo or every
    // label rasterizes blank.
    for (const f of ['Inter-Regular.ttf', 'Inter-SemiBold.ttf', 'OFL.txt']) {
      const path = fileURLToPath(new URL(`../_fonts/${f}`, import.meta.url))
      expect(readFileSync(path).length, `${f} missing`).toBeGreaterThan(1000)
    }
  })

  it('leaves the security headers block untouched', () => {
    expect(config.headers).toHaveLength(1)
    expect(config.headers[0].source).toBe('/(.*)')
    const keys = config.headers[0].headers.map(h => h.key)
    expect(keys).toEqual([
      'Strict-Transport-Security',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Content-Security-Policy',
    ])
    const csp = config.headers[0].headers.find(h => h.key === 'Content-Security-Policy')!.value
    expect(csp).toBe("default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; img-src 'self' data: blob: https:; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com; font-src 'self' data:; worker-src 'self' blob:; manifest-src 'self'; frame-src 'self' https://accounts.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'")
    expect(config.headers[0].headers.find(h => h.key === 'X-Frame-Options')!.value).toBe('DENY')
  })
})
