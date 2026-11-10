// provenance — tools/ci/lib/provenance.mjs over the four fixtures in tests/fixtures/provenance/: a label event written
// through the Claude app (an agent, even as brycejmurrin), the same label clicked by Bryce (app null), a `decision:`
// comment by Bryce, and an agent's paraphrase of his words. No network: the readers take a fake client.
import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  OWNER, byOwner, actorOf, describeActor, isDecisionComment, labelEvents, ownerLabelEvents, newestLabelEvent, ownerSet,
  readIssueEvents, readIssueComments, PAGE_SIZE,
} from "../../tools/ci/lib/provenance.mjs";

const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`../fixtures/provenance/${name}.json`, import.meta.url), "utf8"));
const byApp = fixture("labeled-by-app"), byBryce = fixture("labeled-by-owner");
const decision = fixture("decision-comment"), paraphrase = fixture("paraphrase-comment");

test("byOwner: Bryce's own click passes; the same login through the Claude app does not; another login does not", () => {
  assert.equal(OWNER, "brycejmurrin");
  assert.equal(byOwner(byBryce), true);
  assert.equal(byOwner(byApp), false, "performed_via_github_app = claude is an agent write");
  assert.equal(byOwner({ ...byBryce, actor: { login: "someone-else" } }), false);
  assert.equal(byOwner(byBryce, "someone-else"), false, "the owner is a parameter");
  assert.equal(byOwner(null), false);
  assert.equal(byOwner(byBryce, ""), false, "no owner configured: nothing is a grant");
  assert.deepEqual([actorOf(byBryce), actorOf(decision), actorOf({})], ["brycejmurrin", "brycejmurrin", null]);
  assert.deepEqual([describeActor(byApp), describeActor(byBryce), describeActor(null)], ["brycejmurrin via app claude", "brycejmurrin", "unknown"]);
});

test("isDecisionComment: Bryce's `decision:` comment (any case, leading space) counts; an agent's paraphrase of his words does not", () => {
  assert.equal(isDecisionComment(decision), true);
  assert.equal(isDecisionComment({ ...decision, body: "  decision: yes" }), true);
  assert.equal(isDecisionComment(paraphrase), false, "an app write quoting Bryce is a relay, not a decision");
  assert.equal(isDecisionComment({ ...decision, body: "I think the decision: land" }), false, "mid-sentence is not the channel");
  assert.equal(isDecisionComment({ ...decision, performed_via_github_app: { slug: "claude" } }), false);
  const { performed_via_github_app: _gone, ...noField } = decision;
  assert.equal(isDecisionComment(noField), false, "a row without performed_via_github_app is not his");
  assert.equal(byOwner({ ...byBryce, performed_via_github_app: undefined }), false);
  assert.equal(isDecisionComment({ ...decision, updated_at: "2026-11-03T15:00:00Z" }), false, "an edited decision: comment is not a decision");
  assert.equal(isDecisionComment({ ...decision, updated_at: decision.created_at }), true, "updated_at = created_at is unedited");
});

test("label events: filtered by name, the owner's subset, the newest one, and ownerSet needs both the label and Bryce's own add", () => {
  const unlabeledByApp = { ...byApp, id: 20313, event: "unlabeled", created_at: "2026-11-03T15:00:00Z" };
  const other = { ...byBryce, id: 20314, label: { name: "hold" } };
  const events = [byApp, byBryce, other, unlabeledByApp, { event: "closed", actor: { login: "x" } }];
  assert.deepEqual(labelEvents(events, "priority").map((e) => e.id), [20311, 20312, 20313]);
  assert.deepEqual(ownerLabelEvents(events, OWNER, "priority").map((e) => e.id), [20312]);
  assert.equal(newestLabelEvent(events, "priority").id, 20313);
  assert.equal(newestLabelEvent(events, "missing"), null);
  assert.equal(ownerSet(["priority"], [byApp, byBryce], "priority"), true, "Bryce's add is the newest event");
  const laterByApp = { ...byApp, created_at: "2026-11-03T16:00:00Z" };
  assert.equal(ownerSet(["priority"], [byBryce, laterByApp], "priority"), false, "an agent re-added it after Bryce: not honoured");
  assert.equal(ownerSet(["priority"], [laterByApp, byBryce], "priority"), false, "created_at decides, not list order");
  assert.equal(ownerSet([{ name: "priority" }], [byBryce], "priority"), true, "API label objects");
  assert.equal(ownerSet([], [byBryce], "priority"), false, "the label is gone");
  assert.equal(ownerSet(["priority"], null, "priority"), false, "no events fetched: provenance unknown is not a grant");
  assert.equal(ownerSet(["priority"], [byApp], "priority"), false);
});

test("readIssueEvents / readIssueComments paginate through the injected client and surface its error", () => {
  const calls = [];
  const page = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));
  const request = (p) => { calls.push(p); return { json: p.endsWith("page=1") ? page(PAGE_SIZE) : page(2) }; };
  const r = readIssueEvents("brycejmurrin/f1-game", 42, { request });
  assert.equal(r.events.length, PAGE_SIZE + 2);
  assert.deepEqual(calls, ["issues/42/events?per_page=100&page=1", "issues/42/events?per_page=100&page=2"], "the repo client's relative path for this repo");
  calls.length = 0;
  assert.equal(readIssueComments("other/repo", 7, { request }).comments.length, PAGE_SIZE + 2);
  assert.equal(calls[0], "https://api.github.com/repos/other/repo/issues/7/comments?per_page=100&page=1", "another repo goes by full URL");
  assert.deepEqual(readIssueEvents("brycejmurrin/f1-game", 1, { request: () => ({ error: "HTTP 403" }) }), { error: "HTTP 403" });
  assert.deepEqual(readIssueEvents("brycejmurrin/f1-game", 1, { request: () => ({ json: null }) }), { events: [] }, "a non-array body is an empty list");
  const full = () => ({ json: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i })) });
  assert.deepEqual(readIssueEvents("brycejmurrin/f1-game", 1, { request: full, maxPages: 2 }), { error: "more than 2 pages of 100: the list is truncated" }, "a full last page fails closed");
});
