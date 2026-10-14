// skill-routing-eval.py driven against a FAKE `claude` placed first on PATH:
// canned stream-json for a Skill call, Bash-then-Skill, Bash-only, a SKILL.md
// Read and a flaky query; covers --only, --alias, --runs majority, --grace late
// detection, --root cwd, the output header and --compare. No network, ~2 s.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "tools/check/skill-routing-eval.py");
fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
const DIR = fs.mkdtempSync(path.join(ROOT, "artifacts", "skill-routing-eval-test-"));
test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));

const BIN = path.join(DIR, "bin");
const LOG = path.join(DIR, "cwd.log");
fs.mkdirSync(BIN);
fs.writeFileSync(path.join(BIN, "claude"), `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";  // package.json type=module: the extensionless fake is ESM
const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("9.9.9 (Claude Code)"); process.exit(0); }
const q = args[args.indexOf("-p") + 1];
fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ cwd: process.cwd(), q }) + "\\n");
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
const se = (event) => out({ type: "stream_event", event });
const tool = (name, input) => {
  const j = JSON.stringify(input), h = j.length >> 1;
  se({ type: "content_block_start", index: 0, content_block: { type: "tool_use", name } });
  se({ type: "content_block_delta", delta: { type: "input_json_delta", partial_json: j.slice(0, h) } });
  se({ type: "content_block_delta", delta: { type: "input_json_delta", partial_json: j.slice(h) } });
  se({ type: "content_block_stop" });
  se({ type: "message_stop" });
};
out({ type: "system", subtype: "init", model: "fake-model-1" });
if (q.includes("SKILLQ")) tool("Skill", { skill: "proj:agent-view" });
else if (q.includes("BASHTHENSKILL")) { tool("Bash", { command: "ls" }); tool("Skill", { skill: "slim-bloat" }); }
else if (q.includes("BASHONLY")) { tool("Bash", { command: "ls" }); tool("Read", { file_path: "/x/README.md" }); }
else if (q.includes("READSKILL")) tool("Read", { file_path: path.join(process.cwd(), ".claude/skills/old-skill/SKILL.md") });
else if (q.includes("FLAKY")) {
  const f = path.join(path.dirname(process.env.FAKE_CLAUDE_LOG), "flaky.n");
  const n = fs.existsSync(f) ? +fs.readFileSync(f, "utf8") : 0;
  fs.writeFileSync(f, String(n + 1));
  if (n % 3 === 1) tool("Bash", { command: "ls" }); else tool("Skill", { skill: "agent-view" });
}
out({ type: "result", subtype: "success" });
`, { mode: 0o755 });

const Q = path.join(DIR, "queries");
fs.mkdirSync(Q);
const put = (name, rows) => fs.writeFileSync(path.join(Q, `${name}.json`), JSON.stringify(rows));
put("agent-view", [
  { query: "SKILLQ fire", expect: "agent-view" },
  { query: "BASHONLY fire", expect: "agent-view" },
  { query: "READSKILL merged", expect: "agent-view" },
]);
put("slim-bloat", [{ query: "BASHTHENSKILL late", expect: "slim-bloat" }]);
put("flaky", [{ query: "FLAKY majority", expect: "agent-view" }]);

const ENV = { ...process.env, PATH: `${BIN}${path.delimiter}${process.env.PATH}`, FAKE_CLAUDE_LOG: LOG };
let n = 0;
function run(...args) {
  const out = path.join(DIR, `out-${n++}.json`);
  execFileSync("python3", [SCRIPT, "--queries", Q, "--out", out, "--workers", "1", "--timeout", "20", ...args],
    { env: ENV, stdio: ["ignore", "ignore", "pipe"] });
  const data = JSON.parse(fs.readFileSync(out, "utf8"));
  return { ...data, by: Object.fromEntries(data.results.map((r) => [r.query.split(" ")[0], r])) };
}
const cwds = () => fs.readFileSync(LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("--only filters sources; header records the claude version and model; cwd defaults to the script's repo", () => {
  fs.rmSync(LOG, { force: true });
  const r = run("--only", "agent-view,slim-bloat.json", "--model", "m-x");
  assert.deepEqual(new Set(r.results.map((x) => x.source)), new Set(["agent-view", "slim-bloat"]));
  assert.equal(r.header.claude_version, "9.9.9 (Claude Code)");
  assert.equal(r.header.model, "m-x");
  assert.equal(r.header.model_seen, "fake-model-1");
  assert.equal(r.by.SKILLQ.raw, "skill:agent-view");
  assert.equal(r.by.SKILLQ.verdict, "correct");
  assert.equal(r.by.BASHONLY.raw, "none:Bash");
  assert.equal(r.by.BASHONLY.verdict, "none");
  assert.equal(r.by.BASHTHENSKILL.raw, "none:Bash", "strict: the first tool decides");
  assert.equal(r.by.BASHTHENSKILL.grace, undefined, "no grace fields without --grace");
  assert.equal(r.by.READSKILL.fired, "old-skill");
  assert.equal(r.by.READSKILL.verdict, "wrong");
  assert.ok(cwds().every((c) => c.cwd === ROOT));
});

test("--grace records late:<skill> within K calls; --alias rescores a merged skill; --root sets cwd", () => {
  fs.rmSync(LOG, { force: true });
  const other = fs.mkdtempSync(path.join(DIR, "root-"));
  const r = run("--only", "agent-view,slim-bloat", "--grace", "2", "--alias", "old-skill=agent-view", "--root", other);
  assert.equal(r.header.root, fs.realpathSync(other));
  assert.ok(cwds().every((c) => fs.realpathSync(c.cwd) === fs.realpathSync(other)));
  const late = r.by.BASHTHENSKILL;
  assert.equal(late.raw, "none:Bash");
  assert.equal(late.verdict, "none");
  assert.equal(late.grace, "late:slim-bloat");
  assert.equal(late.grace_verdict, "correct");
  assert.equal(r.by.BASHONLY.grace, "none:Bash");
  assert.equal(r.by.BASHONLY.grace_verdict, "none");
  assert.equal(r.by.READSKILL.fired, "agent-view");
  assert.equal(r.by.READSKILL.verdict, "correct");
  assert.equal(r.by.SKILLQ.grace, "skill:agent-view");
  // K counts the calls AFTER the first non-skill tool: K=1 still sees the Skill at call #2
  const k0 = run("--only", "slim-bloat", "--grace", "1");
  assert.equal(k0.by.BASHTHENSKILL.grace, "late:slim-bloat");
});

test("--runs N takes the majority and records agreement k/N", () => {
  const r = run("--only", "flaky", "--runs", "3");
  const f = r.by.FLAKY;
  assert.equal(f.raw, "skill:agent-view");
  assert.equal(f.verdict, "correct");
  assert.equal(f.agreement, "2/3");
  assert.deepEqual(f.runs, ["skill:agent-view", "none:Bash", "skill:agent-view"]);
  assert.equal(r.header.runs, 3);
});

test("--compare prints the per-skill base→head table and flipped queries (legacy list input too)", () => {
  const row = (source, query, expect, verdict, fired) => ({ source, query, expect, verdict, fired, raw: "x" });
  const A = path.join(DIR, "a.json"), B = path.join(DIR, "b.json");
  fs.writeFileSync(A, JSON.stringify([          // pre-header bare list
    row("agent-view", "q1", "agent-view", "none", null),
    row("agent-view", "q2", "agent-view", "correct", "agent-view"),
    row("agent-view", "q3", "playwright-probe", "correct", "playwright-probe"),
  ]));
  fs.writeFileSync(B, JSON.stringify({ header: {}, results: [
    row("agent-view", "q1", "agent-view", "correct", "agent-view"),
    row("agent-view", "q2", "agent-view", "correct", "agent-view"),
    row("agent-view", "q3", "playwright-probe", "wrong", "agent-view"),
  ] }));
  const out = execFileSync("python3", [SCRIPT, "--compare", A, B], { encoding: "utf8" });
  assert.match(out, /should-fire base→head/);
  assert.match(out, /^agent-view\s+1\/2 → 2\/2\s+1\/1 → 0\/1\s+\+0$/m);
  assert.match(out, /^flipped: 2$/m);
  assert.match(out, /none\(None\) → correct\(agent-view\)\s+q1/);
  assert.match(out, /correct\(playwright-probe\) → wrong\(agent-view\)\s+q3/);
});

test("--help works and --queries/--out are required without --compare", () => {
  assert.match(execFileSync("python3", [SCRIPT, "--help"], { encoding: "utf8" }), /--compare/);
  assert.throws(() => execFileSync("python3", [SCRIPT], { stdio: "pipe" }));
});
