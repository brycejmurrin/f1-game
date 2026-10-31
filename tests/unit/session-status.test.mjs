/* session-status.test.mjs — the generated handoff block reads verdicts the way
 * AGENTS.md rule 5 anchors them, and says what is unpushed or unread.
 *
 * The PR body is the handoff the next agent trusts, so the two failure modes
 * that matter are a wrong verdict (a heartbeat line read as a result, or a
 * dead run read as green) and a silent omission (unpushed commits, a live run).
 *
 * Run: node --test tests/unit/session-status.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseVerdict, toMarkdown, toSummary, collect, ciSummary, livePrLines, fetchLivePr } from "../../tools/ci/session-status.mjs";

// ── live PR state (--pr): pure formatting over mocked API answers ────────────
const SHA = "a".repeat(40), OTHER = "b".repeat(40), AT = "2026-10-10T08:00:00Z";
const run = (name, status, conclusion, id = 1, created_at = "2026-10-10T07:00:00Z") => ({ name, status, conclusion, id, created_at });

test("ciSummary: running beats failure beats success, newest run per workflow only", () => {
  assert.equal(ciSummary([]), "no CI run for this sha");
  assert.equal(ciSummary([run("CI", "completed", "success")]), "success");
  assert.equal(ciSummary([run("CI", "completed", "success"), run("Pages", "in_progress", null, 2)]), "running");
  assert.equal(ciSummary([run("CI", "completed", "failure"), run("Pages", "completed", "success", 2)]), "failure");
  // an old failed run superseded by a newer green one is not a red
  assert.equal(ciSummary([run("CI", "completed", "failure", 1), run("CI", "completed", "success", 2, "2026-10-10T07:30:00Z")]), "success");
});

test("livePrLines: head, draft/ready, mergeable_state, CI — each stamped as a snapshot", () => {
  const md = livePrLines({ at: AT, localHead: SHA, pr: { number: 7, draft: true, mergeable_state: "clean", head: { sha: SHA } }, ci: "running" }).join("\n");
  assert.match(md, /PR #7 head\*\* `a{40}` — draft/);
  assert.match(md, /mergeable_state `clean`/);
  assert.match(md, /CI.*running/);
  assert.equal((md.match(/snapshot read 2026-10-10T08:00:00Z/g) || []).length, 3);
  assert.match(md, /ready-gate\.mjs/);
  assert.doesNotMatch(md, /LOCAL HEAD != PR HEAD/);
});

test("livePrLines: a differing local HEAD is a loud warning; ready is named ready", () => {
  const md = livePrLines({ at: AT, localHead: OTHER, pr: { number: 7, draft: false, mergeable_state: "dirty", head: { sha: SHA } }, ci: "success" }).join("\n");
  assert.match(md, /LOCAL HEAD != PR HEAD/);
  assert.match(md, /ready/);
});

test("livePrLines: unavailable state is one clear line", () => {
  assert.deepEqual(livePrLines({ at: AT, error: "no token" }), ["- **Live PR state** unavailable: no token (checked " + AT + ")"]);
});

test("fetchLivePr: mocked API; any error or missing PR degrades, never throws", () => {
  const pr = { number: 7, draft: true, mergeable_state: "blocked", head: { sha: SHA } };
  const ok = (p) => p.startsWith("pulls/7") ? { json: pr } : { json: { workflow_runs: [run("CI", "completed", "success")] } };
  const r = fetchLivePr({ prArg: "7", branch: "x", request: ok });
  assert.equal(r.pr.number, 7); assert.equal(r.ci, "success");
  assert.match(fetchLivePr({ prArg: "7", branch: "x", request: () => ({ error: "HTTP 401" }) }).error, /HTTP 401/);
  assert.match(fetchLivePr({ prArg: "auto", branch: "x", request: () => ({ json: [] }) }).error, /no open PR/);
  assert.match(fetchLivePr({ prArg: "7", branch: "x", request: () => { throw new Error("boom"); } }).error, /boom/);
});

test("parseVerdict takes the LAST terminal line, never a heartbeat", () => {
  const log = [
    ". running 3/40 done, 1 failed | w0 30s x.spec.js",   // heartbeat: never a verdict
    "= run failed  (40/40 done, 2 failed)",
    "= run passed  (40/40 done, 0 failed)",               // a --last-failed re-run appended
    "= bg exit 0",
  ].join("\n");
  assert.equal(parseVerdict(log), "passed (40/40 done, 0 failed)");
  assert.equal(parseVerdict("[tooling-fast] = run failed (236 passed, 3 failed)"), "failed (236 passed, 3 failed)");
});

test("parseVerdict names a run that died before its reporter's summary", () => {
  assert.equal(parseVerdict(". running 3/40 done, 0 failed\n= bg exit 137"), "failed (exit 137; no reporter summary)");
  assert.match(parseVerdict(". running 3/40 done, 0 failed"), /no verdict yet/);
});

test("parseVerdict accepts reporter prefixes but never echoed summaries", () => {
  assert.equal(parseVerdict("[09:12:34] = run passed (40/40 done, 0 failed)"), "passed (40/40 done, 0 failed)");
  assert.match(parseVerdict("Error: expected = run passed\n[tooling-fast]   | = run passed"), /no verdict yet/);
});

test("parseVerdict respects the latest exit and a compound group's failed second half", () => {
  assert.equal(parseVerdict("= bg exit 0\n= bg exit 137"), "failed (exit 137; no reporter summary)");
  assert.equal(parseVerdict("= run passed (2 passed)\n= bg exit 137"), "failed (exit 137; last summary: passed (2 passed))");
  assert.equal(parseVerdict("= run failed (1 failed)\n= bg exit 1\n= run passed (1 passed)\n= bg exit 0"), "passed (1 passed)");
});

test("toMarkdown flags unpushed commits, dirt and a live run", () => {
  const md = toMarkdown({
    at: "2026-09-24T00:00:00Z", branch: "claude/x", base: "origin/claude/f1-game-project-26h3ng",
    ahead: 2, behind: 1, unpushed: 1, upstream: "origin/claude/x",
    sessions: ["https://claude.ai/code/session_abc"], commits: [{ sha: "abc1234", subject: "fix" }],
    dirty: [" M js/game.js"], logs: [{ log: "artifacts/logs/smoke.log", verdict: "failed (…)", ageMin: 3 }],
    live: "123:456 artifacts/logs/smoke.log",
  });
  assert.match(md, /1 commit\(s\) NOT pushed/);
  assert.match(md, /1 uncommitted: `js\/game\.js`/);
  assert.match(md, /verdict is NOT read yet/);
  assert.match(md, /Ready gate.*ready-gate\.mjs/);
  assert.match(md, /session_abc/);
  assert.match(md, /`abc1234` fix/);
});

test("collect runs against the real checkout without throwing", () => {
  const s = collect();
  assert.equal(typeof s.branch, "string");
  assert.ok(Array.isArray(s.commits) && Array.isArray(s.logs));
});

test("collect preserves the first porcelain status column and complete path", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-status-git-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "git"), '#!/bin/sh\nif [ "$1" = status ]; then printf " M docs/README.md\\n?? new-file.md\\n"; else exit 1; fi\n', { mode: 0o755 });
  const previousPath = process.env.PATH;
  try {
    process.env.PATH = dir + path.delimiter + (previousPath || "");
    const result = collect();
    assert.deepEqual(result.dirty, [" M docs/README.md", "?? new-file.md"]);
    assert.match(toMarkdown(result), /`docs\/README\.md`/);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
});

test("a detached HEAD is told to name a branch, never `git push -u origin HEAD`", () => {
  const base = { at: "2026-10-04T00:00:00Z", base: null, ahead: 0, behind: 0, unpushed: 0, upstream: null,
    sessions: [], commits: [], dirty: [], logs: [], live: null };
  const md = toMarkdown({ ...base, branch: "HEAD" });
  assert.match(md, /detached HEAD — name a branch first: `git switch -c claude\/<topic>`/);
  assert.doesNotMatch(md, /git push -u origin HEAD/);
  assert.match(toMarkdown({ ...base, branch: "claude/x" }), /git push -u origin claude\/x/);
});

test("#2184: ciSummary ignores a label-noise run", () => {
  const real = { id: 1, name: "CI", created_at: "2026-10-15T00:00:00Z", status: "completed", conclusion: "failure", display_title: "Fix" };
  const noise = { id: 2, name: "CI", created_at: "2026-10-15T00:05:00Z", status: "completed", conclusion: "success", display_title: "CI ignored: label bug" };
  assert.equal(ciSummary([real, noise]), "failure");
});


test("deploy verdict requires its outer terminal, never a nested tooling pass", () => {
  const prefix = "[deploy] guard suite: node tools/ci/tooling-fast.mjs --jobs=2\n"
    + "[tooling-fast] = run passed (721 passed, 0 failed)\n"
    + "[deploy] Pages gate: test:sweeps: npm run test:sweeps\n";
  assert.match(parseVerdict(prefix), /no deploy verdict yet/);
  assert.match(parseVerdict(prefix + "= run failed (1 failed)"), /^failed/);
  assert.match(parseVerdict(prefix + "[deploy] ERROR geometry sweeps failed (exit 1)"), /^failed/);
  const result = { gate: "only", verified: ["tooling-fast", "test:sweeps"], pushed: false, notCovered: [], seconds: 123 };
  assert.equal(parseVerdict(prefix + "[deploy] " + JSON.stringify(result)), "passed (deploy gate only)");
  assert.equal(parseVerdict(prefix + JSON.stringify(result, null, 2)), "passed (deploy gate only)");
  assert.match(parseVerdict(prefix + JSON.stringify(result, null, 2).slice(0, -1)), /no deploy verdict yet/);
  assert.equal(parseVerdict(prefix + "= deploy done exit=0 at=now"), "passed (deploy exit 0)");
  assert.match(parseVerdict(prefix + "= deploy done exit=1 at=now"), /^failed/);
  assert.match(parseVerdict(prefix + "[deploy] " + JSON.stringify(result) + "\n= deploy start pid=7 mode=--gate-only at=now"), /no deploy verdict yet/);
  assert.equal(parseVerdict("[tooling-fast] = run passed (721 passed, 0 failed)"), "passed (721 passed, 0 failed)");
});

const summaryFixture = (overrides = {}) => ({
  at: AT, branch: "cursor/example", base: "origin/ship", ahead: 2, behind: 1,
  unpushed: 1, upstream: "origin/cursor/example", dirty: [" M source.js"], live: null,
  commits: [{ sha: "1234567", subject: "private inventory subject" }], sessions: ["session-inventory"], logs: [],
  ...overrides,
});

test("summary bounds large inventories while preserving failures, uncertainty and retrieval", () => {
  const s = summaryFixture({
    commits: Array.from({ length: 500 }, (_, i) => ({ sha: String(i), subject: "inventory" })),
    sessions: Array.from({ length: 100 }, (_, i) => `session-${i}`),
    dirty: Array.from({ length: 100 }, (_, i) => ` M path-${i}`),
    logs: Array.from({ length: 1000 }, (_, i) => ({ log: `artifacts/logs/run-${i}.log`, ageMin: i,
      verdict: i < 990 ? "passed (1 passed)" : i < 995 ? "failed " + "x".repeat(1000) : "no verdict yet (running, or died before its summary)" })),
    live: "123:456 artifacts/logs/live.log",
  });
  const md = toSummary(s);
  assert.match(md, /500 commits; 100 sessions/);
  assert.match(md, /100 uncommitted \(paths omitted\)/);
  assert.match(md, /1000: 990 passed; 5 failed\/timedout\/interrupted; 5 unresolved/);
  assert.equal((md.match(/^  - /gm) || []).length, 3);
  assert.match(md, /truncated/);
  assert.match(md, /Log details omitted\*\* 997/);
  assert.match(md, /session-status\.mjs --json/);
  assert.match(md, /1 commit\(s\) NOT pushed/);
  assert.match(md, /verdict is NOT read yet/);
  assert.match(md, /not current-tip verification/);
  assert.match(md, /Live PR \/ CI\*\* not queried/);
  assert.ok(md.length < 2300, `summary unexpectedly large: ${md.length}`);
});

test("summary distinguishes unresolved exits, interrupted and timedout from passed", () => {
  const verdicts = ["passed (1 passed)", "failed (exit 137; last summary: passed)", "timedout", "interrupted", "exited 0 (no reporter summary)", "no verdict yet"];
  const s = summaryFixture({ upstream: null, unpushed: null, base: null,
    logs: verdicts.map((verdict, i) => ({ log: `artifacts/logs/${i}.log`, verdict, ageMin: 1 })) });
  const md = toSummary(s);
  assert.match(md, /1 passed; 3 failed\/timedout\/interrupted; 2 unresolved/);
  assert.match(md, /ahead\/behind unknown/);
  assert.match(md, /Pushed\*\* unknown \(no resolvable upstream\)/);
  assert.match(md, /failed \(exit 137/);
  assert.match(md, /Ready gate\*\* not evaluated/);
  assert.match(toSummary(summaryFixture({ branch: "HEAD", upstream: null })), /detached HEAD/);
});

test("default Markdown keeps inventories; summary preserves live PR warnings via existing formatter", () => {
  const s = summaryFixture({ livePr: { at: AT, error: "HTTP 401" } });
  const full = toMarkdown(s);
  assert.match(full, /`1234567` private inventory subject/);
  assert.match(full, /session-inventory/);
  assert.doesNotMatch(full, /Inventories omitted/);
  const md = toSummary(s) + "\n\n" + livePrLines(s.livePr).join("\n");
  assert.doesNotMatch(md, /not queried/);
  assert.match(md, /unavailable: HTTP 401/);
});

test("CLI --summary --json keeps the full JSON contract; default Markdown remains the full formatter", () => {
  const cli = (args) => spawnSync(process.execPath, ["tools/ci/session-status.mjs", ...args], { encoding: "utf8" });
  const result = cli(["--summary", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  for (const key of ["commits", "sessions", "dirty", "logs"]) assert.ok(Array.isArray(data[key]), key);
  assert.equal(data.summary, undefined);
  const normal = cli([]);
  assert.equal(normal.status, 0, normal.stderr);
  assert.match(normal.stdout, /\*\*Commits\*\*/);
  assert.match(normal.stdout, /\*\*Test logs\*\*/);
  const brief = cli(["--summary"]);
  assert.equal(brief.status, 0, brief.stderr);
  assert.match(brief.stdout, /Status summary/);
  assert.doesNotMatch(brief.stdout, /\*\*Commits\*\*/);
});

// Independent advisory tools: no network, browser, claims or reservations.
const { explainPrWait, collectPrWait } = await import("../../tools/ci/pr-wait.mjs");
const { comparePaths, collectOverlap } = await import("../../tools/ci/path-overlap.mjs");

test("pr-wait: pending concurrency, generic queue and execution remain distinct without fake position", () => {
  const snapshot = { complete: true, pr: { number: 7, state: "open", head: { sha: SHA } },
    runs: [{ id: 8, name: "CI", head_sha: SHA, status: "in_progress" }], jobsRunId: 8,
    jobs: [{ id: 1, status: "pending" }, { id: 2, status: "queued" }, { id: 3, status: "in_progress" }] };
  const out = explainPrWait(snapshot);
  assert.deepEqual(out.reasons.map((r) => r.state), ["concurrency-wait", "queued", "executing"]);
  assert.equal(out.reasons[1].detail, "CI job is queued; the blocking cause is unknown");
  assert.equal(out.queuePosition, null);
  assert.equal(explainPrWait({ ...snapshot, jobsRunId: 9 }).complete, false);
});

test("pr-wait: same-head CI, gate drift, conflict and live evidence are explicit", () => {
  const base = { complete: true, pr: { number: 7, state: "open", head: { sha: SHA } },
    runs: [{ id: 8, name: "CI", head_sha: SHA, status: "completed", conclusion: "success" }] };
  assert.equal(explainPrWait({ ...base, gate: { state: "pending", description: "deploy tip moved: re-gating" } }).state, "gate-revalidation");
  assert.equal(explainPrWait({ ...base, pr: { ...base.pr, mergeable_state: "dirty" } }).state, "conflict");
  assert.equal(explainPrWait({ ...base, runs: [{ ...base.runs[0], head_sha: OTHER }] }).state, "ci-unknown");
  assert.equal(explainPrWait({ ...base, runs: [{ ...base.runs[0], name: "CI", display_title: "CI ignored: edit" }] }).state, "ci-unknown");
  const merged = { ...base, pr: { ...base.pr, merged: true, merge_commit_sha: OTHER } };
  assert.equal(explainPrWait(merged).state, "deployment-unknown");
  assert.equal(explainPrWait({ ...merged, deploy: { sourceSha: OTHER, liveSha: SHA, ancestor: true } }).state, "deployed");
});

test("pr-wait: bounded API collection detects head drift and unread pages", () => {
  let reads = 0;
  const request = (p) => p === "pulls/7" ? { json: { number: 7, head: { sha: reads++ ? OTHER : SHA } } }
    : p.startsWith("actions/") ? { json: { workflow_runs: [] } } : { error: "HTTP 403" };
  const out = collectPrWait(7, { request });
  assert.equal(out.complete, false);
  assert.match(out.issues.join(" "), /403.*head changed/s);
});

test("path-overlap: directory boundaries, renames, contradictions and siblings are advisory", () => {
  const out = comparePaths({ complete: true, owned: ["fixture-race/", "fixture-tool.txt"], forbidden: ["fixture-tool.txt"],
    prs: [{ number: 9, head: SHA, files: [{ filename: "fixture-new.txt", previous_filename: "fixture-race/old.txt" }, "fixture-racers/x.txt"] }],
    assignments: [{ owner: "sibling", owned: ["fixture-race/a.txt"] }] });
  assert.deepEqual(out.overlaps.map((x) => x.kind), ["brief-contradiction", "open-pr", "sibling-assignment"]);
  assert.equal(out.reservation, false);
  assert.equal(comparePaths({ complete: true, owned: ["fixture-race/"], prs: [{ files: ["fixture-racers/x.txt"] }] }).state, "no-observed-overlap");
  assert.equal(comparePaths({ complete: true, owned: ["../other", "js/**"], prs: [] }).state, "unknown");
});

test("path-overlap: truncated and unauthorized snapshots cannot claim complete coverage", () => {
  const brief = { owned: ["fixture-race/a.txt"] };
  const request = (p) => p.startsWith("pulls?") ? { json: [{ number: 7, head: { sha: SHA } }] } : { error: "HTTP 403" };
  const out = collectOverlap(brief, { request });
  assert.equal(out.complete, false);
  assert.equal(out.state, "unknown");
  assert.match(out.issues.join(" "), /403/);
  const many = collectOverlap(brief, { maxPages: 1, maxPrs: 0, request: () => ({ json: Array.from({ length: 100 }, (_, i) => ({ number: i + 1 })) }) });
  assert.equal(many.complete, false);
  assert.match(many.issues.join(" "), /Page limit/);
});

test("pr-wait: terminal CI failure names its actual failed job, not a guessed assertion", () => {
  const out = explainPrWait({ complete: true, pr: { number: 7, head: { sha: SHA } },
    runs: [{ id: 8, name: "CI", head_sha: SHA, status: "completed", conclusion: "failure" }],
    jobsRunId: 8, jobs: [{ id: 9, name: "Structural guards B", conclusion: "failure" }] });
  assert.equal(out.state, "ci-failed");
  assert.equal(out.reasons[0].jobId, 9);
  assert.equal(out.reasons[0].detail, "Job failed; assertion requires its log");
});

test("path-overlap: changing PR heads and invalid inventories remain incomplete", () => {
  const request = (p) => p.startsWith("pulls?") ? { json: [{ number: 7, head: { sha: SHA } }] }
    : p.includes("/files") ? { json: [] } : { json: { head: { sha: OTHER } } };
  const out = collectOverlap({ owned: ["fixture-race/a.txt"] }, { request });
  assert.equal(out.state, "unknown");
  assert.equal(out.complete, false);
  assert.match(out.issues.join(" "), /head changed/);
  assert.equal(comparePaths({ owned: ["a.js"], prs: {}, assignments: {}, complete: true }).state, "unknown");
});

test("advisory collectors: complete offline answers work without mutations; page caps remain unknown", () => {
  const pr = { number: 7, state: "open", head: { sha: SHA } };
  const request = (p, options) => {
    assert.equal(options, undefined, "collectors pass paths only; shared client defaults to GET");
    if (p === "pulls/7") return { json: pr };
    if (p.startsWith("actions/workflows/")) return { json: { total_count: 1, workflow_runs: [{ id: 8, name: "CI", head_sha: SHA, status: "completed", conclusion: "success" }] } };
    if (p.startsWith("actions/runs/")) return { json: { total_count: 0, jobs: [] } };
    if (p.startsWith("commits/")) return { json: [{ context: "gate", state: "success" }] };
    if (p.startsWith("pulls?")) return { json: [pr] };
    if (p.startsWith("pulls/7/files?")) return { json: [{ filename: "fixture-other.txt" }] };
    throw new Error("unexpected path " + p);
  };
  assert.equal(collectPrWait(7, { request }).state, "landing");
  const overlap = collectOverlap({ owned: ["fixture-race/"] }, { request });
  assert.equal(overlap.complete, true);
  assert.equal(overlap.state, "no-observed-overlap");
  const capped = collectPrWait(7, { maxPages: 1, request: (p) => p === "pulls/7" ? { json: pr }
    : p.startsWith("actions/") ? { json: { total_count: 101, workflow_runs: Array.from({ length: 100 }, () => ({ name: "CI", display_title: "CI ignored: edit" })) } } : { json: [] } });
  assert.equal(capped.complete, false);
  assert.match(capped.issues.join(" "), /Page limit/);
});

test("pr-wait: newer ignored display titles never supersede real running or failed CI", () => {
  const pr = { number: 7, head: { sha: SHA } };
  const ignored = { id: 99, name: "CI", display_title: "CI ignored: edit", head_sha: SHA,
    status: "completed", conclusion: "success", created_at: "2026-10-30T20:00:00Z" };
  for (const status of ["in_progress", "completed"]) {
    const real = { id: 8, name: "CI", display_title: "CI", head_sha: SHA,
      status, conclusion: status === "completed" ? "failure" : null, created_at: "2026-10-30T19:00:00Z" };
    const jobs = [{ id: 9, name: "Real gate", status, conclusion: real.conclusion }];
    const expected = status === "completed" ? "ci-failed" : "executing";
    assert.equal(explainPrWait({ complete: true, pr, runs: [ignored, real], jobsRunId: 8, jobs }).state, expected);
    const requested = [];
    const request = (p) => {
      requested.push(p);
      if (p === "pulls/7") return { json: pr };
      if (p.startsWith("actions/workflows/")) return { json: { total_count: 2, workflow_runs: [ignored, real] } };
      if (p.startsWith("actions/runs/8/jobs?")) return { json: { total_count: 1, jobs } };
      if (p.startsWith("commits/")) return { json: [] };
      throw new Error("Unexpected path " + p);
    };
    const out = collectPrWait(7, { request });
    assert.equal(out.state, expected);
    assert.equal(out.complete, true);
    assert.equal(requested.some((p) => p.includes("runs/99/")), false);
  }
});


test("path-overlap: bounded inventories preserve observed matches and disclose omissions", () => {
  const files = Array.from({ length: 301 }, (_, i) => `fixture-race/file-${i}.txt`);
  const prs = Array.from({ length: 51 }, (_, i) => ({ number: i + 1, files }));
  const assignments = Array.from({ length: 33 }, (_, i) => ({ owner: `sibling-${i}`, owned: ["fixture-race/"] }));
  const out = comparePaths({ complete: true, owned: ["fixture-race/"], forbidden: [], prs, assignments });
  assert.equal(out.state, "overlap");
  assert.equal(out.complete, false);
  assert.equal(out.checkedPrs, 50);
  assert.equal(out.checkedAssignments, 32);
  assert.equal(out.overlaps.length, 200);
  assert.equal(out.overlaps[0].other, files[0]);
  assert.match(out.issues.join(" "), /PR limit.*files limit.*Overlap output limit/s);
  assert.match(out.issues.join(" "), /assignments limit/);
  const paths = comparePaths({ complete: true, owned: Array.from({ length: 129 }, () => "fixture-race/"),
    forbidden: ["x".repeat(513)], prs: [] });
  assert.equal(paths.complete, false);
  assert.match(paths.issues.join(" "), /owned limit.*Unsupported forbidden path/s);
});

test("pr-wait: oversized fixture inventories retain observed failures with incomplete coverage", () => {
  const pr = { number: 7, head: { sha: SHA } };
  const out = explainPrWait({ complete: true, pr, jobsRunId: 8,
    runs: [{ id: 8, name: "CI", head_sha: SHA, status: "in_progress" }],
    jobs: Array.from({ length: 301 }, (_, i) => ({ id: i, name: "fixture-job", status: "completed", conclusion: "failure" })) });
  assert.equal(out.state, "ci-failed");
  assert.equal(out.complete, false);
  assert.equal(out.reasons.length, 200);
  assert.match(out.issues.join(" "), /jobs limit.*Reason output limit/s);
});

test("advisory CLIs reject oversized JSON files before parsing and refuse unknown or missing flags", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-advisory-bounds-"));
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  try {
    const fixture = path.join(dir, "oversized.json"), brief = path.join(dir, "brief.json");
    fs.writeFileSync(fixture, "x".repeat(1024 * 1024 + 1));
    fs.writeFileSync(brief, JSON.stringify({ owned: ["fixture-race/"] }));
    for (const [tool, args] of [["pr-wait", ["--fixture", fixture]],
      ["path-overlap", ["--brief", brief, "--fixture", fixture]], ["path-overlap", ["--brief", fixture]]]) {
      const result = spawnSync(process.execPath, [path.join(root, "tools/ci", tool + ".mjs"), ...args], { encoding: "utf8" });
      assert.equal(result.status, 2);
      assert.equal(result.stderr, "JSON input must be a regular file of at most 1048576 bytes\n");
      assert.equal(result.stdout, "");
    }
    for (const tool of ["pr-wait", "path-overlap"]) {
      const script = path.join(root, "tools/ci", tool + ".mjs");
      assert.equal(spawnSync(process.execPath, [script, "--typo"], { encoding: "utf8" }).stderr, "Unknown argument --typo\n");
      assert.equal(spawnSync(process.execPath, [script, "--fixture", "--json"], { encoding: "utf8" }).stderr, "Missing value for --fixture\n");
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
