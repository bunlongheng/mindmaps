// Lock CORS to the app's own origin(s) instead of "*". First-party calls are same-origin
// (so unaffected); this stops other sites from driving the API from a victim's browser.
const ALLOWED = new Set(
  ['https://mindmaps-bheng.vercel.app', process.env.MINDMAP_APP_URL].filter(Boolean) as string[],
)
const DEFAULT_ORIGIN = 'https://mindmaps-bheng.vercel.app'

export function corsHeaders(origin: string | null | undefined, methods = 'GET, POST, PUT, DELETE, OPTIONS') {
  const allow = origin && ALLOWED.has(origin) ? origin : DEFAULT_ORIGIN
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin',
  }
}
