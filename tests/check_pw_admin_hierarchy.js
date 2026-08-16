const { chromium } = require('@playwright/test');

async function run() {
  console.log('1. Launching chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('2. Navigating to http://127.0.0.1:3000/login...');
  await page.goto('http://127.0.0.1:3000/login');
  await page.waitForTimeout(1000);

  console.log('3. Clicking PW Admin button...');
  const pwAdminBtn = page.locator('button', { hasText: 'PW Admin' });
  await pwAdminBtn.click();
  await page.waitForTimeout(3000);

  console.log('4. Current URL:', page.url());

  console.log('5. Navigating to /pw-admin/dashboard#users...');
  await page.goto('http://127.0.0.1:3000/pw-admin/dashboard#users');
  await page.waitForTimeout(3000);

  // Take screenshot of PW Admin users table
  const screenshotPath = 'tests/e2e-report/03-pw-admin-users-hierarchy.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);

  // Check rows in the Users table
  const rows = page.locator('tbody tr');
  const rowCount = await rows.count();
  console.log('User rows displayed for PW Admin:', rowCount);

  for (let i = 0; i < rowCount; i++) {
    const text = await rows.nth(i).innerText();
    console.log(`Row [${i}]:`, JSON.stringify(text));
    
    // Check if role select is disabled
    const roleSelectTrigger = rows.nth(i).locator('button[role="combobox"]').last();
    if (await roleSelectTrigger.isVisible().catch(() => false)) {
      const isDisabled = await roleSelectTrigger.isDisabled().catch(() => false);
      console.log(`Row [${i}] role dropdown isDisabled:`, isDisabled);
    }
  }

  await browser.close();
  console.log('Done!');
}

run().catch(err => {
  console.error('Error running script:', err);
  process.exit(1);
});
