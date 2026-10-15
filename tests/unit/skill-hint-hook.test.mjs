// skill-hint-hook.test.mjs — the UserPromptSubmit skill hint (2026-10-14).
//
// .claude/hooks/skill-hint.py names the skills a prompt's words match, so the
// model loads one before it runs a command (the routing eval's `none:Bash`
// loss). It is advisory: it must never block, never print on a slash command
// or garbage stdin, and APEX_SKILL_HINT=off|generic switches it for A/B runs.
// The floor below scores it offline against every routing query file: a
// description edit that leaves the hint pointing elsewhere fails here first.
//
// Run: node --test tests/unit/skill-hint-hook.test.mjs   (npm run test:tooling-fast)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = path.join(ROOT, ".claude/hooks/skill-hint.py");
const QUERIES = path.join(ROOT, "tests/data/skill-routing/queries");

function hint(stdin, mode) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: ROOT };
  if (mode) env.APEX_SKILL_HINT = mode; else delete env.APEX_SKILL_HINT;
  const r = spawnSync("python3", [HOOK], { input: stdin, env, encoding: "utf8" });
  return { code: r.status, out: r.stdout.trim() };
}
const ask = (prompt, mode) => hint(JSON.stringify({ prompt, hook_event_name: "UserPromptSubmit" }), mode);

test("a race-weekend prompt names race-weekend first", () => {
  const r = ask("Soft tyres last the whole race; check how tyre-model.js scales stint life and the pit lane loss");
  assert.equal(r.code, 0);
  assert.match(r.out, /^Skill check: this prompt matches the description of `race-weekend`/);
});

test("it never blocks and stays silent on slash commands, empty or garbage stdin", () => {
  for (const [stdin, label] of [[JSON.stringify({ prompt: "/loop 5m /foo" }), "slash"],
    [JSON.stringify({ prompt: "  " }), "empty"], ["not json{", "garbage"], ["", "no stdin"]]) {
    const r = hint(stdin);
    assert.equal(r.code, 0, label);
    assert.equal(r.out, "", label);
  }
});

test("APEX_SKILL_HINT=off prints nothing; generic prints only the rule", () => {
  const p = "the pit stop at spa takes 45 s, is pit-lane.js wrong?";
  assert.equal(ask(p, "off").out, "");
  const g = ask(p, "generic").out;
  assert.match(g, /^In this repo a task that matches a skill starts with the Skill tool/);
  assert.doesNotMatch(g, /Skill check/);
});

test("settings.json wires it under UserPromptSubmit with a short timeout", () => {
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
  const cmds = (s.hooks.UserPromptSubmit || []).flatMap((m) => m.hooks);
  const h = cmds.find((c) => /skill-hint\.py/.test(c.command));
  assert.ok(h, "UserPromptSubmit must run skill-hint.py");
  assert.ok(h.timeout <= 5, "an advisory per-prompt hook stays under 5 s");
});

test("offline floor: the hint's top two hold the expected skill for >=85% of routing queries", () => {
  const rows = fs.readdirSync(QUERIES).filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(QUERIES, f), "utf8")))
    .filter((q) => q.expect && q.expect !== "none");
  // one python process scores every query (spawning per query costs ~20 s)
  const code = `
import json, sys, importlib.util
spec = importlib.util.spec_from_file_location("h", ${JSON.stringify(HOOK)})
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
rows = json.load(sys.stdin)
print(sum(1 for q in rows if q["expect"] in h.matches(q["query"], ${JSON.stringify(ROOT)})))`;
  const r = spawnSync("python3", ["-c", code], { input: JSON.stringify(rows), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const hit = Number(r.stdout.trim());
  assert.ok(hit / rows.length >= 0.85, `skill-hint top-2 hit ${hit}/${rows.length} — below the 85% floor`);
});
