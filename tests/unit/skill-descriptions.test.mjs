// skill-descriptions.test.mjs — the routing guard without a model call (2026-11-03,
// docs/plans/2026-11-03-agent-surface-reset.md §4.5; it replaces skill-hint.py, skill-smoke and the
// per-skill query files). A host routes on the DESCRIPTION, so this pins the four properties a
// description needs to route a phone-typed symptom: the "Use when" form, a "Not for … → x" clause
// whose targets exist, a vocabulary that overlaps its own tests/data/skill-routing/phone.json prompts
// more than any other description does, and `paths:` globs and `tools/…` commands that resolve.
//
// Run: node --test tests/unit/skill-descriptions.test.mjs   (< 1 s)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse as parseYAML } from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKILLS = path.join(ROOT, ".claude/skills");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const skills = new Map();
for (const d of fs.readdirSync(SKILLS, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const file = `.claude/skills/${d.name}/SKILL.md`;
  if (!fs.existsSync(path.join(ROOT, file))) continue;
  const text = read(file);
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, `${file}: missing frontmatter`);
  skills.set(d.name, { fm: parseYAML(m[1]), body: text.slice(m[0].length), file });
}
const agents = new Set(fs.readdirSync(path.join(ROOT, ".claude/agents"))
  .filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => f.replace(/\.md$/, "")));
const modelVisible = [...skills].filter(([, s]) => s.fm["disable-model-invocation"] !== true).map(([n]) => n);
const PHONE = JSON.parse(read("tests/data/skill-routing/phone.json")).skills;

// A crude, symmetric stemmer: the same word in a prompt and a description must land on the same stem, and that
// is all it needs to do ("screens"/"screen", "poking"/"poke", "launched"/"launch").
const STOP = new Set(["use", "when", "the", "a", "an", "or", "and", "of", "on", "my", "in", "is", "it", "its",
  "for", "not", "with", "at", "from", "be", "are", "to", "that", "this", "into", "by", "as", "any", "one", "no",
  "me", "do", "does", "did", "i", "you", "your", "up", "out", "off", "too", "way", "was", "wasn", "t", "s", "don",
  "doesn", "won", "every", "all", "which", "what", "who", "where", "why", "how", "please", "want", "need", "get",
  "let", "show", "have", "only", "again", "yet", "still", "after", "before", "through", "over", "vs"]);
const stem = (w) => {
  for (const suf of ["ing", "ed", "es", "s", "e"]) if (w.length > suf.length + 2 && w.endsWith(suf)) return w.slice(0, -suf.length);
  return w;
};
const words = (text) => new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w)).map(stem));
const overlap = (a, b) => [...a].filter((w) => b.has(w)).length;
const descWords = new Map([...skills].map(([n, s]) => [n, words(s.fm.description)]));

test("every model-visible skill has three short phone prompts and one near-miss that names a real neighbour", () => {
  const bad = [];
  for (const name of modelVisible) {
    const row = PHONE[name];
    if (!row) { bad.push(`${name}: no entry in tests/data/skill-routing/phone.json`); continue; }
    if (!Array.isArray(row.fire) || row.fire.length < 3) bad.push(`${name}: fire needs three prompts`);
    for (const q of row.fire || []) if (q.split(/\s+/).length > 8) bad.push(`${name}: "${q}" is over eight words (Bryce's register)`);
    if (!Array.isArray(row.near) || row.near.length < 1) bad.push(`${name}: near needs one prompt naming the neighbour`);
    for (const n of row.near || []) {
      if (!n.q || !n.expect) bad.push(`${name}: a near row needs q and expect`);
      else if (n.expect === name) bad.push(`${name}: near-miss expects itself`);
      else if (!skills.has(n.expect) && !agents.has(n.expect)) bad.push(`${name}: near expect "${n.expect}" is no skill or agent`);
    }
  }
  for (const name of Object.keys(PHONE)) if (!skills.has(name)) bad.push(`phone.json names ${name}, which is not a skill`);
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("every model-visible description starts 'Use when' and ends with a 'Not for … → x' clause whose targets exist", () => {
  const bad = [];
  for (const name of modelVisible) {
    const desc = skills.get(name).fm.description;
    if (!/^Use when\b/.test(desc)) bad.push(`${name}: description must start "Use when"`);
    if (!/\bNot (?:for:?\s*)?[^→]*→/.test(desc)) bad.push(`${name}: description needs a "Not for: X → skill" clause`);
    for (const m of desc.matchAll(/→\s*(?:agent\s+)?\**`?([a-z0-9][a-z0-9-]*)/g))
      if (!skills.has(m[1]) && !agents.has(m[1])) bad.push(`${name}: "→ ${m[1]}" names no skill or agent`);
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("a description shares at least two stemmed words with its own phone prompts, and no other description shares more", () => {
  const bad = [];
  for (const name of modelVisible) {
    const row = PHONE[name];
    if (!row) continue;
    const prompt = words((row.fire || []).join(" "));
    const own = overlap(descWords.get(name), prompt);
    if (own < 2) bad.push(`${name}: its description shares only ${own} word(s) with its phone prompts — the prompts are not routable from the description`);
    for (const other of modelVisible) {
      if (other === name) continue;
      const theirs = overlap(descWords.get(other), prompt);
      if (theirs > own) bad.push(`${name}: ${other}'s description shares ${theirs} words with ${name}'s prompts (own ${own}) — the wrong skill routes`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("every skill paths: glob matches a tracked file", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n");
  const bad = [];
  for (const [name, s] of skills) {
    const paths = s.fm.paths;
    if (paths === undefined) continue;
    assert.ok(Array.isArray(paths), `${name}: paths: must be a list`);
    for (const g of paths) {
      const re = new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "(?:.*/)?").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$");
      if (!tracked.some((f) => re.test(f))) bad.push(`${name}: paths: "${g}" matches no tracked file`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});

test("every tools/… command a SKILL.md names exists", () => {
  const bad = [];
  for (const [name, s] of skills) {
    for (const m of s.body.matchAll(/\b(?:node|python3|bash)\s+(?:\.\/)?(tools\/[\w./-]+?)(?=[\s`'")\]]|$)/g)) {
      const p = m[1].replace(/[.,;:]+$/, "");
      if (p.includes("<") || p.includes("*")) continue;
      if (!fs.existsSync(path.join(ROOT, p))) bad.push(`${name}: names ${p}, which does not exist`);
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});
