import { test as base, expect } from '@playwright/test'

// Extend Playwright's test with two always-on fixtures:
//   _consoleCheck — fails a test if it logged console errors/warnings
//   _mapCleanup   — deletes any maps the test created so runs don't pile up
//                   throwaway maps in the backing store (tests proxy to the real API)
export const test = base.extend<{ _consoleCheck: void; _mapCleanup: void }>({
  _mapCleanup: [async ({ page }, use) => {
    const createdIds = new Set<string>()
    page.on('request', req => {
      if (req.method() !== 'POST' || !req.url().includes('/api/mindmaps')) return
      try {
        const id = JSON.parse(req.postData() ?? '{}')?.id
        if (id) createdIds.add(id)
      } catch { /* ignore non-JSON bodies */ }
    })
    await use()
    // Best-effort teardown: delete each map this test created.
    for (const id of createdIds) {
      await page.request.delete(`/api/mindmaps?id=${id}`).catch(() => {})
    }
  }, { auto: true }],

  _consoleCheck: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        const text = msg.text()
        // Ignore known browser/infra noise
        const lower = text.toLowerCase()
        if (lower.includes('react devtools')) return
        if (lower.includes('third-party cookie')) return
        if (lower.includes('favicon')) return
        if (lower.includes('websocket')) return
        if (lower.includes('supabase')) return
        if (lower.includes('failed to fetch')) return
        if (lower.includes('http authentication')) return
        if (lower.includes('no valid credentials')) return
        if (lower.includes('net::err_')) return
        if (lower.includes('failed to load resource')) return
        errors.push(`[${msg.type()}] ${text}`)
      }
    })
    page.on('pageerror', err => {
      errors.push(`[pageerror] ${err.message}`)
    })
    await use()
    // After each test, assert zero console errors/warnings
    expect(errors, `Console errors/warnings detected:\n${errors.join('\n')}`).toEqual([])
  }, { auto: true }],
})

export { expect }
