import { test, expect } from './fixtures'
import { createMap } from './helpers'
import type { Page } from '@playwright/test'

// ── helpers ─────────────────────────────────────────────────────────────────

function textCount(page: Page) {
  return page.locator('.diagram-canvas-root svg text').count()
}

/** Open the editor with the Format panel showing. */
async function openEditorWithPanel(page: Page) {
  await createMap(page)
  await page.click('[title="Format"]')
  await page.waitForTimeout(300)
}

/** Bounding box for a node by its visible text label. */
async function nodeBox(page: Page, label: string) {
  return page.evaluate((text) => {
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
}

async function clickNode(page: Page, label: string) {
  const box = await nodeBox(page, label)
  expect(box, `node "${label}" should exist`).not.toBeNull()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.waitForTimeout(350)
}

/** Bounding box of the root node — the <g data-node-id> that holds a large circle. */
async function rootBoxOf(page: Page) {
  return page.evaluate(() => {
    const gs = [...document.querySelectorAll('.diagram-canvas-root svg g[data-node-id]')]
    const root = gs.find(g => {
      const c = g.querySelector('circle')
      return c && parseFloat(c.getAttribute('r') ?? '0') > 40
    })
    const r = root?.getBoundingClientRect()
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null
  })
}

/** Select the root node by clicking its circle center. */
async function selectRoot(page: Page) {
  const box = await rootBoxOf(page)
  expect(box, 'root node should exist').not.toBeNull()
  await page.mouse.click(box!.x + box!.w / 2, box!.y + box!.h / 2)
  await page.waitForTimeout(400)
}

/** Read the concrete fill color of a node's filled shape (skips none/transparent). */
function fillOf(page: Page, label: string) {
  return page.evaluate((lbl) => {
    const texts = document.querySelectorAll('.diagram-canvas-root svg text')
    for (const t of texts) {
      if (t.textContent?.includes(lbl)) {
        const g = (t as SVGTextElement).closest('g[data-node-id]')
        const shapes = g ? [...g.querySelectorAll('rect, circle, path, ellipse, polygon')] : []
        for (const s of shapes) {
          const v = s.getAttribute('fill')
          if (v && /^#|^rgb/.test(v) && v !== 'transparent') return v
        }
      }
    }
    return null
  }, label)
}

// ── Tabs ──────────────────────────────────────────────────────────────────

test.describe('SidePanel — tabs', () => {
  test('Map / Style / Share tabs switch panel content', async ({ page }) => {
    await openEditorWithPanel(page)
    // Default (no node selected) = Map tab → "Type" + "Theme" sections visible
    await expect(page.getByText('Theme', { exact: true })).toBeVisible({ timeout: 3_000 })
    await expect(page.getByText('Mind Map', { exact: true })).toBeVisible()

    // Switch to Share → Public Link section
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(page.getByText('Public Link', { exact: true })).toBeVisible({ timeout: 3_000 })
    await expect(page.getByText('Theme', { exact: true })).toHaveCount(0)

    // Switch to Style with no node → placeholder prompt
    await page.getByRole('button', { name: 'Style', exact: true }).click()
    await expect(page.getByText('Select a node to style it')).toBeVisible({ timeout: 3_000 })

    // Back to Map
    await page.getByRole('button', { name: 'Map', exact: true }).click()
    await expect(page.getByText('Theme', { exact: true })).toBeVisible()
  })

  test('X button closes the panel', async ({ page }) => {
    await openEditorWithPanel(page)
    await expect(page.getByText('Theme', { exact: true })).toBeVisible()
    await page.locator('svg.lucide-x').first().click()
    await expect(page.getByText('Theme', { exact: true })).toHaveCount(0)
  })

  test('selecting a node auto-switches to the Style tab', async ({ page }) => {
    await openEditorWithPanel(page)
    await clickNode(page, 'Main Topic 1')
    // Style tab now shows node controls (Text / Shape sections)
    await expect(page.getByText('Shape', { exact: true })).toBeVisible({ timeout: 3_000 })
    await expect(page.getByText('Label', { exact: true })).toBeVisible()
  })
})

// ── Map tab: Type / Line / Display / Layout / Theme ──────────────────────────

test.describe('SidePanel — Map tab', () => {
  test('diagram-type switch re-renders the canvas for every type', async ({ page }) => {
    await openEditorWithPanel(page)
    for (const label of ['Mind Map', 'Fishbone', 'Timeline', 'Logic Chart']) {
      await page.getByRole('button', { name: label, exact: true }).click()
      await page.waitForTimeout(700)
      // Selected type button gets the blue active border
      const border = await page.getByRole('button', { name: label, exact: true })
        .evaluate(el => getComputedStyle(el).borderColor)
      expect(border).toBe('rgb(59, 130, 246)')
      // Canvas still renders nodes
      expect(await textCount(page)).toBeGreaterThanOrEqual(1)
    }
  })

  test('line-style options (Brace / Straight / Square) apply and highlight', async ({ page }) => {
    await openEditorWithPanel(page)
    // logic-chart shows the Map-tab Line section
    for (const style of ['Brace', 'Straight', 'Square']) {
      await page.getByRole('button', { name: style, exact: true }).click()
      await page.waitForTimeout(400)
      const border = await page.getByRole('button', { name: style, exact: true })
        .evaluate(el => getComputedStyle(el).borderColor)
      expect(border).toBe('rgb(59, 130, 246)')
      expect(await textCount(page)).toBeGreaterThanOrEqual(1)
    }
  })

  test('Show order # toggle removes and re-adds the order-number badges', async ({ page }) => {
    await openEditorWithPanel(page)
    // Default ON for a blank logic-chart → order-number circles (r=13) exist
    const orderCircles = () => page.evaluate(() =>
      [...document.querySelectorAll('.diagram-canvas-root svg circle')]
        .filter(c => c.getAttribute('r') === '13').length
    )
    expect(await orderCircles()).toBeGreaterThan(0)

    const toggle = page.getByText('Show order #', { exact: true }).locator('..').locator('button')
    await toggle.click()
    await page.waitForTimeout(400)
    expect(await orderCircles()).toBe(0)

    // Toggle back ON
    await toggle.click()
    await page.waitForTimeout(400)
    expect(await orderCircles()).toBeGreaterThan(0)
  })

  test('Show count toggle appends child counts to L1 labels', async ({ page }) => {
    await openEditorWithPanel(page)
    // Add a child to "Main Topic 1" so it has a count to show
    await clickNode(page, 'Main Topic 1')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(600)

    // Re-open Map tab (selecting a node jumped to Style)
    await page.getByRole('button', { name: 'Map', exact: true }).click()
    const toggle = page.getByText('Show count', { exact: true }).locator('..').locator('button')
    await toggle.click()
    await page.waitForTimeout(500)
    // Some label now contains a "(1)" suffix
    const hasCount = await page.evaluate(() =>
      [...document.querySelectorAll('.diagram-canvas-root svg text')]
        .some(t => /Main Topic 1 \(\d+\)/.test(t.textContent ?? ''))
    )
    expect(hasCount).toBe(true)
  })

  test('Auto Icons (AI) button runs and assigns icons to nodes', async ({ page }) => {
    await openEditorWithPanel(page)
    const iconCount = () => page.evaluate(() =>
      document.querySelectorAll('.diagram-canvas-root svg svg').length
    )
    const before = await iconCount()
    await page.getByRole('button', { name: /Auto Icons/ }).click()
    // AI call + staggered pop-ins; allow generous time, fall back gracefully on network fail
    await expect.poll(() => iconCount(), { timeout: 25_000, intervals: [500] }).toBeGreaterThan(before)
  })

  test('theme buttons change the canvas background', async ({ page }) => {
    await openEditorWithPanel(page)
    const canvasBg = () => page.locator('.diagram-canvas-root')
      .evaluate(el => getComputedStyle(el).backgroundColor)

    // default Rainbow Light = white
    const start = await canvasBg()
    await page.getByRole('button', { name: 'Cyberpunk Neon' }).click()
    await page.waitForTimeout(500)
    const cyber = await canvasBg()
    expect(cyber).not.toBe(start)
    expect(cyber).toBe('rgb(8, 11, 26)') // #080b1a

    await page.getByRole('button', { name: 'Monokai' }).click()
    await page.waitForTimeout(500)
    expect(await canvasBg()).toBe('rgb(39, 40, 34)') // #272822

    await page.getByRole('button', { name: 'Retro B&W' }).click()
    await page.waitForTimeout(500)
    expect(await canvasBg()).toBe('rgb(250, 247, 240)') // #faf7f0
  })
})

// ── Style tab: Text / Shape / Visual / Branch ────────────────────────────────

test.describe('SidePanel — Style tab', () => {
  test('color swatch changes the selected node fill; custom color input also applies', async ({ page }) => {
    await openEditorWithPanel(page)
    await clickNode(page, 'Main Topic 1')

    const before = await fillOf(page, 'Main Topic 1')
    expect(before).not.toBeNull()

    // Swatches are square buttons with aspect-ratio styling inside the Shape > Fill row.
    const swatches = page.locator('button[style*="aspect-ratio"]')
    const count = await swatches.count()
    expect(count).toBeGreaterThan(0)
    let changed = false
    for (let i = 0; i < count && !changed; i++) {
      await swatches.nth(i).click()
      await page.waitForTimeout(250)
      changed = (await fillOf(page, 'Main Topic 1')) !== before
    }
    expect(changed).toBe(true)

    // Custom color: the hidden <input type=color> as the last tile in the grid.
    // Setting its value + firing input/change drives the same onChange the picker uses.
    const swatchFill = await fillOf(page, 'Main Topic 1')
    const colorInput = page.locator('input[type="color"]').first()
    await colorInput.evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(el, '#123456')
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(400)
    const after = await fillOf(page, 'Main Topic 1')
    // L1 fill is the raw node.color in logic-chart → custom hex applied
    expect((after ?? '').toLowerCase()).toContain('#123456')
    expect(after).not.toBe(swatchFill)
  })

  test('Bold and Italic toggles change the rendered font weight/style', async ({ page }) => {
    await openEditorWithPanel(page)
    await clickNode(page, 'Main Topic 1')

    const textAttrs = () => page.evaluate(() => {
      const t = [...document.querySelectorAll('.diagram-canvas-root svg text')]
        .find(el => el.textContent?.includes('Main Topic 1')) as SVGTextElement | undefined
      return t ? { weight: t.getAttribute('font-weight'), style: t.getAttribute('font-style') } : null
    })

    const before = await textAttrs()
    // Bold (B button is a 30x28 chip with text "B")
    await page.getByRole('button', { name: 'B', exact: true }).click()
    await page.waitForTimeout(300)
    const bolded = await textAttrs()
    expect(bolded?.weight).toBe('700')
    expect(bolded?.weight).not.toBe(before?.weight)

    // Italic
    await page.getByRole('button', { name: 'I', exact: true }).click()
    await page.waitForTimeout(300)
    expect((await textAttrs())?.style).toBe('italic')
  })

  test('text alignment buttons change text-anchor/x of the L1 label', async ({ page }) => {
    await openEditorWithPanel(page)
    await clickNode(page, 'Main Topic 1')

    const anchorOf = () => page.evaluate(() => {
      const t = [...document.querySelectorAll('.diagram-canvas-root svg text')]
        .find(el => el.textContent?.includes('Main Topic 1')) as SVGTextElement | undefined
      return t ? { anchor: t.getAttribute('text-anchor'), x: t.getAttribute('x') } : null
    })

    // The Format row holds 5 buttons: B, I, then left / center / right (icon-only).
    // Scope to the row that contains the "B" button.
    const formatRow = page.locator('div', { has: page.getByRole('button', { name: 'B', exact: true }) }).last()
    const alignBtns = formatRow.getByRole('button').filter({ hasNot: page.getByText(/^[BI]$/) })
    expect(await alignBtns.count()).toBe(3)

    // Center (index 1)
    await alignBtns.nth(1).click()
    await page.waitForTimeout(300)
    expect((await anchorOf())?.anchor).toBe('middle')

    // Right (index 2)
    await alignBtns.nth(2).click()
    await page.waitForTimeout(300)
    expect((await anchorOf())?.anchor).toBe('end')

    // Left (index 0)
    await alignBtns.nth(0).click()
    await page.waitForTimeout(300)
    expect((await anchorOf())?.anchor).toBe('start')
  })

  test('Label input renames the node on Enter', async ({ page }) => {
    await openEditorWithPanel(page)
    await clickNode(page, 'Main Topic 1')
    // The Label field is the text input sitting in the "Label" PRow (no explicit type attr).
    const labelRow = page.locator('div', { has: page.getByText('Label', { exact: true }) }).last()
    const input = labelRow.locator('input').first()
    await expect(input).toBeVisible({ timeout: 3_000 })
    await input.fill('Renamed Node')
    await input.press('Enter')
    await page.waitForTimeout(500)
    const hasNew = await page.evaluate(() =>
      [...document.querySelectorAll('.diagram-canvas-root svg text')]
        .some(t => t.textContent?.includes('Renamed Node'))
    )
    expect(hasNew).toBe(true)
  })

  test('Width slider resizes nodes at the selected depth', async ({ page }) => {
    await openEditorWithPanel(page)
    // logic-chart normalises L1 widths uniformly, so resize a depth-2 child instead.
    await clickNode(page, 'Main Topic 1')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(700)
    await clickNode(page, 'New Node')

    const slider = page.locator('input[type="range"]').first()
    await expect(slider).toBeVisible({ timeout: 3_000 })

    const widthOf = () => page.evaluate(() => {
      const t = [...document.querySelectorAll('.diagram-canvas-root svg text')]
        .find(el => el.textContent?.includes('New Node')) as SVGTextElement | undefined
      const g = t?.closest('g[data-node-id]')
      const rect = g?.querySelector('rect[fill="transparent"]')
      return rect ? parseFloat(rect.getAttribute('width') ?? '0') : 0
    })
    const before = await widthOf()
    await slider.fill('420')
    await page.waitForTimeout(600)
    const after = await widthOf()
    expect(after).not.toBe(before)
    expect(after).toBeGreaterThan(before)
  })

  test('Visual: Icon picker assigns an icon (renders an inner svg in the node)', async ({ page }) => {
    await openEditorWithPanel(page)
    await clickNode(page, 'Main Topic 1')
    // Switch to the Icon sub-tab (default), then pick the first icon tile.
    await page.getByRole('button', { name: /⬡ Icon/ }).click()
    // The icon grid sits right after the search input; tiles each carry a label title.
    const grid = page.locator('input[placeholder*="Search"]').locator('xpath=following-sibling::div[1]//button')
    await expect(grid.first()).toBeVisible({ timeout: 3_000 })
    await grid.first().click()
    await page.waitForTimeout(400)
    // The node now renders an icon <svg>/path inside its <g>
    const hasInnerSvg = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.diagram-canvas-root svg text')]
        .find(el => el.textContent?.includes('Main Topic 1')) as SVGTextElement | undefined
      const g = t?.closest('g[data-node-id]')
      return !!g?.querySelector('svg, path[stroke]')
    })
    expect(hasInnerSvg).toBe(true)
  })

  test('Visual: Emoji picker sets an emoji on the node', async ({ page }) => {
    await openEditorWithPanel(page)
    await clickNode(page, 'Main Topic 1')
    await page.getByRole('button', { name: /Emoji/ }).click()
    // Pick the star emoji preset
    await page.getByRole('button', { name: '⭐', exact: true }).click()
    await page.waitForTimeout(400)
    const hasEmoji = await page.evaluate(() => {
      const g = [...document.querySelectorAll('.diagram-canvas-root svg text')]
        .find(el => el.textContent?.includes('Main Topic 1'))?.closest('g[data-node-id]')
      return !!g && [...(g.querySelectorAll('text') ?? [])].some(t => t.textContent === '⭐')
    })
    expect(hasEmoji).toBe(true)
  })

  test('Visual: Text badge sets a short text label icon', async ({ page }) => {
    await openEditorWithPanel(page)
    await clickNode(page, 'Main Topic 1')
    await page.getByRole('button', { name: /Aa Text/ }).click()
    const input = page.getByPlaceholder('L')
    await expect(input).toBeVisible({ timeout: 3_000 })
    await input.fill('A1')
    await page.waitForTimeout(400)
    const hasBadge = await page.evaluate(() => {
      const g = [...document.querySelectorAll('.diagram-canvas-root svg text')]
        .find(el => el.textContent?.includes('Main Topic 1'))?.closest('g[data-node-id]')
      return !!g && [...(g.querySelectorAll('text') ?? [])].some(t => t.textContent === 'A1')
    })
    expect(hasBadge).toBe(true)
  })

  test('Branch (root) Shape + Line options appear when the root is selected', async ({ page }) => {
    await openEditorWithPanel(page)
    await selectRoot(page)
    // Branch section visible with Circle / Pill shape choices
    await expect(page.getByText('Branch', { exact: true })).toBeVisible({ timeout: 3_000 })
    await expect(page.getByRole('button', { name: 'Pill', exact: true })).toBeVisible()
    // Switch root to Pill and assert it stays alive
    await page.getByRole('button', { name: 'Pill', exact: true }).click()
    await page.waitForTimeout(600)
    const active = await page.getByRole('button', { name: 'Pill', exact: true })
      .evaluate(el => getComputedStyle(el).borderColor)
    expect(active).toBe('rgb(26, 29, 46)') // #1a1d2e active border
    expect(await textCount(page)).toBeGreaterThanOrEqual(1)
  })
})

// ── Share tab ────────────────────────────────────────────────────────────────

test.describe('SidePanel — Share tab', () => {
  test('Public Link toggle flips the label and renders the QR code', async ({ page }) => {
    // Enabling sharing copies the URL → grant clipboard so it doesn't throw a pageerror.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
    await openEditorWithPanel(page)
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(page.getByText('Link disabled')).toBeVisible({ timeout: 3_000 })
    // QR always renders
    await expect(page.locator('svg').filter({ has: page.locator('path') }).first()).toBeVisible()

    const toggle = page.getByText('Link disabled').locator('..').locator('button')
    await toggle.click()
    await page.waitForTimeout(500)
    await expect(page.getByText('Link active')).toBeVisible({ timeout: 3_000 })
  })

  test('Copy Link button flips to "Copied!"', async ({ page }) => {
    await openEditorWithPanel(page)
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    // Grant clipboard so the success path runs without a native dialog
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
    await page.getByRole('button', { name: /Copy Link/ }).click()
    await expect(page.getByRole('button', { name: /Copied!/ })).toBeVisible({ timeout: 3_000 })
  })

  test('Export PDF button (File section) does not crash', async ({ page }) => {
    await openEditorWithPanel(page)
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    const before = await textCount(page)
    await page.getByRole('button', { name: /Export PDF/ }).click()
    await page.waitForTimeout(1200)
    await expect(page.locator('.diagram-canvas-root')).toBeVisible()
    expect(await textCount(page)).toBe(before)
  })

  test('Delete (File section) opens confirm; Cancel keeps the map', async ({ page }) => {
    await openEditorWithPanel(page)
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    // The trash button is the icon-only red button next to Export PDF.
    await page.locator('svg.lucide-trash-2').last().click({ force: true })
    await expect(page.getByRole('heading', { name: 'Delete map?' })).toBeVisible({ timeout: 3_000 })
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Delete map?' })).toHaveCount(0)
    await expect(page.locator('.diagram-canvas-root')).toBeVisible()
  })
})

// ── Canvas / Node interactions not yet asserted ──────────────────────────────

test.describe('Canvas — node interactions', () => {
  test('Tab adds a child, then Ctrl+Z undo / Ctrl+Shift+Z redo', async ({ page }) => {
    await createMap(page)
    await clickNode(page, 'Main Topic 1')
    const start = await textCount(page)

    await page.keyboard.press('Tab')
    await page.waitForTimeout(600)
    const added = await textCount(page)
    expect(added).toBeGreaterThan(start)

    // Undo removes it
    await page.keyboard.press('Meta+z')
    await page.waitForTimeout(600)
    expect(await textCount(page)).toBe(start)

    // Redo (Ctrl+Shift+Z) restores it
    await page.keyboard.press('Meta+Shift+z')
    await page.waitForTimeout(600)
    expect(await textCount(page)).toBe(added)
  })

  test('Ctrl+Y also redoes', async ({ page }) => {
    await createMap(page)
    await clickNode(page, 'Main Topic 1')
    const start = await textCount(page)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(600)
    const added = await textCount(page)
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(600)
    expect(await textCount(page)).toBe(start)
    await page.keyboard.press('Control+y')
    await page.waitForTimeout(600)
    expect(await textCount(page)).toBe(added)
  })

  test('Delete key removes the selected node; undo restores it', async ({ page }) => {
    await createMap(page)
    await clickNode(page, 'Main Topic 1')
    const before = await textCount(page)
    await page.keyboard.press('Delete')
    await page.waitForTimeout(600)
    const after = await textCount(page)
    expect(after).toBeLessThan(before)
    await page.keyboard.press('Meta+z')
    await page.waitForTimeout(600)
    expect(await textCount(page)).toBe(before)
  })

  test('double-click edits, type + Escape cancels (keeps original)', async ({ page }) => {
    await createMap(page)
    const box = await nodeBox(page, 'Main Topic 2')
    expect(box).not.toBeNull()
    await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2)
    const input = page.locator('.diagram-canvas-root input')
    await expect(input).toBeVisible({ timeout: 3_000 })
    await input.fill('Should Not Stick')
    await input.press('Escape')
    await expect(input).toHaveCount(0)
    const reverted = await page.evaluate(() =>
      [...document.querySelectorAll('.diagram-canvas-root svg text')]
        .some(t => t.textContent?.includes('Main Topic 2'))
    )
    expect(reverted).toBe(true)
    const noEdit = await page.evaluate(() =>
      [...document.querySelectorAll('.diagram-canvas-root svg text')]
        .some(t => t.textContent?.includes('Should Not Stick'))
    )
    expect(noEdit).toBe(false)
  })

  test('Escape clears node selection (selection ring disappears)', async ({ page }) => {
    await createMap(page)
    await clickNode(page, 'Main Topic 1')
    const ringsBefore = await page.evaluate(() =>
      document.querySelectorAll('.diagram-canvas-root svg rect[stroke="#3b82f6"]').length
    )
    expect(ringsBefore).toBeGreaterThanOrEqual(1)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const ringsAfter = await page.evaluate(() =>
      document.querySelectorAll('.diagram-canvas-root svg rect[stroke="#3b82f6"]').length
    )
    expect(ringsAfter).toBe(0)
  })

  test('Ctrl+A selects all nodes (many selection rings)', async ({ page }) => {
    await createMap(page)
    await page.keyboard.press('Meta+a')
    await page.waitForTimeout(400)
    const rings = await page.evaluate(() =>
      document.querySelectorAll(
        '.diagram-canvas-root svg rect[stroke="#3b82f6"], .diagram-canvas-root svg circle[stroke="#3b82f6"]'
      ).length
    )
    // root + 5 L1 nodes, two rings each → comfortably >= 6
    expect(rings).toBeGreaterThanOrEqual(6)
  })

  test('rubber-band drag selects multiple nodes', async ({ page }) => {
    await createMap(page)
    const svg = page.locator('.diagram-canvas-root svg')
    const box = await svg.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + box!.width * 0.45, box!.y + 8)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width - 8, box!.y + box!.height - 8, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(400)
    const rings = await page.evaluate(() =>
      document.querySelectorAll('.diagram-canvas-root svg rect[stroke="#3b82f6"]').length
    )
    expect(rings).toBeGreaterThanOrEqual(2)
  })

  test('dragging the root node (logic-chart) moves it', async ({ page }) => {
    await createMap(page)
    // The root is drag-enabled in logic-chart. Its X is clamped to the trunk range,
    // so drag it left a large amount where it has room to travel.
    const rootTransform = () => page.evaluate(() => {
      const gs = [...document.querySelectorAll('.diagram-canvas-root svg g[data-node-id]')]
      const root = gs.find(g => {
        const c = g.querySelector('circle')
        return c && parseFloat(c.getAttribute('r') ?? '0') > 40
      }) as SVGGElement | undefined
      return root?.style.transform ?? ''
    })
    const box = await rootBoxOf(page)
    expect(box).not.toBeNull()
    const before = await rootTransform()
    const cx = box!.x + box!.w / 2
    const cy = box!.y + box!.h / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx - 220, cy, { steps: 15 })
    await page.mouse.up()
    await page.waitForTimeout(500)
    expect(await rootTransform()).not.toBe(before)
  })

  test('zoom HUD badge updates on ctrl+wheel zoom', async ({ page }) => {
    await createMap(page)
    const svg = page.locator('.diagram-canvas-root svg')
    const box = await svg.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -200)
    await page.keyboard.up('Control')
    await page.waitForTimeout(400)
    const badge = page.locator('text=/\\d+%/').first()
    const pct = parseInt((await badge.textContent())!.replace('%', ''))
    expect(pct).toBeGreaterThan(100)
  })

  test('wheel pans the canvas (group transform shifts)', async ({ page }) => {
    await createMap(page)
    const g = page.locator('.diagram-canvas-root svg > g')
    const before = await g.getAttribute('transform')
    const svg = page.locator('.diagram-canvas-root svg')
    const box = await svg.boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.wheel(180, 0)
    await page.waitForTimeout(300)
    expect(await g.getAttribute('transform')).not.toBe(before)
  })
})
