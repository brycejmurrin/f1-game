"use strict";
/* Live race HUD arrangement. See docs/notes/SCREEN-LOOKS-STORAGE.md. */
const HudArrange = (() => {
  const STEP = 10;     // toolbar − / + size step, %
  const MIN_SIZE = 5;  // the − step never takes a piece below this %: below it a piece can vanish and only RESET recovers
  const TOUCH_CARRIED = ["ot", "aero", "bb"];
  const MIN_CLASH = 3; // px of overlap on BOTH axes before a pair is a clash (touching is not)
  const T = 44;        // every toolbar control's touch target, CSS px — fixed chrome, never scaled (#5198)
  const BAR_H = T + 2 * 2 + 2 * 2;   // the one-row strip: 44 px controls + 2 px padding + 2 px border, each side = 52
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

  /** Pure: offsets {x, y} (share of the screen, %) after a drag of (dx, dy) screen px on a W x H screen. */
  function dragTo(orig, dx, dy, W, H) {
    const x = finite(orig && orig.x, 0), y = finite(orig && orig.y, 0);
    return { x: finite(x + (dx / Math.max(1, W)) * 100, x), y: finite(y + (dy / Math.max(1, H)) * 100, y) };
  }
  /** Pure: a positive finite size after a pinch, without visual bounds. */
  function pinchTo(s0, d0, d1) {
    if (!(d0 > 0) || !(d1 > 0)) return s0;
    const next = s0 * (d1 / d0);
    return Number.isFinite(next) && next > 0 ? next : s0;
  }
  // Layout pieces and individual toggles share HudLayout's mapping. The
  // tower remains a group, while race messages and flags are event-driven.
  /** Pure: s (%) stepped by `dir` (±1) on the toolbar's step. */
  const stepSize = (s, dir) => {
    const next = dir < 0 && s <= STEP ? Math.max(MIN_SIZE, s / 2) : s + dir * STEP;
    return Number.isFinite(next) && next > 0 ? next : s;
  };
  /** Pure: the painted size (%) of a widget stored at `s` under CSS zoom `z` (#5256): `--hl-s` is a `scale`, the band
   *  zoom (fit-capped, or raw HUD SIZE once adopted) multiplies it, so the stored 63.76 at HUD 155 % reads 98.99 %. */
  const paintedSize = (s, z) => Number((s * (z > 0 && Number.isFinite(z) ? z : 1)).toPrecision(4));   // 4 digits, as the stored readout had; a tiny size stays > 0
  /** Pure: every pair of rects [{id, l, t, r, b}] that overlap by more than `min` px on both axes.
   *  Pairs are [a.id, b.id] in input order; a pair where neither id starts with "#" is two HUD pieces. */
  function clashes(rects, min) {
    const m = min == null ? MIN_CLASH : min, out = [];
    for (let i = 0; i < rects.length; i++) {
      const a = rects[i];
      if (!a || !(a.r > a.l) || !(a.b > a.t)) continue;
      for (let j = i + 1; j < rects.length; j++) {
        const b = rects[j];
        if (!b || !(b.r > b.l) || !(b.b > b.t)) continue;
        const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ox > m && oy > m) out.push([a.id, b.id]);
      }
    }
    return out;
  }

  /** Pure: where the w x h toolbar docks inside `bounds` ({left, top, right, bottom}, the safe box) given the
   *  painted rects [{id, l, t, r, b}] and the selected id. Six EDGE slots only (top / bottom x centre / left /
   *  right): the old middle slot sat over the car and, for one rectangle, can never cover less of it than an edge.
   *  Ranked, in order: the least area of the SELECTED widget covered (the player is judging it, #5198); the least
   *  other HUD covered; the far side from the selected widget. Returns {l, t}. */
  function barSlot(bounds, w, h, rects, sel) {
    const W = bounds.right - bounds.left;
    const cx = bounds.left + (W - w) / 2, top = bounds.top, bottom = bounds.bottom - h;
    const slots = [
      { l: cx, t: top }, { l: cx, t: bottom },
      { l: bounds.left, t: top }, { l: bounds.right - w, t: top },
      { l: bounds.left, t: bottom }, { l: bounds.right - w, t: bottom },
    ];
    const list = Array.isArray(rects) ? rects : [];
    const own = list.find((r) => r && r.id === sel) || null;
    const area = (q, r) => Math.max(0, Math.min(q.l + w, r.r) - Math.max(q.l, r.l)) * Math.max(0, Math.min(q.t + h, r.b) - Math.max(q.t, r.t));
    let best = slots[0], bestKey = null;
    for (const q of slots) {
      let other = 0;
      for (const r of list) if (r && r !== own) other += area(q, r);
      const near = own ? -Math.hypot(q.l + w / 2 - (own.l + own.r) / 2, q.t + h / 2 - (own.t + own.b) / 2) : 0;
      const key = [own ? area(q, own) : 0, other, near];
      let better = !bestKey;
      for (let i = 0; !better && i < key.length; i++) { if (key[i] !== bestKey[i]) { better = key[i] < bestKey[i]; break; } }
      if (better) { best = q; bestKey = key; }
    }
    return { l: best.l, t: best.t };
  }

  function create(G) {
    if (typeof document === "undefined" || typeof HudLayout === "undefined" || !HudLayout.ELEMENTS) return null;
    Log.info("ui", "HudArrange.create");
    const { $ } = G;   // game.js's literal-id lookup (no dynamic getElementById here: tree ratchet)
    const ELEMENTS = HudLayout.ELEMENTS;   // [id, label, selector, origin]
    let editing = false;
    let drag = null;       // { id, pid, startX, startY, orig }
    let pinch = null;      // { id, pid, d0, s0 } — the second pointer
    const pointers = new Map();   // pointerId -> {x, y}
    let selected = null;   // the id last touched; the toolbar's − / + / RESET act on it
    let raf = 0, reflow = 0, pending = null, context = null, opener = null;
    let shown = null;      // dialogs WE hid: { settings, pause }
    let preview = null;    // title-screen HUD shell visibility, never saved as a preference
    let revealed = [];     // [{ el, hidden, text:[{el, text}] }] pieces we unhid with sample content
    let move, bar = null, nameEl = null, hintEl = null, picker = null, visibilityRow = null;
    let expanded = false, coarse = false, metricPicker, metric = "s";
    const metricUnits = {width: "vw", minHeight: "vh", textSize: "%"};
    const moveControls = [], sizeControls = [], history = [];
    let initial, visibilityDraft = {}, undo;
    function visibility(id) {
      const state = HudLayout.visibility(id);
      return state && visibilityDraft[id] ? { ...state, value: visibilityDraft[id] } : state;
    }
    const snapshot = () => ({ layout: HudLayout.arrangeSnapshot(context.set, context.profile), choices: {...visibilityDraft}, colors: HudLayout.colors?.snapshot() });
    function remember() {
      const snap = snapshot(), last = history[history.length - 1];
      if (last && JSON.stringify(last) === JSON.stringify(snap)) return;
      if (history.length >= 64) history.shift();
      history.push(snap);
    }
    /* An edit that changed nothing (a − at the size floor, a nudge into the same place) leaves no undo entry. */
    function dropIfUnchanged() {
      const last = history[history.length - 1];
      if (last && JSON.stringify(last) === JSON.stringify(snapshot())) history.pop();
    }
    function undoEdit() {
      if (!history.length) return;
      pending = null; paint(); drag = null; pinch = null; pointers.clear();
      const previous = history.pop();
      HudLayout.restoreSnapshot(context.set, context.profile, previous.layout);
      visibilityDraft = previous.choices;
      HudLayout.colors?.preview(previous.colors);
      if (colorPart) paintColor();
      ghosts(); after();
    }
    let colorElement, colorPart, colorInput, colorReset;
    function paintColor() {
      const value = HudLayout.colors.read()[colorPart.value];
      colorInput.value = value || "#ffffff";
      colorReset.disabled = !value;
    }
    function selectColors() {
      if (!colorPart || selected === colorElement) return;
      colorElement = selected;
      colorPart.textContent = "";
      for (const part of HudLayout.colors.options(selected)) {
        const option = document.createElement("option");
        option.value = part.id;
        option.textContent = part.label;
        colorPart.appendChild(option);
      }
      paintColor();
    }

    const hasEls = () => typeof HudElements !== "undefined" && HudElements && typeof HudElements.isOn === "function";

    const elOf = (id) => { const row = ELEMENTS.find((e) => e[0] === id); return row ? document.querySelector(row[2]) : null; };
    const labelOf = (id) => { const row = ELEMENTS.find((e) => e[0] === id); return row ? row[1] : id; };
    const visible = (el) => { if (!el || el.hidden) return false; const r = el.getBoundingClientRect(); return !!(r.width && r.height); };
    const idAt = (t) => {
      if (!t || !t.closest) return null;
      for (const [id, , sel] of ELEMENTS) { const el = t.closest(sel); if (el) return id; }
      return null;
    };

    // Fixed chrome stays at 44px even when the HUD is zoomed.
    const ctl = "box-sizing:border-box;flex:none;height:" + T + "px;min-height:" + T + "px;max-height:" + T + "px;margin:0;" +
      "font:inherit;font-weight:700;color:inherit;border:1px solid var(--text,#fff);border-radius:6px;";
    const selectCss = ctl + "-webkit-appearance:none;appearance:none;padding:0 20px 0 8px;line-height:normal;" +
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background-color:var(--bg,#111);" +
      "background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);" +
      "background-position:right 11px center,right 6px center;background-size:5px 5px;background-repeat:no-repeat;";
    function ensureBar() {
      if (bar || !document.body || !document.body.appendChild) return;
      bar = document.createElement("div");
      bar.id = "hud-arrange-bar";
      bar.setAttribute("role", "toolbar");
      bar.setAttribute("aria-label", "Arrange HUD");
      bar.setAttribute("data-esc-close", "hud-arrange-cancel");
      bar.style.cssText = "position:fixed;z-index:9999;" +
        "display:flex;flex-wrap:nowrap;box-sizing:border-box;align-items:center;gap:4px;padding:2px 4px;border-radius:8px;" +
        "background:var(--bg,#111);color:var(--text,#fff);border:2px solid var(--text,#fff);" +
        "font-family:inherit;font-size:13px;line-height:1.15;letter-spacing:0.02em;width:max-content;" +
        "max-width:calc(100vw - 24px - 2 * max(var(--sal,0px),var(--sar,0px)));max-height:calc(100svh - 24px - 2 * max(var(--sat,0px),var(--sab,0px)));" +
        "overflow:auto;scrollbar-width:none;";
      const mk = (txt, aria, fn, id) => {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = txt; b.id = id;
        b.setAttribute("aria-label", aria);
        b.style.cssText = ctl + "min-width:" + T + "px;padding:0 8px;background:none;white-space:nowrap;";
        b.onclick = fn;
        return b;
      };
      nameEl = document.createElement("output");
      nameEl.id = "hud-arrange-name";
      nameEl.setAttribute("aria-label", "Selected element size");
      nameEl.setAttribute("aria-live", "off");   // <output> is an implicit live region; it is rewritten every gesture frame
      nameEl.style.cssText = "flex:none;font-weight:800;max-width:14ch;line-height:1.15;overflow-wrap:anywhere;";
      hintEl = document.createElement("span");
      hintEl.id = "hud-arrange-hint";
      hintEl.setAttribute("aria-live", "polite");
      // Two lines at most: the reason a row is greyed must still be READ on a phone (#2852), never grow the strip.
      hintEl.style.cssText = "color:var(--dim,#bbb);font-size:11px;line-height:1.2;max-height:2.4em;overflow:hidden;" +
        "white-space:normal;overflow-wrap:anywhere;flex:1 1 0;min-width:72px;";   // no inline display: [hidden] must still win
      picker = document.createElement("select");
      picker.id = "hud-arrange-element";
      picker.setAttribute("aria-label", "HUD element; use arrow keys on Controls to position");
      picker.setAttribute("data-arrows", "own");
      picker.style.cssText = selectCss + "width:128px;";
      picker.onchange = () => { flush(); selected = picker.value; after(); };
      bar.appendChild(picker);
      move = mk("Controls", "Layout controls", () => {
        expanded = !expanded;
        after();
      }, "hud-arrange-move");
      move.setAttribute("data-arrows", "own");
      bar.appendChild(move);
      for (const [label, x, y] of [["Left", -1, 0], ["Right", 1, 0], ["Up", 0, -1], ["Down", 0, 1]]) {
        moveControls.push(mk(label, "Move " + label.toLowerCase(), () => nudge(x, y, coarse ? 5 : 1), "hud-arrange-" + label.toLowerCase()));
      }
      const step = mk("Fine", "Toggle fine or coarse movement", () => {
        coarse = !coarse;
        step.textContent = coarse ? "Coarse" : "Fine";
        step.setAttribute("aria-pressed", String(coarse));
      }, "hud-arrange-step");
      step.setAttribute("aria-pressed", "false");
      moveControls.push(step, mk("Reset HUD", "Reset HUD: restore this HUD profile and camera group", () => {
        flush();
        remember(); HudLayout.resetSet(context.set, context.profile, true);
        after("Restored " + context.profile + " · " + context.set);
      }, "hud-arrange-reset-screen"));
      for (const control of moveControls) { control.hidden = true; bar.appendChild(control); }
      bar.appendChild(nameEl);
      bar.appendChild(hintEl);
      const smaller = mk("−", "Smaller", () => size(-1), "hud-arrange-smaller"), larger = mk("+", "Larger", () => size(1), "hud-arrange-larger");
      metricPicker = document.createElement("select");
      metricPicker.id = "hud-arrange-metric";
      metricPicker.setAttribute("aria-label", "HUD panel adjustment");
      metricPicker.setAttribute("data-arrows", "own");
      metricPicker.style.cssText = selectCss;
      for (const [value, label] of [["s", "Scale"], ["width", "Width"], ["minHeight", "Min height"], ["textSize", "Text size"]]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        metricPicker.appendChild(option);
      }
      metricPicker.onchange = () => { metric = metricPicker.value; after(); };
      bar.appendChild(metricPicker);
      bar.appendChild(smaller);
      bar.appendChild(larger);
      const recover = mk("BRING INTO VIEW", "Bring into view: move the selected element on screen without changing its size", bringIntoView, "hud-arrange-recover");
      recover.setAttribute("aria-describedby", "hud-arrange-hint");
      // The one long label wraps to two 11 px lines inside its 44 px box instead of widening the strip.
      recover.style.whiteSpace = "normal"; recover.style.width = "72px"; recover.style.fontSize = "11px"; recover.style.padding = "0 4px";
      bar.appendChild(recover);
      const reset = mk("RESET", "Reset this element to the shipped layout", () => { if (selected) { flush(); remember(); HudLayout.resetEl(selected, context.set, context.profile, true); after(); } }, "hud-arrange-reset");
      bar.appendChild(reset);
      sizeControls.push(smaller, larger, recover, reset);
      visibilityRow = document.createElement("label");
      // No visible "VISIBILITY" caption: the select names itself (aria-label) and paints SHOW / HIDE / AUTO.
      visibilityRow.style.cssText = "display:flex;flex:none;align-items:center;";
      const visibilityPick = document.createElement("select");
      visibilityPick.id = "hud-arrange-vis";
      visibilityPick.setAttribute("aria-label", "Selected element visibility");
      visibilityPick.setAttribute("data-arrows", "own");
      // Its hint line carries the reason the row is greyed (UI audit 2026-10-18).
      visibilityPick.setAttribute("aria-describedby", "hud-arrange-hint");
      visibilityPick.style.cssText = selectCss + "width:76px;";
      visibilityRow.appendChild(visibilityPick);
      SettingRow.wire(visibilityRow, { values: [], read: () => visibility(selected)?.value || "", write: (value) => {
        flush(); remember();
        if (value === HudLayout.visibility(selected)?.value) delete visibilityDraft[selected];
        else visibilityDraft[selected] = value;
        ghosts(); after();
      } });
      bar.appendChild(visibilityRow);
      if (HudLayout.colors) {
        colorPart = document.createElement("select");
        colorPart.setAttribute("aria-label", "Color to edit for selected HUD element");
        colorPart.style.cssText = "max-width:100%;min-height:44px;font:inherit";
        colorPart.onchange = paintColor;
        colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.setAttribute("aria-label", "Selected HUD color");
        colorInput.style.cssText = "width:44px;height:44px";
        colorInput.onchange = () => { remember(); HudLayout.colors.save(colorPart.value, colorInput.value); paintColor(); };
        colorReset = mk("DEFAULT COLOR", "Default color: restore this color", () => {
          remember();
          HudLayout.colors.save(colorPart.value, null);
          paintColor();
        }, "hud-arrange-color-reset");
        bar.appendChild(colorPart);
        bar.appendChild(colorInput);
        bar.appendChild(colorReset);
        sizeControls.push(colorPart, colorInput, colorReset);
      }
      undo = mk("Undo", "Undo last HUD edit", undoEdit, "hud-arrange-undo");
      bar.appendChild(undo);
      bar.appendChild(mk("Cancel", "Cancel: discard HUD edits", () => setEditing(false, true, false), "hud-arrange-cancel"));
      bar.appendChild(mk("Apply", "Apply HUD edits", () => setEditing(false), "hud-arrange-done"));
      bar.hidden = true;
      document.body.appendChild(bar);
      if (typeof TopModal !== "undefined" && TopModal.wireLayer) TopModal.wireLayer(bar);
    }
    /* Dock the strip to an edge away from the selected widget (#5198); see barSlot. */
    function placeBar(rects) {
      if (!bar) return;
      const bounds = HudLayout.screenBounds(window.innerWidth, window.innerHeight, 8);
      const W = Math.max(0, bounds.right - bounds.left), H = Math.max(0, bounds.bottom - bounds.top);
      bar.style.maxWidth = W + "px"; bar.style.maxHeight = H + "px";
      // One row whenever one row fits; wrap only when it cannot (a portrait phone), never to "use" spare height.
      bar.style.flexWrap = "nowrap";
      if (bar.scrollWidth > W + 1) bar.style.flexWrap = "wrap";
      const size = bar.getBoundingClientRect();
      const slot = barSlot(bounds, size.width, size.height, rects, selected);
      for (const k of ["top", "bottom", "left", "right"]) bar.style.removeProperty(k);
      bar.style.transform = "none";
      bar.style.left = slot.l + "px"; bar.style.top = slot.t + "px";
    }
    function sizeLabel(id, size) {
      const relative = HudLayout.relativeSize(size, id, context.set, context.profile);
      const painted = paintedSize(size, elOf(id)?.currentCSSZoom);
      return relative === painted ? relative + "%" : relative + "% · " + painted + "% painted";
    }
    function paintBar(clash, message, rects) {
      if (!bar) return;
      selectColors();
      const cur = selected ? current(selected) : null;
      if (picker && selected) picker.value = selected;
      const card = HudLayout.cardSizing?.(selected);
      if (!card) metric = "s";
      metricPicker.value = metric;
      metricPicker.hidden = !expanded || !card;
      let reading = "";
      if (cur && metric === "s") reading = sizeLabel(selected, cur.s);
      else if (cur && cur[metric] != null) reading = cur[metric] + metricUnits[metric];
      else if (cur) reading = metric === "textSize" ? "100%" : "Auto";
      nameEl.textContent = reading;
      nameEl.hidden = !cur;
      undo.disabled = !history.length;
      const vis = selected && visibility(selected);
      const off = vis && vis.value === "off";
      hintEl.textContent = message || (clash && clash.length ? "OVERLAP: " + clash.slice(0, 2).map((p) => p.map(labelOf).join(" × ")).join(", ")
        : off ? "hidden in the race \u00b7 SHOW brings it back"
        : vis && vis.value === "mixed" ? "some tower readouts are hidden"
        : selected && !vis ? "shown automatically with race events"
        : "");
      hintEl.hidden = !hintEl.textContent;
      if (visibilityRow) {
        SettingRow.paint(visibilityRow, vis ? vis.value : "", vis ? vis.choices : []);
        SettingRow.disable(visibilityRow, !vis);
        visibilityRow.title = vis ? "" : "Shown automatically with race events";
      }
      for (const control of moveControls) control.hidden = !expanded;
      move.setAttribute("aria-expanded", String(expanded));
      for (const el of sizeControls) el.hidden = !expanded;
      undo.hidden = visibilityRow.hidden = !expanded;
      if (!expanded) nameEl.hidden = hintEl.hidden = true;
      placeBar(rects || rectsNow());
    }

    /* ---- clash marks: HUD pieces against each other and against the touch controls ---- */
    function rectsNow() {
      const out = [];
      for (const [id, , sel] of ELEMENTS) {
        const el = document.querySelector(sel);
        if (!visible(el)) continue;
        const r = HudLayout.maxRect ? HudLayout.maxRect(id, el) : el.getBoundingClientRect();   // at its widest race content: SECTORS "--" grows at S1 (#5678)
        out.push({ id, l: r.left, t: r.top, r: r.right, b: r.bottom });
      }
      const ctl = document.querySelectorAll("#hud-dock .touchbtn:not([hidden]), #pausebtn, #btn-cam");
      for (let i = 0; i < ctl.length; i++) {
        const el = ctl[i];
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        out.push({ id: "#" + (el.id || el.className), l: r.left, t: r.top, r: r.right, b: r.bottom });
      }
      return out;
    }
    function markClashes(rects) {
      rects = rects || rectsNow();
      const pairs = clashes(rects);
      const hot = new Set();
      for (const [a, b] of pairs) { hot.add(a); hot.add(b); }
      for (const [id, , sel] of ELEMENTS) {
        const el = document.querySelector(sel);
        if (!el) continue;
        if (hot.has(id)) el.setAttribute("data-hl-clash", "");
        else if (el.hasAttribute("data-hl-clash")) el.removeAttribute("data-hl-clash");
      }
      return pairs.map((p) => p.map((id) => (id[0] === "#" ? id.slice(1).toUpperCase() : id)));
    }
    function after(message) {
      if (typeof RetiredCard !== "undefined") RetiredCard.preview(editing && selected === "finish");
      if (typeof GameHud !== "undefined" && GameHud && GameHud.invalidateFit) GameHud.invalidateFit();
      const rects = rectsNow();
      paintBar(markClashes(rects), message, rects);
    }
    const current = (id) => HudLayout.get(id, context.set, context.profile);
    function dragOrig(id) {
      const orig = current(id), el = elOf(id);
      if (!el || el.hasAttribute("data-hl-v4")) return orig;
      // Adopt the painted location when handing a widget from automatic to
      // manual anchors, before a drag or size change. The finger never jumps.
      const before = el.getBoundingClientRect();
      if (!(before.width > 0 && before.height > 0)) return orig;
      HudLayout.set(id, orig, context.set, context.profile, true);
      let after = el.getBoundingClientRect();
      const size = after.width > 0 ? orig.s * before.width / after.width : orig.s;
      const base = Object.assign({}, orig, { s: Number.isFinite(size) && size > 0 ? size : orig.s });
      HudLayout.set(id, base, context.set, context.profile, true);
      after = el.getBoundingClientRect();
      const adopted = Object.assign({}, base, {
        x: orig.x + (before.left - after.left) / window.innerWidth * 100,
        y: orig.y + (before.top - after.top) / window.innerHeight * 100,
      });
      HudLayout.set(id, adopted, context.set, context.profile, true);
      return adopted;
    }
    /* A gesture frame paints only (#5031): no storage write, no layout read. The
       clash marks, the strip's slot and the one save wait for flush() at the end. */
    function paint() {
      if (raf) {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
        else clearTimeout(raf);
      }
      raf = 0;
      const p = pending; pending = null;
      if (!p) return;
      const e = HudLayout.set(p.id, p.v, p.set, p.profile, true);
      if (nameEl && e && p.id === selected && metric === "s") nameEl.textContent = sizeLabel(p.id, e.s);
    }
    function flush() { paint(); }
    /* Bind queued edits to the layout visible when the gesture started. */
    function queue(id, v) {
      if (id === "map" && v.s != null) { const orig = dragOrig(id); v = Object.assign({ x: orig.x, y: orig.y }, v); }
      if (pending && pending.id !== id) flush();
      pending = { id, set: context.set, profile: context.profile,
        v: Object.assign(pending ? pending.v : {}, v) };
      if (raf) return;
      raf = (typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16))(paint);
    }
    /* HIDDEN PIECES STAY REACHABLE WHILE ARRANGING. body[data-hud-hide] hides a
       piece with display:none, so a piece hidden here (or earlier in SETTINGS)
       could never be touched to bring it back. While the editor is on, the
       attribute comes off and each hidden piece is a dimmed ghost
       ([data-hl-off]); HudElements.apply() puts the real list back on exit. */
    function ghosts() {
      if (!hasEls()) return;
      if (document.body.dataset) delete document.body.dataset.hudHide;
      for (const [id, , sel] of ELEMENTS) {
        const el = document.querySelector(sel);
        if (!el) continue;
        if (visibility(id)?.value !== "off") { if (el.hasAttribute("data-hl-off")) el.removeAttribute("data-hl-off"); }
        else el.setAttribute("data-hl-off", "");
      }
    }
    function nudge(x, y, amount) {
      if (!selected) return;
      flush();
      remember();
      const cur = dragOrig(selected);
      const next = { x: cur.x + x * amount, y: cur.y + y * amount };
      HudLayout.set(selected, next, context.set, context.profile, true);
      dropIfUnchanged();
      after("X " + next.x.toFixed(1) + "% · Y " + next.y.toFixed(1) + "%");
    }
    function size(dir) {
      if (!selected) return;
      flush();
      remember();
      const orig = dragOrig(selected);
      let value;
      if (metric === "s") value = stepSize(orig.s, dir);
      else {
        let base = orig[metric];
        if (base == null && metric === "textSize") base = 100;
        if (base == null) {
          const el = elOf(selected), horizontal = metric === "width";
          const extent = horizontal ? el.offsetWidth : el.offsetHeight;
          const viewport = horizontal ? window.innerWidth : window.innerHeight;
          base = Math.round(extent * (el.currentCSSZoom || 1) * 100 / viewport);
        }
        value = base + dir * (metric === "textSize" ? 5 : 1) * (coarse ? 5 : 1);
      }
      HudLayout.set(selected, { ...orig, [metric]: value }, context.set, context.profile, true);
      dropIfUnchanged();
      after();
    }

    // Recovery is an explicit move, never an automatic placement constraint.
    // Keep the current size; oversized axes expose their leading edge instead
    // of shrinking a widget the player deliberately enlarged.
    function bringIntoView() {
      if (!selected) return;
      flush(); drag = null; pinch = null; pointers.clear();
      const el = elOf(selected);
      const cs = el && typeof getComputedStyle === "function" ? getComputedStyle(el) : null;
      if (!visible(el) || (cs && (cs.display === "none" || cs.visibility === "hidden"))) {
        after(labelOf(selected) + " has no visible box in this mode. Change visibility or camera first.");
        return;
      }
      const bounds = HudLayout.screenBounds();
      const rect = el.getBoundingClientRect();
      const oversized = rect.width > bounds.right - bounds.left || rect.height > bounds.bottom - bounds.top;
      const message = oversized ? "Oversized widget: leading edge in view. Size unchanged." : "Brought into view. Size unchanged.";
      // Where the race will keep it (#5678): at its widest content, inside the bounds and off the controls, so the
      // spot it is recovered to is the spot it paints after Done and Resume (HudLayout.keepUser moves it no further).
      const move = r => {
        const m = HudLayout.maxRect ? HudLayout.maxRect(selected, el) : r, w = m.right - m.left, h = m.bottom - m.top;
        const d = { x: Math.max(bounds.left, Math.min(m.left, bounds.right - w)) - m.left, y: Math.max(bounds.top, Math.min(m.top, bounds.bottom - h)) - m.top };
        if (!HudLayout.keepClear || !HudLayout.ctrlRects) return d;
        const k = HudLayout.keepClear({ left: m.left + d.x, right: m.right + d.x, top: m.top + d.y, bottom: m.bottom + d.y }, bounds, HudLayout.ctrlRects());
        return { x: d.x + k.dx, y: d.y + k.dy };
      };
      let delta = move(rect);
      if (!delta.x && !delta.y) { after(oversized ? message : "Already in view. Size unchanged."); return; }
      remember();
      const orig = dragOrig(selected);
      delta = move(el.getBoundingClientRect());
      HudLayout.set(selected, Object.assign({}, orig, dragTo(orig, delta.x, delta.y, window.innerWidth, window.innerHeight)), context.set, context.profile, true);
      after(message);
    }

    /* ---- pieces the race hides until something happens: show them with sample content ---- */
    const SAMPLE = [
      // A typical message, not the longest: the sample sizes the card the player arranges (phone report 2026-10-14).
      ["announce", [[document.getElementById("announce-num"), "3"], [document.getElementById("announce-who"), "RACE CONTROL"],
        [document.getElementById("announce-text"), "\u201cTRACK LIMITS 2/4\u201d"]]],
      ["flag", [[document.getElementById("hud-flag"), "YELLOW \u00b7 SECTOR 2"]]],
      ["limits", [[document.querySelector("#hud-limits .limits-dots"), "\u25cf\u25cf\u25cb\u25cb"]]],   // an empty chip paints no box (#5256)
      ["damage", []],
      ["rel", [], true],
      ["strat", [], true],
      ["inputs", []],
    ];
    function reveal() {
      revealed = [];
      for (const [id, texts, preview] of SAMPLE) {
        const el = elOf(id);
        const optional = id === "rel" || id === "strat" || id === "inputs";
        if (!el || (!el.hidden && !optional)) continue;
        const rec = { el, hidden: el.hidden, text: [], children: [], drop: el.getAttribute("data-col-drop") };
        if (optional) el.removeAttribute("data-col-drop");
        if (preview && el.hidden) {
          // Keep producer-owned nodes intact: its paint cache must still match on resume.
          for (const child of el.children) { rec.children.push({ el: child, hidden: child.hidden }); child.hidden = true; }
          rec.preview = document.createElement("div");
          // Match the bounded producer rows and their compact-column selectors.
          if (id === "rel") {
            rec.preview.setAttribute("data-col-row", "");
            for (const [k, text] of [["pos", "P2"], ["code", "YOU"], ["gap", "+0.8"], ["tyre", "M"], ["lap", ""]]) {
              const cell = document.createElement("span"); cell.setAttribute("data-k", k); cell.textContent = text;
              rec.preview.appendChild(cell);
            }
          } else {
            rec.preview.setAttribute("data-k", "next");
            const head = document.createElement("span"), value = document.createElement("b");
            head.textContent = "NEXT"; value.textContent = "LAP 12";
            rec.preview.appendChild(head); rec.preview.appendChild(value);
          }
          el.appendChild(rec.preview);
        }
        for (const [t, txt] of texts) {
          if (!t) continue;
          rec.text.push({ el: t, text: t.textContent });
          if (!t.textContent) t.textContent = txt;
        }
        el.hidden = false;
        revealed.push(rec);
      }
    }
    function conceal() {
      for (const rec of revealed) {
        for (const t of rec.text) t.el.textContent = t.text;
        if (rec.preview) rec.el.removeChild(rec.preview);
        for (const child of rec.children) child.el.hidden = child.hidden;
        rec.el.hidden = rec.hidden;
        if (rec.drop !== null) rec.el.setAttribute("data-col-drop", rec.drop);
      }
      revealed = [];
    }

    /* ---- dialogs (DockLayout's contract) ---- */
    function hideDialogs() {
      const settings = $("pmsettings"), pause = $("pausemenu");
      shown = { settings: !!settings && !settings.hidden, pause: !!pause && !pause.hidden };
      if (settings) settings.hidden = true;
      if (pause) pause.hidden = true;
      const hud = $("hud"), title = $("overlay");
      if (hud && hud.hidden) {
        preview = { hud, title, titleHidden: title ? title.hidden : true };
        if (title) title.hidden = true;
        hud.hidden = false;
      }
    }
    function restoreDialogs() {
      const settings = $("pmsettings"), pause = $("pausemenu"), was = shown;
      shown = null;
      if (!was) return;
      if (was.settings && settings) settings.hidden = false;
      if (was.pause && pause) pause.hidden = false;
    }

    function setEditing(on, restore, accept = true) {
      const was = editing;
      editing = !!on;
      if (editing && !was) {
        ensureBar();
        expanded = false;
        opener = document.activeElement;
        context = { set: HudLayout.shown(), profile: HudLayout.profile() };
        history.length = 0; visibilityDraft = {};
        HudLayout.colors?.preview({});
        initial = HudLayout.arrangeSnapshot(context.set, context.profile);
        HudLayout.holdArrangePreview(true);
        hideDialogs();
        reveal();
        for (const [, , sel] of ELEMENTS) { const el = document.querySelector(sel); if (el) el.setAttribute("data-hl-arr", ""); }
        document.body.setAttribute("data-hud-arrange", "1");
        ghosts();
        // OVERTAKE / AERO / BRAKE BIAS are carried by the touch buttons: no box to arrange on touch (#5256).
        const touch = !!document.body.classList && !Dom.isDesktop();
        const rows = ELEMENTS.filter(([id]) => !(touch && TOUCH_CARRIED.includes(id)));
        selected = (rows.find(([id]) => visible(elOf(id))) || rows.find(([id]) => HudLayout.visibility(id)))?.[0] || null;
        colorElement = undefined;
        picker.textContent = "";
        for (const [id, label] of rows) {
          if (id !== "finish" && !visible(elOf(id)) && !HudLayout.visibility(id)) continue;
          const option = document.createElement("option"); option.value = id; option.textContent = label;
          picker.appendChild(option);
        }
        // Measure the visible toolbar after paintBar has filled its current text.
        bar.hidden = false;
        after();
      }
      if (!editing && was) {
        if (typeof RetiredCard !== "undefined") RetiredCard.preview(false);
        flush();
        HudLayout.colors?.finish(accept);
        HudLayout.endArrangeDraft(accept, context.set, context.profile, initial);
        if (accept) for (const [id, value] of Object.entries(visibilityDraft)) HudLayout.setVisibility(id, value);
        history.length = 0; visibilityDraft = {};
        if (reflow) { cancelAnimationFrame(reflow); reflow = 0; }
        document.body.removeAttribute("data-hud-arrange");
        for (const [, , sel] of ELEMENTS) {
          const el = document.querySelector(sel);
          if (!el) continue;
          el.removeAttribute("data-hl-arr");
          if (el.hasAttribute("data-hl-clash")) el.removeAttribute("data-hl-clash");
          if (el.hasAttribute("data-hl-off")) el.removeAttribute("data-hl-off");
        }
        if (hasEls() && HudElements.apply) HudElements.apply();   // the real hide list back
        conceal();
        if (preview) {
          preview.hud.hidden = true;
          if (preview.title) preview.title.hidden = preview.titleHidden;
          preview = null;
        }
        if (restore === false) shown = null; else restoreDialogs();
        HudLayout.holdArrangePreview(false);
        HudLayout.fit();
        drag = null; pinch = null; pointers.clear();
        if (typeof GameHud !== "undefined" && GameHud && GameHud.invalidateFit) GameHud.invalidateFit();
      }
      if (bar) bar.hidden = !editing;
      if (editing && !was && picker) picker.focus();
      const btn = $("pm-hud-arrange");
      if (btn) {
        btn.setAttribute("aria-pressed", editing ? "true" : "false");
        if (was && !editing && restore !== false) {
          const target = opener && opener.isConnected ? opener : btn;
          if (target.focus) target.focus();
        }
      }
    }

    /* The pause-card button is DockLayout.arrangeDoor's (eager): its first tap loads this file and calls
       create(G), so the toolbar (a UiLayers layer whose data-esc-close names hud-arrange-cancel) exists
       before the first edit. */
    ensureBar();

    /* ---- pointers ---- */
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    function onPointerDown(e) {
      if (!editing) return;
      const t = e.target;
      if (bar && bar.contains(t)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // A small readout may only fit one fingertip. Keep the first finger's
      // selection when the second lands on the empty race surface.
      const background = t === document.body || t.id === "game" || t.id === "hud";
      const id = drag && !pinch && e.pointerType === "touch" && background ? drag.id : idAt(t);
      const dock = $("hud-dock");
      if (!id) {
        // A press on a touch control while arranging must not drive the car (THROTTLE = LATCH).
        if (dock && dock.contains(t)) { e.preventDefault(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
        return;
      }
      e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (drag && drag.id === id && !pinch) {
        // Start from the current painted size, including any pending drag.
        paint();
        const p0 = pointers.get(drag.pid);
        pinch = { id, pid: e.pointerId, d0: p0 ? dist(p0, { x: e.clientX, y: e.clientY }) : 0, s0: drag.orig ? current(id).s : null };
        try { t.setPointerCapture && t.setPointerCapture(e.pointerId); } catch (_) { /* */ }
        return;
      }
      if (drag) return;   // another finger must not switch the gesture to a different piece
      flush();
      selected = id;
      drag = { id, pid: e.pointerId, startX: e.clientX, startY: e.clientY, orig: null };
      pinch = null;
      try { t.setPointerCapture && t.setPointerCapture(e.pointerId); } catch (_) { /* */ }
      const rects0 = rectsNow();
      paintBar(markClashes(rects0), undefined, rects0);
    }
    function onPointerMove(e) {
      if (!editing || !pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && (e.pointerId === pinch.pid || (drag && e.pointerId === drag.pid))) {
        const a = pointers.get(drag.pid), b = pointers.get(pinch.pid);
        if (!a || !b) return;
        const distance = dist(a, b);
        if (!pinch.d0) { pinch.d0 = distance; return; }
        if (!drag.orig && Math.abs(distance - pinch.d0) < 3) return;
        if (!drag.orig) { remember(); drag.orig = dragOrig(drag.id); }
        pinch.s0 ??= drag.orig.s;
        queue(pinch.id, { s: pinchTo(pinch.s0, pinch.d0, distance) });
        return;
      }
      if (!drag || e.pointerId !== drag.pid) return;
      const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
      if (!drag.orig) {
        if (Math.hypot(dx, dy) < 3) return;
        remember(); drag.orig = dragOrig(drag.id);
      }
      queue(drag.id, dragTo(drag.orig, dx, dy, window.innerWidth, window.innerHeight));
    }
    function onPointerUp(e) {
      if (!editing) return;
      const last = pointers.get(e.pointerId);
      if (last && (last.x !== e.clientX || last.y !== e.clientY)) onPointerMove(e);
      paint();
      pointers.delete(e.pointerId);
      let ended = false;
      if (pinch && drag && (e.pointerId === pinch.pid || e.pointerId === drag.pid)) {
        const pid = e.pointerId === pinch.pid ? drag.pid : pinch.pid;
        const point = pointers.get(pid), id = drag.id;
        pinch = null;
        drag = point ? { id, pid, startX: point.x, startY: point.y, orig: drag.orig && current(id) } : null;
        ended = true;
      } else if (drag && e.pointerId === drag.pid) { drag = null; ended = true; }
      if (ended) after();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerUp, true);
    function cancelGesture(e) {
      if (!drag || (e.pointerId != null && e.pointerId !== drag.pid && e.pointerId !== pinch?.pid)) return;
      pending = null;
      paint();
      const previous = drag.orig && history.pop();
      if (previous) HudLayout.restoreSnapshot(context.set, context.profile, previous.layout);
      drag = null; pinch = null; pointers.clear(); after();
    }
    document.addEventListener("pointercancel", cancelGesture, true);
    document.addEventListener("lostpointercapture", cancelGesture, true);
    const watched = [$("pmsettings"), $("pausemenu")].filter(Boolean);
    if (watched.length && typeof MutationObserver !== "undefined") {
      const mo = new MutationObserver(() => { if (editing && watched.some((el) => !el.hidden)) setEditing(false, false, false); });
      for (const el of watched) mo.observe(el, { attributes: true, attributeFilter: ["hidden"] });
    }
    if (typeof MutationObserver !== "undefined") {
      const rotate = $("rotate-device");
      const mo = new MutationObserver(() => {
        if (!editing) return;
        if (HudLayout.shown() !== context.set || HudLayout.profile() !== context.profile) setEditing(false, true, false);
        else if (rotate && rotate.getAttribute("aria-hidden") === "false") setEditing(false, true, false);
      });
      mo.observe(document.body, { attributes: true, attributeFilter: ["class", "data-hl-set"] });
      if (rotate) mo.observe(rotate, { attributes: true, attributeFilter: ["aria-hidden"] });
    }
    document.addEventListener("keydown", (e) => {
      if (!editing || e.defaultPrevented) return;
      const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (dirs[e.key] && selected && e.target && e.target.id === "hud-arrange-move") {
        e.preventDefault(); e.stopPropagation();
        nudge(...dirs[e.key], e.shiftKey || coarse ? 5 : 1);
        return;
      }
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setEditing(false, true, false);
    }, true);
    if (typeof window !== "undefined" && window.addEventListener) {
      const resize = () => {
        if (!editing) return;
        // Finish the old gesture before its coordinate system changes. Keep
        // the selection and saved camera/style; re-fit only the painted HUD.
        flush(); drag = null; pinch = null; pointers.clear();
        if (reflow) return;
        reflow = requestAnimationFrame(() => {
          reflow = 0;
          if (editing) { HudLayout.fit(); after(); }
        });
      };
      window.addEventListener("blur", cancelGesture);
      window.addEventListener("resize", resize, { passive: true });
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", resize, { passive: true });
        window.visualViewport.addEventListener("scroll", resize, { passive: true });
      }
    }

    return Object.freeze({ setEditing, isEditing: () => editing, selected: () => selected });
  }

  return Object.freeze({ STEP, MIN_CLASH, BAR_H, TOUCH_CARRIED, dragTo, pinchTo, stepSize, paintedSize, clashes, barSlot, create });
})();
Object.freeze(HudArrange);
