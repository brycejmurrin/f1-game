/* Characterization pin for the sector painter carve (#6500): the S1-S3 rows, the race DELTA
 * chip and the GameHud surface must read the same before and after the painter moves from
 * js/ui/hud.js into js/ui/hud-readouts.js. Snapshots are of DOM state on the mini-dom, taken
 * on the pre-carve tree; a change here is a behaviour change, not a refactor.
 *
 * Run: node --test tests/unit/hud-sector-pin.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { loadDom } from "../helpers/dom-vm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");
const ctx2d = () => new Proxy({}, { get: () => () => {}, set: () => true });

function boot({ ghostAt = null } = {}) {
  const dom = makeDom();
  const rawCreate = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const el = rawCreate(tag);
    if (String(tag).toLowerCase() === "canvas") el.getContext = ctx2d;
    return el;
  };
  const ghost = { hasGhost: () => ghostAt != null, timeAt: () => ghostAt, at: () => null };
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, WeakSet, RegExp, Date, parseFloat, parseInt, isFinite, Infinity,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document, innerWidth: 852, innerHeight: 393, devicePixelRatio: 3,
    M4: { clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) },
    PhysicsConsts: { IDLE_RPM: 5000, MAX_RPM: 15000 },
    Ghost: ghost, GhostShare: { hasGuest: () => false, timeAt: () => null, at: () => null },
    TrackMaps: { drsZones: () => [], sectorColors: () => ["#ffd700", "#c0c0c0", "#cd9b5a"], drawStartFinish() {}, drawCarMarker() {} },
    setTimeout: () => 1, clearTimeout: () => {}, performance: { now: () => 1000 },
  };
  sb.window = sb;
  for (const f of ["js/ui/live-region.js", "js/ui/hud-minimap.js", "js/ui/hud-radio-lane.js", "js/ui/hud-readouts.js", "js/ui/hud.js"]) {
    loadDom(sb);
    vm.runInNewContext(src(f), sb, { filename: absSrc(f) });
  }
  const $ = (id) => dom.byId(id);
  const minimap = $("minimap");
  minimap.getContext = ctx2d;
  const els = {
    pos: $("hud-pos"), lap: $("hud-lap"), time: $("hud-time"), best: $("hud-best"),
    speed: $("hud-speed-n"), energy: $("hud-energy-fill"), ot: $("hud-ot"), aero: $("hud-aero"),
    gapA: $("hud-gap-ahead"), gapB: $("hud-gap-behind"), hudSectors: $("hud-sectors"),
    flag: $("hud-flag"), minimap, gear: $("hud-gear"), rpmFill: $("hud-rpm-fill"), tach: $("hud-tach"),
    announceLive: $("announce-live"),
  };
  const player = {
    team: { id: "t1", color: [1, 0, 0] }, code: "YOU", rank: 1, lap: 1, lapTime: 12, best: Infinity,
    speed: 50, energy: 0.5, gear: 3, rpm: 5000, boostOn: false,
    otT: 0, otArmed: false, otE: 0, otEarned: false, aeroX: 0, xArmed: false, s: 10, prog: 10, retired: false,
  };
  const G = {
    els, player, cars: [player], ranked: [player], timeTrial: true, state: "race",
    lapsTarget: 5, track: { map: [[0, 0], [1, 1]], total: 100, def: {} },
    sectorLast: [null, null, null], sectorBests: [Infinity, Infinity, Infinity], fieldSectorBests: [Infinity, Infinity, Infinity],
    aeroZones: [{}], ttRecord: Infinity,
    fmtTime: (t) => "m" + t.toFixed(3), dashKph: (v) => v * 3.6, vTop: () => 90, otEnabled: () => true, cssCol: () => "#f00",
  };
  const hud = sb.GameHud.create(G);
  return { sb, dom, els, G, hud, player, tick: () => hud.updateHud(true) };
}

const rows = (els) => els.hudSectors.children.map((r) => ({
  cls: r.className,
  data: { ...r.dataset },
  kids: r.children.map((k) => [k.className, k.textContent, k.style.color || ""]),
}));
const delta = (dom) => {
  const box = dom.byId("hud-delta");
  return { hidden: !!box.hidden, data: { ...box.dataset }, n: dom.byId("hud-delta-n").textContent };
};

test("pin: sector rows build as S1-S3 with empty splits", () => {
  const { els, tick } = boot();
  tick();
  assert.deepEqual(rows(els), [0, 1, 2].map((i) => ({
    cls: "sec-row", data: {}, kids: [["sec-lbl", "S" + (i + 1), ""], ["sec-val", "--", ""]],
  })));
});

test("pin: session best, personal best, slower, held gain and a minute split paint their states", () => {
  const { els, G, hud, tick, sb } = boot();
  tick();
  // S1 session best (purple ★), S2 personal best only (green ▼), S3 slower (yellow ▲).
  G.sectorLast = [28.1, 30.2, 75.5]; G.sectorBests = [28.1, 30.2, 74.0]; G.fieldSectorBests = [28.1, 29.0, 70.0];
  for (let i = 0; i < 3; i++) hud.flashSector(i);
  tick();
  assert.deepEqual(rows(els), [
    { cls: "sec-row sec-flash sec-flash-pb", data: { split: "session" }, kids: [["sec-lbl", "S1", ""], ["sec-val", "★28.100", "var(--sec-best)"]] },
    { cls: "sec-row sec-flash sec-flash-pb", data: { split: "personal" }, kids: [["sec-lbl", "S2", ""], ["sec-val", "▼30.200", "var(--faster)"]] },
    { cls: "sec-row sec-flash sec-flash-slow", data: { split: "slow" }, kids: [["sec-lbl", "S3", ""], ["sec-val", "▲m75.500", "var(--sec-slow)"]] },
  ]);
  // Next lap: S1 slower by 0.4 against the pre-crossing best, held as the gain.
  G.sectorLast[0] = 28.5; hud.flashSector(0); tick();
  assert.deepEqual(rows(els)[0], { cls: "sec-row sec-flash sec-flash-slow", data: { split: "slow" }, kids: [["sec-lbl", "S1", ""], ["sec-val", "▲+0.400", "var(--sec-slow)"]] });
  assert.deepEqual(JSON.parse(JSON.stringify(hud.secFlash())), { flash: [0.24999999999999997, 0.14999999999999997, 0.14999999999999997], last: 0, raceT: null, calls: 4, painted: 6 });
  hud.resetRace();
  assert.deepEqual(rows(els).map((r) => r.cls), ["sec-row", "sec-row", "sec-row"]);
  assert.deepEqual(JSON.parse(JSON.stringify(sb.GameHud.secFlash())).flash, [0, 0, 0]);
});

test("pin: the DELTA chip reads pending, ahead, behind and a rounded zero", () => {
  const pending = boot();
  pending.tick();
  assert.deepEqual(delta(pending.dom), { hidden: false, data: { pending: "" }, n: delta(pending.dom).n });
  for (const [lapTime, want] of [[11.5, { sign: "fast", n: "-0.500" }], [12.25, { sign: "slow", n: "+0.250" }], [12.0003, { sign: "fast", n: "+0.000" }]]) {
    const h = boot({ ghostAt: 12 });
    h.player.lapTime = lapTime;
    h.tick();
    assert.deepEqual(delta(h.dom), { hidden: false, data: { ref: "ghost", sign: want.sign }, n: want.n }, "lapTime " + lapTime);
  }
});

test("pin: the GameHud module and instance surfaces", () => {
  const { sb, hud } = boot();
  assert.deepEqual(Object.keys(sb.GameHud), ["create", "secFlash", "invalidateFit", "syncPhoneFit", "vp", "vpKey"]);
  assert.deepEqual(Object.keys(hud), ["updateHud", "invalidateMap", "flashSector", "resetRace", "invalidateFit", "syncPhoneFit",
    "laneRectMisses", "resetLaneRectMisses", "secFlash"]);
});
