/* mirror-pass-carbuild — a mirror/PiP draw builds nothing (real CarDraw), the re-measure clock and the frozen-frame replay. No browser.
 * Split from mirror-pass.test.mjs (T3-16); the VM rig is tests/helpers/mirror-pass-rig.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";
import { read, boot } from "../helpers/mirror-pass-rig.mjs";

test("a mirror draw on a warmed field builds nothing: body-only mesh + the field wheels, never a whole car", () => {
  const v = carDrawVm();
  v.G.teamIdx = 0; v.G.driverIdx = 0;
  // The player at the front; the 21 rivals strung out behind it, 9 m apart.
  v.field((c, i) => (c.isPlayer ? 1000 : 1000 - 9 * i));
  v.carDraw.warmCarAssets();
  assert.ok(v.rec.builds.length > 0 && v.rec.builds.every(b => b.kind === "body"), "race entry warms bodies (no whole car)");
  const warmBuilds = v.rec.builds.length, warmWheels = v.rec.wheels;
  const mp = v.mirror();
  v.rec.draws.length = 0;
  v.draw(mp);
  assert.equal(mp.state().shown, true);
  assert.equal(mp.state().cars, 6, "FieldLod: the nearest 6 behind");
  assert.equal(v.rec.builds.length, warmBuilds, "a mirror draw builds no Car3D mesh");
  assert.equal(v.rec.wheels, warmWheels, "nor a wheel pair");
  const kinds = v.rec.draws.map(m => m.kind);
  assert.deepEqual(kinds.filter(k => k !== "wheel"), ["body", "body", "body", "body", "body", "body"], "one body-only mesh per rival");
  assert.equal(kinds.filter(k => k === "wheel").length, 24, "BARE wheels: the 4 rotating ones, no fixed layers / stripes / discs / rings");
  assert.ok(v.rec.draws.every(m => (m.kind === "wheel" ? m._field : true)), "the FIELD pair (getFieldWheelMeshes), the main pass's own");
  // Mid-race: the field reshuffles, so 6 DIFFERENT rivals are now the nearest.
  v.G.cars.forEach((c, i) => { if (!c.isPlayer) c.s = 1000 - 9 * (v.G.cars.length - i); });
  v.draw(mp);
  assert.equal(mp.state().cars, 6);
  assert.equal(v.rec.builds.length, warmBuilds, "a rival new to the mirror is a cache hit");
  // Night: the wheels take the main pass's night emissive, still nothing built.
  v.draw(mp, true);
  assert.equal(v.rec.builds.length, warmBuilds);
  assert.equal(v.rec.freed, 0, "nothing evicted from a bounded cache");
});

test("the broadcast PiP draws through the same meshes: its subject, its neighbours, the player's own body", () => {
  const v = carDrawVm();
  v.G.teamIdx = 2; v.G.driverIdx = 1;
  v.field((c, i) => 2000 - 9 * i);
  v.carDraw.warmCarAssets();
  const warm = v.rec.builds.length;
  const mp = v.mirror();
  v.classes.add("bc-on");
  for (const sub of [v.G.cars[7], v.G.cars[15], v.G.player]) {
    mp.setSubject(sub, "tcam");
    v.rec.draws.length = 0;
    v.draw(mp);
    assert.equal(mp.state().pip.shown, true);
    assert.ok(mp.state().cars >= 1);
    assert.equal(v.rec.builds.length, warm, "a PiP cut builds nothing (subject " + sub.code + ")");
    assert.ok(!v.rec.draws.some(m => m.kind === "whole"), "never a whole-car mesh");
  }
});

test("the shipped-before path, for contrast: teamMesh per mirror rival builds a whole car each", () => {
  // The counter above is only evidence if it can see the regression: the
  // previous drawCars body (teamMesh(c.team, c)) on the same warmed field.
  const v = carDrawVm();
  v.field((c, i) => (c.isPlayer ? 1000 : 1000 - 9 * i));
  v.carDraw.warmCarAssets();
  const warm = v.rec.builds.length;
  const mp = v.mirror({ drawCar: (c, m, paint) => v.G.gfx.draw(v.carDraw.teamMesh(c.team, c), m, paint) });
  v.draw(mp);
  const whole = v.rec.builds.slice(warm);
  assert.equal(whole.length, 6, "6 Car3D builds on the first mirror frame");
  assert.ok(whole.every(b => b.kind === "whole"));
});

// The layout re-read runs on the CLOCK (500 ms), not every 30 frames — a frame
// count is not a clock (docs/notes/PERF-FINDINGS.md §2n) — and side() writes the
// <body> class and custom properties only when they change: each write
// invalidates style page-wide, and the layout is still almost every time.
test("the mirror re-measures on a 500 ms clock and leaves <body> alone when the side layout has not moved", () => {
  const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const h = boot({ mode: "on", boxes: { pausebtn: box(1226, 8, 44, 44) } });
  let reads = 0;
  const raw = h.frameEl.getBoundingClientRect;
  h.frameEl.getBoundingClientRect = () => { reads++; return raw(); };
  h.render();
  const first = reads;
  assert.ok(first > 0, "the first frame measures");
  assert.ok(h.classes.has("hud-mirror-side"));
  const w0 = { ...h.writes };
  for (let i = 0; i < 60; i++) h.render();
  assert.equal(reads, first, "60 frames inside 500 ms: no layout read (it was one every 30 FRAMES)");
  h.clock.t = 499; h.render();
  assert.equal(reads, first, "still inside the window");
  h.clock.t = 500; h.render();
  assert.ok(reads > first, "the clock re-measures");
  assert.deepEqual(h.writes, w0, "same layout: no class toggle, no custom-property write");
  // The layout moves: the new values are written.
  h.frameEl.getBoundingClientRect = () => { reads++; return { left: 400, top: 70, width: 400, height: 114, right: 800, bottom: 184 }; };
  h.clock.t = 1000; h.render();
  assert.equal(h.props["--mir-side-x"], "808.0px");
  assert.ok(h.writes.prop > w0.prop);
  // A state change still measures on the very next frame (no 500 ms wait).
  h.mp.setMode("off"); h.render();
  h.mp.setMode("on"); const r = reads; h.render();
  assert.ok(reads > r, "re-shown: measured at once");
  assert.ok(h.classes.has("hud-mirror-side"), "hiding cleared the class; showing re-applies it");
});

// L4: drawWorldMeshes recorded `b._mirMats` on EVERY non-frozen draw, the MAIN camera
// pass included. Per game frame the mirror pass runs first and the main pass second,
// so the next frame's frozen mirror pass replayed the FORWARD camera's cull pack
// (rear scenery alternating right/wrong at ~30 Hz) and the main pass copied every
// visible matrix for nothing. The block is executed straight from game.js's source.
test("a frozen mirror frame replays the MIRROR pass's pack, never the main camera's (L4)", () => {
  const src = read("js/game.js");
  const a = src.indexOf("const _pb = track.meshes.propBatches;");
  const z = src.indexOf("if (!envProbe) gfx.drawChunked(track.meshes.props", a);
  assert.ok(a > 0 && z > a, "the instanced-batch block is still where the test slices it");
  const run = new Function("frame", "gfx", "track", "_pbPlanes", "m", "envProbe", src.slice(a, z));
  const updates = [];
  const gfx = {
    drawInstanced() {},
    makeFrustumPlanes: (vp) => ({ tag: vp[0] }),
    // The cull packs ONE matrix whose first lane names the camera that culled it.
    cullInstances(b, planes) {
      b.visible = 1; b.packMatrices[0] = planes.tag;
      if (b.packColors) { b.packColors[0] = planes.tag; b.packColors[1] = 0.2; b.packColors[2] = 0.3; }
    },
    updateInstances(b, mats, n, cols) { updates.push({ tag: mats[0], n, col: cols && cols[0] }); },
  };
  const b = { visible: 0, packMatrices: new Float32Array(16 * 4), packColors: new Float32Array(12) };
  const track = { meshes: { propBatches: [b] } };
  const MIRROR = 2, MAIN = 1;
  const mirrorFrame = (freeze) => ({ viewProj: [MIRROR], mirrorLite: false, mirrorFreezeInstanced: freeze });
  const mainFrame = () => ({ viewProj: [MAIN] });   // mirror-pass leaves both flags undefined here
  run(mirrorFrame(false), gfx, track, [], {}, false);   // frame 1: mirror refreshes its pack
  run(mainFrame(), gfx, track, [], {}, false);          //          then the main camera culls
  assert.equal(b._mirMats[0], MIRROR, "the main pass must not overwrite the mirror's recorded pack");
  assert.equal(b._mirCols[0], MIRROR, "per-instance colours are frozen with the matrices");
  run(mirrorFrame(true), gfx, track, [], {}, false);    // frame 2: the mirror is frozen
  assert.deepEqual(updates, [{ tag: MIRROR, n: 1, col: MIRROR }], "the frozen frame replays mats+colours");
  // A main pass alone records nothing (no per-frame memcpy with the mirror off).
  const solo = { visible: 0, packMatrices: new Float32Array(16) };
  run(mainFrame(), gfx, { meshes: { propBatches: [solo] } }, [], {}, false);
  assert.equal(solo._mirMats, undefined, "the main pass does not copy into _mirMats");
});
