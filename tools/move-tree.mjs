// move-tree.mjs — move source files and rewrite every path that named them.
// @doc Phase 2b mover: `git mv` from a JSON old→new map, rewrite the paths in manifest / tools / tests / docs / skills, record MOVED, regenerate the shell. `--plan` dry-run.
//
//   node tools/move-tree.mjs <moves.json> --plan     # what would move, what would be rewritten
//   node tools/move-tree.mjs <moves.json>            # do it (git mv + sweep + MOVED + gen-shell)
//   node tools/move-tree.mjs <moves.json> --root D   # operate on another checkout (tests)
//
// moves.json: { "moves": { "<old relative path>": "<new relative path>", … } }
//
// Why a tool and not a hand: a directory move in this tree is one `git mv`
// plus a string in tools/manifest.cjs (the load-order truth the shell is
// generated from) plus every place that cites the path — guards pin paths,
// skills cite them, docs link them. Rewriting those by hand across 40 files
// per move is how a move commit fails docs-integrity between commits. The
// sweep rewrites EXACT relative paths only (the full `js/<dir>/<file>.js`, never
// the bare basename), so a comment that says "perf.js" is left alone and reported.
//
// What it does NOT touch: the docs archive (history is not rewritten), the
// generated @gen-shell blocks (gen-shell rewrites them from the manifest),
// node_modules, artifacts/, scratch/. tools/manifest.cjs is swept like any
// other file — a FULL / LAZY / PATHS entry is a path string — and then gets
// the move appended to its MOVED map, which deploy.mjs reads to name the new
// path when another session's edit to the old one conflicts.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SWEEP_ROOTS = ["js", "tools", "tests", "docs", "types", ".claude", ".cursor", ".github",
  "AGENTS.md", "README.md", "sw.js", "package.json", "playwright.config.js"];
// Never descend into another checkout: .claude/worktrees/ holds subagent
// worktrees (each with its own .git), and a nested .git anywhere means the
// same — rewriting those would edit a sibling branch's files in place.
export const SWEEP_SKIP = /^(docs\/archive|node_modules|artifacts|scratch|vendor|assets|\.claude\/worktrees|\.git)(\/|$)/;
export const SWEEP_EXT = /\.(js|mjs|cjs|json|md|mdc|yml|yaml|sh|py|ts|html|css)$/;

function walk(root, rel, out) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return out;
  if (SWEEP_SKIP.test(rel)) return out;
  const st = fs.statSync(abs);
  if (st.isFile()) { if (SWEEP_EXT.test(rel)) out.push(rel); return out; }
  if (rel && fs.existsSync(path.join(abs, ".git"))) return out; // a nested checkout
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    walk(root, rel ? `${rel}/${e.name}` : e.name, out);
  }
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
// An exact path token: not preceded by a path char, not followed by one that
// would extend it (so a `.js` path does not match its `.json` or `.js.map`
// sibling, and a longer name that starts with the path never matches it).
const tokenRe = (p) => new RegExp(`(?<![A-Za-z0-9_./-])${esc(p)}(?![A-Za-z0-9_-])`, "g");

export function loadMoves(file) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const moves = data.moves || data;
  const out = [];
  for (const [from, to] of Object.entries(moves)) {
    if (typeof to !== "string" || !to) throw new Error(`moves: ${from} has no target`);
    if (from === to) continue;
    out.push({ from: from.replace(/\\/g, "/"), to: to.replace(/\\/g, "/") });
  }
  return out;
}

export function validate(root, moves) {
  const errors = [];
  const targets = new Set();
  for (const { from, to } of moves) {
    if (!fs.existsSync(path.join(root, from))) errors.push(`missing: ${from}`);
    if (fs.existsSync(path.join(root, to))) errors.push(`target exists: ${to}`);
    if (targets.has(to)) errors.push(`two moves target ${to}`);
    targets.add(to);
  }
  return errors;
}

/** Rewrite exact path tokens in every swept file. Longest paths first so a
 *  directory move listed alongside its files cannot double-rewrite. */
export function sweep(root, moves, { write = true } = {}) {
  const ordered = [...moves].sort((a, b) => b.from.length - a.from.length);
  const changed = [];
  for (const rel of SWEEP_ROOTS.flatMap((r) => walk(root, r, []))) {
    const abs = path.join(root, rel);
    const before = fs.readFileSync(abs, "utf8");
    let after = before;
    let hits = 0;
    for (const { from, to } of ordered) after = after.replace(tokenRe(from), () => { hits++; return to; });
    if (hits) {
      changed.push({ file: rel, hits });
      if (write) fs.writeFileSync(abs, after);
    }
  }
  return changed;
}

/** Bare-basename mentions the sweep deliberately leaves alone, for a human. */
export function leftovers(root, moves) {
  const out = [];
  const names = moves.map((m) => ({ ...m, base: path.basename(m.from) }))
    .filter((m) => path.basename(m.to) !== m.base);
  if (!names.length) return out;
  for (const rel of SWEEP_ROOTS.flatMap((r) => walk(root, r, []))) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    for (const m of names) {
      const re = new RegExp(`(?<![A-Za-z0-9_./-])${esc(m.base)}(?![A-Za-z0-9_-])`, "g");
      const n = (text.match(re) || []).length;
      if (n) out.push({ file: rel, name: m.base, now: m.to, hits: n });
    }
  }
  return out;
}

export function recordMoved(root, moves) {
  const rel = "tools/manifest.cjs";
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return false;
  let src = fs.readFileSync(abs, "utf8");
  const entries = moves.map(({ from, to }) => `  "${from}": "${to}",`).join("\n");
  if (/const MOVED = \{/.test(src)) {
    src = src.replace(/const MOVED = \{\n?/, (m) => `${m}${entries}\n`);
  } else {
    src = src.replace(/\nmodule\.exports = \{/, `\n// Files moved by tools/move-tree.mjs, old -> new, kept for ONE release so\n// tools/deploy.mjs can name the new path when another session's edit to the\n// old one conflicts. Prune entries once every in-flight branch has rebased.\nconst MOVED = {\n${entries}\n};\n\nmodule.exports = {\n  MOVED,`);
  }
  fs.writeFileSync(abs, src);
  return true;
}

function mv(root, from, to, useGit) {
  fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
  if (useGit) {
    const r = spawnSync("git", ["mv", "-k", from, to], { cwd: root, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git mv ${from} ${to}: ${r.stderr}`);
  } else {
    fs.renameSync(path.join(root, from), path.join(root, to));
  }
}

export function apply(root, moves, { plan = false, git = fs.existsSync(path.join(root, ".git")), genShell = true } = {}) {
  const errors = validate(root, moves);
  if (errors.length) throw new Error(`move-tree: ${errors.join("; ")}`);
  const rewritten = sweep(root, moves, { write: !plan });
  if (!plan) {
    for (const { from, to } of moves) mv(root, from, to, git);
    recordMoved(root, moves);
    if (genShell && fs.existsSync(path.join(root, "tools/gen-shell.mjs"))) {
      const r = spawnSync(process.execPath, ["tools/gen-shell.mjs"], { cwd: root, encoding: "utf8" });
      if (r.status !== 0) throw new Error(`gen-shell after the move: ${r.stderr || r.stdout}`);
    }
  }
  return { moved: moves.length, rewritten, leftovers: leftovers(root, moves) };
}

function main() {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) { console.error("usage: node tools/move-tree.mjs <moves.json> [--plan] [--root DIR]"); process.exit(2); }
  const rootIdx = argv.indexOf("--root");
  const root = rootIdx >= 0 ? path.resolve(argv[rootIdx + 1]) : HERE;
  const plan = argv.includes("--plan");
  const moves = loadMoves(path.resolve(file));
  const res = apply(root, moves, { plan });
  console.log(`${plan ? "would move" : "moved"} ${res.moved} file(s); ${plan ? "would rewrite" : "rewrote"} paths in ${res.rewritten.length} file(s)`);
  for (const r of res.rewritten) console.log(`  ${r.file} (${r.hits})`);
  if (res.leftovers.length) {
    console.log(`bare-name mentions left for a human (${res.leftovers.length}):`);
    for (const l of res.leftovers) console.log(`  ${l.file}: "${l.name}" x${l.hits} -> now ${l.now}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
