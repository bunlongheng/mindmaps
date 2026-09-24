// @vitest-environment node
import { describe, it, expect } from 'vitest'
import middleware, { config } from '../../middleware'

const UUID = '22222222-2222-4222-8222-222222222222'
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'

function req(url: string, ua: string): Request {
  return new Request(`https://mindmaps-bheng.vercel.app${url}`, { headers: { 'user-agent': ua } })
}

/** rewrite() encodes its target in x-middleware-rewrite; next() in x-middleware-next. */
const rewriteTarget = (res: Response) => res.headers.get('x-middleware-rewrite')
const passedThrough = (res: Response) => res.headers.get('x-middleware-next') === '1' && rewriteTarget(res) === null

describe('edge middleware', () => {
  it('only runs on the root path', () => {
    expect(config.matcher).toEqual(['/'])
  })

  it('sends a bot on /?share=<uuid> to the OG handler', () => {
    const res = middleware(req(`/?share=${UUID}`, 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'))
    expect(rewriteTarget(res)).toBe(`https://mindmaps-bheng.vercel.app/api/og?id=${UUID}`)
  })

  it('sends a bot on /?id=<uuid> to the OG handler', () => {
    const res = middleware(req(`/?id=${UUID}`, 'Twitterbot/1.0'))
    expect(rewriteTarget(res)).toBe(`https://mindmaps-bheng.vercel.app/api/og?id=${UUID}`)
  })

  it('matches every crawler in the list, case-insensitively', () => {
    const uas = [
      'facebookexternalhit/1.1',
      'Twitterbot/1.0',
      'Slackbot 1.0 (+https://api.slack.com/robots)',
      'LinkedInBot/1.0',
      'Mozilla/5.0 (compatible; Discordbot/2.0)',
      'WhatsApp/2.23',
      'TelegramBot (like TwitterBot)',
      'Mozilla/5.0 (Macintosh) applebot/0.1',
      'Applebot/0.1',
      'Mozilla/5.0 (compatible; Googlebot/2.1)',
      'iMessage/1.0',
    ]
    for (const ua of uas) {
      const res = middleware(req(`/?share=${UUID}`, ua))
      expect(rewriteTarget(res), `no rewrite for ${ua}`).toBe(`https://mindmaps-bheng.vercel.app/api/og?id=${UUID}`)
    }
  })

  it('passes a bot through when the id is not a UUID', () => {
    for (const bad of ['not-a-uuid', '../../etc/passwd', '<script>alert(1)</script>', '2222']) {
      const res = middleware(req(`/?share=${encodeURIComponent(bad)}`, 'Slackbot 1.0'))
      expect(passedThrough(res), `rewrote on ${bad}`).toBe(true)
    }
  })

  it('passes a bot through when there is no share or id at all', () => {
    expect(passedThrough(middleware(req('/', 'Twitterbot/1.0')))).toBe(true)
    expect(passedThrough(middleware(req('/?imported=1', 'Twitterbot/1.0')))).toBe(true)
  })

  it('passes a real browser through even with a valid share id', () => {
    expect(passedThrough(middleware(req(`/?share=${UUID}`, BROWSER_UA)))).toBe(true)
    expect(passedThrough(middleware(req(`/?id=${UUID}`, BROWSER_UA)))).toBe(true)
  })

  it('passes through when there is no user-agent header', () => {
    const res = middleware(new Request(`https://mindmaps-bheng.vercel.app/?share=${UUID}`))
    expect(passedThrough(res)).toBe(true)
  })
})
