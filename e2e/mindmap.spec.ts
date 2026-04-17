import { test, expect } from './fixtures'
import { waitForApp, createMap as createNewMap, getNodeBox } from './helpers'

test.describe('Home Page', () => {
  test('loads without crashing', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    const hasHome = await page.locator('[title="New blank map"], [title="New Map"]').count()
    expect(hasHome).toBeGreaterThan(0)
  })

  test('create new map button exists', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await expect(page.locator('[title="New blank map"]')).toBeVisible()
  })
})

test.describe('Diagram Canvas', () => {
  test.beforeEach(async ({ page }) => {
    await createNewMap(page)
  })

  test('canvas renders with nodes', async ({ page }) => {
    const textElements = page.locator('.diagram-canvas-root svg text')
    await expect(textElements.first()).toBeVisible({ timeout: 5_000 })
  })

  test('nodes are visible after creation', async ({ page }) => {
    const texts = page.locator('.diagram-canvas-root svg text')
    const count = await texts.count()
    // Root + 5 main topics = at least 6 text elements
    expect(count).toBeGreaterThanOrEqual(6)
  })

  test('click node to select it', async ({ page }) => {
    const box = await getNodeBox(page, 'Main Topic 1')
    expect(box).not.toBeNull()
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(500)
      // Check for blue selection ring
      const hasSelection = await page.evaluate(() => {
        const rects = document.querySelectorAll('.diagram-canvas-root svg rect[stroke="#3b82f6"]')
        return rects.length > 0
      })
      expect(hasSelection).toBe(true)
    }
  })

  test('double-click node to edit', async ({ page }) => {
    const box = await getNodeBox(page, 'Main Topic 1')
    expect(box).not.toBeNull()
    if (box) {
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
      const input = page.locator('.diagram-canvas-root input')
      await expect(input).toBeVisible({ timeout: 3_000 })
    }
  })

  test('edit node text and confirm with Enter', async ({ page }) => {
    const box = await getNodeBox(page, 'Main Topic 1')
    expect(box).not.toBeNull()
    if (box) {
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
      const input = page.locator('.diagram-canvas-root input')
      await input.waitFor({ timeout: 3_000 })
      await input.fill('Edited Title')
      await input.press('Enter')
      await expect(input).not.toBeVisible({ timeout: 2_000 })
      // Verify new text appears
      const hasEdited = await page.evaluate(() => {
        const texts = document.querySelectorAll('.diagram-canvas-root svg text')
        return Array.from(texts).some(t => t.textContent?.includes('Edited Title'))
      })
      expect(hasEdited).toBe(true)
    }
  })

  test('Tab key adds a child node', async ({ page }) => {
    const beforeCount = await page.locator('.diagram-canvas-root svg text').count()
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)
    const afterCount = await page.locator('.diagram-canvas-root svg text').count()
    expect(afterCount).toBeGreaterThan(beforeCount)
  })

  test('Delete key removes selected node', async ({ page }) => {
    const box = await getNodeBox(page, 'Main Topic 1')
    expect(box).not.toBeNull()
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(300)
      const beforeCount = await page.locator('.diagram-canvas-root svg text').count()
      await page.keyboard.press('Delete')
      await page.waitForTimeout(800)
      const afterCount = await page.locator('.diagram-canvas-root svg text').count()
      expect(afterCount).toBeLessThan(beforeCount)
    }
  })

  test('Ctrl+Z undoes last action', async ({ page }) => {
    const beforeCount = await page.locator('.diagram-canvas-root svg text').count()
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)
    expect(await page.locator('.diagram-canvas-root svg text').count()).toBeGreaterThan(beforeCount)
    await page.keyboard.press('Meta+z')
    await page.waitForTimeout(800)
    const afterUndo = await page.locator('.diagram-canvas-root svg text').count()
    expect(afterUndo).toBe(beforeCount)
  })

  test('Escape clears selection', async ({ page }) => {
    const box = await getNodeBox(page, 'Main Topic 1')
    expect(box).not.toBeNull()
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(500)
      const beforeEsc = await page.evaluate(() =>
        document.querySelectorAll('.diagram-canvas-root svg rect[stroke="#3b82f6"]').length
      )
      expect(beforeEsc).toBeGreaterThanOrEqual(1)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
      const afterEsc = await page.evaluate(() =>
        document.querySelectorAll('.diagram-canvas-root svg rect[stroke="#3b82f6"]').length
      )
      expect(afterEsc).toBe(0)
    }
  })

  test('canvas pans with wheel scroll', async ({ page }) => {
    const svg = page.locator('.diagram-canvas-root svg')
    await svg.waitFor()
    const g = page.locator('.diagram-canvas-root svg > g')
    const before = await g.getAttribute('transform')
    const svgBox = await svg.boundingBox()
    if (svgBox) {
      await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2)
      await page.mouse.wheel(100, 0)
      await page.waitForTimeout(300)
      const after = await g.getAttribute('transform')
      expect(after).not.toBe(before)
    }
  })

  test('canvas zooms with ctrl+wheel', async ({ page }) => {
    const svg = page.locator('.diagram-canvas-root svg')
    await svg.waitFor()
    const g = page.locator('.diagram-canvas-root svg > g')
    const before = await g.getAttribute('transform')
    const svgBox = await svg.boundingBox()
    if (svgBox) {
      await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2)
      await page.keyboard.down('Control')
      await page.mouse.wheel(0, -50)
      await page.keyboard.up('Control')
      await page.waitForTimeout(300)
      const after = await g.getAttribute('transform')
      expect(after).not.toBe(before)
    }
  })
})

test.describe('Back Navigation', () => {
  test('back button returns to home', async ({ page }) => {
    await createNewMap(page)
    const backBtn = page.locator('[title="All maps"]')
    if (await backBtn.count() > 0) {
      await backBtn.click()
      await page.waitForSelector('[title="New blank map"], [title="New Map"]', { timeout: 5_000 })
    }
  })
})
