// Fail-fast env validation for the server functions. Mirrors Diagrams' lib/env.ts:
// in Vercel production a missing required var is a hard error, surfaced at cold start /
// build rather than as a silent 500 later. Gated on VERCEL_ENV so local/preview are free.
const REQUIRED = [
  'DATABASE_URL',
  'MINDMAP_JWT_SECRET',
  'MINDMAP_USER_ID',
  'MINDMAP_AUTH_EMAIL',
  'GOOGLE_CLIENT_ID',
] as const

export function missingEnv(): string[] {
  const missing: string[] = REQUIRED.filter(k => !(process.env[k] ?? '').trim())
  // The Bearer service key accepts either the consistent MINDMAPS_API_SECRET or
  // the legacy MINDMAP_AI_API_KEY - require that at least one is set.
  if (!(process.env.MINDMAPS_API_SECRET ?? '').trim() && !(process.env.MINDMAP_AI_API_KEY ?? '').trim()) {
    missing.push('MINDMAPS_API_SECRET')
  }
  return missing
}

export function assertEnv(): void {
  if (process.env.VERCEL_ENV !== 'production') return
  const missing = missingEnv()
  if (missing.length) throw new Error(`Missing required production env: ${missing.join(', ')}`)
}
