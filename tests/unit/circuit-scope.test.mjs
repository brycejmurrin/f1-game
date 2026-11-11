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

// 2026-11-10: a scope or an id that matches nothing used to PASS — `APEX_CIRCUITS=zzz
// float-audit --all` printed "All 0 circuits clean", `coplanar-audit --gate` with no ids
// "all 0 circuit(s) within the coplanar baseline", `centreline-kinks nosuch --gate` exit 0.
test("scopeAll() / requireKnown(): an empty match and an unknown id throw; scope() itself still returns []", () => {
  const run = (env, code) => spawnSync(process.execPath, ["-e", code],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, APEX_CIRCUITS: env } });
  const lib = `const L = require("./tools/lib/circuit-scope.cjs");`;
  let r = run("zzz", `${lib} try { L.scopeAll(["monza"], "t"); } catch (e) { process.stderr.write(e.message); process.exit(2); }`);
  assert.equal(r.status, 2); assert.equal(r.stderr.split(" — ")[0], "t: APEX_CIRCUITS=zzz matches none of the 1 circuits");
  r = run("monza,zzz", `${lib} process.stdout.write(JSON.stringify(L.scopeAll(["monza","spa"])))`);
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, '["monza"]', "a partly-known scope keeps what it names (a CI scope may name a deleted circuit)");
  r = run("", `${lib} process.stdout.write(JSON.stringify(L.scopeAll(["monza","spa"])))`);
  assert.equal(r.stdout, '["monza","spa"]', "unset keeps every id");
  const { requireKnown, unknownIds } = require("../../tools/lib/circuit-scope.cjs");
  assert.deepEqual(unknownIds(["monza", "nosuch"], ["monza", "spa"]), ["nosuch"]);
  assert.throws(() => requireKnown(["nosuch"], ["monza"], "t"), /t: unknown circuit id\(s\) "nosuch"/);
  assert.deepEqual(requireKnown(["monza"], ["monza"]), ["monza"]);
});

test("the CLIs refuse a scope or an id that matches nothing (exit non-zero, a clear message)", () => {
  const cli = (env, ...args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8",
    env: { ...process.env, APEX_CIRCUITS: env } });
  // [APEX_CIRCUITS, argv, exit code, the verdict line up to its " — " detail]. float-audit's three --all entry
  // points (default, --foliage, --clip) each go through scopeAll: all three are run, not read.
  const none = "APEX_CIRCUITS=zzz matches none of the " + require("../../tools/manifest.cjs").CIRCUITS.length + " circuits";
  const cases = [
    ["zzz", ["tools/track/float-audit.cjs", "--all"], 2, `float-audit: ${none}`],
    ["zzz", ["tools/track/float-audit.cjs", "--foliage", "--all"], 2, `float-audit: ${none}`],
    ["zzz", ["tools/track/float-audit.cjs", "--clip", "--all"], 2, `float-audit: ${none}`],
    ["", ["tools/track/float-audit.cjs", "nosuch"], 2, 'float-audit: unknown circuit id(s) "nosuch"'],
    ["zzz", ["tools/track/coplanar-audit.cjs", "--all", "--gate"], 2, `coplanar-audit: ${none}`],
    ["", ["tools/track/coplanar-audit.cjs", "--gate"], 2, "coplanar-audit: no circuits named"],
    ["", ["tools/track/coplanar-audit.cjs", "nosuch", "--gate"], 2, 'coplanar-audit: unknown circuit id(s) "nosuch"'],
    ["", ["tools/track/centreline-kinks.cjs", "nosuch", "--gate"], 2, 'centreline-kinks: unknown circuit id(s) "nosuch"'],
    ["zzz", ["tools/track/verify-track.cjs", "--all"], 1, `FAIL: could not load track ids: verify-track --all: ${none}`],
  ];
  const got = cases.map(([env, args]) => { const r = cli(env, ...args); return [r.status, r.stderr.trim().split("\n")[0].split(" — ")[0]]; });
  assert.deepEqual(got, cases.map(([, , code, line]) => [code, line]));
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
  // TK1-16: the browser spec keeps only 3 render()-only cases (TWIN_SUBSET in
  // tools/ci/twinned-specs.mjs); the twin declares 6 fixed tests, one grade
  // test per js/circuits/*.js def and the two banked bowls.
  const defs = fs.readdirSync(path.join(ROOT, "js/circuits")).filter((f) => f.endsWith(".js")).length;
  assert.equal(declaredTests("tests/unit/elevation-tracks-vm.test.mjs"), 6 + defs + 2,
    "the sharded twin must still count one grade test per circuit");
  assert.ok(declaredTests("tests/unit/elevation-tracks-vm.test.mjs") >= declaredTests("tests/specs/elevation-tracks.spec.js"),
    "the twin must cover every test its spec declares");
});

test("every audit CLI's --all resolves its roster through scope()", () => {
  for (const cli of ["clip-audit", "coplanar-audit", "ground-audit", "float-audit", "props-tris"]) {
    const src = read(`tools/track/${cli}.cjs`);
    assert.match(src, /(circuit-scope\.cjs"\)|scopeLib)\.scope(All)?\(/, `${cli}.cjs --all ignores APEX_CIRCUITS`);
  }
  // float-audit's three --all entry points (default, --foliage, --clip): run, not read, in the test above.
  // verify-track --all (ci.yml's "Every circuit still builds headlessly", 70 s on #510) too.
  assert.match(read("tools/track/verify-track.cjs"), /circuit-scope\.cjs"\)\.scopeAll\(loadTrackIds\(\)/, "verify-track --all ignores APEX_CIRCUITS");
});

test("the sweep suites that rebuild the roster are scoped, listed, and hold the SCOPED floor", () => {
  const scoped = ["tests/unit/prop-clipping.test.mjs", "tests/unit/scenery-grounding.test.mjs", "tests/unit/coplanar-faces.test.mjs",
    "tests/unit/props-tri-ratchet.test.mjs", "tests/unit/road-under-floor.test.mjs",
    "tests/unit/shared-track-foundation-characterization.test.cjs",
    // Second pass (2026-09-30): the three fleet walks that cost 191 s of #510's
    // 344 s scoped sweeps step.
    "tests/unit/lamp-fixture-anchor.test.mjs", "tests/unit/pit-signs.test.mjs", "tests/unit/props-over-road.test.mjs"];
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
  const job = ci.slice(ci.indexOf("\n  sweeps:\n"), ci.indexOf("\n  sweeps-roll-up:\n"));
  const plan = ci.slice(ci.indexOf("\n  select:\n"), ci.indexOf("\n  selected:\n"));
  // A pull request and the train (before_sha = live) scope; the job sits out
  // the deploy push (tests/unit/base-green.test.mjs pins the node plan's
  // push-side lookup).
  assert.match(plan, /if \[ "\$SCOPE_OK" = true \]; then\n\s+SCOPE_FILE=/, "the scope is computed only when SCOPE_OK");
  assert.match(plan, /if \[ "\$CALLED" = true \] \|\| \[ "\$EVENT" = pull_request \]; then SCOPE_OK=true; fi/);
  assert.match(plan, /m\.circuitsTouched\(ch, process\.argv\[2\]\)/, "the ids come from select-specs' circuitsTouched, the browser gate's own rule");
  assert.match(plan, /echo "circuits=\$IDS" >> "\$GITHUB_OUTPUT"/);
  assert.match(job, /- name: Geometry sweeps[^\n]*\n\s+if: needs\.select\.outputs\.geometry != 'false'\n\s+env:\n(?:\s+#.*\n)*\s+APEX_CIRCUITS: \$\{\{ needs\.select\.outputs\.geometry_circuits \}\}\n\s+run: npm run test:sweeps/,
    "the fleet sweeps step must read the filter's circuits output");
  // The manifest must know every id the scope could name: scope() filters by
  // id, so a renamed circuit would silently scope to nothing.
  const { CIRCUITS } = require("../../tools/manifest.cjs");
  assert.ok(CIRCUITS.includes("monza") && CIRCUITS.length > 40);
});
