const LayoutPresets = (function () {
  "use strict";

  const KEY = "layoutPreset";
  const ROW = "pm-layoutpreset";
  const PAUSE_KNOBS = Object.freeze({
    layout: Object.freeze({ set: "setLayout", read: "layoutMode", list: "LAYOUTS", def: "grid", key: "pauseLayout" }),
    side: Object.freeze({ set: "setSide", read: "sideMode", list: "SIDES", def: "centre", key: "pauseSide" }),
    dim: Object.freeze({ set: "setDim", read: "dimMode", list: "DIMS", def: "full", key: "pauseDim" }),
  });
  const row = (screen, knob, value) => Object.freeze([screen, knob, value]);
  const PRESETS = Object.freeze([
    Object.freeze({ id: "shipped", name: "SHIPPED", note: "Every screen look as it ships. Your main-menu layout stays yours.", set: Object.freeze([]) }),
    Object.freeze({ id: "thumb", name: "THUMB", note: "Two-thumb phone grip: the pause menu is a strip on the right edge, pop-ups and the circuit strip sit low, buttons are taller.",
      set: Object.freeze([
        row("pauseOpts", "layout", "sidebar"), row("pauseOpts", "side", "right"),
        row("popups", "vpos", "bottom"), row("popups", "btn", 150),
        row("select", "strip", "bottom"), row("select", "btn", 150),
        row("race", "btn", 150), row("garage", "btn", 150),
        row("career", "density", "roomy"),
      ]) }),
    Object.freeze({ id: "compact", name: "COMPACT", note: "Denser screens: smaller buttons and tiles, more rows on screen.",
      set: Object.freeze([
        row("pauseOpts", "layout", "compact"), row("pause", "gap", 0),
        row("select", "rows", "2"), row("select", "tile", 70), row("select", "btn", 80),
        row("race", "density", "tight"), row("race", "btn", 80),
        row("popups", "btn", 80), row("garage", "btn", 80),
        row("designer", "profile", "short"),
      ]) }),
    Object.freeze({ id: "big", name: "BIG", note: "Larger buttons and tiles, roomier sheets. TEXT SIZE and UI SIZE stay yours.",
      set: Object.freeze([
        row("pauseOpts", "layout", "list"), row("pause", "btn", 150),
        row("select", "btn", 150), row("select", "tile", 160),
        row("race", "btn", 150),
        row("popups", "btn", 150), row("popups", "density", "roomy"),
        row("garage", "btn", 150), row("garage", "pw", 150),
        row("career", "density", "roomy"),
      ]) }),
  ]);
  const BY_ID = {};
  for (const p of PRESETS) BY_ID[p.id] = p;
  const nameOf = (id) => (id === "custom" ? "CUSTOM" : BY_ID[id] ? BY_ID[id].name : String(id).toUpperCase());

  const PRESENT = {
    GameStore: () => typeof GameStore !== "undefined" && !!GameStore,
    SettingRow: () => typeof SettingRow !== "undefined" && !!SettingRow,
    ScreenLooks: () => typeof ScreenLooks !== "undefined" && !!ScreenLooks,
    PauseOpts: () => typeof PauseOpts !== "undefined" && !!PauseOpts,
    TitleLayout: () => typeof TitleLayout !== "undefined" && !!TitleLayout,
    Log: () => typeof Log !== "undefined" && !!Log,
  };
  const has = (name) => PRESENT[name]();
  const store = () => (has("GameStore") && GameStore.store) || null;
  const doc = typeof document !== "undefined" ? document : null;
  const byId = (id) => (doc ? doc.getElementById(id) : null);
  const warn = (msg) => { if (has("Log")) Log.warn("ui", "LayoutPresets: " + msg); };
  const screens = () => (has("ScreenLooks") && ScreenLooks.SCREENS) || [];
  const lookOf = (id) => { for (const s of screens()) if (s.id === id) return s; return null; };
  const knobIn = (s, k) => { for (const n of s.knobs) if (n.k === k) return n; return null; };

  function legal(screen, k, v) {
    if (screen === "pauseOpts") {
      const pk = Object.hasOwn(PAUSE_KNOBS, k) ? PAUSE_KNOBS[k] : null;
      if (!pk || !has("PauseOpts")) { warn("unknown knob pauseOpts." + k + " skipped"); return undefined; }
      if (!(PauseOpts[pk.list] || []).some(([id]) => id === v)) { warn("pauseOpts." + k + " has no value " + v + " — skipped"); return undefined; }
      return v;
    }
    const s = lookOf(screen), n = s && knobIn(s, k);
    if (!n) { warn("unknown knob " + screen + "." + k + " skipped"); return undefined; }
    if (n.kind === "cycle" && !n.values.some(([id]) => id === v)) { warn(screen + "." + k + " has no value " + v + " — skipped"); return undefined; }
    if (n.kind === "range" && !(typeof v === "number" && v >= n.min && v <= n.max)) { warn(screen + "." + k + " " + v + " is out of range — skipped"); return undefined; }
    return v;
  }

  function expected(id) {
    const p = BY_ID[id];
    if (!p) return null;
    const out = {};
    for (const s of screens()) for (const n of s.knobs) out[s.id + "." + n.k] = ScreenLooks.shipDef(s.id, n.k);
    if (has("PauseOpts")) for (const k in PAUSE_KNOBS) out["pauseOpts." + k] = PAUSE_KNOBS[k].def;
    for (const [screen, k, v] of p.set) {
      const ok = legal(screen, k, v);
      if (ok !== undefined) out[screen + "." + k] = ok;
    }
    return out;
  }
  function actual() {
    const out = {};
    for (const s of screens()) {
      const l = ScreenLooks.read(s.id);
      for (const n of s.knobs) out[s.id + "." + n.k] = l[n.k];
    }
    if (has("PauseOpts")) for (const k in PAUSE_KNOBS) out["pauseOpts." + k] = PauseOpts[PAUSE_KNOBS[k].read]();
    return out;
  }
  function matches(id) {
    const want = expected(id);
    if (!want) return false;
    const got = actual();
    for (const k in want) if (got[k] !== want[k]) return false;
    return true;
  }
  function current() {
    const st = store();
    const rec = st ? st.get(KEY, null) : null;
    if (rec && BY_ID[rec] && matches(rec)) return rec;
    return matches("shipped") ? "shipped" : "custom";
  }

  function setKnob(screen, k, v) {
    if (screen === "pauseOpts") {
      const pk = PAUSE_KNOBS[k];
      if (PauseOpts[pk.read]() !== v) PauseOpts[pk.set](v);
      return;
    }
    if (ScreenLooks.read(screen)[k] !== v) ScreenLooks.set(screen, k, v);
  }
  function resetAll() {
    for (const s of screens()) if (!ScreenLooks.isShipped(s.id)) ScreenLooks.reset(s.id);
    if (has("PauseOpts")) for (const k in PAUSE_KNOBS) setKnob("pauseOpts", k, PAUSE_KNOBS[k].def);
  }
  function snapshot() {
    const st = store();
    const snap = { label: current(), preset: st ? st.get(KEY, null) : null, looks: {}, pause: {}, title: null };
    for (const s of screens()) snap.looks[s.id] = ScreenLooks.read(s.id);
    if (has("PauseOpts")) for (const k in PAUSE_KNOBS) snap.pause[k] = PauseOpts[PAUSE_KNOBS[k].read]();
    if (has("TitleLayout")) snap.title = TitleLayout.all();
    return snap;
  }
  function restore(snap) {
    resetAll();
    for (const id in snap.looks) {
      const s = lookOf(id);
      if (!s) continue;
      for (const n of s.knobs) setKnob(id, n.k, snap.looks[id][n.k]);
    }
    for (const k in snap.pause) if (Object.hasOwn(PAUSE_KNOBS, k)) setKnob("pauseOpts", k, snap.pause[k]);
    if (snap.title && has("TitleLayout")) {
      for (const sh of TitleLayout.SHAPES) if (!TitleLayout.isDefault(snap.title[sh])) TitleLayout.set(snap.title[sh], sh);
    }
  }

  let undoSnap = null, busy = false;
  function apply(id) {
    const p = BY_ID[id];
    if (!p) { warn("unknown preset " + id); return null; }
    if (!has("ScreenLooks") || !has("GameStore")) { warn("ScreenLooks / GameStore missing — nothing applied"); return null; }
    const before = snapshot();
    let applied = 0, skipped = 0;
    busy = true;
    try {
      resetAll();
      for (const [screen, k, v] of p.set) {
        const ok = legal(screen, k, v);
        if (ok === undefined) { skipped++; continue; }
        try { setKnob(screen, k, ok); applied++; }
        catch (e) { skipped++; warn(screen + "." + k + " failed: " + (e && e.message)); }
      }
      store().set(KEY, id);
    } finally { busy = false; }
    if (before.label !== id) undoSnap = before;
    paint();
    return { applied, skipped };
  }
  function undo() {
    const snap = undoSnap;
    if (!snap) return false;
    undoSnap = null;
    busy = true;
    try { restore(snap); store().set(KEY, snap.preset); }
    finally { busy = false; }
    paint();
    return true;
  }

  const SHAPES_KEY = "appearanceShapes";
  const SHAPE_KEYS = Object.freeze(["uiScale", "hudScale", "hudBtnScale", "hudBtnOpacity", "hudPanelOpacity", "hudMetricsLayout", "hudMapVis", "hudGapsVis",
    "pauseLayout", "pauseSide", "pauseDim", "lookPause", "lookDatahub", "lookSelect", "lookRace", "lookCareer", "lookGarage", "lookPopups", "lookDesigner"]);
  const studio = () => (typeof AppearanceStudio !== "undefined" && AppearanceStudio) || null;
  const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const pick = (v) => { const o = {}; for (const k of SHAPE_KEYS) o[k] = v[k] === undefined ? null : v[k]; return o; };
  function normalizeShapes(raw) {
    const ok = isObj(raw) && raw.v === 2 && raw.mode === "separate", a = studio();
    return { separate: ok, live: ok && (raw.live === "wide" || raw.live === "tall") ? raw.live : null,
      park: ok && isObj(raw.park) && a ? pick(a.normalizeSnapshot(pick(raw.park))) : null };
  }
  const shapes = () => normalizeShapes(store() ? store().get(SHAPES_KEY, null) : null);
  function syncShape(now) {
    const st = shapes(), a = studio(), s = store();
    if (!a || !s || !st.separate || (now !== "wide" && now !== "tall") || st.live === now) return false;
    const cur = a.snapshot(), out = pick(cur), park = st.park;
    s.set(SHAPES_KEY, { v: 2, mode: "separate", live: now, park: out });
    if (!park || JSON.stringify(park) === JSON.stringify(out)) return false;
    if (undoSnap) undoSnap = null;
    a.applySnapshot(Object.assign(cur, park), { history: false });
    paint();
    return true;
  }
  function setShapeMode(mode) {
    const s = store(), a = studio();
    if (!s) return false;
    if (mode !== "separate") { s.set(SHAPES_KEY, null); return true; }
    if (shapes().separate) return true;
    const now = a && a.shapeNow ? a.shapeNow() : null;
    s.set(SHAPES_KEY, { v: 2, mode: "separate", live: now, park: null });
    return true;
  }
  const ORIENT_ROW = "pm-orientation";
  const ORIENT_VALUES = [["shared", "SHARED"], ["separate", "SEPARATE"]];
  const orientNow = () => (shapes().separate ? "separate" : "shared");

  const values = () => PRESETS.map((p) => [p.id, p.name]).concat([["custom", "CUSTOM", true]]);
  let ui = null;
  function noteText(cur) {
    const what = cur === "custom" ? "Your own mix: a knob was changed after a preset."
      : (BY_ID[cur] ? BY_ID[cur].note : "");
    return undoSnap ? what + " Was " + nameOf(undoSnap.label) + " — UNDO puts it back." : what;
  }
  function paint() {
    if (!ui || busy) return;
    const cur = current();
    if (has("SettingRow")) SettingRow.paint(ui.row, cur);
    ui.note.textContent = noteText(cur);
    ui.undo.hidden = !undoSnap;
    if (undoSnap) ui.undo.textContent = "UNDO · " + nameOf(undoSnap.label);
  }
  let queued = false;
  function queuePaint() {
    if (queued || busy) return;
    queued = true;
    setTimeout(() => { queued = false; paint(); }, 0);
  }
  function managed(key) {
    if (key == null || key === KEY || key === "titleLayout") return true;
    for (const k in PAUSE_KNOBS) if (PAUSE_KNOBS[k].key === key) return true;
    for (const s of screens()) if (s.key === key) return true;
    return false;
  }

  function mount() {
    if (ui) return ui.row;
    const panel = byId("pm-panel-appearance");
    if (!panel || !has("SettingRow") || !has("ScreenLooks") || !has("GameStore")) return null;
    const built = SettingRow.build(ROW, "LAYOUT PRESET", values());
    const box = doc.createElement("div");
    box.id = ROW + "-box";
    const note = doc.createElement("p");
    note.id = ROW + "-note";
    note.className = "adv-help";
    note.setAttribute("aria-live", "polite");
    const undoBtn = doc.createElement("button");
    undoBtn.id = ROW + "-undo";
    undoBtn.type = "button";
    undoBtn.className = "adv-more-btn";
    undoBtn.hidden = true;
    undoBtn.addEventListener("click", (e) => { if (e && e.stopPropagation) e.stopPropagation(); undo(); });
    box.appendChild(built.row);
    box.appendChild(note);
    box.appendChild(undoBtn);
    const studio = byId("appearance-studio");
    const help = panel.children && panel.children[0];
    const anchor = studio && studio.parentNode === panel ? studio
      : help && help.tagName === "P" ? panel.children[1] || null : (panel.children && panel.children[0]) || null;
    panel.insertBefore(box, anchor);
    ui = { row: built.row, note, undo: undoBtn, box };
    const orient = SettingRow.build(ORIENT_ROW, "PORTRAIT & LANDSCAPE", ORIENT_VALUES);
    const orientNote = doc.createElement("p");
    orientNote.id = ORIENT_ROW + "-note";
    orientNote.className = "adv-help";
    orientNote.textContent = "SHARED: one set of sizes and screen looks for both orientations. SEPARATE: portrait and landscape each keep their own UI and HUD sizes, pause menu and screen looks on this device, starting from your current ones. Colours and text stay shared.";
    box.appendChild(orient.row);
    box.appendChild(orientNote);
    SettingRow.wire(orient.row, { values: ORIENT_VALUES, read: orientNow, write: (v) => { setShapeMode(v); } });
    SettingRow.wire(built.row, { values: values(), read: current, write: (v) => { apply(v); } });
    const st = store();
    if (st && st.subscribe) st.subscribe((c) => {
      if (managed(c && c.key)) queuePaint();
      if (c && c.key === SHAPES_KEY) SettingRow.paint(orient.row, orientNow());
    });
    SettingRow.paint(orient.row, orientNow());
    paint();
    return built.row;
  }

  if (doc) {
    try {
      if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", mount, { once: true });
      else mount();
    } catch (e) { warn("mount failed: " + (e && e.message)); }
  }

  return Object.freeze({ KEY, PRESETS, PAUSE_KNOBS, apply, undo, current, matches, expected, mount, snapshot,
    SHAPES_KEY, SHAPE_KEYS, shapes, normalizeShapes, syncShape, setShapeMode,
    get canUndo() { return !!undoSnap; } });
})();
