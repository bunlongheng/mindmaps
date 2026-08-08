// Best-effort per-instance rate limiter: an in-memory sliding window keyed by IP.
// Vercel edge functions can reuse a warm instance across a burst of requests from the
// same region, so this genuinely throttles a single-source brute force; it resets on
// cold start and is not shared across instances/regions. Good enough for a single-user
// login endpoint - not a substitute for a distributed limiter on a multi-tenant route.

type Bucket = { count: number; windowStart: number }

const buckets = new Map<string, Bucket>()

export function checkRateLimit(
  key: string,
  { max, windowMs }: { max: number; windowMs: number },
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (bucket.count >= max) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.windowStart + windowMs - now) / 1000) }
  }

  bucket.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}

export function clientIp(headers: unknown): string {
  const h = headers as { get?: (k: string) => string | null; 'x-forwarded-for'?: string }
  const raw = typeof h?.get === 'function' ? h.get('x-forwarded-for') : h?.['x-forwarded-for']
  return (raw ?? '').split(',')[0].trim() || 'unknown'
}
