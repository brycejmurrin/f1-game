// skill-descriptions.test.mjs — the routing guard without a model call (2026-11-03,
// docs/plans/2026-11-03-agent-surface-reset.md §4.5; it replaces skill-hint.py, skill-smoke and the
// per-skill query files). A host routes on the DESCRIPTION, so this pins the four properties a
// description needs to route a phone-typed symptom: the "Use when" form, a "Not for … → x" clause
// whose targets exist, a vocabulary that overlaps its own tests/data/skill-routing/phone.json prompts
// more than any other description does, no `paths:` gate, and `tools/…` commands that resolve.
//
// Run: node --test tests/unit/skill-descriptions.test.mjs   (< 1 s)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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

test("no skill carries paths: (a path-gated skill is not offered in a fresh session, so routes to it break)", () => {
  // Claude Code loads a `paths:` skill "only when working with files matching the patterns"
  // (code.claude.com/docs/en/skills); the eight that carried it were missing from a fresh session's skill list
  // on 2026-11-10 while 21 other skills routed to them. File scoping belongs in .claude/rules/.
  const bad = [...skills].filter(([, s]) => s.fm.paths !== undefined).map(([n]) => `${n}: drop paths: from its frontmatter`);
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

// ── Every name the agent surface cites resolves in the tree (2026-11-10, audit item W16(b)) ────────────────
// A skill, card or workflow may NAME an agent, a skill, an npm script, a tool file or a doc section; it must never
// name one that is not there. Cheap static resolution only: the truth of the surrounding prose is surface-reviewer's.
const SURFACE_ROOTS = [".claude/skills", ".claude/agents", ".claude/workflows"];
const surfaceFiles = [];
for (const r of SURFACE_ROOTS) {
  (function walk(rel) {
    for (const d of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const p = `${rel}/${d.name}`;
      if (d.isDirectory()) walk(p);
      else if (/\.(md|js|mjs)$/.test(d.name)) surfaceFiles.push(p);
    }
  })(r);
}
const BUILTIN_AGENTS = new Set(["Explore", "Plan", "general-purpose", "claude-code-guide", "statusline-setup", "fork", "claude"]);
const SCRIPTS = new Set(Object.keys(JSON.parse(read("package.json")).scripts || {}));
const headingsOf = (() => {
  const cache = new Map();
  return (file) => {
    if (!cache.has(file)) {
      const hs = read(file).split("\n").filter((l) => /^#{1,6}\s/.test(l)).map((l) => l.replace(/^#+\s*/, "").replace(/[`*]/g, "").trim().toLowerCase());
      cache.set(file, hs);
    }
    return cache.get(file);
  };
})();
const slug = (h) => h.toLowerCase().replace(/[`*]/g, "").replace(/[^\w\- ]+/g, "").trim().replace(/\s/g, "-");

test("every agent, skill, npm script, tool path and doc anchor the agent surface names resolves", () => {
  const bad = [];
  // A line that names a thing to say it is gone ("no `x` exists", "never the deleted y") is not a route to it.
  const NEGATED = /\b(no|not|never|deleted|removed|retired|gone|was|former(ly)?)\b/i;
  for (const file of surfaceFiles) {
    const text = read(file);
    const at = (i) => `${file}:${text.slice(0, i).split("\n").length}`;
    const lineOf = (i) => text.slice(text.lastIndexOf("\n", i) + 1, (text.indexOf("\n", i) + 1 || text.length + 1) - 1);
    // agents: `name` agent / agent `name` / subagent `name` / agentType: 'name'
    for (const m of text.matchAll(/(?:\b(?:sub)?agent(?:Type)?\s*:?\s*[`'"])([A-Za-z][\w-]+)[`'"]|`([A-Za-z][\w-]+)`\s+(?:sub)?agent\b/g)) {
      const n = m[1] || m[2];
      if (!agents.has(n) && !BUILTIN_AGENTS.has(n)) bad.push(`${at(m.index)}: agent \`${n}\` is not .claude/agents/${n}.md or a builtin`);
    }
    // skills: skill `name` / `name` skill
    for (const m of text.matchAll(/\bskills?\s+`([a-z][\w-]+)`|`([a-z][\w-]+)`\s+skill\b/g)) {
      const n = m[1] || m[2];
      if (!skills.has(n)) bad.push(`${at(m.index)}: skill \`${n}\` is not .claude/skills/${n}/`);
    }
    // npm scripts
    for (const m of text.matchAll(/\bnpm run (?:--silent |-s )?([a-z][\w:.-]*[\w])/g)) {
      if (!SCRIPTS.has(m[1])) bad.push(`${at(m.index)}: npm script "${m[1]}" is not in package.json`);
    }
    // tool paths (a placeholder or glob is allowed)
    for (const m of text.matchAll(/(?<![\w./-])(tools\/[\w./-]+\.(?:json|mjs|cjs|js|sh|py))(?![\w])/g)) {
      if (/[<*{]/.test(m[1])) continue;
      if (!fs.existsSync(path.join(ROOT, m[1])) && !NEGATED.test(lineOf(m.index))) bad.push(`${at(m.index)}: ${m[1]} does not exist`);
    }
    // doc anchors: a docs file followed by §Heading or #slug
    for (const m of text.matchAll(/(?<![\w./-])((?:docs\/[\w./-]+|AGENTS|README)\.md)(?:\s*§\s*([^\s,;:)`|\]][^,;:)`|\]\n]*?)(?=[,;:)`|\]\n]|\s[—–-]\s|\.\s|$)|#([\w-]+))?/g)) {
      const doc = m[1];
      if (!fs.existsSync(path.join(ROOT, doc))) { if (!NEGATED.test(lineOf(m.index))) bad.push(`${at(m.index)}: ${doc} does not exist`); continue; }
      if (m[3]) {
        if (!headingsOf(doc).some((h) => slug(h) === m[3])) bad.push(`${at(m.index)}: ${doc}#${m[3]} has no such heading`);
      } else if (m[2]) {
        const want = m[2].trim().replace(/[*"“”]/g, "").toLowerCase();
        if (/^\d/.test(want)) continue; // "§5 step 2" style numbers: section numbers drift by design of the doc
        // "§Verification 10" names rule 10 inside §Verification: accept the longest leading word run that is a heading.
        const ws = want.split(/\s+/);
        const hit = [3, 2, 1].some((k) => ws.length >= k && headingsOf(doc).some((h) => h.startsWith(ws.slice(0, k).join(" ")) || (k === ws.length && h.includes(want))));
        if (!hit) bad.push(`${at(m.index)}: ${doc} §${m[2].trim()} has no such heading`);
      }
    }
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});
