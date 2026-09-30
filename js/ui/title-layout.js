/* Apex 26 — TitleLayout: where the title screen's three pieces sit and how big
   they are, as a player setting under SETTINGS › APPEARANCE › TITLE SCREEN ›
   TITLE LAYOUT.

   TITLE LAYOUT is a sub-fold this file builds inside the shell's TITLE SCREEN
   fold (#pm-titlescreen), whose summary it also paints: SHIPPED while this
   layout and js/ui/title-fx.js's TITLE INTRO / MENU WASH / TITLE ART are all
   shipped, CUSTOM otherwise.

   The three pieces are the BUTTONS (#menu-buttons), the TITLE (#menu-brand:
   wordmark, sound toggle, small print) and the CAR DRAWING (#title-car). Each
   moves on X and Y (percent of the screen) and scales (SIZE). The buttons also
   take a WIDTH (a share of the screen, or AUTO for the shipped width), a
   LAYOUT (GRID is the shipped 2x2 of play modes; STACK is one door per line;
   ROW puts the play modes side by side) and a SIDE (SWAPPED trades the title's
   and the buttons' columns, or their order on a tall screen).

   ONE stored object, apex26.titleLayout, holding ONE LAYOUT PER SHAPE:
   {v: 2, wide, tall} — landscape and portrait lay the title screen out so
   differently (two columns vs three bands) that one set of offsets could not
   suit both. A missing shape is shipped; a v1 object (one layout, no `v`, as
   PR #519 stored it) reads as BOTH shapes. The shape is body[data-shape]
   (index.html's boot answers first, js/ui/sheet-shape.js every later time),
   and a rotation re-applies. Untouched it is null and NOTHING is written to
   the page — the shipped title screen stays byte-for-byte what it was, and no
   rule in css/responsive.css's TITLE LAYOUT block matches. Custom, the current
   shape's layout lands as --tl-* tokens on :root plus html[data-title-layout]
   (and data-title-side / data-title-btns for the two choices), so CSS keys off
   attributes and reads numbers from tokens. index.html's inline boot applies
   the FIRST answer with the same arithmetic (tests/unit/title-layout.test.mjs
   holds the two copies equal); this file owns every later one.

   PEEK: the title screen is faded out under the settings dialog, so a slider
   would move things nobody can see. While a layout slider is held (or just
   moved), body[data-tl-peek] shows the title screen through a near-transparent
   settings page.

   EDIT ON TITLE SCREEN: the fold's button hides the settings page and lets
   the player drag the three pieces where they want them (#tl-editor, a small
   docked toolbar; html[data-tl-edit] outlines the pieces). DONE gives the
   settings page back.

   Needs GameStore at eval (HARD_EDGES). SettingRow is read when the page is
   built, not at eval. */
const TitleLayout = (function () {
  "use strict";

  const KEY = "titleLayout";   // apex26.titleLayout — {v: 2, wide, tall} | null
  const PARTS = ["btns", "title", "art"];
  const LAYOUTS = [["grid", "GRID"], ["stack", "STACK"], ["row", "ROW"]];
  const SIDES = [["auto", "AUTO"], ["swap", "SWAPPED"]];
  const LIM = Object.freeze({ x: [-50, 50], y: [-50, 50], size: [50, 200], width: [0, 100] });
  const DEFAULT = Object.freeze({
    btns: Object.freeze({ x: 0, y: 0, size: 100, width: 0 }),
    title: Object.freeze({ x: 0, y: 0, size: 100 }),
    art: Object.freeze({ x: 0, y: 0, size: 100 }),
    layout: "grid", side: "auto",
  });
  const SHAPES = ["wide", "tall"];
  const SHAPE_NAMES = { wide: "LANDSCAPE", tall: "PORTRAIT" };
  const store = GameStore.store;
  const doc = typeof document !== "undefined" ? document : null;
  const root = doc ? doc.documentElement : null;

  const num = (v, k) => {
    const [lo, hi] = LIM[k];
    const n = typeof v === "number" && isFinite(v) ? Math.round(v) : DEFAULT.btns[k];   // btns carries every key
    // WIDTH: 0 is AUTO; anything else is at least 20 % of the screen.
    if (k === "width") return n <= 0 ? 0 : Math.max(20, Math.min(hi, n));
    return Math.max(lo, Math.min(hi, n));
  };
  /** Any stored value -> a complete, clamped layout. Junk reads as shipped. */
  function normalize(v) {
    const o = v && typeof v === "object" ? v : {};
    const out = {};
    for (const p of PARTS) {
      const src = o[p] && typeof o[p] === "object" ? o[p] : {};
      out[p] = {};
      for (const k of Object.keys(DEFAULT[p])) out[p][k] = num(src[k] === undefined ? DEFAULT[p][k] : src[k], k);
    }
    out.layout = LAYOUTS.some(([id]) => id === o.layout) ? o.layout : "grid";
    out.side = o.side === "swap" ? "swap" : "auto";
    return out;
  }
  function isDefault(v) { return JSON.stringify(normalize(v)) === JSON.stringify(normalize(null)); }
  /** Both shapes shipped — what the TITLE LAYOUT summary calls SHIPPED. */
  function layoutShipped() { const a = all(); return isDefault(a.wide) && isDefault(a.tall); }

  /** The tokens a layout writes — the SAME arithmetic index.html's inline boot
   *  does. X is vw, Y is vh, SIZE and WIDTH are plain numbers. */
  function vars(v) {
    const l = normalize(v);
    const out = {};
    for (const p of PARTS) {
      out[`--tl-${p}-x`] = l[p].x + "vw";
      out[`--tl-${p}-y`] = l[p].y + "vh";
      out[`--tl-${p}-size`] = String(l[p].size / 100);
    }
    if (l.btns.width) out["--tl-btns-w"] = String(l.btns.width);
    return out;
  }

  const ALL_VARS = Object.keys(vars({ btns: { width: 50 } }));
  /** The shape the title screen is laid out in right now: body[data-shape]. */
  function shape() {
    return doc && doc.body && doc.body.getAttribute("data-shape") === "tall" ? "tall" : "wide";
  }
  const isShape = (s) => s === "wide" || s === "tall";
  /** Both shapes, from whatever is stored. A v1 object is BOTH shapes. */
  function all() {
    const raw = store.get(KEY, null);
    if (raw && typeof raw === "object" && raw.v === 2) return { wide: normalize(raw.wide), tall: normalize(raw.tall) };
    return { wide: normalize(raw), tall: normalize(raw) };
  }
  function save(a) {
    const out = { v: 2 };
    for (const s of SHAPES) if (!isDefault(a[s])) out[s] = normalize(a[s]);   // a missing shape is shipped
    store.set(KEY, out.wide || out.tall ? out : null);
  }
  function current(sh) { return all()[isShape(sh) ? sh : shape()]; }
  /** Write one layout (default: the current shape's) onto the page. */
  function apply(v = current()) {
    if (!root) return;
    const l = normalize(v);
    for (const k of ALL_VARS) root.style.removeProperty(k);
    delete root.dataset.titleLayout; delete root.dataset.titleSide; delete root.dataset.titleBtns; delete root.dataset.titleBtnw;
    if (isDefault(l)) return;
    const t = vars(l);
    for (const k in t) root.style.setProperty(k, t[k]);
    root.dataset.titleLayout = "on";
    if (l.side === "swap") root.dataset.titleSide = "swap";
    if (l.layout !== "grid") root.dataset.titleBtns = l.layout;
    if (l.btns.width) root.dataset.titleBtnw = "on";
  }
  /** Store `v` as one shape's layout (default: the current shape). */
  function set(v, sh) {
    const s = isShape(sh) ? sh : shape();
    const a = all();
    a[s] = normalize(v);
    save(a);
    if (s === shape()) apply(a[s]);
    return a[s];
  }
  function resetShape(sh) { return set(null, sh); }
  /** RESET ALL: both shapes back to shipped. */
  function reset() { store.set(KEY, null); apply(null); return normalize(null); }
  /** COPY TO `to`: the OTHER shape's layout becomes `to`'s too. */
  function copyTo(to) {
    const s = to === "tall" ? "tall" : "wide";
    return set(current(s === "tall" ? "wide" : "tall"), s);
  }

  apply();   // at eval: index.html painted the first answer; this owns the rest
  // A ROTATION re-applies: sheet-shape.js flips body[data-shape] and the other
  // shape's layout takes over (the fold and the editor repaint through onShape).
  const onShape = [];
  if (doc && doc.body && typeof MutationObserver !== "undefined") {
    new MutationObserver(() => { apply(); for (const fn of onShape) fn(); })
      .observe(doc.body, { attributes: true, attributeFilter: ["data-shape"] });
  }

  // ---- the APPEARANCE fold -------------------------------------------------
  let peekT = 0;
  function peek(on, holdMs) {
    if (typeof document === "undefined" || !document.body) return;
    clearTimeout(peekT);
    if (on) document.body.setAttribute("data-tl-peek", "");
    if (!on || holdMs) peekT = setTimeout(() => document.body.removeAttribute("data-tl-peek"), on ? holdMs : 0);
  }

  const pctTxt = (k, n) => {
    if (k === "size") return n + "%";
    if (k === "width") return n ? n + "% of screen" : "AUTO";
    if (!n) return "CENTRE";
    if (k === "x") return Math.abs(n) + "% " + (n < 0 ? "left" : "right");
    return Math.abs(n) + "% " + (n < 0 ? "up" : "down");
  };
  const NAMES = { size: "SIZE", width: "WIDTH", x: "LEFT / RIGHT", y: "UP / DOWN" };

  /** The whole title screen shipped: this layout AND TitleFx's three looks
   *  (TitleFx loads first; MOTION is global, so it does not count here). */
  function screenShipped() {
    const fx = typeof TitleFx !== "undefined" ? TitleFx : null;
    return layoutShipped() && (!fx || (fx.introMode() === "full" && fx.washMode() === "full" && fx.artMode() === "on"));
  }
  /** APPEARANCE › TITLE SCREEN's closed summary (the shell's #pm-titlescreen-sum). */
  function paintScreenSum() {
    const sum = doc && doc.getElementById("pm-titlescreen-sum");
    if (sum) sum.textContent = "TITLE SCREEN · " + (screenShipped() ? "SHIPPED" : "CUSTOM");
  }

  function build() {
    const panel = document.getElementById("pm-panel-appearance");
    if (!panel || document.getElementById("pm-titlelayout")) return;
    Log.info("ui", "TitleLayout.build");
    const d = document;
    const el = (tag, props, kids) => {
      const e = d.createElement(tag);
      for (const k in props || {}) {
        if (k === "attrs") { for (const a in props.attrs) e.setAttribute(a, props.attrs[a]); } else e[k] = props[k];
      }
      for (const c of kids || []) e.appendChild(c);
      return e;
    };
    const sum = el("summary", { id: "pm-titlelayout-sum", className: "adv-more-btn" });
    const body = el("div", { id: "pm-titlelayout-body", attrs: { role: "group", "aria-label": "Title screen layout" } });
    const fold = el("details", { className: "pm-renderer-sub" }, [sum, body]);
    fold.id = "pm-titlelayout";   // a plain assignment, so tools/check/shell-ids.mjs sees the mount-once guard's target
    const paintSum = () => {
      sum.textContent = "TITLE LAYOUT · " + (layoutShipped() ? "SHIPPED" : "CUSTOM");
      paintScreenSum();
    };

    body.appendChild(el("p", { className: "adv-help", textContent:
      "Move and size the title screen's buttons, title and car drawing. Landscape and portrait keep a layout each; " +
      "these controls edit the shape the screen is in now. Hold a slider to see the title screen through this page." }));
    const shapeLine = el("p", { id: "pm-tl-shape", className: "adv-help", attrs: { "aria-live": "polite", "data-help": "keep" } });
    body.appendChild(shapeLine);

    const sliders = [];
    function slider(part, k) {
      const id = `pm-tl-${part}-${k}`;
      const out = el("b", { id: id + "-v" });
      const inp = el("input", { id, type: "range", min: String(LIM[k][0]), max: String(LIM[k][1]), step: "1",
        attrs: { "aria-label": `${part === "btns" ? "Buttons" : part === "title" ? "Title" : "Car drawing"} ${NAMES[k].toLowerCase()}` } });
      const paint = () => {
        const n = current()[part][k];
        if (d.activeElement !== inp) inp.value = String(n);
        out.textContent = pctTxt(k, n);
      };
      inp.addEventListener("input", () => {
        const l = current();
        l[part][k] = num(parseFloat(inp.value), k);
        set(l); out.textContent = pctTxt(k, l[part][k]); paintSum();
        peek(true, 900);
      });
      inp.addEventListener("pointerdown", () => peek(true));
      inp.addEventListener("pointerup", () => peek(true, 500));
      inp.addEventListener("pointercancel", () => peek(false));
      sliders.push(paint);
      body.appendChild(el("label", { className: "tune-row" }, [
        el("span", { className: "tune-label" }, [el("span", { textContent: NAMES[k] + " " }), out]), inp]));
    }
    const rows = [];   // [row, key] — held, not looked up again by a built id
    function choice(id, label, values, key, help) {
      if (typeof SettingRow === "undefined") return;
      const r = SettingRow.build(id, label, values);
      SettingRow.wire(r.row, {
        read: () => current()[key],
        write: (v) => { const l = current(); l[key] = v; set(l); paintSum(); peek(true, 1200); },
      });
      body.appendChild(r.row);
      rows.push([r.row, key]);
      body.appendChild(el("p", { className: "adv-help", textContent: help }));
    }

    body.appendChild(el("h4", { className: "pm-look-h", textContent: "BUTTONS" }));
    choice("pm-tl-layout", "LAYOUT", LAYOUTS, "layout",
      "GRID is the shipped two-by-two of play modes. STACK gives every door its own line; ROW puts the play modes side by side.");
    choice("pm-tl-side", "SIDE", SIDES, "side",
      "SWAPPED trades the buttons' and the title's sides (on a tall screen, the buttons go on top).");
    for (const k of ["size", "width", "x", "y"]) slider("btns", k);
    body.appendChild(el("h4", { className: "pm-look-h", textContent: "TITLE" }));
    for (const k of ["size", "x", "y"]) slider("title", k);
    body.appendChild(el("h4", { className: "pm-look-h", textContent: "CAR DRAWING" }));
    for (const k of ["size", "x", "y"]) slider("art", k);

    const tap = (id, text, fn) => {
      const b = el("button", { id, type: "button", textContent: text });
      b.addEventListener("click", () => {
        fn(); paintAll(); peek(true, 1200);
        try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); } catch (_) { /* audio optional */ }
      });
      return b;
    };
    const copy = tap("pm-tl-copy", "", () => copyTo(shape() === "tall" ? "wide" : "tall"));
    body.appendChild(el("div", { className: "balanced-row" }, [
      copy, tap("pm-tl-reset-shape", "RESET THIS SHAPE", () => resetShape()), tap("pm-tl-reset", "RESET ALL", reset)]));
    const edit = el("button", { id: "pm-tl-edit", type: "button", textContent: "EDIT ON TITLE SCREEN…" });
    edit.addEventListener("click", () => enter());
    body.appendChild(edit);
    body.appendChild(el("p", { className: "adv-help", textContent:
      "EDIT ON TITLE SCREEN: drag a piece to move it, drag its corner dot to size it. Keys: arrows move, + and − size, [ and ] pick a piece; Tab moves through the bar." }));

    const overlay = document.getElementById("overlay");
    // Only from the title screen: mid-race (#overlay hidden) there is nothing to drag.
    const paintEdit = () => { edit.disabled = !overlay || !!overlay.hidden; };
    if (overlay && typeof MutationObserver !== "undefined")
      new MutationObserver(paintEdit).observe(overlay, { attributes: true, attributeFilter: ["hidden"] });
    function paintAll() {
      for (const p of sliders) p();
      for (const [row, key] of rows) SettingRow.paint(row, current()[key]);
      paintSum();
      const sh = shape();
      shapeLine.textContent = "EDITING: " + SHAPE_NAMES[sh];
      copy.textContent = "COPY TO " + SHAPE_NAMES[sh === "tall" ? "wide" : "tall"];
      paintEdit();
    }
    paintAll();
    onShape.push(paintAll);
    if (typeof TitleFx !== "undefined" && TitleFx.onChange) TitleFx.onChange(paintScreenSum);
    ui = { fold, edit, paintAll };

    // Inside the TITLE SCREEN fold, after TITLE ART's help line and before
    // REPLAY INTRO: the other title-screen knobs.
    const anchor = document.getElementById("pm-replay-intro");
    const host = document.getElementById("pm-titlescreen-body") || panel;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(fold, anchor);
    else host.appendChild(fold);
  }

  // ---- EDIT ON TITLE SCREEN: drag the pieces themselves ---------------------
  /* The settings page steps aside (as the ADVANCED VISUALS tools do) and the
     title screen becomes the editor: a pointer drag on a piece moves it, the
     round handle on the selected piece's corner sizes it, and #tl-editor — a
     small docked toolbar over #overlay — carries SIZE / WIDTH steps, RESET
     PIECE and DONE. Every change goes through set() for the CURRENT shape, so
     the clamps, the store and the first-paint copy are the fold's.
     THE CAR DRAWING IS pointer-events:none (it is scenery behind the doors), so
     it gets a transparent PROXY (#tl-art) laid over its box. The proxy sits in
     #overlay at z-index -1 — above the drawing, BELOW the buttons and title — so
     where they overlap, the doors win the pointer.
     A DRAG TRACKS THE POINTER: X is vw and Y is vh, but the two UI pieces are
     zoomed (--ui-scale × their SIZE) and zoom multiplies a translate, so the
     pixel delta is divided by that zoom. The drawing scales with `scale`, which
     does not touch its translate. */
  const PIECES = { btns: "BUTTONS", title: "TITLE", art: "CAR DRAWING" };
  const STEP = { size: 5, width: 5 };
  let ui = null;   // the fold, once built
  const ed = { on: false, sel: "btns", drag: null, els: null };
  const byId = (id) => doc.getElementById(id);
  const win = () => (typeof window !== "undefined" ? window : {});
  const pieceEl = (p) => (p === "art" ? ed.els.art : byId(p === "btns" ? "menu-buttons" : "menu-brand"));
  const uiScale = () => {
    try { return parseFloat(getComputedStyle(root).getPropertyValue("--ui-scale")) || 1; } catch (_) { return 1; }
  };
  const zoomOf = (p, size) => (p === "art" ? 1 : uiScale() * size / 100);

  function page(on) {
    for (const id of ["pmsettings", "pm-panel-appearance"]) { const e = byId(id); if (e) e.hidden = !on; }
  }
  function buildEditor() {
    if (ed.els) return ed.els;
    const layer = byId("tl-editor"), done = byId("tl-done"), overlay = byId("overlay");
    if (!layer || !done || !overlay) return null;
    const mk = (tag, id, text) => { const e = doc.createElement(tag); e.id = id; if (text) e.textContent = text; return e; };
    const btn = (id, text, label, fn) => {
      const b = mk("button", id, text);
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.addEventListener("click", fn);
      return b;
    };
    const name = mk("b", "tl-piece");
    name.setAttribute("aria-live", "polite");
    const sizeDn = btn("tl-size-dn", "SIZE −", "Smaller", () => nudge("size", -STEP.size));
    const sizeUp = btn("tl-size-up", "SIZE +", "Bigger", () => nudge("size", STEP.size));
    const wDn = btn("tl-width-dn", "WIDTH −", "Narrower buttons", () => nudge("width", -STEP.width));
    const wUp = btn("tl-width-up", "WIDTH +", "Wider buttons", () => nudge("width", STEP.width));
    const rst = btn("tl-reset-piece", "RESET PIECE", "Put this piece back where it ships", resetPiece);
    const handle = mk("div", "tl-handle");
    handle.setAttribute("aria-hidden", "true");
    handle.hidden = true;
    const art = mk("div", "tl-art");
    art.setAttribute("aria-hidden", "true");
    art.hidden = true;
    for (const c of [name, sizeDn, sizeUp, wDn, wUp, rst]) layer.insertBefore(c, done);   // DONE, the shell's, ends the bar
    layer.appendChild(handle);
    overlay.appendChild(art);
    done.addEventListener("click", exit);
    ed.els = { layer, done, overlay, name, wDn, wUp, handle, art };
    for (const p of Object.keys(PIECES)) {
      const e = pieceEl(p);
      if (e) e.addEventListener("pointerdown", (ev) => down(ev, p, "move"));
    }
    handle.addEventListener("pointerdown", (ev) => down(ev, ed.sel, "size"));
    doc.addEventListener("pointermove", move);
    doc.addEventListener("pointerup", up);
    doc.addEventListener("pointercancel", up);
    // Capture on #overlay: while editing, a tap on a door is a drag, never a click.
    overlay.addEventListener("click", (ev) => {
      if (!ed.on) return;
      ev.preventDefault(); ev.stopPropagation();
    }, true);
    // Capture on document, ahead of Input's window listener; MenuNav stands
    // aside for #tl-editor (js/ui/menu-nav.js activeLayer), and Escape is left
    // to data-esc-close="tl-done".
    doc.addEventListener("keydown", onKey, true);
    onShape.push(() => { if (ed.on) paintEd(); });
    return ed.els;
  }

  function enter() {
    const E = buildEditor();
    if (!E || E.overlay.hidden || ed.on) return false;
    Log.info("ui", "TitleLayout.edit " + shape());
    ed.on = true;
    peek(false);
    page(false);
    root.setAttribute("data-tl-edit", "");
    E.layer.hidden = false;
    E.art.hidden = false;
    select(ed.sel);
    return true;
  }
  function exit() {
    if (!ed.on) return;
    const E = ed.els;
    ed.on = false; ed.drag = null;
    root.removeAttribute("data-tl-edit");
    E.layer.hidden = true;
    E.art.hidden = true;
    E.handle.hidden = true;
    for (const p of Object.keys(PIECES)) { const e = pieceEl(p); if (e) e.removeAttribute("data-tl-sel"); }
    page(true);
    if (ui) {
      const outer = byId("pm-titlescreen");
      if (outer) outer.open = true;   // the sub-fold lives inside TITLE SCREEN
      ui.fold.open = true;
      ui.paintAll();
      // After the settings dialog's own re-show handling, which focuses its
      // CLOSE door: DONE hands focus back to the button that opened the editor.
      const f = () => ui.edit.focus();
      if (typeof setTimeout === "function") setTimeout(f, 0); else f();
    }
  }

  function select(p) {
    ed.sel = PIECES[p] ? p : "btns";
    for (const k of Object.keys(PIECES)) {
      const e = pieceEl(k);
      if (e) { if (k === ed.sel) e.setAttribute("data-tl-sel", ""); else e.removeAttribute("data-tl-sel"); }
    }
    paintEd();
  }
  function cycle(dir) {
    const keys = Object.keys(PIECES);
    select(keys[(keys.indexOf(ed.sel) + dir + keys.length) % keys.length]);
  }
  /** One step of one number on the selected piece. WIDTH from AUTO starts at
   *  the width the buttons have now; under 20 % it goes back to AUTO. */
  function nudge(k, d) {
    if (!ed.on) return;
    const l = current(), p = l[ed.sel];
    if (k === "width") {
      if (ed.sel !== "btns") return;
      const r = pieceEl("btns").getBoundingClientRect();
      const w = (p.width || Math.round(r.width / (win().innerWidth || 1) * 100)) + d;
      p.width = w < 20 ? 0 : num(w, "width");
    } else p[k] = num(p[k] + d, k);
    set(l);
    paintEd();
  }
  function resetPiece() {
    if (!ed.on) return;
    const l = current();
    l[ed.sel] = Object.assign({}, DEFAULT[ed.sel]);
    set(l);
    paintEd();
  }

  /** The toolbar's readout, the proxy over the drawing and the corner handle,
   *  all re-measured after a change (the tokens have just moved the piece). */
  function paintEd() {
    const E = ed.els;
    if (!E || !ed.on) return;
    const p = current()[ed.sel];
    E.name.textContent = PIECES[ed.sel] + " · " + SHAPE_NAMES[shape()] + " · " + p.size + "%" +
      (ed.sel === "btns" ? " · " + (p.width ? p.width + "% WIDE" : "AUTO WIDTH") : "");
    E.wDn.disabled = E.wUp.disabled = ed.sel !== "btns";
    const car = byId("title-car"), r = car ? car.getBoundingClientRect() : null;
    if (r && r.width >= 1 && r.height >= 1) {
      const o = E.overlay.getBoundingClientRect();
      E.art.style.setProperty("left", (r.left - o.left + (E.overlay.scrollLeft || 0)) + "px");
      E.art.style.setProperty("top", (r.top - o.top + (E.overlay.scrollTop || 0)) + "px");
      E.art.style.setProperty("width", r.width + "px");
      E.art.style.setProperty("height", r.height + "px");
      E.art.hidden = false;
    } else E.art.hidden = true;   // TITLE ART off, or a shape that shows none
    const s = pieceEl(ed.sel), sr = s && !(ed.sel === "art" && E.art.hidden) ? s.getBoundingClientRect() : null;
    E.handle.hidden = !(sr && sr.width >= 1);
    if (sr) {
      E.handle.style.setProperty("left", sr.right + "px");
      E.handle.style.setProperty("top", sr.bottom + "px");
    }
  }

  function down(e, part, mode) {
    if (!ed.on || (e.button != null && e.button !== 0)) return;
    e.preventDefault(); e.stopPropagation();
    if (part !== ed.sel) select(part);
    const t = e.currentTarget || e.target;
    try { if (t && t.setPointerCapture) t.setPointerCapture(e.pointerId); } catch (_) { /* the pointer is already gone; move events still arrive */ }
    const from = Object.assign({}, current()[part]);
    let c = [e.clientX, e.clientY];
    if (mode === "size") {
      const r = pieceEl(part).getBoundingClientRect();
      c = [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
    }
    ed.drag = { id: e.pointerId, part, mode, x0: e.clientX, y0: e.clientY, from, c };
  }
  function move(e) {
    const d = ed.drag;
    if (!ed.on || !d || e.pointerId !== d.id) return;
    const l = current(), p = l[d.part], w = win();
    if (d.mode === "move") {
      const f = zoomOf(d.part, d.from.size);
      p.x = num(d.from.x + (e.clientX - d.x0) / (w.innerWidth || 1) * 100 / f, "x");
      p.y = num(d.from.y + (e.clientY - d.y0) / (w.innerHeight || 1) * 100 / f, "y");
    } else {
      // SIZE by the corner: the pointer's distance from the piece's centre,
      // against where the drag began.
      const r0 = Math.hypot(d.x0 - d.c[0], d.y0 - d.c[1]) || 1;
      p.size = num(d.from.size * Math.hypot(e.clientX - d.c[0], e.clientY - d.c[1]) / r0, "size");
    }
    set(l);
    paintEd();
  }
  function up(e) { if (ed.drag && e.pointerId === ed.drag.id) ed.drag = null; }

  function onKey(e) {
    if (!ed.on || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === "ArrowLeft" || k === "ArrowRight") nudge("x", k === "ArrowLeft" ? -1 : 1);
    else if (k === "ArrowUp" || k === "ArrowDown") nudge("y", k === "ArrowUp" ? -1 : 1);
    else if (k === "+" || k === "=") nudge("size", STEP.size);
    else if (k === "-" || k === "_") nudge("size", -STEP.size);
    // [ / ] pick the piece; Tab is left alone so the bar's buttons (WIDTH,
    // RESET PIECE, DONE) stay reachable from the keyboard.
    else if (k === "]" || k === "[") cycle(k === "[" ? -1 : 1);
    else return;
    e.preventDefault(); e.stopPropagation();
  }

  if (typeof document !== "undefined") {
    if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", build, { once: true });
    else build();
  }

  return Object.freeze({ KEY, DEFAULT, LIM, LAYOUTS, SIDES, SHAPES, normalize, isDefault, vars, shape, all, current, apply,
    set, reset, resetShape, copyTo, build, enter, exit, screenShipped, get editing() { return ed.on; } });
})();
