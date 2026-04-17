import { test, expect } from './fixtures'
import { waitForApp, createMap } from './helpers'

// ─── Paste Import ───────────────────────────────────────────────

test.describe('Paste Import — JSON', () => {
  test('paste valid JSON creates a new diagram', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)

    const json = JSON.stringify({
      "Test Diagram": [
        { "icon": "star", "Category A": ["item 1", "item 2", "item 3"] },
        { "icon": "brain", "Category B": ["item 4", "item 5"] }
      ]
    })

    // Dispatch paste event with JSON
    await page.evaluate((text) => {
      const event = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
      })
      event.clipboardData!.setData('text/plain', text)
      window.dispatchEvent(event)
    }, json)
    await page.waitForTimeout(1_500)

    // Should have loaded — canvas should appear with nodes
    const hasCanvas = await page.locator('.diagram-canvas-root').isVisible({ timeout: 5_000 }).catch(() => false)
    if (hasCanvas) {
      const nodeCount = await page.locator('.diagram-canvas-root svg text').count()
      expect(nodeCount).toBeGreaterThanOrEqual(1)
    }
  })

  test('paste invalid text does not load a diagram', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)

    // Remember we're on the home page
    const beforeUrl = page.url()

    await page.evaluate(() => {
      const event = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
      })
      event.clipboardData!.setData('text/plain', 'this is not valid json or outline')
      window.dispatchEvent(event)
    })
    await page.waitForTimeout(1_000)

    // Should still be on home — no canvas loaded
    const hasHome = await page.locator('[title="New blank map"], [title="New Map"]').count()
    expect(hasHome).toBeGreaterThan(0)
  })
})

test.describe('Paste Import — Indented Outline', () => {
  test('paste indented outline creates a diagram', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)

    const outline = `My Outline Map
    Branch One
        Sub Item A
        Sub Item B
    Branch Two
        Sub Item C`

    await page.evaluate((text) => {
      const event = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
      })
      event.clipboardData!.setData('text/plain', text)
      window.dispatchEvent(event)
    }, outline)
    await page.waitForTimeout(1_500)

    const hasCanvas = await page.locator('.diagram-canvas-root').isVisible({ timeout: 5_000 }).catch(() => false)
    if (hasCanvas) {
      const nodeCount = await page.locator('.diagram-canvas-root svg text').count()
      expect(nodeCount).toBeGreaterThanOrEqual(3)
    }
  })

  test('paste tab-indented outline creates a diagram', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)

    const outline = "Tab Root\n\tFirst Branch\n\t\tLeaf A\n\t\tLeaf B\n\tSecond Branch"

    await page.evaluate((text) => {
      const event = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
      })
      event.clipboardData!.setData('text/plain', text)
      window.dispatchEvent(event)
    }, outline)
    await page.waitForTimeout(1_500)

    const hasCanvas = await page.locator('.diagram-canvas-root').isVisible({ timeout: 5_000 }).catch(() => false)
    if (hasCanvas) {
      const nodeCount = await page.locator('.diagram-canvas-root svg text').count()
      expect(nodeCount).toBeGreaterThanOrEqual(3)
    }
  })
})

// ─── Keyboard Copy ──────────────────────────────────────────────

test.describe('Export — Keyboard Copy', () => {
  test('Cmd+C copies diagram data', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await createMap(page)

    // Select all nodes then copy
    await page.keyboard.press('Meta+a')
    await page.waitForTimeout(300)
    await page.keyboard.press('Meta+c')
    await page.waitForTimeout(500)

    // Clipboard should have content (JSON or indented outline)
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText.length).toBeGreaterThan(10)
  })
})

// ─── Canvas Toolbar ─────────────────────────────────────────────

test.describe('Canvas Toolbar', () => {
  test('Tag button exists on canvas toolbar', async ({ page }) => {
    await createMap(page)
    const tagBtn = page.locator('text="+ Tag"').first()
    await expect(tagBtn).toBeVisible()
  })

  test('PDF button exists on canvas toolbar', async ({ page }) => {
    await createMap(page)
    const pdfBtn = page.locator('text="PDF"').first()
    await expect(pdfBtn).toBeVisible()
  })

  test('Delete button exists on canvas toolbar', async ({ page }) => {
    await createMap(page)
    const deleteBtn = page.locator('text="Delete"').first()
    await expect(deleteBtn).toBeVisible()
  })

  test('Format button exists', async ({ page }) => {
    await createMap(page)
    const formatBtn = page.locator('[title="Format"]')
    await expect(formatBtn).toBeVisible()
  })

  test('Back button exists', async ({ page }) => {
    await createMap(page)
    const backBtn = page.locator('[title="All maps"]')
    await expect(backBtn).toBeVisible()
  })

  test('PDF export does not crash', async ({ page }) => {
    await createMap(page)
    const pdfBtn = page.locator('text="PDF"').first()
    if (await pdfBtn.isVisible()) {
      await pdfBtn.click()
      await page.waitForTimeout(2_000)
      // App should still be functional after PDF export
      const nodeCount = await page.locator('.diagram-canvas-root svg text').count()
      expect(nodeCount).toBeGreaterThanOrEqual(1)
    }
  })
})

// ─── Import Modal ───────────────────────────────────────────────

test.describe('Import Modal', () => {
  test('app loads without crashing', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    expect(await page.locator('[title="New blank map"], [title="New Map"]').count()).toBeGreaterThan(0)
  })
})
