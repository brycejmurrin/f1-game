#!/usr/bin/env node
// repro-shot.mjs — render a PLAYER'S EXACT FRAME from an __apex.repro() blob.
// @doc Render a player's exact frame from an `__apex.repro()` blob. Its COCKPIT output is WRONG — read the header.
// @skill playwright-probe
//
// Usage:
//   node tools/repro-shot.mjs <repro.json> [out.png] [--w 1600] [--h 720]
//
// ITS COCKPIT OUTPUT IS WRONG, CAUSE NOT ISOLATED — measured 2026-09-02. The
// shot comes back with no steering wheel, no dash and no instruments: a
// viewpoint no player has. Reproduced at 1280x720 and 2000x920, with and
// without a camera tune. Six rounds of a cockpit-artefact hunt died on it,
// chasing geometry that was never in frame.
//
// Three explanations have been MEASURED AND RULED OUT, so do not re-spend the
// time on them:
//   - not the camera. camState().eye lands on the car (eye [127.13, 0.87,
//     -241.94] vs car px/pz 127.09/-242.14), exactly as the working flow does.
//   - not a swallowed exception. Console and pageerror are clean; info() reports
//     state "race", camera "cockpit".
//   - not missing geometry. Wrapping GLX.draw for one frame shows 21 draws
//     including the 1548-vertex steering wheel, both front wheels, the LED
//     strip, gear digit and speed digits — every one submitted, every frame.
//
// So the rig is submitted from a correct camera and still is not visible. That
// leaves renderer state or capture timing, and neither has been proven.
//
// UNTIL IT IS, drive the frame by hand and let the game RUN — this is the flow
// that produces a correct cockpit frame (verified same day):
//   race(track, tod, wx) -> go() -> camera("cockpit") -> camTune(...) -> jump(...)
// then wait a few seconds before screenshotting. Chase/TV cameras look fine, but
// they have not been checked against a known-good reference either.
//
// The blob comes from the player: open the console and run
//   copy(JSON.stringify(__apex.repro()))
// or read it off the debug overlay. It carries the circuit, conditions, camera
// MODE plus the CAMERA TUNER offsets, and every car's position on track.
//
// Why the reload: team and halo are read from localStorage at boot, so they
// cannot be restored by a live call. This seeds them, reloads, and only then
// replays the frame — and it FAILS LOUDLY if the team it ends up with is not
// the team in the blob, because rendering the wrong car is precisely the
// mistake this tool exists to stop.
import { readFileSync } from "node:fs";
import { startStaticServer, launchChromium, shutdown } from "./harness.mjs";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const src = positional[0];
if (!src) { console.error("usage: node tools/repro-shot.mjs <repro.json> [out.png]"); process.exit(2); }
const out = positional[1] || "artifacts/repro.png";
const W = +flag("--w", 1600), H = +flag("--h", 720);
const blob = JSON.parse(readFileSync(src, "utf8"));

const srv = await startStaticServer(process.cwd());
const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(srv.url + "index.html", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 90000 });
  // Boot-time settings first, then reload so the car is built from them.
  await page.evaluate((b) => {
    try {
      if (b.teamIdx != null) localStorage.setItem("apex26.team", String(b.teamIdx));
      if (b.halo != null) localStorage.setItem("apex26.cockpitHalo", b.halo ? "1" : "0");
    } catch (_) { /* private mode: the assert below still catches a mismatch */ }
  }, blob);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 90000 });

  await page.evaluate((b) => window.__apex.race(b.track, b.tod || "day", b.wx || "dry"), blob);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 90000 });
  const res = await page.evaluate((b) => { window.__apex.go(); return window.__apex.repro(b); }, blob);
  console.log("restored:", JSON.stringify(res));
  if (res && res.teamMatches === false) {
    console.error(`REFUSING: the blob is team "${blob.teamId}" but this session built a different car. ` +
      "Set apex26.team to that team's index and retry — a shot of the wrong car is worse than no shot.");
    process.exitCode = 1;
  }
  await page.waitForTimeout(2500);
  // SELF-CHECK. This tool has shipped a wrong cockpit frame before, silently:
  // the camera is meant to sit ON the car for every onboard mode, so measure it
  // instead of trusting it. A shot that fails this is not evidence about
  // anything and says so on the way out.
  const chk = await page.evaluate(() => {
    const A = window.__apex, c = A.camState(), p = A.physState() || {};
    const eye = c.eye || [0, 0, 0];
    const d = (p.px == null || p.pz == null) ? null
      : Math.hypot(eye[0] - p.px, eye[2] - p.pz);
    return { mode: A.camera().mode, eye: eye.map((n) => +n.toFixed(2)), fov: +(c.fov || 0).toFixed(1),
             car: p.px == null ? null : [+p.px.toFixed(2), +p.pz.toFixed(2)], eyeToCar: d == null ? null : +d.toFixed(2),
             state: A.info().state };
  });
  console.log("camera:", JSON.stringify(chk));
  const ONBOARD = new Set(["cockpit", "hood", "tcam"]);
  if (ONBOARD.has(chk.mode) && (chk.eyeToCar == null || chk.eyeToCar > 1.5)) {
    console.error(`REFUSING: camera mode "${chk.mode}" is an ONBOARD cam, so the eye must ride the car, ` +
      `but it is ${chk.eyeToCar == null ? "unplaceable (no car pose)" : chk.eyeToCar + " m away"}. ` +
      "The frame below is not the view the blob describes.");
    process.exitCode = 1;
  }
  const box = await page.evaluate(() => {
    const r = document.getElementById("game").getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  // 120 s: a SwiftShader frame holds the main thread for seconds, so the
  // capture itself is slow (docs/TESTING.md, the click-cost field note).
  await page.screenshot({ path: out, clip: box, timeout: 120000 });
  console.log("wrote", out);
} finally { await shutdown(browser, srv); }
