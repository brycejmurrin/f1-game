import test from "node:test";
import assert from "node:assert/strict";
import { LABELS, byOwner, classifyEvent, parseCommand } from "../../tools/ci/actions/policy.mjs";
import { applyControls } from "../../tools/ci/actions/controls.mjs";
import { requestFromIssue, requestFromPR, trustedLandingEligibility } from "../../tools/ci/actions/requests.mjs";

const SHA = "a".repeat(40), NEXT = "b".repeat(40), NOW = "2026-11-05T12:00:00Z";
const person = { login: "brycejmurrin", type: "User" };
const ownerEvent = (label, event = "labeled", created_at = NOW) => ({ actor: person, performed_via_github_app: null, label: { name: label }, event, created_at });
const state = () => ({ schemaVersion: 1, mode: "shadow", controls: { workers: false, validation: false, merges: false }, waves: {}, requests: {} });
let commentSequence = 9;
const comment = (body, number = 3899, pr = false) => ({ action: "created", sender: person, issue: { number, ...(pr ? { pull_request: {} } : {}) }, comment: { id: ++commentSequence, created_at: NOW, body, user: person, author_association: "OWNER", performed_via_github_app: null } });
const pr = { number: 7, state: "open", head: { sha: SHA }, base: { sha: NEXT, ref: "deploy" }, labels: [], draft: false };

test("event admission discards taxonomy, projection bots and nonsense without producing validation work", () => {
  for (const name of ["area:ui", "ready", "claimed", "run-ci"]) {
    assert.equal(classifyEvent("issues", { action: "labeled", issue: { number: 1 }, label: { name }, sender: person }).relevant, false);
  }
  assert.equal(classifyEvent("issues", { action: "opened", issue: { number: 1, labels: [LABELS.ready] }, sender: person }).kind, "issue");
  assert.equal(classifyEvent("issues", { action: "labeled", issue: { number: 1 }, label: { name: LABELS.ready }, sender: { login: "github-actions[bot]" } }).relevant, false);
  assert.equal(classifyEvent("issue_comment", comment("please run everything")).relevant, false);
  assert.equal(classifyEvent("issue_comment", comment("/apex merge", 1)).relevant, false);
  assert.equal(classifyEvent("issue_comment", comment("/apex pause all", 1)).relevant, false);
  assert.equal(classifyEvent("workflow_run", { action: "completed", sender: { login: "github-actions[bot]", type: "Bot" } }).kind, "completion");
  assert.equal(classifyEvent("issue_comment", comment("/apex recover", 1)).kind, "command");
});

test("commands are exact and approvals require a complete SHA", () => {
  assert.deepEqual(parseCommand(`/apex approve ${SHA}`), { type: "approve", sha: SHA });
  assert.equal(parseCommand("/apex approve abc123"), null);
  assert.equal(parseCommand("/apex merge\nand run code"), null);
  assert.deepEqual(parseCommand("/apex batch #2 #3 #2"), { type: "batch", members: [2, 3] });
  assert.equal(classifyEvent("issue_comment", comment("/apex batch #3899")).relevant, false);
  assert.equal(byOwner({ actor: person }), false, "absent App field is unknown provenance");
  assert.equal(byOwner({ actor: person, performed_via_github_app: { slug: "claude" } }), false);
});

test("global owner switches are independent, pure, and cannot be resumed by an app", () => {
  const initial = state();
  const pause = comment("/apex pause all");
  const paused = applyControls(initial, "issue_comment", pause, { now: NOW });
  assert.deepEqual(paused.controls, { workers: true, validation: true, merges: true });
  assert.deepEqual(paused.controlProvenance.merges, { at: new Date(NOW).toISOString(), actor: "brycejmurrin", commentId: pause.comment.id, paused: true, source: "owner" });
  assert.deepEqual(initial.controls, { workers: false, validation: false, merges: false });
  const app = comment("/apex resume all"); app.comment.performed_via_github_app = { slug: "claude" };
  assert.deepEqual(applyControls(paused, "issue_comment", app).controls, paused.controls);
  assert.deepEqual(applyControls(paused, "issue_comment", comment("/apex resume validation")).controls, { workers: true, validation: false, merges: true });
});

test("priority only reorders existing requests and never creates validation; owner pauses survive agent removal", () => {
  const original = state(); original.requests.x = { id: "x", number: 7, paused: true, pauseOwner: true };
  const event = { action: "unlabeled", issue: { number: 7 }, label: { name: LABELS.paused }, sender: person };
  const appEvent = { ...ownerEvent(LABELS.paused, "unlabeled"), performed_via_github_app: { slug: "claude" } };
  assert.equal(applyControls(original, "issues", event, { provenance: appEvent }).requests.x.paused, true);
  assert.equal(applyControls(original, "issues", event, { provenance: {} }).requests.x.paused, true);
  assert.equal(applyControls(original, "issues", event, { provenance: ownerEvent(LABELS.paused, "unlabeled") }).requests.x.paused, false);
  const priority = { ...event, action: "labeled", label: { name: LABELS.priority } };
  assert.deepEqual(applyControls(state(), "issues", priority, { provenance: ownerEvent(LABELS.priority) }).requests, {});
  assert.equal(applyControls(original, "issues", priority, { provenance: ownerEvent(LABELS.priority) }).requests.x.priority, true);
});

test("issue ingestion preserves batch ownership, native blockers and original queue age", () => {
  const issue = { number: 8, state: "open", labels: [LABELS.ready, LABELS.priority], updated_at: "2099-01-01" };
  const request = requestFromIssue(issue, { now: NOW, previous: { acceptedAt: "2026-01-01", owner: "session" }, batchParent: 9, blockers: ["issue:10"] });
  assert.equal(request.acceptedAt, "2026-01-01");
  assert.equal(request.owner, "session");
  assert.equal(request.priority, false, "visible priority without provenance grants nothing");
  assert.deepEqual(request.blockers, ["issue:10", "batch:9"]);
  assert.deepEqual(requestFromIssue(issue, { intent: { members: [2, 3] } }).members, [2, 3]);
  assert.equal(requestFromIssue({ ...issue, labels: ["ready"] }), null);
});

test("historical owner pause remains effective after an app removed the label", () => {
  const events = [ownerEvent(LABELS.paused, "labeled", "2026-11-04T00:00:00Z"), { ...ownerEvent(LABELS.paused, "unlabeled"), performed_via_github_app: { slug: "claude" } }];
  assert.equal(requestFromPR(pr, { events }).paused, true);
  events.push(ownerEvent(LABELS.paused, "unlabeled", "2026-11-06T00:00:00Z"));
  assert.equal(requestFromPR(pr, { events }).paused, false);
});

test("merge intent and head-scoped approval are durable; only trusted eligibility admits expensive integration", () => {
  const initial = state(); initial.requests.x = requestFromPR(pr);
  const merged = applyControls(initial, "issue_comment", comment("/apex merge", 7, true));
  assert.equal(merged.intents[7].mergeRequested, true);
  const approved = applyControls(merged, "issue_comment", comment(`/apex approve ${SHA}`, 7, true), { now: NOW, diffSha: "diff" });
  assert.equal(approved.requests.x.approvedSha, SHA);
  const options = { mergeRequested: true, trustedRowsOk: true, ciSuccess: true, sourceSha: SHA, baseBranch: "deploy", requiresApproval: true, approvedSha: SHA, approvedDiffSha: "diff", diffSha: "diff" };
  assert.equal(trustedLandingEligibility(pr, options).ok, true);
  for (const overrides of [{ trustedRowsOk: false }, { ciSuccess: false }, { approvedSha: NEXT }, { approvedDiffSha: "old" }, { paused: true }, { controls: { merges: true } }]) assert.equal(trustedLandingEligibility(pr, { ...options, ...overrides }).ok, false);
  const moved = { ...pr, head: { sha: NEXT } };
  assert.equal(trustedLandingEligibility(moved, options).ok, false);
  const nextRequest = requestFromPR(moved, { previous: { ...approved.requests.x, tasks: [{ id: "old" }], results: { old: "success" } } });
  assert.deepEqual(nextRequest.results, {}, "new head never inherits completed test evidence");
  assert.deepEqual(nextRequest.tasks, []);
});

test("outsider comments cannot request merges, recoveries or batch ownership", () => {
  for (const [body, isPr] of [["/apex merge", true], ["/apex recover", true], ["/apex batch #2 #3", false]]) {
    const event = comment(body, 7, isPr); event.comment.author_association = "NONE";
    assert.equal(applyControls(state(), "issue_comment", event).intents, undefined);
    assert.ok(applyControls(state(), "issue_comment", event, { commandAllowed: true }).intents[7]);
    delete event.comment.author_association;
    assert.equal(applyControls(state(), "issue_comment", event).intents, undefined);
  }
});

test("late pause cannot override a newer resume, while unaffected scopes retain their own ordering", () => {
  const earlier = comment("/apex pause all"), later = comment("/apex resume merges");
  earlier.comment.created_at = "2026-11-05T10:00:00Z";
  later.comment.created_at = "2026-11-05T11:00:00Z";
  const resumed = applyControls(state(), "issue_comment", later, { now: "2099-01-01T00:00:00Z" });
  const deliveredLate = applyControls(resumed, "issue_comment", earlier, { now: "2099-01-02T00:00:00Z" });
  assert.deepEqual(deliveredLate.controls, { workers: true, validation: true, merges: false });
  assert.equal(deliveredLate.controlProvenance.merges.at, new Date(later.comment.created_at).toISOString());
  assert.equal(deliveredLate.controlProvenance.workers.at, new Date(earlier.comment.created_at).toISOString());
  assert.deepEqual(applyControls(deliveredLate, "issue_comment", earlier), deliveredLate, "same delivery is idempotent");
});

test("older resume cannot lift a later pause, including a created_at timestamp tie", () => {
  const earlier = comment("/apex resume all"), later = comment("/apex pause workers");
  const paused = applyControls(state(), "issue_comment", later);
  const replayed = applyControls(paused, "issue_comment", earlier);
  assert.deepEqual(replayed.controls, { workers: true, validation: false, merges: false });
  assert.equal(replayed.controlProvenance.workers.commentId, later.comment.id);
});

test("replayed approval never rebinds the same owner comment to a different diff", () => {
  const initial = state(); initial.requests.x = { ...requestFromPR(pr), headSha: SHA };
  const approve = comment(`/apex approve ${SHA}`, 7, true);
  const approved = applyControls(initial, "issue_comment", approve, { diffSha: "original-base-diff" });
  const replay = applyControls(approved, "issue_comment", approve, { diffSha: "new-base-diff", now: "2099-01-01T00:00:00Z" });
  assert.equal(replay.intents[7].approvedDiffSha, "original-base-diff");
  assert.equal(replay.requests.x.approvedDiffSha, "original-base-diff");
  assert.equal(replay.acceptedCommands[String(approve.comment.id)].diffSha, "original-base-diff");
});

test("newer approvals and batch membership cannot be overwritten by older unseen deliveries", () => {
  const older = comment(`/apex approve ${SHA}`, 7, true), newer = comment(`/apex approve ${NEXT}`, 7, true);
  let current = applyControls(state(), "issue_comment", newer, { diffSha: "newer" });
  current = applyControls(current, "issue_comment", older, { diffSha: "older" });
  assert.equal(current.intents[7].approvedSha, NEXT);
  const oldBatch = comment("/apex batch #2 #3", 7), newBatch = comment("/apex batch #4 #5", 7);
  current = applyControls(current, "issue_comment", newBatch);
  current = applyControls(current, "issue_comment", oldBatch);
  assert.deepEqual(current.intents[7].members, [4, 5]);
});

test("missing authoritative comment identity or creation time grants nothing", () => {
  for (const field of ["id", "created_at"]) {
    const pause = comment("/apex pause all"); delete pause.comment[field];
    assert.deepEqual(applyControls(state(), "issue_comment", pause).controls, state().controls);
    assert.equal(applyControls(state(), "issue_comment", pause).acceptedCommands, undefined);
  }
  const pause = comment("/apex pause all");
  const other = { ...pause.comment, id: pause.comment.id + 1 };
  assert.deepEqual(applyControls(state(), "issue_comment", pause, { provenance: other }).controls, state().controls);
});

test('batch membership edits remain pending while a live parent retains its exact original scope', () => {
  const initial = state();
  initial.requests['issue:7'] = { id: 'issue:7', kind: 'issue', number: 7, members: [2, 3], owner: { session: 'bound-session', terminal: false } };
  const changed = applyControls(initial, 'issue_comment', comment('/apex batch #4 #5', 7));
  assert.deepEqual(changed.requests['issue:7'].members, [2, 3]);
  assert.deepEqual(changed.requests['issue:7'].pendingMembership, [4, 5]);
  assert.deepEqual(changed.intents[7].pendingMembership, [4, 5]);
  const issue = { number: 7, state: 'open', labels: [LABELS.ready] };
  const refreshed = requestFromIssue(issue, { previous: changed.requests['issue:7'], intent: changed.intents[7], members: [6] });
  assert.deepEqual(refreshed.members, [2, 3]); assert.deepEqual(refreshed.pendingMembership, [4, 5]);
  assert.equal(refreshed.owner.session, 'bound-session');
  const terminal = { ...refreshed, owner: { ...refreshed.owner, terminal: true } };
  const recovered = requestFromIssue(issue, { previous: terminal, intent: changed.intents[7] });
  assert.deepEqual(recovered.members, [4, 5]); assert.equal(recovered.pendingMembership, undefined);
});
