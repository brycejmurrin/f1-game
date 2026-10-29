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
