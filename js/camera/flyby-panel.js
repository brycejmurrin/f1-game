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
const AT_KINDS = ["start", "pole", "grid", "corner", "centre", "landmark"];
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
  corner: ["off", "x", "y"],
  centre: ["bear", "distR", "yR", "y"],
  landmark: ["bear", "distK", "yK", "y"],
};
const FIELD = {
  off: { label: "ARC OFFSET", min: -400, max: 400, step: 1, unit: " m", def: 0 },
  x: { label: "LATERAL", min: -60, max: 60, step: 0.5, unit: " m", def: 0 },
  y: { label: "HEIGHT", min: -5, max: 200, step: 0.05, unit: " m", def: 5 },
  bear: { label: "BEARING", min: -3.15, max: 3.15, step: 0.01, unit: " rad", def: 0 },
  distR: { label: "DISTANCE (LAP RADII)", min: 0, max: 3, step: 0.01, unit: "", def: 1.2 },
  yR: { label: "HEIGHT (LAP RADII)", min: 0, max: 1.5, step: 0.01, unit: "", def: 0.4 },
  distK: { label: "DISTANCE (LANDMARK SIZES)", min: 0, max: 6, step: 0.05, unit: "", def: 1.8 },
  yK: { label: "HEIGHT (LANDMARK HEIGHTS)", min: -1, max: 3, step: 0.05, unit: "", def: 0.4 },
};
const FIELD_IDS = Object.keys(FIELD);
// `rank` is a landmark index and `n` a corner, and neither is a continuous
// quantity — both are pickers, and both live outside FIELD for that reason.
const RANKS = [0, 1, 2, 3, 4, 5];
const CORNER_NS = ["first", "mid", "late", "1", "2", "3", "4", "5", "6", "8", "10", "12", "14", "16", "18"];

const DUR = { min: 0.01, max: 0.6, step: 0.005, unit: "" };
const FOV = { min: 15, max: 90, step: 0.5, unit: "°" };

// ---- pure list operations -------------------------------------------------
//
// Everything below this line is data in, data out: no DOM, no globals, no
// FlybySeq. That is deliberate — it is the half a node test can hold, and
// tests/unit/flyby-panel.test.mjs holds it.

function clone(v) { return JSON.parse(JSON.stringify(v)); }

/** The fields this pose's anchor reads, in row order. */
function poseFields(pose) { return POSE_FIELDS[pose && pose.at] || POSE_FIELDS.start; }

/** Re-anchor a pose, KEEPING whatever the new anchor can still use. Switching
 *  `corner` -> `centre` has no sensible arc offset to carry, but a height does,
 *  and dropping it silently would reset an author's framing on every mis-click. */
function switchPoseAt(pose, at) {
  if (AT_KINDS.indexOf(at) === -1) return clone(pose);
  const next = { at: at };
  if (at === "corner") next.n = (pose && pose.n !== undefined) ? pose.n : "first";
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

/** Every reason this list would not bake, as plain sentences. Empty == good.
 *  The same rules tools/gen/bake-flyby.mjs enforces, stated here so the panel
 *  can refuse to copy a blob the bake step would reject an hour later. */
function validateShots(list) {
  const bad = [];
  if (!Array.isArray(list) || !list.length) return ["the shot list must be a non-empty array"];
  let sum = 0;
  list.forEach((s, i) => {
    const at = "shot " + i + " (" + ((s && s.id) || "?") + ")";
    if (!s || typeof s !== "object" || Array.isArray(s)) { bad.push(at + " is not an object"); return; }
    if (typeof s.id !== "string" || !s.id) bad.push(at + " has no string id");
    if (typeof s.dur !== "number" || !isFinite(s.dur) || s.dur <= 0) bad.push(at + " has no finite positive dur");
    else sum += s.dur;
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
  if (bad.length) return bad;
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

const ops = {
  EASES, AT_KINDS, POSE_FIELDS, FIELD, SLOTS, CORNER_NS, RANKS,
  clone, poseFields, switchPoseAt, uniqueId, blankShot,
  addShot, duplicateShot, deleteShot, moveShot, normaliseDurs, validateShots, toBlob,
};

// ---- the panel ------------------------------------------------------------

let _refresh = null;

function create(G) {
Log.info("game", "FlybyPanel.create");
const { $, els } = G;

// The edited list. Seeded from the shipped DEFAULT on first open and kept
// across opens, so closing the panel to look at the scene does not lose an
// afternoon of framing.
let shots = null;
let sel = 0;
let u = 0;

function defaults() {
  return (typeof FlybySeq === "undefined") ? [] : clone(FlybySeq.DEFAULT);
}
function ensure() { if (!shots) shots = defaults(); return shots; }

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

function preview() {
  if (!apiReady()) { askApi(); status(null, "preview unavailable — loading the dev API…"); return; }
  let r = null;
  try { r = __apex.flybyCam(u, ensure()); } catch (e) { status(null, "preview failed: " + (e && e.message)); return; }
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
  const inside = r.inside
    ? "  ·  INSIDE A " + String(r.inside.kind).toUpperCase() + " — move this eye"
    : "  ·  clear";
  host.textContent = "u " + r.u.toFixed(3) + "  ·  " + r.shot + " [" + r.index + "]" +
    "  ·  eye " + r.eye.join(", ") + "  ·  fov " + r.fov + inside;
  host.classList.toggle("fb-inside", !!r.inside);
}

// ---- rows -----------------------------------------------------------------

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

function edited() { refreshChips(); refreshRows(); preview(); }

function buildRows() {
  const host = $("fb-rows");
  if (host.dataset.built) return;
  host.dataset.built = "1";

  // ---- the shot itself ----
  const head = document.createElement("h3");
  head.textContent = "SHOT"; head.className = "fb-group";
  host.appendChild(head);
  numberRow(host, "dur", "DURATION (share of the run)", DUR, (v) => { cur().dur = v; edited(); });
  selectRow(host, "ease", "EASING", EASES, (v) => { cur().ease = v; edited(); });
  numberRow(host, "fov0", "FOV FROM", FOV, (v) => { cur().fov[0] = v; edited(); });
  numberRow(host, "fov1", "FOV TO", FOV, (v) => { cur().fov[1] = v; edited(); });

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
  // The preview parks the camera through dbgCam; leaving it parked would hand
  // the player back a frozen flyby camera instead of their own car.
  // view("chase") is the release, for two reasons that both matter here.
  // __apex.freeCam does not exist — the guard reading it was always false, so
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

/* COPY VALUES — the synchronous execCommand attempt goes FIRST.
   The lighting tuner learned this the expensive way: reaching execCommand only
   from the clipboard promise's rejection handler puts the copy a microtask
   after the gesture, which Chromium forgives (transient activation lasts ~5 s)
   and WebKit is documented not to. Ordering it first takes the engine out of
   the question. tests/unit/ui-improve-pass.test.mjs pins that order. */
$("fb-copy").onclick = () => {
  const btn = $("fb-copy");
  const list = ensure();
  const bad = validateShots(list);
  const json = (bad.length ? "// THIS LIST WILL NOT BAKE:\n// " + bad.join("\n// ") + "\n" : "") + toBlob(list);
  const ta = $("fb-json");
  ta.value = json; ta.hidden = false;
  ta.focus(); if (ta.setSelectionRange) ta.setSelectionRange(0, json.length);
  let ok = false;
  try { ok = !!(document.execCommand && document.execCommand("copy")); } catch (_) { /* not available */ }
  const done = (good) => flash(btn,
    bad.length ? "COPIED (INVALID)" : (good ? "COPIED ✓" : "SELECT & COPY ↑"), "COPY VALUES");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(() => done(true), () => done(ok));
    return;
  }
  done(ok);
};

_refresh = () => { if (isOpen()) { refreshChips(); refreshRows(); } };
return { openFlyby, closeFlyby, isOpen, setApiLoader, list: () => clone(ensure()) };
}

return Object.assign({ create, refresh: () => { if (_refresh) _refresh(); } }, ops);
})();
Object.freeze(FlybyPanel);
