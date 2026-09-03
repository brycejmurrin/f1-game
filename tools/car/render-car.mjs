// render-car.mjs — headless batch renderer for the ISOLATED car viewer.
// @doc Headless batch renderer for `carview.html` — preset orbit angles + HTML contact sheet; needs a server on :3456.
// @skill car-viewer
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
//   node tools/car/render-car.mjs [--views=a,b,c] [options]
//
// Views (orbit az: 0 = behind, 180 = head-on):
//   hero [DEFAULT]  rear-3/4        front   rear    side
//   frontquarter    rearquarter     nose    tail    top
//   turntable  = front,frontquarter,side,rearquarter,rear
//   all        = every view above
//
// Presets (--preset=<name>): purpose-built 3-shot sets for reviewing a specific
// part or aspect, reusing the exact angles already validated for that purpose
// (see tools/audit-parts.mjs / tools/audit-aero.mjs) instead of hand-picking
// az/el/dist each time. Overrides --views.
//   wing (alias aero)   behind / front / front-3-quarter — endplate + rear wing
//   engine, suspension, brakes, tyres, ers, gearbox, fuel
//                       each category's audited best angle + two ±36° offsets
//   livery              side / front-3-quarter / rear-3-quarter — paint & sponsors
// List all: node tools/car/render-car.mjs --preset=list
//
// --lightset=day,dusk,night  render EVERY shot at each listed tod (fans out the
//   shot count ×N) and lays out the contact sheet as a grid (rows = shot,
//   columns = tod) — for comparing how a part/livery reads across lighting.
//
// Options:
//   --team=mclaren        team id (js/data/teams.js). Default: mclaren
//   --livery=mcl_gulf     livery id (js/car/liveries.js). Default: team default
//   --num=4               driver number override
//   --engine= --aero= --brakes= --gearbox= --ers= --tyres= --suspension= --fuel=
//                         force a part option id (see js/car/parts.js) to inspect its look
//   --tod=day             day|dusk|dawn|night|void. Default: day (per-shot presets may override)
//   --rig=3point          lighting rig: studio|3point|rim|topdown|none (reflection tests)
//   --plight=x,y,z,r,g,b,i,rad   add a point light (repeatable) — watch specular/reflections
//   --sweep=1             add a bright point light orbiting the car (reflection sweep)
//   --studio=1            studio rig on (default; ignored if --rig given). --studio=0 = none
//   --intensity=1.8       light strength (default: per-tod)
//   --exp=1.1             tonemap exposure / overall brightness (default 1.0)
//   --refl=0.2            env-mirror strength 0..1 (0 = matte paint, 0.85 = default chrome)
//   --bg=101014           background hex (overrides tod bg)
//   --az=210 --el=20 --dist=4  render ONE custom angle (overrides --views/--preset)
//   --out=DIR             output dir. Default: scratch/renders/cars/<team>
//   --w=900 --h=680       viewport size
//   --url=...             base URL. Default http://127.0.0.1:3456
//
// Examples:
//   node tools/car/render-car.mjs                                  # mclaren hero shot
//   node tools/car/render-car.mjs --team=redbull --views=all --tod=night --exp=1.2
//   node tools/car/render-car.mjs --team=haas --gearbox=f1_spec --brakes=ceramic --views=tail,side
//   node tools/car/render-car.mjs --team=ferrari --az=205 --el=18 --dist=3.8 --intensity=2
//   node tools/car/render-car.mjs --team=mclaren --preset=brakes --brakes=ceramic     # 3 shots, one part
//   node tools/car/render-car.mjs --team=mclaren --preset=wing --aero=extreme         # 3 shots, one wing
//   node tools/car/render-car.mjs --team=mclaren --preset=livery --lightset=day,dusk,night  # 3x3 grid

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSafePathToken,
  resolveContainedChild,
  resolveRepoDefault,
} from '../lib/output-paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
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

// Named PRESET shot-sets: 3 purpose-built {label, az, el, dist, look?, tod?,
// intensity?} angles per review purpose.
//  - `wing` is the exact 3-view spread from tools/audit-aero.mjs (behind/front/
//    front-3-quarter, confirmed to clear the endplate at every downforce level).
//  - Part-detail presets (engine/suspension/brakes/tyres/ers/gearbox/fuel) use a
//    CLOSE distance + a `look` target offset toward the actual part instead of
//    the car's dead centre — front axle z=+1.7, rear axle z=-1.6 (see
//    js/car/car3d.js AXLES) — so a close shot fills the frame with that part
//    instead of cropping both ends of the car. They also dial the light rig
//    down (lower --intensity) since a close-up otherwise catches a hot,
//    distracting specular blowout off the bodywork that the wider stock views
//    don't show at all.
//  - `livery` reuses the standard turntable quarter-angles (wide enough to read
//    sponsor placement across the whole flank).
//  - `suspension`/`fuel` are the two exceptions kept at a wider CONTEXTUAL
//    distance rather than a tight macro: the wishbones are thin, dark, and
//    inboard of the (much bigger, occluding) wheel, and the fuel system's two
//    tells — the airbox collar (z=-0.5) and the exhaust ember (z=-2.2) — are
//    too far apart to both fill a close frame. A macro crop on either loses
//    the part rather than showing it better; verified by rendering both ways.
const FRONT_AXLE = 1.7, REAR_AXLE = -1.6;
const detail = (v) => [
  { label: 'main',  az: v.az,      el: v.el, dist: v.dist, look: v.look, tod: v.tod, intensity: v.intensity },
  { label: 'left',  az: v.az - 30, el: v.el, dist: v.dist, look: v.look, tod: v.tod, intensity: v.intensity },
  { label: 'right', az: v.az + 30, el: v.el, dist: v.dist, look: v.look, tod: v.tod, intensity: v.intensity },
];
const PRESETS = {
  wing: [
    { label: 'behind',     az: 0,   el: 15, dist: 5.0 },
    { label: 'front',      az: 180, el: 15, dist: 5.2 },
    { label: 'frontside',  az: 150, el: 15, dist: 4.8 },
  ],
  engine:     detail({ az: 322, el: 20, dist: 3.6, look: REAR_AXLE * 0.4, tod: 'day',  intensity: 1.0 }),
  suspension: detail({ az: 152, el: 8,  dist: 4.6, look: 0.6,             tod: 'day',  intensity: 1.0 }),
  brakes:     detail({ az: 104, el: 10, dist: 3.2, look: FRONT_AXLE,      tod: 'day',  intensity: 1.0 }),
  tyres:      detail({ az: 96,  el: 8,  dist: 3.2, look: FRONT_AXLE,      tod: 'day',  intensity: 1.0 }),
  ers:        detail({ az: 322, el: 12, dist: 3.6, look: 0,               tod: 'dusk', intensity: 1.2 }),
  gearbox:    detail({ az: 26,  el: 18, dist: 3.4, look: REAR_AXLE,       tod: 'day',  intensity: 1.0 }),
  fuel:       detail({ az: 6,   el: 15, dist: 4.8, look: -1.0,            tod: 'dusk', intensity: 1.2 }),
  livery: [
    { label: 'side',         az: 90,  el: 8,  dist: 6.0 },
    { label: 'frontquarter', az: 145, el: 16, dist: 6.4 },
    { label: 'rearquarter',  az: 320, el: 16, dist: 6.4 },
  ],
};
PRESETS.aero = PRESETS.wing;   // alias — both names read naturally depending on intent

const TEAM   = assertSafePathToken(arg('team', 'mclaren'), 'team');
const LIVERY = arg('livery', null);
const NUM    = arg('num', null);
const TOD    = arg('tod', 'day');
const RIG    = arg('rig', null);          // studio|3point|rim|topdown|none
const STUDIO = arg('studio', '1') !== '0';
const SWEEP  = arg('sweep', null);
const INTEN  = arg('intensity', null);
const EXP    = arg('exp', null);
const REFL   = arg('refl', null);   // env-mirror strength 0..1 (0 = matte paint, no chrome)
// ACTIVE AERO blend: 0 = Z-mode (wings closed, max downforce), 1 = X-mode (the
// moveable elements rotated flat). Not --aero, which is the aero PART id.
const FLAP   = arg('flap', null);
const LOOKY  = arg('looky', null);   // orbit-target Y offset — see carview.html
const BG     = arg('bg', null);
const LOOK   = parseFloat(arg('look', '0'));    // orbit-target Z offset (+nose / −rear)
const LOOKX  = parseFloat(arg('lookx', '0'));   // orbit-target X offset (+right / −left)
const PRESET = arg('preset', null);
const LIGHTSET = arg('lightset', null);   // e.g. "day,dusk,night" — fan out every shot across these tod values
const PLIGHTS = process.argv.filter(a => a.startsWith('--plight=')).map(a => a.slice('--plight='.length));
// A custom --az/--el/--dist renders a single ad-hoc view instead of the presets.
const CUSTOM = (arg('az', null) != null || arg('el', null) != null || arg('dist', null) != null);
const W      = parseInt(arg('w', '900'), 10);
const H      = parseInt(arg('h', '680'), 10);
const URL    = arg('url', 'http://127.0.0.1:3456');
const OUTARG = arg('out', null);
const OUT    = OUTARG != null
  ? resolve(HERE, OUTARG)
  : resolveRepoDefault(ROOT, 'scratch', 'renders', 'cars', TEAM);
// Browser: PW_CHROMIUM wins, else Playwright's bundled build, else a Chromium
// already installed under PLAYWRIGHT_BROWSERS_PATH. Sandboxes that preinstall
// the browser (and set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD) have no bundled build,
// and the bare "run npx playwright install" error sends you chasing a download
// that is deliberately disabled there.
function findChromium() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const dirs = readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse();
  for (const d of dirs) {
    for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const exe = resolve(root, d, rel);
      if (existsSync(exe)) return exe;
    }
  }
  return undefined;
}
const EXE    = findChromium();
// SwiftShader renders on the CPU, so a loaded box can take tens of seconds to
// present a frame. These were fixed 15 s and aborted the whole sheet.
const WAIT_MS = Math.max(15_000, (parseFloat(arg('wait', '90')) || 90) * 1000);

const PART_CATS = ['engine', 'aero', 'brakes', 'gearbox', 'ers', 'tyres', 'suspension', 'fuel'];
const parts = {};
for (const c of PART_CATS) if (arg(c, null) != null) parts[c] = arg(c, null);

if (PRESET === 'list') {
  console.log('Available presets:', Object.keys(PRESETS).join(', '));
  process.exit(0);
}

// Unify every source (--preset / --views / --az&co) into one shotDefs list of
// {label, az, el, dist, tod}. tod is null unless the preset pins one (e.g. `ers`
// defaults to dusk to show its glow) — null means "use the global --tod".
let shotDefs;
if (CUSTOM) {
  shotDefs = [{ label: 'custom', az: parseFloat(arg('az', '35')), el: parseFloat(arg('el', '14')), dist: parseFloat(arg('dist', '4.6')), tod: null }];
  // (--look/--lookx used to be dropped on this path: the shot object carried no
  //  look, and the per-shot CARVIEW.set below then wrote look:0 over whatever the
  //  query string had set, so an ad-hoc angle could never be aimed off-centre.)
} else if (PRESET) {
  const p = PRESETS[PRESET];
  if (!p) { console.error(`Unknown preset "${PRESET}". Available: ${Object.keys(PRESETS).join(', ')}`); process.exit(1); }
  shotDefs = p.map((s) => ({ ...s, tod: s.tod || null }));
} else {
  let want = String(arg('views', 'hero')).split(',').map(s => s.trim()).filter(Boolean);
  want = want.flatMap(v => GROUPS[v] || [v]);
  const bad = want.filter(v => !VIEWS[v]);
  if (bad.length) { console.error(`Unknown view(s): ${bad.join(', ')}\nAvailable: ${Object.keys(VIEWS).concat(Object.keys(GROUPS)).join(', ')}`); process.exit(1); }
  shotDefs = want.map((name) => ({ label: name, ...VIEWS[name], tod: null }));
}

// --lightset fans every shot out across each listed tod (3 shots x 3 tods = 9),
// overriding whatever tod the shot/preset/--tod would otherwise use, and tags
// each with its tod so the contact sheet can grid rows=shot / cols=tod.
const lightTods = LIGHTSET ? LIGHTSET.split(',').map(s => s.trim()).filter(Boolean) : null;
if (lightTods) {
  shotDefs = shotDefs.flatMap((s) => lightTods.map((tod) => ({ ...s, tod, group: s.label })));
} else {
  shotDefs = shotDefs.map((s) => ({ ...s, tod: s.tod || TOD, group: s.label }));
}

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
if (FLAP != null) qs.set('flap', FLAP);
if (LOOKY != null) qs.set('looky', LOOKY);
for (const pl of PLIGHTS) qs.append('plight', pl);
for (const [k, v] of Object.entries(parts)) qs.set(k, v);
// `npx serve` 301s `carview.html?…` to `/tools/carview` and DROPS the query,
// so every team/aero flag used to boot the default McLaren. The extensionless
// path keeps the search string (200). CARVIEW.set after ready is the backup
// for hosts that still rewrite.
const pageUrl = `${URL}/tools/carview?${qs.toString()}`;

const shots = [];
const browser = await chromium.launch({ ...(EXE ? { executablePath: EXE } : {}), args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto(pageUrl, { waitUntil: 'load' });
  const ok = await page.waitForFunction(() => window.CARVIEW && window.CARVIEW.ready, null, { polling: 100, timeout: WAIT_MS }).then(() => true).catch(() => false);
  if (!ok) { console.error(`carview did not become ready in ${WAIT_MS / 1000}s — is the server running and the car building? (--wait=SECONDS to allow longer)`); process.exit(2); }

  const boot = { team: TEAM, parts };
  if (LIVERY) boot.livery = LIVERY;
  if (NUM != null) boot.num = NUM;
  if (REFL != null) boot.refl = parseFloat(REFL);
  const bootFrame = await page.evaluate((p) => {
    const before = window.CARVIEW.frame;
    window.CARVIEW.set(p);
    return before;
  }, boot);
  await page.waitForFunction((before) => window.CARVIEW.frame >= before + 8, bootFrame, { polling: 100, timeout: WAIT_MS })
    .catch(async () => { await page.waitForTimeout(2_000); });

  let renderedTod = TOD, firstShot = true;
  for (const s of shotDefs) {
    const frame = await page.evaluate((p) => {
      const before = window.CARVIEW.frame;
      window.CARVIEW.set(p);
      return before;
    }, { az: s.az, el: s.el, dist: s.dist,
         look:  s.look  != null ? s.look  : LOOK,
         lookX: s.lookX != null ? s.lookX : LOOKX,
         lookY: s.lookY != null ? s.lookY : (LOOKY != null ? parseFloat(LOOKY) : 0),
         tod: s.tod, intensity: s.intensity != null ? s.intensity : INTEN });
    // SwiftShader can spend far longer than a fixed delay compiling or rebuilding
    // the dusk/night reflection probe. Eight completed post-change frames covers
    // that slow path and gives the browser compositor a presented canvas.
    // A slow renderer must not abort the sheet: if eight frames do not land in
    // time, fall back to a wall-clock settle and carry on rather than throwing
    // away every shot after this one.
    await page.waitForFunction((before) => window.CARVIEW.frame >= before + 8, frame, { polling: 100, timeout: WAIT_MS })
      .catch(async () => {
        console.log(`  (slow frame settle — falling back to a timed wait)`);
        await page.waitForTimeout(3_000);
      });
    // Chromium's screenshot compositor can still expose the discarded/blank
    // WebGL back buffer during the first capture or while an env probe changes.
    // A one-time/tod-change settle covers that compositor boundary; subsequent
    // same-lighting orbit shots remain frame-synchronised and fast.
    if (firstShot || s.tod !== renderedTod) await page.waitForTimeout(2_000);
    firstShot = false;
    renderedTod = s.tod;
    const file = lightTods ? `${s.group}-${s.tod}.png` : `${s.label}.png`;
    await page.screenshot({ path: resolveContainedChild(OUT, file, 'render output path') });
    shots.push({ file, label: s.label, group: s.group, tod: s.tod });
    console.log(`  ✓ ${file}`);
  }

  const metaLine = `${PRESET ? 'preset=' + PRESET + ' · ' : ''}${lightTods ? lightTods.join('/') : TOD}${STUDIO ? ' · studio' : ''}${Object.keys(parts).length ? ' · ' + Object.entries(parts).map(([k, v]) => k + '=' + v).join(' ') : ''}`;
  const style = `body{margin:0;background:#111;color:#ccc;font:14px system-ui,sans-serif;padding:16px}
  h1{font-size:16px;letter-spacing:.08em;text-transform:uppercase;color:#fff}
  .meta{color:#888;margin:-8px 0 16px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
  figure{margin:0;background:#000;border:1px solid #222;border-radius:8px;overflow:hidden}
  img{display:block;width:100%;height:auto}
  figcaption{padding:6px 8px;color:#9ab;font-size:12px;text-transform:capitalize}
  table{border-collapse:collapse}
  th{color:#fff;text-align:left;padding:6px 10px;font:600 12px system-ui;text-transform:uppercase;letter-spacing:.04em}
  td{padding:4px}
  td img{width:260px;border:1px solid #222;border-radius:6px;display:block}`;

  let body;
  if (lightTods) {
    // Grid: one row per shot (preset label), one column per tod — the layout
    // that makes a lighting comparison actually scannable at a glance.
    const groups = [...new Set(shots.map(s => s.group))];
    const rows = groups.map(g => {
      const cells = lightTods.map(tod => {
        const s = shots.find(x => x.group === g && x.tod === tod);
        return `<td>${s ? `<img src="${s.file}" alt="${g} ${tod}">` : ''}</td>`;
      }).join('');
      return `<tr><th>${g}</th>${cells}</tr>`;
    }).join('\n');
    body = `<table><thead><tr><th></th>${lightTods.map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  } else {
    body = `<div class="grid">\n${shots.map(s => `<figure><img src="${s.file}" alt="${s.label}"><figcaption>${s.label}</figcaption></figure>`).join('\n')}\n</div>`;
  }

  writeFileSync(resolveContainedChild(OUT, 'index.html', 'render contact sheet path'), `<!doctype html><meta charset="utf8">
<title>${TEAM} — render sheet</title>
<style>
  ${style}
</style>
<h1>${TEAM}${LIVERY ? ' · ' + LIVERY : ''}</h1>
<div class="meta">${metaLine}</div>
${body}`);

  console.log(`Rendered ${shots.length} shot(s) -> ${OUT}`);
  console.log(`Contact sheet: ${resolveContainedChild(OUT, 'index.html', 'render contact sheet path')}`);
} finally {
  await browser.close();
}
