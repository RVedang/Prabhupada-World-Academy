/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS Node browser harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium, expect } = require('@playwright/test');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const origin = process.env.DASHBOARD_TEST_ORIGIN || 'http://127.0.0.1:3120';
const audit = process.env.AUDIT_ONLY === '1';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const viewports = audit ? [[320,568],[360,800],[375,812],[390,844],[412,915],[430,932]] : [[320,568],[360,800],[375,812],[390,844],[393,873],[412,915],[430,932],[768,1024],[820,1180],[1280,720],[1440,900],[1920,1080],[844,390]];
async function assertFullDashboardOpacity(page, label) {
 const opacity = await page.evaluate(() => ({
  main: Number(getComputedStyle(document.querySelector('.dashboard-main')).opacity),
  activeTab: Number(getComputedStyle(document.querySelector('[data-active-tab]')).opacity),
 }));
 assert.deepEqual(opacity, {main:1,activeTab:1}, `${label}: dashboard content must not be faded`);
}
async function main() {
 fs.mkdirSync('test-results/mobile',{recursive:true});
 const browser = await chromium.launch({headless:true});
 try {
 for (const role of (process.env.MOBILE_TEST_ROLE ? [process.env.MOBILE_TEST_ROLE] : ['PW admin','PW super admin','FOLK guide','FOLK super guide'])) {
   const segment = role.startsWith('PW') ? 'PW' : 'FOLK';
   const superAdmin = role.includes('super');
   const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
   const page = await context.newPage();
   const errors = [], reads = [];
   page.on('pageerror', error => errors.push(error.message));
   const profile = { id: 'test-admin', userId: 'test-admin', fullName: 'Test Administrator', email: 'admin@example.invalid',
    role: segment === 'PW' ? (superAdmin ? 'SUPER_ADMIN' : 'User') : (superAdmin ? 'SUPER_GUIDE' : 'Guide'),
    status: 'Active', segment, isBvAdmin: segment === 'PW', isBvSuperAdmin: segment === 'PW' && superAdmin };
   const members = Array.from({length: 120}, (_, i) => ({ id: 'member-'+i, userId: 'member-'+i, fullName: 'Member '+String(i).padStart(3,'0'),
    email: 'member'+i+'@example.invalid', role: i < 2 ? 'RGF' : 'USER', roles: i < 2 ? ['USER','RGF'] : ['USER'], status: 'ACTIVE', segment,
    isPrabhupadaWorldUser: segment === 'PW', ashrayLevel: 'Sevak', selectedGuideId: 'test-admin', guideId: 'test-admin', guide: 'test-admin', selectedGuideName: 'Test Guide',
    residencyName: '', latestScore: 80, submittedToday: true, bvGroupName: 'Test Group' }));
   const group = { id: 'test-group', groupId: 'test-group', groupDbId: 'test-group', groupName: 'Test Group', segment,
    isActive: true, facilitatorIds: ['test-admin'], bvslName: 'Test RGF', memberCount: 120, totalSessions: 5, bvsls: [], meetingTime: '7 PM' };
   await context.addInitScript(({ apiKey }) => {
    const token = `${btoa('{}')}.${btoa(JSON.stringify({sub:'test-admin',exp:Math.floor(Date.now()/1000)+3600}))}.test`;
    localStorage.setItem('folk_login_ts', String(Date.now()));
    localStorage.setItem('folk_install_dismissed', '1');
    localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({ uid:'test-admin',email:'admin@example.invalid',emailVerified:true,isAnonymous:false,providerData:[],apiKey,appName:'[DEFAULT]',stsTokenManager:{refreshToken:'test-only',accessToken:token,expirationTime:Date.now()+3600000} }));
   }, { apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY });
   await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'identitytoolkit.googleapis.com' && url.pathname.endsWith('accounts:lookup')) return route.fulfill({ json:{ users:[{localId:'test-admin',email:profile.email,emailVerified:true}] } });
    if (url.hostname === 'images.fillout.com') return route.fulfill({contentType:'image/png',body:fs.readFileSync('public/logo.png')});
        if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const name = url.pathname.split('/').pop();
    const input = route.request().postDataJSON() || {};
    reads.push({name,input,at:Date.now()});
    let response = {};
    if (name === 'getUserProfile') response = { user:profile };
    if (name === 'getCurrentGuide') response = { guide:{ id:'test-admin',guideId:'test-admin',fullName:'Test Guide',folkResidencies:[] } };
    if (name === 'getGuides') response = { guides:[{id:'test-admin',guideId:'test-admin',name:'Test Guide',fullName:'Test Guide',email:profile.email}] };
    if (name === 'getAllResidencies') response = { residencies:[] };
    if (name === 'getActiveSadhanaMentors') response = [];
    if (name === 'getGuideUsers') response = { users:members };
    if (name === 'getBvslGroups' || name === 'getAllBvGroupsAdmin') response = { groups:[group],bvsls:[],pendingRequestCount:0,error:null };
    if (name === 'getGuideDetailedReport') {
     response = { users: members.slice(0,12).map(u=>({...u,fullName:`Sadhana ${input.date} ${u.fullName}`,submitted:true,isResident:segment==='FOLK',fieldScores:{},fieldRawValues:{},totalScore:16,scorePercent:80,currentStreak:3})), fieldDefs:[],availableResidencies:[],availableGuides:[],summary:{} };
    }
    if (name === 'getBvSessionMatrix') response = { groups:[{id:'test-group',name:'Test Group'}],members:members.slice(0,6),allDates:['2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06','2026-09-07'],sessionDates:['2026-09-01','2026-09-03'],attendance:{'member-0':{'2026-09-01':true,'2026-09-03':false}},quizScores:{} };
    if (name === 'getSuperGuideBvStats') response = {guides:[],summary:{totalUsers:120,markedCount:120,presentCount:100,absentCount:20,notMarkedCount:0,serviceFullCount:0,avgPoints:2},guideBreakdown:[],leaderboard:[]};
    if (name === 'getMeetings') response = { meetings:[{id:'test-meeting',title:'Test Meeting',type:'FACILITATOR',department:segment,status:'SCHEDULED',scheduledAt:'2026-12-01T14:00:00+05:30',durationMinutes:60,inviteeUserIds:['member-0','member-1'],invitees:members.slice(0,2),createdByName:'Test Administrator'}] };
    if (['createMeeting','updateMeeting','saveMom'].includes(name)) response = {success:true};
    if (name === 'getMoms') response = { moms:[] };
    if (name === 'getMissingSadhanaReport') response = { users:[],dates:['2026-09-01'],matrix:{},guides:[],stats:{totalUsers:0,totalDays:7,totalMissing:0,totalLate:0,completionRate:100} };
    if (name === 'getPwNotificationConfig') response = {enabled:false,times:[]};
    if (/getPending|getCleanlinessReviews|getResidencyTransferRequests/.test(name)) response = [];
    if (name === 'getGuideRequests') response = { guideTransfers:[],ashrayUpgrades:[] };
    await delay(60);
    return route.fulfill({json:response});
   });
   const root = segment === 'PW' ? '/pw-admin/dashboard' : '/folk-guide/dashboard';

 await page.goto(origin+root);
 await expect(page.getByText(/Sadhana .*Member 000/).first()).toBeVisible({timeout:20000});
 for (const [width,height] of (process.env.MOBILE_TEST_WIDTH ? viewports.filter(v=>v[0]===Number(process.env.MOBILE_TEST_WIDTH)) : viewports)) {
  await page.setViewportSize({width,height});
  await delay(180);
  for (const [tab,label,marker] of [['sadhana','Sadhana Report',/Sadhana .*Member 000/],['bv','Bhakti Vriksha Report',segment==='FOLK' && superAdmin?'Full Service':'Total Members'],['users','Members / Users','Member 000'],['bhakti-vriksha','Bhakti Vriksha','Test Group'],...(segment==='PW'?[['meetings','Meetings & MoM','Test Meeting']]:[]),['missing-sadhana','Missing Sadhana','Completion Rate']]) {
   if (width>=768) await page.getByRole('button',{name:label,exact:true}).filter({visible:true}).first().click();
   else if (audit) {
    await page.getByText('Navigate Dashboard',{exact:true}).locator('..').getByRole('combobox').click();
    await page.getByRole('option',{name:label,exact:true}).click();
   } else {
    await page.getByRole('button',{name:'Open dashboard navigation'}).click();
    await page.getByRole('dialog').getByRole('button',{name:label,exact:true}).click();
   }
   await expect(page.getByText(marker,{exact: typeof marker==='string'}).filter({visible:true}).first()).toBeVisible({timeout:15000}).catch(async error => {
    console.error(JSON.stringify(await page.getByText(marker,{exact:typeof marker==='string'}).evaluateAll(nodes=>nodes.map(e=>{const a=[];for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p),r=p.getBoundingClientRect();a.push({tag:p.tagName,cls:p.className,display:s.display,visibility:s.visibility,width:r.width,height:r.height});}return a;}))));
    await page.screenshot({path:'test-results/mobile/layout-failure.png'}); throw error;
   });
   await assertFullDashboardOpacity(page, `${role} ${tab} ${width}`);
   const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0 && r.right>innerWidth+2 && !e.closest('.overflow-x-auto,[data-slot=table-container]')}).slice(0,5).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent?.slice(0,60)}))}));
   console.log(JSON.stringify({role,tab,viewportWidth:width,height,...layout}));
   if (!audit) assert.ok(layout.scrollWidth<=width+2 && layout.width<=width+2,`${role} ${tab} ${width}: page overflow ${layout.scrollWidth}`);
   if(width===390 && role==='PW admin' && ['sadhana','users','meetings'].includes(tab)) { await delay(240); await page.screenshot({path:`test-results/mobile/${audit?'before':'after'}-${tab}.png`,fullPage:false}); }
  }
 }

 if(!audit) {
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Open dashboard navigation'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Members / Users',exact:true}).click();
  const search=page.getByPlaceholder('Search by name...').filter({visible:true});
  await search.fill('Member 000');
  await expect(page.getByRole('button',{name:'Member 000',exact:true}).filter({visible:true})).toBeVisible();
  await page.getByRole('button',{name:'Details for Member 000',exact:true}).click();
  await expect(page.locator('tr[data-expanded=true]')).toHaveCount(1);
  await search.fill('');
  await page.getByRole('button',{name:'Next',exact:true}).filter({visible:true}).first().click();
  await expect(page.getByText('Member 010',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Previous',exact:true}).filter({visible:true}).first().click();
  await page.getByRole('button',{name:'Open dashboard navigation'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Sadhana Report',exact:true}).click();
  await page.getByRole('button',{name:'Today',exact:true}).filter({visible:true}).click();
  await expect(page.getByText(`Sadhana ${new Date().toISOString().slice(0,10)} Member 000`,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/^Filters/}).filter({visible:true}).click();
  const filterDialog=page.getByRole('dialog');
  await expect(filterDialog).toBeVisible();
  await filterDialog.getByRole('combobox').first().click();
  await page.getByRole('option',{name:'Weekly',exact:true}).click();
  await filterDialog.getByRole('button',{name:'Show results'}).click();
  await expect(filterDialog).toHaveCount(0);
  if(segment==='PW') {
   await page.getByRole('button',{name:'Open dashboard navigation'}).click();
   await page.getByRole('dialog').getByRole('button',{name:'Meetings & MoM',exact:true}).click();
   await page.getByRole('button',{name:'Schedule Meeting',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Meeting details'});
   await expect(dialog).toBeVisible().catch(async error=>{console.error(await page.locator('body').ariaSnapshot()); console.error(await page.locator('[role=dialog]').evaluateAll(ns=>ns.map(n=>({label:n.getAttribute('aria-label'),hidden:n.closest('[aria-hidden=true]')?.outerHTML.slice(0,200)})))); await page.screenshot({path:'test-results/mobile/meeting-failure.png'}); throw error;});
   await dialog.getByRole('button',{name:'Other',exact:true}).click();
   await dialog.getByPlaceholder('e.g., Weekly Team Alignment').fill('Mobile meeting');
   await dialog.getByRole('button',{name:/RGFs/}).click();
   await page.setViewportSize({width:390,height:420});
   await dialog.getByPlaceholder('https://meet.google.com/xyz').fill('https://meet.google.com/test');
   await dialog.getByPlaceholder('https://meet.google.com/xyz').scrollIntoViewIfNeeded();
   await expect(dialog.getByPlaceholder('https://meet.google.com/xyz')).toBeInViewport();
   await dialog.getByRole('button',{name:'Schedule Meeting',exact:true}).click();
   await expect(dialog).toHaveCount(0);
   const sent=reads.findLast(r=>r.name==='createMeeting');
   assert.equal(sent.input.title,'Mobile meeting');
   assert.deepEqual(sent.input.additionalInviteeIds.slice().sort(),['member-0','member-1']);
   await page.setViewportSize({width:390,height:844});
   await page.getByRole('button',{name:'Record MoM',exact:true}).click();
   const mom=page.getByRole('dialog',{name:'Minutes of meeting'});
   await mom.getByRole('combobox',{name:'Proposed by',exact:true}).click();
   await expect(page.getByRole('option',{name:/Member 000$/})).toBeVisible();
   await expect(page.getByRole('option',{name:/Member 002$/})).toHaveCount(0);
   await page.getByRole('option',{name:/Member 000$/}).click();
   await mom.getByPlaceholder('Discussion details...').fill('Mobile discussion');
   await mom.getByRole('button',{name:'Save MoM Record',exact:true}).click();
   await expect(mom).toHaveCount(0);
   assert.ok(reads.some(r=>r.name==='saveMom'));
  }
  assert.deepEqual(errors,[],role+' runtime errors');
  console.log(JSON.stringify({role,flows:'navigation, member search/details/pagination, report filtering'+(segment==='PW'?', meeting save, participant picker, MoM save':''),runtimeErrors:errors.length}));
 }

 await context.close();
 }
 } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
