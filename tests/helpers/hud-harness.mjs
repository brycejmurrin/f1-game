// Shared GameHud VM boot only. Geometry, CSS zoom models and expected readouts
// stay in each suite; in particular this helper never supplies currentCSSZoom.
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "./mini-dom.mjs";
import { absSrc } from "./abs-src.mjs";

const ELEMENT_IDS = {
  pos: "hud-pos", lap: "hud-lap", time: "hud-time", best: "hud-best",
  speed: "hud-speed-n", energy: "hud-energy-fill", ot: "hud-ot", aero: "hud-aero",
  btnOT: "btn-ot", btnAero: "btn-aero",
  gapA: "hud-gap-ahead", gapB: "hud-gap-behind", hudSectors: "hud-sectors",
  flag: "hud-flag", minimap: "minimap", gear: "hud-gear", rpmFill: "hud-rpm-fill", tach: "hud-tach",
  announceLive: "announce-live",
};
const noopContext = () => new Proxy({}, { get: () => () => {}, set: () => true });

export function makeHudCar(overrides = {}) {
  return {
    team: { id: "t1", color: [1, 0, 0] }, lap: 1, lapTime: 12, best: Infinity,
    speed: 50, energy: 0.5, gear: 3, rpm: 5000,
    otT: 0, otE: 0, aeroX: 0, s: 10, prog: 10, retired: false,
    ...overrides,
  };
}

export function bootHud({
  W, H, prepareDom = () => {}, canvasContext = noopContext,
  minimapContext = canvasContext, sandbox = {}, readouts = false,
  elementIds = {}, player: playerOverrides = {}, game = () => ({}),
} = {}) {
  const dom = makeDom();
  prepareDom(dom);
  const rawCreate = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const el = rawCreate(tag);
    if (String(tag).toLowerCase() === "canvas") el.getContext = canvasContext;
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
    setTimeout: () => 1, clearTimeout: () => {}, performance: { now: () => 1000 },
    ...sandbox,
  };
  sb.window = sb;
  const files = ["js/ui/live-region.js"];
  if (readouts) files.push("js/ui/hud-readouts.js");
  // GameHud.create builds its HudMinimap (#1656).
  files.push("js/ui/hud-minimap.js", "js/ui/hud.js", "js/race/overtake-mode.js");
  for (const file of files) {
    const source = fs.readFileSync(absSrc(file), "utf8").replace(/^const\b/gm, "var");
    vm.runInNewContext(source, sb, { filename: absSrc(file) });
  }
  const $ = (id) => dom.byId(id);
  const els = Object.fromEntries(Object.entries({ ...ELEMENT_IDS, ...elementIds }).map(([key, id]) => [key, $(id)]));
  els.minimap.getContext = minimapContext;
  const player = makeHudCar(playerOverrides);
  const G = {
    els, player, cars: [player], ranked: [player], timeTrial: false, state: "race",
    lapsTarget: 5, track: { map: [[0, 0], [1, 1]], total: 100, def: {} },
    sectorLast: [null, null, null], sectorBests: [Infinity, Infinity, Infinity],
    fieldSectorBests: [Infinity, Infinity, Infinity], aeroZones: [{}], ttRecord: Infinity,
    fmtTime: (t) => String(t), dashKph: (v) => v * 3.6, vTop: () => 90, otEnabled: () => true,
    cssCol: () => "#f00", ...game(player),
  };
  const hud = sb.GameHud.create(G);
  return { dom, $, els, player, G, hud, sb };
}
