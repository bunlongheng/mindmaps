import { test, expect } from './fixtures'
import { createMap } from './helpers'

test.describe('Save & Persist', () => {
  test('added node persists after back and reopen', async ({ page }) => {
    await createMap(page)

    // Count nodes before
    const beforeCount = await page.locator('.diagram-canvas-root svg text').count()

    // Add a child node via Tab
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)
    const afterAdd = await page.locator('.diagram-canvas-root svg text').count()
    expect(afterAdd).toBeGreaterThan(beforeCount)

    // Wait for auto-persist (Zustand subscriber writes immediately, but give it a moment)
    await page.waitForTimeout(500)

    // Click back button
    const backBtn = page.locator('[title="All maps"]')
    if (await backBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await backBtn.click()
      await page.waitForSelector('[title="New blank map"], [title="New Map"]', { timeout: 5_000 })
    } else {
      // Fallback: navigate directly
      await page.goto('/')
      await page.waitForSelector('[title="New blank map"], [title="New Map"]', { timeout: 10_000 })
    }
    await page.waitForTimeout(500)

    // Reopen the diagram — click the first card (most recent = "Untitled")
    const card = page.locator('text="Untitled"').first()
    if (await card.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await card.click()
      await page.waitForSelector('.diagram-canvas-root', { timeout: 10_000 })
      await page.waitForTimeout(1000)

      // Verify the added node is still there
      const reopenCount = await page.locator('.diagram-canvas-root svg text').count()
      expect(reopenCount).toBe(afterAdd)
    }
  })

  test('Cmd+S saves and shows toast', async ({ page }) => {
    await createMap(page)

    // Add a node
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    // Press Cmd+S
    await page.keyboard.press('Meta+s')
    await page.waitForTimeout(1000)

    // Should show a "saved" toast
    const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase())
    expect(bodyText).toContain('saved')
  })

  test('node edit persists after back and reopen', async ({ page }) => {
    await createMap(page)

    // Find and double-click "Main Topic 1" to edit
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
    if (!box) return

    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
    const input = page.locator('.diagram-canvas-root input')
    await input.waitFor({ timeout: 3_000 })
    await input.fill('Persisted Title')
    await input.press('Enter')
    await page.waitForTimeout(1000)

    // Go back
    const backBtn = page.locator('[title="All maps"]')
    if (await backBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await backBtn.click()
      await page.waitForSelector('[title="New blank map"], [title="New Map"]', { timeout: 5_000 })
    }
    await page.waitForTimeout(500)

    // Reopen
    const card = page.locator('text="Untitled"').first()
    if (await card.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await card.click()
      await page.waitForSelector('.diagram-canvas-root', { timeout: 10_000 })
      await page.waitForTimeout(1000)

      // Verify edited title persisted
      const hasTitle = await page.evaluate(() => {
        const texts = document.querySelectorAll('.diagram-canvas-root svg text')
        return Array.from(texts).some(t => t.textContent?.includes('Persisted Title'))
      })
      expect(hasTitle).toBe(true)
    }
  })
})
