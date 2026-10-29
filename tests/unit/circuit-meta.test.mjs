// circuit-meta — title boots GENERATED meta stubs; full defs hydrate via LAZY_CIRCUIT.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const MANIFEST = require(join(ROOT, "tools/manifest.cjs"));

// BUILT, NOT COMMITTED (2026-10-28; docs/notes/DEPLOY-TIME-GEN-2026-10-28.md): the roster is gitignored and
// built where it is served, so `check()` (gen:check) refuses only a TRACKED copy and rebuilds a local one.
test("js/track/circuit-meta.js is a build product: untracked, built, and equal to the generator", async () => {
  const { check, generate, trackedInGit, TARGET } = await import(join(ROOT, "tools/gen/gen-circuit-meta.mjs"));
  assert.equal(TARGET, MANIFEST.CIRCUIT_META);
  assert.equal(trackedInGit(), false, `${TARGET} is tracked: git rm --cached it (it is built, never committed)`);
  assert.equal(check(), true);
  assert.ok(existsSync(join(ROOT, MANIFEST.CIRCUIT_META)));
  assert.equal(readFileSync(join(ROOT, MANIFEST.CIRCUIT_META), "utf8"), generate());
});

test("ensure-built: BUILT_PATHS carries the roster, buildInto renders it, a second ensure writes nothing", async () => {
  const { BUILT_PATHS } = await import(join(ROOT, "tools/lib/generated-paths.mjs"));
  const { ensureBuilt, buildInto, builtLine } = await import(join(ROOT, "tools/gen/ensure-built.mjs"));
  const { generate } = await import(join(ROOT, "tools/gen/gen-circuit-meta.mjs"));
  assert.ok(BUILT_PATHS.includes(MANIFEST.CIRCUIT_META));
  ensureBuilt();
  const again = ensureBuilt();
  assert.deepEqual(again.map((r) => r.was), BUILT_PATHS.map(() => "fresh"), "idempotent: nothing left to write");
  assert.equal(builtLine(again), "", "a fresh checkout prints nothing");
  assert.equal(builtLine([{ target: "x.js", was: "missing" }, { target: "y.js", was: "stale" }]), "ensure-built: built x.js (missing); rebuilt y.js (stale)");
  const dir = mkdtempSync(join(tmpdir(), "apex-built-"));
  try {
    assert.deepEqual(buildInto(dir), [...BUILT_PATHS]);
    assert.equal(readFileSync(join(dir, MANIFEST.CIRCUIT_META), "utf8"), generate());
    assert.deepEqual(readdirSync(join(dir, "js/track")), ["circuit-meta.js"], "no temp file left behind");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("meta roster has one stub per CIRCUITS id with no path payload", () => {
  const src = readFileSync(join(ROOT, MANIFEST.CIRCUIT_META), "utf8");
  const sandbox = { window: { TrackDefs: [] } };
  vm.runInNewContext(src, sandbox, { filename: absSrc(MANIFEST.CIRCUIT_META) });
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
