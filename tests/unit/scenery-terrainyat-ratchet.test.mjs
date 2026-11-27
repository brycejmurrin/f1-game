// scenery-terrainyat-ratchet.test.mjs — raw terrainYAt( calls in circuit
// scenery may only fall (#7333, architecture review #7332 row 1).
//
// A foot goes through api.groundAt(x, z, { size, basis, pick, fallback }): it
// samples the footprint and makes the off-ribbon fallback explicit and counted
// (modelDiagnostics.groundFallback). A raw terrainYAt is for a TEST only
// ("is this pad below grade?"), never a height. The baseline
// tests/data/scenery-terrainyat-baseline.json holds each file's count; a file
// not in it (a new circuit) is allowed 0. Lower the baseline when you migrate
// a file: `node tests/unit/scenery-terrainyat-ratchet.test.mjs --update`.
//
// Run: node --test tests/unit/scenery-terrainyat-ratchet.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "js/circuits/scenery");
const BASELINE = path.join(ROOT, "tests/data/scenery-terrainyat-baseline.json");
const RAW = /\bterrainYAt\(/g;

export function countRaw(dir = DIR) {
  const out = {};
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js")).sort()) {
    const n = (fs.readFileSync(path.join(dir, f), "utf8").match(RAW) || []).length;
    if (n) out[f] = n;
  }
  return out;
}

if (process.argv.includes("--update")) {
  const cur = countRaw();
  const old = JSON.parse(fs.readFileSync(BASELINE, "utf8")).counts;
  for (const [f, n] of Object.entries(cur))
    if (n > (old[f] || 0)) throw new Error(`${f}: ${n} > baseline ${old[f] || 0} — --update only lowers`);
  const body = { why: "raw terrainYAt( per js/circuits/scenery file; may only fall — use api.groundAt for a foot (#7333)", counts: cur };
  fs.writeFileSync(BASELINE, JSON.stringify(body, null, 2) + "\n");
} else {
  test("raw terrainYAt( calls per circuit scenery file never rise", () => {
    const base = JSON.parse(fs.readFileSync(BASELINE, "utf8")).counts;
    const over = Object.entries(countRaw())
      .filter(([f, n]) => n > (base[f] || 0))
      .map(([f, n]) => `${f}: ${n} raw terrainYAt( > baseline ${base[f] || 0}`);
    assert.deepEqual(over, [], `seat feet with api.groundAt(x, z, { fallback }) instead (docs/SCENERY-API.md §Grounding):\n  ${over.join("\n  ")}`);
  });

  test("the ratchet sees an added call (a fixture dir with one extra)", () => {
    const tmp = fs.mkdtempSync(path.join(ROOT, "scratch", "terrainyat-ratchet-"));
    try {
      fs.writeFileSync(path.join(tmp, "new_circuit.js"), "const y = terrainYAt(x, z); // terrainYAt is text\n");
      assert.deepEqual(countRaw(tmp), { "new_circuit.js": 1 });
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  test("the baseline names only files that exist", () => {
    const base = JSON.parse(fs.readFileSync(BASELINE, "utf8")).counts;
    const gone = Object.keys(base).filter((f) => !fs.existsSync(path.join(DIR, f)));
    assert.deepEqual(gone, []);
  });
}
