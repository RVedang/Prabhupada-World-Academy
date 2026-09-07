// Run against the locally built app. API traffic is mocked; no live writes.
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });

(async () => {
  const origin = process.env.DASHBOARD_TEST_ORIGIN || 'http://127.0.0.1:3107';
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const today = new Date();
    const month = today.toISOString().slice(0, 7);
    const oldMonthDate = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    const oldMonth = `${oldMonthDate.getFullYear()}-${String(oldMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const profile = { id: 'admin-doc', userId: 'admin-doc', email: 'admin@example.invalid', fullName: 'PW Admin', role: 'SUPER_ADMIN', status: 'Active', segment: 'PW', isBvSuperAdmin: true };
    let failAttendance = false;
    const requests = [];
    await context.addInitScript(({ apiKey }) => {
      const token = `${btoa('{}')}.${btoa(JSON.stringify({ sub: 'admin-doc', exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
      localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
        uid: 'admin-doc', email: 'admin@example.invalid', emailVerified: true, isAnonymous: false,
        providerData: [], apiKey, appName: '[DEFAULT]',
        stsTokenManager: { refreshToken: 'test-only', accessToken: token, expirationTime: Date.now() + 3600000 },
      }));
    }, { apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'identitytoolkit.googleapis.com' && url.pathname.endsWith('accounts:lookup')) {
        return route.fulfill({ json: { users: [{ localId: profile.id, email: profile.email, emailVerified: true }] } });
      }
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const endpoint = url.pathname.split('/').pop();
      let response = {};
      if (endpoint === 'getUserProfile') response = { user: profile };
      if (endpoint === 'getUserDetailForGuide') response = {
        user: { dbId: 'registered-member-doc', userId: 'USER-123', fullName: 'Calendar Test Member', email: 'member@example.invalid', segment: 'PW', status: 'Active', ashrayLevel: 'Jigyasa' },
        metrics: {}, recentEntries: [],
      };
      if (endpoint === 'getBvAttendance') {
        requests.push(route.request().postDataJSON());
        if (failAttendance) return route.fulfill({ status: 503, json: { message: 'Attendance unavailable' } });
        response = { userHistory: [
          { attendanceDate: `${month}-01`, present: true, status: 'P' },
          { attendanceDate: `${oldMonth}-01`, present: true, status: 'P' },
          { attendanceDate: `${oldMonth}-02`, present: false, status: 'A' },
        ], userTotalPointsThisWeek: 1, leaderboard: [] };
      }
      if (endpoint === 'getAshrayUpgradePath') response = { practiceGroups: [] };
      if (endpoint === 'getAshrayChecklist') response = { checkedItems: [] };
      if (endpoint === 'getUserCrmData') response = null;
      if (endpoint === 'getUserProgressStats') response = { entries: [], fieldTrends: [] };
      if (endpoint === 'getPwNotificationConfig') response = { enabled: false, times: [] };
      return route.fulfill({ json: response });
    });
    await page.goto(`${origin}/guide/users/USER-123`);
    const attendance = page.locator('div').filter({ has: page.locator('p', { hasText: /^Bhakti Vriksha Attendance$/ }) }).filter({ has: page.getByText('Monthly View', { exact: true }) }).last();
    await expect(page.getByRole('button', { name: `${month}-01: Present`, exact: true })).toHaveClass(/bg-green-500/);
    assert.equal(requests[0].userId, 'registered-member-doc');
    assert.equal(requests[0].historyOnly, true);
    assert.ok(requests[0].sinceDate < oldMonth, 'profile calendar must request older history');
    for (let i = 0; i < 5; i++) await attendance.getByRole('button', { name: 'Previous month', exact: true }).click();
    const present = page.getByRole('button', { name: `${oldMonth}-01: Present`, exact: true });
    const absent = page.getByRole('button', { name: `${oldMonth}-02: Absent`, exact: true });
    await expect(present).toHaveClass(/bg-green-500/);
    await expect(absent).toHaveClass(/bg-red-400/);
    await expect(page.getByRole('button', { name: `${oldMonth}-03: Not marked`, exact: true })).toHaveClass(/bg-muted/);
    const colors = await Promise.all([present, absent].map(cell => cell.evaluate(el => getComputedStyle(el).backgroundColor)));
    assert.notEqual(colors[0], colors[1]);
    colors.forEach(color => assert.ok(color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent'));
    await attendance.screenshot({ path: '/tmp/bv-profile-calendar-colors.png' });
    failAttendance = true;
    await page.reload();
    await expect(page.getByRole('alert').filter({ hasText: 'Unable to load Bhakti Vriksha attendance.' })).toBeVisible();
    failAttendance = false;
    await page.getByRole('button', { name: 'Retry attendance', exact: true }).click();
    await expect(page.getByRole('button', { name: `${month}-01: Present`, exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    console.log('PASS: canonical profile, current/older month colors, rendered CSS, visible error and retry', colors);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
