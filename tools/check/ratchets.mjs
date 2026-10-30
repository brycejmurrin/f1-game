// ratchets.mjs — ONE ratchet mechanism for the numbers that only ever grow.
// @doc Size ratchets: ratchets.json + per-branch ratchets.d/ deltas. `--check`, `--update`, `--fold`, `--json`, `--base <ref>`.
// Full description: Size ratchets from `tests/data/ratchets.json` plus the per-branch delta fragments in `tests/data/ratchets.d/`: `--check` (default), `--update` snaps ceilings down, `--fold` sums the fragments in, `--json`, `--base <ref>` names raises.
//
//   node tools/check/ratchets.mjs            # check: every metric <= its ceiling, no ceiling far above its value
//   node tools/check/ratchets.mjs --update [--absolute]   # snap ceilings to the current values: ratchets.json on the deploy branch, a ratchets.d delta on a topic branch (after an extraction,
//                                      #   or on a merged tree — the deploy-merge rule)
//   node tools/check/ratchets.mjs --fold     # sum tests/data/ratchets.d/*.json into ratchets.json, delete them
//   node tools/check/ratchets.mjs --auto-raise[=40]   # the commit hook's form: on a topic branch it writes
//                                      #   tests/data/ratchets.d/<branch>.json (a delta), never ratchets.json
//   node tools/check/ratchets.mjs --update --fragment --reason="<why>"   # a deliberate tree-metric raise as this branch's delta
//   node tools/check/ratchets.mjs --json     # {ok, rows:[{file, metric, value, ceiling, over, slack}]}
//   node tools/check/ratchets.mjs --base <ref> [--max-raise=40] [--advisory]   # --advisory: a raise past the absorb
//                                      #   annotates instead of failing — for PUSH runs, where no PR body can carry the reason
//                                      # every ceiling that moved since <ref> (git show); raises are
//                                      #   warnings. A raise past the commit hook's absorb fails ONLY when
//                                      #   the SOURCE file's metric also grew past absorb since <ref> —
//                                      #   a ceiling catch-up after other PRs landed growth (file delta ≤
//                                      #   absorb) is a warning, not a red. ci.yml's guards job runs this
//                                      #   against the PR base / deploy tip.
//
// Replaced the module-size unit test on 2026-09-03 (Phase 1-lite of
// docs/research/TREE-RESTRUCTURE-2026-09.md). The idiom is unchanged — a number
// you must look at gets thought about — but the number now lives in data, one
// tool measures every metric the same way, and the history moved to
// docs/notes/CEILING-HISTORY.md instead of 1,280 comment lines beside the numbers.
//
// Metrics (per file, only those named in ratchets.json):
//   lines      split-newline count — the old module-size metric, kept so the
//              history stays comparable
//   codeLines  non-comment, non-blank lines (a comment explaining a fixed bug
//              is the one growth the ratchet tolerates; this metric ignores it)
//   gMembers   members of the `G` façade literal (tools/check/check-gctx.mjs scanGameCtx)
//   topLets    column-0 `let` declarations — the closure state a carve must move
//
// Two scopes: `files` (a metric of ONE file) and `tree` (a metric of a whole
// subtree — CSS classes across css/, bare catches across js/). A tree metric
// takes no file; it is named directly in the `tree` map, and
// `node tools/check/tree-counts.mjs --offenders` prints the breakdown behind it.
//
// ONE slack rule, with a declared exception: a ceiling more than
// max(SLACK_MIN, SLACK_PCT of itself) above its value has stopped ratcheting;
// lower it (`--update`). An entry may set its own `slack` when its guard is
// TIGHTER than that — `{ "ceiling": 3, "slack": 0 }` is exact equality, which
// is what css-token-adoption's counts have always asserted ("lower it to lock
// the win in"). The default is never loosened by an entry: a `slack` above the
// computed default is refused, because folding five mechanisms into one must
// not quietly widen any of them.
import fs from "node:fs";
import cp from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { absorbLimit, readCommitMessage } from "../hooks/ratchet-reason.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DATA = path.join(ROOT, "tests/data/ratchets.json");
export const SLACK_MIN = 60;
export const SLACK_PCT = 0.04;

const COMMENT = /^\s*(\/\/|\*|\/\*)/;

export const METRICS = {
  lines: (rel, text) => text.split("\n").length,
  codeLines: (rel, text) => text.split("\n").filter((l) => l.trim() && !COMMENT.test(l)).length,
  topLets: (rel, text) => text.split("\n").filter((l) => /^let /.test(l)).length,
  // How many manifest files pick-tests routes with NOTHING but the two blanket
  // rules. A count, not a path list: the Phase 2b window moves 91 files, and a
  // frozen list keyed on paths needs a hand edit per move while saying nothing
  // the number does not. It may shrink (a file gains a rule) and must not grow
  // (a moved file that fell off its old rule is the regression a tree move
  // causes); tests/unit/pick-tests.test.mjs prints the live list on a failure.
  blanketOnlyRoutes: async (rel) => {
    if (rel !== "tools/ci/pick-tests.mjs") throw new Error(`blanketOnlyRoutes is a tools/ci/pick-tests.mjs metric (asked for ${rel})`);
    const { blanketOnly } = await import("../ci/pick-tests.mjs");
    return blanketOnly().length;
  },
  gMembers: async (rel) => {
    if (rel !== "js/game.js") throw new Error(`gMembers is a js/game.js metric (asked for ${rel})`);
    const { scanGameCtx } = await import("./check-gctx.mjs");
    return scanGameCtx().members.size;
  },
};

/** Metrics of a whole subtree rather than one file. Each returns a count. */
export const TREE_METRICS = {
  cssClasses: async () => (await import("./tree-counts.mjs")).classTokens().size,
  shellNodes: async () => (await import("./tree-counts.mjs")).shellNodes(),
  bareCatches: async () => (await import("./tree-counts.mjs")).bareCatches(),
  waitNoPolling: async () => (await import("./tree-counts.mjs")).waitNoPolling(),
  waitForTimeout: async () => (await import("./tree-counts.mjs")).waitForTimeout(),
  subFloorFontSize: async () => (await import("./tree-counts.mjs")).subFloorFontSize(),
  rawSpacing: async () => (await import("./tree-counts.mjs")).rawSpacing(),
  rawColor: async () => (await import("./tree-counts.mjs")).rawColor(),
  rawColorDistinct: async () => (await import("./tree-counts.mjs")).rawColorDistinct(),
  dynamicIdReads: async () => (await import("./shell-ids.mjs")).dynamicIdReads(),
  // Coverage-shaped ratchets (2026-09-22). Each names a way a test suite can
  // look larger than it is: a module no test names, a test that only WAITS
  // (its condition is the assertion, and a timeout reads as a hang), and a
  // browser spec that could run in the VM adapter but still spends
  // SwiftShader minutes. All three are shrink-only.
  zeroRefModules: async () => (await import("./tree-counts.mjs")).zeroRefModules(),
  implicitAsserts: async () => {
    const { audit } = await import("../ci/assert-audit.mjs");
    return audit().flatMap((r) => r.tests).filter((t) => !t.skipped && t.verdict === "implicit").length;
  },
  twinDebt: async () => (await (await import("../ci/twinned-specs.mjs")).twinDebt()).length,
  assertPins: async () => pinCount("assertPins"),
  assertPinsAll: async () => pinCount("assertPinsAll"),
  rawGameReads: async () => pinCount("rawGameReads"),
  vmSrcLoads: async () => pinCount("vmSrcLoads"),
};

/* PIN COUNTERS, DIFF-RELATIVE ON A PR (2026-10-26, system audit §6/§9). Three
 * shrink-only counts used to live as inline CEILING constants in their tests
 * (assert-match-ratchet 7314, source-pin-hygiene 308, vm-filename-lint 599) with
 * no fragment mechanism, and PR CI judges the MERGE REF: two PRs that each added
 * one site both went red, and so did every other open PR, once either merged —
 * 74 of 80 red PR runs and 5 of 6 shipped-red trains in three days. Their
 * ceilings now live in ratchets.json `tree` (raises are ratchets.d fragments),
 * and outside APEX_RATCHET_ABSOLUTE=1 (set by ci.yml on push and schedule) a row
 * fails only when the change makes it WORSE than its base: over(head) >
 * over(base), where the base count is head minus the delta of the files the
 * change touched (only those blobs are read at the base, so a blob:none clone
 * fetches a handful, not a thousand). An inherited overage warns and stays green. */
const RAW_GAME = /game\.js(?:"|'(?!s\b))/g;
// `assert.ok(x.includes(` is the same source pin as `assert.match(x, /…/)`: counting
// both keeps "includes() instead of assert.match" from lowering the number.
const ASSERT_PIN = /assert\.match\b|assert\.ok\(\s*!?\s*[\w$.]+\.includes\(/g;
/* assertPinsAll (audit4 E1 / tests-deep F3, 2026-10-26): every SHAPE a source pin
 * takes, not just the two assertPins counts. assertPins read 8,420 while
 * doesNotMatch alone had 1,095 uncounted sites (3.3x pass 3), so a pin written
 * as `ok(/re/.test(src))` or `doesNotMatch` booked as flat. assertPins stays as it
 * is (its ceiling and history); this is a NEW metric with its own ceiling, seeded
 * at the measured value by `ratchets.mjs --seed=assertPinsAll`. Counted: the
 * assertPins shapes; doesNotMatch; ok(<re or name>.test(…)); indexOf under
 * ok/equal; equal(x.includes(…), b); (x.match(/…/g) || []).length; ok(x.startsWith
 * / endsWith(…)); and each regex literal of an array a `for (… of [ … ])` loop
 * walks (one pin per element: a loop of 28 patterns is 28 pins, not one). */
const RE_LIT = String.raw`\/(?![*/])(?:[^/\\\n\[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[dgimsuyv]*`;
const PIN_ALL_SHAPES = [
  ASSERT_PIN,
  /assert\.doesNotMatch\b/g,
  new RegExp(String.raw`assert\.ok\(\s*!?\s*(?:${RE_LIT}|[\w$.]+)\.test\(`, "g"),
  /assert\.(?:ok|equal|strictEqual|notEqual|notStrictEqual)\(\s*!?\s*[\w$.]+\.indexOf\(/g,
  /assert\.(?:equal|strictEqual|notEqual|notStrictEqual|deepEqual)\(\s*[\w$.]+\.includes\(/g,
  new RegExp(String.raw`\.match\(\s*(?:${RE_LIT}|[A-Z_$][\w$]*)\s*\)\s*\|\|\s*\[\]\s*\)\.length`, "g"),
  /assert\.ok\(\s*!?\s*[\w$.]+\.(?:startsWith|endsWith)\(/g,
];
const LOOP_ARRAY = /for\s*\(\s*(?:const|let|var)\s+[^;)]*?\s+of\s+\[/g;
const LOOP_NAMED = /for\s*\(\s*(?:const|let|var)\s+[^;)]*?\s+of\s+([A-Za-z_$][\w$]*)\s*\)/g;
/** Regex literals that are elements (or tuple members) of each array a
 *  `for (… of [ … ])` loop walks, inline or as a `const NAME = [ … ]` the loop
 *  names. A light scanner: strings and regex literals are skipped whole so a `]`
 *  inside them cannot close the array early. Each array is counted once. */
export function loopRegexPins(t) {
  let n = 0;
  for (const m of t.matchAll(LOOP_ARRAY)) n += arrayRegexes(t, m.index + m[0].length);
  const names = new Set([...t.matchAll(LOOP_NAMED)].map((m) => m[1]));
  for (const name of names) {
    const decl = new RegExp(String.raw`(?:const|let|var)\s+${name.replace(/\$/g, "\\$")}\s*=\s*(?:Object\.freeze\(\s*)?\[`, "g");
    for (const m of t.matchAll(decl)) n += arrayRegexes(t, m.index + m[0].length);
  }
  return n;
}
function arrayRegexes(t, start) {
  let n = 0;
  const lit = new RegExp(RE_LIT, "y");
  {
    let i = start, depth = 1, prev = "[";
    while (i < t.length && depth > 0) {
      const c = t[i];
      if (c === '"' || c === "'" || c === "`") {
        let j = i + 1;
        while (j < t.length && t[j] !== c) j += t[j] === "\\" ? 2 : 1;
        i = j + 1; prev = c; continue;
      }
      if (c === "/" && (prev === "[" || prev === ",")) {
        lit.lastIndex = i;
        const r = lit.exec(t);
        if (r) { n++; i += r[0].length; prev = "/"; continue; }
      }
      if (c === "[") depth++;
      else if (c === "]") depth--;
      if (!/\s/.test(c)) prev = c;
      i++;
    }
  }
  return n;
}
export const countPinsAll = (t) => PIN_ALL_SHAPES.reduce((a, re) => a + (t.match(re) || []).length, 0) + loopRegexPins(t);

export const PIN_METRICS = {
  assertPins: { dirs: ["tests/unit"], exempt: ["tests/unit/assert-match-ratchet.test.mjs"],
    count: (t) => (t.match(ASSERT_PIN) || []).length },
  assertPinsAll: { dirs: ["tests/unit"], exempt: ["tests/unit/assert-match-ratchet.test.mjs"], count: countPinsAll },
  rawGameReads: { dirs: ["tests"], exempt: ["tests/helpers/game-source.mjs", "tests/unit/source-pin-hygiene.test.mjs"],
    count: (t) => (t.match(RAW_GAME) || []).length },
  vmSrcLoads: { dirs: ["tests/unit", "tests/helpers"], exempt: [], skipDir: "fixtures",
    count: async (t, rel) => {
      const { lintSource } = await import("./vm-filename-lint.mjs");
      return lintSource(t, rel).sites.filter((s) => s.kind === "missing" && s.src).length;
    } },
};
export const pinPatterns = { ASSERT_PIN, RAW_GAME };

const pinFile = (m, rel) => /\.(mjs|cjs|js)$/.test(rel) && !m.exempt.includes(rel)
  && m.dirs.some((d) => rel.startsWith(d + "/")) && !rel.split("/").includes("node_modules")
  && !(m.skipDir && rel.split("/").includes(m.skipDir));

function pinWalk(m) {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = rel + "/" + e.name;
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== m.skipDir) walk(r); }
      else if (pinFile(m, r)) out.push(r);
    }
  };
  for (const d of m.dirs) if (fs.existsSync(path.join(ROOT, d))) walk(d);
  return out;
}

/** Per-file counts of a pin metric on the working tree, as [[rel, n]] (n > 0). */
export async function pinSites(name) {
  const m = PIN_METRICS[name];
  const per = [];
  for (const rel of pinWalk(m)) {
    const n = await m.count(fs.readFileSync(path.join(ROOT, rel), "utf8"), rel);
    if (n) per.push([rel, n]);
  }
  return per;
}

export async function pinCount(name) {
  return (await pinSites(name)).reduce((a, [, n]) => a + n, 0);
}

/** How much the working tree's pin count grew since <ref>, reading only the
 *  files that differ (committed, staged, unstaged, untracked). */
export async function pinDelta(name, ref) {
  const m = PIN_METRICS[name];
  const git = (...a) => cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });
  const changed = new Set([
    ...git("diff", "--name-only", "--no-renames", ref, "--", ...m.dirs).split("\n"),
    ...git("ls-files", "--others", "--exclude-standard", "--", ...m.dirs).split("\n"),
  ].filter((f) => f && pinFile(m, f)));
  let delta = 0;
  for (const rel of changed) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) delta += await m.count(fs.readFileSync(abs, "utf8"), rel);
    let before = null;
    try { before = git("show", `${ref}:${rel}`); } catch { /* new in this change */ }
    if (before !== null) delta -= await m.count(before, rel);
  }
  return delta;
}

/** Where a pin row is judged. `absolute` (APEX_RATCHET_ABSOLUTE=1: ci.yml on push,
 *  schedule and the Pages call) compares to the ceiling alone. Otherwise the base
 *  is APEX_RATCHET_BASE_REF (merge-gate's merge worktree names the tip), else the
 *  merge ref's first parent on a pull_request run (GitHub's refs/pull/N/merge), else
 *  the merge-base with the deploy branch (a local branch; a sync merge's HEAD^1 is
 *  NOT the base there), else absolute when no base is reachable. */
export function ratchetMode(env = process.env) {
  if (env.APEX_RATCHET_ABSOLUTE === "1") return { mode: "absolute", why: "APEX_RATCHET_ABSOLUTE=1" };
  const git = (...a) => cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const ok = (ref) => { try { return git("rev-parse", "--verify", "-q", `${ref}^{commit}`); } catch { return null; } };
  if (env.APEX_RATCHET_BASE_REF) {
    const sha = ok(env.APEX_RATCHET_BASE_REF);
    return sha ? { mode: "relative", base: sha, why: `APEX_RATCHET_BASE_REF=${env.APEX_RATCHET_BASE_REF}` }
      : { mode: "absolute", why: `APEX_RATCHET_BASE_REF ${env.APEX_RATCHET_BASE_REF} is not in this clone` };
  }
  if (env.GITHUB_EVENT_NAME === "pull_request" && ok("HEAD^2")) {
    const sha = ok("HEAD^1");
    if (sha) return { mode: "relative", base: sha, why: "the merge ref's first parent (the base tip GitHub merged onto)" };
  }
  for (const ref of [`origin/${DEPLOY_BRANCH}`, DEPLOY_BRANCH]) {
    if (!ok(ref)) continue;
    try { return { mode: "relative", base: git("merge-base", ref, "HEAD"), why: `merge-base with ${ref}` }; } catch { /* next */ }
  }
  return { mode: "absolute", why: "no base reachable" };
}

/** One pin row judged by ratchetMode: {metric, value, ceiling, over, base?, inherited, ok, mode, why}. */
export async function pinVerdict(name, { env = process.env, data = load() } = {}) {
  const raw = data.tree?.[name];
  if (raw === undefined) throw new Error(`tests/data/ratchets.json has no tree.${name}`);
  const { ceiling, slackMax } = entry(raw, `tree ${name}`);
  const value = await pinCount(name);
  const mode = ratchetMode(env);
  const row = { metric: name, value, ceiling, slackMax, over: Math.max(0, value - ceiling), slack: ceiling - value, mode: mode.mode, why: mode.why, inherited: false };
  if (mode.mode === "absolute") return { ...row, ok: row.over === 0, looseOk: row.slack <= slackMax };
  let baseCeiling = ceiling;
  try { const b = loadAt(mode.base).tree?.[name]; if (b !== undefined) baseCeiling = entry(b, `tree ${name} at base`).ceiling; } catch { /* base predates the entry */ }
  const baseValue = value - await pinDelta(name, mode.base);
  const baseOver = Math.max(0, baseValue - baseCeiling);
  const baseLoose = baseCeiling - baseValue > slackMax;
  return { ...row, base: { ref: mode.base, value: baseValue, ceiling: baseCeiling, over: baseOver },
    inherited: row.over > 0 && row.over <= baseOver,
    ok: row.over <= baseOver, looseOk: row.slack <= slackMax || baseLoose };
}

/** A ceiling entry is a bare number, or {ceiling, slack} when its guard is tighter. */
function entry(raw, label) {
  const ceiling = typeof raw === "number" ? raw : raw?.ceiling;
  if (typeof ceiling !== "number") throw new Error(`${label}: no ceiling`);
  // NaN / Infinity compare false against everything, so such a ceiling would
  // never trip (and `value > NaN` reads as "under"): reject it by name.
  if (!Number.isFinite(ceiling)) throw new Error(`${label}: ceiling ${ceiling} is not a finite number`);
  if (typeof raw !== "number" && raw.slack !== undefined && !(Number.isFinite(raw.slack) && raw.slack >= 0)) {
    throw new Error(`${label}: slack ${raw.slack} is not a finite number >= 0`);
  }
  const dflt = Math.max(SLACK_MIN, Math.round(ceiling * SLACK_PCT));
  // slackRule names the rule this entry is held to, for the LOOSE message: an
  // explicit `slack` is its own rule, never the default it tightens.
  const rule = `max(${SLACK_MIN}, ${SLACK_PCT * 100}%) = ${dflt}`;
  if (typeof raw === "number") return { ceiling, slackMax: dflt, slackRule: rule };
  if (raw.slack === undefined) return { ceiling, slackMax: dflt, slackRule: rule };
  if (raw.slack > dflt) throw new Error(`${label}: slack ${raw.slack} is looser than the default ${dflt} — an entry may tighten the rule, never widen it`);
  return { ceiling, slackMax: raw.slack, slackRule: `the entry's own slack ${raw.slack}${raw.slack === 0 ? " (exact)" : ""}` };
}

/** One LOOSE row as a line: the slack it has and the rule it is held to. */
export function looseLine(r) {
  return `${r.file} ${r.metric}: ${r.value} but ceiling ${r.ceiling} (slack ${r.slack} > ${r.slackRule ?? r.slackMax})`;
}

/* PER-BRANCH RAISE FRAGMENTS (#2291, 2026-10-15). The commit hook's
 * --auto-raise wrote an ABSOLUTE ceiling into ratchets.json, so two open PRs
 * that both grew js/game.js (or apex.js) wrote different numbers on the same
 * line: #2231, #2242, #2254 and #2289 went DIRTY on this file alone while
 * their sources merged clean. Sorted one-entry-per-line keys
 * (merge-hygiene.mjs) cannot fix a same-line fight, and GitHub's mergeability
 * runs no custom merge driver. So an auto-raise on a topic branch writes a
 * DELTA to tests/data/ratchets.d/<branch>.json, a file only that branch
 * touches; the effective ceiling is ratchets.json plus every fragment.
 * Line counts add under a clean three-way merge, so the merged tip's ceiling
 * equals its value (tests/unit/ratchet-merge-hotspot.test.mjs). `--update` and
 * `--fold` write the sum back as absolutes and delete the fragments. */
const DEPLOY_BRANCH = "claude/f1-game-project-26h3ng";
export const FRAG_DIR = path.join(ROOT, "tests/data/ratchets.d");
const FRAG_REL = path.relative(ROOT, FRAG_DIR).split(path.sep).join("/");

/** ratchets.json alone, without the fragments. */
export function loadBase() {
  return JSON.parse(fs.readFileSync(DATA, "utf8"));
}

/** Every fragment on disk, as [{name, data}] sorted by name. */
export function readFragments(dir = FRAG_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .map((name) => ({ name, data: JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) }));
}

/** Baked data, not code: a size ceiling on it measures the data, not anyone's
 *  discipline, and every re-bake would trip it (#1659). applyFragments drops
 *  these rows, so neither the check nor --update ever sees them. */
export const EXCLUDED_FILES = new Set(["js/lighting/presets.js"]);

/** base + the deltas of every fragment. PURE. A delta for an entry that
 *  ratchets.json no longer carries (its file was deleted and --update dropped
 *  it) has nothing to move and is ignored. */
export function applyFragments(base, frags) {
  const out = JSON.parse(JSON.stringify(base));
  let label = "";
  const bump = (bag, metric, d) => {
    // Own keys only: `"constructor" in bag` is true on any object, and a
    // delta for a metric ratchets.json no longer carries is ignored by design.
    if (!bag || !Object.hasOwn(bag, metric)) return;
    if (typeof d !== "number" || !Number.isFinite(d)) throw new Error(`ratchets.d delta for ${label}${metric} must be a finite number, got ${JSON.stringify(d)}`);
    const raw = bag[metric];
    bag[metric] = typeof raw === "number" ? raw + d : { ...raw, ceiling: raw.ceiling + d };
  };
  for (const { data } of frags) {
    for (const [file, metrics] of Object.entries(data.files || {})) {
      label = `${file} `;
      const bag = out.files && Object.hasOwn(out.files, file) ? out.files[file] : null;
      for (const [m, d] of Object.entries(metrics)) bump(bag, m, d);
    }
    label = "tree ";
    for (const [m, d] of Object.entries(data.tree || {})) bump(out.tree, m, d);
  }
  for (const f of EXCLUDED_FILES) delete out.files?.[f];
  return out;
}

/** The effective ceilings: ratchets.json plus every fragment. */
export function load() {
  return applyFragments(loadBase(), readFragments());
}

/** The fragment name for the checked-out branch, or null where a fragment
 *  would be wrong: a detached HEAD, or the deploy branch itself (nothing
 *  merges into it except through a PR, so absolutes cannot fight there). */
export function fragmentName(branch) {
  if (!branch || branch === "HEAD" || branch === DEPLOY_BRANCH) return null;
  return branch.replace(/[^A-Za-z0-9._-]+/g, "--") + ".json";
}

function currentBranch() {
  try {
    return cp.execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
}

/** Files this branch changed against its merge-base with the deploy branch
 *  (committed, staged, unstaged, untracked), or null when no base is
 *  reachable. `APEX_RATCHETS_BASE` names the ref (tests). #2583: a delta that
 *  lowered files the branch never touched double-lowered the shared ceilings
 *  of every sibling PR. */
export function changedFiles() {
  const git = (...a) => cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const mb = mergeBase();
  if (!mb) return null;
  try {
    const out = [git("diff", "--name-only", mb), git("ls-files", "--others", "--exclude-standard")].join("\n");
    return new Set(out.split("\n").filter(Boolean));
  } catch { return null; }
}

/** This branch's merge-base with the deploy branch (`APEX_RATCHETS_BASE` names
 *  the ref in tests), or null when none is reachable. */
export function mergeBase() {
  const git = (...a) => cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  for (const ref of [process.env.APEX_RATCHETS_BASE, `origin/${DEPLOY_BRANCH}`, DEPLOY_BRANCH].filter(Boolean)) {
    try { return git("merge-base", ref, "HEAD"); } catch { /* try the next ref */ }
  }
  return null;
}

/* A BRANCH'S OWN TREE LOWERING (#4257, 2026-10-30). A topic fragment never
 * lowered a tree ceiling (#3996: a lowering snapped from a LOOSE base — one the
 * branch did not cause — left every sibling over once the first one merged). So
 * a branch that only REMOVED raw colours (rawColor 334 -> 321 at slack 0) failed
 * the one-slack rule with no sanctioned way out. The fix tells the two apart: a
 * tree metric that can be measured at a git ref (tree-counts AT_REF) is counted
 * at the merge-base, and the branch may lower its ceiling by its own reduction
 * and no further (`ownMin`, the branch's delta head - base, never above 0).
 * Deltas measured against the merge-base add under a clean merge exactly as
 * file line counts do, so siblings stay at ceiling == value. `ownFrag` is the
 * delta this branch's fragment already carries: an over row that only gives
 * back part of it (a colour re-added) re-snaps instead of blocking as a raise.
 * Rows outside AT_REF, or with no base, pass unchanged (the old rule). */
export async function attributeTree(rows, { name, base = mergeBase(), at } = {}) {
  if (!name || !base) return rows;
  const file = path.join(FRAG_DIR, name);
  const own = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).tree || {} : {};
  const out = [];
  for (const r of rows) {
    const ownFrag = own[r.metric] || 0;
    if (!(r.tree && (r.slack > r.slackMax || (r.over > 0 && ownFrag < 0)))) { out.push(r); continue; }
    at ||= (await import("./tree-counts.mjs")).AT_REF;   // only when a tree row needs it
    if (!Object.hasOwn(at, r.metric)) { out.push(r); continue; }
    try { out.push({ ...r, ownMin: Math.min(0, r.value - await at[r.metric](base)), ownFrag }); }
    catch { out.push(r); /* base not readable (a shallow clone): the old rule */ }
  }
  return out;
}

/** A topic-branch delta may RAISE anything, but LOWER only a file the branch
 *  changed; tree metrics are not attributable to one file and pass. */
export function scopeToBranch(rows, touched = changedFiles()) {
  // A tree-wide row enters a fragment only when it is AT or OVER its ceiling (a
  // deliberate `--update --fragment` raise). Snapping a LOOSE tree ceiling down to
  // this branch's count wrote e.g. assertPins −54 into every topic fragment: the
  // first sibling to merge one pin then left each of them over on the merge
  // result (2026-10-27, PRs #3970/#3981/#3985). Tree lowering is the deploy
  // branch's `--update` / `--fold`, never a topic branch's (#2583 for files) —
  // except by the branch's OWN reduction, measured at its merge-base (#4257:
  // attributeTree sets ownMin < 0, and mergeFragment bounds the delta by it).
  const treeOk = (r) => r.value >= r.ceiling || r.ownMin < 0;
  if (!touched) return rows.filter((r) => !r.tree || treeOk(r));
  return rows.filter((r) => (r.tree ? treeOk(r) : r.value >= r.ceiling || touched.has(r.file)));
}

/** Add `rows`' (value - ceiling) to fragment `frag` in place. A tree delta that
 *  nets below zero is dropped, not kept, unless the row carries the branch's own
 *  reduction (`ownMin`, attributeTree): then it is kept, never below ownMin.
 *  Before #3996 the commit hook wrote stale lowerings (assertPins −50) into open fragments; re-snapping one kept it
 *  negative at zero slack, so each pin the tip gained turned the PR red again
 *  (2026-10-27, #3970/#3981/#3985). Dropping it leaves the deploy's ceiling.
 *  Returns `frag`. PURE. */
export function mergeFragment(frag, rows) {
  for (const r of rows) {
    const scope = r.tree ? (frag.tree ||= {}) : ((frag.files ||= {})[r.file] ||= {});
    let d = (scope[r.metric] || 0) + (r.value - r.ceiling);
    if (r.tree && d < 0) d = r.ownMin < 0 ? Math.max(d, r.ownMin) : 0;
    if (d) scope[r.metric] = d; else delete scope[r.metric];
    if (!r.tree && !Object.keys(scope).length) delete frag.files[r.file];
  }
  return frag;
}

/** Merge `rows` into this branch's fragment; delete it when every delta nets
 *  to zero. */
async function writeFragment(name, rows) {
  const file = path.join(FRAG_DIR, name);
  const frag = mergeFragment(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {}, rows);
  const { stableStringify } = await import("./merge-hygiene.mjs");
  const empty = !Object.keys(frag.files || {}).length && !Object.keys(frag.tree || {}).length;
  if (empty) { fs.rmSync(file, { force: true }); return; }
  fs.mkdirSync(FRAG_DIR, { recursive: true });
  fs.writeFileSync(file, stableStringify(frag));
}

/** Write `data` (effective ceilings) as the new absolute ratchets.json and
 *  delete every fragment it now includes. */
async function writeAbsolute(data) {
  const { normalizeRatchets, stableStringify } = await import("./merge-hygiene.mjs");
  fs.writeFileSync(DATA, stableStringify(normalizeRatchets(data)));
  const names = readFragments().map((f) => f.name);
  for (const name of names) fs.rmSync(path.join(FRAG_DIR, name), { force: true });
  unlinkFolded(names);
}

/** A CEILING-HISTORY reason may name its branch's fragment by path; once the
 *  fragment is folded that path is gone and docs-integrity fails the fold's
 *  commit (ratchets-fold run 39277641065). Keep the name, drop the repo path. */
function unlinkFolded(names) {
  const file = path.join(ROOT, "docs/notes/CEILING-HISTORY.md");
  if (!names.length || !fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  let out = text;
  for (const n of names) out = out.split(`tests/data/ratchets.d/${n}`).join(`ratchets.d/${n} (folded)`);
  if (out !== text) fs.writeFileSync(file, out);
}

/** `--fold`: sum the fragments into ratchets.json. No measuring, so every
 *  effective ceiling is unchanged; only where the number lives moves. */
export async function fold() {
  const n = readFragments().length;
  await writeAbsolute(load());
  return n;
}

/** Scheduled fold (.github/workflows/ratchets-fold.yml): fold only once at least
 *  `min` fragments have piled up, so a quiet week opens no PR. Returns the count
 *  folded, or 0 when it was not yet due (nothing is touched). */
export async function foldIfDue(min = 1) {
  if (readFragments().length < Math.max(1, min)) return 0;
  return fold();
}

export async function measure(data = load()) {
  const rows = [];
  for (const [file, metrics] of Object.entries(data.files)) {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) { rows.push({ file, metric: "exists", value: 0, ceiling: 1, over: 1, slack: 0, missing: true }); continue; }
    const text = fs.readFileSync(abs, "utf8");
    for (const [metric, raw] of Object.entries(metrics)) {
      const fn = Object.hasOwn(METRICS, metric) ? METRICS[metric] : null;
      if (!fn) throw new Error(`${file}: unknown metric "${metric}" (known: ${Object.keys(METRICS).join(", ")})`);
      const value = await fn(file, text);
      const { ceiling, slackMax, slackRule } = entry(raw, `${file} ${metric}`);
      rows.push({ file, metric, value, ceiling, over: Math.max(0, value - ceiling), slack: ceiling - value, slackMax, slackRule });
    }
  }
  for (const [metric, raw] of Object.entries(data.tree || {})) {
    const fn = Object.hasOwn(TREE_METRICS, metric) ? TREE_METRICS[metric] : null;
    if (!fn) throw new Error(`tree: unknown metric "${metric}" (known: ${Object.keys(TREE_METRICS).join(", ")})`);
    const value = await fn();
    const { ceiling, slackMax, slackRule } = entry(raw, `tree ${metric}`);
    rows.push({ file: "(tree)", metric, value, ceiling, over: Math.max(0, value - ceiling), slack: ceiling - value, slackMax, slackRule, tree: true });
  }
  return rows;
}

/** Is a LOOSE ceiling (value BELOW it by more than its slack) advisory here?
 *  (R3-CI-HEALTH-1 follow-up, 2026-10-10.) Two green PRs that each remove one
 *  raw colour both write rawColor 338 -> 337; git merges the identical hunks
 *  cleanly, the merged tip measures 336, and a slack-0 entry then turned the
 *  DEPLOY TIP red on an improvement (ship runs 38042136314 / 38044675617) —
 *  holding the release train for an hour, on a push no author can `--update`
 *  from. So below-ceiling is advisory on every GitHub event but
 *  `pull_request` (push, schedule, the Pages call — whose event is the
 *  caller's — and dispatch), and stays fatal on a PR, where the author can
 *  lower it, and locally, where nothing sets GITHUB_EVENT_NAME (the commit
 *  hook lowers it on the way through). OVER a ceiling is fatal everywhere. */
export function looseAdvisory(env = process.env) {
  const ev = env.GITHUB_EVENT_NAME || "";
  return ev !== "" && ev !== "pull_request";
}

/** The pin rows of `rows` judged diff-relative (pinVerdict): an overage or a loose
 *  ceiling the base already had is marked `inherited` and drops out of the verdict,
 *  so a PR is red only for growth it adds. Other rows pass through unchanged. */
export async function relativize(rows, { env = process.env, data = load() } = {}) {
  const out = [];
  for (const r of rows) {
    if (!r.tree || !Object.hasOwn(PIN_METRICS, r.metric)) { out.push(r); continue; }
    const v = await pinVerdict(r.metric, { env, data });
    const row = { ...r, mode: v.mode, base: v.base };
    if (v.ok && r.over > 0) Object.assign(row, { over: 0, inherited: `over by ${r.over}, as the base ${v.base.ref.slice(0, 8)} already was (${v.base.over})` });
    else if (!v.ok && v.base) row.grew = `+${r.over - v.base.over} past the base ${v.base.ref.slice(0, 8)} (${v.base.value} at ceiling ${v.base.ceiling})`;
    if (v.looseOk && r.slack > r.slackMax) Object.assign(row, { slack: r.slackMax, inherited: row.inherited || `loose (slack ${r.slack}), as the base already was` });
    out.push(row);
  }
  return out;
}

export function verdict(rows, { looseAdvisory: advisory = false } = {}) {
  const over = rows.filter((r) => r.over > 0);
  const loose = rows.filter((r) => !r.missing && r.slack > r.slackMax);
  return { ok: over.length === 0 && (advisory || loose.length === 0), over, loose, looseAdvisory: advisory, rows };
}

export function updateReceipt(rows, { lowerOnly = false } = {}) {
  const changes = rows.filter((r) => !r.missing && r.value !== r.ceiling);
  return { changes: changes.filter((r) => !lowerOnly || r.value < r.ceiling),
    skippedRaises: changes.filter((r) => lowerOnly && r.value > r.ceiling),
    missing: rows.filter((r) => r.missing) };
}

export async function update(data = load(), { dryRun = false, lowerOnly = false } = {}) {
  const rows = await measure(data);
  if (dryRun) return rows;
  for (const r of updateReceipt(rows, { lowerOnly }).changes) {
    const bag = r.tree ? data.tree : data.files[r.file];
    const raw = bag[r.metric];
    bag[r.metric] = typeof raw === "number" ? r.value : { ...raw, ceiling: r.value };
  }
  // Sorted keys + one entry per line (tools/check/merge-hygiene.mjs); the
  // snap is absolute, so it folds the fragments in.
  await writeAbsolute(data);
  return rows;
}

/** `--update` as the CLI runs it (#2449 P2). The deploy branch and a detached
 *  HEAD snap absolutes as before. A topic branch writes its own fragment
 *  instead: "ratchets re-snapped once" rewrote the same ratchets.json lines on
 *  every open PR (28 of 71 conflicted syncs on 2026-10-16 after ratchets.d
 *  landed), and a delta is a file only this branch touches. Lowering is the
 *  same delta with a negative sign; `--absolute` (deploy.mjs's merge cure, which reads ratchets.json) and
 *  `--fold` are the explicit absolute snaps. */
export async function updateCli({ dryRun = false, lowerOnly = false, absolute = false, branch } = {}) {
  const name = absolute ? null : fragmentName(branch === undefined ? currentBranch() : branch);
  if (!name || dryRun) return { rows: await update(load(), { dryRun, lowerOnly }), fragment: null };
  const rows = await attributeTree(await measure(load()), { name });
  const scoped = scopeToBranch(updateReceipt(rows, { lowerOnly }).changes);
  await writeFragment(name, scoped);
  return { rows, fragment: `${FRAG_REL}/${name}`, scoped };
}

/** `--update --fragment` (#2337): snap to the measured values, but as this branch's
 *  fragment (a delta) instead of absolutes in ratchets.json, so a deliberate raise
 *  of a tree-wide metric (cssClasses, rawColor …) conflicts with no other PR. The
 *  caller owns the reason; the auto path still never raises a tree metric. */
export async function updateFragment(data = load(), { branch } = {}) {
  const name = fragmentName(branch === undefined ? currentBranch() : branch);
  if (!name) throw new Error("--fragment needs a topic branch (not the deploy branch or a detached HEAD)");
  const rows = await attributeTree(await measure(data), { name });
  await writeFragment(name, scopeToBranch(updateReceipt(rows).changes));
  return rows;
}

/** The commit hook's form (2026-09-16). One commit in five on the deploy branch
 *  hand-edited ratchets.json: `--update` writes the ceiling AT the value, so
 *  every commit that adds a line to game.js or apex.js failed `test:guards`,
 *  ran `--update` by hand, and re-ran the 16 s guards — then carried the most
 *  conflict-prone file in the repo into every merge. The rule that a raise is
 *  a deliberate edit with its reason in the commit is kept: the raise still
 *  lands in the commit's DIFF, printed here and staged by the hook, where blame
 *  and review see it. What goes is the manual round-trip, and only for small
 *  growth — anything past `maxRaise` still blocks, and a LOOSE ceiling is
 *  lowered on the way through (the direction the ratchet always allowed). */
/* `dryRun` CLASSIFIES WITHOUT WRITING, and it exists because the absence of it
 * was a live defect: tests/unit/ratchets.test.mjs called this to prove the
 * bound, which WROTE tests/data/ratchets.json on any tree that was over. The
 * suite then reported a red on the first run and a green on the second, having
 * silently raised a ceiling in between — a guard that edits the thing it
 * guards, with no commit and no human in the loop, and whose raise then rides
 * along in whatever commit happens next. Found 2026-09-16 when a four-node
 * shell addition made tooling-fast fail once and pass immediately after.
 * The commit hook still calls this WITHOUT dryRun: there the write is the
 * point, and it is staged into the diff a human reads. */
/* WHAT THE HOOK MAY ABSORB (2026-10-04): a per-file LINE count, nothing else.
 * autoRaise used to raise every row that was over by <= maxRaise — tree
 * metrics included — so a commit adding one zero-reference module raised
 * zeroRefModules 0 -> 1, or one expect-less spec raised implicitAsserts, and
 * staged it; CI's --base only warns below 40. Those counts are shrink-only
 * (several carry `slack: 0`, exact equality), and nothing else enforces them.
 * A tree metric, a non-line metric (gMembers, topLets, blanketOnlyRoutes) and
 * any entry with slack 0 now BLOCK with the reason; the fix is to shrink the
 * count, or `--update` with a reason in the commit. */
export const AUTO_RAISE_METRICS = new Set(["lines", "codeLines"]);
export function autoRaiseBlockReason(r, maxRaise = 40) {
  if (r.missing) return "the file is missing";
  // Giving back part of this branch's own tree lowering is not a raise (attributeTree).
  if (r.tree && r.ownFrag < 0 && r.over <= -r.ownFrag) return null;
  if (r.tree) return "a tree-wide metric is shrink-only — never auto-raised";
  if (!AUTO_RAISE_METRICS.has(r.metric)) return `${r.metric} is not a line count — never auto-raised`;
  if (r.slackMax === 0) return "its entry carries slack 0 (exact) — never auto-raised";
  if (r.over > maxRaise) return `past the ${maxRaise}-line auto-raise`;
  return null;
}

export async function autoRaise({ maxRaise = 40, dryRun = false, data = load(), branch } = {}) {
  // On a topic branch the fragment (FRAG_DIR) takes the change; the deploy
  // branch or a detached HEAD snaps the absolutes as before.
  const name = fragmentName(branch === undefined ? currentBranch() : branch);
  const v = verdict(await attributeTree(await relativize(await measure(data), { data }), { name }));
  const big = v.over.map((r) => ({ ...r, reason: autoRaiseBlockReason(r, maxRaise) })).filter((r) => r.reason);
  if (big.length) return { ok: false, raised: [], lowered: [], blocked: big };
  if (!v.over.length && !v.loose.length) return { ok: true, raised: [], lowered: [], blocked: [] };
  if (dryRun) {
    return { ok: true, dryRun: true, blocked: [],
             raised: v.over.map((r) => ({ file: r.file, metric: r.metric })),
             lowered: v.loose.map((r) => ({ file: r.file, metric: r.metric })) };
  }
  let rows;
  if (name) {
    rows = await attributeTree(await measure(data), { name });
    await writeFragment(name, scopeToBranch(updateReceipt(rows).changes));
  } else rows = await update(data);
  const key = (r) => `${r.file} ${r.metric}`;
  const raised = rows.filter((r) => v.over.some((o) => key(o) === key(r)));
  const lowered = rows.filter((r) => v.loose.some((o) => key(o) === key(r)));
  return { ok: true, raised, lowered, blocked: [] };
}

/** The ceiling of a raw entry (a bare number or {ceiling, slack}). */
const ceilingOf = (raw) => (typeof raw === "number" ? raw : raw.ceiling);
/** An entry's slack when it SETS one (a tightened rule), else null (the default,
 *  which scales with the ceiling and is not a choice anybody made). */
const explicitSlack = (raw) => (typeof raw === "object" && raw && typeof raw.slack === "number" ? raw.slack : null);

/** Every ceiling that differs between two ratchets.json documents, as rows
 *  {file, metric, base, now, delta, kind: "raise"|"lower"|"new"|"gone"}.
 *  PURE — the CI step and its test both go through here. */
export function diffRatchets(base, current) {
  const rows = [];
  const walk = (bagBase, bagNow, file) => {
    for (const [metric, raw] of Object.entries(bagNow || {})) {
      const now = ceilingOf(raw);
      if (!bagBase || !(metric in bagBase)) { rows.push({ file, metric, base: null, now, delta: null, kind: "new" }); continue; }
      const b = ceilingOf(bagBase[metric]);
      if (now !== b) rows.push({ file, metric, base: b, now, delta: now - b, kind: now > b ? "raise" : "lower" });
      // A loosened slack is a raise in disguise: `{ceiling: 3, slack: 0}` is exact equality
      // ("shrink-only"), and rewriting it as `3` hands back the default 60 lines of room (15-F10).
      const sb = explicitSlack(bagBase[metric]), sn = explicitSlack(raw);
      // (a base slack that was the default cannot be loosened; a ceiling that moves rescales it)
      if (sb !== null && (sn === null || sn > sb)) rows.push({ file, metric, base: sb, now: sn, delta: sn === null ? null : sn - sb, kind: "loosen" });
    }
    for (const metric of Object.keys(bagBase || {})) if (!bagNow || !(metric in bagNow))
      rows.push({ file, metric, base: ceilingOf(bagBase[metric]), now: null, delta: null, kind: "gone" });
  };
  const files = new Set([...Object.keys(base.files || {}), ...Object.keys(current.files || {})]);
  for (const f of [...files].sort()) walk(base.files?.[f], current.files?.[f], f);
  walk(base.tree, current.tree, "(tree)");
  return rows;
}

/** `git show <ref>:tests/data/ratchets.json`, parsed. Throws with the git
 *  message when the ref (or the file at that ref) is unreachable — a shallow
 *  clone is the usual cause, and the caller's exit code says so. */
export function loadAt(ref) {
  const show = (rel) => cp.execFileSync("git", ["show", `${ref}:${rel}`],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const base = JSON.parse(show(path.relative(ROOT, DATA).split(path.sep).join("/")));
  // The fragments at <ref> too: --base compares EFFECTIVE ceilings, so a
  // raise is named once, whichever file carries it.
  const names = cp.execFileSync("git", ["ls-tree", "--name-only", `${ref}`, `${FRAG_REL}/`],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).split("\n").filter((f) => f.endsWith(".json")).sort();
  return applyFragments(base, names.map((f) => ({ name: path.basename(f), data: JSON.parse(show(f)) })));
}

/** True when `docs/notes/CEILING-HISTORY.md` differs from <ref> — the written
 *  reason that lets a raise past the 40-line absorb clear on a PR (owner
 *  decision 2026-10-10: "raises with a stated reason are fine"). Without it a
 *  remesaure that cures a red deploy tip (#1437 / ship OVER after stacked HUD
 *  merges) can never go green: the message says "needs a reason in the PR" but
 *  the exit stayed 1 with no machine check for the reason. */
export function ceilingHistoryReasoned(ref) {
  try {
    const out = cp.execFileSync("git", ["diff", "--name-only", `${ref}`, "--", "docs/notes/CEILING-HISTORY.md"],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return out.trim().length > 0;
  } catch { return false; }
}

/**
 * How much a sync file metric grew between `ref` and the working tree.
 * Returns null when the metric is async/tree-scoped or the file is missing at
 * either side — callers treat null as "not a catch-up" (keep the hard fail).
 * `lines` / `codeLines` / `topLets` are the sync metrics the absorb gate cares about.
 */
export function sourceGrowth(ref, file, metric) {
  if (!file || file === "(tree)") return null;
  const fn = METRICS[metric];
  if (typeof fn !== "function" || fn.constructor?.name === "AsyncFunction") return null;
  let baseText;
  try {
    baseText = cp.execFileSync("git", ["show", `${ref}:${file}`], {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024,
    });
  } catch { return null; }
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) return null;
  const nowText = fs.readFileSync(abs, "utf8");
  const a = fn(file, baseText), b = fn(file, nowText);
  if (typeof a !== "number" || typeof b !== "number") return null;
  return b - a;
}

/** `--base <ref>`: every ceiling that moved since <ref>. A loosened slack, or a
 *  deleted entry whose file still exists, blocks like a raise past the absorb
 *  (15-F10). Raises are warnings (GitHub `::warning::` annotations on CI, plain
 *  lines elsewhere). A raise past `maxRaise` fails only when the SOURCE file's
 *  metric also grew past `maxRaise` since <ref> — a ceiling catch-up (file
 *  delta ≤ absorb; other PRs already landed the lines) is a warning. A raise
 *  that is still past absorb soft-passes when CEILING-HISTORY.md also moved
 *  (deliberate remesaure with a written reason). `sourceGrowthFn` /
 *  `historyReasoned` are injectable for tests. Returns the exit code. */
export function compareToBase(ref, {
  maxRaise = 40, current = load(), print = console.log, advisory = false,
  sourceGrowthFn = sourceGrowth, historyReasoned = undefined,
} = {}) {
  let base;
  try { base = loadAt(ref); }
  catch (e) { print(`ratchets --base: cannot read tests/data/ratchets.json at ${ref} (${String(e.stderr || e.message).trim().split("\n")[0]}) — is the checkout deep enough (fetch-depth: 0)?`); return 2; }
  const rows = diffRatchets(base, current);
  const gh = process.env.GITHUB_ACTIONS === "true";
  const reasoned = historyReasoned === undefined ? ceilingHistoryReasoned(ref) : !!historyReasoned;
  let blocked = 0; // named past-absorb / loosen / gone-guard rows (summary)
  let fatal = 0;   // rows that still fail the PR run
  for (const r of rows) {
    const where = `${r.file} ${r.metric}`;
    if (r.kind === "raise") {
      let over = r.delta > maxRaise;
      let growth = null;
      if (over) {
        growth = sourceGrowthFn(ref, r.file, r.metric);
        // Catch-up: ceiling tracks size that is already on the tree at both
        // sides (or grew within the absorb). Only real source growth past
        // absorb keeps the hard fail — that is what the hook was for.
        if (growth !== null && growth <= maxRaise) over = false;
      }
      // A raise past absorb with a CEILING-HISTORY reason is the remesaure
      // path: still named (and annotated), but not a red — the history file
      // carries the why. Without it (and not advisory) it stays fatal.
      if (over) {
        blocked++;
        if (!advisory && !reasoned) fatal++;
      }
      const msg = `RAISE  ${where}: ${r.base} -> ${r.now} (+${r.delta})` + (over
        ? ` — past the ${maxRaise}-line commit-hook absorb: this needs a reason in the PR` + (advisory ? " (advisory on a push: the PR run is the gate)" : reasoned ? " (reason recorded in docs/notes/CEILING-HISTORY.md)" : "")
        : (r.delta > maxRaise && growth !== null
          ? ` — catch-up (source ${r.metric} grew ${growth} ≤ ${maxRaise}; ceiling tracks already-landed size)`
          : ""));
      print(gh ? `::${over && !advisory && !reasoned ? "error" : "warning"} file=tests/data/ratchets.json,title=ratchet raised::${msg}` : msg);
    } else if (r.kind === "lower") print(`LOWER  ${where}: ${r.base} -> ${r.now} (${r.delta})`);
    else if (r.kind === "new") print(`NEW    ${where}: ${r.now}`);
    else if (r.kind === "loosen") {
      blocked++;
      if (!advisory) fatal++;
      const msg = `LOOSEN ${where}: slack ${r.base} -> ${r.now ?? "default"} — a ratchet that tightened its own slack was widened; this needs a reason in the PR` + (advisory ? " (advisory on a push: the PR run is the gate)" : "");
      print(gh ? `::${advisory ? "warning" : "error"} file=tests/data/ratchets.json,title=ratchet loosened::${msg}` : msg);
    } else {
      // A deleted entry for a file/metric that still exists removes a guard; one whose
      // file is gone (or a whole tree metric dropped with its tool) is a normal cleanup.
      const guardRemoved = r.file === "(tree)" || fs.existsSync(path.join(ROOT, r.file));
      if (guardRemoved) {
        blocked++;
        if (!advisory) fatal++;
        const msg = `GONE   ${where}: was ${r.base} — the entry was deleted but ${r.file === "(tree)" ? "it is a tree metric" : "the file still exists"}; this needs a reason in the PR` + (advisory ? " (advisory on a push: the PR run is the gate)" : "");
        print(gh ? `::${advisory ? "warning" : "error"} file=tests/data/ratchets.json,title=ratchet removed::${msg}` : msg);
      } else print(`GONE   ${where}: was ${r.base}`);
    }
  }
  const raises = rows.filter((r) => r.kind === "raise").length;
  print(`ratchets --base ${ref}: ${rows.length} ceiling(s) moved (${raises} raised, ${rows.filter((r) => r.kind === "lower").length} lowered, ${rows.filter((r) => r.kind === "new").length} new, ${rows.filter((r) => r.kind === "gone").length} gone)` + (blocked ? ` — ${blocked} past the ${maxRaise}-line absorb${advisory ? " (advisory)" : reasoned ? " (history-reasoned)" : ""}` : ""));
  // ADVISORY ON A PUSH. A raise that is still a hard fail (real source growth
  // past absorb, no CEILING-HISTORY reason) has no PR body on a push run, so
  // failing there is a red that cannot be cleared by pushing again. Ten of the
  // fourteen ci.yml failures on 2026-09-22 were this one message repeated on
  // the same branch's pushes (eight of them on one branch), each a wasted run
  // and a re-push into the same wall. The push run now annotates; the
  // pull_request run still fails when the source grew past absorb and
  // CEILING-HISTORY.md did not move.
  return fatal ? 1 : 0;
}

/** `--seed=<metric>`: add a tree metric that ratchets.json does not carry yet,
 *  at its measured value (a new metric is not a raise). Writes only that key into
 *  ratchets.json itself; fragments are left alone. Refuses an existing key. */
export async function seedTreeMetric(metric, { slack, dryRun = false } = {}) {
  if (!Object.hasOwn(TREE_METRICS, metric)) throw new Error(`--seed: unknown tree metric "${metric}" (known: ${Object.keys(TREE_METRICS).join(", ")})`);
  const base = loadBase();
  if (Object.hasOwn(base.tree || {}, metric) || Object.hasOwn(load().tree || {}, metric))
    throw new Error(`--seed: tree.${metric} already has a ceiling — that is a raise or a lower, not a seed (--update)`);
  const value = await TREE_METRICS[metric]();
  (base.tree ||= {})[metric] = slack === undefined ? value : { ceiling: value, slack };
  if (!dryRun) {
    const { normalizeRatchets, stableStringify } = await import("./merge-hygiene.mjs");
    fs.writeFileSync(DATA, stableStringify(normalizeRatchets(base)));
  }
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  // --help answers from the header without measuring the tree (audit4 cli-help: it took 10 s).
  if (argv.includes("--help") || argv.includes("-h")) {
    const head = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(4, 21);
    console.log(["usage:", ...head.map((l) => l.replace(/^\/\/ ?/, ""))].join("\n"));
    return;
  }
  const seed = argv.find((a) => a.startsWith("--seed="));
  if (seed) {
    const sl = argv.find((a) => a.startsWith("--slack="));
    try {
      const v = await seedTreeMetric(seed.slice("--seed=".length), { slack: sl ? Number(sl.split("=")[1]) : undefined });
      console.log(`ratchets --seed: tree.${seed.slice("--seed=".length)} = ${v} written to tests/data/ratchets.json (a new ceiling at today's value)`);
    } catch (e) { console.error(`ratchets: ${e.message}`); process.exitCode = 2; }
    return;
  }
  const sites = argv.find((a) => a.startsWith("--pin-sites="));
  if (sites) {
    const name = sites.slice("--pin-sites=".length);
    if (!Object.hasOwn(PIN_METRICS, name)) { console.error(`ratchets: --pin-sites: unknown pin metric "${name}" (known: ${Object.keys(PIN_METRICS).join(", ")})`); process.exitCode = 2; return; }
    const per = (await pinSites(name)).sort((a, b) => b[1] - a[1]);
    for (const [rel, n] of per) console.log(`${String(n).padStart(6)}  ${rel}`);
    console.log(`${name}: ${per.reduce((a, [, n]) => a + n, 0)} sites in ${per.length} files`);
    return;
  }
  const baseAt = argv.indexOf("--base");
  if (baseAt >= 0) {
    const ref = argv[baseAt + 1];
    if (!ref || ref.startsWith("-")) { console.error("ratchets: --base needs a ref"); process.exitCode = 2; return; }
    const mr = argv.find((a) => a.startsWith("--max-raise="));
    process.exitCode = compareToBase(ref, { maxRaise: mr ? Number(mr.split("=")[1]) || 40 : 40, advisory: argv.includes("--advisory") });
    return;
  }
  if (argv.includes("--update") || argv.includes("--preview") || argv.includes("--lower-only")) {
    const dryRun = argv.includes("--preview"), lowerOnly = argv.includes("--lower-only");
    const asFragment = argv.includes("--fragment");
    const reason = (argv.find((x) => x.startsWith("--reason=")) || "").slice("--reason=".length).trim();
    if (asFragment && (dryRun || lowerOnly)) { console.error("--fragment goes with --update only"); process.exitCode = 2; return; }
    if (asFragment && !reason) { console.error('--fragment raises a ceiling deliberately: pass --reason="<why>" and repeat it in the commit message'); process.exitCode = 2; return; }
    const { rows, fragment, scoped } = asFragment ? { rows: await updateFragment(load()), fragment: null } : await updateCli({ dryRun, lowerOnly, absolute: argv.includes("--absolute") });
    if (asFragment) console.log(`ratchets --update --fragment: wrote this branch's delta to tests/data/ratchets.d/ (ratchets.json untouched); reason: ${reason}`);
    const receipt = updateReceipt(rows, { lowerOnly });
    if (argv.includes("--json")) console.log(JSON.stringify({ ok: receipt.missing.length === 0, dryRun, lowerOnly, ...receipt }, null, 2));
    else {
      // A topic fragment takes only scopeToBranch's rows; name the rest instead of claiming them.
      const taken = new Set((scoped || receipt.changes).map((r) => `${r.file} ${r.metric}`));
      for (const r of receipt.changes) console.log(taken.has(`${r.file} ${r.metric}`)
        ? `${dryRun ? "WOULD " : ""}${r.file} ${r.metric}: ${r.ceiling} -> ${r.value}`
        : `KEPT   ${r.file} ${r.metric}: ${r.ceiling} (${r.value} now, not this branch's own change — the deploy branch's --update lowers it)`);
      for (const r of receipt.skippedRaises) console.log(`SKIP RAISE ${r.file} ${r.metric}: ${r.ceiling} -> ${r.value}`);
      for (const r of receipt.missing) console.error(`MISSING ${r.file}`);
      if (fragment && scoped?.length) console.log(`ratchets --update: topic branch, so the change is a delta in ${fragment}, not an edit of ratchets.json (add it to your commit; \`--fold\` snaps absolutes)`);
    }
    process.exitCode = receipt.missing.length ? 1 : 0;
    return;
  }
  if (argv.includes("--fold")) {
    const minArg = argv.find((a) => a.startsWith("--min-fragments="));
    const n = minArg ? await foldIfDue(Number(minArg.split("=")[1]) || 1) : await fold();
    if (minArg && !n) { console.log(`ratchets --fold: fewer than ${minArg.split("=")[1]} fragment(s), nothing folded`); return; }
    console.log(`ratchets --fold: ${n} fragment(s) summed into tests/data/ratchets.json and deleted; every effective ceiling unchanged`);
    return;
  }
  const auto = argv.find((a) => a.startsWith("--auto-raise"));
  if (auto) {
    // No `=N`: the hook's absorb. A Ratchet-Reason trailer lifts 20 to 40;
    // a bare shell-guard call (no commit message) stays at the silent cap.
    // An explicit `--auto-raise=N` keeps N, including the historical 40.
    const maxRaise = auto.includes("=") ? (Number(auto.split("=")[1]) || 40) : absorbLimit(readCommitMessage());
    const r = await autoRaise({ maxRaise });
    for (const x of r.raised) console.log(`RAISED ${x.file} ${x.metric}: ${x.ceiling} -> ${x.value} (+${x.value - x.ceiling}, within the ${maxRaise}-line auto-raise; it is in this commit's diff: ${fragmentName(currentBranch()) ? `tests/data/ratchets.d/${fragmentName(currentBranch())}` : "tests/data/ratchets.json"})`);
    for (const x of r.lowered) console.log(`LOWERED ${x.file} ${x.metric}: ${x.ceiling} -> ${x.value}`);
    for (const x of r.blocked) console.log(`OVER   ${x.file} ${x.metric}: ${x.value} > ceiling ${x.ceiling} (+${x.over}) — ${x.reason}: ${x.tree || x.slackMax === 0 ? "shrink it back" : "extract"}, or raise it deliberately (node tools/check/ratchets.mjs --update --fragment --reason="<why>") and say why in the commit`);
    process.exitCode = r.ok ? 0 : 1;
    return;
  }
  let v;
  try { v = verdict(await relativize(await measure()), { looseAdvisory: looseAdvisory() }); }
  catch (e) { console.error(`ratchets: ${e.message}`); process.exitCode = 2; return; }
  if (argv.includes("--json")) { console.log(JSON.stringify(v, null, 2)); process.exitCode = v.ok ? 0 : 1; return; }
  // A tree metric's number says something drifted; --offenders says WHERE, which
  // is the half a bare count cannot carry.
  const where = (r) => (!r.tree ? "" : Object.hasOwn(PIN_METRICS, r.metric)
    ? ` — breakdown: node --test ${{ assertPins: "tests/unit/assert-match-ratchet.test.mjs", assertPinsAll: "tests/unit/assert-match-ratchet.test.mjs (per file: node tools/check/ratchets.mjs --pin-sites=assertPinsAll)", rawGameReads: "tests/unit/source-pin-hygiene.test.mjs", vmSrcLoads: "tests/unit/vm-filename-lint.test.mjs" }[r.metric]}`
    : " — breakdown: node tools/check/tree-counts.mjs --offenders");
  for (const r of v.over) console.log(`OVER   ${r.file} ${r.metric}: ${r.value} > ceiling ${r.ceiling} (+${r.over}${r.grew ? `, ${r.grew}` : ""}) — extract, or raise it deliberately and say why in the commit${where(r)}`);
  for (const r of v.rows.filter((x) => x.inherited)) {
    const msg = `INHERITED ${r.file} ${r.metric}: ${r.value} vs ceiling ${r.ceiling} — ${r.inherited}; not this change's (APEX_RATCHET_ABSOLUTE=1 judges the tree alone)`;
    console.log(process.env.GITHUB_ACTIONS === "true" ? `::warning file=tests/data/ratchets.json,title=ratchet inherited::${msg}` : msg);
  }
  for (const r of v.loose) {
    const msg = `LOOSE  ${looseLine(r)} — lower it: node tools/check/ratchets.mjs --update --lower-only`
      + (v.looseAdvisory ? ` (advisory on ${process.env.GITHUB_EVENT_NAME}: an improvement; the PR run is the gate)` : "");
    console.log(v.looseAdvisory && process.env.GITHUB_ACTIONS === "true"
      ? `::warning file=tests/data/ratchets.json,title=ratchet loose::${msg}` : msg);
  }
  if (v.ok) {
    const d = load();
    console.log(`ratchets: ${v.rows.length} metrics on ${Object.keys(d.files).length} files + ${Object.keys(d.tree || {}).length} tree-wide, all at or under their ceilings`);
  }
  process.exitCode = v.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
