// ready-full-cap — Merge Desk refuse when too many ready PRs hold full-tier CI.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_LIVE, CI_PATH, DEPLOY, evaluate, reportLine, measure,
} from "../../tools/ci/ready-full-cap.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const pr = (n, ref, draft = false, title = `pr ${n}`) => ({
  number: n, title, draft, head: { ref },
});
const run = (branch, status = "in_progress", extra = {}) => ({
  path: CI_PATH, event: "pull_request", status, head_branch: branch, id: extra.id || 1,
  html_url: extra.url || `https://example.test/${branch}`,
});

test("defaults: deploy base, ci.yml path, cap of 3", () => {
  assert.equal(DEPLOY, "claude/f1-game-project-26h3ng");
  assert.equal(CI_PATH, ".github/workflows/ci.yml");
  assert.equal(MAX_LIVE, 3);
});

test("draft PR runs never count toward the ready full-tier cap", () => {
  const v = evaluate(
    [pr(1, "cursor/a", true), pr(2, "cursor/b", false)],
    [run("cursor/a"), run("cursor/b")],
  );
  assert.equal(v.count, 1);
  assert.equal(v.ok, true);
  assert.deepEqual(v.slots.map((s) => s.headRefName), ["cursor/b"]);
});

test("ship pushes and non-ci workflows do not count", () => {
  const v = evaluate(
    [pr(1, "cursor/a")],
    [
      { path: CI_PATH, event: "push", status: "in_progress", head_branch: DEPLOY, id: 9 },
      { path: ".github/workflows/pages.yml", event: "workflow_dispatch", status: "in_progress", head_branch: "cursor/a", id: 8 },
      { path: CI_PATH, event: "pull_request", status: "completed", head_branch: "cursor/a", id: 7 },
    ],
  );
  assert.equal(v.count, 0);
  assert.equal(v.ok, true);
});

test("queued and in_progress both consume a slot; one PR one slot", () => {
  const v = evaluate(
    [pr(10, "cursor/a"), pr(11, "cursor/b")],
    [run("cursor/a", "queued", { id: 1 }), run("cursor/a", "in_progress", { id: 2 }), run("cursor/b", "queued", { id: 3 })],
  );
  assert.equal(v.count, 2);
  assert.equal(v.slots.find((s) => s.headRefName === "cursor/a").status, "in_progress");
  assert.equal(v.ok, true, "2 < default cap 3");
});

test("at cap refuses; under cap allows; --exclude frees a slot", () => {
  const prs = [pr(1, "a"), pr(2, "b"), pr(3, "c"), pr(4, "d")];
  const runs = [run("a", "in_progress", { id: 1 }), run("b", "queued", { id: 2 }), run("c", "in_progress", { id: 3 })];
  const full = evaluate(prs, runs);
  assert.equal(full.count, 3);
  assert.equal(full.ok, false, "3 is not < 3");
  assert.match(reportLine(full), /REFUSE mark-ready/);
  const room = evaluate(prs, runs, { exclude: ["c"] });
  assert.equal(room.count, 2);
  assert.equal(room.ok, true);
  assert.match(reportLine(room), /room to mark ready/);
  const tight = evaluate(prs, runs, { cap: 2 });
  assert.equal(tight.ok, false);
});

test("measure uses injected request and pages open PRs", () => {
  const calls = [];
  const request = (qs) => {
    calls.push(qs);
    if (qs.startsWith("pulls?")) {
      return { json: [pr(5, "cursor/live"), pr(6, "cursor/draft", true)] };
    }
    if (qs.includes("status=in_progress")) {
      return { json: { workflow_runs: [run("cursor/live", "in_progress", { id: 50 })] } };
    }
    if (qs.includes("status=queued")) {
      return { json: { workflow_runs: [] } };
    }
    return { error: `unexpected ${qs}` };
  };
  const v = measure({ request, cap: 3 });
  assert.equal(v.error, undefined);
  assert.equal(v.count, 1);
  assert.equal(v.ok, true);
  assert.ok(calls.some((c) => c.startsWith("pulls?")));
  assert.ok(calls.some((c) => c.includes("status=in_progress")));
  assert.ok(calls.some((c) => c.includes("status=queued")));
});

test("CLI --cap 0 / unknown flag exit 2; --help exits 0", () => {
  const runCli = (args) => {
    try {
      execFileSync("node", ["tools/ci/ready-full-cap.mjs", ...args], {
        cwd: ROOT, encoding: "utf8", env: { ...process.env },
      });
      return { status: 0, out: "" };
    } catch (e) {
      return { status: e.status, out: (e.stdout || "") + (e.stderr || "") };
    }
  };
  assert.equal(runCli(["--help"]).status, 0);
  assert.equal(runCli(["--cap", "0"]).status, 2);
  assert.equal(runCli(["--nope"]).status, 2);
});

test("AGENTS.md Concurrent PRs documents the ready-full-cap Merge Desk check", () => {
  const agents = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8");
  const concurrent = agents.split("### Concurrent PRs")[1]?.split("### Watching")[0] || "";
  assert.match(concurrent, /ready-full-cap\.mjs/,
    "Merge Desk must name the cap helper before mark-ready");
  assert.match(concurrent, /full-tier/,
    "must keep the ready=full / draft=fast vocabulary");
  assert.match(concurrent, /draft.*fast|fast.*draft|uncapped/i,
    "must not weaken draft=fast (cap applies only to ready full-tier)");
});

test("15-F11: measure pages ci.yml's pull_request runs, so a queued ready run past the first 100 still counts", () => {
  const calls = [];
  const request = (qs) => {
    calls.push(qs);
    if (qs.startsWith("pulls?")) return { json: [pr(1, "cursor/a"), pr(2, "cursor/b"), pr(3, "cursor/c")] };
    const page = Number(/&page=(\d+)/.exec(qs)?.[1]);
    if (qs.includes("status=queued")) {
      // page 1: 100 sibling runs of other branches (no open PR); page 2 holds the three ready PRs' runs
      if (page === 1) return { json: { workflow_runs: Array.from({ length: 100 }, (_, i) => run(`cursor/other-${i}`, "queued", { id: 1000 + i })) } };
      if (page === 2) return { json: { workflow_runs: [run("cursor/a", "queued", { id: 1 }), run("cursor/b", "queued", { id: 2 }), run("cursor/c", "queued", { id: 3 })] } };
    }
    return { json: { workflow_runs: [] } };
  };
  const v = measure({ request, cap: 3 });
  assert.equal(v.error, undefined);
  assert.equal(v.count, 3, "the runs on page 2 are counted");
  assert.equal(v.ok, false, "three ready full-tier runs fill the cap of 3");
  assert.ok(calls.every((c) => c.startsWith("pulls?") || c.startsWith("actions/workflows/ci.yml/runs?event=pull_request&")), calls.join("\n"));
});
