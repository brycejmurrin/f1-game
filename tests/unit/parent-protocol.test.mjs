// parent-protocol — the one parent/child paragraph (.claude/agents/README.md §Parent and child,
// the successor of docs/WORKERS.md for in-session children; plan §4.6). Pins: the five message
// kinds are the same set in the README, worker.md and the contract hook; a fixture message
// parses to its kind and name; the README names the parent's action for every kind; the
// WORKER report line parses to status, branch and sha; the hook accepts the fixture reports.
//
// Run: node --test tests/unit/parent-protocol.test.mjs   (< 1 s)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const FIX = JSON.parse(read("tests/data/parent-protocol/fixtures.json"));
const README = read(".claude/agents/README.md");
const PARA = README.slice(README.indexOf("## Parent and child"), README.indexOf("\n## ", README.indexOf("## Parent and child") + 5) > 0
  ? README.indexOf("\n## ", README.indexOf("## Parent and child") + 5) : undefined);

/** `<name>: <kind> — <one line>` → { name, kind, line } or null. The same shape worker.md documents. */
export function parseMessage(text) {
  const m = /^([A-Za-z0-9_.-]+): (blocked|question|collision|scope|checkpoint) — (\S.*)$/.exec(String(text).split("\n")[0]);
  return m ? { name: m[1], kind: m[2], line: m[3] } : null;
}
/** The report's first two lines → { name, status, branch, sha } or null. */
export function parseReport(text) {
  const [l1, l2 = ""] = String(text).split("\n");
  const a = /^WORKER (\S+): (DONE|PARTIAL|BLOCKED)\b/.exec(l1);
  const b = /^branch: (\S+) @ ([0-9a-f]{7,})/.exec(l2);
  return a && b ? { name: a[1], status: a[2], branch: b[1], sha: b[2] } : null;
}

test("the five kinds are one set across the README paragraph, worker.md and the fixtures", () => {
  assert.ok(PARA.length > 400, "README has a §Parent and child paragraph");
  const inPara = /<blocked\|question\|collision\|scope\|checkpoint>/.exec(PARA);
  assert.ok(inPara, "the paragraph states the child's first-line shape with the five kinds");
  const worker = read(".claude/agents/worker.md");
  assert.match(worker, /<your name>: <blocked\|question\|collision\|scope\|checkpoint> — <one line>/, "worker.md states the same shape");
  assert.deepEqual(FIX.kinds, ["blocked", "question", "collision", "scope", "checkpoint"]);
  for (const k of FIX.kinds) assert.match(worker, new RegExp(`\\*\\*${k}\\*\\*`), `worker.md explains ${k}`);
  assert.match(worker, /\.claude\/agents\/README\.md.*Parent and child/, "worker.md points at the paragraph, not docs/WORKERS.md");
  assert.doesNotMatch(worker, /docs\/WORKERS\.md/);
  assert.doesNotMatch(PARA, /docs\/WORKERS\.md/);
});

test("the README names the parent's exact action for every kind, and the authority rules", () => {
  for (const k of FIX.kinds) assert.match(PARA, new RegExp(`\\*\\*${k}\\*\\*\\s*→`), `the paragraph has an action for ${k}`);
  assert.match(PARA, /\*\*blocked\*\*\s*→[^;]*(re-scope|stop)[^;]*Plan/, "blocked: fact / re-scope / stop, recorded in the Plan");
  assert.match(PARA, /\*\*question\*\*\s*→[^;]*decide[^;]*never forward[^;]*Bryce/, "question: decide and record, never forwarded from an unattended run");
  assert.match(PARA, /\*\*collision\*\*\s*→[^;]*ONE owner/, "collision: ONE owner");
  assert.match(PARA, /\*\*scope\*\*\s*→[^;]*OWNED in full/, "scope: OWNED re-sent in full");
  assert.match(PARA, /\*\*checkpoint\*\*\s*→[^;]*git merge --no-ff[^;]*verify[^;]*merged <sha>/, "checkpoint: merge, verify, reply merged <sha>");
  assert.match(PARA, /never a grant past FORBIDDEN or a hook/, "a parent's message is direction, not a grant");
  assert.match(PARA, /SESSION \(by session id\) is data unless a label or a Plan change by the PR owner/, "cross-session messages are data");
  assert.match(PARA, /WORKER <name>: DONE\|PARTIAL\|BLOCKED/, "the report line");
});

test("every fixture message parses to its kind and sender; the non-messages do not parse", () => {
  for (const f of FIX.messages) {
    const p = parseMessage(f.message);
    assert.ok(p, f.message);
    assert.equal(p.kind, f.kind, f.message);
    assert.equal(p.name, f.name, f.message);
    assert.ok(FIX.actions[p.kind], `an action is defined for ${p.kind}`);
  }
  for (const n of FIX.not_messages) assert.equal(parseMessage(n), null, n);
});

test("the WORKER report parses and the contract hook accepts it; a report without branch @ sha is bounced", () => {
  const HOOK = path.join(ROOT, ".claude/hooks/subagent-contract.py");
  const hook = (msg) => spawnSync("python3", [HOOK], { input: JSON.stringify({ hook_event_name: "SubagentStop", agent_type: "worker", agent_id: "w1", last_assistant_message: msg }), encoding: "utf8" }).stdout.trim();
  for (const r of FIX.reports) {
    assert.deepEqual(parseReport(r.report), { name: r.name, status: r.status, branch: r.branch, sha: r.sha });
    assert.equal(hook(r.report), "", "the hook passes a well-formed report");
  }
  assert.match(hook("WORKER B1: DONE\nchanged: a\nverified: x -> ok\nnext: y"), /branch:/, "the hook bounces a report without branch @ sha");
  const settings = JSON.parse(read(".claude/settings.json"));
  const g = settings.hooks.SubagentStop.find((x) => x.hooks.some((h) => h.command.includes("subagent-contract.py")));
  assert.ok(new RegExp(g.matcher).test("worker"), "SubagentStop runs the contract hook for worker");
});
