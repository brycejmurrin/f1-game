/* mirror-pass — the HUD rear-view mirror's game side (js/render/shared/mirror-pass.js),
 * driven in a VM against a recording renderer. hud-mirror.spec.js is the live
 * evidence that each backend renders and composites; this pins the rules that
 * decide WHEN it runs and WHAT it hands the backend, which a browser run only
 * samples:
 *   - AUTO shows it in the onboard views only, never on a software renderer;
 *     ON in every view; OFF never; the race only (not the countdown's lights);
 *   - the MIRROR key turns off what shows and turns on what does not;
 *   - the pass runs mirrorBegin → world → cars → sky → mirrorEnd with the
 *     mirror camera ON `frame`, and every swapped field is back afterwards —
 *     including when a draw throws (a stuck mirror camera is the main view lost);
 *   - the camera looks BACK along the car, and a rival ahead of the eye is not drawn;
 *   - in a REAL RACE WATCH (body.bc-on) the mirror stands down and the same target
 *     is the broadcast PICTURE-IN-PICTURE: the subject on its TV shot, UNFLIPPED,
 *     into #bc-pip, its neighbours drawn wherever it is (js/race/broadcast.js);
 *   - a mirror or PiP draw on a warmed field BUILDS NOTHING: the real CarDraw
 *     (tests/helpers/car-draw-vm.mjs) draws each rival from the main pass's
 *     body-only mesh and field wheels, never a whole-car teamMesh (140-250 ms of
 *     Car3D.build per rival, mid-race, in the default cockpit cam).
 * No browser (~0.1 s). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot } from "../helpers/mirror-pass-rig.mjs";
import { bootGlx } from "../helpers/glx-mock.mjs";

test("AUTO shows the mirror in an onboard view on a hardware renderer, and not in chase", () => {
  const onboard = boot({ mode: "auto", cam: "cockpit" });
  onboard.render();
  assert.equal(onboard.mp.state().shown, true);
  assert.equal(onboard.frameEl.hidden, false);
  assert.ok(onboard.classes.has("hud-mirror-on"), "the radio card / flag step-down class");
  const helmet = boot({ mode: "auto", cam: "helmet" });
  helmet.render();
  assert.equal(helmet.mp.state().shown, true, "HELMET is an onboard view with no road behind it, like COCKPIT");
  const chase = boot({ mode: "auto", cam: "chase" });
  chase.render();
  assert.equal(chase.mp.state().shown, false);
  assert.equal(chase.calls.filter((c) => c[0] === "begin").length, 0, "no pass when hidden");
  assert.deepEqual(chase.calls.filter((c) => c[0] === "rect").map((c) => c[1]), [null], "and no composite");
});

test("AUTO sheds a software renderer; ON keeps it; OFF and the countdown never draw", () => {
  const soft = boot({ mode: "auto", soft: true });
  soft.render();
  assert.equal(soft.mp.state().shown, false, "AUTO + software");
  const on = boot({ mode: "on", soft: true, cam: "chase" });
  on.render();
  assert.equal(on.mp.state().shown, true, "ON: every view, any renderer");
  const off = boot({ mode: "off" });
  off.render();
  assert.equal(off.mp.state().shown, false);
  const count = boot({ mode: "on", state: "count" });
  count.render();
  assert.equal(count.mp.state().shown, false, "the start lights own the centre column");
  // Performance never HIDES it: GRAPHICS: LOW pins the governor at tier 4, and
  // a player with MIRROR on saw nothing at all under the old rule.
  for (const tier of [3, 4]) {
    const low = boot({ mode: "on", tier });
    low.render();
    assert.equal(low.mp.state().shown, true, "ON at tier " + tier);
  }
  const phone = boot({ mode: "auto", mobile: true, cam: "cockpit" });
  phone.render();
  assert.equal(phone.mp.state().shown, true, "AUTO in the cockpit on a phone");
  assert.equal(phone.mp.state().quality, "lite");
});

test("the MIRROR key turns off what shows, and on what does not, and persists it", () => {
  const h = boot({ mode: "auto", cam: "cockpit" });
  h.render();
  assert.equal(h.mp.state().shown, true);
  h.press(); h.render();
  assert.equal(h.mp.mode(), "off");
  assert.equal(h.stored.hudMirror, "off");
  assert.equal(h.mp.state().shown, false);
  assert.equal(h.classes.has("hud-mirror-on"), false);
  h.press(); h.render();
  assert.equal(h.mp.mode(), "on");
  assert.equal(h.mp.state().shown, true);
});

test("the pass order, the rect, and the frame handed back untouched", () => {
  const h = boot({ mode: "on" });
  h.render();
  const kinds = h.calls.map((c) => c[0]);
  assert.deepEqual(kinds, ["rect", "begin", "world", "draw", "draw", "sky", "end"],
    "rect, then begin → world → cars → sky → end (opaque before sky)");
  const [, rect] = h.calls[0];
  assert.deepEqual(Array.from(rect, (v) => +v.toFixed(4)), [0.3438, 0.0972, 0.3125, 0.1583]);
  const [, w, h2, vp, eye, cull] = h.calls[1];
  assert.equal(w, 800); assert.equal(h2, 228);   // the 400x114 frame, supersampled 2x
  assert.notEqual(vp, h.mainVP, "begin saw the MIRROR camera");
  assert.ok(cull > 0 && cull <= 400, "a radial cull, never the main camera's 0 = unbounded");
  assert.ok(Math.abs(eye[1] - 1.05) < 1e-6 && eye[2] === 100, "helmet height over the car");
  assert.notEqual(h.calls[4][1], h.mainInv, "the sky reconstructed through the mirror camera");
  // Everything swapped is back.
  assert.equal(h.frame.viewProj, h.mainVP);
  assert.equal(h.frame.invViewProj, h.mainInv);
  assert.equal(h.frameSky.invViewProj, h.mainInv);
  assert.deepEqual(h.frame.eye, [0, 5, 90]);
  assert.equal(h.frame.cullDist, 0);
  assert.equal(h.frame.proj, "P");
  assert.equal(h.frame.invProj, "IP");
  assert.equal(h.frame.view, undefined);
});

test("it looks BACK: the rival behind is drawn, the one ahead is not, the player never", () => {
  const h = boot({ mode: "on" });
  h.render();
  const draws = h.calls.filter((c) => c[0] === "draw");
  assert.deepEqual(draws.map((c) => c[1]), ["mesh:b", "mesh:f"]);
  assert.equal(draws[0][2][14], 80, "at the rival's own place on the road");
  // The mirror camera's view matrix maps a point 20 m behind the car to −Z (in
  // front of a GL camera) and one 20 m ahead to +Z (behind it).
  const vp = h.calls[1][3];
  const clipW = (p) => vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  assert.ok(clipW([0, 1, 80]) > 0, "a point behind the car is in front of the mirror camera");
  assert.ok(clipW([0, 1, 120]) < 0, "a point ahead of the car is behind it");
});

test("a draw that throws still ends the pass and hands the main camera back", () => {
  const h = boot({ mode: "on", throwInWorld: true });
  assert.throws(() => h.render(), /boom/);
  assert.equal(h.calls.at(-1)[0], "end", "mirrorEnd ran");
  assert.equal(h.frame.viewProj, h.mainVP);
  assert.equal(h.frameSky.invViewProj, h.mainInv);
  assert.deepEqual(h.frame.eye, [0, 5, 90]);
});

test("a phone gets the LITE pass: no prop batches, a short radius, fewer rivals, a smaller target, every frame", () => {
  const full = boot({ mode: "on" });
  full.render();
  const fw = full.calls.find((c) => c[0] === "world");
  assert.equal(fw[2], false, "desktop: the full world");
  assert.equal(full.mp.state().lite, false);
  const h = boot({ mode: "on", mobile: true });
  h.render();
  const [, w, ht, , , cull] = h.calls.find((c) => c[0] === "begin");
  assert.equal(w, 480); assert.equal(ht, 137);   // 60% of the 400x114 frame, x2 supersampled
  assert.ok(cull > 0 && cull <= 180, "the 180 m lite radius");
  assert.equal(h.calls.find((c) => c[0] === "world")[2], true, "drawWorldMeshes sees frame.mirrorLite");
  assert.equal(h.frame.mirrorLite, undefined, "and the flag comes off with the mirror camera");
  assert.equal(h.mp.state().lite, true);
  // The rival 200 m back is inside the full reach (260) and outside the lite one (140).
  assert.deepEqual(full.calls.filter((c) => c[0] === "draw").map((c) => c[1]).sort(), ["mesh:b", "mesh:f"]);
  assert.deepEqual(h.calls.filter((c) => c[0] === "draw").map((c) => c[1]), ["mesh:b"]);
  // Every frame — the half cadence was the lag. Governor tier 1 is lite too.
  h.render(); h.render();
  assert.equal(h.calls.filter((c) => c[0] === "begin").length, 3);
  const t1 = boot({ mode: "on", tier: 1 });
  t1.render(); t1.render(); t1.render();
  assert.equal(t1.calls.filter((c) => c[0] === "begin").length, 3, "tier 1: every frame");
  assert.equal(t1.mp.state().lite, true);
});

// Bug hunt 2026-10-10: on a cadence rung the first frame after the mirror was hidden could land on a skip
// frame (same size, _drawn > 0) and composite the texture left from before it was hidden.
test("the first frame after the mirror comes back draws, whatever the cadence", () => {
  const begins = (h) => h.calls.filter((c) => c[0] === "begin").length;
  const h = boot({ mode: "on", tier: 2 });
  h.render(); h.render();   // frames 1 and 2 both draw (first frame, then 2 % 2)
  assert.equal(begins(h), 2);
  h.mp.setMode("off"); h.render();
  assert.equal(h.mp.state().shown, false);
  h.calls.length = 0;
  h.mp.setMode("on"); h.render();   // frame 3: a skip frame on the half-rate rung
  assert.equal(h.mp.state().shown, true);
  assert.equal(begins(h), 1, "the look back draws a fresh pass on its first frame");
  h.render();
  assert.equal(begins(h), 2, "and the cadence resumes (frame 4 draws)");
  h.render();
  assert.equal(begins(h), 2, "frame 5 skips again");
});

test("only governor tier 2 halves the cadence", () => {
  const h = boot({ mode: "on", tier: 2 });
  for (let i = 0; i < 4; i++) h.render();
  // Frame 1 always draws (nothing to show yet); after that every other frame.
  assert.equal(h.calls.filter((c) => c[0] === "begin").length, 3);
});

test("a rear-ranked mirror keeps eight lamps plus its tail-lights", () => {
  const h = boot({ mode: "on", rankLights: true });
  const lamps = [];
  for (let i = 0; i < 60; i++) lamps.push(i % 2 ? 8 : -8, 8, 90 - i * 4, 1, 0.9, 0.7, 40, 0, -1, 0, 0.5, 0.2, 0, 0, 1);
  h.frame.time = 0;
  h.FL.setFrameLights(h.frame, { _lights: lamps }, [{}, {}], [0, 1.2, 100], 1, [0, 0, 1], false);
  const full = (h.frame.lights.length / 15) | 0;
  assert.ok(full > 8, "the forward cull filled more than the mirror cap");
  h.frame.tailStart = full;
  h.frame.tailCount = 1;
  h.frame.lights.push(0, 0.5, 80, 4, 0.1, 0.1, 8, 0, 0, -1, 0.5, -0.2, 0, 0, 0.4);
  h.render();
  const world = h.calls.find((c) => c[0] === "world");
  assert.equal(h.mp.state().lampCap, 8);
  assert.equal(world[6], 9, "eight nearest rear lamps plus the tail-light");
  assert.equal(world[7], 8);
  assert.equal(world[8], 1);
  assert.equal((h.frame.lights.length / 15) | 0, full + 1, "the main list is restored after the pass");
});

test("the quality ladder: full, lite, low (tier 2-3, half rate), min (tier 4+, a third)", () => {
  const cases = [[{ tier: 0 }, "full", 800, 228], [{ mobile: true }, "lite", 480, 137],
    [{ tier: 3 }, "low", 200, 57], [{ tier: 4 }, "min", 160, 46]];
  for (const [opt, q, w, ht] of cases) {
    const h = boot(Object.assign({ mode: "on" }, opt));
    h.render();
    const b = h.calls.find((c) => c[0] === "begin");
    assert.equal(h.mp.state().quality, q);
    assert.deepEqual([b[1], b[2]], [w, ht], q + " target");
  }
  // The target's DPR follows the main canvas's cap: an iPhone (DPR 3) on mobileTier is 1.5, a desktop 2 (then MAX_W clamps).
  for (const [opt, w, ht] of [[{ mobile: true, dpr: 3 }, 720, 205], [{ tier: 0, dpr: 3 }, 1024, 292]]) {
    const h = boot(Object.assign({ mode: "on" }, opt));
    h.render();
    const b = h.calls.find((c) => c[0] === "begin");
    assert.deepEqual([b[1], b[2]], [w, ht], JSON.stringify(opt) + " target (a flat cap of 2 drew the phone's 960x274)");
  }
  const min = boot({ mode: "on", tier: 4 });
  for (let i = 0; i < 6; i++) min.render();
  // Frame 1 always draws; then frames 3 and 6.
  assert.equal(min.calls.filter((c) => c[0] === "begin").length, 3);
});

// Bug hunt 2026-10-10: tier() folds in the GRAPHICS preset, so a phone on MEDIUM (every phone's default,
// userTier 2) measured at tier 0 drew the half-rate "low" rung, and a phone on ULTRA (mobileTier cleared)
// drew the desktop "full" rung. A phone's rung follows the MEASURED tier, floored at lite.
test("a phone picks its rung from the measured tier, not the GRAPHICS preset floor", () => {
  const rung = (opt) => { const h = boot(Object.assign({ mode: "on" }, opt)); h.render(); return h.mp.state().quality; };
  assert.equal(rung({ tier: 2, autoTier: 0, userTier: 2, mobile: true }), "lite", "MEDIUM phone, measured 0: lite, not low");
  assert.equal(rung({ tier: 0, autoTier: 0, userTier: 0, isMobile: true }), "lite", "ULTRA phone (no mobileTier): lite, not full");
  assert.equal(rung({ tier: 2, autoTier: 2, userTier: 2, mobile: true }), "low", "a phone that MEASURED tier 2 still steps down");
  assert.equal(rung({ tier: 4, autoTier: 0, userTier: 4, mobile: true }), "min", "LOW, never a default, is still the player's ask");
  assert.equal(rung({ tier: 2, autoTier: 0, userTier: 2 }), "low", "a desktop's preset is a choice: tier() as before");
});

test("full quality freezes instanced packs every other drawn frame (audit #8)", () => {
  const h = boot({ mode: "on", tier: 0 });
  assert.equal(h.mp.state().instEvery, 2, "desktop full defaults to instEvery 2");
  for (let i = 0; i < 4; i++) h.render();
  const worlds = h.calls.filter((c) => c[0] === "world");
  assert.equal(worlds.length, 4, "pass still runs every frame (cars update)");
  // drawn 0 refresh, 1 freeze, 2 refresh, 3 freeze — flag is set before _drawn++.
  assert.deepEqual(worlds.map((c) => c[3]), [false, true, false, true]);
  assert.equal(h.frame.mirrorFreezeInstanced, undefined, "flag restored after pass");
  const st = h.mp.state();
  assert.equal(st.instFreezeSkips, 2);
  assert.equal(st.instRefresh, 2);
  // lite never freezes (no instanced packs to reuse).
  const lite = boot({ mode: "on", mobile: true });
  for (let i = 0; i < 3; i++) lite.render();
  assert.ok(lite.calls.filter((c) => c[0] === "world").every((c) => c[3] === false));
});

// 07-F3: the freeze cadence used the lifetime count of drawn passes, so after a hidden/lite interval a 50 % chance
// said "freeze" on the first full pass and replayed the pack recorded before it. The cadence counts the current run.
test("the first full pass after a hidden or lite interval always refreshes the instance pack (07-F3)", () => {
  const flags = (h) => h.calls.filter((c) => c[0] === "world").map((c) => c[3]);
  // Hidden: three full passes leave the global parity odd (the next would freeze); toggling the mirror off/on must reset it.
  const h = boot({ mode: "on", tier: 0 });
  for (let i = 0; i < 3; i++) h.render();
  assert.deepEqual(flags(h), [false, true, false]);
  h.calls.length = 0;
  h.mp.setMode("off"); h.render();
  h.mp.setMode("on"); h.render();
  assert.deepEqual(flags(h), [false], "back from hidden: refresh, never a freeze onto the old pack");
  h.render();
  assert.deepEqual(flags(h), [false, true], "and the alternation resumes from there");
  // Lite: the governor drops the mirror to lite and recovers (each rung change waits out a 90-frame dwell).
  const g = boot({ mode: "on", tier: 0 });
  for (let i = 0; i < 3; i++) g.render();
  g.setTier(1);
  for (let i = 0; i < 100; i++) g.render();
  assert.equal(g.mp.state().quality, "lite");
  g.setTier(0);
  for (let i = 0; i < 89; i++) g.render();
  assert.equal(g.mp.state().quality, "lite", "still inside the recovery dwell");
  g.calls.length = 0;
  g.render();
  assert.equal(g.mp.state().quality, "full");
  g.render();
  assert.deepEqual(flags(g), [false, true], "first full pass refreshes, the next freezes");
});

for (const preparation of [false, true]) test(`standDown refreshes the first full instance pack after ${preparation ? "same-world preparation" : "re-entry"}`, async () => {
  const rig = boot({ mode: "on", tier: 0 }), h = bootGlx();
  const tri = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0],
    col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
  const matrix = z => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1];
  const batch = h.GLX.createInstancedBatch(tri, new Float32Array([...matrix(80), ...matrix(1080)]), null, { cellSize: 50 });
  const rows = [], begin = rig.gfx.mirrorBegin, end = rig.gfx.mirrorEnd;
  // Drive the actual backend's cull/pack with the camera and freeze flag that
  // MirrorPass hands its renderer. The recording GL does not establish pixels.
  rig.gfx.mirrorBegin = (frame, w, ht) => {
    assert.equal(h.GLX.mirrorBegin(h.frame({ viewProj: frame.viewProj, eye: frame.eye,
      cullDist: frame.cullDist, mirrorFreezeInstanced: frame.mirrorFreezeInstanced }), w, ht), true);
    const n = h.GLX.cullInstances(batch, h.sandbox.Frustum.makeFrustumPlanes(frame.viewProj));
    h.GLX.drawInstanced(batch, {});
    rows.push({ freeze: !!frame.mirrorFreezeInstanced,
      packed: Array.from(batch._mir.packMatrices.slice(0, n * 16)) });
    return begin(frame, w, ht);
  };
  rig.gfx.mirrorEnd = () => { h.GLX.mirrorEnd(); end(); };
  try {
    for (let i = 0; i < 3; i++) rig.render();
    assert.deepEqual(rows.map(row => row.freeze), [false, true, false]);
    assert.deepEqual(rows.at(-1).packed, matrix(80));
    // The garage path never calls render() while stood down. Repeated calls
    // must remain idempotent, and the same world's batch survives the interval.
    for (let i = 0; i < 3; i++) rig.mp.standDown();
    rig.G.player.s = 1100;
    if (preparation) {
      rig.G.state = "count";
      const ready = rig.mp.prepareRace();
      rig.render(); rig.render();
      assert.equal(await ready, true);
    } else rig.render();
    assert.equal(rows.at(-1).freeze, false, "the first full pass after interruption refreshes");
    assert.deepEqual(rows.at(-1).packed, matrix(1080), "the new view's packed bytes replace the old location");
    rig.G.state = "race";
    rig.render();
    assert.equal(rows.at(-1).freeze, true, "ordinary every-other-pass reuse resumes from the refreshed pack");
    assert.deepEqual(rows.at(-1).packed, matrix(1080));
  } finally { h.GLX.freeInstancedBatch(batch); }
});

test("a tap collapses the mirror to a chip for the session; a tap on the chip brings it back", () => {
  const h = boot({ mode: "on", mobile: true });
  h.render();
  assert.equal(h.mp.state().shown, true);
  h.frameEl.handlers.click();
  h.render();
  assert.equal(h.mp.state().shown, false);
  assert.equal(h.mp.state().collapsed, true);
  assert.equal(h.frameEl.hidden, true);
  assert.equal(h.chipEl.hidden, false, "the chip stands in its place");
  assert.equal(h.stored.hudMirror, "on", "the setting is untouched — the next load shows it again");
  const n = h.calls.filter((c) => c[0] === "begin").length;
  h.render();
  assert.equal(h.calls.filter((c) => c[0] === "begin").length, n, "no pass while collapsed");
  h.chipEl.handlers.click();
  h.render();
  assert.equal(h.mp.state().shown, true);
  assert.equal(h.chipEl.hidden, true);
  // Collapsed, the MIRROR key means ON (and clears the collapse).
  h.frameEl.handlers.click(); h.render();
  h.press(); h.render();
  assert.equal(h.mp.state().shown, true);
  assert.equal(h.mp.state().collapsed, false);
  // No chip where no mirror would show at all.
  const off = boot({ mode: "off" });
  off.render();
  assert.equal(off.chipEl.hidden, true);
});

test("the radio card goes BESIDE the mirror when the row has room, and stacks under it when not", () => {
  // Frame 440..840 at y 70..184 on a 1280-wide screen; the pause column at 1226.
  const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const wide = boot({ mode: "on", boxes: { pausebtn: box(1226, 8, 44, 44), "btn-cam": box(1138, 8, 84, 44) } });
  wide.render();
  assert.ok(wide.classes.has("hud-mirror-side"), "358px free right of the frame");
  assert.equal(wide.props["--mir-side-x"], "848.0px", "8px right of the frame");
  assert.equal(wide.props["--mir-side-w"], "358.0px", "up to the pause column less its sector-box margin");
  // The sector box under the buttons ends the strip where it is wider.
  const sec = boot({ mode: "on", boxes: { pausebtn: box(1226, 8, 44, 44), "hud-sectors": box(1100, 56, 170, 77) } });
  sec.render();
  assert.equal(sec.props["--mir-side-w"], "244.0px");
  // The cam button counts only where it shares the card's rows (BROADCAST).
  const bcast = boot({ mode: "on", boxes: { "btn-cam": box(900, 60, 84, 44) } });
  bcast.render();
  assert.ok(!bcast.classes.has("hud-mirror-side"), "44px is no room: stack under the mirror");
  // Hiding the mirror drops the side placement with it.
  wide.press(); wide.render();
  assert.equal(wide.mp.state().shown, false);
  assert.ok(!wide.classes.has("hud-mirror-side"));
});

test("the side slot stops at a touch dock group in the card's rows (cockpit BOOST at 844x390), and drops when one covers its start", () => {
  // Frame 440..840 at y 70..184, as above; the pause column at 1226.
  const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const pause = { pausebtn: box(1226, 8, 44, 44) };
  // A tap column reaching the mirror's rows ends the strip at its left edge.
  const taps = boot({ mode: "on", boxes: pause, docks: { "dock-right": [box(1100, 76, 88, 200)] } });
  taps.render();
  assert.ok(taps.classes.has("hud-mirror-side"), "1100 - 8 - 848 = 244px still fits");
  assert.equal(taps.props["--mir-side-w"], "244.0px", "ends at the dock group, not the pause column");
  // A group below the card's rows (the pedals) leaves the strip alone.
  const low = boot({ mode: "on", boxes: pause, docks: { "dock-right": [box(1000, 400, 150, 150)] } });
  low.render();
  assert.equal(low.props["--mir-side-w"], "358.0px");
  // The survey's shape: the group starts 95px past the slot - no room, stack under the mirror.
  const tight = boot({ mode: "on", boxes: pause, docks: { "dock-right": [box(943, 72, 88, 88)] } });
  tight.render();
  assert.ok(!tight.classes.has("hud-mirror-side"), "87px is no room: the card stacks, never over BOOST");
});

// #4219 (perf hunt 7): the mirror target outlived the race into the menu and garage. Quit-to-menu's
// releaseTrack(true) asks the backend to free it; a race-setup releaseTrack() keeps it.
test("releaseTrack(true) frees the backend's mirror target when it can; plain releaseTrack and a backend without it do not", () => {
  const rig = boot({ mode: "on" });
  let freed = 0;
  rig.gfx.releaseMirror = () => { freed++; return true; };
  rig.render();
  rig.mp.releaseTrack();
  assert.equal(freed, 0, "race setup keeps the target");
  rig.mp.releaseTrack(true);
  assert.equal(freed, 1, "quit-to-menu frees it");
  delete rig.gfx.releaseMirror;
  assert.doesNotThrow(() => rig.mp.releaseTrack(true), "a backend without releaseMirror is tolerated");
  rig.G.gfx = null;
  assert.doesNotThrow(() => rig.mp.releaseTrack(true), "and no backend at all");
});

test("GLX releaseMirror deletes the mirror FBO, texture and depth, is idempotent, refuses mid-pass, and re-allocates lazily", () => {
  const h = bootGlx();
  assert.equal(h.GLX.mirrorBegin(h.frame(), 256, 128), true);
  assert.equal(h.GLX.releaseMirror(), false, "never while the mirror pass is open");
  h.GLX.mirrorEnd();
  assert.equal(h.GLX.mirrorState().ready, true);
  h.reset();
  assert.equal(h.GLX.releaseMirror(), true);
  assert.deepEqual([h.count("deleteFramebuffer"), h.count("deleteTexture"), h.count("deleteRenderbuffer")], [1, 1, 1]);
  const st = h.GLX.mirrorState();
  assert.deepEqual([st.ready, st.w, st.h, st.dead], [false, 0, 0, false], "no target held, and not dead");
  h.reset();
  assert.equal(h.GLX.releaseMirror(), true, "a second release is safe");
  assert.equal(h.count("deleteTexture") + h.count("deleteFramebuffer") + h.count("deleteRenderbuffer"), 0);
  assert.equal(h.GLX.mirrorBegin(h.frame(), 256, 128), true, "the next mirror pass re-allocates");
  h.GLX.mirrorEnd();
  assert.deepEqual([h.count("createTexture"), h.count("createFramebuffer"), h.count("createRenderbuffer")], [1, 1, 1]);
  assert.equal(h.GLX.mirrorState().w, 256);
});
