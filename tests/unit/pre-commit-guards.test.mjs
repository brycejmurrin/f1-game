// pre-commit-guards.test.mjs — #2889 slice 1: verdict cache + git-config timeout
// through .githooks/pre-commit and tools/ci/guards-verdict.mjs.
//
// Throwaway repos under artifacts/; GIT_* scrubbed like the hook (#1807).
// Run: node --test tests/unit/pre-commit-guards.test.mjs
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  OK_REL,
  FRESH_MS,
  checkVerdict,
  runGuards,
  writeOk,
  writeTree,
  isFreshHit,
  okPath,
  unstagedTracked,
} from "../../tools/ci/guards-verdict.mjs";
import { parseFailures, report as guardsReport } from "../../tools/ci/guards-report.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HELPER = path.join(ROOT, "tools/ci/guards-verdict.mjs");
const HOOK = path.join(ROOT, ".githooks/pre-commit");
const ID = {
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
};

function cleanEnv(extra = {}) {
  const env = { ...process.env, ...ID, ...extra };
  for (const name of execFileSync("git", ["rev-parse", "--local-env-vars"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .trim()
    .split(/\s+/)) {
    delete env[name];
  }
  delete env.CLAUDECODE;
  delete env.APEX_SKIP_GUARDS;
  delete env.APEX_GUARD_TIMEOUT;
  return env;
}

function scratchRepo(prefix) {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", prefix));
  const env = cleanEnv();
  const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", env }).trim();
  g("init", "-q", "-b", "main");
  g("config", "user.email", "t@t");
  g("config", "user.name", "t");
  return { dir, g, env, rm: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function writeTinyPass(dir, name = "tiny-pass.test.mjs") {
  const rel = path.join("tests/unit", name);
  fs.mkdirSync(path.join(dir, "tests/unit"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, rel),
    `import { test } from "node:test";\ntest("pass", () => {});\n`,
  );
  return rel;
}

function guardRoster(dir, files) {
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(dir, "tests/groups.json"), JSON.stringify({ groups: { "test:guards": { files } } }));
}

/** Spawn that runs listed relative test files under cwd. */
function spawnTests(files, cwd) {
  return spawnSync(process.execPath, ["--test", ...files], {
    cwd,
    encoding: "utf8",
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "NODE_TEST_CONTEXT")),
  });
}

test("OK_REL and FRESH_MS define the git hook verdict cache (#2889)", () => {
  assert.equal(OK_REL, "artifacts/pre-commit-guards.ok");
  assert.equal(FRESH_MS, 10 * 60 * 1000);
  const bash = fs.readFileSync(HOOK, "utf8");
  assert.ok(/guards-verdict\.mjs check/.test(bash));
  assert.ok(/apex\.guardTimeout/.test(bash));
});

test("check hits a fresh green write-tree and misses after re-stage", () => {
  const repo = scratchRepo("guards-cache-");
  try {
    writeTinyPass(repo.dir);
    fs.writeFileSync(path.join(repo.dir, "code.js"), "v1\n");
    repo.g("add", "-A");
    repo.g("commit", "-qm", "init");
    fs.writeFileSync(path.join(repo.dir, "code.js"), "v2\n");
    repo.g("add", "code.js");
    const tree1 = writeTree(repo.dir);
    writeOk(okPath(repo.dir), tree1);
    const hit = checkVerdict({ root: repo.dir });
    assert.equal(hit.hit, true, hit.message);
    assert.match(hit.message, new RegExp(`guards: cache hit ${tree1}`));

    fs.writeFileSync(path.join(repo.dir, "code.js"), "v3\n");
    repo.g("add", "code.js");
    const miss = checkVerdict({ root: repo.dir });
    assert.equal(miss.hit, false, "re-stage must change write-tree and miss");
    assert.notEqual(miss.tree, tree1);

    writeOk(okPath(repo.dir), miss.tree);
    const stale = checkVerdict({
      root: repo.dir,
      now: Date.now() + FRESH_MS + 1000,
    });
    assert.equal(stale.hit, false, "stale ok file must miss");
  } finally {
    repo.rm();
  }
});

test("run writes the cache only when green and the worktree matches the index", () => {
  const repo = scratchRepo("guards-run-");
  try {
    const pass = writeTinyPass(repo.dir);
    guardRoster(repo.dir, [pass]);
    fs.writeFileSync(path.join(repo.dir, "code.js"), "ok\n");
    repo.g("add", "-A");
    repo.g("commit", "-qm", "init");

    const green = runGuards({ root: repo.dir, files: [pass], spawn: spawnTests });
    assert.equal(green.status, 0, green.reason);
    assert.equal(green.wrote, true);
    assert.equal(fs.readFileSync(okPath(repo.dir), "utf8"), green.tree);

    // Red never writes — inject a failing spawn so the verdict path is isolated.
    fs.writeFileSync(path.join(repo.dir, "code.js"), "next\n");
    repo.g("add", "code.js");
    fs.rmSync(okPath(repo.dir), { force: true });
    const red = runGuards({
      root: repo.dir,
      files: [pass],
      spawn: () => ({ status: 1, stdout: "", stderr: "injected red" }),
    });
    assert.notEqual(red.status, 0);
    assert.equal(red.wrote, false);
    assert.equal(red.reason, "red");
    assert.equal(fs.existsSync(okPath(repo.dir)), false);

    // Dirty worktree: green suite, but unstaged tracked change → no write.
    fs.writeFileSync(path.join(repo.dir, "code.js"), "staged\n");
    repo.g("add", "code.js");
    fs.writeFileSync(path.join(repo.dir, "code.js"), "unstaged\n");
    const dirty = runGuards({ root: repo.dir, files: [pass], spawn: spawnTests });
    assert.equal(dirty.status, 0);
    assert.equal(dirty.wrote, false);
    assert.equal(dirty.dirty, true);
    assert.equal(dirty.reason, "dirty-tree");
    assert.equal(fs.existsSync(okPath(repo.dir)), false);
  } finally {
    repo.rm();
  }
});

test("CLI check message shape on the real checkout", () => {
  const r = spawnSync(process.execPath, [HELPER, "check"], {
    cwd: ROOT,
    encoding: "utf8",
    env: cleanEnv(),
  });
  if (r.status === 0) {
    assert.match(r.stdout, /^guards: cache hit [0-9a-f]{40}\n?$/);
  } else {
    assert.match(r.stderr, /guards: cache miss/);
  }
});

test("isFreshHit rejects a mismatched tree", () => {
  const repo = scratchRepo("guards-fresh-");
  try {
    fs.writeFileSync(path.join(repo.dir, "f.txt"), "a\n");
    repo.g("add", "-A");
    repo.g("commit", "-qm", "init");
    const tree = writeTree(repo.dir);
    const ok = okPath(repo.dir);
    writeOk(ok, "0".repeat(40));
    assert.equal(isFreshHit(ok, tree), false);
    writeOk(ok, tree);
    assert.equal(isFreshHit(ok, tree), true);
  } finally {
    repo.rm();
  }
});

test("pre-commit skips the suite on a cache hit and honours git config apex.guardTimeout", () => {
  const repo = scratchRepo("guards-hook-");
  try {
    const env = cleanEnv({
      PATH: path.join(repo.dir, "bin") + path.delimiter + (process.env.PATH || ""),
    });
    fs.mkdirSync(path.join(repo.dir, ".githooks"), { recursive: true });
    fs.mkdirSync(path.join(repo.dir, "tools/ci"), { recursive: true });
    fs.mkdirSync(path.join(repo.dir, "tools/check"), { recursive: true });
    fs.mkdirSync(path.join(repo.dir, "tools/gen"), { recursive: true });
    fs.mkdirSync(path.join(repo.dir, "node_modules"));
    fs.mkdirSync(path.join(repo.dir, "bin"));

    // Stub ratchet / targets so the real tools are never required in the fixture.
    fs.writeFileSync(path.join(repo.dir, "tools/check/ratchets.mjs"), "process.exit(0);\n");
    fs.writeFileSync(path.join(repo.dir, "tools/gen/targets.mjs"), "process.exit(0);\n");
    fs.writeFileSync(
      path.join(repo.dir, "tools/ci/guards-verdict.mjs"),
      `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
const cmd = process.argv[2];
if (cmd === "check") {
  if (process.env.APEX_FIXTURE_CACHE_HIT === "1") {
    const tree = spawnSync("git", ["write-tree"], { encoding: "utf8" }).stdout.trim();
    console.log("guards: cache hit " + tree);
    process.exit(0);
  }
  console.error("guards: cache miss fixture");
  process.exit(1);
}
process.exit(2);
`,
    );

    fs.writeFileSync(path.join(repo.dir, ".githooks/pre-commit"), fs.readFileSync(HOOK, "utf8"));
    fs.chmodSync(path.join(repo.dir, ".githooks/pre-commit"), 0o755);

    fs.writeFileSync(
      path.join(repo.dir, "bin/npm"),
      `#!/usr/bin/env bash
echo "npm $*" >> "${repo.dir}/npm-calls.log"
case "$*" in
  *test:guards*) sleep 30; exit 0 ;;
  *) exit 0 ;;
esac
`,
    );
    fs.chmodSync(path.join(repo.dir, "bin/npm"), 0o755);
    fs.writeFileSync(
      path.join(repo.dir, "package.json"),
      JSON.stringify({ scripts: { "test:guards": "sleep 30" } }),
    );
    fs.writeFileSync(path.join(repo.dir, "code.js"), "v1\n");
    fs.writeFileSync(path.join(repo.dir, ".gitignore"), "artifacts/\nnode_modules/\nnpm-calls.log\n");
    repo.g("add", "-A");
    repo.g("commit", "-qm", "init");
    repo.g("config", "core.hooksPath", ".githooks");

    fs.writeFileSync(path.join(repo.dir, "code.js"), "v2\n");
    repo.g("add", "code.js");

    // Cache hit path — must not invoke npm test:guards.
    let r = spawnSync("bash", [path.join(repo.dir, ".githooks/pre-commit")], {
      cwd: repo.dir,
      encoding: "utf8",
      env: { ...env, APEX_FIXTURE_CACHE_HIT: "1" },
    });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /guards: cache hit/);
    assert.equal(
      fs.existsSync(path.join(repo.dir, "npm-calls.log")),
      false,
      "cache hit must skip npm test:guards",
    );

    // Timeout via git config apex.guardTimeout (survives env-stripping hooks).
    repo.g("config", "apex.guardTimeout", "1");
    r = spawnSync("bash", [path.join(repo.dir, ".githooks/pre-commit")], {
      cwd: repo.dir,
      encoding: "utf8",
      env: { ...env, APEX_FIXTURE_CACHE_HIT: "0" },
    });
    assert.equal(r.status, 1, r.stderr + r.stdout);
    assert.match(r.stderr, /did not finish within 1s/);
    assert.ok(/apex\.guardTimeout/.test(r.stderr));
  } finally {
    repo.rm();
  }
});

test("bash-guard never runs the commit suite, even when guard cache is absent", () => {
 const repo=scratchRepo("guards-fast-");
 try {
  const r=spawnSync("bash",[path.join(ROOT,".claude/hooks/bash-guard.sh")],{
    input:JSON.stringify({tool_name:"Bash",tool_input:{command:"git commit -m x"}}),cwd:repo.dir,encoding:"utf8",env:repo.env});
  assert.equal(r.status,0,r.stderr);assert.equal(fs.existsSync(path.join(repo.dir,"artifacts/pre-commit-guards.log")),false);
 }finally{repo.rm();}
});
test("shipped pre-commit honours explicit bypass and runs for Claude Code", () => {
  const src = fs.readFileSync(HOOK, "utf8");
  assert.match(src, /APEX_SKIP_GUARDS/);
  assert.doesNotMatch(src, /\[ -n "\$\{CLAUDECODE:-\}" \] && exit 0/);
  assert.ok(/guards-verdict\.mjs check/.test(src));
  assert.ok(/apex\.guardTimeout/.test(src));
  assert.ok(/timeout -k 5/.test(src));
});

test("shipped bash-guard delegates guard cache and timeout to git pre-commit", () => {
 const src=fs.readFileSync(path.join(ROOT,".claude/hooks/bash-guard.sh"),"utf8");
 assert.doesNotMatch(src,/node .*guards-verdict\.mjs check/);
 assert.doesNotMatch(src,/APEX_COMMIT_GATE|APEX_GUARD_PROBE|flock -/);
});

test("a passing subset cannot certify the full guards roster; a complete rerun recovers", (t) => {
  const repo = scratchRepo("guards-subset-");
  t.after(repo.rm);
  const pass = writeTinyPass(repo.dir);
  const fail = writeTinyPass(repo.dir, "other.test.mjs");
  fs.writeFileSync(path.join(repo.dir, fail), 'import { test } from "node:test"; test("regression", () => { throw Error("red"); });');
  guardRoster(repo.dir, [pass, fail]);
  repo.g("add", "-A");
  const partial = runGuards({ root: repo.dir, files: [pass], spawn: spawnTests });
  assert.equal(partial.status, 0);
  assert.equal(partial.wrote, false, "a subset pass is not a full guard verdict");
  assert.equal(partial.reason, "partial-suite");
  assert.equal(checkVerdict({ root: repo.dir }).hit, false);
  assert.equal(runGuards({ root: repo.dir, spawn: spawnTests }).status, 1, "omitted failing guard must still run");
  writeTinyPass(repo.dir, "other.test.mjs");
  repo.g("add", "-A");
  assert.equal(runGuards({ root: repo.dir, files: [fail, pass], spawn: spawnTests }).wrote, true, "reordering the complete roster is safe");
  assert.equal(checkVerdict({ root: repo.dir }).hit, true);
});

test("guards cannot cache a different tree staged during execution", (t) => {
  const repo = scratchRepo("guards-restage-");
  t.after(repo.rm);
  const pass = writeTinyPass(repo.dir);
  guardRoster(repo.dir, [pass]);
  fs.writeFileSync(path.join(repo.dir, "code.js"), "original");
  repo.g("add", "-A");
  const result = runGuards({ root: repo.dir, spawn: () => {
    fs.writeFileSync(path.join(repo.dir, "code.js"), "untested");
    repo.g("add", "code.js");
    return { status: 0 };
  } });
  assert.equal(result.status, 0);
  assert.equal(result.wrote, false);
  assert.equal(result.reason, "changed-tree");
  assert.equal(checkVerdict({ root: repo.dir }).hit, false);
  assert.equal(runGuards({ root: repo.dir, spawn: spawnTests }).wrote, true);
});

test("failed and interrupted reruns invalidate an earlier green cache", (t) => {
  const repo = scratchRepo("guards-invalidate-");
  t.after(repo.rm);
  const pass = writeTinyPass(repo.dir);
  guardRoster(repo.dir, [pass]);
  repo.g("add", "-A");
  for (const result of [{ status: 1 }, { status: null, signal: "SIGTERM" }]) {
    writeOk(okPath(repo.dir), writeTree(repo.dir));
    const red = runGuards({ root: repo.dir, spawn: () => result });
    assert.notEqual(red.status, 0);
    assert.equal(checkVerdict({ root: repo.dir }).hit, false, "a previous pass cannot hide the latest failure");
  }
});

test("unavailable Git observations never establish a clean cacheable tree", (t) => {
  const repo = scratchRepo("guards-unknown-");
  t.after(repo.rm);
  const pass = writeTinyPass(repo.dir);
  guardRoster(repo.dir, [pass]);
  repo.g("add", "-A");
  const result = runGuards({ root: repo.dir, spawn: () => {
    fs.renameSync(path.join(repo.dir, ".git"), path.join(repo.dir, "git-unavailable"));
    fs.writeFileSync(path.join(repo.dir, ".git"), "unreadable Git metadata");
    return { status: 0 };
  } });
  assert.equal(result.wrote, false);
  assert.equal(result.reason, "git-inspection");
  assert.throws(() => unstagedTracked(repo.dir), /Cannot inspect/, "Git failure is unknown, not clean");
  assert.equal(fs.existsSync(okPath(repo.dir)), false);
});

test("the default guard runner executes every file even inside another Node test runner", (t) => {
  const repo = scratchRepo("guards-nested-");
  t.after(repo.rm);
  const pass = writeTinyPass(repo.dir);
  const fail = writeTinyPass(repo.dir, "nested-fail.test.mjs");
  fs.writeFileSync(path.join(repo.dir, fail), 'import { test } from "node:test"; test("must run", () => { throw Error("expected fixture failure"); });');
  guardRoster(repo.dir, [pass, fail]);
  repo.g("add", "-A");
  const inherited = process.env.NODE_TEST_CONTEXT;
  try {
    process.env.NODE_TEST_CONTEXT = "child-v8";
    const red = runGuards({ root: repo.dir });
    assert.equal(red.status, 1, "the failing file must produce a real red");
    assert.equal(red.wrote, false);
    assert.equal(checkVerdict({ root: repo.dir }).hit, false);
    writeTinyPass(repo.dir, "nested-fail.test.mjs");
    repo.g("add", "-A");
    const recovered = runGuards({ root: repo.dir });
    assert.equal(recovered.status, 0);
    assert.equal(recovered.wrote, true, "a complete successful nested rerun can be cached");
    assert.equal(checkVerdict({ root: repo.dir }).hit, true);
  } finally {
    if (inherited === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = inherited;
  }
});

/** Real Git commits through the shipped hook and real verdict helper; only the
 * unrelated ratchet/target generators are fixture stubs. */
function nativeHookRepo(t) {
  const repo = scratchRepo("guards-native-index-");
  t.after(repo.rm);
  for (const dir of [".githooks", "tools/ci", "tools/lib", "tools/check", "tools/gen", "tests/unit", "node_modules"]) {
    fs.mkdirSync(path.join(repo.dir, dir), { recursive: true });
  }
  for (const rel of [".githooks/pre-commit", "tools/ci/guards-verdict.mjs", "tools/lib/cli-args.mjs"]) {
    fs.copyFileSync(path.join(ROOT, rel), path.join(repo.dir, rel));
  }
  fs.chmodSync(path.join(repo.dir, ".githooks/pre-commit"), 0o755);
  fs.writeFileSync(path.join(repo.dir, "tools/check/ratchets.mjs"), 'process.exit(0);');
  fs.writeFileSync(path.join(repo.dir, "tools/gen/targets.mjs"), 'process.exit(0);');
  fs.writeFileSync(path.join(repo.dir, ".gitignore"), "artifacts/\nnode_modules/\n");
  fs.writeFileSync(path.join(repo.dir, "package.json"), JSON.stringify({ scripts: { "test:guards": "node tools/ci/guards-verdict.mjs run" } }));
  // These paths belong to the throwaway repository, not the project tree.
  const testFile = path.posix.join("tests/unit", "actual-guard.test.mjs");
  fs.writeFileSync(path.join(repo.dir, testFile), `import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("guard reads actual source", () => {
  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync("artifacts/guard-saw", fs.readFileSync("code.js"));
  assert.equal(fs.readFileSync("code.js", "utf8").trim(), "good");
});`);
  guardRoster(repo.dir, [testFile]);
  fs.writeFileSync(path.join(repo.dir, "code.js"), "good\n");
  fs.writeFileSync(path.join(repo.dir, "other.txt"), "original\n");
  repo.g("add", "-A");
  repo.g("commit", "-qm", "init");
  repo.g("config", "core.hooksPath", ".githooks");
  repo.commit = (...args) => spawnSync("git", ["commit", "-qm", "fixture", ...args], {
    cwd: repo.dir, encoding: "utf8", env: repo.env,
  });
  return repo;
}

test("native hook refuses a partially staged failing source hidden by an unstaged passing correction", (t) => {
  const repo = nativeHookRepo(t);
  const head = repo.g("rev-parse", "HEAD");
  fs.writeFileSync(path.join(repo.dir, "code.js"), "bad\n");
  repo.g("add", "code.js");
  const staged = repo.g("write-tree");
  fs.writeFileSync(path.join(repo.dir, "code.js"), "good\n");
  const refused = repo.commit();
  assert.equal(refused.status, 1, refused.stderr);
  assert.match(refused.stderr, /working tree.*does not match the commit index/);
  assert.equal(repo.g("rev-parse", "HEAD"), head);
  assert.equal(repo.g("write-tree"), staged, "refusal must not restage the passing worktree");
  assert.equal(repo.g("show", ":code.js"), "bad");
  assert.equal(fs.existsSync(path.join(repo.dir, "artifacts/guard-saw")), false, "refuse before a suite can certify different bytes");

  // A clean red remains red; a clean passing change commits after the repair.
  fs.writeFileSync(path.join(repo.dir, "code.js"), "bad\n");
  assert.equal(repo.commit().status, 1);
  assert.equal(fs.readFileSync(path.join(repo.dir, "artifacts/guard-saw"), "utf8"), "bad\n");
  fs.writeFileSync(path.join(repo.dir, "code.js"), "good \n");
  repo.g("add", "code.js");
  const repaired = repo.commit();
  assert.equal(repaired.status, 0, repaired.stderr);
  assert.equal(repo.g("show", "HEAD:code.js"), "good");
});

test("native hook honours commit -a's temporary index without committing the stale staged source", (t) => {
  const repo = nativeHookRepo(t);
  fs.writeFileSync(path.join(repo.dir, "code.js"), "bad\n");
  repo.g("add", "code.js");
  fs.writeFileSync(path.join(repo.dir, "code.js"), "good  \n");
  fs.writeFileSync(path.join(repo.dir, "other.txt"), "included by -a\n");
  const result = repo.commit("-a");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(repo.g("show", "HEAD:code.js"), "good");
  assert.equal(repo.g("show", "HEAD:other.txt"), "included by -a");
  assert.equal(repo.g("status", "--porcelain"), "");
  assert.equal(fs.readFileSync(path.join(repo.dir, "artifacts/guard-saw"), "utf8"), "good  \n");
});

test("pathspec commit cannot reuse a verdict for the original index; rejection preserves both indexes", (t) => {
  const repo = nativeHookRepo(t);
  const head = repo.g("rev-parse", "HEAD");
  const index = repo.g("write-tree");
  writeOk(okPath(repo.dir), index);
  fs.writeFileSync(path.join(repo.dir, "code.js"), "bad\n");
  const result = repo.commit("--", "code.js");
  assert.equal(result.status, 1, result.stderr);
  assert.doesNotMatch(result.stdout, /cache hit/, "cache lookup must inspect Git's pathspec index");
  assert.equal(repo.g("rev-parse", "HEAD"), head);
  assert.equal(repo.g("write-tree"), index, "failed pathspec commit preserves the original index");
  assert.equal(fs.readFileSync(path.join(repo.dir, "code.js"), "utf8"), "bad\n");
  assert.equal(fs.readFileSync(path.join(repo.dir, "artifacts/guard-saw"), "utf8"), "bad\n");
  fs.writeFileSync(path.join(repo.dir, "code.js"), "good \n");
  const repaired = repo.commit("--", "code.js");
  assert.equal(repaired.status, 0, repaired.stderr);
  assert.equal(repo.g("show", "HEAD:code.js"), "good");
});

test("matching native-hook cache remains valid for its staged tree despite a later unstaged edit", (t) => {
  const repo = nativeHookRepo(t);
  fs.writeFileSync(path.join(repo.dir, "code.js"), "good \n");
  repo.g("add", "code.js");
  const verdict = runGuards({ root: repo.dir, spawn: spawnTests });
  assert.equal(verdict.wrote, true);
  fs.rmSync(path.join(repo.dir, "artifacts/guard-saw"));
  fs.writeFileSync(path.join(repo.dir, "code.js"), "bad unstaged\n");
  const result = repo.commit();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout + result.stderr, /cache hit/);
  assert.equal(repo.g("show", "HEAD:code.js"), "good");
  assert.equal(fs.readFileSync(path.join(repo.dir, "code.js"), "utf8"), "bad unstaged\n");
  assert.equal(fs.existsSync(path.join(repo.dir, "artifacts/guard-saw")), false);
});

test("native hook refuses worktree provenance lost during an otherwise green suite", (t) => {
  const repo = nativeHookRepo(t);
  const rel = path.posix.join("tests/unit", "actual-guard.test.mjs");
  fs.appendFileSync(path.join(repo.dir, rel), '\ntest("mutates after the guard", () => { fs.writeFileSync("code.js", "bad after guard\\n"); });\n');
  repo.g("add", rel);
  const index = repo.g("write-tree");
  const head = repo.g("rev-parse", "HEAD");
  const result = repo.commit();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /working tree.*does not match the commit index/);
  assert.equal(repo.g("rev-parse", "HEAD"), head);
  assert.equal(repo.g("write-tree"), index);
  assert.equal(fs.existsSync(okPath(repo.dir)), false);
});

function realRatchetHookRepo(t, { fragment } = {}) {
  const repo = nativeHookRepo(t);
  fs.mkdirSync(path.join(repo.dir, "tools/hooks"), { recursive: true });
  fs.mkdirSync(path.join(repo.dir, "tests/data/ratchets.d"), { recursive: true });
  for (const rel of ["tools/check/ratchets.mjs", "tools/check/merge-hygiene.mjs", "tools/hooks/ratchet-reason.mjs"]) {
    fs.copyFileSync(path.join(ROOT, rel), path.join(repo.dir, rel));
  }
  fs.writeFileSync(path.join(repo.dir, "tests/data/ratchets.json"), JSON.stringify({ files: { "code.js": { lines: 2 } }, tree: {} }));
  // Ratchet fragments and checks below exist only in this scratch repository.
  const topic = path.posix.join("tests/data/ratchets.d", "main.json");
  if (fragment !== undefined) fs.writeFileSync(path.join(repo.dir, topic), JSON.stringify(fragment));
  // This committed unrelated fragment must never be rewritten or restaged.
  fs.writeFileSync(path.join(repo.dir, "tests/data/ratchets.d", "other.json"), JSON.stringify({ files: {} }));
  const check = path.posix.join("tests/unit", "effective-ratchet.test.mjs");
  fs.writeFileSync(path.join(repo.dir, check), `import { test } from "node:test";
import assert from "node:assert/strict";
import { load, measure, verdict } from "../../tools/check/ratchets.mjs";
test("the real effective ratchet covers the source", async () => assert.equal(verdict(await measure(load())).ok, true));`);
  guardRoster(repo.dir, [path.posix.join("tests/unit", "actual-guard.test.mjs"), check]);
  repo.g("add", "-A");
  repo.g("-c", "core.hooksPath=/dev/null", "commit", "-qm", "real ratchet fixture");
  repo.env.APEX_RATCHETS_BASE = "HEAD";
  return { ...repo, topic };
}

test("native auto-raise commits a new topic fragment and leaves unrelated untracked files alone", (t) => {
  const repo = realRatchetHookRepo(t);
  fs.writeFileSync(path.join(repo.dir, "unrelated.txt"), "leave untracked\n");
  fs.writeFileSync(path.join(repo.dir, "code.js"), "good\n\n");
  repo.g("add", "code.js");
  const beforeOther = repo.g("rev-parse", `HEAD:${path.posix.join("tests/data/ratchets.d", "other.json")}`);
  const result = repo.commit();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(repo.g("show", `HEAD:${repo.topic}`)).files["code.js"].lines, 1);
  assert.equal(repo.g("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"), `code.js\n${repo.topic}`);
  assert.equal(repo.g("rev-parse", `HEAD:${path.posix.join("tests/data/ratchets.d", "other.json")}`), beforeOther);
  assert.equal(repo.g("ls-files", "--", "unrelated.txt"), "");
  assert.equal(repo.g("diff", "--cached", "--name-only"), "");
});

test("native auto-raise updates a tracked topic fragment through commit -a's active index", (t) => {
  const repo = realRatchetHookRepo(t, { fragment: { files: { "code.js": { lines: 1 } } } });
  fs.writeFileSync(path.join(repo.dir, "code.js"), "good\n\n\n");
  const result = repo.commit("-a");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(repo.g("show", `HEAD:${repo.topic}`)).files["code.js"].lines, 2);
  assert.equal(repo.g("status", "--porcelain"), "");
  assert.equal(repo.g("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"), `code.js\n${repo.topic}`);
});

test("native pathspec auto-generation refuses without changing the user's index or committing a missing ceiling", (t) => {
  const repo = realRatchetHookRepo(t);
  fs.writeFileSync(path.join(repo.dir, "pending.txt"), "keep staged for later\n");
  repo.g("add", "pending.txt");
  const index = repo.g("write-tree"), head = repo.g("rev-parse", "HEAD");
  fs.writeFileSync(path.join(repo.dir, "code.js"), "good\n\n");
  const result = repo.commit("--", "code.js");
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /pathspec commit needs generated outputs that Git cannot reconcile/);
  assert.ok(result.stderr.includes(repo.topic), "refusal identifies the exact generated output");
  assert.match(result.stderr, /stage these outputs.*retry git commit without pathspecs/);
  assert.equal(repo.g("rev-parse", "HEAD"), head, "no commit can omit its effective ceiling");
  assert.equal(repo.g("write-tree"), index, "do not mutate a guessed original or pending index");
  assert.equal(repo.g("show", ":pending.txt"), "keep staged for later");
  assert.equal(repo.g("diff", "--cached", "--name-only"), "pending.txt", "no staged deletion of a hook-generated ceiling");
  assert.equal(repo.g("ls-files", "--", repo.topic), "", "leave the generated fragment for the user's staged retry");
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo.dir, repo.topic))).files["code.js"].lines, 1);
});

test("a clean no-generation pathspec commit preserves an unrelated staged path", (t) => {
  const repo = realRatchetHookRepo(t);
  fs.writeFileSync(path.join(repo.dir, "pending.txt"), "keep staged for later\n");
  repo.g("add", "pending.txt");
  fs.writeFileSync(path.join(repo.dir, "code.js"), "good \n");
  const result = repo.commit("--", "code.js");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(repo.g("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"), "code.js");
  assert.equal(repo.g("diff", "--cached", "--name-only"), "pending.txt");
  assert.equal(fs.existsSync(path.join(repo.dir, repo.topic)), false);
});

test("native auto-lowering stages deletion of an emptied tracked topic fragment", (t) => {
  const repo = realRatchetHookRepo(t, { fragment: { files: { "code.js": { lines: 100 } } } });
  fs.writeFileSync(path.join(repo.dir, "code.js"), "good \n");
  repo.g("add", "code.js");
  const result = repo.commit();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(repo.g("ls-tree", "HEAD", "--", repo.topic), "");
  assert.equal(repo.g("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"), `code.js\n${repo.topic}`);
  assert.equal(repo.g("status", "--porcelain"), "");
});

test("a no-change ratchet run stages no ratchet paths or unrelated files", (t) => {
  const repo = realRatchetHookRepo(t, { fragment: { files: { "code.js": { lines: 1 } } } });
  const topicBlob = repo.g("rev-parse", `HEAD:${repo.topic}`);
  fs.writeFileSync(path.join(repo.dir, "code.js"), "good \n");
  fs.writeFileSync(path.join(repo.dir, "unrelated.txt"), "leave untracked\n");
  repo.g("add", "code.js");
  const result = repo.commit();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(repo.g("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"), "code.js");
  assert.equal(repo.g("rev-parse", `HEAD:${repo.topic}`), topicBlob);
  assert.equal(repo.g("ls-files", "--", "unrelated.txt"), "");
});

test("a red ratchet run leaves the user's staged tree and unrelated files intact", (t) => {
  const repo = realRatchetHookRepo(t);
  fs.writeFileSync(path.join(repo.dir, "code.js"), "good\n" + "\n".repeat(60));
  fs.writeFileSync(path.join(repo.dir, "unrelated.txt"), "leave untracked\n");
  repo.g("add", "code.js");
  const index = repo.g("write-tree"), head = repo.g("rev-parse", "HEAD");
  const result = repo.commit();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /OVER/);
  assert.equal(repo.g("rev-parse", "HEAD"), head);
  assert.equal(repo.g("write-tree"), index);
  assert.equal(fs.existsSync(path.join(repo.dir, repo.topic)), false);
  assert.equal(repo.g("ls-files", "--", "unrelated.txt"), "");
});

test("pre-existing untracked ratchet inputs refuse before generation and are never auto-staged", (t) => {
  const repo = realRatchetHookRepo(t);
  const untracked = path.posix.join("tests/data/ratchets.d", "unrelated.json");
  fs.writeFileSync(path.join(repo.dir, untracked), JSON.stringify({ files: {} }));
  fs.writeFileSync(path.join(repo.dir, "code.js"), "good\n\n");
  repo.g("add", "code.js");
  const index = repo.g("write-tree"), head = repo.g("rev-parse", "HEAD");
  const result = repo.commit();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /untracked guard inputs must be staged or stashed first/);
  assert.equal(repo.g("rev-parse", "HEAD"), head);
  assert.equal(repo.g("write-tree"), index);
  assert.equal(repo.g("ls-files", "--", untracked), "");
  assert.equal(fs.existsSync(path.join(repo.dir, repo.topic)), false);
});

// The paths previously certified in PreToolUse now execute in Git's hook.
function splitFixture(prefix) {
  const repo=scratchRepo(prefix);
  const put=(rel,text)=>{fs.mkdirSync(path.dirname(path.join(repo.dir,rel)),{recursive:true});fs.writeFileSync(path.join(repo.dir,rel),text);};
  put('.gitignore','node_modules/\nartifacts/\ncalls.log\n');
  put('tools/check/ratchets.mjs','process.exit(0);\n');
  put('tools/gen/targets.mjs','console.log("tools/README.md");\n');
  put('tools/ci/guards-verdict.mjs','process.exit(1);\n');
  put('tests/unit/docs-integrity.test.mjs','import {test} from "node:test";test("docs",()=>{});\n');
  put('tests/data/ratchets.json','{}\n');
  put('package.json',JSON.stringify({scripts:{'test:guards':'node -e "require(\'fs\').appendFileSync(\'calls.log\',\'guards\\n\')"'}}));
  put('code.js','v1\n');put('docs/PHYSICS.md','note\n');put('tools/README.md','generated\n');
  fs.mkdirSync(path.join(repo.dir,'node_modules'));
  repo.g('add','-A');repo.g('commit','-qm','fixture');
  const run=(cwd=repo.dir,extra={})=>spawnSync('bash',[HOOK],{cwd,encoding:'utf8',env:{...repo.env,CLAUDECODE:'1',...extra}});
  return {...repo,put,run};
}

test('git hook classifies docs, survey assets, generated docs and code; runs under Claude Code',()=>{
 const r=splitFixture('split-paths-');
 try{
  for(const rel of ['docs/PHYSICS.md','artifacts/shots/tracks/spa/t1.png','artifacts/shots/gallery/index.html','artifacts/track-survey/spa/report.json']){
   r.put(rel,'changed\n');r.g('add','-f',rel);
   const out=r.run();assert.equal(out.status,0,out.stderr);assert.match(out.stderr,/docs-only commit/);
   assert.equal(fs.existsSync(path.join(r.dir,'calls.log')),false,'docs never run full guards');
   r.g('commit','-qm','docs');
  }
  for(const rel of ['code.js','tools/README.md','assets/pack/x.png','artifacts/shots/other/x.png','artifacts/track-survey/spa/run.js']){
   r.put(rel,'changed\n');r.g('add','-f',rel);
   const before=fs.existsSync(path.join(r.dir,'calls.log'))?fs.readFileSync(path.join(r.dir,'calls.log'),'utf8'):'';
   const out=r.run();assert.equal(out.status,0,out.stderr);assert.match(out.stderr,/code commit/);
   assert.equal(fs.readFileSync(path.join(r.dir,'calls.log'),'utf8'),before+'guards\n',rel);
   r.g('commit','-qm','code');
  }
 }finally{r.rm();}
});

test('git hook refuses unstaged tracked bytes and actual git -a reconciles its index',()=>{
 const r=splitFixture('split-index-');
 try{
  r.put('docs/PHYSICS.md','staged\n');r.g('add','docs/PHYSICS.md');r.put('code.js','unstaged\n');
  const out=r.run();assert.equal(out.status,1,out.stderr);assert.match(out.stderr,/does not match the commit index/);assert.match(out.stderr,/code.js/);
  fs.mkdirSync(path.join(r.dir,'.githooks'));fs.copyFileSync(HOOK,path.join(r.dir,'.githooks/pre-commit'));fs.chmodSync(path.join(r.dir,'.githooks/pre-commit'),0o755);
  r.g('add','.githooks');r.g('config','core.hooksPath','.githooks');
  const commit=spawnSync('git',['commit','-am','actual hook'],{cwd:r.dir,encoding:'utf8',env:{...r.env,CLAUDECODE:'1'}});
  assert.equal(commit.status,0,commit.stderr);assert.match(commit.stderr,/code commit/);assert.equal(r.g('status','--porcelain'),'');
 }finally{r.rm();}
});

test('git hook borrows dependencies only in a linked worktree and skips asset-only trees without tools',()=>{
 const r=splitFixture('split-linked-'),wt=r.dir+'-linked';
 try{
  r.g('worktree','add','-q','-b','linked',wt);assert.equal(fs.existsSync(path.join(wt,'node_modules')),false);
  fs.writeFileSync(path.join(wt,'docs/PHYSICS.md'),'linked\n');execFileSync('git',['add','docs/PHYSICS.md'],{cwd:wt,env:r.env});
  let out=r.run(wt);assert.equal(out.status,0,out.stderr);assert.equal(fs.realpathSync(path.join(wt,'node_modules')),fs.realpathSync(path.join(r.dir,'node_modules')));
  fs.rmSync(path.join(r.dir,'node_modules'),{recursive:true});r.put('docs/PHYSICS.md','main\n');r.g('add','docs/PHYSICS.md');
  out=r.run();assert.equal(out.status,1,out.stderr);assert.match(out.stderr,/node_modules is missing/);
  r.g('reset','--hard','HEAD');fs.rmSync(path.join(r.dir,'tools'),{recursive:true});r.g('add','-A');r.g('commit','-qm','asset branch');
  r.put('assets/new.png','asset');r.g('add','assets');out=r.run();assert.equal(out.status,0,out.stderr);assert.match(out.stderr,/guards skipped.*no tools/);
  r.put(path.posix.join('js','new.js'),'code');r.g('add','js');out=r.run();assert.equal(out.status,1,out.stderr);assert.doesNotMatch(out.stderr,/guards skipped/);
 }finally{spawnSync('git',['worktree','remove','--force',wt],{cwd:r.dir,env:r.env});r.rm();}
});

test("guards-report lists EVERY failing guard with a fix command, not just the first (efficiency review finding 4)", () => {
  const tap = [
    "TAP version 13", "# Subtest: pins never grow", "not ok 1 - pins never grow", "  ---",
    "  location: '/x/tests/unit/assert-match-ratchet.test.mjs:1:1'", "  error: '12 pins > ceiling 10'", "  ...",
    "# Subtest: order", "not ok 2 - groups.json order", "  ---", "  location: '/x/tests/unit/groups.test.mjs:3:1'", "  error: 'groups.json out of order'", "  ...",
    "not ok 3 - /x/tests/unit/groups.test.mjs", "  ---", "  ...",
    "ok 4 - fine",
  ].join("\n");
  const fails = parseFailures(tap);
  assert.deepEqual(fails.map((f) => f.name), ["pins never grow", "groups.json order"], "file-level wrapper dropped, both reds kept");
  const text = guardsReport(tap);
  assert.equal(/2 failing guards/.test(text), true, "text ~ " + /2 failing guards/);
  assert.equal(/ratchets\.mjs --update --lower-only/.test(text), true, "text ~ " + /ratchets\.mjs --update --lower-only/);
  assert.equal(/npm run gen/.test(text), true, "text ~ " + /npm run gen/);
  assert.equal(guardsReport("ok 1 - fine\n"), "");
});
