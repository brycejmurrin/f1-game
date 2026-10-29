// perf-hunt-4 — source guards for the wins of the 2026-10-29 code-survey perf sweep. Each is a
// bit-identical or behaviour-preserving cut that a later edit could silently undo: TLX lost the
// GLX exact-zero noise gates once already (the shader-parity lag this sweep found).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("TLX world material gates every fade-weighted vnoise on its weight (GLX G4 parity)", () => {
  const src = read("js/render/three/tsl-lit.js");
  // concrete, metal, wood, foliage, fabric, sand, grass, snow, roof, asphalt (near/fade) + the ground fine octave
  const gated = (src.match(/If\((?:near|brushFade|weaveFade|sparkleFade|fineFade)\.greaterThan\(0\.0\)/g) || []).length;
  assert.ok(gated >= 11, "gated fade-weighted noise terms: " + gated);
});

test("puddle noise is skipped where the weight is exactly zero, in all three shading languages", () => {
  const tsl = read("js/render/three/tsl-lit.js"), glsl = read("js/render/glx/shaders/glsl-lit.js"),
    wgsl = read("js/render/webgpu/wgsl-chunks.js");
  assert.match(tsl, /If\(pg\.greaterThan\(0\.0\)\.and\(upFace\.greaterThan\(0\.0\)\)\.and\(porous\.lessThan\(0\.5\)\)/);
  assert.match(glsl, /if \(pg > 0\.0 && upFace > 0\.0 && porous < 0\.5\) \{\s*\n\s*float pn = vnoise/);
  assert.match(wgsl, /if \(pg > 0\.0 && upFace > 0\.0 && porous < 0\.5\) \{\s*\n\s*let pn = svnoise/);
});

test("TLX particle fog distance is a vertex varying; godray march rejects on squared distance", () => {
  assert.match(read("js/render/three/tsl-fx.js"), /varying\(length\(cameraPosition\.sub\(vec3\(positionGeometry\)\)\)\)/);
  const post = read("js/render/three/tsl-post.js");
  assert.match(post, /ld2 = dot\(LP, LP\)/);
  assert.match(post, /If\(ld2\.lessThanEqual\(rad\.mul\(rad\)\)/);
});

test("audio: SOUND OFF suspends the context and SFX OFF builds no engine graph", () => {
  const src = read("js/audio/engine.js");
  assert.match(src, /function startEngineGraph\(\) \{\s*\n\s*if \(!ctx \|\| engineOn\) return;[\s\S]{0,400}if \(!sfxOk\(\)\) \{ engineWanted = true; return; \}/);
  assert.match(src, /mutedSuspended = true;\s*\n\s*try \{\s*\n\s*const p = ctx\.suspend\(\)/);
  assert.match(src, /if \(mutedSuspended && !isEnabled\) return;   \/\/ muted on purpose/);
});

test("garage bay caps a settled phone bay and netplay staggers + skips the relay origin", () => {
  assert.match(read("js/garage/setup-camera.js"), /_bayAcc \+= dt; return false;/);
  const net = read("js/net/netplay.js");
  assert.match(net, /last\.at = now - \(wire % 24\) \* \(1000 \/ 24\)/);
  assert.match(net, /broadcastStrategy\(strategyState\(r\.car, d\.wire, d\.track\), id\)/);
});

// Behaviour, not source: SOUND OFF suspends the (fake) context and a later tap does not wake it;
// SFX OFF builds no engine graph and SFX ON builds it. Game VM + tests/unit/fake-audio-vm.cjs.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

async function bootAudio() {
  const { createGame, settle } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));
  const { install } = require("./fake-audio-vm.cjs");
  let fa = null;
  const g = await createGame({ carMeshes: false, onSandbox: (sb) => { fa = install(sb); } });
  const sb = g.sandbox;
  sb.dispatchEvent({ type: "pointerdown", pointerType: "mouse" });
  await settle(() => !sb.GameAudio._stub && !sb.AudioPanel._stub, 4000);
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
  sb.GameAudio.init();
  const ctx = fa.made[fa.made.length - 1];
  const calls = { suspend: 0, resume: 0 };
  ctx.suspend = () => { calls.suspend++; ctx.state = "suspended"; if (ctx.onstatechange) ctx.onstatechange(); return Promise.resolve(); };
  ctx.resume = () => { calls.resume++; ctx.state = "running"; if (ctx.onstatechange) ctx.onstatechange(); return Promise.resolve(); };
  return { g, sb, fa, ctx, calls };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("SOUND OFF suspends the context; a tap leaves it suspended; SOUND ON resumes it", async () => {
  const { g, sb, ctx, calls } = await bootAudio();
  try {
    assert.equal(ctx.state, "running");
    sb.GameAudio.setEnabled(false);
    g.flushTimers();   // the VM queues setTimeout; fire the post-glide suspend
    await wait(5);
    assert.equal(ctx.state, "suspended", "muted context is suspended after the gain glide");
    sb.dispatchEvent({ type: "pointerdown", pointerType: "touch", isTrusted: true });
    await wait(20);
    assert.equal(ctx.state, "suspended", "a gesture must not wake a context muted on purpose");
    sb.GameAudio.setEnabled(true);
    await wait(20);
    assert.equal(ctx.state, "running", "SOUND ON resumes");
    assert.ok(calls.suspend === 1 && calls.resume >= 1, JSON.stringify(calls));
  } finally { g.close(); }
});

test("SFX OFF builds no engine graph; SFX ON mid-race builds it", async () => {
  const { g, sb, fa } = await bootAudio();
  try {
    const oscs = () => [...fa.live].filter((n) => (n.kind === "osc" || n.kind === "src") && n.started && n.stopAt === undefined).length;
    sb.GameAudio.setSfxEnabled(false);
    const before = oscs();
    sb.GameAudio.startEngine();
    assert.equal(oscs(), before, "no engine sources start with SFX off");
    sb.GameAudio.setSfxEnabled(true);
    assert.ok(oscs() > before + 5, "SFX ON builds the engine graph: " + (oscs() - before));
    sb.GameAudio.setSfxEnabled(false);
    sb.GameAudio.stopEngine();
  } finally { g.close(); }
});
