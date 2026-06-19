import { chromium } from 'playwright';
import fs from 'fs';

const TRACKS = [
  // alpine / snow
  'redbull', 'spa', 'silverstone',
  // forested
  'suzuka', 'monza', 'interlagos',
  // street / night
  'monaco', 'singapore', 'jeddah', 'vegas', 'baku',
  // desert / gulf
  'bahrain', 'abudhabi', 'qatar',
  // others
  'mexico', 'cota', 'montreal', 'zandvoort', 'imola', 'albert_park',
  'miami', 'madrid', 'hungaroring', 'shanghai',
];

const OUT = '/tmp/track_survey';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});

const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });

for (const id of TRACKS) {
  console.log(`Loading ${id}…`);
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle' });

  // start the race on this track
  const ok = await page.evaluate(async (tid) => {
    try {
      window.__apex.race(tid);
      await new Promise(r => setTimeout(r, 2000));
      return window.__apex.info().state;
    } catch(e) { return 'error:' + e.message; }
  }, id);

  if (!String(ok).startsWith('race') && ok !== 'count') {
    console.log(`  ${id}: state=${ok} — SKIP`);
    continue;
  }

  // aerial view, whole-track
  await page.evaluate(() => {
    window.__apex.view({ mode: 'aerial', altitude: 500, fov: 70 });
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${id}_aerial.png` });

  // trackside at s=0.0 (start/finish)
  await page.evaluate(() => {
    window.__apex.view({ mode: 'trackside', s: 0.02, side: 1, dist: 18, height: 5 });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${id}_sf.png` });

  // trackside at s=0.5 (mid-lap)
  await page.evaluate(() => {
    window.__apex.view({ mode: 'trackside', s: 0.5, side: -1, dist: 20, height: 6 });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${id}_mid.png` });

  console.log(`  ${id}: OK (state=${ok})`);
}

await browser.close();
console.log(`\nDone — screenshots in ${OUT}`);
