import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const queryMock = vi.fn()
vi.mock('../db.js', () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }))

import { alertBody, clientIp, isBot, notifyShareView, readVisit } from '../share-alert'

const VISIT = () => readVisit(
  { 'x-forwarded-for': '73.159.109.147, 10.0.0.1', 'user-agent': 'Mozilla/5.0 (iPhone) Safari', 'x-vercel-ip-city': 'Springfield', 'x-vercel-ip-country': 'US' },
  'map-1', 'Roadmap',
)

// logVisit: INSERT RETURNING id, then COUNT, then optional UPDATE.
function dbHappy(n = 3) {
  queryMock.mockReset()
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: 'row-1' }] })
    .mockResolvedValueOnce({ rows: [{ n: String(n) }] })
    .mockResolvedValue({ rows: [] })
}

const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  vi.unstubAllEnvs()
})
afterEach(() => { vi.unstubAllGlobals() })

describe('clientIp', () => {
  it('prefers x-vercel-forwarded-for, then x-forwarded-for, then x-real-ip, first hop only', () => {
    expect(clientIp({ 'x-vercel-forwarded-for': '1.1.1.1, 9.9.9.9', 'x-forwarded-for': '2.2.2.2', 'x-real-ip': '3.3.3.3' })).toBe('1.1.1.1')
    expect(clientIp({ 'x-forwarded-for': '2.2.2.2, 9.9.9.9', 'x-real-ip': '3.3.3.3' })).toBe('2.2.2.2')
    expect(clientIp({ 'x-real-ip': '3.3.3.3' })).toBe('3.3.3.3')
    expect(clientIp({})).toBe('unknown')
  })
})

describe('isBot', () => {
  it('skips link-preview crawlers and keeps real browsers', () => {
    for (const ua of ['Slackbot-LinkExpanding 1.0', 'facebookexternalhit/1.1', 'WhatsApp/2.23', 'Twitterbot/1.0', 'Mozilla/5.0 (compatible; Discordbot/2.0)', 'HeadlessChrome/120']) {
      expect(isBot(ua)).toBe(true)
    }
    expect(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1')).toBe(false)
  })
})

describe('alertBody', () => {
  it('says which view this is, draws the map, and escapes the title', () => {
    const v = VISIT()
    v.title = 'Q3 <plan> & "notes"'
    v.geo = { hostname: null, city: 'Springfield', region: 'Massachusetts', country: 'US', loc: '42.1015,-72.5898', org: 'AS7922 Comcast', postal: '01103', timezone: 'America/New_York' }
    const html = alertBody(v, 4)
    expect(html).toContain('view <b>4</b>')
    expect(html).toContain('https://static-maps.yandex.ru/1.x/?lang=en_US&ll=-72.5898,42.1015&z=9')
    expect(html).toContain('Q3 &lt;plan&gt; &amp; &quot;notes&quot;')
    expect(html).not.toContain('<plan>')
    expect(html).toContain('Massachusetts')
    expect(html).toContain('ipinfo.io/73.159.109.147')
    expect(html).toContain('https://mindmaps-bheng.vercel.app/s/map-1')
    expect(html).toContain('/icons/android-chrome-192x192.png')
    expect(html).not.toMatch(/[\u2013\u2014]/)
  })

  it('shows unknown in grey for missing fields and no map without coordinates', () => {
    const html = alertBody(VISIT(), 1)
    expect(html).toContain('>unknown</span>')
    expect(html).not.toContain('static-maps.yandex.ru')
  })
})

describe('notifyShareView', () => {
  it('emails the owner once with the right to and subject, then marks the row emailed', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('OWNER_EMAIL', 'owner@example.com')
    dbHappy(3)
    fetchMock.mockImplementation((url: string) => {
      if (String(url).startsWith('https://ipinfo.io/')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ city: 'Springfield', region: 'Massachusetts', country: 'US', loc: '42.1,-72.5' }) })
      return Promise.resolve({ ok: true })
    })
    await notifyShareView(VISIT())
    const resend = fetchMock.mock.calls.filter(c => c[0] === 'https://api.resend.com/emails')
    expect(resend).toHaveLength(1)
    const body = JSON.parse(resend[0][1].body)
    expect(body.to).toEqual(['owner@example.com'])
    expect(body.subject).toBe('Mindmaps - Opened: Roadmap - 73.159.109.147')
    expect(body.html).toContain('view <b>3</b>')
    expect(body.html).toContain('Massachusetts')
    const update = queryMock.mock.calls.find(c => /UPDATE mindmaps_share_view_log SET emailed/.test(c[0]))
    expect(update?.[1]).toEqual(['row-1'])
    const insert = queryMock.mock.calls.find(c => /INSERT INTO mindmaps_share_view_log/.test(c[0]))
    expect(insert?.[1].slice(0, 4)).toEqual(['map-1', 'Roadmap', 'view', '73.159.109.147'])
  })

  it('emails through Formspree when there is no Resend key but FORMSPREE_ID is set', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('OWNER_EMAIL', 'owner@example.com')
    vi.stubEnv('FORMSPREE_ID', 'abc123')
    dbHappy(4)
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    await notifyShareView(VISIT())
    const form = fetchMock.mock.calls.filter(c => c[0] === 'https://formspree.io/f/abc123')
    expect(form).toHaveLength(1)
    const body = JSON.parse(form[0][1].body)
    expect(body).toMatchObject({ email: 'owner@example.com', _subject: 'Mindmaps - Opened: Roadmap - 73.159.109.147' })
    expect(body.message).toContain('view 4')
    expect(body.message).toContain('/s/map-1')
    expect(body.message).not.toMatch(/https?:\/\//)
    expect(fetchMock.mock.calls.some(c => c[0] === 'https://api.resend.com/emails')).toBe(false)
    const update = queryMock.mock.calls.find(c => /UPDATE mindmaps_share_view_log SET emailed/.test(c[0]))
    expect(update?.[1]).toEqual(['row-1'])
  })

  it('posts the Stickies note as well as the email when both are configured', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('OWNER_EMAIL', 'owner@example.com')
    vi.stubEnv('STICKIES_API_KEY', 'sk_test')
    vi.stubEnv('STICKIES_URL', 'https://stickies.example.com')
    dbHappy(2)
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
    await notifyShareView(VISIT())
    expect(fetchMock.mock.calls.filter(c => c[0] === 'https://api.resend.com/emails')).toHaveLength(1)
    const note = fetchMock.mock.calls.find(c => c[0] === 'https://stickies.example.com/api/stickies/ext')
    expect(note).toBeTruthy()
    expect(JSON.parse(note![1].body).content).toContain('view <b>2</b>')
  })

  it('posts a Stickies note when there is no email key', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.stubEnv('STICKIES_API_KEY', 'sk_test')
    dbHappy(1)
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) })
    await notifyShareView(VISIT())
    expect(fetchMock.mock.calls.some(c => c[0] === 'https://api.resend.com/emails')).toBe(false)
    const note = fetchMock.mock.calls.find(c => String(c[0]).endsWith('/api/stickies/ext'))
    expect(note).toBeTruthy()
    const body = JSON.parse(note![1].body)
    expect(body).toMatchObject({ type: 'html', title: 'Mindmaps - Opened: Roadmap', folder: 'Alerts', icon: '__app:mindmaps' })
    expect(body.content).toContain('view <b>1</b>')
    expect(note![1].headers.Authorization).toBe('Bearer sk_test')
  })

  it('never stacks the Opened: prefix on the note title', async () => {
    vi.stubEnv('STICKIES_API_KEY', 'sk_test')
    dbHappy(1)
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) })
    const v = VISIT(); v.title = 'Mindmaps - Opened: Opened: Roadmap'
    await notifyShareView(v)
    const note = fetchMock.mock.calls.find(c => String(c[0]).endsWith('/api/stickies/ext'))
    expect(JSON.parse(note![1].body).title).toBe('Mindmaps - Opened: Roadmap')
  })

  it('never throws when the database is down', async () => {
    queryMock.mockReset()
    queryMock.mockRejectedValue(new Error('connection refused'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(notifyShareView(VISIT())).resolves.toBeUndefined()
    expect(err).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    err.mockRestore()
  })
})
