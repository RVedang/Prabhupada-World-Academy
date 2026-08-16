import { test, expect } from '@playwright/test';

test('verify Missing Sadhana and FOLK dashboard UI', async ({ page }) => {
  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  console.log('Page title:', await page.title());
  
  await page.screenshot({ path: 'verification_screenshot.png', fullPage: true });
});
