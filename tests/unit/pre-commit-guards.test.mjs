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
} from "../../tools/ci/guards-verdict.mjs";

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

/** Spawn that runs listed relative test files under cwd. */
function spawnTests(files, cwd) {
  return spawnSync(process.execPath, ["--test", ...files], {
    cwd,
    encoding: "utf8",
  });
}

test("OK_REL and FRESH_MS match bash-guard's cache file and 10-minute window", () => {
  assert.equal(OK_REL, "artifacts/pre-commit-guards.ok");
  assert.equal(FRESH_MS, 10 * 60 * 1000);
  const bash = fs.readFileSync(path.join(ROOT, ".claude/hooks/bash-guard.sh"), "utf8");
  assert.match(bash, /pre-commit-guards\.ok/);
  assert.match(bash, /-mmin -10/);
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
    assert.match(r.stderr, /apex\.guardTimeout/);
  } finally {
    repo.rm();
  }
});

test("shipped pre-commit still early-exits on APEX_SKIP_GUARDS and CLAUDECODE", () => {
  const src = fs.readFileSync(HOOK, "utf8");
  assert.match(src, /APEX_SKIP_GUARDS/);
  assert.match(src, /CLAUDECODE/);
  assert.match(src, /guards-verdict\.mjs check/);
  assert.match(src, /apex\.guardTimeout/);
  assert.match(src, /timeout -k 5/);
});
