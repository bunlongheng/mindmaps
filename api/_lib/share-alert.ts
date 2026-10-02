// Who opened a shared map. Fires once per real view of a public share link: every
// view is written to mindmaps_share_view_log (so nothing is lost before an email provider
// is configured), posted as a Stickies note when STICKIES_API_KEY is set, and
// emailed to OWNER_EMAIL via Resend or Formspree when one is configured. Both channels fire.
//
// Never throws and never blocks the response - a failed alert must not stop a
// visitor from reading the map.
import type { IncomingHttpHeaders } from 'node:http'
import { pool } from './db.js'

export interface ShareVisit {
  mapId: string
  title: string
  ip: string
  city: string | null
  country: string | null
  userAgent: string | null
  referer: string | null
  at: Date
  /** "view" = open link opened. Mindmaps has no passcode, so "unlock" is reserved. */
  kind: 'view' | 'unlock'
  geo?: IpGeo
}

/** Link-preview crawlers (iMessage, Slack, WhatsApp, Twitter, Facebook) fetch a shared URL without a person behind it. */
export function isBot(userAgent: string | null): boolean {
  return /bot|crawler|spider|preview|facebookexternalhit|slackbot|twitterbot|whatsapp|telegram|discord|skype|linkedin|applebot|headless/i.test(userAgent || '')
}

/** ipinfo.io fields for the visitor's IP. */
export interface IpGeo {
  hostname: string | null
  city: string | null
  region: string | null
  country: string | null
  loc: string | null
  org: string | null
  postal: string | null
  timezone: string | null
}

// Where the share links live, for the "link they visited" line and the app icon.
const APP_URL = (process.env.PUBLIC_APP_URL || 'https://mindmaps-bheng.vercel.app').replace(/\/$/, '')
export const shareUrl = (mapId: string) => `${APP_URL}/s/${mapId}`

const PRIVATE_IP = /^(unknown|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i

/** Enrich a public IP via ipinfo.io (keyless; IPINFO_TOKEN lifts the rate limit). 3 s cap, null on any failure. */
export async function lookupIp(ip: string): Promise<IpGeo | null> {
  if (PRIVATE_IP.test(ip)) return null
  try {
    const token = process.env.IPINFO_TOKEN ? `?token=${process.env.IPINFO_TOKEN}` : ''
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json${token}`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    const j = await res.json()
    const pick = (k: string) => (typeof j[k] === 'string' && j[k] ? j[k] : null)
    return { hostname: pick('hostname'), city: pick('city'), region: pick('region'), country: pick('country'),
      loc: pick('loc'), org: pick('org'), postal: pick('postal'), timezone: pick('timezone') }
  } catch { return null }
}

function header(h: IncomingHttpHeaders, name: string): string | null {
  const v = h[name]
  const s = Array.isArray(v) ? v[0] : v
  return s ? String(s) : null
}

/** First hop of x-forwarded-for is the real client on Vercel; others are proxies. */
export function clientIp(h: IncomingHttpHeaders): string {
  const raw = header(h, 'x-vercel-forwarded-for') || header(h, 'x-forwarded-for') || header(h, 'x-real-ip') || ''
  return raw.split(',')[0].trim() || 'unknown'
}

export function readVisit(h: IncomingHttpHeaders, mapId: string, title: string, kind: 'view' | 'unlock' = 'view'): ShareVisit {
  const city = header(h, 'x-vercel-ip-city')
  return {
    mapId,
    kind,
    title: title || 'Untitled',
    ip: clientIp(h),
    city: city ? decodeURIComponent(city) : null,
    country: header(h, 'x-vercel-ip-country'),
    userAgent: header(h, 'user-agent'),
    referer: header(h, 'referer'),
    at: new Date(),
  }
}

// The table comes from db/migrations/20261001_mindmaps_share_view_log.sql: the app's
// Postgres role cannot create tables in the shared schema, so no CREATE here.
async function logVisit(v: ShareVisit): Promise<string | null> {
  const r = await pool.query(
    `INSERT INTO mindmaps_share_view_log (file_id, title, kind, ip, city, country, user_agent, referer)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [v.mapId, v.title, v.kind, v.ip, v.city, v.country, v.userAgent, v.referer],
  )
  return r.rows[0]?.id ?? null
}

/** Note title and email subject, prefixed so Mindmaps alerts stand apart from other apps' notes. */
export const alertTitle = (title: string) => `Mindmaps - Opened: ${title.replace(/^(Mindmaps - )?(Opened:\s*)+/i, '')}`

export function alertBody(v: ShareVisit, viewNumber: number): string {
  const g = v.geo
  const city = g?.city || v.city
  const country = g?.country || v.country
  const when = v.at.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET'
  const [lat, lon] = (g?.loc || '').split(',')
  const mapUrl = lat && lon
    ? `https://static-maps.yandex.ru/1.x/?lang=en_US&ll=${lon},${lat}&z=9&size=600,300&l=map&pt=${lon},${lat},pm2rdm`
    : null
  const row = (k: string, val: string | null) =>
    `<tr><td style="padding:7px 16px 7px 0;color:#71717a;font-size:13px;white-space:nowrap;vertical-align:top">${k}</td>` +
    `<td style="padding:7px 0;color:#18181b;font-size:14px;font-weight:600;word-break:break-word">${val ? escapeHtml(val) : '<span style="color:#a1a1aa;font-weight:400">unknown</span>'}</td></tr>`
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:8px 0 24px;color:#18181b">
  <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#a1a1aa;font-weight:700;margin-bottom:6px">Mindmaps share - ${v.kind === 'unlock' ? 'passcode unlock' : 'link opened'}</div>
  <h1 style="font-size:20px;line-height:1.35;margin:0 0 14px;color:#18181b"><img src="${APP_URL}/icons/android-chrome-192x192.png" alt="Mindmaps" width="24" height="24" style="display:inline-block;vertical-align:-5px;border-radius:6px;margin-right:8px">Someone opened "${escapeHtml(v.title)}"</h1>
  <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3f3f46">Someone from <b>${escapeHtml(v.ip)}</b> ${v.kind === 'unlock' ? 'entered the passcode' : 'opened the shared link'} on <b>${when}</b>${country ? ` from <b style="color:#ef4444">${escapeHtml(country)}</b>` : ''}. This is view <b>${viewNumber}</b> of this map.</p>
  <table style="border-collapse:collapse;width:100%;max-width:100%;border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;margin:0 0 18px">
    ${row('Link', shareUrl(v.mapId))}
    ${row('Target IP', v.ip)}
    ${row('Hostname', g?.hostname ?? null)}
    ${row('City', city)}
    ${row('Region', g?.region ?? null)}
    ${row('Country', country)}
    ${row('Coordinates', g?.loc ?? null)}
    ${row('Org', g?.org ?? null)}
    ${row('Postal', g?.postal ?? null)}
    ${row('Timezone', g?.timezone ?? null)}
    ${row('Referrer', v.referer || null)}
  </table>
  ${mapUrl ? `<img src="${mapUrl}" alt="Map near ${escapeHtml(city || v.ip)}" width="600" height="300" style="display:block;max-width:100%;height:auto;border-radius:10px;border:1px solid #e4e4e7;margin:0 0 18px">` : ''}
  <p style="margin:0 0 6px;font-size:14px;color:#3f3f46">Open it: <a href="${shareUrl(v.mapId)}" style="color:#2563eb">${escapeHtml(shareUrl(v.mapId))}</a></p>
  <p style="margin:0 0 6px;font-size:14px;color:#3f3f46">More detail: <a href="https://ipinfo.io/${encodeURIComponent(v.ip)}" style="color:#2563eb">ipinfo.io/${escapeHtml(v.ip)}</a></p>
  <p style="margin:0;color:#a1a1aa;font-size:12px;word-break:break-all">${escapeHtml(v.userAgent || 'no user agent')}</p>
</div>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

/**
 * Plain-text twin of alertBody for channels that do not render HTML. Formspree
 * silently drops any submission containing a URL with a scheme, so links are
 * written as bare host paths and the referer as its hostname only.
 */
export function alertText(v: ShareVisit, viewNumber: number): string {
  const g = v.geo
  const where = [g?.city || v.city, g?.region, g?.country || v.country].filter(Boolean).join(', ') || 'unknown'
  const when = v.at.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET'
  const bare = (u: string) => u.replace(/^[a-z]+:\/\//i, '')
  let from = 'direct'
  if (v.referer) { try { from = new URL(v.referer).hostname } catch { from = bare(v.referer) } }
  return [
    `${v.title} was opened (view ${viewNumber}).`,
    `Open: ${bare(shareUrl(v.mapId))}`,
    `When: ${when}`,
    `IP: ${v.ip}${g?.hostname ? ` (${g.hostname})` : ''}`,
    `Where: ${where}`,
    `From: ${from}`,
    `Browser: ${v.userAgent || 'unknown'}`,
  ].join('\n')
}

/** Resend when RESEND_API_KEY is set, else Formspree when FORMSPREE_ID is set. */
async function sendEmail(v: ShareVisit, viewNumber: number): Promise<boolean> {
  const to = process.env.OWNER_EMAIL
  if (!to) return false
  const subject = `${alertTitle(v.title)} - ${v.ip}`
  const key = process.env.RESEND_API_KEY
  if (key) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.SHARE_ALERT_FROM || 'Mindmaps <onboarding@resend.dev>', to: [to], subject, html: alertBody(v, viewNumber) }),
    })
    return res.ok
  }
  const form = process.env.FORMSPREE_ID
  if (!form) return false
  // Formspree mails each submission to the form owner (the same inbox as OWNER_EMAIL).
  const res = await fetch(`https://formspree.io/f/${form}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: to, _subject: subject, message: alertText(v, viewNumber) }),
    signal: AbortSignal.timeout(5000),
  })
  return res.ok
}

/** Post the same HTML as a note on the owner's Stickies board (folder Alerts). */
async function postAlertNote(v: ShareVisit, viewNumber: number): Promise<void> {
  const key = process.env.STICKIES_API_KEY
  if (!key) return
  await fetch(`${process.env.STICKIES_URL || 'http://localhost:4444'}/api/stickies/ext`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'html',
      title: alertTitle(v.title),
      content: alertBody(v, viewNumber),
      folder: 'Alerts',
      icon: '__app:mindmaps',
    }),
    signal: AbortSignal.timeout(3000),
  })
}

/** Fire-and-forget. Call without awaiting; it swallows its own failures. */
export async function notifyShareView(v: ShareVisit): Promise<void> {
  try {
    const rowId = await logVisit(v)
    const count = await pool.query('SELECT COUNT(*) AS n FROM mindmaps_share_view_log WHERE file_id = $1', [v.mapId])
    const viewNumber = Number(count.rows[0]?.n ?? 1)
    v.geo = (await lookupIp(v.ip)) ?? undefined
    // Both channels, independently: a Stickies failure never blocks the email
    // and vice versa.
    const [emailed] = await Promise.all([
      sendEmail(v, viewNumber).catch(() => false),
      postAlertNote(v, viewNumber).catch(() => undefined),
    ])
    if (emailed && rowId) await pool.query('UPDATE mindmaps_share_view_log SET emailed = true WHERE id = $1', [rowId])
  } catch (e) {
    console.error('[share-alert] failed', e)
  }
}
