// Shared VM rig for the mirror-pass*.test.mjs files (split from mirror-pass.test.mjs, T3-16): boot() runs the
// game side of js/render/shared/mirror-pass.js against a recording renderer. Moved verbatim.
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "./abs-src.mjs";

export const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

export function boot({ mode, cam = "cockpit", soft = false, state = "race", tier = 0, autoTier, userTier, isMobile = false, throwInWorld = false, mobile = false, boxes = {}, docks = {}, bc = false, pipMode, clock = { t: 0 }, xr = null, rankLights = false } = {}) {
  const writes = { cls: 0, prop: 0 };   // <body> class toggles and custom-property writes
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
        : boxes[id] ? { hidden: false, getBoundingClientRect: () => boxes[id] }
        : docks[id] ? { children: docks[id].map((r) => ({ getBoundingClientRect: () => r })) } : null),
      body: { classList: { contains: (c) => classes.has(c), toggle: (c, on) => { writes.cls++; return on ? classes.add(c) : classes.delete(c); } },
        style: { setProperty: (k, v) => { writes.prop++; props[k] = v; } } },
    },
    Input: { consumeMirror: () => { const v = mirrorPressed; mirrorPressed = false; return v; }, lookingBack: () => false },
    // autoTier/userTier only when a test names them: the older governor shape had tier() alone.
    PerfGov: Object.assign({ tier: () => tier }, autoTier === undefined ? {} : { autoTier: () => autoTier },
      userTier === undefined ? {} : { userTier: () => userTier }),
    performance: { now: () => clock.t },
    ...(xr ? { XrBoot: { comfort: () => xr.on } } : {}),
    GameCams: { vantage: (_t, m, s, x, spd) => { vant.push({ m, s, x, spd }); pooled.eye[0] = 0; pooled.eye[1] = 4; pooled.eye[2] = s - 12;
      pooled.tgt[0] = 0; pooled.tgt[1] = 1; pooled.tgt[2] = s + 20; return pooled; } },
    CamModes: { CAM_MODES: [{ id: "chase" }, { id: "far" }, { id: "drift" }, { id: "cockpit" }, { id: "helmet" }] },
    // A straight road along +Z; the track's +x-right is world −X (AGENTS.md).
    Tracks: {
      sample: (_t, s, out) => { out.p[0] = 0; out.p[1] = 0; out.p[2] = s; out.t[0] = 0; out.t[1] = 0; out.t[2] = 1;
        out.r[0] = -1; out.r[1] = 0; out.r[2] = 0; return out; },
      banking: () => null,
    },
  });
  seedLog(ctx);
  const profileMarks = [];   // RaceEntryProfile.mark() names, in order (the programWarm sub-span)
  ctx.RaceEntryProfile = { mark: (n) => profileMarks.push(n) };
  vm.runInContext(read("js/core/mat4.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/core/mat4.js") });
  if (rankLights) {
    ctx.LightKnobs = { LT: { lampWarmup: 0, lampFlicker: 0 } };
    vm.runInContext(read("js/render/shared/light-budget.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/render/shared/light-budget.js") });
    vm.runInContext(read("js/lighting/frame-lights.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/lighting/frame-lights.js") });
  }
  vm.runInContext(read("js/render/shared/mirror-pass.js").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/render/shared/mirror-pass.js") });
  const calls = [];
  let st = { dead: false, ready: false };
  const gfx = {
    width: 1280, height: 720, mobileTier: mobile, isMobile: mobile || isMobile,
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
    gfx, state, player, cars: [player, behind, ahead, far], track: { total: 5000 }, camMode: ["chase", "far", "drift", "cockpit", "helmet"].indexOf(cam),
    dbgCam: null, hideMeshes: {}, frozen: false,
    store: { get: (k, d) => (k in stored ? stored[k] : d), set: (k, v) => { stored[k] = v; } },
  };
  const deps = {
    // tune: the knobs read BY NAME, the way every backend reads frame.tune (the mirror's is a prototype view).
    drawWorldMeshes: (frame) => { const t = frame.tune;
      calls.push(["world", frame.viewProj, frame.mirrorLite, !!frame.mirrorFreezeInstanced,
        { carSunGlint: t.carSunGlint, carSparkle: t.carSparkle, windowSunFlash: t.windowSunFlash, shadowStr: t.shadowStr, keyMul: t.keyMul }, t,
        frame.lights ? (frame.lights.length / 15) | 0 : 0, frame.tailStart | 0, frame.tailCount | 0]);
      if (throwInWorld) throw new Error("boom"); },
    drawCar: (c, m) => gfx.draw("mesh:" + c.team, m),   // CarDraw.drawMirrorCar in the game (the real one: the test below)
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
  return { mp, G, gfx, calls, profileMarks, stored, classes, props, writes, clock, frameEl, chipEl, pipEl, vant, pooled, frame, frameSky, mainVP, mainInv, render, timers,
    FL: rankLights ? ctx.FrameLights : null,
    press: () => { mirrorPressed = true; }, setTier: (t) => { tier = t; } };
}
