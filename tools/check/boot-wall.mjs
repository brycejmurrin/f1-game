// boot-wall.mjs — the boot wall's size: the <script src> tags index.html makes EVERY visit parse before the title.
// @doc Boot wall size (eager <script> count, raw and code bytes), live or at a git ref: the eager* tree ratchets.
//
// eagerCodeBytes (2026-11-20, Bryce's B+D, docs/notes/RATCHET-REVIEW-2026-11-20.md) is the wall with comments and
// spare whitespace stripped (tools/lib/js-strip.mjs): the bytes a boot parses. Pages ships terser output, so comments
// never reach a player and no longer count. The raw byte sum stays here as information, not a ceiling.
// `node tools/check/boot-wall.mjs --growth [--days=7]` prints the wall's change over the last N days (the weekly
// report, .github/workflows/boot-wall-weekly.yml).
// One measurement, three readers: tests/unit/boot-load-budget.test.mjs (the assertion), tools/check/ratchets.mjs
// TREE_METRICS eagerScripts / eagerBytes (the ceilings in tests/data/ratchets.json `tree`, raised only by a
// ratchets.d fragment under Bryce's `ratchet-raise`) and tools/check/tree-counts.mjs AT_REF (a branch's own lowering
// is measured at its merge-base, #4257). docs/notes/BUDGET-RATCHETS-2026-11-19.md says why the number left the test.
import { exitIfHelp } from "../lib/cli-args.mjs";
exitIfHelp(process.argv[1]?.endsWith("/boot-wall.mjs") ? process.argv.slice(2) : [], "Usage: node tools/check/boot-wall.mjs [options]\nBoot wall size (eager <script> count, raw and code bytes), live or at a git ref: the eager* tree ratchets.\n--help prints this and exits 0.");
import cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUILT_PATHS } from "../lib/generated-paths.mjs";
import { strippedBytes } from "../lib/js-strip.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The local <script src> paths of an index.html text, comments stripped, in tag order. Pure. */
export function eagerScriptsOf(html) {
  const live = String(html || "").replace(/<!--[\s\S]*?-->/g, "");
  return [...live.matchAll(/<script\b[^>]*\bsrc="([^"?#]+)/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
}

/** The wall on the working tree under `root`: { files, scripts, bytes (raw), codeBytes (stripped) }. */
export function wallNow(root = ROOT) {
  const files = eagerScriptsOf(fs.readFileSync(path.join(root, "index.html"), "utf8"));
  let bytes = 0, codeBytes = 0;
  for (const f of files) {
    const buf = fs.readFileSync(path.join(root, f));
    bytes += buf.length;
    codeBytes += strippedBytes(buf.toString("utf8"));
  }
  return { files, scripts: files.length, bytes, codeBytes };
}

/** Stripped sizes by blob sha, memoised (a sha names its content, so the cache never goes stale). One
 *  `git cat-file --batch` read fills every sha not seen yet. */
const codeBySha = new Map();
function fillCodeBytes(shas, root) {
  const need = [...new Set(shas)].filter((h) => !codeBySha.has(h));
  if (!need.length) return;
  const buf = cp.execFileSync("git", ["cat-file", "--batch"], { cwd: root, input: need.join("\n") + "\n", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 256 << 20 });
  let at = 0;
  for (const h of need) {
    const eol = buf.indexOf(10, at);
    const m = buf.toString("latin1", at, eol).match(/^([0-9a-f]+) blob (\d+)$/);
    if (!m || m[1] !== h) throw new Error(`boot wall: git cat-file --batch gave no blob for ${h}`);
    const len = Number(m[2]);
    codeBySha.set(h, strippedBytes(buf.toString("utf8", eol + 1, eol + 1 + len)));
    at = eol + 1 + len + 1;
  }
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
  const size = new Map(), code = new Map();
  for (const line of git("ls-tree", "-r", "-l", ref, "--", ...new Set(files)).split("\n")) {
    const m = line.match(/^\d+ blob ([0-9a-f]+)\s+(\d+)\t(.+)$/);
    if (m) { size.set(m[3], Number(m[2])); code.set(m[3], m[1]); }
  }
  for (const f of files) {
    if (size.has(f) || !BUILT_PATHS.includes(f) || !fs.existsSync(path.join(root, f))) continue;
    size.set(f, fs.statSync(path.join(root, f)).size);
    code.set(f, { built: strippedBytes(fs.readFileSync(path.join(root, f), "utf8")) });
  }
  const missing = files.filter((f) => !size.has(f));
  if (missing.length) throw new Error(`boot wall at ${ref}: ${missing.length} script(s) not in the tree: ${missing.slice(0, 3).join(", ")}`);
  let codeBytes = null;
  const out = {
    files, scripts: files.length, bytes: files.reduce((n, f) => n + size.get(f), 0),
    // computed on first read: the raw-size callers never pay for stripping
    get codeBytes() {
      if (codeBytes === null) {
        fillCodeBytes(files.map((f) => code.get(f)).filter((c) => typeof c === "string"), root);
        codeBytes = files.reduce((n, f) => { const c = code.get(f); return n + (typeof c === "string" ? codeBySha.get(c) : c.built); }, 0);
      }
      return codeBytes;
    },
  };
  atRef.set(key, out);
  return out;
}

/** The wall's change from the newest commit on `ref` at least `days` old to `ref`: the weekly report. */
export function growth({ days = 7, ref = "HEAD", root = ROOT } = {}) {
  const git = (...a) => cp.execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const then = git("rev-list", "-1", `--before=${days} days ago`, ref);
  if (!then) throw new Error(`boot wall growth: no commit on ${ref} is ${days} days old (is the clone shallow?)`);
  const a = wallAt(then, root), b = wallAt(ref, root);
  return { days, from: then, to: git("rev-parse", ref), scripts: [a.scripts, b.scripts], bytes: [a.bytes, b.bytes], codeBytes: [a.codeBytes, b.codeBytes] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => process.argv.slice(2).find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  if (process.argv.includes("--growth")) {
    const g = growth({ days: Number(arg("days") || 7), ref: arg("ref") || "HEAD" });
    const d = ([x, y]) => `${x.toLocaleString("en-US")} → ${y.toLocaleString("en-US")} (${y - x >= 0 ? "+" : ""}${(y - x).toLocaleString("en-US")})`;
    console.log([`Boot wall, last ${g.days} days (${g.from.slice(0, 8)} → ${g.to.slice(0, 8)}):`,
      `- eagerCodeBytes (the ceiling): ${d(g.codeBytes)}`, `- eagerScripts: ${d(g.scripts)}`, `- raw source bytes (information): ${d(g.bytes)}`].join("\n"));
  } else {
    const w = wallNow();
    console.log(JSON.stringify({ scripts: w.scripts, bytes: w.bytes, codeBytes: w.codeBytes }));
  }
}
