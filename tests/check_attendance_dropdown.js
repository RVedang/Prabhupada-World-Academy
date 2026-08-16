const { chromium } = require('@playwright/test');

async function run() {
  console.log('1. Launching chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('2. Navigating to http://127.0.0.1:3000/login...');
  await page.goto('http://127.0.0.1:3000/login');
  await page.waitForTimeout(1000);

  console.log('3. Clicking PW Super Admin button...');
  const pwAdminBtn = page.locator('button', { hasText: 'PW Super Admin' });
  await pwAdminBtn.click();
  await page.waitForTimeout(3000);

  console.log('4. Navigating to /pw-admin/dashboard#attendance...');
  await page.goto('http://127.0.0.1:3000/pw-admin/dashboard#attendance');
  await page.waitForTimeout(3000);

  // Take screenshot of Attendance report
  const screenshotPath = 'tests/e2e-report/04-attendance-dropdown.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });

  // Click Admin / Mentor dropdown
  const adminDropdownTrigger = page.locator('button[role="combobox"]', { hasText: 'All Admins' });
  if (await adminDropdownTrigger.isVisible().catch(() => false)) {
    await adminDropdownTrigger.click();
    await page.waitForTimeout(500);
    const options = await page.locator('[role="option"]').allInnerTexts();
    console.log('Admin / Mentor Dropdown Options:', options);
  } else {
    console.log('Admin dropdown trigger not visible directly, searching comboboxes...');
    const comboboxes = page.locator('button[role="combobox"]');
    const count = await comboboxes.count();
    for (let i = 0; i < count; i++) {
      console.log(`Combobox [${i}]:`, await comboboxes.nth(i).innerText());
    }
  }

  await browser.close();
  console.log('Done!');
}

run().catch(err => {
  console.error('Error running script:', err);
  process.exit(1);
});
