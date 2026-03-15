const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  page.on('console', m => { if (m.type() === 'error') console.log('JS error:', m.text()) });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1500);

  // Screenshot of home page to see what's there
  await page.screenshot({ path: '/tmp/home.png' });
  console.log('Home page screenshot: /tmp/home.png');

  // Click on a diagram card (the clickable div with the diagram thumbnail)
  const diagramCards = page.locator('div[style*="border-radius: 14px"][style*="cursor: pointer"]');
  const count = await diagramCards.count();
  console.log(`Found ${count} diagram cards`);

  if (count > 0) {
    await diagramCards.first().click();
  } else {
    // Create a new map
    console.log('No cards found, creating new map');
    await page.locator('button', { hasText: 'New Map' }).click();
    await page.waitForTimeout(500);
    await page.keyboard.type('Test');
    await page.keyboard.press('Enter');
  }

  // Wait for the canvas SVG (full-page canvas, not thumbnail)
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/editor.png' });
  console.log('Editor screenshot: /tmp/editor.png');

  // The canvas SVG fills the page — find it by size
  const allSvgs = page.locator('svg');
  const svgCount = await allSvgs.count();
  console.log(`Found ${svgCount} SVGs`);

  // Find the large canvas SVG (width="100%")
  let canvasSvgBox = null;
  for (let i = 0; i < svgCount; i++) {
    const box = await allSvgs.nth(i).boundingBox();
    if (box && box.width > 500) {
      canvasSvgBox = box;
      console.log(`Canvas SVG [${i}]: ${JSON.stringify(box)}`);
      break;
    }
  }

  if (!canvasSvgBox) { console.log('❌ Canvas SVG not found'); await browser.close(); return; }

  // Root circle — find circle elements within the large SVG
  const circles = page.locator('svg').filter({ hasNot: page.locator('[viewBox]') }).locator('circle');
  // Just find all circles and pick the largest (root has r=45, glow circles are bigger)
  const circleEls = page.locator('circle');
  const cCount = await circleEls.count();
  console.log(`Found ${cCount} circles`);

  // The root circle is the one with r=45 (w=h=90)
  let rootBox = null;
  for (let i = 0; i < cCount; i++) {
    const box = await circleEls.nth(i).boundingBox();
    if (box && Math.round(box.width) === 90 && Math.round(box.height) === 90) {
      rootBox = box;
      console.log(`Root circle [${i}]: ${JSON.stringify(box)}`);
      break;
    }
  }

  if (!rootBox) {
    console.log('Root circle not found by size, using first circle');
    rootBox = await circleEls.first().boundingBox();
  }

  if (!rootBox) { console.log('❌ No circles found'); await browser.close(); return; }

  const viewportCX = canvasSvgBox.x + canvasSvgBox.width / 2;
  const viewportCY = canvasSvgBox.y + canvasSvgBox.height / 2;
  const nodeCX = rootBox.x + rootBox.width / 2;
  const nodeCY = rootBox.y + rootBox.height / 2;
  const offX = Math.abs(nodeCX - viewportCX);
  const offY = Math.abs(nodeCY - viewportCY);

  console.log(`\nViewport center:    (${Math.round(viewportCX)}, ${Math.round(viewportCY)})`);
  console.log(`Root node center:   (${Math.round(nodeCX)}, ${Math.round(nodeCY)})`);
  console.log(`Offset:             dx=${Math.round(offX)}px  dy=${Math.round(offY)}px`);
  console.log(offX < 50 && offY < 50 ? '\n✅ ROOT IS CENTERED' : '\n❌ Root is NOT centered');

  await browser.close();
})();
