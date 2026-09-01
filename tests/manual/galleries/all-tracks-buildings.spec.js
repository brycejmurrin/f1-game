// Screenshot tour of every circuit — cinematic camera aimed at buildings/scenery.
// npm test -- tests/manual/galleries/all-tracks-buildings.spec.js
// Output: artifacts/galleries-<port>/all-tracks-buildings/
//
// PERF: the suite is SERIAL on one shared page — the game is loaded once and
// tracks are switched in-place with __apex.race(id) (a synchronous rebuild,
// same idiom as tracks-walls.spec.js). The old shape — a fresh page.goto plus
// fixed 4.4s of sleeps per circuit — cost 15-20s of pure overhead per track
// under SwiftShader (~24x that per run); this one pays the page load once.

import { test } from "@playwright/test";
import { galleryDir } from "../../helpers/output-paths.js";

const OUT = galleryDir("all-tracks-buildings");

const VIEWPORT = { width: 1200, height: 675 };  // 16:9

async function shot(page, name) {
  await page.waitForTimeout(150);
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path });
  console.log(`  → ${name}.png`);
  return path;
}

// frac, azimuth, elevation, dist, fov for a good building-facing shot on each circuit
// (frac chosen near prominent scenery; az sweeps to face the grandstands/city walls)
const CIRCUITS = [
  // id             frac    az    el   dist  fov  label
  ["abudhabi",     0.05,   -60,  22,  180,  62,  "Yas Marina hotel straight"],
  ["albert_park",  0.15,    50,  20,  160,  62,  "lakeside grandstands"],
  ["bahrain",      0.12,   -45,  20,  160,  62,  "pit straight"],
  ["baku",         0.18,    70,  22,  160,  62,  "old city walls"],
  ["cota",         0.08,   -50,  25,  170,  62,  "main straight grandstands"],
  ["hungaroring",  0.10,    55,  20,  150,  62,  "pit complex"],
  ["imola",        0.09,   -55,  22,  150,  62,  "pit straight"],
  ["interlagos",   0.07,    60,  22,  160,  62,  "main straight buildings"],
  ["jeddah",       0.10,   -65,  24,  170,  62,  "corniche street walls"],
  ["madrid",       0.12,    60,  22,  160,  62,  "city skyline"],
  ["mexico",       0.08,   -50,  22,  160,  62,  "Foro Sol straight"],
  ["miami",        0.14,    65,  22,  160,  62,  "Hard Rock Stadium"],
  ["monaco",       0.22,   -70,  24,  160,  62,  "Casino square buildings"],
  ["montreal",     0.10,    55,  20,  160,  62,  "Île Notre-Dame grandstands"],
  ["monza",        0.06,   -50,  20,  170,  62,  "main straight"],
  ["qatar",        0.08,   -55,  22,  160,  62,  "Losail pit straight"],
  ["redbull",      0.12,    60,  22,  150,  62,  "A1-Ring grandstands"],
  ["shanghai",     0.10,   -60,  22,  170,  62,  "pit complex"],
  ["silverstone",  0.08,    55,  20,  170,  62,  "Wing straight"],
  ["singapore",    0.20,   -70,  24,  160,  62,  "Marina Bay skyscrapers"],
  ["spa",          0.08,   -50,  20,  180,  62,  "Kemmel straight"],
  ["suzuka",       0.08,    55,  20,  160,  62,  "pit buildings"],
  ["vegas",        0.16,   -70,  24,  160,  62,  "Strip casino frontage"],
  ["zandvoort",    0.10,    55,  20,  160,  62,  "dune grandstands"],
];

test.describe.configure({ mode: "serial" });
// The FIRST test pays the one-time page load + first city rebuild + SwiftShader
// screenshots; under a loaded box that can exceed the default 120s.
test.beforeEach(async () => { test.setTimeout(300_000); });

let page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex, null, { timeout: 30000 });
});
test.afterAll(async () => { await page?.close(); });

for (const [id, frac, az, el, dist, fov, label] of CIRCUITS) {
  test(`${id} — ${label}`, async () => {
    // In-place track switch: race() is AWAITED (it fetches the circuit scenery),
    // so the build is done when it resolves; the short settle that remains is for
    // the first frames to render before the camera work + frozen screenshots.
    await page.evaluate(async (t) => {
      await __apex.race(t);
      __apex.go();
      await new Promise((r) => setTimeout(r, 300));
      __apex.freeze(true);
      __apex.hud(false);
    }, id);

    // Primary shot — cinematic auto-corner
    const info = await page.evaluate(
      ([f, d, e, fv]) => __apex.cinematic(f, { dist: d, el: e, fov: fv }),
      [frac, dist, el, fov]
    );
    if (info) {
      console.log(`  cinematic az=${info.az} k=${info.k}`);
      await shot(page, `${id}-01-cinematic`);
    }

    // Manual orbit aimed at buildings
    await page.evaluate(
      ([f, a, e, d, fv]) => __apex.orbit(f, a, e, d, 1.5, { fov: fv }),
      [frac, az, el, dist, fov]
    );
    await shot(page, `${id}-02-orbit`);

    // Second frac 0.5 lap ahead for variety
    const f2 = (frac + 0.5) % 1;
    const info2 = await page.evaluate(
      ([f, d, e, fv]) => __apex.cinematic(f, { dist: d, el: e, fov: fv }),
      [f2, dist, el, fov]
    );
    if (info2) await shot(page, `${id}-03-cinematic-opposite`);
  });
}
