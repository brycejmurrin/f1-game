#!/usr/bin/env node
// flicker-gate.mjs — the RENDERED z-fighting gate: park a still camera at known
// @doc Rendered z-fighting gate: still camera at known fight sites, sub-mm dolly jitter, per-site flip ceiling; JSON + exit 1.
// @skill playwright-probe
// former fight sites, render a few frames with a sub-millimetre dolly, and
// count the pixels that re-roll between frames. docs/notes/SCENERY-QA-PLAN.md
// §2 E and §2b G2 are the design; tools/lib/flicker-metric.mjs is the metric
// (and says why a tiny dolly separates a fight from ordinary motion).
//
// Every scenery check before this was a node-VM geometry audit; the one tool
// that measured flicker on screen (motion-capture.mjs) scores a DRIVEN video
// clip — the right instrument for "does it shimmer in motion", but a moving
// camera makes every frame differ, so it cannot hold a ceiling. This one holds
// the camera still, so any change between frames is either a frozen-clock leak
// (A vs A2, reported on its own) or depth re-rolling (the jitter frames).
//
// Usage:
//   node tools/shot/flicker-gate.mjs                        # every site
//   node tools/shot/flicker-gate.mjs --site madrid-overpass-soffit --site monza-startline-grid
//   node tools/shot/flicker-gate.mjs --list                 # print the site table, no browser
//   node tools/shot/flicker-gate.mjs --backend three        # TLX (default: webgl2 = GLX)
//   node tools/shot/flicker-gate.mjs --root <tree>          # serve ANOTHER checkout (positive control)
//   node tools/shot/flicker-gate.mjs --out artifacts/flicker-gate --png
// Output: <out>/flicker-gate.json (per site + summary); with --png also each
// site's A frame and its fight mask as grayscale PNGs. Exit 1 when any site
// fails its ceiling, errors, or no site could be measured; 0 otherwise.
// APEX_GL=llvmpipe swaps SwiftShader for Mesa llvmpipe (CI's browser gates do).
//
// POSITIVE CONTROL (plan G2: "the pre-fix madrid.js must go red"). The madrid
// soffits shared their decks' bottom plane until 3b711e3f0:
//   git worktree add scratch/pre-soffit 3b711e3f0^
//   node tools/shot/flicker-gate.mjs --root scratch/pre-soffit --site madrid-overpass-soffit
// must exit 1 with a `fight` reason, and the same command on HEAD exit 0.
// Until that pair has been run, a green here proves only that nothing crashed.
//
// CALIBRATION — how the per-site ceilings (`maxFrac`) were set, and what they are
// NOT. They are NOT measured: this file was written in a container that may not
// run a browser inside a subagent, so no frame of it has been rendered yet. They
// are set from geometry, conservatively, so the gate cannot go red on noise:
//   ceiling = ~1/10 of the frame area the site's TARGET surface covers at its
//   pose, i.e. a fight over a tenth of the surface fails and anything smaller
//   passes. A full coplanar overlap re-rolls ~69 % of its pixels under the
//   2-of-4 rule (flicker-metric.mjs), so the known defect at each site clears
//   its ceiling by ~7x, while speckle, AA crawl and a few-pixel seam do not.
// Tightening: the job uploads every run's JSON. After ~5 runs with A == A2
// exactly (still.diffPx 0) at every site, set each ceiling to ~3x the largest
// observed fight.frac (floor 0.0005) and make the job blocking (plan G2).
//
// Frozen time sources, each one a way A and A2 could differ: park() (physics
// frozen, field cleared), renderClock(100, true) (sky, clouds, flag cloth),
// lightTune lampFlicker 0 + lampWarmup 0 (frame-lights.js reads performance.now()),
// renderScale(1) + govHold(true) (the governor's size and feature tier), race
// in "day" + "dry", hud(false). The debug camera (view()) has no damping.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchChromium, shutdown, sleep, startStaticServer } from "../lib/harness.mjs";
import { chromiumArgsForBackend, installProbeInit, gotoGame, screenshotPresentedCanvas } from "./probe-page.mjs";
import { DEFAULTS, flickerScore, judge, lumaFromRGBA } from "../lib/flicker-metric.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");

/** Near plane as the game sets it for chase/TV cameras (SCENERY-QA-PLAN §1), and
 *  the game's far plane — the debug camera would otherwise use 6000 m. */
const FAR_M = 900;

/** Jitter offsets, as multiples of a site's `jitterM`, along the view ray. */
const JITTER = [1, -1, 2, -2];

/**
 * THE SITES. Poses are track-relative, so a site survives a circuit edit that
 * moves its geometry along the lap:
 *   frac   where the site is. `space: "scenery"` is a SCENERY frac — the number
 *          the circuit file passes to K()/overheadSpan — resolved through
 *          nodeAt(frac, {scenery: true}); "racing" is the lap fraction itself.
 *   eye / look   [fwd m along the lap, right m (+ = right of travel), up m over
 *          the road at THAT point], relative to the site node.
 *   aim    optional: "grandstand" aims `look` at the nearest scene() grandstand,
 *          "pit" puts the target on the pit side (pit().side) at `look`'s |right|.
 *   jitterM  the dolly unit (JITTER multiples of it). 1 mm unless the nearest
 *          visible geometry is far enough to afford more (see flicker-metric.mjs).
 *   maxFrac  the ceiling (CALIBRATION above); `target` says what it is 1/10 of.
 * Sources: docs/notes/SCENERY-QA-PLAN.md §2 A/B, docs/notes/DEFECT-LEDGER.md
 * "Scenery QA batch (2026-09-24)".
 */
export const SITES = [
  {
    id: "madrid-overpass-soffit", track: "madrid", space: "scenery", frac: 0.085,
    eye: [-6, 0, 1.3], look: [2, 0, 6.2], fov: 70, jitterM: 0.001, maxFrac: 0.02,
    target: "soffit ~40% of frame", why: "motorway overpass soffit shared the deck's bottom plane (216 m2, 0.0 mm) until 3b711e3f0 — THE reported flicker",
  },
  {
    id: "madrid-ifema-soffit", track: "madrid", space: "scenery", frac: 0.885,
    eye: [-6, 0, 1.3], look: [2, 0, 6.4], fov: 70, jitterM: 0.001, maxFrac: 0.02,
    target: "soffit ~40% of frame", why: "IFEMA access bridge soffit, same defect (203 m2)",
  },
  {
    id: "monaco-tunnel-vault", track: "monaco", space: "racing", frac: 0.47,
    eye: [0, 0, 1.3], look: [25, 0, 5.0], fov: 70, jitterM: 0.001, maxFrac: 0.01,
    target: "vault underside ~50% of frame, band meets ~10%", why: "roof / haunch / springing bands step down; their faces must never share a plane",
  },
  {
    id: "monaco-tunnel-top", track: "monaco", space: "racing", frac: 0.49,
    eye: [-40, 30, 35], look: [0, 0, 7.8], fov: 55, jitterM: 0.002, maxFrac: 0.005,
    target: "roof tops ~10% of frame", why: "roof, haunch and springing all topped out at road + 7.80 m (124 pairs) until 3b711e3f0",
  },
  {
    id: "miami-turnpike-underside", track: "miami", space: "scenery", frac: 0.66,
    eye: [-8, 0, 1.3], look: [2, 0, 10.4], fov: 70, jitterM: 0.001, maxFrac: 0.01,
    target: "deck underside ~30% of frame", why: "overpass deck, auto supports and pier caps (pier shafts shared the cap top until 3b711e3f0)",
  },
  {
    id: "monza-startline-grid", track: "monza", space: "racing", frac: 0.0,
    eye: [-30, 0, 1.6], look: [0, 0, 0], fov: 60, jitterM: 0.001, maxFrac: 0.003,
    target: "start line + grid boxes ~5% of frame", why: "start line / grid-box paint vs the asphalt (_startBias was weaker than the road's)",
  },
  {
    id: "monza-startline-far", track: "monza", space: "racing", frac: 0.0,
    eye: [-150, 0, 2.5], look: [0, 0, 0], fov: 12, jitterM: 0.01, maxFrac: 0.004,
    target: "paint ~8% of a telephoto frame", why: "the same decal at range, where a depth bias loses to quantisation (depth step ~1.5 mm at 150 m)",
  },
  {
    id: "zandvoort-pit-roofs", track: "zandvoort", space: "racing", frac: 0.0, aim: "pit",
    eye: [-60, -8, 25], look: [0, 22, 5], fov: 55, jitterM: 0.002, maxFrac: 0.005,
    target: "pit building / canopy tops ~10% of frame", why: "pit canopy shell tops shared the roof plane (40 circuits); pits.js bay face vs jamb/lintel skin at 5-11 mm (T4)",
  },
  {
    id: "monza-main-grandstand", track: "monza", space: "racing", frac: 0.0, aim: "grandstand",
    eye: [0, 0, 3.0], look: [0, 0, 0], fov: 60, jitterM: 0.001, maxFrac: 0.005,
    target: "grandstand ~20% of frame, plank/riser faces ~5%", why: "grandstand plank vs riser (structures.js) and crowd rows inside the stand shell (P2)",
  },
];

function parseArgs(argv) {
  const o = { sites: [], backend: "webgl2", root: ROOT, out: join(ROOT, "artifacts", "flicker-gate"), png: false, list: false, width: 960, height: 540 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v == null) throw new Error(`${a} needs a value`); return v; };
    if (a === "--site") o.sites.push(val());
    else if (a === "--backend") o.backend = val();
    else if (a === "--root") o.root = resolve(val());
    else if (a === "--out") o.out = resolve(val());
    else if (a === "--png") o.png = true;
    else if (a === "--list") o.list = true;
    else if (a === "-h" || a === "--help") o.help = true;
    else throw new Error(`unknown argument ${a} (see the header of tools/shot/flicker-gate.mjs)`);
  }
  if (!["webgl2", "three", "webgpu"].includes(o.backend)) throw new Error(`--backend must be webgl2, three or webgpu, got ${o.backend}`);
  return o;
}

/** Resolve a site's pose in the page: returns {eye, target, fov} in world metres, or {skip}. */
async function poseFor(page, site) {
  return page.evaluate((s) => {
    const a = window.__apex;
    const n0 = a.nodeAt(s.frac, s.space === "scenery" ? { scenery: true } : undefined);
    if (!n0) return { skip: "nodeAt returned null (no track)" };
    const racing = n0.frac;
    const parked = a.park(racing);
    if (!parked || !parked.total) return { skip: "park() failed" };
    const L = parked.total;
    const at = (off) => {
      const n = a.nodeAt(((racing + off[0] / L) % 1 + 1) % 1);
      return [n.x + n.rx * off[1], n.y + off[2], n.z + n.rz * off[1]];
    };
    const eyeOff = s.eye.slice(), lookOff = s.look.slice();
    let target = null;
    if (s.aim === "pit") {
      const p = a.pit ? a.pit() : null;
      const side = p && (p.side === 1 || p.side === -1) ? p.side : 1;
      eyeOff[1] = -side * Math.abs(eyeOff[1]);
      lookOff[1] = side * Math.abs(lookOff[1]);
    } else if (s.aim === "grandstand") {
      const sc = a.scene({ radius: 300, kinds: ["grandstand"], limit: 1 });
      const g = sc && sc.props && sc.props[0];
      if (!g || !g.at) return { skip: "no grandstand within 300 m of the site" };
      target = g.at.slice();
    }
    return { eye: at(eyeOff), target: target || at(lookOff), fov: s.fov, racing };
  }, site);
}

/** Wait for `n` fresh software presents (GLX/TLX blit onto #game-soft on demand). */
async function presents(page, n = 1, ms = 12000) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(async (t) => {
      if (typeof GLX !== "undefined" && GLX.awaitSoftPresent) { try { await GLX.awaitSoftPresent(t); } catch (_) {} }
      else await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, ms);
  }
}

/** RGBA of the presented frame: #game-soft's 2D pixels, else a CDP screenshot decoded by sharp. */
async function grabRGBA(page) {
  const soft = await page.evaluate(() => {
    const c = document.getElementById("game-soft");
    if (!c || !(c.width > 0) || !(c.height > 0)) return null;
    let ctx = null;
    try { ctx = c.getContext("2d"); } catch (_) { return null; }
    if (!ctx) return null;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let s = "";
    for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return { w: c.width, h: c.height, b64: btoa(s), via: "game-soft" };
  });
  if (soft) return { w: soft.w, h: soft.h, rgba: Buffer.from(soft.b64, "base64"), via: soft.via };
  const shot = await screenshotPresentedCanvas(page, { skipAwait: true, forceCdp: true, timeout: 60000 });
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(shot.buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, rgba: data, via: shot.via };
}

async function lumaAt(page, pose, settle = 3) {
  await page.evaluate((p) => window.__apex.view({ eye: p.eye, target: p.target, fov: p.fov, far: p.far }), pose);
  await presents(page, settle);
  const f = await grabRGBA(page);
  return { w: f.w, h: f.h, luma: lumaFromRGBA(f.rgba, f.w, f.h), via: f.via };
}

function dolly(pose, d) {
  const dir = pose.target.map((t, i) => t - pose.eye[i]);
  const len = Math.hypot(...dir) || 1;
  const u = dir.map((x) => (x / len) * d);
  return { ...pose, eye: pose.eye.map((x, i) => x + u[i]), target: pose.target.map((x, i) => x + u[i]) };
}

async function writePng(path, luma, w, h) {
  const { default: sharp } = await import("sharp");
  await sharp(Buffer.from(luma), { raw: { width: w, height: h, channels: 1 } }).png().toFile(path);
}

async function measureSite(page, site, opts) {
  const t0 = Date.now();
  await page.evaluate(({ track }) => window.__apex.race(track, "day", "dry"), { track: site.track });
  await page.waitForFunction((t) => window.__apex.info().track === t, site.track, { timeout: 180000, polling: 100 });
  await page.evaluate(() => {
    const a = window.__apex;
    a.hud(false);
    try { a.renderScale(1); } catch (_) {}
    try { a.govHold(true); } catch (_) {}
    try { a.lightTune({ lampFlicker: 0, lampWarmup: 0 }); } catch (_) {}
    a.renderClock(100, true);
  });
  const pose0 = await poseFor(page, site);
  if (pose0.skip) return { id: site.id, track: site.track, status: "skipped", reason: pose0.skip, ms: Date.now() - t0 };
  const pose = { ...pose0, far: FAR_M };
  // First settle is long: park() + the new camera invalidate cached uniforms,
  // shadow cascades and probes; ten presents lets every cadence-driven pass land.
  const A = await lumaAt(page, pose, 10);
  await presents(page, 2);
  const A2f = await grabRGBA(page);
  const A2 = lumaFromRGBA(A2f.rgba, A2f.w, A2f.h);
  const jit = [];
  for (const m of JITTER) jit.push((await lumaAt(page, dolly(pose, m * site.jitterM))).luma);
  const maxFrac = site.maxFrac ?? DEFAULTS.maxFrac;
  const score = flickerScore({ a: A.luma, a2: A2, jit, w: A.w, h: A.h });
  const verdict = judge(score, { maxFrac });
  if (opts.png) {
    const mask = Uint8Array.from(score.mask, (v) => (v ? 255 : 0));
    await writePng(join(opts.out, `${site.id}-A.png`), A.luma, A.w, A.h);
    await writePng(join(opts.out, `${site.id}-mask.png`), mask, A.w, A.h);
  }
  const { mask: _m, ...numbers } = score;
  return {
    id: site.id, track: site.track, status: verdict.ok ? "pass" : "fail", reasons: verdict.reasons,
    maxFrac, frame: { w: A.w, h: A.h, via: A.via }, pose: { eye: pose.eye.map((v) => +v.toFixed(3)), target: pose.target.map((v) => +v.toFixed(3)), fov: pose.fov, racingFrac: pose.racing },
    jitterM: site.jitterM, ...numbers, ms: Date.now() - t0,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log("see the header of tools/shot/flicker-gate.mjs"); return 0; }
  const chosen = opts.sites.length ? SITES.filter((s) => opts.sites.includes(s.id)) : SITES;
  const unknown = opts.sites.filter((id) => !SITES.some((s) => s.id === id));
  if (unknown.length) throw new Error(`unknown --site ${unknown.join(", ")}; known: ${SITES.map((s) => s.id).join(", ")}`);
  if (opts.list) {
    for (const s of chosen) console.log(`${s.id.padEnd(28)} ${s.track.padEnd(10)} ${s.space} ${s.frac}  ceiling ${(s.maxFrac * 100).toFixed(2)}%  — ${s.why}`);
    return 0;
  }
  mkdirSync(opts.out, { recursive: true });
  const t0 = Date.now();
  const results = [];
  const srv = await startStaticServer(opts.root);
  try {
    const browser = await launchChromium({ args: [...chromiumArgsForBackend(opts.backend), "--disable-background-timer-throttling"] });
    const ctx = await browser.newContext({ viewport: { width: opts.width, height: opts.height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await installProbeInit(page, { backend: opts.backend });
    await gotoGame(page, srv.url, 180000);
    for (const site of chosen) {
      let r;
      try { r = await measureSite(page, site, opts); }
      catch (e) { r = { id: site.id, track: site.track, status: "error", reason: String(e && e.message || e).slice(0, 400) }; }
      results.push(r);
      const f = r.fight ? `fight ${(r.fight.frac * 100).toFixed(3)}% (${r.fight.clusters} clusters, ceiling ${(r.maxFrac * 100).toFixed(2)}%), still diff ${r.still.diffPx} px` : (r.reason || "");
      console.log(`[flicker] ${r.status.toUpperCase().padEnd(7)} ${site.id} — ${f}`);
    }
    await browser.close();
  } finally {
    await srv.close().catch(() => {});
    await shutdown();
  }
  const count = (st) => results.filter((r) => r.status === st).length;
  const summary = {
    backend: opts.backend, gl: process.env.APEX_GL || "swiftshader", root: opts.root === ROOT ? "." : opts.root,
    sites: results.length, pass: count("pass"), fail: count("fail"), error: count("error"), skipped: count("skipped"),
    stillExact: results.filter((r) => r.still).every((r) => r.still.diffPx === 0),
    thr: DEFAULTS.thr, minFlips: DEFAULTS.minFlips, minCluster: DEFAULTS.minCluster, jitter: JITTER,
    ms: Date.now() - t0,
  };
  const measured = summary.pass + summary.fail;
  const ok = summary.fail === 0 && summary.error === 0 && measured > 0;
  summary.verdict = ok ? "pass" : "fail";
  const outFile = join(opts.out, "flicker-gate.json");
  writeFileSync(outFile, JSON.stringify({ summary, sites: results }, null, 2) + "\n");
  console.log(`= flicker ${summary.verdict}: ${summary.pass} pass, ${summary.fail} fail, ${summary.error} error, ${summary.skipped} skipped; A==A2 at every site: ${summary.stillExact} → ${outFile}`);
  return ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }, (e) => { console.error("flicker-gate:", e && e.stack || e); process.exitCode = 1; });
}

// Exposed for tests/unit/flicker-metric.test.mjs (pure pieces only).
export { JITTER, dolly, parseArgs };
