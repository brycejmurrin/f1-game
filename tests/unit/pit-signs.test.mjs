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
const buildOnce = (() => {
  const seen = new Map();
  return (id) => {
    if (!seen.has(id)) { const T = ctxOnce().Tracks; seen.set(id, T.build(T.LIST.find((d) => d.id === id))); }
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
    assert.equal(q.pos.length / 3, S.cells * 4);
    assert.equal(q.idx.length, S.cells * 6);
    assert.equal(q.uv.length, S.cells * 8);
    assert.ok(Array.isArray(q.centre) && q.centre.length === 3, `${id}: a centre for the distance gate`);
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

test("a painted lane has no signs; a street complex signs its bays like any other", () => {
  const T = ctxOnce().Tracks;
  const narrow = T.build(Object.assign({}, T.LIST.find((d) => d.id === STREET), { pit: { mode: "narrow" } }));
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
// cells and uploads one texture and one 48-vertex texMesh.
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
  assert.equal(painted.length, 12, "one crest per bay");
  // Array.from: the boxes live in the track VM's realm, and a strict deepEqual
  // compares prototypes across realms.
  assert.deepEqual(painted.map((x) => x.id), Array.from(t.pit.row.boxes, (b) => b.team));
  assert.ok(texts.includes("MER") && texts.includes("FER"), "the codes are lettered");
  assert.equal(up.length, 2);
  const mesh = up.find((u) => u[0] === "mesh")[1];
  assert.equal(mesh.pos.length / 3, 48); assert.equal(mesh.uv.length, 96); assert.equal(mesh.idx.length, 72);
  const cv = up.find((u) => u[0] === "tex")[1];
  const S = ctxOnce().TrackPit.SIGN;
  assert.equal(cv.width, S.w); assert.equal(cv.height, S.h);
  // The draw: once inside 350 m of the row, never beyond it, never when hidden.
  const drawn = [];
  const gfx = { drawDecal: (m, model, tex, o) => drawn.push({ glow: o.glow }) , freeMesh() {}, freeTexture() {} };
  const c = t.pitSigns.centre;
  assert.equal(P.draw(gfx, t, null, [c[0] + 100, c[1], c[2]], true, false), true);
  assert.equal(P.draw(gfx, t, null, [c[0] + 400, c[1], c[2]], true, false), false);
  assert.equal(P.draw(gfx, t, null, [c[0], c[1], c[2]], false, true), false);
  assert.deepEqual(drawn, [{ glow: 0.5 }]);
  P.free(gfx, t);
  assert.equal(t.meshes.pitSigns, null);
});
