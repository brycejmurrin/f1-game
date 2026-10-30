/* Apex 26 — LayoutPresets: one tap, the whole UI's layout, LIVE (gap G9 of
   the 2026-10-30 UI layout program).

   SETTINGS › APPEARANCE › LAYOUT PRESET is one SettingRow (‹ VALUE ›) this file
   builds at runtime above the Appearance Studio. A preset is DATA — rows of
   [screen, knob, value] over knobs that already exist — applied through each
   owner's own public setters, so nothing reloads and every fold stays the one
   home of its knob:
     - ScreenLooks.set / reset   (js/ui/screen-looks.js: pause, datahub, select,
       race, career, garage, designer, popups)
     - PauseOpts.setLayout / setSide / setDim   (screen "pauseOpts")
     - TitleLayout.reset / set   (SHIPPED and UNDO only; no preset moves it)
   Every preset starts from SHIPPED (every managed knob at its default), so a
   preset is the same picture whatever was set before. CONFIRM QUIT is a safety
   behaviour, not a look, and is never touched; text size and UI SCALE are
   readability prefs (AppearanceStudio's PRESET_PRESERVE) and are left alone.

   Values come from the 844x390 touch look-diff (artifacts/look-diff/report.md,
   2026-10-30): only values that report measured VISIBLE; nothing it marked
   DEAD or SUBTLE.

   STATE: apex26.layoutPreset holds the last preset applied (null = none). The
   row reads it ONLY while the live knobs still equal that preset — compare on
   read — so the first knob moved anywhere shows CUSTOM, with no hook in the
   owners. Untouched installs read SHIPPED. GameStore.store.subscribe repaints.

   UNDO: before every apply the managed state is snapshotted; the note names
   the previous state and UNDO restores it exactly (a CUSTOM one included).
   SHIPPED is also the first option, one ‹ away from THUMB.

   LAZY_UI_PRESETS: js/ui/settings-tabs.js loads this file when APPEARANCE is
   first entered. Everything it reads (GameStore, SettingRow, ScreenLooks,
   PauseOpts, TitleLayout) is FULL, but each is still typeof-guarded: an
   unknown screen / knob / value is skipped with a Log.warn, never thrown. */
const LayoutPresets = (function () {
  "use strict";

  const KEY = "layoutPreset";   // apex26.layoutPreset — json: "shipped" | "thumb" | "compact" | "big" | unset
  const ROW = "pm-layoutpreset";
  const PAUSE_KNOBS = Object.freeze({
    layout: Object.freeze({ set: "setLayout", read: "layoutMode", list: "LAYOUTS", def: "grid", key: "pauseLayout" }),
    side: Object.freeze({ set: "setSide", read: "sideMode", list: "SIDES", def: "centre", key: "pauseSide" }),
    dim: Object.freeze({ set: "setDim", read: "dimMode", list: "DIMS", def: "full", key: "pauseDim" }),
  });
  const row = (screen, knob, value) => Object.freeze([screen, knob, value]);
  const PRESETS = Object.freeze([
    Object.freeze({ id: "shipped", name: "SHIPPED", note: "Every screen as it ships.", set: Object.freeze([]) }),
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

  // Script-scope `const` globals are not window properties: typeof each by name.
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

  /** Is [screen, knob, value] a knob that exists, at a legal value? Returns the
   *  value to write, or undefined (with a Log.warn) to skip the row. */
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

  /** The full managed picture a preset means: "screen.knob" -> value. */
  function expected(id) {
    const p = BY_ID[id];
    if (!p) return null;
    const out = {};
    for (const s of screens()) for (const n of s.knobs) out[s.id + "." + n.k] = n.def;
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
  function titleShipped() {
    if (!has("TitleLayout")) return true;
    const a = TitleLayout.all();
    return TitleLayout.isDefault(a.wide) && TitleLayout.isDefault(a.tall);
  }
  /** Do the live knobs equal preset `id`'s picture? */
  function matches(id) {
    const want = expected(id);
    if (!want || !titleShipped()) return false;
    const got = actual();
    for (const k in want) if (got[k] !== want[k]) return false;
    return true;
  }
  /** What the row shows: the recorded preset while it still holds, SHIPPED for
   *  an untouched UI, otherwise CUSTOM. */
  function current() {
    const st = store();
    const rec = st ? st.get(KEY, null) : null;
    if (rec && BY_ID[rec] && matches(rec)) return rec;
    return matches("shipped") ? "shipped" : "custom";
  }

  // ── writing, through the owners' setters only ────────────────────────────
  function setKnob(screen, k, v) {
    if (screen === "pauseOpts") {
      const pk = PAUSE_KNOBS[k];
      if (PauseOpts[pk.read]() !== v) PauseOpts[pk.set](v);   // setters peek the card: only on a change
      return;
    }
    if (ScreenLooks.read(screen)[k] !== v) ScreenLooks.set(screen, k, v);
  }
  function resetAll() {
    for (const s of screens()) if (!ScreenLooks.isShipped(s.id)) ScreenLooks.reset(s.id);
    if (has("PauseOpts")) for (const k in PAUSE_KNOBS) setKnob("pauseOpts", k, PAUSE_KNOBS[k].def);
    if (!titleShipped()) TitleLayout.reset();
  }
  /** The managed state, in owner terms, for UNDO. */
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
      for (const n of s.knobs) if (snap.looks[id][n.k] !== n.def) setKnob(id, n.k, snap.looks[id][n.k]);
    }
    for (const k in snap.pause) if (Object.hasOwn(PAUSE_KNOBS, k)) setKnob("pauseOpts", k, snap.pause[k]);
    if (snap.title && has("TitleLayout")) {
      for (const sh of TitleLayout.SHAPES) if (!TitleLayout.isDefault(snap.title[sh])) TitleLayout.set(snap.title[sh], sh);
    }
  }

  let undoSnap = null, busy = false;
  /** Apply preset `id` live. Returns { applied, skipped } or null (unknown id
   *  or a missing owner — logged, never thrown). */
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
  /** Put back the state the last apply replaced. False when there is none. */
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

  // ── the row ──────────────────────────────────────────────────────────────
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

  /** Build and wire the row once, above the Appearance Studio (or at the top
   *  of the panel without it). Returns the row element, or null. */
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
    SettingRow.wire(built.row, { values: values(), read: current, write: (v) => { apply(v); } });
    const st = store();
    if (st && st.subscribe) st.subscribe((c) => { if (managed(c && c.key)) queuePaint(); });
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
    get canUndo() { return !!undoSnap; } });
})();
