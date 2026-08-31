#!/usr/bin/env node
// One-command track survey for scenery/geometry work. Self-booting: no server, no
// manual setup. Boots the game headless ONCE and produces everything an agent needs
// to judge a circuit's scenery in a single pass:
//   • screenshots → scratch/captures/survey-track/<id>/   (aerial + orbit + driver's-eye per spot)
//   • lateral ground-profile probe, printed as a table with auto-flagged problems
//     (floating props / channels / sagging ribbon) so you don't have to eyeball it
//   • a one-line verdict + any page errors
//
// Usage: node tools/survey-track.mjs <id> [label] [fracs] [--oblique]
//   id     circuit id (see __apex.tracks() / js/circuits/*.js), e.g. montreal
//   label  shot prefix, e.g. before | after   (default: survey)
//   fracs  comma list of lap fractions to shoot+probe (default 0,0.25,0.5,0.75)
//   --oblique  also write a bounds-fitted topdown + four high-oblique aerials
//              (N/E/S/W at 45°) — the old aerial-survey.mjs pass. Flag may sit
//              anywhere after the script name.
//
// Read the PNGs (the EYE shots expose floating props/gaps best) AND the probe table.
// For just the numbers without screenshots, use
// .claude/skills/survey-track/ground-profile.mjs.

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, sleep, startStaticServer } from "./harness.mjs";
import {
  assertSafePathToken,
  resolveContainedChild,
  resolveRepoDefault,
} from "./output-paths.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
export const SURVEY_USAGE = "usage: survey-track.mjs <id> [label] [fracs] [--oblique]";

/** Strip --flags anywhere; a lone comma-list after <id> is fracs, not a label. */
export function parseSurveyTrackArgs(argv) {
  const positionals = [];
  let oblique = false;
  for (const a of argv) {
    if (a === "--oblique") { oblique = true; continue; }
    if (a.startsWith("--")) continue;
    positionals.push(a);
  }
  const [idArg, ...rest] = positionals;
  if (!idArg) return { error: SURVEY_USAGE };
  let labelArg = "survey";
  let fracsArg = null;
  if (rest.length === 1) {
    if (rest[0].includes(",")) fracsArg = rest[0];
    else labelArg = rest[0];
  } else if (rest.length >= 2) {
    labelArg = rest[0];
    fracsArg = rest[1];
  }
  return {
    id: assertSafePathToken(idArg, "track id"),
    label: assertSafePathToken(labelArg, "label"),
    fracs: (fracsArg || "0,0.25,0.5,0.75").split(",").map(Number),
    oblique,
  };
}

function invokedAsCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(entry);
  } catch {
    return false;
  }
}

if (invokedAsCli()) await runSurvey(parseSurveyTrackArgs(process.argv.slice(2)));

async function runSurvey(parsed) {
if (parsed.error) { console.error(parsed.error); process.exit(2); }
const { id, label, fracs: FRACS, oblique } = parsed;
const LATS = [8, 12, 20, 30, 45, 70, 110];   // lateral metres for the ground probe
const OUT = resolveRepoDefault(ROOT, "scratch", "captures", "survey-track", id);
mkdirSync(OUT, { recursive: true });

const pct = (f) => String(Math.round(f * 100)).padStart(2, "0");

const srv = await startStaticServer(ROOT);

const shots = [];
let probeRows = [], errs = [];
try {
  const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errs.push(String(e.message).split("\n")[0]));
  page.setDefaultTimeout(60000);
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__apex != null, null, { timeout: 20000, polling: 100 });

  // race the track (retry once if a concurrent edit briefly broke the page)
  let ok = false;
  for (let t = 0; t < 3 && !ok; t++) {
    await page.evaluate((tid) => window.__apex.race(tid, "day", "dry"), id);
    ok = await page.waitForFunction(() => window.__apex.info().track != null, null, { timeout: 9000, polling: 100 }).then(() => true).catch(() => false);
    if (!ok) await sleep(500);
  }
  if (!ok) {
    console.error(`FAILED to load ${id} — scenery(api) may throw. Run: node tools/verify-track.cjs ${id}`);
    await shutdown();
    process.exit(1);
  }
  await sleep(1400);
  await page.evaluate(() => window.__apex.hud(false));

  // page.screenshot({ clip }) grabs the current framebuffer via CDP directly and
  // SKIPS Playwright's element-actionability/stability checks — those never settle
  // on a continuously-animating WebGL canvas (and time out hard under the heavy
  // SwiftShader/CPU load of several surveys running at once).
  async function shot(name, fn, arg) {
    await page.evaluate(fn, arg);
    await sleep(220);
    const path = resolveContainedChild(
      OUT,
      `${label}-${name}.png`,
      "survey screenshot path"
    );
    const box = await page.locator("canvas#game").boundingBox();
    const buf = box
      ? await page.screenshot({ path, clip: box, timeout: 60000 })
      : await page.screenshot({ path, timeout: 60000 });
    shots.push({ name: `${label}-${name}.png`, kb: +(buf.length / 1024).toFixed(0), blank: buf.length < 30000 });
  }

  // 1 · whole-track aerial
  await shot("aerial", () => window.__apex.view());
  // 1b · bounds-fitted topdown + N/E/S/W high obliques (the old aerial-survey pass)
  if (oblique) {
    const bounds = await page.evaluate(() => window.__apex.trackBounds());
    console.log(`bounds ${id}: ${JSON.stringify(bounds)}`);
    const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    const cy = bounds.minY != null ? bounds.minY : 0;
    const span = Math.max(bounds.spanX, bounds.spanZ);
    await shot("topdown", ({ cx, cy, cz, span }) => {
      const vf = 60 * Math.PI / 180, aspect = window.innerWidth / window.innerHeight;
      const altZ = (span / 2) / Math.tan(vf / 2);
      const altX = (span / 2) / Math.tan(Math.atan(Math.tan(vf / 2) * aspect));
      const alt = Math.ceil(Math.max(altZ, altX) * 1.18);
      window.__apex.view({ eye: [cx, cy + alt, cz + 0.1], target: [cx, cy, cz] });
    }, { cx, cy, cz, span });
    const dist = Math.ceil(span * 0.85);
    const el = 42 * Math.PI / 180;
    const dirs = { N: 0, E: Math.PI / 2, S: Math.PI, W: 3 * Math.PI / 2 };
    for (const [name, az] of Object.entries(dirs)) {
      await shot(`oblique${name}`, ({ cx, cy, cz, dist, el, az }) => {
        const h = Math.sin(el) * dist, r = Math.cos(el) * dist;
        const ex = cx + Math.sin(az) * r, ez = cz + Math.cos(az) * r;
        window.__apex.view({ eye: [ex, cy + h + 20, ez], target: [cx, cy + 5, cz] });
      }, { cx, cy, cz, dist, el, az });
    }
  }
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
} catch (err) {
  console.error("survey failed:", err.message);
  process.exitCode = 1;
} finally {
  // Browser + server go together, on the throw path as well — a screenshot
  // timeout used to leave both alive and pin the box.
  await shutdown();
}

// ---- report -------------------------------------------------------------
console.log(`\n=== SURVEY ${id} (${label}) ===`);
console.log(`shots → scratch/captures/survey-track/${id}/`);
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
}
