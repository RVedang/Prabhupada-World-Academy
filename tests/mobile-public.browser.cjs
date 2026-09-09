/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS Node browser harness. */
// Production-browser layout checks. No real authentication or external writes.
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const origin = process.env.DASHBOARD_TEST_ORIGIN || 'http://127.0.0.1:3122';
const viewports = [[320,568],[360,800],[375,812],[390,844],[393,873],[412,915],[430,932],[768,1024],[820,1180],[1280,720],[1440,900],[1920,1080],[844,390]];
async function main() {
 const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext({serviceWorkers:'block',isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{localStorage.setItem('folk_install_dismissed','1');window.__uiPerf={longTasks:[],cls:0};new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__uiPerf.longTasks.push(e.duration))).observe({type:'longtask',buffered:true});new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.__uiPerf.cls+=e.value;})).observe({type:'layout-shift',buffered:true});});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const path of ['/','/pw','/login','/signup','/guide-login']) {
   await page.goto(origin+path);
   await expect(page.locator('button').first()).toBeVisible();
   for(const [width,height] of viewports) {
    await page.setViewportSize({width,height});
    const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    console.log(JSON.stringify({path,viewportWidth:width,height,...layout}));
    assert.ok(layout.width<=width+2&&layout.scrollWidth<=width+2,`${path} overflows at ${width}`);
   }
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:390,height:844});
  const cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:90000});
  await page.goto(origin+'/login');
  await expect(page.getByRole('button',{name:/Google/}).first()).toBeVisible();
  await page.waitForTimeout(350);
  console.log(JSON.stringify({performance:'login, 4x CPU, 150ms latency, 1.6Mbps download',...await page.evaluate(()=>({...window.__uiPerf,scripts:performance.getEntriesByType('resource').filter(r=>r.initiatorType==='script').map(r=>({path:new URL(r.name).pathname,bytes:r.encodedBodySize})),paint:performance.getEntriesByType('paint').map(e=>({name:e.name,start:e.startTime}))}))}));
  assert.deepEqual(errors,[]);
  await context.close();
 } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
