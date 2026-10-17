// test-groups-generated.test.mjs — tests/groups.json is the ONE definition of
// a test group: package.json's `test:*` scripts and tooling-fast's file list
// are generated from it, and this fails the moment either drifts.
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
import { loadGroups, commandFor, filesOnly } from "../../tools/gen/gen-test-groups.mjs";
import { TOOLING_FAST_FILES } from "../../tools/ci/tooling-fast.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const doc = loadGroups();

test("package.json and the tooling-fast list match tests/groups.json", () => {
  const r = spawnSync("node", ["tools/gen/gen-test-groups.mjs", "--check"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, `generated files are stale — run \`node tools/gen/gen-test-groups.mjs\`\n${r.stdout}${r.stderr}`);
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
  for (const file of doc.isolatedFiles) assert.ok(TOOLING_FAST_FILES.includes(file));
  const def = { kind: "node", flags: ["--test-concurrency=2"], files: ["ordinary-a", "bench-a", "ordinary-b", "bench-b"] };
  const isolated = ["bench-a", "bench-b"], extra = ["--test-name-pattern=selected contract", "--test-reporter=dot"];
  assert.deepEqual(nodeGroupPhases(def, isolated, extra), [
    ["--test", ...def.flags, ...extra, "bench-a"], ["--test", ...def.flags, ...extra, "bench-b"],
    ["--test", ...def.flags, ...extra, "ordinary-a", "ordinary-b"],
  ]);
  assert.equal(commandFor(def, isolated, "fixture"), "node tools/ci/run-node-group.mjs fixture ordinary-a bench-a ordinary-b bench-b --");
  assert.equal(commandFor(def), "node --test --test-concurrency=2 ordinary-a bench-a ordinary-b bench-b");
  assert.equal(commandFor({ kind: "browser", files: ["bench-a"] }, isolated), "node tools/ci/run-playwright.mjs bench-a");
  assert.equal(commandFor({ kind: "command", cmd: "unchanged" }, isolated), "unchanged");
  assert.deepEqual(nodeGroupPhases({ kind: "node", files: ["bench-a"] }, isolated), [["--test", "bench-a"]], "no empty pool may trigger Node test discovery");
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
