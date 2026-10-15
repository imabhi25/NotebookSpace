const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const token = 'M448J9cZAHUomHmY-X6_jF8x64g78Z7D3_ba2cEjKKI';

  const outDir = path.join(__dirname, '..', 'tests', 'screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 1. Due date conflict (EECS 2031) - 1440px
  {
    console.log('Capturing assignment2_conflict_1440_light.png...');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript((tok) => {
      window.localStorage.setItem('notebook_auth_token', tok);
      window.localStorage.setItem('course_assistant_auth_token', tok);
      window.localStorage.setItem('token', tok);
    }, token);
    const page = await context.newPage();
    await page.goto('http://localhost:5173/subject/2f369fa3-c3fc-43dd-8481-d195d4c80219', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="conflict-view"]', { timeout: 15000 });
    await page.evaluate(() => {
      const el = document.querySelector('.thread-scroll-container');
      if (el) el.scrollTop = 0;
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, 'assignment2_conflict_1440_light.png'), fullPage: false });
    await context.close();
  }

  // 2. Due date conflict (EECS 2031) - 390px
  {
    console.log('Capturing assignment2_conflict_390_light.png...');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    await context.addInitScript((tok) => {
      window.localStorage.setItem('notebook_auth_token', tok);
      window.localStorage.setItem('course_assistant_auth_token', tok);
      window.localStorage.setItem('token', tok);
    }, token);
    const page = await context.newPage();
    await page.goto('http://localhost:5173/subject/2f369fa3-c3fc-43dd-8481-d195d4c80219', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="conflict-view"]', { timeout: 15000 });
    await page.evaluate(() => {
      const el = document.querySelector('.thread-scroll-container');
      if (el) el.scrollTop = 0;
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, 'assignment2_conflict_390_light.png'), fullPage: false });
    await context.close();
  }

  // 3. Array indexing mismatch (EECS 3101) - 1440px
  {
    console.log('Capturing array_indexing_mismatch_1440_light.png...');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript((tok) => {
      window.localStorage.setItem('notebook_auth_token', tok);
      window.localStorage.setItem('course_assistant_auth_token', tok);
      window.localStorage.setItem('token', tok);
    }, token);
    const page = await context.newPage();
    await page.goto('http://localhost:5173/subject/f6d264f0-0215-4957-9ec7-fc8db035d576', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="convention-mismatch-view"]', { timeout: 15000 });
    await page.evaluate(() => {
      const el = document.querySelector('.thread-scroll-container');
      if (el) el.scrollTop = 0;
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, 'array_indexing_mismatch_1440_light.png'), fullPage: false });
    await context.close();
  }

  // 4. Array indexing mismatch (EECS 3101) - 390px
  {
    console.log('Capturing array_indexing_mismatch_390_light.png...');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    await context.addInitScript((tok) => {
      window.localStorage.setItem('notebook_auth_token', tok);
      window.localStorage.setItem('course_assistant_auth_token', tok);
      window.localStorage.setItem('token', tok);
    }, token);
    const page = await context.newPage();
    await page.goto('http://localhost:5173/subject/f6d264f0-0215-4957-9ec7-fc8db035d576', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="convention-mismatch-view"]', { timeout: 15000 });
    await page.evaluate(() => {
      const el = document.querySelector('.thread-scroll-container');
      if (el) el.scrollTop = 0;
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, 'array_indexing_mismatch_390_light.png'), fullPage: false });
    await context.close();
  }

  await browser.close();
  console.log('✓ All 4 real screenshots re-captured with scroll-to-top!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
