/* fitHud must publish one --hud-z-top and measure with that same zoom.
 *
 * Under load, #minimap.currentCSSZoom can lag the published --hud-z-top by a
 * frame (Pages 37714419183: rect 87.11 = 110×zTop 0.792 while zoom read 0.704;
 * earlier 142 = 110×0.862/0.666). Dividing getBoundingClientRect by the stale
 * live zoom over/under-estimates the intrinsic map width and the next fit
 * flips between a high cap (~--hud-scale / uncapped) and the 0.4 floor.
 *
 * Run: node --test tests/unit/hud-fit-idempotent.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const src = (p) => read(p).replace(/^const\b/gm, "var");

const ALL_TOKENS = (() => {
  const t = {};
  for (const [, k, v] of read("css/tokens.css").matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) if (!(k in t)) t[k] = v.trim();
  return t;
})();

function ctx2d() {
  const store = {};
  return new Proxy({}, {
    get: (_, k) => (k in store ? store[k] : () => {}),
    set: (_, k, v) => { store[k] = v; return true; },
  });
}

/** Compact short-landscape @ HUD SIZE 200 % — the ui-redesign flake shape. */
function bootFlipHarness(o = {}) {
  const INTRINSIC = o.intrinsic || { map: 110, top: 300, sectors: 140, gaps: 84 };
  const SCALE = o.scale == null ? 2 : o.scale;
  const W = o.W || 852, H = o.H || 393;
  const SAL = o.sal || 0, PLATE_TOP = o.plateTop == null ? 8 : o.plateTop, PLATE_IN = o.plateInset || 0, TOWER_H = o.towerH || 54;
  const dom = makeDom();
  const rawCreate = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const el = rawCreate(tag);
    if (String(tag).toLowerCase() === "canvas") el.getContext = () => ctx2d();
    return el;
  };
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, WeakSet, RegExp, Date,
    parseFloat, parseInt, isFinite, Infinity,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document, innerWidth: W, innerHeight: H, devicePixelRatio: 1,
    M4: { clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) },
    PhysicsConsts: { IDLE_RPM: 5000, MAX_RPM: 15000 },
    Ghost: { hasGhost: () => false, timeAt: () => null, at: () => null },
    GhostShare: { hasGuest: () => false, timeAt: () => null, at: () => null },
    TrackMaps: { drsZones: () => [], sectorColors: () => ["#ffd700", "#c0c0c0", "#cd9b5a"] },
    setTimeout: () => 1, clearTimeout: () => {},
    performance: { now: () => 1000 },
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({
      getPropertyValue: (k) => (o.tokens && k in o.tokens ? o.tokens[k] : (ALL_TOKENS[k] || "")),
      columnGap: "0px", rowGap: "0px", transform: "none",
    }),
  };
  sb.window = sb;
  vm.runInNewContext(src("js/ui/live-region.js"), sb, { filename: "js/ui/live-region.js" });
  vm.runInNewContext(src("js/ui/hud.js"), sb, { filename: "js/ui/hud.js" });
  vm.runInNewContext(src("js/race/overtake-mode.js"), sb, { filename: "js/race/overtake-mode.js" });

  const $ = (id) => dom.byId(id);
  const minimap = $("minimap");
  minimap.getContext = () => ctx2d();
  const els = {
    pos: $("hud-pos"), lap: $("hud-lap"), time: $("hud-time"), best: $("hud-best"),
    speed: $("hud-speed-n"), energy: $("hud-energy-fill"), ot: $("hud-ot"), aero: $("hud-aero"),
    btnOT: $("btn-ot"), btnAero: $("btn-aero"),
    gapA: $("hud-gap-ahead"), gapB: $("hud-gap-behind"), hudSectors: $("hud-sectors"),
    flag: $("hud-flag"), minimap, gear: $("hud-gear"), rpmFill: $("hud-rpm-fill"), tach: $("hud-tach"),
    announceLive: $("announce-live"), pausebtn: $("pausebtn"), btnCam: $("btn-cam"),
  };
  dom.document.body.classList.add("in-race");
  const player = {
    team: { id: "t1", color: [1, 0, 0] }, code: "YOU", rank: 1, lap: 1, lapTime: 12, best: Infinity,
    speed: 50, energy: 0.5, gear: 3, rpm: 5000, boostOn: false,
    otT: 0, otArmed: false, otE: 0, otEarned: false, aeroX: 0, xArmed: false, s: 10, prog: 10, retired: false,
  };
  const G = {
    els, player, cars: [player], ranked: [player], timeTrial: false, state: "race",
    lapsTarget: 5, track: { map: [[0, 0], [1, 1]], total: 100, def: {} },
    sectorLast: [null, null, null], sectorBests: [Infinity, Infinity, Infinity],
    fieldSectorBests: [Infinity, Infinity, Infinity], aeroZones: [{}], ttRecord: Infinity,
    fmtTime: (t) => String(t), dashKph: (v) => v * 3.6, vTop: () => 90, otEnabled: () => true,
    cssCol: () => "#f00",
    store: { rev: 1, get: (k, d) => (k === "hudSectorsSide" ? (o.secSide || "right") : d) },   // the fixture's plate is on the right
  };
  const hud = sb.GameHud.create(G);
  const root = dom.documentElement;
  root.style.setProperty("--hud-scale", String(SCALE));

  const mk = (cls, parent) => {
    const e = dom.document.createElement("div");
    e.className = cls;
    (parent || dom.body).appendChild(e);
    return e;
  };
  const top = mk("hud-top"), bottom = mk("hud-bottom");
  const bar = dom.document.createElement("div");
  bar.id = "hud-dock";
  dom.body.appendChild(bar);
  const dockL = $("dock-left"), dockR = $("dock-right");
  for (const d of [dockL, dockR]) {
    if (d.parentNode) d.parentNode.removeChild(d);
    bar.appendChild(d);
  }
  const gear = mk("g", bottom), energy = mk("e", bottom);
  const gL = mk("gl", dockL), gR = mk("gr", dockR);
  const gaps = mk("hud-gaps");
  if (els.gapA.parentNode) els.gapA.parentNode.removeChild(els.gapA);
  if (els.gapB.parentNode) els.gapB.parentNode.removeChild(els.gapB);
  gaps.appendChild(els.gapA);
  gaps.appendChild(els.gapB);

  const liveZ = new Map();
  const R = (left, top_, w, h) => ({ left, top: top_, right: left + w, bottom: top_ + h, width: w, height: h });

  function paintAt(z, liveOverride) {
    const L = liveOverride == null ? z : liveOverride;
    const bz = Math.min(SCALE, 1);
    top._rect = R((W - INTRINSIC.top * z) / 2, 8 * z, INTRINSIC.top * z, TOWER_H * z);
    minimap._rect = R(10 * z + SAL, 8 * z, INTRINSIC.map * z, INTRINSIC.map * z);
    gaps._rect = R(10 * z + SAL + INTRINSIC.map * z + 8 * z, 8 * z, INTRINSIC.gaps * z, 40 * z);
    els.hudSectors._rect = R(W - 10 * z - SAL - PLATE_IN - INTRINSIC.sectors * z, PLATE_TOP, INTRINSIC.sectors * z, 72 * z);
    gear._rect = R(100, 300, 250 * bz, 50 * bz);
    energy._rect = R(400, 300, 250 * bz, 50 * bz);
    bar._rect = R(0, 200, W, H - 200);
    dockL._rect = R(0, 200, 140, H - 200);
    dockR._rect = R(W - 140, 200, 140, H - 200);
    gL._rect = R(0, 200, 140, H - 200);
    gR._rect = R(W - 140, 200, 140, H - 200);
    for (const [el, zoom] of [
      [top, L], [minimap, L], [gaps, L], [els.hudSectors, L],
      [bottom, bz], [dockL, Math.max(1, SCALE)], [dockR, Math.max(1, SCALE)],
      [gL, Math.max(1, SCALE)], [gR, Math.max(1, SCALE)], [gear, bz], [energy, bz],
    ]) {
      liveZ.set(el, zoom);
      Object.defineProperty(el, "currentCSSZoom", {
        get: () => liveZ.get(el) ?? 1,
        configurable: true,
      });
    }
  }

  paintAt(SCALE);
  for (let i = 0; i < 3; i++) hud.updateHud(true);

  const pub = () => {
    const v = root.style.getPropertyValue("--hud-z-top");
    return v === "" ? SCALE : +v;
  };
  const snap = () => ({
    zTop: root.style.getPropertyValue("--hud-z-top"),
    zBot: root.style.getPropertyValue("--hud-z-bot"),
    dockRW: root.style.getPropertyValue("--dock-r-w"),
    topH: root.style.getPropertyValue("--hud-top-h"),
  });

  return {
    SCALE, W, H, R, $, root, minimap, liveZ, pub, snap, sb,
    paintAt,
    invalidate() { sb.GameHud.invalidateFit(); },
    tick() { hud.updateHud(true); },
    /** One-frame lag: rects at published z, currentCSSZoom still at previous. */
    lagPass(prevLive) {
      const painted = pub();
      paintAt(painted, prevLive);
      sb.GameHud.invalidateFit();
      hud.updateHud(true);
      return pub();
    },
  };
}

test("fitHud: one-frame currentCSSZoom lag must not flip --hud-z-top between scale and the 0.4 floor", () => {
  const h = bootFlipHarness();
  const caps = [];
  let prevLive = h.SCALE;
  for (let i = 0; i < 10; i++) {
    const before = h.pub();
    const after = h.lagPass(prevLive);
    caps.push(+after.toFixed(3));
    prevLive = before;
  }
  const uniq = [...new Set(caps)];
  // Tip defect: consecutive passes alternate ~2 (uncapped/scale) and ≤0.5 (floor-bound).
  // Fixed: every pass publishes the same steady cap; never the 0.4 floor from a stale divisor.
  assert.ok(!uniq.includes(0.4),
    "stale currentCSSZoom must not drive the top cap onto the 0.4 floor; caps=" + JSON.stringify(caps));
  assert.equal(uniq.length, 1,
    "one-frame lag must not flip caps; got " + JSON.stringify(uniq) + " over " + JSON.stringify(caps));
});

test("fitHud: two back-to-back fits with unchanged inputs publish identical zTop and dock inset", () => {
  const h = bootFlipHarness();
  // Settle with matching live zoom.
  h.paintAt(h.pub());
  h.invalidate();
  h.tick();
  const a = h.snap();
  h.paintAt(h.pub()); // live matches published
  h.invalidate();
  h.tick();
  const b = h.snap();
  assert.deepEqual(b, a, "second fitHud must be a no-op when inputs and paint match");
  // And the published top zoom equals what #minimap would report when live is in sync.
  const want = +a.zTop || h.SCALE;
  assert.equal(h.minimap.currentCSSZoom, want,
    "published zTop must equal the effective #minimap zoom when paint is settled");
});

test("fitHud measures top-band intrinsics from the published --hud-z-top, not currentCSSZoom", () => {
  const hud = read("js/ui/hud.js");
  const fit = hud.slice(hud.indexOf("function fitHud("), hud.indexOf("function paintInstruments"));
  assert.match(fit, /\bconst zTopPub\b/,
    "fitHud must name zTopPub as the published top-zoom measurement source");
  assert.match(fit, /wide\(els\.minimap,\s*zTopPub\)/,
    "minimap intrinsic must divide by zTopPub, not currentCSSZoom");
  assert.match(fit, /const zPaint = \(\) => \{[\s\S]*?Math\.min\(pub,\s*live\)/,
    "zPaint for painted dock clearance must be min(published, live), not published-only");
  const css = read("css/hud.css");
  assert.match(css, /#minimap[\s\S]*?transition-property:/,
    "top-band zoom group must not transition zoom (default all desyncs under load)");
});

/** 844x390 phone, cockpit: the tower 462 wide x 50 tall at y 8*z, the map and gap strip left of it, the
 *  sector plate on its own row at SCREEN y 56 (its zoom cancels) pushed inboard by the dock, --sar 47. */
const PHONE = { W: 844, H: 390, scale: 1, sal: 47, plateTop: 56, plateInset: 200, towerH: 50.2,
  intrinsic: { map: 110, top: 462.4, sectors: 46, gaps: 75.2 }, tokens: { "--sar": "47px", "--sal": "47px", "--sat": "0px" } };

test("fitHud: on touch the tower clears the sector plate's row without shrinking the whole band", () => {
  const h = bootFlipHarness(PHONE);
  const settle = (n) => { for (let i = 0; i < n; i++) { h.paintAt(h.pub()); h.invalidate(); h.tick(); } };   // a page repaints at the published zoom; the fixture does not
  settle(6);
  const z = h.pub();
  // The tower's bottom at the published zoom sits above the plate's top (56) by ROW_AIR.
  const bottom = z * (8 + PHONE.towerH);
  assert.ok(bottom <= 56 - 2 + 0.01, "tower bottom " + bottom.toFixed(2) + " clears the plate's top at y 56");
  assert.ok(z > 0.85 && z < 1, "and the band is only as small as that row needs (" + z.toFixed(3) + "), not the old 0.575 read off the dock stand-off");
  // Stable: more ticks do not move it.
  settle(4);
  assert.equal(h.pub(), z, "the cap does not hunt");
});

test("fitHud: hiding the sector plate frees the row (touch), and a plate level with the tower is not a row to clear", () => {
  const run = (hidePlate) => {
    const h = bootFlipHarness(PHONE);
    for (let i = 0; i < 6; i++) {
      h.paintAt(h.pub());
      if (hidePlate) h.sb.document.getElementById("hud-sectors")._rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };   // SECTORS off / MINIMAL: no box, no row
      h.invalidate(); h.tick();
    }
    return h.pub();
  };
  assert.ok(run(true) >= run(false) - 1e-9, "removing the plate never needs more room (" + run(true) + " vs " + run(false) + ")");
  // A plate level with the tower shares its ROW: the vertical limit does not apply (the right-half budget does).
  const level = bootFlipHarness({ ...PHONE, plateTop: 8 });
  for (let i = 0; i < 6; i++) { level.paintAt(level.pub()); level.invalidate(); level.tick(); }
  assert.ok(level.pub() > 0.95, "a plate level with the tower is not a row to clear (" + level.pub() + ")");
});

/** A painted S3 x BOOST clash the fit cannot resolve: BOOST on the right half,
 *  the sectors plate hard over it, and no pass moves either rect. */
function forceUnresolvableClash(h) {
  const boost = h.$("btn-boost"), sectors = h.$("hud-sectors");
  boost.hidden = false;
  boost._rect = h.R(h.W - 100, 250, 80, 80);
  sectors.hidden = false;
  sectors._rect = h.R(h.W - 160, 240, 140, 72);
  let reads = 0;
  const raw = sectors.getBoundingClientRect;
  sectors.getBoundingClientRect = () => { reads++; return raw(); };
  return { boost, sectors, reads: () => reads };
}

test("fitHud: an unresolvable painted clash backs off to the 3 s cadence after a few tries", () => {
  const h = bootFlipHarness();
  const c = forceUnresolvableClash(h);
  h.invalidate();
  h.tick();   // key changed: the full fit, the first time this clash is seen
  const perTick = [];
  for (let i = 0; i < 40; i++) {
    const before = c.reads();
    h.tick();
    perTick.push(c.reads() - before);
  }
  // Reads per tick = the tick's own baseline + (if it ran) the full fit's passes.
  const tries = perTick.slice(0, 5), late = perTick.slice(8, 29);   // 29 < the 30-tick same-key window
  assert.ok(Math.min(...tries) > 0, "the first ticks still try to resolve it: " + JSON.stringify(perTick));
  const max = Math.max(...late);
  assert.ok(max < Math.min(...tries),
    "after the tries are spent a tick must not re-run the fit: " + JSON.stringify(perTick));
  // A changed key (resize) starts the tries again.
  const tryAgain = (() => { const b = c.reads(); h.invalidate(); h.tick(); return c.reads() - b; })();
  assert.ok(tryAgain > max, "a key change re-fits at once: " + tryAgain + " vs " + max);
});

test("fitHud: --hud-fit-stamp is written once in steady state, and again after a clash clears", () => {
  const h = bootFlipHarness();
  const writes = [];
  const raw = h.root.style.setProperty.bind(h.root.style);
  h.root.style.setProperty = (k, v) => { if (k === "--hud-fit-stamp") writes.push(v); return raw(k, v); };
  for (let i = 0; i < 20; i++) h.tick();
  assert.ok(writes.length <= 1, "20 clash-free ticks wrote the stamp " + writes.length + " times: " + JSON.stringify(writes));
  const stamp = h.root.style.getPropertyValue("--hud-fit-stamp");
  assert.match(stamp, /^\d+$/, "a stamp is still published (the hud-layout spec waits on it)");
  // A clash voids the stamp; its clearing publishes a NEW one.
  const c = forceUnresolvableClash(h);
  h.invalidate();
  h.tick();
  assert.equal(h.root.style.getPropertyValue("--hud-fit-stamp"), "", "a clash voids the stamp");
  c.boost.hidden = true;
  for (let i = 0; i < 5; i++) h.tick();
  const after = h.root.style.getPropertyValue("--hud-fit-stamp");
  assert.match(after, /^\d+$/);
  assert.notEqual(after, stamp, "the stamp changes after a clash clears");
});
