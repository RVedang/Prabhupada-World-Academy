const { chromium } = require('@playwright/test');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Test 1: PW Super Admin Dashboard
  await page.goto('http://127.0.0.1:3000/login');
  await page.click('button:has-text("PW Super Admin")');
  await page.waitForTimeout(2000);
  await page.goto('http://127.0.0.1:3000/pw-admin/dashboard');
  await page.waitForTimeout(2000);
  const pwTitle = await page.locator('h1').innerText();
  console.log('PW Dashboard Title:', pwTitle);

  // Test 2: FOLK Super Admin Dashboard
  await page.goto('http://127.0.0.1:3000/login');
  await page.click('button:has-text("FOLK Super Admin")');
  await page.waitForTimeout(2000);
  await page.goto('http://127.0.0.1:3000/folk-admin/dashboard');
  await page.waitForTimeout(2000);
  const folkTitle = await page.locator('h1').innerText();
  console.log('FOLK Dashboard Title:', folkTitle);

  await browser.close();
}

run().catch(err => { console.error('Test error:', err.message); process.exit(1); });
