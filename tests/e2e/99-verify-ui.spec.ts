import { test, expect } from '@playwright/test';

test('Verify FOLK Super Admin Dashboard — Sadhana & Missing Sadhana Tabs UI', async ({ page }) => {
  console.log('1. Navigating to login page...');
  await page.goto('http://127.0.0.1:3000/login');

  console.log('2. Clicking FOLK Super Admin (Gaurmandal Prabhu) button...');
  const folkSuperAdminBtn = page.locator('button', { hasText: 'FOLK Super Admin' });
  await folkSuperAdminBtn.click();

  console.log('3. Waiting for dashboard navigation...');
  await page.waitForURL(/\/super\/dashboard|\/dashboard/, { timeout: 15000 });
  await page.waitForTimeout(3000);
  console.log('Logged in! URL:', page.url());

  // Check Show Scholars checkbox in Sadhana tab
  const showScholarsCheckbox = page.locator('label', { hasText: 'Show Scholars' });
  const isScholarsVisible = await showScholarsCheckbox.isVisible().catch(() => false);
  console.log('Is "Show Scholars" checkbox visible on Sadhana tab?', isScholarsVisible);

  await page.screenshot({ path: 'tests/e2e-report/01-sadhana-tab-show-scholars.png', fullPage: true });

  console.log('4. Clicking Missing Sadhana tab/link or navigating to hash...');
  // Find Missing Sadhana tab button or click hash
  const missingTabBtn = page.locator('button, a', { hasText: 'Missing Sadhana' }).first();
  if (await missingTabBtn.isVisible().catch(() => false)) {
    await missingTabBtn.click();
  } else {
    await page.goto('http://127.0.0.1:3000/super/dashboard#missing-sadhana');
  }
  await page.waitForTimeout(3000);

  const missingSadhanaHeader = page.locator('text=Missing Sadhana Report');
  const isHeaderVisible = await missingSadhanaHeader.isVisible().catch(() => false);
  console.log('Is Missing Sadhana Report header visible on #missing-sadhana tab?', isHeaderVisible);

  await page.screenshot({ path: 'tests/e2e-report/02-missing-sadhana-tab.png', fullPage: true });

  // Inspect combobox trigger labels
  const comboboxes = page.locator('button[role="combobox"]');
  const count = await comboboxes.count();
  console.log('Found comboboxes count:', count);

  for (let i = 0; i < count; i++) {
    const text = await comboboxes.nth(i).innerText();
    console.log(`Combobox [${i}] text:`, JSON.stringify(text));
    expect(text.trim()).not.toBe('all');
  }
});
