/* hud-radio-slot.test.mjs — one radio home per HUD profile, including BROADCAST.
 *
 * #1504 parked the card in the tower row (`hud-radio-top`) or the top-right
 * corner (`data-radio-corner`). `radioTopSlot` / `radioUnderRight` used to
 * skip BROADCAST (`!bcast`), so that cell never received either marker and
 * kept the leftover 14svh / beside-mirror / hanging-lane / compact /
 * caution / centred homes fighting each other in css/hud.css.
 *
 * Run: node --test tests/unit/hud-radio-slot.test.mjs
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

function boot() {
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
    document: dom.document,
    innerWidth: 800, innerHeight: 400, devicePixelRatio: 1,
    M4: { clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) },
    PhysicsConsts: { IDLE_RPM: 5000, MAX_RPM: 15000 },
    Ghost: { hasGhost: () => false, timeAt: () => null, at: () => null },
    GhostShare: { hasGuest: () => false, timeAt: () => null, at: () => null },
    TrackMaps: { drsZones: () => [], sectorColors: () => ["#ffd700", "#c0c0c0", "#cd9b5a"] },
    setTimeout: () => 1, clearTimeout: () => {},
    performance: { now: () => 1000 },
    getComputedStyle: () => ({ getPropertyValue: (k) => ALL_TOKENS[k] || "", columnGap: "0px", rowGap: "0px", transform: "none" }),
  };
  sb.window = sb;
  vm.runInNewContext(src("js/ui/live-region.js"), sb, { filename: "js/ui/live-region.js" });
  vm.runInNewContext(src("js/ui/hud.js"), sb, { filename: "js/ui/hud.js" });
  const $ = (id) => dom.byId(id);
  const minimap = $("minimap");
  minimap.getContext = () => ctx2d();
  const els = {
    pos: $("hud-pos"), lap: $("hud-lap"), time: $("hud-time"), best: $("hud-best"),
    speed: $("hud-speed-n"), energy: $("hud-energy-fill"), ot: $("hud-ot"), aero: $("hud-aero"),
    btnOT: $("btn-ot"), btnAero: $("btn-aero"),
    gapA: $("hud-gap-ahead"), gapB: $("hud-gap-behind"), hudSectors: $("hud-sectors"),
    flag: $("hud-flag"), minimap, gear: $("hud-gear"), rpmFill: $("hud-rpm-fill"), tach: $("hud-tach"),
    announceLive: $("announce-live"), announce: $("announce"),
    btnCam: $("btn-cam"), pausebtn: $("pausebtn"),
  };
  const player = {
    team: { id: "t1", color: [1, 0, 0] }, code: "YOU", rank: 1, lap: 1, lapTime: 12, best: Infinity,
    speed: 50, energy: 0.5, gear: 3, rpm: 5000, boostOn: false,
    otT: 0, otArmed: false, otE: 0, otEarned: false, aeroX: 0, xArmed: false, s: 10, prog: 10, retired: false,
  };
  const G = {
    els, player, cars: [player], ranked: [player], timeTrial: false, state: "race",
    lapsTarget: 5, track: { map: [[0, 0], [0.5, 0.5], [1, 1]], total: 100, def: {} },
    sectorLast: [null, null, null], sectorBests: [Infinity, Infinity, Infinity], fieldSectorBests: [Infinity, Infinity, Infinity],
    aeroZones: [{}], ttRecord: Infinity, hudProfile: "standard",
    fmtTime: (t) => (isFinite(t) && t > 0 ? t.toFixed(2) : "-"),
    dashKph: (v) => v * 3.6, vTop: () => 90, otEnabled: () => true,
    cssCol: () => "#f00",
  };
  const hud = sb.GameHud.create(G);
  return { dom, els, G, sb, hud, tick: () => hud.updateHud(true) };
}

function fitHarness() {
  const b = boot();
  const { dom } = b, root = dom.documentElement;
  root.style.setProperty("--hud-scale", "1");
  const mk = (cls, parent) => { const e = dom.document.createElement("div"); e.className = cls; (parent || dom.body).appendChild(e); return e; };
  const top = mk("hud-top"), bottom = mk("hud-bottom"), bar = dom.document.createElement("div");
  bar.id = "hud-dock"; dom.body.appendChild(bar);
  const dockL = dom.byId("dock-left"), dockR = dom.byId("dock-right");
  for (const d of [dockL, dockR]) { if (d.parentNode) d.parentNode.removeChild(d); bar.appendChild(d); }
  const gear = mk("g", bottom), gL = mk("gl", dockL), gR = mk("gr", dockR);
  const R = (left, top_, w, h) => ({ left, top: top_, right: left + w, bottom: top_ + h, width: w, height: h });
  const U = new Map([
    [top, R(250, 8, 300, 54)], [b.els.minimap, R(10, 8, 140, 140)],
    [b.els.hudSectors, R(650, 130, 140, 72)],
    [gear, R(100, 330, 300, 60)],
    [bar, R(0, 200, 800, 200)], [dockL, R(0, 200, 150, 200)], [dockR, R(650, 200, 150, 200)],
    [gL, R(0, 200, 150, 200)], [gR, R(650, 200, 150, 200)],
  ]);
  for (const [el, r] of U) el._rect = r;
  const own = new Map([[top, -150]]);
  Object.defineProperty(top, "offsetWidth", { get: () => U.get(top).width, configurable: true });
  b.sb.getComputedStyle = (el) => ({
    getPropertyValue: (k) => ALL_TOKENS[k] || "", columnGap: "0px", rowGap: "0px",
    transform: own.has(el) ? `matrix(1, 0, 0, 1, ${own.get(el)}, 0)` : "none",
  });
  const snap = () => ({
    radioTop: b.dom.body.classList.contains("hud-radio-top"),
    corner: b.dom.body.hasAttribute("data-radio-corner"),
    x: root.style.getPropertyValue("--radio-top-x"),
    w: root.style.getPropertyValue("--radio-top-w"),
  });
  const refit = () => { b.sb.GameHud.invalidateFit(); b.tick(); return snap(); };
  for (let i = 0; i < 3; i++) b.tick();
  return { ...b, top, root, snap, refit };
}

test("BROADCAST lights the same #1504 radio home as STANDARD (regression: !bcast skipped the slot)", () => {
  const std = fitHarness();
  const stdSnap = std.snap();
  assert.equal(stdSnap.radioTop, true, "STANDARD fixture has a top-row slot");
  assert.equal(stdSnap.corner, false);

  const bc = fitHarness();
  bc.G.hudProfile = "broadcast";
  bc.dom.body.classList.add("hud-prof-broadcast");
  const got = bc.refit();
  assert.ok(got.radioTop || got.corner,
    "BROADCAST must publish hud-radio-top or data-radio-corner — leftover 14svh is not a home");
  assert.equal(got.radioTop, true, "the fixture's open strip right of the tower is a top-row slot in BROADCAST too");
  assert.equal(got.x, stdSnap.x, "broadcast measures the same tower box the standard cell does");
  assert.equal(got.w, stdSnap.w);
});

test("css/hud.css: one radio home per profile — no leftover broadcast 14svh, fallbacks stand down for both slots", () => {
  const css = read("css/hud.css");
  const hud = read("js/ui/hud.js");
  assert.doesNotMatch(css, /body\.hud-prof-broadcast #announce \{[^}]*14svh/,
    "the leftover cinematic 14svh #announce home is gone — BROADCAST uses the #1504 slot");
  assert.doesNotMatch(hud, /const t = !bcast && _hudTop/,
    "radioTopSlot no longer skips the tower measurement under BROADCAST");
  assert.match(css, /body\.hud-radio-top #announce:not\(\[hidden\]\)/,
    "top-row slot is the first home");
  assert.match(css, /body\[data-radio-corner\]/,
    "corner slot is the second home");
  assert.match(css,
    /body:not\(\.desktop\):not\(\.hud-radio-top\):not\(\[data-radio-corner\]\):not\(\.hud-mirror-side\) #announce/,
    "the hanging dock lane stands down for BOTH slot markers, not only hud-radio-top");
  assert.match(css,
    /body:not\(\.hud-mirror-on\.hud-mirror-side\):not\(\.hud-radio-top\):not\(\[data-radio-corner\]\):not\(\[data-radio-placed\]\):has\(#hud-flag:not\(\[hidden\]\)\) #announce/,
    "the caution step-down stands down for both slots and manually placed cards");
  assert.match(css,
    /body\.hud-mirror-on\.hud-mirror-side:not\(\.hud-radio-top\):not\(\[data-radio-corner\]\) #announce/,
    "beside-the-mirror stands down for both slot markers");
});
