/* HUD behaviour pins that must survive the band-allocator rewrite.
 *
 * The HUD code audit (PR #1375, its findings F-01/F-02/F-06) found that most of fitHud's
 * phone layout is pinned only by source-text regexes, which a behaviour-preserving
 * rewrite breaks and a regression with the same text passes. These pins drive
 * js/ui/hud.js through updateHud on a mini-dom with fixed rects and assert what the
 * page ends up with, so they hold for ship's fitHud and for the allocator alike.
 *
 * Pins that FAIL on ship today are `todo` (node:test runs them and reports, the
 * suite stays green) and name the change that fixes them. When that change lands,
 * drop the `todo` — never loosen the assertion to make it pass.
 *
 * Run: node --test tests/unit/hud-pins.test.mjs
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

const TOKENS = (() => {
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

const R = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h });

/** A touch phone in landscape: tower, map, gap chips, sector plate, two lit dock
 *  columns. Top-band pieces are painted at `z`; `cssZoom: false` models a browser
 *  without Element.currentCSSZoom (iOS Safari before 26.4), which still paints
 *  CSS zoom into getBoundingClientRect. */
function boot({ W = 844, H = 390, scale = 1, cssZoom = true, camInRow = true } = {}) {
  const INTRINSIC = { map: 110, top: 300, sectors: 140, gaps: 84 };
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
      getPropertyValue: (k) => TOKENS[k] || "",
      columnGap: "0px", rowGap: "0px", transform: "none",
    }),
  };
  sb.window = sb;
  // Old Safari is a real DOM whose Element.prototype lacks currentCSSZoom; the
  // other harnesses here (and mini-dom suites) define no Element at all.
  if (!cssZoom) sb.Element = function Element() {};
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
  dom.document.body.classList.add("in-race");   // no `desktop` class: a touch body
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
  root.style.setProperty("--hud-scale", String(scale));

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
  for (const g of [els.gapA, els.gapB]) { if (g.parentNode) g.parentNode.removeChild(g); gaps.appendChild(g); }
  const announce = $("announce");
  const strat = $("hud-strat");

  const zoomOf = new Map();
  const docksLit = { on: true };
  function paintAt(z) {
    top._rect = R((W - INTRINSIC.top * z) / 2, 8, INTRINSIC.top * z, 54 * z);
    minimap._rect = R(10 * z, 8, INTRINSIC.map * z, INTRINSIC.map * z);
    gaps._rect = R(10 * z + INTRINSIC.map * z + 8 * z, 8, INTRINSIC.gaps * z, 40 * z);
    els.hudSectors._rect = R(W - 10 * z - INTRINSIC.sectors * z, 8, INTRINSIC.sectors * z, 72 * z);
    // CAM sits in the tower's row just right of it (as on a phone), so the radio
    // card's top-row slot never fits and it hangs in the lane under the tower.
    if (camInRow) els.btnCam._rect = R((W + INTRINSIC.top * z) / 2 + 20, 8, 80, 44);
    gear._rect = R(100, H - 90, 250, 50);
    energy._rect = R(400, H - 90, 250, 50);
    bar._rect = R(0, H - 190, W, 190);
    dockL._rect = R(0, H - 190, 140, 190);
    dockR._rect = R(W - 140, H - 190, 140, 190);
    gL._rect = docksLit.on ? R(0, H - 190, 140, 190) : R(0, 0, 0, 0);
    gR._rect = docksLit.on ? R(W - 140, H - 190, 140, 190) : R(0, 0, 0, 0);
    if (!cssZoom) return;
    for (const [el, zz] of [[top, z], [minimap, z], [gaps, z], [els.hudSectors, z],
      [bottom, 1], [dockL, 1], [dockR, 1], [gL, 1], [gR, 1], [gear, 1], [energy, 1]]) {
      zoomOf.set(el, zz);
      Object.defineProperty(el, "currentCSSZoom", { get: () => zoomOf.get(el) ?? 1, configurable: true });
    }
  }
  const pub = () => {
    const v = root.style.getPropertyValue("--hud-z-top");
    return v === "" ? scale : +v;
  };
  paintAt(scale);
  for (let i = 0; i < 3; i++) hud.updateHud(true);

  return {
    root, announce, strat, docksLit, pub, paintAt,
    lane: () => ({
      x: root.style.getPropertyValue("--announce-lane-x"),
      w: root.style.getPropertyValue("--announce-lane-w"),
      collapsed: !!(announce.hasAttribute && announce.hasAttribute("data-lane-collapsed")),
    }),
    /** One full fit at the current paint, then the rest of that HUD tick. */
    refit() { sb.GameHud.invalidateFit(); hud.updateHud(true); },
  };
}

test("pin: the radio lane is published on a touch phone with lit docks (harness sanity)", () => {
  const h = boot();
  const l = h.lane();
  assert.ok(parseFloat(l.x) > 0 && parseFloat(l.w) > 0, "lane must be published: " + JSON.stringify(l));
});

test("pin: a HIDDEN readout never bounds the radio lane (visible-element-only obstacles)", () => {
  const h = boot();
  const before = h.lane();
  // A STRATEGY box that was laid out in the card's rows and then switched off keeps
  // a stale rect in this harness; only what is visible may clip the card.
  h.strat._rect = R(130, 80, 400, 60);
  h.strat.hidden = true;
  h.refit();
  assert.deepEqual(h.lane(), before, "a hidden #hud-strat moved the lane");
});

test("pin F-02: the lane comes back after the docks hide and return with the same geometry",
  { todo: "hStyle's write cache survives a bare removeProperty (js/ui/hud.js announceLane) — fixed by hUnset on branch cursor/hud-band-allocator-5e2c" },
  () => {
    const h = boot();
    const first = h.lane();
    assert.ok(parseFloat(first.w) > 0, "precondition: lane published");
    h.docksLit.on = false; h.paintAt(h.pub()); h.refit();          // pause / menu: no dock lit
    assert.equal(h.lane().w, "", "precondition: lane unpublished while no dock is lit");
    h.docksLit.on = true; h.paintAt(h.pub()); h.refit();           // back to racing, same layout
    assert.deepEqual(h.lane(), first, "lane vars must be re-published, or the card falls back to the centre");
  });

test("pin F-06: a radio card the fit collapsed off S3 stays collapsed for the rest of the tick",
  { todo: "updateHud re-runs announceLane after fitHud's painted collapse and re-opens the lane (js/ui/hud.js ~:1836) — fixed by placeRadio on branch cursor/hud-band-allocator-5e2c" },
  () => {
    const h = boot();
    h.announce.hidden = false;
    // The card as painted sits on the sector plate (S3, x 694..834, y 8..80): the fit's
    // painted check collapses it.
    h.announce._rect = R(600, 60, 200, 60);
    h.refit();
    const l = h.lane();
    assert.equal(l.collapsed, true, "data-lane-collapsed must survive the tick: " + JSON.stringify(l));
    assert.equal(l.w, "0px", "--announce-lane-w must stay 0 for the tick: " + JSON.stringify(l));
  });

test("pin F-01: without Element.currentCSSZoom the top-band zoom converges instead of flip-flopping",
  () => {
    // Control: the same layout WITH currentCSSZoom settles (one value), so a failure
    // below is the missing property, not the harness.
    const c = boot({ W: 852, H: 393, scale: 2, cssZoom: true, camInRow: false });
    const ctl = [];
    for (let i = 0; i < 4; i++) { c.paintAt(c.pub()); c.refit(); ctl.push(+c.pub().toFixed(3)); }
    assert.equal(new Set(ctl).size, 1, "control must settle: " + JSON.stringify(ctl));
    // No chrome in the tower's row: the gap-strip / sector budget binds the cap,
    // which is the path that divides painted widths (the chrome cap divides by the
    // PUBLISHED zoom and does not flip).
    const h = boot({ W: 852, H: 393, scale: 2, cssZoom: false, camInRow: false });
    const caps = [];
    for (let i = 0; i < 8; i++) { h.paintAt(h.pub()); h.refit(); caps.push(+h.pub().toFixed(3)); }
    const tail = caps.slice(-4);
    const spread = Math.max(...tail) - Math.min(...tail);
    assert.ok(spread < 0.02, "the published --hud-z-top must settle; got " + JSON.stringify(caps));
    // …and on the same zoom a browser WITH the property reaches: same layout, same cap.
    assert.ok(Math.abs(caps[caps.length - 1] - ctl[0]) < 0.02,
      "old Safari must settle where the control does (" + ctl[0] + "); got " + JSON.stringify(caps));
  });
