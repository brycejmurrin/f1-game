"use strict";
/* Apex 26 — HudArrange: ARRANGE HUD, the on-screen editor for MOVE & SIZE.

   The slider editor (js/ui/hud-layout.js, SETTINGS › DISPLAY › HUD › MOVE & SIZE)
   is sixty sliders behind a sheet that hides the HUD it adjusts. This is the
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
  const LIM = Object.freeze({ x: [-50, 50], y: [-50, 50], s: [50, 200] });   // HudLayout.LIM
  const STEP = 10;     // toolbar − / + size step, %
  const MIN_CLASH = 3; // px of overlap on BOTH axes before a pair is a clash (touching is not)
  const clamp = M4.clamp;   // the shared one (js/core/mat4.js); a private copy is what shared-math.test forbids

  /** Pure: offsets {x, y} (share of the screen, %) after a drag of (dx, dy) screen px on a W x H screen. */
  function dragTo(orig, dx, dy, W, H) {
    const x = clamp((orig && orig.x || 0) + (dx / Math.max(1, W)) * 100, LIM.x[0], LIM.x[1]);
    const y = clamp((orig && orig.y || 0) + (dy / Math.max(1, H)) * 100, LIM.y[0], LIM.y[1]);
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }
  /** Pure: size s0 (%) after a pinch from finger distance d0 to d1, on the slider's 5 % steps. */
  function pinchTo(s0, d0, d1) {
    if (!(d0 > 0) || !(d1 > 0)) return s0;
    return clamp(Math.round((s0 * d1 / d0) / 5) * 5, LIM.s[0], LIM.s[1]);
  }
  /** Pure: s (%) stepped by `dir` (±1) on the toolbar's step. */
  const stepSize = (s, dir) => clamp(Math.round((s + dir * STEP) / 5) * 5, LIM.s[0], LIM.s[1]);
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
    let editing = false, built = false;
    let drag = null;       // { id, pid, startX, startY, orig }
    let pinch = null;      // { id, pid, d0, s0 } — the second pointer
    const pointers = new Map();   // pointerId -> {x, y}
    let selected = null;   // the id last touched; the toolbar's − / + / RESET act on it
    let raf = 0, pending = null;
    let shown = null;      // dialogs WE hid: { settings, pause }
    let revealed = [];     // [{ el, hidden, text:[{el, text}] }] pieces we unhid with sample content
    let bar = null, nameEl = null, hintEl = null;

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
      bar.style.cssText = "position:fixed;z-index:9999;" +
        "display:flex;align-items:center;gap:6px;padding:4px 8px;border-radius:8px;" +
        "background:var(--bg,#111);color:var(--text,#fff);border:2px solid var(--text,#fff);font:inherit;font-size:13px;max-width:calc(100vw - 24px);";
      const mk = (txt, aria, fn, id) => {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = txt; b.id = id;
        b.setAttribute("aria-label", aria);
        b.style.cssText = "min-width:44px;min-height:44px;padding:0 10px;font:inherit;font-weight:700;background:none;color:inherit;border:1px solid var(--text,#fff);border-radius:6px;";
        b.onclick = fn;
        return b;
      };
      nameEl = document.createElement("span");
      nameEl.id = "hud-arrange-name";
      nameEl.style.cssText = "font-weight:800;letter-spacing:0.06em;white-space:nowrap;max-width:34vw;overflow:hidden;text-overflow:ellipsis;";
      hintEl = document.createElement("span");
      hintEl.id = "hud-arrange-hint";
      hintEl.setAttribute("aria-live", "polite");
      hintEl.style.cssText = "color:var(--dim,#bbb);white-space:nowrap;max-width:30vw;overflow:hidden;text-overflow:ellipsis;";
      bar.appendChild(nameEl);
      bar.appendChild(hintEl);
      bar.appendChild(mk("−", "Smaller", () => size(-1), "hud-arrange-smaller"));
      bar.appendChild(mk("+", "Larger", () => size(1), "hud-arrange-larger"));
      bar.appendChild(mk("RESET", "Reset this element to the shipped layout", () => { if (selected) { HudLayout.resetEl(selected); after(); } }, "hud-arrange-reset"));
      bar.appendChild(mk("DONE", "Done arranging the HUD", () => setEditing(false), "hud-arrange-done"));
      bar.hidden = true;
      document.body.appendChild(bar);
    }
    /* The toolbar covers whatever it sits on, and every edge has a readout: pick
       the slot (top / bottom centre, top right, bottom left) that covers the
       least of the pieces and controls, measured after each change. */
    const SLOTS = [
      { top: "calc(8px + var(--sat,0px))", left: "50%", transform: "translateX(-50%)" },
      { bottom: "calc(8px + var(--sab,0px))", left: "50%", transform: "translateX(-50%)" },
      { top: "calc(8px + var(--sat,0px))", right: "calc(8px + var(--sar,0px))", transform: "none" },
      { bottom: "calc(8px + var(--sab,0px))", left: "calc(8px + var(--sal,0px))", transform: "none" },
    ];
    function placeBar(rects) {
      if (!bar) return;
      const w = bar.offsetWidth || 320, h = bar.offsetHeight || 52, W = window.innerWidth, H = window.innerHeight;
      const boxes = [
        { l: W / 2 - w / 2, t: 8, r: W / 2 + w / 2, b: 8 + h },
        { l: W / 2 - w / 2, t: H - 8 - h, r: W / 2 + w / 2, b: H - 8 },
        { l: W - 8 - w, t: 8, r: W - 8, b: 8 + h },
        { l: 8, t: H - 8 - h, r: 8 + w, b: H - 8 },
      ];
      let best = 0, bestA = Infinity;
      for (let i = 0; i < boxes.length; i++) {
        const q = boxes[i];
        let a = 0;
        for (const r of rects) a += Math.max(0, Math.min(q.r, r.r) - Math.max(q.l, r.l)) * Math.max(0, Math.min(q.b, r.b) - Math.max(q.t, r.t));
        if (a < bestA) { bestA = a; best = i; }
      }
      for (const k of ["top", "bottom", "left", "right"]) bar.style.removeProperty(k);
      for (const k in SLOTS[best]) bar.style[k] = SLOTS[best][k];
    }
    function paintBar(clash) {
      if (!bar) return;
      const cur = selected ? HudLayout.get(selected) : null;
      nameEl.textContent = selected ? labelOf(selected) + (cur ? " " + cur.s + "%" : "") : "ARRANGE HUD";
      hintEl.textContent = clash && clash.length ? "OVERLAP: " + clash.slice(0, 2).map((p) => p.map(labelOf).join(" × ")).join(", ")
        : selected ? "drag to move · pinch or − + to size" : "touch a readout to move it";
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
      placeBar(rects);
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
    /* One HudLayout.set per frame while a finger moves: set() saves and re-applies the whole layout. */
    function queue(id, v) {
      pending = { id, v: Object.assign(pending && pending.id === id ? pending.v : {}, v) };
      if (raf) return;
      raf = (typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16))(() => {
        raf = 0;
        const p = pending; pending = null;
        if (p) { HudLayout.set(p.id, p.v); after(); }
      });
    }
    function size(dir) {
      if (!selected) return;
      HudLayout.set(selected, { s: stepSize(HudLayout.get(selected).s, dir) });
      after();
    }

    /* ---- pieces the race hides until something happens: show them with sample content ---- */
    const SAMPLE = [
      ["announce", [[document.getElementById("announce-num"), "33"], [document.getElementById("announce-who"), "VERSTAPPEN \u00b7 RADIO"],
        [document.getElementById("announce-text"), "Box this lap \u2014 cheaper stop, about 23s lost"]]],
      ["flag", [[document.getElementById("hud-flag"), "YELLOW \u00b7 SECTOR 2"]]],
      ["limits", []],
      ["damage", []],
    ];
    function reveal() {
      revealed = [];
      for (const [id, texts] of SAMPLE) {
        const el = elOf(id);
        if (!el || !el.hidden) continue;
        const rec = { el, hidden: el.hidden, text: [] };
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
        rec.el.hidden = rec.hidden;
      }
      revealed = [];
    }

    /* ---- dialogs (DockLayout's contract) ---- */
    function hideDialogs() {
      const settings = $("pmsettings"), pause = $("pausemenu");
      shown = { settings: !!settings && !settings.hidden, pause: !!pause && !pause.hidden };
      if (settings) settings.hidden = true;
      if (pause) pause.hidden = true;
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
        hideDialogs();
        reveal();
        for (const [, , sel] of ELEMENTS) { const el = document.querySelector(sel); if (el) el.setAttribute("data-hl-arr", ""); }
        document.body.setAttribute("data-hud-arrange", "1");
        selected = null;
        after();
      }
      if (!editing && was) {
        document.body.removeAttribute("data-hud-arrange");
        for (const [, , sel] of ELEMENTS) {
          const el = document.querySelector(sel);
          if (!el) continue;
          el.removeAttribute("data-hl-arr");
          if (el.hasAttribute("data-hl-clash")) el.removeAttribute("data-hl-clash");
        }
        conceal();
        if (restore === false) shown = null; else restoreDialogs();
        drag = null; pinch = null; pointers.clear();
        if (typeof GameHud !== "undefined" && GameHud && GameHud.invalidateFit) GameHud.invalidateFit();
      }
      if (bar) bar.hidden = !editing;
      const btn = $("pm-hud-arrange");
      if (btn) {
        btn.setAttribute("aria-pressed", editing ? "true" : "false");
        if (was && !editing && restore !== false && btn.focus) btn.focus();
      }
    }

    /* ---- the pause-card button, beside REPOSITION TOUCH CONTROLS ---- */
    (function ensureControls() {
      if ($("pm-hud-arrange")) return;
      const anchor = $("pm-dock-reset") || $("pm-dock-reposition-help") || $("pm-mirror");
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
      tip.textContent = "Drag any readout to move it, pinch or use − / + to size it; a red outline means two things overlap. Saved per HUD STYLE and camera set, the same layout as MOVE & SIZE.";
      btn.onclick = () => setEditing(!editing);
      host.insertBefore(btn, anchor.nextSibling);
      host.insertBefore(tip, btn.nextSibling);
    })();

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
        const p0 = pointers.get(drag.pid);
        pinch = { id, pid: e.pointerId, d0: p0 ? dist(p0, { x: e.clientX, y: e.clientY }) : 0, s0: HudLayout.get(id).s };
        try { t.setPointerCapture && t.setPointerCapture(e.pointerId); } catch (_) { /* */ }
        return;
      }
      selected = id;
      drag = { id, pid: e.pointerId, startX: e.clientX, startY: e.clientY, orig: HudLayout.get(id) };
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
      pointers.delete(e.pointerId);
      if (pinch && e.pointerId === pinch.pid) { pinch = null; return; }
      if (drag && e.pointerId === drag.pid) { drag = null; pinch = null; after(); }
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
    document.addEventListener("keydown", (e) => {
      if (!editing || e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setEditing(false);
    }, true);
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", () => { if (editing) after(); }, { passive: true });
    }

    return Object.freeze({ setEditing, isEditing: () => editing, selected: () => selected });
  }

  return Object.freeze({ LIM, STEP, MIN_CLASH, dragTo, pinchTo, stepSize, clashes, create });
})();
Object.freeze(HudArrange);
