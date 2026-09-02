#!/usr/bin/env node
// repro-shot.mjs — render a PLAYER'S EXACT FRAME from an __apex.repro() blob.
// @doc Render a player's exact frame from an `__apex.repro()` blob. BROKEN for COCKPIT — read the header first.
// @skill playwright-probe
//
// Usage:
//   node tools/repro-shot.mjs <repro.json> [out.png] [--w 1600] [--h 720]
//
// BROKEN FOR THE COCKPIT CAMERA — measured 2026-09-02. __apex.repro() sets
// G.frozen and snaps the camera, and the cockpit rig's camera does NOT converge
// from that state: the shot comes back showing no steering wheel, no dash and no
// instruments, which is a viewpoint no player ever has. Six rounds of a
// cockpit-artefact hunt died on exactly that, chasing geometry that was never in
// frame. Until this is fixed, drive the frame by hand and let the game RUN:
//   race(track, tod, wx) -> go() -> camera("cockpit") -> camTune(...) -> jump(...)
// then wait a few seconds before screenshotting. Chase/TV cameras are unaffected.
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
  const box = await page.evaluate(() => {
    const r = document.getElementById("game").getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  // 120 s: a SwiftShader frame holds the main thread for seconds, so the
  // capture itself is slow (docs/TESTING.md, the click-cost field note).
  await page.screenshot({ path: out, clip: box, timeout: 120000 });
  console.log("wrote", out);
} finally { await shutdown(browser, srv); }
