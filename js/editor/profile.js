/* Apex 26 — DesignerProfile: the track designer's elevation strip under the
   main canvas. Draws the ENGINE-built height profile and one grip per control
   point (per-node heights[]). Drag a grip up/down to set that node's height
   (0.25 m lattice, ±CustomTracks.LIMITS.rise). Touch hits ≥44 css px. Keyboard:
   [ ] pick, Up/Down height (Shift ×5), Delete / Enter flatten the node, Escape
   clears selection. Touches no store and no engine. LAZY_EDITOR, after
   elev-presets.js / canvas.js. */
const DesignerProfile = (function () {
  "use strict";
  const S = TrackShape;
  const PAD = 3;
  const MIN_SPAN = 8;
  const DRAG_PX = 3, HOLD_PX = 6;
  const KEY = Object.freeze({ rise: 1, riseBig: 5 });
  const HIT_PX = 24, HIT_TOUCH = 44;   // ≥44 px under a finger (WCAG / Bryce mobile)
  const GRIP_R = 7, GRIP_R_TOUCH = 12;
  const LABEL_FONT = "11px system-ui, sans-serif";
  const lim = () => (typeof CustomTracks !== "undefined" && CustomTracks.LIMITS) || { rise: 60 };
  const clampH = (h) => {
    if (typeof ElevPresets !== "undefined" && ElevPresets.clampH) return ElevPresets.clampH(h);
    const cap = lim().rise, v = Number.isFinite(+h) ? +h : 0;
    return Math.round(Math.min(cap, Math.max(-cap, v)) * 4) / 4 || 0;
  };
  const fmtRise = (r) => (r < 0 ? "−" : "+") + String(Math.abs(r));
  const fmtKm = (m) => (m / 1000).toFixed(2) + " km";

  /** Mount on a <canvas>. hooks: onChange(i, height, live), onSelect(i) (-1 none). */
  function create(canvas, hooks) {
    hooks = hooks || {};
    const COL = (typeof DesignerCanvas !== "undefined" && DesignerCanvas.COL) || {};
    const g = canvas.getContext("2d");
    canvas.tabIndex = 0;
    let W = Math.max(1, canvas.width || 300), H = Math.max(1, canvas.height || 72), ratio = 1;
    let tr = null, speed = null, ticks = [];   // built lap, speeds, control arcs (m)
    let nodeH = [];                             // per-node heights (metres)
    let issues = [], cursor = null;
    let sel = -1, ptype = "mouse";
    let drag = null;                            // { id, i, y0, h0, cur, moved, mpp, frame }
    let liveH = null;                           // heights overlay while dragging

    function heightsShown() {
      if (!tr) return null;
      const h = Float64Array.from(tr.py);
      // Live drag: lift the profile near the control tick by (cur - h0).
      if (drag && drag.moved && ticks[drag.i] != null) {
        const cs = ticks[drag.i], half = Math.max(40, (tr.total || 1) / Math.max(8, ticks.length));
        const dy = drag.cur - drag.h0, ds = tr.total / tr.n;
        for (let k = 0; k < tr.n; k++) {
          let d = Math.abs(k * ds - cs); d = Math.min(d, tr.total - d);
          if (d < half) h[k] += dy * 0.5 * (1 + Math.cos(Math.PI * d / half));
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
    let hs = null, fr = null;
    const X = (sM) => (tr ? sM / tr.total * W : 0);
    const Y = (h) => H - PAD - (h - fr.lo) / fr.span * (H - 2 * PAD);
    const hAt = (sM) => { const n = tr.n; return hs[((Math.round(sM / tr.total * n) % n) + n) % n]; };
    function grip(i) {
      const sM = ticks[i] != null ? ticks[i] : 0;
      const base = hAt(sM);
      const shown = (liveH && liveH[i] != null) ? base + (liveH[i] - (nodeH[i] || 0)) : base;
      return { x: X(sM), y: Y(shown) };
    }

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

    function local(ev) { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
    function hit(x, y) {
      if (!tr || !hs || !ticks.length) return -1;
      const r = ptype === "touch" ? HIT_TOUCH : HIT_PX;
      let best = -1, bd = r * r;
      for (let i = 0; i < ticks.length; i++) {
        const p = grip(i), d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    function choose(i) {
      i = Number.isInteger(i) && i >= 0 && i < ticks.length ? i : -1;
      if (i === sel) return;
      sel = i;
      if (hooks.onSelect) hooks.onSelect(sel);
    }
    function hand(i, h0, nu) {
      if (clampH(h0) === clampH(nu)) return false;
      nodeH = nodeH.slice(); nodeH[i] = clampH(nu);
      liveH = null;
      if (hooks.onChange) hooks.onChange(i, nodeH[i], false);
      return true;
    }

    function onDown(ev) {
      if (ev.button != null && ev.button > 0) return;
      if (ev.pointerType) ptype = ev.pointerType;
      if (ev.preventDefault) ev.preventDefault();
      try { canvas.focus({ preventScroll: true }); } catch (_) { canvas.focus(); }
      if (drag) return;
      try { canvas.setPointerCapture(ev.pointerId); } catch (_) { /* synthetic */ }
      const p = local(ev), i = hit(p.x, p.y);
      if (i < 0) return;
      choose(i);
      const f = fr || { lo: 0, span: MIN_SPAN };
      drag = { id: ev.pointerId, i, y0: p.y, h0: nodeH[i] || 0, cur: nodeH[i] || 0, moved: false, mpp: f.span / Math.max(1, H - 2 * PAD), frame: f };
      render();
    }
    function onMove(ev) {
      if (ev.pointerType) ptype = ev.pointerType;
      if (!drag || drag.id !== ev.pointerId || !tr) return;
      const p = local(ev), dy = p.y - drag.y0;
      if (!drag.moved) {
        if (Math.abs(dy) <= DRAG_PX) return;
        drag.moved = true;
      }
      const next = clampH(drag.h0 - dy * drag.mpp);
      if (next !== drag.cur) {
        drag.cur = next;
        liveH = nodeH.slice(); liveH[drag.i] = next;
        if (hooks.onChange) hooks.onChange(drag.i, next, true);
      }
      render();
    }
    function onUp(ev) {
      if (drag && drag.id === ev.pointerId) {
        try { canvas.releasePointerCapture(ev.pointerId); } catch (_) { /* */ }
        const d = drag; drag = null;
        if (d.moved) hand(d.i, d.h0, d.cur);
        else liveH = null;
        render();
      }
    }
    function onCancel(ev) {
      if (drag && drag.id === ev.pointerId) { drag = null; liveH = null; render(); }
    }
    function onKey(ev) {
      const k = ev.key, n = ticks.length;
      if (k === "[" || k === "]") {
        if (!n) return;
        ev.preventDefault();
        const at = sel < 0 ? (k === "]" ? -1 : 0) : sel;
        choose(((at + (k === "]" ? 1 : -1)) % n + n) % n);
        render();
        return;
      }
      if (sel < 0 || sel >= n) return;
      if (k === "Escape") { ev.preventDefault(); choose(-1); render(); return; }
      if (k === "Delete" || k === "Backspace" || k === "Enter") {
        ev.preventDefault();
        hand(sel, nodeH[sel] || 0, 0);
        render();
        return;
      }
      if (k === "ArrowUp" || k === "ArrowDown") {
        const step = (k === "ArrowUp" ? 1 : -1) * (ev.shiftKey ? KEY.riseBig : KEY.rise);
        ev.preventDefault();
        hand(sel, nodeH[sel] || 0, (nodeH[sel] || 0) + step);
        render();
      }
    }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("lostpointercapture", onCancel);
    canvas.addEventListener("keydown", onKey);

    const KEYS = "[ ] pick a point · Up/Down set height (Shift ×5) · Delete or Enter flattens · Escape clears";
    function label() {
      const n = ticks.length;
      if (sel >= 0 && sel < n) {
        const h = (liveH && liveH[sel] != null) ? liveH[sel] : (nodeH[sel] || 0);
        return "Elevation profile. Point " + (sel + 1) + " of " + n + ": " + fmtRise(h) + " m" + (tr && ticks[sel] != null ? " at " + fmtKm(ticks[sel]) : "") + ". " + KEYS;
      }
      return "Elevation profile. " + n + " control points. Drag a grip up or down. " + KEYS;
    }
    function trace() {
      const n = tr.n;
      g.beginPath();
      for (let k = 0; k <= n; k++) { const x = k / n * W, y = Y(hs[k % n]); k ? g.lineTo(x, y) : g.moveTo(x, y); }
    }
    function render() {
      const arrows = sel >= 0 ? "own" : "pass";
      if (canvas.dataset && canvas.dataset.arrows !== arrows) canvas.dataset.arrows = arrows;
      const name = label();
      if (canvas.getAttribute("aria-label") !== name) canvas.setAttribute("aria-label", name);
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.clearRect(0, 0, W, H);
      if (!tr || !tr.py || !(tr.n > 2)) { hs = null; fr = null; return; }
      hs = heightsShown();
      fr = drag && drag.moved ? drag.frame : frameOf(hs);
      trace(); g.lineTo(W, H); g.lineTo(0, H); g.closePath();
      g.fillStyle = COL.road || "rgba(40,44,52,0.9)"; g.fill();
      trace(); g.strokeStyle = COL.info || "#7eb8ff"; g.lineWidth = 1.5; g.stroke();
      g.strokeStyle = COL.ctrl || "rgba(154,154,168,0.75)"; g.lineWidth = 1;
      for (const t of ticks) { const x = X(t); g.beginPath(); g.moveTo(x, H - 5); g.lineTo(x, H); g.stroke(); }
      g.strokeStyle = COL.start || "#e10600"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(1, 0); g.lineTo(1, H); g.stroke();
      if (cursor != null && Number.isFinite(cursor)) {
        const x = X(cursor); g.strokeStyle = COL.sel || "#ffd166"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      }
      for (const it of issues) {
        const x = X(it.s), y = Y(hAt(it.s));
        g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2);
        g.fillStyle = it.level === "red" ? (COL.red || "#ff4d4d") : (COL.amber || "#ffb020"); g.fill();
      }
      const touch = ptype === "touch";
      for (let i = 0; i < ticks.length; i++) {
        const p = grip(i), on = i === sel;
        const r = (on ? GRIP_R + 2 : GRIP_R) * (touch ? GRIP_R_TOUCH / GRIP_R : 1);
        // Invisible hit halo (drawn lightly) so touch targets read as ≥44 px.
        if (touch) {
          g.beginPath(); g.arc(p.x, p.y, HIT_TOUCH / 2, 0, Math.PI * 2);
          g.fillStyle = on ? "rgba(255,209,102,0.12)" : "rgba(246,246,249,0.06)"; g.fill();
        }
        g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.fillStyle = on ? (COL.sel || "#ffd166") : (COL.handle || "#f6f6f9"); g.fill();
        g.strokeStyle = "#000"; g.lineWidth = 1; g.stroke();
      }
      // heights: the lap's top and bottom (one label when they round equal —
      // a flat circuit used to paint dual colliding "0 m"s). Selected point next.
      g.font = LABEL_FONT; g.fillStyle = COL.text || "#c8c8d0"; g.textAlign = "right";
      const hiM = Math.round(fr.max) + " m", loM = Math.round(fr.min) + " m";
      if (hiM === loM) {
        g.textBaseline = "middle";
        g.fillText(hiM, W - 4, H / 2);
      } else {
        g.textBaseline = "top"; g.fillText(hiM, W - 4, 2);
        g.textBaseline = "bottom"; g.fillText(loM, W - 4, H - 2);
      }
      g.textAlign = "left"; g.textBaseline = "top";
      if (sel >= 0 && sel < ticks.length) {
        const h = (liveH && liveH[sel] != null) ? liveH[sel] : (nodeH[sel] || 0);
        g.fillStyle = COL.chipText || "#f6f6f9";
        g.fillText("PT " + (sel + 1) + " · " + fmtRise(h) + " m", 6, 2);
      }
      g.textAlign = "start";
    }

    function reset() { drag = null; liveH = null; render(); }
    const api = {
      setBuilt(t, v, pts) {
        tr = t && t.n > 2 && t.py ? t : null;
        speed = v && tr && v.length === tr.n ? v : null;
        ticks = [];
        if (tr && Array.isArray(pts) && pts.length >= 2) {
          const L = S.polyLen(pts);
          let c = 0;
          for (let i = 0; i < pts.length && L > 0; i++) {
            ticks.push(c / L * tr.total);
            const a = pts[i], b = pts[(i + 1) % pts.length];
            c += Math.hypot(b[0] - a[0], b[1] - a[1]);
          }
          if (nodeH.length !== pts.length) {
            const next = new Array(pts.length);
            for (let i = 0; i < pts.length; i++) next[i] = i < nodeH.length ? clampH(nodeH[i]) : 0;
            nodeH = next;
            if (sel >= nodeH.length) sel = -1;
          }
        }
        render();
      },
      /** Per-node heights (metres). Length should match the control loop. */
      setHeights(list) {
        nodeH = Array.isArray(list) ? list.map(clampH) : [];
        if (sel >= nodeH.length) sel = -1;
        if (drag && drag.i >= nodeH.length) drag = null;
        liveH = null;
        render();
      },
      /** @deprecated cosine hills — ignored; kept so older harnesses do not throw. */
      setBumps() { /* no-op: elevation is per-node heights */ },
      setCursor(sM) { cursor = Number.isFinite(sM) ? sM : null; render(); },
      setIssues(list) {
        issues = (Array.isArray(list) ? list : []).filter((it) => it && Number.isFinite(it.s) && /^(grade|fia-grade|fia-crest|fia-sag)$/.test(it.code));
        render();
      },
      selected() { return sel; },
      // Same path as a grip tap: update sel and tell the screen (POINT m stepper).
      select(i) { choose(i); render(); },
      resize, render, reset,
      destroy() { if (ro) ro.disconnect(); reset(); },
    };
    resize();
    return api;
  }

  // hill / ADD kept as no-op shims for older unit harnesses that import them.
  const hill = (b) => (typeof ElevPresets !== "undefined" ? { s: 0, halfM: 160, rise: ElevPresets.clampH(b && b.rise) } : { s: 0, halfM: 160, rise: 0 });
  return { create, hill, ADD: Object.freeze({ halfM: 160, rise: 6 }), KEY, HIT_PX, HIT_TOUCH };
})();
Object.freeze(DesignerProfile);
