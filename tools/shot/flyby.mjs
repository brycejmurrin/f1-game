#!/usr/bin/env node
// @doc Contact sheet + JSON of the pre-race FLYBY shot sequence, flagging a camera inside scenery. `--track a,b --frames --out --u --shots`.
/*
 * flyby.mjs — SEE THE FLYBY WITHOUT RACING IT.
 *
 * The live flyby is driven by the loading screen's phase timer and lasts a few
 * seconds. That is not something a capture tool can aim at: on a software
 * renderer a single screenshot costs longer than the whole phase, so every
 * attempt to photograph a particular shot lands somewhere else. This drives the
 * SAME solver deterministically instead, through __apex.flybyCam(u), which
 * parks the camera via the dbgCam override photo mode uses.
 *
 * It is the authoring loop's eyes: change a shot in js/camera/flyby-seq.js, run
 * this, look at the sheet. And it is the clipping check with a picture attached
 * — every frame reports whether the eye landed inside a building, which the
 * headless test (tests/unit/flyby-shots.test.mjs) asserts but cannot show you.
 * It flags by the TEST's rule: a shot running down the road is exempt from
 * containment (axis-aligned boxes of angled grandstands cross the straight) and
 * is held to |lat| <= 12 m instead, so the sheet and the test agree.
 *
 *   node tools/shot/flyby.mjs                        # monza, 9 frames
 *   node tools/shot/flyby.mjs --track bahrain
 *   node tools/shot/flyby.mjs --track monza,monaco,bahrain   # ONE boot, three sheets
 *   node tools/shot/flyby.mjs --u 0,0.38,0.72        # exact shot boundaries
 *   node tools/shot/flyby.mjs --frames 16 --out artifacts/flyby
 *   node tools/shot/flyby.mjs --shots scratch/shots.json   # an edited list, unbaked
 *
 * Per track it writes one PNG per frame, `<track>-sheet.png` (every frame on one
 * image with its u and shot id, because a sequence is judged as a sequence) and
 * `<track>-flyby.json` (the per-frame numbers, for a script or an agent).
 * The page is served from the working tree on a free port (--port to pin one).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { installProbeInit, gotoGame, screenshotPresentedCanvas, chromiumArgsForBackend } from "./probe-page.mjs";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { readBlob, shotErrors } from "../gen/bake-flyby.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const die = (msg) => { console.error("flyby: " + msg); process.exit(2); };

const TRACKS = arg("track", "monza").split(",").map((s) => s.trim()).filter(Boolean);
const OUT = arg("out", "artifacts/flyby");
const PORT = +arg("port", 0);
const US = arg("u", null);
const FRAMES = +arg("frames", 9);
const W = +arg("width", 720), H = +arg("height", 405);
const BACKENDS = ["webgl2", "three", "webgpu"];
const BACKEND = arg("backend", "webgl2");
const ON_ROAD_LAT = 12;       // tests/unit/flyby-shots.test.mjs's on-road bound
const MAX_LIFT = 25;          // …and its "rescued, not framed" bound

// ---- everything checkable before a 60 s boot is checked before it ----------
if (!BACKENDS.includes(BACKEND)) die(`--backend must be one of ${BACKENDS.join(", ")} (got "${BACKEND}")`);
if (!(FRAMES >= 1) || !Number.isInteger(FRAMES)) die(`--frames must be a positive integer (got "${arg("frames")}")`);
if (!(PORT >= 0 && PORT < 65536)) die(`--port must be 0..65535 (got "${arg("port")}")`);
const { CIRCUITS } = require(path.join(ROOT, "tools/manifest.cjs"));
const unknown = TRACKS.filter((t) => !CIRCUITS.includes(t));
if (unknown.length) die(`unknown track id ${unknown.map((t) => `"${t}"`).join(", ")} — available: ${CIRCUITS.join(", ")}`);
const points = US ? US.split(",").map(Number)
  : Array.from({ length: FRAMES }, (_, i) => i / (FRAMES - 1 || 1));
if (points.some((u) => !Number.isFinite(u) || u < 0 || u > 1)) die(`--u takes numbers in 0..1 (got "${US}")`);

// An EDITED list to preview instead of the one the build plays: a JSON array,
// or the `window.FlybyShots = [...]` blob the editor's COPY VALUES exports —
// including one headed `// THIS LIST WILL NOT BAKE` (unnormalised durations
// preview fine). Parsed by the bake tool's own reader (sandboxed, no eval) and
// held to the PLAYABLE rules, not the bake's sum rule.
let SHOTS = null;
const SHOTS_FILE = arg("shots", null);
if (SHOTS_FILE) {
  try { SHOTS = readBlob(fs.readFileSync(path.resolve(SHOTS_FILE), "utf8")); }
  catch (e) { die(`--shots ${SHOTS_FILE}: ${e.message}`); }
  const bad = shotErrors(SHOTS);
  if (bad.length) die(`--shots ${SHOTS_FILE} cannot play:\n  - ${bad.join("\n  - ")}`);
}

/** Is this frame a defect, by the unit test's rule? A reason string, or "". */
function defect(r) {
  if (r.onRoad) return (r.lat == null || Math.abs(r.lat) > ON_ROAD_LAT)
    ? `claims the road but sits ${r.lat == null ? "?" : r.lat.toFixed(1)} m off the centreline` : "";
  if (r.inside) return "INSIDE " + r.inside.kind;
  return "";
}

async function shootTrack(page, track) {
  // A race builds the world; the flyby solver needs a built track, not a menu.
  const ok = await page.evaluate(async (id) => {
    const r = window.__apex.race(id);
    if (!r) return false;
    await r;
    return true;
  }, track);
  if (!ok) throw new Error(`__apex.race("${track}") refused the track id`);
  // BY ID: after the first track info().track is already truthy, and a bare
  // truthiness wait would shoot the previous circuit.
  await page.waitForFunction((id) => window.__apex.info().track === id, track, { timeout: 180000, polling: 200 });
  // HOLD THE FIELD ON THE GRID. This is a real race, and a software frame here
  // costs seconds: without a freeze the lights went out while the sheet was still
  // on the corners, the AI drove off, and the closing grid shots showed an empty
  // straight — a defect in the capture, reported as one in the shot. Re-armed per
  // track: startRace() clears it.
  await page.evaluate(() => window.__apex.freeze(true));

  const rows = [];
  for (const u of points) {
    const r = await page.evaluate(([uu, shots]) => window.__apex.flybyCam(uu, shots || undefined), [u, SHOTS]);
    if (!r) throw new Error("flybyCam unavailable — is the track built?");
    const bad = defect(r);
    const name = `${track}-u${String(Math.round(u * 100)).padStart(3, "0")}-${r.shot}${bad ? "-BAD" : ""}.png`;
    // Wait for a frame drawn AFTER the camera moved, then read the canvas the
    // backend actually presents (#game-soft in headless; #game is often black).
    const shot = await screenshotPresentedCanvas(page, { path: path.join(ROOT, OUT, name), awaitMs: 60000 });
    rows.push({
      u: r.u, shot: r.shot, index: r.index, fov: r.fov, eye: r.eye, target: r.target,
      lift: r.lift, onRoad: r.onRoad, lat: r.lat, inside: r.inside, defect: bad || null,
      liftWarn: r.lift >= MAX_LIFT, file: name, b64: shot.buf.toString("base64"),
    });
  }

  // ONE SHEET, every frame labelled, composed in the page so no image library is
  // needed: cuts, pacing and framing are only judgeable side by side.
  const cols = Math.min(4, rows.length);
  const sheet = await page.evaluate(async ({ frames, cols, w, h }) => {
    const tw = Math.round(w / 2), th = Math.round(h / 2);
    const c = document.createElement("canvas");
    c.width = cols * tw; c.height = Math.ceil(frames.length / cols) * th;
    const g = c.getContext("2d");
    g.fillStyle = "#111"; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const img = new Image();
      img.src = "data:image/png;base64," + f.b64;
      await img.decode();
      const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
      g.drawImage(img, x, y, tw, th);
      g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(x, y, tw, 18);
      g.fillStyle = f.defect ? "#ff5050" : (f.liftWarn ? "#ffc040" : "#fff"); g.font = "12px monospace";
      g.fillText(`u=${f.u} ${f.shot} fov ${f.fov}${f.lift > 0.05 ? " lift " + f.lift : ""}` +
        `${f.defect ? " " + f.defect.split(" ")[0] : ""}`, x + 4, y + 13);
    }
    return c.toDataURL("image/png").split(",")[1];
  }, { frames: rows, cols, w: W, h: H });
  fs.writeFileSync(path.join(ROOT, OUT, `${track}-sheet.png`), Buffer.from(sheet, "base64"));
  for (const r of rows) delete r.b64;
  fs.writeFileSync(path.join(ROOT, OUT, `${track}-flyby.json`), JSON.stringify({
    track, backend: BACKEND, shots: SHOTS_FILE || null, sheet: `${track}-sheet.png`, frames: rows,
  }, null, 2) + "\n");
  return rows;
}

function report(track, rows) {
  console.log(`\n${track} — ${rows.length} frames in ${OUT} (sheet: ${track}-sheet.png, data: ${track}-flyby.json)\n`);
  for (const r of rows) {
    console.log(`  u=${String(r.u).padEnd(6)} ${String(r.shot).padEnd(12)} fov=${String(r.fov).padEnd(5)} ` +
      `eyeY=${r.eye[1].toFixed(1).padStart(6)}${r.lift > 0.05 ? `  lift ${r.lift.toFixed(1)}` : ""}` +
      `${r.onRoad ? "  on-road" : ""}${r.defect ? "  " + r.defect : ""}${r.liftWarn ? "  LIFT >= " + MAX_LIFT : ""}`);
  }
}

let failed = 0, exitCode = 0;
try {
  fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
  // Serve the WORKING TREE, so the sheet shows the shots as they are on disk
  // right now — the whole point of an authoring loop. Port 0 by default: two
  // sheets rendering at once no longer fight over a fixed port.
  const srv = await startStaticServer(ROOT, { port: PORT });
  const browser = await launchChromium({
    args: chromiumArgsForBackend(BACKEND),
    ...(process.env.APEX_CHROMIUM ? { executablePath: process.env.APEX_CHROMIUM } : {}),
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("pageerror", (e) => console.error("PAGEERROR", String(e).slice(0, 200)));
  // The shared probe init: pins the backend and turns off view transitions, whose
  // rejection in headless compositing raises the error overlay over the frame.
  await installProbeInit(page, { backend: BACKEND });
  await gotoGame(page, srv.url, 180000);
  for (const track of TRACKS) {
    const rows = await shootTrack(page, track);
    report(track, rows);
    failed += rows.filter((r) => r.defect).length;
  }
  console.log(failed ? `\n${failed} frame(s) with the camera inside scenery — fix the shot, not the margin.\n`
    : "\nNo frame has the camera inside scenery.\n");
  exitCode = failed ? 1 : 0;
} catch (e) {
  console.error("flyby: " + (e && e.stack || e));
  exitCode = 2;
} finally {
  await shutdown();
}
process.exit(exitCode);
