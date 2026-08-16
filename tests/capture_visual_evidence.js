import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = '/home/vedanarayana_das/.gemini/antigravity-ide/brain/3f83ba83-9cad-419d-bad2-83601f86b2be';

async function captureEvidence() {
  console.log('Starting visual Playwright evidence capture on localhost:5173...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const baseUrl = 'http://localhost:5173';

  // 1. Devotee Form & Dashboard
  console.log('1. Devotee Login & Dashboard...');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const devoteeBtn = page.locator('button:has-text("Regular Devotee"), button:has-text("Devotee")').first();
  if (await devoteeBtn.isVisible()) {
    await devoteeBtn.click();
    await page.waitForTimeout(1500);
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'evidence_01_devotee_dashboard.png') });
  console.log('Saved evidence_01_devotee_dashboard.png');

  // 2. PW Super Admin Dashboard
  console.log('2. PW Super Admin Dashboard...');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const superAdminBtn = page.locator('button:has-text("PW Super Admin"), button:has-text("Hiranyavarna")').first();
  if (await superAdminBtn.isVisible()) {
    await superAdminBtn.click();
    await page.waitForTimeout(1500);
  }

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'evidence_02_superadmin_dashboard.png') });
  console.log('Saved evidence_02_superadmin_dashboard.png');

  // 3. Admin Dashboard
  console.log('3. Admin Dashboard...');
  await page.goto(`${baseUrl}/admin/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'evidence_03_admin_dashboard.png') });
  console.log('Saved evidence_03_admin_dashboard.png');

  // 4. Supervisor Dashboard
  console.log('4. Supervisor Dashboard...');
  await page.goto(`${baseUrl}/bv-supervisor/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'evidence_04_supervisor_dashboard.png') });
  console.log('Saved evidence_04_supervisor_dashboard.png');

  // 5. RGF Dashboard
  console.log('5. RGF Dashboard...');
  await page.goto(`${baseUrl}/bvsl/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'evidence_05_rgf_dashboard.png') });
  console.log('Saved evidence_05_rgf_dashboard.png');

  // 6. RGSF Dashboard
  console.log('6. RGSF Dashboard...');
  await page.goto(`${baseUrl}/rgsf/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'evidence_06_rgsf_dashboard.png') });
  console.log('Saved evidence_06_rgsf_dashboard.png');

  // 7. Devotee Dashboard (Role Removed)
  console.log('7. Role Removed (Standard Devotee Dashboard)...');
  await page.goto(`${baseUrl}/user/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'evidence_07_role_removed_devotee.png') });
  console.log('Saved evidence_07_role_removed_devotee.png');

  await browser.close();
  console.log('Visual evidence capture finished successfully!');
}

captureEvidence().catch(console.error);
