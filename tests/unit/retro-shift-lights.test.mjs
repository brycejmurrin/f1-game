// #3297 — Retro (2000s) shift lights must never go fully dark at the limiter.
// getLedStrip's contract: lit 9 = SHIFT NOW (all blue), lit 8 = full ramp; the
// caller alternates 8 and 9 (~7 Hz), steady 9 under reduced motion. The retro
// path previously passed t*14%1<.5?9:0 and painted every lens dark half the
// frames. Behaviour via CarMesh VM draws; no source-text pins; no browser (~0.2 s).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function loadMesh(docMotion) {
  const made = [], draws = [];
  const document = {
    documentElement: { dataset: { motion: docMotion || "" } },
  };
  const ctx = {
    Log: { info() {}, warn() {}, error() {} },
    GaragePrims: { block() {} },
    window: null,
    document,
    matchMedia: () => ({ matches: false }),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: absSrc("js/core/mat4.js") });
  vm.runInContext(read("js/physics/consts.js"), ctx, { filename: absSrc("js/physics/consts.js") });
  vm.runInContext(read("js/car/cockpit-rig.js"), ctx, { filename: absSrc("js/car/cockpit-rig.js") });
  vm.runInContext(read("js/car/car-mesh.js") + "\n;this.CarMesh = CarMesh; this.PhysicsConsts = PhysicsConsts;", ctx, {
    filename: absSrc("js/car/car-mesh.js"),
  });
  ctx.CarMesh.init({
    createMesh(d) { const m = { d }; made.push(m); return m; },
    freeMesh() {},
    draw(m, mat, opt) { draws.push({ mesh: m, mat: [...mat], opt: { ...opt } }); },
  });
  return { CarMesh: ctx.CarMesh, PhysicsConsts: ctx.PhysicsConsts, draws, document };
}

function limiterRpm(PC) {
  // rpm frac > 0.965 of the IDLE→MAX sweep.
  return PC.IDLE_RPM + 0.98 * (PC.MAX_RPM - PC.IDLE_RPM);
}

test("at the limiter, retro draws lit 9 then lit 8 — never lit 0", () => {
  const { CarMesh, PhysicsConsts, draws } = loadMesh();
  const mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const c = { gear: 5, energy: 0, rpm: limiterRpm(PhysicsConsts) };
  const strip0 = CarMesh.getLedStrip(0);
  const strip8 = CarMesh.getLedStrip(8);
  const strip9 = CarMesh.getLedStrip(9);

  // t*14%1 < 0.5 → SHIFT NOW (9)
  draws.length = 0;
  CarMesh.drawRetroTelemetry(mat, c, 200, 0);
  assert.ok(draws.some((d) => d.mesh === strip9), "phase A draws the all-blue SHIFT strip");
  assert.ok(!draws.some((d) => d.mesh === strip0), "phase A never draws the dark strip");

  // t*14%1 >= 0.5 → full ramp (8), not dark
  draws.length = 0;
  CarMesh.drawRetroTelemetry(mat, c, 200, 0.05); // 0.05*14 = 0.7
  assert.ok(draws.some((d) => d.mesh === strip8), "phase B draws the full-ramp strip");
  assert.ok(!draws.some((d) => d.mesh === strip0), "phase B never draws the dark strip");
  assert.ok(!draws.some((d) => d.mesh === strip9), "phase B is the ramp half, not SHIFT");
});

test("reduced motion holds SHIFT (lit 9) steady at the limiter", () => {
  const { CarMesh, PhysicsConsts, draws } = loadMesh("reduce");
  const mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const c = { gear: 5, energy: 0, rpm: limiterRpm(PhysicsConsts) };
  const strip9 = CarMesh.getLedStrip(9);
  const strip8 = CarMesh.getLedStrip(8);
  const strip0 = CarMesh.getLedStrip(0);

  for (const t of [0, 0.05, 0.1, 0.2]) {
    draws.length = 0;
    CarMesh.drawRetroTelemetry(mat, c, 200, t);
    assert.ok(draws.some((d) => d.mesh === strip9), `t=${t}: reduced motion stays on SHIFT`);
    assert.ok(!draws.some((d) => d.mesh === strip8), `t=${t}: no ramp flash under reduce`);
    assert.ok(!draws.some((d) => d.mesh === strip0), `t=${t}: never dark`);
  }
});
