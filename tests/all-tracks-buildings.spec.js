// Screenshot tour of all 24 circuits — cinematic camera aimed at buildings/scenery.
// Outputs to tests/all-tracks-buildings/  (gitignored).
// Run: npx playwright test tests/all-tracks-buildings.spec.js

import { test } from "@playwright/test";
import fs from "fs";

const OUT = "tests/all-tracks-buildings";
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1200, height: 675 };  // 16:9

async function load(page, trackId) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex, { timeout: 15000 });
  await page.evaluate(async t => {
    __apex.race(t);
    await new Promise(r => setTimeout(r, 4000));
    __apex.go();
    await new Promise(r => setTimeout(r, 400));
    __apex.freeze(true);
    __apex.hud(false);
  }, trackId);
}

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

for (const [id, frac, az, el, dist, fov, label] of CIRCUITS) {
  test(`${id} — ${label}`, async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await load(page, id);

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
