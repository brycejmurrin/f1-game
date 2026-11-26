/* RE-PICKING A CIRCUIT REUSES ITS CACHES (#6493 row 4).
 *
 * A re-pick (A -> B -> A) builds a NEW track object, and the flyby plan,
 * binding and fallback caches (js/camera/flyby-seq.js) and the per-chunk lamp
 * bake (js/render/shared/lamp-chunks.js) were keyed by object identity, so the
 * second A re-planned and re-baked in full. They are now filed per BUILD
 * (circuit id + a fingerprint of geometry and scenery) and per bake CONTENT.
 * Pinned here: the second A gets the first A's plan objects back (no re-plan)
 * and the first A's lamp table (no re-bake); a geometry edit misses both, so
 * nothing stale is served. VM only, no browser.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

test("flyby: A -> B -> A reuses A's plans; a geometry edit misses", async () => {
  const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));
  const g = await createGame({ track: "monaco" });
  after(() => g.close());
  const S = g.sandbox, F = S.FlybySeq, T = S.Tracks;
  const planAll = (track) => {
    const list = F.bindCorners(track, F.DEFAULT);
    return list.map((sh) => { const s = F.landmarkFallback(track, sh); return F.planShot(track, s, 0.1); });
  };
  await g.race("monaco", "day", "dry");
  const a1 = g.G.track, p1 = planAll(a1);
  await g.race("monza", "day", "dry");
  const b = g.G.track, pb = planAll(b);
  await g.race("monaco", "day", "dry");
  const a2 = g.G.track;
  assert.notEqual(a2, a1, "the re-pick built a new track object (else this test proves nothing)");
  const p2 = planAll(a2);
  assert.equal(p2.length, p1.length);
  p2.forEach((p, i) => assert.equal(p, p1[i], "shot " + i + ": the second monaco must reuse the first's plan (no planShot run)"));
  assert.ok(pb.every((p, i) => p !== p1[i]), "monza never gets monaco's plans");

  // A geometry edit (one centreline point moved) is a different build: it misses.
  const c1 = T.buildCenterline(a2.def);
  const q1 = planAll(c1);
  const q1b = planAll(T.buildCenterline(a2.def));
  q1b.forEach((p, i) => assert.equal(p, q1[i], "an identical centreline-only build reuses its plans"));
  assert.ok(q1.every((p, i) => p !== p1[i]), "a centreline-only build (no props) is not the full build");
  const edited = Object.assign({}, a2.def, { points: a2.def.points.map((pt, i) => (i === 5 ? Object.assign(Array.isArray(pt) ? pt.slice() : Object.assign({}, pt)) : pt)) });
  const pt = edited.points[5];
  if (Array.isArray(pt)) pt[0] += 3; else pt.x += 3;
  const q2 = planAll(T.buildCenterline(edited));
  assert.ok(q2.every((p, i) => p !== q1[i]), "a moved point must re-plan, never serve the old plan");
});

test("lamp chunks: a rebuilt, content-equal chunk set reuses the bake; an edited one re-bakes", () => {
  const MAN = require(path.join(ROOT, "tools/manifest.cjs"));
  const SRC = (MAN.PATHS && MAN.PATHS.LAMP_CHUNKS) || "js/render/shared/lamp-chunks.js";
  const DEPS = ["js/render/shared/light-budget.js", "js/render/shared/frustum.js"].map((f) => readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  let bakes = 0;
  const L = new Function("onBake", DEPS + "\n" + readFileSync(path.join(ROOT, SRC), "utf8")
    .replace("function buildTable(lights, chunks, knob, capMax) {", "function buildTable(lights, chunks, knob, capMax) { onBake();") + "; return LampChunks;")(() => bakes++);
  const lampSet = (recs) => { const a = new Float32Array(recs.length * 15); recs.forEach(([x, y, z, r], i) => { a.set([x, y, z], i * 15); a[i * 15 + 6] = r; }); return a; };
  const world = (dx) => ({
    lights: lampSet([[0, 0, 0, 50], [100 + dx, 0, 0, 50]]),
    chunks: [{ min: [-1, -1, -1], max: [1, 1, 1], gx: 0, gz: 0 }, { min: [99 + dx, -1, -1], max: [101 + dx, 1, 1], gx: 1, gz: 0 }],
  });
  const A1 = world(0), B = world(500), A2 = world(0);
  const t1 = L.resolve(A1.lights, A1.chunks, 1);
  assert.equal(bakes, 1);
  L.resolve(B.lights, B.chunks, 1);
  assert.equal(bakes, 2, "another circuit bakes");
  const t2 = L.resolve(A2.lights, A2.chunks, 1);
  assert.equal(bakes, 2, "the re-picked circuit must not re-bake");
  assert.equal(t2, t1, "it gets the first build's table back");
  const E = world(3);   // a geometry edit: one chunk and its lamp moved 3 m
  const te = L.resolve(E.lights, E.chunks, 1);
  assert.equal(bakes, 3, "an edited chunk set re-bakes");
  assert.notEqual(te, t1);
  // Bounded: after more than CONTENT_MAX other bakes, the first is gone and re-bakes.
  for (let k = 1; k <= 5; k++) { const w = world(1000 * k); L.resolve(w.lights, w.chunks, 1); }
  const before = bakes, A3 = world(0);
  L.resolve(A3.lights, A3.chunks, 1);
  assert.equal(bakes, before + 1, "the content cache holds a bounded number of bakes");
});
