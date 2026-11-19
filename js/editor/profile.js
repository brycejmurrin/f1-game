const DesignerProfile = (function () {
  "use strict";
  const S = TrackShape;
  const PAD = 3;
  const MIN_SPAN = 8;
  const DRAG_MOUSE = 6, DRAG_TOUCH = 10, TOUCH_ARM_MS = 140;
  const KEY = Object.freeze({ rise: 1, riseBig: 5 });
  const HIT_PX = 28, HIT_TOUCH = 44;
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

  function create(canvas, hooks) {
    hooks = hooks || {};
    const COL = (typeof DesignerCanvas !== "undefined" && DesignerCanvas.COL) || {};
    const g = canvas.getContext("2d");
    canvas.tabIndex = 0;
    let W = Math.max(1, canvas.width || 300), H = Math.max(1, canvas.height || 72), ratio = 1;
    let tr = null, speed = null, ticks = [];
    let nodeH = [];
    let issues = [], cursor = null;
    let sel = -1, span = -1, ptype = "mouse", viewStart = 0, viewSpan = 1;
    let drag = null;
    let liveH = null;
    const groupOf = (a, b) => S.spanIndices(a, b, ticks.length || nodeH.length);
    const inGroup = (i) => S.inSpan(i, sel, span, ticks.length || nodeH.length);
    function tellSelect() { if (hooks.onSelect) hooks.onSelect(sel, span); }

    function heightsShown() {
      if (!tr) return null;
      const h = Float64Array.from(tr.py);
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
    const X = (sM) => (tr ? (sM / tr.total - viewStart) / viewSpan * W : 0);
    const Y = (h) => H - PAD - (h - fr.lo) / fr.span * (H - 2 * PAD);
    const hAt = (sM) => { const n = tr.n; return hs[((Math.round(sM / tr.total * n) % n) + n) % n]; };
    function grip(i) {
      const sM = ticks[i] != null ? ticks[i] : 0;
      return { x: X(sM), y: Y(hAt(sM)) };
    }

    let destroyed = false;
    function resize() {
      if (destroyed) return;
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

    function local(ev) { const r = canvas.getBoundingClientRect(); return { x: (ev.clientX - r.left) * W / (r.width || W), y: (ev.clientY - r.top) * H / (r.height || H) }; }
    function hit(x, y) {
      if (!tr || !hs || !ticks.length) return -1;
      let best = -1, bd = Infinity;
      for (let i = 0; i < ticks.length; i++) {
        const p = grip(i), d = Math.abs(p.x - x);
        if (p.x < 0 || p.x > W) continue;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    function choose(i, j) {
      const n = ticks.length || nodeH.length;
      i = Number.isInteger(i) && i >= 0 && i < n ? i : -1;
      j = (i >= 0 && Number.isInteger(j) && j >= 0 && j < n && j !== i) ? j : -1;
      if (i === sel && j === span) return;
      sel = i; span = j;
      tellSelect();
    }
    function boundedDelta(origins, dh) {
      const cap = lim().rise;
      let lo = -Infinity, hi = Infinity;
      for (const h of origins) { lo = Math.max(lo, -cap - h); hi = Math.min(hi, cap - h); }
      return Math.min(hi, Math.max(lo, dh));
    }
    function hand(i, h0, nu) {
      const group = (span >= 0 && span !== sel && inGroup(i)) ? groupOf(sel, span) : [i];
      const origins = group.map((j) => clampH(nodeH[j] || 0));
      const dh = boundedDelta(origins, clampH(nu) - clampH(h0));
      liveH = null;
      if (!dh) return false;
      nodeH = nodeH.slice();
      for (let k = 0; k < group.length; k++) nodeH[group[k]] = clampH(origins[k] + dh);
      if (hooks.onChange) hooks.onChange(i, nodeH[i], false, nodeH.slice());
      return true;
    }
    function paintLive(anchor, cur) {
      const group = drag.group || [anchor];
      const dh = boundedDelta(drag.origins, clampH(cur) - clampH(drag.h0));
      const next = clampH(drag.h0 + dh);
      if (next === drag.cur) return;
      drag.cur = next;
      liveH = nodeH.slice();
      for (let k = 0; k < group.length; k++) liveH[group[k]] = clampH((drag.origins[k] || 0) + dh);
      if (hooks.onChange) hooks.onChange(anchor, liveH[anchor], true, liveH.slice());
    }

    function onDown(ev) {
      if (ev.button != null && ev.button > 0) return;
      if (ev.pointerType) ptype = ev.pointerType;
      if (ev.preventDefault) ev.preventDefault();
      try { canvas.focus({ preventScroll: true }); } catch (_) { canvas.focus(); }
      if (drag) return;
      try { canvas.setPointerCapture(ev.pointerId); } catch (_) {  }
      const p = local(ev), i = hit(p.x, p.y);
      if (i < 0) return;
      if (hooks.rangeSelect && hooks.rangeSelect()) {
        const anchor = sel >= 0 && span < 0 ? sel : i;
        choose(anchor, i);
        drag = { id: ev.pointerId, range: true, anchor };
        render(); return;
      }
      const wasSel = sel === i || inGroup(i);
      const shift = !!(ev.shiftKey || (hooks.extendSelection && hooks.extendSelection()));
      if (shift && sel >= 0 && sel !== i) choose(sel, i);
      else if (!wasSel) choose(i, -1);
      const f = fr || { lo: 0, span: MIN_SPAN };
      const group = (span >= 0 && span !== sel && inGroup(i)) ? groupOf(sel, span) : [i];
      drag = {
        id: ev.pointerId, i, y0: p.y, h0: nodeH[i] || 0, cur: nodeH[i] || 0,
        moved: false, mpp: f.span / Math.max(1, H - 2 * PAD), frame: f,
        wasSel, t0: Date.now(), touch: ptype === "touch",
        group, origins: group.map((j) => clampH(nodeH[j] || 0)),
      };
      render();
    }
    function onMove(ev) {
      if (ev.pointerType) ptype = ev.pointerType;
      if (!drag || drag.id !== ev.pointerId || !tr) return;
      const p = local(ev);
      if (drag.range) { choose(drag.anchor, hit(p.x, p.y)); render(); return; }
      const dy = p.y - drag.y0;
      if (!drag.moved) {
        const thresh = (drag.touch || ptype === "touch") ? DRAG_TOUCH : DRAG_MOUSE;
        if (Math.abs(dy) <= thresh) return;
        const held = (Date.now() - drag.t0) >= TOUCH_ARM_MS;
        if (!(drag.wasSel || ptype === "mouse" || held)) return;
        drag.moved = true;
      }
      const next = clampH(drag.h0 - dy * drag.mpp);
      paintLive(drag.i, next);
      render();
    }
    function onUp(ev) {
      if (drag && drag.id === ev.pointerId) {
        try { canvas.releasePointerCapture(ev.pointerId); } catch (_) {  }
        const d = drag; drag = null;
        if (d.range) { render(); return; }
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
        const dir = k === "[" ? -1 : 1;
        const at = sel < 0 ? (dir > 0 ? -1 : 0) : sel;
        choose(((at + dir) % n + n) % n, -1);
        render();
        return;
      }
      if (sel < 0 || sel >= n) return;
      if (k === "Escape") { ev.preventDefault(); choose(-1, -1); render(); return; }
      if (k === "Delete" || k === "Backspace" || k === "Enter") {
        ev.preventDefault();
        if (span >= 0 && span !== sel) {
          const group = groupOf(sel, span);
          nodeH = nodeH.slice();
          for (const j of group) nodeH[j] = 0;
          liveH = null;
          if (hooks.onChange) hooks.onChange(sel, 0, false, nodeH.slice());
        } else {
          hand(sel, nodeH[sel] || 0, 0);
        }
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
        const g = (span >= 0 && span !== sel) ? (" Span " + (sel + 1) + "–" + (span + 1) + " (" + groupOf(sel, span).length + " points).") : "";
        return "Elevation profile. Point " + (sel + 1) + " of " + n + ": " + fmtRise(h) + " m" + (tr && ticks[sel] != null ? " at " + fmtKm(ticks[sel]) : "") + "." + g + " " + KEYS;
      }
      return "Elevation profile. " + n + " control points. Tap anywhere in a point column to select, then drag vertically to set height. RANGE or shift-tap selects a section. " + KEYS;
    }
    function trace() {
      const n = tr.n;
      g.beginPath();
      for (let k = 0; k <= n; k++) { const x = X(k / n * tr.total), y = Y(hs[k % n]); k ? g.lineTo(x, y) : g.moveTo(x, y); }
    }
    function render() {
      if (destroyed) return;
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
      if (viewStart === 0) { g.beginPath(); g.moveTo(1, 0); g.lineTo(1, H); g.stroke(); }
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
      const gap = W / viewSpan / Math.max(1, ticks.length), dense = gap < 2 * GRIP_R * (touch ? 1.7 : 1);
      for (let i = 0; i < ticks.length; i++) {
        const p = grip(i), on = i === sel || inGroup(i);
        if (p.x < 0 || p.x > W) continue;
        const full = (on ? GRIP_R + 2 : GRIP_R) * (touch ? GRIP_R_TOUCH / GRIP_R : 1);
        const r = on ? full : Math.max(1.5, Math.min(full, gap * 0.4));
        if ((touch && !dense) || on) {
          g.beginPath(); g.arc(p.x, p.y, (touch ? HIT_TOUCH : HIT_PX) / 2, 0, Math.PI * 2);
          g.fillStyle = on ? "rgba(225,6,0,0.14)" : "rgba(246,246,249,0.06)"; g.fill();
        }
        if (on) {
          g.beginPath(); g.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
          g.strokeStyle = COL.sel || "#e10600"; g.lineWidth = 2.5; g.stroke();
        }
        g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.fillStyle = on ? (COL.sel || "#e10600") : (COL.handle || "#f6f6f9"); g.fill();
        g.strokeStyle = "#000"; g.lineWidth = 1; g.stroke();
      }
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
        const spanTxt = (span >= 0 && span !== sel) ? (" · SPAN " + (sel + 1) + "–" + (span + 1)) : "";
        g.fillText("PT " + (sel + 1) + " · " + fmtRise(h) + " m" + spanTxt, 6, 2);
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
            if (span >= nodeH.length) span = -1;
          }
        }
        render();
      },
      setHeights(list) {
        nodeH = Array.isArray(list) ? list.map(clampH) : [];
        if (sel >= nodeH.length) sel = -1;
        if (span >= nodeH.length) span = -1;
        if (drag && drag.i >= nodeH.length) drag = null;
        liveH = null;
        render();
      },
      setCursor(sM) { cursor = Number.isFinite(sM) ? sM : null; render(); },
      setIssues(list) {
        issues = (Array.isArray(list) ? list : []).filter((it) => it && Number.isFinite(it.s) && /^(grade|fia-grade|fia-crest|fia-sag)$/.test(it.code));
        render();
      },
      selected() { return sel; },
      selection() { return { sel, span }; },
      select(i, j) { choose(i, j); render(); },
      setSelection(i, j) { choose(i, j); render(); },
      zoom(factor) {
        if (!(factor > 0)) return;
        const center = tr && sel >= 0 && ticks[sel] != null ? ticks[sel] / tr.total : viewStart + viewSpan / 2;
        viewSpan = Math.min(1, Math.max(1 / 16, viewSpan / factor));
        viewStart = Math.max(0, Math.min(1 - viewSpan, center - viewSpan / 2)); render();
      },
      pan(delta) { viewStart = Math.max(0, Math.min(1 - viewSpan, viewStart + delta * viewSpan)); render(); },
      fit() { viewStart = 0; viewSpan = 1; render(); },
      view() { return { start: viewStart, span: viewSpan }; },
      resize, render, reset,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        for (const [type, fn] of [["pointerdown", onDown], ["pointermove", onMove], ["pointerup", onUp], ["pointercancel", onCancel], ["lostpointercapture", onCancel], ["keydown", onKey]]) canvas.removeEventListener(type, fn);
        if (ro) ro.disconnect();
        reset();
      },
    };
    resize();
    return api;
  }

  return { create, HIT_PX, HIT_TOUCH, DRAG_MOUSE, DRAG_TOUCH };
})();
Object.freeze(DesignerProfile);
