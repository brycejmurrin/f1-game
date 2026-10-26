// #3360 — Shanghai Pudong skyline must sit as a multi-km haze cue, not a
// near-track hero. docs/tracks/shanghai.md §4: s=0.30 L far; SIC is ~30+ km
// from central Pudong. Ground-audit previously reported 70–148 m unsupported
// footprints when the cluster sat at dist 300 with free window bands.
// Source pins avoided (#1682) — use RegExp.test / doesNotMatch only.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "js/circuits/scenery/shanghai.js");
const require = createRequire(import.meta.url);

test("pudongCluster anchors past multi-km haze (not dist 300)", () => {
  const src = fs.readFileSync(SRC, "utf8");
  const block = src.match(/\(function pudongCluster\(\) \{[\s\S]*?\}\)\(\);/);
  assert.ok(block, "pudongCluster IIFE present");
  const body = block[0];
  assert.ok(/HORIZON\s*=\s*(2[0-9]{3}|[3-9][0-9]{3})\b/.test(body),
    "Pudong HORIZON must be >= 2000 m (multi-km cue)");
  assert.doesNotMatch(body, /anchor\(K\(0\.30\),\s*-1,\s*300\)/,
    "must not reintroduce the near-track 300 m anchor");
  assert.ok(/terrainYAt/.test(body),
    "horizon pad seats on terrainYAt");
  assert.ok(/modelGroup\("shanghai-pudong"/.test(body),
    "required shanghai-pudong landmark retained");
});

test("shanghai ground-audit: no pudongCluster / shanghai-pudong footprint ≥ 50 m", () => {
  const GA = require(path.join(ROOT, "tools/track/ground-audit.cjs"));
  const { buildContext } = require(path.join(ROOT, "tools/lib/track-build-vm.cjs"));
  const env = buildContext();
  const r = GA.run(env, "shanghai", { why: true });
  const bad = [];
  for (const f of (r.partial && r.partial.findings) || []) {
    if (!(f.maxGap >= 50)) continue;
    const st = (f.p && f.p.stack) || "";
    const line = GA.lineOf(st);
    if (/pudongCluster|shanghai-pudong/.test(line) || /pudongCluster|shanghai-pudong/.test(st))
      bad.push({ line, maxGap: f.maxGap, kind: f.report && f.report.kind });
  }
  assert.equal(bad.length, 0,
    `Pudong footprint gaps ≥ 50 m: ${JSON.stringify(bad)}`);
});
