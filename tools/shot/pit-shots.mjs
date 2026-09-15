#!/usr/bin/env node
// pit-shots.mjs — the pit lane, photographed from its own resolved geometry.
// @doc Pit-lane shot set, one boot per circuit: entry, exit, lane overview and each team's box, from the resolved geometry.
// @skill playwright-probe
//
//   node tools/shot/pit-shots.mjs [trackId ...] [--out DIR] [--tod day|dusk|dawn|night]
//     [--teams all|none|mercedes,ferrari] [--wait S] [--viewport WxH] [--plan]
//
// ONE BOOT PER CIRCUIT. shot.mjs launches a browser per frame and a cold boot
// is ~45 s on this container; a pit set is 15+ frames. Everything here is
// framed inside a single page, so a circuit costs one boot instead of fifteen.
//
// NOTHING HERE HARDCODES A LAP FRACTION, and that is the point. The pit window
// is read back off the running game — park the car, ask `__apex.pit()` how far
// THROUGH the window it landed, and the entry is `(s - atM)`. Every framing is
// then an offset in METRES from that entry, and each team's box is the row
// position `pit({car})` reports. Move the pit geometry and this re-frames
// itself; a hardcoded fraction would quietly photograph a hedge.
//
// The lane is only ARMED when tyre wear is on (`PitLane.enabled()` reads
// `G.tyres.on()`), so the set turns it on before reading anything: with it off
// `pit()` reports a window nobody paints and the painted-lane circuits shoot
// bare tarmac. `lane: null` in the manifest is NOT that failure — it means the
// circuit has a built ribbon (`track.pitLane`), which suppresses the painted
// fallback by design.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  launchChromium,
  shutdown,
  sleep,
  startStaticServer,
} from "../lib/harness.mjs";
import { assertSafePathToken, resolveRepoDefault } from "../lib/output-paths.mjs";
import { awaitPresentedFrame, screenshotPresentedCanvas } from "./probe-page.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(name);
  if (i < 0 || i + 1 >= argv.length) return fallback;
  return argv[i + 1];
}
const has = (name) => argv.includes(name);

const positionals = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) {
    if (!/^--(plan|hud)$/.test(argv[i]) && i + 1 < argv.length && !argv[i + 1].startsWith("--")) i++;
    continue;
  }
  positionals.push(argv[i]);
}

const TRACKS = (positionals.length ? positionals : ["albert_park"]).map((t) =>
  assertSafePathToken(t, "track id"));
const TOD = assertSafePathToken(flag("--tod", "day"), "time of day");
const TEAMS = flag("--teams", "all");
const WAIT_MS = Math.max(5, parseFloat(flag("--wait", "150"))) * 1000;
const PLAN = has("--plan");
const SHOW_HUD = has("--hud");
const [VW, VH] = String(flag("--viewport", "1600x900")).split("x").map((n) => parseInt(n, 10) || 0);
const OUT_ROOT = flag("--out", null)
  ? resolve(flag("--out", null))
  : resolveRepoDefault(ROOT, "scratch", "captures", "pit-lane");

// ── The framings ────────────────────────────────────────────────────────────
// Offsets are METRES through the pit window (0 = the entry, `lenM` = the exit);
// `lat` is "lane" (the lane centre at that point, read live), "out" (outside
// the lane, pit side) or "opp" (across the track). A shot is either an eye+look
// pair or an orbit about the centreline.
const OUT_GAP = 12;     // metres beyond the lane centre, pit side
const OPP_GAP = 14;     // metres beyond the lane centre, across the track

function framings(g) {
  const boxes = g.rows;
  const first = boxes.length ? boxes[0].boxM : g.lenM * 0.5;
  const last = boxes.length ? boxes[boxes.length - 1].boxM : g.lenM * 0.6;
  const mid = (first + last) / 2;
  const out = [];

  out.push({
    name: "01-entry-outside",
    note: "the pit entry from across the circuit — does the lane peel off the racing surface cleanly",
    car: -20,
    eye: { m: -115, lat: "opp", h: 13 },
    look: { m: 20, lat: "lane", h: 1.2 },
  });
  out.push({
    name: "02-entry-lane",
    note: "driver's eye entering the lane",
    car: 8,
    eye: { m: -30, lat: "lane", h: 1.9 },
    look: { m: 75, lat: "lane", h: 1.3 },
  });
  out.push({
    name: "03-lane-aerial",
    note: "the whole box row from above the pit side",
    car: mid,
    orbit: { m: mid, az: 90 * g.side, el: 45, dist: 120 },
  });
  out.push({
    name: "04-box-row",
    note: "along the row — garage frontage, working boxes, lane markings",
    car: mid,
    eye: { m: first - 50, lat: "out", h: 6.5 },
    look: { m: last, lat: "lane", h: 1.5 },
  });

  const want = TEAMS === "none" ? []
    : TEAMS === "all" ? boxes
      : boxes.filter((b) => TEAMS.split(",").map((s) => s.trim()).includes(b.team));
  want.forEach((b, i) => {
    out.push({
      name: `05-box-${String(i + 1).padStart(2, "0")}-${b.team}`,
      note: `${b.name} box at ${b.boxM} m through the window`,
      team: b.team,
      car: b.boxM,
      eye: { m: b.boxM - 19, lat: "out", h: 4.2 },
      look: { m: b.boxM + 7, lat: "lane", h: 1.0 },
    });
  });

  out.push({
    name: "06-exit-lane",
    note: "driver's eye at the merge — where the lane hands back to the circuit",
    car: g.lenM - 70,
    eye: { m: g.lenM - 95, lat: "lane", h: 1.9 },
    look: { m: g.lenM + 45, lat: 0, h: 1.3 },
  });
  out.push({
    name: "07-exit-outside",
    note: "the exit from across the circuit — blend angle and the end of the ribbon",
    car: g.lenM - 25,
    eye: { m: g.lenM + 60, lat: "opp", h: 11 },
    look: { m: g.lenM - 50, lat: "lane", h: 1.2 },
  });
  return out;
}

// ── Page side ───────────────────────────────────────────────────────────────

/** Resolve the pit window off the RUNNING game: entry arc position, length,
 *  side, and one box per team. `atM` is how far through the window the parked
 *  car is, so `s - atM` is the entry with no constant copied out of
 *  js/race/pit-lane.js. */
async function pitGeometry(page, tod, showHud) {
  return page.evaluate(({ tod, showHud }) => {
    const a = window.__apex;
    a.go();
    if (a.tyres) a.tyres({ level: "real" });     // arms the lane (PitLane.enabled)
    if (a.setTimeOfDay) a.setTimeOfDay(tod);
    if (a.hud) a.hud(!!showHud);
    const r = a.park(0, 0);                       // stages the race ONCE; AI pushed back
    if (!r || !r.total) return { err: "park failed — no track" };
    const p = a.pit();
    if (!p) return { err: "no pit module on this build" };
    const L = r.total;
    const wrap = (v) => ((v % L) + L) % L;
    const sIn = wrap(r.s - p.atM);
    const rows = [];
    for (let i = 0; i < 24; i++) {
      const c = a.carAt(i);
      if (!c) break;
      const id = (c.team && c.team.id) || c.team;
      if (!id || rows.some((x) => x.team === id)) continue;   // teammates share a box
      const q = a.pit({ car: i });
      rows.push({ team: id, name: (c.team && c.team.name) || id, boxM: q ? q.boxM : null });
    }
    rows.sort((x, y) => x.boxM - y.boxM);
    return {
      L: +L.toFixed(1), sIn: +sIn.toFixed(1), lenM: p.lenM, side: p.side,
      laneX: p.laneX, limitKph: p.limitKph, enabled: p.enabled,
      lane: p.lane, ribbon: p.lane === null, rows,
    };
  }, { tod, showHud });
}

/** Stage one framing. Returns the lane centre actually used, so the manifest
 *  records the geometry the picture was taken against. */
async function stage(page, spec, g) {
  return page.evaluate(({ s, g, outGap, oppGap }) => {
    const a = window.__apex;
    const L = g.L;
    const fr = (m) => ((((g.sIn + m) / L) % 1) + 1) % 1;
    // The lane centre MOVES with the local half-width (4.9 m at Monaco to 8 m
    // at Spa), so read it where this shot is pointed rather than reusing the
    // one sampled at the start line.
    a.jump(fr(s.car), 0, 0);
    const p = a.pit();
    const laneX = p && p.laneX != null ? p.laneX : g.laneX;
    a.jump(fr(s.car), 0, laneX);
    const abs = Math.abs(laneX), sd = g.side;
    const lat = (v) => v === "lane" ? laneX
      : v === "out" ? sd * (abs + outGap)
        : v === "opp" ? -sd * (abs + oppGap) : v;
    if (s.orbit) a.orbit(fr(s.orbit.m), s.orbit.az, s.orbit.el, s.orbit.dist);
    else a.eyeAt(fr(s.eye.m), lat(s.eye.lat), s.eye.h, fr(s.look.m), lat(s.look.lat), s.look.h);
    if (a.step) a.step(1 / 60, 3);
    const vs = a.viewState ? a.viewState() : null;
    const cs = a.camState ? a.camState() : null;
    return {
      laneX: +laneX.toFixed(2),
      carFrac: +fr(s.car).toFixed(5),
      dbgCamActive: !!(vs && vs.dbgCamActive) || !!(cs && cs.debug),
    };
  }, { s: spec, g, outGap: OUT_GAP, oppGap: OPP_GAP });
}

// ── Run ─────────────────────────────────────────────────────────────────────

if (PLAN) {
  console.log(`tracks: ${TRACKS.join(", ")}   tod: ${TOD}   teams: ${TEAMS}   out: ${OUT_ROOT}`);
  const g = { L: 5278, sIn: 4886, lenM: 522, side: 1, laneX: 8.66, rows: [] };
  for (const s of framings(g)) console.log(`  ${s.name.padEnd(28)} ${s.note}`);
  console.log("  (+ one 05-box-* per team once the real geometry is read)");
  process.exit(0);
}

const srv = await startStaticServer(ROOT);
const results = [];
try {
  const browser = await launchChromium({ args: ["--use-angle=swiftshader"] });
  for (const trackId of TRACKS) {
    const outDir = join(OUT_ROOT, trackId);
    mkdirSync(outDir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: VW || 1600, height: VH || 900 } });
    const t0 = Date.now();
    try {
      await page.goto(srv.url);
      await page.waitForFunction(() => window.__apex != null, null, { timeout: WAIT_MS, polling: 100 });
      // Models resident BEFORE the build, so scenery()'s bakedModel() emits —
      // the pit buildings are exactly the kind of prop that goes missing here.
      const models = await page.evaluate(async () => {
        if (typeof Assets === "undefined" || !Assets.loadModels) return 0;
        try { return await Assets.loadModels(); } catch (_) { return 0; }
      });
      await page.evaluate((id) => window.__apex.race(id), trackId);
      await page.waitForFunction(() => window.__apex.info().track != null, null,
        { timeout: WAIT_MS, polling: 100 });
      await sleep(1200);

      const g = await pitGeometry(page, TOD, SHOW_HUD);
      if (g.err) throw new Error(g.err);
      console.log(`[${trackId}] boot ${((Date.now() - t0) / 1000).toFixed(1)}s  models=${models}  ` +
        `window ${g.lenM} m  side ${g.side > 0 ? "right" : "left"}  limit ${g.limitKph} km/h  ` +
        `lane ${g.ribbon ? "ribbon (built tarmac)" : "painted"}  boxes ${g.rows.length}`);

      const shots = [];
      for (const spec of framings(g)) {
        const staged = await stage(page, spec, g);
        await sleep(250);
        await awaitPresentedFrame(page);
        const file = join(outDir, `${spec.name}.png`);
        const shot = await screenshotPresentedCanvas(page, { path: file, skipAwait: true, timeout: 60000 })
          .catch(async () => {
            const buf = await page.screenshot({ path: file, timeout: 60000 });
            return { buf, bytes: buf.length, via: "page" };
          });
        const blank = shot.bytes < 5000;
        shots.push({ ...spec, file, bytes: shot.bytes, via: shot.via, ...staged, blank });
        console.log(`  ${blank ? "⚠" : "·"} ${spec.name.padEnd(28)} ${(shot.bytes / 1024).toFixed(0).padStart(4)} KB` +
          `${staged.dbgCamActive ? "" : "   ⚠ free-cam inactive"}${blank ? "   ⚠ looks blank" : ""}`);
      }
      const manifest = { track: trackId, tod: TOD, geometry: g, shots, viewport: { w: VW, h: VH } };
      writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
      results.push({ track: trackId, dir: outDir, shots: shots.length, blank: shots.filter((s) => s.blank).length });
    } catch (err) {
      console.error(`[${trackId}] failed: ${err.message}`);
      results.push({ track: trackId, error: err.message });
      process.exitCode = 1;
    } finally {
      await page.close();
    }
  }
} catch (err) {
  console.error("pit-shots failed:", err.message);
  process.exitCode = 1;
} finally {
  await shutdown();
}

for (const r of results) {
  if (r.error) console.log(`${r.track}: FAILED — ${r.error}`);
  else console.log(`${r.track}: ${r.shots} frames -> ${r.dir}${r.blank ? `  (${r.blank} blank)` : ""}`);
}
