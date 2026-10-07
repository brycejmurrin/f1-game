/* Apex 26 — DesignerCanvas: the track designer's 2D drawing surface. Draws the
   control loop, the ENGINE-built road (the centreline TrackValidate built, so
   what the player sees is what the car will meet), the start line and the
   validator's markers, and turns pointer, wheel and keyboard input into the few
   callbacks the screen (TrackDesigner) owns: move / insert / pick / delete a
   control point (a selected SPAN moves as a group), draw a freehand loop, pan,
   pinch and zoom. It never edits the array it is handed — a drag works on a
   copy and hands the result back — and touches no store and no engine:
   TrackShape at eval only. LAZY_EDITOR. */
const DesignerCanvas = (function () {
  "use strict";
  const S = TrackShape;
  const clamp = M4.clamp;          // the shared scalar (js/core/mat4.js, FULL), never a private copy
  const HIT_PX = 28;                 // pick radius around a handle (css px); larger than the drawn dot
  const HIT_TOUCH = 44;              // …and under a finger (≥44 css px WCAG / Bryce mobile)
  const DRAG_MOUSE = 6;              // intentional move threshold (mouse) — below this, select only
  const DRAG_TOUCH = 10;             // …and under a finger
  const TOUCH_ARM_MS = 140;          // short hold before an unselected touch press may start a drag
  const HOLD_MS = 500, HOLD_PX = 6;  // a long-press: held this long, moved no further
  const STRAIGHT_R = 10000;          // a Menger radius past this reads STRAIGHT (m)
  const LATTICE = 4;                 // 0.25 m — the storage lattice, so a drag never lands off it
  const MIN_SCALE = 0.02, MAX_SCALE = 40;
  // Canvas ink only (never CSS): the ratchets count colour literals in css/.
  const COL = Object.freeze({
    grid: "rgba(255,255,255,0.05)", axis: "rgba(255,255,255,0.10)",
    road: "#3b3b48", roadStale: "rgba(90,90,106,0.55)", edge: "rgba(246,246,249,0.55)",
    centre: "rgba(246,246,249,0.85)", ctrl: "rgba(154,154,168,0.75)", handle: "#f6f6f9",
    sel: "#e10600", span: "rgba(225,6,0,0.45)", start: "#ffd700", draw: "#aeea00",
    red: "#ff3b30", amber: "#f6d200", info: "#1e90ff", text: "#9a9aa8",
    ghost: "rgba(0,214,190,0.6)", chipBg: "rgba(10,10,14,0.78)", chipText: "#f6f6f9",
    // SPEED: the plasma ramp, slow → fast (perceptually ordered, colour-blind safe).
    spd0: "#f0f921", spd1: "#fca636", spd2: "#e16462", spd3: "#b12a90", spd4: "#6a00a8",
  });
  const SPD = [COL.spd0, COL.spd1, COL.spd2, COL.spd3, COL.spd4];
  const SPD_EDGES = [40, 55, 70, 85];   // m/s: < 40 · < 55 · < 70 · < 85 · ≥ 85
  const spdBucket = (v) => { let b = 0; while (b < SPD_EDGES.length && v >= SPD_EDGES[b]) b++; return b; };
  const LABEL_FONT = "11px system-ui, sans-serif";
  const snap = (v) => Math.round(v * LATTICE) / LATTICE;
  // The storage bounds (CustomTracks.LIMITS.coord, FULL): a point dragged past
  // them would make the whole design unsaveable, so a drag stops at the edge.
  const COORD = typeof CustomTracks !== "undefined" && CustomTracks.LIMITS ? CustomTracks.LIMITS.coord : 10000;
  const place = (x, z) => [clamp(snap(x), -COORD, COORD), clamp(snap(z), -COORD, COORD)];

  /** Mount on a <canvas>. hooks: onBegin(), onChange(pts, kind), onPick(i, ev),
   *  onSelect(sel, span), onDelete(i), onDraw(path), onView(), onContext(i, {x, y})
   *  (a long-press on a handle; x/y canvas-relative css px). Returns the api. */
  function create(canvas, hooks) {
    hooks = hooks || {};
    const g = canvas.getContext("2d");
    let W = 1, H = 1, dpr = 1;
    let base = [];                   // the design's control loop (read-only here)
    let work = null;                 // a drag's copy, until it is committed
    let built = null;                // TrackValidate's centreline { px, pz, n, hw, total }
    let stale = false;               // the built road no longer matches the loop being dragged
    let issues = [];
    let sel = -1, span = -1, hover = -1, tool = "select";
    let scale = 0.1, cx = 0, cz = 0, fitted = false;
    let mode = "none", dragI = -1, inserted = false, moved = false, start = null, path = null;
    // Group drag: when a SPAN is selected, moving any member translates the whole
    // group by the same delta (origins snapshotted at beginDrag).
    let dragGroup = null, dragOrigins = null, drag0 = null;
    const pointers = new Map();
    let pinch0 = null;
    // The last two presses: a double-tap deletes only when BOTH picked the same
    // existing handle (not an insert, not a drag) under SELECT.
    let taps = [];
    let ptype = "mouse";             // the last pointerType seen: touch widens hits and handles
    let hold = null;                 // a long-press in flight { id, timer }
    // A press on a handle before a deliberate drag: select-only until the
    // threshold (and, on touch, a short hold or a prior selection) is met.
    let press = null;                // { id, i, wasSel, t0, touch, shift }
    // pickOnly: select handles only (scenery / elevation / test) — no insert,
    // drag, nudge or double-tap delete. Tap still selects without moving.
    let pickOnly = false;
    const members = (a, b) => S.spanIndices(a, b, (work || base).length);
    const isInSpan = (i) => S.inSpan(i, sel, span, (work || base).length);
    function tellSelect() { if (hooks.onSelect) hooks.onSelect(sel, span); }
    let preview = null;              // setTool's ghost: (i) → { pts: [[x, z]…] } | null
    let ghost = null, ghostKey = null; // its last answer, and the (fn, anchor, loop) it answered
    let last = null;                 // the pointer's latest canvas-relative position
    let heat = null;                 // setHeat's per-node speed (m/s), or null

    // ── view ────────────────────────────────────────────────────────────────
    const toSX = (x) => (x - cx) * scale + W / 2;
    const toSY = (z) => (z - cz) * scale + H / 2;
    const toWX = (sx) => (sx - W / 2) / scale + cx;
    const toWZ = (sy) => (sy - H / 2) / scale + cz;
    function bounds(pts) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; }
      return x0 === Infinity ? null : { x0, x1, z0, z1 };
    }
    function fit() {
      const b = bounds(work || base);
      if (!b) { scale = 0.1; cx = 0; cz = 0; return; }
      const spanX = Math.max(60, b.x1 - b.x0), spanZ = Math.max(60, b.z1 - b.z0);
      scale = clamp(Math.min(W / spanX, H / spanZ) * 0.82, MIN_SCALE, MAX_SCALE);
      cx = (b.x0 + b.x1) / 2; cz = (b.z0 + b.z1) / 2;
      fitted = true;
      if (hooks.onView) hooks.onView(view());
    }
    function view() { return { scale, cx, cz, w: W, h: H }; }
    function zoomAt(f, sx, sy) {
      const wx = toWX(sx), wz = toWZ(sy);
      scale = clamp(scale * f, MIN_SCALE, MAX_SCALE);
      cx = wx - (sx - W / 2) / scale; cz = wz - (sy - H / 2) / scale;
      if (hooks.onView) hooks.onView(view());
    }
    function focusAt(s) {
      if (!built || !built.n) return;
      const k = Math.round((((s / built.total) % 1) + 1) % 1 * built.n) % built.n;
      cx = built.px[k]; cz = built.pz[k];
      if (scale < 0.6) scale = 0.6;
      render();
    }

    // ── size ────────────────────────────────────────────────────────────────
    function resize() {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      dpr = Math.min(3, window.devicePixelRatio || 1);
      if (w === W && h === H && canvas.width === Math.round(w * dpr)) return;
      W = w; H = h;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      if (!fitted) fit();
      render();
    }
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas);

    // ── hit tests ───────────────────────────────────────────────────────────
    function hitHandle(sx, sy) {
      const pts = work || base;
      const hit = ptype === "touch" ? HIT_TOUCH : HIT_PX;
      let best = -1, bd = hit * hit;
      for (let i = 0; i < pts.length; i++) {
        const dx = toSX(pts[i][0]) - sx, dy = toSY(pts[i][1]) - sy, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    /** The control segment (k → k+1) under the pointer, or -1. */
    function hitSegment(sx, sy) {
      const pts = work || base, N = pts.length;
      if (N < 2) return -1;
      const tol = Math.max(14, (built ? built.hw[0] : 7) * scale);
      let best = -1, bd = tol;
      for (let k = 0; k < N; k++) {
        const a = pts[k], b = pts[(k + 1) % N];
        const ax = toSX(a[0]), ay = toSY(a[1]), bx = toSX(b[0]), by = toSY(b[1]);
        const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
        const t = clamp(((sx - ax) * vx + (sy - ay) * vy) / L2, 0, 1);
        const d = Math.hypot(ax + vx * t - sx, ay + vy * t - sy);
        if (d < bd && t > 0.05 && t < 0.95) { bd = d; best = k; }
      }
      return best;
    }

    // ── pointer ─────────────────────────────────────────────────────────────
    function local(ev) { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
    function dragThresh() { return (ptype === "touch" || (press && press.touch)) ? DRAG_TOUCH : DRAG_MOUSE; }
    function beginDrag(i, isInsert) {
      work = base.map((p) => [p[0], p[1]]);
      if (isInsert) { work.splice(i, 0, [0, 0]); inserted = true; } else inserted = false;
      dragI = i; moved = false; mode = "drag"; stale = false; press = null;
      // A span member (not an insert) moves every point on the selected span together.
      if (!isInsert && span >= 0 && sel >= 0 && sel !== span && isInSpan(i)) {
        dragGroup = members(sel, span);
        dragOrigins = dragGroup.map((j) => [work[j][0], work[j][1]]);
        drag0 = [work[i][0], work[i][1]];
      } else {
        dragGroup = [i]; dragOrigins = [[work[i][0], work[i][1]]]; drag0 = [work[i][0], work[i][1]];
      }
      if (hooks.onBegin) hooks.onBegin();
    }
    /** Apply the dragged handle's world delta to every member of the drag group. */
    function placeGroup(wx, wz) {
      if (!work || !dragGroup || !dragOrigins || !drag0) return;
      const tgt = place(wx, wz);
      const dx = tgt[0] - drag0[0], dz = tgt[1] - drag0[1];
      for (let k = 0; k < dragGroup.length; k++) {
        work[dragGroup[k]] = place(dragOrigins[k][0] + dx, dragOrigins[k][1] + dz);
      }
    }
    /** Promote a select-only press into a real drag once the gesture is deliberate. */
    function tryArmDrag(p) {
      if (pickOnly) return false;
      if (mode !== "press" || !press || !start || press.shift) return false;
      const dist = Math.hypot(p.x - start.x, p.y - start.y);
      if (dist <= dragThresh()) return false;
      const held = (Date.now() - press.t0) >= TOUCH_ARM_MS;
      // Mouse: threshold alone. Touch: already selected (or in the span), or a short hold.
      const may = press.wasSel || ptype === "mouse" || held;
      if (!may) return false;
      cancelHold();
      beginDrag(press.i, false);
      moved = true; stale = true;
      placeGroup(toWX(p.x), toWZ(p.y));
      return true;
    }
    // ── long-press ──────────────────────────────────────────────────────────
    // Held on a handle: hooks.onContext once, and the press becomes "held" — any
    // in-flight drag is dropped (the point goes back), the release ends it, no pick.
    function cancelHold() {
      if (!hold) return;
      try { globalThis.clearTimeout(hold.timer); } catch (_) { /* no timers here */ }
      hold = null;
    }
    function armHold(id, i) {
      cancelHold();
      if (pickOnly) return;
      if (typeof hooks.onContext !== "function" || typeof globalThis.setTimeout !== "function") return;
      const me = { id, i, timer: null };
      me.timer = globalThis.setTimeout(() => {
        if (hold !== me || (mode !== "press" && mode !== "drag") || pointers.size !== 1 || !pointers.has(id)) return;
        if (mode === "drag" && dragI !== i) return;
        if (mode === "press" && (!press || press.i !== i)) return;
        hold = null;
        const p = pointers.get(id);
        work = null; stale = false; dragI = -1; moved = false; inserted = false; press = null; mode = "held";
        if (taps.length) taps[taps.length - 1] = { kind: "context", i };
        render();
        hooks.onContext(i, { x: p.x, y: p.y });
      }, HOLD_MS);
      hold = me;
    }
    function onDown(ev) {
      if (ev.button != null && ev.button > 0) return;
      if (ev.pointerType) ptype = ev.pointerType;
      ev.preventDefault();
      try { canvas.focus({ preventScroll: true }); } catch (_) { canvas.focus(); }
      try { canvas.setPointerCapture(ev.pointerId); } catch (_) { /* a synthetic event */ }
      const p = local(ev);
      pointers.set(ev.pointerId, p); last = p;
      if (pointers.size >= 2) cancelHold();
      if (pointers.size === 2) {
        // A second finger turns whatever was happening into a pinch; a drag is abandoned.
        if (mode === "drag" || mode === "held" || mode === "press") {
          work = null; stale = false; dragI = -1; press = null;
          dragGroup = null; dragOrigins = null; drag0 = null;
        }
        if (mode === "draw") { path = null; }
        const [a, b] = [...pointers.values()];
        pinch0 = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, wx: toWX((a.x + b.x) / 2), wz: toWZ((a.y + b.y) / 2) };
        mode = "pinch";
        render();
        return;
      }
      if (pointers.size > 2) return;
      start = { x: p.x, y: p.y, t: Date.now() };
      taps = taps.slice(-1).concat([{ kind: "none", i: -1 }]);
      if (tool === "draw") { mode = "draw"; path = [[toWX(p.x), toWZ(p.y)]]; render(); return; }
      const i = hitHandle(p.x, p.y);
      if (i >= 0) {
        // Select first — never move on down. A later deliberate drag (threshold /
        // already-selected / short touch hold) promotes this press into a move.
        // Shift (or span-end arm): keep the anchor so onPick can set the span end.
        taps[taps.length - 1] = { kind: "pick", i };
        const shift = !!ev.shiftKey;
        const wasSel = sel === i || isInSpan(i);
        if (!shift) {
          if (wasSel && isInSpan(i)) {
            // Pressing a span member keeps the whole group selected for a group drag.
          } else if (sel !== i) {
            sel = i; span = -1; tellSelect();
          }
        }
        press = { id: ev.pointerId, i, wasSel, t0: Date.now(), touch: ptype === "touch", shift };
        mode = "press";
        armHold(ev.pointerId, i);
        render();
        return;
      }
      const k = hitSegment(p.x, p.y);
      if (k >= 0 && tool === "select" && !ev.shiftKey && !pickOnly) {
        taps[taps.length - 1] = { kind: "insert", i: k + 1 };
        beginDrag(k + 1, true);
        placeGroup(toWX(p.x), toWZ(p.y));
        sel = dragI; span = -1; tellSelect();
        render();
        return;
      }
      // Empty space: pan. Never hits a node, so it never moves one.
      mode = "pan";
    }
    function onMove(ev) {
      const p = local(ev);
      if (ev.pointerType) ptype = ev.pointerType;
      if (!pointers.has(ev.pointerId)) {
        // No button down: hover feedback only.
        const h = mode === "none" ? hitHandle(p.x, p.y) : -1;
        if (h !== hover) { hover = h; render(); }
        return;
      }
      const prev = pointers.get(ev.pointerId);
      pointers.set(ev.pointerId, p); last = p;
      if (hold && hold.id === ev.pointerId && Math.hypot(p.x - start.x, p.y - start.y) > HOLD_PX) cancelHold();
      if (mode === "held") return;
      if (mode === "pinch" && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        scale = clamp(pinch0.scale * d / pinch0.dist, MIN_SCALE, MAX_SCALE);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        cx = pinch0.wx - (mx - W / 2) / scale; cz = pinch0.wz - (my - H / 2) / scale;
        render();
        return;
      }
      if (mode === "press") {
        if (tryArmDrag(p)) { render(); return; }
        return;
      }
      if (mode === "drag" && work) {
        if (!moved && Math.hypot(p.x - start.x, p.y - start.y) > dragThresh()) { moved = true; stale = true; }
        if (moved || inserted) placeGroup(toWX(p.x), toWZ(p.y));
        render();
        return;
      }
      if (mode === "pan") {
        cx -= (p.x - prev.x) / scale; cz -= (p.y - prev.y) / scale;
        render();
        return;
      }
      if (mode === "draw" && path) {
        const lastPt = path[path.length - 1], wx = toWX(p.x), wz = toWZ(p.y);
        if (Math.hypot(wx - lastPt[0], wz - lastPt[1]) >= Math.max(1.5, 2 / scale)) path.push([wx, wz]);
        render();
      }
    }
    function onUp(ev) {
      if (!pointers.has(ev.pointerId)) return;
      cancelHold();
      pointers.delete(ev.pointerId);
      try { canvas.releasePointerCapture(ev.pointerId); } catch (_) { /* not captured */ }
      if (mode === "held") { mode = "none"; press = null; render(); return; }
      if (mode === "pinch") { if (pointers.size < 2) { mode = pointers.size === 1 ? "pan" : "none"; pinch0 = null; if (hooks.onView) hooks.onView(view()); } return; }
      if (mode === "press") {
        // Tap / click / below-threshold jitter: select only — coordinates unchanged.
        const i = press ? press.i : -1;
        const shift = !!(ev.shiftKey || (press && press.shift));
        press = null; mode = "none";
        if (i >= 0 && hooks.onPick) hooks.onPick(i, { shiftKey: shift, altKey: !!ev.altKey });
        render();
        return;
      }
      if (mode === "drag") {
        if (moved && taps.length) taps[taps.length - 1] = { kind: "move", i: dragI };
        const out = work; work = null; mode = "none"; stale = false;
        const kind = inserted ? "insert" : (dragGroup && dragGroup.length > 1 ? "move-span" : "move");
        const pickShift = !!ev.shiftKey;
        press = null;
        if (out && (moved || inserted)) { if (hooks.onChange) hooks.onChange(out, kind); }
        else if (hooks.onPick) hooks.onPick(dragI, { shiftKey: pickShift, altKey: !!ev.altKey });
        dragI = -1; dragGroup = null; dragOrigins = null; drag0 = null; render();
        return;
      }
      if (mode === "draw") {
        const out = path; path = null; mode = "none";
        if (out && out.length >= 3 && hooks.onDraw) hooks.onDraw(out);
        render();
        return;
      }
      mode = "none"; press = null;
      if (hooks.onView) hooks.onView(view());
    }
    // pointercancel AND lostpointercapture: a dialog hidden mid-drag takes the
    // capture without a pointerup, which left a stale pointer behind and the
    // next touch read as a pinch. Whatever was in flight is abandoned.
    function onCancel(ev) {
      if (!pointers.has(ev.pointerId)) return;
      cancelHold();
      pointers.delete(ev.pointerId);
      if (pointers.size === 0) reset();
      else if (mode === "pinch" && pointers.size < 2) { mode = "pan"; pinch0 = null; }
    }
    function reset() {
      cancelHold();
      pointers.clear(); taps = []; last = null; press = null;
      work = null; path = null; pinch0 = null; mode = "none"; dragI = -1; inserted = false; moved = false; stale = false; hover = -1;
      dragGroup = null; dragOrigins = null; drag0 = null;
      render();
    }
    function onWheel(ev) {
      ev.preventDefault();
      const p = local(ev);
      zoomAt(Math.pow(1.0015, -ev.deltaY), p.x, p.y);
      render();
    }
    function onDblClick(ev) {
      if (tool !== "select" || pickOnly) return;           // a double-tap under a stamp tool is two stamps, never a delete
      const [a, b] = taps.slice(-2);
      taps = [];
      if (!a || !b || a.kind !== "pick" || b.kind !== "pick" || a.i !== b.i) return;
      const p = local(ev);
      if (hitHandle(p.x, p.y) === b.i && hooks.onDelete) hooks.onDelete(b.i);
    }
    // Keyboard: the canvas owns its arrows while a point is selected
    // (js/ui/menu-nav.js stands aside for a focused <canvas> unless it says
    // data-arrows="pass"), 1 m a press, 10 m with Shift; [ ] / Tab walk the
    // selection; Escape clears it.
    function cycleSel(dir) {
      const N = base.length; if (!N) return;
      hover = -1;
      sel = sel < 0 ? (dir > 0 ? 0 : N - 1) : (sel + dir + N) % N;
      span = -1;
      tellSelect();
      render();
    }
    function onKey(ev) {
      const pts = base, N = pts.length;
      if (!N) return;
      const step = ev.shiftKey ? 10 : 1;
      let dx = 0, dz = 0;
      switch (ev.key) {
        case "ArrowLeft": dx = -step; break;
        case "ArrowRight": dx = step; break;
        case "ArrowUp": dz = -step; break;
        case "ArrowDown": dz = step; break;
        case "[": cycleSel(-1); ev.preventDefault(); return;
        case "]": cycleSel(1); ev.preventDefault(); return;
        case "Tab": cycleSel(ev.shiftKey ? -1 : 1); ev.preventDefault(); return;
        case "Escape": if (sel >= 0 || span >= 0) { sel = -1; span = -1; tellSelect(); render(); ev.preventDefault(); } return;
        case "Delete": case "Backspace": if (pickOnly) return; if (sel >= 0 && hooks.onDelete) { ev.preventDefault(); hooks.onDelete(sel); } return;
        case "Enter": case " ": if (sel >= 0 && hooks.onPick) { ev.preventDefault(); hooks.onPick(sel, { shiftKey: !!ev.shiftKey, altKey: !!ev.altKey }); } return;
        default: return;
      }
      // With nothing selected the arrows are not ours: MenuNav walks focus off
      // the canvas (a pad has no Tab), so the key must stay un-prevented.
      if (sel < 0 || sel >= N || pickOnly) return;
      ev.preventDefault();
      if (hooks.onBegin) hooks.onBegin();
      const out = pts.map((p) => [p[0], p[1]]);
      const group = (span >= 0 && span !== sel) ? members(sel, span) : [sel];
      for (const j of group) out[j] = place(out[j][0] + dx, out[j][1] + dz);
      if (hooks.onChange) hooks.onChange(out, group.length > 1 ? "nudge-span" : "nudge");
    }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("lostpointercapture", onCancel);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDblClick);
    canvas.addEventListener("keydown", onKey);
    canvas.addEventListener("pointerleave", () => { if (hover !== -1 && mode === "none") { hover = -1; render(); } });

    // ── render ──────────────────────────────────────────────────────────────
    function grid() {
      const stepM = scale > 1.2 ? 20 : scale > 0.3 ? 100 : 500;
      const x0 = Math.floor(toWX(0) / stepM) * stepM, x1 = toWX(W), z0 = Math.floor(toWZ(0) / stepM) * stepM, z1 = toWZ(H);
      g.lineWidth = 1;
      let n = 0;
      for (let x = x0; x <= x1 && n < 200; x += stepM, n++) { g.strokeStyle = x === 0 ? COL.axis : COL.grid; g.beginPath(); g.moveTo(toSX(x), 0); g.lineTo(toSX(x), H); g.stroke(); }
      for (let z = z0; z <= z1 && n < 400; z += stepM, n++) { g.strokeStyle = z === 0 ? COL.axis : COL.grid; g.beginPath(); g.moveTo(0, toSY(z)); g.lineTo(W, toSY(z)); g.stroke(); }
      g.fillStyle = COL.text; g.font = LABEL_FONT; g.textBaseline = "top";
      g.fillText(stepM + " m grid", 8, 6);
    }
    function road() {
      if (!built || !built.n) return;
      const n = built.n, px = built.px, pz = built.pz, hw = built.hw;
      const L = [], R = [];
      for (let k = 0; k < n; k++) {
        const a = (k - 1 + n) % n, b = (k + 1) % n;
        let tx = px[b] - px[a], tz = pz[b] - pz[a]; const len = Math.hypot(tx, tz) || 1; tx /= len; tz /= len;
        const w = hw[k] || hw[0] || 7;
        L.push([px[k] - tz * w, pz[k] + tx * w]); R.push([px[k] + tz * w, pz[k] - tx * w]);
      }
      g.beginPath();
      for (let k = 0; k < n; k++) { const p = L[k]; k ? g.lineTo(toSX(p[0]), toSY(p[1])) : g.moveTo(toSX(p[0]), toSY(p[1])); }
      g.closePath();
      g.moveTo(toSX(R[0][0]), toSY(R[0][1]));
      for (let k = n - 1; k >= 0; k--) { const p = R[k]; g.lineTo(toSX(p[0]), toSY(p[1])); }
      g.closePath();
      g.fillStyle = stale ? COL.roadStale : COL.road;
      g.fill("evenodd");
      if (heat && !stale && heat.length === n) heatFill(L, R, n);
      g.strokeStyle = COL.edge; g.lineWidth = 1; g.stroke();
      // centre line
      g.beginPath();
      for (let k = 0; k < n; k++) k ? g.lineTo(toSX(px[k]), toSY(pz[k])) : g.moveTo(toSX(px[k]), toSY(pz[k]));
      g.closePath(); g.strokeStyle = COL.centre; g.lineWidth = 1; g.setLineDash([6, 8]); g.stroke(); g.setLineDash([]);
      // start / finish line + direction arrow
      const w0 = (hw[0] || 7), tx = px[1 % n] - px[0], tz = pz[1 % n] - pz[0], tl = Math.hypot(tx, tz) || 1;
      g.strokeStyle = COL.start; g.lineWidth = 3;
      g.beginPath(); g.moveTo(toSX(px[0] - tz / tl * w0), toSY(pz[0] + tx / tl * w0)); g.lineTo(toSX(px[0] + tz / tl * w0), toSY(pz[0] - tx / tl * w0)); g.stroke();
      const ax = px[0] + tx / tl * Math.max(12, 18 / scale), az = pz[0] + tz / tl * Math.max(12, 18 / scale);
      g.fillStyle = COL.start; g.beginPath();
      g.moveTo(toSX(ax), toSY(az));
      g.lineTo(toSX(ax - tx / tl * 8 / Math.max(0.3, scale) - tz / tl * 5 / Math.max(0.3, scale)), toSY(az - tz / tl * 8 / Math.max(0.3, scale) + tx / tl * 5 / Math.max(0.3, scale)));
      g.lineTo(toSX(ax - tx / tl * 8 / Math.max(0.3, scale) + tz / tl * 5 / Math.max(0.3, scale)), toSY(az - tz / tl * 8 / Math.max(0.3, scale) - tx / tl * 5 / Math.max(0.3, scale)));
      g.closePath(); g.fill();
    }
    // SPEED: one polygon per run of nodes in the same speed bucket (the wrap
    // merged), each one node wider than its run so no hairline shows between.
    function heatFill(L, R, n) {
      const b = new Uint8Array(n);
      for (let k = 0; k < n; k++) b[k] = spdBucket(heat[k]);
      let k0 = 0;
      while (k0 < n && b[k0] === b[(k0 - 1 + n) % n]) k0++;
      if (k0 === n) {                                   // one bucket all the way round: the whole ring
        g.beginPath();
        for (let k = 0; k < n; k++) k ? g.lineTo(toSX(L[k][0]), toSY(L[k][1])) : g.moveTo(toSX(L[k][0]), toSY(L[k][1]));
        g.closePath(); g.moveTo(toSX(R[0][0]), toSY(R[0][1]));
        for (let k = n - 1; k >= 0; k--) g.lineTo(toSX(R[k][0]), toSY(R[k][1]));
        g.closePath(); g.fillStyle = SPD[b[0]]; g.fill("evenodd");
        return;
      }
      for (let done = 0; done < n;) {
        const start = (k0 + done) % n, c = b[start];
        let len = 1;
        while (done + len < n && b[(start + len) % n] === c) len++;
        g.beginPath();
        for (let d = 0; d <= len; d++) { const p = L[(start + d) % n]; d ? g.lineTo(toSX(p[0]), toSY(p[1])) : g.moveTo(toSX(p[0]), toSY(p[1])); }
        for (let d = len; d >= 0; d--) { const p = R[(start + d) % n]; g.lineTo(toSX(p[0]), toSY(p[1])); }
        g.closePath(); g.fillStyle = SPD[c]; g.fill();
        done += len;
      }
    }
    function heatLegend() {
      if (!heat || !built) return;
      const sw = 14, y = H - 22;
      g.font = LABEL_FONT; g.textBaseline = "middle";
      g.fillStyle = COL.chipBg; g.fillRect(4, y - 4, 5 * sw + 92, sw + 8);
      for (let i = 0; i < 5; i++) { g.fillStyle = SPD[i]; g.fillRect(8 + i * sw, y, sw - 2, sw); }
      g.fillStyle = COL.chipText; g.fillText("SLOW → FAST", 14 + 5 * sw, y + sw / 2);
    }
    function markers() {
      if (!built || !built.n || stale) return;
      const ds = built.total / built.n;
      for (const it of issues) {
        let x, z;
        if (Number.isFinite(it.x) && Number.isFinite(it.z)) { x = it.x; z = it.z; }
        else if (Number.isFinite(it.s)) { const k = Math.round(it.s / ds) % built.n; x = built.px[k]; z = built.pz[k]; }
        else continue;
        g.beginPath(); g.arc(toSX(x), toSY(z), 7, 0, Math.PI * 2);
        g.fillStyle = it.level === "red" ? COL.red : it.level === "amber" ? COL.amber : COL.info;
        g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1;
        g.strokeStyle = "#000"; g.lineWidth = 1.5; g.stroke();
      }
    }
    function controls() {
      const pts = work || base, N = pts.length;
      if (!N) return;
      g.beginPath();
      for (let i = 0; i < N; i++) i ? g.lineTo(toSX(pts[i][0]), toSY(pts[i][1])) : g.moveTo(toSX(pts[i][0]), toSY(pts[i][1]));
      g.closePath(); g.strokeStyle = COL.ctrl; g.lineWidth = 1; g.setLineDash([3, 5]); g.stroke(); g.setLineDash([]);
      if (span >= 0 && sel >= 0 && span !== sel) {
        g.beginPath();
        let i = sel; g.moveTo(toSX(pts[i][0]), toSY(pts[i][1]));
        for (let n = 0; n < N && i !== span; n++) { i = (i + 1) % N; g.lineTo(toSX(pts[i][0]), toSY(pts[i][1])); }
        g.strokeStyle = COL.span; g.lineWidth = 6; g.stroke();
      }
      const touch = ptype === "touch";
      const groupOn = span >= 0 && sel >= 0 && span !== sel;
      for (let i = 0; i < N; i++) {
        const sx = toSX(pts[i][0]), sy = toSY(pts[i][1]);
        if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
        const inGroup = groupOn && S.inSpan(i, sel, span, N);
        const isSel = i === sel || inGroup || (i === dragI && mode === "drag") || (press && press.i === i);
        const r = (isSel ? 7 : i === hover ? 6 : 4.5) * (touch ? 1.5 : 1);
        // Soft hit halo under a finger so the ≥44 px target reads on the map.
        if (touch && (isSel || i === hover)) {
          g.beginPath(); g.arc(sx, sy, HIT_TOUCH / 2, 0, Math.PI * 2);
          g.fillStyle = isSel ? "rgba(225,6,0,0.14)" : "rgba(246,246,249,0.06)"; g.fill();
        }
        if (isSel) {
          g.beginPath(); g.arc(sx, sy, r + 5, 0, Math.PI * 2);
          g.strokeStyle = COL.sel; g.lineWidth = 2.5; g.stroke();
        }
        g.beginPath();
        if (i === 0) g.rect(sx - r - 1, sy - r - 1, 2 * r + 2, 2 * r + 2); else g.arc(sx, sy, r, 0, Math.PI * 2);
        g.fillStyle = isSel ? COL.sel : i === 0 ? COL.start : COL.handle;
        g.fill(); g.strokeStyle = "#000"; g.lineWidth = 1; g.stroke();
      }
    }
    function drawing() {
      if (!path || path.length < 2) return;
      g.beginPath();
      for (let i = 0; i < path.length; i++) i ? g.lineTo(toSX(path[i][0]), toSY(path[i][1])) : g.moveTo(toSX(path[i][0]), toSY(path[i][1]));
      g.strokeStyle = COL.draw; g.lineWidth = 3; g.lineJoin = "round"; g.stroke();
    }
    // The stamp tool's ghost: what the tool would lay down from the hovered
    // handle (mouse) or the selected one (touch, keyboard), as the designer's
    // previewFn answers it — asked again only when the anchor or the loop moves.
    function ghostAnchor() { return ptype !== "touch" && hover >= 0 ? hover : sel; }
    function ghostPts() {
      if (!preview || mode === "drag" || mode === "draw") return null;   // a drag reshapes the loop it would answer for
      const a = ghostAnchor();
      if (a < 0 || a >= base.length) return null;
      if (!ghostKey || ghostKey.fn !== preview || ghostKey.a !== a || ghostKey.base !== base) {
        ghostKey = { fn: preview, a, base };
        let out = null;
        try { out = preview(a); } catch (e) { if (typeof Log !== "undefined") Log.warn("track", "stamp preview failed: " + (e && e.message || e)); }
        ghost = out && Array.isArray(out.pts) && out.pts.length >= 2 ? out.pts : null;
      }
      return ghost;
    }
    function ghostLine() {
      const pts = ghostPts();
      if (!pts) return;
      g.beginPath();
      for (let i = 0; i < pts.length; i++) i ? g.lineTo(toSX(pts[i][0]), toSY(pts[i][1])) : g.moveTo(toSX(pts[i][0]), toSY(pts[i][1]));
      g.strokeStyle = COL.ghost; g.lineWidth = 2; g.setLineDash([8, 6]); g.stroke(); g.setLineDash([]);
    }
    // The measurement chip: the dragged point's Menger radius (through its two
    // neighbours) beside the pointer, else a selected span's polygon length at
    // its middle. { text, x, y } in css px, or null.
    function chip() {
      const pts = work || base, N = pts.length;
      const chipI = mode === "drag" && work && dragI >= 0 ? dragI : (mode === "press" && press ? press.i : -1);
      if (chipI >= 0 && N >= 3) {
        const R = S.menger(pts[(chipI - 1 + N) % N], pts[chipI], pts[(chipI + 1) % N]);
        const at = last || { x: toSX(pts[chipI][0]), y: toSY(pts[chipI][1]) };
        return { text: Number.isFinite(R) && R < STRAIGHT_R ? "R " + Math.round(R) + " m" : "STRAIGHT", x: at.x + 18, y: at.y - 26 };
      }
      if (mode === "drag" || mode === "press" || sel < 0 || span < 0 || sel === span || sel >= N || span >= N) return null;
      const seg = [];
      let L = 0;
      for (let i = sel, n = 0; n < N && i !== span; n++) { const j = (i + 1) % N, d = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]); seg.push([i, j, d]); L += d; i = j; }
      let half = L / 2, mx = pts[sel][0], mz = pts[sel][1];
      for (const [i, j, d] of seg) {
        if (half <= d) { const t = d ? half / d : 0; mx = pts[i][0] + (pts[j][0] - pts[i][0]) * t; mz = pts[i][1] + (pts[j][1] - pts[i][1]) * t; break; }
        half -= d;
      }
      return { text: Math.round(L) + " m", x: toSX(mx) + 10, y: toSY(mz) - 22 };
    }
    function chipLabel() {
      const c = chip();
      if (!c) return;
      g.font = LABEL_FONT; g.textBaseline = "top";
      const m = typeof g.measureText === "function" ? g.measureText(c.text) : null;
      const tw = m && Number.isFinite(m.width) ? m.width : c.text.length * 6.5;
      const x = clamp(c.x, 2, Math.max(2, W - tw - 12)), y = clamp(c.y, 2, Math.max(2, H - 18));
      g.fillStyle = COL.chipBg; g.fillRect(x, y, tw + 10, 16);
      g.fillStyle = COL.chipText; g.fillText(c.text, x + 5, y + 2);
    }
    function render() {
      // MenuNav (js/ui/menu-nav.js) reads this: a focused canvas owns the
      // arrows only while they move something.
      const arrows = (sel >= 0 && !pickOnly) ? "own" : "pass";
      if (canvas.dataset && canvas.dataset.arrows !== arrows) canvas.dataset.arrows = arrows;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      grid(); road(); markers(); ghostLine(); controls(); drawing(); chipLabel(); heatLegend();
    }

    // ── api ─────────────────────────────────────────────────────────────────
    const api = {
      setPoints(pts) { base = Array.isArray(pts) ? pts : []; ghostKey = null; if (sel >= base.length) sel = -1; if (span >= base.length) span = -1; if (!fitted && base.length) fit(); render(); },
      // A preview the PREVIOUS edit scheduled can land mid-drag: the road it
      // brings is still the old loop, so a moved drag stays stale.
      setBuilt(tr) { built = tr && tr.n ? tr : null; if (!(mode === "drag" && moved)) stale = false; render(); },
      setIssues(list) { issues = Array.isArray(list) ? list : []; render(); },
      /** SPEED: per-node speeds (m/s, the built road's n) paint the road; null clears. */
      setHeat(v) { heat = v && v.length ? v : null; render(); },
      setSelection(i, j) { ghostKey = null; sel = Number.isInteger(i) ? i : -1; span = Number.isInteger(j) ? j : -1; render(); },
      /** previewFn (optional): (pointIndex) → { pts: [[x, z]…] } | null, world
       *  coords — drawn as the dashed ghost of what the tool would stamp there.
       *  opts.pickOnly: select only (no insert / drag / nudge / double-tap delete). */
      setTool(name, previewFn, opts) {
        tool = name || "select"; canvas.style.cursor = tool === "draw" ? "crosshair" : "default";
        pickOnly = !!(opts && opts.pickOnly);
        const fn = typeof previewFn === "function" ? previewFn : null;
        if (fn || preview) { preview = fn; ghost = null; ghostKey = null; render(); }
      },
      selection() { return { sel, span }; },
      hover() { return hover; },
      measure() { const c = chip(); return c ? c.text : null; },
      fit() { fit(); render(); },
      focusAt,
      render,
      resize,
      view,
      zoom(f) { zoomAt(f, W / 2, H / 2); render(); },
      reset,
      destroy() { if (ro) ro.disconnect(); reset(); },
    };
    resize();
    return api;
  }

  /** A circuit's outline on a small canvas (START FROM's cards): fitted, one
   *  stroke over a built centreline `tr` ({ px, pz, n }), and the start tick.
   *  opts: { color, width, start (false: no tick), pad }. No TrackMaps bake. */
  function thumb(canvas, tr, opts) {
    opts = opts || {};
    if (!canvas || !tr || !(tr.n > 2)) return false;
    const g = canvas.getContext("2d"), W = canvas.width, H = canvas.height, pad = opts.pad != null ? opts.pad : 12, n = tr.n;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < n; k++) { x0 = Math.min(x0, tr.px[k]); x1 = Math.max(x1, tr.px[k]); z0 = Math.min(z0, tr.pz[k]); z1 = Math.max(z1, tr.pz[k]); }
    const sc = Math.min((W - 2 * pad) / ((x1 - x0) || 1), (H - 2 * pad) / ((z1 - z0) || 1));
    const X = (x) => (W - (x1 - x0) * sc) / 2 + (x - x0) * sc, Y = (z) => (H - (z1 - z0) * sc) / 2 + (z - z0) * sc;
    g.clearRect(0, 0, W, H);
    g.beginPath();
    for (let k = 0; k < n; k++) k ? g.lineTo(X(tr.px[k]), Y(tr.pz[k])) : g.moveTo(X(tr.px[k]), Y(tr.pz[k]));
    g.closePath(); g.strokeStyle = opts.color || COL.centre; g.lineWidth = opts.width || 3; g.lineJoin = "round"; g.stroke();
    if (opts.start !== false) {
      const tx = tr.px[1] - tr.px[0], tz = tr.pz[1] - tr.pz[0], tl = Math.hypot(tx, tz) || 1, w = 8;   // css px either side
      const sx = X(tr.px[0]), sy = Y(tr.pz[0]), nx = -tz / tl * w, ny = tx / tl * w;
      g.beginPath(); g.moveTo(sx - nx, sy - ny); g.lineTo(sx + nx, sy + ny);
      g.strokeStyle = COL.start; g.lineWidth = 3; g.stroke();
    }
    return true;
  }

  return { create, thumb, HIT_PX, HIT_TOUCH, DRAG_MOUSE, DRAG_TOUCH, TOUCH_ARM_MS, HOLD_MS, COL };
})();
Object.freeze(DesignerCanvas);
