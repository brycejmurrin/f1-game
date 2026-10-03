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
 *     into #bc-pip, its neighbours drawn wherever it is (js/race/broadcast.js).
 * No browser (~0.1 s). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

function boot({ mode, cam = "cockpit", soft = false, state = "race", tier = 0, throwInWorld = false, mobile = false, boxes = {}, bc = false, pipMode } = {}) {
  const stored = {};
  if (mode) stored.hudMirror = mode;
  if (pipMode) stored.bcPip = pipMode;
  let mirrorPressed = false;
  const classes = new Set(bc ? ["bc-on"] : []), props = {};
  const on = (o) => Object.assign(o, { handlers: {}, addEventListener(t, f) { this.handlers[t] = f; } });
  const styles = new Map(), timers = new Map();
  let timerId = 0;
  const style = { getPropertyValue: k => styles.get(k)?.value || "", getPropertyPriority: k => styles.get(k)?.priority || "",
    setProperty: (k, value, priority = "") => styles.set(k, { value, priority }), removeProperty: k => styles.delete(k) };
  const frameEl = on({ hidden: true, style, getBoundingClientRect: () => ({ left: 440, top: 70, width: 400, height: 114, right: 840, bottom: 184 }) });
  const chipEl = on({ hidden: true });
  const pipEl = on({ hidden: true, getBoundingClientRect: () => ({ left: 900, top: 60, width: 360, height: 202, right: 1260, bottom: 262 }) });
  // The TV rig: a POOLED answer, as js/camera/vantage.js returns — the pass must copy it.
  const vant = [], pooled = { eye: [0, 0, 0], tgt: [0, 0, 0], fov: 40 };
  const canvasEl = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) };
  const ctx = vm.createContext({
    Math, Float32Array, Array, Object, Number, Infinity, innerWidth: 1280,
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    document: {
      getElementById: (id) => (id === "hud-mirror" ? frameEl : id === "hud-mirror-chip" ? chipEl : id === "game" ? canvasEl : id === "bc-pip" ? pipEl
        : boxes[id] ? { hidden: false, getBoundingClientRect: () => boxes[id] } : null),
      body: { classList: { contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
        style: { setProperty: (k, v) => { props[k] = v; } } },
    },
    Input: { consumeMirror: () => { const v = mirrorPressed; mirrorPressed = false; return v; }, lookingBack: () => false },
    PerfGov: { tier: () => tier },
    performance: { now: () => 0 },
    GameCams: { vantage: (_t, m, s, x, spd) => { vant.push({ m, s, x, spd }); pooled.eye[0] = 0; pooled.eye[1] = 4; pooled.eye[2] = s - 12;
      pooled.tgt[0] = 0; pooled.tgt[1] = 1; pooled.tgt[2] = s + 20; return pooled; } },
    CamModes: { CAM_MODES: [{ id: "chase" }, { id: "far" }, { id: "drift" }, { id: "cockpit" }] },
    // A straight road along +Z; the track's +x-right is world −X (AGENTS.md).
    Tracks: {
      sample: (_t, s, out) => { out.p[0] = 0; out.p[1] = 0; out.p[2] = s; out.t[0] = 0; out.t[1] = 0; out.t[2] = 1;
        out.r[0] = -1; out.r[1] = 0; out.r[2] = 0; return out; },
      banking: () => null,
    },
  });
  seedLog(ctx);
  vm.runInContext(read("js/core/mat4.js").replace(/^const\b/gm, "var"), ctx, { filename: "mat4.js" });
  vm.runInContext(read("js/render/shared/mirror-pass.js").replace(/^const\b/gm, "var"), ctx, { filename: "mirror-pass.js" });
  const calls = [];
  let st = { dead: false, ready: false };
  const gfx = {
    width: 1280, height: 720, mobileTier: mobile,
    softPresent: () => soft,
    mirrorBegin: (frame, w, h) => { calls.push(["begin", w, h, frame.viewProj, frame.eye.slice(), frame.cullDist]); return true; },
    mirrorEnd: () => { calls.push(["end"]); st = { dead: false, ready: true }; },
    mirrorRect: (r, flip) => { calls.push(["rect", r, flip]); },
    mirrorState: () => st,
    draw: (mesh, m) => { calls.push(["draw", mesh, Float32Array.from(m)]); },
    drawSky: (sky) => { calls.push(["sky", sky.invViewProj]); },
  };
  const player = { isPlayer: true, s: 100, team: "p" };
  const behind = { s: 80, team: "b" }, ahead = { s: 130, team: "a" }, far = { s: -100, team: "f" };   // far: 200 m back
  const G = {
    gfx, state, player, cars: [player, behind, ahead, far], track: { total: 5000 }, camMode: ["chase", "far", "drift", "cockpit"].indexOf(cam),
    dbgCam: null, hideMeshes: {}, frozen: false,
    store: { get: (k, d) => (k in stored ? stored[k] : d), set: (k, v) => { stored[k] = v; } },
  };
  const deps = {
    drawWorldMeshes: (frame) => { calls.push(["world", frame.viewProj, frame.mirrorLite, Object.assign({}, frame.tune)]); if (throwInWorld) throw new Error("boom"); },
    teamMesh: (team) => "mesh:" + team,
    renderPosOf: (c) => ({ world: true, x: 0, z: c.s }),
    playerAnchor: (c) => ({ cS: c.s, cX: 0 }),
    yawVisInterp: () => 0,
    basisMat: (r, u, f, p, out) => {
      out.set([r[0], r[1], r[2], 0, u[0], u[1], u[2], 0, f[0], f[1], f[2], 0, p[0], p[1], p[2], 1]); return out;
    },
    carPaint: () => ({}),
  };
  const mp = ctx.MirrorPass.create(G, deps);
  const mainVP = new Float32Array(16), mainInv = new Float32Array(16);
  const tune = { carSunGlint: 12, carSparkle: 1.6, windowSunFlash: 1, shadowStr: 1.15, keyMul: 1.1 };
  const frame = { viewProj: mainVP, proj: "P", invProj: "IP", invViewProj: mainInv, eye: [0, 5, 90], cullDist: 0, tune };
  const frameSky = { invViewProj: mainInv };
  const render = () => mp.render(frame, frameSky, false, false, 0);
  return { mp, G, gfx, calls, stored, classes, props, frameEl, chipEl, pipEl, vant, pooled, frame, frameSky, mainVP, mainInv, render, timers,
    press: () => { mirrorPressed = true; }, setTier: (t) => { tier = t; } };
}

test("AUTO shows the mirror in an onboard view on a hardware renderer, and not in chase", () => {
  const onboard = boot({ cam: "cockpit" });
  onboard.render();
  assert.equal(onboard.mp.state().shown, true);
  assert.equal(onboard.frameEl.hidden, false);
  assert.ok(onboard.classes.has("hud-mirror-on"), "the radio card / flag step-down class");
  const chase = boot({ cam: "chase" });
  chase.render();
  assert.equal(chase.mp.state().shown, false);
  assert.equal(chase.calls.filter((c) => c[0] === "begin").length, 0, "no pass when hidden");
  assert.deepEqual(chase.calls.filter((c) => c[0] === "rect").map((c) => c[1]), [null], "and no composite");
});

test("AUTO sheds a software renderer; ON keeps it; OFF and the countdown never draw", () => {
  const soft = boot({ soft: true });
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
  const phone = boot({ mobile: true, cam: "cockpit" });
  phone.render();
  assert.equal(phone.mp.state().shown, true, "AUTO in the cockpit on a phone");
  assert.equal(phone.mp.state().quality, "lite");
});

test("the MIRROR key turns off what shows, and on what does not, and persists it", () => {
  const h = boot({ cam: "cockpit" });
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

test("only governor tier 2 halves the cadence", () => {
  const h = boot({ mode: "on", tier: 2 });
  for (let i = 0; i < 4; i++) h.render();
  // Frame 1 always draws (nothing to show yet); after that every other frame.
  assert.equal(h.calls.filter((c) => c[0] === "begin").length, 3);
});

test("the quality ladder: full, lite, low (tier 2-3, half rate), min (tier 4+, a third)", () => {
  const cases = [[{ tier: 0 }, "full", 800, 228], [{ mobile: true }, "lite", 480, 137],
    [{ tier: 3 }, "low", 400, 114], [{ tier: 4 }, "min", 320, 91]];
  for (const [opt, q, w, ht] of cases) {
    const h = boot(Object.assign({ mode: "on" }, opt));
    h.render();
    const b = h.calls.find((c) => c[0] === "begin");
    assert.equal(h.mp.state().quality, q);
    assert.deepEqual([b[1], b[2]], [w, ht], q + " target");
  }
  const min = boot({ mode: "on", tier: 4 });
  for (let i = 0; i < 6; i++) min.render();
  // Frame 1 always draws; then frames 3 and 6.
  assert.equal(min.calls.filter((c) => c[0] === "begin").length, 3);
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
  assert.deepEqual(size(), [400, 114], "low rung: half of the 400x114 frame, x2 supersampled");
  // Dynamic resolution rescales the render buffer; the mirror target does not move.
  h.gfx.width = 640; h.gfx.height = 360;
  for (let i = 0; i < 4; i++) h.render();
  assert.deepEqual(size(), [400, 114], "sized from the frame's CSS box, not the render buffer");
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
  const seen = h.calls.find((c) => c[0] === "world")[3];
  // Glint, sparkle, window flash and cast shadows alias / sweep in a small
  // un-antialiased target — a phone report of a "flashy" mirror in the sun.
  assert.deepEqual([seen.carSunGlint, seen.carSparkle, seen.windowSunFlash, seen.shadowStr], [0, 0, 0, 0]);
  assert.equal(seen.keyMul, 1.1, "every other LIGHTING knob reaches the mirror unchanged");
  assert.equal(h.frame.tune, own, "the main pass gets its own tune object back");
  assert.equal(own.carSunGlint, 12, "and it is never written to");
  // The tuner edits its object in place; the next mirror pass follows it.
  own.keyMul = 0.9;
  h.render();
  assert.equal(h.calls.filter((c) => c[0] === "world").pop()[3].keyMul, 0.9);
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

test("race preparation lets the main warm run first, then draws the actual hidden rear view at its real size", async () => {
  const h = boot({ state: "count" });
  const originalBox = h.frameEl.getBoundingClientRect;
  h.frameEl.style.setProperty("visibility", "collapse", "important");
  h.frameEl.getBoundingClientRect = () => {
    assert.equal(h.frameEl.hidden, false, "layout is measurable");
    assert.equal(h.frameEl.style.getPropertyValue("visibility"), "hidden", "never visible even without a cover");
    return originalBox();
  };
  let warming = false;
  h.gfx.warming = () => warming;
  const ready = h.mp.prepareRace();
  assert.equal(h.mp.prepareRace(), ready, "duplicate entry shares its pending preparation");
  assert.equal(h.mp.preparing(), true);
  h.render();
  assert.equal(h.calls.some(c => c[0] === "begin"), false, "first slot allows the main present to start its queued warm");
  warming = true; h.render();
  assert.equal(h.calls.some(c => c[0] === "begin"), false, "never draws across renderer compile ownership");
  warming = false; h.render();
  assert.equal(await ready, true);
  assert.equal(h.mp.preparing(), false); assert.equal(h.timers.size, 0);
  assert.equal(h.frameEl.hidden, true);
  assert.equal(h.frameEl.style.getPropertyValue("visibility"), "collapse");
  assert.equal(h.frameEl.style.getPropertyPriority("visibility"), "important");
  assert.equal(h.mp.state().shown, false); assert.equal(h.classes.has("hud-mirror-on"), false);
  assert.ok(h.calls.filter(c => c[0] === "rect").every(c => c[1] === null), "no composite during preparation");
  const begin = h.calls.find(c => c[0] === "begin");
  assert.deepEqual(begin.slice(1, 3), [800, 228]);
  assert.notEqual(begin[3], h.mainVP, "the real reverse camera is used");
  assert.deepEqual(h.calls.filter(c => c[0] === "draw").map(c => c[1]), ["mesh:b", "mesh:f"], "actual rear rivals, never player/ahead");
  assert.equal(h.frame.viewProj, h.mainVP); assert.equal(h.frameSky.invViewProj, h.mainInv);
  assert.equal(h.G.state, "count", "does not impersonate race state");
  h.frameEl.getBoundingClientRect = originalBox;
  h.G.state = "race"; h.render();
  assert.equal(h.calls.filter(c => c[0] === "begin").length, 2, "first visible frame still draws fresh");
  assert.deepEqual(h.calls.filter(c => c[0] === "begin")[1].slice(1, 3), [800, 228], "same-sized real target can be reused");
});

test("preparation follows real eligibility, quality and current layout", async () => {
  for (const options of [{mode:"off"}, {cam:"chase"}, {soft:true}, {bc:true}, {state:"race"}]) {
    const h = boot({state:"count", ...options});
    assert.equal(await h.mp.prepareRace(), false);
    assert.equal(h.mp.preparing(), false); assert.equal(h.timers.size, 0);
  }
  const h = boot({state:"count", mode:"on", cam:"chase", soft:true, tier:4});
  const ready = h.mp.prepareRace(); h.render();
  h.frameEl.getBoundingClientRect = () => ({width:500,height:140});
  h.render(); assert.equal(await ready, true);
  assert.deepEqual(h.calls.find(c => c[0] === "begin").slice(1,3), [400,112], "latest layout and min quality, not a guessed fixed target");
  h.G.state="race"; h.render();
  assert.equal(h.calls.filter(c => c[0] === "begin").length, 2, "even cadence-limited quality draws the first live frame");
});

test("preparation retries a temporarily unavailable target and has a bounded deadline", async () => {
  const h = boot({state:"count"});
  const begin = h.gfx.mirrorBegin;
  let available = false;
  h.gfx.mirrorBegin = (...args) => available ? begin(...args) : false;
  const ready = h.mp.prepareRace(); h.render(); h.render();
  assert.equal(h.mp.preparing(), true); assert.equal(h.calls.some(c=>c[0]==="end"), false);
  assert.equal(h.frame.viewProj, h.mainVP);
  available = true; h.render(); assert.equal(await ready, true);
  const timeout = h.mp.prepareRace();
  const timer = [...h.timers.values()][0]; assert.equal(timer.ms, 30000);
  timer.fn(); assert.equal(await timeout, false); assert.equal(h.mp.preparing(), false);
  assert.equal(h.timers.size, 0);
});

test("cancel, standDown, stale subjects and in-place backend replacement settle without drawing", async () => {
  for (const change of [h=>h.mp.cancelPreparation(), h=>h.mp.standDown(), h=>{h.G.state="menu";},
    h=>{h.G.player={};}, h=>{h.G.track={};}, h=>{h.G.gfx={};}, h=>{h.gfx.mirrorBegin=()=>true;}, h=>{h.gfx.mirrorEnd=()=>{};}, h=>h.mp.setMode("off")]) {
    const h=boot({state:"count"}); const ready=h.mp.prepareRace(); h.render(); change(h); h.render();
    assert.equal(await ready,false); assert.equal(h.mp.preparing(),false);
    assert.equal(h.calls.some(c=>c[0]==="begin"),false); assert.equal(h.timers.size,0);
  }
  const h=boot({state:"count"}); const old=h.mp.prepareRace(), staleTimer=[...h.timers.values()][0].fn;
  h.mp.cancelPreparation(); assert.equal(await old,false);
  const latest=h.mp.prepareRace(); staleTimer(); assert.equal(h.mp.preparing(),true,"expired owner cannot cancel newer preparation");
  h.render();h.render();assert.equal(await latest,true);
});

test("preparation failure restores both hidden layout and swapped frame fields", async () => {
  for (const where of ["measure","world","end"]) {
    const h=boot({state:"count",throwInWorld:where==="world"});
    if(where==="measure") h.frameEl.getBoundingClientRect=()=>{throw new Error("measure failed");};
    if(where==="end") h.gfx.mirrorEnd=()=>{throw new Error("end failed");};
    const ready=h.mp.prepareRace(); h.render(); assert.doesNotThrow(()=>h.render());
    assert.equal(await ready,false);assert.equal(h.mp.preparing(),false);assert.equal(h.timers.size,0);
    assert.equal(h.frameEl.hidden,true);assert.equal(h.frameEl.style.getPropertyValue("visibility"),"");
    assert.equal(h.frame.viewProj,h.mainVP);assert.equal(h.frameSky.invViewProj,h.mainInv);
    assert.deepEqual(h.frame.eye,[0,5,90]);assert.equal(h.frame.proj,"P");assert.equal(h.frame.invProj,"IP");
  }
});

test("a visible mirrorEnd failure still restores the main frame before propagating", () => {
  const h=boot({mode:"on"});h.gfx.mirrorEnd=()=>{throw new Error("end failed");};
  assert.throws(()=>h.render(),/end failed/);
  assert.equal(h.frame.viewProj,h.mainVP);assert.equal(h.frameSky.invViewProj,h.mainInv);
  assert.deepEqual(h.frame.eye,[0,5,90]);assert.equal(h.frame.proj,"P");assert.equal(h.frame.invProj,"IP");
});

test("a restart hides the old mirror and a skipped entry clears old preparation success", async () => {
  const h=boot({mode:"on"});h.render();
  assert.equal(h.frameEl.hidden,false);assert.equal(h.mp.state().shown,true);
  h.G.state="count";const ready=h.mp.prepareRace();
  assert.equal(h.frameEl.hidden,true);assert.equal(h.mp.state().shown,false);
  assert.equal(h.classes.has("hud-mirror-on"),false);
  assert.equal(h.calls.at(-1)[1],null,"old composite cleared before any preparation frame");
  h.render();h.render();assert.equal(await ready,true);assert.equal(h.mp.state().prepared,true);
  h.mp.setMode("off");assert.equal(await h.mp.prepareRace(),false);assert.equal(h.mp.state().prepared,false);
});

test("caught backend failures and stale ready targets do not claim preparation success", async () => {
  for(const state of [{dead:true,ready:false},{dead:false,ready:false},{dead:false,ready:true,renders:3}]) {
    const h=boot({state:"count"});
    // Initial target is valid enough to attempt preparation; mirrorEnd can
    // catch an error and report dead/not-ready, or retain a stale ready target.
    let ended=false;
    h.gfx.mirrorState=()=>ended?state:{dead:false,ready:true,renders:3};
    h.gfx.mirrorEnd=()=>{ended=true;};
    const ready=h.mp.prepareRace();h.render();h.render();
    assert.equal(await ready,false);assert.equal(h.mp.state().prepared,false);
    assert.equal(h.frame.viewProj,h.mainVP);assert.equal(h.frameSky.invViewProj,h.mainInv);
  }
  const h=boot({state:"count"});h.gfx.mirrorState=()=>{throw new Error("dead backend");};
  assert.equal(await h.mp.prepareRace(),false,"optional preparation remains non-throwing");
});
