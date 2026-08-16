const { chromium } = require('@playwright/test');

async function run() {
  console.log('1. Launching chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('2. Navigating to http://127.0.0.1:3000/login...');
  await page.goto('http://127.0.0.1:3000/login');
  await page.waitForTimeout(1000);

  console.log('3. Clicking PW Super Admin login button...');
  const pwBtn = page.locator('button', { hasText: 'PW Super Admin' });
  if (await pwBtn.isVisible().catch(() => false)) {
    await pwBtn.click();
    await page.waitForTimeout(3000);
  }

  console.log('4. Checking PW Admin Dashboard (/pw-admin/dashboard)...');
  await page.goto('http://127.0.0.1:3000/pw-admin/dashboard');
  await page.waitForTimeout(3000);

  const pwHeader = await page.locator('h1').innerText().catch(() => 'N/A');
  console.log('PW Admin Dashboard Header:', pwHeader);

  await page.screenshot({ path: 'tests/e2e-report/05-pw-admin-dashboard.png', fullPage: true });

  console.log('5. Navigating to http://127.0.0.1:3000/login to test FOLK Admin...');
  await page.goto('http://127.0.0.1:3000/login');
  await page.waitForTimeout(1000);

  console.log('6. Clicking FOLK Super Admin / Super Guide login button...');
  const folkBtn = page.locator('button', { hasText: 'Super Guide' });
  if (await folkBtn.isVisible().catch(() => false)) {
    await folkBtn.click();
    await page.waitForTimeout(3000);
  }

  console.log('7. Checking FOLK Admin Dashboard (/folk-admin/dashboard)...');
  await page.goto('http://127.0.0.1:3000/folk-admin/dashboard');
  await page.waitForTimeout(3000);

  const folkHeader = await page.locator('h1').innerText().catch(() => 'N/A');
  console.log('FOLK Admin Dashboard Header:', folkHeader);

  await page.screenshot({ path: 'tests/e2e-report/06-folk-admin-dashboard.png', fullPage: true });

  await browser.close();
  console.log('Done!');
}

run().catch(err => {
  console.error('Error running test:', err);
  process.exit(1);
});
