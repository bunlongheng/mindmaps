import { test, expect } from './fixtures'
import { createMap } from './helpers'

function parseTransform(transform: string | null) {
  if (!transform) return { tx: 0, ty: 0, scale: 1 }
  const tMatch = transform.match(/translate\(([-\d.]+),([-\d.]+)\)/)
  const sMatch = transform.match(/scale\(([-\d.]+)\)/)
  return {
    tx: tMatch ? parseFloat(tMatch[1]) : 0,
    ty: tMatch ? parseFloat(tMatch[2]) : 0,
    scale: sMatch ? parseFloat(sMatch[1]) : 1,
  }
}

test.describe('Canvas Pan', () => {
  test.beforeEach(async ({ page }) => {
    await createMap(page)
  })

  test('horizontal scroll pans left/right', async ({ page }) => {
    const g = page.locator('.diagram-canvas-root svg > g')
    const before = parseTransform(await g.getAttribute('transform'))
    const svg = page.locator('.diagram-canvas-root svg')
    const box = await svg.boundingBox()
    if (!box) return
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    // Scroll right
    await page.mouse.wheel(200, 0)
    await page.waitForTimeout(300)
    const after = parseTransform(await g.getAttribute('transform'))
    expect(after.tx).toBeLessThan(before.tx) // panned left (content moves left when scrolling right)
  })

  test('vertical scroll pans up/down', async ({ page }) => {
    const g = page.locator('.diagram-canvas-root svg > g')
    const before = parseTransform(await g.getAttribute('transform'))
    const svg = page.locator('.diagram-canvas-root svg')
    const box = await svg.boundingBox()
    if (!box) return
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    // Scroll down
    await page.mouse.wheel(0, 200)
    await page.waitForTimeout(300)
    const after = parseTransform(await g.getAttribute('transform'))
    expect(after.ty).toBeLessThan(before.ty) // panned up (content moves up when scrolling down)
  })

  test('diagonal scroll pans both axes', async ({ page }) => {
    const g = page.locator('.diagram-canvas-root svg > g')
    const before = parseTransform(await g.getAttribute('transform'))
    const svg = page.locator('.diagram-canvas-root svg')
    const box = await svg.boundingBox()
    if (!box) return
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(150, 150)
    await page.waitForTimeout(300)
    const after = parseTransform(await g.getAttribute('transform'))
    expect(after.tx).not.toBe(before.tx)
    expect(after.ty).not.toBe(before.ty)
  })

  test('space + drag pans canvas', async ({ page }) => {
    const g = page.locator('.diagram-canvas-root svg > g')
    const before = parseTransform(await g.getAttribute('transform'))
    const svg = page.locator('.diagram-canvas-root svg')
    const box = await svg.boundingBox()
    if (!box) return
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    // Hold space and drag
    await page.keyboard.down('Space')
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 150, cy + 100, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.up('Space')
    await page.waitForTimeout(300)
    const after = parseTransform(await g.getAttribute('transform'))
    expect(after.tx).toBeGreaterThan(before.tx)
    expect(after.ty).toBeGreaterThan(before.ty)
  })

  test('multiple scroll events accumulate', async ({ page }) => {
    const g = page.locator('.diagram-canvas-root svg > g')
    const before = parseTransform(await g.getAttribute('transform'))
    const svg = page.locator('.diagram-canvas-root svg')
    const box = await svg.boundingBox()
    if (!box) return
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(50, 0)
    await page.waitForTimeout(100)
    await page.mouse.wheel(50, 0)
    await page.waitForTimeout(100)
    await page.mouse.wheel(50, 0)
    await page.waitForTimeout(300)
    const after = parseTransform(await g.getAttribute('transform'))
    // Should have panned more than a single scroll
    expect(Math.abs(after.tx - before.tx)).toBeGreaterThan(100)
  })
})

test.describe('Canvas Zoom', () => {
  test.beforeEach(async ({ page }) => {
    await createMap(page)
  })

  test('ctrl + scroll up zooms in', async ({ page }) => {
    const g = page.locator('.diagram-canvas-root svg > g')
    const before = parseTransform(await g.getAttribute('transform'))
    const svg = page.locator('.diagram-canvas-root svg')
    const box = await svg.boundingBox()
    if (!box) return
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -100) // negative = zoom in
    await page.keyboard.up('Control')
    await page.waitForTimeout(300)
    const after = parseTransform(await g.getAttribute('transform'))
    expect(after.scale).toBeGreaterThan(before.scale)
  })

  test('ctrl + scroll down zooms out', async ({ page }) => {
    const g = page.locator('.diagram-canvas-root svg > g')
    const before = parseTransform(await g.getAttribute('transform'))
    const svg = page.locator('.diagram-canvas-root svg')
    const box = await svg.boundingBox()
    if (!box) return
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, 100) // positive = zoom out
    await page.keyboard.up('Control')
    await page.waitForTimeout(300)
    const after = parseTransform(await g.getAttribute('transform'))
    expect(after.scale).toBeLessThan(before.scale)
  })

  test('zoom updates the zoom badge', async ({ page }) => {
    const svg = page.locator('.diagram-canvas-root svg')
    const box = await svg.boundingBox()
    if (!box) return
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    // Zoom in
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -200)
    await page.keyboard.up('Control')
    await page.waitForTimeout(500)
    // The zoom badge should show > 100%
    const badge = page.locator('text=/\\d+%/')
    const badgeText = await badge.first().textContent()
    expect(badgeText).not.toBeNull()
    const pct = parseInt(badgeText!.replace('%', ''))
    expect(pct).toBeGreaterThan(100)
  })

  test('zoom is anchored to cursor position', async ({ page }) => {
    const g = page.locator('.diagram-canvas-root svg > g')
    const svg = page.locator('.diagram-canvas-root svg')
    const box = await svg.boundingBox()
    if (!box) return
    // Zoom in at top-left corner
    await page.mouse.move(box.x + 50, box.y + 50)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -100)
    await page.keyboard.up('Control')
    await page.waitForTimeout(300)
    const afterTopLeft = parseTransform(await g.getAttribute('transform'))
    // Reset — reload
    await createMap(page)
    // Zoom in at bottom-right corner
    await page.mouse.move(box.x + box.width - 50, box.y + box.height - 50)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -100)
    await page.keyboard.up('Control')
    await page.waitForTimeout(300)
    const afterBottomRight = parseTransform(await g.getAttribute('transform'))
    // The translate values should differ (zoom anchored to different points)
    expect(afterTopLeft.tx).not.toBeCloseTo(afterBottomRight.tx, 0)
  })

  test('rapid zoom does not crash', async ({ page }) => {
    const svg = page.locator('.diagram-canvas-root svg')
    const box = await svg.boundingBox()
    if (!box) return
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    // Rapid zoom in and out
    await page.keyboard.down('Control')
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -30)
    }
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, 30)
    }
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -30)
    }
    await page.keyboard.up('Control')
    await page.waitForTimeout(300)
    // Canvas should still be functional
    const nodeCount = await page.locator('.diagram-canvas-root svg text').count()
    expect(nodeCount).toBeGreaterThanOrEqual(1)
  })
})

test.describe('Canvas Selection', () => {
  test.beforeEach(async ({ page }) => {
    await createMap(page)
  })

  test('rubber-band select multiple nodes', async ({ page }) => {
    const svg = page.locator('.diagram-canvas-root svg')
    const box = await svg.boundingBox()
    if (!box) return
    // Drag across the node area (right side where L1 nodes are)
    const startX = box.x + box.width * 0.5
    const startY = box.y + 10
    const endX = box.x + box.width - 10
    const endY = box.y + box.height - 10
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(endX, endY, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    // Should have selected multiple nodes — multiple blue rings
    const blueCount = await page.evaluate(() =>
      document.querySelectorAll('.diagram-canvas-root svg rect[stroke="#3b82f6"]').length
    )
    expect(blueCount).toBeGreaterThanOrEqual(2)
  })

  test('Ctrl+A selects all nodes', async ({ page }) => {
    await page.keyboard.press('Meta+a')
    await page.waitForTimeout(300)
    // All nodes should have selection rings
    const blueCount = await page.evaluate(() =>
      document.querySelectorAll('.diagram-canvas-root svg rect[stroke="#3b82f6"], .diagram-canvas-root svg circle[stroke="#3b82f6"]').length
    )
    // At least root + 5 L1 nodes = 6 nodes, each with 2 rings = 12
    expect(blueCount).toBeGreaterThanOrEqual(6)
  })

  test('click empty space deselects', async ({ page }) => {
    // First select a node
    const nodeBox = await page.evaluate(() => {
      const texts = document.querySelectorAll('.diagram-canvas-root svg text')
      for (const t of texts) {
        if (t.textContent?.includes('Main Topic 1')) {
          const g = t.closest('g')
          if (g) { const r = g.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
        }
      }
      return null
    })
    if (nodeBox) {
      await page.mouse.click(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height / 2)
      await page.waitForTimeout(300)
    }
    // Now click empty space (far left, away from nodes)
    const svg = page.locator('.diagram-canvas-root svg')
    const box = await svg.boundingBox()
    if (box) {
      await page.mouse.click(box.x + 20, box.y + box.height - 20)
      await page.waitForTimeout(300)
      const blueCount = await page.evaluate(() =>
        document.querySelectorAll('.diagram-canvas-root svg rect[stroke="#3b82f6"]').length
      )
      expect(blueCount).toBe(0)
    }
  })
})
