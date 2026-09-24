#!/usr/bin/env node
// @doc Contact sheet of the pre-race FLYBY shot sequence, flagging any frame with the camera inside scenery. `--track --frames --out --u --shots`.
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
 *
 *   node tools/shot/flyby.mjs                        # monza, 9 frames
 *   node tools/shot/flyby.mjs --track bahrain
 *   node tools/shot/flyby.mjs --u 0,0.38,0.72        # exact shot boundaries
 *   node tools/shot/flyby.mjs --frames 16 --out artifacts/flyby
 *   node tools/shot/flyby.mjs --shots scratch/shots.json   # an edited list, unbaked
 *
 * Besides one PNG per frame it writes `<track>-sheet.png`, every frame on one
 * image with its u and shot id, because a sequence is judged as a sequence.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { chromiumArgsForBackend, installProbeInit, gotoGame, screenshotPresentedCanvas } from "./probe-page.mjs";
import { pickChromium } from "../lib/harness.mjs";

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const TRACK = arg("track", "monza");
const OUT = arg("out", "artifacts/flyby");
const PORT = +arg("port", 3491);
const US = arg("u", null);
const FRAMES = +arg("frames", 9);
const W = +arg("width", 720), H = +arg("height", 405);
const BACKEND = arg("backend", "webgl2");
// An EDITED list to preview instead of the one the build plays: a JSON array,
// or the `window.FlybyShots = [...]` blob the editor's COPY VALUES exports.
const SHOTS_FILE = arg("shots", null);
function readShots(file) {
  const raw = fs.readFileSync(path.resolve(file), "utf8");
  const body = raw.replace(/^\s*(?:window\.)?[A-Za-z_$][\w$]*\s*=\s*/, "").replace(/;\s*$/, "");
  try { return JSON.parse(body); } catch (_) { return (0, eval)("(" + body + ")"); }
}
const SHOTS = SHOTS_FILE ? readShots(SHOTS_FILE) : null;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".bin": "application/octet-stream", ".ktx2": "application/octet-stream" };

/* Serve the WORKING TREE, so the sheet shows the shots as they are on disk
   right now — the whole point of an authoring loop. */
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end("no"); return;
      }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(PORT, "127.0.0.1", () => resolve(srv));
  });
}

const srv = await serve();
fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.APEX_CHROMIUM || pickChromium(),
  args: chromiumArgsForBackend(BACKEND),
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("pageerror", (e) => console.error("PAGEERROR", String(e).slice(0, 200)));
// The shared probe init: pins the backend and turns off view transitions, whose
// rejection in headless compositing raises the error overlay over the frame.
await installProbeInit(page, { backend: BACKEND });

await gotoGame(page, `http://127.0.0.1:${PORT}/`, 180000);
// A race builds the world; the flyby solver needs a built track, not a menu.
await page.evaluate((id) => window.__apex.race(id), TRACK);
await page.waitForFunction(() => window.__apex.info().track, null, { timeout: 180000, polling: 200 });
// HOLD THE FIELD ON THE GRID. This is a real race, and a software frame here
// costs seconds: without a freeze the lights went out while the sheet was still
// on the corners, the AI drove off, and the closing grid shots showed an empty
// straight — a defect in the capture, reported as one in the shot.
await page.evaluate(() => window.__apex.freeze(true));

const points = US ? US.split(",").map(Number)
  : Array.from({ length: FRAMES }, (_, i) => i / (FRAMES - 1 || 1));

const rows = [];
for (const u of points) {
  const r = await page.evaluate(([uu, shots]) => window.__apex.flybyCam(uu, shots || undefined), [u, SHOTS]);
  if (!r) { console.error("flybyCam unavailable — is the track built?"); break; }
  const name = `${TRACK}-u${String(Math.round(u * 100)).padStart(3, "0")}-${r.shot}${r.inside ? "-INSIDE" : ""}.png`;
  // Wait for a frame drawn AFTER the camera moved, then read the canvas the
  // backend actually presents (#game-soft in headless; #game is often black).
  const shot = await screenshotPresentedCanvas(page, { path: path.join(ROOT, OUT, name), awaitMs: 60000 });
  rows.push({ u: r.u, shot: r.shot, fov: r.fov, eyeY: r.eye[1], inside: r.inside && r.inside.kind, file: name,
    b64: shot.buf.toString("base64") });
}

// ONE SHEET, every frame labelled, composed in the page so no image library is
// needed: cuts, pacing and framing are only judgeable side by side.
if (rows.length) {
  const cols = Math.min(4, rows.length);
  const sheet = await page.evaluate(async ({ frames, cols, w, h }) => {
    const tw = Math.round(w / 2), th = Math.round(h / 2);
    const c = document.createElement("canvas");
    c.width = cols * tw; c.height = Math.ceil(frames.length / cols) * th;
    const g = c.getContext("2d");
    g.fillStyle = "#111"; g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < frames.length; i++) {
      const img = new Image();
      img.src = "data:image/png;base64," + frames[i].b64;
      await img.decode();
      const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
      g.drawImage(img, x, y, tw, th);
      g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(x, y, tw, 18);
      g.fillStyle = frames[i].inside ? "#ff5050" : "#fff"; g.font = "12px monospace";
      g.fillText(`u=${frames[i].u} ${frames[i].shot} fov ${frames[i].fov}${frames[i].inside ? " INSIDE" : ""}`, x + 4, y + 13);
    }
    return c.toDataURL("image/png").split(",")[1];
  }, { frames: rows, cols, w: W, h: H });
  fs.writeFileSync(path.join(ROOT, OUT, `${TRACK}-sheet.png`), Buffer.from(sheet, "base64"));
}

await browser.close();
srv.close();

console.log(`\n${TRACK} — ${rows.length} frames in ${OUT} (sheet: ${TRACK}-sheet.png)\n`);
for (const r of rows) {
  console.log(`  u=${String(r.u).padEnd(6)} ${String(r.shot).padEnd(10)} fov=${String(r.fov).padEnd(5)} ` +
    `eyeY=${r.eyeY.toFixed(1).padStart(6)}  ${r.inside ? "INSIDE " + r.inside : ""}`);
}
const bad = rows.filter((r) => r.inside);
console.log(bad.length ? `\n${bad.length} frame(s) with the camera inside scenery — fix the shot, not the margin.\n`
  : "\nNo frame has the camera inside scenery.\n");
process.exit(bad.length ? 1 : 0);
