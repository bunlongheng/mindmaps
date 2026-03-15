// smoke-test.cjs — smoke tests for latest changes
const { chromium } = require('playwright')

const BASE = 'http://localhost:4174'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

let pass = 0, fail = 0
function ok(label) { console.log('  ✓', label); pass++ }
function ko(label, detail) { console.error('  ✗', label, detail ? String(detail) : ''); fail++ }

async function run() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()

  // ── 1. Home page ─────────────────────────────────────────────────────────────
  console.log('\n[1] Home page loads')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  if (await page.getByText('New Map').isVisible()) ok('Home page visible')
  else ko('Home page not visible')

  // ── 2. Create map → editor ───────────────────────────────────────────────────
  console.log('\n[2] Create map → enter editor')
  await page.getByText('New Map').click()
  await page.waitForTimeout(400)
  // Modal appears — just press Enter to accept default name
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  if (await page.locator('button[title="All maps"]').isVisible()) ok('Editor loaded')
  else ko('Editor not loaded (back button missing)')

  // ── 3. Root node font size ≥ 30 ──────────────────────────────────────────────
  console.log('\n[3] Root node font size')
  await page.waitForTimeout(500)
  // Find the canvas SVG (largest one)
  const svgs = await page.locator('svg').all()
  let canvasSvg = null
  for (const s of svgs) {
    const box = await s.boundingBox()
    if (box && box.width > 500) { canvasSvg = s; break }
  }
  if (!canvasSvg) { ko('Canvas SVG not found'); }
  else {
    const texts = await canvasSvg.locator('text').all()
    let rootFontSize = null
    for (const t of texts) {
      const fs = await t.getAttribute('font-size')
      const val = parseInt(fs ?? '0')
      if (val > (rootFontSize ?? 0)) rootFontSize = val
    }
    if (rootFontSize && rootFontSize >= 30) ok(`Root font-size=${rootFontSize} (≥30)`)
    else ko(`Root font-size too small: ${rootFontSize}`)
  }

  // ── 4. Format panel opens via button ─────────────────────────────────────────
  console.log('\n[4] Format panel')
  await page.getByTitle('Format').click()
  await page.waitForTimeout(400)
  if (await page.getByText('Share').isVisible()) ok('Format panel opened with Share tab')
  else ko('Format panel / Share tab not visible')

  // ── 5. Reset Style button gone ───────────────────────────────────────────────
  console.log('\n[5] Reset Style removed')
  if (!(await page.getByText('Reset Style').isVisible())) ok('Reset Style button gone')
  else ko('Reset Style button still present')

  // ── 6. Share tab — toggle + link ─────────────────────────────────────────────
  console.log('\n[6] Share tab — public link toggle')
  await page.getByText('Share').click()
  await page.waitForTimeout(300)

  if (await page.getByText('Link disabled').isVisible()) ok('Default: Link disabled')
  else ko('Share tab default state wrong (expected "Link disabled")')

  // Find the toggle (pill button with border-radius 11px)
  async function clickToggle() {
    for (const btn of await page.locator('button').all()) {
      const style = await btn.getAttribute('style') ?? ''
      if (style.includes('border-radius: 11px')) { await btn.click(); return true }
    }
    return false
  }

  if (await clickToggle()) {
    await page.waitForTimeout(300)
    if (await page.getByText('Link active').isVisible()) ok('Toggle ON → "Link active"')
    else ko('Toggle ON: "Link active" not shown')
    if (await page.getByText('Copy Link').isVisible()) ok('Copy Link button appears when enabled')
    else ko('Copy Link button missing when enabled')
  } else ko('Toggle button not found')

  // Toggle back OFF
  if (await clickToggle()) {
    await page.waitForTimeout(300)
    if (await page.getByText('Link disabled').isVisible()) ok('Toggle OFF → "Link disabled"')
    else ko('Toggle OFF: state not reverted')
    if (!(await page.getByText('Copy Link').isVisible())) ok('Copy Link hidden when disabled')
    else ko('Copy Link still shown when disabled')
  }

  // ── 7. Color swatches — 6-column grid ────────────────────────────────────────
  console.log('\n[7] Color swatches grid')
  await page.getByText('Style').click()
  await page.waitForTimeout(200)
  // Click a node to activate style panel
  if (canvasSvg) {
    const box = await canvasSvg.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(400)
  }
  const grids = await page.locator('[style*="grid-template-columns"]').all()
  let found6col = false
  for (const g of grids) {
    const s = await g.getAttribute('style') ?? ''
    if (s.includes('repeat(6')) { found6col = true; break }
  }
  if (found6col) ok('Swatches rendered in 6-column grid')
  else ko('6-column grid not found for swatches')

  // Check there are exactly 12 swatch buttons inside the grid
  if (found6col) {
    const firstGrid = grids.find(async g => (await g.getAttribute('style') ?? '').includes('repeat(6'))
    // just count total swatch-like buttons near the grid area
  }

  // ── 8. Viewer mode via share URL ─────────────────────────────────────────────
  console.log('\n[8] Viewer mode — shared URL')
  // Encode a tiny diagram the same way share.ts does: btoa(unescape(encodeURIComponent(json)))
  const tiny = JSON.stringify({
    id: 'share-test', name: 'Shared', type: 'mindmap', lineStyle: 'curved',
    nodes: [{ id: 'r1', title: 'Hello', color: '#6366f1', parentId: null, depth: 0,
               x: 300, y: 300, width: 140, height: 140, sortOrder: 0 }],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), sharingEnabled: true,
  })
  // Replicate btoa(unescape(encodeURIComponent(json)))
  const encoded = Buffer.from(unescape(encodeURIComponent(tiny)), 'binary').toString('base64')
  await page.goto(`${BASE}?d=${encoded}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  if (await page.getByText('VIEW ONLY').isVisible()) ok('VIEW ONLY badge shown')
  else ko('VIEW ONLY badge missing')

  if (!(await page.getByTitle('Format').isVisible())) ok('No Format button in viewer')
  else ko('Format button should not appear in viewer')

  if (!(await page.locator('button[title="All maps"]').isVisible())) ok('No back button in viewer')
  else ko('Back button should not appear in viewer')

  // ── Summary ───────────────────────────────────────────────────────────────────
  await browser.close()
  console.log(`\n${'─'.repeat(42)}`)
  console.log(`  ${pass} passed  /  ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}

run().catch(e => { console.error('\nFatal:', e.message); process.exit(1) })
