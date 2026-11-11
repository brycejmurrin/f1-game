import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, verdict } from "../../tools/gfx/res-scale-census.mjs";

test("res-scale-census parseArgs: defaults", () => {
  const o = parseArgs([]);
  assert.equal(o.track, "monza");
  assert.deepEqual(o.scales, [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.7, 1]);
  assert.equal(o.json, null);
});

test("res-scale-census parseArgs: overrides, scale clamp, ls prefixing", () => {
  const o = parseArgs(["--track", "spa", "--scales", "1,0.4,0.75,2", "--settle", "0", "--json", "a.json", "--ls", "bloom=0"]);
  assert.equal(o.track, "spa");
  assert.deepEqual(o.scales, [1, 0.75]);
  assert.equal(o.settle, 1);
  assert.equal(o.json, "a.json");
  assert.deepEqual(o.ls, { bloom: "0" });
});

test("res-scale-census parseArgs: unknown flag throws", () => {
  assert.throws(() => parseArgs(["--nope"]), /unknown argument/);
});

test("res-scale-census verdict: the settle gate (#4783)", () => {
  const ok = { fixedTargets: false, unsettledSteps: 0, maxSettleFrames: 2, texturesStart: 27, texturesEnd: 27 };
  const got = [ok, { ...ok, maxSettleFrames: 3 }, { ...ok, unsettledSteps: 2 }, { ...ok, texturesEnd: 29 }, { ...ok, fixedTargets: true, unsettledSteps: 5, maxSettleFrames: 9 }].map(verdict);
  assert.deepEqual(got, ["ok", "FAIL: settle took 3 presented frames (> 2)", "FAIL: 2 step(s) never reached the scaled post-target size", "FAIL: textures 27 -> 29 after the sweep", "ok"]);
});

// #5450: the "Lavapipe" WebGPU arm ran on the SwiftShader fallback adapter (run 42979924558; reproduced locally
// 2026-11-11). The arm is named for the adapter it gets, and a census FAILS on any other adapter or on no read.
test("the WebGPU census arm names its adapter and refuses any other (#5450)", async () => {
  const { createRequire } = await import("node:module");
  const L = createRequire(import.meta.url)("../../tools/lib/webgpu-chrome-args.cjs");
  assert.deepEqual({ ...L.WEBGPU_CENSUS_ADAPTER }, { vendor: "google", architecture: "swiftshader" });
  assert.doesNotMatch(L.WEBGPU_CENSUS_ARM, /lavapipe/i, "the arm is not called lavapipe while Dawn hands it SwiftShader");
  assert.equal(L.adapterMismatch({ vendor: "google", architecture: "swiftshader", device: "", description: "" }), null);
  assert.equal(L.adapterMismatch({ vendor: "Google", architecture: "SwiftShader" }), null, "case is not identity");
  assert.match(L.adapterMismatch({ vendor: "mesa", architecture: "", description: "llvmpipe (LLVM 19)" }), /mesa\/\?.*not google\/swiftshader/);
  assert.match(L.adapterMismatch({ vendor: "google", architecture: "" }), /not google\/swiftshader/, "a half match is a mismatch");
  assert.match(L.adapterMismatch(null), /no WebGPU adapterInfo read/, "no read is a failure, never a pass");
});

// Every tool that launches the census arm either checks the adapter or is named here with why not (only shrinks).
const ADAPTER_UNCHECKED = new Map([
  ["tools/gfx/gfx-probe.mjs", "a probe that prints the adapter, not a census filed under a label (#5450 'not checked here')"],
  ["tools/gfx/gpu-game-check.mjs", "a GPU smoke check, not a census filed under a label (#5450 'not checked here')"],
  ["tools/perf/first-race-census.mjs", "#5450 'not checked here': needs its own adapterInfo read"],
  ["tools/perf/lit-wgsl-census.mjs", "#5450 'not checked here': needs its own adapterInfo read"],
]);
test("a tool on the census WebGPU launch checks the adapter, or is on the shrinking unchecked list (#5450)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${d}/${e.name}`) : /\.(mjs|cjs|js)$/.test(e.name) ? [`${d}/${e.name}`] : []);
  const users = walk("tools").filter((f) => !f.startsWith("tools/lib/") &&
    fs.readFileSync(path.join(root, f), "utf8").includes("WEBGPU_LAVAPE_CHROMIUM_ARGS"));
  assert.ok(users.includes("tools/gfx/res-scale-census.mjs"), "premise: the scan finds the census tools");
  for (const f of users) {
    const checks = /adapterMismatch\(/.test(fs.readFileSync(path.join(root, f), "utf8"));
    if (ADAPTER_UNCHECKED.has(f)) assert.ok(!checks, `${f} checks the adapter now: drop it from ADAPTER_UNCHECKED`);
    else assert.ok(checks, `${f} launches the census WebGPU arm without adapterMismatch(): a run on another adapter would be filed under the wrong name`);
  }
  for (const f of ADAPTER_UNCHECKED.keys()) assert.ok(users.includes(f), `${f} no longer launches the arm: drop it from ADAPTER_UNCHECKED`);
});
