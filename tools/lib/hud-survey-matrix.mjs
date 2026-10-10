// hud-survey-matrix.mjs — the PURE half of tools/shot/hud-survey.mjs: cells,
// matrices (quick / full / exhaustive / file) with pairwise reductions, shards,
// the expected-visible rules, finding classification, report merge and the
// report renderers. No browser, no fs.
// @doc HUD survey core: cells, quick/full/exhaustive matrices, shards, expected-visible rules, findings, merge, report HTML.
//
// A CELL is one HUD configuration on one device:
//   { device, track, cam, profile, layout, map, gaps, mirror, preset, presetSet,
//     presetProf (the HUD STYLE whose layout the preset is written into:
//     "shown" = the style on screen at the time, else a style name), theme,
//     cvd, contrast, textSize, hudScale, uiScale, btnScale, tyres, hud, tod,
//     off: [HudElements ids switched OFF] }
// BOOT KEYS need a fresh page: device (the viewport), track (one race build
// per page) and the two store keys js/game.js reads once at eval —
// hudProfile and hudMetricsLayout. Every other knob is applied LIVE per cell
// on the same page; bootKey() is what the runner groups (and shards) by.
//
// THE EXPECTED-VISIBLE RULES are this file's main claim. A HUD element that
// vanishes leaves nothing to overlap, so "no overlaps" passes for free — the
// absence-reads-as-normal failure hud-layout.spec.js describes for
// #hud-limits. expectedVisibility() states, from the settings alone (plus the
// body classes the platform owns: .desktop, .cockpit-cam), which elements a
// player must see; a miss is a `missing` finding. Each rule cites the CSS or
// JS that defines it, so a rule that goes stale points at its source.
import { analyzeOverlap } from "./hud-geometry.mjs";

export const DEVICES = Object.freeze({
  "desktop-1280": { w: 1280, h: 720, touch: false, ins: { sal: 0, sar: 0, sat: 0, sab: 0 } },
  "desktop-1920": { w: 1920, h: 1080, touch: false, ins: { sal: 0, sar: 0, sat: 0, sab: 0 } },
  // iPhone 12-14 landscape: 47px of notch each side, 21px home indicator.
  // Injected as --sal/--sar/--sat/--sab like hud-layout.spec.js: headless
  // Chromium reports env(safe-area-inset-*) as 0.
  "phone-landscape-844x390": { w: 844, h: 390, touch: true, ins: { sal: 47, sar: 47, sat: 0, sab: 21 } },
  "phone-portrait-390x844": { w: 390, h: 844, touch: true, ins: { sal: 0, sar: 0, sat: 47, sab: 34 } },
  // iPad Air landscape: no notch, a 20px home indicator.
  "tablet-1180x820": { w: 1180, h: 820, touch: true, ins: { sal: 0, sar: 0, sat: 0, sab: 20 } },
  // Lead-only shapes (the static audit's short landscapes); not matrix axes.
  "phone-short-734x343": { w: 734, h: 343, touch: true, ins: { sal: 0, sar: 0, sat: 0, sab: 0 } },
  "phone-640x360": { w: 640, h: 360, touch: true, ins: { sal: 0, sar: 0, sat: 0, sab: 0 } },
  // Real phone and tablet shapes the matrices never had (2026-10-10 adaptability survey): named
  // cells and --device only, not matrix axes. iPhone SE (no notch), a 20:9 Android, an iPhone Pro
  // Max (59px notch), the 844x390 phone with its notch on ONE side (landscape-left: the right edge
  // is clean), an iPad mini portrait, a 1366 laptop and an ultrawide.
  "phone-se-667x375": { w: 667, h: 375, touch: true, ins: { sal: 0, sar: 0, sat: 0, sab: 0 } },
  "phone-android-740x360": { w: 740, h: 360, touch: true, ins: { sal: 0, sar: 0, sat: 0, sab: 0 } },
  "phone-max-932x430": { w: 932, h: 430, touch: true, ins: { sal: 59, sar: 59, sat: 0, sab: 21 } },
  "phone-landscape-left-844x390": { w: 844, h: 390, touch: true, ins: { sal: 47, sar: 0, sat: 0, sab: 21 } },
  "tablet-portrait-820x1180": { w: 820, h: 1180, touch: true, ins: { sal: 0, sar: 0, sat: 24, sab: 20 } },
  "laptop-1366": { w: 1366, h: 768, touch: false, ins: { sal: 0, sar: 0, sat: 0, sab: 0 } },
  "ultrawide-2560": { w: 2560, h: 1080, touch: false, ins: { sal: 0, sar: 0, sat: 0, sab: 0 } },
});
// The device AXIS of every generated matrix; the lead shapes are named cells.
export const MATRIX_DEVICES = Object.freeze(["desktop-1280", "desktop-1920", "phone-landscape-844x390",
  "phone-portrait-390x844", "tablet-1180x820"]);

// CamModes ids (js/camera/mode-switch.js CAM_MODES) — the unit test locksteps it.
export const CAMS = Object.freeze(["chase", "far", "drift", "cockpit", "hood", "overhead", "heli", "reverse",
  "side", "cinematic", "low", "tcam", "rear", "visor", "trackside", "rival", "pitwall", "drone", "tv", "helmet"]);
// js/ui/hud.js BCAM_IDS / ONBOARD_IDS.
export const BCAM_IDS = Object.freeze(["heli", "side", "cinematic", "low", "overhead", "rival", "pitwall", "drone"]);
export const ONBOARD_IDS = Object.freeze(["cockpit", "hood", "tcam", "visor", "helmet"]);
// CamGroups.COCKPIT_LAYOUT (js/camera/cam-groups.js): the camera that reads
// gear and speed off the wheel's LCD, so MOVE & SIZE gives it the cockpit
// layout — and the one mode-switch.js marks body.cockpit-cam (with a wheel that
// has a screen). HELMET_LAYOUT_IDS: the same wheel seen from inside the lid,
// whose HUD is the visor (its own set, no cockpit-cam).
export const COCKPIT_LAYOUT_IDS = Object.freeze(["cockpit"]);
// js/ui/hud-layout.js TOUCH_PRESET_HOLD (lockstepped by tests/unit/hud-survey.test.mjs).
export const TOUCH_PRESET_HOLD = Object.freeze({
  cockpit: Object.freeze({ energy: 1, tyre: 1, ot: 1, aero: 1, bb: 1 }),
  helmet: Object.freeze({ gearbox: 1, energy: 1, tyre: 1, ot: 1, aero: 1, bb: 1 }),
});
export const HELMET_LAYOUT_IDS = Object.freeze(["helmet"]);
const HudSetOf = (cam) => (COCKPIT_LAYOUT_IDS.includes(cam) ? "cockpit" : HELMET_LAYOUT_IDS.includes(cam) ? "helmet" : null);
// Cameras whose framing the TV director / auto-cut owns: no camera-keyed expectation.
const DYNAMIC_CAMS = new Set(["tv", "trackside"]);
// HudElements.ELEMENTS ids (js/ui/hud-elements.js) → the probe key each hides
// (css/hud.css body[data-hud-hide~=id]).
export const ELEMENT_TOGGLES = Object.freeze({
  pos: "pos", lap: "lap", time: "time", best: "best", delta: "delta", sectors: "sectors", speed: "speed",
  gear: "gearbox", energy: "energy", tyre: "tyre", ot: "ot", aero: "aero", bb: "bb", limits: "limits",
  damage: "damage", rel: "rel", strat: "strat", inputs: "inputs",
});

export const ENUMS = Object.freeze({
  device: Object.keys(DEVICES),
  cam: CAMS,
  profile: ["standard", "minimal", "broadcast"],
  layout: ["auto", "full", "timing", "driver", "compact"],
  map: ["on", "auto", "off"],
  gaps: ["on", "auto", "off"],
  mirror: ["auto", "on", "off"],
  presetSet: ["cam", "both"],
  presetProf: ["shown", "standard", "minimal", "broadcast"],
  theme: ["dark", "light"],
  cvd: ["off", "deutan", "protan", "tritan"],
  contrast: ["off", "high"],
  textSize: ["normal", "large", "larger"],
  tyres: ["on", "off"],
  hud: ["on", "off"],
  tod: ["day", "dawn", "dusk", "night"],
  steer: ["default", "tilt", "buttons", "touch"],
  // A LIVE profile switch (its SETTINGS row) after the boot profile and the
  // cell's MOVE & SIZE writes: lead 5's "move, then switch to BROADCAST".
  profileLive: ["none", "standard", "minimal", "broadcast"],
});
// HudLayout.PRESETS ids and what each one PLACES (writes a non-shipped value
// for), which matters on touch cockpit: a placed chip carries data-hl-user and
// escapes css/track-detail.css's touch-cockpit hide.
export const PRESETS = Object.freeze({
  shipped: [],
  clean: ["tower", "map", "gaps", "sectors", "limits", "ot", "aero"],
  big: ["tower", "map", "gaps", "gearbox"],
  corners: ["gearbox", "energy", "tyre"],
});
// HudLayout.ELEMENTS ids and LIM (js/ui/hud-layout.js).
export const LAYOUT_IDS = Object.freeze(["tower", "map", "gaps", "sectors", "limits", "flag", "mirror", "announce",
  "gearbox", "speed", "energy", "tyre", "ot", "aero", "bb", "damage", "rel", "strat", "inputs"]);
export const LIM = Object.freeze({ x: [-50, 50], y: [-50, 50], s: [50, 200] });
// Percent ranges the CLI accepts; the game clamps to its own (HUD 70..200,
// UI 40..200, BUTTON 40..300 — js/ui/scale.js).
export const SCALES = Object.freeze({ hudScale: [40, 200], uiScale: [40, 200], btnScale: [40, 300] });
export const TRACK_RE = /^[a-z][a-z0-9_-]{0,39}$/;

export const DEFAULT_CELL = Object.freeze({
  device: "desktop-1280", track: "monza", cam: "chase", profile: "standard", layout: "full", map: "on", gaps: "on",
  mirror: "auto", preset: "shipped", presetSet: "cam", presetProf: "shown", theme: "dark", cvd: "off", contrast: "off", textSize: "normal",
  hudScale: null, uiScale: null, btnScale: null, tyres: "on", hud: "on", tod: "day", steer: "default", profileLive: "none", off: Object.freeze([]),
});
export const BOOT_KNOBS = Object.freeze(["device", "track", "profile", "layout", "steer"]);

// What the probe measures. role ctrl = a tap target, hud = a readout,
// overlay = measured for context, never paired.
export const HUD_TARGETS = Object.freeze([
  ["tower", ".hud-top"], ["pos", "#hud-box-pos"], ["lap", "#hud-box-lap"], ["time", "#hud-box-time"],
  ["best", "#hud-box-best"], ["delta", "#hud-delta"],
  ["map", "#minimap"], ["gaps", ".hud-gaps"], ["gapAhead", "#hud-gap-ahead"], ["gapBehind", "#hud-gap-behind"],
  ["sectors", "#hud-sectors"], ["limits", "#hud-limits"], ["flag", "#hud-flag"], ["mirror", "#hud-mirror"],
  ["announce", "#announce"], ["gearbox", "#hud-gearbox"], ["speed", "#hud-speed"], ["energy", "#hud-energy"],
  ["tyre", "#hud-tyre"], ["ot", "#hud-ot"], ["aero", "#hud-aero"], ["bb", "#hud-bb"], ["pit", "#hud-pit"],
  ["bcTower", "#bc-tower"],
  // Shown only by an event or an opt-in (DAMAGE past Damage.SHOW; RELATIVE /
  // STRATEGY / INPUTS ship off): measured for clashes when drawn, never expected.
  ["damage", "#hud-damage"], ["rel", "#hud-rel"], ["strat", "#hud-strat"], ["inputs", "#hud-inputs"],
].map(([key, sel]) => Object.freeze({ key, sel, role: "hud" }))
  .concat(["btn-throttle", "btn-brake", "btn-boost", "btn-ot", "btn-aero", "shift-up", "shift-down",
    "btn-steer-left", "btn-steer-right", "pausebtn", "btn-cam", "hud-mirror-chip"]
    .map((id) => Object.freeze({ key: id, sel: "#" + id, role: "ctrl" })))
  .concat([Object.freeze({ key: "rotateDevice", sel: "#rotate-device", role: "overlay" })]));
export const TOUCH_BUTTONS = Object.freeze(["btn-throttle", "btn-brake", "btn-boost", "btn-ot", "btn-aero",
  "shift-up", "shift-down", "btn-steer-left", "btn-steer-right"]);

export class CellError extends Error {}
const bad = (m) => { throw new CellError(m); };

/** Validate an inline HudLayout offsets object {id: {x?, y?, s?}}. */
export function validateOffsets(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) bad("preset offsets must be an object {id: {x, y, s}}");
  const keys = Object.keys(o);
  if (!keys.length || keys.length > LAYOUT_IDS.length) bad(`preset offsets: 1..${LAYOUT_IDS.length} element ids`);
  const out = {};
  for (const id of keys) {
    if (!LAYOUT_IDS.includes(id)) bad(`preset offsets: unknown element ${id} (one of ${LAYOUT_IDS.join(", ")})`);
    const v = o[id];
    if (!v || typeof v !== "object" || Array.isArray(v)) bad(`preset offsets.${id} must be {x, y, s}`);
    const e = {};
    for (const k of Object.keys(v)) {
      if (!LIM[k]) bad(`preset offsets.${id}.${k}: only x, y, s`);
      const n = v[k];
      if (typeof n !== "number" || !Number.isFinite(n) || n < LIM[k][0] || n > LIM[k][1]) {
        bad(`preset offsets.${id}.${k} must be a number in ${LIM[k][0]}..${LIM[k][1]}`);
      }
      e[k] = n;
    }
    out[id] = e;
  }
  return out;
}

/** A full, validated cell from a partial one. Throws CellError naming the knob. */
export function normalizeCell(raw, base = DEFAULT_CELL) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) bad("a cell must be an object");
  const c = { ...DEFAULT_CELL, ...base };
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    if (k === "name") {
      if (typeof v !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(v)) bad(`name must match [a-z0-9._-], ≤80 chars (got ${JSON.stringify(v)})`);
      c.name = v;
    } else if (k === "preset") {
      if (typeof v === "string") { if (!Object.hasOwn(PRESETS, v)) bad(`preset must be one of ${Object.keys(PRESETS).join(", ")} or an offsets object`); c.preset = v; }
      else c.preset = validateOffsets(v);
    } else if (Object.hasOwn(SCALES, k)) {
      const [lo, hi] = SCALES[k];
      if (v === null || v === "default") c[k] = null;
      else {
        const n = typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? Number(v) : v;
        if (typeof n !== "number" || !Number.isFinite(n) || n < lo || n > hi) bad(`${k} must be ${lo}..${hi} (percent) or null`);
        c[k] = n;
      }
    } else if (k === "off") {
      const list = typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v;
      if (!Array.isArray(list) || list.length > 14) bad("off must be a list of HudElements ids");
      for (const id of list) if (!Object.hasOwn(ELEMENT_TOGGLES, id)) bad(`off: unknown element ${id} (one of ${Object.keys(ELEMENT_TOGGLES).join(", ")})`);
      c.off = [...new Set(list)].sort();
    } else if (k === "lead") {
      if (typeof v !== "string" || v.length > 400) bad("lead must be a short description");
      c.lead = v;
    } else if (k === "checks") {
      if (!Array.isArray(v) || v.length > 16) bad("checks must be an array (≤ 16)");
      for (const ch of v) if (!ch || !CHECK_TYPES.includes(ch.type)) bad(`checks: type must be one of ${CHECK_TYPES.join(", ")}`);
      c.checks = v.map((ch) => JSON.parse(JSON.stringify(ch)));
    } else if (k === "track") {
      if (typeof v !== "string" || !TRACK_RE.test(v)) bad(`track must be a circuit id (got ${JSON.stringify(v)})`);
      c.track = v;
    } else if (Object.hasOwn(ENUMS, k)) {
      if (!ENUMS[k].includes(v)) bad(`${k} must be one of ${ENUMS[k].join(", ")} (got ${JSON.stringify(v)})`);
      c[k] = v;
    } else bad(`unknown cell knob ${k}`);
  }
  return c;
}

const short = { "desktop-1280": "d1280", "desktop-1920": "d1920", "phone-landscape-844x390": "phoneL",
  "phone-portrait-390x844": "phoneP", "tablet-1180x820": "tablet" };
function hash6(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36).slice(0, 6);
}
/** Stable, filesystem-safe id: the cell's name, else device + cam + every non-default knob. */
export function cellId(c) {
  if (c.name) return c.name;
  const parts = [short[c.device] || c.device, c.cam];
  if (c.track !== DEFAULT_CELL.track) parts.push(c.track);
  for (const k of ["profile", "layout", "map", "gaps", "mirror", "theme", "cvd", "contrast", "textSize", "tyres", "hud", "tod", "steer", "profileLive"]) {
    if (c[k] !== DEFAULT_CELL[k]) parts.push(`${k}-${c[k]}`);
  }
  if (typeof c.preset === "object") parts.push("offsets-" + hash6(JSON.stringify(c.preset)));
  else if (c.preset !== "shipped") parts.push(c.preset);
  if (c.presetSet !== "cam") parts.push("both-sets");
  if (c.presetProf !== "shown") parts.push("into-" + c.presetProf);
  for (const k of ["hudScale", "uiScale", "btnScale"]) if (c[k] != null) parts.push(k.replace("Scale", "") + c[k]);
  if (c.off && c.off.length) parts.push("off-" + c.off.join("."));
  return parts.join("-").replace(/[^a-z0-9._-]/gi, "_");
}
export const bootKey = (c) => BOOT_KNOBS.map((k) => c[k]).join("|");

// ── matrices ──────────────────────────────────────────────────────────────
// QUICK: one desktop page carries ten cells, so it costs three boots.
export const QUICK = Object.freeze([
  { name: "chase-default" },
  { name: "cockpit-default", cam: "cockpit" },
  { name: "visor-default", cam: "visor" },
  { name: "chase-preset-clean", preset: "clean" },
  { name: "chase-preset-big", preset: "big" },
  { name: "chase-preset-corners", preset: "corners" },
  { name: "chase-light", theme: "light" },
  { name: "chase-deutan", cvd: "deutan" },
  { name: "chase-hud70", hudScale: 70 },
  { name: "chase-hud150", hudScale: 150 },
  { name: "phoneL-chase", device: "phone-landscape-844x390" },
  { name: "phoneL-cockpit", device: "phone-landscape-844x390", cam: "cockpit" },
  { name: "phoneP-chase", device: "phone-portrait-390x844" },
]);
export const FULL_DIMS = Object.freeze({
  device: MATRIX_DEVICES,
  cam: ["chase", "cockpit", "visor", "hood", "heli", "tv"],
  profile: ENUMS.profile,
  // AUTO resolves to FULL (js/ui/hud.js resolveMetricsLayout), and each layout
  // value is a BOOT: device x layout pairs alone cost 5 x 4 = 20 pages.
  layout: ["full", "timing", "driver", "compact"],
  map: ENUMS.map,
  gaps: ["on", "off"],
  preset: Object.keys(PRESETS),
  theme: ENUMS.theme,
  cvd: ENUMS.cvd,
  contrast: ENUMS.contrast,
  textSize: ["normal", "larger"],
  hudScale: [70, null, 150],
  tyres: ENUMS.tyres,
  mirror: ENUMS.mirror,
  tod: ["day", "night"],
});
export const FULL_CAP = 80;
/** Constraints, on PARTIAL cells (undefined = free): portrait racing is
 *  blocked outright (#rotate-device, css/responsive.css), so one camera there
 *  is enough; BUTTON SIZE only exists on a touch device. */
export function fullValid(c) {
  if (c.device === "phone-portrait-390x844" && c.cam !== undefined && c.cam !== "chase") return false;
  if (c.device !== undefined && c.btnScale != null && !DEVICES[c.device].touch) return false;
  return true;
}

/** Greedy pairwise (AETG-style, deterministic): every pair of values across
 *  every two dimensions — or only the dimension pairs named in `only` —
 *  appears in at least one cell, unless `valid` rules the pair out. Ties
 *  prefer an already-used boot key, so cells share pages. */
export function pairwise(dims, { valid = () => true, cap = Infinity, only = null } = {}) {
  const names = Object.keys(dims);
  const vals = names.map((n) => dims[n]);
  const key = (i, a, j, b) => `${i}:${a}|${j}:${b}`;
  const wanted = (i, j) => !only || only.some(([p, q]) => (names[i] === p && names[j] === q) || (names[i] === q && names[j] === p));
  const uncovered = new Set();
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      if (!wanted(i, j)) continue;
      for (let a = 0; a < vals[i].length; a++)
        for (let b = 0; b < vals[j].length; b++)
          if (valid({ [names[i]]: vals[i][a], [names[j]]: vals[j][b] })) uncovered.add(key(i, a, j, b));
    }
  const total = uncovered.size;
  const cells = [], boots = new Set();
  const gain = (pick) => {
    let n = 0;
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++)
        if (pick[i] != null && pick[j] != null && uncovered.has(key(i, pick[i], j, pick[j]))) n++;
    return n;
  };
  const asCell = (pick) => Object.fromEntries(pick.map((v, i) => [names[i], v == null ? undefined : vals[i][v]]).filter((e) => e[1] !== undefined));
  const bootOf = (cell) => BOOT_KNOBS.map((k) => cell[k]).join("|");
  while (uncovered.size && cells.length < cap) {
    const [first] = uncovered;
    const m = /^(\d+):(\d+)\|(\d+):(\d+)$/.exec(first);
    let best = null, bestGain = -1, bestBoot = false;
    for (let rot = 0; rot < names.length; rot++) {
      const pick = new Array(names.length).fill(null);
      pick[+m[1]] = +m[2]; pick[+m[3]] = +m[4];
      for (let s = 0; s < names.length; s++) {
        const d = (s + rot) % names.length;
        if (pick[d] != null) continue;
        let bv = null, bg = -1;
        for (let v = 0; v < vals[d].length; v++) {
          pick[d] = v;
          if (!valid(asCell(pick))) continue;
          const g = gain(pick);
          if (g > bg) { bg = g; bv = v; }
        }
        pick[d] = bv;
        if (bv == null) break;
      }
      if (pick.some((v) => v == null) || !valid(asCell(pick))) continue;
      const g = gain(pick), reuse = boots.has(bootOf(asCell(pick)));
      if (g > bestGain || (g === bestGain && reuse && !bestBoot)) { best = pick; bestGain = g; bestBoot = reuse; }
    }
    if (!best) { uncovered.delete(first); continue; }   // an unsatisfiable pair under `valid`
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) uncovered.delete(key(i, best[i], j, best[j]));
    const cell = asCell(best);
    boots.add(bootOf(cell));
    cells.push(cell);
  }
  return { cells, pairs: total, uncovered: uncovered.size };
}

/** Pairwise in TWO stages, because a boot (~1.5 min) costs ~4 cells: first
 *  the smallest boot set that pairs every two boot knobs, then the full
 *  pairwise constrained to those boot keys — every cross pair (device x cam,
 *  layout x preset …) is still covered, but the cells share pages. One-stage
 *  pairwise spread 33 cells over 29 pages. */
export function pairwiseBooted(dims, { valid = () => true, cap = Infinity, only = null } = {}) {
  const bootDims = Object.fromEntries(Object.entries(dims).filter(([k]) => BOOT_KNOBS.includes(k)));
  const names = Object.keys(bootDims);
  if (names.length < 2) return { ...pairwise(dims, { valid, cap, only }), boots: null };
  const stage1 = pairwise(bootDims, { valid }).cells;
  const fits = (c) => stage1.some((b) => names.every((k) => c[k] === undefined || c[k] === b[k]));
  const pw = pairwise(dims, { valid: (c) => valid(c) && fits(c), cap, only });
  return { ...pw, boots: stage1.length };
}

/** EXHAUSTIVE = one-factor-at-a-time from a per-device baseline (every value
 *  of every dimension once, on every device) + the pairwise cover of the
 *  high-risk pairs. OFAT already pairs device with every other knob, so the
 *  pairwise half adds profile x cam and preset x cam. */
export const EXHAUSTIVE_PAIRS = Object.freeze([["device", "cam"], ["device", "profile"], ["device", "layout"],
  ["profile", "cam"], ["preset", "cam"], ["hudScale", "device"]]);
export function exhaustiveRaw(base = {}) {
  const track = base.track || DEFAULT_CELL.track;
  const other = track === "monaco" ? "monza" : "monaco";
  const ofat = {
    cam: CAMS, profile: ENUMS.profile, layout: ENUMS.layout, map: ENUMS.map, gaps: ENUMS.gaps, mirror: ENUMS.mirror,
    theme: ENUMS.theme, cvd: ENUMS.cvd, contrast: ENUMS.contrast, textSize: ENUMS.textSize, tyres: ENUMS.tyres,
    hud: ENUMS.hud, tod: ENUMS.tod, track: [other],
    hudScale: [70, 85, 125, 150, 200], uiScale: [70, 130, 200], btnScale: [70, 150, 300],
  };
  const out = [];
  for (const device of MATRIX_DEVICES) {
    const b = { device };
    out.push(b);
    for (const [k, list] of Object.entries(ofat)) for (const v of list) {
      const c = { ...b, [k]: v };
      if (fullValid(c)) out.push(c);
    }
    // Every MOVE & SIZE preset on BOTH layout sets (cockpit and other).
    for (const p of Object.keys(PRESETS)) out.push({ ...b, preset: p, presetSet: "both" });
    // Every HudElements toggle switched off on its own.
    for (const id of Object.keys(ELEMENT_TOGGLES)) out.push({ ...b, off: [id] });
    // Night under the readability knobs: plates are tuned against a day sky.
    for (const x of [{ theme: "light" }, { contrast: "high" }, { cvd: "deutan" }]) out.push({ ...b, ...x, tod: "night" });
  }
  const pw = pairwise({ device: MATRIX_DEVICES, cam: CAMS, profile: ENUMS.profile, layout: ["full", "timing", "driver", "compact"],
    preset: Object.keys(PRESETS), hudScale: [70, null, 150] }, { valid: fullValid, only: EXHAUSTIVE_PAIRS });
  return { raw: out.concat(pw.cells, LEADS), pairs: pw.pairs, uncoveredPairs: pw.uncovered };
}

// ── leads: targeted repro cells from the 2026-10-04 static HUD audit ──────
// Each lead names what it suspects and carries CHECKS the measurer can
// decide (evaluateChecks). The audit read a stale checkout: some leads may
// already be fixed — the survey, not the audit, decides. Baselines ("-base")
// are cells too, so a --only that drops one reports "baseline not measured".
export const CHECK_TYPES = Object.freeze(["varSame", "varWritten", "onScreen", "noOverlap", "noEffect", "contrast",
  "settle", "camConsistency", "clip", "shift"]);
const PL = "phone-landscape-844x390", SHORT = "phone-short-734x343";
const zTop = (vs) => ({ type: "varSame", var: "--hud-z-top", vs });
export const LEADS = Object.freeze([
  // 1. Moving one cluster must not shrink the whole top band.
  { name: "lead01-base", device: PL, lead: "baseline for lead 1/3" },
  { name: "lead01-map-x20", device: PL, preset: { map: { x: 20 } }, lead: "MAP x+20 must not drop --hud-z-top", checks: [zTop("lead01-base")] },
  { name: "lead01-sectors-x-20", device: PL, preset: { sectors: { x: -20 } }, lead: "SECTORS x-20 must not drop --hud-z-top", checks: [zTop("lead01-base")] },
  { name: "lead01-tower-s200", device: PL, preset: { tower: { s: 200 } }, lead: "TOWER s200 must not drop --hud-z-top", checks: [zTop("lead01-base")] },
  // 2. Moving / growing SPEED & GEAR must not shrink the bottom band or the dock.
  { name: "lead02-base", device: PL, steer: "buttons", hudScale: 150, lead: "baseline for lead 2" },
  ...[["x40", { gearbox: { x: 40 } }], ["s200", { gearbox: { s: 200 } }]].map(([n, p]) => ({
    name: `lead02-gearbox-${n}`, device: PL, steer: "buttons", hudScale: 150, preset: p,
    lead: `SPEED & GEAR ${n} must leave --hud-z-bot / --hud-z-dock unchanged`,
    checks: [{ type: "varSame", var: "--hud-z-bot", vs: "lead02-base" }, { type: "varSame", var: "--hud-z-dock", vs: "lead02-base" }] })),
  // 3. MAP y+40: the dock cap must not move; the limits chip stays sane.
  { name: "lead03-map-y40", device: PL, preset: { map: { y: 40 } }, lead: "MAP y+40: dock cap unchanged, #hud-limits on-screen",
    checks: [{ type: "varSame", var: "--hud-z-dock", vs: "lead01-base" }, { type: "onScreen", keys: ["limits"], pool: "transient" }] },
  // 4. Tower plates off + big HUD + max buttons on a short phone.
  { name: "lead04-plates-off-short", device: SHORT, off: ["pos", "lap", "time", "best"], hudScale: 175, btnScale: 300,
    lead: "plates off, HUD 175, BUTTON max at 734x343: no touch button off-screen, --hud-z-dock written",
    checks: [{ type: "onScreen", keys: TOUCH_BUTTONS.slice() }, { type: "varWritten", var: "--hud-z-dock" }] },
  // 5. A BROADCAST-style move, written while STANDARD shows, lands once on the
  // live switch to BROADCAST. Since #843 each HUD STYLE keeps its own layout
  // (js/ui/hud-layout.js SIX LAYOUTS), so the move is written into the
  // broadcast style's other set (presetProf) — a STANDARD-set move no longer
  // reaches the BROADCAST HUD at all, by design.
  { name: "lead05-base", profileLive: "broadcast", lead: "baseline for lead 5 (STANDARD boot, live switch to BROADCAST)" },
  { name: "lead05-broadcast-moved", profileLive: "broadcast", presetProf: "broadcast", preset: { tower: { x: -30 }, map: { y: 10 } },
    lead: "BROADCAST-style other-set TOWER x-30 + MAP y+10, then a live switch to BROADCAST: tower on-screen, map moved once",
    checks: [{ type: "onScreen", keys: ["tower", "map"] }, { type: "shift", key: "map", vs: "lead05-base", axis: "y", pct: 10, tolPct: 3 }] },
  // 6. Light theme: tower digits must read against their plate.
  { name: "lead06-light-contrast", theme: "light", lead: "LIGHT theme: .hud-top .hud-value contrast vs plate >= 4.5",
    checks: [{ type: "contrast", sel: ".hud-top .hud-value", min: 4.5 }] },
  // 7. How long fitHud takes to re-cap after a live change.
  { name: "lead07-settle-sectors-off", device: PL, lead: "untick SECTORS mid-race: --hud-z-top re-cap time",
    checks: [{ type: "settle", var: "--hud-z-top", off: "sectors", maxMs: 500 }] },
  { name: "lead07-settle-tower-s150", device: PL, lead: "TOWER s150 mid-race: --hud-z-top re-cap time",
    checks: [{ type: "settle", var: "--hud-z-top", set: ["tower", { s: 150 }], maxMs: 500 }] },
  // 8. A MOVE & SIZE slider on an element the profile / layout hides does nothing.
  ...["sectors", "energy", "ot", "aero"].map((id) => ({ name: `lead08-minimal-${id}`, profile: "minimal", preset: { [id]: { x: 10 } },
    lead: `MINIMAL + MOVE & SIZE ${id}: the slider has no visible effect`, checks: [{ type: "noEffect", key: id }] })),
  { name: "lead08-compact-tyre", layout: "compact", tyres: "on", preset: { tyre: { x: 10 } },
    lead: "LAYOUT COMPACT + MOVE & SIZE TYRES: the slider has no visible effect", checks: [{ type: "noEffect", key: "tyre" }] },
  // 9. The mirror, grown or moved, must not land on the radio card or the flag.
  ...[["s150", { mirror: { s: 150 } }], ["y10", { mirror: { y: 10 } }]].map(([n, p]) => ({ name: `lead09-mirror-${n}`, mirror: "on", preset: p,
    lead: `MIRROR on + ${n}: #announce / #hud-flag clear #hud-mirror`, checks: [{ type: "noOverlap", a: "mirror", b: ["announce", "flag"] }] })),
  // 10. A big radio card on a wide screen must clear the corner buttons.
  { name: "lead10-announce-s150-1920", device: "desktop-1920", preset: { announce: { s: 150 } },
    lead: "1920 RACE MESSAGES s150: #announce clears #btn-cam / #pausebtn", checks: [{ type: "noOverlap", a: "announce", b: ["btn-cam", "pausebtn"] }] },
  // 11. The limits chip in its LEFT mode (short landscape), doubled.
  { name: "lead11-limits-s200-short", device: SHORT, preset: { limits: { s: 200 } },
    lead: "short landscape (data-limits-left) TRACK LIMITS s200: #hud-limits on-screen", checks: [{ type: "onScreen", keys: ["limits"], pool: "transient" }] },
  // 12. BROADCAST on a small phone, big HUD, gaps forced on.
  { name: "lead12-broadcast-640-hud175", device: "phone-640x360", profile: "broadcast", hudScale: 175, gaps: "on",
    lead: "BROADCAST 640x360 HUD 175 GAPS ON: gaps vs map", checks: [{ type: "noOverlap", a: "gaps", b: ["map"] }] },
  // 13. Which cameras count as "cockpit": do HudLayout's set, MAP AUTO and
  // cockpit-cam each match CamGroups (js/camera/cam-groups.js)? They are TWO
  // questions on purpose: VISOR and HOOD are ONBOARD (MAP AUTO hides) but draw
  // no wheel (other layout, no cockpit-cam).
  ...["visor", "hood"].map((cam) => ({ name: `lead13-${cam}-consistency`, cam, map: "auto",
    lead: `${cam.toUpperCase()}: HudLayout set / MAP AUTO / cockpit-cam vs CamGroups`, checks: [{ type: "camConsistency" }] })),
  // 14. LARGER text must not clip the ERS label out of its bar.
  { name: "lead14-larger-energy", textSize: "larger", lead: "TEXT LARGER: #hud-energy label clipped?",
    checks: [{ type: "clip", sel: "#hud-energy", label: "#hud-energy .hud-energy-label" }] },
  { name: "lead14-larger-energy-phone", device: PL, textSize: "larger", lead: "TEXT LARGER on a phone: #hud-energy label clipped?",
    checks: [{ type: "clip", sel: "#hud-energy", label: "#hud-energy .hud-energy-label" }] },
]);

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
function rgba(s) {
  const m = /rgba?\(([^)]+)\)/.exec(String(s || ""));
  if (!m) return null;
  const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 };
}
const lum = ({ r, g, b }) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
/** WCAG contrast of fg over bg, the bg composited over `under` (a plate is
 *  usually see-through; the scene behind it is assumed mid-grey). */
export function contrastRatio(fg, bg, under = { r: 128, g: 128, b: 128 }) {
  const F = rgba(fg), B0 = rgba(bg);
  if (!F) return null;
  const B = B0 ? { r: B0.r * B0.a + under.r * (1 - B0.a), g: B0.g * B0.a + under.g * (1 - B0.a), b: B0.b * B0.a + under.b * (1 - B0.a) } : under;
  const a = lum(F), b = lum(B);
  return +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2);
}

/** What CamGroups says camera `cell.cam` should give: the MOVE & SIZE set
 *  (COCKPIT_LAYOUT), the map hide (MAP ON / OFF, or AUTO: ONBOARD or MINIMAL —
 *  js/ui/hud.js) and body.cockpit-cam (the COCKPIT_LAYOUT pair, default wheel). */
export function camGroupFacts(cell) {
  const wheel = COCKPIT_LAYOUT_IDS.includes(cell.cam), visor = HELMET_LAYOUT_IDS.includes(cell.cam);
  const prof = cell.profileLive && cell.profileLive !== "none" ? cell.profileLive : cell.profile;
  const mapAutoHides = cell.map === "off" || (cell.map === "auto" && (ONBOARD_IDS.includes(cell.cam) || prof === "minimal"));
  return { layoutSet: wheel ? "cockpit" : visor ? "helmet" : "other", mapAutoHides, cockpitCam: wheel };
}
/** Decide one cell's CHECKS. rec = this cell's measured record (state.vars,
 *  records, transientRecords, extras[i]); byId(id) → another cell's record. */
export function evaluateChecks(cell, rec, byId = () => null) {
  const out = [];
  const add = (detail, severity, elements = []) => out.push({ cell: cell.id || cellId(cell), kind: "lead", elements, detail: `${cell.lead ? cell.lead + " — " : ""}${detail}`, severity });
  if (!rec || !rec.records) return out;
  const dev = DEVICES[cell.device];
  const vars = (r) => (r && r.state && r.state.vars) || {};
  const pick = (r, key, pool) => ((pool === "transient" ? r.transientRecords : r.records) || []).find((e) => e.key === key);
  (cell.checks || []).forEach((ch, i) => {
    const x = (rec.extras || [])[i];
    if (ch.type === "varSame" || ch.type === "shift") {
      const base = byId(ch.vs);
      if (!base || !base.records) { add(`baseline ${ch.vs} not measured (run it in the same survey)`, "info"); return; }
      if (ch.type === "varSame") {
        const a = vars(base)[ch.var], b = vars(rec)[ch.var];
        const na = num(a), nb = num(b);
        if (a === b || (na != null && nb != null && Math.abs(na - nb) <= (ch.tol ?? 0.005))) add(`${ch.var} ${JSON.stringify(b)} = baseline — OK`, "info");
        else add(`${ch.var} ${JSON.stringify(a)} → ${JSON.stringify(b)} vs ${ch.vs}${na != null && nb != null && nb < na ? " (DROPPED)" : ""}`,
          na != null && nb != null && nb < na ? "high" : (na == null) !== (nb == null) ? "high" : "medium");
      } else {
        const e0 = pick(base, ch.key), e1 = pick(rec, ch.key);
        if (!e0 || !e1 || !e0.visible || !e1.visible) { add(`${ch.key} not visible in both cells`, "medium", [ch.key]); return; }
        const d = ch.axis === "x" ? e1.x - e0.x : e1.y - e0.y;
        const want = (ch.pct / 100) * (ch.axis === "x" ? dev.w : dev.h), tol = (ch.tolPct / 100) * (ch.axis === "x" ? dev.w : dev.h);
        add(`${ch.key} moved ${Math.round(d)}px on ${ch.axis} (expected ≈ ${Math.round(want)}±${Math.round(tol)})`, Math.abs(d - want) > tol ? "high" : "info", [ch.key]);
      }
    } else if (ch.type === "varWritten") {
      const v = vars(rec)[ch.var];
      add(`${ch.var} = ${JSON.stringify(v)}`, v ? "info" : "high");
    } else if (ch.type === "onScreen") {
      for (const key of ch.keys) {
        const e = pick(rec, key, ch.pool);
        if (!e || !e.visible) { add(`${key} not visible to measure`, ch.pool === "transient" ? "medium" : "info", [key]); continue; }
        const off = e.x < -0.5 || e.y < -0.5 || e.r > dev.w + 0.5 || e.b > dev.h + 0.5;
        add(`${key} [${e.x},${e.y} ${e.w}x${e.h}] ${off ? "OFF-SCREEN" : "on-screen"}${key === "limits" ? ` (data-limits-left ${!!(rec.state && rec.state.limitsLeft)})` : ""}`, off ? "high" : "info", [key]);
      }
    } else if (ch.type === "noOverlap") {
      const a = pick(rec, ch.a, "transient");
      for (const key of ch.b) {
        const b = pick(rec, key, "transient");
        if (!a || !b || !a.visible || !b.visible) { add(`${ch.a} / ${key} not both visible (${a && a.hiddenBy}/${b && b.hiddenBy})`, "info", [ch.a, key]); continue; }
        const w = Math.min(a.r, b.r) - Math.max(a.x, b.x), h = Math.min(a.b, b.b) - Math.max(a.y, b.y);
        add(`${ch.a} x ${key}: ${w > 0.5 && h > 0.5 ? `OVERLAP ${Math.round(w)}x${Math.round(h)}px` : "clear"}`, w > 0.5 && h > 0.5 ? "high" : "info", [ch.a, key]);
      }
    } else if (ch.type === "noEffect") {
      const e = pick(rec, ch.key);
      const hidden = !e || !e.visible;
      add(hidden ? `${ch.key} is hidden here, so its MOVE & SIZE slider has no visible effect (hidden by ${e ? e.hiddenBy : "absence"})` : `${ch.key} visible — the slider acts`, hidden ? "medium" : "info", [ch.key]);
    } else if (ch.type === "contrast") {
      if (!x || x.missing) { add(`${ch.sel} not found`, "medium"); return; }
      const ratio = contrastRatio(x.fg, x.bg);
      const fgL = rgba(x.fg) ? +lum(rgba(x.fg)).toFixed(3) : null;
      add(`${ch.sel} color ${x.fg} on ${x.bg || "transparent"} (${x.bgFrom || "?"}): ${ratio}:1 over mid-grey, fg luminance ${fgL}`, ratio != null && ratio < ch.min ? "high" : "info");
    } else if (ch.type === "settle") {
      if (!x) { add("settle not measured", "medium"); return; }
      const ms = x.lastChangeMs;
      add(`${ch.var} ${JSON.stringify(x.before)} → ${JSON.stringify(x.after)}; last change at ${ms == null ? "never (3 s window)" : Math.round(ms) + " ms"}`,
        ms != null && ms > ch.maxMs ? "medium" : "info");
    } else if (ch.type === "camConsistency") {
      const s = rec.state || {};
      const facts = { layoutSet: s.layoutSet, mapAutoHides: /\bhud-hide-map\b/.test(s.bodyHud || ""), cockpitCam: /\bcockpit-cam\b/.test(s.bodyHud || "") };
      const want = camGroupFacts(cell);
      const off = Object.keys(want).filter((k) => facts[k] !== want[k]);
      add(`${cell.cam}: ${JSON.stringify(facts)} — ${off.length ? `INCONSISTENT with CamGroups: ${off.map((k) => `${k} ${JSON.stringify(facts[k])}, want ${JSON.stringify(want[k])}`).join("; ")}` : "consistent with CamGroups"}`,
        off.length ? "medium" : "info");
    } else if (ch.type === "clip") {
      if (!x || x.missing) { add(`${ch.label} not found`, "medium"); return; }
      const clipped = x.scrollH > x.clientH + 1 || x.scrollW > x.clientW + 1
        || (x.bar && x.lab && (x.lab.x < x.bar.x - 0.5 || x.lab.r > x.bar.r + 0.5 || x.lab.y < x.bar.y - 0.5 || x.lab.b > x.bar.b + 0.5));
      add(`label scroll ${x.scrollW}x${x.scrollH} vs client ${x.clientW}x${x.clientH}; label ${JSON.stringify(x.lab)} in bar ${JSON.stringify(x.bar)} — ${clipped ? "CLIPPED" : "fits"}`, clipped ? "medium" : "info");
    }
  });
  return out;
}

/** quick | full | exhaustive | a parsed matrix file → { cells (normalised, deduped), meta }.
 *  File shapes: [cell…] | {cells:[…], base?} | {dims:{knob:[…]}, base?, cap?}.
 *  `base` (the CLI's --track) under-lays every cell. */
export function expandMatrix(spec, base = {}) {
  let raw, meta = {};
  base = { ...base };
  if (spec === "quick") { raw = QUICK; meta = { matrix: "quick" }; }
  else if (spec === "full") {
    const pw = pairwiseBooted(FULL_DIMS, { valid: fullValid, cap: FULL_CAP });
    raw = pw.cells; meta = { matrix: "full", pairs: pw.pairs, uncoveredPairs: pw.uncovered, cap: FULL_CAP, boots: pw.boots };
  } else if (spec === "leads") { raw = LEADS; meta = { matrix: "leads" };
  } else if (spec === "exhaustive") {
    const ex = exhaustiveRaw(base);
    raw = ex.raw; meta = { matrix: "exhaustive", pairs: ex.pairs, uncoveredPairs: ex.uncoveredPairs };
  } else if (Array.isArray(spec)) { raw = spec; meta = { matrix: "file" }; }
  else if (spec && typeof spec === "object") {
    base = { ...base, ...(spec.base || {}) };
    if (Array.isArray(spec.cells)) { raw = spec.cells; meta = { matrix: "file" }; }
    else if (spec.dims && typeof spec.dims === "object") {
      for (const [k, v] of Object.entries(spec.dims)) {
        if (!Array.isArray(v) || !v.length) bad(`dims.${k} must be a non-empty array`);
        if (!Object.hasOwn(DEFAULT_CELL, k)) bad(`dims: unknown knob ${k}`);
      }
      const cap = Math.min(Number(spec.cap) || FULL_CAP, 500);
      const pw = pairwiseBooted(spec.dims, { valid: fullValid, cap });
      raw = pw.cells; meta = { matrix: "file-pairwise", pairs: pw.pairs, uncoveredPairs: pw.uncovered, cap, boots: pw.boots };
    } else bad("matrix file needs cells:[…] or dims:{…}");
  } else bad(`unknown matrix ${JSON.stringify(spec)}`);
  if (raw.length > 2000) bad("a matrix may hold at most 2000 cells");
  const seen = new Map();
  for (const r of raw) {
    const c = normalizeCell(r, base);
    const id = cellId(c);
    if (seen.has(id)) { if (c.name) bad(`duplicate cell name ${id}`); continue; }
    seen.set(id, { ...c, id });
  }
  return { cells: [...seen.values()], meta };
}

/** --only a,b: keep cells whose id contains ANY of the substrings. */
export function filterOnly(cells, only) {
  const subs = (only || []).filter(Boolean);
  return subs.length ? cells.filter((c) => subs.some((s) => c.id.includes(s))) : cells;
}

/** Boot groups in run order: [{ bootKey, cells }]. */
export function bootGroups(cells) {
  const m = new Map();
  for (const c of cells) {
    const k = bootKey(c);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(c);
  }
  return [...m].map(([k, cs]) => ({ bootKey: k, cells: cs }));
}

/** Shard i of n (1-based) — whole BOOT GROUPS, so no page boots twice across
 *  shards, balanced by estimated minutes; deterministic for a given cell list. */
export function shardCells(cells, i, n) {
  if (!Number.isInteger(n) || n < 1 || n > 64 || !Number.isInteger(i) || i < 1 || i > n) bad(`shard must be i/n with 1 <= i <= n <= 64`);
  const load = new Array(n).fill(0), bins = Array.from({ length: n }, () => []);
  // A boot group over 40 cells (exhaustive's per-device baseline page holds
  // ~70) is split: one extra boot buys a balanced shard.
  const chunks = [];
  for (const g of bootGroups(cells)) for (let s = 0; s < g.cells.length; s += 40) chunks.push(g.cells.slice(s, s + 40));
  const groups = chunks.map((cs, k) => ({ cells: cs, k, cost: 1.5 + cs.length * 0.4 }))
    .sort((a, b) => b.cost - a.cost || a.k - b.k);
  for (const g of groups) {
    let at = 0;
    for (let s = 1; s < n; s++) if (load[s] < load[at]) at = s;
    load[at] += g.cost; bins[at].push(g);
  }
  return bins[i - 1].sort((a, b) => a.k - b.k).flatMap((g) => g.cells);
}
export function parseShard(s) {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(s || ""));
  if (!m) bad(`shard must look like 1/4 (got ${JSON.stringify(s)})`);
  const i = +m[1], n = +m[2];
  if (n < 1 || n > 64 || i < 1 || i > n) bad(`shard must be i/n with 1 <= i <= n <= 64 (got ${s})`);
  return { i, n };
}

/** Rough wall-clock in minutes on this container's SwiftShader: ~1.5 min per
 *  boot (page + race build) and ~0.4 min per cell (knobs + lit frame + shot),
 *  ~0.15 measure-only (no lit-frame wait). llvmpipe on a CI runner is ~3x faster. */
export function estimateMinutes(cells, { shots = true } = {}) {
  return +(bootGroups(cells).length * 1.5 + cells.length * (shots ? 0.4 : 0.15)).toFixed(1);
}

// ── expected visibility ───────────────────────────────────────────────────
/** {key: {want: true|false|null, why}} for one cell. ctx carries what the
 *  platform decides and the settings cannot: desktop (body.desktop),
 *  cockpitCam (body.cockpit-cam — also needs a wheel with a screen). Missing
 *  ctx fields fall back to the device / camera. */
export function expectedVisibility(cell, ctx = {}) {
  const dev = DEVICES[cell.device];
  const desktop = ctx.desktop != null ? !!ctx.desktop : !dev.touch;
  const cam = cell.cam;
  const dynamic = DYNAMIC_CAMS.has(cam);
  const onboard = ONBOARD_IDS.includes(cam);
  const bcam = BCAM_IDS.includes(cam);
  const cockpitCam = ctx.cockpitCam != null ? !!ctx.cockpitCam : cam === "cockpit";
  // The touch-cockpit strip hide follows the cockpit LAYOUT set (body[data-hl-set],
  // js/ui/hud-layout.js) — the camera alone, whatever the wheel; cockpitCam is
  // only the wheel LCD's gear / speed hide. HELMET is its own set, the visor:
  // on touch it leaves out OT / AERO and BRAKE BIAS only.
  const cockpitSet = COCKPIT_LAYOUT_IDS.includes(cam), helmetSet = HELMET_LAYOUT_IDS.includes(cam);
  const prof = cell.profileLive && cell.profileLive !== "none" ? cell.profileLive : cell.profile;
  const minimal = prof === "minimal", broadcast = prof === "broadcast";
  const lay = cell.layout;
  // A preset written into another style's layout places nothing on this HUD.
  const writtenTo = cell.presetProf && cell.presetProf !== "shown" ? cell.presetProf : cell.profile;
  const placed = new Set(writtenTo !== prof ? [] : typeof cell.preset === "object" ? Object.keys(cell.preset) : PRESETS[cell.preset] || []);
  // A NAMED preset never places the chips a touch cockpit / helmet hides (js/ui/hud-layout.js
  // TOUCH_PRESET_HOLD: it sets no data-hl-user on them), so they stay hidden; inline offsets are placements.
  const hold = !dev.touch || typeof cell.preset === "object" ? null : TOUCH_PRESET_HOLD[HudSetOf(cam)];
  if (hold) for (const id of Object.keys(hold)) placed.delete(id);
  const portraitBlock = dev.touch && dev.h > dev.w && dev.w <= 743 && dev.h <= 956;
  const E = {};
  const want = (key, v, why) => { E[key] = { want: v, why }; };
  const camRule = (key, v, why) => want(key, dynamic ? null : v, dynamic ? `camera ${cam} cuts between rigs` : why);

  if (cell.hud === "off") {
    for (const t of HUD_TARGETS) if (t.role === "hud") want(t.key, false, "HUD hidden (__apex.hud(false))");
    want("rotateDevice", portraitBlock, "portrait racing is blocked (css/responsive.css)");
    return E;
  }
  want("tower", true, "no setting hides the timing tower (css/hud.css)");
  for (const k of ["pos", "lap", "time"]) want(k, true, "the timing tower's POS / LAP / TIME plates");
  want("best", !(minimal || broadcast || lay === "driver" || lay === "compact"),
    "BEST drops under MINIMAL / BROADCAST / layout DRIVER|COMPACT (css/hud.css)");
  // MAP: hud.js syncHudVisClasses — ON shows, OFF hides, AUTO hides onboard / MINIMAL.
  if (cell.map === "on") want("map", true, "MAP: ON");
  else if (cell.map === "off") want("map", false, "MAP: OFF");
  else want("map", !(onboard || minimal), "MAP: AUTO hides onboard (cockpit/hood/tcam) and MINIMAL");
  if (cell.gaps === "on") want("gaps", true, "GAPS: ON");
  else if (cell.gaps === "off") want("gaps", false, "GAPS: OFF");
  else want("gaps", !minimal, "GAPS: AUTO hides under MINIMAL only");
  if (minimal || lay === "driver" || lay === "compact") want("sectors", false, "sectors drop under MINIMAL / DRIVER / COMPACT");
  else camRule("sectors", !(bcam && !broadcast), "a broadcast camera hides sectors outside the BROADCAST profile");
  camRule("gearbox", !(cockpitCam || bcam), "the wheel LCD (cockpit-cam) and broadcast cameras hide SPEED & GEAR; a helmet (the visor) paints the chip on every device");
  // css/track-detail.css: body.cockpit-cam #hud-speed { display: none } at EVERY size (the >= 900x600 limit
  // this rule had was a false "missing" on every phone cockpit cell; salvaged from PR #1316).
  camRule("speed", !(cockpitCam || (broadcast && bcam)),
    "cockpit-cam always hides the floating speed (wheel LCD); BROADCAST + broadcast cam hides .hud-bottom");
  for (const k of ["energy", "ot", "aero"]) {
    if (minimal || lay === "timing" || lay === "compact") want(k, false, "dropped by MINIMAL / TIMING / COMPACT");
    else camRule(k, !(bcam || (cockpitSet && !desktop && !placed.has(k)) || (helmetSet && k !== "energy" && !desktop && !placed.has(k))),
      "broadcast cams hide it; touch cockpit hides it unless MOVE & SIZE placed it (css/track-detail.css); desktop cockpit keeps it beside the wheel; a touch helmet keeps ENERGY and leaves OT / AERO to their buttons");
  }
  if (minimal || lay === "timing" || lay === "compact") want("bb", false, "BRAKE BIAS drops under MINIMAL / TIMING / COMPACT");
  else camRule("bb", !(bcam || (!desktop && !placed.has("bb"))), "BRAKE BIAS is desktop-only unless placed (css/hud.css)");
  if (cell.tyres === "off") want("tyre", false, "TYRE WEAR off hides the widget (js/ui/hud.js)");
  else if (lay === "timing" || lay === "compact") want("tyre", false, "TYRES drop under TIMING / COMPACT");
  else camRule("tyre", !((broadcast && bcam) || (cockpitSet && !desktop && !placed.has("tyre"))),
    "BROADCAST + broadcast cam hides .hud-bottom; touch cockpit hides it unless MOVE & SIZE placed it (css/track-detail.css)");
  if (cell.mirror === "off") want("mirror", false, "MIRROR: OFF");
  else if (cell.mirror === "on") camRule("mirror", true, "MIRROR: ON");
  // HudElements: an element switched OFF must be gone — and only that one,
  // which the rules above already assert for everything else.
  for (const id of cell.off || []) want(ELEMENT_TOGGLES[id], false, `HudElements: ${id} OFF (css/hud.css data-hud-hide)`);
  // Touch controls: desktop shows only the pause button (hud-layout.spec "desktop").
  want("pausebtn", true, "the pause button shows in every race");
  for (const id of TOUCH_BUTTONS) if (desktop) want(id, false, "a desktop hides the whole touch stack");
  want("rotateDevice", portraitBlock, "portrait racing is blocked on a phone (css/responsive.css)");
  return E;
}

// ── findings ──────────────────────────────────────────────────────────────
export const SEVERITY = Object.freeze({ high: 3, medium: 2, low: 1, info: 0 });
const r1 = (v) => Math.round(v * 10) / 10;
const box = (e) => `[${r1(e.x)},${r1(e.y)} ${r1(e.w)}x${r1(e.h)}]`;

/** Findings for one measured cell. m = { records, transientRecords?, ctx,
 *  pageErrors?, cellError? }. Records follow tools/lib/hud-geometry.mjs. */
export function classifyFindings(cell, m, { minFontPx = 10, analyze = analyzeOverlap } = {}) {
  const dev = DEVICES[cell.device];
  const W = dev.w, H = dev.h, ins = dev.ins;
  const id = cell.id || cellId(cell);
  const out = [];
  const add = (kind, elements, detail, severity) => out.push({ cell: id, kind, elements, detail, severity });
  for (const e of m.pageErrors || []) add("pageError", [], String(e).slice(0, 300), "high");
  if (m.cellError) add("pageError", [], "cell failed: " + String(m.cellError).slice(0, 300), "high");
  const recs = m.records || [];
  if (!recs.length) return out;
  const byKey = new Map(recs.map((r) => [r.key, r]));
  const shown = (r) => r && r.visible && !r.fadedByAncestor;
  const exp = expectedVisibility(cell, m.ctx || {});
  for (const [key, { want, why }] of Object.entries(exp)) {
    const r = byKey.get(key);
    if (want === true && !shown(r)) {
      add("missing", [key], `${key} expected (${why}) but ${!r || !r.exists ? "not in the DOM" : r.fadedByAncestor ? "an ancestor is at opacity 0" : "hidden by " + r.hiddenBy}`, "high");
    } else if (want === false && shown(r)) {
      const toggled = (cell.off || []).some((t) => ELEMENT_TOGGLES[t] === key);
      add("unexpected", [key], `${key} visible at ${box(r)} though hidden is expected (${why})`,
        toggled ? "high" : TOUCH_BUTTONS.includes(key) ? "medium" : "low");
    }
  }
  // A MOVE & SIZE offset on an element these settings hide does nothing on
  // screen — the slider "has no effect" (static audit lead 8).
  if (typeof cell.preset === "object") {
    for (const k of Object.keys(cell.preset)) {
      if (exp[k] && exp[k].want === false) add("noEffect", [k], `MOVE & SIZE moves ${k}, but these settings hide it (${exp[k].why})`, "low");
    }
  }
  const ctrls = recs.filter((r) => r.role === "ctrl" && TOUCH_BUTTONS.includes(r.key) && shown(r));
  const desktop = m.ctx && m.ctx.desktop != null ? m.ctx.desktop : !dev.touch;
  const covered = shown(byKey.get("rotateDevice"));
  if (!desktop && !covered && cell.hud !== "off" && ctrls.length <= 3) {
    add("missing", TOUCH_BUTTONS.slice(), `only ${ctrls.length} touch controls visible on a touch device (hud-layout.spec wants > 3)`, "high");
  }
  for (const r of recs) {
    if (!shown(r) || r.role === "overlay") continue;
    const off = r.x < -0.5 || r.y < -0.5 || r.r > W + 0.5 || r.b > H + 0.5;
    if (off) {
      const entire = r.r <= 0 || r.x >= W || r.b <= 0 || r.y >= H;
      add("offscreen", [r.key], `${r.key} ${box(r)} ${entire ? "entirely outside" : "crosses the edge of"} the ${W}x${H} viewport`, entire ? "high" : "medium");
    } else if (r.x < ins.sal - 0.5 || r.r > W - ins.sar + 0.5 || r.y < ins.sat - 0.5 || r.b > H - ins.sab + 0.5) {
      add("unsafe", [r.key], `${r.key} ${box(r)} enters the safe-area insets ${JSON.stringify(ins)}`, "medium");
    }
    if (r.minFontPx != null && r.minFontPx < minFontPx) {
      add("tinyText", [r.key], `${r.key} renders "${r.minFontText || ""}" at ${r.minFontPx}px (< ${minFontPx}px)`, r.minFontPx < 8 ? "high" : "medium");
    }
  }
  // Overlaps on the transient set (announce / limits / flag forced on with
  // their widest text, as hud-layout.spec does) when the runner measured it.
  const pool = m.transientRecords && m.transientRecords.length ? m.transientRecords : recs;
  const pk = new Map(pool.map((r) => [r.key, r]));
  const a = analyze(pool.filter((r) => !r.fadedByAncestor), W, H, ins);
  for (const [list, kind] of [[a.overlaps, "ctrl/ctrl"], [a.hudClash, "hud"]]) {
    for (const pair of list) {
      const [k1, k2] = pair.split("+");
      const e1 = pk.get(k1), e2 = pk.get(k2);
      const w = Math.min(e1.r, e2.r) - Math.max(e1.x, e2.x), h = Math.min(e1.b, e2.b) - Math.max(e1.y, e2.y);
      const area = w > 0 && h > 0 ? w * h : 0;
      const onCtrl = e2.role === "ctrl";
      const sev = Math.min(w, h) < 2 ? "low" : (kind === "ctrl/ctrl" || onCtrl) ? "high" : "medium";
      add("overlap", [k1, k2], `${k1} ${box(e1)} x ${k2} ${box(e2)} — ${r1(Math.max(w, 0))}x${r1(Math.max(h, 0))}px (${Math.round(area)}px²)${onCtrl ? " — a readout over a tap target" : ""}`, sev);
    }
  }
  if (covered) {
    // Nothing under the full-screen rotate card is visible or tappable
    // (hud-layout.spec.js on .hud-top x #pausebtn in portrait).
    for (const f of out) if (f.kind !== "pageError" && f.elements[0] !== "rotateDevice") { f.severity = "info"; f.detail += " (under #rotate-device)"; }
  }
  return out;
}

/** Re-decide every cell's lead CHECKS against the whole set (a check may
 *  compare with a baseline cell); idempotent, so --merge re-runs it. */
export function applyChecks(cells) {
  const byId = new Map(cells.map((c) => [c.id, c]));
  for (const c of cells) {
    const cell = c.cell || {};
    if (!cell.checks || !cell.checks.length) continue;
    c.findings = (c.findings || []).filter((f) => f.kind !== "lead").concat(evaluateChecks({ ...cell, id: c.id }, c, (id) => byId.get(id)));
  }
  return cells;
}

export function rankFindings(findings) {
  const order = ["pageError", "lead", "missing", "unexpected", "overlap", "offscreen", "unsafe", "tinyText", "noEffect"];
  return [...findings].sort((a, b) => (SEVERITY[b.severity] - SEVERITY[a.severity])
    || (order.indexOf(a.kind) - order.indexOf(b.kind)) || a.cell.localeCompare(b.cell));
}

export function countBy(findings) {
  const c = { total: findings.length, high: 0, medium: 0, low: 0, info: 0, byKind: {} };
  for (const f of findings) { c[f.severity]++; c.byKind[f.kind] = (c.byKind[f.kind] || 0) + 1; }
  return c;
}

/** Combine shard reports into one. `reports` = [{ report, shotRel(cell) → new relative path | null }]. */
export function mergeReports(parts) {
  const cells = [], seen = new Set();
  const metas = [];
  for (const { report, relink } of parts) {
    metas.push(report.meta || {});
    for (const c of report.cells || []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      cells.push({ ...c, shotRel: relink ? relink(c) : c.shotRel });
    }
  }
  applyChecks(cells);
  const findings = rankFindings(cells.flatMap((c) => c.findings || []));
  const m0 = metas[0] || {};
  return { meta: { ...m0, merged: metas.length, shards: metas.map((m) => m.shard || null), when: new Date().toISOString() },
    cells, findings, counts: countBy(findings) };
}

/** findings.md — ranked, grouped by kind, each row names its shot. */
export function renderFindingsMd(report) {
  const fs = rankFindings(report.findings || []);
  const shot = new Map((report.cells || []).map((c) => [c.id, c.shotRel || c.shot]));
  const lines = [`# HUD survey — ${report.meta.matrix} (${report.cells.length} cells, ${report.meta.track} @ ${report.meta.frac})`, "",
    `Generated ${report.meta.when} by tools/shot/hud-survey.mjs. Counts: ${JSON.stringify(countBy(fs))}.`, ""];
  if (!fs.length) lines.push("No findings.");
  const kinds = [...new Set(fs.map((f) => f.kind))];
  for (const k of kinds) {
    const rows = fs.filter((f) => f.kind === k);
    lines.push(`## ${k} (${rows.length})`, "", "| sev | cell | elements | detail | shot |", "|---|---|---|---|---|");
    for (const f of rows) {
      lines.push(`| ${f.severity} | ${f.cell} | ${f.elements.join(", ")} | ${String(f.detail).replace(/\|/g, "\\|")} | ${shot.get(f.cell) || "—"} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
/** index.html — a static gallery, no external assets. Shot paths are relative to the report dir. */
export function renderIndexHtml(report) {
  const fs = report.findings || [];
  const cards = (report.cells || []).map((c) => {
    const mine = rankFindings(fs.filter((f) => f.cell === c.id));
    const worst = mine.length ? mine[0].severity : "clean";
    const img = c.shotRel ? `<a href="${esc(c.shotRel)}"><img loading="lazy" src="${esc(c.shotRel)}" alt="${esc(c.id)}"></a>` : `<div class="noshot">no shot</div>`;
    const list = mine.map((f) => `<li class="s-${f.severity}"><b>${esc(f.kind)}</b> ${esc(f.detail)}</li>`).join("");
    return `<figure class="card w-${worst}" data-sev="${worst}">${img}<figcaption><code>${esc(c.id)}</code> <span class="tag">${esc(worst)}</span><ul>${list}</ul></figcaption></figure>`;
  }).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HUD survey</title><style>
:root{--bg:#111;--fg:#eee;--card:#1c1c1c;--hi:#e5484d;--md:#f5a524;--lo:#8aa;--ok:#3a3}
@media (prefers-color-scheme:light){:root{--bg:#f6f6f6;--fg:#111;--card:#fff}}
body{background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif;margin:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px}
.card{background:var(--card);margin:0;padding:8px;border-left:4px solid var(--ok)}
.w-high{border-color:var(--hi)}.w-medium{border-color:var(--md)}.w-low,.w-info{border-color:var(--lo)}
img{width:100%;height:auto;display:block}ul{margin:4px 0 0;padding-left:18px;font-size:12px}
.s-high{color:var(--hi)}.s-medium{color:var(--md)}.tag{font-size:11px;opacity:.7}code{word-break:break-all}
</style></head><body><h1>HUD survey — ${esc(report.meta.matrix)}</h1>
<p>${esc(report.cells.length)} cells · ${esc(report.meta.track)} @ ${esc(report.meta.frac)} · ${esc(JSON.stringify(countBy(fs)))} · <a href="findings.md">findings.md</a> · <a href="report.json">report.json</a></p>
<div class="grid">
${cards}
</div></body></html>
`;
}

// ── self-test (no browser) ────────────────────────────────────────────────
/** Exercises the pure logic; returns [{name, ok, detail}]. */
export function selfTest(analyze = analyzeOverlap) {
  const res = [];
  const check = (name, ok, detail = "") => res.push({ name, ok: !!ok, detail });
  const q = expandMatrix("quick");
  check("quick has ~12 cells", q.cells.length >= 10 && q.cells.length <= 16, `${q.cells.length}`);
  check("quick boots three pages", bootGroups(q.cells).length === 3, `${bootGroups(q.cells).length}`);
  const f = expandMatrix("full");
  check("full is capped at 80", f.cells.length <= FULL_CAP && f.cells.length > 20, `${f.cells.length}`);
  check("full covers every valid pair", f.meta.uncoveredPairs === 0, `${f.meta.uncoveredPairs} of ${f.meta.pairs} uncovered`);
  check("full keeps portrait on chase", f.cells.every((c) => c.device !== "phone-portrait-390x844" || c.cam === "chase"));
  const x = expandMatrix("exhaustive");
  check("exhaustive covers its risk pairs", x.meta.uncoveredPairs === 0, `${x.cells.length} cells, ${bootGroups(x.cells).length} boots`);
  check("exhaustive switches every HudElements toggle off on every device",
    Object.keys(ELEMENT_TOGGLES).every((t) => MATRIX_DEVICES.every((d) => x.cells.some((c) => c.device === d && c.off.length === 1 && c.off[0] === t))));
  const shards = [1, 2, 3, 4].map((i) => shardCells(x.cells, i, 4));
  check("4 shards partition exhaustive", shards.flat().length === x.cells.length && new Set(shards.flat().map((c) => c.id)).size === x.cells.length);
  const rec = (key, xx, y, w, h, extra = {}) => ({ key, sel: key, role: "hud", exists: true, visible: true, hiddenBy: null,
    x: xx, y, r: xx + w, b: y + h, w, h, round: false, cx: xx + w / 2, cy: y + h / 2, rr: w / 2, contains: [], minFontPx: 12, ...extra });
  const base = normalizeCell({ name: "t" });
  const tower = rec("tower", 500, 8, 280, 50), map = rec("map", 10, 8, 140, 140), gaps = rec("gaps", 120, 8, 100, 30);
  const find = classifyFindings({ ...base, id: "t" }, { records: [tower, map, gaps, rec("pausebtn", 1220, 8, 44, 44, { role: "ctrl" })], ctx: { desktop: true } }, { analyze });
  check("map x gaps overlap is found", find.some((y) => y.kind === "overlap" && y.elements.join() === "map,gaps"));
  const gone = classifyFindings({ ...normalizeCell({ preset: "clean" }), id: "c" },
    { records: [tower, { ...map, visible: false, hiddenBy: "display" }], ctx: { desktop: true } }, { analyze });
  check("a vanished map under CLEAN is missing", gone.some((y) => y.kind === "missing" && y.elements[0] === "map" && y.severity === "high"));
  const cock = expectedVisibility(normalizeCell({ cam: "cockpit" }), { desktop: true, cockpitCam: true });
  check("desktop cockpit expects OT/AERO, not gearbox", cock.ot.want && cock.aero.want && cock.gearbox.want === false);
  const pc = expectedVisibility(normalizeCell({ cam: "cockpit", device: "phone-landscape-844x390" }), { desktop: false, cockpitCam: true });
  check("touch cockpit hides OT unless placed, and the floating SPEED (wheel LCD)", pc.ot.want === false && pc.speed.want === false);
  check("touch cockpit hides TYRES unless placed", pc.tyre.want === false && cock.tyre.want === true);
  const offGear = expectedVisibility(normalizeCell({ off: ["gear"] }), { desktop: true });
  check("HudElements gear OFF hides the gearbox only", offGear.gearbox.want === false && offGear.speed.want === true);
  const L = expandMatrix("leads");
  check("leads expand with checks, and exhaustive carries them", L.cells.length >= 25 && L.cells.every((c) => c.lead)
    && L.cells.every((c) => x.cells.some((e) => e.id === c.id)), `${L.cells.length} leads`);
  const lb = { id: "b", records: [tower], state: { vars: { "--hud-z-top": "0.9" } } };
  const lc = { id: "c", records: [tower], state: { vars: { "--hud-z-top": "0.62" } } };
  const lf = evaluateChecks({ ...normalizeCell({ checks: [{ type: "varSame", var: "--hud-z-top", vs: "b" }] }), id: "c" }, lc, () => lb);
  check("a dropped --hud-z-top is a high lead finding", lf.length === 1 && lf[0].severity === "high" && /DROPPED/.test(lf[0].detail));
  check("contrast ratio: black on white is 21", contrastRatio("rgb(0, 0, 0)", "rgb(255, 255, 255)") === 21);
  check("cell validation refuses junk", (() => { try { normalizeCell({ cam: "x" }); return false; } catch (e) { return e instanceof CellError; } })());
  return res;
}
