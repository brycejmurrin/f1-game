import test from "node:test";
import assert from "node:assert/strict";
import { LABELS, byOwner, classifyEvent, parseCommand } from "../../tools/ci/actions/policy.mjs";
import { applyControls } from "../../tools/ci/actions/controls.mjs";
import * as requests from "../../tools/ci/actions/requests.mjs";
const { requestFromPR, trustedLandingEligibility } = requests;
const SHA = "a".repeat(40), NEXT = "b".repeat(40), NOW = "2026-11-05T12:00:00Z";
const person = { login: "brycejmurrin", type: "User" };
const ownerEvent = (label, event = "labeled", created_at = NOW) => ({ actor: person, performed_via_github_app: null, label: { name: label }, event, created_at });
const state = () => ({ schemaVersion: 1, mode: "shadow", controls: { validation: false, merges: false }, waves: {}, requests: {} });
let commentSequence = 9;
const comment = (body, number = 3899, pr = false) => ({ action: "created", sender: person, issue: { number, ...(pr ? { pull_request: {} } : {}) }, comment: { id: ++commentSequence, created_at: NOW, body, user: person, author_association: "OWNER", performed_via_github_app: null } });
const pr = { number: 7, state: "open", head: { sha: SHA }, base: { sha: NEXT, ref: "deploy" }, labels: [], draft: false };
const labelPayload = (label, action = "labeled") => ({ action, pull_request: { number: 7 }, label: { name: label }, sender: person });

test("only PR lifecycle, PR controls and trusted completions admit coordinator work", () => {
  assert.deepEqual(Object.values(LABELS).sort(), ["queue:paused", "queue:priority"]);
  for (const label of ["ready", "claimed", "queue:ready", LABELS.paused, LABELS.priority]) {
    for (const action of ["opened", "labeled", "reopened"]) {
      assert.equal(classifyEvent("issues", { action, issue: { number: 1, labels: [label] }, label: { name: label }, sender: person }).relevant, false);
    }
  }
  assert.equal(requests.requestFromIssue, undefined, "there is no implementation intake API");
  assert.equal(classifyEvent("pull_request", { action: "ready_for_review", pull_request: pr, sender: person }).kind, "pr");
  for (const body of ["please run everything", "/apex batch #2 #3", "/apex pause workers", "/apex merge", "/apex recover"]) {
    assert.equal(classifyEvent("issue_comment", comment(body, 1)).relevant, false, body);
  }
  assert.equal(classifyEvent("issue_comment", comment("/apex pause all", 1)).relevant, false);
  assert.equal(classifyEvent("issue_comment", comment("/apex recover", 7, true)).kind, "command");
  assert.equal(classifyEvent("workflow_run", { action: "completed", sender: { login: "github-actions[bot]", type: "Bot" } }).kind, "completion");
});

test("commands remain exact; removed implementation controls are not aliases", () => {
  assert.deepEqual(parseCommand(`/apex approve ${SHA}`), { type: "approve", sha: SHA });
  for (const body of ["/apex approve abc123", "/apex merge\nand run code", "/apex batch #2 #3", "/apex pause workers", "/apex resume workers", "decision: launch an agent"]) {
    assert.equal(parseCommand(body), null, body);
  }
  assert.equal(byOwner({ actor: person }), false);
  assert.equal(byOwner({ actor: person, performed_via_github_app: { slug: "claude" } }), false);
});

test("global controls only pause validation and merges and cannot be resumed by an app", () => {
  const initial = state(), pause = comment("/apex pause all");
  const paused = applyControls(initial, "issue_comment", pause);
  assert.deepEqual(paused.controls, { validation: true, merges: true });
  assert.deepEqual(initial.controls, { validation: false, merges: false });
  assert.deepEqual(paused.controlProvenance.merges, { at: new Date(NOW).toISOString(), actor: person.login, commentId: pause.comment.id, paused: true, source: "owner" });
  const app = comment("/apex resume all"); app.comment.performed_via_github_app = { slug: "claude" };
  assert.deepEqual(applyControls(paused, "issue_comment", app).controls, paused.controls);
  assert.deepEqual(applyControls(paused, "issue_comment", comment("/apex resume validation")).controls, { validation: false, merges: true });
});

test("PR priority creates no validation requests and owner pauses survive app removals", () => {
  const original = state(); original.requests.x = { id: "x", kind: "pr", number: 7, paused: true, pauseOwner: true };
  const event = labelPayload(LABELS.paused, "unlabeled");
  const app = { ...ownerEvent(LABELS.paused, "unlabeled"), performed_via_github_app: { slug: "claude" } };
  assert.equal(applyControls(original, "pull_request", event, { provenance: app }).requests.x.paused, true);
  assert.equal(applyControls(original, "pull_request", event, { provenance: {} }).requests.x.paused, true);
  assert.equal(applyControls(original, "pull_request", event, { provenance: ownerEvent(LABELS.paused, "unlabeled") }).requests.x.paused, false);
  const priority = labelPayload(LABELS.priority);
  assert.deepEqual(applyControls(state(), "pull_request", priority, { provenance: ownerEvent(LABELS.priority) }).requests, {});
  assert.equal(applyControls(original, "pull_request", priority, { provenance: ownerEvent(LABELS.priority) }).requests.x.priority, true);
});

test("ready PRs automatically request validation while merging still requires explicit intent", () => {
  const queued = requestFromPR(pr, { now: NOW });
  assert.equal(queued.kind, "pr"); assert.equal(queued.draft, false);
  assert.equal(queued.mergeRequested, false, "ready state is not merge consent");
  const old = { ...queued, acceptedAt: "2026-01-01", owner: { session: "old-coding-agent" }, workerLaunch: {}, members: [2], batch: true };
  const refreshed = requestFromPR({ ...pr, updated_at: "2099-01-01" }, { previous: old });
  assert.equal(refreshed.acceptedAt, "2026-01-01");
  for (const key of ["owner", "workerLaunch", "members", "batch"]) assert.equal(Object.hasOwn(refreshed, key), false, key);
  const draft = requestFromPR({ ...pr, draft: true });
  assert.equal(draft.draft, true); assert.equal(draft.mergeRequested, false);
});

test("historical owner pause remains effective after an app removed the label", () => {
  const events = [ownerEvent(LABELS.paused, "labeled", "2026-11-04T00:00:00Z"), { ...ownerEvent(LABELS.paused, "unlabeled"), performed_via_github_app: { slug: "claude" } }];
  assert.equal(requestFromPR(pr, { events }).paused, true);
  events.push(ownerEvent(LABELS.paused, "unlabeled", "2026-11-06T00:00:00Z"));
  assert.equal(requestFromPR(pr, { events }).paused, false);
});

test("merge intent and exact-head approval remain durable and cannot bypass readiness", () => {
  const initial = state(); initial.requests.x = requestFromPR(pr);
  const merged = applyControls(initial, "issue_comment", comment("/apex merge", 7, true));
  assert.equal(merged.intents[7].mergeRequested, true);
  const approved = applyControls(merged, "issue_comment", comment(`/apex approve ${SHA}`, 7, true), { diffSha: "diff" });
  assert.equal(approved.requests.x.approvedSha, SHA);
  const options = { mergeRequested: true, trustedRowsOk: true, ciSuccess: true, sourceSha: SHA, baseBranch: "deploy", requiresApproval: true, approvedSha: SHA, approvedDiffSha: "diff", diffSha: "diff" };
  assert.equal(trustedLandingEligibility(pr, options).ok, true);
  for (const override of [{ mergeRequested: false }, { trustedRowsOk: false }, { ciSuccess: false }, { approvedSha: NEXT }, { approvedDiffSha: "old" }, { paused: true }, { controls: { merges: true } }]) {
    assert.equal(trustedLandingEligibility(pr, { ...options, ...override }).ok, false);
  }
  assert.equal(trustedLandingEligibility({ ...pr, draft: true }, options).ok, false);
  const moved = requestFromPR({ ...pr, head: { sha: NEXT } }, { previous: { ...approved.requests.x, tasks: [{ id: "old" }], results: { old: "success" } } });
  assert.deepEqual(moved.tasks, []); assert.deepEqual(moved.results, {});
  const integrated = requestFromPR(pr, { previous: { ...approved.requests.x, sourceSha: NEXT, headSha: SHA, tasks: [{ id: "retained" }], results: { retained: "success" } } });
  assert.deepEqual(integrated.results, { retained: "success" }, "stable head does not lose synthetic-merge evidence");
});

test("recover requests PR infrastructure recovery only; outsiders cannot grant it", () => {
  for (const body of ["/apex merge", "/apex recover"]) {
    const event = comment(body, 7, true); event.comment.author_association = "NONE";
    assert.equal(applyControls(state(), "issue_comment", event).intents, undefined);
    assert.ok(applyControls(state(), "issue_comment", event, { commandAllowed: true }).intents[7]);
  }
  const initial = state(); initial.requests.x = requestFromPR(pr);
  const recovered = applyControls(initial, "issue_comment", comment("/apex recover", 7, true));
  assert.equal(recovered.requests.x.recoverRequested, true);
  assert.equal(Object.hasOwn(recovered.requests.x, "owner"), false);
});

test("late pause cannot override a newer resume and scope ordering is independent", () => {
  const earlier = comment("/apex pause all"), later = comment("/apex resume merges");
  earlier.comment.created_at = "2026-11-05T10:00:00Z"; later.comment.created_at = "2026-11-05T11:00:00Z";
  const current = applyControls(applyControls(state(), "issue_comment", later), "issue_comment", earlier);
  assert.deepEqual(current.controls, { validation: true, merges: false });
  assert.equal(current.controlProvenance.merges.at, new Date(later.comment.created_at).toISOString());
  assert.deepEqual(applyControls(current, "issue_comment", earlier), current);
});

test("older resumes cannot lift a later pause even with a timestamp tie", () => {
  const earlier = comment("/apex resume all"), later = comment("/apex pause validation");
  const current = applyControls(applyControls(state(), "issue_comment", later), "issue_comment", earlier);
  assert.deepEqual(current.controls, { validation: true, merges: false });
  assert.equal(current.controlProvenance.validation.commentId, later.comment.id);
});

test("replayed or older approvals cannot rebind exact-head/diff authority", () => {
  const initial = state(); initial.requests.x = requestFromPR(pr);
  const approve = comment(`/apex approve ${SHA}`, 7, true);
  const first = applyControls(initial, "issue_comment", approve, { diffSha: "original" });
  const replay = applyControls(first, "issue_comment", approve, { diffSha: "changed" });
  assert.equal(replay.intents[7].approvedDiffSha, "original");
  const newer = comment(`/apex approve ${NEXT}`, 7, true);
  const current = applyControls(applyControls(state(), "issue_comment", newer), "issue_comment", approve);
  assert.equal(current.intents[7].approvedSha, NEXT);
});

test("missing authoritative comment identity or creation time grants no control", () => {
  for (const field of ["id", "created_at"]) {
    const pause = comment("/apex pause all"); delete pause.comment[field];
    assert.deepEqual(applyControls(state(), "issue_comment", pause).controls, state().controls);
    assert.equal(applyControls(state(), "issue_comment", pause).acceptedCommands, undefined);
  }
  const pause = comment("/apex pause all");
  assert.deepEqual(applyControls(state(), "issue_comment", pause, { provenance: { ...pause.comment, id: pause.comment.id + 1 } }).controls, state().controls);
});
