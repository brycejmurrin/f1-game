// repo-size — the full-history size report behind .github/workflows/repo-size.yml.
// It exists because a shallow agent clone once sized this repository wrong
// (2026-10-01), so the load-bearing behaviour is the REFUSAL: a shallow clone
// exits 2 instead of printing a confident wrong number. The aggregation is
// pinned on fixtures (an object counted once, blobs ranked by packed size,
// totals per directory and extension); a real-git fixture under artifacts/
// (never /tmp) proves the report on a full clone and the refusal on a shallow
// one. The workflow is pinned read-only, dispatch-only and fetch-depth 0.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarize, render, main } from "../../tools/ci/repo-size.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MB = 1048576;

test("summarize counts an object once and ranks blobs, directories and extensions by packed size", () => {
  const s = summarize([
    `commit c1 300 200`,
    `tree ee1 100 80`,
    `blob b1 ${10 * MB} ${8 * MB} assets/music/song.mp3`,
    `blob b1 ${10 * MB} ${8 * MB} assets/music/song-renamed.mp3`,
    `blob b2 ${2 * MB} ${1 * MB} js/game.js`,
    `blob b3 500 300 README.md`,
    `not a line`,
  ].join("\n"), { top: 2 });
  assert.equal(s.objects, 5, "b1 twice is one object");
  assert.equal(s.disk, 200 + 80 + 8 * MB + 1 * MB + 300);
  assert.deepEqual(s.top.map((b) => [b.sha, b.path]), [["b1", "assets/music/song.mp3"], ["b2", "js/game.js"]]);
  assert.deepEqual(s.byDir.map(([d]) => d), ["assets", "js", "(root)"]);
  assert.deepEqual(s.byExt.map(([e]) => e), ["mp3", "js", "md"]);
  const md = render(s, { refs: 3 });
  assert.match(md, /\| `assets` \| 8\.0 MB \|/);
  assert.match(md, /\| 8\.0 MB \| 10\.0 MB \| `assets\/music\/song\.mp3` \| `b1` \|/);
});

test("against real git: a full clone is measured, a shallow clone is refused", () => {
  const dir = path.join(ROOT, "artifacts", `repo-size-test-${process.pid}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  const cwd = process.cwd();
  const out = [], err = [];
  const log = console.log, error = console.error, write = process.stdout.write;
  try {
    const full = path.join(dir, "full"), shallow = path.join(dir, "shallow");
    fs.mkdirSync(path.join(full, "assets"), { recursive: true });
    g(full, "init", "-q", "-b", "main");
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(path.join(full, "assets", "big.bin"), Buffer.alloc(200_000, i + 1));
      fs.writeFileSync(path.join(full, "small.txt"), "commit " + i + "\n");
      g(full, "add", "-A"); g(full, "commit", "-q", "-m", "c" + i);
    }
    g(dir, "clone", "-q", "--depth", "1", "file://" + full, shallow);
    process.stdout.write = (s) => { out.push(String(s)); return true; };
    console.error = (m) => err.push(String(m));
    process.chdir(full);
    assert.equal(main([]), 0);
    process.chdir(shallow);
    assert.equal(main([]), 2, "a shallow clone must not be measured");
  } finally {
    process.chdir(cwd);
    process.stdout.write = write; console.log = log; console.error = error;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const md = out.join("");
  assert.match(md, /\| `assets` \|/, "all three versions of the big file are history, and history is measured");
  assert.match(md, /`assets\/big\.bin`/);
  assert.match(err.join(""), /SHALLOW/);
});

test("the workflow is read-only, dispatch-only and checks out full history", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/repo-size.yml"), "utf8");
  const on = yml.slice(yml.indexOf("\non:"), yml.indexOf("\npermissions:"));
  assert.match(on, /workflow_dispatch:/);
  assert.doesNotMatch(on, /\n  (push|pull_request|schedule):/);
  assert.match(yml, /permissions:\n  contents: read\n/);
  assert.doesNotMatch(yml, /contents: write/);
  assert.match(yml, /fetch-depth: 0/);
});
