import { test as base, expect } from '@playwright/test'

// Extend Playwright's test to capture console errors/warnings on every test
export const test = base.extend<{ _consoleCheck: void }>({
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
