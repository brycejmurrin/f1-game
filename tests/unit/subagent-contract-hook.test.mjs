/* subagent-contract-hook.test.mjs — .claude/hooks/subagent-contract.py, the
 * SubagentStop hook that sends a reporter subagent's (or a worker's) malformed
 * final report back to it (2026-10-14; widened 2026-11-03, plan §4.6). RUNS the
 * real hook on fake stdin payloads shaped as
 * https://code.claude.com/docs/en/hooks §SubagentStop documents them
 * (agent_type, stop_hook_active, last_assistant_message): one good report per
 * contracted agent passes; too many rows, a missing verdict line and a wrong
 * prefix/shape block with {"decision":"block","reason":…} on stdout and exit 0;
 * stop_hook_active, unknown agents, empty messages, structured-output JSON and
 * garbage stdin pass (fail open). Also pins settings.json's matcher to the
 * hook's contract table.
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

const finding = (n, kind = "bug") => `FINDING ${n} | ${kind} | sev high | x/a.js:${n} | x → y | fix z | x/a.test.mjs | CODE-TRACED`;
const claim = (n) => `CLAIM ${n} | CONFIRMED | evidence: x/a.js:${n} "q"`;
const known = (n) => `KNOWN x/a.js:${n} — claim — PR #${n} — OPEN`;
const site = (n) => `SITE  x/a.js:${n}  kPath  column:AI-only  in-table:yes  why: "w"`;
const sclaim = (n, v = "holds") => `CLAIM ${n} | a.md:${n} | tools/check/ratchets.mjs | ${v} | node tools/check/ratchets.mjs --help rc=0`;

const TU = "\ntools used: lsp 3 · grep 1 · read 2";  // #6469: the LSP-first split every apex-lsp card ends with

const gRow = (n) => `FINDING ${n} | duplication | sev med | js/ui/dom.js:39 | 5 lap-formatter copies → Dom.fmtLap | one carve | lap table | CONFIRMED | lsp: lsp_symbols fmtLap = 6 defs`;
const gTail = "\ncovered: a\nnot covered: b\nmeasured: none\ntools used: lsp 14 · grep 3 · read 6";
const srRow = (n) => `SESSION session_0${n} | working | updated 2026-11-25T04:20:00Z | syncing PR #64${n} onto the tip`;
const srTail = "\npages: session_01 → 2 pages inline\nnot read: none";

const GOOD = {
  "code-hunter": `Hunted js/race.\n${finding(1)}\n${finding(2, "dead-code")}\n${finding(3, "drift")}\n${finding(4, "mess")}\ncovered: x/race/a.js\nnot covered: none\nmeasured: none${TU}`,
  "finding-verifier": `${claim(1)}\nCLAIM 2 | STALE (fixed in abc1234) | evidence: x\nCLAIM 3 | NEEDS-BROWSER | pixels; probe: render\nrefuted: 0/3 stale: 1/3${TU}`,
  "prior-art-scout": "```\n" + `${known(1)}\nKNOWN x/b.js:2 — c — DEFECT-LEDGER §4 — ?\n` + "```\nsources read: docs/BUGS.md\nnot read: none",
  "surface-reviewer": `VERDICT FIX — two false claims | report: scratch/review/x.md\n${sclaim(1)}\n${sclaim(2, "false")}\n${sclaim(3, "stale")}\ncollisions: none\ncycles: none`,
  "physics-contract-auditor": `${site(1)}\nvstd-invariant: pass\ncurvature-channels: pass\ncovered: js/physics  not covered: none${TU}`,
  "ci-red-triage": "SHA abc1234 · run https://g/1 · fast · RED\nspec — Expected 1 Received 2 — lane: ui\nbase: unknown  (base run unread)\nnext: fix X\n- job ui, log line 12",
  "pr-reviewer": "REVIEW #6385 @ 36294c3 · files 3 · routed: unit; specs 2\n"
    + "FINDING 1 | blocker-candidate | js/ui/hud.js:42 — the id moved — index.html still names it — test: tests/specs/hud-layout.spec.js\n"
    + "FINDING 2 | nit | css/hud.css:7 — dead rule — nothing matches it — test: none\nfindings: 2 (blocker-candidate 1)" + TU,
  "gardener": gRow(1) + gTail,
  "session-reader": `${srRow(1)}\nMETHODS session_01 | main | calls 40 · lsp 4 (10%) · grep 9 (22%) · read 12 · browser 0${srTail}`,
  "worker":"WORKER B1: DONE\nbranch: cursor/x-1234 @ 0123abc   (worktree /w)\nchanged: a.js b.mjs\nverified: node --test tests/unit/ratchets.test.mjs -> pass 3/3\nnot run: smoke (browser)\nnext: merge the branch",
};

test("a good report from every contracted agent passes", () => {
  for (const [agent, msg] of Object.entries(GOOD)) passes(stop(agent, msg), agent);
  passes(stop("code-hunter", "FINDING none\ncovered: a\nnot covered: b\nmeasured: none" + TU), "zero findings is legitimate");
  passes(stop("surface-reviewer", "VERDICT OK — every claim holds | report: scratch/r.md\nCLAIM none\ncollisions: none\ncycles: none"), "a clean set");
  passes(stop("worker", "WORKER x: PARTIAL\nbranch: b @ abcdef1\nchanged: -\nverified: none\nnot run: all\nnext: resume"), "partial");
});

test("pr-reviewer: header, ≤10 rows, kind and file:line — claim — why — test", () => {
  const prow = (n, k = "nit") => `FINDING ${n} | ${k} | js/ui/hud.js:${n} — claim — why — test: none`;
  const head = "REVIEW #1 @ abcdef1 · files 2 · routed: unit; specs 0";
  const tally = "findings: 0 (blocker-candidate 0)" + TU;
  passes(stop("pr-reviewer", `${head}\nFINDING none\n${tally}`), "no findings");
  passes(stop("pr-reviewer", [head, ...Array.from({ length: 10 }, (_, i) => prow(i + 1)), tally].join("\n")), "exactly 10");
  blocks(stop("pr-reviewer", [head, ...Array.from({ length: 11 }, (_, i) => prow(i + 1)), tally].join("\n")), /11 FINDING rows, over the cap of 10/, "11 rows");
  blocks(stop("pr-reviewer", `${head}\n${prow(1, "major")}\n${tally}`), /does not match the shape/, "unknown kind");
  blocks(stop("pr-reviewer", `${head}\nFINDING 1 | nit | js/ui/hud.js — claim — why — test: none\n${tally}`), /does not match/, "no line number");
  blocks(stop("pr-reviewer", `${head}\nFINDING 1 | nit | js/ui/hud.js:3 — claim — why\n${tally}`), /does not match/, "no test field");
  blocks(stop("pr-reviewer", `Reviewed it.\n${prow(1)}\n${tally}`), /REVIEW #/, "no header");
  blocks(stop("pr-reviewer", `${head}\n${prow(1)}`), /findings:/, "no tally");
  blocks(stop("pr-reviewer", `${head}\n${tally}`), /no FINDING row/, "neither rows nor FINDING none");
  passes(stop("pr-reviewer", "UNREAD: every route was denied"), "denial contract");
});

test("over the row cap blocks", () => {
  const many = (f, n) => Array.from({ length: n }, (_, i) => f(i + 1)).join("\n");
  blocks(stop("code-hunter", many(finding, 13) + "\ncovered: a\nnot covered: b\nmeasured: none" + TU), /13 FINDING rows, over the cap of 12/, "code-hunter 13");
  blocks(stop("finding-verifier", many(claim, 16) + "\nrefuted: 0/16 stale: 0/16" + TU), /cap of 15/, "verifier 16");
  blocks(stop("prior-art-scout", many(known, 31) + "\nsources read: x\nnot read: none"), /cap of 30/, "scout 31");
  blocks(stop("surface-reviewer", "VERDICT FIX — x | report: r\n" + many(sclaim, 61) + "\ncollisions: none\ncycles: none"), /cap of 60/, "reviewer 61");
  blocks(stop("physics-contract-auditor", many(site, 31) + "\nvstd-invariant: pass\ncurvature-channels: pass\ncovered: x" + TU), /cap of 30/, "sites 31");
  passes(stop("code-hunter", many(finding, 12) + "\ncovered: a\nnot covered: b\nmeasured: none" + TU), "exactly 12");
});

test("a missing verdict / required line blocks", () => {
  blocks(stop("finding-verifier", claim(1)), /refuted:/, "no tally line");
  blocks(stop("code-hunter", finding(1) + "\ncovered: a\nnot covered: b"), /measured:/, "no measured line");
  blocks(stop("surface-reviewer", "Report written to scratch/r.md. Looks fine."), /VERDICT/, "no VERDICT");
  blocks(stop("surface-reviewer", "VERDICT OK — fine | report: r\nCLAIM none"), /collisions|cycles/, "no collisions/cycles line");
  blocks(stop("ci-red-triage", "SHA abc · run https://g/1 · fast · RED\nnext: fix"), /base:/, "no base line");
  blocks(stop("physics-contract-auditor", site(1) + "\ncovered: x"), /vstd-invariant/, "no gate lines");
  blocks(stop("worker", "All done, merged it."), /WORKER/, "worker without the status line");
  blocks(stop("worker", "WORKER x: DONE\nchanged: a\nverified: x -> ok\nnext: y"), /branch:/, "worker without branch @ sha");
});

test("a wrong prefix or row shape blocks", () => {
  blocks(stop("code-hunter", "FINDING 1: race.js is slow\ncovered: a\nnot covered: b\nmeasured: none" + TU), /does not match the shape/, "free-text finding");
  blocks(stop("code-hunter", finding(1, "style") + "\ncovered: a\nnot covered: b\nmeasured: none" + TU), /does not match/, "unknown kind");
  blocks(stop("finding-verifier", "CLAIM 1 | TRUE | evidence: x\nrefuted: 0/1 stale: 0/1" + TU), /does not match/, "invented verdict");
  blocks(stop("prior-art-scout", "| KNOWN | a.js | claim |\nKNOWN a.js:1 claim\nsources read: x\nnot read: none"), /does not match/, "table / no separators");
  blocks(stop("surface-reviewer", "VERDICT OK — x | report: r\nCLAIM 1 | a.md:3 | b | maybe | p\ncollisions: none\ncycles: none"), /does not match/, "unknown claim verdict");
  blocks(stop("surface-reviewer", "VERDICT: FIX — x | report: r\nCLAIM none\ncollisions: none\ncycles: none"), /VERDICT/, "VERDICT with a colon is the report's first line, not the return");
  blocks(stop("physics-contract-auditor", "SITE x/a.js:1 k column:player in-table:no\nvstd-invariant: pass\ncurvature-channels: pass\ncovered: x" + TU), /does not match/, "bad column");
  blocks(stop("worker", "WORKER x: FINISHED\nbranch: b @ abcdef1\nverified: x\nnext: y"), /does not match/, "unknown worker status");
});

test("the block reason is one paragraph that names the agent file", () => {
  const r = stop("finding-verifier", claim(1));
  assert.ok(!r.json.reason.includes("\n"), "one paragraph");
  assert.match(r.json.reason, /\.claude\/agents\/finding-verifier\.md/);
});

test("fail open: loop guard, unknown agents, denial reports, schema JSON, empty and garbage input", () => {
  passes(stop("code-hunter", "nothing", { stop_hook_active: true }), "stop_hook_active never blocks");
  passes(stop("general-purpose", "anything"), "general-purpose");
  passes(stop("Explore", "anything"), "Explore");
  passes(stop("bloat-auditor", "anything"), "bloat-auditor folded into code-hunter (2026-11-03)");
  passes(stop("agent-surface-reviewer", "anything"), "agent-surface-reviewer re-specced as surface-reviewer (2026-11-03)");
  passes(stop(undefined, "anything"), "no agent_type");
  passes(stop("code-hunter", ""), "empty final message");
  passes(stop("code-hunter", null), "missing final message");
  passes(stop("code-hunter", "UNREAD: every Bash call was denied"), "denial contract");
  // the workflows run finders and verifiers with a structured-output schema: the message is JSON, not rows
  passes(stop("code-hunter", JSON.stringify({ filesRead: 3, findings: [] })), "FINDINGS_SCHEMA output");
  passes(stop("finding-verifier", "```json\n" + JSON.stringify({ verdicts: [{ index: 0, refuted: false, reason: "x" }] }) + "\n```"), "fenced VERDICTS_SCHEMA output");
  passes(stop("prior-art-scout", JSON.stringify({ known: [] })), "KNOWN_SCHEMA output");
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
  for (const a of ["general-purpose", "Explore", "track-surveyor", "verify-agent", "deploy-research", "bloat-auditor", "agent-surface-reviewer"])
    assert.ok(!re.test(a), `matcher must leave ${a} alone`);
  // the hook's table and the matcher are the same set
  const src = fs.readFileSync(HOOK, "utf8");
  const table = [...src.matchAll(/^    "([a-z-]+)": \{$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(table, Object.keys(GOOD).sort(), "C in subagent-contract.py lists exactly the contracted agents");
});

// SubagentHandback (#2228 research; https://code.claude.com/docs/en/hooks §SubagentStop): a subagent that runs
// with the SubagentHandback tool delivers its report through that tool; the report is that call's message input,
// which a PreToolUse hook matched on SubagentHandback receives as tool_input.message. One deny per agent_id.
test("a malformed report handed back through SubagentHandback is denied once, with the contract reason", () => {
  const cwd = fs.mkdtempSync(path.join(ROOT, "artifacts", "contract-handback-"));
  const handback = (agent_type, message, agent_id) => run({
    session_id: "s", transcript_path: "/x.jsonl", cwd, hook_event_name: "PreToolUse",
    tool_name: "SubagentHandback", tool_input: { message }, agent_id, agent_type });
  try {
    for (const [agent, msg] of Object.entries(GOOD)) passes(handback(agent, msg, "good-" + agent), agent);
    const bad = handback("finding-verifier", "CLAIM 1 | MAYBE | evidence: x", "bad-1");
    assert.equal(bad.status, 0);
    assert.ok(bad.json, "expected a PreToolUse decision");
    assert.equal(bad.json.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(bad.json.hookSpecificOutput.permissionDecision, "deny");
    assert.match(bad.json.hookSpecificOutput.permissionDecisionReason, /Report contract \(finding-verifier\)/);
    passes(handback("finding-verifier", "CLAIM 1 | MAYBE | evidence: x", "bad-1"), "one deny per agent, never a loop");
    passes(handback("general-purpose", "anything", "gp-1"), "uncontracted agents are left alone");
    passes(run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" }, agent_type: "code-hunter", cwd }),
      "only SubagentHandback is checked");
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
});

test("settings.json runs the contract hook on PreToolUse SubagentHandback", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const g = (settings.hooks.PreToolUse || []).find((x) => x.hooks.some((h) => h.command.includes("subagent-contract.py")));
  assert.ok(g, "a PreToolUse group runs subagent-contract.py");
  assert.ok(new RegExp(g.matcher).test("SubagentHandback"));
  assert.ok(!new RegExp(`^(?:${g.matcher})$`).test("Bash"), "and nothing else");
});

test("zero rows, a per-row UNREAD, cited sections and line ranges, a BLOCKED worker, and the handback/stop pair", () => {
  blocks(stop("finding-verifier", "Looked at everything; all fine.\nrefuted: 0/0 stale: 0/0" + TU), /no CLAIM row/, "a report with no recognised row");
  passes(stop("finding-verifier", "CLAIM none\nrefuted: 0/0 stale: 0/0" + TU), "an explicit none line");
  blocks(stop("finding-verifier", "CLAIM 1 | UNREAD | evidence: denied"), /refuted:/, "a per-row UNREAD keeps the tally required");
  passes(stop("finding-verifier", "UNREAD: every route was denied"), "a report that LEADS with UNREAD");
  passes(stop("surface-reviewer", "VERDICT OK — x | report: scratch/r.md\nCLAIM 1 | AGENTS.md §Coordination | x | holds | read rc=0\n"
    + "CLAIM 2 | docs/PHYSICS.md:10-14 | y | holds | read rc=0\ncollisions: none\ncycles: none"), "a claim citing a section or a line range");
  passes(stop("worker", "WORKER w: BLOCKED\nbranch: claude/x @ none\nverified: none\nnext: the coordinator decides"), "BLOCKED before any commit");
  // a hand-back judged at PreToolUse SubagentHandback is not judged again at SubagentStop (the closing text is not the report)
  const aid = "hb-" + process.pid;
  const stampDir = path.join(ROOT, "artifacts", "subagent-contract");
  try {
    const hb = run({ hook_event_name: "PreToolUse", tool_name: "SubagentHandback", cwd: ROOT, agent_id: aid, agent_type: "worker",
      tool_input: { message: GOOD.worker } });
    assert.equal(hb.out, "", "a good hand-back passes");
    passes(stop("worker", "Handed back.", { agent_id: aid }), "SubagentStop after a hand-back");
  } finally { for (const f of [aid, aid + ".handback"]) fs.rmSync(path.join(stampDir, f), { force: true }); }
});

// Bryce's decisions on 2026-11-25: `add-contract-row` (#6451, the gardener row exactly as proposed in comment
// 7152474400) and `A+B` (#6469: the `tools used:` line on the four apex-lsp reporter cards, and the session-reader row).
test("gardener: a FINDING row carries its lsp: query, and the report ends with tools used", () => {
  passes(stop("gardener", gRow(1) + gTail), "a well-formed gardener report");
  passes(stop("gardener", "FINDING none" + gTail), "zero findings");
  blocks(stop("gardener", gRow(1).replace(/ \| lsp: .*/, "") + gTail), /does not match/, "a row without its lsp: query");
  blocks(stop("gardener", gRow(1) + "\ncovered: a\nnot covered: b\nmeasured: none"), /tools used/, "no tools-used line");
});

test("tools used: lsp n · grep m · read k is required of code-hunter, finding-verifier, pr-reviewer and physics-contract-auditor", () => {
  for (const agent of ["code-hunter", "finding-verifier", "pr-reviewer", "physics-contract-auditor"]) {
    passes(stop(agent, GOOD[agent]), agent);
    blocks(stop(agent, GOOD[agent].replace(TU, "")), /tools used/, agent + " without the split");
    blocks(stop(agent, GOOD[agent].replace(TU, "\ntools used: lsp a lot")), /tools used/, agent + " with no counts");
  }
  passes(stop("code-hunter", "UNREAD: every route was denied"), "the denial contract still skips required lines");
});

test("session-reader: SESSION rows (≤40), then pages: and not read:", () => {
  passes(stop("session-reader", "SESSION none" + srTail), "no session asked about");
  passes(stop("session-reader", Array.from({ length: 40 }, (_, i) => srRow(i + 1)).join("\n") + srTail), "exactly 40");
  blocks(stop("session-reader", Array.from({ length: 41 }, (_, i) => srRow(i + 1)).join("\n") + srTail), /41 SESSION rows, over the cap of 40/, "41 rows");
  blocks(stop("session-reader", "SESSION session_01 is idle" + srTail), /does not match the shape/, "free text");
  blocks(stop("session-reader", srRow(1) + "\nnot read: none"), /pages:/, "no pages line");
  blocks(stop("session-reader", srRow(1) + "\npages: x"), /not read:/, "no not-read line");
});
