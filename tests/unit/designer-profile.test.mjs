// DesignerProfile (js/editor/profile.js) — per-node height strip for the track
// designer. Pins: grips at control points, ≥44 px touch hits, drag up/down sets
// height (0.25 m lattice, ±60 m), one commit on release, keyboard [ ] / Up/Down /
// Delete flatten / Escape. Screen twin: track-designer-dom.test.mjs.
//
// Run: node --test tests/unit/designer-profile.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { bootEditor, design, read, plain } from "../helpers/editor-vm.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";

const W = 640, H = 72;

function boot(heights, hooks = {}) {
  const { ctx, V, C } = bootEditor();
  const dom = makeDom();
  ctx.document = dom.document;
  ctx.devicePixelRatio = 1;
  const timers = new Map();
  let nextId = 1;
  ctx.setTimeout = (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; };
  ctx.clearTimeout = (id) => { timers.delete(id); };
  for (const f of ["js/editor/canvas.js", "js/editor/elev-presets.js", "js/editor/profile.js"]) {
    vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
  }
  const DP = ctx.DesignerProfile;
  const canvas = dom.document.createElement("canvas");
  canvas._rect = { left: 0, top: 0, right: W, bottom: H, width: W, height: H };
  const rec = { arcs: [], texts: [] };
  canvas.getContext = () => new Proxy({}, {
    get: (t, k) => {
      if (k === "arc") return (x, y, r) => rec.arcs.push({ x, y, r });
      if (k === "fillText") return (s) => rec.texts.push(String(s));
      if (k === "clearRect") return () => { rec.arcs.length = 0; rec.texts.length = 0; };
      return k in t ? t[k] : () => {};
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const d = design();
  const v = V.check(d);
  const tr = v.tr;
  const n = d.pts.length;
  let list = Array.isArray(heights) ? heights.slice() : new Array(n).fill(0);
  while (list.length < n) list.push(0);
  list = list.slice(0, n);
  const ev = { changes: [], selects: [] };
  let pr = null;
  pr = DP.create(canvas, {
    ...hooks,
    onChange: (i, h, live, all) => {
      ev.changes.push({ i, h, live, all: all ? all.slice() : null });
      if (!live) {
        list = Array.isArray(all) ? all.slice() : list.slice();
        if (!Array.isArray(all)) list[i] = h;
        pr.setHeights(list);
      }
    },
    onSelect: (i, j) => ev.selects.push({ i, j }),
  });
  pr.setBuilt(tr, null, d.pts);
  pr.setHeights(list);
  // Visible grip arcs: r ≥ 7 (mouse) — ignore larger touch halos.
  const grips = () => rec.arcs.filter((a) => a.r >= 7 && a.r <= 20);
  const fire = (type, at, id = 1, extra) => dom.dispatch(canvas, Object.assign({ type, pointerId: id, clientX: at.x, clientY: at.y }, extra));
  const key = (k, extra) => { const e = Object.assign({ type: "keydown", key: k }, extra); dom.dispatch(canvas, e); return e; };
  return { ctx, C, DP, dom, canvas, pr, tr, d, ev, rec, grips, fire, key, list: () => list, n };
}
const commits = (ev) => ev.changes.filter((c) => !c.live);

test("profile picks the entire column and maps zoomed touch coordinates correctly", () => {
  const h = boot();
  Object.defineProperty(h.canvas, "clientWidth", { value: W });
  Object.defineProperty(h.canvas, "clientHeight", { value: H });
  h.canvas._rect = { left: 10, top: 20, width: W * 1.25, height: H * 1.25 };
  h.pr.resize();
  const g = h.grips()[4];
  h.fire("pointerdown", { x: 10 + g.x * 1.25, y: 21 }, 1, { pointerType: "touch" });
  h.fire("pointerup", { x: 10 + g.x * 1.25, y: 21 }, 1, { pointerType: "touch" });
  assert.equal(h.pr.selected(), 4, "selection follows horizontal position even away from the grip");
  assert.equal(commits(h.ev).length, 0);
});

test("range dragging selects points without editing heights; zoom and pan stay view-only", () => {
  const h = boot(null, { rangeSelect: () => true });
  const gs = h.grips(), a = gs[2], b = gs[7];
  h.fire("pointerdown", { x: a.x, y: 2 }, 1, { pointerType: "mouse" });
  h.fire("pointermove", { x: b.x, y: 55 });
  h.fire("pointerup", { x: b.x, y: 55 });
  assert.deepEqual(plain(h.pr.selection()), { sel: 2, span: 7 });
  assert.equal(h.ev.changes.length, 0, "a range gesture never becomes a height drag");
  h.pr.zoom(4);
  assert.equal(h.pr.view().span, 0.25);
  h.pr.pan(10);
  assert.equal(h.pr.view().start, 0.75);
  h.pr.fit();
  assert.deepEqual(plain(h.pr.view()), { start: 0, span: 1 });
  assert.equal(h.ev.changes.length, 0);
});

test("armed range end preserves the profile's existing anchor", () => {
  const h = boot(null, { extendSelection: () => true });
  const g = h.grips()[8];
  h.pr.select(3);
  h.fire("pointerdown", { x: g.x, y: g.y });
  h.fire("pointerup", { x: g.x, y: g.y });
  assert.deepEqual(plain(h.pr.selection()), { sel: 3, span: 8 });
  assert.equal(h.ev.changes.length, 0);
});

test("one grip per control point; touch hit radius is ≥44 px", () => {
  const h = boot();
  assert.equal(h.canvas.tabIndex, 0);
  assert.equal(h.canvas.getAttribute("role"), null);
  assert.ok(h.grips().length >= h.n, "a grip arc per control point");
  assert.equal(h.DP.HIT_TOUCH, 44);
  assert.ok(h.DP.HIT_TOUCH >= 44);
});

test("dragging a grip up sets the node height and commits ONCE on release", () => {
  const h = boot();
  h.pr.render();
  const gs = h.grips();
  assert.ok(gs.length >= 1, "grips drawn");
  // Hit the first grip by its recorded centre.
  const g = gs[0];
  h.fire("pointerdown", { x: g.x, y: g.y }, 1, { pointerType: "mouse" });
  assert.ok(h.ev.selects.length >= 1, "press selects a node");
  const i = h.pr.selected();
  assert.ok(i >= 0);
  for (let dy = 10; dy <= 200; dy += 20) h.fire("pointermove", { x: g.x, y: g.y - dy });
  assert.ok(h.ev.changes.some((c) => c.live), "live changes while dragging");
  assert.equal(commits(h.ev).length, 0, "nothing committed mid-drag");
  h.fire("pointerup", { x: g.x, y: g.y - 200 });
  assert.equal(commits(h.ev).length, 1, "one commit on release");
  assert.equal(commits(h.ev)[0].i, i);
  assert.ok(commits(h.ev)[0].h > 0, "drag up raises height: " + commits(h.ev)[0].h);
});

test("select-without-move: tap keeps height; below-threshold jitter keeps height; drag on selected moves", () => {
  const hs = new Array(16).fill(0); hs[2] = 4;
  const h = boot(hs);
  h.pr.render();
  const g = h.grips()[2] || h.grips()[0];
  assert.ok(g, "grip drawn");
  const h0 = h.list()[h.pr.selected() >= 0 ? h.pr.selected() : 2];
  // Tap: select only.
  h.fire("pointerdown", { x: g.x, y: g.y }, 1, { pointerType: "mouse" });
  const i = h.pr.selected();
  assert.ok(i >= 0);
  h.fire("pointerup", { x: g.x, y: g.y }, 1, { pointerType: "mouse" });
  assert.equal(commits(h.ev).length, 0, "tap does not commit a height change");
  assert.equal(h.list()[i], 4, "tap keeps the node's height");
  // Below-threshold vertical jitter (mouse DRAG_MOUSE = 6).
  h.fire("pointerdown", { x: g.x, y: g.y }, 2, { pointerType: "mouse" });
  h.fire("pointermove", { x: g.x + 20, y: g.y - 4 }, 2, { pointerType: "mouse" }); // horizontal ignored; |dy|<6
  h.fire("pointerup", { x: g.x + 20, y: g.y - 4 }, 2, { pointerType: "mouse" });
  assert.equal(commits(h.ev).length, 0, "below-threshold jitter does not move height");
  assert.equal(h.list()[i], 4);
  // Already selected + drag above threshold → height changes.
  h.fire("pointerdown", { x: g.x, y: g.y }, 3, { pointerType: "mouse" });
  assert.equal(h.pr.selected(), i, "still selected");
  h.fire("pointermove", { x: g.x + 40, y: g.y - 80 }, 3, { pointerType: "mouse" }); // vertical only
  h.fire("pointerup", { x: g.x + 40, y: g.y - 80 }, 3, { pointerType: "mouse" });
  assert.equal(commits(h.ev).length, 1, "deliberate vertical drag commits");
  assert.ok(commits(h.ev)[0].h !== 4, "height changed from " + h0);
  assert.equal(h.DP.DRAG_MOUSE, 6);
  assert.equal(h.DP.DRAG_TOUCH, 10);
});

test("keyboard: [ ] pick, Up/Down height, Delete flattens, Escape clears", () => {
  const hs = new Array(16).fill(0); hs[3] = 4;
  const h = boot(hs);
  h.pr.select(3);
  assert.equal(h.canvas.dataset.arrows, "own");
  h.key("ArrowUp");
  assert.equal(commits(h.ev).at(-1).h, 5);
  h.key("ArrowDown", { shiftKey: true });
  assert.equal(commits(h.ev).at(-1).h, 0);
  h.pr.setHeights(h.list().map((_, i) => (i === 3 ? 4 : 0)));
  h.pr.select(3);
  h.key("Delete");
  assert.equal(commits(h.ev).at(-1).h, 0);
  h.pr.select(2);
  h.key("Escape");
  assert.equal(h.pr.selected(), -1);
  assert.equal(h.canvas.dataset.arrows, "pass");
});

test("accessible name names the selected point height", () => {
  const n = design().pts.length;
  const hs = new Array(n).fill(0); hs[1] = 3;
  const h = boot(hs);
  assert.match(h.canvas.getAttribute("aria-label"), new RegExp(n + " control points"));
  h.pr.select(1);
  h.pr.render();
  assert.match(h.canvas.getAttribute("aria-label"), new RegExp("Point 2 of " + n + ": \\+3 m"));
});

test("flat elevation: one height label when max and min round equal (no colliding dual 0 m)", () => {
  const h = boot();
  h.pr.render();
  const heightLabels = h.rec.texts.filter((t) => / m$/.test(t) && !/PT /.test(t));
  assert.equal(heightLabels.length, 1, "one coalesced label: " + heightLabels.join(","));
  assert.equal(heightLabels[0], "0 m");
});

test("span elev: selection API + Up/Down offset every grip in the group by the same delta", () => {
  const n = design().pts.length;
  const hs = new Array(n).fill(0);
  for (let i = 2; i <= 5; i++) hs[i] = i; // relative hills inside the span
  const h = boot(hs);
  h.pr.select(2, 5);
  assert.deepEqual(plain(h.pr.selection()), { sel: 2, span: 5 });
  assert.deepEqual(plain(h.ev.selects.at(-1)), { i: 2, j: 5 });
  h.ev.changes.length = 0;
  h.key("ArrowUp");
  assert.equal(commits(h.ev).length, 1);
  const all = plain(commits(h.ev)[0].all);
  assert.ok(Array.isArray(all) && all.length === n, "commit carries the full heights[]");
  for (let i = 2; i <= 5; i++) assert.equal(all[i], hs[i] + 1, "point " + i + " keeps relative height");
  assert.equal(all[0], 0, "outside the span stays put");
  assert.equal(all[1], 0);
  // Delete flattens the whole span.
  h.ev.changes.length = 0;
  h.key("Delete");
  const flat = plain(commits(h.ev).at(-1).all);
  for (let i = 2; i <= 5; i++) assert.equal(flat[i], 0, "span flattened");
});
