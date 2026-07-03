// render-car.mjs — headless batch renderer for the ISOLATED car viewer.
//
// Loads tools/carview.html (the standalone, track-free car "photo studio") once
// and screenshots it from a chosen set of PRESET orbit angles with studio
// lighting, then writes the frames + an HTML contact sheet. Fast — no track/scene
// is loaded, just the car. For interactive poking, open tools/carview.html itself.
//
// Prereq: a static server for the repo root on http://127.0.0.1:3456
//   python3 -m http.server 3456      (or: npx serve -l 3456 .)
//
// Usage:
//   node tools/render-car.mjs [--views=a,b,c] [options]
//
// Views (orbit az: 0 = behind, 180 = head-on):
//   hero [DEFAULT]  rear-3/4        front   rear    side
//   frontquarter    rearquarter     nose    tail    top
//   turntable  = front,frontquarter,side,rearquarter,rear
//   all        = every view above
//
// Options:
//   --team=mclaren        team id (js/teams.js). Default: mclaren
//   --livery=mcl_gulf     livery id (js/liveries.js). Default: team default
//   --num=4               driver number override
//   --engine= --aero= --brakes= --gearbox= --ers= --tyres= --suspension= --fuel=
//                         force a part option id (see js/parts.js) to inspect its look
//   --tod=day             day|dusk|dawn|night|void. Default: day
//   --rig=3point          lighting rig: studio|3point|rim|topdown|none (reflection tests)
//   --plight=x,y,z,r,g,b,i,rad   add a point light (repeatable) — watch specular/reflections
//   --sweep=1             add a bright point light orbiting the car (reflection sweep)
//   --studio=1            studio rig on (default; ignored if --rig given). --studio=0 = none
//   --intensity=1.8       light strength (default: per-tod)
//   --exp=1.1             tonemap exposure / overall brightness (default 1.0)
//   --refl=0.2            env-mirror strength 0..1 (0 = matte paint, 0.85 = default chrome)
//   --bg=101014           background hex (overrides tod bg)
//   --az=210 --el=20 --dist=4  render ONE custom angle (overrides --views)
//   --out=DIR             output dir. Default: tools/render-out/<team>
//   --w=900 --h=680       viewport size
//   --url=...             base URL. Default http://127.0.0.1:3456
//
// Examples:
//   node tools/render-car.mjs                                  # mclaren hero shot
//   node tools/render-car.mjs --team=redbull --views=all --tod=night --exp=1.2
//   node tools/render-car.mjs --team=haas --gearbox=f1_spec --brakes=ceramic --views=tail,side
//   node tools/render-car.mjs --team=ferrari --az=205 --el=18 --dist=3.8 --intensity=2

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => {
  const hit = process.argv.find(a => a === `--${k}` || a.startsWith(`--${k}=`));
  if (!hit) return d;
  const eq = hit.indexOf('='); return eq === -1 ? true : hit.slice(eq + 1);
};

// Named preset orbit views: {az, el, dist}.
// Distances pulled back so the whole ~5.4 m car fits with margin.
const VIEWS = {
  hero:         { az: 40,  el: 16, dist: 6.4 },
  front:        { az: 180, el: 12, dist: 6.8 },
  rear:         { az: 0,   el: 12, dist: 6.6 },
  side:         { az: 90,  el: 8,  dist: 6.0 },
  frontquarter: { az: 145, el: 16, dist: 6.4 },
  rearquarter:  { az: 320, el: 16, dist: 6.4 },
  nose:         { az: 180, el: 40, dist: 5.4 },
  tail:         { az: 30,  el: 24, dist: 6.0 },
  top:          { az: 0,   el: 66, dist: 6.8 },
};
const GROUPS = {
  turntable: ['front', 'frontquarter', 'side', 'rearquarter', 'rear'],
  all:       Object.keys(VIEWS),
};

const TEAM   = arg('team', 'mclaren');
const LIVERY = arg('livery', null);
const NUM    = arg('num', null);
const TOD    = arg('tod', 'day');
const RIG    = arg('rig', null);          // studio|3point|rim|topdown|none
const STUDIO = arg('studio', '1') !== '0';
const SWEEP  = arg('sweep', null);
const INTEN  = arg('intensity', null);
const EXP    = arg('exp', null);
const REFL   = arg('refl', null);   // env-mirror strength 0..1 (0 = matte paint, no chrome)
const BG     = arg('bg', null);
const PLIGHTS = process.argv.filter(a => a.startsWith('--plight=')).map(a => a.slice('--plight='.length));
// A custom --az/--el/--dist renders a single ad-hoc view instead of the presets.
const CUSTOM = (arg('az', null) != null || arg('el', null) != null || arg('dist', null) != null);
const W      = parseInt(arg('w', '900'), 10);
const H      = parseInt(arg('h', '680'), 10);
const URL    = arg('url', 'http://127.0.0.1:3456');
const OUT    = resolve(HERE, arg('out', `render-out/${TEAM}`));
const EXE    = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';

const PART_CATS = ['engine', 'aero', 'brakes', 'gearbox', 'ers', 'tyres', 'suspension', 'fuel'];
const parts = {};
for (const c of PART_CATS) if (arg(c, null) != null) parts[c] = arg(c, null);

let want;
if (CUSTOM) {
  VIEWS.custom = { az: parseFloat(arg('az', '35')), el: parseFloat(arg('el', '14')), dist: parseFloat(arg('dist', '4.6')) };
  want = ['custom'];
} else {
  want = String(arg('views', 'hero')).split(',').map(s => s.trim()).filter(Boolean);
  want = want.flatMap(v => GROUPS[v] || [v]);
}
const bad = want.filter(v => !VIEWS[v]);
if (bad.length) { console.error(`Unknown view(s): ${bad.join(', ')}\nAvailable: ${Object.keys(VIEWS).concat(Object.keys(GROUPS)).join(', ')}`); process.exit(1); }

mkdirSync(OUT, { recursive: true });

// Build the carview URL from the shared params (parts + team + livery + lighting).
const qs = new URLSearchParams();
qs.set('team', TEAM); if (LIVERY) qs.set('livery', LIVERY); if (NUM != null) qs.set('num', NUM);
qs.set('tod', TOD); qs.set('hud', '0');
if (RIG) qs.set('rig', RIG); else qs.set('studio', STUDIO ? '1' : '0');
if (SWEEP != null) qs.set('sweep', SWEEP);
if (BG) qs.set('bg', BG);
if (INTEN != null) qs.set('intensity', INTEN); if (EXP != null) qs.set('exp', EXP);
if (REFL != null) qs.set('refl', REFL);
for (const pl of PLIGHTS) qs.append('plight', pl);
for (const [k, v] of Object.entries(parts)) qs.set(k, v);
const pageUrl = `${URL}/tools/carview.html?${qs.toString()}`;

const shots = [];
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto(pageUrl, { waitUntil: 'load' });
  const ok = await page.waitForFunction(() => window.CARVIEW && window.CARVIEW.ready, { timeout: 15000 }).then(() => true).catch(() => false);
  if (!ok) { console.error('carview did not become ready — is the server running and the car building?'); process.exit(2); }

  for (const name of want) {
    const v = VIEWS[name];
    await page.evaluate((p) => window.CARVIEW.angle(p.az, p.el, p.dist), v);
    await page.waitForTimeout(260);   // let a couple of frames render at the new angle
    const file = `${name}.png`;
    await page.screenshot({ path: resolve(OUT, file) });
    shots.push({ file, label: name });
    console.log(`  ✓ ${name}`);
  }

  const cards = shots.map(s => `<figure><img src="${s.file}" alt="${s.label}"><figcaption>${s.label}</figcaption></figure>`).join('\n');
  writeFileSync(resolve(OUT, 'index.html'), `<!doctype html><meta charset="utf8">
<title>${TEAM} — render sheet</title>
<style>
  body{margin:0;background:#111;color:#ccc;font:14px system-ui,sans-serif;padding:16px}
  h1{font-size:16px;letter-spacing:.08em;text-transform:uppercase;color:#fff}
  .meta{color:#888;margin:-8px 0 16px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
  figure{margin:0;background:#000;border:1px solid #222;border-radius:8px;overflow:hidden}
  img{display:block;width:100%;height:auto}
  figcaption{padding:6px 8px;color:#9ab;font-size:12px;text-transform:capitalize}
</style>
<h1>${TEAM}${LIVERY ? ' · ' + LIVERY : ''}</h1>
<div class="meta">${TOD}${STUDIO ? ' · studio' : ''}${Object.keys(parts).length ? ' · ' + Object.entries(parts).map(([k, v]) => k + '=' + v).join(' ') : ''}</div>
<div class="grid">
${cards}
</div>`);

  console.log(`Rendered ${shots.length} view(s) -> ${OUT}`);
  console.log(`Contact sheet: ${resolve(OUT, 'index.html')}`);
} finally {
  await browser.close();
}
