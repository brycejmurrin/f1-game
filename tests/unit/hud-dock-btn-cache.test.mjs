/* fitHud's per-tick key reads each dock button's `hidden`, not a fresh
 * querySelectorAll over both docks: the list is cached and re-queried only
 * when a dock's groups move (game.js layoutDocks), the docks swap (pickDocks)
 * or the fit is invalidated. HudTyres.paint queries its #hud-tyre-code chip
 * once per widget. Mini-dom VM, no browser.
 *
 * Run: node --test tests/unit/hud-dock-btn-cache.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { withI18n } from "../helpers/i18n-ctx.mjs";
import { fnSource } from "../helpers/fn-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");
const ctx2d = () => new Proxy({}, { get: () => () => {}, set: () => true });

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
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false, DEBUG: 4 },
    document: dom.document, innerWidth: 844, innerHeight: 390, devicePixelRatio: 1,
    M4: { clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) },
    PhysicsConsts: { IDLE_RPM: 5000, MAX_RPM: 15000 },
    Ghost: { hasGhost: () => false, timeAt: () => null, at: () => null },
    GhostShare: { hasGuest: () => false, timeAt: () => null, at: () => null },
    TrackMaps: { drsZones: () => [], sectorColors: () => ["#ffd700", "#c0c0c0", "#cd9b5a"] },
    setTimeout: () => 1, clearTimeout: () => {}, performance: { now: () => 1000 },
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => "", columnGap: "0px", rowGap: "0px", transform: "none" }),
  };
  sb.window = sb;
  for (const f of ["js/ui/live-region.js", "js/ui/hud-minimap.js", "js/ui/hud-radio-lane.js", "js/ui/hud.js", "js/race/overtake-mode.js"]) {
    vm.runInNewContext(src(f), sb, { filename: absSrc(f) });
  }
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
  const mk = (cls, parent, id) => {
    const e = dom.document.createElement("div");
    e.className = cls; if (id) e.id = id;
    parent.appendChild(e);
    return e;
  };
  mk("hud-top", dom.body); mk("hud-bottom", dom.body);
  const bar = mk("", dom.body, "hud-dock");
  const dockL = $("dock-left"), dockR = $("dock-right");
  for (const d of [dockL, dockR]) { if (d.parentNode) d.parentNode.removeChild(d); bar.appendChild(d); }
  // game.js layoutDocks moves whole GROUPS between the docks.
  const pedals = mk("dock-grp", dockL, "grp-pedals"), taps = mk("dock-grp", dockR, "grp-taps");
  mk("touchbtn", pedals, "btn-brake"); mk("touchbtn", pedals, "btn-throttle");
  const boost = mk("touchbtn", taps, "btn-boost"); mk("touchbtn", taps, "btn-ot2");
  const calls = { n: 0 };
  for (const d of [dockL, dockR]) {
    const q = d.querySelectorAll;
    d.querySelectorAll = (sel) => { calls.n++; return q(sel); };
  }
  return { hud, sb, calls, dockL, dockR, pedals, taps, boost, tick: () => hud.updateHud(true) };
}

test("fitHud: 30 steady ticks run no dock querySelectorAll after the first", () => {
  const h = boot();
  h.tick(); h.tick();   // the first fit picks the dock handles; the next reads their buttons
  const first = h.calls.n;
  assert.ok(first >= 1, "the first fit queries the docks");
  for (let i = 0; i < 30; i++) h.tick();
  assert.equal(h.calls.n - first, 0, "steady ticks re-queried the docks " + (h.calls.n - first) + " times");
});

test("fitHud: a dock re-layout, a dock swap or an invalidate re-queries; a hidden flip does not", () => {
  const h = boot();
  for (let i = 0; i < 3; i++) h.tick();
  let n = h.calls.n;
  h.boost.hidden = true; h.tick(); h.tick();
  assert.equal(h.calls.n, n, "a button's hidden flag is read from the cached list");
  h.dockL.appendChild(h.taps);   // layoutDocks: taps change side
  h.tick();
  assert.ok(h.calls.n > n, "a group moving between docks re-queries");
  n = h.calls.n; h.tick(); h.tick();
  assert.equal(h.calls.n, n, "…once");
  h.sb.document.body.classList.add("mirror-controls");   // pickDocks swaps the handles at the next fit
  h.sb.GameHud.invalidateFit();
  h.tick();
  assert.ok(h.calls.n > n, "a swap / invalidate re-queries");
});

test("HudTyres.paint: 10 paints query the chip at most once; a detached chip is re-queried", () => {
  const ctx = { console };
  vm.createContext(ctx); withI18n(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/hud-tyres.js"), "utf8"), ctx, { filename: absSrc("js/ui/hud-tyres.js") });
  ctx.HudTyres = vm.runInContext("HudTyres", ctx);
  let chip = { dataset: {}, textContent: "M", isConnected: true }, q = 0;
  const el = { dataset: {}, querySelector: (sel) => { q++; return sel === "#hud-tyre-code" ? chip : null; },
    setAttribute() {}, getAttribute: () => null };
  for (let i = 0; i < 10; i++) ctx.HudTyres.paint(el, { tempS: 90, tempOpt: 90, tempWindow: 15 }, { code: "M", spent: 0.1 });
  assert.ok(q <= 1, "querySelector ran " + q + " times in 10 paints");
  chip.isConnected = false; chip = { dataset: {}, textContent: "M", isConnected: true };
  ctx.HudTyres.paint(el, { tempS: 90, tempOpt: 90, tempWindow: 15 }, { code: "M", spent: 0.1 });
  assert.equal(q, 2, "a chip that left the tree is re-queried");
});


test("hlKey: a chip the touch-cockpit CSS hides keys as hidden, so its words never move the fit key (perf hunt 8)", () => {
  // The real hlKey and its id set, run against a stub body. A changed key is a full fit
  // (30-116 ms on a phone); an ERS glyph or AERO countdown changed it ~0.5/s for a chip
  // css/track-detail.css hides on touch cockpit.
  const HUD = fs.readFileSync(path.join(ROOT, "js/ui/hud.js"), "utf8");
  const ids = HUD.slice(HUD.indexOf("const _HL_CSS_HID"), HUD.indexOf("\n", HUD.indexOf("const _HL_CSS_HID")) + 1);
  const chip = (id, text, attrs = []) => ({ id, hidden: false, textContent: text, hasAttribute: (a) => attrs.includes(a) });
  const run = ({ set, desktop, aero, user = [] }) => {
    const body = { dataset: set ? { hlSet: set } : {}, classList: { contains: (c) => c === "desktop" && desktop } };
    const ctx = vm.createContext({ document: { body }, Set });
    vm.runInContext(ids + "let _hlEls = [];\n" + fnSource(HUD, "function hlKey()") + "\nthis.k = (els) => { _hlEls = els; return hlKey(); };", ctx, { filename: absSrc("js/ui/hud.js") });
    return ctx.k([chip("hud-aero", aero, user), chip("hud-gear", "4")]);
  };
  const words = ["AERO 899m", "99m", "9m", "STRAIGHT MODE"];   // four distinct lengths
  const keys = (o) => new Set(words.map((aero) => run({ ...o, aero })));
  assert.equal(keys({ set: "cockpit", desktop: false }).size, 1, "touch cockpit: the hidden AERO chip's words never change the key");
  assert.equal(keys({ set: "cockpit", desktop: true }).size, words.length, "desktop cockpit shows the chip: its length is still keyed");
  assert.equal(keys({ set: "chase", desktop: false }).size, words.length, "another layout set shows it: still keyed");
  assert.equal(keys({ set: "cockpit", desktop: false, user: ["data-hl-user"] }).size, words.length, "a player-placed chip is shown (the CSS excludes it): still keyed");
});
