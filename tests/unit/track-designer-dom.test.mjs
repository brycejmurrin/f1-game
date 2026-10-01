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

function bootScreen(stored = {}) {
  const vmx = bootEditor(stored);
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

test("share out / in: a code, a link and an exported file all load back as the same design; a #track= link opens the screen", async () => {
  const b = bootScreen();
  b.D.init(b.G, { custom: b.C, root: b.root });
  b.D.open(); b.D.randomise(7); b.D.preview();
  const pts = plain(b.D.state().design.pts), id = b.C.sanitize(b.D.state().design).id;
  const code = await b.D.shareCode();
  assert.match(code, /^APXT1\.[pz]\./, "an APXT1 share code");
  assert.equal(b.D.state().lastCode, code);
  const env = await b.D.exportEnvelope();
  assert.equal(env.format, b.CD.FILE_FORMAT); assert.equal(env.code, code); assert.ok(env.design && env.design.pts.length === pts.length);
  // SHARE copies the link (the clipboard is stubbed) and parks it in the SHARE CODE field.
  const written = [];
  b.ctx.ApexClipboard = { write: async (t) => { written.push(t); return true; } };
  const url = await b.D.share();
  assert.equal(url, b.CD.shareUrl(code));
  assert.deepEqual(plain(written), [url]);
  // Three ways in, each a different design first so the load is visible.
  for (const text of [code, url, JSON.stringify(env)]) {
    b.D.randomise(99); b.D.preview();
    assert.notDeepEqual(plain(b.D.state().design.pts), pts);
    assert.equal(await b.D.loadFrom(text), true, "loads from " + text.slice(0, 12));
    assert.deepEqual(plain(b.D.state().design.pts), pts);
    assert.equal(b.C.sanitize(b.D.state().design).id, id, "the content id survives the round trip");
  }
  assert.equal(await b.D.loadFrom("APXT1.p.not-a-code"), false, "a bad code is refused, not thrown");
  assert.equal(await b.D.loadFrom("{\"format\":\"other\"}"), false, "a foreign file is refused");
  assert.equal(await b.D.loadFrom(""), false);
  // The boot path: CustomTracks.consumeTrackHash() reads location, loads the
  // bundle (already loaded here), opens the design and strips the fragment.
  b.D.close();
  b.D.randomise(5); b.D.preview();
  const replaced = [];
  // game.js hands CustomTracks the lazy loader; here the bundle is already in
  // the VM, so the loader just reports it present (ensureEditor's seam).
  b.ctx.ApexRoster = { LAZY_EDITOR: ["js/editor/designer.js"], LAZY_EDITOR_EDGES: [] };
  b.C.create(b.G, { load: async () => true });
  b.ctx.location = { hash: "#track=" + code, pathname: "/", search: "?x=1" };
  b.ctx.history = { state: null, replaceState: (st, t, u) => replaced.push(u) };
  assert.equal(await b.C.consumeTrackHash(), true);
  assert.equal(b.D.isOpen(), true, "the designer opened on the shared design");
  assert.deepEqual(plain(b.D.state().design.pts), pts);
  assert.deepEqual(plain(replaced), ["/?x=1"], "the fragment is stripped, the query kept");
  b.ctx.location = { hash: "", pathname: "/", search: "" };
  assert.equal(await b.C.consumeTrackHash(), false, "no link, no-op");
  b.ctx.location = { hash: "#track=APXT1.p.garbage", pathname: "/", search: "" };
  assert.equal(await b.C.consumeTrackHash(), false, "a bad link is refused and still stripped");
  assert.equal(replaced.length, 2);
});

test("the terrain material knob: desert and alpine presets name it, shipped defs never carry it", () => {
  const b = bootScreen();
  assert.equal(b.T.defFields("alpine").terrainMat, "SNOW");
  assert.equal(b.T.defFields("oasis").terrainMat, "SAND");
  assert.equal(b.T.defFields("desertnight").terrainMat, "SAND");
  assert.equal("terrainMat" in b.T.defFields("parkland"), false);
  for (const t of b.Tracks.LIST) if (!t.custom) assert.equal("terrainMat" in t, false, t.id + " carries no terrainMat (its golden hash holds)");
  const def =b.ctx.TrackDef.fromRaw(Object.assign({ id: "t", name: "T", gp: "T", country: "", lengthKm: 4, path: { len: 4000, pts: [[0, 0], [100, 0], [100, 100], [0, 100]] }, baseHW: 7, theme: "green", pal: {}, terrainMat: "SNOW" }));
  assert.equal(def.terrainMat, "SNOW");
  const bad = b.ctx.TrackDef.fromRaw(Object.assign({ id: "t2", name: "T", gp: "T", country: "", lengthKm: 4, path: { len: 4000, pts: [[0, 0], [100, 0], [100, 100], [0, 100]] }, baseHW: 7, theme: "green", pal: {}, terrainMat: "LAVA" }));
  assert.equal("terrainMat" in bad, false, "only SAND / SNOW are honoured");
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
  assert.equal(changes[1].kind, "nudge", "a keyboard nudge (the designer folds a run of them into one UNDO)");
  assert.deepEqual(plain(changes[1].pts[2]), [90.25, 60.25], "10 m left, snapped to the 0.25 m lattice");
  assert.deepEqual(pts[2], [100.125, 60.3], "the array it was handed is untouched");
  cv.setBuilt(null); cv.setIssues([]); cv.render(); cv.zoom(2);
  assert.ok(cv.view().scale > v.scale);
});

// ── 2026-10-01 review fixes ────────────────────────────────────────────────
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
/** The point at arc fraction f along a closed control polygon. */
function pointAt(pts, f) {
  const N = pts.length, c = [0];
  for (let i = 0; i < N; i++) { const a = pts[i], b = pts[(i + 1) % N]; c.push(c[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const x = (((f % 1) + 1) % 1) * c[N];
  let i = 0; while (i < N - 1 && c[i + 1] < x) i++;
  const t = (x - c[i]) / ((c[i + 1] - c[i]) || 1), a = pts[i], b = pts[(i + 1) % N];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
/** The point at control INDEX fraction u (what applyHwZones keys on). */
function pointAtIndex(pts, u) {
  const N = pts.length, x = u * N, i = Math.min(N - 1, Math.floor(x)), t = x - i, a = pts[i], b = pts[(i + 1) % N];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
const samePlace = (p, q, tol, what) => assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol, `${what}: ${p} vs ${q}`);
const ZONES = {
  hwZones: [{ s0: 0.2, s1: 0.3, hw: 6, ease: 0.025 }],
  bankZones: [{ frac: 0.4, angleDeg: 12, widthM: 120 }, { frac: 0.05, angleDeg: -6, widthM: 80 }],
  elevations: [{ s: 0.25, halfM: 100, rise: 3 }],
  bridges: [{ s: 0.6, halfM: 120, rise: 6 }],
};
function openGreen(b, seed = 7) { b.D.init(b.G, { custom: b.C, root: b.root }); b.D.open(); b.D.randomise(seed); b.D.preview(); return plain(b.D.state().design); }
const msgText = (b) => b.root.querySelector(".td-msg").textContent;

test("REVERSE and START HERE carry every zone type to the same place on the loop; a bank keeps its angle (sign included)", () => {
  const b = bootScreen();
  const d0 = Object.assign(openGreen(b), plain(ZONES));
  b.D.load(d0);
  assert.equal(b.D.reverse(), true);
  const r = b.D.state().design;
  near(r.bankZones[0].frac, 0.6, 1e-12, "bank frac → 1 − frac"); near(r.bankZones[1].frac, 0.95, 1e-12, "bank frac → 1 − frac");
  assert.deepEqual([r.bankZones[0].angleDeg, r.bankZones[1].angleDeg, r.bankZones[0].widthM], [12, -6, 120], "angleDeg is never negated (its sign is not the camber side — mesh.js reads that off curvature)");
  for (const z of r.bankZones) assert.deepEqual(Object.keys(z).sort(), ["angleDeg", "frac", "widthM"], "no stray s0/s1/angle on a bank");
  near(r.hwZones[0].s0, 0.7, 1e-12, "hw s0 = 1 − s1"); near(r.hwZones[0].s1, 0.8, 1e-12, "hw s1 = 1 − s0");
  near(r.elevations[0].s, 0.75, 1e-12, "elevation"); near(r.bridges[0].s, 0.4, 1e-12, "bridge");
  for (const [f, g] of [[0.4, r.bankZones[0].frac], [0.25, r.elevations[0].s], [0.6, r.bridges[0].s], [0.2, r.hwZones[0].s1]]) samePlace(pointAt(d0.pts, f), pointAt(r.pts, g), 1e-6, "the reversed loop's zone sits where it was");
  const before = plain(r);
  assert.equal(b.D.setStart(5), true);
  const s = b.D.state().design;
  const L = (p) => { let t = 0; for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length]; t += Math.hypot(c[0] - a[0], c[1] - a[1]); } return t; };
  let upto = 0; for (let k = 0; k < 5; k++) { const a = before.pts[k], c = before.pts[k + 1]; upto += Math.hypot(c[0] - a[0], c[1] - a[1]); }
  const sh = upto / L(before.pts), w = (v) => ((v % 1) + 1) % 1;
  near(s.bankZones[0].frac, w(before.bankZones[0].frac - sh), 1e-12, "bank frac shifts with the start");
  assert.equal(s.bankZones[1].angleDeg, -6);
  near(s.hwZones[0].s0, w(before.hwZones[0].s0 - sh), 1e-12, "hw s0"); near(s.elevations[0].s, w(before.elevations[0].s - sh), 1e-12, "elevation"); near(s.bridges[0].s, w(before.bridges[0].s - sh), 1e-12, "bridge");
  for (const [f, g] of [[before.bankZones[0].frac, s.bankZones[0].frac], [before.elevations[0].s, s.elevations[0].s], [before.hwZones[0].s0, s.hwZones[0].s0], [before.hwZones[0].s1, s.hwZones[0].s1]]) samePlace(pointAt(before.pts, f), pointAt(s.pts, g), 1e-6, "START HERE moves the line, not the zones");
  // …and the engine's hwZone window (control INDEX fractions, via toRaw) lands
  // on that same place: the arc → index mapping is exact, not equal-spacing algebra.
  const it = b.C.sanitize(s), raw = b.C.toRaw(it);
  samePlace(pointAtIndex(it.pts, raw.hwZones[0].s0), pointAt(it.pts, it.hwZones[0].s0), 1e-6, "toRaw s0");
  samePlace(pointAtIndex(it.pts, raw.hwZones[0].s1), pointAt(it.pts, it.hwZones[0].s1), 1e-6, "toRaw s1");
  samePlace(pointAt(before.pts, before.hwZones[0].s0), pointAtIndex(it.pts, raw.hwZones[0].s0), 0.25, "end to end, within the u16 fraction grid");
});

test("an insert / delete / stamp keeps zones before the edit at their distance from the start, after it at their distance to the finish", () => {
  const b = bootScreen();
  const d0 = openGreen(b);
  const N = d0.pts.length;
  const cum = (p) => { const c = [0]; for (let i = 0; i < p.length; i++) { const a = p[i], q = p[(i + 1) % p.length]; c.push(c[i] + Math.hypot(q[0] - a[0], q[1] - a[1])); } return c; };
  const c0 = cum(d0.pts), L0 = c0[N];
  const i = Math.floor(N / 2);
  // one zone well before point i, one well after, one on the segment the delete removes
  const fBefore = c0[2] / L0, fAfter = c0[N - 2] / L0, fInside = (c0[i - 1] + c0[i]) / 2 / L0;
  b.D.load(Object.assign({}, d0, { elevations: [{ s: fBefore, halfM: 60, rise: 2 }, { s: fAfter, halfM: 60, rise: 2 }, { s: fInside, halfM: 60, rise: 2 }], bankZones: [{ frac: fAfter, angleDeg: 10, widthM: 100 }] }));
  assert.equal(b.D.deletePoint(i), true);
  const d1 = b.D.state().design, c1 = cum(d1.pts), L1 = c1[d1.pts.length];
  assert.equal(d1.elevations.length, 2, "the zone on the edited span is dropped");
  near(d1.elevations[0].s * L1, fBefore * L0, 1e-6, "before the edit: same metres from the start");
  near(L1 - d1.elevations[1].s * L1, L0 - fAfter * L0, 1e-6, "after the edit: same metres to the finish");
  near(d1.bankZones[0].frac, d1.elevations[1].s, 1e-12, "banks ride the same map");
  samePlace(pointAt(d1.pts, d1.elevations[1].s), pointAt(d0.pts, fAfter), 1e-6, "…so it is still on the same piece of road");
  // A stamp after point 3 replaces road downstream of it (and, past 200
  // points, RDP-thins the untouched tail at 1 m): the zones hold their place.
  b.D.setTool("corner");
  assert.equal(b.D.applyStamp(3, 3), true);
  const d2 = b.D.state().design;
  assert.equal(d2.bankZones.length, 1);
  samePlace(pointAt(d2.pts, d2.bankZones[0].frac), pointAt(d0.pts, fAfter), 1.5, "a stamp upstream does not slide a zone off its corner");
  samePlace(pointAt(d2.pts, d2.elevations[0].s), pointAt(d0.pts, fBefore), 1e-6, "…nor one before the anchor");
  // An insert — a tap on the road at the middle of the loop's longest segment
  // (after the stamp, before the finish zone) on the designer's own canvas
  // (its view is fit()'s: the loop's box × 0.82 in 640 × 400).
  b.D.load(d2);
  let k = 20;
  for (let m = 20; m < d2.pts.length - 20; m++) if (Math.hypot(d2.pts[m + 1][0] - d2.pts[m][0], d2.pts[m + 1][1] - d2.pts[m][1]) > Math.hypot(d2.pts[k + 1][0] - d2.pts[k][0], d2.pts[k + 1][1] - d2.pts[k][1])) k = m;
  const xs = d2.pts.map((p) => p[0]), zs = d2.pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const sc = Math.min(640 / Math.max(60, x1 - x0), 400 / Math.max(60, z1 - z0)) * 0.82;
  const mid = [(d2.pts[k][0] + d2.pts[k + 1][0]) / 2, (d2.pts[k][1] + d2.pts[k + 1][1]) / 2];
  const at = { clientX: (mid[0] - (x0 + x1) / 2) * sc + 320, clientY: (mid[1] - (z0 + z1) / 2) * sc + 200, pointerId: 9 };
  const canvas = b.root.querySelector("canvas");
  b.D.setTool("select");
  // Zoom in around the tap (the world point under the pointer stays put) so
  // the 24 px handle radius no longer covers the road between the points.
  b.dom.dispatch(canvas, Object.assign({ type: "wheel", deltaY: -2000 }, at));
  b.dom.dispatch(canvas, Object.assign({ type: "pointerdown" }, at));
  b.dom.dispatch(canvas, Object.assign({ type: "pointerup" }, at));
  const d3 = b.D.state().design;
  assert.equal(d3.pts.length, d2.pts.length + 1, "the tap inserted a point");
  samePlace(pointAt(d3.pts, d3.bankZones[0].frac), pointAt(d2.pts, d2.bankZones[0].frac), 1e-6, "an insert upstream leaves a downstream zone in place");
  samePlace(pointAt(d3.pts, d3.elevations[0].s), pointAt(d2.pts, d2.elevations[0].s), 1e-6, "…and an upstream one");
});

test("open({design}), EDIT and IMPORT never drop unsaved work: UNDO brings it back and the previous draft is kept on disk", async () => {
  const b = bootScreen();
  const green = openGreen(b);
  b.D.setTheme("alpine");                                   // unsaved work (still green)
  const mine = plain(b.D.state().design);
  const other = b.C.sanitize(Object.assign({}, green, { pts: green.pts.map(([x, z]) => [x + 40, z]) }));
  b.D.open({ design: other, shared: true });
  assert.deepEqual(plain(b.D.state().design.pts), plain(other.pts), "the shared design is on screen");
  assert.match(msgText(b), /UNDO brings back/, "…and the player is told how to get theirs back");
  assert.deepEqual(plain(b.C.draftPrev().pts), mine.pts, "the unsaved design is kept under apex26.customTrackDraftPrev");
  assert.equal(b.C.draftPrev().theme, "alpine");
  b.D.close();
  assert.deepEqual(plain(b.C.draft().pts), plain(other.pts), "the autosave writes the new draft…");
  assert.deepEqual(plain(b.C.draftPrev().pts), mine.pts, "…and cannot clobber the kept one");
  assert.equal(b.D.undo(), true);
  assert.deepEqual(plain(b.D.state().design.pts), mine.pts, "UNDO restores it");
  assert.equal(b.D.state().design.theme, "alpine");
  // A saved, unchanged design is not 'unsaved work': nothing is stashed.
  b.D.preview(); assert.equal(b.D.save().ok, true);
  b.C.setDraftPrev(null);
  b.D.open({ design: other });
  assert.equal(b.C.draftPrev(), null); assert.equal(b.D.state().undo, 0);
  // EDIT from MY CIRCUITS over an edit.
  b.D.setWidth(6);
  const saved = b.C.list()[0];
  b.D.load(saved, "library", saved.id);
  b.D.undo();
  assert.equal(b.D.state().design.baseHW, 6, "UNDO after EDIT is the edited design");
  // IMPORT (a pasted code) over an edit.
  b.D.setStart(4);
  const turned = plain(b.D.state().design.pts);
  assert.equal(await b.D.loadFrom(await b.CD.encode(b.C.sanitize(Object.assign({}, other, { theme: "oasis" })))), true);
  assert.equal(b.D.state().design.theme, "oasis");
  b.D.undo();
  assert.deepEqual(plain(b.D.state().design.pts), turned, "UNDO after IMPORT is the edited design");
  const mineP = mine.pts;
  // A FRESH PAGE: the unsaved work exists only as the autosaved draft. A share
  // link opened there must not let the 600 ms autosave overwrite it.
  const b2 = bootScreen({ customTrackDraft: Object.assign({}, mine, { theme: "harbour" }) });
  b2.D.init(b2.G, { custom: b2.C, root: b2.root });
  b2.D.open({ design: other, shared: true });
  b2.D.close();
  assert.deepEqual(plain(b2.C.draft().pts), plain(other.pts));
  assert.deepEqual(plain(b2.C.draftPrev().pts), mineP, "the on-disk draft survived the share link");
  assert.equal(b2.C.draftPrev().theme, "harbour");
  assert.equal(b2.D.undo(), true);
  assert.deepEqual(plain(b2.D.state().design.pts), mineP);
  assert.equal(b2.D.state().design.theme, "harbour");
});

test("a share link while the screen is open keeps the return focus; EDIT → SAVE replaces the circuit; a full library names its limit", async () => {
  const b = bootScreen();
  const door = b.dom.byId("mb-designer"); door.tagName = "BUTTON";
  door.focus();
  openGreen(b);
  b.root.querySelector("canvas").focus();          // the player is working in the screen
  b.D.open({ design: b.C.sanitize(b.D.state().design), shared: true });   // hashchange while open
  b.D.close();
  assert.equal(b.dom.document.activeElement, door, "close returns focus to the title door, not into the hidden dialog");
  // EDIT a saved circuit, change its geometry, SAVE: one entry, the new id.
  b.D.open(); b.D.preview();
  const first = b.D.save();
  assert.equal(first.ok, true);
  const item = b.C.get(first.id);
  b.D.load(item, "library", item.id);
  b.D.setStart(3); b.D.preview();
  const second = b.D.save();
  assert.equal(second.ok, true); assert.notEqual(second.id, first.id);
  assert.deepEqual(plain(b.D.state().library), [second.id], "replaced, not duplicated");
  b.D.setWidth(6); b.D.preview();
  const third = b.D.save();
  assert.deepEqual(plain(b.D.state().library), [third.id], "…on every later SAVE too");
  // A full library: RACE on a NEW design is refused with the limit named.
  for (let i = 0; b.C.list().length < b.C.LIMITS.items; i++) assert.equal(b.C.upsert(Object.assign({}, b.C.get(third.id), { seed: 1000 + i })).ok, true);
  b.D.randomise(23); b.D.preview();
  assert.equal(b.D.race("gp"), false);
  assert.match(msgText(b), /full \(24 circuits\).*to race/, msgText(b));
  assert.deepEqual(b.clicks, [], "no race door pressed");
});

test("CHECKS is not a live region; count changes are announced once; an unbuildable loop never reads 'All checks pass'", () => {
  const b = bootScreen();
  const d0 = openGreen(b);
  const list = b.root.querySelector(".td-issues");
  assert.equal(list.getAttribute("aria-live"), null, "the 80 ms rebuild is not read out");
  const tiny = Object.assign({}, d0, { pts: Array.from({ length: 36 }, (_, i) => [Math.round(120 * Math.cos(i / 36 * 2 * Math.PI) * 4) / 4, Math.round(80 * Math.sin(i / 36 * 2 * Math.PI) * 4) / 4]) });
  b.D.load(tiny);
  const v = b.D.preview();
  assert.equal(v.ok, false); assert.ok(v.red >= 1, "a ~630 m loop is RED, never a silent fail");
  assert.notEqual(list.children[0].dataset.level, "ok");
  assert.match(msgText(b), /CHECKS: \d+ red issue/, msgText(b));
  const said = msgText(b);
  b.D.preview();
  assert.equal(msgText(b), said, "the same counts are not announced again");
});

test("IMPORT caps the file size; a malformed link or code is a message, never a throw", async () => {
  const b = bootScreen();
  openGreen(b);
  assert.equal(await b.D.importFile({ size: 1 << 20, text: async () => { throw new Error("must not read"); } }), false);
  assert.match(msgText(b), /too big/);
  assert.equal(await b.D.loadFrom("https://x.example/#track=%E0%A4%A"), false);
  assert.ok(msgText(b).length > 0, "a message, not silence");
  assert.equal(await b.D.loadFrom("APXT1.z.%%%"), false);
  assert.ok(msgText(b).length > 0);
});

test("arrow nudges coalesce into one UNDO; arrows pass to MenuNav with nothing selected; Escape / B lets go of the canvas", async () => {
  const b = bootScreen();
  const win = [];
  b.ctx.addEventListener = (type, fn, cap) => win.push({ type, fn, cap });   // window === the VM global here
  openGreen(b);
  const canvas = b.root.querySelector("canvas");
  const key = (k) => { const e = { type: "keydown", key: k }; b.dom.dispatch(canvas, e); return e; };
  canvas.focus();
  assert.equal(canvas.dataset.arrows, "pass", "nothing selected: MenuNav may walk focus off the canvas");
  assert.notEqual(key("ArrowLeft").defaultPrevented, true, "…so the canvas leaves the key alone");
  key("]");
  assert.equal(b.D.state().sel, 0);
  assert.equal(canvas.dataset.arrows, "own");
  const u0 = b.D.state().undo, p0 = plain(b.D.state().design.pts[0]);
  for (let i = 0; i < 4; i++) assert.equal(key("ArrowRight").defaultPrevented, true);
  assert.deepEqual(plain(b.D.state().design.pts[0]), [p0[0] + 4, p0[1]]);
  assert.equal(b.D.state().undo, u0 + 1, "four presses, one UNDO entry");
  key("]"); key("ArrowUp");
  assert.equal(b.D.state().undo, u0 + 2, "a new point starts a new entry");
  b.D.undo();
  assert.deepEqual(plain(b.D.state().design.pts[0]), [p0[0] + 4, p0[1]]);
  b.D.undo();
  assert.deepEqual(plain(b.D.state().design.pts[0]), p0, "one UNDO takes back the whole run");
  // MenuNav: a <canvas> owns the arrows unless it says data-arrows="pass".
  const sb = { Math, Object, Array, Number, String, JSON, Map, Set, WeakMap, RegExp, Promise, Date, document: b.dom.document, UiLayers: { LAYER_IDS: [], shown: () => true, top: () => null }, Log: { info() {}, warn() {}, debug() {} }, addEventListener() {}, removeEventListener() {}, setTimeout: () => 0, clearTimeout() {}, getComputedStyle: () => ({ getPropertyValue: () => "" }), innerWidth: 800, innerHeight: 600, requestAnimationFrame: () => 0 };
  sb.window = sb;
  vm.runInNewContext(read("js/ui/menu-nav.js").replace(/^const\b/gm, "var"), sb, { filename: "js/ui/menu-nav.js" });
  key("]");
  assert.equal(sb.MenuNav.ownsArrows(canvas, "ArrowDown", { isTrusted: false }), true, "a selected point: the pad's arrows nudge it");
  // B on a pad arrives as `cancel` on the dialog; Escape as a keydown. Window capture runs first.
  const back = win.filter((l) => l.cap && (l.type === "cancel" || l.type === "keydown"));
  assert.equal(back.length, 2, "Escape and cancel are both claimed in the capture phase");
  const cancel = { type: "cancel", defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
  back.find((l) => l.type === "cancel").fn(cancel);
  assert.equal(cancel.defaultPrevented, true); assert.equal(cancel.stopped, true, "the screen's close door never sees it");
  assert.equal(b.D.state().sel, -1);
  assert.notEqual(b.dom.document.activeElement, canvas, "focus left the canvas");
  assert.equal(canvas.dataset.arrows, "pass");
  assert.equal(sb.MenuNav.ownsArrows(canvas, "ArrowDown", { isTrusted: false }), false);
  const again = { type: "cancel", defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
  back.find((l) => l.type === "cancel").fn(again);
  assert.equal(again.defaultPrevented, false, "a second B closes the screen as before");
});

/** A DesignerCanvas over a 1.6 km loop, with a recording 2D context. */
function bootCanvas() {
  const b = bootScreen();
  const canvas = b.dom.document.createElement("canvas");
  const fills = [];
  canvas.getContext = () => new Proxy({}, { get: (t, k) => (k === "fill" ? () => fills.push(t.fillStyle) : k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const ev = { changes: [], picks: [], deletes: [] };
  let cv = null;
  cv = b.DC.create(canvas, {
    onChange: (pts, kind) => { ev.changes.push({ pts, kind }); cv.setPoints(pts); },
    onPick: (i) => ev.picks.push(i), onDelete: (i) => ev.deletes.push(i), onSelect: () => {},
  });
  const pts = [];
  for (let i = 0; i < 24; i++) { const t = i / 24 * Math.PI * 2; pts.push([Math.round(300 * Math.cos(t) * 4) / 4, Math.round(200 * Math.sin(t) * 4) / 4]); }
  cv.setPoints(pts);
  const scr = (p) => { const v = cv.view(); return { clientX: (p[0] - v.cx) * v.scale + v.w / 2, clientY: (p[1] - v.cz) * v.scale + v.h / 2 }; };
  const fire = (type, at, id = 1, extra) => b.dom.dispatch(canvas, Object.assign({ type, pointerId: id }, at, extra));
  const tap = (at, id = 1) => { fire("pointerdown", at, id); fire("pointerup", at, id); };
  return { b, canvas, cv, ev, pts, scr, fire, tap, fills };
}

test("DesignerCanvas: lostpointercapture abandons a drag (no phantom pinch after a hidden dialog)", () => {
  const h = bootCanvas();
  h.fire("pointerdown", h.scr(h.pts[2]), 1);
  h.fire("lostpointercapture", {}, 1);              // the dialog hid mid-drag: no pointerup ever comes
  const a = h.scr(h.pts[5]);
  h.fire("pointerdown", a, 2);
  h.fire("pointermove", { clientX: a.clientX + 30, clientY: a.clientY }, 2);
  h.fire("pointerup", { clientX: a.clientX + 30, clientY: a.clientY }, 2);
  assert.equal(h.ev.changes.length, 1, "the next touch is a drag, not the second finger of a pinch");
  assert.equal(h.ev.changes[0].kind, "move");
  // reset() (the designer calls it on open / close) clears a stuck pointer too.
  h.fire("pointerdown", h.scr(h.pts[7]), 3);
  h.cv.reset();
  h.tap(h.scr(h.pts[9]), 4);
  assert.deepEqual(h.ev.picks, [9]);
});

test("DesignerCanvas: double-tap deletes only under SELECT and only the handle both taps picked", () => {
  const h = bootCanvas();
  const at = h.scr(h.pts[6]);
  h.cv.setTool("corner");
  h.tap(at); h.tap(at); h.fire("dblclick", at);
  assert.deepEqual(h.ev.deletes, [], "a stamp tool's double-tap is two stamps, never a delete");
  h.cv.setTool("select");
  h.tap(at); h.tap(at); h.fire("dblclick", at);
  assert.deepEqual(h.ev.deletes, [6], "two picks of one handle under SELECT");
  // Two quick taps on the ROAD: the first inserts a point, the second lands on it.
  const mid = h.scr([(h.pts[5][0] + h.pts[6][0]) / 2, (h.pts[5][1] + h.pts[6][1]) / 2]);
  h.tap(mid); h.tap(mid); h.fire("dblclick", mid);
  assert.equal(h.ev.changes.filter((c) => c.kind === "insert").length, 1);
  assert.deepEqual(h.ev.deletes, [6], "the inserted point is not deleted by the same double-tap");
});

test("DesignerCanvas: a drag stops at the storage bounds; a preview landing mid-drag keeps the road stale", () => {
  const h = bootCanvas();
  const tr = { n: h.pts.length, px: h.pts.map((p) => p[0]), pz: h.pts.map((p) => p[1]), hw: h.pts.map(() => 7), total: 1600 };
  h.cv.setBuilt(tr);
  const a = h.scr(h.pts[3]);
  h.fire("pointerdown", a);
  h.fire("pointermove", { clientX: a.clientX + 40, clientY: a.clientY });
  h.fills.length = 0;
  h.cv.setBuilt(tr);                                 // the 80 ms preview of the PREVIOUS edit
  assert.ok(h.fills.includes(h.b.DC.COL.roadStale) && !h.fills.includes(h.b.DC.COL.road), "still drawn stale: " + h.fills.join(","));
  h.fire("pointerup", { clientX: a.clientX + 40, clientY: a.clientY });
  h.cv.zoom(1e-6);                                   // MIN_SCALE: the canvas spans tens of km
  const b0 = h.scr(h.ev.changes[0].pts[3]);
  h.fire("pointerdown", b0);
  h.fire("pointermove", { clientX: 1e6, clientY: -1e6 });
  h.fire("pointerup", { clientX: 1e6, clientY: -1e6 });
  const p = h.ev.changes[h.ev.changes.length - 1].pts[3];
  assert.deepEqual(plain(p), [h.b.C.LIMITS.coord, -h.b.C.LIMITS.coord], "clamped to ±10 km, so the design stays saveable");
});
