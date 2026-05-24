import { test, expect } from './fixtures'
import { waitForApp } from './helpers'
import type { Page } from '@playwright/test'

// ──────────────────────────────────────────────────────────────────────────
// Exhaustive coverage of every interactive control on the HOME / landing
// surface and its modals. Each test clicks a real control and asserts the
// resulting effect — never just "didn't crash".
//
// Strategy notes
//  • On localhost the app auto-logs-in as DEV_USER, so the home grid renders.
//  • We create our own map (via the "New blank map" button or a stubbed AI
//    response) and scope card operations to a card we control where possible,
//    to avoid racing parallel specs that mutate shared prod data.
//  • The _mapCleanup fixture watches POST /api/mindmaps and deletes any map
//    a test creates, so created maps don't pile up.
// ──────────────────────────────────────────────────────────────────────────

/** Locate the home-grid card whose header shows the given (unique) map name. */
function cardByName(page: Page, name: string) {
  return page.locator('.home-grid > div').filter({ hasText: name })
}

test.describe('Home — header controls', () => {
  test('"New blank map" (+ New) button creates a map and opens the editor', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    const newBtn = page.locator('[title="New blank map"]')
    await expect(newBtn).toBeVisible()
    await newBtn.click()
    // Effect: canvas mounts and URL gains ?map=
    await expect(page.locator('.diagram-canvas-root')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[title="All maps"]')).toBeVisible()
    expect(page.url()).toContain('?map=')
  })

  test('search input narrows the visible cards', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await expect(page.locator('.home-grid')).toBeVisible({ timeout: 10_000 })
    // Wait for at least one card.
    await expect(page.locator('.home-grid > div').first()).toBeVisible({ timeout: 10_000 })

    const search = page.getByPlaceholder('Search maps…')
    await expect(search).toBeVisible()

    // A query that matches nothing must empty the grid and show the empty state.
    await search.fill('zzz_no_map_matches_this_query_zzz')
    await expect(page.locator('.home-grid > div')).toHaveCount(0)
    await expect(page.getByText('No maps yet')).toBeVisible()

    // Clearing restores cards.
    await search.fill('')
    await expect(page.locator('.home-grid > div').first()).toBeVisible({ timeout: 5_000 })
  })

  test('user avatar menu opens and reveals Import + Sign out', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    // Avatar button: 34x34 round button at top-right (title = display name).
    const avatar = page.locator('[title="Bunlong Heng"]')
    await expect(avatar).toBeVisible({ timeout: 10_000 })
    await avatar.click()
    // Menu reveals Import formats + Sign out.
    await expect(page.getByText('Import formats')).toBeVisible()
    await expect(page.getByText('Sign out')).toBeVisible()
  })

  test('user menu "Import formats" opens the Import modal', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await page.locator('[title="Bunlong Heng"]').click()
    await page.getByText('Import formats').click()
    // Effect: ImportModal opens (heading "Import Formats").
    await expect(page.getByRole('heading', { name: 'Import Formats' })).toBeVisible()
  })

  test('user menu "Sign out" returns to the login screen', async ({ page }) => {
    // Override auto-login: navigate, then sign out and assert the login form.
    await page.goto('/')
    await waitForApp(page)
    await page.locator('[title="Bunlong Heng"]').click()
    await page.getByText('Sign out').click()
    // handleSignOut clears localStorage + setUser(null). On localhost the app
    // re-seeds DEV_USER only on initial mount, so after sign out the login
    // form shows until reload. Assert the Sign in screen appears.
    await expect(page.getByRole('button', { name: /Sign in/ })).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('clicking outside the user menu closes it', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await page.locator('[title="Bunlong Heng"]').click()
    await expect(page.getByText('Sign out')).toBeVisible()
    // Click on the page body (tag bar area) to dismiss.
    await page.mouse.click(10, 300)
    await expect(page.getByText('Sign out')).toBeHidden()
  })
})

test.describe('Home — tag filter chips', () => {
  test('"All" chip is active by default and shows the full count', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await expect(page.locator('.home-grid')).toBeVisible({ timeout: 10_000 })
    // The "All" chip is the first button in the tag bar (text "All").
    const allChip = page.locator('button', { hasText: 'All' }).first()
    await expect(allChip).toBeVisible()
    // It carries a dark active background by default (activeTag === null).
    const bg = await allChip.evaluate(el => getComputedStyle(el).backgroundColor)
    expect(bg).toBe('rgb(30, 41, 59)') // #1e293b
  })

  test('clicking a preset tag chip filters the grid and updates the URL', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await expect(page.locator('.home-grid')).toBeVisible({ timeout: 10_000 })

    // Click the "AI" preset chip.
    const aiChip = page.locator('button', { hasText: /^AI/ }).first()
    await expect(aiChip).toBeVisible()
    await aiChip.click()

    // Effect: URL records ?tag=AI.
    await expect.poll(() => new URL(page.url()).searchParams.get('tag')).toBe('AI')

    // Every visible card that has tags must include the AI badge; cards with no
    // tags are filtered out. We assert the grid only shows AI-tagged maps OR is
    // empty (valid when no AI maps exist in the shared store).
    const cardCount = await page.locator('.home-grid > div').count()
    if (cardCount > 0) {
      // Each rendered card must contain an "AI" tag badge.
      const cardsWithoutAi = await page.locator('.home-grid > div').evaluateAll(cards =>
        cards.filter(c => !Array.from(c.querySelectorAll('span')).some(s => s.textContent === 'AI')).length,
      )
      expect(cardsWithoutAi).toBe(0)
    } else {
      await expect(page.getByText('No maps yet')).toBeVisible()
    }
  })

  test('clicking the active tag chip again clears the filter', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await expect(page.locator('.home-grid')).toBeVisible({ timeout: 10_000 })

    const workChip = page.locator('button', { hasText: /^Work/ }).first()
    await workChip.click()
    await expect.poll(() => new URL(page.url()).searchParams.get('tag')).toBe('Work')
    // Click again — toggles off.
    await workChip.click()
    await expect.poll(() => new URL(page.url()).searchParams.get('tag')).toBeNull()
  })

  test('"No Tag" chip shows only untagged maps', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await expect(page.locator('.home-grid')).toBeVisible({ timeout: 10_000 })

    const noTagChip = page.locator('button', { hasText: 'No Tag' })
    await expect(noTagChip).toBeVisible()
    await noTagChip.click()
    await expect.poll(() => new URL(page.url()).searchParams.get('tag')).toBe('__no_tag__')

    // Visible cards must have NO tag badges.
    const cardCount = await page.locator('.home-grid > div').count()
    if (cardCount > 0) {
      const cardsWithTags = await page.locator('.home-grid > div').evaluateAll(cards =>
        cards.filter(c => {
          // A tag badge is a <span> with tiny font weight 700 inside the header.
          const header = c.querySelector('div')
          const badges = header?.querySelectorAll('span') ?? []
          return Array.from(badges).some(b => {
            const fs = getComputedStyle(b).fontSize
            return fs === '7px'
          })
        }).length,
      )
      expect(cardsWithTags).toBe(0)
    }
  })

  test('Research preset chip is present and toggles', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await expect(page.locator('.home-grid')).toBeVisible({ timeout: 10_000 })
    const chip = page.locator('button', { hasText: /^Research/ }).first()
    await expect(chip).toBeVisible()
    await chip.click()
    await expect.poll(() => new URL(page.url()).searchParams.get('tag')).toBe('Research')
  })

  test('Personal preset chip is present and toggles', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await expect(page.locator('.home-grid')).toBeVisible({ timeout: 10_000 })
    const chip = page.locator('button', { hasText: /^Personal/ }).first()
    await expect(chip).toBeVisible()
    await chip.click()
    await expect.poll(() => new URL(page.url()).searchParams.get('tag')).toBe('Personal')
  })
})

test.describe('Home — floating create modal (FAB)', () => {
  test('floating "New Map" (+) button opens the AI create modal', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    const fab = page.locator('[title="New Map"]')
    await expect(fab).toBeVisible()
    await fab.click({ force: true })
    // Effect: "Create with AI" modal opens with a prompt textarea.
    await expect(page.getByRole('heading', { name: 'Create with AI' })).toBeVisible()
    await expect(page.getByPlaceholder(/Business plan for a SaaS startup/)).toBeVisible()
  })

  test('create modal closes on backdrop click', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await page.locator('[title="New Map"]').click({ force: true })
    await expect(page.getByRole('heading', { name: 'Create with AI' })).toBeVisible()
    // Click the dimmed backdrop (top-left corner, outside the centered card).
    await page.mouse.click(10, 10)
    await expect(page.getByRole('heading', { name: 'Create with AI' })).toBeHidden()
  })

  test('Generate button is disabled until a prompt is typed', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await page.locator('[title="New Map"]').click({ force: true })
    const generate = page.getByRole('button', { name: /Generate Mindmap/ })
    await expect(generate).toBeDisabled()
    await page.getByPlaceholder(/Business plan for a SaaS startup/).fill('A test plan')
    await expect(generate).toBeEnabled()
  })

  test('AI generate success navigates to the new map with confetti flag', async ({ page }) => {
    // Mock the AI endpoint to return a fake id so we don't hit the real API.
    await page.route('**/api/ai/generate-mindmap', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'e2e-ai-fake', tokens: 1200 }),
      }),
    )
    // The fake id won't load a real map, so stub the single-map load too, so the
    // editor mounts after navigation instead of bouncing home.
    await page.route(/\/api\/mindmaps\?.*\bid=e2e-ai-fake/, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id: 'e2e-ai-fake', name: 'E2E AI Map', type: 'mindmap',
          line_style: 'orthogonal', theme_id: 'default', sharing_enabled: false, tags: [],
          nodes: [{ id: 'r', title: 'Root', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 140, height: 140, sortOrder: 0 }],
        }),
      }),
    )

    await page.goto('/')
    await waitForApp(page)
    await page.locator('[title="New Map"]').click({ force: true })
    await page.getByPlaceholder(/Business plan for a SaaS startup/).fill('Software architecture layers')
    await page.getByRole('button', { name: /Generate Mindmap/ }).click()

    // Effect: navigation to ?id=<fake>&imported=1&tokens=... → normalized to ?map=
    await page.waitForURL(/[?&](map|id)=e2e-ai-fake/, { timeout: 10_000 })
    expect(page.url()).toContain('e2e-ai-fake')
    expect(page.url()).toContain('imported')
  })

  test('AI generate error keeps the modal open and shows the message', async ({ page }) => {
    // Mock a failing AI endpoint.
    await page.route('**/api/ai/generate-mindmap', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'AI quota exhausted' }),
      }),
    )

    await page.goto('/')
    await waitForApp(page)
    await page.locator('[title="New Map"]').click({ force: true })
    await page.getByPlaceholder(/Business plan for a SaaS startup/).fill('Marketing strategy')
    await page.getByRole('button', { name: /Generate Mindmap/ }).click()

    // Effect: modal stays open and the error is rendered.
    await expect(page.getByRole('heading', { name: 'Create with AI' })).toBeVisible()
    await expect(page.getByText('AI quota exhausted')).toBeVisible({ timeout: 10_000 })
    // We must NOT have navigated to a map.
    expect(page.url()).not.toContain('?map=')
  })

  test('Cmd+Enter in the prompt triggers generation', async ({ page }) => {
    await page.route('**/api/ai/generate-mindmap', route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'e2e-ai-cmd', tokens: 800 }),
      }),
    )
    await page.route(/\/api\/mindmaps\?.*\bid=e2e-ai-cmd/, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id: 'e2e-ai-cmd', name: 'Cmd Map', type: 'mindmap',
          line_style: 'orthogonal', theme_id: 'default', sharing_enabled: false, tags: [],
          nodes: [{ id: 'r', title: 'Root', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 140, height: 140, sortOrder: 0 }],
        }),
      }),
    )
    await page.goto('/')
    await waitForApp(page)
    await page.locator('[title="New Map"]').click({ force: true })
    const textarea = page.getByPlaceholder(/Business plan for a SaaS startup/)
    await textarea.fill('Keyboard triggered map')
    await textarea.press('Meta+Enter')
    await page.waitForURL(/[?&](map|id)=e2e-ai-cmd/, { timeout: 10_000 })
    expect(page.url()).toContain('e2e-ai-cmd')
  })
})

test.describe('Home — diagram card hover actions', () => {
  test('clicking a card opens the editor', async ({ page }) => {
    // Pin single-map loads to a deterministic success (shared grid is racy).
    await page.route(/\/api\/mindmaps\?.*\bid=/, route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          id: 'e2e-card-open', name: 'Card Open', type: 'mindmap',
          line_style: 'orthogonal', theme_id: 'default', sharing_enabled: false, tags: [],
          nodes: [{ id: 'r', title: 'Root', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 140, height: 140, sortOrder: 0 }],
        }),
      }),
    )
    await page.goto('/')
    await waitForApp(page)
    const card = page.locator('.home-grid > div').first()
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.click()
    await expect(page.locator('.diagram-canvas-root')).toBeVisible({ timeout: 10_000 })
    expect(page.url()).toContain('?map=')
  })

  test('hovering a card reveals the Edit-tags and Delete buttons', async ({ page }) => {
    // Deterministic single-card grid (the shared grid is racy under parallel load).
    await mountSingleCard(page, 'Hover Reveal')
    const card = cardByName(page, 'Hover Reveal').first()
    const editBtn = card.locator('[title="Edit tags"]')
    // Hover state can be lost under CPU load — retry until the on-hover button shows.
    await expect(async () => {
      await card.hover()
      await expect(editBtn).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 10_000 })
    await expect(card.locator('button:has(svg.lucide-trash-2)')).toBeVisible()
  })

  test('Edit-tags opens the tag modal for that map', async ({ page }) => {
    const name = 'Hover EditTags'
    await mountSingleCard(page, name)
    await openTagModal(page, name) // robust hover→click
    await expect(tagModalPanel(page, name)).toBeVisible()
    await expect(page.getByPlaceholder('Type a new tag…')).toBeVisible()
  })
})

/** The tag-edit modal panel — the white box that holds both the "New tag" input
 *  and the "Add tag" preset chips. Scoping to it disambiguates the modal's preset
 *  chips from the identical tag-bar chips on the page behind it. We anchor on the
 *  unique input (only the modal renders it), then walk up to the smallest div that
 *  also contains the "Add tag" section. */
function tagModalPanel(page: Page, _name: string) {
  return page
    .locator('div')
    .filter({ has: page.getByPlaceholder('Type a new tag…') })
    .filter({ hasText: 'Add tag' })
    .last()
}

async function openTagModal(page: Page, name: string) {
  const card = cardByName(page, name).first()
  await card.scrollIntoViewIfNeeded()
  const editBtn = card.locator('[title="Edit tags"]')
  // The Edit-tags button only renders while the card is hovered; under parallel
  // CPU load the hover can be lost before the click lands. Retry hover until the
  // button is actually visible, then click.
  await expect(async () => {
    await card.hover()
    await expect(editBtn).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })
  await editBtn.click()
  await expect(page.getByPlaceholder('Type a new tag…')).toBeVisible()
}

// The tag-edit modal lives on a home-grid CARD. Driving the real shared grid
// (80+ maps from parallel specs) made these multi-step hover→modal→badge flows
// flaky under load. Instead, stub the API so the grid renders exactly ONE
// controlled card — deterministic, fast, and immune to cross-spec interference.
// The real tag-edit UI (modal, add/remove, badges) is still fully exercised.
async function mountSingleCard(page: Page, name: string, tags: string[] = []) {
  const id = 'e2e-tagcard'
  const fullMap = {
    id, name, type: 'logic-chart', line_style: 'orthogonal', theme_id: 'default',
    sharing_enabled: false, tags,
    nodes: [{ id: 'root', title: name, color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 140, height: 140, sortOrder: 0 }],
  }
  await page.route(/\/api\/mindmaps(\?|$)/, route => {
    const req = route.request()
    if (req.method() === 'PUT' || req.method() === 'POST' || req.method() === 'DELETE') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    }
    if (/\bid=/.test(req.url())) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fullMap) })
    }
    // map list → exactly one card
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ id, name, type: 'logic-chart', sharing_enabled: false, tags, updated_at: '2026-01-01T00:00:00Z' }]),
    })
  })
  await page.goto('/')
  await waitForApp(page)
  await expect(cardByName(page, name).first()).toBeVisible({ timeout: 10_000 })
}

test.describe('Home — tag-edit modal', () => {
  test('adding a preset tag shows it as a badge on the card', async ({ page }) => {
    const name = 'TagCard Preset'
    await mountSingleCard(page, name)
    await openTagModal(page, name)

    // Click the preset "Work" chip inside the modal panel.
    await tagModalPanel(page, name).getByRole('button', { name: /^Work$/ }).first().click()

    // Modal closes (addTag → setTagModalId(null)); the card now shows a Work badge.
    await expect(page.getByPlaceholder('Type a new tag…')).toBeHidden()
    await expect(cardByName(page, name).first().locator('span', { hasText: 'Work' }).first()).toBeVisible({ timeout: 5_000 })
  })

  test('adding a custom tag via the form shows it on the card', async ({ page }) => {
    const name = 'TagCard Custom'
    await mountSingleCard(page, name)
    await openTagModal(page, name)

    const input = page.getByPlaceholder('Type a new tag…')
    await input.fill('E2ECustom')
    await tagModalPanel(page, name).getByRole('button', { name: 'Add' }).click()

    await expect(input).toBeHidden()
    await expect(cardByName(page, name).first().locator('span', { hasText: 'E2ECustom' }).first()).toBeVisible({ timeout: 5_000 })
  })

  test('removing a current tag clears it from the card', async ({ page }) => {
    const name = 'TagCard Remove'
    // Start with the tag already present (served by the stub).
    await mountSingleCard(page, name, ['RemoveMe'])
    await expect(cardByName(page, name).first().locator('span', { hasText: 'RemoveMe' }).first()).toBeVisible({ timeout: 5_000 })

    await openTagModal(page, name)
    await tagModalPanel(page, name).getByRole('button', { name: /RemoveMe/ }).click()
    await expect(page.getByPlaceholder('Type a new tag…')).toBeHidden()

    await expect(cardByName(page, name).first().locator('span', { hasText: 'RemoveMe' })).toHaveCount(0)
  })

  test('tag modal close (X) button dismisses without changes', async ({ page }) => {
    const name = 'TagCard Close'
    await mountSingleCard(page, name)
    await openTagModal(page, name)
    await tagModalPanel(page, name).locator('button:has(svg.lucide-x)').first().click()
    await expect(page.getByPlaceholder('Type a new tag…')).toBeHidden()
  })

  test('tag modal closes on backdrop click', async ({ page }) => {
    const name = 'TagCard Backdrop'
    await mountSingleCard(page, name)
    await openTagModal(page, name)
    await page.mouse.click(10, 10)
    await expect(page.getByPlaceholder('Type a new tag…')).toBeHidden()
  })
})

test.describe('Home — paste import flow', () => {
  test('pasting valid JSON anywhere imports a new map into the editor', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    const json = JSON.stringify({
      'E2E Paste Map': [
        { icon: 'star', 'Branch A': ['leaf 1', 'leaf 2'] },
        { icon: 'brain', 'Branch B': ['leaf 3'] },
      ],
    })
    await page.evaluate((text) => {
      const ev = new ClipboardEvent('paste', { clipboardData: new DataTransfer() })
      ev.clipboardData!.setData('text/plain', text)
      document.dispatchEvent(ev)
    }, json)
    // Effect: import navigates into an editor with rendered nodes.
    await expect(page.locator('.diagram-canvas-root')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.diagram-canvas-root svg text').first()).toBeVisible({ timeout: 5_000 })
  })

  test('pasting garbage shows the incompatible-format toast and stays home', async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await page.evaluate(() => {
      const ev = new ClipboardEvent('paste', { clipboardData: new DataTransfer() })
      ev.clipboardData!.setData('text/plain', 'just a single line of plain prose')
      document.dispatchEvent(ev)
    })
    await expect(page.getByText(/Incompatible format/i)).toBeVisible({ timeout: 5_000 })
    // Still on home (no editor canvas mounted).
    await expect(page.locator('.home-main')).toBeVisible()
    await expect(page.locator('.diagram-canvas-root')).toHaveCount(0)
  })
})
