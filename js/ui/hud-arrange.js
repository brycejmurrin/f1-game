"use strict";
/* Apex 26 — HudArrange: ARRANGE HUD, the on-screen editor for MOVE & SIZE.

   The slider editor (js/ui/hud-layout.js, SETTINGS › DISPLAY › HUD › MOVE & SIZE)
   edits one element at a time behind a settings sheet. This is the
   same setting edited by hand: a button on the pause card, every HUD element
   gets a dashed outline, DRAG moves it, a PINCH (or the toolbar's − / +) sizes
   it, and a pair of elements — or an element and a touch control — that overlap
   turn red. It writes the offsets HudLayout already stores (x / y as a share of
   the screen in %, s as a percent, per HUD style and camera set), so presets,
   RESET, the camera sets and the fit's clamps keep working unchanged.

   Mirrors DockLayout's REPOSITION editor: entering hides SETTINGS and PAUSED
   (showModal dialogs make the rest of the document inert, so a drag could not
   start), a floating toolbar ends it; so does Escape, or any dialog opening
   while it is on. Pointer events are taken in the CAPTURE phase so a press on
   a piece over GAS never reaches the pedal (THROTTLE = LATCH would launch the
   car on RESUME).

   Pieces the race hides until something happens (the radio card, the caution
   flag, the LIMITS chip, DAMAGE) are shown with sample content while
   arranging and put back exactly as they were on exit. */
const HudArrange = (() => {
  const STEP = 10;     // toolbar − / + size step, %
  const MIN_CLASH = 3; // px of overlap on BOTH axes before a pair is a clash (touching is not)
  const clamp = M4.clamp;   // the shared one (js/core/mat4.js); a private copy is what shared-math.test forbids

  /** Pure: offsets {x, y} (share of the screen, %) after a drag of (dx, dy) screen px on a W x H screen. */
  function dragTo(orig, dx, dy, W, H) {
    const x = clamp((orig && orig.x || 0) + (dx / Math.max(1, W)) * 100, ...HudLayout.LIM.x);
    const y = clamp((orig && orig.y || 0) + (dy / Math.max(1, H)) * 100, ...HudLayout.LIM.y);
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }
  /** Pure: the offset that keeps an auto-placed radio card where it is (left/top screen px) once moving it
   *  hangs it from css/hud.css's fixed point (50vw, 25svh) instead. Its first drag starts from here. */
  function placedOrig(orig, left, top, W, H) {
    if (orig && (orig.x || orig.y)) return orig;
    const w = Math.max(1, W), h = Math.max(1, H);
    return Object.assign({}, orig, { x: (left - w / 2) / w * 100, y: (top - h / 4) / h * 100 });
  }
  /** Pure: size s0 (%) after a pinch from finger distance d0 to d1, on the slider's 5 % steps. */
  function pinchTo(s0, d0, d1) {
    if (!(d0 > 0) || !(d1 > 0)) return s0;
    return clamp(Math.round((s0 * d1 / d0) / 5) * 5, ...HudLayout.LIM.s);
  }
  // Layout pieces and individual toggles share HudLayout's mapping. The
  // tower remains a group, while race messages and flags are event-driven.
  /** Pure: s (%) stepped by `dir` (±1) on the toolbar's step. */
  const stepSize = (s, dir) => clamp(Math.round((s + dir * STEP) / 5) * 5, ...HudLayout.LIM.s);
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
    let bar = null, nameEl = null, hintEl = null, picker = null, visibilityRow = null;
    const hasEls = () => typeof HudElements !== "undefined" && HudElements && typeof HudElements.isOn === "function";

    const elOf = (id) => { const row = ELEMENTS.find((e) => e[0] === id); return row ? document.querySelector(row[2]) : null; };
    const labelOf = (id) => { const row = ELEMENTS.find((e) => e[0] === id); return row ? row[1] : id; };
    const visible = (el) => { if (!el || el.hidden) return false; const r = el.getBoundingClientRect(); return !!(r.width && r.height); };
    const idAt = (t) => {
      if (!t || !t.closest) return null;
      for (const [id, , sel] of ELEMENTS) { const el = t.closest(sel); if (el) return id; }
      return null;
    };

    /* ---- the toolbar (built once; inline styles — the shell is not this module's to edit) ---- */
    function ensureBar() {
      if (bar || !document.body || !document.body.appendChild) return;
      bar = document.createElement("div");
      bar.id = "hud-arrange-bar";
      bar.setAttribute("role", "toolbar");
      bar.setAttribute("aria-label", "Arrange HUD");
      bar.setAttribute("data-esc-close", "hud-arrange-done");
      bar.style.cssText = "position:fixed;z-index:9999;" +
        "display:flex;flex-wrap:wrap;box-sizing:border-box;align-items:center;gap:6px;padding:4px 8px;border-radius:8px;" +
        "background:var(--bg,#111);color:var(--text,#fff);border:2px solid var(--text,#fff);font:inherit;font-size:var(--fs-micro,13px);width:max-content;max-width:calc(100vw - 24px - 2 * max(var(--sal,0px),var(--sar,0px)));max-height:calc(100svh - 24px - 2 * max(var(--sat,0px),var(--sab,0px)));overflow:auto;";
      const mk = (txt, aria, fn, id) => {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = txt; b.id = id;
        b.setAttribute("aria-label", aria);
        b.style.cssText = "min-width:44px;min-height:44px;padding:0 10px;font:inherit;font-weight:700;background:none;color:inherit;border:1px solid var(--text,#fff);border-radius:6px;";
        b.onclick = fn;
        return b;
      };
      nameEl = document.createElement("output");
      nameEl.id = "hud-arrange-name";
      nameEl.setAttribute("aria-label", "Selected element size");
      nameEl.style.cssText = "font-weight:800;letter-spacing:0.06em;white-space:nowrap;max-width:34vw;overflow:hidden;text-overflow:ellipsis;";
      hintEl = document.createElement("span");
      hintEl.id = "hud-arrange-hint";
      hintEl.setAttribute("aria-live", "polite");
      hintEl.style.cssText = "color:var(--dim,#bbb);white-space:nowrap;max-width:30vw;overflow:hidden;text-overflow:ellipsis;";
      picker = document.createElement("select");
      picker.id = "hud-arrange-element";
      picker.setAttribute("aria-label", "HUD element; use arrow keys on the Move button to position");
      picker.setAttribute("data-arrows", "own");
      picker.style.cssText = "min-width:0;min-height:44px;max-width:100%;font:inherit;background:var(--bg,#111);color:inherit;";
      picker.onchange = () => { flush(); selected = picker.value; after(); };
      bar.appendChild(picker);
      const move = mk("MOVE", "Move selected element with arrow keys; Shift moves faster", () => {}, "hud-arrange-move");
      move.setAttribute("data-arrows", "own");
      bar.appendChild(move);
      bar.appendChild(nameEl);
      bar.appendChild(hintEl);
      bar.appendChild(mk("−", "Smaller", () => size(-1), "hud-arrange-smaller"));
      bar.appendChild(mk("+", "Larger", () => size(1), "hud-arrange-larger"));
      bar.appendChild(mk("RESET", "Reset this element to the shipped layout", () => { if (selected) { flush(); HudLayout.resetEl(selected, context.set, context.profile); after(); } }, "hud-arrange-reset"));
      visibilityRow = document.createElement("label");
      visibilityRow.textContent = "VISIBILITY ";
      const visibilityPick = document.createElement("select");
      visibilityPick.id = "hud-arrange-vis";
      visibilityPick.setAttribute("aria-label", "Selected element visibility");
      visibilityPick.setAttribute("data-arrows", "own");
      visibilityPick.style.cssText = picker.style.cssText;
      visibilityRow.appendChild(visibilityPick);
      SettingRow.wire(visibilityRow, { values: [], read: () => HudLayout.visibility(selected)?.value || "", write: (value) => {
        flush(); HudLayout.setVisibility(selected, value); ghosts(); after();
      } });
      bar.appendChild(visibilityRow);
      bar.appendChild(mk("DONE", "Done arranging the HUD", () => setEditing(false), "hud-arrange-done"));
      bar.hidden = true;
      document.body.appendChild(bar);
      if (typeof TopModal !== "undefined" && TopModal.wireLayer) TopModal.wireLayer(bar);
    }
    /* Prefer an edge, but use the middle when it covers less HUD content. */
    function placeBar(rects) {
      if (!bar) return;
      const bounds = HudLayout.screenBounds(window.innerWidth, window.innerHeight, 8);
      const W = Math.max(0, bounds.right - bounds.left), H = Math.max(0, bounds.bottom - bounds.top);
      bar.style.maxWidth = W + "px"; bar.style.maxHeight = H + "px";
      const size = bar.getBoundingClientRect();
      const w = size.width, h = size.height, cx = bounds.left + (W - w) / 2, cy = bounds.top + (H - h) / 2;
      // Score exactly the same screen-pixel boxes we paint. Safe areas can be
      // asymmetric, so centring in innerWidth alone is not a usable slot.
      const boxes = [
        { l: cx, t: bounds.top }, { l: cx, t: bounds.bottom - h },
        { l: bounds.right - w, t: bounds.top }, { l: bounds.left, t: bounds.bottom - h },
        { l: cx, t: cy },
      ];
      let best = 0, bestA = Infinity;
      for (let i = 0; i < boxes.length; i++) {
        const q = boxes[i];
        let a = 0;
        for (const r of rects) a += Math.max(0, Math.min(q.l + w, r.r) - Math.max(q.l, r.l)) * Math.max(0, Math.min(q.t + h, r.b) - Math.max(q.t, r.t));
        if (a < bestA) { bestA = a; best = i; }
      }
      for (const k of ["top", "bottom", "left", "right"]) bar.style.removeProperty(k);
      bar.style.transform = "none";
      bar.style.left = boxes[best].l + "px"; bar.style.top = boxes[best].t + "px";
    }
    function paintBar(clash) {
      if (!bar) return;
      const cur = selected ? current(selected) : null;
      if (picker && selected) picker.value = selected;
      nameEl.textContent = cur ? cur.s + "%" : "";
      nameEl.hidden = !cur;
      const visibility = selected && HudLayout.visibility(selected);
      const off = visibility && visibility.value === "off";
      hintEl.textContent = clash && clash.length ? "OVERLAP: " + clash.slice(0, 2).map((p) => p.map(labelOf).join(" × ")).join(", ")
        : off ? "hidden in the race \u00b7 SHOW brings it back"
        : visibility && visibility.value === "mixed" ? "some tower readouts are hidden"
        : "";
      hintEl.hidden = !hintEl.textContent;
      if (visibilityRow) {
        SettingRow.paint(visibilityRow, visibility ? visibility.value : "", visibility ? visibility.choices : []);
        SettingRow.disable(visibilityRow, !visibility);
        visibilityRow.title = visibility ? "" : "Shown automatically with race events";
      }
      placeBar(rectsNow());
    }

    /* ---- clash marks: HUD pieces against each other and against the touch controls ---- */
    function rectsNow() {
      const out = [];
      for (const [id, , sel] of ELEMENTS) {
        const el = document.querySelector(sel);
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
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
    function markClashes() {
      const rects = rectsNow();
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
    function after() {
      if (typeof GameHud !== "undefined" && GameHud && GameHud.invalidateFit) GameHud.invalidateFit();
      paintBar(markClashes());
    }
    const current = (id) => HudLayout.get(id, context.set, context.profile);
    function dragOrig(id) {
      const orig = current(id), el = id === "announce" ? elOf(id) : null;
      const r = el && el.getBoundingClientRect();
      if (r) return placedOrig(orig, r.left, r.top, window.innerWidth, window.innerHeight);
      // The first real map edit adopts its temporary screen-pixel clearance.
      const map = id === "map" ? elOf(id) : null;
      if (map && !map.hasAttribute("data-hl-user") && map.style.getPropertyValue) {
        return Object.assign({}, orig, {
          x: orig.x + (parseFloat(map.style.getPropertyValue("--hud-clear-x")) || 0) / window.innerWidth * 100,
          y: orig.y + (parseFloat(map.style.getPropertyValue("--hud-clear-y")) || 0) / window.innerHeight * 100,
        });
      }
      return orig;
    }
    function flush() {
      if (raf) {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
        else clearTimeout(raf);
      }
      raf = 0;
      const p = pending; pending = null;
      if (p) HudLayout.set(p.id, p.v, p.set, p.profile);
    }
    /* Bind queued edits to the layout visible when the gesture started. */
    function queue(id, v) {
      if (id === "map" && v.s != null) { const orig = dragOrig(id); v = Object.assign({ x: orig.x, y: orig.y }, v); }
      if (pending && pending.id !== id) flush();
      pending = { id, set: context.set, profile: context.profile,
        v: Object.assign(pending ? pending.v : {}, v) };
      if (raf) return;
      raf = (typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16))(() => {
        flush();
        if (editing) after();
      });
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
        if (HudLayout.visibility(id)?.value !== "off") { if (el.hasAttribute("data-hl-off")) el.removeAttribute("data-hl-off"); }
        else el.setAttribute("data-hl-off", "");
      }
    }
    function size(dir) {
      if (!selected) return;
      flush();
      const orig = selected === "map" ? dragOrig(selected) : current(selected);
      HudLayout.set(selected, Object.assign({}, orig, { s: stepSize(orig.s, dir) }), context.set, context.profile);
      after();
    }

    /* ---- pieces the race hides until something happens: show them with sample content ---- */
    const SAMPLE = [
      // A typical message, not the longest: the sample sizes the card the player arranges (phone report 2026-10-14).
      ["announce", [[document.getElementById("announce-num"), "3"], [document.getElementById("announce-who"), "RACE CONTROL"],
        [document.getElementById("announce-text"), "\u201cTRACK LIMITS 2/4\u201d"]]],
      ["flag", [[document.getElementById("hud-flag"), "YELLOW \u00b7 SECTOR 2"]]],
      ["limits", []],
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

    function setEditing(on, restore) {
      const was = editing;
      editing = !!on;
      if (editing && !was) {
        ensureBar();
        opener = document.activeElement;
        context = { set: HudLayout.shown(), profile: HudLayout.profile() };
        HudLayout.holdArrangePreview(true);
        hideDialogs();
        reveal();
        for (const [, , sel] of ELEMENTS) { const el = document.querySelector(sel); if (el) el.setAttribute("data-hl-arr", ""); }
        document.body.setAttribute("data-hud-arrange", "1");
        ghosts();
        selected = (ELEMENTS.find(([id]) => visible(elOf(id))) || ELEMENTS.find(([id]) => HudLayout.visibility(id)))?.[0] || null;
        picker.textContent = "";
        for (const [id, label] of ELEMENTS) {
          if (!visible(elOf(id)) && !HudLayout.visibility(id)) continue;
          const option = document.createElement("option"); option.value = id; option.textContent = label;
          picker.appendChild(option);
        }
        // Measure the visible toolbar after paintBar has filled its current text.
        bar.hidden = false;
        after();
      }
      if (!editing && was) {
        flush();
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

    /* ---- the pause-card button, beside REPOSITION TOUCH CONTROLS ---- */
    (function ensureControls() {
      if ($("pm-hud-arrange")) return;
      const hudHost = $("pm-hud-details");
      const anchor = hudHost ? $("pm-hud-details-sum") : ($("pm-dock-reset") || $("pm-dock-reposition-help") || $("pm-mirror"));
      const host = anchor && anchor.parentNode;
      if (!host) return;
      const btn = document.createElement("button");
      btn.id = "pm-hud-arrange";
      btn.type = "button";
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = "ARRANGE HUD";
      const tip = document.createElement("p");
      tip.className = "adv-help";
      tip.id = "pm-hud-arrange-help";
      tip.textContent = "Choose a readout to show, hide, move or resize. AUTO follows the camera and HUD style. Drag to move; pinch or use − / + to size. Red outlines mark overlaps. Positions are saved per HUD STYLE and camera set.";
      btn.onclick = () => setEditing(!editing);
      host.insertBefore(btn, anchor.nextSibling);
      host.insertBefore(tip, btn.nextSibling);
    })();

    /* The hidden toolbar exists from boot: it is a UiLayers layer whose data-esc-close
       (hud-arrange-done) must name a real button before the first edit. */
    ensureBar();

    /* ---- pointers ---- */
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    function onPointerDown(e) {
      if (!editing) return;
      const t = e.target;
      if (bar && bar.contains(t)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const id = idAt(t);
      const dock = $("hud-dock");
      if (!id) {
        // A press on a touch control while arranging must not drive the car (THROTTLE = LATCH).
        if (dock && dock.contains(t)) { e.preventDefault(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
        return;
      }
      e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (drag && drag.id === id && !pinch) {
        // second finger on the same piece: a pinch
        flush();
        const p0 = pointers.get(drag.pid);
        pinch = { id, pid: e.pointerId, d0: p0 ? dist(p0, { x: e.clientX, y: e.clientY }) : 0, s0: current(id).s };
        try { t.setPointerCapture && t.setPointerCapture(e.pointerId); } catch (_) { /* */ }
        return;
      }
      flush();
      selected = id;
      let orig = dragOrig(id);
      drag = { id, pid: e.pointerId, startX: e.clientX, startY: e.clientY, orig };
      pinch = null;
      try { t.setPointerCapture && t.setPointerCapture(e.pointerId); } catch (_) { /* */ }
      paintBar(markClashes());
    }
    function onPointerMove(e) {
      if (!editing || !pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && (e.pointerId === pinch.pid || (drag && e.pointerId === drag.pid))) {
        const a = pointers.get(drag.pid), b = pointers.get(pinch.pid);
        if (a && b) queue(pinch.id, { s: pinchTo(pinch.s0, pinch.d0, dist(a, b)) });
        return;
      }
      if (!drag || e.pointerId !== drag.pid) return;
      queue(drag.id, dragTo(drag.orig, e.clientX - drag.startX, e.clientY - drag.startY, window.innerWidth, window.innerHeight));
    }
    function onPointerUp(e) {
      if (!editing) return;
      flush();
      pointers.delete(e.pointerId);
      if (pinch && drag && (e.pointerId === pinch.pid || e.pointerId === drag.pid)) {
        const pid = e.pointerId === pinch.pid ? drag.pid : pinch.pid;
        const point = pointers.get(pid), id = drag.id;
        pinch = null;
        drag = point ? { id, pid, startX: point.x, startY: point.y, orig: dragOrig(id) } : null;
        after(); return;
      }
      if (drag && e.pointerId === drag.pid) { drag = null; after(); }
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerUp, true);
    const watched = [$("pmsettings"), $("pausemenu")].filter(Boolean);
    if (watched.length && typeof MutationObserver !== "undefined") {
      const mo = new MutationObserver(() => { if (editing && watched.some((el) => !el.hidden)) setEditing(false, false); });
      for (const el of watched) mo.observe(el, { attributes: true, attributeFilter: ["hidden"] });
    }
    if (typeof MutationObserver !== "undefined") {
      const rotate = $("rotate-device");
      const mo = new MutationObserver(() => {
        if (!editing) return;
        if (HudLayout.shown() !== context.set || HudLayout.profile() !== context.profile) setEditing(false);
        else if (rotate && rotate.getAttribute("aria-hidden") === "false") setEditing(false);
      });
      mo.observe(document.body, { attributes: true, attributeFilter: ["class", "data-hl-set"] });
      if (rotate) mo.observe(rotate, { attributes: true, attributeFilter: ["aria-hidden"] });
    }
    document.addEventListener("keydown", (e) => {
      if (!editing || e.defaultPrevented) return;
      const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (dirs[e.key] && selected && e.target && e.target.id === "hud-arrange-move") {
        e.preventDefault(); e.stopPropagation(); flush();
        const cur = dragOrig(selected), d = dirs[e.key], step = e.shiftKey ? 5 : 1;
        HudLayout.set(selected, { x: clamp(cur.x + d[0] * step, ...HudLayout.LIM.x), y: clamp(cur.y + d[1] * step, ...HudLayout.LIM.y) }, context.set, context.profile);
        after(); return;
      }
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setEditing(false);
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
      window.addEventListener("resize", resize, { passive: true });
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", resize, { passive: true });
        window.visualViewport.addEventListener("scroll", resize, { passive: true });
      }
    }

    return Object.freeze({ setEditing, isEditing: () => editing, selected: () => selected });
  }

  return Object.freeze({ STEP, MIN_CLASH, dragTo, placedOrig, pinchTo, stepSize, clashes, create });
})();
Object.freeze(HudArrange);
