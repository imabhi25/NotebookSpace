const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const token = 'M448J9cZAHUomHmY-X6_jF8x64g78Z7D3_ba2cEjKKI';
  const subjectId = 'f6d264f0-0215-4957-9ec7-fc8db035d576';
  const convId = '8b52906e-db10-42a8-bd8d-33081793602f';

  const outDir = path.join(__dirname, '..', 'tests', 'screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 1. Desktop 1440px
  {
    console.log('Capturing proof_check_1440.png...');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript((tok) => {
      window.localStorage.setItem('notebook_auth_token', tok);
      window.localStorage.setItem('course_assistant_auth_token', tok);
      window.localStorage.setItem('token', tok);
    }, token);
    const page = await context.newPage();
    await page.goto(`http://localhost:5173/subject/${subjectId}`, { waitUntil: 'networkidle' });

    // Click on the conversation if not active
    const convSelector = `[data-testid="conv-item-${convId}"]`;
    if (await page.$(convSelector)) {
      await page.click(convSelector);
    }

    await page.waitForSelector('[data-testid="proof-check-view"]', { timeout: 15000 });
    await page.waitForSelector('[data-testid="user-proof-submission"]', { timeout: 15000 });

    // Open first hint for demonstration
    const firstHintBtn = await page.$('[data-testid^="hint-toggle-"]');
    if (firstHintBtn) {
      await firstHintBtn.click();
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: path.join(outDir, 'proof_check_1440.png'), fullPage: false });
    await context.close();
  }

  // 2. Mobile 390px
  {
    console.log('Capturing proof_check_390.png...');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    await context.addInitScript((tok) => {
      window.localStorage.setItem('notebook_auth_token', tok);
      window.localStorage.setItem('course_assistant_auth_token', tok);
      window.localStorage.setItem('token', tok);
    }, token);
    const page = await context.newPage();
    await page.goto(`http://localhost:5173/subject/${subjectId}`, { waitUntil: 'networkidle' });

    const convSelector = `[data-testid="conv-item-${convId}"]`;
    if (await page.$(convSelector)) {
      await page.click(convSelector);
    }

    await page.waitForSelector('[data-testid="proof-check-view"]', { timeout: 15000 });

    const firstHintBtn = await page.$('[data-testid^="hint-toggle-"]');
    if (firstHintBtn) {
      await firstHintBtn.click();
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: path.join(outDir, 'proof_check_390.png'), fullPage: false });
    await context.close();
  }

  // 3. Desktop 1440px - Scrolled to show User Proof Submission and Copy as LaTeX button
  {
    console.log('Capturing proof_check_submission_1440.png...');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript((tok) => {
      window.localStorage.setItem('notebook_auth_token', tok);
      window.localStorage.setItem('course_assistant_auth_token', tok);
      window.localStorage.setItem('token', tok);
    }, token);
    const page = await context.newPage();
    await page.goto(`http://localhost:5173/subject/${subjectId}`, { waitUntil: 'networkidle' });

    const convSelector = `[data-testid="conv-item-${convId}"]`;
    if (await page.$(convSelector)) {
      await page.click(convSelector);
    }

    await page.waitForSelector('[data-testid="user-proof-submission"]', { timeout: 15000 });
    await page.evaluate(() => {
      const el = document.querySelector('.thread-scroll-container');
      if (el) el.scrollTop = 0;
    });
    await page.waitForTimeout(400);

    await page.screenshot({ path: path.join(outDir, 'proof_check_submission_1440.png'), fullPage: false });
    await context.close();
  }

  // 4. Desktop 1440px - Composer in Proof Check Mode
  {
    console.log('Capturing proof_check_composer_1440.png...');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript((tok) => {
      window.localStorage.setItem('notebook_auth_token', tok);
      window.localStorage.setItem('course_assistant_auth_token', tok);
      window.localStorage.setItem('token', tok);
    }, token);
    const page = await context.newPage();
    await page.goto(`http://localhost:5173/subject/${subjectId}`, { waitUntil: 'networkidle' });

    // Click Tools Proof Check tile
    const proofTile = await page.waitForSelector('[data-testid="tool-tile-proof-check"]', { timeout: 15000 });
    await proofTile.click();

    await page.waitForSelector('[data-testid="proof-composer-card"]', { timeout: 15000 });
    await page.waitForTimeout(400);

    await page.screenshot({ path: path.join(outDir, 'proof_check_composer_1440.png'), fullPage: false });
    await context.close();
  }

  await browser.close();
  console.log('✓ All Proof check screenshots successfully captured!');
}

main().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
