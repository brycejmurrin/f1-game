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
 *   - the camera looks BACK along the car, and a rival ahead of the eye is not drawn.
 * No browser (~0.1 s). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

function boot({ mode, cam = "cockpit", soft = false, state = "race", tier = 0, throwInWorld = false, mobile = false } = {}) {
  const stored = {};
  if (mode) stored.hudMirror = mode;
  let mirrorPressed = false;
  const classes = new Set();
  const frameEl = { hidden: true, getBoundingClientRect: () => ({ left: 440, top: 70, width: 400, height: 114 }) };
  const canvasEl = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) };
  const ctx = vm.createContext({
    Math, Float32Array, Array, Object, Number, Infinity,
    document: {
      getElementById: (id) => (id === "hud-mirror" ? frameEl : id === "game" ? canvasEl : null),
      body: { classList: { contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } },
    },
    Input: { consumeMirror: () => { const v = mirrorPressed; mirrorPressed = false; return v; }, lookingBack: () => false },
    PerfGov: { tier: () => tier },
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
    mirrorRect: (r) => { calls.push(["rect", r]); },
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
    drawWorldMeshes: (frame) => { calls.push(["world", frame.viewProj, frame.mirrorLite]); if (throwInWorld) throw new Error("boom"); },
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
  const frame = { viewProj: mainVP, proj: "P", invProj: "IP", invViewProj: mainInv, eye: [0, 5, 90], cullDist: 0 };
  const frameSky = { invViewProj: mainInv };
  const render = () => mp.render(frame, frameSky, false, false, 0);
  return { mp, G, gfx, calls, stored, classes, frameEl, frame, frameSky, mainVP, mainInv, render,
    press: () => { mirrorPressed = true; } };
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
  const shed = boot({ mode: "on", tier: 3 });
  shed.render();
  assert.equal(shed.mp.state().shown, false, "the governor's crash floor sheds even ON");
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
  assert.equal(w, 400); assert.equal(h2, 114);
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
  assert.equal(w, 240); assert.equal(ht, 68);   // 60% of the 400x114 frame
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
