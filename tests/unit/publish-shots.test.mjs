// publish-shots — tools/ci/publish-shots.mjs cuts shots/<topic> from the ship tip in a temporary
// worktree and pushes ONLY shots/*. Every case runs against a throwaway bare repo + clone under
// artifacts/ (never the real origin); the clone's hooks are git's defaults, so the commit is plain.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertShotsBranch, MAX_BYTES } from "../../tools/ci/publish-shots.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TOOL = path.join(ROOT, "tools", "ci", "publish-shots.mjs");
const SHIP = "claude/f1-game-project-26h3ng";
const TMP = path.join(ROOT, "artifacts", `publish-shots-test-${process.pid}`);
const REMOTE = path.join(TMP, "remote.git");
const WORK = path.join(TMP, "work");
const SHOTS = path.join(TMP, "png");

// A real 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const run = (cmd, args, cwd, extra = {}) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", ...extra });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || ""), stdout: r.stdout || "" };
};
const git = (cwd, ...args) => {
  const r = run("git", args, cwd);
  assert.equal(r.code, 0, `git ${args.join(" ")}: ${r.out}`);
  return r.stdout.trim();
};
const tool = (args, cwd = WORK) => run("node", [TOOL, ...args], cwd);
const remoteRefs = () => git(REMOTE, "for-each-ref", "--format=%(refname)").split("\n").sort();
const png = (name, bytes = PNG) => {
  const p = path.join(SHOTS, name);
  fs.writeFileSync(p, bytes);
  return p;
};

before(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  git(TMP, "init", "--bare", "-q", "-b", SHIP, REMOTE);
  git(TMP, "clone", "-q", REMOTE, WORK);
  git(WORK, "config", "user.name", "t");
  git(WORK, "config", "user.email", "t@example.test");
  git(WORK, "config", "commit.gpgsign", "false");
  git(WORK, "checkout", "-q", "-b", SHIP);
  fs.writeFileSync(path.join(WORK, "seed.txt"), "seed\n");
  git(WORK, "add", "seed.txt");
  git(WORK, "commit", "-q", "-m", "seed");
  git(WORK, "push", "-q", "origin", SHIP);
  fs.mkdirSync(path.join(WORK, "node_modules"));
});
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

test("assertShotsBranch lets only shots/<name> through", () => {
  assert.doesNotThrow(() => assertShotsBranch("shots/hud-survey"));
  for (const bad of [SHIP, "cursor/x", "shots/", "shots", "shots/../x", "refs/heads/shots/x", "shots/a b", "main"]) {
    assert.throws(() => assertShotsBranch(bad), /shots\//, bad);
  }
  assert.equal(MAX_BYTES, 400 * 1024);
});

test("--help documents the node_modules requirement", () => {
  const r = tool(["--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /node_modules/);
  assert.match(r.out, /--append/);
  assert.match(r.out, /--dry-run/);
});

test("refuses a non-PNG, naming the file", () => {
  const jpg = path.join(SHOTS, "photo.jpg");
  fs.writeFileSync(jpg, "not a png");
  const fake = path.join(SHOTS, "fake.png");
  fs.writeFileSync(fake, "plain text with a png name");
  for (const f of [jpg, fake]) {
    const r = tool(["bad-type", f]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, new RegExp(path.basename(f).replace(".", "\\.")));
    assert.match(r.out, /PNG/);
  }
  assert.deepEqual(remoteRefs(), [`refs/heads/${SHIP}`]);
});

test("refuses a file over 400 KB and suggests downscaling", () => {
  const big = png("big.png", Buffer.concat([PNG, Buffer.alloc(MAX_BYTES + 1)]));
  const r = tool(["too-big", big]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /big\.png/);
  assert.match(r.out, /400 KB/);
  assert.match(r.out, /downscal/i);
  assert.deepEqual(remoteRefs(), [`refs/heads/${SHIP}`]);
});

test("refuses a topic with a wrong prefix or odd characters", () => {
  const a = png("a.png");
  for (const t of ["cursor/foo", "claude/f1-game-project-26h3ng", "../x", "a b", "-x", "shots/a/b"]) {
    const r = tool([t, a]);
    assert.equal(r.code, 1, `${t}: ${r.out}`);
    assert.match(r.out, /topic/i, t);
  }
  assert.deepEqual(remoteRefs(), [`refs/heads/${SHIP}`]);
});

test("refuses a missing file and an empty file list", () => {
  assert.match(tool(["nofile", path.join(SHOTS, "nope.png")]).out, /nope\.png/);
  const r = tool(["nofile"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /png/i);
});

test("refuses when node_modules is missing", () => {
  const nm = path.join(WORK, "node_modules");
  fs.renameSync(nm, nm + ".off");
  try {
    const r = tool(["nm", png("a.png")]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /node_modules/);
  } finally {
    fs.renameSync(nm + ".off", nm);
  }
});

test("--dry-run prints the plan and leaves remote, worktrees and branches untouched", () => {
  const r = tool(["dry", png("a.png"), "--readme", "a.png=shows the dry thing", "--dry-run"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /dry run/i);
  assert.match(r.out, /shots\/dry/);
  assert.match(r.out, /a\.png/);
  assert.match(r.out, /shows the dry thing/);
  assert.deepEqual(remoteRefs(), [`refs/heads/${SHIP}`]);
  assert.equal(git(WORK, "worktree", "list").split("\n").length, 1);
  assert.equal(git(WORK, "branch", "--list", "shots/*"), "");
});

test("full publish: branch cut from ship tip, README, push, cleanup", () => {
  const shipTip = git(REMOTE, "rev-parse", `refs/heads/${SHIP}`);
  const map = path.join(TMP, "map.json");
  fs.writeFileSync(map, JSON.stringify({ "b.png": "from the map" }));
  const r = tool([
    "t1", png("a.png"), png("b.png"),
    "--readme", "a.png=proves the A thing", "--map", map,
  ]);
  assert.equal(r.code, 0, r.out);
  const sha = git(REMOTE, "rev-parse", "refs/heads/shots/t1");
  assert.match(r.out, /shots\/t1/);
  assert.ok(r.out.includes(sha), "prints the pushed commit sha");
  assert.match(r.out, /shots\/t1\/a\.png/);
  assert.match(r.out, /shots\/t1\/b\.png/);
  assert.equal(git(REMOTE, "rev-parse", `${sha}^`), shipTip);
  assert.deepEqual(remoteRefs(), [`refs/heads/${SHIP}`, "refs/heads/shots/t1"]);
  const files = git(REMOTE, "ls-tree", "-r", "--name-only", sha).split("\n");
  assert.deepEqual(files.sort(), ["seed.txt", "shots/t1/README.md", "shots/t1/a.png", "shots/t1/b.png"]);
  assert.ok(!files.includes("node_modules"), "the symlink is never committed");
  const readme = git(REMOTE, "show", `${sha}:shots/t1/README.md`);
  assert.match(readme, /a\.png.*proves the A thing/);
  assert.match(readme, /b\.png.*from the map/);
  assert.equal(git(WORK, "worktree", "list").split("\n").length, 1, "temporary worktree removed");
  assert.equal(git(WORK, "branch", "--list", "shots/*"), "", "local shots branch removed");
  assert.deepEqual(fs.readdirSync(path.join(WORK, "artifacts", "publish-shots")), [], "temp dir emptied");
});

test("an existing topic is refused without --append", () => {
  const before = remoteRefs();
  const tip = git(REMOTE, "rev-parse", "refs/heads/shots/t1");
  const r = tool(["t1", png("c.png")]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /--append/);
  assert.deepEqual(remoteRefs(), before);
  assert.equal(git(REMOTE, "rev-parse", "refs/heads/shots/t1"), tip);
});

test("--append stacks a fast-forward commit on the existing branch", () => {
  const first = git(REMOTE, "rev-parse", "refs/heads/shots/t1");
  const r = tool(["t1", png("c.png"), "--readme", "c.png=the later shot", "--append"]);
  assert.equal(r.code, 0, r.out);
  const sha = git(REMOTE, "rev-parse", "refs/heads/shots/t1");
  assert.notEqual(sha, first);
  assert.equal(git(REMOTE, "rev-parse", `${sha}^`), first);
  const files = git(REMOTE, "ls-tree", "-r", "--name-only", sha).split("\n");
  assert.ok(files.includes("shots/t1/a.png") && files.includes("shots/t1/c.png"));
  const readme = git(REMOTE, "show", `${sha}:shots/t1/README.md`);
  assert.match(readme, /a\.png.*proves the A thing/);
  assert.match(readme, /c\.png.*the later shot/);
  // Re-adding a file that is already on the branch is refused, not silently overwritten.
  const dup = tool(["t1", png("c.png"), "--append"]);
  assert.equal(dup.code, 1, dup.out);
  assert.match(dup.out, /c\.png/);
});

test("--append to a topic that does not exist is refused", () => {
  const r = tool(["ghost", png("a.png"), "--append"]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /does not exist|no such|not found/i);
  assert.ok(!remoteRefs().includes("refs/heads/shots/ghost"));
});
