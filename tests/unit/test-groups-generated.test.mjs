// test-groups-generated.test.mjs — tests/groups.json is the ONE definition of
// a test group: package.json's `test:*` scripts are generated from it and
// tooling-fast reads its `toolingFast` list at runtime (2026-10-26: the
// 1,512-line generated copy inside tooling-fast.mjs was a merge-conflict hot
// spot), and this fails the moment either drifts.
//
// Before this, a new group was three coordinated edits (a package.json script,
// the TOOLING_FAST_FILES array, a docs/TESTING.md row) and forgetting one
// failed nothing at the time — the coverage audit noticed later, or nobody did.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeGroupPhases } from "../../tools/ci/run-node-group.mjs";
import { loadGroups, commandFor, expandedCommand, expandScript, expandScripts, filesOnly, groupDef, groupFiles, nodeFlags,
  renderPkg, resolveGroupArgv, wrapperGroup, NODE_TEST_TIMEOUT_MS } from "../../tools/gen/gen-test-groups.mjs";
import { parseRunGroupArgs } from "../../tools/ci/run-group.mjs";
import { TOOLING_FAST_FILES } from "../../tools/ci/tooling-fast.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const doc = loadGroups();

test("package.json and the tooling-fast list match tests/groups.json", () => {
  const r = spawnSync("node", ["tools/gen/gen-test-groups.mjs", "--check"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, `generated files are stale — run \`node tools/gen/gen-test-groups.mjs\`\n${r.stdout}${r.stderr}`);
  const tf = fs.readFileSync(path.join(ROOT, "tools/ci/tooling-fast.mjs"), "utf8");
  assert.doesNotMatch(tf, /@gen-test-groups:begin/, "tooling-fast reads groups.json at runtime; no generated copy to merge-conflict on");
  assert.match(tf, /TOOLING_FAST_FILES = Object\.freeze\(filesOnly\(loadGroups\(\)\.toolingFast\)\)/);
});

test("every test:* script is a group, and every group is a script", () => {
  const scripts = Object.keys(pkg.scripts).filter((s) => s.startsWith("test")).sort();
  assert.deepEqual(scripts, Object.keys(doc.groups).sort(),
    "a test script with no groups.json entry (or the reverse) is exactly the drift this file exists to catch");
});

test("each group's command is the one its definition renders", () => {
  for (const [name, def] of Object.entries(doc.groups)) {
    assert.equal(pkg.scripts[name], commandFor(def, doc.isolatedFiles, name), `${name} was hand-edited in package.json — edit tests/groups.json instead`);
  }
});

test("no group is left naming nothing", () => {
  // `node --test` with no file arguments EXITS 1. A group whose whole subject
  // moved away (test:webgpu-lifecycle, when WGX left for spike/backends/ on
  // 2026-09-03) becomes exactly that, and the fast gate does not run npm
  // groups — so it sailed through here and failed in the Pages gate instead,
  // several minutes into a deploy. Delete the group or give it files.
  // Only NODE groups: `node --test` with no paths exits 1, while a browser
  // group with no paths is the deliberate "let Playwright discover every spec"
  // shape that `test`, `test:update`, `test:render` and `test:headless` use.
  const empty = Object.entries(doc.groups)
    .filter(([, def]) => def.kind === "node" && (def.files || []).length === 0)
    .map(([name]) => name);
  assert.deepEqual(empty, [], "a node group with no files runs nothing and exits non-zero");
});

test("every file a group names exists on disk", () => {
  const missing = [];
  for (const [name, def] of Object.entries(doc.groups)) {
    for (const f of def.files || []) {
      if (f.includes("*")) continue; // a glob the runner expands
      if (!fs.existsSync(path.join(ROOT, f))) missing.push(`${name}: ${f}`);
    }
  }
  assert.deepEqual(missing, [], "a group naming a file that does not exist runs silently short");
});

test("toolingFast notes are comments, and the exported array is files only", () => {
  const entries = doc.toolingFast;
  assert.ok(entries.some((e) => e.startsWith("//")), "the notes explaining why a file is in the edit loop live in groups.json");
  assert.deepEqual(filesOnly(entries), [...TOOLING_FAST_FILES],
    "the runtime array must be the file entries alone — a note leaking into it would be run as a test path");
  for (const f of filesOnly(entries)) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `tooling-fast names ${f}, which does not exist`);
  }
});

test("shared benchmark policy generates wrappers only for affected Node groups and retains coverage rosters", () => {
  assert.equal(new Set(doc.isolatedFiles).size, doc.isolatedFiles.length);
  // audit4 E1 (2026-10-26): an isolated benchmark may live in a node group alone once the floor carve moved it out of
  // tooling-fast; it still runs alone first wherever run-node-group.mjs runs that group.
  const nodeGroupHas = (file) => Object.values(doc.groups).some((g) => g.kind === "node" && (g.files || []).includes(file));
  for (const file of doc.isolatedFiles) assert.ok(TOOLING_FAST_FILES.includes(file) || nodeGroupHas(file), `${file} is isolated but no node group or tooling-fast runs it`);
  const def = { kind: "node", flags: ["--test-concurrency=2"], files: ["ordinary-a", "bench-a", "ordinary-b", "bench-b"] };
  const isolated = ["bench-a", "bench-b"], extra = ["--test-name-pattern=selected contract", "--test-reporter=dot"];
  assert.deepEqual(nodeGroupPhases(def, isolated, extra), [
    ["--test", ...nodeFlags(def), ...extra, "bench-a"], ["--test", ...nodeFlags(def), ...extra, "bench-b"],
    ["--test", ...nodeFlags(def), ...extra, "ordinary-a", "ordinary-b"],
  ]);
  // #5427 item 4: the package.json line is ONE stable wrapper per group (isolated or not: run-group.mjs runs
  // nodeGroupPhases); the full flags-and-files command survives as expandedCommand for string readers.
  assert.equal(commandFor(def, isolated, "fixture"), "node tools/ci/run-group.mjs fixture");
  assert.equal(commandFor(def, [], "test:x"), "node tools/ci/run-group.mjs test:x");
  assert.throws(() => commandFor(def), /needs its group name/);
  assert.equal(expandedCommand(def), `node --test --test-timeout=${NODE_TEST_TIMEOUT_MS} --test-concurrency=2 ordinary-a bench-a ordinary-b bench-b`);
  assert.equal(expandedCommand({ kind: "node", flags: ["--test-timeout=5"], files: ["x"] }), "node --test --test-timeout=5 x", "a group-owned bound wins");
  assert.equal(commandFor({ kind: "browser", files: ["bench-a"] }, isolated, "test:b"), "node tools/ci/run-playwright.mjs --group test:b");
  assert.equal(expandedCommand({ kind: "browser", flags: ["--project=xr"], files: ["bench-a"] }), "node tools/ci/run-playwright.mjs --project=xr bench-a");
  assert.equal(commandFor({ kind: "browser", flags: ["--project=render"] }, isolated, "test:render"), "node tools/ci/run-playwright.mjs --project=render",
    "a group with no file list keeps its literal line: nothing in it moves");
  assert.equal(commandFor({ kind: "command", cmd: "unchanged" }, isolated, "test:c"), "unchanged");
  assert.deepEqual(nodeGroupPhases({ kind: "node", files: ["bench-a"] }, isolated), [["--test", `--test-timeout=${NODE_TEST_TIMEOUT_MS}`, "bench-a"]], "no empty pool may trigger Node test discovery");
});

function nodeGroupFixture(t) {
  const base = path.join(ROOT, "artifacts", "tmp"); fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, "node-group-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const events = path.join(dir, "events");
  const file = (name, body = "") => {
    const target = path.join(dir, name + ".test.mjs");
    fs.writeFileSync(target, `import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs";
test("selected contract", async () => { fs.appendFileSync(${JSON.stringify(events)}, ${JSON.stringify(name + ":start\n")}); ${body} fs.appendFileSync(${JSON.stringify(events)}, ${JSON.stringify(name + ":end\n")}); });
test("excluded contract", () => assert.fail("forwarded filter was lost"));\n`);
    return target;
  };
  const harness = (files, isolatedFiles) => {
    const target = path.join(dir, "runner.mjs");
    fs.writeFileSync(target, `import { runNodeGroup } from ${JSON.stringify(new URL("../../tools/ci/run-node-group.mjs", import.meta.url).href)};
const result = await runNodeGroup("fixture", process.argv.slice(2), { doc: ${JSON.stringify({ groups: { fixture: { kind: "node", flags: ["--test-concurrency=2"], files } }, isolatedFiles })} });
if (result.signal) process.kill(process.pid, result.signal); else process.exitCode = result.code ?? 1;\n`);
    return target;
  };
  const run = (files, isolatedFiles) => spawnSync(process.execPath, [harness(files, isolatedFiles), "--test-name-pattern=selected contract", "--test-reporter=dot"],
    { cwd: dir, encoding: "utf8", timeout: 20000 });
  return { dir, events, file, harness, run, history: () => fs.readFileSync(events, "utf8").trim().split("\n") };
}

test("generated Node phases forward npm filters everywhere, isolate both benchmarks, and preserve ordinary parallelism", t => {
  const f = nodeGroupFixture(t);
  const markerA = path.join(f.dir, "a"), markerB = path.join(f.dir, "b");
  const rendezvous = (own, other) => `fs.writeFileSync(${JSON.stringify(own)}, "started"); const end = Date.now() + 10000;
while (!fs.existsSync(${JSON.stringify(other)}) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 10));
assert.ok(fs.existsSync(${JSON.stringify(other)}), "ordinary pool lost parallelism");`;
  const a = f.file("ordinary-a", rendezvous(markerA, markerB)), b = f.file("ordinary-b", rendezvous(markerB, markerA));
  const isoA = f.file("bench-a"), isoB = f.file("bench-b");
  const result = f.run([a, isoA, b, isoB], [isoA, isoB]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const history = f.history();
  assert.deepEqual(history.slice(0, 4), ["bench-a:start", "bench-a:end", "bench-b:start", "bench-b:end"]);
  assert.equal(history.length, 8, "every named file runs exactly once");
  assert.ok(history.indexOf("ordinary-a:start") < history.indexOf("ordinary-b:end"));
  assert.ok(history.indexOf("ordinary-b:start") < history.indexOf("ordinary-a:end"));
});

test("isolated-only groups never discover unrelated tests and a failed benchmark prevents the ordinary pool", t => {
  const f = nodeGroupFixture(t), bench = f.file("bench");
  fs.writeFileSync(path.join(f.dir, "unlisted.test.mjs"), 'throw Error("implicit discovery ran an unlisted file");\n');
  const only = f.run([bench], [bench]);
  assert.equal(only.status, 0, only.stdout + only.stderr);
  assert.deepEqual(f.history(), ["bench:start", "bench:end"]);
  fs.writeFileSync(f.events, "");
  const fail = f.file("failing-bench", 'assert.fail("intentional fixture failure");'), ordinary = f.file("ordinary");
  const failure = f.run([ordinary, fail], [fail]);
  assert.equal(failure.status, 1, failure.stdout + failure.stderr);
  assert.deepEqual(f.history(), ["failing-bench:start"], "nonzero benchmark exit must stop subsequent phases");
});

test("interrupting a Node group forwards the signal and prevents later phases", async t => {
  const f = nodeGroupFixture(t);
  const bench = f.file("waiting-bench", "await new Promise(() => { setInterval(() => {}, 1000); });");
  const ordinary = f.file("ordinary");
  const child = spawn(process.execPath, [f.harness([ordinary, bench], [bench]), "--test-name-pattern=selected contract"], { cwd: f.dir, stdio: "ignore" });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); });
  const exited = new Promise(resolve => child.on("close", (code, signal) => resolve({ code, signal })));
  const deadline = Date.now() + 10000;
  while (!fs.existsSync(f.events) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(fs.existsSync(f.events), "the isolated phase started before interruption");
  child.kill("SIGTERM");
  assert.deepEqual(await exited, { code: null, signal: "SIGTERM" });
  assert.deepEqual(f.history(), ["waiting-bench:start"]);
});

test("isolated group wrappers refuse extra paths and separate option values before any phase starts", t => {
  const f = nodeGroupFixture(t), bench = f.file("bench");
  const harness = f.harness([bench], [bench]);
  for (const extra of [[bench], ["--test-name-pattern", "selected contract"], ["--"]]) {
    const result = spawnSync(process.execPath, [harness, ...extra], { cwd: f.dir, encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /extra test paths and separate option values unsupported; use --option=value/);
    assert.equal(fs.existsSync(f.events), false, "invalid forwarded arguments must launch no test phase");
  }
});

// #5427 item 4: adding or removing a test FILE edits tests/groups.json alone, never package.json.
test("package.json test lines carry no file list: one stable wrapper per node/browser group with files", () => {
  for (const [name, def] of Object.entries(doc.groups)) {
    const line = pkg.scripts[name];
    if (def.kind === "command") { assert.equal(line, def.cmd, name); continue; }
    if (!(def.files || []).length) { assert.equal(wrapperGroup(line), null, `${name} has no files and keeps its literal line`); continue; }
    assert.equal(wrapperGroup(line), name, `${name}: ${line}`);
    assert.doesNotMatch(line, /tests\//, `${name} names a test file in package.json — the roster belongs in tests/groups.json`);
    if (def.kind === "browser") assert.match(line, /run-playwright/, "readers detect browser groups by run-playwright");
    assert.equal(expandScript(line), expandedCommand(def), `${name} expands to its full command for string readers`);
  }
  // A new file in every existing group leaves package.json byte-identical.
  const text = fs.readFileSync(path.join(ROOT, "package.json"), "utf8");
  const grown = structuredClone(doc);
  for (const def of Object.values(grown.groups)) if (def.kind !== "command" && def.files?.length) def.files.push("tests/unit/test-groups-generated.test.mjs");
  assert.equal(renderPkg(grown, text), text);
});

test("an unknown group, a wrong kind or an empty list fails loudly, never runs zero tests", () => {
  const fixture = { groups: { "test:n": { kind: "node", files: ["a.test.mjs"] },
    "test:b": { kind: "browser", flags: ["--project=p"], files: ["tests/specs/smoke.spec.js"] },
    "test:e": { kind: "browser", files: [] }, "test:c": { kind: "command", cmd: "x" } } };
  assert.throws(() => groupDef("test:nope", fixture), /not in tests\/groups\.json/);
  assert.throws(() => groupDef("test:n", fixture, "browser"), /node group, not browser/);
  assert.throws(() => groupDef("test:e", fixture, "browser"), /empty file list/);
  assert.throws(() => groupFiles("test:e", fixture), /empty file list/);
  assert.throws(() => groupFiles("test:nope", fixture), /not in tests\/groups\.json/);
  assert.throws(() => expandScript("node tools/ci/run-group.mjs test:nope", fixture), /not in tests\/groups\.json/);
  assert.equal(expandScript("node --test a.test.mjs", fixture), "node --test a.test.mjs", "a literal line passes through");
  assert.deepEqual(expandScripts({ "test:n": "node tools/ci/run-group.mjs test:n" }, fixture),
    { "test:n": `node --test --test-timeout=${NODE_TEST_TIMEOUT_MS} a.test.mjs` });
  assert.deepEqual(groupFiles("test:n", fixture), ["a.test.mjs"]);
  // run-playwright.mjs --group: flags, files, then the npm-forwarded tail, the order the literal line gave.
  assert.deepEqual(resolveGroupArgv(["--group", "test:b", "--timeout=5", "--shard=1/2"], fixture),
    ["--project=p", "tests/specs/smoke.spec.js", "--timeout=5", "--shard=1/2"]);
  assert.deepEqual(resolveGroupArgv(["tests/specs/smoke.spec.js"], fixture), ["tests/specs/smoke.spec.js"], "no --group: unchanged");
  assert.throws(() => resolveGroupArgv(["--group", "test:nope"], fixture), /not in tests\/groups\.json/);
  assert.throws(() => resolveGroupArgv(["--group", "test:n"], fixture), /node group, not browser/);
  assert.throws(() => resolveGroupArgv(["--group", "test:e"], fixture), /empty file list/);
  assert.throws(() => resolveGroupArgv(["--x", "--group", "test:b"], fixture), /comes first/);
  assert.throws(() => resolveGroupArgv(["--group", "test:b"], { groups: { "test:b": { kind: "browser", files: ["tests/specs/zz-none-*.spec.js"] } } }),
    /matches no file/);
});

test("a browser group's globs resolve to the files npm's shell used to expand", () => {
  for (const [name, def] of Object.entries(doc.groups)) {
    if (def.kind !== "browser" || !(def.files || []).length) continue;
    const files = resolveGroupArgv(["--group", name]).slice((def.flags || []).length);
    assert.ok(files.length >= def.files.length, `${name} resolved to fewer files than it names`);
    for (const f of files) assert.ok(!f.includes("*") && fs.existsSync(path.join(ROOT, f)), `${name}: ${f}`);
  }
  const collisions = resolveGroupArgv(["--group", "test:collisions"]);
  assert.ok(collisions.length > 1 && collisions.every((f) => /^tests\/specs\/collision[^/]*\.spec\.js$/.test(f)), collisions.join(" "));
});

test("run-group.mjs: npm-forwarded options reach every phase; the group must come first", () => {
  assert.deepEqual(parseRunGroupArgs(["test:x"]), { script: "test:x", skipTf: false, extraArgs: [] });
  assert.deepEqual(parseRunGroupArgs(["test:x", "--skip-tf", "--test-name-pattern=a b"]),
    { script: "test:x", skipTf: true, extraArgs: ["--test-name-pattern=a b"] });
  assert.deepEqual(parseRunGroupArgs(["test:x", "--", "--test-reporter=dot"]).extraArgs, ["--test-reporter=dot"]);
  assert.throws(() => parseRunGroupArgs([]), /usage/);
  assert.throws(() => parseRunGroupArgs(["--skip-tf", "test:x"]), /usage/);
  for (const [args, re] of [[["test:nope"], /not in tests\/groups\.json/], [["test:smoke"], /browser group, not node/], [[], /usage/]]) {
    const r = spawnSync(process.execPath, ["tools/ci/run-group.mjs", ...args], { cwd: ROOT, encoding: "utf8", timeout: 60000 });
    assert.equal(r.status, 2, `${args.join(" ")}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, re);
  }
});
