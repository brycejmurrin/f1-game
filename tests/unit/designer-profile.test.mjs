// DesignerProfile (js/editor/profile.js) alone — the track designer's elevation
// strip — in a Node VM over the real engine (tests/helpers/editor-vm.mjs) and
// tests/helpers/mini-dom.mjs, with a recording 2D context and a hand-driven
// setTimeout on the VM global. Pins what the screen codes against: a tap on
// empty strip asks for a hill at that point of the lap ({ halfM 160, rise +6 }
// once the screen adds it); dragging a grip up or down sets the height,
// clamped to the registry's 8 % cap (halfM / 19.6, floored to the 0.25 m
// lattice, so the stored value is the one shown) and hands back ONE change on
// release; Shift-dragging sideways sets the length within 20..2000 m; a
// long-press or Delete removes a hill; the strip owns the arrows (data-arrows
// "own") only while a hill is selected, Escape lets go, and the accessible
// name says which hill is selected and what it is. The screen-level twin is
// track-designer-dom.test.mjs.
//
// Run: node --test tests/unit/designer-profile.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { bootEditor, design, read, plain } from "../helpers/editor-vm.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";

const W = 640, H = 60;

/** The strip on the engine VM over a built ellipse, a recording context, manual timers,
 *  and hooks that keep a hill list the way the screen does (add → select it). */
function boot(hills = []) {
  const { ctx, V, C } = bootEditor();
  const dom = makeDom();
  ctx.document = dom.document;
  ctx.devicePixelRatio = 1;
  const timers = new Map();
  let nextId = 1;
  ctx.setTimeout = (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; };
  ctx.clearTimeout = (id) => { timers.delete(id); };
  const runTimers = () => { const due = [...timers.entries()]; timers.clear(); for (const [, t] of due) t.fn(); return due.length; };
  for (const f of ["js/editor/canvas.js", "js/editor/profile.js"]) vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
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
  const v = V.check(design());
  const tr = v.tr;
  const ev = { adds: [], changes: [], removes: [], selects: [] };
  let list = hills.map((b) => DP.hill(b));
  let pr = null;
  pr = DP.create(canvas, {
    onAdd: (sM) => { ev.adds.push(sM); list = list.concat([DP.hill(Object.assign({ s: sM / tr.total }, DP.ADD))]); pr.setBumps(list); pr.select(list.length - 1); },
    onChange: (i, b, live) => { ev.changes.push({ i, b: plain(b), live }); if (!live) { list = list.slice(); list[i] = b; pr.setBumps(list); } },
    onRemove: (i) => { ev.removes.push(i); list = list.filter((_, j) => j !== i); pr.setBumps(list); },
    onSelect: (i) => ev.selects.push(i),
  });
  pr.setBuilt(tr, null, design().pts);
  pr.setBumps(list);
  /** The drawn grips (radius 4.5 unselected / 6 selected; touch ×1.5), in list order. */
  const grips = () => rec.arcs.filter((a) => a.r >= 4.5);
  const fire = (type, at, id = 1, extra) => dom.dispatch(canvas, Object.assign({ type, pointerId: id, clientX: at.x, clientY: at.y }, extra));
  const key = (k, extra) => { const e = Object.assign({ type: "keydown", key: k }, extra); dom.dispatch(canvas, e); return e; };
  return { ctx, C, DP, dom, canvas, pr, tr, ev, rec, grips, fire, key, timers, runTimers, list: () => list };
}
const commits = (ev) => ev.changes.filter((c) => !c.live);

test("a tap on empty strip asks for a hill there; the screen's add is { halfM 160, rise +6 }, selected", () => {
  const h = boot();
  assert.equal(h.canvas.tabIndex, 0, "focusable");
  assert.equal(h.canvas.getAttribute("role"), null, "no role: a focusable role=img fails the menu audit");
  h.fire("pointerdown", { x: 320, y: 30 });
  h.fire("pointerup", { x: 321, y: 31 });
  assert.equal(h.ev.adds.length, 1);
  assert.ok(Math.abs(h.ev.adds[0] - (321 / W) * h.tr.total) < 1e-6, "metres along the built lap under the pointer: " + h.ev.adds[0]);
  const b = h.list()[0];
  assert.deepEqual(plain(b), plain(h.DP.hill({ s: h.ev.adds[0] / h.tr.total, halfM: 160, rise: 6 })));
  assert.equal(b.halfM, 160); assert.equal(b.rise, 6);
  assert.ok(6 <= 160 / 19.6, "the default rise sits under the 8 % cap");
  assert.equal(h.pr.selected(), 0);
  // A drag across empty strip is not a tap.
  h.fire("pointerdown", { x: 100, y: 30 }, 2);
  h.fire("pointerup", { x: 140, y: 30 }, 2);
  assert.equal(h.ev.adds.length, 1, "a swipe adds nothing");
});

test("dragging a grip up sets the height, clamped to halfM / 19.6 on the 0.25 m lattice, and commits ONCE on release", () => {
  const h = boot([{ s: 0.5, halfM: 160, rise: 6 }]);
  const g = h.grips()[0];
  assert.ok(Math.abs(g.x - W / 2) < 0.01, "the grip sits at s / total × W: " + g.x);
  h.fire("pointerdown", g);
  assert.deepEqual(h.ev.selects, [0], "pressing a grip selects it");
  for (let dy = 10; dy <= 400; dy += 30) h.fire("pointermove", { x: g.x + 1, y: g.y - dy });
  const live = h.ev.changes.filter((c) => c.live);
  assert.ok(live.length >= 1, "live changes while dragging");
  assert.equal(commits(h.ev).length, 0, "nothing committed mid-drag");
  h.fire("pointerup", { x: g.x + 1, y: g.y - 400 });
  const c = commits(h.ev);
  assert.equal(c.length, 1, "one commit per drag");
  const cap = Math.floor(160 / 19.6 * 4) / 4;
  assert.deepEqual(c[0].b, { s: h.list()[0].s, halfM: 160, rise: cap }, "rise clamped to the cap, place and length untouched");
  assert.ok(c[0].b.rise <= 160 / 19.6, "never past the 8 % cap");
  assert.equal(c[0].b.s, h.DP.hill({ s: 0.5 }).s, "s on the stored 1/65535 lattice");
  // …and downwards past zero to the negative cap: a dip.
  const g2 = h.grips()[0];
  h.fire("pointerdown", g2, 2);
  h.fire("pointermove", { x: g2.x, y: g2.y + 2000 }, 2);
  h.fire("pointerup", { x: g2.x, y: g2.y + 2000 }, 2);
  assert.equal(commits(h.ev).at(-1).b.rise, -cap);
  // What the strip hands back is what CustomTracks stores, byte for byte.
  const kept = h.C.sanitize(Object.assign(design(), { elevations: h.list() }));
  assert.equal(JSON.stringify(kept.elevations), JSON.stringify(h.list()));
});

test("Shift-dragging a grip sideways sets the length within 20..2000 m (the rise re-capped); a plain sideways drag moves it", () => {
  const h = boot([{ s: 0.5, halfM: 160, rise: 6 }]);
  let g = h.grips()[0];
  h.fire("pointerdown", g, 1, { shiftKey: true });
  h.fire("pointermove", { x: g.x + 5000, y: g.y }, 1, { shiftKey: true });
  h.fire("pointerup", { x: g.x + 5000, y: g.y }, 1, { shiftKey: true });
  assert.deepEqual(commits(h.ev).map((c) => c.b.halfM), [2000], "the registry's longest hill");
  g = h.grips()[0];
  h.fire("pointerdown", g, 2, { shiftKey: true });
  h.fire("pointermove", { x: g.x - 5000, y: g.y }, 2, { shiftKey: true });
  h.fire("pointerup", { x: g.x - 5000, y: g.y }, 2, { shiftKey: true });
  const last = commits(h.ev).at(-1).b;
  assert.equal(last.halfM, 20, "the shortest");
  assert.equal(last.rise, Math.floor(20 / 19.6 * 4) / 4, "a 6 m hill 40 m long would be a wall: the rise follows the cap down");
  assert.equal(last.s, h.DP.hill({ s: 0.5 }).s, "the place is untouched");
  // No Shift: sideways is the place, 1 px = total / W metres.
  g = h.grips()[0];
  h.fire("pointerdown", g, 3);
  h.fire("pointermove", { x: g.x + 64, y: g.y + 1 }, 3);
  h.fire("pointerup", { x: g.x + 64, y: g.y + 1 }, 3);
  const moved = commits(h.ev).at(-1).b;
  assert.ok(Math.abs(moved.s - 0.6) < 2 / 65535, "a tenth of the strip is a tenth of the lap: " + moved.s);
  assert.equal(moved.halfM, 20); assert.equal(commits(h.ev).length, 3);
});

test("a long-press on a grip removes the hill (no drag, no commit); Delete removes the selected one", () => {
  const h = boot([{ s: 0.25, halfM: 160, rise: 6 }, { s: 0.75, halfM: 200, rise: -4 }]);
  const g = h.grips()[1];
  h.fire("pointerdown", g, 1, { pointerType: "touch" });
  assert.equal(h.timers.size, 1, "a hold armed on the grip");
  assert.equal([...h.timers.values()][0].ms, h.ctx.DesignerCanvas.HOLD_MS);
  h.fire("pointermove", { x: g.x + 3, y: g.y }, 1, { pointerType: "touch" });   // jitter under 6 px
  assert.equal(h.runTimers(), 1);
  assert.deepEqual(h.ev.removes, [1]);
  h.fire("pointermove", { x: g.x + 60, y: g.y - 30 }, 1, { pointerType: "touch" });
  h.fire("pointerup", { x: g.x + 60, y: g.y - 30 }, 1, { pointerType: "touch" });
  assert.equal(commits(h.ev).length, 0, "the release after a long-press changes nothing");
  assert.equal(h.ev.adds.length, 0, "…and adds nothing");
  assert.equal(h.pr.selected(), -1);
  // Movement cancels the hold: a drag instead.
  const g0 = h.grips()[0];
  h.fire("pointerdown", g0, 2);
  h.fire("pointermove", { x: g0.x, y: g0.y - 20 }, 2);
  assert.equal(h.timers.size, 0, "moved past 6 px: no long-press");
  h.fire("pointerup", { x: g0.x, y: g0.y - 20 }, 2);
  // Delete on the selected hill.
  h.pr.select(0);
  assert.equal(h.key("Delete").defaultPrevented, true);
  assert.deepEqual(h.ev.removes, [1, 0]);
  assert.equal(h.list().length, 0);
});

test("keyboard / pad: data-arrows own only while a hill is selected; [ ] pick, arrows reshape (one commit a press), Enter adds at the cursor, Escape lets go", () => {
  const h = boot([{ s: 0.6, halfM: 160, rise: 6 }, { s: 0.2, halfM: 160, rise: 3 }]);
  assert.equal(h.canvas.dataset.arrows, "pass", "nothing selected: MenuNav may walk focus off the strip");
  assert.notEqual(h.key("ArrowUp").defaultPrevented, true, "…so the strip leaves the key alone");
  assert.equal(h.key("]").defaultPrevented, true);
  assert.equal(h.pr.selected(), 1, "] picks the first hill in driving order (s 0.2)");
  assert.equal(h.canvas.dataset.arrows, "own");
  h.key("]");
  assert.equal(h.pr.selected(), 0, "…then the next one along");
  h.key("ArrowUp"); h.key("ArrowUp", { shiftKey: true });
  assert.deepEqual(commits(h.ev).map((c) => c.b.rise), [7, Math.floor(160 / 19.6 * 4) / 4], "+1 m, then +5 m capped at the 8 % limit");
  h.key("ArrowLeft", { shiftKey: true });
  assert.equal(commits(h.ev).at(-1).b.halfM, 140, "Shift+Left: 20 m shorter");
  h.key("ArrowRight");
  const sM = commits(h.ev).at(-1).b.s * h.tr.total;
  assert.ok(Math.abs(sM - (h.DP.hill({ s: 0.6 }).s * h.tr.total + 10)) < 0.2, "Right: 10 m further along");
  assert.equal(commits(h.ev).length, 4, "one commit a press");
  h.pr.setCursor(1234);
  assert.equal(h.key("Enter").defaultPrevented, true);
  assert.deepEqual(h.ev.adds, [1234], "Enter adds at the main canvas's selected point");
  assert.equal(h.pr.selected(), 2);
  const esc = h.key("Escape");
  assert.equal(esc.defaultPrevented, true);
  assert.equal(h.pr.selected(), -1);
  assert.equal(h.ev.selects.at(-1), -1, "the screen hears the deselect");
  assert.equal(h.canvas.dataset.arrows, "pass");
  assert.notEqual(h.key("Escape").defaultPrevented, true, "a second Escape is the screen's (it closes)");
});

test("the accessible name says which hill is selected and what it is", () => {
  const h = boot([{ s: 0.6, halfM: 160, rise: 6 }, { s: 0.2, halfM: 300, rise: -2.5 }]);
  const name = () => h.canvas.getAttribute("aria-label");
  assert.match(name(), /^Elevation profile\. 2 hills\. \[ \] pick, Up\/Down height/);
  h.pr.select(0);
  const km = (h.list()[0].s * h.tr.total / 1000).toFixed(2);
  assert.equal(name(), "Elevation profile. Hill 2 of 2: +6 m over 320 m at " + km + " km. [ ] pick, Up/Down height, Left/Right move, Shift+Left/Right length, Enter adds at the selected point, Delete removes");
  h.pr.select(1);
  assert.match(name(), /^Elevation profile\. Hill 1 of 2: −2\.5 m over 600 m at /);
  h.pr.setBumps([]);
  assert.match(name(), /^Elevation profile\. No hills\./);
});

test("drawing: the live drag swaps the bump into the built heights analytically; issues and the cursor draw; setBuilt ends the pending overlay", () => {
  const h = boot([{ s: 0.5, halfM: 160, rise: 0 }]);
  const flat = h.grips()[0];
  h.fire("pointerdown", flat);
  h.fire("pointermove", { x: flat.x, y: flat.y - 40 });
  const up = h.grips()[0];
  assert.ok(up.y < flat.y - 10, "mid-drag the grip rides the previewed hill, no rebuild: " + up.y + " vs " + flat.y);
  h.fire("pointerup", { x: flat.x, y: flat.y - 40 });
  assert.ok(h.grips()[0].y < flat.y - 10, "after release the edit stays drawn until the rebuild lands");
  h.pr.setIssues([{ code: "fia-crest", level: "amber", s: 100, msg: "x" }, { code: "length", level: "red", s: 5, msg: "y" }, { code: "grade", level: "red", msg: "no s" }]);
  assert.equal(h.rec.arcs.filter((a) => a.r === 4).length, 1, "only the grade / crest / dip issues with a place are dotted");
  assert.doesNotThrow(() => { h.pr.setBuilt(null); h.pr.render(); h.pr.resize(); h.pr.reset(); h.pr.destroy(); });
  assert.equal(h.grips().length, 0, "nothing built: nothing to grip");
});
