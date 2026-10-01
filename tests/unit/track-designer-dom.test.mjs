// The TRACK DESIGNER screen (js/editor/designer.js) and its drawing surface
// (js/editor/canvas.js) booted in a Node VM over the real engine and a minimal
// DOM: init() must build the whole rail without a design loaded (the first
// browser run of the spec died here — a stepper read `design.baseHW` through a
// null), open() restores or randomises, the edits the rail exposes keep the
// verdict coherent, SAVE lands in CustomTracks and Tracks.LIST, and the canvas
// api fits a view and routes a keyboard nudge back as a lattice-aligned edit.
// The browser spec (tests/specs/track-designer.spec.js, modes) proves the same
// screen on a real page; this is the 300 ms version that runs on every edit.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { bootEditor, read, plain } from "../helpers/editor-vm.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";

const SCREEN_FILES = ["js/ui/dom.js", "js/editor/canvas.js", "js/editor/designer.js"];

function bootScreen() {
  const vmx = bootEditor({});
  const { ctx } = vmx;
  const dom = makeDom({ tagFor: (id) => (id === "trackdesigner" ? "dialog" : id === "td-close" ? "button" : "div") });
  // What the browser gives the screen and the mini DOM does not: a 2D context
  // (every call a no-op), text nodes, the timers the screen debounces with.
  const noop2d = new Proxy({}, { get: (t, k) => (k === "setLineDash" || typeof k !== "string" ? () => {} : () => {}), set: () => true });
  const mkEl = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const el = mkEl(tag);
    if (String(tag).toLowerCase() === "canvas") { el.getContext = () => noop2d; el._rect = { left: 0, top: 0, right: 640, bottom: 400, width: 640, height: 400 }; }
    return el;
  };
  // A text node the mini DOM's selector walk can step over (it iterates `children`).
  dom.document.createTextNode = (s) => ({ nodeType: 3, tagName: "#text", textContent: String(s), children: [], dataset: {}, classList: { contains: () => false }, getAttribute: () => null, hasAttribute: () => false });
  ctx.document = dom.document;
  ctx.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  ctx.queueMicrotask = (fn) => Promise.resolve().then(fn);
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  ctx.devicePixelRatio = 1;
  for (const f of SCREEN_FILES) vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
  const G = { soundOn: false, trackIdx: 0 };
  const clicks = [];
  for (const id of ["mb-race", "mb-tt"]) dom.byId(id).addEventListener("click", () => clicks.push(id));
  dom.byId("mb-race").click = () => clicks.push("mb-race");
  dom.byId("mb-tt").click = () => clicks.push("mb-tt");
  return Object.assign(vmx, { dom, G, clicks, D: ctx.TrackDesigner, DC: ctx.DesignerCanvas, root: dom.byId("trackdesigner") });
}

test("init() builds the rail before any design exists; open() randomises a green loop; close() hides", async () => {
  const b = bootScreen();
  assert.equal(b.D.init(b.G, { custom: b.C, root: b.root }), true, "init builds into the shell dialog");
  assert.equal(b.root.hidden, false, "the shell dialog stays as the shell left it (hidden is the open flag, flipped by open())");
  assert.equal(b.dom.byId("td-close").hidden, false, "the shell's close control is adopted and shown");
  assert.ok(b.root.querySelector(".td-body"), "body built");
  assert.ok(b.root.querySelector(".td-foot"), "foot built");
  assert.equal(b.D.isOpen(), false);
  b.D.open();
  assert.equal(b.D.isOpen(), true);
  let st = b.D.state();
  assert.ok(st.design && st.design.pts.length >= 8, "open() with no draft randomises a loop");
  assert.equal(b.D.randomise(7), true, "seed 7 finds a loop the validator accepts");
  const v = b.D.preview();
  assert.equal(v.ok, true, "the engine-built preview is green: " + v.issues.map((i) => i.code + ":" + i.level).join(","));
  st = b.D.state();
  assert.equal(st.pending, false);
  assert.ok(st.lengthM >= 2500 && st.lengthM <= 7000, "lap length in bounds: " + st.lengthM);
  assert.ok(st.design.pts.every((p) => Number.isInteger(p[0] * 4) && Number.isInteger(p[1] * 4)), "lattice");
  const again = b.D.randomise(7); b.D.preview();
  assert.equal(again, true);
  assert.deepEqual(plain(b.D.state().design.pts), plain(st.design.pts), "deterministic per seed");
  b.D.close();
  assert.equal(b.D.isOpen(), false);
  assert.equal(b.root.hidden, true);
  assert.ok(b.C.draft(), "a draft is autosaved on close");
});

test("the rail's edits: stamp, undo/redo, reverse, start, delete floor, theme, width, name", () => {
  const b = bootScreen();
  b.D.init(b.G, { custom: b.C, root: b.root });
  b.D.open(); b.D.randomise(7); b.D.preview();
  const p0 = plain(b.D.state().design.pts), u0 = b.D.state().undo;
  b.D.setTool("corner");
  assert.equal(b.D.applyStamp(3, 3), true, "a CORNER stamps after point 4");
  const p1 = plain(b.D.state().design.pts);
  // The loop changed (a 60 m / 90° arc after point 4 and its rejoin); the count
  // need not grow — a stamp that pushes past 200 points thins the untouched
  // remainder (TrackStamps.splice), which is the cap's design.
  assert.notDeepEqual(p1, p0, "the stamp changed the loop");
  assert.deepEqual(p1.slice(0, 4), p0.slice(0, 4), "…downstream of the anchor only");
  assert.equal(b.D.state().undo, u0 + 1);
  assert.equal(b.D.undo(), true);
  assert.deepEqual(plain(b.D.state().design.pts), p0);
  assert.equal(b.D.state().redo, 1);
  assert.equal(b.D.redo(), true);
  assert.deepEqual(plain(b.D.state().design.pts), p1);
  b.D.undo();
  const before = b.D.state().design.pts;
  assert.equal(b.D.reverse(), true);
  const rev = plain(b.D.state().design.pts);
  assert.deepEqual(rev[0], plain(before[0]), "REVERSE keeps the start point");
  assert.deepEqual(rev[1], plain(before[before.length - 1]), "…and walks the loop the other way");
  assert.equal(b.D.setStart(5), true);
  assert.deepEqual(plain(b.D.state().design.pts[0]), rev[5], "START HERE rotates the chosen point to index 0");
  assert.equal(b.D.setStart(0), false, "the start itself is refused");
  assert.equal(b.D.setTheme("alpine"), true);
  assert.equal(b.D.state().design.theme, "alpine");
  assert.equal(b.D.setTheme("nope"), false);
  assert.equal(b.D.setWidth(9), true);
  assert.equal(b.D.state().design.baseHW, 8, "width clamps to the registry's cap");
  b.D.setName("my  test!! loop that is far too long for the cap");
  assert.equal(b.D.state().design.name, b.C.sanitizeName("my  test!! loop that is far too long for the cap"));
  // delete down to the floor, then one more is refused
  let n = b.D.state().design.pts.length;
  while (n > b.C.LIMITS.ptsMin && b.D.deletePoint(n - 1)) n = b.D.state().design.pts.length;
  assert.equal(n, b.C.LIMITS.ptsMin);
  assert.equal(b.D.deletePoint(0), false, "the point floor holds");
});

test("SAVE lands in CustomTracks + Tracks.LIST (same geometry updates, never duplicates); RACE presses the title door", () => {
  const b = bootScreen();
  b.D.init(b.G, { custom: b.C, root: b.root });
  b.D.open(); b.D.randomise(23); b.D.preview();
  const base = b.Tracks.LIST.length;
  const r = b.D.save();
  assert.equal(r.ok, true, "save: " + JSON.stringify(r));
  assert.match(r.id, /^custom-[0-9a-f]{8}$/);
  assert.equal(b.Tracks.LIST.length, base + 1);
  const t = b.Tracks.LIST[b.Tracks.LIST.length - 1];
  assert.equal(t.id, r.id); assert.equal(t.custom, true);
  assert.ok((t.turns || []).length >= 3, "baked turns");
  assert.equal(typeof t.scenery, "function", "the theme's inline scenery closure rides the def");
  assert.deepEqual(plain(b.D.state().library), [r.id]);
  b.D.save();
  assert.equal(b.Tracks.LIST.filter((x) => x.custom).length, 1, "re-saving the same geometry updates");
  assert.equal(b.D.race("tt"), true);
  assert.equal(b.D.isOpen(), false, "RACE closes the screen");
  assert.deepEqual(b.clicks, ["mb-tt"], "…and presses the TIME TRIAL door");
  assert.equal(b.Tracks.LIST[b.G.trackIdx].id, r.id, "the façade's trackIdx points at the saved circuit");
});

test("a freehand stroke closes into a valid loop", () => {
  const b = bootScreen();
  b.D.init(b.G, { custom: b.C, root: b.root });
  b.D.open();
  const path = [];
  for (let i = 0; i < 160; i++) { const t = i / 160 * Math.PI * 2; path.push([Math.cos(t) * 700, Math.sin(t) * 420 + 60 * Math.sin(3 * t)]); }
  assert.equal(b.D.freehand(path), true);
  const v = b.D.preview();
  assert.ok(v.tr, "the engine built the drawn loop");
  assert.ok(v.tr.total > 3000, "≈ the drawn perimeter: " + v.tr.total);
  assert.equal(b.D.freehand([[0, 0], [1, 1]]), false, "two points are not a loop");
});

test("DesignerCanvas: fit() frames the loop; an arrow nudge comes back as a lattice-aligned edit", () => {
  const b = bootScreen();
  const canvas = b.dom.document.createElement("canvas");
  const changes = [];
  const cv = b.DC.create(canvas, { onChange: (pts, kind) => changes.push({ pts, kind }), onBegin: () => changes.push({ begin: true }) });
  const pts = [[0, 0], [100, 0], [100.125, 60.3], [0, 60]];
  cv.setPoints(pts);
  const v = cv.view();
  assert.equal(v.w, 640); assert.equal(v.h, 400);
  assert.ok(Math.abs(v.cx - 50) < 1 && Math.abs(v.cz - 30) < 1, "centred on the loop: " + JSON.stringify(v));
  assert.ok(v.scale > 3 && v.scale < 6, "scaled to fit 100 m into 640 px with margin: " + v.scale);
  cv.setSelection(2, -1);
  b.dom.dispatch(canvas, { type: "keydown", key: "ArrowLeft", shiftKey: true, preventDefault() {} });
  assert.equal(changes.length, 2);
  assert.deepEqual(plain(changes[0]), { begin: true });
  assert.equal(changes[1].kind, "move");
  assert.deepEqual(plain(changes[1].pts[2]), [90.25, 60.25], "10 m left, snapped to the 0.25 m lattice");
  assert.deepEqual(pts[2], [100.125, 60.3], "the array it was handed is untouched");
  cv.setBuilt(null); cv.setIssues([]); cv.render(); cv.zoom(2);
  assert.ok(cv.view().scale > v.scale);
});
