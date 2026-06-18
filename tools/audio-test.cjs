/*
 * Engine-audio pitch test (objective, since we can't listen).
 *
 * Drives GameAudio.setEngine(rev, boost, offroad, speed, gear) with controlled
 * gear/throttle/rev values and measures the engine's actual output:
 *   - GameAudio.rate()       exact playbackRate (ground-truth pitch multiplier;
 *                            perceived pitch scales linearly with it)
 *   - GameAudio.centroidHz() spectral centroid of the live output (brightness)
 * Run in the MENU state, where the game loop doesn't call setEngine, so our
 * controlled values aren't overwritten.
 *
 * Usage:  (serve the repo first, e.g. `python3 -m http.server 8099`)
 *   node tools/audio-test.js            # uses http://localhost:8099
 *   node tools/audio-test.js <baseURL>
 *
 * What to look for:
 *   - within a gear, rate rises monotonically with rev (climb)
 *   - gears 1-3 read lower than 4-8 (deeper low-gear launch)
 *   - boost adds a few percent
 */
const PW = "/opt/node22/lib/node_modules/playwright";
const { chromium } = require(PW);
const BASE = process.argv[2] || "http://localhost:8099";

(async () => {
  const b = await chromium.launch({ headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await b.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE + "/index.html?v=" + Date.now(), { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.click("#mb-race"); await page.waitForTimeout(400);   // gesture -> audio init
  await page.evaluate(() => { GameAudio.init(); GameAudio.setEnabled(true); });
  await page.waitForTimeout(1400);                                 // decode samples
  await page.evaluate(() => GameAudio.startEngine());
  await page.waitForTimeout(300);

  const revs = [0, 0.25, 0.5, 0.75, 1.0];
  const r = await page.evaluate(async (revs) => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const rate = {}, cen = {};
    for (let g = 1; g <= 8; g++) {
      rate[g] = []; cen[g] = [];
      for (const rv of revs) {
        GameAudio.setEngine(rv, 0, false, rv, g);
        await sleep(160);
        rate[g].push(GameAudio.rate()); cen[g].push(GameAudio.centroidHz());
      }
    }
    GameAudio.setEngine(0.7, 0, false, 0.7, 6); await sleep(160); const bo = GameAudio.rate();
    GameAudio.setEngine(0.7, 1, false, 0.7, 6); await sleep(160); const bn = GameAudio.rate();
    return { rate, cen, boostOff: bo, boostOn: bn };
  }, revs);
  await b.close();
  if (errs.length) { console.log("pageerrors:", errs.join(" | ")); process.exit(1); }

  console.log("playbackRate (exact pitch x)   rows=gear  cols=rev " + JSON.stringify(revs));
  for (let g = 1; g <= 8; g++) console.log(`  g${g}: ${r.rate[g].map((x) => x.toFixed(3)).join("  ")}`);
  console.log("spectral centroid (Hz)         rows=gear  cols=rev " + JSON.stringify(revs));
  for (let g = 1; g <= 8; g++) console.log(`  g${g}: ${r.cen[g].map((x) => String(x).padStart(5)).join("  ")}`);
  console.log(`throttle (g6, rev .7): rate ${r.boostOff} -> ${r.boostOn} (+${(100 * (r.boostOn / r.boostOff - 1)).toFixed(1)}%)`);

  // sanity assertions
  let ok = true;
  for (let g = 1; g <= 8; g++) { const a = r.rate[g]; for (let i = 1; i < a.length; i++) if (a[i] < a[i - 1] - 1e-3) { ok = false; console.log(`FAIL: g${g} pitch not monotonic in rev`); } }
  if (r.rate[1][4] >= r.rate[4][4]) { ok = false; console.log("FAIL: gear 1 redline not lower than gear 4"); }
  console.log(ok ? "PASS: pitch climbs with rev in every gear; gears 1-3 lower than 4-8" : "CHECK FAILED");
})();
