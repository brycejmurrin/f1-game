/* hud-announce-lane-cache — PERF #1723: announceLane must not call
 * getBoundingClientRect on steady 10 Hz ticks (gap digit rolloff included).
 * Rects are cached; invalidate only on real layout change.
 *
 * Run: node --test tests/unit/hud-announce-lane-cache.test.mjs
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

function boot(opts = {}) {
  const dom = makeDom();
  const rawCreate = dom.document.createElement;
  let gbrCalls = 0, gcsCalls = 0;
  const wrapRect = (el) => {
    if (!el || el._laneRectWrapped) return el;
    el._laneRectWrapped = true;
    const orig = el.getBoundingClientRect.bind(el);
    el._gbr = 0;
    el.getBoundingClientRect = () => { gbrCalls++; el._gbr++; return orig(); };
    return el;
  };
  dom.document.createElement = (tag) => {
    const el = wrapRect(rawCreate(tag));
    if (String(tag).toLowerCase() === "canvas") {
      el.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
    }
    return el;
  };
  const rawById = dom.document.getElementById.bind(dom.document);
  dom.document.getElementById = (id) => wrapRect(rawById(id));

  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, WeakSet, RegExp, Date,
    parseFloat, parseInt, isFinite, Infinity, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    M4: { clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) },
    PhysicsConsts: { IDLE_RPM: 5000, MAX_RPM: 15000, ES_MJ: 4 },
    Ghost: { hasGhost: () => false, timeAt: () => null, at: () => null },
    GhostShare: { hasGuest: () => false, timeAt: () => null, at: () => null },
    TrackMaps: { drsZones: () => [], sectorColors: () => ["#ffd700", "#c0c0c0", "#cd9b5a"] },
    setTimeout: () => 1, clearTimeout: () => {},
    performance: { now: () => 1000 },
    getComputedStyle: () => { gcsCalls++; return { getPropertyValue: () => "", transform: "none", columnGap: "0px", rowGap: "0px" }; },
  };
  sb.window = sb;
  vm.runInNewContext(src("js/ui/live-region.js"), sb, { filename: "js/ui/live-region.js" });
  vm.runInNewContext(src("js/ui/hud-readouts.js"), sb, { filename: "js/ui/hud-readouts.js" });
  vm.runInNewContext(src("js/ui/hud.js"), sb, { filename: "js/ui/hud.js" });
  vm.runInNewContext(src("js/race/overtake-mode.js"), sb, { filename: "js/race/overtake-mode.js" });

  const $ = (id) => wrapRect(dom.byId(id));
  const R = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h });
  const els = {
    pos: $("hud-pos"), lap: $("hud-lap"), time: $("hud-time"), best: $("hud-best"),
    speed: $("hud-speed-n"), energy: $("hud-energy-fill"), ot: $("hud-ot"), aero: $("hud-aero"),
    btnOT: $("btn-ot"), btnAero: $("btn-aero"),
    gapA: $("hud-gap-ahead"), gapB: $("hud-gap-behind"), hudSectors: $("hud-sectors"),
    flag: $("hud-flag"), minimap: $("minimap"), gear: $("hud-gear"), rpmFill: $("hud-rpm-fill"),
    tach: $("hud-tach"), announceLive: $("announce-live"), announce: $("announce"),
    pausebtn: $("pausebtn"), btnCam: $("btn-cam"),
  };
  els.minimap.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
  // desktop: fitHud early-return skips phonePaintedClash rect walks
  dom.document.body.classList.add("in-race");
  if (!opts.phone) dom.document.body.classList.add("desktop");

  const mk = (cls, parent) => {
    const e = wrapRect(dom.document.createElement("div"));
    e.className = cls;
    (parent || dom.document.body).appendChild(e);
    return e;
  };
  const top = mk("hud-top"), bottom = mk("hud-bottom");
  const bar = wrapRect(dom.document.createElement("div"));
  bar.id = "hud-dock";
  dom.document.body.appendChild(bar);
  const dockL = $("dock-left"), dockR = $("dock-right");
  for (const d of [dockL, dockR]) {
    if (d.parentNode) d.parentNode.removeChild(d);
    bar.appendChild(d);
  }
  const gL = mk("gl", dockL), gR = mk("gr", dockR);
  const gaps = mk("hud-gaps");
  if (els.gapA.parentNode) els.gapA.parentNode.removeChild(els.gapA);
  if (els.gapB.parentNode) els.gapB.parentNode.removeChild(els.gapB);
  gaps.appendChild(els.gapA);
  gaps.appendChild(els.gapB);

  top._rect = R(40, 8, 240, 54);
  bottom._rect = R(100, 600, 400, 120);
  els.minimap._rect = R(40, 80, 140, 140);
  gaps._rect = R(200, 80, 120, 60);
  els.gapA._rect = R(200, 80, 120, 30);
  els.gapB._rect = R(200, 110, 120, 30);
  els.hudSectors._rect = opts.phone ? R(880, 70, 220, 70) : R(980, 70, 220, 70);
  els.flag._rect = R(400, 70, 160, 40);
  els.announce._rect = R(400, 120, 200, 80);
  els.pausebtn._rect = R(1180, 8, 40, 40);
  els.btnCam._rect = R(1130, 8, 40, 40);
  bar._rect = R(0, 200, 1280, 400);
  dockL._rect = R(0, 200, 140, 400);
  dockR._rect = R(1140, 200, 140, 400);
  gL._rect = R(0, 200, 140, 400);
  gR._rect = R(1140, 200, 140, 400);

  const mkCar = (o) => ({
    team: { id: "t1", color: [1, 0, 0] }, lap: 1, lapTime: 12, best: Infinity,
    speed: 50, energy: 0.5, gear: 3, rpm: 5000, otT: 0, otE: 0, aeroX: 0, s: 10, prog: 10,
    retired: false, ...o,
  });
  const player = mkCar({ code: "YOU", rank: 2 });
  const rival = mkCar({ code: "BEA", rank: 1, prog: 10 + 100 });
  const G = {
    els, player, cars: [rival, player], ranked: [rival, player], timeTrial: false, state: "race",
    session: "race", lapsTarget: 5,
    track: { map: [[0, 0], [0.5, 0.5], [1, 1]], total: 1000, def: {} },
    sectorLast: [null, null, null], sectorBests: [Infinity, Infinity, Infinity],
    fieldSectorBests: [Infinity, Infinity, Infinity], aeroZones: [{}], ttRecord: Infinity,
    fmtTime: (t) => (isFinite(t) && t > 0 ? t.toFixed(2) : "-"),
    dashKph: (v) => v * 3.6, vTop: () => 90, otEnabled: () => true, cssCol: () => "#f00",
  };
  const hud = sb.GameHud.create(G);
  return {
    hud, rival, player, els, sb, gaps,
    nat: () => hud.updateHud(false, 100),
    force: () => hud.updateHud(true),
    gbrCalls: () => gbrCalls,
    gcsCalls: () => gcsCalls,
    resetGbr: () => { gbrCalls = 0; gcsCalls = 0; for (const el of [els.announce, $("btn-boost"), gaps, top]) el._gbr = 0; },
    $,
    misses: () => hud.laneRectMisses(),
    resetMisses: () => hud.resetLaneRectMisses(),
  };
}

test("source: lane memo buckets gaps empty/non-empty; caches rects; invalidateFit clears", () => {
  const js = read("js/ui/hud.js");
  assert.match(js, /function invalidateLaneRects\b/, "invalidateLaneRects exists");
  assert.match(js, /function laneRect\b/, "laneRect caches getBoundingClientRect");
  assert.match(js, /gapBit/, "gap empty/non-empty bit is in the layout key");
  assert.doesNotMatch(
    js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""),
    /els\.gapA\s*\?\s*\(els\.gapA\.textContent[^)]*\)\.length/,
    "gap textContent.length is no longer in the lane memo key",
  );
  assert.match(js, /invalidateFit\([\s\S]*?invalidateLaneRects/, "invalidateFit drops the lane rect cache");
});

test("PERF: steady ticks + gap digit rolloff → 0 announceLane getBoundingClientRect", () => {
  const h = boot();
  // Settle fit + warm the lane cache (forced path always re-clips).
  for (let i = 0; i < 4; i++) h.force();
  h.resetMisses();
  h.resetGbr();

  // Steady 10 Hz ticks with gap seconds shrinking — same empty/non-empty bit.
  for (let i = 0; i < 12; i++) {
    h.rival.prog = h.player.prog + 100 - i;
    h.nat();
  }
  assert.equal(h.misses(), 0, "steady ticks after warm: 0 laneRect cache misses (0 gBCR from announceLane)");

  // Empty → non-empty is a real layout change (gaps chip appears / grows).
  h.els.gapA.textContent = "";
  h.els.gapB.textContent = "";
  h.nat();
  h.resetMisses();
  h.rival.prog = h.player.prog + 1000 + 300; // +1L spelling returns → nonempty
  h.nat();
  assert.ok(h.misses() >= 1, "gaps empty↔on re-measures via laneRect (stubbed gBCR)");

  // Re-warm on the "N.NNs" spelling so fitHud's gapLen key matches (a
  // "+1L"→"2.00s" length flip legitimately re-fits once). After that,
  // same-length digit rolloff must stay at 0 laneRect misses.
  h.rival.prog = h.player.prog + 100;
  for (let i = 0; i < 3; i++) h.force();
  h.nat(); // absorb the format into the fit key
  h.resetMisses();
  for (let i = 0; i < 10; i++) {
    h.rival.prog = h.player.prog + 100 + (i % 5);
    h.nat();
  }
  assert.equal(h.misses(), 0, "same-length digit rolloff after re-warm: 0 laneRect misses");

  h.resetMisses();
  h.hud.invalidateFit();
  assert.ok(h.misses() >= 1, "invalidateFit (MOVE & SIZE / scale) re-measures");

  h.resetMisses();
  h.force();
  assert.ok(h.misses() >= 1, "forced refresh always re-measures");
});


test("delayed primary packing invalidates the cached tyre lane rectangle", () => {
  const h = boot();
  const tyre = h.sb.document.createElement("div");
  h.sb.document.body.appendChild(tyre); h.els.tyre = tyre;
  tyre._rect = {left: 20, top: 100, right: 140, bottom: 140, width: 120, height: 40};
  for (let i = 0; i < 4; i++) h.force();
  h.nat(); h.resetMisses();
  tyre.style.setProperty("margin-top", "12px");
  h.nat();
  assert.ok(h.misses() > 0, "a packed tyre changes the lane's clipper geometry without a settings edit");
  h.resetMisses(); h.nat();
  assert.equal(h.misses(), 0, "the unchanged packed layout reuses the cache again");
});

// #2151: the 10 Hz block ran radioPaintedCollapse AFTER the tick's DOM writes,
// so every tick with a radio card up read #announce (and up to four clash
// targets) — a forced layout per tick on a real page. Same-key phone ticks
// also measured BOOST in _boostOnRightHalf four times (fitHud's pre-check, its
// phonePaintedClash, and phoneFitStampSync's two identical probes).
test("PERF #2151: phone ticks with a radio card up → no painted-collapse re-read, BOOST measured once per probe", () => {
  const h = boot({ phone: true });
  const boost = h.$("btn-boost");
  boost._rect = { left: 1180, top: 400, right: 1240, bottom: 460, width: 60, height: 60 };
  h.els.announce.textContent = "RADIO: BOX THIS LAP";
  assert.equal(h.els.announce.hidden, false, "the card is up");
  // Attribute each rect read to the function that made it (the frame above the stub).
  const by = {};
  for (const el of [h.els.announce, boost]) {
    const g = el.getBoundingClientRect;
    el.getBoundingClientRect = () => {
      const fn = (new Error().stack.split("\n")[2] || "").trim().split(" ")[1];
      by[el.id + ":" + fn] = (by[el.id + ":" + fn] || 0) + 1;
      return g();
    };
  }
  const reads = (k) => by[k] || 0;
  for (let i = 0; i < 4; i++) h.force();
  h.nat();
  for (const k in by) delete by[k];
  const N = 20;
  for (let i = 0; i < N; i++) h.nat();
  assert.ok(reads("announce:radioPaintedCollapse") <= 1,
    `radioPaintedCollapse read #announce ${reads("announce:radioPaintedCollapse")}× over ${N} ticks (want ≤ 1)`);
  // One measure in fitHud's same-key probe (shared with its phonePaintedClash),
  // one in phoneFitStampSync's post-write stamp probe.
  assert.ok(reads("btn-boost:_boostOnRightHalf") <= 2 * N,
    `_boostOnRightHalf measured BOOST ${reads("btn-boost:_boostOnRightHalf")}× over ${N} ticks (want ≤ ${2 * N})`);
  // A new message is a real change: it re-measures once, then caches again.
  h.els.announce.textContent = "RADIO: PUSH NOW";
  for (const k in by) delete by[k];
  for (let i = 0; i < N; i++) h.nat();
  const re = reads("announce:radioPaintedCollapse");
  assert.ok(re >= 1 && re <= 2, `new card text re-measures, then settles (${re}× over ${N} ticks)`);
  // A forced refresh (probes, jump) always measures.
  for (const k in by) delete by[k];
  h.force();
  assert.ok(reads("announce:radioPaintedCollapse") >= 1, "forced update measures");
});
