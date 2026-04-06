import { test as base, expect } from '@playwright/test'

// Extend Playwright's test to capture console errors/warnings on every test
export const test = base.extend<{ _consoleCheck: void }>({
  _consoleCheck: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        const text = msg.text()
        // Ignore known browser noise
        if (text.includes('Download the React DevTools')) return
        if (text.includes('Third-party cookie')) return
        if (text.includes('favicon.ico')) return
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
