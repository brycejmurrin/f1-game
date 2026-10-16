/* night-washout-presets.test.mjs — per-track night|dry mast / street pool trims.
 *
 * Qatar/Bahrain carry the full flood-mast ring fix (docs/notes/NIGHT-MAST-POOLS-2026-10-05.md).
 * Abu Dhabi, Madrid and Jeddah ship the same BEAM CORE / cone / bleed package when
 * lamp-bake + SwiftShader shots still read as a flat pool under tall masts or
 * dense street rows.
 *
 * Run: node --test tests/unit/night-washout-presets.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function presets() {
  const ctx = vm.createContext({ window: {}, Math, JSON, Object, Array });
  vm.runInContext(read("js/lighting/presets.js"), ctx, { filename: "js/lighting/presets.js" });
  return vm.runInContext("window.LightPresets", ctx);
}

const MAST_RING_FIX = Object.freeze({
  poolEnergy: 0.85,
  keyMul: 1,
  lampRadiusMul: 1.3,
  beamCore: 0.5,
  beamCone: 0.5,
  bleedMul: 0.6,
  lampTemp: 0,
});

const MAST_THROW_FIX = Object.freeze({
  poolEnergy: 0.85,
  keyMul: 1,
  lampRadiusMul: 0.85,
  bounceK: 0.06,
  beamCore: 0.5,
  beamCone: 0.5,
  bleedMul: 0.6,
  lampTemp: 0,
});

test("qatar and bahrain keep the shipped flood-mast ring night|dry trim", () => {
  const P = presets();
  for (const id of ["qatar", "bahrain"]) {
    const o = P[`${id}|night|dry`];
    assert.ok(o, `${id}|night|dry`);
    for (const [k, v] of Object.entries(MAST_RING_FIX)) {
      // #2260: Qatar's ring + its own ssrDryNight read brighter than midday (road 0.82);
      // its pools are trimmed to 0.6 with ssrDryNight 0.05. Bahrain keeps the ring trim.
      const want = id === "qatar" && k === "poolEnergy" ? 0.6 : v;
      assert.equal(o[k], want, `${id}|night|dry.${k}`);
    }
    if (id === "qatar") assert.equal(o.ssrDryNight, 0.05, "qatar|night|dry.ssrDryNight (#2260)");
  }
});

test("abudhabi and madrid pin the tall-mast pool trim (beam + radius + bounce)", () => {
  const P = presets();
  for (const id of ["abudhabi", "madrid"]) {
    const o = P[`${id}|night|dry`];
    assert.ok(o, `${id}|night|dry`);
    for (const [k, v] of Object.entries(MAST_THROW_FIX)) {
      assert.equal(o[k], v, `${id}|night|dry.${k}`);
    }
  }
});

test("jeddah night|dry trims street-lamp cores without the desert ring radius", () => {
  const P = presets();
  const o = P["jeddah|night|dry"];
  assert.ok(o);
  assert.equal(o.lampTemp, 0);
  assert.equal(o.keyMul, 1);
  assert.equal(o.lampRadiusMul, 0.85);
  assert.equal(o.bounceK, 0.06);
  assert.equal(o.beamCore, 0.55);
  assert.equal(o.beamCone, 0.55);
  assert.equal(o.bleedMul, 0.65);
  assert.equal(o.poolEnergy, 0.8);
});
