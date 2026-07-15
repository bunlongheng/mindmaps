import { test, expect } from './fixtures'
import { createMap } from './helpers'
import type { Page } from '@playwright/test'

// ── helpers ─────────────────────────────────────────────────────────────────

/** Count visible node text labels on the canvas. */
function textCount(page: Page) {
  return page.locator('.diagram-canvas-root svg text').count()
}

/** Center-click a node by its visible text label. Returns false if not found. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function clickNodeByText(page: Page, label: string): Promise<boolean> {
  const box = await page.evaluate((text) => {
    const texts = document.querySelectorAll('.diagram-canvas-root svg text')
    for (const t of texts) {
      if (t.textContent?.includes(text)) {
        const g = (t as SVGTextElement).closest('g[data-node-id]')
        const r = g?.getBoundingClientRect()
        if (r) return { x: r.x, y: r.y, width: r.width, height: r.height }
      }
    }
    return null
  }, label)
  if (!box) return false
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  return true
}

test.describe('Editor chrome — App.tsx', () => {
  test('Back button ("All maps") returns to the home grid', async ({ page }) => {
    await createMap(page)
    await expect(page.locator('.diagram-canvas-root')).toBeVisible()
    await page.click('[title="All maps"]')
    await expect(page.locator('.home-grid')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('.diagram-canvas-root')).toHaveCount(0)
  })

  test('Format toggle button opens and closes the side panel', async ({ page }) => {
    await createMap(page)
    // Panel not present initially
    await expect(page.getByText('Theme', { exact: true })).toHaveCount(0)
    // Open
    await page.click('[title="Format"]')
    await expect(page.getByText('Theme', { exact: true })).toBeVisible({ timeout: 3_000 })
    // Toggle button turns dark when active
    const toggleBg = await page.locator('[title="Format"]').evaluate(el => getComputedStyle(el).backgroundColor)
    expect(toggleBg).toBe('rgb(26, 29, 46)')
    // Close again with the same button. The 256px-wide panel overlaps the
    // top-right toggle, so force the click through to the button underneath.
    await page.click('[title="Format"]', { force: true })
    await expect(page.getByText('Theme', { exact: true })).toHaveCount(0)
  })

  test('+ Tag picker adds a preset tag chip, and chip click removes it', async ({ page }) => {
    await createMap(page)
    // Open the tag picker popover
    await page.getByRole('button', { name: '+ Tag' }).click()
    // Preset tags appear in the popover — add "AI"
    const preset = page.getByRole('button', { name: 'AI', exact: true })
    await expect(preset.first()).toBeVisible({ timeout: 3_000 })
    await preset.first().click()
    await page.waitForTimeout(400)
    // A removable chip "AI" now sits in the footer (title="Remove tag")
    const chip = page.locator('[title="Remove tag"]', { hasText: 'AI' })
    await expect(chip).toBeVisible({ timeout: 3_000 })
    // Clicking the chip removes the tag
    await chip.click()
    await page.waitForTimeout(400)
    await expect(page.locator('[title="Remove tag"]', { hasText: 'AI' })).toHaveCount(0)
  })

  test('+ Tag picker adds a custom tag via the input + Add button', async ({ page }) => {
    await createMap(page)
    await page.getByRole('button', { name: '+ Tag' }).click()
    const input = page.getByPlaceholder('Custom tag…')
    await expect(input).toBeVisible({ timeout: 3_000 })
    const custom = `e2e-${Date.now().toString().slice(-5)}`
    await input.fill(custom)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.waitForTimeout(400)
    await expect(page.locator('[title="Remove tag"]', { hasText: custom })).toBeVisible({ timeout: 3_000 })
  })

  test('Download PDF button in footer does not crash the app', async ({ page }) => {
    await createMap(page)
    const before = await textCount(page)
    await page.locator('[title="Download PDF"]').click()
    await page.waitForTimeout(1200)
    // App still alive — canvas + same nodes still rendered
    await expect(page.locator('.diagram-canvas-root')).toBeVisible()
    expect(await textCount(page)).toBe(before)
  })

  test('Delete map footer button opens confirm modal; Cancel keeps the map', async ({ page }) => {
    await createMap(page)
    await page.locator('[title="Delete map"]').click()
    // Confirm modal appears
    await expect(page.getByRole('heading', { name: 'Delete map?' })).toBeVisible({ timeout: 3_000 })
    // Cancel keeps the editor open
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Delete map?' })).toHaveCount(0)
    await expect(page.locator('.diagram-canvas-root')).toBeVisible()
  })

  test('Delete map confirm Delete removes the map and returns to the home grid', async ({ page }) => {
    await createMap(page)
    // Capture the map name from the root node so we can assert it's gone from the grid
    const mapName = await page.evaluate(() => {
      const root = document.querySelector('.diagram-canvas-root svg text')
      return root?.textContent ?? null
    })
    await page.locator('[title="Delete map"]').click()
    await expect(page.getByRole('heading', { name: 'Delete map?' })).toBeVisible({ timeout: 3_000 })
    // Confirm via the modal's Delete button — scope to the dialog that holds the heading.
    const modal = page.locator('div', { has: page.getByRole('heading', { name: 'Delete map?' }) }).last()
    await modal.getByRole('button', { name: 'Delete', exact: true }).click()
    // Returns to home grid
    await expect(page.locator('.home-grid')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.diagram-canvas-root')).toHaveCount(0)
    // The deleted map name no longer appears as a card title
    if (mapName) {
      await expect(page.locator('.home-grid').getByText(mapName, { exact: true })).toHaveCount(0)
    }
  })

  test('clicking the modal backdrop dismisses the delete confirm (keeps map)', async ({ page }) => {
    await createMap(page)
    await page.locator('[title="Delete map"]').click()
    await expect(page.getByRole('heading', { name: 'Delete map?' })).toBeVisible({ timeout: 3_000 })
    // Click the dimmed backdrop (top-left corner, away from the dialog box)
    await page.mouse.click(10, 10)
    await expect(page.getByRole('heading', { name: 'Delete map?' })).toHaveCount(0)
    await expect(page.locator('.diagram-canvas-root')).toBeVisible()
  })
})
