#!/usr/bin/env node
/**
 * knowledge-gc.mjs — retention for docs/notes: stale notes, overdue re-measures, the notes index.
 * @doc docs/notes retention: lists uncited notes; `--apply` archives them and repoints links; `--index`; `--move`.
 * @skill slim-bloat
 *
 * The rule (docs/plans/2026-11-03-agent-surface-reset.md §4.9, Bryce's grant D-001):
 * a note under docs/notes/ earns its place by being CITED. A note no live file
 * names within --days (21) of its date moves to docs/archive/notes/. Hunt,
 * survey, design-pass and audit notes (`HUNT-`, `UI-HUNT-`, `PERF-HUNT-`,
 * `DESIGN-PASS-`, `*-AUDIT-`) are refused at any age unless cited. A note is
 * ≤ 40 KB unless tests/data/notes-size-allow.json names it; the allow-lists
 * only shrink (tests/unit/knowledge-retention.test.mjs refuses an entry that
 * is no longer needed). `Re-measure-by: YYYY-MM-DD` past due is reported.
 *
 * CITED means the note's filename appears in a tracked text file outside the
 * notes tree: AGENTS.md, README.md, `.claude/**`, `docs/*.md`, `docs/plans/**`
 * and every other live docs/ directory, `tools/**`, `tests/**`, `.github/**`,
 * `js/**`, `css/**`. docs/NOTES-INDEX.md, other notes, docs/archive/** and
 * docs/research/** do NOT count (an index or a sibling ledger is not a reader).
 * Plans and source comments count because docs-integrity.test.mjs forbids a
 * live doc or a source comment pointing at a path that moved; a citer there
 * keeps the note live instead of breaking the build.
 *
 * DATED by the filename's YYYY-MM-DD, else by the note's last commit (`git
 * log -1 --format=%cs`; the clone is shallow, so first-commit dates are not
 * available). Only top-level `docs/notes/*.md` files are subject to retention;
 * a note's evidence directory (docs/notes/<name>/) travels with nothing and
 * is left where it is. A note carrying a `Supersedes:` / `Superseded by:` line
 * is pinned: that pair is the one-live-answer mechanism docs-integrity holds.
 *
 * --apply moves each stale note with `git mv` and repoints every relative
 * Markdown link and bare `docs/notes/<name>.md` mention in tracked text files
 * (the moved note's own links are re-based on its new directory). --move does
 * the same for any docs/ path (a plan, a survey): docs/<rel> → docs/archive/<rel>.
 *
 * --index writes the notes table to artifacts/NOTES-TABLE.md (gitignored, never
 * committed: a committed table sorted newest-first with a live count made every
 * note-adding PR conflict with every other, and a merge that skipped the regen
 * left the tip red; issue #5347). One row per live note with its `Kind:`
 * (unknown when absent), `Re-measure-by:` and a one-line summary — the note's own
 * `Summary:` header line when it has one, else its H1. docs/NOTES-INDEX.md is
 * hand prose only and must not carry a generated block.
 *
 *   node tools/docs/knowledge-gc.mjs                 # list; exit 1 when a stale note is not allow-listed
 *   node tools/docs/knowledge-gc.mjs --apply         # archive the stale set, repoint links
 *   node tools/docs/knowledge-gc.mjs --index         # write artifacts/NOTES-TABLE.md
 *   node tools/docs/knowledge-gc.mjs --move docs/plans/<name>.md docs/surveys
 *   APEX_TODAY=2026-11-03 node tools/docs/knowledge-gc.mjs --json
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DAYS = 21;
export const SIZE_CAP = 40 * 1024;
export const REFUSED_PREFIX = /^(?:HUNT-|UI-HUNT-|PERF-HUNT-|DESIGN-PASS-|.*-AUDIT-)/;
export const KIND_REQUIRED_FROM = "2026-11-03";
export const SIZE_ALLOW = "tests/data/notes-size-allow.json";
export const UNCITED_ALLOW = "tests/data/notes-uncited-allow.json";
export const INDEX = "docs/NOTES-INDEX.md";
export const TABLE = "artifacts/NOTES-TABLE.md";
const TEXT_EXT = /\.(?:md|mdc|mjs|cjs|js|ts|sh|py|json|ya?ml|html|css|txt|toml|patch)$/;
// The allow-lists name notes without reading them, so they are not citers either.
const NOT_A_CITER = /^(?:docs\/notes\/|docs\/archive\/|docs\/research\/|docs\/NOTES-INDEX\.md$|tests\/data\/notes-(?:size|uncited)-allow\.json$|artifacts\/|scratch\/|node_modules\/)/;

const DAY = 864e5;
const git = (args, opts = {}) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", ...opts });
export const tracked = () => git(["ls-files", "-z"]).split("\0").filter(Boolean);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const isoToday = () => process.env.APEX_TODAY || new Date().toISOString().slice(0, 10);
const readList = (rel) => fs.existsSync(path.join(ROOT, rel)) ? JSON.parse(read(rel)) : [];

/**
 * The filename's date, else the OLDEST commit date the clone holds for the note
 * (a shallow clone bottoms out at its boundary commit, which only makes an old
 * note look younger, never older). The last commit would re-date a note on every
 * link repoint. On a shallow clone, batched `git log -- docs/notes` re-dates every
 * undated file at the boundary commit (a Nov 4 boundary read the whole grandfathered
 * tree as newer than KIND_REQUIRED_FROM), so git dates are ignored there; a tracked
 * note with no filename date and no full-clone log hit is dated 1970-01-01 so Kind
 * enforcement does not treat it as "new". Only an untracked path is dated today.
 * (Re-landed from 8897fdf, which the Nov 6 rollback removed.)
 */
export function dateOf(rel) {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(path.basename(rel));
  if (m) return m[1];
  let fromGit;
  try {
    if (git(["rev-parse", "--is-shallow-repository"], { stdio: "pipe" }).trim() !== "true") {
      fromGit = gitDates().get(rel);
    }
  } catch { /* no git */ }
  if (fromGit) return fromGit;
  try {
    git(["ls-files", "--error-unmatch", "--", rel], { stdio: "pipe" });
    return "1970-01-01";
  } catch { /* untracked: a note being written now */ }
  return isoToday();
}

/** True when the note's date comes from its filename (the only date the INDEX shows: a git date differs between a
 *  full clone, this box's shallow clone and a CI checkout, so an index that printed it never matched byte-for-byte). */
export const datedByName = (rel) => /(\d{4}-\d{2}-\d{2})/.exec(path.basename(rel)) !== null;

let gitDateCache = null;
/** Oldest commit date the clone holds per docs/notes file, from ONE `git log` (a per-note `git log --follow` took
 *  455 s on a CI runner). */
function gitDates() {
  if (gitDateCache) return gitDateCache;
  gitDateCache = new Map();
  try {
    let date = null;
    for (const line of git(["log", "--format=%x00%cs", "--name-only", "--", "docs/notes"]).split("\n")) {
      if (line.startsWith("\0")) { date = line.slice(1).trim(); continue; }
      const f = line.trim();
      if (f && date) gitDateCache.set(f, date);   // log is newest-first, so the last write per file is its oldest commit
    }
  } catch { /* no git: every undated note is dated today */ }
  return gitDateCache;
}

/** `Kind:`, `Re-measure-by:` and `Summary:` from a note's first 20 lines; the H1; the Supersedes pin. */
export function header(text) {
  const head = text.split("\n").slice(0, 20).join("\n");
  const kind = /^(?:\*\*)?Kind:(?:\*\*)?\s*([a-z][a-z-]*)/im.exec(head)?.[1]?.toLowerCase() || null;
  const remeasure = /Re-measure-by:(?:\*\*)?\s*(\d{4}-\d{2}-\d{2})/i.exec(head)?.[1] || null;
  const summary = /^Summary:\s*(.+)$/m.exec(head)?.[1]?.trim() || null;
  const h1 = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() || null;
  const pinned = /^Supersed(?:es|ed by):/m.test(text);
  const superseded = /^Superseded by:/m.test(text);
  return { kind, remeasure, summary, h1, pinned, superseded };
}

/** Every tracked text file whose mention of a note keeps it live, with its contents. */
export function citerCorpus(files = tracked()) {
  return files.filter((f) => TEXT_EXT.test(f) && !NOT_A_CITER.test(f))
    .map((f) => { try { return read(f); } catch { return ""; } }).join("\n");
}

/**
 * Pure scan: one row per top-level note plus the verdict lists. `today` and
 * `days` are injectable so a test can pin the clock.
 */
export function scan({ today = isoToday(), days = DAYS, files = tracked(), corpus = citerCorpus(files),
  sizeAllow = readList(SIZE_ALLOW), uncitedAllow = readList(UNCITED_ALLOW) } = {}) {
  const t0 = Date.parse(today);
  const sizeOk = new Set(sizeAllow), uncitedOk = new Set(uncitedAllow);
  const notes = files.filter((f) => /^docs\/notes\/[^/]+\.md$/.test(f)).sort().map((file) => {
    const text = read(file);
    const base = path.basename(file);
    const h = header(text);
    const date = dateOf(file);
    return { file, base, date, dated: datedByName(file), age: Math.floor((t0 - Date.parse(date)) / DAY),
      bytes: Buffer.byteLength(text, "utf8"), cited: corpus.includes(base), ...h };
  });
  const uncited = notes.filter((n) => !n.cited && !n.pinned);
  const stale = uncited.filter((n) => n.age > days && !uncitedOk.has(n.file));
  const refused = uncited.filter((n) => REFUSED_PREFIX.test(n.base) && !uncitedOk.has(n.file));
  const oversize = notes.filter((n) => n.bytes > SIZE_CAP && !sizeOk.has(n.file));
  const overdue = notes.filter((n) => n.remeasure && Date.parse(n.remeasure) < t0);
  const missingKind = notes.filter((n) => !n.kind && n.date >= KIND_REQUIRED_FROM);
  const byFile = new Map(notes.map((n) => [n.file, n]));
  const allowStale = {
    size: sizeAllow.filter((f) => !byFile.has(f) || byFile.get(f).bytes <= SIZE_CAP),
    uncited: uncitedAllow.filter((f) => !byFile.has(f) || byFile.get(f).cited || byFile.get(f).pinned),
  };
  return { today, days, notes, uncited, stale, refused, oversize, overdue, missingKind, allowStale };
}

// ---------------------------------------------------------------------------
// Moves and link repointing

const posix = (p) => p.split(path.sep).join("/");
const archiveTarget = (rel) => rel.replace(/^docs\//, "docs/archive/");

/** Generated outputs are never hand-edited (AGENTS.md rule 11): `tools/gen/targets.mjs` plus the shell and changelog. */
function generatedFiles() {
  const out = new Set(["CHANGELOG.md", "index.html", "sw.js", "version.json", "package.json", "package-lock.json"]);
  try {
    for (const f of execFileSync(process.execPath, ["tools/gen/targets.mjs"], { cwd: ROOT, encoding: "utf8" }).split("\n")) if (f.trim()) out.add(f.trim());
  } catch { /* no generator list: the static set stands */ }
  return out;
}

/** git mv each docs/ path (file or directory) under docs/archive/, then repoint links. Returns the move map. */
export function moveToArchive(rels, { dry = false, log = console.log } = {}) {
  const files = tracked();
  const moves = new Map();
  for (const rel0 of rels) {
    const rel = posix(path.normalize(rel0)).replace(/\/$/, "");
    if (!rel.startsWith("docs/") || rel.startsWith("docs/archive/")) throw new Error(`not a live docs/ path: ${rel}`);
    const members = files.filter((f) => f === rel || f.startsWith(rel + "/"));
    if (!members.length) throw new Error(`not tracked: ${rel}`);
    for (const f of members) moves.set(f, archiveTarget(f));
  }
  for (const [from, to] of moves) {
    log(`archive ${from} -> ${to}`);
    if (dry) continue;
    fs.mkdirSync(path.join(ROOT, path.dirname(to)), { recursive: true });
    git(["mv", from, to]);
  }
  if (dry) return moves;
  // git mv leaves the emptied source directories behind; docs-integrity indexes directories, so drop them.
  for (const from of moves.keys()) {
    for (let d = path.posix.dirname(from); d.startsWith("docs/") && d !== "docs"; d = path.posix.dirname(d)) {
      try { fs.rmdirSync(path.join(ROOT, d)); } catch { break; }
    }
  }
  repointLinks(moves, { log });
  return moves;
}

/**
 * Rewrite relative Markdown links and bare path mentions for a set of moves
 * (old repo path → new repo path) across every tracked text file. A moved
 * file's own links are re-based on its new directory.
 */
export function repointLinks(moves, { files = tracked(), log = () => {} } = {}) {
  const touched = [];
  const movedSet = new Set(moves.keys());
  const exists = (rel) => movedSet.has(rel) || fs.existsSync(path.join(ROOT, rel));
  const generated = generatedFiles();
  const inverse = new Map([...moves].map(([from, to]) => [to, from]));
  /** A link to a DIRECTORY whose files moved: map it to the new prefix. */
  const dirTarget = (abs) => {
    for (const [from, to] of moves) {
      if (!from.startsWith(abs + "/")) continue;
      const tail = from.slice(abs.length);
      return to.endsWith(tail) ? to.slice(0, to.length - tail.length) : null;
    }
    return null;
  };
  for (const file of files) {
    if (!TEXT_EXT.test(file) || /^node_modules\//.test(file) || generated.has(file)) continue;
    // `files` comes from git ls-files AFTER the moves, so a moved file is listed at its NEW path;
    // its links were written relative to the OLD one.
    const cur = moves.get(file) || file;            // where the file lives now
    const was = inverse.get(cur) || null;           // where it lived when its links were written
    let text; try { text = read(cur); } catch { continue; }
    let out = text;
    if (/\.(?:md|mdc)$/.test(file)) {
      const oldDir = path.posix.dirname(was || cur), newDir = path.posix.dirname(cur);
      out = out.replace(/\]\(([^)\s#:]+)(#[^)]*)?\)/g, (m, href, hash = "") => {
        if (/^(?:https?:)?\/\//.test(href) || href.startsWith("/")) return m;
        const abs = path.posix.normalize(path.posix.join(oldDir, href));
        const target = moves.get(abs) || dirTarget(abs) || (was && exists(abs) ? abs : null);
        if (!target) return m;
        let rel = path.posix.relative(newDir, target);
        if (!rel.startsWith(".")) rel = rel || ".";
        return `](${rel}${hash})`;
      });
    }
    for (const [from, to] of moves) {
      if (!/\.md$/.test(from)) continue;
      out = out.split(from).join(to);
    }
    if (liveDocNoArchive(cur)) out = demoteArchiveLinks(out, path.posix.dirname(cur));
    if (out !== text) { fs.writeFileSync(path.join(ROOT, cur), out); touched.push(cur); log(`repoint ${cur}`); }
  }
  return touched;
}

/**
 * docs-integrity.test.mjs forbids a LIVE doc (docs/** minus notes/, archive/,
 * research/, tracks/, superpowers/, README and NOTES-INDEX) from pointing a
 * reader at docs/archive/. Such a doc keeps the name as text, not a link.
 */
export const liveDocNoArchive = (rel) => /^docs\//.test(rel)
  && !/^docs\/(?:notes|archive|research|tracks|superpowers)\//.test(rel)
  && rel !== "docs/README.md" && rel !== "docs/NOTES-INDEX.md";

export function demoteArchiveLinks(text, dir) {
  return text
    .replace(/\[([^\]]*)\]\(([^)\s#:]+)(?:#[^)]*)?\)/g, (m, label, href) => {
      if (/^(?:https?:)?\/\//.test(href)) return m;
      const abs = path.posix.normalize(path.posix.join(dir, href));
      if (!abs.startsWith("docs/archive/")) return m;
      const base = path.posix.basename(abs);
      const clean = label.replace(/`/g, "");
      return clean === base || clean === base.replace(/\.md$/, "") ? `\`${base}\` (archived)` : `${label} (\`${base}\`, archived)`;
    })
    .replace(/docs\/archive\/[A-Za-z0-9_./-]+\.md/g, (p) => `${path.posix.basename(p)} (archived)`);
}

// ---------------------------------------------------------------------------
// NOTES-TABLE (built on demand, never committed)

const OPEN = "<!-- gen:notes -->";
const cell = (s) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

/** The notes table as Markdown, links relative to artifacts/. Pure over scan() rows. */
export function renderIndexBlock(notes) {
  // Dated notes newest first, then the undated ones by name: the table shows only filename dates (see datedByName).
  const key = (n) => (n.dated ? n.date : "0000-00-00");
  const rows = [...notes].sort((a, b) => key(b).localeCompare(key(a)) || a.base.localeCompare(b.base)).map((n) => {
    const summary = n.summary ? cell(n.summary) : cell(n.h1 || n.base).slice(0, 200);
    const flags = [n.cited ? "" : "uncited", n.pinned ? "pinned" : "", n.superseded ? "superseded" : ""].filter(Boolean).join(", ");
    return `| [${n.base}](../docs/notes/${n.base}) | ${n.kind || "unknown"} | ${n.remeasure || "—"} | ${n.dated ? n.date : "—"}${flags ? ` (${flags})` : ""} | ${summary} |`;
  });
  return [`# docs/notes — ${notes.length} live notes`, "",
    `Built by \`node tools/docs/knowledge-gc.mjs --index\` from each note's \`Kind:\` / \`Re-measure-by:\` / \`Summary:\` header lines (summary falls back to the H1; \`unknown\` = no \`Kind:\` line). Gitignored and never committed (issue #5347): edit the note, then rebuild. "uncited" marks a note no live file names (${UNCITED_ALLOW} holds the grandfathered backlog, shrink-only).`,
    "", "| Note | Kind | Re-measure by | Dated | What it records |", "|---|---|---|---|---|", ...rows, ""].join("\n");
}

/** True when the hand-written index still carries a generated block (the committed-table shape #5347 retired). */
export const indexHasGeneratedBlock = (indexText) => indexText.includes(OPEN);

export function writeIndex() {
  fs.mkdirSync(path.join(ROOT, path.dirname(TABLE)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, TABLE), renderIndexBlock(scan().notes));
  return { file: TABLE };
}

// ---------------------------------------------------------------------------
// CLI

function main(argv) {
  const has = (f) => argv.includes(f);
  const num = (k, d) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.slice(k.length + 3)) : d; };
  if (has("--move")) {
    const rels = argv.slice(argv.indexOf("--move") + 1).filter((a) => !a.startsWith("--"));
    const moves = moveToArchive(rels, { dry: has("--dry-run") });
    console.log(`moved ${moves.size} file(s)`);
    return 0;
  }
  if (has("--index")) {
    console.log(`${writeIndex().file}: written`);
    return 0;
  }
  const r = scan({ days: num("days", DAYS) });
  if (has("--json")) { console.log(JSON.stringify(r, null, 2)); return r.stale.length || r.refused.length ? 1 : 0; }
  const list = (label, xs, f = (n) => `${n.file} (${n.date}, ${n.age} d${n.kind ? `, ${n.kind}` : ""})`) => {
    if (!xs.length) return;
    console.log(`${label} (${xs.length}):`);
    for (const x of xs) console.log(`  ${f(x)}`);
  };
  const set = new Map([...r.stale, ...r.refused].map((n) => [n.file, n]));
  list(has("--apply") ? "archive" : "stale — uncited past the window; --apply archives", [...set.values()]);
  list("re-measure — Re-measure-by is past due; re-measure or archive", r.overdue, (n) => `${n.file} (${n.remeasure})`);
  list("oversize — over 40 KB and not in tests/data/notes-size-allow.json", r.oversize, (n) => `${n.file} (${(n.bytes / 1024).toFixed(0)} KB)`);
  list("no Kind: line (required for notes dated from 2026-11-03)", r.missingKind, (n) => n.file);
  list("allow-list entries no longer needed — drop them (shrink-only)", [...r.allowStale.size, ...r.allowStale.uncited], (f) => f);
  const grandfathered = r.uncited.length - set.size;
  console.log(`${r.notes.length} notes · ${r.uncited.length} uncited (${grandfathered} allow-listed or inside the ${r.days}-day window) · today ${r.today}`);
  if (has("--apply")) {
    if (set.size) moveToArchive([...set.keys()]);
    console.log(`archived ${set.size}`);
    return 0;
  }
  return set.size ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`knowledge-gc: ${e.message}`); process.exitCode = 2; }
}
