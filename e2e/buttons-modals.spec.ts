import { test, expect } from './fixtures'
import { waitForApp } from './helpers'
import type { Page } from '@playwright/test'

// ──────────────────────────────────────────────────────────────────────────
// Exhaustive coverage of the Import modal, the auth/login screen, and the
// share / decoded-share VIEW-ONLY viewer. Every Copy button, method tile,
// and close path is exercised with a real assertion of its effect.
// ──────────────────────────────────────────────────────────────────────────

/** Open the Import modal from the home user menu. */
async function openImportModal(page: Page) {
  await page.goto('/')
  await waitForApp(page)
  await page.locator('[title="Bunlong Heng"]').click()
  await page.getByText('Import formats').click()
  await expect(page.getByRole('heading', { name: 'Import Formats' })).toBeVisible()
}

test.describe('Import modal — structure & method tiles', () => {
  test('modal renders all three import method tiles + the AI-discovery panel', async ({ page }) => {
    await openImportModal(page)
    // The 1/2/3 method rows + the discovery row are present.
    await expect(page.getByText('1. Generate with AI')).toBeVisible()
    await expect(page.getByText('2. Paste (⌘V) anywhere')).toBeVisible()
    await expect(page.getByText('3. POST via API')).toBeVisible()
    await expect(page.getByText('AI agents — how to discover this API')).toBeVisible()
    // Badges.
    await expect(page.getByText('Built-in')).toBeVisible()
    await expect(page.getByText('Auto-detect')).toBeVisible()
    await expect(page.getByText('External agents')).toBeVisible()
  })

  test('lucide.dev/icons link points to the icons reference', async ({ page }) => {
    await openImportModal(page)
    const link = page.getByRole('link', { name: 'lucide.dev/icons' })
    await expect(link).toHaveAttribute('href', 'https://lucide.dev/icons')
    await expect(link).toHaveAttribute('target', '_blank')
  })
})

test.describe('Import modal — copy buttons', () => {
  test('"Copy for AI" button copies the full instruction block to the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openImportModal(page)
    const copyAll = page.locator('[title="Copy all instructions for AI"]')
    await expect(copyAll).toBeVisible()
    await copyAll.click()
    // Effect: button flips to "Copied!" and clipboard holds the guide.
    await expect(page.getByText('Copied!')).toBeVisible({ timeout: 3_000 })
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toContain('Import Guide for AI Agents')
    expect(clip).toContain('POST via API')
  })

  test('per-code-block Copy button copies that snippet', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openImportModal(page)
    // The first copyable code block is the Paste JSON example (title="Copy").
    const copyBtns = page.locator('[title="Copy"]')
    await expect(copyBtns.first()).toBeVisible()
    await copyBtns.first().click()
    // Clipboard should now hold the JSON sample (contains "Root Title").
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toContain('Root Title')
  })

  test('the API curl code block copy works', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openImportModal(page)
    const copyBtns = page.locator('[title="Copy"]')
    const count = await copyBtns.count()
    expect(count).toBeGreaterThanOrEqual(3)
    // The curl block is the 2nd copyable (Paste=1st, curl=2nd, discovery=3rd).
    await copyBtns.nth(1).click()
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toContain('curl -X POST')
    expect(clip).toContain('/api/ai/mindmaps')
  })

  test('every Copy button click flips its icon to the green check', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openImportModal(page)
    const copyBtns = page.locator('[title="Copy"]')
    const count = await copyBtns.count()
    for (let i = 0; i < count; i++) {
      const btn = copyBtns.nth(i)
      await btn.click()
      // After click the check icon (lucide-check) renders inside this button.
      await expect(btn.locator('svg.lucide-check')).toBeVisible({ timeout: 3_000 })
      // Wait for it to revert so the next iteration's count stays stable.
      await expect(btn.locator('svg.lucide-check')).toBeHidden({ timeout: 3_000 })
    }
  })
})

test.describe('Import modal — close behaviors', () => {
  test('X button closes the modal', async ({ page }) => {
    await openImportModal(page)
    // The X close button sits next to "Copy for AI" in the header.
    await page.locator('button:has(svg.lucide-x)').first().click()
    await expect(page.getByRole('heading', { name: 'Import Formats' })).toBeHidden()
  })

  test('backdrop click closes the modal', async ({ page }) => {
    await openImportModal(page)
    // Click far top-left on the dimmed backdrop, outside the centered panel.
    await page.mouse.click(5, 5)
    await expect(page.getByRole('heading', { name: 'Import Formats' })).toBeHidden()
  })

  test('clicking inside the panel does NOT close it', async ({ page }) => {
    await openImportModal(page)
    // Click on the modal heading — stopPropagation keeps it open.
    await page.getByRole('heading', { name: 'Import Formats' }).click()
    await expect(page.getByRole('heading', { name: 'Import Formats' })).toBeVisible()
  })
})

test.describe('Auth — login screen', () => {
  // Force the unauthenticated state by clearing the localStorage seed before
  // the app mounts. On localhost App seeds DEV_USER in the useState initializer,
  // so we sign out via the menu to reach the login form deterministically.
  test('sign out reveals a login form with email + password + Sign in button', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await page.locator('[title="Bunlong Heng"]').click()
    await page.getByText('Sign out').click()
    await expect(page.getByRole('button', { name: /Sign in/ })).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByText('Sign in to continue')).toBeVisible()
  })

  test('login with invalid credentials surfaces an error (no navigation)', async ({ page }) => {
    // Stub the auth endpoint to reject so we never hit the real API.
    await page.route('**/api/auth', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Invalid credentials' }) }),
    )
    await page.goto('/')
    await waitForApp(page)
    await page.locator('[title="Bunlong Heng"]').click()
    await page.getByText('Sign out').click()
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5_000 })

    await page.locator('input[type="email"]').fill('nope@example.com')
    await page.locator('input[type="password"]').fill('wrongpass')
    await page.getByRole('button', { name: /Sign in/ }).click()

    // Error renders, form stays.
    await expect(page.getByText('Invalid credentials')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('submitting login shows the loading spinner then recovers on error', async ({ page }) => {
    // Delay the auth response so we can observe the in-flight loading state.
    // App replaces the whole form with a full-page spinner while authLoading is
    // true, so we assert the spinner appears, then the form returns with the error.
    await page.route('**/api/auth', async route => {
      await new Promise(r => setTimeout(r, 1000))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Invalid credentials' }) })
    })
    await page.goto('/')
    await waitForApp(page)
    await page.locator('[title="Bunlong Heng"]').click()
    await page.getByText('Sign out').click()
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5_000 })
    await page.locator('input[type="email"]').fill('a@b.com')
    await page.locator('input[type="password"]').fill('secret')
    await page.locator('form button[type="submit"]').click()
    // In-flight: the form is replaced by the spinner (the email input disappears).
    await expect(page.locator('input[type="email"]')).toBeHidden({ timeout: 2_000 })
    // After the response resolves, the form returns with the error message.
    await expect(page.getByText('Invalid credentials')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })
})

test.describe('Viewer — decoded share (?d=) VIEW ONLY', () => {
  test('a ?d= encoded diagram renders the read-only viewer', async ({ page }) => {
    // Build a minimal diagram and encode it the same way share.ts does.
    const diagram = {
      id: 'e2e-shared',
      name: 'Shared View Map',
      type: 'mindmap',
      lineStyle: 'orthogonal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 'root', title: 'Shared Root', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 140, height: 140, sortOrder: 0 },
        { id: 'c1', title: 'Branch One', color: '#22c55e', parentId: 'root', depth: 1, x: 200, y: -40, width: 120, height: 40, sortOrder: 0 },
        { id: 'c2', title: 'Branch Two', color: '#3b82f6', parentId: 'root', depth: 1, x: 200, y: 40, width: 120, height: 40, sortOrder: 1 },
      ],
    }
    const b64 = await page.evaluate((d) => btoa(unescape(encodeURIComponent(JSON.stringify(d)))), diagram)
    await page.goto(`/?d=${encodeURIComponent(b64)}`)

    // Effect: VIEW ONLY badge + canvas with the shared nodes, no editor chrome.
    // (Multi-word root titles wrap into tspans that concatenate without spaces,
    //  so we assert on a single-line leaf node whose text is rendered verbatim.)
    await expect(page.getByText('VIEW ONLY')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.diagram-canvas-root')).toBeVisible()
    await expect(page.locator('.diagram-canvas-root svg text').filter({ hasText: 'Branch One' }).first()).toBeVisible({ timeout: 5_000 })
    // No back/format chrome in the viewer.
    await expect(page.locator('[title="All maps"]')).toHaveCount(0)
    await expect(page.locator('[title="Format"]')).toHaveCount(0)
  })

  test('a malformed ?d= payload falls back to the normal app (no crash)', async ({ page }) => {
    await page.goto('/?d=not-valid-base64-%%%')
    await waitForApp(page)
    // decodeShareURL returns null → app renders home (auto-login on localhost).
    await expect(page.locator('[title="New blank map"], [title="New Map"]').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('VIEW ONLY')).toHaveCount(0)
  })
})

test.describe('Viewer — ?share= id VIEW ONLY', () => {
  test('a ?share=<id> link loads the read-only viewer from the API', async ({ page }) => {
    // Stub the single-map load the viewer performs for the share id.
    await page.route(/\/api\/mindmaps\?.*\bid=e2e-share-id/, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id: 'e2e-share-id', name: 'Share Id Map', type: 'mindmap',
          line_style: 'orthogonal', theme_id: 'default', sharing_enabled: true, tags: [],
          nodes: [
            { id: 'root', title: 'Share Root', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 140, height: 140, sortOrder: 0 },
            { id: 'c1', title: 'Child', color: '#22c55e', parentId: 'root', depth: 1, x: 200, y: 0, width: 120, height: 40, sortOrder: 0 },
          ],
        }),
      }),
    )
    await page.goto('/?share=e2e-share-id')
    await expect(page.getByText('VIEW ONLY')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.diagram-canvas-root')).toBeVisible()
    // Assert on the single-line child node (root titles wrap across tspans).
    await expect(page.locator('.diagram-canvas-root svg text').filter({ hasText: 'Child' }).first()).toBeVisible({ timeout: 5_000 })
  })
})
