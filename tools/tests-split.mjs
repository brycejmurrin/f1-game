#!/usr/bin/env node
// tests-split — the tests/ split, DONE and shipped; kept for provenance and
// as the move-map source for cross-file-paths. The layout below is the
// CURRENT tree, not a pending plan:
//
//     tests/*.spec.js            -> tests/specs/
//     tests/*.test.{mjs,cjs}     -> tests/unit/
//     the 7 shared helpers       -> tests/helpers/
//     tests/physics-baseline.json-> tests/data/
//
// Rewrites are derived from the tree via the move map (see cross-file-paths.mjs).
// Dated audit records and docs/archive/research/raw/ are never rewritten — see
// docs/archive/research/AUDIT-SYNTHESIS-2026-08.md §R2 for the lockstep list.
//
// Usage:
//   node tools/tests-split.mjs             # plan (default) — changes nothing
//   node tools/tests-split.mjs --json
//   node tools/tests-split.mjs --apply     # git mv + rewrite, then run the guards
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { referencesIn } from "./cross-file-paths.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTS = path.join(ROOT, "tests");

// Directories under tests/ that stay exactly where they are.
const STAYS = new Set(["data", "manual"]);

// Takes the root explicitly. It did not, and every check against the real tree
// passed anyway while a scratch-tree run silently found zero references — the
// hazard of a tool whose only exercise is the repo it lives in.
const rel = (root, abs) => path.relative(root, abs).split(path.sep).join("/");

// ─── the move map ─────────────────────────────────────────────────────────────

// Derived from what is on disk, never from a list. A helper is simply a
// top-level .js in tests/ that is not a spec — so a new one added tomorrow is
// carried without editing this file.
export function moveMap(root = ROOT) {
  const testsDir = path.join(root, "tests");
  const map = new Map();
  if (!fs.existsSync(testsDir)) return map;
  for (const e of fs.readdirSync(testsDir, { withFileTypes: true })) {
    const from = `tests/${e.name}`;
    if (e.isDirectory()) {
      if (STAYS.has(e.name)) continue;
      // Playwright resolves snapshot dirs relative to the SPEC, so a snapshot
      // directory follows its spec. These are the repo's only golden baselines;
      // a missed move reads as "baseline missing", which --update-snapshots
      // would then silently re-bless.
      if (e.name.endsWith(".spec.js-snapshots")) map.set(from, `tests/specs/${e.name}`);
      continue;
    }
    if (e.name.endsWith(".spec.js")) map.set(from, `tests/specs/${e.name}`);
    else if (/\.test\.(mjs|cjs)$/.test(e.name)) map.set(from, `tests/unit/${e.name}`);
    else if (e.name.endsWith(".js")) map.set(from, `tests/helpers/${e.name}`);
    // Fixture DATA belongs with the other fixture data, not loose in tests/.
    else if (e.name === "physics-baseline.json") map.set(from, `tests/data/${e.name}`);
  }
  return map;
}

// ─── derived import rewrites ──────────────────────────────────────────────────

const SCAN_DIRS = ["tests", "tools"];
const EXTS = new Set([".js", ".mjs", ".cjs"]);
const SKIP_DIR = /(^|\/)(node_modules|galleries|worktrees)(\/|$)/;

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.test(p)) yield* walk(p); }
    else if (EXTS.has(path.extname(e.name))) yield p;
  }
}

// require() may omit an extension; try the same candidate ladder the existence
// check uses, so a rewrite is computed against the file that actually resolves.
function resolveTarget(fromAbs, spec) {
  const base = path.resolve(path.dirname(fromAbs), spec);
  for (const c of [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`,
                   path.join(base, "index.js"), path.join(base, "index.cjs")]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function specifierFrom(newFileRel, newTargetRel) {
  let s = path.posix.relative(path.posix.dirname(newFileRel), newTargetRel);
  if (!s.startsWith(".")) s = `./${s}`;
  return s;
}

export function importRewrites(root = ROOT, map = moveMap(root)) {
  const out = [];
  for (const dir of SCAN_DIRS) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const fileAbs of walk(abs)) {
      const fileRel = rel(root, fileAbs);
      const newFileRel = map.get(fileRel) || fileRel;
      const src = fs.readFileSync(fileAbs, "utf8");
      const { parseError, refs } = referencesIn(src, fileRel);
      if (parseError) { out.push({ file: fileRel, parseError }); continue; }
      for (const r of refs) {
        const targetAbs = resolveTarget(fileAbs, r.spec);
        if (!targetAbs) continue;                      // cross-file-paths reports it
        const targetRel = rel(root, targetAbs);
        const newTargetRel = map.get(targetRel) || targetRel;
        // Recompute even when neither moved — a file that moved changes the
        // specifier to a target that did NOT move, and vice versa.
        const want = specifierFrom(newFileRel, newTargetRel);
        // Node resolves an extensionless require; keep the author's form when
        // it still points at the same file rather than churning every .cjs.
        const wantNoExt = want.replace(/\.(js|mjs|cjs)$/, "");
        if (r.spec === want || r.spec === wantNoExt) continue;
        out.push({ file: fileRel, newFile: newFileRel, line: r.line,
                   kind: r.kind, from: r.spec, to: want });
      }
    }
  }
  return out;
}

// ─── string references ────────────────────────────────────────────────────────

// Where a `tests/<name>` token is a PATH rather than prose. Kept explicit: a
// rewriter loose enough to catch every mention is loose enough to corrupt a
// sentence, and the guards cannot tell the difference.
const TEXT_FILES = [
  "package.json",
  "playwright.config.js",
  ".github/workflows/ci.yml",
  ".github/workflows/pages.yml",
  "CLAUDE.md",
  "README.md",
];
const TEXT_GLOB_DIRS = ["docs", ".claude", "tools", "tests"];
const TEXT_EXTS = new Set([".md", ".mjs", ".cjs", ".js", ".json", ".yml"]);

// HISTORY IS NOT REWRITTEN.
//
// The first plan reported 1219 string hits and the largest contributors were
// docs/archive/, docs/archive/research/raw/ and the dated audit records — 281 in one
// raw workflow dump alone. Those describe the tree AS IT WAS. Rewriting them
// does not update a reference, it falsifies a record, and it would have been
// invisible in a 174-file commit.
//
// The boundary is the one tests/unit/docs-integrity.test.mjs already draws (its
// LIVE_DOCS skips archive/, research/ and tracks/), restated here so the two
// cannot disagree about what counts as live. Dated records under
// docs/archive/research/ hold the R2 lockstep lists — see AUDIT-SYNTHESIS-2026-08.md.
// This file is excluded for a different reason than the rest: its header
// DOCUMENTS the transformation ("tests/*.spec.js -> tests/specs/"), so
// rewriting the left-hand side turns the description of the move into a
// description of nothing. Found by reading its own plan, which is the argument
// for having a dry-run at all.
const HISTORICAL = /^(docs\/archive\/|docs\/research\/|\.claude\/workflows\/|tools\/tests-split\.mjs$)/;

function textCandidates(root) {
  const files = TEXT_FILES.map((f) => path.join(root, f)).filter((f) => fs.existsSync(f));
  for (const d of TEXT_GLOB_DIRS) {
    const abs = path.join(root, d);
    if (!fs.existsSync(abs)) continue;
    for (const e of fs.readdirSync(abs, { withFileTypes: true, recursive: true })) {
      if (e.isDirectory()) continue;
      if (!TEXT_EXTS.has(path.extname(e.name))) continue;
      const p = path.join(e.parentPath || e.path || abs, e.name);
      if (!SKIP_DIR.test(p)) files.push(p);
    }
  }
  return [...new Set(files)];
}

// A literal token, anchored so `tests/specs/x.spec.js` is not rewritten twice
// and a longer path that merely CONTAINS one is left alone.
export function textRewrites(root = ROOT, map = moveMap(root)) {
  const byBase = new Map();
  for (const [from, to] of map) byBase.set(path.posix.basename(from), path.posix.basename(path.posix.dirname(to)));
  const out = [];
  const TOKEN = /(?<![\w/.-])tests\/([A-Za-z0-9_*-]+\.(?:spec\.js|test\.mjs|test\.cjs|js|json))(?![\w-])/g;
  for (const abs of textCandidates(root)) {
    const relPath = rel(root, abs);
    if (HISTORICAL.test(relPath)) continue;
    let src;
    try { src = fs.readFileSync(abs, "utf8"); } catch { continue; }
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(TOKEN)) {
        const base = m[1];
        let bucket = byBase.get(base);
        if (!bucket && base.includes("*")) {
          // A glob (tests/physics-*.spec.js) has no single basename; route it
          // by extension, which is the only thing the split keys on anyway.
          bucket = base.endsWith(".spec.js") ? "specs"
                 : /\.test\.(mjs|cjs)$/.test(base) ? "unit" : null;
        }
        if (!bucket) continue;                       // manual/, data/, or prose
        out.push({ file: relPath, line: i + 1, from: `tests/${base}`,
                   to: `tests/${bucket}/${base}` });
      }
    });
  }
  return out;
}

// ─── plan / apply ─────────────────────────────────────────────────────────────

export function plan(root = ROOT) {
  const map = moveMap(root);
  return { map, imports: importRewrites(root, map), text: textRewrites(root, map) };
}

function apply(root, p) {
  const dirs = new Set([...p.map.values()].map((v) => path.posix.dirname(v)));
  for (const d of dirs) fs.mkdirSync(path.join(root, d), { recursive: true });
  for (const [from, to] of p.map) {
    execFileSync("git", ["mv", from, to], { cwd: root, stdio: "inherit" });
  }
  // Rewrite AFTER the move so the paths written are the paths that exist.
  const edits = new Map();
  const push = (file, line, from, to) => {
    if (!edits.has(file)) edits.set(file, []);
    edits.get(file).push({ line, from, to });
  };
  for (const r of p.imports) if (!r.parseError) push(r.newFile || r.file, r.line, r.from, r.to);
  for (const r of p.text) push(r.file, r.line, r.from, r.to);
  for (const [file, list] of edits) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) { console.log(`  SKIP (gone) ${file}`); continue; }
    const lines = fs.readFileSync(abs, "utf8").split("\n");
    for (const { line, from, to } of list) {
      const i = line - 1;
      if (lines[i] == null || !lines[i].includes(from)) {
        console.log(`  MISS ${file}:${line} expected "${from}"`);
        continue;
      }
      lines[i] = lines[i].split(from).join(to);
    }
    fs.writeFileSync(abs, lines.join("\n"));
  }
  console.log(`\napplied: ${p.map.size} moves, ${edits.size} files rewritten`);
  console.log("NOW RUN: npm run test:tooling-fast && npm run test:audit");
}

function main() {
  const argv = process.argv.slice(2);
  const p = plan();
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ moves: [...p.map], imports: p.imports, text: p.text }, null, 2));
    return;
  }
  if (argv.includes("--apply")) { apply(ROOT, p); return; }

  const buckets = new Map();
  for (const to of p.map.values()) {
    const d = path.posix.dirname(to);
    buckets.set(d, (buckets.get(d) || 0) + 1);
  }
  console.log("MOVES");
  for (const [d, n] of [...buckets].sort()) console.log(`  ${d.padEnd(16)} ${n}`);
  console.log(`  ${"total".padEnd(16)} ${p.map.size}`);

  const pe = p.imports.filter((r) => r.parseError);
  const imp = p.imports.filter((r) => !r.parseError);
  console.log(`\nIMPORT REWRITES (derived from the tree) — ${imp.length}`);
  const byFile = new Map();
  for (const r of imp) byFile.set(r.file, (byFile.get(r.file) || 0) + 1);
  for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(`  ${f}  ${n}`);

  console.log(`\nSTRING REWRITES — ${p.text.length}`);
  const byTextFile = new Map();
  for (const r of p.text) byTextFile.set(r.file, (byTextFile.get(r.file) || 0) + 1);
  for (const [f, n] of [...byTextFile].sort((a, b) => b[1] - a[1])) console.log(`  ${f}  ${n}`);

  if (pe.length) {
    console.log("\nPARSE ERRORS (these files' references are NOT covered):");
    for (const r of pe) console.log(`  ${r.file}: ${r.parseError}`);
  }
  console.log("\n--apply performs it; --json emits the full plan.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
