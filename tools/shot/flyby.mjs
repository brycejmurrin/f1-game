#!/usr/bin/env node
// @doc Contact sheet of the pre-race FLYBY shot sequence, flagging any frame with the camera inside scenery. `--track --frames --out --u`.
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
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

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
  executablePath: process.env.APEX_CHROMIUM || "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("pageerror", (e) => console.error("PAGEERROR", String(e).slice(0, 200)));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });
await page.waitForFunction(() => window.__apex && window.__apex.info, null, { timeout: 120000, polling: 100 });
// A race builds the world; the flyby solver needs a built track, not a menu.
await page.evaluate((id) => window.__apex.race(id), TRACK);
await page.waitForFunction(() => window.__apex.info().track, null, { timeout: 180000, polling: 200 });

const points = US ? US.split(",").map(Number)
  : Array.from({ length: FRAMES }, (_, i) => i / (FRAMES - 1 || 1));

const rows = [];
for (const u of points) {
  const info = await page.evaluate(async (uu) => {
    const r = window.__apex.flybyCam(uu);
    // The canvas is not composited in headless Chrome; the backend blits the
    // real frame onto an overlay ON DEMAND, so ask for it, then read that.
    try { await window.__apex.awaitPresent(60000); } catch (_) { /* nothing drawn */ }
    return { r, png: document.getElementById("game-soft").toDataURL("image/png") };
  }, u);
  const r = info.r;
  if (!r) { console.error("flybyCam unavailable — is the track built?"); break; }
  const name = `${TRACK}-u${String(Math.round(u * 100)).padStart(3, "0")}-${r.shot}${r.inside ? "-INSIDE" : ""}.png`;
  fs.writeFileSync(path.join(ROOT, OUT, name), Buffer.from(info.png.split(",")[1], "base64"));
  rows.push({ u: r.u, shot: r.shot, fov: r.fov, eyeY: r.eye[1], inside: r.inside && r.inside.kind, file: name });
}

await browser.close();
srv.close();

console.log(`\n${TRACK} — ${rows.length} frames in ${OUT}\n`);
for (const r of rows) {
  console.log(`  u=${String(r.u).padEnd(6)} ${String(r.shot).padEnd(10)} fov=${String(r.fov).padEnd(5)} ` +
    `eyeY=${r.eyeY.toFixed(1).padStart(6)}  ${r.inside ? "INSIDE " + r.inside : ""}`);
}
const bad = rows.filter((r) => r.inside);
console.log(bad.length ? `\n${bad.length} frame(s) with the camera inside scenery — fix the shot, not the margin.\n`
  : "\nNo frame has the camera inside scenery.\n");
process.exit(bad.length ? 1 : 0);
