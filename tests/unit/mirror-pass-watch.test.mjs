/* mirror-pass-watch — the broadcast PiP, the governor, the sun/tune views, standDown and XR for the HUD mirror. No browser.
 * Split from mirror-pass.test.mjs (T3-16); the VM rig is tests/helpers/mirror-pass-rig.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { read, boot } from "../helpers/mirror-pass-rig.mjs";

test("a WATCH: the mirror stands down; the PiP draws its subject on the TV shot, unflipped, into #bc-pip, with ITS neighbours", () => {
  const b = boot({ cam: "cockpit", bc: true });
  const sub = { s: 1000, team: "s", code: "VER" }, near = { s: 1012, team: "n" };   // 900 m from the followed car
  b.G.cars.push(sub, near);
  b.mp.setSubject(sub, "tcam");
  b.render();
  const st = b.mp.state();
  assert.equal(st.shown, false, "no rear-view mirror on the TV picture (T-CAM is one of the director's shots)");
  assert.equal(b.frameEl.hidden, true);
  assert.equal(st.pip.shown, true); assert.equal(st.pip.code, "VER"); assert.equal(b.pipEl.hidden, false);
  const rect = b.calls.filter((c) => c[0] === "rect").pop();
  assert.deepEqual(Array.from(rect[1], (v) => +v.toFixed(4)), [900 / 1280, 60 / 720, 360 / 1280, 202 / 720].map((v) => +v.toFixed(4)));
  assert.equal(rect[2], false, "UNFLIPPED: a picture, not glass");
  assert.equal(b.vant.length, 1); assert.equal(b.vant[0].m, "tcam"); assert.equal(b.vant[0].s, 1000);
  const draws = b.calls.filter((c) => c[0] === "draw").map((c) => c[1]);
  assert.deepEqual(Array.from(draws), ["mesh:s", "mesh:n"], "the subject and the car beside it; the followed car 900 m away is not in reach");
  assert.ok(b.calls.some((c) => c[0] === "begin") && b.calls.some((c) => c[0] === "end"));
  assert.equal(b.frame.viewProj, b.mainVP, "the main camera is handed back");
  assert.equal(b.frameSky.invViewProj, b.mainInv);
  b.pooled.eye[2] = -1;   // the main camera re-solving next frame must not move the PiP's eye after the fact
  const beg = b.calls.find((c) => c[0] === "begin");
  assert.equal(beg[4][2], 988, "the eye was COPIED from the pooled rig (subject 1000 − 12)");
});

test("the PiP: AUTO skips a software renderer and ON draws it; no subject, no PiP; after the WATCH the mirror is back, flipped", () => {
  const sub = { s: 400, team: "s", code: "HAM" };
  const soft = boot({ bc: true, soft: true });
  soft.G.cars.push(sub); soft.mp.setSubject(sub, "chase"); soft.render();
  assert.equal(soft.mp.state().pip.shown, false, "AUTO + software: a second world pass is seconds a frame");
  assert.equal(soft.calls.filter((c) => c[0] === "begin").length, 0);
  const forced = boot({ bc: true, soft: true, pipMode: "on" });
  forced.G.cars.push(sub); forced.mp.setSubject(sub, "chase"); forced.render();
  assert.equal(forced.mp.state().pip.shown, true, "ON: any renderer");
  const none = boot({ bc: true });
  none.render();
  assert.equal(none.mp.state().pip.shown, false); assert.equal(none.mp.state().shown, false, "and no mirror either in a WATCH");
  assert.equal(none.calls.filter((c) => c[0] === "begin").length, 0);
  // The WATCH ends (broadcast.js clears bc-on): the cockpit mirror comes back, flipped.
  none.classes.delete("bc-on");
  none.render();
  assert.equal(none.mp.state().shown, true);
  const rect = none.calls.filter((c) => c[0] === "rect").pop();
  assert.ok(rect[1] && rect[2] === undefined, "the mirror's composite: the default (flipped) path");
});

test("a phone's governor cannot make the mirror flash: the target ignores render scale, a rung holds ~1.5 s", () => {
  const h = boot({ mode: "on", tier: 2 });
  h.render();
  const size = () => { const b = h.calls.filter((c) => c[0] === "begin").pop(); return [b[1], b[2]]; };
  assert.deepEqual(size(), [200, 57], "low rung: half of the 400x114 frame, no extra supersample");
  // Dynamic resolution rescales the render buffer; the mirror target does not move.
  h.gfx.width = 640; h.gfx.height = 360;
  for (let i = 0; i < 4; i++) h.render();
  assert.deepEqual(size(), [200, 57], "sized from the frame's CSS box, not the render buffer");
  // A tier blip shorter than the dwell never swaps the rung…
  h.setTier(4);
  for (let i = 0; i < 30; i++) h.render();
  assert.equal(h.mp.state().quality, "low", "a 30-frame blip to tier 4 holds the rung");
  h.setTier(2);
  for (let i = 0; i < 30; i++) h.render();
  assert.equal(h.mp.state().quality, "low");
  // …a tier that stays does, once.
  h.setTier(4);
  for (let i = 0; i < 89; i++) h.render();
  assert.equal(h.mp.state().quality, "low", "still inside the dwell");
  h.render();
  assert.equal(h.mp.state().quality, "min", "90 frames on: the rung follows");
});

test("the sun's view-dependent terms stay out of the mirror, and the main frame keeps its own tune", () => {
  const h = boot({ mode: "on" });
  const own = h.frame.tune;
  h.render();
  // world = [tag, viewProj, mirrorLite, freezeInstanced, tune]
  const seen = h.calls.find((c) => c[0] === "world")[4];
  // Glint, sparkle, window flash and cast shadows alias / sweep in a small
  // un-antialiased target — a phone report of a "flashy" mirror in the sun.
  assert.deepEqual([seen.carSunGlint, seen.carSparkle, seen.windowSunFlash, seen.shadowStr], [0, 0, 0, 0]);
  assert.equal(seen.keyMul, 1.1, "every other LIGHTING knob reaches the mirror unchanged");
  assert.equal(h.frame.tune, own, "the main pass gets its own tune object back");
  assert.equal(own.carSunGlint, 12, "and it is never written to");
  // The tuner edits its object in place; the next mirror pass follows it.
  own.keyMul = 0.9;
  h.render();
  assert.equal(h.calls.filter((c) => c[0] === "world").pop()[4].keyMul, 0.9);
});

// 5-F1 (hunt 3): the override used to Object.assign all ~190 LightKnobs.LT knobs (a dictionary-mode
// object) into a scratch object every mirror frame to change four — ~46 µs a frame for no visual effect.
test("the mirror's tune is a view built once per source table, never a per-frame copy of every knob (5-F1)", () => {
  const h = boot({ mode: "on" });
  const own = h.frame.tune;
  let enumerations = 0;
  // A copy enumerates the source ([[OwnPropertyKeys]]); a prototype read-through never does.
  const counted = new Proxy(own, { ownKeys(t) { enumerations++; return Reflect.ownKeys(t); } });
  h.frame.tune = counted;
  h.render();
  h.render();
  h.render();
  const worlds = h.calls.filter((c) => c[0] === "world");
  assert.equal(worlds.length, 3);
  assert.equal(enumerations, 0, "no pass enumerates the lighting table");
  assert.equal(worlds[0][5], worlds[2][5], "one view object across frames while the table is the same object");
  assert.equal(worlds[2][5].keyMul, own.keyMul, "the other knobs read through to the live table");
  assert.equal(worlds[2][5].carSunGlint, 0, "the four overrides stay on the view");
  assert.equal(h.frame.tune, counted, "the main pass gets its own table back");
  own.keyMul = 0.7;   // the tuner edits in place: no rebuild needed, the read-through follows
  h.render();
  assert.equal(h.calls.filter((c) => c[0] === "world").pop()[4].keyMul, 0.7);
  const other = { carSunGlint: 5, keyMul: 2 };   // a different table (a new frame.tune) rebuilds the view
  h.frame.tune = other;
  h.render();
  const last = h.calls.filter((c) => c[0] === "world").pop();
  assert.notEqual(last[5], worlds[0][5]);
  assert.deepEqual([last[4].keyMul, last[4].carSunGlint], [2, 0]);
  assert.equal(other.carSunGlint, 5, "the source table is never written");
});

test("standDown (the GARAGE preview frame) hides the mirror and clears the composite rect; the race brings it back", () => {
  const b = boot({ cam: "cockpit" });
  b.render();
  assert.equal(b.frameEl.hidden, false);
  b.calls.length = 0;
  b.mp.standDown();
  assert.equal(b.mp.state().shown, false);
  assert.equal(b.frameEl.hidden, true);
  assert.ok(!b.classes.has("hud-mirror-on"));
  assert.deepEqual(b.calls.filter((c) => c[0] === "rect").map((c) => c[1]), [null], "no stale mirror composited over the car");
  b.render();
  assert.equal(b.mp.state().shown, true, "the next race frame shows it again");
  assert.equal(b.frameEl.hidden, false);
});

// R3-RENDER-4: presentXR drops the post chain that composites the mirror, and the
// DOM frame is not in the headset — the pass was a whole world render per frame
// (+25 % of the stereo pair's prop triangles, scratch/hunt3-render/xr-mirror.cjs).
