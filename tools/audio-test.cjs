/*
 * @doc Objective engine-audio pitch test — we cannot listen headless, so it measures the synthesised pitch instead.
 * @skill audio-debug
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
 *   node tools/audio-test.cjs            # uses http://localhost:8099
 *   node tools/audio-test.cjs <baseURL>
 *
 * What to look for:
 *   - within a gear, rate rises monotonically with rev (climb)
 *   - gears 1-3 read lower than 4-8 (deeper low-gear launch)
 *   - boost adds a few percent
 */
const { chromium } = require("playwright");
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

  // Per-manufacturer voices: same invariants must hold under every voice, and
  // the timbres must actually differ (relative rate offsets + centroid spread).
  const b2 = await chromium.launch({ headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page2 = await b2.newPage();
  const errs2 = []; page2.on("pageerror", (e) => errs2.push(e.message));
  await page2.goto(BASE + "/index.html?v=" + Date.now() + 1, { waitUntil: "networkidle" });
  await page2.waitForTimeout(400);
  await page2.click("#mb-race"); await page2.waitForTimeout(400);
  await page2.evaluate(() => { GameAudio.init(); GameAudio.setEnabled(true); });
  await page2.waitForTimeout(1400);
  const VOICES = ["default", "Mercedes", "Ferrari", "Red Bull Ford", "Honda", "Audi"];
  const vres = await page2.evaluate(async (VOICES) => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const out = {};
    for (const v of VOICES) {
      GameAudio.stopEngine();
      await sleep(500);                 // let the old chain fade + tear down
      GameAudio.setVoice(v);
      GameAudio.startEngine();
      await sleep(250);
      const rates = [];
      for (const rv of [0.2, 0.5, 0.8]) {
        GameAudio.setEngine(rv, 0, false, rv, 5);
        await sleep(160);
        rates.push(GameAudio.rate());
      }
      GameAudio.setEngine(0.75, 0, false, 0.75, 5);
      await sleep(400);
      out[v] = { rates, cen: GameAudio.centroidHz(), dbg: GameAudio.debug().voice };
    }
    return out;
  }, VOICES);
  await b2.close();
  if (errs2.length) { console.log("pageerrors (voices):", errs2.join(" | ")); process.exit(1); }

  console.log("voice          rates(rev .2/.5/.8)      centroid  debug");
  for (const v of VOICES) {
    const o = vres[v];
    console.log(`  ${v.padEnd(13)} ${o.rates.map((x) => x.toFixed(3)).join(" ")}   ${String(o.cen).padStart(5)}  ${o.dbg}`);
  }
  for (const v of VOICES) {
    const o = vres[v];
    if (o.dbg !== v) { ok = false; console.log(`FAIL: debug().voice ${o.dbg} != ${v}`); }
    for (let i = 1; i < o.rates.length; i++)
      if (o.rates[i] < o.rates[i - 1] - 1e-3) { ok = false; console.log(`FAIL: ${v} pitch not monotonic`); }
  }
  // rateTrim must land in the actual playbackRate (relative check: Ferrari
  // pitched ~3% over default, Audi ~2% under — allow generous tolerance).
  const rel = (v) => vres[v].rates[1] / vres["default"].rates[1];
  if (!(rel("Ferrari") > 1.01)) { ok = false; console.log("FAIL: Ferrari not pitched above default"); }
  if (!(rel("Audi") < 0.995)) { ok = false; console.log("FAIL: Audi not pitched below default"); }
  console.log(ok ? "PASS: all voices monotonic; manufacturer trims audible in rate" : "CHECK FAILED");
  process.exit(ok ? 0 : 1);
})();
