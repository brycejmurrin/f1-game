// ratchets.mjs — ONE ratchet mechanism for the numbers that only ever grow.
// @doc Size ratchets from `tests/data/ratchets.json`: `--check` (default), `--update` snaps every ceiling down, `--json`.
//
//   node tools/check/ratchets.mjs            # check: every metric <= its ceiling, no ceiling far above its value
//   node tools/check/ratchets.mjs --update   # rewrite ratchets.json with the current values (after an extraction,
//                                      #   or on a merged tree — the deploy-merge rule)
//   node tools/check/ratchets.mjs --json     # {ok, rows:[{file, metric, value, ceiling, over, slack}]}
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
// ONE slack rule: a ceiling more than max(SLACK_MIN, SLACK_PCT of itself) above
// its value has stopped ratcheting; lower it (`--update`).
import fs from "node:fs";
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

export function load() {
  return JSON.parse(fs.readFileSync(DATA, "utf8"));
}

export async function measure(data = load()) {
  const rows = [];
  for (const [file, metrics] of Object.entries(data.files)) {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) { rows.push({ file, metric: "exists", value: 0, ceiling: 1, over: 1, slack: 0, missing: true }); continue; }
    const text = fs.readFileSync(abs, "utf8");
    for (const [metric, ceiling] of Object.entries(metrics)) {
      const fn = METRICS[metric];
      if (!fn) throw new Error(`${file}: unknown metric "${metric}" (known: ${Object.keys(METRICS).join(", ")})`);
      const value = await fn(file, text);
      const slackMax = Math.max(SLACK_MIN, Math.round(ceiling * SLACK_PCT));
      rows.push({ file, metric, value, ceiling, over: Math.max(0, value - ceiling), slack: ceiling - value, slackMax });
    }
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
  for (const r of rows) if (!r.missing) data.files[r.file][r.metric] = r.value;
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2) + "\n");
  return rows;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--update")) {
    const rows = await update();
    for (const r of rows) console.log(`${r.file} ${r.metric}: ${r.ceiling} -> ${r.value}`);
    return;
  }
  const v = verdict(await measure());
  if (argv.includes("--json")) { console.log(JSON.stringify(v, null, 2)); process.exitCode = v.ok ? 0 : 1; return; }
  for (const r of v.over) console.log(`OVER   ${r.file} ${r.metric}: ${r.value} > ceiling ${r.ceiling} (+${r.over}) — extract, or raise it deliberately and say why in the commit`);
  for (const r of v.loose) console.log(`LOOSE  ${r.file} ${r.metric}: ${r.value} but ceiling ${r.ceiling} (slack ${r.slack} > ${r.slackMax}) — lower it: node tools/check/ratchets.mjs --update`);
  if (v.ok) console.log(`ratchets: ${v.rows.length} metrics on ${Object.keys(load().files).length} files, all at or under their ceilings`);
  process.exitCode = v.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
