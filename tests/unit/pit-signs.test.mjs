// Pit bay signs: each team's identity on the OUTSIDE of its garage.
//
// The row of twelve bays told them apart by the lintel's colour alone.
// SceneryPits now lays out one fascia quad per bay (track.pitSigns — pure
// numbers, VM-safe) and PitSigns paints one atlas of twelve cells (crest,
// code, name) that game.js draws as ONE decal after the sky. Nothing touches
// the props buffer, and every canvas/GPU step is feature-detected, so the
// headless builds see only the quads. docs/research/PIT-BAY-LOGOS-PLAN-2026-09.md.
//
// Pure Node: tools/lib/track-build-vm.cjs runs the real track build.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools", "lib", "track-build-vm.cjs"));
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");

const FULL = "silverstone", CORRIDOR = "albert_park", LEFT = "bahrain", STREET = "monaco";
const ctxOnce = (() => { let c = null; return () => (c || (c = buildContext())); })();

/** Build a def and RELEASE the VM's primitive capture.
 *
 * track-build-vm records every primitive of every build, and each record holds
 * a reference to the whole mesh buffer its emitter wrote into — not a copy of
 * its own slice — so one shared context accumulates every circuit's full
 * geometry with nothing able to reclaim it (the measurement is in that file's
 * `trim` comment: 4157 MB vs 97 MB). This suite reads `t.pit` and `t.pitSigns`
 * and never a primitive, so it keeps none of it. Measured on this tree: the
 * fleet test below peaked at 5563 MB for the file, past the 4088 MB that has
 * already OOM-killed a sweep's audit child (ci.yml's prop-clipping note). */
function built(def) {
  const t = ctxOnce().Tracks.build(def);
  ctxOnce().trim(0);
  return ctxOnce().release(t);
}
const buildOnce = (() => {
  const seen = new Map();
  return (id) => {
    if (!seen.has(id)) { const T = ctxOnce().Tracks; seen.set(id, built(T.LIST.find((d) => d.id === id))); }
    return seen.get(id);
  };
})();
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

test("every built complex lays out twelve fascia quads, one per bay, in row order, on the lintel", () => {
  const S = ctxOnce().TrackPit.SIGN;
  for (const id of [FULL, CORRIDOR, LEFT]) {
    const t = buildOnce(id), p = t.pit, q = t.pitSigns, sd = p.side;
    assert.ok(q, `${id}: track.pitSigns`);
    assert.equal(q.cells.length, S.cells, `${id}: one cell per bay`);
    // …plus the BOARDS (TrackPit.SIGN.boards): two "PIT ENTRY" on the
    // approach and one "PIT LANE" at the entry line, each a quad on the same
    // atlas after the twelve fascias, each an anchor for the distance gate.
    // …and the PANELS: each bay's crest cell again on the pit wall opposite
    // it, after the boards.
    // …and the CRESTS: the crest alone, a square plaque on each door's
    // approach-side pier, last in the quad order.
    const nq = S.cells + q.boards.length + q.panels.length + q.crests.length;
    assert.ok(q.boards.length >= 1 && q.boards.length <= 3, `${id}: ${q.boards.length} boards`);
    assert.equal(q.panels.length, 2 * S.cells, `${id}: a crest panel on the wall opposite every bay, read from both sides`);
    assert.equal(q.crests.length, S.crests, `${id}: a crest plaque on every bay's pier`);
    for (let b = 0; b < q.crests.length; b++) {
      const i = S.cells + q.boards.length + q.panels.length + b, k = q.crests[b].k, box = p.row.boxes[b];
      assert.equal(q.crests[b].cell, b, `${id}: crest ${b} is not bay ${b}'s cell`);
      const n = [q.nrm[i * 12], q.nrm[i * 12 + 1], q.nrm[i * 12 + 2]];
      assert.ok(dot(n, [-sd * t.rx[k], 0, -sd * t.rz[k]]) > 0.99, `${id}: crest ${b} faces away from the lane`);
      const P = [0, 1, 2, 3].map((c) => [q.pos[(i * 4 + c) * 3], q.pos[(i * 4 + c) * 3 + 1], q.pos[(i * 4 + c) * 3 + 2]]);
      const c = [0, 1, 2].map((a) => (P[0][a] + P[1][a] + P[2][a] + P[3][a]) / 4);
      const lat = ((c[0] - t.px[k]) * t.rx[k] + (c[2] - t.pz[k]) * t.rz[k]) * sd - t.hw[k];
      assert.ok(Math.abs(lat - (p.off.workOut - 0.265)) < 0.12, `${id}: crest ${b} at ${lat.toFixed(2)} m, the pier's face is at ${(p.off.workOut - 0.265).toFixed(3)}`);
      // On the pier the driver reaches first: behind the bay's centre along
      // the tangent, at the pier's middle. Measured from the BAY (box.s),
      // which sits up to half a node from node k.
      let off = box.s - k * (t.total / t.n);
      off -= Math.round(off / t.total) * t.total;   // a bay at the lap seam: node 0 is at s = 0, the bay just under L
      const along = (c[0] - t.px[k]) * t.tx[k] + (c[2] - t.pz[k]) * t.tz[k] - off;
      const pier = (p.bay.w - p.bay.doorW) / 2;
      assert.ok(Math.abs(-along - (p.bay.w / 2 - pier / 2)) < 0.3,
        `${id}: crest ${b} ${along.toFixed(2)} m along the bay, the pier's middle is at ${(-(p.bay.w / 2 - pier / 2)).toFixed(2)}`);
      for (const v of P) {
        const hh = v[1] - t.py[k];
        assert.ok(hh > S.crestY0 - 0.25 && hh < S.crestY0 + S.crestW + 0.25, `${id}: crest ${b} corner ${hh.toFixed(2)} m up`);
      }
      assert.ok(Math.abs(len(sub(P[1], P[0])) - S.crestW) < 0.01 && Math.abs(len(sub(P[3], P[0])) - S.crestW) < 0.01, `${id}: crest ${b} is not ${S.crestW} m square`);
      assert.ok(dot(cross(sub(P[1], P[0]), sub(P[3], P[0])), n) > 0, `${id}: crest ${b} is mirrored`);
      const cx = (b % S.crestCols) * S.crestPx, cy = S.crestY + Math.floor(b / S.crestCols) * S.crestPx;
      assert.ok(cy + S.crestPx <= S.h, `${id}: crest cell ${b} is off the atlas`);
      for (let c2 = 0; c2 < 4; c2++) {
        const u = q.uv[(i * 4 + c2) * 2], v = q.uv[(i * 4 + c2) * 2 + 1];
        assert.ok(u >= cx / S.w - 1e-9 && u <= (cx + S.crestPx) / S.w + 1e-9, `${id}: crest ${b} u ${u}`);
        assert.ok(v >= 1 - (cy + S.crestPx) / S.h - 1e-9 && v <= 1 - cy / S.h + 1e-9, `${id}: crest ${b} v ${v}`);
      }
      void box;
    }
    assert.equal(q.pos.length / 3, nq * 4);
    assert.equal(q.idx.length, nq * 6);
    assert.equal(q.uv.length, nq * 8);
    assert.equal(q.anchors.length, q.boards.length);
    for (let b = 0; b < q.panels.length; b++) {
      const i = S.cells + q.boards.length + b, k = q.panels[b].k;
      assert.equal(q.panels[b].cell, b >> 1, `${id}: panel ${b} is not bay ${b >> 1}'s cell`);
      // Two per bay in order: the LANE face, then the TRACK face.
      const face = q.panels[b].face, fs = face === "lane" ? 1 : -1;
      assert.equal(face, (b & 1) ? "track" : "lane", `${id}: panel ${b} face ${face}`);
      const n = [q.nrm[i * 12], q.nrm[i * 12 + 1], q.nrm[i * 12 + 2]];
      // The lane face looks away from the track, the track face toward it,
      // both from the top of the pit wall.
      assert.ok(dot(n, [fs * sd * t.rx[k], 0, fs * sd * t.rz[k]]) > 0.99, `${id}: panel ${b} does not face the ${face}`);
      const P = [0, 1, 2, 3].map((c) => [q.pos[(i * 4 + c) * 3], q.pos[(i * 4 + c) * 3 + 1], q.pos[(i * 4 + c) * 3 + 2]]);
      const c = [0, 1, 2].map((a) => (P[0][a] + P[1][a] + P[2][a] + P[3][a]) / 4);
      const lat = ((c[0] - t.px[k]) * t.rx[k] + (c[2] - t.pz[k]) * t.rz[k]) * sd - t.hw[k];
      assert.ok(Math.abs(lat - (p.bands.verge + 0.125)) < 0.12, `${id}: panel ${b} at ${lat.toFixed(2)} m, the wall is at ${(p.bands.verge + 0.125).toFixed(3)}`);
      for (const v of P) {
        const hh = v[1] - t.py[k];
        assert.ok(hh > 1.35 && hh < 2.0, `${id}: panel ${b} corner ${hh.toFixed(2)} m up, the wall top is 1.42`);
      }
      assert.ok(dot(cross(sub(P[1], P[0]), sub(P[3], P[0])), n) > 0, `${id}: panel ${b} is mirrored`);
      const cx = ((b >> 1) % S.cols) * S.cellW, cy = Math.floor((b >> 1) / S.cols) * S.cellH;
      for (let c2 = 0; c2 < 4; c2++) {
        const u = q.uv[(i * 4 + c2) * 2], v = q.uv[(i * 4 + c2) * 2 + 1];
        assert.ok(u >= cx / S.w - 1e-9 && u <= (cx + S.cellW) / S.w + 1e-9, `${id}: panel ${b} u ${u}`);
        assert.ok(v >= 1 - (cy + S.cellH) / S.h - 1e-9 && v <= 1 - cy / S.h + 1e-9, `${id}: panel ${b} v ${v}`);
      }
    }
    assert.ok(Array.isArray(q.centre) && q.centre.length === 3, `${id}: a centre for the distance gate`);
    for (let b = 0; b < q.boards.length; b++) {
      const i = S.cells + b, k = q.boards[b].k;
      assert.ok(q.boards[b].cell === S.cells || q.boards[b].cell === S.cells + 1, `${id}: board ${b} cell ${q.boards[b].cell}`);
      const n = [q.nrm[i * 12], q.nrm[i * 12 + 1], q.nrm[i * 12 + 2]];
      // Faces the oncoming driver: against the road's tangent.
      assert.ok(dot(n, [-t.tx[k], -t.ty[k], -t.tz[k]]) > 0.99, `${id}: board ${b} does not face the driver`);
      const P = [0, 1, 2, 3].map((c) => [q.pos[(i * 4 + c) * 3], q.pos[(i * 4 + c) * 3 + 1], q.pos[(i * 4 + c) * 3 + 2]]);
      assert.ok(Math.abs(len(sub(P[1], P[0])) - S.boardW) < 0.01, `${id}: board ${b} width`);
      assert.ok(Math.abs(len(sub(P[3], P[0])) - S.boardH) < 0.01, `${id}: board ${b} height`);
      assert.ok(dot(cross(sub(P[1], P[0]), sub(P[3], P[0])), n) > 0, `${id}: board ${b} is mirrored`);
      // Its row of the atlas: the seventh, under the fascias.
      const cy = Math.floor(q.boards[b].cell / S.cols) * S.cellH;
      assert.ok(cy + S.cellH <= S.h, `${id}: board cell ${q.boards[b].cell} is off the atlas`);
      for (let c2 = 0; c2 < 4; c2++) {
        const v = q.uv[(i * 4 + c2) * 2 + 1];
        assert.ok(v >= 1 - (cy + S.cellH) / S.h - 1e-9 && v <= 1 - cy / S.h + 1e-9, `${id}: board ${b} v ${v}`);
      }
    }
    for (let i = 0; i < S.cells; i++) {
      const box = p.row.boxes[i], k = box.k;
      assert.equal(q.cells[i].team, box.team, `${id}: cell ${i} is not bay ${i}'s team`);
      assert.equal(q.cells[i].i, i);
      const P = [0, 1, 2, 3].map((c) => [q.pos[(i * 4 + c) * 3], q.pos[(i * 4 + c) * 3 + 1], q.pos[(i * 4 + c) * 3 + 2]]);
      const n = [q.nrm[i * 12], q.nrm[i * 12 + 1], q.nrm[i * 12 + 2]];
      // Faces the track (the viewer stands in the lane).
      assert.ok(dot(n, [-sd * t.rx[k], 0, -sd * t.rz[k]]) > 0.99, `${id}: sign ${i} faces away from the lane`);
      // A centimetre proud of the lintel, on the garage line.
      const c = [0, 1, 2].map((a) => (P[0][a] + P[1][a] + P[2][a] + P[3][a]) / 4);
      const lat = ((c[0] - t.px[k]) * t.rx[k] + (c[2] - t.pz[k]) * t.rz[k]) * sd - t.hw[k];
      assert.ok(Math.abs(lat - (p.off.workOut - S.proud)) < 0.12,
        `${id}: sign ${i} at ${lat.toFixed(2)} m, the lintel's face is at ${(p.off.workOut - S.proud).toFixed(3)}`);
      // Inside the lintel's 0.8 m band over the door, 5.2 m wide.
      for (const v of P) {
        const h = v[1] - t.py[k];
        assert.ok(h > S.y0 - 0.25 && h < S.y0 + S.quadH + 0.25, `${id}: sign ${i} corner ${h.toFixed(2)} m up`);
      }
      assert.ok(Math.abs(len(sub(P[1], P[0])) - S.quadW) < 0.01, `${id}: sign ${i} width`);
      assert.ok(Math.abs(len(sub(P[3], P[0])) - S.quadH) < 0.01, `${id}: sign ${i} height`);
      // Not mirrored: [BL, BR, TR, TL] winds toward the normal on either side.
      assert.ok(dot(cross(sub(P[1], P[0]), sub(P[3], P[0])), n) > 0, `${id}: sign ${i} is mirrored`);
      // UVs stay inside the cell's own rectangle.
      const cx = (i % S.cols) * S.cellW, cy = Math.floor(i / S.cols) * S.cellH;
      for (let c2 = 0; c2 < 4; c2++) {
        const u = q.uv[(i * 4 + c2) * 2], v = q.uv[(i * 4 + c2) * 2 + 1];
        assert.ok(u >= cx / S.w - 1e-9 && u <= (cx + S.cellW) / S.w + 1e-9, `${id}: sign ${i} u ${u}`);
        assert.ok(v >= 1 - (cy + S.cellH) / S.h - 1e-9 && v <= 1 - cy / S.h + 1e-9, `${id}: sign ${i} v ${v}`);
      }
    }
    // The signs are NOT in the props buffer: it carries no UVs and nothing of
    // it stands on the sign plane in the lintel band.
    assert.equal(t.propsGeo.uv, undefined);
  }
});

test("the approach boards walk back past the circuit's own scenery instead of standing in it", () => {
  // The far board's nominal distance is boardM[1] (110 m); where the verge is
  // taken — Nürburgring's trunk at 110 is the case that once moved it to 95 by
  // hand — the board walks up to 24 m further back, 4 m at a time, and is
  // skipped rather than placed through a prop. Measured from the node it
  // stands on, so a placed board is within [nominal, nominal + 24] plus a node.
  const S = ctxOnce().TrackPit.SIGN;
  for (const id of [FULL, LEFT, "nurburgring"]) {
    const t = buildOnce(id), p = t.pit, q = t.pitSigns;
    if (!q) continue;                                       // no complex, no boards
    const ds = t.total / t.n;
    const backs = q.boards.filter((b) => b.cell === S.cells).map((b) => ((p.sA - b.k * ds) % t.total + t.total) % t.total);
    assert.ok(backs.length >= 1, `${id}: no approach board survived the walk`);
    for (const back of backs) {
      const nominal = S.boardM.reduce((best, m) => (back >= m - ds && (best == null || m > best) ? m : best), null);
      assert.ok(nominal != null && back <= nominal + 24 + ds, `${id}: a board ${back.toFixed(0)} m back is not within 24 m of ${S.boardM.join("/")}`);
    }
    if (id === "nurburgring") assert.ok(Math.max(...backs) >= S.boardM[1] - ds, `nurburgring: the far board fell back to ${Math.max(...backs).toFixed(0)} m; it should walk past the trunk, not vanish`);
  }
});

test("a painted lane has no signs; a street complex signs its bays like any other", () => {
  const T = ctxOnce().Tracks;
  const narrow = built(Object.assign({}, T.LIST.find((d) => d.id === STREET), { pit: { mode: "narrow" } }));
  assert.equal(narrow.pitSigns, undefined, "no bays, no signs");
  assert.equal(buildOnce(STREET).pitSigns.cells.length, 12, "Monaco's STREET complex has twelve bays to sign");
});

test("the row carries each team's code for the painter", () => {
  const boxes = buildOnce(FULL).pit.row.boxes;
  const mer = boxes.find((b) => b.team === "mercedes");
  assert.equal(mer.short, "MER");
  for (const b of boxes) assert.ok(typeof b.short === "string" && b.short.length >= 1, `${b.team} has no code`);
});

// The painter, without a browser: a bare VM must report itself unsupported
// and upload nothing; with a stub document and LiveryTex it paints twelve
// cells and uploads one texture and one texMesh of every quad (the twelve
// fascias, the boards, the twelve wall panels).
function loadPainter(sandbox) {
  const ctx = vm.createContext(Object.assign({ Math, Object, Array, Number, String, JSON, Error, Float32Array,
    console, Log: { warn() {}, info() {}, error() {}, debug() {} } }, sandbox));
  for (const f of ["js/track/core/pit.js", "js/garage/pit-signs.js"]) vm.runInContext(read(f), ctx, { filename: f });
  return vm.runInContext("PitSigns", ctx);
}

test("a bare VM is unsupported and uploads nothing, without throwing", () => {
  const P = loadPainter({});
  assert.equal(P.supported(), false);
  const t = buildOnce(FULL);
  const calls = [];
  const G = { createTexMesh: () => calls.push("mesh"), createTexture: () => calls.push("tex") };
  assert.equal(P.upload(G, t), false);
  assert.deepEqual(calls, []);
  assert.equal(P.draw({ drawDecal: () => calls.push("draw") }, t, null, [0, 0, 0], false, false), false);
});

test("with a canvas and the livery painter it paints twelve cells and uploads one texture + one texMesh", () => {
  const painted = [], texts = [];
  const ctx2d = {
    clearRect() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
    fillRect() {}, fillText(s) { texts.push(s); }, measureText: (s) => ({ width: 10 * s.length }),
    set fillStyle(v) {}, set font(v) {}, set textBaseline(v) {}, set textAlign(v) {}, set globalAlpha(v) {},
  };
  const document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
  const LiveryTex = { paintTeamMark: (c, id, liv, R) => painted.push({ id, R }), inkOn: () => [0.97, 0.97, 0.98] };
  const P = loadPainter({ document, LiveryTex });
  assert.equal(P.supported(), true);
  const t = buildOnce(FULL);
  const up = [];
  const G = { createTexMesh: (d) => { up.push(["mesh", d]); return { id: 1 }; }, createTexture: (cv) => { up.push(["tex", cv]); return { id: 2 }; } };
  t.meshes = t.meshes || {};
  assert.equal(P.upload(G, t), true);
  assert.equal(painted.length, 24, "one crest per bay on its fascia, and one on its pier plaque");
  // …and the entrance lamps' RED aspects as a SECOND mesh on the same
  // texture (track.pitSignal), drawn only while this car is called in.
  const sigMesh = up.filter((u) => u[0] === "mesh");
  assert.equal(sigMesh.length, t.pitSignal ? 2 : 1, "the green aspects are their own mesh");
  if (t.pitSignal) assert.equal(sigMesh[1][1].idx.length, t.pitSignal.idx.length);
  up.splice(up.findIndex((u) => u[0] === "mesh" && u[1].idx.length === (t.pitSignal ? t.pitSignal.idx.length : -1)), t.pitSignal ? 1 : 0);
  // Array.from: the boxes live in the track VM's realm, and a strict deepEqual
  // compares prototypes across realms.
  const teams = Array.from(t.pit.row.boxes, (b) => b.team);
  assert.deepEqual(painted.slice(0, 12).map((x) => x.id), teams);
  assert.deepEqual(painted.slice(12).map((x) => x.id), teams);
  const S0 = ctxOnce().TrackPit.SIGN;
  for (const x of painted.slice(12)) assert.ok(x.R.y >= S0.crestY && x.R.w > S0.crestPx * 0.6, `a plaque crest fills its cell: ${JSON.stringify(x.R)}`);
  assert.ok(texts.includes("MER") && texts.includes("FER"), "the codes are lettered");
  assert.ok(texts.some((s) => /PIT ENTRY/.test(s)) && texts.some((s) => /PIT LANE \d+ km\/h/.test(s)), `the boards are lettered: ${texts.join("|")}`);
  assert.equal(up.length, 2);
  const mesh = up.find((u) => u[0] === "mesh")[1];
  const nq = 12 + t.pitSigns.boards.length + t.pitSigns.panels.length + t.pitSigns.crests.length;
  assert.equal(mesh.pos.length / 3, nq * 4); assert.equal(mesh.uv.length, nq * 8); assert.equal(mesh.idx.length, nq * 6);
  const cv = up.find((u) => u[0] === "tex")[1];
  const S = ctxOnce().TrackPit.SIGN;
  assert.equal(cv.width, S.w); assert.equal(cv.height, S.h);
  // The draw: once inside 350 m of the row (or of a board), never beyond
  // both, never when hidden.
  const drawn = [];
  const gfx = { drawDecal: (m, model, tex, o) => drawn.push({ glow: o.glow }) , freeMesh() {}, freeTexture() {} };
  const c = t.pitSigns.centre;
  assert.equal(P.draw(gfx, t, null, [c[0] + 100, c[1], c[2]], true, false), true);
  assert.equal(P.draw(gfx, t, null, [c[0] + 3000, c[1], c[2]], true, false), false);
  assert.equal(P.draw(gfx, t, null, [c[0], c[1], c[2]], false, true), false);
  assert.deepEqual(drawn, [{ glow: 0.5 }]);
  P.free(gfx, t);
  assert.equal(t.meshes.pitSigns, null);
});

// ── EVERY circuit's pit wall actually gets built ─────────────────────────────
// The platform, the wall, its rail and the lane-side barrier are four sweeps
// over ONE node run, and sweep() emits nothing for a run shorter than two
// nodes. The run started at `sIn` and broke on its first failing node, but the
// wall's fade FINISHES at `sIn`, so whether that node had reached v >= 0.98 was
// node-grid luck: Magny-Cours sat at 0.954, Mexico and Monaco at 0.97, and all
// three shipped with no pit wall at all — invisible in the vertex buffers,
// which is why `wall` is now kept on the track rather than only logged.
test("every circuit with a pit wall builds one", () => {
  const T = ctxOnce().Tracks;
  const missing = [];
  for (const def of T.LIST) {
    const t = built(def);
    if (!t.pit || !t.pit.hasWall) continue;
    if (!t.pitBuilt || t.pitBuilt.wall !== true) missing.push(def.id);
  }
  assert.deepEqual(missing, [], `no pit wall built on: ${missing.join(", ")}`);
});
