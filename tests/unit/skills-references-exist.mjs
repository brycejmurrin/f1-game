// skills-references-exist — shared checks for skill markdown path / npm-script refs.
// Loaded by skill-descriptions.test.mjs (already on toolingFast / docs-fast).
// A dedicated skills-references-exist.test.mjs needs a tests/groups.json row; that
// file is owned by open PRs and was out of scope for the skills-audit lane.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ON_DEMAND_PATHS, BUILT_PATHS } from "../../tools/lib/generated-paths.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SKILLS = path.join(ROOT, ".claude/skills");

export const SKIP_DIR_PREFIXES = [
  ".claude/skills/challenge/",
  ".claude/skills/dispatcher/",
  ".claude/skills/handoff/",
  ".claude/skills/steward/",
  ".claude/skills/survey-ui-matrix/",
];
export const SKIP_FILES = new Set([
  ".claude/skills/garage-parts-livery/references/before-pack.md",
  ".claude/skills/renderer-debug/references/phone-reports.md",
  ".claude/skills/survey-track/references/publishing.md",
]);

const PATH_ALLOWLIST = [
  /^tools\/\.\.\./,
  /^tests\/\.\.\./,
  /^js\/\.\.\./,
  /^docs\/\.\.\./,
  /^path\/to\//,
  /^foo\//,
  /^bar\//,
  /^YOUR_/,
  /^example\//i,
  /[<*{]/
];
const NEGATED = /\b(no|not|never|deleted|removed|retired|gone|was|former(ly)?|do not|don't|forbidden)\b/i;
const PATH_RE =
  /(?<![\w./-])((?:tools|tests|js|docs)\/[\w./-]+\.(?:mjs|cjs|js|json|sh|py|md|html|css|d\.ts))(?![\w])/g;
const NPM_RE = /\bnpm run (?:--silent |-s )?([a-z][\w:.-]*[\w])/g;

function walkMd(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function relOf(abs) {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

function skipped(rel) {
  if (SKIP_FILES.has(rel)) return true;
  return SKIP_DIR_PREFIXES.some((p) => rel === p.slice(0, -1) || rel.startsWith(p));
}

function pathAllowed(p) {
  if (ON_DEMAND_PATHS.includes(p) || BUILT_PATHS.includes(p)) return true;
  return PATH_ALLOWLIST.some((re) => re.test(p));
}

export function collectSkillReferenceFailures(scripts) {
  const bad = [];
  for (const abs of walkMd(SKILLS)) {
    const rel = relOf(abs);
    if (skipped(rel)) continue;
    const text = fs.readFileSync(abs, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const at = `${rel}:${i + 1}`;
      for (const m of line.matchAll(PATH_RE)) {
        const p = m[1];
        if (pathAllowed(p) || NEGATED.test(line)) continue;
        if (!fs.existsSync(path.join(ROOT, p))) bad.push(`${at}: missing path \`${p}\``);
      }
      for (const m of line.matchAll(NPM_RE)) {
        if (NEGATED.test(line)) continue;
        if (!scripts.has(m[1])) bad.push(`${at}: npm script "${m[1]}" is not in package.json`);
      }
    }
  }
  return bad;
}

export function assertNotOwnedSetPresent() {
  const missing = [];
  for (const p of SKIP_FILES) {
    if (!fs.existsSync(path.join(ROOT, p))) missing.push(p);
  }
  for (const prefix of SKIP_DIR_PREFIXES) {
    const dir = prefix.slice(0, -1);
    if (!fs.existsSync(path.join(ROOT, dir))) missing.push(dir);
  }
  return missing;
}
