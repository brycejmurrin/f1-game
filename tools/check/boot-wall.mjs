// boot-wall.mjs — the boot wall's size: the <script src> tags index.html makes EVERY visit parse before the title.
// @doc Boot wall size (eager <script> count and raw bytes), live or at a git ref: the eager* tree ratchets.
//
// One measurement, three readers: tests/unit/boot-load-budget.test.mjs (the assertion), tools/check/ratchets.mjs
// TREE_METRICS eagerScripts / eagerBytes (the ceilings in tests/data/ratchets.json `tree`, raised only by a
// ratchets.d fragment under Bryce's `ratchet-raise`) and tools/check/tree-counts.mjs AT_REF (a branch's own lowering
// is measured at its merge-base, #4257). docs/notes/BUDGET-RATCHETS-2026-11-19.md says why the number left the test.
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUILT_PATHS } from "../lib/generated-paths.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The local <script src> paths of an index.html text, comments stripped, in tag order. Pure. */
export function eagerScriptsOf(html) {
  const live = String(html || "").replace(/<!--[\s\S]*?-->/g, "");
  return [...live.matchAll(/<script\b[^>]*\bsrc="([^"?#]+)/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
}

/** The wall on the working tree under `root`: { files, scripts, bytes }. */
export function wallNow(root = ROOT) {
  const files = eagerScriptsOf(fs.readFileSync(path.join(root, "index.html"), "utf8"));
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(root, f)).size, 0);
  return { files, scripts: files.length, bytes };
}

const atRef = new Map();
/** The wall at git `ref` (blob sizes from one ls-tree read; nothing checked out). A BUILT_PATHS script
 *  (js/track/circuit-meta.js: gitignored, built by ensure-built) is in no tree, so its size is the working tree's:
 *  its change counts 0 toward a branch's own lowering (attributeTree), never toward a raise. Any other tag whose
 *  file is not in the tree at `ref` throws: a wall that cannot be measured is never a count. Memoised per ref. */
export function wallAt(ref, root = ROOT) {
  const key = `${root}\0${ref}`;
  if (atRef.has(key)) return atRef.get(key);
  const git = (...a) => cp.execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
  const files = eagerScriptsOf(git("show", `${ref}:index.html`));
  const size = new Map();
  for (const line of git("ls-tree", "-r", "-l", ref, "--", ...new Set(files)).split("\n")) {
    const m = line.match(/^\d+ blob [0-9a-f]+\s+(\d+)\t(.+)$/);
    if (m) size.set(m[2], Number(m[1]));
  }
  for (const f of files) if (!size.has(f) && BUILT_PATHS.includes(f) && fs.existsSync(path.join(root, f))) size.set(f, fs.statSync(path.join(root, f)).size);
  const missing = files.filter((f) => !size.has(f));
  if (missing.length) throw new Error(`boot wall at ${ref}: ${missing.length} script(s) not in the tree: ${missing.slice(0, 3).join(", ")}`);
  const out = { files, scripts: files.length, bytes: files.reduce((n, f) => n + size.get(f), 0) };
  atRef.set(key, out);
  return out;
}
