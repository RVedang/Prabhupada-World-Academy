const { chromium } = require('@playwright/test');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('--- STARTING ONE-TO-ONE CALL TRACKING AND TAB ROUTING E2E VERIFICATION ---');

  // Print page console messages
  page.on('console', msg => console.log('PAGE CONSOLE:', msg.text()));

  // Step 0: Login as PW Super Admin and seed/delegate users to RGF and RGSF
  console.log('Logging in as PW Super Admin...');
  await page.goto('http://127.0.0.1:3000/login');
  await page.click('button:has-text("PW Super Admin")');
  await page.waitForURL('**/pw-admin/dashboard', { timeout: 15000 });
  await page.waitForTimeout(1000);

  console.log('Programmatically delegating members to RGF and RGSF...');
  const delegationResults = await page.evaluate(async () => {
    const token = window.__firebase_id_token;
    // Delegate USER-009 (Anurag Yadav) to RGF
    const r1 = await fetch('/api/run/saveOneToOneEligibility', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        userId: '14a80c71-b925-4078-9f5a-ce774a62d832',
        eligibility: 'Delegated',
        delegateId: 'rgf@gmail.com'
      })
    }).then(r => r.json());

    // Delegate USER-010 (Aman Gupta) to RGSF
    const r2 = await fetch('/api/run/saveOneToOneEligibility', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        userId: '17640212-9e41-4d28-a4dc-e1b9368bca73',
        eligibility: 'Delegated',
        delegateId: 'rgsf@gmail.com'
      })
    }).then(r => r.json());

    return { r1, r2 };
  });
  console.log('Delegation results:', JSON.stringify(delegationResults));
  console.log('Delegation completed.');

  // Step 1: Login as RGF
  console.log('Logging in as Facilitator (RGF)...');
  await page.goto('http://127.0.0.1:3000/login');
  await page.click('button:has-text("Facilitator (RGF)")');
  
  // Wait for the login redirect to finish completely
  await page.waitForURL('**/rgf/dashboard', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Navigate directly to 1:1 Call Reports via hash route
  console.log('Navigating directly to 1:1 Call Reports tab...');
  await page.goto('http://127.0.0.1:3000/rgf/dashboard#onetone');
  await page.waitForTimeout(2500);


  try {
    // Click on the first matrix cell to log a meeting
    console.log('Opening Log 1:1 Dialog...');
    const cell = page.locator('table tbody tr td button').first();
    await cell.click({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // Fill in form details
    console.log('Filling in call details...');
    // Select Call Status 'Connected'
    await page.click('button[data-slot="select-trigger"]');
    await page.waitForTimeout(500);
    await page.click('div[role="option"]:has-text("Connected")');

    // Duration
    await page.fill('input[type="number"]', '30');

    // Notes
    await page.fill('textarea[placeholder*="Topics discussed"]', 'Test Call Notes RGF');

    // Recording Link
    await page.fill('input[type="url"]', 'https://recording-link.com/rgf');

    // Next Call Date (tentative)
    await page.fill('input[type="date"] >> nth=1', '2026-09-01');

    // Next Call Agenda
    await page.fill('textarea[placeholder*="Points to discuss"]', 'Discuss goals for September');

    // Save
    console.log('Saving meeting...');
    await page.click('button:has-text("Log Meeting")');
    await page.waitForTimeout(2000);

    // Verify Member Call Details & History section shows the saved call
    console.log('Verifying details on RGF Dashboard...');
    // Explicitly click View History to expand the logged calls history list
    await page.locator('button:has-text("View History")').first().click();
    await page.waitForTimeout(1000);

    const card = page.locator('div:has-text("Test Call Notes RGF")').first();
    const textContent = await card.innerText();
    if (textContent.includes('Test Call Notes RGF') && textContent.includes('https://recording-link.com/rgf') && textContent.includes('Connected')) {
      console.log('✅ Success: RGF call details, notes, recording link, and status saved and displayed correctly!');
    } else {
      throw new Error('RGF call details not found or incorrect on dashboard. Received: ' + textContent);
    }

    // Step 2: Login as RGSF
    console.log('Logging in as Sub-Facilitator (RGSF)...');
    await page.goto('http://127.0.0.1:3000/login');
    await page.click('button:has-text("Sub-Facilitator (RGSF)")');
    
    // Wait for login redirect to finish
    await page.waitForURL('**/rgsf/dashboard', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Navigate directly to 1:1 Calls via hash route
    console.log('Navigating directly to 1:1 Calls tab...');
    await page.goto('http://127.0.0.1:3000/rgsf/dashboard#onetone');
    await page.waitForTimeout(2500);

    // Expand Call History
    console.log('Expanding call history...');
    await page.click('button:has-text("View Call History")');
    await page.waitForTimeout(1000);

    // Check if call notes and recording links are hidden
    console.log('Verifying call notes and recording link are hidden in list view...');
    const historyText = await page.locator('.border-border\\/60').first().innerText();
    if (historyText.includes('Test Call Notes RGF') || historyText.includes('recording-link.com')) {
      throw new Error('Call notes or recording links are visible to RGSF in the list view! Received: ' + historyText);
    } else {
      console.log('✅ Success: Call notes and recording links are correctly hidden from RGSF list view!');
    }

    // Click on the logged call in history to open the read-only dialog
    console.log('Opening read-only dialog for RGSF...');
    await page.locator('.border-border\\/60').first().click();
    await page.waitForTimeout(1000);

    // Check if notes and recording links are hidden in the dialog
    const dialogText = await page.locator('div[role="dialog"]').innerText();
    if (dialogText.includes('Test Call Notes RGF') || dialogText.includes('recording-link.com')) {
      throw new Error('Call notes or recording links are visible to RGSF in the dialog! Received: ' + dialogText);
    } else {
      console.log('✅ Success: Call notes and recording links are correctly hidden from RGSF dialog!');
    }

    // Next call date and agenda should be visible
    if (dialogText.includes('Discuss goals for September') && dialogText.includes('Sep 1, 2026')) {
      console.log('✅ Success: Next call date (tentative) and agenda are correctly displayed to RGSF!');
    } else {
      throw new Error('Next call date or agenda missing or incorrect in RGSF dialog. Received: ' + dialogText);
    }

    await browser.close();
    console.log('🎉 ALL ONE-TO-ONE E2E VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (testError) {
    console.error('❌ Test failed with error:', testError.message);
    const errorScreenshotPath = '/home/vedanarayana_das/Prabhupada World Academy/tests/e2e_error.png';
    await page.screenshot({ path: errorScreenshotPath, fullPage: true });
    console.log(`Saved screenshot to ${errorScreenshotPath}`);
    const htmlDump = await page.content();
    require('fs').writeFileSync('/home/vedanarayana_das/Prabhupada World Academy/tests/e2e_error.html', htmlDump);
    console.log('Saved HTML dump to tests/e2e_error.html');
    await browser.close();
    process.exit(1);
  }
}

run().catch(err => {
  console.error('❌ Test runner outer error:', err.message);
  process.exit(1);
});
