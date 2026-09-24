"use strict";
/* Apex 26 — the FLYBY SHOT EDITOR pause-menu panel: pick a shot from the pre-race sequence (js/camera/flyby-seq.js), scrub the whole run, edit every pose field live through __apex.flybyCam(), reorder the list and copy it out as window.FlybyShots for tools/gen/bake-flyby.mjs. */
const FlybyPanel = (function () {

// ---- the shot language, as an editable registry --------------------------
//
// js/camera/flyby-seq.js owns the MEANING of these fields; this table owns how
// far a slider may push each one. The ranges are authoring bounds, not physical
// ones: the solver already clamps `centre` distances to a helicopter's envelope
// and lifts an eye out of a building, so a slider that can reach silly numbers
// only costs the author a bad frame, never a crash.
const EASES = ["linear", "in", "out", "inOut"];
const AT_KINDS = ["start", "pole", "grid", "slot", "corner", "centre", "landmark"];
const SLOTS = [
  { key: "eye0", arr: "eye", i: 0, label: "EYE FROM" },
  { key: "eye1", arr: "eye", i: 1, label: "EYE TO" },
  { key: "look0", arr: "look", i: 0, label: "LOOK FROM" },
  { key: "look1", arr: "look", i: 1, label: "LOOK TO" },
];
// Which numeric fields each anchor actually reads. A field outside this set is
// ignored by the solver, so the editor hides it rather than offering a slider
// that does nothing — the failure mode the camera tuner's `knobApplies` exists
// to prevent, in the same shape.
const POSE_FIELDS = {
  start: ["off", "x", "y"],
  pole: ["off", "x", "y"],
  grid: ["off", "x", "y"],
  slot: ["off", "x", "y"],
  corner: ["off", "x", "y"],
  centre: ["bear", "distR", "yR", "y"],
  landmark: ["bear", "distK", "yK", "y"],
};
const FIELD = {
  off: { label: "ARC OFFSET", min: -400, max: 400, step: 1, unit: " m", def: 0 },
  // + is RIGHT of the road, except at a corner, where + is its OUTSIDE (flyby-seq.js)
  x: { label: "LATERAL (+ OUTSIDE AT A CORNER)", min: -60, max: 60, step: 0.5, unit: " m", def: 0 },
  y: { label: "HEIGHT", min: -5, max: 200, step: 0.05, unit: " m", def: 5 },
  bear: { label: "BEARING (0 = TRACK SIDE)", min: -3.15, max: 3.15, step: 0.01, unit: " rad", def: 0 },
  distR: { label: "DISTANCE (LAP RADII)", min: 0, max: 3, step: 0.01, unit: "", def: 1.2 },
  yR: { label: "HEIGHT (LAP RADII)", min: 0, max: 1.5, step: 0.01, unit: "", def: 0.4 },
  distK: { label: "DISTANCE (LANDMARK SIZES)", min: 0, max: 6, step: 0.05, unit: "", def: 1.8 },
  yK: { label: "HEIGHT (LANDMARK HEIGHTS)", min: -1, max: 3, step: 0.05, unit: "", def: 0.4 },
};
const FIELD_IDS = Object.keys(FIELD);
// `rank` is a landmark index and `n` a corner, and neither is a continuous
// quantity — both are pickers, and both live outside FIELD for that reason.
const RANKS = [0, 1, 2, 3, 4, 5];
const CORNER_NS = ["first", "mid", "late", "slowest", "fastest", "lore", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18"];

// max 1: a NORMALISED one-shot list is a single shot of dur 1, and a cap below
// it left that slider pinned at the end and the value unreachable.
const DUR = { min: 0.01, max: 1, step: 0.005, unit: "" };
const FOV = { min: 15, max: 90, step: 0.5, unit: "°" };

// ---- pure list operations -------------------------------------------------
//
// Everything below this line is data in, data out: no DOM, no globals, no
// FlybySeq. That is deliberate — it is the half a node test can hold, and
// tests/unit/flyby-panel.test.mjs holds it.

function clone(v) { return JSON.parse(JSON.stringify(v)); }

/** The fields this pose's anchor reads, in row order. */
function poseFields(pose) { return POSE_FIELDS[pose && pose.at] || POSE_FIELDS.start; }
/** A field's label for this anchor. On `centre` and `landmark` the height is
 *  yR / yK; `y` there is metres ADDED to it, and "HEIGHT" read as the height. */
function fieldLabel(at, f) {
  return (f === "y" && (at === "centre" || at === "landmark")) ? "HEIGHT OFFSET" : FIELD[f].label;
}

/** Re-anchor a pose, KEEPING whatever the new anchor can still use. Switching
 *  `corner` -> `centre` has no sensible arc offset to carry, but a height does,
 *  and dropping it silently would reset an author's framing on every mis-click. */
function switchPoseAt(pose, at) {
  if (AT_KINDS.indexOf(at) === -1) return clone(pose);
  const next = { at: at };
  if (at === "corner") next.n = (pose && pose.n !== undefined) ? pose.n : "first";
  if (at === "slot") next.n = "player";
  if (at === "landmark") next.rank = (pose && typeof pose.rank === "number") ? pose.rank : 0;
  for (const f of POSE_FIELDS[at]) {
    const carried = (pose && typeof pose[f] === "number") ? pose[f] : undefined;
    next[f] = (carried === undefined) ? FIELD[f].def : carried;
  }
  return next;
}

/** An id nothing else in the list is using: `wide`, `wide-2`, `wide-3`… */
function uniqueId(list, base) {
  const taken = {};
  for (const s of (list || [])) taken[s && s.id] = true;
  if (!taken[base]) return base;
  for (let n = 2; n < 999; n++) if (!taken[base + "-" + n]) return base + "-" + n;
  return base + "-" + Date.now();
}

/** A new shot, anchored where an author can see it: a slow pull along the
 *  start straight. Not a copy of any shipped shot — a blank one that reads. */
function blankShot(list) {
  return {
    id: uniqueId(list, "shot"), dur: 0.125, ease: "inOut",
    eye: [{ at: "start", off: -60, x: 10, y: 6 }, { at: "start", off: 20, x: 8, y: 5 }],
    look: [{ at: "start", off: 0, x: 0, y: 0.8 }, { at: "start", off: 60, x: 0, y: 0.8 }],
    fov: [38, 42],
  };
}

function addShot(list, index) {
  const out = clone(list || []);
  const at = Math.max(-1, Math.min(out.length - 1, index === undefined ? out.length - 1 : index));
  out.splice(at + 1, 0, blankShot(out));
  return out;
}

function duplicateShot(list, index) {
  const out = clone(list || []);
  if (!out.length) return addShot(out, -1);
  const i = Math.max(0, Math.min(out.length - 1, index || 0));
  const copy = clone(out[i]);
  copy.id = uniqueId(out, String(out[i].id || "shot"));
  out.splice(i + 1, 0, copy);
  return out;
}

/** REFUSES TO EMPTY THE LIST. FlybySeq.solve() falls back to DEFAULT when it is
 *  handed an empty array, so an editor that allowed zero shots would show the
 *  shipped sequence while claiming to show the edit — the one state in which
 *  the live preview lies about what it is previewing. */
function deleteShot(list, index) {
  if (!list || list.length <= 1) return clone(list || []);
  const out = clone(list);
  out.splice(Math.max(0, Math.min(out.length - 1, index || 0)), 1);
  return out;
}

function moveShot(list, index, delta) {
  const out = clone(list || []);
  const from = index | 0, to = from + (delta | 0);
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  out.splice(to, 0, out.splice(from, 1)[0]);
  return out;
}

/** Rescale durations to sum to exactly 1. The solver normalises internally, so
 *  this changes no framing — it makes the numbers in the copied blob mean what
 *  they look like they mean, which is what bake-flyby.mjs then checks. */
function normaliseDurs(list) {
  const out = clone(list || []);
  if (!out.length) return out;
  let sum = 0;
  for (const s of out) sum += (typeof s.dur === "number" && isFinite(s.dur) && s.dur > 0) ? s.dur : 0;
  if (!(sum > 0)) { for (const s of out) s.dur = +(1 / out.length).toFixed(6); return out; }
  for (const s of out) {
    const d = (typeof s.dur === "number" && isFinite(s.dur) && s.dur > 0) ? s.dur : 0;
    s.dur = +(d / sum).toFixed(6);
  }
  return out;
}

/** Every reason FlybySeq.solve() could not PLAY this list. Empty == good.
 *  Split out of validateShots because a SAVED list is read back through this
 *  half only: solve() normalises by the durations' own total, so a list nobody
 *  pressed NORMALISE on still plays exactly as the editor previewed it. Holding
 *  a saved list to the bake step's sum rule would throw away the edit and fall
 *  back to the shipped sequence — which is the defect this file just fixed. */
function shotErrors(list) {
  const bad = [];
  if (!Array.isArray(list) || !list.length) return ["the shot list must be a non-empty array"];
  list.forEach((s, i) => {
    const at = "shot " + i + " (" + ((s && s.id) || "?") + ")";
    if (!s || typeof s !== "object" || Array.isArray(s)) { bad.push(at + " is not an object"); return; }
    if (typeof s.id !== "string" || !s.id) bad.push(at + " has no string id");
    if (typeof s.dur !== "number" || !isFinite(s.dur) || s.dur <= 0) bad.push(at + " has no finite positive dur");
    if (EASES.indexOf(s.ease) === -1) bad.push(at + " ease must be one of " + EASES.join(", "));
    for (const k of ["eye", "look"]) {
      if (!Array.isArray(s[k]) || s[k].length !== 2) { bad.push(at + " " + k + " must be a [from, to] pair"); continue; }
      s[k].forEach((p, j) => {
        if (!p || typeof p !== "object") { bad.push(at + " " + k + "[" + j + "] is not a pose"); return; }
        if (AT_KINDS.indexOf(p.at) === -1) bad.push(at + " " + k + "[" + j + "] has unknown at: " + JSON.stringify(p.at));
      });
    }
    if (!Array.isArray(s.fov) || s.fov.length !== 2 ||
        !s.fov.every((n) => typeof n === "number" && isFinite(n))) bad.push(at + " fov must be [from, to] numbers");
  });
  return bad;
}

/** Every reason this list would not BAKE. shotErrors plus the one rule the
 *  solver does not need but tools/gen/bake-flyby.mjs enforces, stated here so
 *  the panel can refuse to copy a blob the bake step would reject an hour later. */
function validateShots(list) {
  const bad = shotErrors(list);
  if (bad.length) return bad;
  let sum = 0;
  for (const s of list) sum += s.dur;
  if (Math.abs(sum - 1) > 0.01) bad.push("durations sum to " + sum.toFixed(4) + ", not 1 — press NORMALISE");
  return bad;
}

/** The copyable blob. NAMED `FlybyShots` ON PURPOSE: bake-flyby.mjs refuses any
 *  other name, so a half-list pasted from somewhere else cannot silently
 *  replace the shipped DEFAULT (the interlock the lighting tuner learned). */
function toBlob(list) {
  const body = (list || []).map((s) => {
    const pose = (p) => JSON.stringify(p);
    return "  {\n" +
      "    id: " + JSON.stringify(s.id) + ", dur: " + s.dur + ", ease: " + JSON.stringify(s.ease) + ",\n" +
      "    eye: [" + pose(s.eye[0]) + ",\n          " + pose(s.eye[1]) + "],\n" +
      "    look: [" + pose(s.look[0]) + ",\n           " + pose(s.look[1]) + "],\n" +
      "    fov: [" + s.fov[0] + ", " + s.fov[1] + "],\n" +
      "  }";
  }).join(",\n");
  return "window.FlybyShots = [\n" + body + "\n];";
}

/* THE SAVED LIST CARRIES THE MEANING IT WAS AUTHORED IN. apex26.flybyShots was
 * first written as a bare array while a `centre`/`landmark` bear was a WORLD
 * bearing and a corner's +x was its right. Both became relative (bear 0 = the
 * track side, +x = the corner's outside), and a bare array is structurally
 * identical under either meaning — so an old edit would have loaded clean and
 * played every such shot from the other side. No migration is possible: the
 * new value depends on each circuit's geometry, and one list serves them all.
 * So a list is saved as { v, shots }, and anything that is not the current
 * version is ignored (not deleted: the player's next edit overwrites it). Bump
 * SHOTS_VERSION whenever a pose field changes what it means. */
const SHOTS_VERSION = 2;
function savedForm(list) { return { v: SHOTS_VERSION, shots: list }; }
/** The list inside a saved value, or null when it is from another version. */
function fromSaved(saved) {
  return (saved && !Array.isArray(saved) && saved.v === SHOTS_VERSION) ? saved.shots : null;
}

const ops = {
  EASES, AT_KINDS, POSE_FIELDS, FIELD, SLOTS, CORNER_NS, RANKS, SHOTS_VERSION, DUR,
  clone, poseFields, fieldLabel, switchPoseAt, uniqueId, blankShot, savedForm, fromSaved,
  addShot, duplicateShot, deleteShot, moveShot, normaliseDurs, shotErrors, validateShots, toBlob,
};

// ---- the panel ------------------------------------------------------------

let _refresh = null;

function create(G) {
Log.info("game", "FlybyPanel.create");
const { $, els, store } = G;

// The edited list. Seeded from the SAVED list, or the shipped DEFAULT, and kept
// across opens so closing the panel to look at the scene does not lose an
// afternoon of framing.
let shots = null;
let sel = 0;
let u = 0;

function defaults() {
  return (typeof FlybySeq === "undefined") ? [] : clone(FlybySeq.DEFAULT);
}

/* THE EDITS ARE SAVED, AND THAT IS THE POINT OF THE PANEL.
 *
 * Reported: "once I hit DONE in the editor it doesn't actually change the start
 * shots." It did not. DONE only closed the sheet; the list lived in this
 * closure, and js/game.js called FlybySeq.solve(track, progress) with NO third
 * argument, so the pre-race flyby always played the shipped DEFAULT however long
 * the author spent framing it. The preview was honest and everything after it
 * was discarded.
 *
 * The list is now the same kind of thing the lighting tuner's profiles are: a
 * saved edit under apex26., written on every change so DONE, ESCAPE and QUIT all
 * keep it, and read back by game.js when a run starts. COPY VALUES is still how
 * an edit becomes the SHIPPED default for everyone — this is one player's.
 *
 * NULL MEANS "THE SHIPPED SEQUENCE", never a copy of it: storing the default
 * would pin this player to today's shots and silently ignore every later change
 * to them. RESET therefore needs no special case — it restores the default, the
 * comparison below sees no edit, and the key clears itself. */
function persist() {
  const list = shots || [];
  const pristine = !list.length || JSON.stringify(list) === JSON.stringify(defaults());
  try { store.set("flybyShots", pristine ? null : savedForm(list)); }
  catch (e) { Log.warn("game", "flyby shots did not save", e); }
}

/** The saved list, or null. Held to shotErrors() and not validateShots(): the
 *  solver normalises by the durations' own total, so a list nobody pressed
 *  NORMALISE on plays exactly as previewed and must not be thrown away.
 *  A COPY: store.get() hands out its cache object, and the panel edits its list
 *  in place — sharing it made game.js's flybyShots move under every slider. */
function loadSaved() {
  let saved = null;
  try { saved = store.get("flybyShots", null); } catch (_) { return null; }
  if (!saved) return null;
  const list = fromSaved(saved);
  if (!list) { Log.warn("game", "saved flyby shots predate the current pose meaning — playing the shipped sequence"); return null; }
  const bad = shotErrors(list);
  if (bad.length) { Log.warn("game", "saved flyby shots unusable: " + bad[0]); return null; }
  return clone(list);
}

function ensure() { if (!shots) shots = loadSaved() || defaults(); return shots; }

/** Cumulative bounds of shot `i` as fractions of the whole run — the same
 *  arithmetic FlybySeq.solve() does, so a scrub position and a shot chip agree. */
function span(i) {
  const list = ensure();
  let total = 0;
  for (const s of list) total += s.dur || 0;
  if (!(total > 0)) total = 1;
  let acc = 0;
  for (let k = 0; k < i && k < list.length; k++) acc += list[k].dur || 0;
  return { from: acc / total, to: (acc + ((list[i] && list[i].dur) || 0)) / total };
}
function midOf(i) { const s = span(i); return (s.from + s.to) / 2; }

function cur() { const list = ensure(); return list[Math.max(0, Math.min(list.length - 1, sel))]; }
function poseOf(slot) { const s = cur(); return s && s[slot.arr] && s[slot.arr][slot.i]; }

function fmt(d, v) {
  const dec = (String(d.step).split(".")[1] || "").length;
  return (+v).toFixed(Math.min(dec, 3)) + (d.unit || "");
}

// ---- live preview ---------------------------------------------------------

/* THE PREVIEW IS THE WHOLE POINT, and it is one call: FlybySeq solves the
   edited list directly, so nothing here has to reimplement a pose.

   __apex IS NULL, NOT UNDEFINED, ON A PLAYER BOOT. js/game.js declares
   `window.__apex = null` and only fills it after a lazy inject that a Pages
   build never performs (wantAgentSurface() is false there by design). A
   `typeof === "undefined"` test passes for null, so the next term dereferenced
   it and the panel threw `null is not an object` on the live site the moment
   anyone scrubbed. The typeof is still needed — the node tests exercise this
   file with no such global declared at all — but it cannot be the whole guard. */
function apiReady() {
  return typeof __apex !== "undefined" && !!__apex && !!__apex.flybyCam;
}

/** The list the PREVIEW flies: a copy, re-taken whenever the edited list's
 *  CONTENTS change. FlybySeq caches plans and corner bindings per shot/list
 *  object, and the sliders edit this panel's list in place — so passing it
 *  directly previewed the first plan forever (a corner shot's x/y/off/corner
 *  did nothing after the first frame). A scrub with no edit reuses the copy. */
let playKey = "", playList = null;
function playable() {
  const key = JSON.stringify(ensure());
  if (key !== playKey || !playList) { playKey = key; playList = clone(ensure()); }
  return playList;
}
function preview() {
  if (!apiReady()) { askApi(); status(null, "preview unavailable — loading the dev API…"); return; }
  let r = null;
  try { r = __apex.flybyCam(u, playable()); } catch (e) { status(null, "preview failed: " + (e && e.message)); return; }
  if (!r) { status(null, "no track built yet — start a race, then pause"); return; }
  if (r.index !== sel) { sel = r.index; refreshChips(); refreshRows(); }
  status(r, "");
}

/** The one line that tells an author whether the shot is good: which shot, how
 *  high the eye ended up, what lens — and whether the eye is INSIDE something,
 *  which is the defect the whole sequencer exists to prevent and the one thing
 *  a still frame cannot show you. */
function status(r, note) {
  const host = $("fb-status"); if (!host) return;
  if (!r) { host.textContent = note || ""; host.classList.remove("fb-inside"); return; }
  // A shot down the ROAD is judged the way tests/unit/flyby-shots.test.mjs
  // judges it: the props' axis-aligned boxes of an angled grandstand cross the
  // straight (Bahrain), so `inside` there is not a defect — being off the road is.
  const offRoad = !!r.onRoad && !(Math.abs(r.lat) <= 12);
  const bad = r.onRoad ? offRoad : !!r.inside;
  const verdict = r.onRoad
    ? (offRoad ? "  ·  ON-ROAD SHOT " + (r.lat == null ? "OFF THE TRACK" : Math.abs(r.lat).toFixed(1) + " m OFF THE ROAD") + " — move this eye"
      : "  ·  clear (on road)")
    : r.inside ? "  ·  INSIDE A " + String(r.inside.kind).toUpperCase() + " — move this eye"
      : "  ·  clear";
  // The clearance's rescue, made visible: a shot authored beside a building
  // lifts a metre or two, one authored inside a grandstand lifts twenty.
  const lift = r.lift > 0.05 ? "  ·  lifted " + r.lift.toFixed(1) + " m" : "";
  host.textContent = "u " + r.u.toFixed(3) + "  ·  " + r.shot + " [" + r.index + "]" +
    "  ·  eye " + r.eye.join(", ") + "  ·  fov " + r.fov + lift + verdict;
  host.classList.toggle("fb-inside", bad);
}

// ---- rows -----------------------------------------------------------------

/** Rename a numberRow in place: the label's text node and the input's aria-label. */
function relabel(id, label) {
  const row = $("fb-row-" + id), inp = $("fb-in-" + id);
  const span = row && row.querySelector(".tune-label");
  if (span && span.firstChild && span.firstChild.nodeType === 3) span.firstChild.nodeValue = label + " ";
  if (inp) inp.setAttribute("aria-label", label);
}

function numberRow(host, id, label, d, onInput) {
  const item = document.createElement("div");
  item.className = "adv-item"; item.id = "fb-row-" + id;
  const lab = document.createElement("label"); lab.className = "tune-row";
  const span = document.createElement("span"); span.className = "tune-label";
  span.textContent = label + " ";
  const b = document.createElement("b"); b.id = "fb-v-" + id;
  span.appendChild(b);
  const inp = document.createElement("input");
  inp.type = "range"; inp.min = d.min; inp.max = d.max; inp.step = d.step;
  inp.id = "fb-in-" + id;
  inp.setAttribute("aria-label", label);
  inp.oninput = () => onInput(parseFloat(inp.value));
  lab.appendChild(span); lab.appendChild(inp);
  item.appendChild(lab);
  host.appendChild(item);
  return item;
}

function selectRow(host, id, label, values, onChange) {
  const item = document.createElement("div");
  item.className = "adv-item"; item.id = "fb-row-" + id;
  const lab = document.createElement("label"); lab.className = "tune-row";
  const span = document.createElement("span"); span.className = "tune-label";
  span.textContent = label;
  const s = document.createElement("select");
  s.id = "fb-in-" + id;
  s.setAttribute("aria-label", label);
  for (const v of values) {
    const o = document.createElement("option");
    o.value = String(v); o.textContent = String(v).toUpperCase();
    s.appendChild(o);
  }
  s.onchange = () => onChange(s.value);
  lab.appendChild(span); lab.appendChild(s);
  item.appendChild(lab);
  host.appendChild(item);
  return item;
}

function edited() { persist(); refreshChips(); refreshRows(); preview(); }

// ---- the TRACK CARD and the ANNOUNCER -------------------------------------
//
// Both belong to the loading screen (js/ui/loading-screen.js), which is the
// screen these shots are framed for — and neither can be authored anywhere
// else. The card's size and position are a judgement about THIS sequence's
// framing ("the card sits over the pit straight in shot 3"), and the screen
// only exists for the 24 s between RACE! and the grid. So the editor holds the
// real card up over the live scene while the sliders move.
//
// The loading screen owns the numbers and the clamping; this file owns the
// rows. Nothing here duplicates a range — LoadingScreen.CARD is the registry,
// the same way FIELD above is the registry for a pose.
//
// READ THROUGH FUNCTIONS, not captured at eval. A `const CARD = LoadingScreen.CARD`
// at module scope would be a load-order edge between two files that have no
// other relationship, and it would fail SOFTLY — an empty table builds an empty
// group, which looks like "the feature is not there yet" rather than a bug.
const cardDefs = () => (typeof LoadingScreen !== "undefined" && LoadingScreen.CARD) || {};
const cardKeys = () => (typeof LoadingScreen !== "undefined" && LoadingScreen.CARD_KEYS) || [];

/** The loading card, or null where game.js has not handed one over (the node
 *  suites drive this file with a stub G). Every card call goes through it. */
function cardHost() {
  const ls = G.loadingScreen;
  return ls && typeof ls.setCard === "function" ? ls : null;
}
/** The circuit the card would describe. One object, built by game.js, so the
 *  preview is the real card and not a second description of the same race. */
function cardInfo() {
  try { return typeof G.loadingInfo === "function" ? G.loadingInfo() : null; } catch (_) { return null; }
}

/** Put the real card on screen, or take it down. `hold` is a phase of its own —
 *  click-through and unscrimmed — so the panel keeps its clicks and the scene
 *  the card is being framed against stays visible behind it. */
function showCard(on) {
  const ls = cardHost(); if (!ls) return;
  if (!on) { ls.stop(); return; }
  const info = cardInfo();
  if (info) { try { ls.hold(info); } catch (e) { Log.warn("game", "card preview failed", e); } }
}

function buildCardRows(host) {
  const ls = cardHost();
  const defs = cardDefs(), keys = cardKeys();
  if (!ls || !keys.length) return;
  const head = document.createElement("h3");
  head.textContent = "TRACK CARD"; head.className = "fb-group";
  host.appendChild(head);
  for (const k of keys) {
    numberRow(host, "card-" + k, defs[k].label, defs[k], (v) => {
      // The SLIDER is not the truth — the clamp is. setCard() hands back what
      // actually took, and writing that straight back into the rows is what
      // keeps a dragged thumb from reading 1.8 on a card that stopped at 1.6.
      refreshCard(ls.setCard({ [k]: v }));
    });
    // The size and position are CSS custom properties and follow the thumb for
    // free. The lap outline does NOT: it is a raster sized once, at the scale
    // the card had when it was painted, so a card dragged from 1.0 to 1.6 shows
    // a stretched map until something repaints it. On `change`, not `input` — a
    // full centreline redraw per pixel of thumb travel is not free.
    const inp = $("fb-in-card-" + k);
    if (inp) inp.onchange = () => showCard(true);
  }
  const item = document.createElement("div");
  item.className = "adv-item";
  const btn = document.createElement("button");
  btn.type = "button"; btn.id = "fb-card-reset";
  btn.textContent = "RESET CARD";
  btn.title = "Put the track card back at its shipped size and position. Leaves the shots alone.";
  btn.onclick = () => { refreshCard(ls.resetCard()); showCard(true); };
  item.appendChild(btn);
  host.appendChild(item);
}

/** Write a geometry into the three sliders. */
function refreshCard(geom) {
  const defs = cardDefs();
  const g = geom || (cardHost() && cardHost().card()) || null;
  if (!g) return;
  for (const k of cardKeys()) if (typeof g[k] === "number") setNum("card-" + k, defs[k], g[k]);
}

/* THE ANNOUNCER'S SCRIPT, SHOWN AS TEXT. It is DERIVED from the circuit
 * (js/audio/announcer.js), so the only way to know what a given track gets is
 * to ask — and an author re-framing a 24 s flyby needs to know whether the
 * voice fills it or stops at second nine. Printing the lines is also the one
 * review surface for the copy: a wrong clause is obvious written down and easy
 * to miss spoken over a helicopter shot. */
function annHost() {
  const a = G.announcer;
  return a && typeof a.scriptFor === "function" ? a : null;
}

function buildAnnRows(host) {
  const a = annHost(); if (!a) return;
  const head = document.createElement("h3");
  head.textContent = "ANNOUNCER"; head.className = "fb-group";
  host.appendChild(head);
  const item = document.createElement("div");
  item.className = "adv-item";
  const text = document.createElement("p");
  text.id = "fb-ann-script"; text.className = "as-note";
  const ops = document.createElement("div");
  ops.className = "balanced-row";
  const play = document.createElement("button");
  play.type = "button"; play.id = "fb-ann-play"; play.textContent = "PLAY";
  play.title = "Read the script aloud, at the voice, pitch and rate set in SETTINGS → AUDIO.";
  // RE-RESOLVED IN THE HANDLER, not the `a` captured above: `announcer` in
  // js/game.js is a `let` that starts at Announcer.inert(), and a captured
  // inert one would fail silently — preview() returning false is
  // indistinguishable from "master sound is off", which is what this very
  // button would then report.
  play.onclick = () => {
    const live = annHost(), info = cardInfo();
    // preview() ignores the player's ANNOUNCER switch — pressing PLAY in an
    // authoring panel IS the consent — but not master SOUND, which means
    // silence. Say which of the two refused rather than doing nothing.
    if (!live || !info || !live.preview(info)) {
      flash(play, live && live.available() ? "SOUND OFF" : "NO VOICES");
    }
  };
  const stop = document.createElement("button");
  stop.type = "button"; stop.id = "fb-ann-stop"; stop.textContent = "STOP";
  stop.onclick = () => { const live = annHost(); if (live) live.stop(); };
  ops.append(play, stop);
  item.append(text, ops);
  host.appendChild(item);
}

/** Re-derive the script for whatever circuit is loaded now. */
function refreshAnn() {
  const a = annHost(), el = $("fb-ann-script");
  if (!a || !el) return;
  const info = cardInfo();
  let lines = [];
  try { lines = info ? a.scriptFor(info) : []; } catch (_) { lines = []; }
  el.textContent = lines.length ? lines.join(" ") : "No circuit loaded — start a race, then pause.";
}

function buildRows() {
  const host = $("fb-rows");
  if (host.dataset.built) return;
  host.dataset.built = "1";

  // ---- the track card ----
  buildCardRows(host);

  // ---- the shot itself ----
  const head = document.createElement("h3");
  head.textContent = "SHOT"; head.className = "fb-group";
  host.appendChild(head);
  numberRow(host, "dur", "DURATION (share of the run)", DUR, (v) => { cur().dur = v; edited(); });
  selectRow(host, "ease", "EASING", EASES, (v) => { cur().ease = v; edited(); });
  numberRow(host, "fov0", "FOV FROM", FOV, (v) => { cur().fov[0] = v; edited(); });
  numberRow(host, "fov1", "FOV TO", FOV, (v) => { cur().fov[1] = v; edited(); });

  // ---- the announcer ----
  buildAnnRows(host);

  // ---- the four poses ----
  for (const slot of SLOTS) {
    const h = document.createElement("h3");
    h.textContent = slot.label; h.className = "fb-group";
    host.appendChild(h);
    selectRow(host, slot.key + "-at", slot.label + " ANCHOR", AT_KINDS, (v) => {
      const s = cur();
      s[slot.arr][slot.i] = switchPoseAt(poseOf(slot), v);
      edited();
    });
    selectRow(host, slot.key + "-n", slot.label + " CORNER", CORNER_NS, (v) => {
      const p = poseOf(slot);
      p.n = /^\d+$/.test(v) ? parseInt(v, 10) : v;
      edited();
    });
    selectRow(host, slot.key + "-rank", slot.label + " LANDMARK", RANKS, (v) => {
      poseOf(slot).rank = parseInt(v, 10) || 0;
      edited();
    });
    for (const f of FIELD_IDS) {
      numberRow(host, slot.key + "-" + f, slot.label + " " + FIELD[f].label, FIELD[f], (v) => {
        poseOf(slot)[f] = v;
        edited();
      });
    }
  }
}

function refreshChips() {
  const host = $("fb-shots"); if (!host) return;
  const list = ensure();
  // Rebuilt rather than patched: the chips ARE the list, and add / delete /
  // reorder all change its length. A diffing pass here would be three more
  // states to get wrong for no measurable gain on a list of eight.
  host.textContent = "";
  list.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "lt-tab"; b.id = "fb-tab-" + i;
    // THE NUMBER ONLY. "1. landmark1" is one unbreakable word in a pill that is
    // a rail-width eighth, so eight chips wrapped to four lines each and the
    // block ate ~100 px of a docked panel whose height is the viewport's — at
    // 960x540 that pushed this shot's own controls under the footer. The id is
    // not lost: it is on the chip's title, in the status line above, and in the
    // SHOT heading of the rows below.
    b.textContent = String(i + 1);
    b.title = (s.id || ("shot " + (i + 1))) + " — " + (s.dur || 0).toFixed(3) + " of the run";
    b.setAttribute("aria-label", "Shot " + (i + 1) + ": " + (s.id || i));
    b.setAttribute("role", "tab");
    b.setAttribute("aria-controls", "fb-rows");
    b.setAttribute("aria-selected", i === sel ? "true" : "false");
    b.classList.toggle("active", i === sel);
    b.tabIndex = i === sel ? 0 : -1;
    b.onclick = () => { sel = i; setU(midOf(i)); refreshChips(); refreshRows(); preview(); };
    b.onkeydown = (e) => chipKey(i, e);
    host.appendChild(b);
  });
  const prof = $("fb-profile");
  if (prof) {
    let sum = 0;
    for (const s of list) sum += (s.dur || 0);
    prof.textContent = list.length + " shots  ·  durations sum " + sum.toFixed(3) +
      (Math.abs(sum - 1) > 0.01 ? "  (press NORMALISE)" : "");
  }
}

function chipKey(i, e) {
  const list = ensure();
  let next = null;
  if (e.key === "ArrowRight") next = (i + 1) % list.length;
  else if (e.key === "ArrowLeft") next = (i - 1 + list.length) % list.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = list.length - 1;
  if (next == null) return;
  e.preventDefault(); e.stopPropagation();
  sel = next; setU(midOf(next)); refreshChips(); refreshRows(); preview();
  const el = $("fb-tab-" + next); if (el && el.focus) el.focus();
}

function show(id, on) {
  const row = $("fb-row-" + id);
  if (row) row.style.display = on ? "" : "none";
}
function setNum(id, d, v) {
  const inp = $("fb-in-" + id), b = $("fb-v-" + id);
  if (inp) inp.value = v;
  if (b) b.textContent = fmt(d, v);
}

function refreshRows() {
  const host = $("fb-rows");
  if (!host.dataset.built) return;
  const s = cur();
  if (!s) return;
  setNum("dur", DUR, s.dur);
  setNum("fov0", FOV, s.fov[0]);
  setNum("fov1", FOV, s.fov[1]);
  // #fb-in-ease is BUILT by selectRow() above, not declared in index.html, so it
  // is listed in RUNTIME_IDS (tools/check/shell-ids.mjs) with that reason — and
  // the read is null-guarded, like every other entry there.
  const ease = $("fb-in-ease"); if (ease) ease.value = s.ease;
  for (const slot of SLOTS) {
    const p = poseOf(slot) || {};
    const at = $("fb-in-" + slot.key + "-at"); if (at) at.value = p.at || "start";
    show(slot.key + "-n", p.at === "corner");
    show(slot.key + "-rank", p.at === "landmark");
    const n = $("fb-in-" + slot.key + "-n"); if (n) n.value = String(p.n === undefined ? "first" : p.n);
    const rank = $("fb-in-" + slot.key + "-rank"); if (rank) rank.value = String(p.rank || 0);
    const fields = poseFields(p);
    for (const f of FIELD_IDS) {
      const on = fields.indexOf(f) !== -1;
      show(slot.key + "-" + f, on);
      if (on && f === "y") relabel(slot.key + "-y", slot.label + " " + fieldLabel(p.at, "y"));
      if (on) setNum(slot.key + "-" + f, FIELD[f], typeof p[f] === "number" ? p[f] : FIELD[f].def);
    }
  }
}

function setU(v) {
  u = Math.max(0, Math.min(1, v));
  const inp = $("fb-u"); if (inp) inp.value = Math.round(u * 1000);
  const lab = $("fb-u-val"); if (lab) lab.textContent = u.toFixed(3);
}

// ---- open / close ---------------------------------------------------------

function isOpen() { return !$("flyby").hidden; }

/* game.js's memoised loadAgentSurface, handed in after its boot chain — the
   same deal js/perf/metrics-overlay.js has, and for the same reason: this panel
   reads everything it previews through __apex, which a Pages build does not
   fetch. Asking here rather than widening the boot gate keeps a player who
   never opens the editor downloading nothing. Asked ONCE: a refused or failed
   inject leaves the panel degraded with a message, never a retry loop. */
let _apiLoad = null, _apiAsked = false;
function setApiLoader(fn) {
  _apiLoad = typeof fn === "function" ? fn : null;
  if (_apiLoad && isOpen()) askApi();
}
function askApi() {
  if (_apiAsked || !_apiLoad || apiReady()) return;
  _apiAsked = true;
  Promise.resolve(_apiLoad()).then(() => { if (isOpen()) { preview(); refreshRows(); } })
    .catch((e) => { status(null, "the dev API did not load — preview unavailable"); Log.warn("game", "flyby panel: agent surface failed", e); });
}

function openFlyby() {
  Log.info("game", "FlybyPanel.open");
  askApi();
  ensure();
  buildRows();
  sel = Math.max(0, Math.min(ensure().length - 1, sel));
  setU(midOf(sel));
  $("flyby").hidden = false;
  $("fb-json").hidden = true;
  document.body.classList.add("lt-open");    // same dock as the other two tuners
  refreshCard(null);
  refreshAnn();
  showCard(true);
  els.pmsettings.hidden = true;
  // Nested under DISPLAY -> ADVANCED VISUALS: hide that page too, or its own
  // .hidden survives underneath and reappears the moment pmsettings does.
  const displayPage = $("pm-panel-display");
  if (displayPage) displayPage.hidden = true;
  refreshChips(); refreshRows(); preview();
}

function closeFlyby(showPauseMenu) {
  // Resume and QUIT call this blind, the way they call the other two tuners'
  // closers. Releasing the camera below is a real side effect, so a panel that
  // was never open stops here rather than snapping a camera nobody parked.
  if (!isOpen()) return;
  Log.info("game", "FlybyPanel.close");
  $("flyby").hidden = true;
  document.body.classList.remove("lt-open");
  // The held card and any half-spoken script go with the panel. Both outlive it
  // otherwise: the card is a plain hidden=false div, and speechSynthesis has no
  // owner at all — closing the editor mid-sentence would leave the voice
  // reading a circuit description over the pause menu.
  showCard(false);
  { const a = annHost(); if (a) a.stop(); }
  // The preview parks the camera through dbgCam; leaving it parked would hand
  // the player back a frozen flyby camera instead of their own car.
  // view("chase") is the release, for two reasons that both matter here.
  // __apex.freeCam did not exist then (it is the FREE CAMERA panel's hook now,
  // not a release) — the guard reading it was always false, so
  // NOTHING was unparking the camera and closing the panel left the player
  // looking through the last previewed frame. And snapCam(), the other
  // documented clear, returns early when there is no G.player — which is
  // exactly the case this panel is most used in, the menu. view("chase") only
  // needs a track, clears dbgCam outright, and does not change the player's
  // chosen camera MODE the way camera() would.
  if (typeof __apex !== "undefined" && __apex && __apex.view) {
    try { __apex.view("chase"); } catch (_) { /* no track built — nothing parked */ }
  }
  if (showPauseMenu && G.paused) {
    els.pmsettings.hidden = false;   // back to the settings menu
    const displayPage = $("pm-panel-display");
    if (displayPage) displayPage.hidden = false;   // ...specifically its DISPLAY page
  }
}

// ---- wiring ---------------------------------------------------------------

/** Say something on the button itself, then put the button BACK. The label is
 *  read from the button rather than passed in: the caller passing a literal was
 *  a second copy of the markup's text, and it went stale the moment the labels
 *  were shortened to fit the ops row on one line — a refused DELETE would have
 *  restored "DELETE", which is wide enough to wrap the row it was shortened to
 *  fit. Re-entrant calls keep the first captured label, not the message. */
function flash(btn, msg) {
  if (!btn._fbLabel) btn._fbLabel = btn.textContent;
  btn.textContent = msg;
  clearTimeout(btn._fbT);
  btn._fbT = setTimeout(() => { btn.textContent = btn._fbLabel; btn._fbLabel = ""; }, 1800);
}

$("pm-flyby").onclick = openFlyby;
$("fb-close").onclick = () => closeFlyby(true);
$("fb-u").oninput = () => { setU(parseFloat($("fb-u").value) / 1000); preview(); };
$("fb-add").onclick = () => { shots = addShot(ensure(), sel); sel += 1; setU(midOf(sel)); edited(); };
$("fb-dup").onclick = () => { shots = duplicateShot(ensure(), sel); sel += 1; setU(midOf(sel)); edited(); };
$("fb-del").onclick = () => {
  const before = ensure().length;
  shots = deleteShot(ensure(), sel);
  if (shots.length === before) { flash($("fb-del"), "NEED ONE"); return; }
  sel = Math.max(0, Math.min(shots.length - 1, sel)); setU(midOf(sel)); edited();
};
$("fb-up").onclick = () => {
  if (sel <= 0) return;
  shots = moveShot(ensure(), sel, -1); sel -= 1; setU(midOf(sel)); edited();
};
$("fb-down").onclick = () => {
  if (sel >= ensure().length - 1) return;
  shots = moveShot(ensure(), sel, 1); sel += 1; setU(midOf(sel)); edited();
};
$("fb-norm").onclick = () => { shots = normaliseDurs(ensure()); edited(); };
$("fb-reset").onclick = () => { shots = defaults(); sel = 0; setU(midOf(0)); $("fb-json").hidden = true; edited(); };

/* COPY VALUES — preferSync so execCommand runs during the gesture
   (same order as the lighting tuner; ui-improve-pass pins it). */
$("fb-copy").onclick = () => {
  const btn = $("fb-copy");
  const list = ensure();
  const bad = validateShots(list);
  const json = (bad.length ? "// THIS LIST WILL NOT BAKE:\n// " + bad.join("\n// ") + "\n" : "") + toBlob(list);
  const ta = $("fb-json");
  ta.value = json; ta.hidden = false;
  ta.focus(); if (ta.setSelectionRange) ta.setSelectionRange(0, json.length);
  ApexClipboard.write(json, { preferSync: true }).then((ok) => flash(btn,
    bad.length ? "COPIED (INVALID)" : (ok ? "COPIED ✓" : "SELECT & COPY ↑")));
};

_refresh = () => { if (isOpen()) { refreshChips(); refreshRows(); } };
return { openFlyby, closeFlyby, isOpen, setApiLoader, loadSaved, list: () => clone(ensure()) };
}

return Object.assign({ create, refresh: () => { if (_refresh) _refresh(); } }, ops);
})();
Object.freeze(FlybyPanel);
