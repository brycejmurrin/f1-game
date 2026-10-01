/* Apex 26 — TrackDesigner: the TRACK DESIGNER screen (#trackdesigner), where the
   player composes a circuit — drags and inserts control points, stamps
   straights, corners, hairpins, chicanes and S-bends onto the loop, draws one
   freehand or randomises one — picks a theme, names it, and saves it into MY
   CIRCUITS (CustomTracks), then races it through the ordinary RACE / TIME TRIAL
   doors. The preview is the ENGINE's own centreline (TrackValidate), debounced
   80 ms and never mid-drag; a RED issue blocks SAVE and RACE, and a draft is
   autosaved so nothing is lost on close. Built into the shell's empty <dialog>
   on first init (the Data Hub pattern: index.html ships the Escape target and
   the heading); LAZY_EDITOR, last in the bundle, so every editor module and the
   FULL roster are present when init runs. */
const TrackDesigner = (function () {
  "use strict";
  const el = Dom.el;
  const S = TrackShape;
  const PREVIEW_MS = 80, DRAFT_MS = 600, UNDO_CAP = 100;
  const TOOLS = [["select", "SELECT"], ["draw", "DRAW"], ["straight", "STRAIGHT"], ["corner", "CORNER"], ["hairpin", "HAIRPIN"], ["chicane", "CHICANE"], ["sbend", "S-BEND"]];
  const STEPS = { L: 10, R: 5, deg: 5 };
  const PARAM_LABEL = { L: "LENGTH m", R: "RADIUS m", deg: "ANGLE °" };

  let G = null, custom = null, root = null, built = false, openFlag = false, returnFocus = null;
  let cv = null, canvas = null;
  const ui = {};                       // named nodes, built once
  let design = null, verdict = null, sel = -1, span = -1, tool = "select";
  let params = { L: 200, R: 60, deg: 90, dir: 1 };
  const undo = [], redo = [];
  let previewT = 0, draftT = 0, confirmDel = null, msgT = 0;

  // ── helpers ───────────────────────────────────────────────────────────────
  const tick = () => { if (G && G.soundOn && typeof GameAudio !== "undefined" && GameAudio.uiTick) GameAudio.uiTick(); };
  const selectSnd = () => { if (G && G.soundOn && typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); };
  const copy = (d) => JSON.parse(JSON.stringify(d));
  const lattice = (pts) => pts.map((p) => [Math.round(p[0] * 4) / 4, Math.round(p[1] * 4) / 4]);
  const fmtKm = (m) => (m / 1000).toFixed(2) + " km";
  const fmtLap = (s) => { if (!(s > 0)) return "—"; const m = Math.floor(s / 60), r = s - m * 60; return m + ":" + (r < 10 ? "0" : "") + r.toFixed(1); };
  function blank() {
    return { name: "MY CIRCUIT", seed: (Date.now() % 4294967296) >>> 0, theme: TrackThemes.ORDER[0], baseHW: 7, pts: [], hwZones: [], bankZones: [], elevations: [], bridges: [], turns: [], lengthM: 0 };
  }
  function message(text, warn) {
    if (!ui.msg) return;
    ui.msg.textContent = text || "";
    ui.msg.dataset.warn = warn ? "1" : "";
    clearTimeout(msgT);
    if (text) msgT = setTimeout(() => { if (ui.msg.textContent === text) ui.msg.textContent = ""; }, 6000);
  }
  function btn(label, cls, onClick) {
    const b = el("button", cls, label); b.type = "button";
    b.addEventListener("click", (ev) => { tick(); onClick(ev); });
    return b;
  }

  // ── state transitions ─────────────────────────────────────────────────────
  function snapshot() { return JSON.stringify(design); }
  function pushUndo(snap) { undo.push(snap); if (undo.length > UNDO_CAP) undo.shift(); redo.length = 0; }
  /** Replace the design (geometry edits go through here so UNDO sees them). */
  function commit(next, kind) {
    pushUndo(snapshot());
    design = next;
    design.pts = lattice(design.pts);
    afterChange(kind);
  }
  function afterChange(kind) {
    if (sel >= design.pts.length) sel = -1;
    if (span >= design.pts.length) span = -1;
    if (cv) { cv.setPoints(design.pts); cv.setSelection(sel, span); }
    schedulePreview();
    scheduleDraft();
    refreshControls();
    Log.debug("track", "designer edit: " + (kind || "change") + " (" + design.pts.length + " pts)");
  }
  function schedulePreview() { clearTimeout(previewT); previewT = setTimeout(runPreview, PREVIEW_MS); }
  function runPreview() {
    clearTimeout(previewT); previewT = 0;
    if (!design) return null;
    verdict = design.pts.length ? TrackValidate.check(design) : { ok: false, red: 1, amber: 0, issues: [{ code: "points", level: "red", msg: "Draw a loop, stamp one, or press RANDOMISE" }], stats: null, tr: null, turns: [] };
    if (cv) { cv.setBuilt(verdict.tr); cv.setIssues(verdict.issues); }
    renderIssues(); renderStats();
    const blocked = !verdict.ok;
    for (const b of [ui.save, ui.race, ui.tt]) if (b) { b.disabled = blocked; b.setAttribute("aria-disabled", blocked ? "true" : "false"); }
    return verdict;
  }
  function scheduleDraft() { clearTimeout(draftT); draftT = setTimeout(saveDraft, DRAFT_MS); }
  function saveDraft() { clearTimeout(draftT); draftT = 0; if (design && custom && design.pts.length) custom.setDraft(design); }

  // ── edits ─────────────────────────────────────────────────────────────────
  function stampParams() {
    const k = TrackStamps.KINDS[tool]; if (!k) return null;
    const out = {};
    for (const key of Object.keys(k.params)) out[key] = params[key] != null ? params[key] : k.params[key];
    return out;
  }
  /** Stamp the active tool after control i0, or over the span (i0 … i1). */
  function applyStamp(i0, i1, kind) {
    const k = kind || tool;
    if (!TrackStamps.KINDS[k]) { message("Pick a shape tool first (STRAIGHT, CORNER, HAIRPIN, CHICANE, S-BEND)", true); return false; }
    if (!design.pts.length || design.pts.length < 3) {
      // A first stamp on an empty sheet: a loop from the shape itself, closed by the splice.
      const seed = TrackRandom.generate(design.seed, { targetL: 3800 }).pts;
      commit(Object.assign({}, design, { pts: seed }), "seed");
      i0 = 0; i1 = 0;
    }
    if (!(i0 >= 0)) i0 = Math.max(0, sel);
    const p = kind ? Object.assign({}, TrackStamps.KINDS[k].params, params) : stampParams();
    const r = TrackStamps.splice(design.pts, i0, i1 == null ? i0 : i1, k, p);
    if (!r.ok) { message(r.reason, true); return false; }
    sel = r.sel[1]; span = -1;
    commit(Object.assign({}, design, { pts: r.pts }), "stamp:" + k);
    message(TrackStamps.KINDS[k].label + " stamped" + (r.word ? " (rejoin " + r.word + ")" : ""));
    return true;
  }
  /** A freehand pointer path (world metres) → a closed, spaced, start-rotated loop. */
  function freehand(path) {
    if (!path || path.length < 3) return false;
    let p = S.rdp(path, 3);
    p = S.resample(p, 30, false);
    if (p.length < 3) { message("Draw a bigger loop", true); return false; }
    const a = p[0], z = p[p.length - 1], gap = Math.hypot(z[0] - a[0], z[1] - a[1]);
    if (gap < 60) { if (gap < 12) p.pop(); }
    else {
      // Close the loop with the gentlest Dubins fill from the pen-up pose to the pen-down pose.
      const h = (pts, i, j) => Math.atan2(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
      const q0 = { x: z[0], z: z[1], th: h(p, p.length - 2, p.length - 1) }, q1 = { x: a[0], z: a[1], th: h(p, 0, 1) };
      let fill = null;
      for (const r of [80, 50, 30, 20]) { const d = S.dubins(q0, q1, r, 25); if (d && d.len < gap * 4 + 2 * Math.PI * r) { fill = d; break; } }
      if (fill) p = p.concat(fill.pts.slice(0, -1));
    }
    for (let i = 0; i < 20; i++) if (!TrackRandom.fixAngles(p, 100)) break;
    p = S.enforceSpacing(p, TrackStamps.SPACING);
    if (p.length < CustomTracks.LIMITS.ptsMin) { message("Draw a bigger loop — at least " + CustomTracks.LIMITS.ptsMin + " points", true); return false; }
    if (p.length > CustomTracks.LIMITS.ptsMax) p = S.rdp(p, 2);
    p = startOnLongestStraight(p);
    sel = -1; span = -1;
    commit(Object.assign({}, design, { pts: p }), "draw");
    message("Loop drawn — drag the points to tune it");
    return true;
  }
  function startOnLongestStraight(p) {
    try {
      const ls = TrackRandom.longestStraight(p);
      if (!ls || !ls.dense || !ls.dense.length) return p;
      const along = Math.min(Math.max(ls.lenM * 0.6, 240), Math.max(ls.lenM - 140, 0));
      const d = ls.dense[(ls.start + Math.round(along / 4)) % ls.dense.length];
      return S.rotate(p, S.project(p, d[0], d[1]).i);
    } catch (_) { return p; }
  }
  function randomise(seed) {
    const s = Number.isFinite(seed) ? (seed >>> 0) : ((Math.imul(design.seed ^ (design.seed >>> 16), 0x45d9f3b) + 0x9e3779b9) >>> 0);
    const base = Object.assign({}, design);
    const r = TrackRandom.generateValid(s, (pts) => TrackValidate.check(Object.assign({}, base, { pts })).ok, 12);
    sel = -1; span = -1;
    commit(Object.assign({}, design, { pts: r.pts, seed: r.seed }), "randomise");
    if (cv) cv.fit();
    message(r.ok ? "Randomised — seed " + r.seed : "No clean loop in 12 tries — RANDOMISE again or tune the points", !r.ok);
    return !!r.ok;
  }
  const flipS = (z) => Object.assign({}, z, { s0: 1 - z.s1, s1: 1 - z.s0 });
  const flipP = (z) => Object.assign({}, z, { s: 1 - z.s });
  function reverse() {
    const pts = design.pts;
    if (pts.length < 3) return false;
    const next = Object.assign({}, design, {
      pts: [pts[0]].concat(pts.slice(1).reverse()),
      hwZones: (design.hwZones || []).map(flipS),
      bankZones: (design.bankZones || []).map((z) => Object.assign(flipS(z), { angle: -(z.angle || 0) })),
      elevations: (design.elevations || []).map(flipP),
      bridges: (design.bridges || []).map(flipP),
    });
    commit(next, "reverse");
    message("Direction reversed");
    return true;
  }
  function setStart(i) {
    const pts = design.pts, N = pts.length;
    if (!(i > 0 && i < N)) { message("Select a point that is not already the start", true); return false; }
    let L = 0, upto = 0;
    for (let k = 0; k < N; k++) { const a = pts[k], b = pts[(k + 1) % N]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (k < i) upto += d; L += d; }
    const f = L ? upto / L : 0, wrap = (v) => ((v % 1) + 1) % 1;
    const shiftS = (z) => Object.assign({}, z, { s0: wrap(z.s0 - f), s1: wrap(z.s1 - f) });
    const shiftP = (z) => Object.assign({}, z, { s: wrap(z.s - f) });
    const next = Object.assign({}, design, {
      pts: S.rotate(pts, i),
      hwZones: (design.hwZones || []).map(shiftS), bankZones: (design.bankZones || []).map(shiftS),
      elevations: (design.elevations || []).map(shiftP), bridges: (design.bridges || []).map(shiftP),
    });
    sel = 0; span = -1;
    commit(next, "start");
    message("Start line moved");
    return true;
  }
  function deletePoint(i) {
    const pts = design.pts;
    if (!(i >= 0 && i < pts.length)) return false;
    if (pts.length <= CustomTracks.LIMITS.ptsMin) { message("A loop needs at least " + CustomTracks.LIMITS.ptsMin + " points", true); return false; }
    const next = pts.slice(); next.splice(i, 1);
    sel = -1; span = -1;
    commit(Object.assign({}, design, { pts: next }), "delete");
    return true;
  }
  function doUndo() { if (!undo.length) return false; redo.push(snapshot()); design = JSON.parse(undo.pop()); sel = -1; span = -1; afterChange("undo"); return true; }
  function doRedo() { if (!redo.length) return false; undo.push(snapshot()); design = JSON.parse(redo.pop()); sel = -1; span = -1; afterChange("redo"); return true; }
  function setTheme(id) {
    if (!TrackThemes.has(id) || id === design.theme) return false;
    commit(Object.assign({}, design, { theme: id }), "theme");
    return true;
  }
  function setWidth(hw) {
    hw = Math.round(Math.min(CustomTracks.LIMITS.hwMax, Math.max(CustomTracks.LIMITS.hwMin, hw)) * 10) / 10;
    if (hw === design.baseHW) return false;
    commit(Object.assign({}, design, { baseHW: hw }), "width");
    return true;
  }
  function setName(s) { design.name = CustomTracks.sanitizeName(s); scheduleDraft(); if (ui.name && ui.name.value !== design.name && document.activeElement !== ui.name) ui.name.value = design.name; }
  function setTool(name) {
    tool = TOOLS.some((t) => t[0] === name) ? name : "select";
    if (cv) cv.setTool(tool);
    refreshControls();
  }
  function load(item, label) {
    design = copy(item);
    for (const k of ["hwZones", "bankZones", "elevations", "bridges", "turns"]) if (!Array.isArray(design[k])) design[k] = [];
    undo.length = 0; redo.length = 0; sel = -1; span = -1;
    afterChange(label || "load");
    if (cv) cv.fit();
  }

  // ── save / race ───────────────────────────────────────────────────────────
  function save() {
    if (previewT || !verdict) runPreview();
    if (!verdict || !verdict.ok) { message("Fix the red issues before saving", true); return { ok: false, reason: "red" }; }
    design.turns = verdict.turns.slice();
    design.lengthM = Math.round(verdict.tr.total);
    design.name = CustomTracks.sanitizeName(ui.name ? ui.name.value : design.name);
    const r = custom.upsert(design);
    if (!r.ok) {
      message(r.reason === "full" ? "MY CIRCUITS is full (" + r.limit + ") — delete one first" : "Could not save this design", true);
      Log.warn("track", "designer save refused: " + r.reason);
      return r;
    }
    design.id = r.id;
    message(r.durable ? "Saved to MY CIRCUITS" : "Saved — but storage is full, so it may not survive a reload", !r.durable);
    Log.info("track", "designer saved " + r.id + " (" + design.name + ", " + design.lengthM + " m)");
    renderLibrary();
    return r;
  }
  function race(mode) {
    const r = save();
    if (!r.ok) return false;
    return raceId(r.id, mode);
  }
  function raceId(id, mode) {
    const idx = custom.select(id);
    if (idx < 0) { message("That circuit is not in the list any more", true); return false; }
    G.trackIdx = idx;
    close();
    // Two literal lookups, not one computed id: the shell-id guard reads them.
    const door = mode === "tt" ? document.getElementById("mb-tt") : document.getElementById("mb-race");
    if (door) door.click();
    Log.info("track", "designer → " + (mode === "tt" ? "time trial" : "race") + " on " + id);
    return true;
  }

  // ── DOM ───────────────────────────────────────────────────────────────────
  function build() {
    if (built || !root) return;
    built = true;
    const closeBtn = document.getElementById("td-close");
    if (closeBtn) { closeBtn.hidden = false; closeBtn.addEventListener("click", close); }

    const body = el("div", "td-body");
    // stage
    const stage = el("div", "td-stage");
    canvas = el("canvas");
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Circuit design. Drag a point to move it, tap the road to add one, double-tap a point to delete it. Arrow keys move the selected point.");
    ui.stats = el("div", "td-stats");
    ui.hint = el("div", "td-hint", "Drag points · tap the road to add one · shift-tap a second point to select a span");
    stage.append(canvas, ui.stats, ui.hint);
    // rail
    const rail = el("div", "td-rail");
    const tabs = el("div", "td-tabs"); tabs.setAttribute("role", "tablist");
    ui.tabDesign = tabBtn("DESIGN", "design"); ui.tabLib = tabBtn("MY CIRCUITS", "library");
    tabs.append(ui.tabDesign, ui.tabLib);
    ui.paneDesign = el("section", "td-pane"); ui.paneDesign.setAttribute("role", "tabpanel"); ui.paneDesign.dataset.pane = "design";
    ui.paneLib = el("section", "td-pane"); ui.paneLib.setAttribute("role", "tabpanel"); ui.paneLib.dataset.pane = "library"; ui.paneLib.hidden = true;
    rail.append(tabs, ui.paneDesign, ui.paneLib);
    buildDesignPane(ui.paneDesign);
    ui.lib = el("div", "td-grid"); ui.paneLib.appendChild(ui.lib);
    body.append(stage, rail);
    // foot
    const foot = el("div", "td-foot");
    ui.save = btn("SAVE", "sel-edit", () => save());
    ui.race = btn("RACE", "sel-edit", () => race("gp"));
    ui.tt = btn("TIME TRIAL", "sel-edit", () => race("tt"));
    ui.msg = el("div", "td-msg"); ui.msg.setAttribute("role", "status"); ui.msg.setAttribute("aria-live", "polite");
    foot.append(ui.save, ui.race, ui.tt, ui.msg);
    root.append(body, foot);

    cv = DesignerCanvas.create(canvas, {
      onBegin: () => {},
      onChange: (pts, kind) => { commit(Object.assign({}, design, { pts }), kind); },
      onSelect: (i) => { sel = i; refreshControls(); },
      onPick: (i, ev) => {
        if (TrackStamps.KINDS[tool]) { if (ev.shiftKey && sel >= 0 && sel !== i) applyStamp(sel, i); else applyStamp(i, i); return; }
        if (ev.shiftKey && sel >= 0 && sel !== i) span = i; else { sel = i; span = -1; }
        cv.setSelection(sel, span); refreshControls();
      },
      onDelete: (i) => deletePoint(i),
      onDraw: (path) => freehand(path),
    });
    cv.setTool(tool);
  }
  function tabBtn(label, pane) {
    const b = btn(label, "sel-chip td-tab", () => showPane(pane));
    b.setAttribute("role", "tab");
    return b;
  }
  function showPane(pane) {
    const lib = pane === "library";
    ui.paneDesign.hidden = lib; ui.paneLib.hidden = !lib;
    for (const [b, on] of [[ui.tabDesign, !lib], [ui.tabLib, lib]]) { b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false"); }
    if (lib) renderLibrary();
  }
  function group(label) { const g = el("div", "td-group"); g.appendChild(el("div", "td-label", label)); return g; }
  function stepper(label, get, set, step, fmt) {
    const row = el("div", "td-row");
    const lab = el("span", "", label);
    const minus = btn("−", "sel-chip", () => set(get() - step));
    const val = el("span", "td-num", fmt ? fmt(get()) : String(get()));
    const plus = btn("+", "sel-chip", () => set(get() + step));
    minus.setAttribute("aria-label", label + " down"); plus.setAttribute("aria-label", label + " up");
    row.append(lab, minus, val, plus);
    row._refresh = () => { val.textContent = fmt ? fmt(get()) : String(get()); };
    return row;
  }
  function buildDesignPane(pane) {
    // tools
    const tools = group("TOOLS");
    ui.tools = el("div", "td-chips");
    for (const [id, label] of TOOLS) {
      const b = btn(label, "sel-chip", () => setTool(id)); b.dataset.tool = id; b.setAttribute("aria-pressed", "false");
      ui.tools.appendChild(b);
    }
    tools.appendChild(ui.tools);
    // stamp params
    ui.shape = group("SHAPE");
    ui.paramRows = {};
    for (const key of ["L", "R", "deg"]) {
      const row = stepper(PARAM_LABEL[key], () => params[key], (v) => { params[key] = clampParam(key, v); refreshControls(); }, STEPS[key]);
      ui.paramRows[key] = row; ui.shape.appendChild(row);
    }
    const dirRow = el("div", "td-chips");
    ui.dirL = btn("TURNS LEFT", "sel-chip", () => { params.dir = 1; refreshControls(); });
    ui.dirR = btn("TURNS RIGHT", "sel-chip", () => { params.dir = -1; refreshControls(); });
    dirRow.append(ui.dirL, ui.dirR); ui.shape.appendChild(dirRow);
    ui.apply = btn("STAMP AT SELECTED POINT", "sel-edit", () => applyStamp(sel >= 0 ? sel : 0, span >= 0 ? span : null));
    ui.shape.appendChild(ui.apply);
    // theme
    const theme = group("THEME");
    ui.themes = el("div", "td-chips");
    for (const id of TrackThemes.ORDER) {
      const p = TrackThemes.get(id);
      const b = btn("", "sel-chip", () => setTheme(id)); b.dataset.theme = id;
      // Palette entries are linear RGB triples (js/circuits defs); the picker's
      // swatch idiom (select-screen.js) writes the same inline background.
      const c = (p.pal && (p.pal.grass || p.pal.sand || p.pal.runoff)) || (p.furniture && p.furniture.fol) || null;
      const sw = el("span", "swatch");
      if (Array.isArray(c) && c.length >= 3) sw.style.background = "rgb(" + c.slice(0, 3).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)).join(",") + ")";
      b.append(sw, document.createTextNode(p.label || id.toUpperCase()));
      ui.themes.appendChild(b);
    }
    theme.appendChild(ui.themes);
    // circuit
    const circuit = group("CIRCUIT");
    ui.name = el("input", "td-input"); ui.name.type = "text"; ui.name.maxLength = CustomTracks.LIMITS.name; ui.name.autocomplete = "off"; ui.name.spellcheck = false;
    ui.name.setAttribute("aria-label", "Circuit name"); ui.name.placeholder = "CIRCUIT NAME";
    ui.name.addEventListener("input", () => { design.name = CustomTracks.sanitizeName(ui.name.value); scheduleDraft(); });
    ui.name.addEventListener("blur", () => { ui.name.value = design.name; });
    circuit.appendChild(ui.name);
    // build() runs before the first design is loaded: read through the null.
    ui.width = stepper("HALF-WIDTH m", () => (design ? design.baseHW : 7), (v) => setWidth(v), 0.5, (v) => v.toFixed(1));
    circuit.appendChild(ui.width);
    const actions = el("div", "td-chips");
    ui.randomise = btn("RANDOMISE", "sel-chip", () => randomise());
    ui.reverse = btn("REVERSE", "sel-chip", () => reverse());
    ui.start = btn("START HERE", "sel-chip", () => setStart(sel));
    ui.del = btn("DELETE POINT", "sel-chip", () => deletePoint(sel));
    ui.undo = btn("UNDO", "sel-chip", () => doUndo());
    ui.redo = btn("REDO", "sel-chip", () => doRedo());
    ui.fitBtn = btn("FIT VIEW", "sel-chip", () => cv && cv.fit());
    actions.append(ui.randomise, ui.reverse, ui.start, ui.del, ui.undo, ui.redo, ui.fitBtn);
    circuit.appendChild(actions);
    // issues
    const issues = group("CHECKS");
    ui.issues = el("ul", "td-issues"); ui.issues.setAttribute("aria-live", "polite"); ui.issues.setAttribute("aria-label", "Design checks");
    issues.appendChild(ui.issues);
    pane.append(tools, ui.shape, theme, circuit, issues);
  }
  function clampParam(key, v) {
    const k = TrackStamps.KINDS[tool] || TrackStamps.KINDS.corner;
    const lo = k.min && k.min[key] != null ? k.min[key] : (key === "L" ? 20 : 10), hi = k.max && k.max[key] != null ? k.max[key] : (key === "L" ? 1200 : 600);
    return Math.min(hi, Math.max(lo, Math.round(v)));
  }
  function refreshControls() {
    if (!built || !design) return;
    for (const b of ui.tools.children) { const on = b.dataset.tool === tool; b.classList.toggle("active", on); b.setAttribute("aria-pressed", on ? "true" : "false"); }
    const kind = TrackStamps.KINDS[tool];
    ui.shape.hidden = !kind;
    if (kind) {
      for (const key of ["L", "R", "deg"]) { const row = ui.paramRows[key]; row.hidden = !(key in kind.params); if (!row.hidden) { params[key] = clampParam(key, params[key] != null ? params[key] : kind.params[key]); row._refresh(); } }
      const dir = "dir" in kind.params;
      ui.dirL.hidden = ui.dirR.hidden = !dir;
      ui.dirL.classList.toggle("active", params.dir === 1); ui.dirR.classList.toggle("active", params.dir === -1);
      ui.dirL.setAttribute("aria-pressed", params.dir === 1 ? "true" : "false"); ui.dirR.setAttribute("aria-pressed", params.dir === -1 ? "true" : "false");
      ui.apply.textContent = span >= 0 && sel >= 0 ? "REPLACE THE SELECTED SPAN" : sel >= 0 ? "STAMP AFTER POINT " + (sel + 1) : "STAMP AT THE START";
    }
    for (const b of ui.themes.children) { const on = b.dataset.theme === design.theme; b.classList.toggle("active", on); b.setAttribute("aria-pressed", on ? "true" : "false"); }
    if (document.activeElement !== ui.name) ui.name.value = design.name;
    ui.width._refresh();
    ui.undo.disabled = !undo.length; ui.redo.disabled = !redo.length;
    ui.start.disabled = ui.del.disabled = !(sel >= 0);
    ui.hint.textContent = tool === "draw" ? "Draw one closed loop in a single stroke — it closes and smooths itself"
      : kind ? "Tap a point to stamp after it (shift-tap a second point to replace the span between them)"
        : "Drag points · tap the road to add one · double-tap a point to delete it · wheel or pinch to zoom";
  }
  function renderIssues() {
    if (!ui.issues) return;
    while (ui.issues.firstChild) ui.issues.removeChild(ui.issues.firstChild);
    const list = verdict ? verdict.issues : [];
    if (!list.length) { const li = el("li", "td-issue", "All checks pass — ready to save and race"); li.dataset.level = "ok"; ui.issues.appendChild(li); return; }
    const order = { red: 0, amber: 1, info: 2 };
    for (const it of list.slice().sort((a, b) => (order[a.level] || 0) - (order[b.level] || 0))) {
      const li = el("li", "td-issue", it.msg); li.dataset.level = it.level; li.tabIndex = 0;
      const go = () => { if (Number.isFinite(it.s) && cv) cv.focusAt(it.s); if (Number.isFinite(it.ctrl)) { sel = it.ctrl; span = -1; cv.setSelection(sel, span); refreshControls(); } if (it.fix === "start" && sel >= 0) message("START HERE moves the line to the selected point"); };
      li.addEventListener("click", go);
      li.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } });
      ui.issues.appendChild(li);
    }
  }
  function renderStats() {
    if (!ui.stats) return;
    while (ui.stats.firstChild) ui.stats.removeChild(ui.stats.firstChild);
    const st = verdict && verdict.stats, tr = verdict && verdict.tr;
    const cells = tr ? [
      fmtKm(tr.total), "est lap " + fmtLap(st && st.estLapS), "min R " + (st && st.minR != null ? st.minR + " m" : "—"),
      (st && st.turns != null ? st.turns : (verdict.turns || []).length) + " corners", design.pts.length + " pts", "seed " + design.seed,
    ] : [design.pts.length + " pts"];
    for (const c of cells) ui.stats.appendChild(el("span", "", c));
  }
  function renderLibrary() {
    if (!ui.lib) return;
    while (ui.lib.firstChild) ui.lib.removeChild(ui.lib.firstChild);
    const items = custom.list();
    if (!items.length) { ui.lib.appendChild(el("div", "td-empty", "No saved circuits yet — SAVE the design on the left and it appears here. Saved circuits also show under MY CIRCUITS in the RACE picker.")); return; }
    for (const it of items) {
      const card = el("div", "td-card");
      const c = el("canvas"); c.width = 320; c.height = 220; c.setAttribute("aria-hidden", "true");
      const def = Tracks.LIST.find((t) => t.id === it.id);
      try { if (def) TrackMaps.draw(c, def, { width: 3, color: "#f6f6f9" }); } catch (e) { Log.warn("track", "library thumbnail failed: " + (e && e.message)); }
      const name = el("strong", "", it.name);
      const meta = el("div", "td-card-meta", fmtKm(it.lengthM) + " · " + (TrackThemes.get(it.theme).label || it.theme) + " · " + (it.turns ? it.turns.length : 0) + " corners");
      const row = el("div", "td-chips");
      row.append(
        btn("EDIT", "sel-chip", () => { load(it, "library"); showPane("design"); message("Editing " + it.name); }),
        btn("RACE", "sel-chip", () => raceId(it.id, "gp")),
        btn(confirmDel === it.id ? "DELETE?" : "DELETE", "sel-chip", () => {
          if (confirmDel !== it.id) { confirmDel = it.id; renderLibrary(); return; }
          confirmDel = null; custom.remove(it.id); if (design && design.id === it.id) delete design.id; renderLibrary(); message("Deleted " + it.name);
        }),
      );
      card.append(c, name, meta, row);
      ui.lib.appendChild(card);
    }
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────
  function init(G_, deps) {
    G = G_ || G; custom = (deps && deps.custom) || custom || (typeof CustomTracks !== "undefined" ? CustomTracks : null);
    root = (deps && deps.root) || document.getElementById("trackdesigner");
    if (!root || !custom) { Log.warn("track", "track designer: no #trackdesigner dialog in this shell"); return false; }
    build();
    return true;
  }
  function open(opts) {
    if (!built && !init()) return false;
    returnFocus = document.activeElement;
    if (opts && opts.design) load(opts.design, "open");
    else if (!design) {
      const d = custom.draft();
      const it = d && custom.sanitize(d);
      if (it && it.pts.length) { load(it, "draft"); message("Draft restored"); }
      else { design = blank(); afterChange("blank"); randomise(design.seed); }
    }
    root.hidden = false; openFlag = true;
    showPane("design");
    confirmDel = null;
    Log.info("track", "designer open");
    // Boxes exist only once TopModal's observer has opened the dialog (a
    // microtask after the hidden flip): size and fit the canvas then.
    requestAnimationFrame(() => { if (openFlag && cv) { cv.resize(); cv.fit(); } });
    queueMicrotask(() => { if (openFlag && ui.tools && ui.tools.firstChild) ui.tools.firstChild.focus(); });
    schedulePreview();
    return true;
  }
  function close() {
    if (!root || !openFlag) return;
    saveDraft();
    root.hidden = true; openFlag = false;
    Log.info("track", "designer close");
    if (returnFocus && returnFocus.isConnected && returnFocus.focus) returnFocus.focus();
    returnFocus = null;
  }
  const isOpen = () => openFlag;
  /** For tests and the agent: a plain snapshot of what the screen shows. */
  function state() {
    return {
      open: openFlag, tool, sel, span, pending: !!previewT,
      design: design ? copy(design) : null,
      ok: !!(verdict && verdict.ok), red: verdict ? verdict.red : null, amber: verdict ? verdict.amber : null,
      issues: verdict ? verdict.issues.map((i) => i.code + ":" + i.level) : [],
      stats: verdict && verdict.stats ? copy(verdict.stats) : null,
      lengthM: verdict && verdict.tr ? Math.round(verdict.tr.total) : null,
      undo: undo.length, redo: redo.length, library: custom ? custom.list().map((i) => i.id) : [],
    };
  }

  return { init, open, close, isOpen, state, preview: runPreview, randomise, freehand, applyStamp, reverse, setStart, deletePoint, undo: doUndo, redo: doRedo, setTheme, setWidth, setName, setTool, save, race, load, TOOLS };
})();
Object.freeze(TrackDesigner);
