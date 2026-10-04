/* Apex 26 — DesignerProfile: the track designer's elevation strip, under the
   main canvas. Draws the ENGINE-built height profile of the lap (the py the
   preview built, so the hills are the ones the car will meet) and the design's
   cosine bumps (`elevations {s, halfM, rise}`, tracks.js buildCenterline) as
   grips on it, and turns pointer and keyboard input into the few callbacks the
   screen (TrackDesigner) owns: add a hill, reshape one, remove one, pick one.
   A drag previews analytically — the moved bump's cosine is swapped into the
   built heights, no rebuild — and hands ONE change back on release, already on
   the stored lattice (hill()), so what the strip shows is what is saved.
   Touches no store and no engine: TrackShape at eval, DesignerCanvas (its
   palette, hit radii, hold time) at create. LAZY_EDITOR, after canvas.js. */
const DesignerProfile = (function () {
  "use strict";
  const S = TrackShape;
  const PAD = 3;                        // css px above the highest point and below the lowest (select-screen's sparkline)
  const MIN_SPAN = 8;                   // m: a flat loop's ±0.3 m ripple is not drawn as a mountain range
  const DRAG_PX = 3, HOLD_PX = 6;       // moved this far: a drag; and no longer a long-press
  const ADD = Object.freeze({ halfM: 160, rise: 6 });
  const KEY = Object.freeze({ rise: 1, riseBig: 5, sM: 10, halfM: 20 });
  // CustomTracks' BUMP: halfM 20..2000, |rise| ≤ 60 and ≤ halfM / 19.6 (the
  // cosine's steepest grade, π·rise / 2·halfM, under 8 %). Read at call time.
  const GRADE = 19.6;
  const lim = () => (typeof CustomTracks !== "undefined" && CustomTracks.LIMITS) || { halfM: 2000, rise: 60 };
  const LABEL_FONT = "11px system-ui, sans-serif";
  const wrap01 = (f) => ((f % 1) + 1) % 1;
  const q = (v) => Math.round(v * 4) / 4;

  /** A hill on the stored lattice inside the registry's limits — exactly what
   *  CustomTracks.sanitize keeps: s on 1/65535 of a lap, halfM whole metres
   *  20..2000, rise on 0.25 m within ±min(60, halfM / 19.6). The rise cap is
   *  floored to the lattice, so a rise at the cap is never shaved again on save. */
  function hill(b) {
    b = b || {};
    const L = lim();
    const halfM = Math.round(Math.min(L.halfM, Math.max(20, Number.isFinite(+b.halfM) ? +b.halfM : ADD.halfM)));
    const cap = Math.min(L.rise, Math.floor(halfM / GRADE * 4) / 4);
    const r = Number.isFinite(+b.rise) ? +b.rise : 0;
    const s = Number.isFinite(+b.s) ? (Math.round(wrap01(+b.s) * 65535) % 65535) / 65535 : 0;
    return { s, halfM, rise: q(Math.min(cap, Math.max(-cap, r))) || 0 };
  }
  /** tracks.js buildCenterline's cosine bump: its height d metres from the centre. */
  const bumpAt = (b, d) => (b && d < b.halfM ? b.rise * 0.5 * (1 + Math.cos(Math.PI * d / b.halfM)) : 0);
  const same = (a, b) => a.s === b.s && a.halfM === b.halfM && a.rise === b.rise;
  const fmtRise = (r) => (r < 0 ? "−" : "+") + String(Math.abs(r));
  const fmtKm = (m) => (m / 1000).toFixed(2) + " km";

  /** Mount on a <canvas>. hooks: onAdd(sM) (metres along the built lap),
   *  onChange(i, {s, halfM, rise}, live) (the hill as it would be stored: s a
   *  lap fraction; live while a drag is in flight, then ONE live=false on
   *  release), onRemove(i), onSelect(i) (-1: none). Returns the api. */
  function create(canvas, hooks) {
    hooks = hooks || {};
    // The main canvas's ink, hit radii and hold time (its own defaults when a harness stubs it).
    const dc = (k, d) => (typeof DesignerCanvas !== "undefined" && DesignerCanvas[k] != null ? DesignerCanvas[k] : d);
    const DC = { COL: dc("COL", {}), HIT_PX: dc("HIT_PX", 24), HIT_TOUCH: dc("HIT_TOUCH", 30), HOLD_MS: dc("HOLD_MS", 500) }, COL = DC.COL;
    const g = canvas.getContext("2d");
    canvas.tabIndex = 0;                        // no role: a focusable role=img fails the menu audit; the label says it all
    let W = Math.max(1, canvas.width || 300), H = Math.max(1, canvas.height || 60), ratio = 1;
    let tr = null, speed = null, ticks = [];    // the built lap, its point-mass speeds, control-point arcs (m)
    let bumps = [], issues = [], cursor = null;
    let sel = -1, ptype = "mouse";
    let drag = null;                            // { id, i, x0, y0, b0, cur, axis, moved, mpp, frame }
    let tap = null;                             // a press on empty strip { id, x0, y0 }
    let held = -1;                              // the pointer whose long-press removed a hill: its release ends it
    let hold = null;                            // a long-press in flight { id, timer }
    let pend = [];                              // edits handed back, drawn until the rebuild that carries them lands

    // ── heights ─────────────────────────────────────────────────────────────
    /** The built py with every pending edit (and the live drag) swapped in:
     *  minus the bump as built, plus the bump as it will be. */
    function heights() {
      const n = tr.n, ds = tr.total / n, h = Float64Array.from(tr.py);
      const deltas = drag && drag.moved ? pend.concat([{ old: drag.b0, nu: drag.cur }]) : pend;
      for (const { old, nu } of deltas) {
        for (const [b, sg] of [[old, -1], [nu, 1]]) {
          if (!b) continue;
          const cs = b.s * tr.total;
          for (let k = 0; k < n; k++) { let d = Math.abs(k * ds - cs); d = Math.min(d, tr.total - d); if (d < b.halfM) h[k] += sg * bumpAt(b, d); }
        }
      }
      return h;
    }
    function frameOf(h) {
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < h.length; k++) { if (h[k] < lo) lo = h[k]; if (h[k] > hi) hi = h[k]; }
      const span = Math.max(MIN_SPAN, hi - lo);
      return { lo: (lo + hi) / 2 - span / 2, span, min: lo, max: hi };
    }
    let hs = null, fr = null;                   // this render's heights and vertical frame
    const X = (sM) => (tr ? sM / tr.total * W : 0);
    const Y = (h) => H - PAD - (h - fr.lo) / fr.span * (H - 2 * PAD);
    const hAt = (sM) => { const n = tr.n; return hs[((Math.round(sM / tr.total * n) % n) + n) % n]; };
    /** The hill as drawn: the drag's copy while it moves, else the list's. */
    const shown = (i) => (drag && drag.i === i && drag.moved ? drag.cur : bumps[i]);
    function grip(i) { const b = shown(i), sM = b.s * tr.total; return { x: X(sM), y: Y(hAt(sM)) }; }
    /** Hill indices in driving order (what [ ] walk and the label counts). */
    const order = () => bumps.map((b, i) => i).sort((a, b) => bumps[a].s - bumps[b].s || a - b);

    // ── size ────────────────────────────────────────────────────────────────
    // select-screen.js drawElevProfile's recipe: the buffer is the measured box
    // times the effective zoom × dpr (capped at 3), drawing in css px through
    // the transform. A hidden strip (a short landscape phone) measures 0: keep
    // the last box until the observer sees it again.
    function resize() {
      const bw = canvas.clientWidth, bh = canvas.clientHeight;
      if (bw > 0 && bh > 0) { W = bw; H = bh; }
      const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
      ratio = Math.min(3, Math.max(1, (canvas.currentCSSZoom || 1) * dpr));
      const pw = Math.max(1, Math.round(W * ratio)), ph = Math.max(1, Math.round(H * ratio));
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      render();
    }
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);

    // ── input ───────────────────────────────────────────────────────────────
    function local(ev) { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
    function hit(x, y) {
      if (!tr || !hs) return -1;
      const r = ptype === "touch" ? DC.HIT_TOUCH : DC.HIT_PX;
      let best = -1, bd = r * r;
      for (let i = 0; i < bumps.length; i++) { const p = grip(i), d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y); if (d < bd) { bd = d; best = i; } }
      return best;
    }
    function choose(i) {
      i = Number.isInteger(i) && i >= 0 && i < bumps.length ? i : -1;
      if (i === sel) return;
      sel = i;
      if (hooks.onSelect) hooks.onSelect(sel);
    }
    /** Hand an edit back: drawn at once (pend), committed by the screen. */
    function hand(i, b0, nu) {
      if (same(b0, nu)) return false;
      pend.push({ old: b0, nu });
      bumps = bumps.slice(); bumps[i] = nu;
      if (hooks.onChange) hooks.onChange(i, Object.assign({}, nu), false);
      return true;
    }
    function remove(i) {
      if (!(i >= 0 && i < bumps.length)) return;
      pend.push({ old: bumps[i], nu: null });
      bumps = bumps.filter((b, j) => j !== i);
      sel = -1;
      if (hooks.onRemove) hooks.onRemove(i);
      if (hooks.onSelect) hooks.onSelect(-1);
    }
    function cancelHold() {
      if (!hold) return;
      try { globalThis.clearTimeout(hold.timer); } catch (_) { /* no timers here */ }
      hold = null;
    }
    function armHold(id, i) {
      cancelHold();
      if (typeof globalThis.setTimeout !== "function") return;
      const me = { id, timer: null };
      me.timer = globalThis.setTimeout(() => {
        if (hold !== me || !drag || drag.id !== id || drag.i !== i || drag.moved) return;
        hold = null; drag = null; held = id;
        remove(i);
        render();
      }, DC.HOLD_MS);
      hold = me;
    }
    function onDown(ev) {
      if (ev.button != null && ev.button > 0) return;
      if (ev.pointerType) ptype = ev.pointerType;
      if (ev.preventDefault) ev.preventDefault();
      try { canvas.focus({ preventScroll: true }); } catch (_) { canvas.focus(); }
      if (drag || tap) return;                  // one finger at a time: a second is ignored
      try { canvas.setPointerCapture(ev.pointerId); } catch (_) { /* a synthetic event */ }
      const p = local(ev), i = hit(p.x, p.y);
      if (i >= 0) {
        choose(i);
        // The vertical scale freezes for the drag: the grip stays under the finger.
        const f = fr || { lo: 0, span: MIN_SPAN };
        drag = { id: ev.pointerId, i, x0: p.x, y0: p.y, b0: bumps[i], cur: bumps[i], axis: null, moved: false, shift: !!ev.shiftKey, mpp: f.span / Math.max(1, H - 2 * PAD), frame: f };
        armHold(ev.pointerId, i);
        render();
        return;
      }
      tap = { id: ev.pointerId, x0: p.x, y0: p.y };
    }
    function onMove(ev) {
      if (ev.pointerType) ptype = ev.pointerType;
      if (!drag || drag.id !== ev.pointerId || !tr) return;
      const p = local(ev), dx = p.x - drag.x0, dy = p.y - drag.y0, far = Math.hypot(dx, dy);
      if (far > HOLD_PX) cancelHold();
      if (!drag.moved) {
        if (far <= DRAG_PX) return;
        // One axis per drag: up/down is the height, sideways the place —
        // or, with Shift held at the start, the length.
        drag.moved = true;
        drag.axis = Math.abs(dy) > Math.abs(dx) ? "rise" : drag.shift || ev.shiftKey ? "halfM" : "s";
      }
      const b0 = drag.b0;
      const next = drag.axis === "rise" ? hill(Object.assign({}, b0, { rise: b0.rise - dy * drag.mpp }))
        : drag.axis === "halfM" ? hill(Object.assign({}, b0, { halfM: b0.halfM + dx * tr.total / W }))
          : hill(Object.assign({}, b0, { s: b0.s + dx / W }));
      if (!same(next, drag.cur)) { drag.cur = next; if (hooks.onChange) hooks.onChange(drag.i, Object.assign({}, next), true); }
      render();
    }
    function onUp(ev) {
      if (held === ev.pointerId || (drag && drag.id === ev.pointerId) || (tap && tap.id === ev.pointerId)) {
        try { canvas.releasePointerCapture(ev.pointerId); } catch (_) { /* not captured */ }
      }
      if (held === ev.pointerId) { held = -1; return; }
      if (drag && drag.id === ev.pointerId) {
        cancelHold();
        const d = drag; drag = null;
        if (d.moved) hand(d.i, d.b0, d.cur);
        render();
        return;
      }
      if (tap && tap.id === ev.pointerId) {
        const t = tap; tap = null;
        const p = local(ev);
        if (tr && Math.hypot(p.x - t.x0, p.y - t.y0) <= HOLD_PX && hooks.onAdd) hooks.onAdd(Math.min(1, Math.max(0, p.x / W)) * tr.total);
      }
    }
    // pointercancel AND lostpointercapture (a dialog hidden mid-drag): the edit in flight is dropped.
    function onCancel(ev) {
      if (held === ev.pointerId) held = -1;
      if (drag && drag.id === ev.pointerId) { cancelHold(); drag = null; render(); }
      if (tap && tap.id === ev.pointerId) tap = null;
    }
    // Keyboard and pad: the strip owns the arrows only while a hill is
    // selected (data-arrows, js/ui/menu-nav.js), so with none the d-pad walks
    // on. [ ] pick, Up/Down height (1 m, Shift 5), Left/Right move 10 m
    // (Shift: length ±20 m), Enter adds a hill at the cursor, Delete removes, Escape lets go.
    function onKey(ev) {
      const k = ev.key;
      if (k === "[" || k === "]") {
        if (!bumps.length) return;
        ev.preventDefault();
        const o = order(), at = o.indexOf(sel);
        choose(o[at < 0 ? (k === "]" ? 0 : o.length - 1) : (at + (k === "]" ? 1 : -1) + o.length) % o.length]);
        render();
        return;
      }
      if (k === "Enter") {
        if (!tr || !hooks.onAdd) return;
        ev.preventDefault();
        hooks.onAdd(cursor != null ? cursor : sel >= 0 ? bumps[sel].s * tr.total : tr.total / 2);
        return;
      }
      if (sel < 0 || sel >= bumps.length) return;   // nothing selected: the key is not ours
      if (k === "Escape") { ev.preventDefault(); choose(-1); render(); return; }
      if (k === "Delete" || k === "Backspace") { ev.preventDefault(); remove(sel); render(); return; }
      const b = bumps[sel], big = !!ev.shiftKey;
      let nu = null;
      if (k === "ArrowUp" || k === "ArrowDown") nu = hill(Object.assign({}, b, { rise: b.rise + (k === "ArrowUp" ? 1 : -1) * (big ? KEY.riseBig : KEY.rise) }));
      else if (k === "ArrowLeft" || k === "ArrowRight") {
        const dir = k === "ArrowRight" ? 1 : -1;
        nu = big ? hill(Object.assign({}, b, { halfM: b.halfM + dir * KEY.halfM })) : tr ? hill(Object.assign({}, b, { s: b.s + dir * KEY.sM / tr.total })) : b;
      } else return;
      ev.preventDefault();
      hand(sel, b, nu);
      render();
    }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("lostpointercapture", onCancel);
    canvas.addEventListener("keydown", onKey);

    // ── render ──────────────────────────────────────────────────────────────
    const KEYS = "[ ] pick, Up/Down height, Left/Right move, Shift+Left/Right length, Enter adds at the selected point, Delete removes";
    /** The accessible name says which hill is selected and what it is. */
    function label() {
      const N = bumps.length;
      if (sel >= 0 && sel < N) {
        const b = shown(sel);
        return "Elevation profile. Hill " + (order().indexOf(sel) + 1) + " of " + N + ": " + fmtRise(b.rise) + " m over " + (2 * b.halfM) + " m" + (tr ? " at " + fmtKm(b.s * tr.total) : "") + ". " + KEYS;
      }
      return "Elevation profile. " + (N ? N + (N === 1 ? " hill" : " hills") : "No hills") + ". " + KEYS;
    }
    function trace() {
      const n = tr.n;
      g.beginPath();
      for (let k = 0; k <= n; k++) { const x = k / n * W, y = Y(hs[k % n]); k ? g.lineTo(x, y) : g.moveTo(x, y); }
    }
    function render() {
      // MenuNav (js/ui/menu-nav.js) reads this: a focused canvas owns the
      // arrows only while they move something.
      const arrows = sel >= 0 ? "own" : "pass";
      if (canvas.dataset && canvas.dataset.arrows !== arrows) canvas.dataset.arrows = arrows;
      const name = label();
      if (canvas.getAttribute("aria-label") !== name) canvas.setAttribute("aria-label", name);
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.clearRect(0, 0, W, H);
      if (!tr || !tr.py || !(tr.n > 2)) { hs = null; fr = null; return; }
      hs = heights();
      fr = drag && drag.moved && drag.axis === "rise" ? drag.frame : frameOf(hs);
      // fill to the baseline, then the open stroke (no closing verticals)
      trace(); g.lineTo(W, H); g.lineTo(0, H); g.closePath();
      g.fillStyle = COL.road; g.fill();
      trace(); g.strokeStyle = COL.info; g.lineWidth = 1.5; g.stroke();
      // Control-point ticks: each point's share of the control polygon, scaled
      // to the built lap — an approximation of where it lands on the built arc
      // (the engine's smoothing moves it a little), good enough to find a point.
      g.strokeStyle = COL.ctrl; g.lineWidth = 1;
      for (const t of ticks) { const x = X(t); g.beginPath(); g.moveTo(x, H - 5); g.lineTo(x, H); g.stroke(); }
      // the start / finish line
      g.strokeStyle = COL.start; g.lineWidth = 2;
      g.beginPath(); g.moveTo(1, 0); g.lineTo(1, H); g.stroke();
      // the main canvas's selected point
      if (cursor != null && Number.isFinite(cursor)) { const x = X(cursor); g.strokeStyle = COL.sel; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      // the selected hill's footprint along the floor
      if (sel >= 0 && sel < bumps.length) {
        const b = shown(sel), x0 = X(b.s * tr.total - b.halfM), x1 = X(b.s * tr.total + b.halfM);
        g.strokeStyle = COL.span; g.lineWidth = 4;
        g.beginPath(); g.moveTo(Math.max(0, x0), H - 2); g.lineTo(Math.min(W, x1), H - 2); g.stroke();
        if (x0 < 0) { g.beginPath(); g.moveTo(W + x0, H - 2); g.lineTo(W, H - 2); g.stroke(); }
        if (x1 > W) { g.beginPath(); g.moveTo(0, H - 2); g.lineTo(x1 - W, H - 2); g.stroke(); }
      }
      // grade / crest / dip issues
      for (const it of issues) {
        const x = X(it.s), y = Y(hAt(it.s));
        g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2);
        g.fillStyle = it.level === "red" ? COL.red : COL.amber; g.fill();
      }
      // the hills' grips
      for (let i = 0; i < bumps.length; i++) {
        const p = grip(i), on = i === sel, r = (on ? 6 : 4.5) * (ptype === "touch" ? 1.5 : 1);
        g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.fillStyle = on ? COL.sel : COL.handle; g.fill();
        g.strokeStyle = "#000"; g.lineWidth = 1; g.stroke();
      }
      // heights: the lap's top and bottom, and the selected hill's numbers
      g.font = LABEL_FONT; g.textBaseline = "top"; g.fillStyle = COL.text; g.textAlign = "right";
      g.fillText(Math.round(fr.max) + " m", W - 4, 2);
      g.textBaseline = "bottom"; g.fillText(Math.round(fr.min) + " m", W - 4, H - 2);
      g.textAlign = "left"; g.textBaseline = "top";
      if (sel >= 0 && sel < bumps.length) {
        const b = shown(sel), sM = b.s * tr.total, v = speed && speed.length === tr.n ? speed[((Math.round(sM / tr.total * tr.n) % tr.n) + tr.n) % tr.n] : 0;
        // The cosine's peak curvature rise·π²/(2·halfM²) at the point-mass speed: the g a crest takes off (a dip adds).
        const gs = v ? Math.abs(b.rise) * Math.PI * Math.PI / (2 * b.halfM * b.halfM) * v * v / 9.81 : 0;
        const text = fmtRise(b.rise) + " m · " + (2 * b.halfM) + " m" + (gs ? " · " + gs.toFixed(1) + " g" : "");
        g.fillStyle = COL.chipText; g.fillText(text, 6, 2);
      }
      g.textAlign = "start";
    }

    // ── api ─────────────────────────────────────────────────────────────────
    function reset() {
      cancelHold();
      drag = null; tap = null; held = -1;
      render();
    }
    const api = {
      /** The preview's built lap, its point-mass speeds (m/s per node) and the
       *  control loop it was built from (the tick marks). A new build carries
       *  every edit handed back, so the pending overlay ends here. */
      setBuilt(t, v, pts) {
        tr = t && t.n > 2 && t.py ? t : null;
        speed = v && tr && v.length === tr.n ? v : null;
        pend = [];
        ticks = [];
        if (tr && Array.isArray(pts) && pts.length >= 2) {
          const L = S.polyLen(pts);
          let c = 0;
          for (let i = 0; i < pts.length && L > 0; i++) { ticks.push(c / L * tr.total); const a = pts[i], b = pts[(i + 1) % pts.length]; c += Math.hypot(b[0] - a[0], b[1] - a[1]); }
        }
        render();
      },
      /** The design's elevations, as stored. A selection past the end is dropped. */
      setBumps(list) {
        bumps = Array.isArray(list) ? list.map((b) => hill(b)) : [];
        if (sel >= bumps.length) sel = -1;
        if (drag && drag.i >= bumps.length) drag = null;
        render();
      },
      /** The main canvas's selected point, metres along the built lap (null: none). */
      setCursor(sM) { cursor = Number.isFinite(sM) ? sM : null; render(); },
      /** The verdict's issues: the grade / crest / dip ones (with a finite s) are dotted on the strip. */
      setIssues(list) { issues = (Array.isArray(list) ? list : []).filter((it) => it && Number.isFinite(it.s) && /^(grade|fia-grade|fia-crest|fia-sag)$/.test(it.code)); render(); },
      selected() { return sel; },
      /** Select hill i (-1: none) without telling onSelect — the screen is the caller. */
      select(i) { sel = Number.isInteger(i) && i >= 0 && i < bumps.length ? i : -1; render(); },
      resize,
      render,
      reset,
      destroy() { if (ro) ro.disconnect(); reset(); },
    };
    resize();
    return api;
  }

  return { create, hill, ADD, KEY };
})();
Object.freeze(DesignerProfile);
