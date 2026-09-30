// circuit-scope.test.mjs — APEX_CIRCUITS narrows the fleet sweeps, in one place.
//
// tools/lib/circuit-scope.cjs is the contract between ci.yml's circuit lane and
// every sweep that rebuilds the roster: the audit CLIs' `--all` resolve their
// ids through scope(), and each suite's anti-vacuity floor ("measured the whole
// roster") compares against the scoped roster. This pins both ends and the
// workflow wiring, so a sweep cannot quietly fall back to 52 builds — or,
// worse, be narrowed while its floor still expects the whole fleet.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { CIRCUIT_FILTERED_TESTS } from "../../tools/ci/select-specs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("scope(): unset keeps every id in order; set keeps the named ids only", () => {
  const run = (env, ids) => JSON.parse(spawnSync(process.execPath, ["-e",
    `const { scope, scoped } = require("./tools/lib/circuit-scope.cjs"); process.stdout.write(JSON.stringify([scope(${JSON.stringify(ids)}), scoped()]))`],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, APEX_CIRCUITS: env } }).stdout);
  assert.deepEqual(run("", ["monza", "spa", "imola"]), [["monza", "spa", "imola"], false]);
  assert.deepEqual(run("imola, monza", ["monza", "spa", "imola"]), [["monza", "imola"], true], "the caller's order, the env's ids");
  assert.deepEqual(run("nowhere", ["monza"]), [[], true], "an unknown id scopes to nothing — the floor then expects 0, never the fleet");
});

test("shard(): i/n shards are a disjoint, order-preserving partition; unset keeps all; malformed throws", async () => {
  const { shard } = require("../../tools/lib/circuit-scope.cjs");
  const ids = ["a", "b", "c", "d", "e"];
  assert.deepEqual(shard(ids, ""), ids);
  assert.deepEqual(shard(ids, "1/2"), ["a", "c", "e"]);
  assert.deepEqual(shard(ids, "2/2"), ["b", "d"]);
  assert.deepEqual([...shard(ids, "1/3"), ...shard(ids, "2/3"), ...shard(ids, "3/3")].sort(), ids, "the n shards cover every id once");
  assert.deepEqual(shard(ids, "1/1"), ids);
  for (const bad of ["0/2", "3/2", "2", "a/b", "1/0"]) assert.throws(() => shard(ids, bad), /APEX_CIRCUIT_SHARD/, bad);
  const { inShard } = require("../../tools/lib/circuit-scope.cjs");
  assert.deepEqual(ids.filter(inShard("2/2")), ["b", "d"], "inShard is the predicate shard() applies");
  // The elevation twin reads the shard through this helper, after APEX_CIRCUITS.
  const twin = read("tests/unit/elevation-tracks-vm.test.mjs");
  assert.match(twin, /require\("\.\.\/\.\.\/tools\/lib\/circuit-scope\.cjs"\)/);
  assert.match(twin, /const GRADE_RUNS = ELEVATION_TRACKS\.filter\(inScope\)\.filter\(inShard\(\)\)/,
    "shard after scope, as a .filter chain (select-budget counts the loop statically)");
  const { declaredTests } = await import("../../tools/ci/select-budget.mjs");
  assert.equal(declaredTests("tests/unit/elevation-tracks-vm.test.mjs"), declaredTests("tests/specs/elevation-tracks.spec.js"),
    "the sharded twin must still count every per-circuit test its spec declares");
});

test("every audit CLI's --all resolves its roster through scope()", () => {
  for (const cli of ["clip-audit", "coplanar-audit", "ground-audit", "float-audit", "props-tris"]) {
    const src = read(`tools/track/${cli}.cjs`);
    assert.match(src, /require\("\.\.\/lib\/circuit-scope\.cjs"\)\.scope\(/, `${cli}.cjs --all ignores APEX_CIRCUITS`);
  }
  // float-audit has three --all entry points (foliage, clip, default); all three.
  assert.equal((read("tools/track/float-audit.cjs").match(/circuit-scope\.cjs"\)\.scope\(/g) || []).length, 3);
});

test("the sweep suites that rebuild the roster are scoped, listed, and hold the SCOPED floor", () => {
  const scoped = ["tests/unit/prop-clipping.test.mjs", "tests/unit/scenery-grounding.test.mjs", "tests/unit/coplanar-faces.test.mjs",
    "tests/unit/props-tri-ratchet.test.mjs", "tests/unit/road-under-floor.test.mjs",
    "tests/unit/shared-track-foundation-characterization.test.cjs"];
  // pit-complex stays whole on purpose: its mouth test counts qualifying
  // circuits across the roster, and its other tests build fixed ids anyway.
  assert.doesNotMatch(read("tests/unit/pit-complex.test.mjs"), /APEX_CIRCUITS/);
  const sweeps = JSON.parse(read("tests/groups.json")).groups["test:sweeps"].files;
  for (const f of scoped) {
    assert.ok(sweeps.includes(f), `${f} is not in test:sweeps`);
    assert.ok(CIRCUIT_FILTERED_TESTS.has(f), `${f} narrows by APEX_CIRCUITS but select-specs does not list it — an edit to it would be circuit-scoped`);
    assert.match(read(f), /APEX_CIRCUITS/, `${f} does not read the scope`);
  }
  // A CLI-driven suite must compare against the scoped roster, never the raw manifest count.
  for (const f of scoped.slice(0, 4)) {
    assert.doesNotMatch(read(f), /manifest\.cjs"\)\.CIRCUITS\.length/, `${f} still holds the CLI to the WHOLE roster; scoped --all would fail it`);
    assert.match(read(f), /circuit-scope\.cjs"\)/, `${f} must derive its floor from circuit-scope`);
  }
});

test("ci.yml: the sweeps job scopes a circuit-only pull request and hands the ids to test:sweeps", () => {
  const ci = read(".github/workflows/ci.yml");
  const job = ci.slice(ci.indexOf("\n  sweeps:\n"), ci.indexOf("\n  ship-filter:\n"));
  // A pull request and the train (before_sha = live) scope; the job sits out
  // the deploy push (tests/unit/base-green.test.mjs pins the node plan's
  // push-side lookup).
  assert.match(job, /if \[ "\$SCOPE_OK" = true \]; then\n\s+SCOPE_FILE=/, "the scope is computed only when SCOPE_OK");
  assert.match(job, /if \[ "\$CALLED" = true \] \|\| \[ "\$EVENT" = pull_request \]; then SCOPE_OK=true; fi/);
  assert.match(job, /m\.circuitsTouched\(ch, process\.argv\[2\]\)/, "the ids come from select-specs' circuitsTouched, the browser gate's own rule");
  assert.match(job, /echo "circuits=\$IDS" >> "\$GITHUB_OUTPUT"/);
  assert.match(job, /- name: Geometry sweeps[^\n]*\n\s+if: steps\.filter\.outputs\.geometry == 'true'\n\s+env:\n(?:\s+#.*\n)*\s+APEX_CIRCUITS: \$\{\{ steps\.filter\.outputs\.circuits \}\}\n\s+run: npm run test:sweeps/,
    "the fleet sweeps step must read the filter's circuits output");
  // The manifest must know every id the scope could name: scope() filters by
  // id, so a renamed circuit would silently scope to nothing.
  const { CIRCUITS } = require("../../tools/manifest.cjs");
  assert.ok(CIRCUITS.includes("monza") && CIRCUITS.length > 40);
});
