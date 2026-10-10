// DesignerCanvas (js/editor/canvas.js) alone, in a Node VM over the real engine
// (tests/helpers/editor-vm.mjs) and tests/helpers/mini-dom.mjs, with a recording
// 2D context and a hand-driven setTimeout on the VM global. Pins the canvas
// affordances the designer screen codes against: a long-press on a handle fires
// onContext once and never becomes a drag (cancelled by movement, a second
// pointer, pointercancel, lostpointercapture); the stamp tool's ghost is a
// dashed COL.ghost polyline drawn only while a previewFn is set and a handle is
// hovered / selected; the measurement chip reads "R <n> m" / STRAIGHT while a
// handle is dragged and "<n> m" over a selected span; a touch press widens the
// hit radius to HIT_TOUCH; SPEED (setHeat) fills one COL.spd* polygon per run
// of nodes in one speed bucket, and the static thumb() strokes an outline and
// its start tick. The screen-level twin is track-designer-dom.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { bootEditor, read, plain, design } from "../helpers/editor-vm.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";

/** The canvas module on the engine VM, a recording context and manual timers. */
function boot(hooksExtra = {}, pts = null) {
  const { ctx, S } = bootEditor();
  const dom = makeDom();
  ctx.document = dom.document;
  ctx.devicePixelRatio = 1;
  // Timers the test owns: setTimeout queues, run() fires what is still armed.
  const timers = new Map();
  let nextId = 1;
  ctx.setTimeout = (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; };
  ctx.clearTimeout = (id) => { timers.delete(id); };
  const runTimers = () => { const due = [...timers.entries()]; timers.clear(); for (const [, t] of due) t.fn(); return due.length; };
  vm.runInContext(read("js/editor/scenery-preview.js").replace(/^const\b/gm, "var"), ctx, { filename: "js/editor/scenery-preview.js" });
  vm.runInContext(read("js/editor/canvas.js").replace(/^const\b/gm, "var"), ctx, { filename: "js/editor/canvas.js" });
  const DC = ctx.DesignerCanvas;
  const canvas = dom.document.createElement("canvas");
  canvas._rect = { left: 0, top: 0, right: 640, bottom: 400, width: 640, height: 400 };
  const rec = { strokes: [], dashes: [], texts: [], arcs: [], fills: [] };
  canvas.getContext = () => {
    const st = { _dash: [] };
    return new Proxy(st, {
      get: (t, k) => {
        if (k === "stroke") return () => rec.strokes.push({ style: t.strokeStyle, dash: t._dash.slice() });
        if (k === "fill") return () => rec.fills.push(t.fillStyle);
        if (k === "setLineDash") return (d) => { t._dash = d.slice(); rec.dashes.push(d.slice()); };
        if (k === "fillText") return (s) => rec.texts.push(String(s));
        if (k === "arc") return (x, y, r) => rec.arcs.push(r);
        if (k === "measureText") return (s) => ({ width: String(s).length * 6 });
        return k in t ? t[k] : () => {};
      },
      set: (t, k, v) => { t[k] = v; return true; },
    });
  };
  const ev = { changes: [], picks: [], contexts: [], selects: [] };
  let cv = null;
  cv = DC.create(canvas, Object.assign({
    onChange: (p, kind) => { ev.changes.push({ pts: p, kind }); cv.setPoints(p); },
    onPick: (i, e) => ev.picks.push(i), onSelect: (i, j) => ev.selects.push({ i, j: j == null ? -1 : j }),
    onContext: (i, at) => ev.contexts.push({ i, at }),
  }, hooksExtra));
  if (!pts) {
    pts = [];
    for (let i = 0; i < 24; i++) { const t = i / 24 * Math.PI * 2; pts.push([Math.round(300 * Math.cos(t) * 4) / 4, Math.round(200 * Math.sin(t) * 4) / 4]); }
  }
  cv.setPoints(pts);
  const scr = (p) => { const v = cv.view(); return { clientX: (p[0] - v.cx) * v.scale + v.w / 2, clientY: (p[1] - v.cz) * v.scale + v.h / 2 }; };
  const fire = (type, at, id = 1, extra) => dom.dispatch(canvas, Object.assign({ type, pointerId: id }, at, extra));
  const off = (at, dx, dy) => ({ clientX: at.clientX + dx, clientY: at.clientY + dy });
  return { ctx, S, DC, dom, canvas, cv, ev, pts, scr, fire, off, rec, timers, runTimers };
}

test("range drag on the map selects a continuous section without moving the road", () => {
  const h = boot({ rangeSelect: () => true });
  const a = h.scr(h.pts[3]), b = h.scr(h.pts[8]);
  h.fire("pointerdown", a, 1, { pointerType: "mouse" });
  h.fire("pointermove", b);
  h.fire("pointerup", b);
  assert.deepEqual(plain(h.cv.selection()), { sel: 3, span: 8 });
  assert.equal(h.ev.changes.length, 0);
  assert.equal(h.ev.picks.length, 0, "range release does not collapse back to one point");
});

test("armed end selection does not replace the map anchor on pointerdown", () => {
  let picked;
  const h = boot({ extendSelection: () => true, onPick: (i, e) => { picked = { i, shift: e.shiftKey }; } });
  h.cv.setSelection(3, -1);
  const p = h.scr(h.pts[8]);
  h.fire("pointerdown", p);
  assert.deepEqual(plain(h.cv.selection()), { sel: 3, span: -1 });
  h.fire("pointerup", p);
  assert.deepEqual(picked, { i: 8, shift: true });
  assert.equal(h.ev.changes.length, 0);
});

test("long-press: a handle held 500 ms fires onContext once, keeps it selected and never becomes a drag", () => {
  const h = boot();
  const a = h.scr(h.pts[5]);
  h.fire("pointerdown", a, 1, { pointerType: "touch" });
  assert.equal(h.timers.size, 1, "one hold timer armed on a handle press");
  assert.equal([...h.timers.values()][0].ms, h.DC.HOLD_MS);
  assert.equal(h.DC.HOLD_MS, 500);
  h.fire("pointermove", h.off(a, 4, 0), 1, { pointerType: "touch" });     // finger jitter, under 6 px
  assert.equal(h.runTimers(), 1);
  assert.equal(h.ev.contexts.length, 1);
  assert.equal(h.ev.contexts[0].i, 5);
  assert.ok(Math.abs(h.ev.contexts[0].at.x - (a.clientX + 4)) < 1e-9 && Math.abs(h.ev.contexts[0].at.y - a.clientY) < 1e-9, "canvas-relative pointer position: " + JSON.stringify(plain(h.ev.contexts[0].at)));
  h.fire("pointermove", h.off(a, 60, 30), 1, { pointerType: "touch" });   // after the hold: no drag
  h.fire("pointerup", h.off(a, 60, 30), 1, { pointerType: "touch" });
  assert.equal(h.runTimers(), 0, "nothing re-armed");
  assert.equal(h.ev.contexts.length, 1, "fired once");
  assert.equal(h.ev.changes.length, 0, "the release after a long-press moves nothing");
  assert.deepEqual(h.ev.picks, [], "…and picks nothing");
  assert.equal(h.cv.selection().sel, 5, "the held handle stays selected");
  // The next press is an ordinary drag again (mouse: threshold alone is enough).
  const b = h.scr(h.pts[8]);
  h.fire("pointerdown", b, 2, { pointerType: "mouse" });
  h.fire("pointermove", h.off(b, 30, 0), 2, { pointerType: "mouse" });
  h.fire("pointerup", h.off(b, 30, 0), 2, { pointerType: "mouse" });
  assert.equal(h.ev.changes.length, 1);
  assert.equal(h.ev.changes[0].kind, "move");
  assert.equal(h.ev.contexts.length, 1);
});

test("long-press is cancelled by 10 px of movement, a second pointer, pointercancel and lostpointercapture", () => {
  const h = boot();
  const a = h.scr(h.pts[3]);
  // moved 10 px: the timer is cleared and the drag goes on
  h.fire("pointerdown", a, 1);
  h.fire("pointermove", h.off(a, 10, 0), 1);
  assert.equal(h.timers.size, 0, "movement past 6 px clears the hold timer");
  h.fire("pointerup", h.off(a, 10, 0), 1);
  assert.equal(h.ev.contexts.length, 0);
  assert.equal(h.ev.changes.length, 1, "it stayed a drag");
  // a second pointer: a pinch, never a context
  const b = h.scr(h.ev.changes[0].pts[6]);
  h.fire("pointerdown", b, 2);
  assert.equal(h.timers.size, 1);
  h.fire("pointerdown", h.off(b, 120, 80), 3);
  assert.equal(h.timers.size, 0, "a second pointer clears the hold timer");
  h.runTimers();
  h.fire("pointerup", b, 2); h.fire("pointerup", h.off(b, 120, 80), 3);
  // pointercancel / lostpointercapture
  for (const kind of ["pointercancel", "lostpointercapture"]) {
    const c = h.scr(h.ev.changes[0].pts[9]);
    h.fire("pointerdown", c, 4);
    h.fire(kind, {}, 4);
    assert.equal(h.timers.size, 0, kind + " clears the hold timer");
    h.runTimers();
  }
  // reset() clears a pending hold too
  h.fire("pointerdown", h.scr(h.ev.changes[0].pts[12]), 5);
  h.cv.reset();
  assert.equal(h.timers.size, 0, "reset() clears the hold timer");
  assert.equal(h.ev.contexts.length, 0, "no context from any cancelled hold");
  // A canvas without an onContext hook arms nothing (the drag is untouched).
  const q = boot({ onContext: undefined });
  q.fire("pointerdown", q.scr(q.pts[2]), 1);
  assert.equal(q.timers.size, 0);
  q.fire("pointerup", q.scr(q.pts[2]), 1);
  assert.deepEqual(q.ev.picks, [2]);
});

test("ghost: a previewFn's points draw as a dashed COL.ghost polyline only while a handle is hovered or selected", () => {
  const h = boot();
  const ghostStrokes = () => h.rec.strokes.filter((s) => s.style === h.DC.COL.ghost);
  const asked = [];
  const previewFn = (i) => { asked.push(i); const p = h.pts[i]; return { pts: [p, [p[0] + 40, p[1]], [p[0] + 80, p[1] + 20]] }; };
  h.rec.strokes.length = 0;
  h.cv.render();
  assert.equal(ghostStrokes().length, 0, "no previewFn: no ghost");
  // A previewFn with nothing hovered or selected: nothing to anchor on.
  h.cv.setTool("corner", previewFn);
  h.cv.render();
  assert.equal(ghostStrokes().length, 0, "no anchor: no ghost");
  assert.deepEqual(asked, []);
  // Mouse hover over handle 4 anchors it.
  h.fire("pointermove", h.scr(h.pts[4]), 7, { pointerType: "mouse" });
  assert.equal(h.cv.hover(), 4);
  assert.deepEqual(asked, [4], "asked once for the hovered handle");
  h.rec.strokes.length = 0;
  h.cv.render();
  const gs = ghostStrokes();
  assert.equal(gs.length, 1, "one ghost polyline");
  assert.ok(gs[0].dash.length >= 2, "dashed: " + JSON.stringify(gs[0].dash));
  assert.deepEqual(asked, [4], "a re-render reuses the answer (asked again only on a change)");
  // The pointer leaves: the ghost falls back to the selection.
  h.fire("pointerleave", {}, 7);
  assert.equal(h.cv.hover(), -1);
  h.rec.strokes.length = 0; h.cv.render();
  assert.equal(ghostStrokes().length, 0, "no hover, no selection: no ghost");
  h.cv.setSelection(9, -1);
  assert.equal(asked[asked.length - 1], 9, "setSelection re-asks for the selected handle");
  h.rec.strokes.length = 0; h.cv.render();
  assert.equal(ghostStrokes().length, 1);
  h.cv.setPoints(h.pts.slice());
  assert.equal(asked.filter((i) => i === 9).length, 2, "setPoints re-asks");
  // Touch anchors on the selection, never a stale mouse hover.
  h.fire("pointermove", h.scr(h.pts[2]), 7, { pointerType: "mouse" });
  assert.equal(asked[asked.length - 1], 2);
  h.fire("pointerdown", h.scr(h.pts[11]), 8, { pointerType: "touch" });
  h.fire("pointerup", h.scr(h.pts[11]), 8, { pointerType: "touch" });
  h.rec.strokes.length = 0; h.cv.render();
  assert.equal(asked[asked.length - 1], 11, "touch: the selected handle");
  // A previewFn that answers null draws nothing; setTool without one clears it.
  h.cv.setTool("corner", () => null);
  h.rec.strokes.length = 0; h.cv.render();
  assert.equal(ghostStrokes().length, 0, "null answer: no ghost");
  h.cv.setTool("corner", previewFn);
  h.rec.strokes.length = 0; h.cv.render();
  assert.equal(ghostStrokes().length, 1);
  h.cv.setTool("select");
  h.rec.strokes.length = 0; h.cv.render();
  assert.equal(ghostStrokes().length, 0, "setTool without a previewFn clears the ghost");
});

test("measurement chip: R <n> m while dragging a handle on a curve, STRAIGHT on a collinear triple, <n> m over a span", () => {
  const h = boot();
  assert.equal(h.cv.measure(), null, "nothing dragged or spanned: no chip");
  const a = h.scr(h.pts[6]);
  h.fire("pointerdown", a, 1, { pointerType: "mouse" });
  h.fire("pointermove", h.off(a, 12, 5), 1, { pointerType: "mouse" });
  const text = h.cv.measure();
  assert.match(text, /^R \d+ m$/);
  h.rec.texts.length = 0; h.cv.render();
  assert.ok(h.rec.texts.includes(text), "the chip is drawn: " + h.rec.texts.join(" | "));
  h.fire("pointerup", h.off(a, 12, 5), 1);
  const p = h.ev.changes[0].pts;
  const R = h.S.menger(p[5], p[6], p[7]);
  assert.equal(text, "R " + Math.round(R) + " m", "the Menger radius through the dragged point and its neighbours");
  assert.equal(h.cv.measure(), null, "the drag chip goes with the drag");
  // A span [2, 5]: the polygon length, drawn at its middle.
  h.cv.setSelection(2, 5);
  let L = 0;
  for (let i = 2; i < 5; i++) L += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
  assert.equal(h.cv.measure(), Math.round(L) + " m");
  h.rec.texts.length = 0; h.cv.render();
  assert.ok(h.rec.texts.includes(Math.round(L) + " m"));
  h.cv.setSelection(3, 3);
  assert.equal(h.cv.measure(), null, "a one-point selection is not a span");
  // A collinear triple reads STRAIGHT, also while the point slides along its line.
  const s = boot({}, [[0, 0], [50, 0], [100, 0], [100, 60], [0, 60]]);
  const b = s.scr([50, 0]);
  s.fire("pointerdown", b, 1, { pointerType: "mouse" });
  s.fire("pointermove", s.off(b, 15, 0), 1, { pointerType: "mouse" });
  assert.equal(s.cv.measure(), "STRAIGHT");
  s.fire("pointerup", s.off(b, 15, 0), 1, { pointerType: "mouse" });
});

test("touch targets: a press 32 px from a handle picks it with pointerType touch, not with a mouse", () => {
  assert.equal(boot().DC.HIT_PX, 28, "mouse pick radius (larger than the drawn dot)");
  const h = boot();
  assert.equal(h.DC.HIT_TOUCH, 44);
  // 32 px radially outward from handle 0 (on +x): outside mouse HIT_PX, inside HIT_TOUCH.
  const at = h.off(h.scr(h.pts[0]), 32, 0);
  h.fire("pointerdown", at, 1, { pointerType: "mouse" });
  h.fire("pointerup", at, 1, { pointerType: "mouse" });
  assert.deepEqual(h.ev.picks, [], "a mouse at 32 px misses");
  assert.equal(h.ev.changes.length, 0, "…and is a pan, not an insert");
  h.fire("pointerdown", at, 2, { pointerType: "touch" });
  h.fire("pointerup", at, 2, { pointerType: "touch" });
  assert.deepEqual(h.ev.picks, [0], "a finger at 32 px picks the handle");
  // Handles draw 1.5x under touch (the last pointer type seen); a mouse puts them back.
  const plainR = () => { h.rec.arcs.length = 0; h.cv.render(); return Math.min(...h.rec.arcs); };
  assert.equal(plainR(), 4.5 * 1.5, "an unselected handle under touch");
  h.fire("pointermove", { clientX: 5, clientY: 5 }, 9, { pointerType: "mouse" });
  assert.equal(plainR(), 4.5, "…and under a mouse again");
});

test("SPEED: setHeat fills one COL.spd* polygon per run of a speed bucket (the wrap merged); null, stale and one-bucket rings", () => {
  const h = boot();
  const V = h.ctx.TrackValidate, TR = h.ctx.TrackRandom;
  const d = (pts) => ({ name: "Heat", seed: 7, theme: "parkland", baseHW: 7, pts });
  const r = TR.generateValid(7, (pts) => V.check(d(pts)).ok, 12);
  const tr = V.check(d(r.pts)).tr, v = V.speedProfile(tr), n = tr.n;
  const C = h.DC.COL, SPD = [C.spd0, C.spd1, C.spd2, C.spd3, C.spd4];
  assert.deepEqual(SPD, ["#f0f921", "#fca636", "#e16462", "#b12a90", "#6a00a8"], "the plasma ramp, slow → fast");
  const bucket = (x) => (x < 40 ? 0 : x < 55 ? 1 : x < 70 ? 2 : x < 85 ? 3 : 4);
  let runs = 0;
  for (let k = 0; k < n; k++) if (bucket(v[k]) !== bucket(v[(k - 1 + n) % n])) runs++;
  assert.ok(runs >= 4, "a circuit with slow and fast parts: " + runs + " runs");
  h.cv.setBuilt(tr);
  const spdFills = () => h.rec.fills.filter((f) => SPD.includes(f));
  h.rec.fills.length = 0; h.rec.texts.length = 0;
  h.cv.setHeat(v);
  assert.equal(spdFills().length, runs, "one polygon per run");
  const used = new Set(spdFills());
  for (let k = 0; k < n; k++) assert.ok(used.has(SPD[bucket(v[k])]), "node " + k + "'s colour is painted");
  assert.ok(h.rec.texts.includes("SLOW → FAST"), "the legend");
  h.rec.fills.length = 0; h.rec.texts.length = 0;
  h.cv.setHeat(new Float64Array(n).fill(92));
  assert.deepEqual(spdFills(), [C.spd4], "one bucket all the way round: one ring");
  h.rec.fills.length = 0;
  h.cv.setHeat(v.slice(0, n - 1));
  assert.equal(spdFills().length, 0, "speeds for another road are ignored");
  h.rec.fills.length = 0; h.rec.texts.length = 0;
  h.cv.setHeat(null);
  assert.equal(spdFills().length, 0); assert.ok(!h.rec.texts.includes("SLOW → FAST"));
});

test("elevation heat uses ordered height colours, numeric extrema and a flat legend; invalid data clears it", () => {
  const h = boot(), n = h.pts.length;
  const py = Float32Array.from({ length: n }, (_, i) => -20 + i * 5);
  const tr = { n, px: h.pts.map(p => p[0]), pz: h.pts.map(p => p[1]), py, hw: new Float32Array(n).fill(7), total: 1600 };
  const colours = ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"];
  h.cv.setBuilt(tr); h.rec.fills.length = 0; h.rec.texts.length = 0;
  h.cv.setHeat(py, "elevation");
  assert.deepEqual(h.rec.fills.filter(c => colours.includes(c)), colours, "low-to-high runs follow node height");
  assert.ok(h.rec.texts.includes("LOW -20.0 → HIGH 95.0 m"));
  h.cv.setSelection(3, 8);
  assert.deepEqual(plain(h.cv.selection()), { sel: 3, span: 8 });
  h.rec.fills.length = 0; h.rec.texts.length = 0;
  h.cv.setHeat(new Float32Array(n).fill(-5), "elevation");
  assert.deepEqual(h.rec.fills.filter(c => colours.includes(c)), [colours[2]]);
  assert.ok(h.rec.texts.includes("FLAT · -5.0 m"));
  for (const bad of [py.slice(1), new Float32Array(n).fill(NaN), null]) {
    h.rec.fills.length = 0; h.rec.texts.length = 0; h.cv.setHeat(bad, "elevation");
    assert.equal(h.rec.fills.filter(c => colours.includes(c)).length, 0);
    assert.ok(!h.rec.texts.some(t => /LOW |FLAT ·/.test(t)));
  }
});

test("pickOnly: tap selects; drag / insert / long-press / Delete do not edit geometry", () => {
  const h = boot();
  h.cv.setTool("select", null, { pickOnly: true });
  const i = 5;
  const before = plain(h.pts.map((p) => p.slice()));
  const a = h.scr(h.pts[i]);
  // Tap selects.
  h.fire("pointerdown", a, 1, { pointerType: "mouse" });
  h.fire("pointerup", a, 1, { pointerType: "mouse" });
  assert.equal(h.cv.selection().sel, i);
  assert.deepEqual(h.ev.picks, [i]);
  assert.equal(h.ev.changes.length, 0, "tap does not move");
  // Deliberate drag past threshold: still no move in pickOnly.
  h.fire("pointerdown", a, 2, { pointerType: "mouse" });
  h.fire("pointermove", h.off(a, 40, 0), 2, { pointerType: "mouse" });
  h.fire("pointerup", h.off(a, 40, 0), 2, { pointerType: "mouse" });
  assert.equal(h.ev.changes.length, 0, "pickOnly blocks drag");
  assert.deepEqual(plain(h.pts), before);
  // Road hit would insert under select — not in pickOnly.
  const mid = {
    clientX: (h.scr(h.pts[0]).clientX + h.scr(h.pts[1]).clientX) / 2,
    clientY: (h.scr(h.pts[0]).clientY + h.scr(h.pts[1]).clientY) / 2,
  };
  h.fire("pointerdown", mid, 3, { pointerType: "mouse" });
  h.fire("pointerup", mid, 3, { pointerType: "mouse" });
  assert.equal(h.ev.changes.length, 0, "pickOnly blocks road insert");
  assert.equal(h.pts.length, before.length);
  // Long-press never opens context.
  h.fire("pointerdown", a, 4, { pointerType: "touch" });
  assert.equal(h.timers.size, 0, "no hold timer when pickOnly");
  h.fire("pointerup", a, 4, { pointerType: "touch" });
  assert.equal(h.ev.contexts.length, 0);
  // Leaving pickOnly restores drag.
  h.cv.setTool("select");
  h.fire("pointerdown", a, 5, { pointerType: "mouse" });
  h.fire("pointermove", h.off(a, 30, 0), 5, { pointerType: "mouse" });
  h.fire("pointerup", h.off(a, 30, 0), 5, { pointerType: "mouse" });
  assert.equal(h.ev.changes.length, 1);
  assert.equal(h.ev.changes[0].kind, "move");
});

test("TrackShape.spanIndices / inSpan: forward walk inclusive; one point when ends match", () => {
  const h = boot();
  const S = h.S;
  assert.deepEqual(plain(S.spanIndices(2, 5, 10)), [2, 3, 4, 5]);
  assert.deepEqual(plain(S.spanIndices(8, 1, 10)), [8, 9, 0, 1], "wraps past the start");
  assert.deepEqual(plain(S.spanIndices(3, 3, 10)), [3]);
  assert.deepEqual(plain(S.spanIndices(-1, 4, 10)), []);
  assert.equal(S.inSpan(4, 2, 5, 10), true);
  assert.equal(S.inSpan(6, 2, 5, 10), false);
  assert.equal(S.inSpan(0, 8, 1, 10), true);
});

test("span group move: drag a member translates every point on the selected span by the same delta", () => {
  const h = boot();
  h.cv.setSelection(3, 6);
  const before = plain(h.pts);
  // Press a mid-span handle (already in the group) and drag past the mouse threshold.
  const a = h.scr(h.pts[4]);
  h.fire("pointerdown", a, 1, { pointerType: "mouse" });
  h.fire("pointermove", h.off(a, 40, 0), 1, { pointerType: "mouse" });
  h.fire("pointerup", h.off(a, 40, 0), 1, { pointerType: "mouse" });
  assert.equal(h.ev.changes.length, 1);
  assert.equal(h.ev.changes[0].kind, "move-span");
  const after = plain(h.ev.changes[0].pts);
  const dx = after[4][0] - before[4][0], dz = after[4][1] - before[4][1];
  assert.ok(Math.abs(dx) > 1 || Math.abs(dz) > 1, "the dragged handle moved");
  for (const i of [3, 4, 5, 6]) {
    assert.ok(Math.abs(after[i][0] - (before[i][0] + dx)) < 1e-9, "point " + i + " x");
    assert.ok(Math.abs(after[i][1] - (before[i][1] + dz)) < 1e-9, "point " + i + " z");
  }
  assert.deepEqual(after[0], before[0], "outside the span stays put");
  assert.deepEqual(after[2], before[2]);
  // Keyboard nudge moves the whole span.
  h.cv.setPoints(before);
  h.cv.setSelection(3, 6);
  h.ev.changes.length = 0;
  h.dom.dispatch(h.canvas, { type: "keydown", key: "ArrowRight", shiftKey: true, preventDefault() {} });
  assert.equal(h.ev.changes[0].kind, "nudge-span");
  const nudged = plain(h.ev.changes[0].pts);
  for (const i of [3, 4, 5, 6]) assert.deepEqual(nudged[i], [before[i][0] + 10, before[i][1]]);
  assert.deepEqual(nudged[1], before[1]);
});

test("shift-click a second handle keeps the anchor and reports the pick with shiftKey", () => {
  const h = boot();
  h.cv.setSelection(2, -1);
  const a = h.scr(h.pts[7]);
  h.fire("pointerdown", a, 1, { pointerType: "mouse", shiftKey: true });
  // Anchor must stay 2 through the press (so the designer can set span=7 on pick).
  assert.deepEqual(plain(h.cv.selection()), { sel: 2, span: -1 });
  h.fire("pointerup", a, 1, { pointerType: "mouse", shiftKey: true });
  assert.deepEqual(h.ev.picks, [7]);
  assert.deepEqual(plain(h.cv.selection()), { sel: 2, span: -1 }, "canvas leaves span to the screen's onPick");
});

test("thumb(): one fitted outline in the asked colour and the start tick; nothing for a missing road", () => {
  const h = boot();
  const V = h.ctx.TrackValidate;
  const tr = V.check({ name: "T", seed: 7, theme: "parkland", baseHW: 7, pts: h.ctx.TrackRandom.generate(7, { targetL: 3800 }).pts }).tr;
  const c = h.dom.document.createElement("canvas");
  c.width = 160; c.height = 110;
  const strokes = [], moves = [];
  c.getContext = () => new Proxy({}, {
    get: (t, k) => (k === "stroke" ? () => strokes.push(t.strokeStyle) : k === "moveTo" || k === "lineTo" ? (x, y) => moves.push([x, y]) : k in t ? t[k] : () => {}),
    set: (t, k, val) => { t[k] = val; return true; },
  });
  assert.equal(h.DC.thumb(c, tr, { color: "#abcdef", width: 2 }), true);
  assert.deepEqual(strokes, ["#abcdef", h.DC.COL.start], "the outline, then the start tick");
  assert.ok(moves.every(([x, y]) => x >= 0 && x <= 160 && y >= 0 && y <= 110), "fitted inside the card");
  assert.equal(h.DC.thumb(c, null), false);
  strokes.length = 0;
  h.DC.thumb(c, tr, { start: false });
  assert.deepEqual(strokes, [h.DC.COL.centre], "no tick when asked");
});


test("live scenery supports every theme with finite, bounded, deterministic footprints", () => {
  const b = boot(), warnings = [];
  b.ctx.Log.warn = (...args) => warnings.push(args.join(" "));
  const d = design(), tr = b.ctx.TrackValidate.check(d).tr, P = b.ctx.DesignerSceneryPreview;
  const before = plain(d);
  for (const theme of b.ctx.TrackThemes.ORDER) {
    const props = b.ctx.TrackDesignerProps.KINDS.map((kind, i) => ({ kind, s: 0.1 + i * 0.06, side: 1, gap: b.ctx.TrackDesignerProps.DEFAULT_GAP[kind] }));
    const scene = P.plan({ ...d, theme, props }, tr), objects = [...scene.items, ...scene.ground];
    assert.ok(objects.length > 0 && objects.length <= P.LIMIT, theme);
    for (const item of objects) assert.ok([item.x, item.z, item.w, item.d, item.angle, ...item.col].every(Number.isFinite), theme + ": " + item.kind);
  }
  assert.deepEqual(warnings, [], "no swallowed recipe failures");
  assert.deepEqual(plain(P.plan(d, tr)), plain(P.plan(d, tr)), "same design keeps scenery stable");
  assert.deepEqual(plain(d), before, "preview does not alter the saved design");
  const few = P.plan({ ...d, look: { trees: "few", crowd: "few" } }, tr);
  const many = P.plan({ ...d, look: { trees: "many", crowd: "packed" } }, tr);
  assert.ok(many.items.length > few.items.length, "density settings reach the preview");
  assert.equal(P.plan({ ...d, look: { time: "night" } }, tr).night, true);
  const prop = { kind: "marshal", s: 0.2, side: 1, gap: 25 };
  const withProp = P.plan({ ...d, props: [prop] }, tr).items.filter(x => x.kind === "marshal");
  const moved = P.plan({ ...d, props: [{ ...prop, gap: 50 }] }, tr).items.filter(x => x.kind === "marshal");
  assert.equal(withProp.length, moved.length);
  assert.ok(withProp.length > 0);
  assert.ok(withProp.some((p, i) => Math.hypot(p.x - moved[i].x, p.z - moved[i].z) > 20), "roadside gap changes the footprint");
});

test("live scenery keeps map range picking and outline switching non-destructive", () => {
  const h = boot({ rangeSelect: () => true }), d = design({ pts: h.pts });
  h.cv.setBuilt(h.ctx.TrackValidate.check(d).tr);
  h.cv.setScenery(d, true);
  assert.equal(h.canvas.dataset.mapView, "scenery");
  const a = h.scr(h.pts[3]), b = h.scr(h.pts[8]);
  h.fire("pointerdown", a, 1, { pointerType: "mouse" }); h.fire("pointermove", b); h.fire("pointerup", b);
  assert.deepEqual(plain(h.cv.selection()), { sel: 3, span: 8 });
  h.cv.setScenery(d, false);
  assert.equal(h.canvas.dataset.mapView, "outline");
  assert.deepEqual(plain(h.cv.selection()), { sel: 3, span: 8 });
  assert.equal(h.ev.changes.length, 0);
});
