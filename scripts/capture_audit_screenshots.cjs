const { chromium } = require('/Users/abhisingh/node_modules/playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  const outDir = path.join(__dirname, '..', 'tests', 'screenshots', 'audit');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  // --------------------------------------------------------------------------
  // Scenario 1: Guest Mode Sample Notebook Creation & Light Mode
  // --------------------------------------------------------------------------
  console.log('1. Starting guest session and creating sample notebook (Light mode)...');
  const contextLight = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const pageLight = await contextLight.newPage();

  // Clear any residual session
  await pageLight.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
  await pageLight.evaluate(() => localStorage.clear());
  await pageLight.reload({ waitUntil: 'networkidle' });

  // Click explore sample notebook button on dashboard
  const sampleBtn = await pageLight.waitForSelector('[data-testid="create-sample-notebook-btn"]', { timeout: 15000 });
  await sampleBtn.click();

  // Wait for workspace to load
  await pageLight.waitForSelector('.workspace-shell', { timeout: 20000 });
  await pageLight.waitForTimeout(1000);

  // Take screenshot 1: Sample notebook created in guest mode (dashboard / initial workspace)
  await pageLight.screenshot({
    path: path.join(outDir, '01_sample_notebook_created_guest.png'),
    fullPage: false,
  });
  console.log('✓ Captured 01_sample_notebook_created_guest.png');

  // Verify conversation is visible
  await pageLight.waitForSelector('.thread-messages-list', { timeout: 15000 });
  await pageLight.waitForSelector('.turn-assistant', { timeout: 15000 });
  await pageLight.waitForTimeout(500);

  // Take screenshot 2: Question answered in desktop light mode
  await pageLight.screenshot({
    path: path.join(outDir, '02_question_answered_desktop_light.png'),
    fullPage: false,
  });
  console.log('✓ Captured 02_question_answered_desktop_light.png');

  // Open right inspector panel if collapsed
  const toggleInspectorBtn = await pageLight.waitForSelector('[aria-label="Toggle inspector panel"]', { timeout: 10000 });
  await toggleInspectorBtn.click();
  await pageLight.waitForTimeout(400);

  // Click on "Retrieval" tab in right panel
  const retrievalTabBtn = await pageLight.waitForSelector('[data-testid="right-panel-tab-retrieval"]', { timeout: 10000 });
  await retrievalTabBtn.click();
  await pageLight.waitForSelector('[data-testid="retrieval-map-view"]', { timeout: 20000 });
  // Wait for SVG scatter points to render
  await pageLight.waitForSelector('.retrieval-svg', { timeout: 15000 });
  await pageLight.waitForSelector('.retrieval-chunk-node', { timeout: 15000, state: 'attached' });
  await pageLight.waitForTimeout(800);

  // Take screenshot 3: Retrieval tab open in desktop light mode
  await pageLight.screenshot({
    path: path.join(outDir, '03_retrieval_tab_desktop_light.png'),
    fullPage: false,
  });
  console.log('✓ Captured 03_retrieval_tab_desktop_light.png');

  // --------------------------------------------------------------------------
  // Scenario 2: Dark Mode (Desktop 1440px)
  // --------------------------------------------------------------------------
  console.log('2. Switching to Dark Mode...');
  // Open settings or toggle theme via html attribute
  await pageLight.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
    localStorage.setItem('course_assistant_theme', 'dark');
  });
  await pageLight.waitForTimeout(600);

  // Take screenshot 4: Retrieval tab open in desktop dark mode
  await pageLight.screenshot({
    path: path.join(outDir, '04_retrieval_tab_desktop_dark.png'),
    fullPage: false,
  });
  console.log('✓ Captured 04_retrieval_tab_desktop_dark.png');

  // Switch right panel to passage or view thread in dark mode
  const passageTabBtn = await pageLight.$('[data-testid="right-panel-tab-passage"]');
  if (passageTabBtn) await passageTabBtn.click();
  await pageLight.waitForTimeout(500);

  // Take screenshot 5: Question answered in desktop dark mode
  await pageLight.screenshot({
    path: path.join(outDir, '05_question_answered_desktop_dark.png'),
    fullPage: false,
  });
  console.log('✓ Captured 05_question_answered_desktop_dark.png');

  // Get current guest token from localStorage to reuse subject in mobile view
  const currentToken = await pageLight.evaluate(() => localStorage.getItem('notebook_auth_token') || localStorage.getItem('token'));
  const currentUrl = pageLight.url();
  await contextLight.close();

  // --------------------------------------------------------------------------
  // Scenario 3: Mobile 390px Viewport
  // --------------------------------------------------------------------------
  console.log('3. Capturing Mobile 390px Viewport...');
  const contextMobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const pageMobile = await contextMobile.newPage();
  if (currentToken) {
    await pageMobile.addInitScript((tok) => {
      window.localStorage.setItem('notebook_auth_token', tok);
      window.localStorage.setItem('token', tok);
      window.localStorage.setItem('course_assistant_theme', 'light');
    }, currentToken);
  }
  await pageMobile.goto(currentUrl, { waitUntil: 'networkidle' });
  await pageMobile.waitForSelector('.workspace-shell', { timeout: 15000 });
  await pageMobile.waitForTimeout(800);

  // Take screenshot 6: Question answered at 390px mobile
  await pageMobile.screenshot({
    path: path.join(outDir, '06_question_answered_390_mobile.png'),
    fullPage: false,
  });
  console.log('✓ Captured 06_question_answered_390_mobile.png');

  // On mobile, open right panel toggle then Retrieval tab
  const mobileToggleInspector = await pageMobile.waitForSelector('[aria-label="Toggle inspector panel"]', { timeout: 10000 });
  await mobileToggleInspector.click();
  await pageMobile.waitForTimeout(400);

  const mobileRetrievalTab = await pageMobile.waitForSelector('[data-testid="right-panel-tab-retrieval"]', { timeout: 10000 });
  await mobileRetrievalTab.click();
  await pageMobile.waitForSelector('[data-testid="retrieval-map-view"]', { timeout: 20000 });
  await pageMobile.waitForSelector('.retrieval-svg', { timeout: 15000 });
  await pageMobile.waitForSelector('.retrieval-chunk-node', { timeout: 15000, state: 'attached' });
  await pageMobile.waitForTimeout(600);

  // Take screenshot 7: Retrieval tab open at 390px mobile
  await pageMobile.screenshot({
    path: path.join(outDir, '07_retrieval_tab_390_mobile.png'),
    fullPage: false,
  });
  console.log('✓ Captured 07_retrieval_tab_390_mobile.png');

  await contextMobile.close();
  await browser.close();

  console.log('\n✓ All audit screenshots successfully captured in tests/screenshots/audit!');
}

main().catch((err) => {
  console.error('Screenshot execution failed:', err);
  process.exit(1);
});
