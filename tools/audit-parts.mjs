// audit-parts.mjs — render EVERY option of chosen part categories through the
// isolated car viewer (one page load) at the view that best shows each part, and
// write a per-category contact sheet. For design review of js/car3d.js part tells.
//
//   node tools/audit-parts.mjs [--cats=brakes,gearbox,ers] [--team=mclaren]
//
// Output: scratch/renders/parts/<cat>/<option>.png + <cat>/index.html
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSafePathToken,
  resolveContainedChild,
  resolveRepoDefault,
} from './output-paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const arg = (k, d) => { const h = process.argv.find(a => a.startsWith(`--${k}=`)); return h ? h.slice(k.length + 3) : d; };
const TEAM = assertSafePathToken(arg('team', 'mclaren'), 'team');
const URL = arg('url', 'http://127.0.0.1:3456');
const EXE = process.env.PW_CHROMIUM;  // unset → Playwright's bundled chromium

// Best camera per category (az 0 = behind, 180 = head-on), + tod.
const CAT_VIEW = {
  engine:     { az: 322, el: 22, dist: 6.2, tod: 'day'  },  // airbox / exhaust / inlet
  aero:       { az: 38,  el: 18, dist: 6.4, tod: 'day'  },  // rear wing + fin
  suspension: { az: 152, el: 6,  dist: 5.8, tod: 'day'  },  // front wishbones
  brakes:     { az: 104, el: 8,  dist: 5.6, tod: 'day'  },  // wheel caliper / nut
  tyres:      { az: 96,  el: 8,  dist: 5.8, tod: 'day'  },  // Pirelli band
  ers:        { az: 322, el: 16, dist: 5.6, tod: 'dusk' },  // sidepod glow bar
  gearbox:    { az: 26,  el: 22, dist: 5.8, tod: 'day'  },  // rear casing
  fuel:       { az: 6,   el: 15, dist: 6.0, tod: 'dusk' },  // exhaust ember + collar
};
const cats = (arg('cats', Object.keys(CAT_VIEW).join(','))).split(',').map(s => s.trim()).filter(Boolean)
  .map((c) => assertSafePathToken(c, 'category'));

const browser = await chromium.launch({ ...(EXE ? { executablePath: EXE } : {}), args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 560 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto(`${URL}/tools/carview.html?team=${TEAM}&hud=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.CARVIEW && window.CARVIEW.ready, { timeout: 15000 });

  const catalog = await page.evaluate(() => Object.fromEntries(Parts.CATALOG.map(c => [c.id, c.options.map(o => ({ id: o.id, label: o.label }))])));
  const defaults = await page.evaluate(() => Object.assign({}, Parts.DEFAULTS));

  for (const cat of cats) {
    const v = CAT_VIEW[cat]; const opts = catalog[cat];
    if (!v || !opts) { console.log(`skip ${cat}`); continue; }
    const dir = resolveRepoDefault(ROOT, 'scratch', 'renders', 'parts', cat);
    mkdirSync(dir, { recursive: true });
    const shots = [];
    for (const o of opts) {
      const parts = { ...defaults, [cat]: o.id };
      await page.evaluate((s) => window.CARVIEW.set(s), { parts, az: v.az, el: v.el, dist: v.dist, tod: v.tod });
      await page.waitForTimeout(260);
      const file = `${assertSafePathToken(o.id, 'option')}.png`;
      await page.screenshot({ path: resolveContainedChild(dir, file, 'parts audit shot') });
      shots.push({ file, label: `${o.id}` });
    }
    const cards = shots.map(s => `<figure><img src="${s.file}"><figcaption>${s.label}</figcaption></figure>`).join('\n');
    writeFileSync(resolveContainedChild(dir, 'index.html', 'parts audit index'), `<!doctype html><meta charset=utf8><title>${cat} audit</title>
<style>body{margin:0;background:#111;color:#ccc;font:13px system-ui;padding:14px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}figure{margin:0;background:#000;border:1px solid #222;border-radius:6px;overflow:hidden}img{display:block;width:100%}figcaption{padding:4px 6px;color:#9ab;font-size:12px}</style>
<h2 style="text-transform:uppercase;letter-spacing:.06em">${cat} — ${TEAM}</h2><div class=grid>${cards}</div>`);
    console.log(`  ${cat}: ${shots.length} options -> scratch/renders/parts/${cat}/`);
  }
  console.log('done');
} finally { await browser.close(); }
