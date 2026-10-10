/* ci-watch.test.mjs — the CI watcher's verdict is the one AGENTS.md rule 8 asks
 * for, and every job result becomes exactly one event.
 *
 * The watcher is what an agent trusts instead of waiting, so the failure modes
 * that matter are: the designed push/PR dedupe (a push run the PR run cancelled
 * on the same SHA) read as a red; a finished-but-failed run read as "running"
 * or green; and a job reported twice (Monitor turns every line into a message).
 *
 * Run: node --test tests/unit/ci-watch.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { latestPerWorkflow, verdict, newJobEvents, wantsAnnotations, pagesVerdictRun, noneVerdict, openPrFor, watchSha, api, supersededBy, resolveSha } from "../../tools/ci/ci-watch.mjs";
import { githubToken, NO_TOKEN_HINT } from "../../tools/ci/github-token.mjs";

const run = (id, name, status, conclusion, created) => ({ id, name, status, conclusion, created_at: created });
const job = (id, name, status, conclusion, steps = []) => ({ id, name, status, conclusion, steps, html_url: `u/${id}` });

test("the newest run per workflow wins, so a superseded push run is not a red", () => {
  const runs = latestPerWorkflow([
    run(1, "CI", "completed", "cancelled", "2026-09-24T00:00:00Z"),   // push run, cancelled by the PR run
    run(2, "CI", "completed", "success", "2026-09-24T00:00:05Z"),
  ]);
  assert.deepEqual(runs.map((r) => r.id), [2], "only the newest CI run counts");
  assert.equal(verdict(runs, { 2: [job(9, "guards", "completed", "success")] }).state, "passed");
});

test("a same-second tie goes to the higher run id, whatever order the API lists them in", () => {
  const cancelled = run(10, "CI", "completed", "cancelled", "2026-10-03T07:15:09Z");   // the draft run the ready run cancelled
  const live = run(11, "CI", "in_progress", null, "2026-10-03T07:15:09Z");
  for (const order of [[cancelled, live], [live, cancelled]]) {
    assert.deepEqual(latestPerWorkflow(order).map((r) => r.id), [11], "the newer (higher-id) run counts");
  }
  assert.equal(verdict(latestPerWorkflow([live, cancelled]), { 11: [] }).state, "running", "not a false `cancelled`");
});

test("verdict: failed as soon as a job fails, done only when every run completed", () => {
  const live = [run(1, "CI", "in_progress", null, "t")];
  const v = verdict(live, { 1: [job(1, "a", "completed", "failure"), job(2, "b", "in_progress", null)] });
  assert.equal(v.state, "failed", "a failed job is a red before the run ends");
  assert.equal(v.done, false, "…but the watcher keeps reporting the remaining jobs");
  const done = [run(1, "CI", "completed", "failure", "t")];
  assert.equal(verdict(done, { 1: [job(1, "a", "completed", "failure")] }).done, true);
  assert.equal(verdict([], {}).state, "none", "no run yet is not green");
  const cancelled = verdict([run(1, "CI", "completed", "cancelled", "t")], { 1: [job(1, "a", "completed", "cancelled")] });
  assert.equal(cancelled.state, "cancelled", "a cancelled run with no newer sibling is surfaced, not passed");
  assert.equal(verdict([run(1, "CI", "completed", "failure", "t")], { 1: [job(1, "a", "completed", "success")] }).state, "failed",
    "a run that concluded failure with no failed job (setup error) is still a red");
});

test("each finished job is one event; skipped jobs are silent; a red names its step and URL", () => {
  const seen = new Set();
  const jobs = [
    job(1, "Smoke (1)", "completed", "success"),
    job(2, "Smoke (2)", "completed", "failure", [{ name: "checkout", conclusion: "success" }, { name: "Run smoke shard", conclusion: "failure" }]),
    job(3, "GPU", "completed", "skipped"),
    job(4, "Sweeps", "in_progress", null),
  ];
  const first = newJobEvents(jobs, seen, "CI");
  assert.deepEqual(first.map((e) => e.line), [
    "CI › Smoke (1) → success",
    'CI › Smoke (2) → failure — step "Run smoke shard" u/2',
  ]);
  assert.equal(newJobEvents(jobs, seen, "CI").length, 0, "a job already reported is never reported again");
  jobs[3] = job(4, "Sweeps", "completed", "success");
  assert.deepEqual(newJobEvents(jobs, seen, "CI").map((e) => e.line), ["CI › Sweeps → success"]);
});

test("only a failed or timed-out job gets its annotations printed", () => {
  // A cancelled job's annotation is the designed draft/ready dedupe ("higher
  // priority waiting request"); printed, every one became a Monitor event.
  assert.equal(wantsAnnotations(job(1, "a", "completed", "failure")), true);
  assert.equal(wantsAnnotations(job(2, "a", "completed", "timed_out")), true);
  assert.equal(wantsAnnotations(job(3, "a", "completed", "cancelled")), false);
  assert.equal(wantsAnnotations(job(4, "a", "completed", "success")), false);
});

test("--pages reads the NEWEST train run that contains the SHA", () => {
  // Oldest-first returned on the first finished run: a waiting train run a
  // later tick replaced (cancelled) or an older red read as the verdict while
  // a newer run was about to ship the commit.
  const runs = [   // newest first, as the API lists them
    { id: 3, head_sha: "c", status: "in_progress", conclusion: null },
    { id: 2, head_sha: "b", status: "completed", conclusion: "cancelled" },
    { id: 1, head_sha: "a", status: "completed", conclusion: "failure" },
  ];
  const has = (set) => (h) => set.includes(h);
  assert.equal(pagesVerdictRun(runs, has(["a", "b", "c"])).id, 3, "a newer containing run supersedes older verdicts");
  assert.equal(pagesVerdictRun(runs, has(["a"])).id, 1, "only the old run contains it: that is the verdict");
  assert.equal(pagesVerdictRun(runs, has([])), null, "no containing run yet");
});

test("no run yet: none only without a PR; a conflicting PR is blocked, never green", () => {
  const MIN = 60_000;
  assert.equal(noneVerdict(null, 2 * MIN), "wait", "give a docs-only push its 3 minutes");
  assert.equal(noneVerdict(null, 4 * MIN), "none");
  // GitHub starts no pull_request run while the PR conflicts (2026-09-25: read as green).
  assert.equal(noneVerdict({ number: 321, mergeable_state: "dirty" }, 4 * MIN), "blocked");
  // A PR's run can start minutes after the push while the merge ref builds.
  assert.equal(noneVerdict({ number: 321, mergeable_state: "clean" }, 4 * MIN), "wait");
  assert.equal(noneVerdict({ number: 321, mergeable_state: "unknown" }, 11 * MIN), "late");
  // The runs search can lag a live run (PR #537, 2026-09-30: ten minutes of an
  // empty list, `none-yet`, while CI was running). Check runs on the commit
  // mean CI exists: keep waiting, whatever the clock or the PR says.
  assert.equal(noneVerdict({ number: 537, mergeable_state: "blocked" }, 11 * MIN, 3), "indexing");
  assert.equal(noneVerdict(null, 4 * MIN, 1), "indexing", "not `none` — a docs-only verdict needs the checks empty too");
  assert.equal(noneVerdict({ number: 321, mergeable_state: "dirty" }, 4 * MIN, 2), "indexing");
});

test("githubToken: env wins; else gh auth token; never invents a token", () => {
  assert.equal(githubToken({ env: { GH_TOKEN: "from-gh" }, gh: () => "from-cli" }), "from-gh");
  assert.equal(githubToken({ env: { GITHUB_TOKEN: "from-actions" }, gh: () => "from-cli" }), "from-actions");
  assert.equal(githubToken({ env: {}, gh: () => "from-cli" }), "from-cli");
  assert.equal(githubToken({ env: {}, gh: () => null }), null);
  assert.match(NO_TOKEN_HINT, /gh auth login/);
});

const SHA = "4dc3d6226176b48601a9e9cb0612989cc7ec916b";
const associated = `commits/${SHA}/pulls?per_page=100&page=1`;
const pr = (number = 738, head = SHA, state = "open") => ({ number, state, head: { sha: head } });

test("exact commit-associated PR lookup ignores a stale broad list and confirms current head/conflicts", () => {
  const calls = [];
  const lookup = openPrFor(SHA, (endpoint) => {
    calls.push(endpoint);
    if (endpoint.startsWith("pulls?")) return { json: [] }; // stale broad discovery must never decide absence
    if (endpoint === associated) return { json: [pr()] };
    if (endpoint === "pulls/738") return { json: { ...pr(), mergeable_state: "dirty" } };
    throw new Error("unexpected endpoint " + endpoint);
  });
  assert.equal(lookup.state, "found");
  assert.equal(lookup.pr.head.sha, SHA);
  assert.equal(noneVerdict(lookup.pr, 240000, 0), "blocked");
  assert.deepEqual(calls, [associated, "pulls/738"]);
});

test("commit associations require an open exact current head, not closed or historical associations", () => {
  const calls = [];
  const result = openPrFor(SHA, (endpoint) => {
    calls.push(endpoint);
    return { json: endpoint === associated ? [pr(1, SHA, "closed"), pr(2, "a".repeat(40))] : pr(2, "a".repeat(40)) };
  });
  assert.equal(result.state, "none");
  assert.equal(result.pr, null);
  assert.deepEqual(calls, [associated, "pulls/2"], "closed associations skip detail; historical open heads need current confirmation");
  const changed = openPrFor(SHA, (endpoint) => endpoint === associated ? { json: [pr()] } : { json: pr(738, "a".repeat(40)) });
  assert.equal(changed.state, "unknown", "a changing discovery snapshot does not establish absence");
  assert.match(changed.error, /changed/);
});

test("stale association head cannot hide the current exact-head open PR", () => {
  const calls = [];
  const result = openPrFor(SHA, (endpoint) => {
    calls.push(endpoint);
    if (endpoint === associated) return { json: [pr(738, "a".repeat(40))] };
    if (endpoint === "pulls/738") return { json: { ...pr(), mergeable_state: "dirty" } };
    throw new Error(endpoint);
  });
  assert.equal(result.state, "found");
  assert.equal(noneVerdict(result.pr, 240000), "blocked");
  assert.deepEqual(calls, [associated, "pulls/738"]);
});

test("malformed association or individual PR head remains unknown, never absence", () => {
  for (const head of ["a", "g".repeat(40), "a".repeat(39), "a".repeat(41), null]) {
    for (const state of ["open", "closed"]) {
      const result = openPrFor(SHA, () => ({ json: [pr(738, head, state)] }));
      assert.equal(result.state, "unknown", `association ${state} head ${head}`);
      assert.match(result.error, /malformed/);
    }
    const result = openPrFor(SHA, (endpoint) => ({ json: endpoint === associated ? [pr()] : pr(738, head) }));
    assert.equal(result.state, "unknown", `individual head ${head}`);
    assert.match(result.error, /malformed/);
  }
});

test("detail lookup budget spans pages and never declares absence from unchecked open associations", () => {
  const calls = [];
  const result = openPrFor(SHA, (endpoint) => {
    calls.push(endpoint);
    if (endpoint === associated) return { json: [
      ...Array.from({ length: 90 }, (_, i) => pr(i + 100, SHA, "closed")),
      ...Array.from({ length: 10 }, (_, i) => pr(i + 1, "a".repeat(40))),
    ] };
    if (endpoint === `commits/${SHA}/pulls?per_page=100&page=2`) return { json: [pr()] };
    if (/^pulls\/[1-9]0?$/.test(endpoint)) return { json: pr(Number(endpoint.split("/")[1]), "a".repeat(40)) };
    throw new Error("unexpected request beyond bound: " + endpoint);
  });
  assert.equal(result.state, "unknown");
  assert.match(result.error, /10 PR detail requests/);
  assert.equal(calls.filter((endpoint) => endpoint.startsWith("pulls/")).length, 10);
  assert.ok(!calls.includes("pulls/738"), "eleventh detail call is never issued");
  assert.equal(calls.length, 12, "two association pages plus the ten-detail budget");
});

test("PR lookup transport, shape and detail errors remain unknown instead of no PR", () => {
  for (const response of [{ error: "HTTP 502" }, { json: null }, { json: {} }, { json: [{}] }]) {
    assert.equal(openPrFor(SHA, () => response).state, "unknown", JSON.stringify(response));
  }
  for (const response of [{ error: "HTTP 403" }, { json: null }, { json: { number: 738 } }]) {
    const result = openPrFor(SHA, (endpoint) => endpoint === associated ? { json: [pr()] } : response);
    assert.equal(result.state, "unknown", JSON.stringify(response));
  }
  assert.equal(openPrFor(SHA, () => { throw new Error("connection reset"); }).state, "unknown");
});

test("association pagination confirms later-page current heads and never blesses partial lists", () => {
  const full = Array.from({ length: 100 }, (_, i) => pr(i + 1, SHA, "closed"));
  const calls = [];
  const result = openPrFor(SHA, (endpoint) => {
    calls.push(endpoint);
    if (endpoint === associated) return { json: full };
    if (endpoint === `commits/${SHA}/pulls?per_page=100&page=2`) return { json: [pr()] };
    if (endpoint === "pulls/738") return { json: { ...pr(), mergeable_state: "dirty" } };
    throw new Error(endpoint);
  });
  assert.equal(result.state, "found");
  assert.equal(calls.length, 3);
  assert.equal(openPrFor(SHA, (endpoint) => endpoint === associated ? { json: full } : { error: "HTTP 502" }).state, "unknown");
  assert.equal(openPrFor(SHA, () => ({ json: full })).state, "unknown", "bounded incomplete discovery is not absence");
});

test("API polling asks HTTP caches to revalidate and preserves failed HTTP/JSON as errors", () => {
  const result = api(associated, { env: { GH_TOKEN: "fixture-only-token" }, run(command, args, options) {
    assert.equal(command, "curl");
    assert.ok(args.includes("Cache-Control: no-cache"));
    assert.ok(args.includes("https://api.github.com/repos/brycejmurrin/f1-game/" + associated));
    assert.ok(!args.some((arg) => arg.includes("fixture-only-token")), "auth stays off argv");
    assert.match(options.input, /Authorization: Bearer fixture-only-token/);
    return { status: 0, stdout: "[]\n200" };
  } });
  assert.deepEqual(result, { json: [] });
  for (const [stdout, error] of [["{}\n403", "HTTP 403"], ["{}\n502", "HTTP 502"], ["not JSON\n200", "bad JSON"]]) {
    assert.equal(api(associated, { env: { GH_TOKEN: "fixture" }, run: () => ({ status: 0, stdout }) }).error, error);
  }
});

function afterThreeMinutes(request, options = {}) {
  const lines = []; let clockCalls = 0;
  return watchSha(SHA, { interval: 1, deadline: Infinity, once: false,
    now: () => clockCalls++ === 0 ? 0 : 240000,
    wait: async () => { throw new Error("unexpected polling after terminal evidence"); },
    report: (line) => lines.push(line), request, ...options }).then((code) => ({ code, lines }));
}

test("no-run watcher reports current conflicting PR as blocked even when broad discovery is stale", async () => {
  const result = await afterThreeMinutes((endpoint) => {
    if (endpoint.startsWith("actions/runs?")) return { json: { workflow_runs: [] } };
    if (endpoint === associated) return { json: [pr()] };
    if (endpoint === "pulls/738") return { json: { ...pr(), mergeable_state: "dirty" } };
    if (endpoint.endsWith("/check-runs?per_page=1")) return { json: { total_count: 0 } };
    if (endpoint.startsWith("pulls?")) return { json: [] };
    throw new Error(endpoint);
  });
  assert.equal(result.code, 1);
  assert.ok(result.lines.some((line) => line.includes("= ci blocked — PR #738")));
  assert.ok(!result.lines.some((line) => line.includes("= ci none")));
});

test("no-run watcher never returns green when PR or commit-check discovery is unknown", async () => {
  for (const failure of ["associated", "detail", "checks", "checks-shape"]) {
    const result = await afterThreeMinutes((endpoint) => {
      if (endpoint.startsWith("actions/runs?")) return { json: { workflow_runs: [] } };
      if (endpoint === associated) return failure === "associated" ? { error: "HTTP 502" } : { json: failure === "detail" ? [pr()] : [] };
      if (endpoint === "pulls/738") return { error: "HTTP 403" };
      if (endpoint.endsWith("/check-runs?per_page=1")) return failure === "checks" ? { error: "HTTP 502" } : { json: {} };
      throw new Error(endpoint);
    });
    assert.equal(result.code, 3, failure);
    assert.ok(result.lines.some((line) => line.includes("= ci unknown")), failure);
    assert.ok(!result.lines.some((line) => line.includes("= ci none") || line.includes("= ci passed")), failure);
  }
});

test("confirmed absence still needs successful PR and zero-check evidence; indexed checks keep waiting", async () => {
  for (const count of [0, 2]) {
    const result = await afterThreeMinutes((endpoint) => {
      if (endpoint.startsWith("actions/runs?")) return { json: { workflow_runs: [] } };
      if (endpoint === associated) return { json: [] };
      if (endpoint.endsWith("/check-runs?per_page=1")) return { json: { total_count: count } };
      throw new Error(endpoint);
    }, { once: true });
    assert.equal(result.code, count ? 124 : 0);
    if (count) { assert.ok(result.lines.some((line) => /run search is lagging/.test(line))); assert.ok(!result.lines.some((line) => line.includes("= ci none —"))); }
    else assert.ok(result.lines.some((line) => line.includes("= ci none —")));
  }
});

test("job-list API failure cannot turn a completed successful run into a zero-job green verdict", async () => {
  const result = await afterThreeMinutes((endpoint) => endpoint.startsWith("actions/runs?")
    ? { json: { workflow_runs: [run(1, "CI", "completed", "success", "2026-10-01T00:00:00Z")] } }
    : { error: "HTTP 502" });
  assert.equal(result.code, 3);
  assert.ok(result.lines.some((line) => line.includes("= ci unknown")));
  assert.ok(!result.lines.some((line) => line.includes("= ci passed")));
});

test("a pending ship-fast run replaced by a newer push is SUPERSEDED, not a timeout", async () => {
  const mine = { ...run(50, "CI", "completed", "cancelled", "2026-10-03T08:00:00Z"), workflow_id: 7, head_branch: "claude/f1-game-project-26h3ng", event: "push", head_sha: SHA, html_url: "u/50" };
  const newer = { ...mine, id: 51, status: "in_progress", conclusion: null, head_sha: "b".repeat(40), html_url: "u/51" };
  const older = { ...mine, id: 49, head_sha: "c".repeat(40) };
  // Pure rule: same workflow/branch/event, a newer id and another head — and the run never started a step.
  assert.equal(supersededBy(mine, [], [older, mine, newer])?.id, 51);
  assert.equal(supersededBy(mine, [job(1, "guards", "completed", "cancelled", [{ name: "x", started_at: "t", conclusion: "cancelled" }])], [newer]), null,
    "a run killed mid-way stays rule 8's timeout even with a successor");
  assert.equal(supersededBy(mine, [], [older, { ...newer, event: "workflow_dispatch" }]), null, "a dispatched run is not the replacement");
  for (const siblings of [[mine, newer], [mine]]) {
    const result = await afterThreeMinutes((endpoint) => {
      if (endpoint.startsWith("actions/runs?")) return { json: { workflow_runs: [mine] } };
      if (endpoint === "actions/runs/50/jobs?per_page=100") return { json: { jobs: [] } };
      if (endpoint.startsWith("actions/workflows/7/runs?")) return { json: { workflow_runs: siblings } };
      throw new Error(endpoint);
    }, { once: true });
    if (siblings.length > 1) {
      assert.equal(result.code, 4);
      assert.ok(result.lines.some((l) => l.startsWith("= ci superseded") && l.includes(`--sha ${"b".repeat(40)}`)), result.lines.join("\n"));
    } else {
      assert.equal(result.code, 2, "no successor: still cancelled");
      assert.ok(result.lines.some((l) => l.startsWith("= ci cancelled")));
    }
  }
});

test("resolveSha: a short sha becomes the full id (local prefix first, then GitHub), never reaches the API short", () => {
  const FULL = "87575fbde50f19e5b53ee438e01bf1881ac1fae6";
  const never = () => { throw new Error("API must not be asked when git resolves it"); };
  assert.deepEqual(resolveSha("87575fbde", { revParse: () => `${FULL}\n`, request: never }), { sha: FULL }, "unique local prefix");
  assert.deepEqual(resolveSha(FULL, { revParse: () => FULL, request: never }), { sha: FULL });
  // Not in this clone (an unfetched merge commit): GitHub expands it.
  assert.deepEqual(resolveSha("87575fbde", { revParse: () => "", request: (e) => (e === "commits/87575fbde" ? { json: { sha: FULL } } : never()) }), { sha: FULL });
});

test("resolveSha: an unresolvable or ambiguous short sha is a clear error, not a short sha for the API (was `HTTP 422`)", () => {
  const r = resolveSha("87575fbde", { revParse: () => "", request: () => ({ error: "HTTP 422" }) });
  assert.equal(r.sha, undefined, "no short sha leaks through");
  assert.match(r.error, /cannot expand --sha 87575fbde/);
  assert.match(resolveSha("--evil", { revParse: () => "", request: () => ({}) }).error ?? "", /invalid --sha/);
});
