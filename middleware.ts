import { rewrite, next } from '@vercel/functions'

// Link-preview crawlers hitting the two legacy share shapes - /?share=<id> and
// /?id=<id> - must get the OG shell; a human must still get the app. A rewrite in
// vercel.json cannot make that call on "/": Vercel resolves the filesystem before
// the rewrites list, so index.html always wins there. Edge Middleware runs before
// the filesystem, which is why this lives here and not in vercel.json.
//
// The canonical /s/<id> link needs none of this - it is a plain vercel.json rewrite.

const BOT_UA = /facebookexternalhit|Twitterbot|Slackbot|LinkedInBot|Discordbot|WhatsApp|TelegramBot|iMessage|Applebot|Googlebot/i

// Same guard api/og.ts applies before it queries or interpolates.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Root path only, so every other request skips the middleware entirely.
export const config = { matcher: ['/'] }

export default function middleware(req: Request): Response {
  if (!BOT_UA.test(req.headers.get('user-agent') ?? '')) return next()

  const url = new URL(req.url)
  const id = url.searchParams.get('share') ?? url.searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) return next()

  return rewrite(new URL(`/api/og?id=${id}`, req.url))
}
