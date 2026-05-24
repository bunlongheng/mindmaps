import { test, expect } from './fixtures'
import { createMap } from './helpers'

// Reopen the just-created map deterministically via its own ?map=<id> URL instead
// of clicking an ambiguous "Untitled" card (there can be many). Going through goto
// also exercises the deep-link / refresh load path.
async function reopen(page: import('@playwright/test').Page, mapUrl: string) {
  await page.goto(mapUrl)
  await page.waitForSelector('.diagram-canvas-root', { timeout: 10_000 })
  await page.waitForTimeout(800)
}

// Remove the map this test created so the suite can run repeatedly without piling
// up throwaway maps in the backing store.
async function cleanup(page: import('@playwright/test').Page, mapUrl: string) {
  const id = new URL(mapUrl).searchParams.get('map')
  if (!id) return
  await page.evaluate(async (mapId) => {
    const uid = JSON.parse(localStorage.getItem('mindmaps:user') ?? 'null')?.userId
    await fetch(`/api/mindmaps?id=${mapId}${uid ? `&user_id=${uid}` : ''}`, { method: 'DELETE' }).catch(() => {})
  }, id)
}

test.describe('Save & Persist', () => {
  test('added node persists after back and reopen', async ({ page }) => {
    await createMap(page)
    const mapUrl = page.url()
    expect(mapUrl).toContain('?map=')

    const beforeCount = await page.locator('.diagram-canvas-root svg text').count()

    // Add a child node via Tab
    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)
    const afterAdd = await page.locator('.diagram-canvas-root svg text').count()
    expect(afterAdd).toBeGreaterThan(beforeCount)

    await page.waitForTimeout(600) // let auto-save flush

    await reopen(page, mapUrl)
    const reopenCount = await page.locator('.diagram-canvas-root svg text').count()
    expect(reopenCount).toBe(afterAdd)

    await cleanup(page, mapUrl)
  })

  test('Cmd+S saves and shows toast', async ({ page }) => {
    await createMap(page)
    const mapUrl = page.url()

    await page.keyboard.press('Tab')
    await page.waitForTimeout(800)

    await page.keyboard.press('Meta+s')
    await page.waitForTimeout(1000)

    const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase())
    expect(bodyText).toContain('saved')

    await cleanup(page, mapUrl)
  })

  test('node edit persists after back and reopen', async ({ page }) => {
    await createMap(page)
    const mapUrl = page.url()

    // Double-click "Main Topic 1" to edit
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

    await reopen(page, mapUrl)
    const hasTitle = await page.evaluate(() => {
      const texts = document.querySelectorAll('.diagram-canvas-root svg text')
      return Array.from(texts).some(t => t.textContent?.includes('Persisted Title'))
    })
    expect(hasTitle).toBe(true)

    await cleanup(page, mapUrl)
  })
})
