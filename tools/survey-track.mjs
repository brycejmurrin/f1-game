#!/usr/bin/env node
// One-command track survey for scenery/geometry work. Self-booting: no server, no
// manual setup. Boots the game headless ONCE and produces everything an agent needs
// to judge a circuit's scenery in a single pass:
//   • screenshots → scratch/survey-<id>/   (aerial + orbit + driver's-eye per spot)
//   • lateral ground-profile probe, printed as a table with auto-flagged problems
//     (floating props / channels / sagging ribbon) so you don't have to eyeball it
//   • a one-line verdict + any page errors
//
// Usage: node tools/survey-track.mjs <id> [label] [fracs]
//   id     circuit id (see __apex.tracks() / js/tracks/*.js), e.g. montreal
//   label  shot prefix, e.g. before | after   (default: survey)
//   fracs  comma list of lap fractions to shoot+probe (default 0,0.25,0.5,0.75)
//
// Read the PNGs (the EYE shots expose floating props/gaps best) AND the probe table.
// For just the numbers without screenshots, use ground-profile.mjs.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const require = createRequire(ROOT + "/");
const { chromium } = require("playwright");

const [id, label = "survey", fracsArg] = process.argv.slice(2);
if (!id) { console.error("usage: survey-track.mjs <id> [label] [fracs]"); process.exit(2); }
const FRACS = (fracsArg || "0,0.25,0.5,0.75").split(",").map(Number);
const LATS = [8, 12, 20, 30, 45, 70, 110];   // lateral metres for the ground probe
const OUT = `${ROOT}/scratch/survey-${id}`;
mkdirSync(OUT, { recursive: true });

const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); });
  s.on("error", rej);
});
const pickChromium = () => ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (f) => String(Math.round(f * 100)).padStart(2, "0");

const PORT = await freePort();
const server = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT, stdio: "ignore" });
const done = () => { try { server.kill(); } catch {} };
process.on("exit", done);

const shots = [];
let probeRows = [], errs = [];
try {
  await sleep(700);
  const browser = await chromium.launch({ executablePath: pickChromium(), args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errs.push(String(e.message).split("\n")[0]));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForFunction(() => window.__apex != null, { timeout: 12000 });

  // race the track (retry once if a concurrent edit briefly broke the page)
  let ok = false;
  for (let t = 0; t < 3 && !ok; t++) {
    await page.evaluate((tid) => window.__apex.race(tid, "day", "dry"), id);
    ok = await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 9000 }).then(() => true).catch(() => false);
    if (!ok) await sleep(500);
  }
  if (!ok) { console.error(`FAILED to load ${id} — scenery(api) may throw. Run: node tools/verify-track.cjs ${id}`); await browser.close(); process.exit(1); }
  await sleep(1400);
  await page.evaluate(() => window.__apex.hud(false));

  async function shot(name, fn, arg) {
    await page.evaluate(fn, arg);
    await sleep(220);
    const path = `${OUT}/${label}-${name}.png`;
    const buf = await page.locator("canvas#game").screenshot({ path });
    shots.push({ name: `${label}-${name}.png`, kb: +(buf.length / 1024).toFixed(0), blank: buf.length < 30000 });
  }

  // 1 · whole-track aerial
  await shot("aerial", () => window.__apex.view());
  // 2 · per-fraction orbit (three-quarter) + driver's-eye (exposes floats/gaps)
  for (const f of FRACS) {
    await shot(`s${pct(f)}-orbit`, (f) => window.__apex.orbit(f, 45, 18, 45), f);
    await shot(`s${pct(f)}-eye`,   (f) => window.__apex.eyeAt(f, 0, 2.2), f);
  }

  // 3 · lateral ground-profile probe (both sides; report the side with terrain)
  probeRows = await page.evaluate(({ fracs, lats }) => {
    const out = [];
    for (const f of fracs) {
      const cells = lats.map((lat) => {
        const R = window.__apex.groundY(f, lat), L = window.__apex.groundY(f, -lat);
        const pick = R.terrainY != null ? R : L;
        return { lat, terrainY: pick.terrainY, gap: pick.gap };
      });
      out.push({ frac: f, roadY: window.__apex.groundY(f, 0).roadY, cells });
    }
    return out;
  }, { fracs: FRACS, lats: LATS });

  await browser.close();
} catch (err) {
  console.error("survey failed:", err.message);
  process.exitCode = 1;
}

// ---- report -------------------------------------------------------------
console.log(`\n=== SURVEY ${id} (${label}) ===`);
console.log(`shots → scratch/survey-${id}/`);
for (const s of shots) console.log(`  ${s.blank ? "⚠ BLANK " : "        "}${s.name.padEnd(22)} ${s.kb}KB`);

// ground-profile table with auto-flagging of the classic failure modes
console.log(`\nground-profile  ("--" = no rendered terrain → props out there float on groundYAt)`);
const head = "frac   roadY  " + LATS.map((l) => String(l + "m").padStart(8)).join("");
console.log(head);
console.log("-".repeat(head.length));
const flags = [];
for (const r of probeRows) {
  // A genuine hole is a "--" SANDWICHED between rendered terrain (a gap props fall
  // into); a trailing "--" at the outer lats is just the ribbon edge (benign). A
  // STEP is a >1 m jump between adjacent solid readings (a cliff/channel).
  const solidIdx = r.cells.map((c, i) => (c.terrainY != null ? i : -1)).filter((i) => i >= 0);
  const firstSolid = solidIdx[0] ?? -1, lastSolid = solidIdx[solidIdx.length - 1] ?? -1;
  let sandwichHole = false, bigJump = false, prev = null;
  r.cells.forEach((c, i) => {
    if (c.terrainY == null) { if (i > firstSolid && i < lastSolid) sandwichHole = true; }
    else { if (prev != null && Math.abs(c.terrainY - prev) > 1.0) bigJump = true; prev = c.terrainY; }
  });
  const cells = r.cells.map((c) => (c.terrainY == null ? "--" : c.terrainY.toFixed(2)).padStart(8)).join("");
  const note = [sandwichHole && "HOLE", bigJump && "STEP"].filter(Boolean).join(",");
  if (note) flags.push(`  frac ${r.frac}: ${[sandwichHole && "terrain hole between rings → props float in the gap", bigJump && "abrupt terrain step (cliff/channel)"].filter(Boolean).join("; ")}`);
  console.log(String(r.frac).padEnd(7) + r.roadY.toFixed(2).padStart(5) + "  " + cells + (note ? "   ⚠ " + note : ""));
}
console.log("");
if (flags.length) { console.log("⚠ geometry flags (confirm with the EYE shots):"); flags.forEach((f) => console.log(f)); console.log(""); }
else console.log("✓ no terrain holes/steps flagged on the probed fractions\n");
if (shots.some((s) => s.blank)) console.log("⚠ one or more shots look blank — check scenery / camera.");
if (errs.length) console.log("page errors:", errs.slice(0, 5));
done();
