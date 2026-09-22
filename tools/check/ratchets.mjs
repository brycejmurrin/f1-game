// ratchets.mjs — ONE ratchet mechanism for the numbers that only ever grow.
// @doc Size ratchets from `tests/data/ratchets.json`: `--check` (default), `--update` snaps ceilings down, `--json`, `--base <ref>` names raises.
//
//   node tools/check/ratchets.mjs            # check: every metric <= its ceiling, no ceiling far above its value
//   node tools/check/ratchets.mjs --update   # rewrite ratchets.json with the current values (after an extraction,
//                                      #   or on a merged tree — the deploy-merge rule)
//   node tools/check/ratchets.mjs --json     # {ok, rows:[{file, metric, value, ceiling, over, slack}]}
//   node tools/check/ratchets.mjs --base <ref> [--max-raise=40] [--advisory]   # --advisory: a raise past the absorb
//                                      #   annotates instead of failing — for PUSH runs, where no PR body can carry the reason
//                                      # every ceiling that moved since <ref> (git show); raises are
//                                      #   warnings, a raise past the commit hook's absorb fails —
//                                      #   ci.yml's guards job runs this against the PR base / deploy tip
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
};

/** A ceiling entry is a bare number, or {ceiling, slack} when its guard is tighter. */
function entry(raw, label) {
  const ceiling = typeof raw === "number" ? raw : raw.ceiling;
  if (typeof ceiling !== "number") throw new Error(`${label}: no ceiling`);
  const dflt = Math.max(SLACK_MIN, Math.round(ceiling * SLACK_PCT));
  if (typeof raw === "number") return { ceiling, slackMax: dflt };
  if (raw.slack === undefined) return { ceiling, slackMax: dflt };
  if (raw.slack > dflt) throw new Error(`${label}: slack ${raw.slack} is looser than the default ${dflt} — an entry may tighten the rule, never widen it`);
  return { ceiling, slackMax: raw.slack };
}

export function load() {
  return JSON.parse(fs.readFileSync(DATA, "utf8"));
}

export async function measure(data = load()) {
  const rows = [];
  for (const [file, metrics] of Object.entries(data.files)) {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) { rows.push({ file, metric: "exists", value: 0, ceiling: 1, over: 1, slack: 0, missing: true }); continue; }
    const text = fs.readFileSync(abs, "utf8");
    for (const [metric, raw] of Object.entries(metrics)) {
      const fn = METRICS[metric];
      if (!fn) throw new Error(`${file}: unknown metric "${metric}" (known: ${Object.keys(METRICS).join(", ")})`);
      const value = await fn(file, text);
      const { ceiling, slackMax } = entry(raw, `${file} ${metric}`);
      rows.push({ file, metric, value, ceiling, over: Math.max(0, value - ceiling), slack: ceiling - value, slackMax });
    }
  }
  for (const [metric, raw] of Object.entries(data.tree || {})) {
    const fn = TREE_METRICS[metric];
    if (!fn) throw new Error(`tree: unknown metric "${metric}" (known: ${Object.keys(TREE_METRICS).join(", ")})`);
    const value = await fn();
    const { ceiling, slackMax } = entry(raw, `tree ${metric}`);
    rows.push({ file: "(tree)", metric, value, ceiling, over: Math.max(0, value - ceiling), slack: ceiling - value, slackMax, tree: true });
  }
  return rows;
}

export function verdict(rows) {
  const over = rows.filter((r) => r.over > 0);
  const loose = rows.filter((r) => !r.missing && r.slack > r.slackMax);
  return { ok: over.length === 0 && loose.length === 0, over, loose, rows };
}

export async function update(data = load()) {
  const rows = await measure(data);
  for (const r of rows) {
    if (r.missing) continue;
    const bag = r.tree ? data.tree : data.files[r.file];
    const raw = bag[r.metric];
    bag[r.metric] = typeof raw === "number" ? r.value : { ...raw, ceiling: r.value };
  }
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2) + "\n");
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
export async function autoRaise({ maxRaise = 40, dryRun = false } = {}) {
  const data = load();
  const v = verdict(await measure(data));
  const big = v.over.filter((r) => r.over > maxRaise || r.missing);
  if (big.length) return { ok: false, raised: [], lowered: [], blocked: big };
  if (!v.over.length && !v.loose.length) return { ok: true, raised: [], lowered: [], blocked: [] };
  if (dryRun) {
    return { ok: true, dryRun: true, blocked: [],
             raised: v.over.map((r) => ({ file: r.file, metric: r.metric })),
             lowered: v.loose.map((r) => ({ file: r.file, metric: r.metric })) };
  }
  const rows = await update(data);
  const key = (r) => `${r.file} ${r.metric}`;
  const raised = rows.filter((r) => v.over.some((o) => key(o) === key(r)));
  const lowered = rows.filter((r) => v.loose.some((o) => key(o) === key(r)));
  return { ok: true, raised, lowered, blocked: [] };
}

/** The ceiling of a raw entry (a bare number or {ceiling, slack}). */
const ceilingOf = (raw) => (typeof raw === "number" ? raw : raw.ceiling);

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
  const out = cp.execFileSync("git", ["show", `${ref}:${path.relative(ROOT, DATA).split(path.sep).join("/")}`],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out);
}

/** `--base <ref>`: every ceiling that moved since <ref>. Raises are warnings
 *  (GitHub `::warning::` annotations on CI, plain lines elsewhere); a raise
 *  past `maxRaise` — the commit hook's own absorb, so only APEX_SKIP_GUARDS
 *  could have produced it — fails. Returns the exit code. */
export function compareToBase(ref, { maxRaise = 40, current = load(), print = console.log, advisory = false } = {}) {
  let base;
  try { base = loadAt(ref); }
  catch (e) { print(`ratchets --base: cannot read tests/data/ratchets.json at ${ref} (${String(e.stderr || e.message).trim().split("\n")[0]}) — is the checkout deep enough (fetch-depth: 0)?`); return 2; }
  const rows = diffRatchets(base, current);
  const gh = process.env.GITHUB_ACTIONS === "true";
  let blocked = 0;
  for (const r of rows) {
    const where = `${r.file} ${r.metric}`;
    if (r.kind === "raise") {
      const over = r.delta > maxRaise;
      if (over) blocked++;
      const msg = `RAISE  ${where}: ${r.base} -> ${r.now} (+${r.delta})` + (over
        ? ` — past the ${maxRaise}-line commit-hook absorb: this needs a reason in the PR` + (advisory ? " (advisory on a push: the PR run is the gate)" : "")
        : "");
      print(gh ? `::${over && !advisory ? "error" : "warning"} file=tests/data/ratchets.json,title=ratchet raised::${msg}` : msg);
    } else if (r.kind === "lower") print(`LOWER  ${where}: ${r.base} -> ${r.now} (${r.delta})`);
    else if (r.kind === "new") print(`NEW    ${where}: ${r.now}`);
    else print(`GONE   ${where}: was ${r.base}`);
  }
  const raises = rows.filter((r) => r.kind === "raise").length;
  print(`ratchets --base ${ref}: ${rows.length} ceiling(s) moved (${raises} raised, ${rows.filter((r) => r.kind === "lower").length} lowered, ${rows.filter((r) => r.kind === "new").length} new, ${rows.filter((r) => r.kind === "gone").length} gone)` + (blocked ? ` — ${blocked} past the ${maxRaise}-line absorb${advisory ? " (advisory)" : ""}` : ""));
  // ADVISORY ON A PUSH. The reason for a raise past the absorb lives in a PR
  // body, and a push run has no PR — so failing there is a red that cannot
  // be cleared by pushing again. Ten of the fourteen ci.yml failures on
  // 2026-09-22 were this one message repeated on the same branch's pushes
  // (eight of them on one branch), each a wasted run and a re-push into the
  // same wall. The push run now annotates; the pull_request run still fails.
  return blocked && !advisory ? 1 : 0;
}

async function main() {
  const argv = process.argv.slice(2);
  const baseAt = argv.indexOf("--base");
  if (baseAt >= 0) {
    const ref = argv[baseAt + 1];
    if (!ref || ref.startsWith("-")) { console.error("ratchets: --base needs a ref"); process.exitCode = 2; return; }
    const mr = argv.find((a) => a.startsWith("--max-raise="));
    process.exitCode = compareToBase(ref, { maxRaise: mr ? Number(mr.split("=")[1]) || 40 : 40, advisory: argv.includes("--advisory") });
    return;
  }
  if (argv.includes("--update")) {
    const rows = await update();
    for (const r of rows) console.log(`${r.file} ${r.metric}: ${r.ceiling} -> ${r.value}`);
    return;
  }
  const auto = argv.find((a) => a.startsWith("--auto-raise"));
  if (auto) {
    const maxRaise = Number(auto.split("=")[1]) || 40;
    const r = await autoRaise({ maxRaise });
    for (const x of r.raised) console.log(`RAISED ${x.file} ${x.metric}: ${x.ceiling} -> ${x.value} (+${x.value - x.ceiling}, within the ${maxRaise}-line auto-raise; it is in this commit's diff)`);
    for (const x of r.lowered) console.log(`LOWERED ${x.file} ${x.metric}: ${x.ceiling} -> ${x.value}`);
    for (const x of r.blocked) console.log(`OVER   ${x.file} ${x.metric}: ${x.value} > ceiling ${x.ceiling} (+${x.over}) — past the ${maxRaise}-line auto-raise: extract, or raise it deliberately (node tools/check/ratchets.mjs --update) and say why in the commit`);
    process.exitCode = r.ok ? 0 : 1;
    return;
  }
  let v;
  try { v = verdict(await measure()); }
  catch (e) { console.error(`ratchets: ${e.message}`); process.exitCode = 2; return; }
  if (argv.includes("--json")) { console.log(JSON.stringify(v, null, 2)); process.exitCode = v.ok ? 0 : 1; return; }
  // A tree metric's number says something drifted; --offenders says WHERE, which
  // is the half a bare count cannot carry.
  const where = (r) => (r.tree ? " — breakdown: node tools/check/tree-counts.mjs --offenders" : "");
  for (const r of v.over) console.log(`OVER   ${r.file} ${r.metric}: ${r.value} > ceiling ${r.ceiling} (+${r.over}) — extract, or raise it deliberately and say why in the commit${where(r)}`);
  for (const r of v.loose) console.log(`LOOSE  ${r.file} ${r.metric}: ${r.value} but ceiling ${r.ceiling} (slack ${r.slack} > ${r.slackMax}) — lower it: node tools/check/ratchets.mjs --update`);
  if (v.ok) {
    const d = load();
    console.log(`ratchets: ${v.rows.length} metrics on ${Object.keys(d.files).length} files + ${Object.keys(d.tree || {}).length} tree-wide, all at or under their ceilings`);
  }
  process.exitCode = v.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
