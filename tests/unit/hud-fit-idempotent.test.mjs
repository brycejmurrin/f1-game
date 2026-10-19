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
    Log: o.log || { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false, DEBUG: 4 },
    document: dom.document, innerWidth: W, innerHeight: H, devicePixelRatio: 1,
    M4: { clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) },
    PhysicsConsts: { IDLE_RPM: 5000, MAX_RPM: 15000 },
    Ghost: { hasGhost: () => false, timeAt: () => null, at: () => null },
    GhostShare: { hasGuest: () => false, timeAt: () => null, at: () => null },
    TrackMaps: { drsZones: () => [], sectorColors: () => ["#ffd700", "#c0c0c0", "#cd9b5a"] },
    setTimeout: () => 1, clearTimeout: () => {},
    performance: { now: () => 1000 },
    matchMedia: (q) => {
      const query = String(q || "");
      const maxW = /max-width:\s*(\d+)/.exec(query);
      const matches = !!o.portrait
        && /orientation:\s*portrait/.test(query)
        && (!maxW || W <= +maxW[1]);
      return { matches, addListener() {}, removeListener() {} };
    },
    getComputedStyle: () => ({
      getPropertyValue: (k) => (o.tokens && k in o.tokens ? o.tokens[k] : (ALL_TOKENS[k] || "")),
      columnGap: "0px", rowGap: "0px", transform: "none",
    }),
  };
  sb.window = sb;
  vm.runInNewContext(src("js/ui/live-region.js"), sb, { filename: "js/ui/live-region.js" });
  vm.runInNewContext(src("js/ui/hud-minimap.js"), sb, { filename: "js/ui/hud-minimap.js" });   // GameHud.create builds its HudMinimap (#1656)
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

/** 390×844 phone portrait @ HUD 150%. CSS stacks #minimap / .hud-gaps UNDER
 *  .hud-top (css/hud.css @media portrait and max-width 500px). The landscape
 *  capFor still charged map+gaps beside the tower against half the 390 px
 *  width and wrote --hud-z-top ~0.55 → 14×0.55 = 7.7 CSS px sector/tower type. */
const PORTRAIT_PHONE = {
  W: 390, H: 844, scale: 1.5, sal: 0, plateTop: 64, plateInset: 0, towerH: 50,
  portrait: true,
  // Real touch minimap is 128; four timing tiles are ~300 unzoomed. Landscape
  // capFor on this pair writes ~0.65 (14×0.65 = 9.1 px). The stacked portrait
  // path must beat the 10/14 floor.
  intrinsic: { map: 128, top: 300, sectors: 80, gaps: 75 },
};

test("fitHud: portrait phone does not charge the stacked map beside the tower, and keeps a 10 CSS px floor", () => {
  const h = bootFlipHarness(PORTRAIT_PHONE);
  for (let i = 0; i < 6; i++) { h.paintAt(h.pub()); h.invalidate(); h.tick(); }
  const z = h.pub();
  const painted = 14 * z;   // --fs-micro 14px × published --hud-z-top
  assert.ok(z >= 10 / 14 - 1e-9,
    "portrait --hud-z-top must stay at the 10/14 readable floor; got " + z + " (" + painted.toFixed(2) + "px)");
  assert.ok(painted >= 10 - 0.05,
    "tower / sector type at --fs-micro 14 must paint ≥ 10 CSS px; got " + painted.toFixed(2) + " at z=" + z);
  // Landscape capFor on this geometry is ~0.65. The stacked portrait budget
  // must beat that (map is under the tower, not in the half-width sum).
  assert.ok(z > 0.85, "portrait must not use the landscape half-width map+tower sum (z=" + z + ")");
});

test("portrait flag follows the sector plate after packing, then clears a hidden plate", () => {
  const h = bootFlipHarness(PORTRAIT_PHONE), sectors = h.$("hud-sectors");
  h.sb.HudLayout = { fit() { sectors._rect = h.R(248, 170, 38, 50); } };
  h.invalidate(); h.tick();
  assert.equal(h.root.style.getPropertyValue("--hud-sec-bottom"), "220.0px");
  h.sb.HudLayout.fit = () => { sectors.hidden = true; };
  h.invalidate(); h.tick();
  assert.equal(h.root.style.getPropertyValue("--hud-sec-bottom"), "0.0px");
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

test("fitHud: a small plate right of Boost does not trigger same-key collision retries", () => {
  const h = bootFlipHarness();
  const boost = h.$("btn-boost"), sec = h.$("hud-sectors");
  boost.hidden = false; boost._rect = h.R(h.W - 180, 200, 80, 80);
  sec.hidden = false; sec._rect = h.R(h.W - 80, 210, 60, 50);
  sec.setAttribute("data-hl-user", ""); sec.setAttribute("data-hl", "");
  let fits = 0;
  h.sb.HudLayout = { fit() { fits++; } };
  h.invalidate(); h.tick();
  const initial = fits;
  for (let i = 0; i < 5; i++) h.tick();
  assert.equal(fits, initial, "a non-overlapping saved plate does not reopen the full fitter");
});

test("fitHud keeps the smaller cap when zoomed font metrics offer subpixel growth", () => {
  const h = bootFlipHarness();
  const before = h.pub();
  h.paintAt(before);
  const sec = h.$("hud-sectors");
  // Same content, with the small intrinsic-width change caused by font rounding at another zoom.
  sec._rect.left += .2 * before;
  sec._rect.width -= .2 * before;
  h.invalidate(); h.tick();
  assert.equal(h.pub(), before, "a fraction of a screen pixel must not restart scale hunting");
});

test("fitHud still grows a map-only band when timing tiles are hidden", () => {
  const h = bootFlipHarness({ intrinsic: { map: 480, top: 0, sectors: 140, gaps: 84 } });
  h.root.style.setProperty("--hud-z-top", ".6");
  h.paintAt(.6);
  h.invalidate(); h.tick();
  assert.ok(h.pub() > .8, "visible map growth is measured even with no timing tower");
});

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

test("fitHud: a steady tick skips the stamp probe, but a clash the key cannot see voids the stamp within the 3 s backstop (#2240)", () => {
  const h = bootFlipHarness();
  for (let i = 0; i < 40; i++) h.tick();
  assert.match(h.root.style.getPropertyValue("--hud-fit-stamp"), /^\d+$/);
  const c = forceUnresolvableClash(h);   // geometry moves; no fit-key input changes
  let voided = -1;
  for (let i = 0; i < 70 && voided < 0; i++) { h.tick(); if (h.root.style.getPropertyValue("--hud-fit-stamp") === "") voided = i; }
  assert.ok(voided >= 0 && voided <= 31, "stamp stayed clear over a painted clash for " + voided + " ticks");
  assert.ok(c.reads() > 0);
});

/* READ BEFORE WRITE (round-3 5-perf F2). The instruments (speed, gear, --rpm)
 * are written every frame; the 10 Hz tick's fitHud reads layout. Painted
 * first, they left the tree dirty and the fit's first viewport / rect read
 * forced a synchronous layout; gapForm and the end-of-tick key then read
 * innerWidth after the tick's own writes, which lays out on Android
 * (LocalDOMWindow::GetViewportSize). This harness models exactly that: any
 * DOM write marks the tree dirty, the next layout read (a rect, an offset /
 * client size, innerWidth / innerHeight) is a FORCED layout and cleans it, and
 * the browser cleans it between frames. A phone body (no `desktop` class). */
function bootOrderHarness({ events = true } = {}) {
  const W0 = 844, H0 = 390;
  const dom = makeDom();
  const state = { dirty: false, forced: 0, why: [], vw: W0, vh: H0, vpReads: 0, now: 1000 };
  const write = () => { state.dirty = true; };
  const read = (what) => { if (state.dirty) { state.forced++; state.why.push(what); state.dirty = false; } };
  const seen = new WeakSet();
  const instrument = (el) => {
    if (!el || seen.has(el)) return el;
    seen.add(el);
    let text = el.textContent;
    Object.defineProperty(el, "textContent", { configurable: true, get: () => text, set: (v) => { text = String(v); write(); } });
    let hidden = el.hidden;
    Object.defineProperty(el, "hidden", { configurable: true, get: () => hidden, set: (v) => { if (hidden !== !!v) write(); hidden = !!v; } });
    const cn = Object.getOwnPropertyDescriptor(el, "className");
    Object.defineProperty(el, "className", { configurable: true, get: cn.get, set: (v) => { write(); cn.set(v); } });
    const sp = el.style.setProperty, rp = el.style.removeProperty;
    el.style.setProperty = (k, v) => { write(); sp(k, v); };
    el.style.removeProperty = (k) => { write(); rp(k); };
    const cl = el.classList, tg = cl.toggle, add = cl.add, rm = cl.remove;
    cl.toggle = (c, f) => { const was = cl.contains(c), on = tg(c, f); if (was !== on) write(); return on; };
    cl.add = (...c) => { write(); add(...c); };
    cl.remove = (...c) => { write(); rm(...c); };
    el.dataset = new Proxy(el.dataset, {
      set: (t, k, v) => { write(); t[k] = v; return true; },
      deleteProperty: (t, k) => { write(); delete t[k]; return true; },
    });
    const gbcr = el.getBoundingClientRect;
    el.getBoundingClientRect = () => { read("rect"); return gbcr(); };
    for (const k of ["offsetHeight", "offsetWidth", "clientHeight", "clientWidth"]) {
      const d = Object.getOwnPropertyDescriptor(el, k);
      Object.defineProperty(el, k, { configurable: true, get: () => { read(k); return d.get.call(el); } });
    }
    return el;
  };
  const rawCreate = dom.document.createElement, rawById = dom.document.getElementById;
  dom.document.createElement = (tag) => {
    const el = instrument(rawCreate(tag));
    if (String(tag).toLowerCase() === "canvas") el.getContext = () => ctx2d();
    return el;
  };
  dom.document.getElementById = (id) => instrument(rawById(id));
  instrument(dom.documentElement); instrument(dom.body);
  const listeners = {};
  const on = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); };
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, WeakSet, RegExp, Date,
    parseFloat, parseInt, isFinite, Infinity,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false, DEBUG: 4 },
    document: dom.document, devicePixelRatio: 1,
    M4: { clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) },
    PhysicsConsts: { IDLE_RPM: 5000, MAX_RPM: 15000 },
    Ghost: { hasGhost: () => false, timeAt: () => null, at: () => null },
    GhostShare: { hasGuest: () => false, timeAt: () => null, at: () => null },
    TrackMaps: { drsZones: () => [], sectorColors: () => ["#ffd700", "#c0c0c0", "#cd9b5a"] },
    setTimeout: () => 1, clearTimeout: () => {},
    performance: { now: () => state.now },
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({
      getPropertyValue: (k) => { read("computed " + k); return ALL_TOKENS[k] || ""; },
      columnGap: "0px", rowGap: "0px", transform: "none",
    }),
  };
  for (const [k, sk] of [["innerWidth", "vw"], ["innerHeight", "vh"]]) {
    Object.defineProperty(sb, k, { configurable: true, enumerable: true,
      get: () => { state.vpReads++; read(k); return state[sk]; } });
  }
  if (events) {
    sb.addEventListener = on;
    sb.visualViewport = { addEventListener: (t, fn) => on("vv:" + t, fn) };
  }
  sb.window = sb;
  vm.runInNewContext(src("js/ui/live-region.js"), sb, { filename: "js/ui/live-region.js" });
  vm.runInNewContext(src("js/ui/hud-minimap.js"), sb, { filename: "js/ui/hud-minimap.js" });   // GameHud.create builds its HudMinimap (#1656)
  vm.runInNewContext(src("js/ui/hud.js"), sb, { filename: "js/ui/hud.js" });
  vm.runInNewContext(src("js/race/overtake-mode.js"), sb, { filename: "js/race/overtake-mode.js" });
  const $ = (id) => dom.document.getElementById(id);
  const minimap = $("minimap");
  const els = {
    pos: $("hud-pos"), lap: $("hud-lap"), time: $("hud-time"), best: $("hud-best"),
    speed: $("hud-speed-n"), energy: $("hud-energy-fill"), ot: $("hud-ot"), aero: $("hud-aero"),
    btnOT: $("btn-ot"), btnAero: $("btn-aero"),
    gapA: $("hud-gap-ahead"), gapB: $("hud-gap-behind"), hudSectors: $("hud-sectors"),
    flag: $("hud-flag"), minimap, gear: $("hud-gear"), rpmFill: $("hud-rpm-fill"), tach: $("hud-tach"),
    announceLive: $("announce-live"), pausebtn: $("pausebtn"), btnCam: $("btn-cam"),
  };
  minimap.getContext = () => ctx2d();
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
  };
  const hud = sb.GameHud.create(G);
  const R = (left, top_, w, h) => ({ left, top: top_, right: left + w, bottom: top_ + h, width: w, height: h });
  const mk = (cls, parent) => { const e = dom.document.createElement("div"); e.className = cls; (parent || dom.body).appendChild(e); return e; };
  const top = mk("hud-top"), bottom = mk("hud-bottom");
  const dockL = $("dock-left"), dockR = $("dock-right");
  const gear = mk("g", bottom), gL = mk("gl", dockL), gR = mk("gr", dockR);
  const paint = () => {
    const w = state.vw, h = state.vh;
    top._rect = R((w - 300) / 2, 8, 300, 54);
    minimap._rect = R(10, 8, 110, 110);
    els.hudSectors._rect = R(w - 150, 8, 140, 72);
    gear._rect = R(100, h - 90, 250, 50);
    dockL._rect = gL._rect = R(0, 200, 140, h - 200);
    dockR._rect = gR._rect = R(w - 140, 200, 140, h - 200);
  };
  paint();
  let n = 0;
  /** One rAF: the browser lays out between frames, then the race frame runs. */
  const frame = (dt = 16.7) => {
    state.dirty = false;
    player.speed = 50 + (n % 37); player.rpm = 6000 + (n * 97) % 8000; player.gear = 3 + (n % 4);
    player.lapTime = 12 + n * 0.0167; n++;   // the tick writes its lap clock every tick, as in a race
    const f0 = state.forced, r0 = state.vpReads;
    state.why.length = 0;
    hud.updateHud(false, dt);
    state.now += dt;
    return { forced: state.forced - f0, vpReads: state.vpReads - r0, why: state.why.slice() };
  };
  const resize = (w, h) => {
    state.vw = w; state.vh = h; paint();
    for (const fn of listeners.resize || []) fn({ type: "resize" });
  };
  return { frame, resize, state, paint, root: dom.documentElement, settle: () => { state.now += 5000; } };
}

test("HUD tick: fit reads run before the frame's instrument writes, and the viewport is cached (5-perf F2)", () => {
  const h = bootOrderHarness();
  for (let i = 0; i < 40; i++) h.frame();   // boot, first fits, the full-fit key settles
  h.settle();
  const frames = [];
  for (let i = 0; i < 120; i++) frames.push(h.frame());   // 2 s at 60 fps: ~20 ticks, incl. same-key re-measures
  const worst = Math.max(...frames.map((f) => f.forced));
  // At most the end-of-tick phoneFitStampSync measure, which intentionally
  // measures after REL / sector rows / announce land (tip: 2-3 per tick).
  assert.ok(worst <= 1,
    "a tick forced " + worst + " layouts: " + JSON.stringify(frames.filter((f) => f.forced > 1).slice(0, 2)));
  // #2240: a steady tick skips the post-write probe, so the forced layout is the 3 s backstop's, not every tick's.
  const forcedTicks = frames.filter((f) => f.forced === 1).length;
  assert.ok(forcedTicks <= 3, "steady ticks still force a layout each: " + forcedTicks + " of ~20");
  assert.ok(frames.filter((f) => f.vpReads === 0).length === frames.length, "no viewport reads");
  assert.equal(frames.reduce((a, f) => a + f.vpReads, 0), 0, "innerWidth / innerHeight are not read per tick once cached");
});

test("HUD viewport cache: a resize re-fits from the new size, and fit results match the live-read path", () => {
  const cached = bootOrderHarness({ events: true });
  const live = bootOrderHarness({ events: false });
  const run = (k) => { for (let i = 0; i < k; i++) { cached.frame(); live.frame(); } };
  const decls = (h) => JSON.stringify(h.root.style._decls);
  run(60);
  assert.equal(decls(cached), decls(live), "same published fit with the cache as with live reads");
  // A real resize event: the cached path re-reads and re-fits.
  cached.resize(932, 430); live.state.vw = 932; live.state.vh = 430; live.paint();
  assert.ok(cached.frame().vpReads > 0, "the resize re-reads the viewport");
  live.frame();
  run(30);
  assert.equal(decls(cached), decls(live), "same published fit after the resize");
  // Past the iOS settle window the cache stops reading again.
  cached.settle(); run(12);
  let reads = 0;
  for (let i = 0; i < 30; i++) reads += cached.frame().vpReads;
  assert.equal(reads, 0, "settled: no viewport reads per tick");
});


test("publishing a changed top-control zoom requests one subsequent full fit", () => {
  const source = read("js/ui/hud.js");
  const start = source.indexOf('  set("--hud-z-dock", capDock, Math.max(btnFloor, btnScale));');
  const end = source.indexOf("  // Publish --dock-r-w in the FINAL", start);
  const publish = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  for (const [before, requested, cap, expected] of [
    [3, 3, 1.25, true], [1.25, 3, 1.25, false], [3, 3, 2, false],
    [1.25, 3, Infinity, true], [1.25, 3, 1.2504, false], [1.6, 3, 1.8, true],
  ]) {
    let painted = String(before);
    const ctx = vm.createContext({ Math, zDockPub: before, btnFloor: 1, btnScale: requested, capDock: cap,
      _fitKey: "settled", _fitWait: 30, _fitPending: false,
      root: { style: { getPropertyValue: () => painted } },
      set(prop, value, base) { painted = value >= base ? "" : String(Math.max(.4, Math.round(value * 1000) / 1000)); },
    });
    vm.runInContext(publish, ctx);
    assert.equal(ctx._fitKey, expected ? "" : "settled", `published top zoom ${before} → ${painted || requested}`);
    assert.equal(ctx._fitWait, expected ? 0 : 30, "unchanged clamped zoom keeps steady-state backoff");
    assert.equal(ctx._fitPending, expected, "changed effective zoom keeps the full fit pending");
    const stampStart = source.indexOf("function phoneFitStampSync(");
    const stampEnd = source.indexOf("\nfunction fitHud()", stampStart);
    assert.ok(stampStart >= 0 && stampEnd > stampStart);
    const styles = new Map();
    Object.assign(ctx, {
      document: { body: { classList: { contains: () => false } }, documentElement: ctx.root },
      _hudTop: {}, _hudBottom: {}, _fitStamped: false, _fitClearSeq: 0,
      pickDocks() {}, els: {}, phonePaintedClash: () => false, radioPaintedKey: () => "", _stampKey: "", _stampWait: 0,
      hStyle(root, key, value) { styles.set(key, value); },
    });
    vm.runInContext(source.slice(stampStart, stampEnd), ctx);
    vm.runInContext("phoneFitStampSync(1)", ctx);
    assert.equal(styles.get("--hud-fit-stamp"), expected ? "" : "1",
      "clash-free geometry cannot publish settled while a full fit is pending");
    if (expected) {
      ctx._fitPending = false;
      vm.runInContext("phoneFitStampSync(1)", ctx);
      assert.equal(styles.get("--hud-fit-stamp"), "1", "completed full fit permits the stamp");
    }
  }
});

test("fitHud tracer: off by default it logs nothing; on, it logs one line per CHANGE of the published fit", () => {
  const lines = (on) => {
    const out = [];
    const h = bootFlipHarness({ log: { info() {}, warn() {}, error() {}, DEBUG: 4, enabled: () => on, debug: (ns, m) => out.push(m) } });
    for (let i = 0; i < 5; i++) { h.paintAt(h.pub()); h.invalidate(); h.tick(); }
    return out;
  };
  assert.deepEqual(lines(false), [], "flag off: not one record");
  const on = lines(true);
  assert.ok(on.length >= 1 && on.every((m) => m.startsWith("hudfit top=")), JSON.stringify(on));
  assert.equal(new Set(on).size, on.length, "a repeated state is not logged twice");
  assert.ok(on.length < 5, "a settled fit logs fewer lines than ticks: " + JSON.stringify(on));
});

test("fitHud dock pass: a sector plate ABOVE the dock is not on it (agrees with HudLayout.clearControls), a plate level with it still yields", () => {
  const run = (top) => {
    const h = bootFlipHarness();
    const sec = h.$("hud-sectors");
    sec.hidden = false;
    sec._rect = h.R(h.W - 160, top, 140, 72);   // right edge inside the dock's columns
    h.invalidate();
    for (let i = 0; i < 3; i++) h.tick();
    return sec.style.getPropertyValue("max-width") || (sec.style.maxWidth || "");
  };
  assert.equal(run(100), "", "plate above the buttons: no max-width clamp (the clamp ping-pongs with clearControls' --hl-x)");
  assert.notEqual(run(240), "", "plate level with the buttons still shrinks away from them");
});

test("fitHud leaves a manually sized sector plate to HudLayout and releases stale automatic width", () => {
  const h = bootFlipHarness();
  const sec = h.$("hud-sectors");
  Object.defineProperty(sec.style, "maxWidth", {
    get() { return this.getPropertyValue("max-width"); },
    set(v) { this.setProperty("max-width", v); },
    configurable: true,
  });
  sec.hidden = false;
  sec._rect = h.R(h.W - 160, 240, 140, 72);
  h.invalidate(); h.tick();
  assert.ok(sec.style.maxWidth, "automatic plate is constrained next to the dock");
  sec.setAttribute("data-hl-user", "");
  sec.setAttribute("data-hl", "");
  for (let i = 0; i < 4; i++) {
    h.invalidate(); h.tick();
    assert.equal(sec.style.getPropertyValue("max-width"), "", "saved plate keeps its intrinsic width on every fit");
  }
});


test("fitHud: intentional manual overlaps neither squeeze sectors nor reopen the fitter", () => {
  const h = bootFlipHarness();
  const { sectors } = forceUnresolvableClash(h);
  sectors.setAttribute("data-hl-user", "");
  // An explicit 0,0 / 100% entry is still manual, even without data-hl.
  let fits = 0;
  h.sb.HudLayout = { fit() { fits++; } };
  h.invalidate(); h.tick();
  const initial = fits;
  for (let i = 0; i < 10; i++) h.tick();
  assert.equal(fits, initial, "intentional overlap is not an automatic-fit failure");
  assert.equal(sectors.style.getPropertyValue("max-width"), "");
  assert.ok(h.root.style.getPropertyValue("--hud-fit-stamp"), "manual overlap does not void the settled stamp");
});

test("fitHud: a manually placed huge plate does not reduce the automatic top band's budget", () => {
  const small = bootFlipHarness(), huge = bootFlipHarness();
  for (const h of [small, huge]) {
    h.$("hud-sectors").setAttribute("data-hl-user", ""); h.$("hud-sectors").setAttribute("data-hl-v4", "");
  }
  huge.$("hud-sectors")._rect = huge.R(-10000, -10000, 20000, 20000);
  for (const h of [small, huge]) { h.invalidate(); h.tick(); }
  assert.equal(huge.pub(), small.pub(), "manual plate dimensions do not constrain other readouts");
});
