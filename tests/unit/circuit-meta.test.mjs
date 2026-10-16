// circuit-meta — title boots GENERATED meta stubs; full defs hydrate via LAZY_CIRCUIT.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const MANIFEST = require(join(ROOT, "tools/manifest.cjs"));

test("js/track/circuit-meta.js exists and matches the generator", async () => {
  assert.ok(existsSync(join(ROOT, MANIFEST.CIRCUIT_META)));
  const { check } = await import(join(ROOT, "tools/gen/gen-circuit-meta.mjs"));
  assert.equal(check(), true);
});

test("meta roster has one stub per CIRCUITS id with no path payload", () => {
  const src = readFileSync(join(ROOT, MANIFEST.CIRCUIT_META), "utf8");
  const sandbox = { window: { TrackDefs: [] } };
  vm.runInNewContext(src, sandbox, { filename: MANIFEST.CIRCUIT_META });
  const defs = sandbox.window.TrackDefs;
  assert.equal(defs.length, MANIFEST.CIRCUITS.length);
  const ids = new Set(defs.map((d) => d.id));
  for (const id of MANIFEST.CIRCUITS) {
    assert.ok(ids.has(id), `meta missing ${id}`);
  }
  for (const d of defs) {
    assert.equal(d._metaOnly, true, `${d.id} should be marked _metaOnly`);
    assert.equal(d.path, undefined, `${d.id} meta must not carry path`);
    assert.ok(d.name, `${d.id} needs name`);
    assert.ok(d.country, `${d.id} needs country`);
  }
});

test("FULL carries meta only; LAZY_CIRCUIT lists every authored def", async () => {
  const { META_KEYS } = await import(join(ROOT, "tools/gen/gen-circuit-meta.mjs"));
  assert.ok(META_KEYS.includes("id") && META_KEYS.includes("name"));
  assert.ok(!META_KEYS.includes("path"));
  assert.equal(MANIFEST.LAZY_CIRCUIT.length, MANIFEST.CIRCUITS.length);
  assert.ok(MANIFEST.FULL.includes(MANIFEST.CIRCUIT_META));
  assert.ok(!MANIFEST.FULL.includes(MANIFEST.circuitPath("monaco")));
});
