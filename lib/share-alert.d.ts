// Types for the canonical share-alert client, which ships as plain JS so it can
// be byte-for-byte identical in every app (notify's scripts/check-clients.sh
// fails on any drift). This declaration sits beside it and is NOT part of the
// shared client: api/mindmaps.ts is typechecked under strict mode, and without
// it the import is an implicit any and tsc -p tsconfig.api.json fails TS7016.

// Headers arrive as a Fetch Headers object (App Router) or a plain lower-cased
// object (Node / Vercel functions). The client reads both the same way.
export type ShareAlertHeaders = Headers | Record<string, string | string[] | undefined> | null | undefined

// The thing that was opened. `link` is the page the visitor landed on, which
// only the app knows.
export type ShareAlertItem = { id: string | number; title?: string | null; link?: string | null }

// "view", or "unlock" when a passcode was entered.
export type ShareAlertKind = 'view' | 'unlock'

export type ShareVisit = {
  id: string
  title: string
  link: string | null
  kind: ShareAlertKind | string
  ip: string
  city: string | null
  country: string | null
  userAgent: string | null
  referer: string | null
}

export function isBot(userAgent: string | null | undefined): boolean
export function clientIp(headers: ShareAlertHeaders): string
export function readVisit(headers: ShareAlertHeaders, item: ShareAlertItem, kind?: ShareAlertKind | string): ShareVisit
export function notifyShareView(visit: ShareVisit): Promise<boolean>
