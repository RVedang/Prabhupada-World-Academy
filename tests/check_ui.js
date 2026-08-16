const { chromium } = require('@playwright/test');

async function run() {
  console.log('1. Launching chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('2. Navigating to http://127.0.0.1:3000/login...');
  await page.goto('http://127.0.0.1:3000/login');
  await page.waitForTimeout(1000);

  console.log('3. Clicking FOLK Super Admin button...');
  const folkSuperAdminBtn = page.locator('button', { hasText: 'FOLK Super Admin' });
  await folkSuperAdminBtn.click();
  await page.waitForTimeout(3000);

  console.log('4. Current URL:', page.url());

  // Check Sadhana tab Show Scholars
  const showScholarsCheckbox = page.locator('label', { hasText: 'Show Scholars' });
  const isScholarsVisible = await showScholarsCheckbox.isVisible().catch(() => false);
  console.log('Is "Show Scholars" checkbox visible on Sadhana tab?', isScholarsVisible);

  // Navigate to #missing-sadhana tab
  console.log('5. Navigating to /super/dashboard#missing-sadhana...');
  await page.goto('http://127.0.0.1:3000/super/dashboard#missing-sadhana');
  await page.waitForTimeout(3000);

  const missingSadhanaHeader = page.locator('text=Missing Sadhana Report');
  const isHeaderVisible = await missingSadhanaHeader.isVisible().catch(() => false);
  console.log('Is Missing Sadhana Report header visible on #missing-sadhana tab?', isHeaderVisible);

  // Inspect combobox trigger labels
  const comboboxes = page.locator('button[role="combobox"]');
  const count = await comboboxes.count();
  console.log('Found comboboxes count:', count);

  for (let i = 0; i < count; i++) {
    const text = await comboboxes.nth(i).innerText();
    console.log(`Combobox [${i}] text:`, JSON.stringify(text));
  }

  // Check Residency dropdown options in Missing Sadhana (ensure no Prabhupada World)
  if (count > 0) {
    await comboboxes.first().click();
    await page.waitForTimeout(500);
    const residencyOptions = await page.locator('[role="option"]').allInnerTexts();
    console.log('Residency Dropdown Options:', residencyOptions);
    const hasPw = residencyOptions.some(opt => opt.includes('Prabhupada World'));
    console.log('Does Residency dropdown contain Prabhupada World?', hasPw);
    await page.keyboard.press('Escape');
  }

  await browser.close();
  console.log('Done!');
}

run().catch(err => {
  console.error('Error running check_ui script:', err);
  process.exit(1);
});
