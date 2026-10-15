/* subagent-contract-hook.test.mjs — .claude/hooks/subagent-contract.py, the
 * SubagentStop hook that sends a reporter subagent's malformed final report
 * back to it (2026-10-14). RUNS the real hook on fake stdin payloads shaped as
 * https://code.claude.com/docs/en/hooks §SubagentStop documents them
 * (agent_type, stop_hook_active, last_assistant_message): one good report per
 * contracted agent passes; too many rows, a missing verdict line and a wrong
 * prefix/shape block with {"decision":"block","reason":…} on stdout and exit 0;
 * stop_hook_active, unknown agents, empty messages and garbage stdin pass
 * (fail open). Also pins settings.json's matcher to the hook's contract table.
 *
 * Run: node --test tests/unit/subagent-contract-hook.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = path.join(ROOT, ".claude/hooks/subagent-contract.py");

function run(input) {
  const r = spawnSync("python3", [HOOK], {
    input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8" });
  const out = r.stdout.trim();
  return { status: r.status, out, json: out ? JSON.parse(out) : null };
}
const stop = (agent_type, last_assistant_message, extra = {}) => run({
  session_id: "s", transcript_path: "/x.jsonl", cwd: ROOT, hook_event_name: "SubagentStop",
  stop_hook_active: false, agent_id: "a1", agent_type, agent_transcript_path: "/x/subagents/agent-a1.jsonl",
  last_assistant_message, ...extra });
const passes = (r, why) => { assert.equal(r.status, 0, why); assert.equal(r.out, "", why + ": " + r.out); };
const blocks = (r, re, why) => {
  assert.equal(r.status, 0, why);
  assert.ok(r.json, why + ": expected a JSON decision");
  assert.equal(r.json.decision, "block", why);
  assert.match(r.json.reason, re, why);
};

const finding = (n) => `FINDING ${n} | bug | sev high | x/a.js:${n} | x → y | fix z | x/a.test.mjs | CODE-TRACED`;
const claim = (n) => `CLAIM ${n} | CONFIRMED | evidence: x/a.js:${n} "q"`;
const known = (n) => `KNOWN x/a.js:${n} — claim — PR #${n} — OPEN`;
const bloat = (n) => `BLOAT  kind:dead  x/a.js:${n}  cost:4  why: "w"  carve: "c"  do-not: none`;
const site = (n) => `SITE  x/a.js:${n}  kPath  column:AI-only  in-table:yes  why: "w"`;

const GOOD = {
  "code-hunter": `Hunted js/race.\n${finding(1)}\n${finding(2)}\ncovered: x/race/a.js\nnot covered: none\nmeasured: none`,
  "finding-verifier": `${claim(1)}\nCLAIM 2 | STALE (fixed in abc1234) | evidence: x\nCLAIM 3 | NEEDS-BROWSER | pixels; probe: render\nrefuted: 0/3 stale: 1/3`,
  "prior-art-scout": "```\n" + `${known(1)}\nKNOWN x/b.js:2 — c — DEFECT-LEDGER §4 — ?\n` + "```\nsources read: docs/BUGS.md\nnot read: none",
  "agent-surface-reviewer": "VERDICT TRIM — too long | report: scratch/r.md\nGAP1 a.md:3 — stale flag\nGAP2 a.md:9 — dup",
  "bloat-auditor": `${bloat(1)}\n${bloat(2)}\nCOVERED: x/a.js`,
  "physics-contract-auditor": `${site(1)}\nvstd-invariant: pass\ncurvature-channels: pass\ncovered: js/physics  not covered: none`,
  "ci-red-triage": "SHA abc1234 · run https://g/1 · fast · RED\nspec — Expected 1 Received 2 — lane: ui\nbase: unknown  (base run unread)\nnext: fix X\n- job ui, log line 12",
  "ci-watcher": "BOARD 2 open · full-tier slots 1/3 · 2026-10-14T00:00:00Z\n#12 draft abc1234 clean ci=green gate=ok armed=- → READY\n  call: mcp__github__update_pull_request {pullNumber: 12, draft: false}\n#13 ready def5678 dirty ci=red gate=- armed=- → SYNC\nact only if the parent is CI Watch by Bryce's designation",
};

test("a good report from every contracted agent passes", () => {
  for (const [agent, msg] of Object.entries(GOOD)) passes(stop(agent, msg), agent);
  passes(stop("code-hunter", "FINDING none\ncovered: a\nnot covered: b\nmeasured: none"), "zero findings is legitimate");
  passes(stop("bloat-auditor", "BLOAT none\n1. x/x.js — big\nCOVERED: js/"), "clean scope");
});

test("over the row cap blocks", () => {
  const many = (f, n) => Array.from({ length: n }, (_, i) => f(i + 1)).join("\n");
  blocks(stop("code-hunter", many(finding, 13) + "\ncovered: a\nnot covered: b\nmeasured: none"), /13 FINDING rows, over the cap of 12/, "code-hunter 13");
  blocks(stop("finding-verifier", many(claim, 16) + "\nrefuted: 0/16 stale: 0/16"), /cap of 15/, "verifier 16");
  blocks(stop("prior-art-scout", many(known, 31) + "\nsources read: x\nnot read: none"), /cap of 30/, "scout 31");
  blocks(stop("bloat-auditor", many(bloat, 9) + "\nCOVERED: x"), /cap of 8/, "bloat 9");
  blocks(stop("physics-contract-auditor", many(site, 31) + "\nvstd-invariant: pass\ncurvature-channels: pass\ncovered: x"), /cap of 30/, "sites 31");
  passes(stop("code-hunter", many(finding, 12) + "\ncovered: a\nnot covered: b\nmeasured: none"), "exactly 12");
});

test("a missing verdict / required line blocks", () => {
  blocks(stop("finding-verifier", claim(1)), /refuted:/, "no tally line");
  blocks(stop("code-hunter", finding(1) + "\ncovered: a\nnot covered: b"), /measured:/, "no measured line");
  blocks(stop("agent-surface-reviewer", "Report written to scratch/r.md. Looks fine."), /VERDICT/, "no VERDICT");
  blocks(stop("ci-red-triage", "SHA abc · run https://g/1 · fast · RED\nnext: fix"), /base:/, "no base line");
  blocks(stop("ci-watcher", "#12 draft abc clean ci=green gate=ok armed=- → READY"), /BOARD/, "no BOARD header");
  blocks(stop("physics-contract-auditor", site(1) + "\ncovered: x"), /vstd-invariant/, "no gate lines");
});

test("a wrong prefix or row shape blocks", () => {
  blocks(stop("code-hunter", "FINDING 1: race.js is slow\ncovered: a\nnot covered: b\nmeasured: none"), /does not match the shape/, "free-text finding");
  blocks(stop("finding-verifier", "CLAIM 1 | TRUE | evidence: x\nrefuted: 0/1 stale: 0/1"), /does not match/, "invented verdict");
  blocks(stop("bloat-auditor", "BLOAT  kind:refactor  x/a.js:1  cost:3  why: w\nCOVERED: x"), /does not match/, "unknown kind");
  blocks(stop("bloat-auditor", "BLOAT  kind:dead  x/a.js:1  cost:0  why: w\nCOVERED: x"), /does not match/, "cost:0");
  blocks(stop("bloat-auditor", `${bloat(1)} &lt;x&gt;\nCOVERED: x`), /HTML entities/, "entities");
  blocks(stop("prior-art-scout", "| KNOWN | a.js | claim |\nKNOWN a.js:1 claim\nsources read: x\nnot read: none"), /does not match/, "table / no separators");
  blocks(stop("agent-surface-reviewer", "VERDICT GREAT — fine | report: scratch/r.md\nGAP1 x\nGAP2 y"), /does not match/, "unknown verdict");
  blocks(stop("ci-watcher", "BOARD 1 open\n#12 draft abc clean → MERGE"), /does not match/, "unknown suggestion");
  blocks(stop("physics-contract-auditor", "SITE x/a.js:1 k column:player in-table:no\nvstd-invariant: pass\ncurvature-channels: pass\ncovered: x"), /does not match/, "bad column");
});

test("the block reason is one paragraph that names the agent file", () => {
  const r = stop("finding-verifier", claim(1));
  assert.ok(!r.json.reason.includes("\n"), "one paragraph");
  assert.match(r.json.reason, /\.claude\/agents\/finding-verifier\.md/);
});

test("fail open: loop guard, unknown agents, denial reports, empty and garbage input", () => {
  passes(stop("code-hunter", "nothing", { stop_hook_active: true }), "stop_hook_active never blocks");
  passes(stop("general-purpose", "anything"), "general-purpose");
  passes(stop("Explore", "anything"), "Explore");
  passes(stop(undefined, "anything"), "no agent_type");
  passes(stop("code-hunter", ""), "empty final message");
  passes(stop("code-hunter", null), "missing final message");
  passes(stop("code-hunter", "UNREAD: every Bash call was denied"), "denial contract");
  passes(stop("ci-watcher", "pr-board.mjs exit 3: no token"), "ci-watcher exit 3 line");
  passes(run("not json {"), "garbage stdin");
  passes(run(""), "empty stdin");
  passes(run("[1,2]"), "non-object JSON");
  blocks(stop("plugin:code-hunter", "done"), /covered:/, "a plugin-scoped name maps to its agent");
});

test("settings.json runs the hook on SubagentStop for exactly the contracted agents", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const g = (settings.hooks.SubagentStop || []).find((x) => x.hooks.some((h) => h.command.includes("subagent-contract.py")));
  assert.ok(g, "SubagentStop must wire subagent-contract.py");
  const re = new RegExp(g.matcher);
  for (const a of Object.keys(GOOD)) {
    assert.ok(re.test(a), `matcher must select ${a}`);
    assert.ok(fs.existsSync(path.join(ROOT, ".claude/agents", a + ".md")), `${a} is a real agent`);
  }
  for (const a of ["general-purpose", "Explore", "track-surveyor", "verify-agent", "deploy-research"])
    assert.ok(!re.test(a), `matcher must leave ${a} alone`);
  const t0 = Date.now(); stop("code-hunter", GOOD["code-hunter"]);
  assert.ok(Date.now() - t0 < 2000, "the hook is fast");
});
