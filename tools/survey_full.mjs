import { chromium } from 'playwright';
import fs from 'fs';

const TRACKS = [
  'redbull', 'spa', 'silverstone',
  'suzuka', 'monza', 'interlagos',
  'monaco', 'singapore', 'jeddah', 'vegas', 'baku',
  'bahrain', 'abudhabi', 'qatar',
  'mexico', 'cota', 'montreal', 'zandvoort', 'imola', 'albert_park',
  'miami', 'madrid', 'hungaroring', 'shanghai',
];

const OUT = '/tmp/track_survey2';
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

  const ok = await page.evaluate(async (tid) => {
    try {
      window.__apex.race(tid);
      await new Promise(r => setTimeout(r, 2500));
      return window.__apex.info().state;
    } catch(e) { return 'error:' + e.message; }
  }, id);

  if (!String(ok).startsWith('race') && ok !== 'count') {
    console.log(`  ${id}: state=${ok} — SKIP`);
    continue;
  }

  // aerial — whole track
  await page.evaluate(() => window.__apex.view({ mode: 'aerial', altitude: 500, fov: 70 }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${id}_aerial.png` });

  // start/finish straight — left side
  await page.evaluate(() => window.__apex.view({ s: 0.02, side: -1, dist: 20, height: 6 }));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${id}_sf_L.png` });

  // start/finish straight — right side
  await page.evaluate(() => window.__apex.view({ s: 0.02, side: 1, dist: 20, height: 6 }));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${id}_sf_R.png` });

  // mid lap (s=0.5) — left side
  await page.evaluate(() => window.__apex.view({ s: 0.5, side: -1, dist: 22, height: 7 }));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${id}_mid_L.png` });

  // mid lap (s=0.5) — right side
  await page.evaluate(() => window.__apex.view({ s: 0.5, side: 1, dist: 22, height: 7 }));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${id}_mid_R.png` });

  // quarter lap (s=0.25)
  await page.evaluate(() => window.__apex.view({ s: 0.25, side: 1, dist: 22, height: 7 }));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${id}_q1.png` });

  // three-quarter lap (s=0.75)
  await page.evaluate(() => window.__apex.view({ s: 0.75, side: -1, dist: 22, height: 7 }));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${id}_q3.png` });

  // sky shot — horizon and atmosphere
  await page.evaluate(() => window.__apex.sky(0.15));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${id}_sky.png` });

  console.log(`  ${id}: OK`);
}

await browser.close();
console.log(`\nDone — screenshots in ${OUT}`);
