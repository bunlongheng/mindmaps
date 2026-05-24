import { test, expect } from './fixtures'
import { waitForApp } from './helpers'

// Regression guard for the "tap a map and it won't open" bug.
//
// Root cause: loadDiagram() set the active map only on a successful fetch. With no
// localStorage cache (cleared on every login) a single flaky/5xx single-map request
// left activeMindmap null, yet handleOpenDiagram still flipped to the editor view and
// pushed ?map=... — so the editor guard silently re-rendered the home grid. The user
// saw the URL change but the map never opened.
//
// Fix: loadDiagram returns the loaded diagram (or null) and retries transient errors;
// callers only enter the editor when a map actually loaded, otherwise they stay on
// home and surface a clear error toast.

test.describe('Open map', () => {
  test('clicking a map card opens the editor canvas', async ({ page }) => {
    // The home grid is real, shared prod data and every spec runs in parallel, so
    // the newest card is often a throwaway map a concurrent spec creates and then
    // deletes (via _mapCleanup) mid-click — a 404 that would (correctly) bounce us
    // back home. Pin the single-map load to a deterministic success so this happy
    // path asserts the open flow, not a race with other specs. The 404 and retry
    // paths are covered by the two tests below. (The list request — ?user_id= with
    // no \bid= — is left live so the grid still renders real cards.)
    await page.route(/\/api\/mindmaps\?.*\bid=/, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id: 'e2e-open-map', name: 'E2E Open Map', type: 'mindmap',
          line_style: 'orthogonal', theme_id: 'default', sharing_enabled: false, tags: [],
          nodes: [{ id: 'root', title: 'Root', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 140, height: 140, sortOrder: 0 }],
        }),
      }),
    )

    await page.goto('/')
    await waitForApp(page)

    const card = page.locator('.home-grid > div').first()
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.click()

    // The canvas must actually mount — not bounce back to the grid.
    await expect(page.locator('.diagram-canvas-root')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[title="All maps"]')).toBeVisible()
    expect(page.url()).toContain('?map=')
  })

  test('failed map load stays on home with an error toast (no silent bounce)', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)

    // Simulate the iOS condition: no cache to fall back on.
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter(k => k.startsWith('mindmaps:diagram:') || k === 'activeMindmapId')
        .forEach(k => localStorage.removeItem(k))
    })

    // Simulate a flaky/down backend for single-map loads only (list still works so
    // the grid renders). 500 forces loadDiagram to exhaust its retry and return null.
    await page.route(/\/api\/mindmaps\?.*\bid=/, route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"simulated outage"}' }),
    )

    const card = page.locator('.home-grid > div').first()
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.click()

    // Must NOT enter a blank editor.
    await expect(page.locator('.diagram-canvas-root')).toHaveCount(0)
    // Must stay on the home grid and tell the user what happened.
    await expect(page.locator('.home-grid')).toBeVisible()
    await expect(page.getByText(/Couldn't open that map/i)).toBeVisible({ timeout: 5_000 })
    // URL must not be left pointing at a map it never opened.
    expect(page.url()).not.toContain('?map=')
  })

  test('a transient 5xx self-heals on retry and the map opens', async ({ page }) => {
    // loadDiagram's single-map request sends Content-Type: application/json; the
    // grid's minimap thumbnails hit the same endpoint with no headers. Target only
    // the load: first attempt 503, retry serves a valid map — proving loadDiagram's
    // built-in retry recovers without the user tapping again. (Minimaps get the same
    // valid map; not distinguishing them would feed the one 503 to a thumbnail fetch
    // instead of the load, and route.continue() would race with parallel specs that
    // delete the clicked card.)
    const validMap = JSON.stringify({
      id: 'e2e-retry', name: 'E2E Retry', type: 'mindmap',
      line_style: 'orthogonal', theme_id: 'default', sharing_enabled: false, tags: [],
      nodes: [{ id: 'root', title: 'Root', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 140, height: 140, sortOrder: 0 }],
    })
    let loadHits = 0
    await page.route(/\/api\/mindmaps\?.*\bid=/, route => {
      const isLoad = route.request().headers()['content-type'] === 'application/json'
      if (!isLoad) return route.fulfill({ status: 200, contentType: 'application/json', body: validMap })
      loadHits += 1
      if (loadHits === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"cold start"}' })
      return route.fulfill({ status: 200, contentType: 'application/json', body: validMap })
    })

    await page.goto('/')
    await waitForApp(page)
    await page.evaluate(() => {
      Object.keys(localStorage)
        .filter(k => k.startsWith('mindmaps:diagram:') || k === 'activeMindmapId')
        .forEach(k => localStorage.removeItem(k))
    })

    const card = page.locator('.home-grid > div').first()
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.click()

    await expect(page.locator('.diagram-canvas-root')).toBeVisible({ timeout: 10_000 })
    expect(loadHits).toBeGreaterThanOrEqual(2)
  })
})
