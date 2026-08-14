import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Wait for app to load (home or canvas) */
export async function waitForApp(page: Page) {
  await page.waitForSelector('.diagram-canvas-root, [title="New blank map"], [title="New Map"]', { timeout: 10_000 })
}

/**
 * Assert the Google-only login screen (GIS). The app has no email/password form
 * anymore: the sign-in card shows the Mindmaps logo, "Sign in to continue", and
 * either the Google button mount (when VITE_GOOGLE_CLIENT_ID is configured) or
 * the "Sign-in is not configured" notice (local dev without a client id).
 */
export async function expectLoginScreen(page: Page) {
  await expect(page.getByText('Sign in to continue')).toBeVisible({ timeout: 5_000 })
  await expect(page.getByAltText('Mindmaps')).toBeVisible()
  await expect(page.getByText('Mindmaps', { exact: true })).toBeVisible()
  // Google sign-in affordance: the GIS mount div (min-height 44px, the container
  // Google renders the "Continue with Google" button into) or the fallback notice.
  const googleMount = page.locator('div[style*="min-height: 44px"]')
  const notConfigured = page.getByText('Sign-in is not configured')
  expect(await googleMount.count() + await notConfigured.count()).toBeGreaterThan(0)
  // The removed password flow must never come back.
  await expect(page.locator('input[type="email"]')).toHaveCount(0)
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
}

/** Create a new blank map and wait for the canvas to appear */
export async function createMap(page: Page) {
  await page.goto('/')
  await waitForApp(page)
  await page.click('[title="New blank map"]')
  // Wait for canvas — if it doesn't appear, click the first diagram card
  const appeared = await page.waitForSelector('.diagram-canvas-root', { timeout: 5_000 }).catch(() => null)
  if (!appeared) {
    const card = page.locator('text="Untitled"').first()
    if (await card.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await card.click()
      await page.waitForSelector('.diagram-canvas-root', { timeout: 10_000 })
    }
  }
  await page.waitForTimeout(500)
}

/** Get bounding box of a node by its visible text */
export async function getNodeBox(page: Page, textContent: string) {
  return page.evaluate((text) => {
    const svg = document.querySelector('.diagram-canvas-root svg')
    if (!svg) return null
    const texts = svg.querySelectorAll('text')
    for (const t of texts) {
      if (t.textContent?.includes(text)) {
        const g = t.closest('g')
        if (g) {
          const rect = g.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        }
      }
    }
    return null
  }, textContent)
}
