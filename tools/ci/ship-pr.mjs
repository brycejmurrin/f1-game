#!/usr/bin/env node
// ship-pr.mjs — the one ready→flip→land route: run ready-gate, then print the exact next two calls.
// @doc Runs ready-gate on a draft PR; on a pass prints the two calls that land it (MCP draft:false flip, `land` label).
// @skill ship
//
// It never calls the ready or merge endpoints itself: the draft→ready flip stays the GitHub MCP `update_pull_request`
// call (no hook gates it on a receipt since the 2026-11-03 hook reset: github-mcp-guard.sh allows it, and the merge
// gate's Plan and CI rows judge the PR), and `land` stays a label (skill `steward` §Land). A push or Plan edit after
// the gate passed: re-run this command.
// First it runs closing-refs (#5929): a body line like "fix #5800" naming an OPEN pull request would close that PR on
// merge, so ship refuses until it is reworded (ready-gate is PROTECTED, so the check lives here, a routine path).
//
//   node tools/ci/ship-pr.mjs --pr <n> [--repo owner/name]
//
// Exit: ready-gate's own (0 pass, 1 refused, 3 no token / API error); closing-refs refuses with 1, cannot judge with 3.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { MAX_AGE_MIN } from "../lib/gate-receipt.mjs";
import { checkPr } from "./closing-refs.mjs";
import { api } from "./github-api.mjs";
import { planVerdict, planBodySource, LAND_ITEM, NOW_ITEM } from "./ready-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USAGE = "usage: node tools/ci/ship-pr.mjs --pr <n> [--repo owner/name]\n  Runs ready-gate on the draft PR; on exit 0 prints the two calls that land it. Flips and labels nothing itself.";

/** The two calls after a passing ready-gate, as lines to print. Pure. */
export function nextCalls(pr, repo = "brycejmurrin/f1-game") {
  return [
    `1. GitHub MCP update_pull_request  owner/repo=${repo}  pullNumber=${pr}  draft:false   (now, on the head ready-gate just judged; receipt good for ${MAX_AGE_MIN} min; a later push: re-run ship-pr)`,
    `2. GitHub MCP issue_write  method=update  owner/repo=${repo}  issue_number=${pr}  labels=<the live list from issue_read get_labels, plus "land">   (after the flip: \`land\` on a draft does nothing; one label per call, skill steward references/labels.md)`,
    `then refresh the Hand-off block and subscribe_pr_activity (re-subscribe after the flip); GitHub merges it, not you.`,
  ];
}

export const LAND_LINE = "- [ ] land: flip ready → `land` label → land.yml `gate` merges it";

/** The exact Plan body edit for an open Plan, as lines to print; [] when the Plan is closed or absent. Pure.
 *  Each open item: the line as it stands, then its ticked form (head sha prefilled, the evidence left to fill) and
 *  its struck form; a `**now:**` item also gets the fold-into-`land:` form (skill steward §Land 1). */
export function planEdit(body, sha = "") {
  const p = planVerdict(body);
  if (p.state !== "open") return [];
  const sha8 = String(sha || "").slice(0, 8) || "<sha>";
  const raw = planBodySource(body).split(/\r?\n/);
  const lineOf = (t) => raw.find((l) => { const m = /^[ \t]*[-*][ \t]+\[ \][ \t]*(.*)$/.exec(l); return m && (m[1].trim() || "(empty item)") === t; }) || `- [ ] ${t}`;
  const out = [`Plan edit (${p.open.length} open of ${p.items}): replace each line below in the PR body (GitHub MCP update_pull_request body=…), then re-run ship-pr.`];
  for (const t of p.open) {
    const line = lineOf(t).trimEnd();
    const lead = /^[ \t]*[-*][ \t]+/.exec(line)?.[0] || "- ";
    const text = t === "(empty item)" ? "" : t;
    out.push(`  was:    ${line}`);
    if (!text) { out.push(`  delete: the empty placeholder line, or write the step it stood for and tick it`); continue; }
    out.push(`  tick:   ${lead}[x] ${text} — ${sha8}: <evidence: the verdict line, test or run that proves it>`);
    out.push(`  strike: ${lead}[ ] ~~${text}~~ — dropped: <why>`);
    if (NOW_ITEM.test(text)) out.push(`  or fold what is left into the land: line: ${LAND_LINE} (after: ${text.replace(/^(\*\*)?now:(\*\*)?\s*/i, "")})`);
  }
  const hasLand = raw.some((l) => { const m = /^[ \t]*[-*][ \t]+\[[ xX~]\][ \t]*(.*)$/.exec(l); return m && LAND_ITEM.test(m[1].trim()); });
  if (!hasLand) out.push(`  add as the LAST Plan item (it never blocks): ${LAND_LINE}`);
  return out;
}

const fetchPr = (n) => api(`pulls/${n}`);

export function main(argv, { run = (a) => spawnSync(process.execPath, [path.join(ROOT, "tools/ci/ready-gate.mjs"), ...a], { stdio: "inherit" }).status ?? 3, log = console.log, closing = checkPr, getPr = fetchPr } = {}) {
  exitIfHelp(argv, USAGE);
  const i = argv.indexOf("--pr"), pr = i >= 0 ? argv[i + 1] : "";
  if (!/^\d{1,7}$/.test(pr || "")) { log(USAGE); return 1; }
  const j = argv.indexOf("--repo");
  const c = closing(Number(pr));
  if (c.error) { log(`closing-refs could not judge #${pr} (${c.error}): re-run ship-pr`); return 3; }
  if (!c.ok) { c.lines.forEach((l) => log(l)); log(`ship refused #${pr}: reword the closing keyword(s) above in the PR body (update_pull_request), then re-run ship-pr`); return 1; }
  const code = run(["--pr", pr]);
  if (code === 0) nextCalls(pr, j >= 0 ? argv[j + 1] : undefined).forEach((l) => log(l));
  else if (code === 1) {
    const r = getPr(Number(pr));
    if (!r.error) planEdit(r.json?.body || "", r.json?.head?.sha || "").forEach((l) => log(l));
    log(`ready-gate refused #${pr}: fix what its \`= ready-gate\` line names, then re-run ship-pr (no flip, no \`land\` yet)`);
  } else log(`ready-gate could not judge #${pr} (exit ${code}): re-run ship-pr`);
  return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
