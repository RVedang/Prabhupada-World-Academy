/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS Node browser harness. */
// Run against a locally built app: npm run start -- --port 3107
// All API traffic is mocked and external requests are blocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const viewports = [[320,568],[360,800],[375,812],[390,844],[393,873],[412,915],[430,932],[768,1024],[820,1180],[1280,720],[1440,900],[1920,1080],[844,390]];
const { chromium, expect } = require('@playwright/test');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });

async function auditLayout(page,record) {
  const layout=await page.evaluate(()=>({
    width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    dashboardOpacity:document.querySelector('.dashboard-main')
      ? Number(getComputedStyle(document.querySelector('.dashboard-main')).opacity) : null,
    activeTabOpacity:document.querySelector('[data-active-tab]')
      ? Number(getComputedStyle(document.querySelector('[data-active-tab]')).opacity) : null,
  }));
  console.log(JSON.stringify({...record,...layout,viewportWidth:record.width}));
  assert.ok(layout.width<=record.width+2 && layout.scrollWidth<=record.width+2,`${record.segment} ${record.screen}: overflow at ${record.width}: ${layout.scrollWidth}`);
  if (layout.dashboardOpacity != null) assert.equal(layout.dashboardOpacity,1,`${record.segment} ${record.screen}: dashboard content must not be faded`);
  if (layout.activeTabOpacity != null) assert.equal(layout.activeTabOpacity,1,`${record.segment} ${record.screen}: active tab content must not be faded`);
}
async function main() {
  fs.mkdirSync('test-results/mobile',{recursive:true});
  const origin = process.env.DASHBOARD_TEST_ORIGIN || 'http://127.0.0.1:3121';
  const browser = await chromium.launch({ headless: true });
  try {
    for (const segment of (process.env.MOBILE_TEST_SEGMENT ? [process.env.MOBILE_TEST_SEGMENT] : ['PW', 'FOLK'])) {
      const context = await browser.newContext({ serviceWorkers: 'block', viewport:{width:390,height:844},isMobile:true,hasTouch:true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const profile = { id: 'test-member', userId: 'test-member', fullName: `${segment} Test Member`,
        email: 'dashboard@example.invalid', role: 'User', status: 'Active', segment, ashrayLevel: 'Sevak',
        residencyApproved: true, residencyGuideVerified: true, selectedFolkResidency: 'test-residency', residencyName: 'Test Residency' };
      const canonical = segment === 'PW' ? '/user/pw-dashboard' : '/user/folk-dashboard';
      const opposite = segment === 'PW' ? '/user/folk-dashboard' : '/user/pw-dashboard';
      let saved = false;
      let registering = false;
      let dashboardReads = 0;
      const today = new Date().toISOString().slice(0, 10);
      // Seed a test-only Firebase session so the actual endpoint client can
      // obtain a token. No test token or API call is sent to a real server.
      await context.addInitScript(({ apiKey }) => {
        localStorage.setItem('folk_install_dismissed','1');
        localStorage.setItem('folk_login_ts',String(Date.now()));
        const token = `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'test-member', exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
          uid: 'test-member', email: 'dashboard@example.invalid', emailVerified: true, isAnonymous: false,
          providerData: [], apiKey, appName: '[DEFAULT]',
          stsTokenManager: { refreshToken: 'test-only', accessToken: token, expirationTime: Date.now() + 3600000 },
        }));
      }, { apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'identitytoolkit.googleapis.com' && url.pathname.endsWith('accounts:lookup')) {
          return route.fulfill({ json: { users: [{ localId: 'test-member', email: profile.email, emailVerified: true }] } });
        }
        if (url.hostname === 'images.fillout.com') return route.fulfill({contentType:'image/png',body:fs.readFileSync('public/logo.png')});
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const endpoint = url.pathname.split('/').pop();
        let response = {};
        if (endpoint === 'getUserProfile') response = { user: registering ? null : profile };
        if (endpoint === 'getUserDashboardData') {
          dashboardReads++;
          response = { metrics: { todaySubmitted: saved, todayPercent: saved ? 75 : null, entriesThisWeek: saved ? 1 : 0 },
            recentEntries: saved ? [{ entryId: 'saved-entry', entryDate: today, scorePercent: 75, submittedAt: new Date().toISOString() }] : [] };
        }
        if (endpoint === 'getUserProgressStats') response = { isPw: segment === 'PW', entries: [], fieldTrends: [], insightFields: [] };
        if (endpoint === 'getSadhanaLeaderboard') response = { leaderboard: [], currentUserAshrayLevel: 'Sevak' };
        if (endpoint === 'getUserBvStatus') response = { myGroup:{groupId:'test-group',groupName:'Test Reading Group',bvslName:'Test RGF',memberCount:12}, streak:3,attendanceRate:80 };
        if (endpoint === 'getBvAttendance') response = {userHistory:[{attendanceDate:today,status:'P'}],leaderboard:[]};
        if (endpoint === 'getMyBvQuizSubmissions') response = {submissions:[],pendingQuizzes:[],stats:{totalTaken:0,avgPercent:0}};
        if (endpoint === 'getGuides') response = {guides:[]};
        if (endpoint === 'getAllResidencies') response = [];
        if (endpoint === 'checkGuideEmail') response = {isGuide:false};
        if (endpoint === 'getMeetings') response = { meetings: [] };
        if (endpoint === 'getPwNotificationConfig') response = { enabled: false, times: [], title: '', body: '' };
        if (endpoint === 'getCleanlinessForSadhana') response = { enabled: false };
        if (endpoint === 'getSadhanaFormData') response = { exists: false, isResident: segment === 'FOLK', isOfficialResident: segment === 'FOLK',
          templateMode: segment === 'FOLK' ? 'RESIDENT_TEMPLATE' : 'NON_RESIDENT_TEMPLATE',
          fields: [{ fieldId: 'test-field', fieldKey: segment === 'FOLK' ? 'rounds' : 'chanting', fieldLabel: 'Chanting Rounds', fieldType: 'number',
            isRequired: false, contributesToScore: false, maxPoints: 0, displayOrder: 1, options: [], group: 'Daily' }] };
        if (endpoint === 'submitSadhana') {
          saved = true;
          response = { success: true, entryId: 'saved-entry', isUpdate: false, totalScore: 12, maxScore: 16, scorePercent: 75 };
        }
        return route.fulfill({ json: response });
      });

      await page.goto(`${origin}/user/dashboard?source=bookmark#leaderboard`);
      await expect(page).toHaveURL(`${origin}${canonical}?source=bookmark#leaderboard`);
      await expect(page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Leaderboard'})).toHaveAttribute('aria-current','page');
      await page.goto(`${origin}${opposite}#sadhana`);
      await expect(page).toHaveURL(`${origin}${canonical}#sadhana`);
      for (const [width,height] of (process.env.MOBILE_TEST_WIDTH ? viewports.filter(v=>v[0]===Number(process.env.MOBILE_TEST_WIDTH)) : viewports)) {
        await page.setViewportSize({width,height});
        for (const [tab,marker] of [['Sadhana','Fill / Edit Sadhana Form'],['Leaderboard','Daily Sadhana Leaderboard'],['Bhakti Vriksha','Test Reading Group']]) {
          if(width<768) await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:tab,exact:true}).click();
          else await page.getByRole('tab',{name:tab,exact:true}).click();
          await expect(page.getByText(marker,{exact:true}).filter({visible:true}).first()).toBeVisible({timeout:15000});
          await auditLayout(page,{segment,screen:tab,width,height});
          if(width===390 && segment==='PW') { await page.waitForTimeout(220); await page.screenshot({path:`test-results/mobile/member-${tab.replaceAll(' ','-')}.png`}); }
          if(tab==='Bhakti Vriksha') {
            await page.getByRole('button',{name:'Leave Group',exact:true}).click();
            await expect(page.getByRole('alertdialog')).toBeVisible();
            await page.getByRole('alertdialog').getByRole('button',{name:'Cancel',exact:true}).click();
          }
        }
        if(width<768) await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Sadhana',exact:true}).click();
        else await page.getByRole('tab',{name:'Sadhana',exact:true}).click();
        await page.getByRole('button',{name:'Fill / Edit Sadhana Form',exact:true}).click();
        await expect(page.locator('#sadhana-acknowledgement')).toBeVisible();
        await page.getByRole('textbox',{name:'Chanting Rounds',exact:true}).fill('16');
        await auditLayout(page,{segment,screen:'Sadhana form',width,height});
        await page.getByRole('button',{name:/Back/}).first().click();
        await expect(page).toHaveURL(`${origin}${canonical}#sadhana`);
      }
      await page.setViewportSize({width:390,height:844});
      if(segment==='FOLK') {
        await page.getByRole('button',{name:'More',exact:true}).click();
        await expect(page.getByRole('dialog').getByRole('button',{name:'Cleanliness',exact:true})).toBeVisible();
        await page.keyboard.press('Escape');
      } else await expect(page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:'Profile',exact:true})).toBeVisible();
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.getByRole('button',{name:'Open account menu'}).click();
      await expect(page.getByRole('dialog').getByRole('button',{name:'My Sadhana',exact:true})).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByRole('button',{name:'Fill / Edit Sadhana Form',exact:true}).click();
      await page.setViewportSize({width:390,height:420});
      const input=page.getByRole('textbox',{name:'Chanting Rounds',exact:true});
      await input.fill('16');
      await input.scrollIntoViewIfNeeded();
      await expect(input).toBeInViewport();
      assert.equal(await input.evaluate(e=>getComputedStyle(e).fontSize),'16px');
      await page.locator('label').filter({hasText:'I solemnly declare'}).click();
      const readsBeforeSave=dashboardReads;
      await page.getByRole('button',{name:'Submit Sadhana',exact:true}).click();
      await expect(page).toHaveURL(`${origin}${canonical}#sadhana`);
      await expect(page.getByRole('button',{name:'Edit Entry',exact:true})).toBeVisible();
      assert.ok(saved && dashboardReads>readsBeforeSave,'save must refresh the dashboard');
      assert.deepEqual(errors,[]);
      console.log(JSON.stringify({segment,flows:'redirects, primary navigation, residency menu, BV cancellation, numeric input, reduced motion, short viewport, save and refresh passed'}));
      registering = true;
      await page.evaluate(segment=>{localStorage.removeItem('auth_profile_email');localStorage.setItem('pwa_is_pw_flow',String(segment==='PW'));},segment);
      await page.goto(origin+'/register');
      await expect(page.getByRole('heading',{name:'Create Your Account'})).toBeVisible();
      for(const [width,height] of (process.env.MOBILE_TEST_WIDTH ? viewports.filter(v=>v[0]===Number(process.env.MOBILE_TEST_WIDTH)) : viewports)) {
        await page.setViewportSize({width,height});
        await page.getByLabel('Full Name').fill('Test Registration');
        await page.locator('#phone').fill('9999999999');
        await auditLayout(page,{segment,screen:'Registration',width,height});
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
