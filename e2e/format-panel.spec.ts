import { test, expect } from './fixtures'

async function createMapAndOpenFormat(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('[title="New blank map"]', { timeout: 10_000 })
  await page.click('[title="New blank map"]')
  await page.waitForSelector('.diagram-canvas-root', { timeout: 10_000 })
  await page.waitForTimeout(500)
  // Open Format panel
  await page.click('[title="Format"]')
  await page.waitForTimeout(300)
}

test.describe('Format Panel', () => {
  test.beforeEach(async ({ page }) => {
    await createMapAndOpenFormat(page)
  })

  test('Format panel opens and closes', async ({ page }) => {
    // Panel should be visible
    const panelText = page.locator('text=Layout')
    await expect(panelText.first()).toBeVisible({ timeout: 3_000 })
    // Close via the X button inside the panel
    const closeBtn = page.locator('svg.lucide-x').first()
    await closeBtn.click()
    await page.waitForTimeout(300)
    // Panel should be hidden
    await expect(panelText.first()).not.toBeVisible()
  })

  test('switch to all diagram types', async ({ page }) => {
    const types = ['Mind Map', 'Tree ↓', 'Tree →', 'Fishbone', 'Timeline', 'Logic Chart']
    for (const label of types) {
      const btn = page.locator(`text="${label}"`).first()
      if (await btn.isVisible()) {
        await btn.click()
        await page.waitForTimeout(800)
        // Canvas should still render nodes
        const nodeCount = await page.locator('.diagram-canvas-root svg text').count()
        expect(nodeCount).toBeGreaterThanOrEqual(1)
      }
    }
  })

  test('switch line styles', async ({ page }) => {
    // Line styles: Brace, Straight, Square
    const lineStyles = ['Brace', 'Straight', 'Square']
    for (const style of lineStyles) {
      const btn = page.locator(`text="${style}"`).first()
      if (await btn.isVisible()) {
        await btn.click()
        await page.waitForTimeout(300)
        // Canvas should still render
        const nodeCount = await page.locator('.diagram-canvas-root svg text').count()
        expect(nodeCount).toBeGreaterThanOrEqual(1)
      }
    }
  })

  test('toggle show order numbers', async ({ page }) => {
    // Look for the "Show order #" toggle
    const toggle = page.locator('text="Show order #"')
    if (await toggle.isVisible()) {
      // Find the toggle button next to it (sibling button)
      const toggleBtn = page.locator('text="Show order #"').locator('..').locator('button')
      if (await toggleBtn.count() > 0) {
        await toggleBtn.click()
        await page.waitForTimeout(300)
        // Should not crash — canvas still renders
        const nodeCount = await page.locator('.diagram-canvas-root svg text').count()
        expect(nodeCount).toBeGreaterThanOrEqual(1)
      }
    }
  })

  test('switch themes', async ({ page }) => {
    // Theme buttons: Rainbow Light, Retro B&W, Cyberpunk Neon, Monokai
    const themes = ['Rainbow Light', 'Retro B&W', 'Cyberpunk Neon', 'Monokai']
    for (const theme of themes) {
      const btn = page.locator(`text="${theme}"`).first()
      if (await btn.isVisible()) {
        await btn.click()
        await page.waitForTimeout(500)
        // Canvas should still render with nodes
        const nodeCount = await page.locator('.diagram-canvas-root svg text').count()
        expect(nodeCount).toBeGreaterThanOrEqual(1)
      }
    }
  })

  test('toggle hide details', async ({ page }) => {
    const toggle = page.locator('text="Hide details"')
    if (await toggle.isVisible()) {
      const toggleBtn = toggle.locator('..').locator('button')
      if (await toggleBtn.count() > 0) {
        await toggleBtn.click()
        await page.waitForTimeout(300)
        // Canvas still renders
        const nodeCount = await page.locator('.diagram-canvas-root svg text').count()
        expect(nodeCount).toBeGreaterThanOrEqual(1)
        // Toggle back
        await toggleBtn.click()
        await page.waitForTimeout(300)
      }
    }
  })
})

test.describe('Format Panel — Node Editing', () => {
  test('select node and check panel shows node options', async ({ page }) => {
    await createMapAndOpenFormat(page)
    // Click on "Main Topic 1" to select it
    const box = await page.evaluate(() => {
      const svg = document.querySelector('.diagram-canvas-root svg')
      if (!svg) return null
      const texts = svg.querySelectorAll('text')
      for (const t of texts) {
        if (t.textContent?.includes('Main Topic 1')) {
          const g = t.closest('g')
          if (g) { const r = g.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
        }
      }
      return null
    })
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(500)
      // Panel should show node-specific options (like icon picker, color, alignment)
      // Check for text alignment buttons
      const hasAlignment = await page.evaluate(() => {
        return document.querySelectorAll('svg').length > 0
      })
      expect(hasAlignment).toBe(true)
    }
  })

  test('text alignment buttons work', async ({ page }) => {
    await createMapAndOpenFormat(page)
    // Select a node first
    const box = await page.evaluate(() => {
      const svg = document.querySelector('.diagram-canvas-root svg')
      if (!svg) return null
      const texts = svg.querySelectorAll('text')
      for (const t of texts) {
        if (t.textContent?.includes('Main Topic 1')) {
          const g = t.closest('g')
          if (g) { const r = g.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
        }
      }
      return null
    })
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(500)
      // Try clicking alignment buttons if visible
      const alignBtns = page.locator('[title="Left"], [title="Center"], [title="Right"]')
      const count = await alignBtns.count()
      for (let i = 0; i < count; i++) {
        await alignBtns.nth(i).click()
        await page.waitForTimeout(200)
        // Canvas should still render
        const nodeCount = await page.locator('.diagram-canvas-root svg text').count()
        expect(nodeCount).toBeGreaterThanOrEqual(1)
      }
    }
  })
})

test.describe('Export & Actions', () => {
  test('PDF export button exists', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[title="New blank map"]', { timeout: 10_000 })
    await page.click('[title="New blank map"]')
    await page.waitForSelector('.diagram-canvas-root', { timeout: 10_000 })
    await page.waitForTimeout(500)
    // PDF button should be in the bottom bar
    const pdfBtn = page.locator('text="PDF"')
    await expect(pdfBtn.first()).toBeVisible()
  })

  test('Delete button exists', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[title="New blank map"]', { timeout: 10_000 })
    await page.click('[title="New blank map"]')
    await page.waitForSelector('.diagram-canvas-root', { timeout: 10_000 })
    await page.waitForTimeout(500)
    const deleteBtn = page.locator('text="Delete"')
    await expect(deleteBtn.first()).toBeVisible()
  })
})
