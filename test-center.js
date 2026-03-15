const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1000);

  // If on home page, open first diagram or create one
  const hasOpenBtn = await page.locator('text=Bunlong').first().isVisible().catch(() => false);
  if (hasOpenBtn) {
    await page.locator('text=Bunlong').first().click();
  } else {
    // Create a new map
    await page.locator('text=New Map').click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
  }

  await page.waitForTimeout(1500); // wait for centering rAF + layout

  // Find the root circle in the SVG
  const svgEl = page.locator('svg').first();
  const svgBox = await svgEl.boundingBox();

  // Get all circles (root is a circle)
  const circles = page.locator('circle').first();
  const circleBox = await circles.boundingBox();

  const viewportCX = svgBox.x + svgBox.width / 2;
  const viewportCY = svgBox.y + svgBox.height / 2;

  const nodeCX = circleBox ? circleBox.x + circleBox.width / 2 : null;
  const nodeCY = circleBox ? circleBox.y + circleBox.height / 2 : null;

  console.log(`Viewport center: (${Math.round(viewportCX)}, ${Math.round(viewportCY)})`);
  console.log(`Root node center: (${Math.round(nodeCX)}, ${Math.round(nodeCY)})`);
  const offX = Math.abs(nodeCX - viewportCX);
  const offY = Math.abs(nodeCY - viewportCY);
  console.log(`Offset from center: (${Math.round(offX)}px, ${Math.round(offY)}px)`);

  if (offX < 30 && offY < 30) {
    console.log('✅ ROOT IS CENTERED!');
  } else {
    console.log('❌ Root is NOT centered — offset too large');
  }

  await page.screenshot({ path: '/tmp/center-test.png' });
  console.log('Screenshot saved to /tmp/center-test.png');

  await browser.close();
})();
