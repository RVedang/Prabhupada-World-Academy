const { chromium } = require('@playwright/test');

const QUICK_LOGINS = [
  { label: 'PW Super Admin', email: 'hrvd@hkmmumbai.org', expectedRoute: '/pw-admin/dashboard' },
  { label: 'FOLK Super Admin', email: 'gaurmandal@folk.org', expectedRoute: '/folk-admin/dashboard' },
  { label: 'PW Admin', email: 'admin@prabhupadaworld.org', expectedRoute: '/pw-admin/dashboard' },
  { label: 'FOLK Admin', email: 'folkadmin@folk.org', expectedRoute: '/folk-admin/dashboard' },
  { label: 'BV Supervisor', email: 'bvsupervisor@gmail.com', expectedRoute: '/bv-supervisor/dashboard' },
  { label: 'Facilitator (RGF)', email: 'rgf@gmail.com', expectedRoute: '/bvsl/dashboard' },
  { label: 'Sub-Facilitator (RGSF)', email: 'rgsf@gmail.com', expectedRoute: '/bv-supervisor/dashboard' },
  { label: 'Sadhana Mentor', email: 'sadhanamentor@gmail.com', expectedRoute: '/mentor/dashboard' },
  { label: 'Devotee / User', email: 'devotee@gmail.com', expectedRoute: '/user/dashboard' },
];

async function run() {
  console.log('🚀 Inspecting 1-Click Logins on /login...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:3000/login');
  await page.waitForTimeout(1500);

  const buttons = await page.locator('button').allInnerTexts();
  console.log('All Buttons found on /login:', buttons);

  let successCount = 0;
  for (const item of QUICK_LOGINS) {
    const matched = buttons.find(b => b.toLowerCase().includes(item.email.toLowerCase()));
    if (matched) {
      console.log(`✅ Quick Login Button for ${item.label} (${item.email}) is present!`);
      successCount++;
    } else {
      console.log(`❌ Quick Login Button for ${item.label} (${item.email}) missing`);
    }
  }

  await browser.close();
  console.log(`\n🎉 Verification Complete: ${successCount}/${QUICK_LOGINS.length} buttons verified!`);
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
