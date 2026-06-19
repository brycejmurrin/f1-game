import { chromium } from 'playwright';

const TRACKS = ['abudhabi', 'silverstone', 'shanghai'];
const OUT = '/tmp/track_survey';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });

for (const id of TRACKS) {
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle' });
  const ok = await page.evaluate(async (tid) => {
    try {
      window.__apex.race(tid);
      await new Promise(r => setTimeout(r, 2000));
      return window.__apex.info().state;
    } catch(e) { return 'error:' + e.message; }
  }, id);
  if (!String(ok).startsWith('race') && ok !== 'count') { console.log(`SKIP ${id} state=${ok}`); continue; }
  await page.evaluate(() => window.__apex.view({ mode: 'aerial', altitude: 500, fov: 70 }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${id}_aerial2.png` });
  await page.evaluate(() => window.__apex.view({ mode: 'trackside', s: 0.5, side: -1, dist: 20, height: 6 }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${id}_mid2.png` });
  console.log(`${id}: OK`);
}
await browser.close();
