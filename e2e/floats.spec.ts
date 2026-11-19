import { test, expect } from './fixtures'
import { createMap } from './helpers'

test.describe('+ menu floating items', () => {
  test.beforeEach(async ({ page }) => {
    await createMap(page)
  })

  test('adds, edits, drags and removes a sticky note, a text label and the legend', async ({ page }) => {
    await page.getByLabel('Add to map').click()
    await page.getByLabel('Add Sticky note').click()
    const note = page.getByTestId('float-note')
    await expect(note).toBeVisible()
    await note.locator('textarea').fill('Remember this')
    await page.locator('.diagram-canvas-root > svg').click({ position: { x: 20, y: 300 } })
    await expect(note.locator('textarea')).toHaveValue('Remember this')

    // Drag the note by its top strip
    const before = (await note.boundingBox())!
    await page.mouse.move(before.x + 40, before.y + 8)
    await page.mouse.down()
    await page.mouse.move(before.x + 160, before.y + 108, { steps: 6 })
    await page.mouse.up()
    const after = (await note.boundingBox())!
    expect(after.x - before.x).toBeGreaterThan(80)
    expect(after.y - before.y).toBeGreaterThan(60)

    await page.getByLabel('Add to map').click()
    await page.getByLabel('Add Text').click()
    await expect(page.getByTestId('float-text')).toBeVisible()

    await page.getByLabel('Add to map').click()
    await page.getByLabel('Add Legend').click()
    const legend = page.getByTestId('map-legend')
    await expect(legend).toBeVisible()
    // Hide, then the toolbar shows it again; delete, then undo brings it back
    await legend.getByLabel('Hide legend').click()
    await expect(legend).toHaveCount(0)
    await page.getByLabel('Toolbar Legend').click()
    await expect(legend).toBeVisible()
    await page.getByLabel('Toolbar Legend').click()
    await expect(legend).toHaveCount(0)
    await page.getByLabel('Toolbar Legend').click()
    await legend.getByLabel('Delete legend').click()
    await expect(legend).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+z')
    await expect(legend).toBeVisible()

    await note.hover()
    await note.getByLabel('Remove').click()
    await expect(page.getByTestId('float-note')).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByTestId('float-note')).toHaveCount(1)
  })

  test('toolbar adds topics, then a summary over them with a note and a branch', async ({ page }) => {
    const topics = page.locator('[data-node-id]')
    const start = await topics.count()
    await page.getByLabel('Toolbar Topic').click()
    await expect(topics).toHaveCount(start + 1)
    await page.getByLabel('Toolbar Subtopic').click()
    await expect(topics).toHaveCount(start + 2)

    // Select 2 topics (shift-click), then summarize them
    const ids = await topics.evaluateAll(els => els.map(e => e.getAttribute('data-node-id')))
    await page.locator(`[data-node-id="${ids[1]}"]`).click()
    await page.locator(`[data-node-id="${ids[2]}"]`).click({ modifiers: ['Shift'] })
    await page.getByLabel('Toolbar Summary').click()
    const summary = page.getByTestId('float-summary')
    await expect(summary).toBeVisible()
    // It sits right of the whole branch, the new subtopic included, never on top of it
    const sub = (await page.locator(`[data-node-id="${ids[ids.length - 1]}"]`).boundingBox())!
    const sb = (await summary.boundingBox())!
    expect(sb.x).toBeGreaterThanOrEqual(sub.x + sub.width)

    await summary.hover()
    await summary.getByLabel('Add branch').click()
    await expect(page.getByTestId('summary-branch')).toHaveCount(1)
    await summary.hover()
    await summary.getByPlaceholder('Add a note').fill('Daily at 10:30')
    // Leaving with the mouse must not drop what was typed; blurring saves it
    await page.mouse.move(5, 5)
    await page.keyboard.press('Tab')
    await expect(summary.getByPlaceholder('Add a note')).toHaveValue('Daily at 10:30')
  })

  test('a bigger summary over a smaller one starts past it, never on top', async ({ page }) => {
    const topics = page.locator('[data-node-id]')
    const ids = await topics.evaluateAll(els => els.map(e => e.getAttribute('data-node-id')))
    await page.locator(`[data-node-id="${ids[1]}"]`).click()
    await page.locator(`[data-node-id="${ids[2]}"]`).click({ modifiers: ['Shift'] })
    await page.getByLabel('Toolbar Summary').click()
    await page.locator(`[data-node-id="${ids[1]}"]`).click()
    await page.locator(`[data-node-id="${ids[2]}"]`).click({ modifiers: ['Shift'] })
    await page.locator(`[data-node-id="${ids[3]}"]`).click({ modifiers: ['Shift'] })
    await page.getByLabel('Toolbar Summary').click()
    const sums = page.getByTestId('float-summary')
    await expect(sums).toHaveCount(2)
    const inner = (await sums.nth(0).boundingBox())!
    const outer = (await sums.nth(1).boundingBox())!
    expect(outer.x).toBeGreaterThanOrEqual(inner.x + inner.width)
  })

  test('the root box grows while its title is typed, and the branches move with it', async ({ page }) => {
    // Pin the root by id: once editing starts its title lives in an input, not text
    const id = await page.locator('[data-node-id]', { hasText: 'Untitled' }).getAttribute('data-node-id')
    const root = page.locator(`[data-node-id="${id}"]`)
    const width = async () => (await root.boundingBox())!.width
    const before = await width()
    const kid = page.locator('[data-node-id]', { hasText: 'Main Topic 1' })
    const kidX = async () => (await kid.boundingBox())!.x
    const kidBefore = await kidX()
    const c = await root.evaluate(g => {
      const r = [...g.querySelectorAll('rect')].map(e => e.getBoundingClientRect()).sort((a, b) => b.width - a.width)[0]
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    await page.mouse.dblclick(c.x, c.y)
    await page.keyboard.press('End')
    await page.keyboard.type(' with a much longer title than before')
    await expect.poll(width).toBeGreaterThan(before + 100)
    // Live, before Enter: the branch has already moved clear of the wider root
    await expect.poll(kidX).toBeGreaterThan(kidBefore + 50)
    await page.keyboard.press('Enter')
  })

  test('dragging text onto a topic shows a red zone, and the drop lands clear of it', async ({ page }) => {
    await page.getByLabel('Toolbar Text').click()
    const text = page.getByTestId('float-text')
    await expect(text).toBeVisible()
    const target = page.locator('[data-node-id]').nth(1)
    const t = (await target.boundingBox())!
    const b = (await text.boundingBox())!
    // Grab the padding, not the input, so the press starts a drag
    await page.mouse.move(b.x + 2, b.y + 2)
    await page.mouse.down()
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 8 })
    await expect(page.getByTestId('drop-blocked').first()).toBeVisible()
    await page.mouse.up()
    await expect(page.getByTestId('drop-blocked')).toHaveCount(0)
    const a = (await text.boundingBox())!
    const t2 = (await target.boundingBox())!
    const overlaps = a.x < t2.x + t2.width && a.x + a.width > t2.x && a.y < t2.y + t2.height && a.y + a.height > t2.y
    expect(overlaps).toBe(false)
  })

  test('new items never land on a topic or on each other', async ({ page }) => {
    await page.getByLabel('Toolbar Note').click()
    await page.getByLabel('Toolbar Text').click()
    await page.getByLabel('Toolbar Text').click()
    await expect(page.getByTestId('float-text')).toHaveCount(2)
    const boxes = [
      ...(await Promise.all((await page.locator('[data-testid="float-note"], [data-testid="float-text"]').all()).map(l => l.boundingBox()))),
    ].map(b => b!)
    // Each topic's drawn box (its biggest rect), not its group, which also holds connectors
    // and, on the root, the decorative dots around it
    const topics = await page.locator('[data-node-id]').evaluateAll(gs => gs.slice(1).map(g => {
      const r = [...g.querySelectorAll('rect')].map(e => e.getBoundingClientRect())
        .sort((a, b) => b.width * b.height - a.width * a.height)[0]
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }))
    const hit = (a: typeof boxes[0], b: typeof boxes[0]) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
    boxes.forEach((a, i) => {
      for (const t of topics) expect(hit(a, t)).toBe(false)
      boxes.forEach((b, j) => { if (i !== j) expect(hit(a, b)).toBe(false) })
    })
  })

  test('text that grows while typed moves off the topics it would cover', async ({ page }) => {
    await page.getByLabel('Toolbar Text').click()
    const t = page.getByTestId('float-text')
    await t.locator('input').fill('A much longer line of text that would run across the topics')
    await t.locator('input').press('Enter')
    const a = (await t.boundingBox())!
    const topics = await page.locator('[data-node-id]').evaluateAll(gs => gs.map(g => {
      const r = [...g.querySelectorAll('rect')].map(e => e.getBoundingClientRect())
        .sort((p, q) => q.width * q.height - p.width * p.height)[0]
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }))
    for (const b of topics) {
      expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false)
    }
  })
})
