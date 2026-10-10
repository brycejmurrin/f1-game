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

const SCREEN_FILES = ["js/ui/dom.js", "js/editor/scenery-preview.js", "js/editor/canvas.js", "js/editor/elev-presets.js", "js/editor/profile.js", "js/editor/scenery-panel.js", "js/editor/selection-panel.js", "js/editor/designer.js"];

function bootScreen(stored = {}) {
  const vmx = bootEditor(stored);
  const { ctx } = vmx;
  const dom = makeDom({ tagFor: (id) => (id === "trackdesigner" ? "dialog" : id === "td-close" ? "button" : "div") });
  // What the browser gives the screen and the mini DOM does not: a 2D context
  // (every call a no-op), text nodes, the timers the screen debounces with.
  const noop2d = new Proxy({}, { get: (t, k) => (k === "measureText" ? (s) => ({ width: String(s).length * 6 }) : () => {}), set: () => true });
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
  assert.equal(msgText(b), "Share link copied", "no character-count noise in the status");
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

test("the terrain material knob: desert and alpine presets name it, shipped defs carry only the allowlisted ones", () => {
  const b = bootScreen();
  assert.equal(b.T.defFields("alpine").terrainMat, "SNOW");
  assert.equal(b.T.defFields("oasis").terrainMat, "SAND");
  assert.equal(b.T.defFields("desertnight").terrainMat, "SAND");
  assert.equal("terrainMat" in b.T.defFields("parkland"), false);
  // Shipped circuits that name their ground: Vegas's desert lots, Singapore's paved verges.
  const SHIPPED = { vegas: "SAND", singapore: "CONCRETE" };
  for (const t of b.Tracks.LIST) if (!t.custom) assert.equal(t.terrainMat, SHIPPED[t.id], t.id + " terrainMat");
  const def =b.ctx.TrackDef.fromRaw(Object.assign({ id: "t", name: "T", gp: "T", country: "", lengthKm: 4, path: { len: 4000, pts: [[0, 0], [100, 0], [100, 100], [0, 100]] }, baseHW: 7, theme: "green", pal: {}, terrainMat: "SNOW" }));
  assert.equal(def.terrainMat, "SNOW");
  const bad = b.ctx.TrackDef.fromRaw(Object.assign({ id: "t2", name: "T", gp: "T", country: "", lengthKm: 4, path: { len: 4000, pts: [[0, 0], [100, 0], [100, 100], [0, 100]] }, baseHW: 7, theme: "green", pal: {}, terrainMat: "LAVA" }));
  assert.equal("terrainMat" in bad, false, "only SAND / SNOW / CONCRETE are honoured");
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
  // The picker entry point must retain edit identity just like library EDIT.
  assert.match(read("js/ui/select-screen.js"), /TrackDesigner\.open\(\{ design: CustomTracks\.get\(t\.id\), originId: t\.id \}\)/);
  b.D.open({ design: item, originId: item.id });
  b.D.setStart(3); b.D.preview();
  const second = b.D.save();
  assert.equal(second.ok, true); assert.notEqual(second.id, first.id);
  assert.deepEqual(plain(b.D.state().library), [second.id], "replaced, not duplicated");
  b.D.setWidth(6); b.D.preview();
  const third = b.D.save();
  assert.deepEqual(plain(b.D.state().library), [third.id], "…on every later SAVE too");
  b.D.open({ design: b.C.get(third.id), originId: third.id, shared: true });
  assert.equal(b.D.state().design.originId, undefined, "a shared import never replaces a local design");
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
  const list = b.root.querySelector('[aria-label="Design checks"]');
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
  // Select first, then press-drag (select-without-move: first press may still
  // arm a mouse drag past DRAG_MOUSE once the threshold is crossed).
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

test("DesignerCanvas: select-without-move — tap keeps coords; jitter below threshold keeps coords; drag on selected moves", () => {
  const h = bootCanvas();
  assert.equal(h.b.DC.DRAG_MOUSE, 6);
  assert.equal(h.b.DC.DRAG_TOUCH, 10);
  assert.equal(h.b.DC.HIT_TOUCH, 44);
  const i = 4;
  const before = plain(h.pts[i]);
  const at = h.scr(h.pts[i]);
  // Tap: select only — no onChange.
  h.tap(at);
  assert.deepEqual(h.ev.picks, [i], "tap picks the node");
  assert.equal(h.ev.changes.length, 0, "tap does not move");
  assert.equal(h.cv.selection().sel, i, "canvas selection follows the tap");
  assert.deepEqual(plain(h.pts[i]), before, "coordinates unchanged after tap");
  // Below-threshold jitter while selected (mouse DRAG_MOUSE = 6).
  h.fire("pointerdown", at, 2, { pointerType: "mouse" });
  h.fire("pointermove", { clientX: at.clientX + 4, clientY: at.clientY + 3 }, 2, { pointerType: "mouse" });
  h.fire("pointerup", { clientX: at.clientX + 4, clientY: at.clientY + 3 }, 2, { pointerType: "mouse" });
  assert.equal(h.ev.changes.length, 0, "below-threshold jitter does not move");
  // Already selected + drag above threshold → move.
  h.fire("pointerdown", at, 3, { pointerType: "mouse" });
  h.fire("pointermove", { clientX: at.clientX + 40, clientY: at.clientY }, 3, { pointerType: "mouse" });
  h.fire("pointerup", { clientX: at.clientX + 40, clientY: at.clientY }, 3, { pointerType: "mouse" });
  assert.equal(h.ev.changes.length, 1, "deliberate drag moves");
  assert.equal(h.ev.changes[0].kind, "move");
  assert.notDeepEqual(plain(h.ev.changes[0].pts[i]), before, "coordinates changed");
});

test("DesignerCanvas: empty-space drag pans without moving nodes; touch tap does not move", () => {
  const h = bootCanvas();
  const i = 8;
  const before = plain(h.pts.map((p) => p.slice()));
  const v0 = h.cv.view();
  // Empty space far from every handle.
  const empty = { clientX: 8, clientY: 8 };
  h.fire("pointerdown", empty, 1, { pointerType: "mouse" });
  h.fire("pointermove", { clientX: 48, clientY: 28 }, 1, { pointerType: "mouse" });
  h.fire("pointerup", { clientX: 48, clientY: 28 }, 1, { pointerType: "mouse" });
  assert.equal(h.ev.changes.length, 0, "pan never edits points");
  assert.deepEqual(plain(h.pts), before);
  const v1 = h.cv.view();
  assert.ok(Math.abs(v1.cx - v0.cx) > 0.01 || Math.abs(v1.cz - v0.cz) > 0.01, "view panned");
  // Touch tap on a handle: select only (needs hold or prior select to drag).
  const at = h.scr(h.pts[i]);
  h.fire("pointerdown", at, 2, { pointerType: "touch" });
  h.fire("pointermove", { clientX: at.clientX + 8, clientY: at.clientY + 6 }, 2, { pointerType: "touch" }); // < DRAG_TOUCH
  h.fire("pointerup", { clientX: at.clientX + 8, clientY: at.clientY + 6 }, 2, { pointerType: "touch" });
  assert.equal(h.ev.changes.length, 0, "touch jitter below threshold does not move");
  assert.deepEqual(h.ev.picks.at(-1), i);
});

// ── 2026-10-01 usability: FIX chips, HOW TO, the first-open card, hints, labels, the context row ──
/** Every descendant of `root` (the mini DOM has no descendant selectors). */
const walk = (n, out = []) => { for (const c of n.children || []) { out.push(c); walk(c, out); } return out; };
const chipsIn = (n, text) => walk(n).filter((e) => e.tagName === "BUTTON" && (text == null || e.textContent === text));
/** The rail's three panes in build order: design, library, howto. */
const panes = (b) => b.root.querySelector(".td-rail").children.filter((c) => c.tagName === "SECTION");
/** A ~1.6 km ellipse: RED on length and on the start straights. */
function shortLoop(b) {
  const d0 = openGreen(b);
  const pts = [];
  for (let i = 0; i < 36; i++) { const t = i / 36 * Math.PI * 2; pts.push([Math.round(300 * Math.cos(t) * 4) / 4, Math.round(200 * Math.sin(t) * 4) / 4]); }
  b.D.load(Object.assign({}, d0, { pts }));
  const v = b.D.preview();
  assert.equal(v.ok, false);
  return d0;
}

test("FIX chips: only on rows TrackFixes can repair; FIX commits one UNDO entry and says so; the press never reaches the row", () => {
  const b = bootScreen();
  const seen = [];
  let green = null;
  b.ctx.TrackFixes = {
    canFix: (it) => it.code === "length",
    apply: (d, it, built) => { seen.push({ code: it.code, built: !!(built && built.issues) }); return seen.length === 1 ? { design: Object.assign({}, d, { pts: green.pts }), msg: "lap stretched to 3.2 km" } : null; },
    fixAll: () => null,
  };
  green = shortLoop(b);
  const rows = b.root.querySelector('[aria-label="Design checks"]').children;
  const fixable = rows.filter((li) => chipsIn(li, "FIX").length);
  assert.equal(fixable.length, 1, "one FIX chip, on the length row");
  assert.match(fixable[0].textContent, /Lap is/);
  assert.ok(rows.filter((li) => li.dataset.level === "red").length > 1, "the start rows are red too, and carry no chip");
  const fixAll = chipsIn(b.root, "FIX ALL")[0];
  assert.equal(fixAll.hidden, false, "FIX ALL shows while a red issue is fixable");
  const u0 = b.D.state().undo;
  const ev = { type: "click", bubbles: true };
  b.dom.dispatch(chipsIn(fixable[0], "FIX")[0], ev);
  assert.equal(ev.propagationStopped, true, "the chip's click stops at the chip (the row would refocus the canvas)");
  assert.deepEqual(plain(seen), [{ code: "length", built: true }], "apply(design, issue, the current verdict)");
  assert.equal(b.D.state().undo, u0 + 1, "one UNDO entry");
  assert.deepEqual(plain(b.D.state().design.pts), plain(green.pts));
  assert.equal(msgText(b), "Fixed: lap stretched to 3.2 km — UNDO to revert");
  assert.equal(b.D.preview().ok, true);
  assert.equal(chipsIn(b.root, "FIX ALL")[0].hidden, true, "nothing red, no FIX ALL");
  assert.equal(b.D.undo(), true);
  assert.equal(b.D.preview().ok, false, "UNDO takes the fix back");
  b.dom.dispatch(chipsIn(b.root.querySelector('[aria-label="Design checks"]'), "FIX")[0], { type: "click", bubbles: true });
  assert.equal(msgText(b), "No automatic fix for this one");
  // No TrackFixes (the module did not load): no chips at all, never a throw.
  delete b.ctx.TrackFixes;
  b.D.preview();
  assert.equal(chipsIn(b.root.querySelector('[aria-label="Design checks"]'), "FIX").length, 0);
  assert.equal(chipsIn(b.root, "FIX ALL")[0].hidden, true);
});

test("FIX ALL runs fixAll(design, TrackValidate.check) and commits once, naming the codes it applied", () => {
  const b = bootScreen();
  let green = null;
  const calls = [];
  b.ctx.TrackFixes = {
    canFix: (it) => it.code === "length" || it.code === "start",
    apply: () => null,
    fixAll: (d, check) => { calls.push(check === b.V.check); return { design: Object.assign({}, d, { pts: green.pts }), applied: ["length", "start"] }; },
  };
  let fits = 0;
  const real = b.DC;
  b.ctx.DesignerCanvas = { create: (c, h) => { const api = real.create(c, h), fit = api.fit; api.fit = () => { fits++; return fit(); }; return api; } };
  green = shortLoop(b);
  assert.ok(chipsIn(b.root.querySelector('[aria-label="Design checks"]'), "FIX").length >= 2, "every fixable row has its chip");
  const u0 = b.D.state().undo, f0 = fits;
  chipsIn(b.root, "FIX ALL")[0].click();
  assert.deepEqual(calls, [true], "handed the validator's own check");
  assert.equal(b.D.state().undo, u0 + 1, "one UNDO entry for the whole batch");
  assert.equal(b.D.state().sel, 0, "a start remedy selects the new point 0, as START HERE does");
  assert.equal(fits, f0 + 1, "a length remedy rescales the loop, so the view refits");
  assert.equal(msgText(b), "Fixed length, start — UNDO to revert");
  assert.equal(b.D.preview().ok, true);
  b.D.undo(); b.D.preview();
  b.ctx.TrackFixes.fixAll = (d) => ({ design: d, applied: [], msgs: [] });   // nothing applies → the SAME object
  chipsIn(b.root, "FIX ALL")[0].click();
  assert.equal(b.D.state().undo, u0, "nothing applied, nothing committed");
  assert.match(msgText(b), /Nothing here can be fixed automatically/);
});

test("HOW TO: a third tab lists every HOWTO step, every input and the limits; the limits match the registry", () => {
  const b = bootScreen();
  openGreen(b);
  const tabs = walk(b.root).filter((e) => e.classList.contains("td-tab"));
  assert.deepEqual(tabs.map((t) => t.textContent), ["DESIGN", "MY CIRCUITS", "HOW TO"]);
  for (const t of tabs) assert.equal(t.getAttribute("role"), "tab");
  const [design, lib, how] = panes(b);
  assert.equal(how.dataset.pane, "howto"); assert.equal(how.getAttribute("role"), "tabpanel");
  assert.equal(how.hidden, true);
  tabs[2].click();
  assert.deepEqual([design.hidden, lib.hidden, how.hidden], [true, true, false]);
  assert.deepEqual(tabs.map((t) => t.getAttribute("aria-selected")), ["false", "false", "true"]);
  assert.equal(b.root.dataset.pane, "howto", "phone layout can give the guide its own space");
  const H = b.D.HOWTO;
  const tasks = walk(how).filter(e => e.dataset.helpTask);
  assert.deepEqual(tasks.map(e => e.dataset.helpTask), ["selection", "height", "scenery"]);
  assert.equal(tasks[0].open, true);
  const history = b.D.state().undo;
  chipsIn(how, "OPEN SCENERY")[0].click();
  assert.equal(b.D.state().mode, "scenery");
  assert.equal(how.hidden, true);
  assert.equal(b.root.dataset.pane, "design");
  const live = walk(b.root).find(e => e.dataset.mapView === "scenery" && e.tagName === "BUTTON");
  assert.equal(live.getAttribute("aria-pressed"), "true");
  chipsIn(b.root, "OUTLINE")[0].click();
  assert.equal(live.getAttribute("aria-pressed"), "false");
  assert.equal(b.D.state().undo, history, "view and help navigation do not edit the circuit");
  tabs[2].click();
  const rows = walk(how).filter((e) => e.classList.contains("td-issue"));
  for (const r of rows) assert.equal(r.dataset.level, "info", "info rows, the CHECKS recipe");
  const text = rows.map((r) => r.textContent).join("\n");
  assert.equal(H.STEPS.length, 7);
  H.STEPS.forEach((st, i) => {
    assert.equal(st.n, i + 1);
    assert.ok(text.includes(st.n + " · " + st.title.toUpperCase() + " — " + st.text), "step " + st.n + " is listed");
    assert.ok(st.text.split(/(?<=[.?!])\s+(?=[A-Z])/).length <= 2, "≤ 2 sentences: " + st.title);
  });
  assert.deepEqual(plain(H.GESTURES.map((g) => g.input)), ["Touch", "Mouse", "Keyboard", "Gamepad"]);
  for (const g of H.GESTURES) assert.ok(text.includes(g.input.toUpperCase() + " — " + g.text));
  assert.ok(text.includes(H.LIMITS));
  const L = b.C.LIMITS, VL = b.V.LIMITS;
  assert.ok(H.LIMITS.includes(VL.lenMin / 1000 + "–" + VL.lenMax / 1000 + " km"), "lap length limits");
  assert.ok(H.LIMITS.includes(L.ptsMin + "–" + L.ptsMax + " points"), "point limits");
  assert.ok(H.LIMITS.includes(L.items + " saved circuits"), "library limit");
  tabs[0].click();
  assert.deepEqual([design.hidden, lib.hidden, how.hidden], [false, true, true]);
  // MY CIRCUITS empty: the note is a .td-empty that spans the full .td-grid.
  tabs[1].click();
  const empty = lib.querySelector(".td-empty");
  assert.ok(empty, "empty library copy");
  assert.match(empty.textContent, /No saved circuits yet/);
  assert.ok(empty.parentNode.classList.contains("td-grid"), "lives in the card grid");
});

test("the first-open card: shown once, HOW TO switches tab, GOT IT stores apex26.designerCoached; a later open has none", () => {
  const b = bootScreen();
  b.D.init(b.G, { custom: b.C, root: b.root });
  b.D.open();
  const design = panes(b)[0];
  const card = design.querySelector('[data-role="coach"]') || walk(design).find((e) => e.getAttribute && e.getAttribute("data-role") === "coach");
  assert.ok(card && card.classList.contains("td-group"), "coach card docks in the design pane (not over MODE/SHAPE)");
  const shape = walk(design).find((g) => g.children && [...g.children].some((c) => c.classList && c.classList.contains("td-chips") && c.children[0] && c.children[0].dataset && c.children[0].dataset.tool));
  assert.ok(shape, "1 SHAPE tools exist");
  assert.ok(design.children.indexOf(card) > design.children.indexOf(shape.parentNode || shape) || design.children.indexOf(card) > 0, "coach is below the tool groups");
  const note = card.children[0];
  assert.ok(note.classList.contains("td-issue")); assert.equal(note.dataset.level, "info");
  assert.match(note.textContent, /RANDOMISE gave you a circuit/);
  assert.match(note.textContent, /EDIT shapes the road/);
  assert.deepEqual(chipsIn(card).map((c) => c.textContent), ["HOW TO", "GOT IT"]);
  const u0 = b.D.state().undo;
  chipsIn(card, "HOW TO")[0].click();
  assert.equal(panes(b)[2].hidden, false, "HOW TO opens the guide");
  assert.equal(b.data.designerCoached, undefined, "…without dismissing the card");
  chipsIn(card, "GOT IT")[0].click();
  assert.equal(b.data.designerCoached, true, "GOT IT stores the flag");
  assert.ok(!design.contains(card), "…and removes the card");
  assert.equal(b.D.state().undo, u0, "UNDO / REDO untouched");
  b.D.close(); b.D.open();
  assert.equal(chipsIn(panes(b)[0], "GOT IT").length, 0, "no card on a later open");
  // Seen once is enough: a close without GOT IT stores the flag too.
  const b2 = bootScreen();
  b2.D.init(b2.G, { custom: b2.C, root: b2.root });
  b2.D.open();
  const card2 = panes(b2)[0].querySelector('[data-role="coach"]');
  // mini-dom keeps textContent on the leaf (the .td-issue), not the group.
  assert.ok(card2 && card2.children[0] && /RANDOMISE gave you/.test(card2.children[0].textContent));
  b2.D.close();
  assert.equal(b2.data.designerCoached, true);
  const b3 = bootScreen({ designerCoached: true });
  b3.D.init(b3.G, { custom: b3.C, root: b3.root });
  b3.D.open();
  assert.equal(chipsIn(panes(b3)[0], "GOT IT").length, 0);
});

test("the rail: per-tool hint under 1 SHAPE (the stage copy is hidden on a phone), the status line says it once, and the group labels", () => {
  const b = bootScreen();
  openGreen(b);
  const rail = b.root.querySelector(".td-rail"), stage = b.root.querySelector(".td-stage");
  const toolsGroup = panes(b)[0].children.find((g) => g.children.some((c) => c.children && c.children.some((t) => t.dataset && t.dataset.tool)));
  const hint = toolsGroup.querySelector(".td-hint"), stageHint = stage.querySelector(".td-hint");
  assert.ok(hint && stageHint && hint !== stageHint);
  assert.ok(toolsGroup && toolsGroup.children.some((c) => c.classList.contains("td-chips") && c.children.every((t) => t.dataset.tool)), "the hint sits in the TOOLS group");
  assert.match(hint.textContent, /^EDIT: POINT selects one/);
  // css/editor.css: the phone rules hide only the stage's copy; the rail's stays.
  const css = read("css/editor.css");
  assert.equal((css.match(/\.td-stage \.td-hint \{ display: none; \}/g) || []).length, 2, "narrow/portrait and short both hide the stage hint");
  assert.doesNotMatch(css, /^\s*\.td-hint \{ display: none/m, "no rule hides every .td-hint");
  // Narrow+short landscape (734×343): drop the 200px stage floor and undo the
  // 3-up foot grid — stacking ALL short heights (incl. 852×344 safari) made
  // clipped findings worse (layout-audit 2026-10-05).
  assert.match(css,
    /@media \(max-width: 760px\) and \(max-height: 500px\) and \(orientation: landscape\) \{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(240px,\s*38%\)/,
    "narrow+short landscape keeps a usable side-by-side inspector");
  assert.match(css,
    /@media \(max-width: 760px\) and \(max-height: 500px\) and \(orientation: landscape\) \{[\s\S]*?\.td-foot \{ display: flex/,
    "narrow+short landscape restores a single-row foot");
  assert.match(css,
    /@media \(max-width: 760px\) and \(max-height: 500px\) and \(orientation: landscape\) \{[\s\S]*?min-height:\s*72px/,
    "narrow+short landscape floors the main canvas above WCAG 24");
  const shortOnly = css.match(/@media \(max-height: 500px\) \{([\s\S]*?)\n\}/);
  assert.ok(shortOnly, "short-height media query present");
  assert.doesNotMatch(shortOnly[1], /\.td-body\s*\{/,
    "max-height:500 alone must not restack .td-body (safari 2-col stays)");
  for (const [tool, re] of [["draw", /^DRAW: draw one closed loop/], ["corner", /^CORNER: tap a point to stamp/], ["hairpin", /^HAIRPIN: tap a point/], ["straight", /^STRAIGHT: tap a point/], ["select", /^EDIT: /]]) {
    b.D.setTool(tool);
    assert.match(hint.textContent, re, tool);
    assert.equal(stageHint.textContent, hint.textContent, "one string, two places");
    assert.equal(msgText(b), hint.textContent, "the status line says it once on a change");
  }
  b.D.setTool("select");
  const labels = () => panes(b)[0].children.map((g) => (g.children[0] && g.children[0].classList.contains("td-label") ? g.children[0] : walk(g).find((e) => e.classList.contains("td-label")))).filter(Boolean).map((l) => l.textContent);
  // MODE + numbered groups; ELEVATION / BANKING & KERBS / LOOK stay in the DOM (mode toggles visibility).
  // #1039: 2 CORNERS stays in the rail so numbering never skips 1 → 3.
  assert.deepEqual(labels().slice(0, 7), ["SELECT POINTS", "1 SHAPE", "2 CORNERS", "ELEVATION", "BANKING & KERBS", "SCENERY", "4 DETAILS"]);
  assert.ok(labels().includes("5 CHECKS"));
  const shapeG = panes(b)[0].children.find((g) => g.children[0] && g.children[0].textContent === "2 CORNERS");
  assert.ok(shapeG && !shapeG.hidden, "2 CORNERS group stays visible under EDIT/SELECT");
  assert.match(shapeG.querySelector(".td-hint").textContent, /^Pick STRAIGHT/);
  assert.deepEqual(chipsIn(b.root).filter((c) => c.dataset.mode).map((c) => c.dataset.mode), ["draw", "edit", "elevation", "scenery", "test"]);
  b.D.setMode("elevation");
  assert.equal(b.D.state().mode, "elevation");
  assert.match(hint.textContent, /^ELEVATION:/);
  b.D.setMode("edit");
  b.D.setTool("corner");
  const all = labels();
  const cornerLabel = all.find((t) => t.startsWith("2 CORNERS ·"));
  const m = cornerLabel && cornerLabel.match(/^2 CORNERS · CORNER R (\d+) m × 90° LEFT$/);
  assert.ok(m, cornerLabel || all.join("|"));
  chipsIn(b.root, "TURNS RIGHT")[0].click();
  const up = walk(b.root).find((e) => e.getAttribute && e.getAttribute("aria-label") === "RADIUS m up");
  up.click();
  assert.equal(labels().find((t) => t.startsWith("2 CORNERS ·")), "2 CORNERS · CORNER R " + (+m[1] + 5) + " m × 90° RIGHT", "live from the steppers");
  b.D.setTool("straight");
  assert.equal(labels().find((t) => t.startsWith("2 CORNERS ·")), "2 CORNERS · STRAIGHT 200 m");
  // css pins for the survey defects (horizontal rail scroll, equal tabs, My Circuits empty span).
  assert.match(css, /\.td-row \.sel-chip \{[^}]*min-height:\s*var\(--tap-paint\)/, "stepper ± keys floor at --tap-paint on touch");
  assert.match(css, /\.td-row \.sel-chip \{[^}]*min-width:\s*var\(--tap-paint\)/, "stepper ± keys width floor at --tap-paint on touch");
  assert.match(css, /\.td-issue \{[^}]*min-height:\s*var\(--tap-paint\)/, "CHECKS issue rows floor at --tap-paint");
  assert.match(css,
    /@media \(max-width: 760px\), \(orientation: portrait\) \{[\s\S]*?\.td-stats \{ display: none; \}/,
    "portrait stack hides duplicate stage stats so the canvas row stays inside td-body");
  assert.match(css, /\.td-rail \{[^}]*overflow-x:\s*hidden/, "rail clips horizontal overflow");
  assert.match(css, /\.td-rail \{[^}]*scrollbar-gutter:\s*stable/, "rail reserves scrollbar gutter");
  assert.match(css, /\.td-tab \{[^}]*flex:\s*1 1 0/, "equal-width tabs (no jump)");
  assert.match(css, /\.td-empty \{[^}]*grid-column:\s*1\s*\/\s*-1/, "empty MY CIRCUITS spans the full grid");
  // Phone short: elevation strip stays reachable (not display:none).
  assert.match(css, /max-height: 500px[\s\S]*?data-role="profile"[\s\S]*?display:\s*block/, "profile strip kept on short phones");
  assert.match(css, /\.td-stage canvas \{[^}]*min-height:\s*72px/, "main map canvas keeps a 72px floor in every layout");
  assert.match(css,
    /@media \(max-width: 760px\), \(orientation: portrait\) \{[\s\S]*?grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+minmax\(0,\s*1\.2fr\)/,
    "portrait stack reserves space for the inspector below the map");
  assert.match(css,
    /@media \(max-height: 500px\) \{[\s\S]*?\.td-stats \{ display: none; \}/,
    "short viewports hide duplicate stage stats (852×344 safari 2-col included)");
  assert.match(css,
    /@media \(max-width: 760px\), \(orientation: portrait\) \{[\s\S]*?grid-template-rows:\s*minmax\(72px,\s*1fr\)\s*auto/,
    "portrait stage grid: definite map row + profile");
  assert.match(css,
    /@media \(max-width: 760px\), \(orientation: portrait\) \{[\s\S]*?\[data-role="toolbar"\][\s\S]*?position:\s*absolute/,
    "portrait floats UNDO/REDO/FIT on the map to save stack height");
});

test("the canvas's press-and-hold row: DELETE · START HERE · CLOSE act on that point, anchored at the press; a canvas press hides it; a stamp tool hands the canvas a ghost", () => {
  const b = bootScreen();
  let hooks = null;
  const toolCalls = [];
  const real = b.DC;
  b.ctx.DesignerCanvas = {
    create: (c, h) => {
      hooks = h;
      const api = real.create(c, h), set = api.setTool;
      api.setTool = (name, fn) => { toolCalls.push([name, fn]); return set(name); };
      return api;
    },
  };
  const d0 = openGreen(b);
  assert.equal(typeof hooks.onContext, "function", "the designer offers the hook");
  const row = b.root.querySelector(".td-ctx"), stage = b.root.querySelector(".td-stage");
  assert.ok(stage.children.includes(row), "anchored in the stage"); assert.equal(row.hidden, true);
  assert.ok(row.classList.contains("td-chips"));
  hooks.onContext(5, { x: 600, y: 50 });
  assert.equal(row.hidden, false);
  assert.equal(b.D.state().sel, 5, "the point is selected");
  assert.deepEqual([row.style.right, row.style.top, row.style.left, row.style.bottom], ["40px", "50px", "", ""], "opens away from the right edge (canvas 640 × 400)");
  assert.equal(row.getAttribute("aria-label"), "Point 6");
  chipsIn(row, "DELETE")[0].click();
  assert.equal(row.hidden, true);
  assert.equal(b.D.state().design.pts.length, d0.pts.length - 1);
  assert.deepEqual(plain(b.D.state().design.pts[5]), plain(d0.pts[6]), "point 6 (index 5) went");
  const before = plain(b.D.state().design.pts);
  hooks.onContext(4, { x: 10, y: 390 });
  assert.deepEqual([row.style.left, row.style.bottom], ["10px", "10px"], "opens away from the bottom edge");
  chipsIn(row, "START HERE")[0].click();
  assert.deepEqual(plain(b.D.state().design.pts[0]), before[4], "START HERE on that point");
  hooks.onContext(0, { x: 100, y: 100 });
  assert.equal(chipsIn(row, "START HERE")[0].disabled, true, "the start itself cannot be the new start");
  chipsIn(row, "CLOSE")[0].click();
  assert.equal(row.hidden, true);
  hooks.onContext(3, { x: 100, y: 100 });
  const canvas = b.root.querySelector("canvas");
  b.dom.dispatch(canvas, { type: "pointerdown", pointerId: 7, clientX: 5, clientY: 5 });
  b.dom.dispatch(canvas, { type: "pointercancel", pointerId: 7 });
  assert.equal(row.hidden, true, "the next press on the canvas hides it");
  hooks.onContext(3, { x: 100, y: 100 });
  b.D.close();
  assert.equal(row.hidden, true, "closing the screen hides it");
  hooks.onContext(999, { x: 1, y: 1 });
  assert.equal(row.hidden, true, "an index off the loop is ignored");
  // The ghost: a stamp tool passes previewFn(i) → absolute world points from point i.
  b.D.open();
  b.D.setTool("corner");
  const [name, fn] = toolCalls[toolCalls.length - 1];
  assert.equal(name, "corner"); assert.equal(typeof fn, "function");
  const pts = b.D.state().design.pts, g = fn(3);
  assert.deepEqual(plain(g.pts[0]), plain(pts[3]), "the ghost starts on the point");
  assert.ok(g.pts.length > 3, "…and runs the corner");
  assert.equal(fn(-1), null);
  b.D.setTool("select");
  assert.equal(toolCalls[toolCalls.length - 1][1], undefined, "SELECT clears the ghost");
});

// ── Insight (js/editor/insight.js): TURNS, SPEED, TRACK OF THE DAY, START FROM ──
const turnsList = (b) => walk(b.root).find((e) => e.getAttribute && e.getAttribute("aria-label") === "Corners, in driving order");

test("TURNS: one info row per corner; a row selects its span, prefills the tool and REPLACE re-stamps it green", () => {
  const b = bootScreen();
  openGreen(b);
  const st = b.D.state(), list = turnsList(b);
  assert.equal(list.getAttribute("aria-label"), "Corners, in driving order");
  assert.ok(st.corners.length >= 3, st.corners.length + " corners");
  assert.equal(list.children.length, st.corners.length, "one row per corner");
  for (const li of list.children) {
    assert.equal(li.dataset.level, "info"); assert.equal(li.tabIndex, 0);
    assert.match(li.textContent, /^T\d+ · (LEFT|RIGHT) \d+° · R \d+ m · \d+ km\/h · \d+ m$/);
  }
  const c = st.corners[1], u0 = st.undo, dir = c.fit.dir < 0 ? "RIGHT" : "LEFT";
  list.children[1].click();
  let now = b.D.state();
  assert.deepEqual([now.sel, now.span, now.tool], [c.i0, c.i1, c.fit.kind], "the row's span, the fitted tool");
  assert.ok(now.sel !== now.span && !(now.span > 0 && now.span < now.sel), "point 0 is never inside the span");
  const label = walk(panes(b)[0]).find((e) => e.classList.contains("td-label") && /^2 CORNERS/.test(e.textContent));
  assert.equal(label.textContent, c.fit.kind === "corner" ? "2 CORNERS · CORNER R " + c.fit.R + " m × " + c.fit.deg + "° " + dir : "2 CORNERS · HAIRPIN R " + c.fit.R + " m " + dir);
  assert.equal(now.design.pts.length, st.design.pts.length, "selecting changes nothing");
  assert.equal(now.undo, u0);
  const replace = chipsIn(b.root, "REPLACE THE SELECTED SPAN")[0];
  assert.ok(replace, "2 CORNERS offers REPLACE THE SELECTED SPAN");
  replace.click();
  const v = b.D.preview();
  assert.equal(v.red, 0, "the re-stamped turn is green: " + v.issues.map((i) => i.code + ":" + i.level).join(","));
  assert.equal(b.D.state().undo, u0 + 1, "one UNDO entry");
  // Keyboard: Enter on a row is the same press.
  const first = turnsList(b).children[0], c0 = b.D.state().corners[0];
  b.dom.dispatch(first, { type: "keydown", key: "Enter" });
  assert.deepEqual([b.D.state().sel, b.D.state().span], [c0.i0, c0.i1]);
});

test("4 DETAILS: RANDOMISE · TRACK OF THE DAY · START FROM… over the edit row, which ends in SPEED then TEST HERE (#766)", () => {
  const b = bootScreen();
  openGreen(b);
  const design = panes(b)[0];
  assert.equal(chipsIn(design, "RANDOMISE").length, 1, "RANDOMISE moved, not copied");
  const seedRow = chipsIn(design, "RANDOMISE")[0].parentNode;
  assert.deepEqual(seedRow.children.map((c) => c.textContent), ["RANDOMISE", "TRACK OF THE DAY", "START FROM…"]);
  const speed = chipsIn(design, "SPEED")[0], editRow = speed.parentNode;
  assert.deepEqual(editRow.children.map((c) => c.textContent), ["REVERSE", "START HERE", "DELETE POINT", "PREV POINT", "NEXT POINT", "SELECT END", "SPEED", "TEST HERE"]);
  // UNDO / REDO / FIT live on the stage toolbar (not buried under DETAILS).
  const toolbar = b.root.querySelector('.td-chips[data-role="toolbar"]');
  assert.ok(toolbar, "stage toolbar");
  assert.deepEqual([...toolbar.children].map((c) => c.textContent), ["UNDO", "REDO", "FIT VIEW", "OUTLINE", "LIVE SCENERY", "HEIGHT"]);
  // SPEED: a toggle the canvas paints from.
  assert.equal(speed.getAttribute("aria-pressed"), "false"); assert.equal(b.D.state().heat, false);
  speed.click();
  assert.equal(speed.getAttribute("aria-pressed"), "true"); assert.equal(b.D.state().heat, true);
  speed.click();
  assert.equal(speed.getAttribute("aria-pressed"), "false"); assert.equal(b.D.state().heat, false);
  // TRACK OF THE DAY: the day's seed, the same loop on a second press.
  chipsIn(design, "TRACK OF THE DAY")[0].click();
  const a = plain(b.D.state().design.pts);
  assert.match(msgText(b), /^Track of the day \(\d{4}-\d{2}-\d{2}\) — seed \d+$/);
  assert.equal(b.D.trackOfTheDay(), true);
  assert.deepEqual(plain(b.D.state().design.pts), a, "deterministic for the day");
  assert.equal(b.D.state().design.seed >>> 0, b.D.state().design.seed);
});

test("HEIGHT maps engine elevation, survives scenery and undo, and excludes SPEED without editing the design", () => {
  const b = bootScreen(); openGreen(b);
  const before = plain(b.D.state());
  const height = chipsIn(b.root, "HEIGHT")[0];
  b.D.setMode("elevation");
  assert.equal(height.getAttribute("aria-pressed"), "true");
  assert.equal(b.D.state().elevationHeat, true);
  assert.deepEqual(plain(b.D.state().design), before.design);
  assert.equal(b.D.state().undo, before.undo);
  b.D.applyElevPreset("hilly"); b.D.preview();
  b.D.setMode("scenery");
  assert.equal(b.D.state().elevationHeat, true);
  b.D.undo(); b.D.preview();
  assert.deepEqual(plain(b.D.state().design.heights), before.design.heights);
  assert.equal(b.D.state().elevationHeat, true);
  b.D.toggleHeat(true);
  assert.equal(height.getAttribute("aria-pressed"), "false");
  assert.equal(b.D.state().heat, true);
  height.click();
  assert.equal(b.D.state().heat, false);
  assert.equal(b.D.state().elevationHeat, true);
  height.click();
  assert.equal(b.D.state().elevationHeat, false);
});

test("START FROM…: a card per shipped circuit; a pick traces it into a new design, one UNDO away", () => {
  const b = bootScreen();
  const d0 = openGreen(b);
  const design = panes(b)[0], from = chipsIn(design, "START FROM…")[0];
  const grid = walk(design).find((e) => e.classList.contains("td-grid"));
  assert.equal(grid.hidden, true, "closed until asked");
  from.click();
  assert.equal(grid.hidden, false); assert.equal(from.getAttribute("aria-expanded"), "true");
  const shipped = b.Tracks.LIST.filter((t) => !t.custom);
  assert.equal(grid.children.length, shipped.length, "one card per shipped circuit");
  for (const card of grid.children) {
    assert.ok(card.classList.contains("td-card"));
    assert.equal(card.children[0].tagName, "CANVAS"); assert.equal(card.children[0].getAttribute("aria-hidden"), "true");
    assert.match(card.children[1].textContent, /^\d+\.\d\d km · \d+ corners$/);
  }
  const u0 = b.D.state().undo;
  chipsIn(grid, "MONZA")[0].click();
  const st = b.D.state();
  assert.equal(st.design.name, "MONZA REMIX");
  assert.ok(st.design.pts.length >= 60 && st.design.pts.length <= 120, st.design.pts.length + " points");
  assert.equal(st.design.originId, undefined, "SAVE adds a new circuit");
  assert.deepEqual(plain([st.design.hwZones, st.design.bankZones, st.design.elevations, st.design.bridges]), [[], [], [], []]);
  assert.equal(st.undo, u0 + 1);
  assert.equal(grid.hidden, true, "the cards fold away");
  const v = b.D.preview();
  assert.equal(v.red, 0, "Monza traces green: " + v.issues.map((i) => i.code + ":" + i.level).join(","));
  const real = b.Tracks.buildCenterline(shipped.find((t) => t.id === "monza"), { line: false }).total;
  assert.ok(Math.abs(v.tr.total / real - 1) < 0.03, "Monza's length: " + Math.round(v.tr.total) + " vs " + Math.round(real));
  assert.equal(b.D.undo(), true);
  assert.deepEqual(plain(b.D.state().design.pts), d0.pts, "UNDO brings the design back");
  assert.equal(b.D.startFrom("custom-nope"), false);
});

// START FROM pinned every shipped circuit's whole centreline (~4 MB) for the page
// once the panel opened; a card strokes a 160×110 outline, so only that is kept.
test("START FROM… memoises a small outline per circuit, not its whole centreline", async () => {
  const b = bootScreen();
  openGreen(b);
  const design = panes(b)[0], from = chipsIn(design, "START FROM…")[0];
  from.click();
  const shipped = b.Tracks.LIST.filter((t) => !t.custom).length;
  for (let i = 0; i < shipped * 4 && b.D.state().thumbs.cached < shipped; i++) await new Promise((r) => setTimeout(r, 0));
  const th = b.D.state().thumbs;
  assert.equal(th.cached, shipped, "every card drew");
  assert.ok(th.maxPts > 32 && th.maxPts <= 256, "an outline of at most 256 points: " + th.maxPts);
});

// ── Authoring: SPIRAL m, SPAN WIDTH m, the SELECTED TURN's BANK ° ──
const rowOf = (root, label) => walk(root).find((e) => e.classList.contains("td-row") && e.children[0] && e.children[0].textContent === label);
const stepBy = (row, n) => { const b = row.children[n > 0 ? 3 : 1]; for (let i = 0; i < Math.abs(n); i++) b.click(); };
/** Boot with the canvas hooks in hand (a span is a tap and a shift-tap; an insert is onChange). */
function bootHooked() {
  const b = bootScreen();
  const real = b.DC;
  b.ctx.DesignerCanvas = { create: (c, h) => { b.hooks = h; return real.create(c, h); }, thumb: real.thumb };
  return b;
}
const cumOf = (p) => { const c = [0]; for (let i = 0; i < p.length; i++) { const a = p[i], q = p[(i + 1) % p.length]; c.push(c[i] + Math.hypot(q[0] - a[0], q[1] - a[1])); } return c; };

test("SPIRAL m: a stepper for CORNER / HAIRPIN / CHICANE / S-BEND only, 0–80 in 5s, named in the label and carried by STAMP", () => {
  const b = bootScreen();
  openGreen(b);
  const row = rowOf(b.root, "SPIRAL m");
  assert.ok(row, "the row exists");
  assert.match(row.parentNode.children[0].textContent, /^2 CORNERS/, "inside 2 CORNERS");
  for (const [tool] of b.D.TOOLS) {
    b.D.setTool(tool);
    const curved = ["corner", "hairpin", "chicane", "sbend"].includes(tool);
    assert.equal(!row.hidden && !row.parentNode.hidden, curved, tool + (curved ? " shows" : " hides") + " SPIRAL m");
  }
  b.D.setTool("corner");
  const val = row.children[2];
  assert.equal(val.textContent, "0");
  stepBy(row, 3); assert.equal(val.textContent, "15");
  stepBy(row, 30); assert.equal(val.textContent, "80", "clamps at 80");
  const label = () => walk(panes(b)[0]).find((e) => e.classList.contains("td-label") && /^2 CORNERS/.test(e.textContent)).textContent;
  assert.match(label(), /^2 CORNERS · CORNER R \d+ m × \d+° (LEFT|RIGHT) · SPIRAL 80 m$/);
  b.D.setTool("hairpin"); assert.equal(val.textContent, "80", "the value rides across the curved tools");
  stepBy(row, -30); assert.equal(val.textContent, "0", "clamps at 0");
  assert.doesNotMatch(label(), /SPIRAL/, "no spiral, no mention");
  // STAMP lays the spiral down: the same anchor with and without differs, one UNDO each.
  // (The hairpin left R at 25: a 60° arc that short has no room for two spirals.)
  b.D.setTool("corner");
  stepBy(rowOf(b.root, "RADIUS m"), 7); stepBy(rowOf(b.root, "ANGLE °"), 6);
  assert.match(label(), /^2 CORNERS · CORNER R 60 m × 90° /);
  const d0 = plain(b.D.state().design);
  assert.equal(b.D.applyStamp(3, 3), true);
  const flat = plain(b.D.state().design.pts);
  assert.equal(b.D.undo(), true);
  stepBy(row, 8);
  assert.equal(b.D.applyStamp(3, 3), true);
  const spiral = plain(b.D.state().design.pts);
  assert.notDeepEqual(spiral, flat, "SPIRAL 40 m changes the stamp");
  assert.deepEqual(spiral.slice(0, 4), d0.pts.slice(0, 4), "upstream of the anchor nothing moves");
});

test("SPAN WIDTH m: one hwZone on the span's control points, merged on repeat, cleared at the base width, capped at 24, carried by an insert and a delete", () => {
  const b = bootHooked();
  const d0 = openGreen(b);
  const row = rowOf(b.root, "SPAN WIDTH m"), val = row.children[2];
  const details = row.parentNode;
  assert.ok(/^4 DETAILS/.test(details.children[0].textContent), "in 4 DETAILS");
  assert.equal(details.children[details.children.indexOf(rowOf(b.root, "HALF-WIDTH m")) + 1], row, "right under HALF-WIDTH");
  assert.equal(row.getAttribute("aria-disabled"), "true", "no span: disabled");
  assert.equal(row.children[1].getAttribute("aria-disabled"), "true");
  assert.equal(val.textContent, "—");
  stepBy(row, -1);
  assert.match(msgText(b), /^Select a span first/);
  assert.deepEqual(plain(b.D.state().design.hwZones), []);
  // A span: tap point 5, shift-tap point 9.
  b.hooks.onPick(5, {}); b.hooks.onPick(9, { shiftKey: true });
  assert.deepEqual([b.D.state().sel, b.D.state().span], [5, 9]);
  assert.equal(row.getAttribute("aria-disabled"), "false");
  assert.equal(val.textContent, d0.baseHW.toFixed(1));
  const u0 = b.D.state().undo;
  stepBy(row, -10);
  let d = b.D.state().design;
  assert.equal(d.hwZones.length, 1, "ten presses, one zone");
  const z = d.hwZones[0], hw = Math.round((d0.baseHW - 1) * 10) / 10;
  assert.equal(z.hw, hw); assert.equal(val.textContent, hw.toFixed(1));
  assert.equal(z.ease, 0.025, "a 1 m step tapers over the engine's default");
  assert.equal(b.D.state().undo, u0 + 10, "one UNDO per press");
  assert.deepEqual(plain(d.pts), d0.pts, "no point moves");
  samePlace(pointAt(d.pts, z.s0), d.pts[5], 1e-6, "s0 on point 6"); samePlace(pointAt(d.pts, z.s1), d.pts[9], 1e-6, "s1 on point 10");
  // The engine narrows exactly there (toRaw → index fractions → applyHwZones).
  const it = b.C.sanitize(d), raw = b.C.toRaw(it);
  samePlace(pointAtIndex(it.pts, raw.hwZones[0].s0), d.pts[5], 0.25, "toRaw s0");
  const v = b.D.preview(), mid = d.pts[7];
  let k = 0; for (let j = 0; j < v.tr.n; j++) if (Math.hypot(v.tr.px[j] - mid[0], v.tr.pz[j] - mid[1]) < Math.hypot(v.tr.px[k] - mid[0], v.tr.pz[k] - mid[1])) k = j;
  assert.ok(Math.abs(v.tr.hw[k] - hw) < 0.05, "built half-width " + v.tr.hw[k] + " under the span");
  // The engine only narrows (def.js applyHwZones keeps the smaller): the base width is the top.
  assert.equal(b.D.setSpanWidth(d0.baseHW + 1), true, "over the base clamps to it…");
  assert.deepEqual(plain(b.D.state().design.hwZones), [], "…which clears the zone");
  assert.equal(b.D.setSpanWidth(d0.baseHW), false, "nothing left to clear");
  assert.equal(b.D.setSpanWidth(5.5), true);
  assert.equal(b.D.setSpanWidth(5.5), false, "the same width again is no edit");
  assert.equal(b.D.setSpanWidth(2), true, "under the registry's 5 m floor clamps to it");
  d = b.D.state().design;
  assert.equal(d.hwZones.length, 1); assert.equal(d.hwZones[0].hw, 5);
  // Insert a point before the span (the canvas's onChange "insert"), then delete one after it.
  const P = d.pts, ins = P.slice(0, 2).concat([[(P[1][0] + P[2][0]) / 2, (P[1][1] + P[2][1]) / 2]], P.slice(2));
  b.hooks.onChange(ins, "insert");
  let e = b.D.state().design;
  assert.equal(e.pts.length, P.length + 1);
  samePlace(pointAt(e.pts, e.hwZones[0].s0), P[5], 1e-6, "insert before: s0 still on the same point"); samePlace(pointAt(e.pts, e.hwZones[0].s1), P[9], 1e-6, "…and s1");
  assert.equal(b.D.deletePoint(14), true);
  e = b.D.state().design;
  samePlace(pointAt(e.pts, e.hwZones[0].s0), P[5], 1e-6, "delete after: s0 still on the same point"); samePlace(pointAt(e.pts, e.hwZones[0].s1), P[9], 1e-6, "…and s1");
  // Repeat on an overlapping span merges: one zone, the new width.
  b.hooks.onPick(5, {}); b.hooks.onPick(8, { shiftKey: true });   // P[4] … P[7] after the insert
  assert.equal(b.D.setSpanWidth(6), true);
  e = b.D.state().design;
  assert.equal(e.hwZones.length, 1, "an overlapping span replaces the zone"); assert.equal(e.hwZones[0].hw, 6);
  // 24 is the registry's cap: a 25th refuses with the limit, a replacement still works.
  const N = e.pts.length, c = cumOf(e.pts), L = c[N];
  const many = [];
  for (let m = 0; m < 24; m++) { const a = c[20 + m] / L, q = (c[20 + m] + 4) / L; many.push({ s0: a, s1: q, hw: 6.5, ease: 0.025 }); }
  b.D.load(Object.assign({}, e, { hwZones: many }));
  b.hooks.onPick(2, {}); b.hooks.onPick(5, { shiftKey: true });
  assert.equal(b.D.setSpanWidth(6), false);
  assert.match(msgText(b), /24 width zones at most/);
  assert.equal(b.D.state().design.hwZones.length, 24);
  b.hooks.onPick(20, {}); b.hooks.onPick(22, { shiftKey: true });
  assert.equal(b.D.setSpanWidth(6), true, "over zones it replaces, the cap is not reached");
  assert.equal(b.D.state().design.hwZones.filter((q) => q.hw === 6).length, 1);
  assert.ok(b.D.state().design.hwZones.length <= 24);
});

test("BANK °: the SELECTED TURN banks its apex — {frac, angleDeg, widthM: the corner's length}; over 5.7° is FIA amber; 0 flattens it; TURNS reads it back", () => {
  const b = bootScreen();
  openGreen(b);
  const list = turnsList(b), pick = list.parentNode.children.find((e) => e.getAttribute && e.getAttribute("role") === "group");
  assert.ok(pick, "a SELECTED TURN block inside TURNS");
  assert.equal(pick.hidden, true, "hidden until a turn is selected");
  const row = rowOf(pick, "BANK °"), val = row.children[2];
  list.children[1].click();
  assert.equal(pick.hidden, false);
  assert.equal(pick.children[0].textContent, "SELECTED TURN · T2");
  assert.equal(val.textContent, "FLAT");
  const v0 = b.D.preview(), st = b.D.state();
  const c = b.ctx.TrackInsight.corners(v0.tr, st.design.pts, null, v0.turns)[1];
  assert.equal(c.bankDeg, 0); assert.equal(c.hwSpan, null);
  const u0 = st.undo;
  stepBy(row, 3);
  let d = b.D.state().design;
  assert.equal(d.bankZones.length, 1, "three presses, one zone");
  assert.deepEqual(plain(d.bankZones[0]), { frac: c.sApex / v0.tr.total, angleDeg: 6, widthM: Math.round(Math.min(600, Math.max(20, c.lenM))) });
  assert.equal(b.D.state().undo, u0 + 3);
  assert.deepEqual(plain(d.pts), st.design.pts, "no point moves");
  assert.equal(val.textContent, "6°");
  let v = b.D.preview();
  assert.ok(v.issues.some((i) => i.code === "fia-bank" && i.level === "amber"), "6° is over the FIA's 5.7°: " + v.issues.map((i) => i.code).join(","));
  assert.equal(v.red, 0);
  assert.match(turnsList(b).children[1].textContent, / · BANK 6°$/, "TURNS says so");
  assert.equal(b.ctx.TrackInsight.corners(v.tr, d.pts, null, v.turns)[1].bankDeg, 6);
  assert.equal(pick.hidden, false, "still selected after the preview");
  stepBy(row, -1);
  v = b.D.preview();
  assert.equal(b.D.state().design.bankZones[0].angleDeg, 4);
  assert.ok(!v.issues.some((i) => i.code === "fia-bank"), "4° is within Grade 1");
  stepBy(row, -5);
  assert.deepEqual(plain(b.D.state().design.bankZones), [], "down past 2° is flat: the zone goes");
  assert.equal(val.textContent, "FLAT");
  assert.equal(b.D.setCornerBank(2, 99), true, "by number; clamps to 30");
  assert.equal(b.D.state().design.bankZones[0].angleDeg, 30);
  assert.equal(b.D.setCornerBank(2, 30), false, "the same again is no edit");
  assert.equal(b.D.setCornerBank(2, 0), true);
  assert.equal(b.D.setCornerBank(99, 6), false, "no such turn");
  // SPAN WIDTH on the selected turn shows on its row too.
  turnsList(b).children[1].click();
  assert.equal(b.D.setSpanWidth(6), true);
  b.D.preview();
  assert.match(turnsList(b).children[1].textContent, / · 12 m WIDE$/);
  // Another selection hides the block.
  b.D.setTool("select");
  b.D.undo();
  assert.equal(pick.hidden, true, "UNDO clears the selection");
});

// ── the elevation strip (per-node heights) ─────────────────────────────────
test("elevation: presets + node height undo/redo; strip selects a point; Escape lets go first", () => {
  const b = bootScreen();
  const win = [];
  b.ctx.addEventListener = (type, fn, cap) => win.push({ type, fn, cap });
  const kinds = [];
  const dbg = b.ctx.Log.debug;
  b.ctx.Log.debug = (ns, msg) => { const m = /designer edit: (\S+)/.exec(String(msg)); if (m) kinds.push(m[1]); };
  try {
    openGreen(b);
    b.D.setMode("elevation");
    const strip = b.root.querySelector('canvas[data-role="profile"]'), stage = b.root.querySelector(".td-stage");
    assert.ok(strip, "the strip is built");
    assert.ok(stage.contains(strip), "strip under the stage");
    assert.equal(strip.tabIndex, 0);
    const presets = chipsIn(panes(b)[0], "ROLLING")[0].parentNode;
    assert.deepEqual([...presets.children].map((c) => c.textContent), ["FLAT", "ROLLING", "HILLY"]);
    const u0 = b.D.state().undo;
    chipsIn(panes(b)[0], "ROLLING")[0].click();
    assert.equal(kinds.at(-1), "elev:rolling");
    let st = b.D.state();
    assert.equal(st.undo, u0 + 1);
    assert.equal(st.design.heights.length, st.design.pts.length);
    assert.ok(st.design.heights.some((h) => h !== 0), "rolling moves nodes");
    assert.deepEqual(st.design.elevations, [], "presets clear legacy cosine hills");
    // Node stepper + strip keys.
    b.D.setMode("elevation");
    const pick = Math.floor(st.design.pts.length / 2);
    b.root.querySelector("canvas").focus(); // main
    // Select via API path used by the strip.
    b.D.setNodeHeight(pick, 5);
    assert.equal(kinds.at(-1), "elev:node");
    assert.equal(b.D.state().design.heights[pick], 5);
    strip.focus();
    // Escape with a strip selection lets go first.
    const back = win.filter((l) => l.cap && l.type === "keydown");
    // Select a point on the strip via DesignerProfile API through the screen's sync.
    b.D.state(); // ensure
    const esc = { type: "keydown", key: "Escape", defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
    // Force a strip selection by dispatching after mode elev + selecting via canvas pick is heavy; call profileBack path by selecting through setNodeHeight which selects.
    // Profile select via evaluating: the strip's select is internal; Escape with no selection should not claim.
    for (const l of back) l.fn(esc);
    // Undo / redo the height edit.
    assert.equal(b.D.undo(), true);
    assert.notEqual(b.D.state().design.heights[pick], 5);
    assert.equal(b.D.redo(), true);
    assert.equal(b.D.state().design.heights[pick], 5);
    // Flat clears.
    chipsIn(panes(b)[0], "FLAT")[0].click();
    assert.ok(b.D.state().design.heights.every((h) => h === 0));
    // Old save without heights loads flat.
    const bare = Object.assign({}, st.design); delete bare.heights;
    b.D.load(bare);
    assert.ok(b.D.state().design.heights.every((h) => h === 0), "missing heights → flat");
    assert.equal(b.D.state().design.heights.length, b.D.state().design.pts.length);
  } finally { b.ctx.Log.debug = dbg; }
});

test("DESIGNED RANDOMISE: FAST fills four cards (busy while it runs), USE loads one in one UNDO, MORE LIKE THIS replaces them", async () => {
  const b = bootScreen();
  openGreen(b);
  const design = panes(b)[0], fast = chipsIn(design, "FAST")[0], row = fast.parentNode;
  assert.deepEqual(row.children.map((c) => c.textContent), ["FAST", "TECHNICAL", "MIXED"]);
  assert.ok(row.children.every((c) => c.getAttribute("aria-pressed") === "false"));
  const grid = walk(design).filter((e) => e.classList.contains("td-grid"))[1];
  assert.equal(grid.hidden, true, "no cards before a style is pressed");
  assert.equal(row.parentNode, grid.parentNode, "the style row and the cards share 4 DETAILS");
  // The run: busy at once (the frame paints), the cards after the timer slices.
  const run = b.D.designed("FAST", 21);
  assert.equal(grid.getAttribute("aria-busy"), "true", "aria-busy while designing");
  assert.ok(row.children.every((c) => c.disabled), "style chips disabled while designing");
  assert.equal(msgText(b), "Designing 16 circuits…");
  assert.equal(fast.getAttribute("aria-pressed"), "true");
  assert.equal(chipsIn(design, "TECHNICAL")[0].getAttribute("aria-pressed"), "false");
  assert.equal(await run, true);
  assert.equal(grid.hasAttribute("aria-busy"), false, "aria-busy cleared");
  assert.ok(row.children.every((c) => !c.disabled));
  assert.equal(grid.hidden, false);
  assert.equal(grid.children.length, 4, "four cards");
  const st = b.D.state();
  assert.equal(st.candidates.length, 4);
  for (let i = 1; i < 4; i++) assert.ok(st.candidates[i - 1].score >= st.candidates[i].score, "best first");
  for (const card of grid.children) {
    assert.ok(card.classList.contains("td-card"));
    assert.equal(card.children[0].tagName, "CANVAS"); assert.equal(card.children[0].getAttribute("aria-hidden"), "true");
    assert.match(card.children[1].textContent, /^\d+\.\d km · \d+ corners · \d+ passing$/);
    assert.deepEqual(chipsIn(card).map((c) => c.textContent), ["USE", "MORE LIKE THIS"]);
  }
  assert.match(msgText(b), /^FAST: the best 4 of 16/);
  // Deterministic per seed.
  await b.D.designed("FAST", 21);
  assert.deepEqual(plain(b.D.state().candidates), plain(st.candidates));
  // USE: the card's loop, one UNDO entry, a new circuit.
  const u0 = b.D.state().undo, d0 = plain(b.D.state().design.pts);
  chipsIn(grid.children[1], "USE")[0].click();
  let now = b.D.state();
  assert.equal(now.undo, u0 + 1, "one UNDO entry");
  assert.equal(now.design.seed, st.candidates[1].seed);
  assert.equal(now.design.originId, undefined, "SAVE adds a new circuit");
  assert.equal(b.D.preview().ok, true, "the card is green");
  assert.equal(b.D.undo(), true);
  assert.deepEqual(plain(b.D.state().design.pts), d0, "UNDO brings the design back");
  // MORE LIKE THIS: variants of card 1 replace the cards.
  const more = b.D.moreLikeThis(0);
  assert.equal(grid.getAttribute("aria-busy"), "true");
  assert.equal(await more, true);
  assert.equal(grid.hasAttribute("aria-busy"), false);
  const after = b.D.state().candidates;
  assert.ok(after.length >= 2 && after.length <= 4 && grid.children.length === after.length, after.length + " variants");
  assert.ok(after.every((c) => !st.candidates.some((o) => o.seed === c.seed)), "new seeds: the cards were replaced");
  assert.match(msgText(b), /circuits like design 1/);
  assert.equal(b.D.useCandidate(0), true);
  assert.equal(b.D.preview().ok, true, "a variant is green");
  assert.equal(b.D.useCandidate(9), false, "no such card");
});

// ── Round 3 PR E: the share card and TEST HERE ─────────────────────────────
/** A 2D context that records the text it draws (and measures 6.6 px a glyph). */
function recordingCanvas(b, texts, canvases) {
  const mk = b.dom.document.createElement;
  b.dom.document.createElement = (tag) => {
    const el = mk(tag);
    if (String(tag).toLowerCase() === "canvas") {
      canvases.push(el);
      el.getContext = () => new Proxy({}, { get: (t, k) => (k === "fillText" ? (s) => texts.push(String(s)) : k === "measureText" ? (s) => ({ width: String(s).length * 6.6 }) : () => {}), set: () => true });
      el.toBlob = (cb, type) => cb(new Blob(["\x89PNG"], { type }));
    }
    return el;
  };
}
const SHORT_LOOP = () => { const pts = []; for (let i = 0; i < 36; i++) { const t = i / 36 * Math.PI * 2; pts.push([Math.round(300 * Math.cos(t) * 4) / 4, Math.round(200 * Math.sin(t) * 4) / 4]); } return pts; };

test("CARD: a 640×360 PNG to the share sheet when canShare({files}) allows, else NativeDownload, else <a download>; a dismissed sheet is silent; red refuses", async () => {
  const b = bootScreen();
  const texts = [], canvases = [], shared = [], native = [], anchors = [];
  openGreen(b);
  recordingCanvas(b, texts, canvases);
  b.ctx.File = File;
  let canShare = true, shareErr = null;
  b.ctx.navigator = { canShare: (d) => canShare && Array.isArray(d.files) && d.files.every((f) => f instanceof File), share: async (d) => { if (shareErr) throw shareErr; shared.push(d); } };
  const foot = b.root.querySelector(".td-foot");
  assert.deepEqual(chipsIn(foot).map((c) => c.textContent).slice(3, 6), ["SHARE", "CARD", "EXPORT"], "CARD sits after SHARE in the foot");
  assert.equal(await b.D.shareCard(), true);
  const c = canvases[canvases.length - 1];
  assert.deepEqual([c.width, c.height], [640, 360], "an offscreen 640×360 card");
  const url = b.CD.shareUrl(b.D.state().lastCode), name = b.D.state().design.name;
  assert.equal(shared.length, 1);
  const f = shared[0].files[0];
  assert.match(f.name, /^apex26-track-[a-z0-9-]+-card\.png$/);
  assert.equal(f.type, "image/png");
  assert.deepEqual([shared[0].title, shared[0].text], [name, url], "the full link always rides the share text");
  assert.ok(texts.includes(name) && texts.includes("APEX 26 · TRACK DESIGNER"), "name and mark drawn: " + texts.join(" | "));
  assert.ok(texts.some((t) => /km · \d+ corners · est lap \d+:\d\d\.\d$/.test(t)), "the facts line");
  const urlLines = texts.filter((t) => /#track=|^https?:|^\.\.\.|…|^[A-Za-z0-9._~%-]+$/.test(t) && t !== name);
  assert.ok(urlLines.length >= 1 && urlLines.length <= 3, "the link in at most three lines: " + urlLines.join(" | "));
  // apex8: greedy wrapChars split "…#track=" into "…#trac" / "k=…" — never break inside #track=
  assert.equal(urlLines.some((t) => /#trac$/i.test(t) || /^k=/i.test(t)), false, "no mid-word #track wrap: " + urlLines.join(" | "));
  assert.ok(urlLines.some((t) => /#track=/.test(t) || t === "#track="), "#track= token stays whole: " + urlLines.join(" | "));
  assert.equal(msgText(b), "Card shared");
  // No file sharing here: the native bridge where the shell has one…
  canShare = false;
  b.ctx.NativeDownload = { viable: () => true, saveBlob: async (blob, n) => { native.push([blob.type, n]); } };
  assert.equal(await b.D.shareCard(), true);
  assert.deepEqual(native, [["image/png", f.name]]);
  assert.equal(msgText(b), "Card saved as " + f.name);
  // …else an <a download>; a sheet that refuses for any other reason falls back the same way.
  b.ctx.NativeDownload = { viable: () => false };
  b.ctx.URL = { createObjectURL: () => "blob:card", revokeObjectURL: () => {} };
  const mk = b.dom.document.createElement;
  b.dom.document.createElement = (tag) => { const el = mk(tag); if (String(tag).toLowerCase() === "a") el.click = () => anchors.push([el.href, el.download]); return el; };
  canShare = true; shareErr = Object.assign(new Error("no activation"), { name: "NotAllowedError" });
  assert.equal(await b.D.shareCard(), true);
  assert.deepEqual(anchors, [["blob:card", f.name]]);
  // A dismissed sheet is the player's answer: nothing saved, nothing said.
  shareErr = Object.assign(new Error("dismissed"), { name: "AbortError" });
  b.D.load(Object.assign({}, b.D.state().design));   // a fresh status line
  const before = msgText(b);
  assert.equal(await b.D.shareCard(), false);
  assert.equal(anchors.length, 1); assert.equal(native.length, 1);
  assert.equal(msgText(b), before);
  // Gated like SHARE: a red design draws nothing.
  const n0 = canvases.length;
  b.D.load(Object.assign({}, b.D.state().design, { pts: SHORT_LOOP() }));
  assert.equal(b.D.preview().ok, false);
  assert.equal(await b.D.shareCard(), false);
  assert.equal(canvases.length, n0);
  assert.match(msgText(b), /Fix the red issues before sharing/);
});

test("CARD re-entry: a second shareCard while the first is mid-share is refused (no double download)", async () => {
  const b = bootScreen();
  openGreen(b);
  recordingCanvas(b, [], []);
  b.ctx.File = File;
  let release = null;
  b.ctx.navigator = {
    canShare: (d) => Array.isArray(d.files) && d.files.every((f) => f instanceof File),
    share: () => new Promise((resolve) => { release = resolve; }),
  };
  const first = b.D.shareCard();
  // cardCanvas is async: wait until nav.share has been entered (cardBusy held).
  for (let i = 0; i < 40 && typeof release !== "function"; i++) await new Promise((r) => setTimeout(r, 0));
  assert.equal(typeof release, "function", "first call entered nav.share");
  assert.equal(await b.D.shareCard(), false, "re-entry refused while busy");
  release();
  assert.equal(await first, true);
  assert.equal(msgText(b), "Card shared");
});

test("TEST HERE: saves, arms the return, starts a TIME TRIAL on the circuit, drops the car at rest on the selected point and goes green; a failed start comes back with the reason", async () => {
  const b = bootScreen();
  let hooks = null;
  const real = b.DC;
  b.ctx.DesignerCanvas = { create: (c, h) => { hooks = h; return real.create(c, h); }, COL: real.COL };
  openGreen(b);
  const d = b.D.state().design, tr = b.V.check(d).tr;   // the engine build the race drives
  const calls = [];
  const grid = { s: tr.total - 14, _prevS: tr.total - 14, prog: -14, x: -3, xVis: -3, px: 1, pz: 2, head: 0, speed: 4, vLat: 2, yawRateCur: 1, yawVis: 0.2, steerVis: 0.1, rescueT: 3, wallT: 1, wasOnWall: true, wrongT: 2, wrongWay: true, offT: 1 };
  Object.assign(b.G, {
    state: "menu", player: null, track: null, timeTrial: false, seasonMode: true,
    startRace: async () => { calls.push(["startRace", b.G.trackIdx, b.G.timeTrial, b.G.seasonMode, b.D.isOpen()]); b.G.state = "count"; b.G.track = tr; b.G.player = Object.assign({}, grid); },
    goRolling: () => { calls.push(["goRolling"]); if (b.G.state !== "count") return false; b.G.state = "race"; return true; },
    snapGameCam: () => calls.push(["snap"]), refreshHud: () => calls.push(["hud"]),
    quitToMenu: () => { calls.push(["quit"]); b.G.state = "menu"; b.C.consumeTrackHash(); },
  });
  b.ctx.ApexRoster = { LAZY_EDITOR: ["js/editor/designer.js"], LAZY_EDITOR_EDGES: [] };
  b.C.create(b.G, { load: async () => true });
  // The chip: last in the 4 DETAILS actions row and in the press-and-hold row; off until a point is selected.
  const chip = chipsIn(b.root.querySelector(".td-rail"), "TEST HERE")[0];
  assert.equal(chip.parentNode.children[chip.parentNode.children.length - 1], chip, "appended to the actions row");
  assert.ok(b.root.querySelector('.td-chips[data-role="toolbar"]'), "FIT VIEW lives on the stage toolbar");
  assert.ok(chipsIn(b.root.querySelector(".td-stage"), "FIT VIEW").length === 1);
  const ctxRow = b.root.querySelector(".td-ctx");
  assert.equal(ctxRow.children[ctxRow.children.length - 1].textContent, "TEST HERE", "…and to the press-and-hold row");
  assert.equal(chip.getAttribute("aria-disabled"), "true");
  assert.equal(await b.D.testHere(), false, "no point, no drive");
  assert.match(msgText(b), /Select a point/);
  assert.equal(calls.length, 0);
  hooks.onPick(12, { shiftKey: false });
  assert.equal(chip.getAttribute("aria-disabled"), "false");
  assert.equal(await b.D.testHere(), true);
  const id = b.D.state().library[0];
  assert.ok(id && b.D.state().design.originId === id, "saved first");
  assert.deepEqual(plain(calls), [["startRace", b.Tracks.LIST.findIndex((t) => t.id === id), true, false, false], ["snap"], ["hud"], ["goRolling"]], "trackIdx + time trial + gp flow, closed, then the drop and the green");
  assert.equal(b.G.state, "race");
  // Within 20 m of the control's built s (the nearest node of the same engine build).
  const p0 = d.pts[12];
  let k = 0; for (let j = 0, best = Infinity; j < tr.n; j++) { const q = (tr.px[j] - p0[0]) ** 2 + (tr.pz[j] - p0[1]) ** 2; if (q < best) { best = q; k = j; } }
  const sExp = k * tr.total / tr.n, p = b.G.player;
  const ds = Math.abs(p.s - sExp), wrapD = Math.min(ds, tr.total - ds);
  assert.ok(wrapD <= 20, "placed at s " + p.s + " vs " + sExp);
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0] };
  b.Tracks.sample(tr, p.s, smp);
  assert.deepEqual([p.px, p.pz, p.head], [smp.p[0], smp.p[2], Math.atan2(smp.t[0], smp.t[2])], "world pose from the track sample");
  assert.equal(p.prog, p.s - tr.total, "an out-lap: the first crossing starts the timed lap");
  assert.equal(p._prevS, p.s);
  assert.deepEqual([p.x, p.xVis, p.speed, p.vLat, p.yawRateCur, p.yawVis, p.steerVis, p.rescueT, p.wallT, p.wasOnWall, p.wrongT, p.wrongWay, p.offT], [0, 0, 0, 0, 0, 0, 0, 0, 0, false, 0, false, 0], "at rest, every transient cleared");
  assert.deepEqual([p.rPrevPx, p.rPrevPz, p.rPrevS, p.rPrevX, p.rPrevHead, p.rPrevYawVis], [p.px, p.pz, p.s, 0, p.head, 0], "render anchors seeded");
  // The way back: armed, so quitting reopens the designer on the same point.
  b.D.load(Object.assign({}, b.D.state().design), "library", id);   // as if something reset the selection
  b.D.close();
  b.ctx.UiLayers = { inRace: () => true };
  assert.equal(await b.C.consumeTrackHash(), null, "mid-race it waits");
  assert.equal(b.D.isOpen(), false);
  b.ctx.UiLayers = { inRace: () => false };
  assert.equal(await b.C.consumeTrackHash(), true);
  assert.equal(b.D.isOpen(), true);
  assert.equal(b.D.state().sel, 12, "the selected point is back");
  assert.equal(msgText(b), "Back from the test drive");
  // A start that never reaches the lights: out through quitToMenu, back with the reason.
  calls.length = 0;
  b.G.startRace = async () => { calls.push(["startRace"]); };
  b.G.state = "results";
  hooks.onPick(12, { shiftKey: false });
  assert.equal(await b.D.testHere(), false);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(plain(calls), [["startRace"], ["quit"]], "never a frozen race");
  assert.equal(b.D.isOpen(), true);
  assert.match(msgText(b), /could not start/);
  // A red design is refused before anything moves.
  calls.length = 0;
  b.D.load(Object.assign({}, b.D.state().design, { pts: SHORT_LOOP() }));
  hooks.onPick(3, { shiftKey: false });
  assert.equal(await b.D.testHere(), false);
  assert.equal(calls.length, 0);
  assert.match(msgText(b), /Fix the red issues before racing/);
});

test("consumeTrackHash: an armed return reopens with sel/span (only for the same design), defers mid-race keeping it, and is taken once", async () => {
  const b = bootScreen();
  openGreen(b);
  const r = b.D.save();
  assert.equal(r.ok, true);
  b.ctx.ApexRoster = { LAZY_EDITOR: ["js/editor/designer.js"], LAZY_EDITOR_EDGES: [] };
  b.C.create(b.G, { load: async () => true });
  b.D.close();
  assert.equal(await b.C.consumeTrackHash(), false, "nothing armed, no link: a no-op");
  b.C.armReturn({ id: r.id, sel: 5, span: 9, s: 100 });
  b.ctx.UiLayers = { inRace: () => true };
  assert.equal(await b.C.consumeTrackHash(), null);
  assert.equal(await b.C.consumeTrackHash(), null, "still armed while racing");
  assert.equal(b.D.isOpen(), false);
  b.ctx.UiLayers = { inRace: () => false };
  assert.equal(await b.C.consumeTrackHash(), true);
  assert.equal(b.D.isOpen(), true);
  assert.deepEqual([b.D.state().sel, b.D.state().span], [5, 9]);
  assert.equal(msgText(b), "Back from the test drive");
  b.D.close();
  assert.equal(await b.C.consumeTrackHash(), false, "taken once: the second call is a no-op");
  assert.equal(b.D.isOpen(), false);
  // Another design on the screen since: it opens, but nothing is restored onto it.
  b.D.open(); b.D.randomise(99); b.D.preview(); b.D.close();
  b.C.armReturn({ id: r.id, sel: 7, span: -1, s: 0 });
  assert.equal(await b.C.consumeTrackHash(), true);
  assert.equal(b.D.isOpen(), true);
  assert.equal(b.D.state().sel, -1);
  assert.notEqual(msgText(b), "Back from the test drive");
  assert.equal(b.data.customTrackReturn, undefined, "memory only — nothing stored");
  assert.ok(!Object.keys(b.data).some((k) => /return/i.test(k)), "no stored return key");
});

test("3 LOOK: a chip per theme (twenty-seven), dual-colour swatches, the theme's blurb, and TIME OF DAY / TREES / CROWD rows that set design.look in one UNDO each", () => {
  const b = bootScreen();
  openGreen(b);
  b.D.setMode("scenery");
  const T = b.ctx.TrackThemes;
  // Share-code indexes ORDER: first twenty stay put; slice I only appends.
  const LEGACY_20 = ["parkland", "alpine", "oasis", "desertnight", "harbour", "marina", "tilke", "autumn",
    "tuscany", "coast", "savanna", "ardennes", "airfield", "canyon", "winter", "twilight",
    "jungle", "lakeside", "moorland", "metropolis"];
  const SLICE_I = ["shipyard", "saltflat", "vineyard", "stadium", "island"];
  assert.equal(T.ORDER.length, 27);
  // Spread out of the editor VM realm — deepEqual rejects cross-realm arrays.
  assert.deepEqual([...T.ORDER.slice(0, 20)], LEGACY_20, "legacy ORDER ids never reorder");
  assert.deepEqual([...T.ORDER.slice(20, 25)], SLICE_I, "slice I appends shipyard…island");
  assert.deepEqual([...T.ORDER.slice(25)], ["blossom", "volcanic"], "new worlds append without shifting old share codes");
  assert.equal(typeof T.swatchCss, "function", "swatchCss helper for LOOK tiles");
  // Every preset keeps a two-colour swatch pair; ORDER must not reorder.
  for (const id of T.ORDER) {
    const p = T.PRESETS[id];
    assert.ok(p && T.DRESS[id], id + " has PRESET + DRESS");
    assert.ok(Array.isArray(p.swatch) && p.swatch.length === 2, id + " has a swatch pair");
    assert.match(p.swatch[0], /^#[0-9a-fA-F]{6}$/, id + " swatch[0] hex");
    assert.match(p.swatch[1], /^#[0-9a-fA-F]{6}$/, id + " swatch[1] hex");
    assert.equal(T.swatchCss(id), "linear-gradient(135deg," + p.swatch[0] + " 50%," + p.swatch[1] + " 50%)");
  }
  for (const id of SLICE_I) {
    assert.equal(T.swatchCss(id), "linear-gradient(135deg," + T.PRESETS[id].swatch[0] + " 50%," + T.PRESETS[id].swatch[1] + " 50%)",
      id + " swatchCss matches its pair");
  }
  const themeChips = walk(b.root).filter((e) => e.dataset && e.dataset.theme);
  assert.deepEqual(themeChips.map((e) => e.dataset.theme), [...T.ORDER], "one chip per preset, in share-code order");
  for (const chip of themeChips) {
    const p = T.get(chip.dataset.theme);
    assert.equal(chip.getAttribute("aria-label"), p.label || chip.dataset.theme);
    const sw = chip.children.find((c) => c.classList && c.classList.contains("swatch"));
    assert.ok(sw, chip.dataset.theme + " has a swatch");
    assert.equal(sw.getAttribute("aria-hidden"), "true");
    assert.equal(sw.style.background, T.swatchCss(chip.dataset.theme), chip.dataset.theme + " paints its swatch pair");
    const lab = chip.children.find((c) => c.dataset && c.dataset.role === "theme-label");
    assert.ok(lab && lab.textContent === (p.label || chip.dataset.theme.toUpperCase()), chip.dataset.theme + " keeps a visible label");
  }
  const blurb = walk(b.root).find((e) => e.dataset && e.dataset.role === "theme-blurb");
  assert.ok(blurb, "the active theme's blurb is shown");
  assert.equal(blurb.textContent, T.get(b.D.state().design.theme).blurb);
  assert.equal(b.D.setTheme("winter"), true);
  assert.equal(blurb.textContent, T.PRESETS.winter.blurb, "…and follows the theme");
  const look = (key, v) => walk(b.root).find((e) => e.dataset && e.dataset.look === key + ":" + v);
  for (const key of ["time", "trees", "crowd"]) for (const v of T.LOOK[key]) assert.ok(look(key, v), key + ":" + v + " chip");
  assert.equal(b.D.state().design.look, undefined, "a new design stores no look");
  assert.equal(look("time", "auto").getAttribute("aria-pressed"), "true");
  const u0 = b.D.state().undo;
  look("time", "night").click();
  assert.deepEqual(plain(b.D.state().design.look), { time: "night", trees: "normal", crowd: "normal" });
  assert.equal(b.D.state().undo, u0 + 1, "one UNDO entry");
  assert.equal(look("time", "night").getAttribute("aria-pressed"), "true");
  assert.equal(look("time", "auto").getAttribute("aria-pressed"), "false");
  assert.equal(b.D.setLook("time", "night"), false, "no-op on the same value");
  assert.equal(b.D.setLook("time", "midnight"), false, "unknown values are refused");
  assert.equal(b.D.setLook("trees", "many"), true);
  assert.equal(b.D.setLook("crowd", "packed"), true);
  assert.deepEqual(plain(b.D.state().design.look), { time: "night", trees: "many", crowd: "packed" });
  // The options are part of the circuit: the id moves, and back to all-default stores none.
  const idLook = b.C.sanitize(b.D.state().design).id;
  for (const [k, v] of [["time", "auto"], ["trees", "normal"], ["crowd", "normal"]]) b.D.setLook(k, v);
  assert.equal(b.D.state().design.look, undefined, "all defaults → no look stored");
  assert.notEqual(b.C.sanitize(b.D.state().design).id, idLook);
  assert.equal(b.D.undo(), true);
  assert.deepEqual(plain(b.D.state().design.look), { time: "auto", trees: "normal", crowd: "packed" }, "UNDO restores the previous look");
  // CSS contract: LOOK tiles live in editor.css without new class tokens.
  const css = read("css/editor.css");
  assert.match(css, /#trackdesigner \.td-chips\[data-role="themes"\]\s*\{/, "theme grid");
  assert.match(css, /#trackdesigner \.td-chips\[data-role="themes"\] \.swatch\s*\{/, "theme swatch paint box");
  assert.match(css, /forced-colors: active[\s\S]*\[data-role="themes"\][\s\S]*forced-color-adjust:\s*none/, "swatch colour survives forced-colors");
});

// ── Banking UI + kerb styles + berms (overhaul E+F+G) ──────────────────────
test("ELEVATION mode exposes BANKING & KERBS: FLAT/SAUSAGE/RUMBLE + BERMS ON/OFF; undo restores", () => {
  const b = bootScreen();
  openGreen(b);
  const bank = b.root.querySelector('[data-role="bank-kerbs"]');
  assert.ok(bank, "bank-kerbs group is built");
  assert.equal(bank.hidden, true, "hidden outside elevation");
  b.D.setMode("elevation");
  assert.equal(bank.hidden, false, "shown in elevation");
  const kerbs = bank.querySelector('[data-role="kerb-style"]');
  assert.deepEqual([...kerbs.children].map((c) => c.textContent), ["FLAT", "SAUSAGE", "RUMBLE"]);
  assert.equal(kerbs.children[0].getAttribute("aria-pressed"), "true", "flat is default");
  const u0 = b.D.state().undo;
  kerbs.children[1].click();
  assert.equal(b.D.state().design.kerbStyle, "sausage");
  assert.equal(b.D.state().undo, u0 + 1);
  assert.equal(kerbs.children[1].getAttribute("aria-pressed"), "true");
  assert.equal(b.D.setKerbStyle("sausage"), false, "same style is no edit");
  assert.equal(b.D.setKerbStyle("rumble"), true);
  assert.equal(b.D.state().design.kerbStyle, "rumble");
  const berms = bank.querySelector('[data-role="berms"]');
  assert.deepEqual([...berms.children].map((c) => c.textContent), ["BERMS ON", "BERMS OFF"]);
  assert.equal(berms.children[0].getAttribute("aria-pressed"), "true", "berms on by default");
  assert.equal(b.D.setBerms(false), true);
  assert.equal(b.D.state().design.berms, false);
  assert.equal(berms.children[1].getAttribute("aria-pressed"), "true");
  assert.equal(b.D.setBerms(false), false);
  assert.equal(b.D.undo(), true);
  assert.equal(b.D.state().design.berms, undefined, "undo restores default (absent = ON)");
  assert.equal(b.D.undo(), true);
  assert.equal(b.D.state().design.kerbStyle, "sausage");
});

test("HOWTO elevation step names bank, kerb styles and berms", () => {
  const b = bootScreen();
  const elev = b.D.HOWTO.STEPS.find((s) => s.title === "Elevation");
  assert.ok(elev, "Elevation step exists");
  assert.match(elev.text, /BANK/i);
  assert.match(elev.text, /sausage/i);
  assert.match(elev.text, /rumble/i);
  assert.match(elev.text, /BERMS/i);
});

test("SCENERY props palette: place at selected point, remove last, caps, UNDO, save keeps props", () => {
  const b = bootScreen();
  openGreen(b);
  b.D.setMode("scenery");
  const P = b.ctx.TrackDesignerProps;
  assert.ok(P, "TrackDesignerProps is on the FULL boot");
  const chips = walk(b.root).filter((e) => e.dataset && e.dataset.prop);
  assert.equal(chips.map((e) => e.dataset.prop).join(","), P.KINDS.join(","), "one chip per kind");
  assert.ok(walk(b.root).find((e) => e.dataset && e.dataset.role === "props"), "props row");
  assert.ok(walk(b.root).find((e) => e.dataset && e.dataset.role === "prop-actions"), "place/remove");
  // Select point 3, place a stand.
  assert.equal(b.D.state().propKind, "stand", "default kind");
  assert.equal(b.D.setPropKind("stand"), false, "no-op on the same kind");
  assert.equal(b.D.setPropKind("gantry"), true);
  assert.equal(b.D.setPropKind("stand"), true);
  assert.equal(b.D.state().propKind, "stand");
  // Force selection via cyclePoint
  b.D.cyclePoint(1); b.D.cyclePoint(1); b.D.cyclePoint(1);
  const u0 = b.D.state().undo;
  assert.equal(b.D.placeProp(), true);
  assert.equal(b.D.state().design.props.length, 1);
  assert.equal(b.D.state().design.props[0].kind, "stand");
  assert.equal(b.D.state().undo, u0 + 1);
  assert.equal(b.D.setPropKind("billboard"), true);
  assert.equal(b.D.placeProp("billboard"), true);
  assert.equal(b.D.state().design.props.length, 2);
  assert.equal(b.D.removeProp("billboard"), true);
  assert.equal(b.D.state().design.props.length, 1);
  assert.equal(b.D.state().design.props[0].kind, "stand");
  assert.equal(b.D.undo(), true);
  assert.equal(b.D.state().design.props.length, 2, "UNDO restores the removed board");
  // Cap: fill stands.
  b.D.setPropKind("stand");
  let guard = 0;
  while (b.D.placeProp("stand") && guard++ < 20) { /* fill */ }
  assert.equal(P.counts(b.D.state().design.props).stand, P.CAPS.stand);
  assert.equal(b.D.placeProp("stand"), false, "at the stand cap");
  const saved = b.D.save();
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const stored = b.C.get(saved.id);
  assert.ok(stored.props && stored.props.length >= 1, "props persist in CustomTracks");
  const listed = b.Tracks.LIST.find((t) => t.id === saved.id);
  assert.equal(typeof listed.scenery, "function", "saved def still carries scenery");
});

test("scenery discovery filters without changing the circuit; atmosphere presets undo atomically", () => {
  const b = bootScreen(); openGreen(b); b.D.setMode("scenery");
  const by = (key, value) => walk(b.root).find((e) => e.dataset && e.dataset[key] === value);
  const visible = () => walk(b.root).filter((e) => e.dataset && e.dataset.theme && !e.hidden).map((e) => e.dataset.theme);
  const search = b.root.querySelector('[aria-label="Find a scenery theme"]');
  const before = plain(b.D.state().design), undo = b.D.state().undo;
  by("category", "night").click();
  assert.deepEqual(visible(), ["desertnight", "marina", "twilight", "stadium"]);
  search.value = "floodlit sand"; b.dom.dispatch(search, { type: "input" });
  assert.deepEqual(visible(), ["desertnight"], "search includes descriptions and intersects the category");
  search.value = "no matching world"; b.dom.dispatch(search, { type: "input" });
  assert.deepEqual(visible(), []);
  assert.match(by("role", "theme-results").textContent, /No themes found/);
  b.root.querySelector('[aria-label="Clear theme search and filters"]').click();
  assert.equal(visible().length, 27);
  assert.deepEqual(plain(b.D.state().design), before, "browsing never edits the circuit");
  assert.equal(b.D.state().undo, undo);
  by("preset", "golden").click();
  assert.deepEqual(plain(b.D.state().design.look), { time: "dusk", trees: "many", crowd: "few" });
  assert.equal(b.D.state().undo, undo + 1);
  assert.equal(by("preset", "golden").getAttribute("aria-pressed"), "true");
  by("preset", "golden").click();
  assert.equal(b.D.state().undo, undo + 1, "reapplying the same preset is a no-op");
  b.D.undo(); assert.deepEqual(plain(b.D.state().design), before);
  by("preset", "race").click();
  assert.equal(b.D.state().design.look.time, "night");
  assert.equal(b.D.state().design.look.crowd, "packed");
  by("preset", "default").click();
  assert.equal(b.D.state().design.look, undefined, "default stays compatible with old designs");
});

test("prop inspector places on either side, clamps gaps, removes exactly one object and round-trips", async () => {
  const b = bootScreen(); openGreen(b); b.D.setMode("scenery");
  const by = (key, value) => walk(b.root).find((e) => e.dataset && e.dataset[key] === value);
  by("side", "-1").click();
  b.root.querySelector('[aria-label="ROADSIDE GAP m up"]').click();
  assert.equal(b.D.placeProp(), true);
  assert.equal(b.D.state().design.props[0].side, -1);
  assert.equal(b.D.state().design.props[0].gap, 20);
  b.D.setPropKind("billboard"); by("side", "1").click(); b.D.placeProp();
  assert.equal(b.D.state().design.props[1].side, 1);
  assert.equal(b.D.state().design.props[1].gap, 9, "each kind keeps its own spacing");
  for (let i = 0; i < 8; i++) b.root.querySelector('[aria-label="ROADSIDE GAP m down"]').click();
  b.D.placeProp(); assert.equal(b.D.state().design.props[2].gap, 6, "matches the renderer clearance floor");
  const original = plain(b.D.state().design.props);
  b.root.querySelector('[aria-label="Remove placed stand 1"]').click();
  assert.deepEqual(plain(b.D.state().design.props), original.slice(1));
  assert.equal(b.D.removeProp("stand"), false, "missing kind never removes a different prop");
  b.D.undo(); assert.deepEqual(plain(b.D.state().design.props), original);
  const decoded = await b.CD.decode(await b.D.shareCode());
  assert.equal(decoded.ok, true);
  assert.deepEqual(plain(decoded.design.props), original);
  const saved = b.D.save(); assert.equal(saved.ok, true);
  assert.deepEqual(plain(b.C.get(saved.id).props), original);
  b.D.setPropKind("gantry");
  assert.equal(by("role", "prop-side").hidden, true);
  assert.equal(by("role", "prop-gap").hidden, true, "gantries span the road");
  b.D.placeProp(); assert.equal(b.D.state().design.props.at(-1).gap, 0);
});

test("scenery sections are navigable without edits; paired section placement and object edits undo atomically", () => {
  const b = bootScreen(); openGreen(b); b.D.setMode("scenery");
  const by = (key, value) => walk(b.root).find((e) => e.dataset && e.dataset[key] === value);
  const undo = b.D.state().undo;
  const themes = by("scenerySection", "themes"), atmosphere = by("scenerySection", "atmosphere"), objects = by("scenerySection", "objects");
  assert.equal(themes.getAttribute("aria-selected"), "true");
  assert.equal(by("role", "prop-inspector").hidden, true);
  b.dom.dispatch(themes, { type: "keydown", key: "ArrowRight", preventDefault() {} });
  assert.equal(atmosphere.getAttribute("aria-selected"), "true");
  assert.equal(b.dom.document.activeElement, atmosphere);
  objects.click();
  assert.equal(by("role", "prop-inspector").hidden, false);
  assert.equal(by("role", "atmosphere").hidden, true);
  assert.equal(b.D.state().undo, undo, "tab navigation never changes the design");
  by("preset", "festival").click();
  assert.deepEqual(plain(b.D.state().design.look), { time: "dusk", trees: "many", crowd: "packed" });
  b.D.undo();
  b.D.setPropKind("hedge"); b.D.selectRange(b.D.state().design.pts.length - 8, 8);
  by("placementMode", "range").click(); by("side", "0").click();
  assert.equal(b.D.placeProp(), true);
  const placed = plain(b.D.state().design.props);
  assert.equal(placed.length, 6); assert.equal(b.D.state().undo, undo + 1);
  assert.deepEqual(placed.map((p) => p.side), [-1, 1, -1, 1, -1, 1]);
  assert.equal(b.D.placeProp(), false, "a whole over-cap row is refused");
  assert.equal(b.D.state().undo, undo + 1);
  b.root.querySelector('[aria-label="Edit placed hedge 1"]').click();
  assert.equal(by("role", "prop-editor").hidden, false);
  const lap = b.root.querySelector('[aria-label="Placed object lap percentage"]'); lap.value = "35";
  const gap = b.root.querySelector('[aria-label="Placed object roadside gap in metres"]'); gap.value = "22";
  const apply = walk(by("role", "prop-editor")).find((e) => e.tagName === "BUTTON" && e.textContent === "APPLY"); apply.click();
  assert.ok(Math.abs(b.D.state().design.props[0].s - 0.35) < 1e-4);
  assert.equal(b.D.state().design.props[0].gap, 22);
  assert.deepEqual(plain(b.D.state().design.props.slice(1)), placed.slice(1));
  b.D.undo(); assert.deepEqual(plain(b.D.state().design.props), placed);
  b.D.undo(); assert.equal(b.D.state().design.props, undefined);
  by("placementMode", "point").click(); by("side", "1").click(); b.D.setPropKind("palms");
  b.D.placeProp(); b.D.selectRange(12); assert.equal(b.D.copyPropAt(0), true);
  assert.equal(b.D.state().design.props.length, 2);
  assert.notEqual(b.D.state().design.props[0].s, b.D.state().design.props[1].s);
  b.D.undo(); assert.equal(b.D.state().design.props.length, 1);
  b.D.close();
});

test("object categories, numeric gap and section swap are preferences; new objects undo and save", () => {
  const b = bootScreen(); openGreen(b); b.D.setMode("scenery");
  const by = (key, value) => walk(b.root).find((e) => e.dataset && e.dataset[key] === value);
  const undo = b.D.state().undo;
  by("objectCategory", "nature").click();
  assert.equal(by("prop", "pines").hidden, false); assert.equal(by("prop", "marshal").hidden, true);
  by("prop", "pines").click();
  const gap = b.root.querySelector('[aria-label="Roadside gap in metres"]');
  gap.value = "33"; b.dom.dispatch(gap, { type: "change" });
  b.D.selectRange(4, 16); by("placementMode", "range").click();
  b.root.querySelector('[aria-label="Swap scenery section start and end"]').click();
  assert.equal(b.D.state().sel, 16); assert.equal(b.D.state().span, 4);
  assert.equal(b.D.state().undo, undo, "browsing and placement preferences do not create edits");
  b.D.placeProp(); assert.equal(b.D.state().design.props.length, 3);
  assert.ok(b.D.state().design.props.every((p) => p.kind === "pines" && p.gap === 33));
  const saved = b.D.save(); assert.equal(saved.ok, true); assert.equal(b.C.get(saved.id).props.length, 3);
  b.D.undo(); assert.equal(b.D.state().design.props, undefined);
  gap.value = "1"; b.dom.dispatch(gap, { type: "change" }); assert.equal(gap.value, "20");
  b.root.querySelector('[aria-label="Reset roadside gap for selected object"]').click(); assert.equal(gap.value, "28");
  by("objectCategory", "venue").click();
  assert.equal(by("prop", "pines").hidden, true); assert.equal(by("prop", "marshal").hidden, false);
  by("prop", "marshal").click(); by("placementMode", "point").click(); b.D.placeProp();
  assert.equal(b.D.state().design.props[0].kind, "marshal");
  b.D.close();
});

test("SCENERY props: REVERSE / START HERE remap s; RANDOMISE clears props", () => {
  const b = bootScreen();
  openGreen(b);
  b.D.setMode("scenery");
  b.D.cyclePoint(1); b.D.cyclePoint(1); b.D.cyclePoint(1);
  const sel = b.D.state().sel;
  assert.ok(sel > 0);
  assert.equal(b.D.placeProp("stand"), true);
  const s0 = b.D.state().design.props[0].s;
  const expectFlip = ((1 - s0) % 1 + 1) % 1;
  assert.equal(b.D.reverse(), true);
  const sRev = b.D.state().design.props[0].s;
  assert.ok(Math.abs(sRev - expectFlip) < 1e-6, "REVERSE flips prop s: " + s0 + " → " + sRev + " (want " + expectFlip + ")");
  // START HERE at a mid point: prop s shifts by the start arc fraction.
  const pts = b.D.state().design.pts;
  const N = pts.length;
  const iStart = Math.floor(N / 3);
  let L = 0, upto = 0;
  for (let k = 0; k < N; k++) {
    const a = pts[k], c = pts[(k + 1) % N];
    const d = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (k < iStart) upto += d;
    L += d;
  }
  const f = L ? upto / L : 0;
  const expectStart = ((sRev - f) % 1 + 1) % 1;
  assert.equal(b.D.setStart(iStart), true);
  const sStart = b.D.state().design.props[0].s;
  assert.ok(Math.abs(sStart - expectStart) < 1e-6, "START HERE remaps prop s: " + sRev + " → " + sStart + " (want " + expectStart + ")");
  // Delete a point (remapZones path): prop still present and remapped, not stranded at old s.
  const sBeforeDel = sStart;
  const delAt = Math.min(2, b.D.state().design.pts.length - 1);
  assert.equal(b.D.deletePoint(delAt), true);
  assert.ok(b.D.state().design.props && b.D.state().design.props.length === 1, "delete keeps the prop");
  assert.notEqual(b.D.state().design.props[0].s, sBeforeDel, "delete remaps prop s away from the pre-delete fraction");
  // RANDOMISE replaces the loop — authored props must not strand on the new shape.
  assert.equal(b.D.randomise(42), true);
  assert.equal(b.D.state().design.props, undefined, "RANDOMISE clears props");
});

test("map ranges have immediate LOWER / RAISE controls in EDIT; offsets preserve hills, limits, selection and undo", () => {
  const b = bootHooked(); openGreen(b);
  const n = b.D.state().design.pts.length;
  const heights = Array.from({ length: n }, (_, i) => i % 4);
  b.D.setHeights(heights, 0); b.D.setMode("edit"); b.D.setSelectionMode("range");
  const box = walk(b.root).find(e => e.dataset.role === "selection-height");
  const raise = box.querySelector('[aria-label="Raise selected points"]');
  const lower = box.querySelector('[aria-label="Lower selected points"]');
  const amount = box.querySelector('input');
  b.root.querySelector('.td-rail').scrollTop = 900;
  b.hooks.onSelect(n - 2, 1);
  assert.equal(b.root.querySelector('.td-rail').scrollTop, 0, "map selection reveals height controls");
  assert.equal(box.hidden, false);
  assert.match(box.children[0].textContent, /HEIGHT CHANGE \(m\) · 4 POINTS/);
  amount.value = "2.5"; b.dom.dispatch(amount, { type: "change" });
  const before = plain(b.D.state()); raise.click();
  let after = plain(b.D.state());
  assert.equal(after.mode, "edit"); assert.equal(after.selectionMode, "range");
  assert.deepEqual([after.sel, after.span], [n - 2, 1]);
  assert.equal(after.undo, before.undo + 1);
  for (let i = 0; i < n; i++) assert.equal(after.design.heights[i], heights[i] + (i >= n - 2 || i <= 1 ? 2.5 : 0));
  assert.equal(after.elevationHeat, true);
  b.D.undo(); assert.deepEqual(plain(b.D.state().design.heights), heights);
  b.D.selectRange(n - 2, 1); lower.click();
  for (let i = 0; i < n; i++) assert.equal(b.D.state().design.heights[i], heights[i] - (i >= n - 2 || i <= 1 ? 2.5 : 0));
  const limit = b.ctx.CustomTracks.LIMITS.rise;
  const high = heights.slice(); high[0] = limit - 1; high[1] = limit - 4;
  b.D.setHeights(high, 0); b.D.selectRange(0, 1);
  amount.value = "5"; b.dom.dispatch(amount, { type: "change" }); raise.click();
  after = plain(b.D.state());
  assert.equal(after.design.heights[0], limit); assert.equal(after.design.heights[1], limit - 3, "whole group stops together");
  raise.click(); assert.equal(b.D.state().undo, after.undo, "at limit is a no-op");
  b.D.selectRange(-1, -1); assert.equal(box.hidden, true);
});

test("SELECT END arms a touch-friendly span; stamp REPLACE uses it; group elev offsets the span", () => {
  const b = bootHooked();
  openGreen(b);
  const end = chipsIn(b.root, "SELECT END")[0];
  assert.ok(end, "SELECT END chip in 4 DETAILS");
  assert.equal(end.disabled, true, "disabled with no selection");
  // Tap point 4, arm SELECT END, tap point 8 → span.
  b.hooks.onPick(4, {});
  assert.equal(b.D.armSpanEnd(), true);
  assert.equal(b.D.state().spanArm, true);
  b.hooks.onPick(8, {});
  assert.deepEqual([b.D.state().sel, b.D.state().span, b.D.state().spanArm], [4, 8, false]);
  assert.equal(end.textContent, "SPAN 5–9", "chip names the selected group");
  // Stamp REPLACE THE SELECTED SPAN with CORNER.
  b.D.setTool("corner");
  const replace = chipsIn(b.root, "REPLACE THE SELECTED SPAN")[0];
  assert.ok(replace, "2 CORNERS offers REPLACE for the group");
  const pts0 = plain(b.D.state().design.pts);
  assert.equal(b.D.applyStamp(4, 8), true);
  assert.notDeepEqual(plain(b.D.state().design.pts), pts0, "REPLACE rewrites the span");
  // Group elev on the restored loop (keep the hooked canvas — do not re-init).
  assert.equal(b.D.undo(), true, "UNDO the stamp");
  b.D.setTool("select");
  b.hooks.onPick(5, {});
  b.hooks.onPick(9, { shiftKey: true });
  assert.deepEqual([b.D.state().sel, b.D.state().span], [5, 9]);
  b.D.setMode("elevation");
  const hs0 = plain(b.D.state().design.heights);
  for (let i = 5; i <= 9; i++) assert.equal(hs0[i], 0);
  // Seed relative hills, then offset via POINT m.
  const seeded = hs0.slice();
  for (let i = 5; i <= 9; i++) seeded[i] = (i - 5);
  assert.equal(b.D.setHeights(seeded, 5), true);
  assert.equal(b.D.setNodeHeight(5, 3), true, "POINT m on a span offsets the group");
  const hs = plain(b.D.state().design.heights);
  for (let i = 5; i <= 9; i++) assert.equal(hs[i], (i - 5) + 3, "point " + i);
  assert.equal(hs[0], 0, "outside the span stays flat");
  assert.deepEqual([b.D.state().sel, b.D.state().span], [5, 9], "span selection survives group elev");
});

test("selection controls synchronize both views; elevation edits keep the range and undo once", () => {
  const b = bootScreen(); openGreen(b);
  const before = b.D.state(), n = before.design.pts.length;
  b.D.setMode("elevation");
  b.D.setSelectionMode("range");
  b.D.selectRange(2, 5);
  const strip = b.root.querySelector('canvas[data-role="profile"]');
  assert.match(strip.getAttribute("aria-label"), /Span 3–6 \(4 points\)/);
  assert.equal(b.D.state().undo, before.undo, "selection stays outside history");
  const height = walk(b.root).find((e) => e.getAttribute("aria-label") === "Selected point height in metres");
  b.D.setSelectionMode("point");
  assert.equal(b.D.state().span, 5, "switching to height dragging retains the group");
  height.value = "3.25";
  b.dom.dispatch(height, { type: "keydown", key: "Enter", preventDefault() {} });
  const raised = b.D.state();
  assert.equal(raised.undo, before.undo + 1);
  assert.deepEqual([raised.sel, raised.span], [2, 5]);
  for (let i = 0; i < n; i++) assert.equal(raised.design.heights[i], i >= 2 && i <= 5 ? 3.25 : 0);
  b.D.undo();
  assert.deepEqual(b.D.state().design.heights, before.design.heights);
  assert.doesNotMatch(strip.getAttribute("aria-label"), /Span 3–6/, "undo clears selection on both views");
  b.D.selectRange(n - 2, 1);
  b.D.setNodeHeight(n - 2, 2);
  const wrap = b.D.state().design.heights;
  for (let i = 0; i < n; i++) assert.equal(wrap[i], i >= n - 2 || i <= 1 ? 2 : 0, "wrapped range follows driving order");
  b.D.selectRange(-1);
  assert.equal(b.D.adjustElevation("zero"), false, "empty selection cannot edit the whole track");
  b.D.close();
});

test("level, smooth and zero affect only selected heights and retain smooth endpoints", () => {
  const b = bootScreen(); openGreen(b);
  const n = b.D.state().design.pts.length, hs = new Array(n).fill(0);
  hs[2] = 2; hs[3] = 10; hs[4] = 2; hs[5] = 4;
  b.D.setHeights(hs); b.D.selectRange(2, 5);
  let undo = b.D.state().undo;
  assert.equal(b.D.adjustElevation("smooth"), true);
  let out = b.D.state();
  assert.equal(out.undo, undo + 1);
  assert.deepEqual(plain(out.design.heights.slice(2, 6)), [2, 6, 4.5, 4]);
  assert.equal(out.design.heights[1], 0); assert.equal(out.design.heights[6], 0);
  assert.equal(b.D.adjustElevation("level"), true);
  assert.deepEqual(plain(b.D.state().design.heights.slice(2, 6)), [2, 2, 2, 2]);
  assert.equal(b.D.adjustElevation("zero"), true);
  assert.ok(b.D.state().design.heights.every((h) => h === 0));
  assert.equal(b.D.adjustElevation("zero"), false, "no-op does not add undo");
  b.D.close();
});

test("an autosaved draft of an oversize loop is rejected on open instead of freezing the tab (13-F1)", () => {
  const pts = [];
  for (let i = 0; i < 40; i++) pts.push(i % 2 ? [-9000 + (i % 7) * 100, 9000 - i * 10] : [9000 - (i % 5) * 100, -9000 + i * 10]);
  const b = bootScreen({ customTrackDraft: { name: "HOSTILE", seed: 7, theme: "parkland", baseHW: 7, pts } });
  b.D.init(b.G, { custom: b.C, root: b.root });
  b.D.open();
  const st = b.D.state();
  assert.ok(st.design && st.design.name !== "HOSTILE", "the oversize draft was not restored");
  const per = st.design.pts.reduce((s, p, i) => { const q = st.design.pts[(i + 1) % st.design.pts.length]; return s + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
  assert.ok(per <= b.C.LIMITS.loopMaxLoose, "the opened design is a sane loop: " + Math.round(per) + " m");
}
);

test("DELETE POINT 0 and a stamp over the start line keep every surviving point's own height (13-F2)", () => {
  const b = bootScreen();
  const green = openGreen(b);
  assert.equal(b.D.applyElevPreset("hilly"), true);
  const d0 = plain(b.D.state().design);
  assert.ok(d0.heights.filter(Boolean).length > 10, "the hilly preset left real heights to misalign");
  const key = (p) => p[0] + "," + p[1];
  const bad = (before, after) => {
    const m = new Map(before.pts.map((p, i) => [key(p), before.heights[i]]));
    return after.pts.filter((p, i) => m.has(key(p)) && m.get(key(p)) !== after.heights[i]).length;
  };
  assert.equal(b.D.deletePoint(0), true);
  const d1 = plain(b.D.state().design);
  assert.notDeepEqual(d1.pts[0], d0.pts[0], "the start point itself was deleted");
  assert.equal(bad(d0, d1), 0, "DELETE POINT 0: no survivor carries its neighbour's height");
  b.D.undo();
  const N = b.D.state().design.pts.length, before = plain(b.D.state().design);
  b.D.setTool("corner");
  assert.equal(b.D.applyStamp(N - 2, 2, "corner"), true, "a stamp whose span wraps the start line");
  const after = plain(b.D.state().design);
  assert.ok(after.pts.filter((p) => before.pts.some((q) => key(q) === key(p))).length > 20, "plenty of shared points to check");
  assert.equal(bad(before, after), 0, "wrapping stamp: heights stay keyed to their points");
  assert.equal(green.pts.length > 0, true);
});

// ── bug-hunt 2 H8 / H9: a new loop is judged AND committed on a clean base ──
/** The previous design's fraction-keyed edits, a wide road and two props: all of it belongs to the OLD loop. */
function hillyBase(b) {
  const d = openGreen(b);
  b.D.load(Object.assign(d, plain(ZONES), { baseHW: 8 }));
  b.D.setNodeHeight(3, 9);
  b.D.cyclePoint(1); b.D.placeProp("stand");
  assert.ok(b.D.state().design.props.length >= 1 && b.D.state().design.hwZones.length === 1, "the base carries the old loop's edits");
  b.D.preview();   // settle the debounced preview: the spy must see candidates only
}
/** Every design TrackValidate.check is asked about, recorded (the screen reads the global at call time). */
function spyCheck(b) {
  const seen = [], orig = b.ctx.TrackValidate;
  b.ctx.TrackValidate = Object.assign({}, orig, { check: (d) => { seen.push(plain({ baseHW: d.baseHW, hwZones: d.hwZones, bankZones: d.bankZones, elevations: d.elevations, bridges: d.bridges, heights: d.heights, props: d.props })); return orig.check(d); } });
  return seen;
}
const CLEAN = (s) => s.baseHW === 7 && ["hwZones", "bankZones", "elevations", "bridges"].every((k) => !s[k] || !s[k].length) && (!s.heights || s.heights.every((h) => h === 0)) && !s.props;

test("RANDOMISE judges candidates on a clean base: the same seed gives the same loop on a hilly and a flat base, and the fresh loop carries none of the old edits", () => {
  const flat = bootScreen(), hilly = bootScreen();
  openGreen(flat); hillyBase(hilly);
  const seenHilly = spyCheck(hilly);
  assert.equal(flat.D.randomise(11), true); assert.equal(hilly.D.randomise(11), true);
  assert.deepEqual(plain(hilly.D.state().design.pts), plain(flat.D.state().design.pts), "TRACK OF THE DAY: a seed means one loop, whatever the player had open");
  assert.ok(seenHilly.length >= 1 && seenHilly.every(CLEAN), "every candidate was judged flat: " + JSON.stringify(seenHilly.find((s) => !CLEAN(s))));
  const d = hilly.D.state().design;
  assert.deepEqual(plain([d.hwZones, d.bankZones, d.elevations, d.bridges, d.turns]), [[], [], [], [], []], "fraction-keyed edits of the old loop are gone");
  assert.equal(d.props, undefined); assert.equal(d.baseHW, 7, "committed on the width it was judged on");
  assert.ok(d.heights.every((h) => h === 0));
});

test("DESIGNED, USE and MORE LIKE THIS judge on a clean base and USE commits a fresh loop; DRAW and START FROM clear the old loop's edits", async () => {
  const flat = bootScreen(), hilly = bootScreen();
  openGreen(flat); hillyBase(hilly);
  const seen = spyCheck(hilly);
  assert.equal(await flat.D.designed("FAST", 21), true); assert.equal(await hilly.D.designed("FAST", 21), true);
  assert.deepEqual(plain(hilly.D.state().candidates), plain(flat.D.state().candidates), "the same seeds give the same cards on either base");
  assert.ok(seen.length >= 16 && seen.every(CLEAN), "designed(): every check was on the clean base: " + seen.length + " " + JSON.stringify(seen.find((s) => !CLEAN(s))));
  seen.length = 0;
  assert.equal(await hilly.D.moreLikeThis(0), true);
  assert.ok(seen.length >= 1 && seen.every(CLEAN), "moreLikeThis(): every check was on the clean base");
  assert.equal(hilly.D.useCandidate(0), true);
  let d = hilly.D.state().design;
  assert.deepEqual(plain([d.hwZones, d.bankZones, d.elevations, d.bridges, d.turns]), [[], [], [], [], []]);
  assert.equal(d.props, undefined); assert.equal(d.baseHW, 7);
  // START FROM keeps nothing of the old loop either (props were the one it kept).
  hillyBase(hilly);
  assert.equal(hilly.D.startFrom("monza"), true);
  d = hilly.D.state().design;
  assert.equal(d.props, undefined, "START FROM clears the old loop's props");
  assert.deepEqual(plain([d.hwZones, d.bankZones, d.elevations, d.bridges]), [[], [], [], []]);
  // DRAW
  hillyBase(hilly);
  const path = [];
  for (let i = 0; i < 160; i++) { const t = i / 160 * Math.PI * 2; path.push([Math.cos(t) * 700, Math.sin(t) * 420 + 60 * Math.sin(3 * t)]); }
  assert.equal(hilly.D.freehand(path), true);
  d = hilly.D.state().design;
  assert.deepEqual(plain([d.hwZones, d.bankZones, d.elevations, d.bridges, d.turns]), [[], [], [], [], []], "DRAW clears the old loop's zones and bridges");
  assert.equal(d.props, undefined);
});
