import { chromium } from 'playwright';
import fs from 'fs';

const TRACKS = [
  'bahrain','jeddah','albert_park','imola','miami','monaco','montreal','madrid',
  'spain','spa','redbull','silverstone','hungaroring','zandvoort','monza','baku',
  'singapore','cota','mexico','interlagos','vegas','qatar','abudhabi','shanghai','suzuka'
];

const OUT = '/tmp/starts';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});
const page = await browser.newPage();
await page.setViewportSize({ width: 960, height: 540 });

for (const id of TRACKS) {
  await page.goto('http://localhost:3456/', { waitUntil: 'networkidle' });
  const ok = await page.evaluate(async (tid) => {
    try {
      window.__apex.race(tid);
      await new Promise(r => setTimeout(r, 1800));
      return window.__apex.info().state;
    } catch(e) { return 'err:' + e.message; }
  }, id);
  if (ok !== 'count' && !String(ok).startsWith('race')) { console.log(`SKIP ${id} (${ok})`); continue; }

  // Eye sitting at start-finish, low and in front of the car, looking forward
  await page.evaluate(() => {
    window.__apex.park(0);
    window.__apex.view({ mode: 'trackside', s: 0.01, side: -1, dist: 6, height: 2.5, look: 'forward' });
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${id}_start.png` });
  console.log(`${id}: done`);
}
await browser.close();
console.log('Done —', OUT);
