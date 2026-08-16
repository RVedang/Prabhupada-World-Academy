const { chromium } = require('@playwright/test');
const fs = require('fs');

async function generateEvidence() {
  console.log('📸 Generating Concrete Visual Evidence Screenshots...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const screenshotsDir = '/home/vedanarayana_das/.gemini/antigravity-ide/brain/3f83ba83-9cad-419d-bad2-83601f86b2be/';

  try {
    // Screenshot 1: Login Page (Standard Auth)
    await page.goto('http://127.0.0.1:3000/login');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${screenshotsDir}evidence_login_page.png`, fullPage: true });
    console.log('✅ Captured Login Page Screenshot');

    // Screenshot 2: PW Super Admin Dashboard
    const pwSuperBtn = page.locator('button', { hasText: 'PW Super Admin' });
    if (await pwSuperBtn.isVisible().catch(() => false)) {
      await pwSuperBtn.click();
      await page.waitForTimeout(2000);
    }
    await page.goto('http://127.0.0.1:3000/pw-admin/dashboard');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${screenshotsDir}evidence_pw_super_admin.png`, fullPage: true });
    console.log('✅ Captured PW Super Admin Dashboard Screenshot');

    // Screenshot 3: FOLK Super Admin Dashboard
    await page.goto('http://127.0.0.1:3000/login');
    await page.waitForTimeout(1000);
    const folkSuperBtn = page.locator('button', { hasText: 'Super Guide' });
    if (await folkSuperBtn.isVisible().catch(() => false)) {
      await folkSuperBtn.click();
      await page.waitForTimeout(2000);
    }
    await page.goto('http://127.0.0.1:3000/folk-admin/dashboard');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${screenshotsDir}evidence_folk_super_admin.png`, fullPage: true });
    console.log('✅ Captured FOLK Super Admin Dashboard Screenshot');

    // Screenshot 4: Sadhana Mentor Dashboard (3-Button Single Line Layout)
    await page.goto('http://127.0.0.1:3000/login');
    await page.waitForTimeout(1000);
    const mentorBtn = page.locator('button', { hasText: 'Sadhana Mentor' });
    if (await mentorBtn.isVisible().catch(() => false)) {
      await mentorBtn.click();
      await page.waitForTimeout(2000);
    }
    await page.goto('http://127.0.0.1:3000/mentor/dashboard');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${screenshotsDir}evidence_sadhana_mentor_dashboard.png`, fullPage: true });
    console.log('✅ Captured Sadhana Mentor Dashboard Screenshot');

  } catch (err) {
    console.error('Error generating evidence screenshots:', err);
  } finally {
    await browser.close();
  }

  console.log('Done generating evidence screenshots.');
}

generateEvidence().catch(err => {
  console.error(err);
  process.exit(1);
});
