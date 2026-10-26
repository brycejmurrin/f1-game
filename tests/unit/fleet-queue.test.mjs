// fleet-queue — the committed orchestrator queue (tools/ci/fleet-queue.mjs, audit Q11): pure row ops plus the CLI
// against an in-memory file. No git, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQueue, serializeQueue, upsert, ownershipProblems, reassign, main, STATES } from "../../tools/ci/fleet-queue.mjs";

const mem = () => {
  const files = new Map();
  const out = [];
  return { out, files, opts: { root: "/r", log: (l) => out.push(l), read: (f) => files.get(f) || "", write: (f, t) => files.set(f, t) } };
};

test("parse and serialize round-trip; an empty file is an empty queue; junk throws", () => {
  assert.deepEqual(parseQueue(""), []);
  const rows = upsert(upsert([], 9, { owner: "claude:s1", next: "ci" }), 3, { state: "ready" });
  assert.deepEqual(rows.map((r) => r.pr), [3, 9], "sorted by PR");
  assert.deepEqual(parseQueue(serializeQueue(rows)), rows);
  assert.throws(() => parseQueue('{"x":1}'), /rows/);
  assert.throws(() => parseQueue("not json"));
});

test("upsert merges only the defined fields and validates", () => {
  const a = upsert([], 5, { head: "abc", owner: "claude:s1", next: "watch ci" });
  const b = upsert(a, 5, { state: "ready" });
  assert.deepEqual(b[0], { pr: 5, head: "abc", state: "ready", owner: "claude:s1", next: "watch ci" });
  assert.throws(() => upsert([], 5, { state: "weird" }), /state must be one of/);
  assert.throws(() => upsert([], 0), /positive integer/);
  assert.ok(STATES.includes("ready"));
});

test("ownershipProblems: a live row needs an owner and a next step; terminal rows are ignored", () => {
  const rows = [
    { pr: 1, state: "ci", owner: "", next: "x", head: "" },
    { pr: 2, state: "ci", owner: "o", next: "", head: "" },
    { pr: 3, state: "merged", owner: "", next: "", head: "" },
    { pr: 4, state: "bogus", owner: "o", next: "x", head: "" },
    { pr: 5, state: "ready", owner: "o", next: "merge-gate", head: "" },
  ];
  assert.deepEqual(ownershipProblems(rows).map((p) => p.pr), [1, 2, 4]);
});

test("reassign moves every row of the old owner (the hand-off) and counts them", () => {
  const rows = [{ pr: 1, owner: "old" }, { pr: 2, owner: "other" }, { pr: 3, owner: "old" }];
  const r = reassign(rows, "old", "new");
  assert.equal(r.moved, 2);
  assert.deepEqual(r.rows.map((x) => x.owner), ["new", "other", "new"]);
  assert.throws(() => reassign(rows, "", "new"), /needs/);
});

test("CLI: set, list, check, reassign, rm over one file", () => {
  const m = mem();
  assert.equal(main(["set", "7", "--owner", "claude:s1", "--next", "watch ci", "--head", "deadbeef1"], m.opts), 0);
  assert.equal(main(["set", "8", "--state", "ready"], m.opts), 0);
  assert.equal(main(["check"], m.opts), 1, "#8 has no owner");
  assert.ok(m.out.some((l) => l.includes("#8: no owner")));
  assert.equal(main(["set", "8", "--owner", "claude:s1", "--next", "merge-gate"], m.opts), 0);
  assert.equal(main(["check"], m.opts), 0);
  assert.equal(main(["reassign", "claude:s1", "claude:s2"], m.opts), 0);
  m.out.length = 0;
  assert.equal(main(["list", "--json"], m.opts), 0);
  assert.deepEqual(JSON.parse(m.out[0]).map((r) => r.owner), ["claude:s2", "claude:s2"]);
  assert.equal(main(["rm", "7"], m.opts), 0);
  assert.equal(main(["rm", "7"], m.opts), 2, "unknown PR");
  assert.equal(main(["set", "9", "--state", "nope"], m.opts), 1);
  assert.equal(main(["bogus"], m.opts), 1);
  assert.equal(main(["set", "9", "--state"], m.opts), 1, "a flag without its value");
});
