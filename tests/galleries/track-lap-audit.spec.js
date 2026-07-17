// @ts-check
// Full-lap visual audit for all 24 circuits.
//
// For each circuit the test:
//   1. Loads the track and clears AI cars (park(0))
//   2. Jumps to 25 evenly-spaced positions (every 4 %) at 60 m/s
//   3. Snaps the chase camera instantly (snapCam) so no damping lag
//   4. Waits one render frame and screenshots canvas#game
//
// Output:  tests/ui-screenshots/lap-audit/<circuit>/<circuit>-<pct>.png
// Gallery: tests/ui-screenshots/lap-audit/index.html  (generated in afterAll)
//
// Run all:       npx playwright test track-lap-audit
// Single track:  npx playwright test track-lap-audit --grep baku
// Update snaps:  npx playwright test track-lap-audit --update-snapshots

import { test } from "@playwright/test";
import path from "path";
import fs from "fs";

const BASE_OUT  = path.join(import.meta.dirname, "ui-screenshots", "lap-audit");
const POSITIONS = 25;    // every 4 % of the lap
const SPEED_MS  = 60;    // m/s — camera FOV widens with speed; 60 is realistic

const CIRCUITS = [
  "abudhabi", "albert_park", "bahrain", "baku", "cota", "hungaroring",
  "imola", "interlagos", "jeddah", "madrid", "mexico", "miami",
  "monaco", "montreal", "monza", "qatar", "redbull", "shanghai",
  "silverstone", "singapore", "spa", "suzuka", "vegas", "zandvoort",
];

// ── helpers ───────────────────────────────────────────────────────────────────

async function loadTrack(page, circuit) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15_000 });
  await page.evaluate((c) => window.__apex.race(c), circuit);
  await page.waitForFunction(
    () => window.__apex?.info().track != null,
    { timeout: 15_000 }
  );
}

// Jump to lap fraction at speed, snap camera, wait for the renderer, screenshot.
async function shotAt(page, frac, speed) {
  await page.evaluate(
    ([f, spd]) => {
      window.__apex.jump(f, spd, 0);
      window.__apex.snapCam();
    },
    [frac, speed]
  );
  // waitForTimeout is reliable in headless regardless of rAF throttling.
  // 400 ms gives the game's render loop time to paint at least one frame.
  await page.waitForTimeout(400);
  // page.screenshot({ clip }) uses CDP directly and skips element-stability checks
  // that require live animation frames — more reliable for WebGL canvases.
  const box = await page.locator("canvas#game").boundingBox();
  return page.screenshot({ clip: box });
}

// ── setup ─────────────────────────────────────────────────────────────────────

test.beforeAll(() => {
  fs.mkdirSync(BASE_OUT, { recursive: true });
});

// ── per-circuit tests ─────────────────────────────────────────────────────────

for (const circuit of CIRCUITS) {
  test(`lap audit: ${circuit}`, { timeout: 90_000 }, async ({ page }) => {
    test.setTimeout(90_000);
    const outDir = path.join(BASE_OUT, circuit);
    fs.mkdirSync(outDir, { recursive: true });

    await loadTrack(page, circuit);

    // park(0) transitions to race state and shoves all AI cars 600 m behind
    // position 0 so they stay frozen and out of frame for every screenshot.
    await page.evaluate(() => window.__apex.park(0));

    for (let i = 0; i < POSITIONS; i++) {
      const frac = i / POSITIONS;
      const pct  = Math.round(frac * 100).toString().padStart(2, "0");
      const buf  = await shotAt(page, frac, SPEED_MS);
      fs.writeFileSync(path.join(outDir, `${circuit}-${pct}.png`), buf);
    }
  });
}

// ── HTML gallery (generated once after all tests finish) ──────────────────────

test.afterAll(() => {
  // Only write the gallery if at least one circuit folder exists.
  const existing = CIRCUITS.filter((c) =>
    fs.existsSync(path.join(BASE_OUT, c))
  );
  if (existing.length === 0) return;

  const headerCells = Array.from({ length: POSITIONS }, (_, i) => {
    const pct = Math.round((i / POSITIONS) * 100).toString().padStart(2, "0");
    return `<th>${pct}%</th>`;
  }).join("");

  const rows = existing.map((circuit) => {
    const cells = Array.from({ length: POSITIONS }, (_, i) => {
      const pct = Math.round((i / POSITIONS) * 100).toString().padStart(2, "0");
      const src = `./${circuit}/${circuit}-${pct}.png`;
      return `<td><a href="${src}" target="_blank"><img src="${src}" loading="lazy" title="${circuit} @${pct}%"></a></td>`;
    }).join("");
    return `<tr><th>${circuit}</th>${cells}</tr>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Lap Audit — All Circuits</title>
<style>
  * { box-sizing: border-box; }
  body { font: 12px/1.4 monospace; background: #0d0d0d; color: #ccc; margin: 0; }
  h1   { padding: 12px 16px; margin: 0; font-size: 15px; background: #1a1a1a; border-bottom: 1px solid #333; }
  .wrap { overflow: auto; }
  table { border-collapse: collapse; }
  th { padding: 4px 8px; text-align: left; white-space: nowrap;
       background: #1a1a1a; position: sticky; left: 0; z-index: 1;
       border-right: 1px solid #333; border-bottom: 1px solid #222; }
  thead th { top: 0; left: auto; position: sticky; border-bottom: 1px solid #444; }
  td { padding: 2px; border-bottom: 1px solid #161616; }
  img { width: 128px; height: 72px; display: block; object-fit: cover; }
  tr:hover td { background: #1a1a2e; }
  tr:hover th { background: #222240; }
</style>
</head>
<body>
<h1>Lap Audit — ${existing.length} / ${CIRCUITS.length} circuits × ${POSITIONS} positions &nbsp;·&nbsp; ${SPEED_MS} m/s (${Math.round(SPEED_MS * 3.6)} km/h)</h1>
<div class="wrap">
<table>
  <thead><tr><th>Circuit</th>${headerCells}</tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>
</body>
</html>`;

  fs.writeFileSync(path.join(BASE_OUT, "index.html"), html);
  console.log(`\nGallery → ${path.join(BASE_OUT, "index.html")}\n`);
});
