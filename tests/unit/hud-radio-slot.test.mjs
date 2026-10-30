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
import { absSrc } from "../helpers/abs-src.mjs";
import { cssRules } from "../helpers/css-rules.mjs";

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
  vm.runInNewContext(src("js/ui/live-region.js"), sb, { filename: absSrc("js/ui/live-region.js") });
  vm.runInNewContext(src("js/ui/hud-minimap.js"), sb, { filename: absSrc("js/ui/hud-minimap.js") });   // GameHud.create builds its HudMinimap (#1656)
  vm.runInNewContext(src("js/ui/hud-radio-lane.js"), sb, { filename: absSrc("js/ui/hud-radio-lane.js") });   // …and its HudRadioLane (#3261)
  vm.runInNewContext(src("js/ui/hud.js"), sb, { filename: absSrc("js/ui/hud.js") });
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
  const hud = read("js/ui/hud-radio-lane.js");   // radioTopSlot's home since #3261
  assert.doesNotMatch(css, /body\.hud-prof-broadcast #announce \{[^}]*14svh/,
    "the leftover cinematic 14svh #announce home is gone — BROADCAST uses the #1504 slot");
  assert.doesNotMatch(hud, /const t = !bcast && (_hudTop|top\(\))/,
    "radioTopSlot no longer skips the tower measurement under BROADCAST");
  assert.match(css, /body\.hud-radio-top #announce:not\(\[hidden\]\)/,
    "top-row slot is the first home");
  assert.match(css, /body\[data-radio-corner\]/,
    "corner slot is the second home");
  assert.match(css,
    /body:not\(\.desktop\):not\(\.hud-radio-top\):not\(\[data-radio-corner\]\):not\(\.hud-mirror-side\) #announce/,
    "the hanging dock lane stands down for BOTH slot markers, not only hud-radio-top");
  assert.match(css,
    /body:not\(\.hud-mirror-on\.hud-mirror-side\):not\(\.hud-radio-top\):not\(\[data-radio-corner\]\):not\(\[data-radio-placed\]\):has\(> :where\(#hud\) > #hud-flag:not\(\[hidden\]\)\) #announce/,
    "the caution step-down stands down for both slots and manually placed cards");
  assert.match(css,
    /body\.hud-mirror-on\.hud-mirror-side:not\(\.hud-radio-top\):not\(\[data-radio-corner\]\) #announce/,
    "beside-the-mirror stands down for both slot markers");
});

// UI hunt 3: showModal() makes everything outside the dialog inert, so a line
// said with Settings (or any dialog) open went to an unreadable #announce-live.
test("LiveRegion speaks inside the topmost open modal, through an empty polite twin", () => {
  const made = [], timers = [];
  const node = (tag) => ({ tagName: tag, attrs: {}, kids: [], textContent: "", className: "",
    setAttribute(k, v) { this.attrs[k] = v; }, appendChild(n) { this.kids.push(n); return n; },
    querySelector(sel) { return sel === ":scope > [data-announce-modal]" ? this.kids.find((k) => "data-announce-modal" in k.attrs) || null : null; } });
  const page = node("div"); let modals = [];
  const sb = {
    document: { getElementById: (id) => (id === "announce-live" ? page : null), querySelectorAll: (sel) => (sel === ":modal" ? modals : []),
      createElement: (t) => { const n = node(t); made.push(n); return n; } },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {}, performance: { now: () => 0 },
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js/ui/live-region.js"), "utf8") + ";this.LiveRegion=LiveRegion;", sb, { filename: absSrc("js/ui/live-region.js") });
  const settings = node("dialog"); modals = [settings];
  sb.LiveRegion.say("Gears is unavailable", "save");
  const twin = settings.kids[0];
  assert.ok(twin && "data-announce-modal" in twin.attrs, "a twin inside the modal");
  assert.equal(twin.attrs["aria-live"], "polite"); assert.equal(twin.attrs.role, "status");
  assert.equal(twin.textContent, "", "empty for the beat before it speaks");
  timers.shift()();
  assert.equal(twin.textContent, "Gears is unavailable"); assert.equal(page.textContent, "");
  timers.shift()();                                   // hold ends
  modals = []; sb.LiveRegion.say("Safety car", "flag"); timers.shift()();
  assert.equal(page.textContent, "Safety car", "no modal: the page region as before");
  modals = [settings]; sb.LiveRegion.say("again", "flag");
  assert.equal(settings.kids.length, 1, "the twin is made once per modal");
});

test("both radio slots size the card to the slot, not to the dock lane announceLane still publishes (UI-HUNT-2-HUD)", () => {
  const rules = cssRules(read("css/hud.css"));
  const slotRules = (prefix) => rules.filter((r) => r.selector.startsWith(prefix) && String(r.decls.get("max-width") || "").includes("--radio-top-w"));
  const widths = (prefix) => slotRules(prefix).map((r) => r.decls.get("width") || "");
  const want = "min(max-content, calc(var(--radio-top-w) / var(--hud-z)))";
  assert.deepEqual(widths("body.hud-radio-top #announce"), [want], "tower-row slot: width follows the slot");
  assert.deepEqual(widths("body[data-radio-corner]"), [want], "corner slot: width follows the slot, so the base rule's lane width cannot squeeze it");
});

test("landscape radio prefers a readable outer lane and preserves a crowded fallback", () => {
  const dom = makeDom(), root = dom.documentElement;
  const R = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const tower = dom.document.createElement("div"), dock = dom.document.createElement("div"), group = dom.document.createElement("div");
  tower._rect = R(250, 8, 300, 54); group._rect = R(0, 300, 100, 90); dock.appendChild(group);
  const els = { announce: dom.byId("announce"), flag: dom.byId("hud-flag"), hudSectors: dom.byId("hud-sectors"), minimap: dom.byId("minimap") };
  for (const el of [els.flag, els.hudSectors, els.minimap]) el.hidden = true;
  const sb = { document: dom.document, Map, Math, Object, parseFloat, getComputedStyle: () => ({ getPropertyValue: () => "47" }) };
  vm.runInNewContext(src("js/ui/hud-radio-lane.js") + ";this.lane=HudRadioLane;", sb, { filename: absSrc("js/ui/hud-radio-lane.js") });
  const lane = sb.lane.create({ els }, { vpW: () => 844, vpH: () => 390, top: () => tower, docks: () => [dock], fitKey: () => "",
    hStyle: (el, key, value) => el.style.setProperty(key, value), hUnstyle: (el, key) => el.style.removeProperty(key), hToggle() {} });
  lane.announceLane(root);
  const x = () => parseFloat(root.style.getPropertyValue("--announce-lane-x")), w = () => parseFloat(root.style.getPropertyValue("--announce-lane-w"));
  assert.ok(w() >= 160, "outer lane remains readable");
  assert.ok(x() + w() <= 844 * 0.4 + 0.1 || x() >= 844 * 0.6, "outer lane clears the centre 20% driving corridor");
  els.minimap.hidden = false; els.minimap._rect = R(47, 70, 253, 96);
  els.hudSectors.hidden = false; els.hudSectors._rect = R(544, 70, 253, 96);
  lane.invalidateLaneRects(); lane.announceLane(root);
  assert.equal(x(), 308); assert.equal(w(), 228, "crowded case retains the original usable full lane");
  assert.equal(els.announce.hasAttribute("data-lane-collapsed"), false, "the message is not discarded");
  dom.body.setAttribute("data-radio-placed", ""); root.style.setProperty("--announce-lane-x", "123px");
  lane.announceLane(root);
  assert.equal(root.style.getPropertyValue("--announce-lane-x"), "123px", "manual placement stays under player control");
  dom.body.removeAttribute("data-radio-placed");
  els.announce.hidden = false; els.announce._rect = R(350, 220, 200, 50);
  for (const key of ["flag", "hudLimits", "tyre"]) {
    const obstacle = els[key] || (els[key] = dom.byId(key));
    obstacle.hidden = false; obstacle._rect = R(360, 230, 60, 24);
    els.announce.toggleAttribute("data-lane-collapsed", false);
    root.style.setProperty("--announce-lane-w", "200px");
    lane.radioPaintedCollapse(root);
    assert.equal(els.announce.hasAttribute("data-lane-collapsed"), true, `${key} stays readable when messages compete`);
    obstacle.hidden = true;
  }
  // Current tracked-export cockpit at844×390: BUTTON245 enlarges the steer
  // pair into the outer card's actual row, below the lane's predicted band.
  group._rect = R(59, 159.8, 365.9, 176.4);
  els.hudSectors._rect = R(542, 64, 255, 72);
  const pedals = dom.document.createElement("div"); pedals._rect = R(599, 80, 188, 256); dock.appendChild(pedals);
  els.announce.getBoundingClientRect = () => w() < 200 ? R(x(), 151.9, w(), 75) : R(55, 151.9, 282.4, 50.7);
  root.style.setProperty("--announce-lane-w", "282.4px");
  els.announce.toggleAttribute("data-lane-collapsed", false);
  lane.radioPaintedCollapse(root);
  assert.ok(x() >= 425 && x() + w() <= 599, "painted steering bounds recover the free central lane");
  assert.ok(Math.abs(w() - 158.1) < 0.2, "sectors ending above the card do not steal its 158px central fallback");
  assert.equal(els.announce.hasAttribute("data-lane-collapsed"), false, "the pit call stays visible in the available gap");
  dom.body.setAttribute("data-radio-placed", "");
  root.style.setProperty("--announce-lane-w", "282.4px");
  lane.radioPaintedCollapse(root);
  assert.equal(w(), 282.4, "explicit manual radio placement bypasses automatic control recovery");
});
