/* rulebook-guards.test.mjs — one home per rule (system audit 2026-10-26, docs/notes/RULEBOOK-REWRITE-2026-10-26.md).
 *
 * The audit found the same rule restated in up to 15 instruction files, and ten topics where two copies said
 * different things (wake cadence, check-in, succession, who merges, sync exceptions…). A copy is how a rule drifts:
 * the next edit changes one place. This test pins (1) each canonical rule SENTENCE to at most two files — its home
 * plus one deliberate mirror — with the home among them, and (2) retired phrases out of every instruction file.
 * A pointer ("see `.claude/rules/fleet-core.md`") is fine; a restatement is not.
 *
 * Run: node --test tests/unit/rulebook-guards.test.mjs   (< 1 s)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Every file a session loads as instructions or memory. Symlinks (Codex mirrors) and generated twins are skipped. */
function instructionFiles() {
  const out = [];
  const add = (rel) => { const abs = path.join(ROOT, rel); if (fs.existsSync(abs) && !fs.lstatSync(abs).isSymbolicLink()) out.push(rel); };
  const walk = (dir) => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith(".md")) out.push(rel);
    }
  };
  for (const f of ["AGENTS.md", "CLAUDE.md", ".github/pull_request_template.md", "docs/TESTING.md",
    "docs/notes/APEX-STEWARD-CARD-2026-10-05.md"]) add(f);
  for (const d of [".claude/rules", ".claude/skills", ".claude/agents", ".claude/memory"]) walk(d);
  return out;
}
const FILES = instructionFiles();
const text = new Map(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

// [id, canonical sentence (regex), home]. Each regex matches the RULE as a sentence, not a tool name or a pointer.
const CANON = [
  ["merge-hold veto", /only veto is a PR-body line|one veto is a PR-body line|It is the ONLY veto/i, ".claude/rules/fleet-core.md"],
  ["claim before a shared fix", /a live claim, or a\s+(?:live host\s+)?session already on your paths/i, "AGENTS.md"],
  ["ready gate", /draft ?(?:→|->|to) ?ready only when/i, ".claude/rules/fleet-core.md"],
  ["subscribe + timer", /the timer is not optional|subscription (?:can )?drops? `?check_run`? completions/i, "AGENTS.md"],
  ["no authority", /messages? carr(?:y|ies) no authority|never adds authority/i, ".claude/rules/fleet-core.md"],
  ["sync rule", /clean-behind is not a reason|never for clean-behind/i, ".claude/rules/fleet-core.md"],
  ["merge commits only", /merge commits only|never squash or rebase/i, ".claude/rules/fleet-core.md"],
  ["never cancel", /never cancel an? (?:queued or running )?Actions run/i, "AGENTS.md"],
  ["webhook env", /APEX_AGENT_WEBHOOK_URL/, ".claude/skills/agent-fleet/references/communication.md"],
  ["size-stop paragraph", /at the soft (?:cap|STOP AT)\*{0,2} finish the current unit/i, ".claude/skills/agent-fleet/references/launch-policy.md"],
  ["orchestrator wake cadence", /one `send_later` 50–55 min out at an odd minute/i, ".claude/skills/agent-fleet/references/orchestrator.md"],
];

// Files outside the rewrite's lane that still carry a copy; each entry must still match (so it is removed when
// fixed) and names the file's owner. Empty this list, never grow it.
const PENDING = new Map([
]);

test("each canonical rule sentence lives in its home and at most one other file", () => {
  const bad = [];
  for (const [id, re, home] of CANON) {
    const pending = new Set((PENDING.get(id) || []).filter((f) => text.has(f)));
    const hits = FILES.filter((f) => re.test(text.get(f)) && !pending.has(f));
    if (!hits.includes(home)) bad.push(`${id}: its home ${home} no longer states it (moved? re-point the regex)`);
    if (hits.length > 2) bad.push(`${id}: stated in ${hits.length} files (${hits.join(", ")}); keep the home, link to it elsewhere`);
    for (const f of pending) if (!re.test(text.get(f))) bad.push(`${id}: ${f} no longer restates it — drop it from PENDING`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

// Retired mechanisms an instruction file must not teach again. A line that also says it is retired/superseded is history.
const RETIRED = [
  [/3-min(?:ute)? tick/i, "the orchestrator tick (#3773, 2026-10-26: one bus Monitor + a 50–55 min net)"],
  [/\bSWEEP\b/, "the Merge Desk SWEEP hand-over (READY goes to the fleet's orchestrator)"],
  [/Merge Desk arms/i, "desk arming (the fleet's orchestrator merges by merge-gate)"],
  [/ready cap of/i, "the ready cap (retired 2026-10-16)"],
  [/APEX_A_INBOX/, "the old cross-account env names (APEX_A_RELAY_* since #3774)"],
];
const HISTORY = /retired|superseded|history|until 2026-10-2|was \d+ ?min|replaces the/i;
const RETIRED_PENDING = new Map([
]);

test("no instruction file teaches a retired mechanism", () => {
  const bad = [];
  for (const f of FILES) {
    text.get(f).split("\n").forEach((line, i) => {
      for (const [re, why] of RETIRED) {
        if (!re.test(line) || HISTORY.test(line)) continue;
        const pend = RETIRED_PENDING.get(f);
        if (pend && pend.source === re.source) continue;
        bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)} — ${why}`);
      }
    });
  }
  for (const [f, re] of RETIRED_PENDING)
    if (text.has(f) && !text.get(f).split("\n").some((l) => re.test(l) && !HISTORY.test(l)))
      bad.push(`${f} no longer carries ${re} — drop it from RETIRED_PENDING`);
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("the scan covers the surfaces it claims (a moved tree must not turn this into a no-op)", () => {
  for (const f of ["AGENTS.md", ".claude/rules/fleet-core.md", ".claude/skills/agent-fleet/SKILL.md",
    ".claude/skills/agent-fleet/references/orchestrator.md", ".claude/memory/MEMORY.md"])
    assert.ok(text.has(f), `${f} is not scanned`);
  assert.ok(FILES.length > 60, `only ${FILES.length} instruction files found`);
});
