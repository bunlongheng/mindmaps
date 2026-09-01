// Owner authorization for AI / admin endpoints, mirroring the Diagrams app policy:
//   isLocal (dev only, never in prod) -> static Bearer key (opt-in) -> owner session JWT.
// The static key is accepted ONLY when allowBearer is true. AI-generate (which spends
// Anthropic credits) passes allowBearer:false, so a Bearer key is REJECTED there and
// only the logged-in owner (or local dev) can trigger it.
import { verifyToken, bearer, secretEquals } from './auth.js'

// True only under real local dev. Forced OFF in Vercel production, so no stray env var
// can flip the bypass on in prod.
function isLocalDev(): boolean {
  if (process.env.VERCEL_ENV === 'production') return false
  // Any Vercel deployment (including previews) is not local - the bypass stays local-only.
  if (process.env.VERCEL) return false
  return process.env.NODE_ENV !== 'production' || process.env.LOCAL_DEV === 'true'
}

// The DB user_id rows are owned by.
export function ownerId(): string {
  return (process.env.MINDMAP_USER_ID ?? '').trim()
}

export async function authorizeOwner(
  headers: unknown,
  opts: { allowBearer?: boolean } = {},
): Promise<boolean> {
  const { allowBearer = true } = opts

  // 1. Local/dev only - never in production.
  if (isLocalDev()) return true

  const raw = bearer(headers)
  if (!raw) return false

  // 2. Static API keys (external scripts / AI agents / partners), constant-time
  //    compare via SHA-256 digests (secretEquals never throws / never leaks
  //    length). Skipped entirely when the caller MUST be the owner
  //    (allowBearer:false). The partner key is optional - unset means not accepted.
  if (allowBearer) {
    const keys = [process.env.MINDMAP_AI_API_KEY, process.env.MINDMAP_AI_API_KEY_PARTNER]
      .map(k => (k ?? '').trim()).filter(Boolean)
    for (const key of keys) {
      if (await secretEquals(raw, key)) return true
    }
  }

  // 3. Owner session JWT - only the configured owner email passes.
  const secret = (process.env.MINDMAP_JWT_SECRET ?? '').trim()
  const ownerEmail = (process.env.MINDMAP_AUTH_EMAIL ?? '').trim().toLowerCase()
  const claims = await verifyToken(raw, secret)
  if (!claims) return false
  if (ownerEmail && (claims.email ?? '').toLowerCase() !== ownerEmail) return false
  return true
}
