import { test, expect } from './fixtures'
import { createMap } from './helpers'

test('the top topic dragged higher stays where it is dropped, its child with it', async ({ page }) => {
  await createMap(page)
  const top = page.locator('[data-node-id]', { hasText: 'Main Topic 1' })
  // Give it a child so we can see the branch follow
  await top.click()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Escape')
  const kid = page.locator('[data-node-id]', { hasText: 'New Node' })
  await expect(kid).toBeVisible()
  const b = (await top.boundingBox())!
  const k = (await kid.boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 150, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const b2 = (await top.boundingBox())!
  const k2 = (await kid.boundingBox())!
  expect(b.y - b2.y).toBeGreaterThan(100)
  expect(k.y - k2.y).toBeGreaterThan(100)
})
