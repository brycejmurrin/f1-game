import test from "node:test";
import assert from "node:assert/strict";
import { newState } from "../../tools/ci/actions/state.mjs";
import { computePlanDigest } from "../../tools/ci/actions/coverage.mjs";
import { approvalDigest, landNext } from "../../tools/ci/actions/landing.mjs";

const HEAD = "1".repeat(40), BASE = "2".repeat(40), SOURCE = "3".repeat(40), TREE = "4".repeat(40), MERGED = "5".repeat(40), FILE = "6".repeat(40), NOW = "2026-11-05T12:00:00Z";
function fixture() {
  const task = { id: "one", runner: "ubuntu-latest", coverageIds: ["one"], environment: { node: "22" } };
  const plan = { mode: "ready", sourceSha: SOURCE, baseSha: BASE, treeSha: TREE, requiredCoverage: ["one"], tasks: [task] };
  plan.digest = computePlanDigest(plan);
  const candidate = { id: "pr:7", kind: "pr", number: 7, sourceSha: SOURCE, headSha: HEAD, baseSha: BASE, treeSha: TREE,
    mergeRequested: true, mergeRequestedAt: NOW, acceptedAt: NOW, priority: false, paused: false, blockers: [], superseded: false,
    tasks: [{ ...task, status: "success" }], requiredCoverage: ["one"], plan,
    results: { one: { taskId: "one", status: "success", complete: true, exitCode: 0, sourceSha: SOURCE, baseSha: BASE, treeSha: TREE, planDigest: plan.digest, environment: task.environment, coverageIds: ["one"] } } };
  let state = newState({ mode: "active", now: NOW }); state.requests[candidate.id] = candidate;
  const store = {
    read: () => ({ state: structuredClone(state) }),
    update(fn) { const next = structuredClone(state), result = fn(next); if (this.failWrites) throw new Error("write failed"); state = next; return { result, state: structuredClone(state) }; },
    get state() { return state; },
  };
  const pr = { number: 7, state: "open", draft: false, merged: false, head: { sha: HEAD }, base: { ref: "deploy", sha: BASE }, merge_commit_sha: SOURCE, labels: [], changed_files: 1 };
  const files = [{ filename: "js/game.js", sha: FILE, status: "modified" }], calls = [];
  const options = { baseBranch: "deploy", now: NOW, repo: "o/r", store };
  const request = async (path, opts = {}) => {
    const endpoint = path.replace(/^\/repos\/o\/r\//, ""); calls.push({ endpoint, ...opts });
    if (options.intercept) { const response = options.intercept(endpoint, opts); if (response) return response; }
    if (endpoint === "pulls/7/merge") {
      assert.equal(store.state.landing.status, "firing", "persist before mutating GitHub");
      assert.deepEqual(opts.body, { merge_method: "merge", sha: HEAD });
      pr.merged = true; pr.state = "closed"; pr.merge_commit_sha = MERGED;
      return { status: 200, json: { merged: true, sha: MERGED } };
    }
    if (endpoint === "pulls/7") return { status: 200, json: structuredClone(pr) };
    if (endpoint === "issues/7") return { status: 200, json: { number: 7, labels: pr.labels } };
    if (endpoint.startsWith("issues/7/events?")) return { status: 200, json: [] };
    if (endpoint === "branches/deploy") return { status: 200, json: { commit: { sha: BASE } } };
    if (endpoint === "branches/deploy/protection") return { status: 200, json: { required_status_checks: { strict: true, contexts: ["gate"] }, enforce_admins: { enabled: true } } };
    if (endpoint === `compare/${BASE}...${HEAD}`) return { status: 200, json: { status: "ahead", merge_base_commit: { sha: BASE } } };
    if (endpoint === `git/commits/${SOURCE}` || endpoint === `git/commits/${MERGED}`) return { status: 200, json: { tree: { sha: TREE }, parents: [{ sha: BASE }, { sha: HEAD }] } };
    if (endpoint.startsWith("pulls/7/files?")) return { status: 200, json: files };
    if (endpoint === "actions/workflows/pages.yml/dispatches") return { status: 204, json: null };
    throw new Error(`Unexpected request ${endpoint}`);
  };
  return { options, store, candidate, pr, files, calls, request };
}
const merges = (f) => f.calls.filter((c) => c.endpoint === "pulls/7/merge");

test("complete exact integration can merge once and explicitly trigger Pages", async () => {
  const f = fixture();
  const result = await landNext({ ...f.options, request: f.request });
  assert.equal(result.status, "merged"); assert.equal(result.publication, "dispatched");
  assert.equal(merges(f).length, 1);
  await landNext({ ...f.options, request: f.request });
  assert.equal(merges(f).length, 1, "completed attempt never merges again");
});

test("paused, draft, partial, missing intent and shadow work perform no merge", async () => {
  for (const mutate of [
    (s) => { s.controls.merges = true; }, (s) => { s.mode = "shadow"; },
    (s) => { s.requests["pr:7"].paused = true; }, (s) => { s.requests["pr:7"].draft = true; },
    (s) => { s.requests["pr:7"].results.one.complete = false; }, (s) => { s.requests["pr:7"].mergeRequested = false; },
  ]) {
    const f = fixture(); f.store.update(mutate);
    assert.equal((await landNext({ ...f.options, request: f.request })).status, "deferred"); assert.equal(merges(f).length, 0);
  }
});

test("stale head/base, behind branch and mismatched source tree cannot merge", async () => {
  for (const setup of [
    (f) => { f.pr.head.sha = FILE; }, (f) => { f.pr.base.ref = "other-branch"; },
    (f) => { f.options.intercept = (p) => p === "branches/deploy" ? { status: 200, json: { commit: { sha: FILE } } } : null; },
    (f) => { f.options.intercept = (p) => p.startsWith("compare/") ? { status: 200, json: { status: "diverged", merge_base_commit: { sha: FILE } } } : null; },
    (f) => { f.options.intercept = (p) => p === `git/commits/${SOURCE}` ? { status: 200, json: { tree: { sha: FILE } } } : null; },
  ]) {
    const f = fixture(); setup(f);
    assert.equal((await landNext({ ...f.options, request: f.request })).status, "deferred"); assert.equal(merges(f).length, 0);
  }
});

test("sensitive runtime approval is exact-head/exact-diff and direct-owner only", async () => {
  for (const approval of [{}, { approvedBy: "brycejmurrin", approvedViaApp: { slug: "claude" } }, { approvedBy: "brycejmurrin", approvedViaApp: null, approvedSha: FILE }]) {
    const f = fixture(); f.files[0].filename = "tools/ci/actions/landing.mjs";
    f.store.update((s) => Object.assign(s.requests["pr:7"], { approvedSha: HEAD, approvedDiffSha: approvalDigest(f.files) }, approval));
    assert.equal((await landNext({ ...f.options, request: f.request })).status, "deferred"); assert.equal(merges(f).length, 0);
  }
  const f = fixture(); f.files[0].filename = ".github/workflows/ci.yml";
  f.store.update((s) => Object.assign(s.requests["pr:7"], { approvedBy: "brycejmurrin", approvedViaApp: null, approvedSha: HEAD, approvedDiffSha: approvalDigest(f.files) }));
  assert.equal((await landNext({ ...f.options, request: f.request })).status, "merged");
});

test("404/rate-limit reads and refused merges retain honest outcomes", async () => {
  for (const status of [404, 403]) {
    const f = fixture(); f.options.intercept = (p) => p === "pulls/7" ? { status, error: "unavailable" } : null;
    assert.equal((await landNext({ ...f.options, request: f.request })).status, "deferred"); assert.equal(merges(f).length, 0);
  }
  const f = fixture(); f.options.intercept = (p) => p === "pulls/7/merge" ? { status: 405, json: { message: "Required checks have not passed" } } : null;
  assert.equal((await landNext({ ...f.options, request: f.request })).status, "rejected");
  await landNext({ ...f.options, request: f.request }); assert.equal(merges(f).length, 1);
});

test("ambiguous merge response never blindly PUTs again; exact observed merge repairs ledger", async () => {
  const f = fixture(); f.options.intercept = (p) => p === "pulls/7/merge" ? { status: 0, error: "timeout" } : null;
  assert.equal((await landNext({ ...f.options, request: f.request })).status, "ambiguous");
  await landNext({ ...f.options, request: f.request }); assert.equal(merges(f).length, 1);
  f.pr.merged = true; f.pr.state = "closed"; f.pr.merge_commit_sha = MERGED;
  assert.equal((await landNext({ ...f.options, request: f.request })).status, "merged"); assert.equal(merges(f).length, 1);
});

test("Pages failure is separate from accepted merge and retries only publication", async () => {
  const f = fixture(); f.options.intercept = (p) => p === "actions/workflows/pages.yml/dispatches" ? { status: 403, error: "rate limited" } : null;
  const result = await landNext({ ...f.options, request: f.request });
  assert.equal(result.status, "merged"); assert.equal(result.publication, "pending");
  f.options.intercept = null;
  assert.equal((await landNext({ ...f.options, request: f.request })).publication, "dispatched");
  assert.equal(merges(f).length, 1);
});

test("post-merge tree mismatch is reported and never published as tested", async () => {
  const f = fixture(); f.options.intercept = (p) => p === `git/commits/${MERGED}` ? { status: 200, json: { tree: { sha: FILE }, parents: [{ sha: BASE }, { sha: HEAD }] } } : null;
  assert.equal((await landNext({ ...f.options, request: f.request })).status, "merged-unverified");
  assert.ok(!f.calls.some((c) => c.endpoint.includes("dispatches")));
});

test("missing strict protection, privileged bypass and unreadable rulesets cannot authorize merge", async () => {
  for (const protection of [{}, { required_status_checks: { strict: true, contexts: ["gate"] }, enforce_admins: { enabled: false } }, { required_status_checks: { strict: false, contexts: ["gate"] }, enforce_admins: { enabled: true } }]) {
    const f = fixture();
    f.options.intercept = (p) => p === "branches/deploy/protection" ? { status: 200, json: protection } : p === "rules/branches/deploy" ? { status: 403, error: "rules unreadable" } : null;
    assert.equal((await landNext({ ...f.options, request: f.request })).status, "deferred"); assert.equal(merges(f).length, 0);
  }
  for (const bypass of [[], [{ actor_id: 1, bypass_mode: "always" }]]) {
    const f = fixture();
    f.options.intercept = (p) => p === "branches/deploy/protection" ? { status: 404 } : p === "rules/branches/deploy" ? { status: 200, json: [{ type: "required_status_checks", ruleset_source_type: "Repository", ruleset_id: 1, parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "gate" }] } }] } : p === "rulesets/1" ? { status: 200, json: { enforcement: "active", bypass_actors: bypass } } : null;
    assert.equal((await landNext({ ...f.options, request: f.request })).status, bypass.length ? "deferred" : "merged");
  }
});

test("one merge per call and final-base movement releases an unconsumed reservation", async () => {
  const f = fixture();
  f.store.update((s) => { s.requests["pr:8"] = { ...structuredClone(s.requests["pr:7"]), id: "pr:8", number: 8, mergeRequestedAt: "2026-11-06T00:00:00Z" }; });
  assert.equal((await landNext({ ...f.options, request: f.request })).requestId, "pr:7");
  assert.equal(merges(f).length, 1); assert.equal(f.store.state.requests["pr:8"].landing, undefined);
  const moving = fixture(); let bases = 0;
  moving.options.intercept = (p) => p === "branches/deploy" && ++bases === 2 ? { status: 200, json: { commit: { sha: FILE } } } : null;
  assert.equal((await landNext({ ...moving.options, request: moving.request })).status, "deferred");
  assert.equal(merges(moving).length, 0); assert.equal(moving.store.state.landing, undefined);
});

test("a lagging PR base SHA does not override fresh branch and exact tested merge-parent evidence", async () => {
  const f = fixture(); f.pr.base.sha = FILE;
  const result = await landNext({ ...f.options, request: f.request });
  assert.equal(result.status, "merged"); assert.equal(merges(f).length, 1);
  const moved = fixture(); moved.pr.base.sha = FILE;
  moved.options.intercept = (p) => p === "branches/deploy" ? { status: 200, json: { commit: { sha: FILE } } } : null;
  assert.equal((await landNext({ ...moved.options, request: moved.request })).status, "deferred");
  assert.equal(merges(moved).length, 0);
});

test("regenerated synthetic merge SHA reuses only the exact tested tree and head/base parents", async () => {
  for (const [commit, expected] of [
    [{ tree: { sha: TREE }, parents: [{ sha: BASE }, { sha: HEAD }] }, "merged"],
    [{ tree: { sha: FILE }, parents: [{ sha: BASE }, { sha: HEAD }] }, "deferred"],
    [{ tree: { sha: TREE }, parents: [{ sha: FILE }, { sha: HEAD }] }, "deferred"],
    [{ tree: { sha: TREE }, parents: [{ sha: BASE }, { sha: HEAD }, { sha: FILE }] }, "deferred"],
  ]) {
    const f = fixture(), regenerated = "7".repeat(40); f.pr.merge_commit_sha = regenerated;
    f.options.intercept = (p) => p === `git/commits/${regenerated}` ? { status: 200, json: commit } : null;
    assert.equal((await landNext({ ...f.options, request: f.request })).status, expected);
    assert.ok(f.calls.some(call => call.endpoint === `git/commits/${SOURCE}`), "recorded tested source remains verified");
    assert.ok(f.calls.some(call => call.endpoint === `git/commits/${regenerated}`), "new preview is independently verified");
    assert.equal(merges(f).length, expected === "merged" ? 1 : 0);
  }
});
