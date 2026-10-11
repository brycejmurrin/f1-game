// GL-aware worker defaults for capture tools and remote-group.
// Run: node --test tests/unit/browser-workers.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  glStack,
  defaultCaptureWorkers,
  defaultRemoteWorkers,
  scriptIsRenderHeavy,
  RENDER_HEAVY_SPEC_IDS,
} from "../../tools/lib/browser-workers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPTS = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;

test("glStack reads APEX_GL / GL", () => {
  assert.equal(glStack({}), "swiftshader");
  assert.equal(glStack({ APEX_GL: "llvmpipe" }), "llvmpipe");
  assert.equal(glStack({ GL: "llvmpipe" }), "llvmpipe");
  assert.equal(glStack({ APEX_GL: "angle,llvmpipe" }), "llvmpipe");
});

test("defaultCaptureWorkers: APEX_WORKERS wins; llvmpipe raises the floor", () => {
  assert.equal(defaultCaptureWorkers({ env: { APEX_WORKERS: "3" }, cpus: 8 }), 3);
  assert.equal(defaultCaptureWorkers({ env: {}, cpus: 4, defSwift: 2 }), 2);
  assert.equal(defaultCaptureWorkers({ env: { APEX_GL: "llvmpipe" }, cpus: 8 }), 4);
  assert.equal(defaultCaptureWorkers({ env: { APEX_GL: "llvmpipe" }, cpus: 2 }), 2);
});

test("scriptIsRenderHeavy matches spec basenames, not substrings", () => {
  assert.equal(scriptIsRenderHeavy("node tools/ci/run-playwright.mjs --project=render", "x"), true);
  assert.equal(scriptIsRenderHeavy("", "render"), true);
  assert.equal(scriptIsRenderHeavy(
    "node tools/ci/run-playwright.mjs tests/specs/hud-audit.spec.js", "ui"), true);
  assert.equal(scriptIsRenderHeavy(
    "node tools/ci/run-playwright.mjs tests/specs/debris.spec.js", "physics-core"), false);
  // "car" must not match inside an unrelated path; only carview-parts.spec.js etc.
  assert.equal(scriptIsRenderHeavy(
    "node tools/ci/run-playwright.mjs tests/specs/multiplayer-lobby.spec.js", "net"), false);
});

test("defaultRemoteWorkers: render-heavy → 1, light llvmpipe → 2, swiftshader → 1", () => {
  assert.deepEqual(defaultRemoteWorkers({
    group: "render", gl: "llvmpipe", script: SCRIPTS["test:render"],
  }), { workers: "1" });
  assert.deepEqual(defaultRemoteWorkers({
    group: "ui", gl: "llvmpipe", script: SCRIPTS["test:ui"],
  }), { workers: "1" });
  assert.deepEqual(defaultRemoteWorkers({
    group: "physics-core", gl: "llvmpipe", script: SCRIPTS["test:physics-core"] || "",
  }), { workers: "2" });
  assert.deepEqual(defaultRemoteWorkers({
    group: "net", gl: "llvmpipe", script: SCRIPTS["test:net"] || "",
  }), { workers: "2" });
  assert.deepEqual(defaultRemoteWorkers({
    group: "net", gl: "swiftshader", script: SCRIPTS["test:net"] || "",
  }), { workers: "1" });
  assert.deepEqual(defaultRemoteWorkers({
    group: "net", gl: "llvmpipe", script: SCRIPTS["test:net"] || "", requested: "3",
  }), { workers: "3" });
  assert.ok(defaultRemoteWorkers({ requested: "9" }).error);
});

test("RENDER_HEAVY_SPEC_IDS stays aligned with playwright.config.js RENDER_SPECS", () => {
  const cfg = fs.readFileSync(path.join(ROOT, "playwright.config.js"), "utf8");
  const block = cfg.match(/const RENDER_SPECS = \[([\s\S]*?)\]\.map/);
  assert.ok(block, "RENDER_SPECS list");
  const ids = [...block[1].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...RENDER_HEAVY_SPEC_IDS].sort(), [...ids].sort());
});
