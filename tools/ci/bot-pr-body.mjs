/**
 * @doc Wrap a scheduled bot's one-line PR summary in the PR template (Goal, closed Plan, land item) the merge gate reads.
 *
 * WHY (#5520, 2026-11-11). The scheduled folds open their PR through .github/actions/open-bot-pr with a one-line
 * body. #5518 (ratchets fold, LAND_TOKEN identity, not a `[bot]` login) then sat refused by the merge gate:
 * `= gate plan: FAIL no ## Plan checklist in the body (skill steward §Open)`, and only landed after an agent
 * rewrote its body (#5146 needed the same). This gives every bot PR the template's sections with a Plan that is
 * true when the PR opens: the job's own work ticked with its run, an optional evidence line per row ticked, and
 * the `land:` item last (planVerdict exempts it; CI is the gate's own `ci` row, not a Plan item). A body that
 * already has a `## Plan` is passed through untouched.
 *
 * Usage: node tools/ci/bot-pr-body.mjs   (reads env: PR_BODY, WHAT, BRANCH, EVIDENCE, HEAD_SHA, RUN_URL;
 *        prints the body). tests/unit/bot-pr-body.test.mjs feeds the output through merge-gate's planRow.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const HAS_PLAN = /^##[ \t]+Plan\b/m;

/** @param {{ body: string, what: string, branch?: string, evidence?: string, sha?: string, runUrl?: string }} o */
export function botPrBody({ body, what, branch = "", evidence = "", sha = "", runUrl = "" }) {
  const summary = String(body || "").trim();
  if (HAS_PLAN.test(summary)) return summary + "\n";
  const job = String(what || "scheduled job").trim();
  const run = runUrl ? ` (run ${runUrl})` : "";
  const head = sha ? String(sha).slice(0, 8) : "<sha>";
  const proofs = String(evidence || "").split("\n").map((l) => l.trim()).filter(Boolean);
  // A changelog line is the template's first rule; a bot that moves existing entries has nothing player-facing.
  const changelog = /CHANGELOG:/i.test(summary) ? "" : "no player-facing change\n\n";
  return `${changelog}## Goal
${summary || `The scheduled ${job}.`}

Opened by .github/actions/open-bot-pr for the scheduled ${job}${branch ? ` on \`${branch}\`` : ""}.

## Plan
- [x] ${job}: the scheduled job did its work and pushed ${head}${run}
${proofs.map((p) => `- [x] ${p}`).join("\n")}${proofs.length ? "\n" : ""}- [ ] land: add the \`land\` label once ready-gate exits 0 (CI is the gate's own \`ci\` row)

## Verified / Not run
- ${job}${run}: the job's own checks ran before it pushed (see the run log)
- CI: runs on this PR

## Hand-off
\`\`\`handoff
head: ${head}
owner: bot:${job}
next: CI green, then the \`land\` label
\`\`\`
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const e = process.env;
  process.stdout.write(botPrBody({
    body: e.PR_BODY, what: e.WHAT, branch: e.BRANCH, evidence: e.EVIDENCE, sha: e.HEAD_SHA, runUrl: e.RUN_URL,
  }));
}
