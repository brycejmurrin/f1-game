// git-fixture-env — fixture git never reaches the caller's repository (#1807).
// A git hook exports GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE & co.; a unit test
// that builds a fixture repo and runs git with only `cwd:` set then acted on
// the CALLER (981169627: a pre-commit test:guards run switched the real
// worktree to ci-coverage's fixture branch `feature`). Every repo here is a
// throwaway under os.tmpdir(): the poisoned env points at a DECOY repo, never
// at this checkout. A few seconds.
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GIT_LOCAL_ENV_VARS, stripGitLocalEnv } from "../helpers/git-fixture-env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HELPER = path.join(ROOT, "tests/helpers/git-fixture-env.mjs");
const ID = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
// The env every DECOY query runs with: nothing repository-local, so it reads the decoy itself.
const CLEAN = { ...stripGitLocalEnv(process.env), ...ID };
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: CLEAN }).trim();

function decoyRepo(tmp, name) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir);
  git(dir, "init", "-q", "-b", "decoy-main");
  fs.writeFileSync(path.join(dir, "f.txt"), "decoy\n");
  git(dir, "add", "f.txt"); git(dir, "commit", "-q", "-m", "decoy");
  const gitDir = path.join(dir, ".git");
  return {
    dir,
    // What a pre-commit hook in a linked worktree exports (measured, git 2.43):
    // absolute GIT_DIR and GIT_INDEX_FILE, no GIT_WORK_TREE — so git takes the
    // fixture's cwd as the work tree and writes the decoy's index and refs.
    hookEnv: { GIT_DIR: gitDir, GIT_INDEX_FILE: path.join(gitDir, "index"), GIT_PREFIX: "" },
    // The wider set: GIT_WORK_TREE and GIT_COMMON_DIR too.
    wideEnv: { GIT_DIR: gitDir, GIT_WORK_TREE: dir, GIT_COMMON_DIR: gitDir, GIT_INDEX_FILE: path.join(gitDir, "index"), GIT_PREFIX: "" },
    state: () => ({
      head: git(dir, "rev-parse", "HEAD"),
      branch: git(dir, "branch", "--show-current"),
      branches: git(dir, "for-each-ref", "--format=%(refname)", "refs/heads"),
      index: crypto.createHash("sha256").update(fs.readFileSync(path.join(gitDir, "index"))).digest("hex"),
      files: fs.readdirSync(dir).sort().join(","),
      f: fs.readFileSync(path.join(dir, "f.txt"), "utf8"),
    }),
  };
}

// The ci-coverage pages-reuse fixture path that rewrote the checkout, plus a
// git-spawning "tool under test" that inherits process.env. Runs in a child
// node with the poisoned env; `scrub` imports the helper first, as the tests do.
const fixtureScript = (fixture, scrub) => `
${scrub ? `import ${JSON.stringify(pathToFileURL(HELPER).href)};` : ""}
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const dir = ${JSON.stringify(fixture)};
const g = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
g("init", "-q", "-b", "deploy");
fs.writeFileSync(dir + "/f.txt", "A"); g("add", "."); g("commit", "-q", "-m", "A");
g("checkout", "-q", "-b", "feature");
fs.writeFileSync(dir + "/f.txt", "B"); g("commit", "-q", "-am", "B");
const tool = execFileSync("bash", ["-c", "git rev-parse --absolute-git-dir"], { cwd: dir, encoding: "utf8" }).trim();
process.stdout.write(JSON.stringify({ tool }));
`;

function runFixture(tmp, name, poison, scrub) {
  const fixture = path.join(tmp, name);
  fs.mkdirSync(fixture);
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", fixtureScript(fixture, scrub)],
    { cwd: fixture, encoding: "utf8", env: { ...CLEAN, ...poison } });
  return { fixture, r };
}

test("the helper's list is git's own, and the strip keeps everything else", () => {
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_PREFIX", "GIT_CONFIG_PARAMETERS",
    "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"]) assert.ok(GIT_LOCAL_ENV_VARS.includes(k), k);
  const listed = execFileSync("git", ["rev-parse", "--local-env-vars"], { cwd: os.tmpdir(), encoding: "utf8", env: CLEAN })
    .split("\n").filter(Boolean);
  for (const k of listed) assert.ok(GIT_LOCAL_ENV_VARS.includes(k), `git lists ${k}; the helper must scrub it`);
  const out = stripGitLocalEnv({ PATH: "/bin", GIT_DIR: "/x", GIT_INDEX_FILE: "/x/index", GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.bare", GIT_CONFIG_VALUE_0: "true", GIT_AUTHOR_NAME: "kept", GIT_EDITOR: ":" });
  assert.deepEqual(out, { PATH: "/bin", GIT_AUTHOR_NAME: "kept", GIT_EDITOR: ":" });
  for (const k of GIT_LOCAL_ENV_VARS) assert.equal(process.env[k], undefined, `importing the helper scrubs ${k} from process.env`);
});

test("a hook's GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE: the fixture uses its own .git, the decoy is untouched", () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "apex-git-fixture-env-")));
  try {
    // Control: WITHOUT the helper the same path lands in the decoy — the bug, so
    // this test can tell a fix from a fixture that never reached the hazard.
    const control = decoyRepo(tmp, "decoy-control");
    const before0 = control.state();
    const raw = runFixture(tmp, "fixture-raw", control.hookEnv, false);
    const after0 = control.state();
    assert.equal(fs.existsSync(path.join(raw.fixture, ".git")), false, "control: the raw fixture never got its own .git");
    assert.equal(after0.branch, "feature", `control: the hook env must switch the decoy's branch (premise) ${raw.r.stderr}`);
    assert.notEqual(after0.head, before0.head, "control: …and commit into it");

    for (const shape of ["hookEnv", "wideEnv"]) {
      const decoy = decoyRepo(tmp, `decoy-${shape}`);
      const before = decoy.state();
      const { fixture, r } = runFixture(tmp, `fixture-${shape}`, decoy[shape], true);
      assert.equal(r.status, 0, `${shape}: ${r.stderr}`);
      assert.deepEqual(decoy.state(), before, `${shape}: decoy HEAD, branches, current branch, index and files are unchanged`);
      assert.equal(git(fixture, "branch", "--show-current"), "feature", shape);
      assert.equal(git(fixture, "rev-list", "--count", "HEAD"), "2", shape);
      assert.equal(JSON.parse(r.stdout).tool, fs.realpathSync(path.join(fixture, ".git")),
        `${shape}: a git-spawning tool under test inherits the scrubbed env and finds the fixture's .git`);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// Static half: a test that CREATES a repo (git init / clone) must import the
// helper before anything else, or the next one rewrites a caller's checkout.
test("every unit test that builds a fixture repo imports the helper first", () => {
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : /\.(mjs|cjs|js)$/.test(e.name) ? [path.join(d, e.name)] : []);
  const offenders = [], users = [];
  for (const f of [...walk("tests/unit"), ...walk("tests/helpers")]) {
    if (f === path.join("tests/helpers", "git-fixture-env.mjs")) continue;
    const s = fs.readFileSync(path.join(ROOT, f), "utf8");
    const spawnsGit = /(?:execFileSync|spawnSync|execFile|spawn)\(\s*"git"|\bexecSync\(\s*[`"']git /.test(s);
    const makesRepo = /["'](?:init|clone)["']|git (?:init|clone)\b/.test(s);
    if (!(spawnsGit && makesRepo)) continue;
    users.push(f);
    const firstImport = s.split("\n").find((l) => l.startsWith("import "));
    if (!/^import "\.\.\/helpers\/git-fixture-env\.mjs";/.test(firstImport || "")) offenders.push(f);
  }
  assert.ok(users.length >= 10, `the scan found ${users.length} fixture-repo tests; the detector has gone blind`);
  assert.deepEqual(offenders, [], 'first import must be `import "../helpers/git-fixture-env.mjs";` (#1807)');
});

test(".githooks/pre-commit runs test:guards with the repository-local variables unset", () => {
  const hook = fs.readFileSync(path.join(ROOT, ".githooks/pre-commit"), "utf8");
  assert.match(hook, /\(\s*unset \$\(git rev-parse --local-env-vars\);\s*npm run --silent test:guards\s*\)/);
  assert.ok(hook.indexOf("--auto-raise") < hook.indexOf("unset $(git rev-parse --local-env-vars)"),
    "the ratchet auto-raise stages into the commit's index, so it runs before the unset");
});
