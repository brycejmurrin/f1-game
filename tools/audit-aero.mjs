// audit-aero.mjs — render EVERY aero option from the 3 level wing views
// @doc Renders every aero option from three wing views into one comparison sheet → `scratch/renders/aero/`.
// @skill car-viewer
// (behind / front / front-side, slightly raised) into one comparison sheet.
//   node tools/audit-aero.mjs [--team=mclaren]
// Output: scratch/renders/aero/
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
const VIEWS = [
  { name: 'behind',    az: 0,   el: 15, dist: 5.0 },
  { name: 'front',     az: 180, el: 15, dist: 5.2 },
  { name: 'frontside', az: 150, el: 15, dist: 4.8 },
];
const dir = resolveRepoDefault(ROOT, 'scratch', 'renders', 'aero');
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ ...(EXE ? { executablePath: EXE } : {}), args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 500 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto(`${URL}/tools/carview.html?team=${TEAM}&hud=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.CARVIEW && window.CARVIEW.ready, null, { timeout: 15000 });
  const opts = await page.evaluate(() => Parts.CATALOG.find(c => c.id === 'aero').options.map(o => o.id));
  const defaults = await page.evaluate(() => Object.assign({}, Parts.DEFAULTS));
  const rows = [];
  for (const o of opts) {
    const optId = assertSafePathToken(o, 'aero option');
    const cells = [];
    for (const v of VIEWS) {
      await page.evaluate((s) => window.CARVIEW.set(s), { parts: { ...defaults, aero: o }, az: v.az, el: v.el, dist: v.dist, tod: 'day' });
      await page.waitForTimeout(240);
      const file = `${optId}-${v.name}.png`;
      await page.screenshot({ path: resolveContainedChild(dir, file, 'aero audit shot') });
      cells.push(`<img src="${file}" title="${o} ${v.name}">`);
    }
    rows.push(`<tr><th>${o}</th><td>${cells.join('</td><td>')}</td></tr>`);
    console.log(`  ✓ ${o}`);
  }
  writeFileSync(resolveContainedChild(dir, 'index.html', 'aero audit index'), `<!doctype html><meta charset=utf8><title>aero audit</title>
<style>body{margin:0;background:#111;color:#ccc;font:13px system-ui;padding:14px}
table{border-collapse:collapse}th{color:#fff;text-align:right;padding-right:10px;font:600 13px system-ui;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
td{padding:3px}img{display:block;width:300px;border:1px solid #222;border-radius:5px}
thead th{color:#9ab;text-align:center}</style>
<h2>AERO — ${TEAM} · behind / front / front-side</h2>
<table><thead><tr><th></th><th>behind</th><th>front</th><th>front-side</th></tr></thead><tbody>
${rows.join('\n')}</tbody></table>`);
  console.log(`done -> scratch/renders/aero/index.html`);
} finally { await browser.close(); }
