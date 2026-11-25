#!/usr/bin/env node
// @doc Tip alarm: a red deploy-branch Pages / nightly CI run posts ONE tip-red: on the Board; tip-green: on the next pass.
//
//   node tools/ci/tip-alarm.mjs            # print the decision for RUN_ID (writes nothing)
//   node tools/ci/tip-alarm.mjs --apply    # and post the bulletin / set or clear the label (tip-alarm.yml)
//
// WHY (retro 2026-11-25, item 3). The deploy tip went red at 01:00Z (scheduled CI run 45521203604, the
// perf-idle-pipeline-churn spec) and nobody saw it until 02:01Z: the dispatcher that labels the Board is off while an
// orchestrator launches workers by hand, and nothing else speaks when the tip turns red. tip-alarm.yml runs this on
// every completed pages.yml run and every SCHEDULED ci.yml run on the deploy branch (a dispatched ci.yml run is
// someone's group opt-in, not the tip's verdict).
//
// One bulletin per incident, per workflow: the newest `tip-red:` / `tip-green:` comment on the Board that names the
// workflow is its open state. A red while that workflow's bulletin is already `tip-red:` posts nothing (the label is
// still re-asserted); a green posts `tip-green:` only over an open `tip-red:` from an OLDER run (run ids grow), so a
// late green of an earlier commit never closes a newer red. Any author's bulletin counts, so an orchestrator's
// hand-posted `tip-red:` is not duplicated. `deploy:red` follows pages.yml only: the label means "pages.yml's latest
// run failed on the tip" (.github/labels.json) and merge-gate's fixer escape reads it that way; a scheduled-CI red
// gets the comment alone.
//
// Exit 0 always: a lookup or write failure is a `::warning::` (an alarm job must never be a second red to triage).
// Env: GITHUB_REPOSITORY, RUN_ID (the finished run), DEPLOY_BRANCH, BOARD_ISSUE, GH_TOKEN (issues: write, actions: read).
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const LABEL = "deploy:red";
/** The workflows the alarm judges, by file name; `events` null = every event. */
export const WATCHED = Object.freeze({ "pages.yml": { events: null, label: true }, "ci.yml": { events: ["schedule"], label: false } });
/** First line of a bulletin: `tip-red: <workflow> run <id> ...` / `tip-green: <workflow> run <id> ...`. */
export const BULLETIN_RE = /^(tip-red|tip-green):\s*(\S+\.ya?ml)\s+run\s+(\d+)/;
const RED = new Set(["failure", "timed_out", "startup_failure"]);

export const workflowFile = (p) => String(p || "").split("/").pop();
const sha8 = (s) => String(s || "").slice(0, 8);

/** Newest bulletin per workflow from Board comments (REST shape: id, body, created_at, html_url). Pure. */
export function openBulletins(comments) {
  const out = {};
  const rows = [...(comments || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || Number(a.id) - Number(b.id));
  for (const c of rows) {
    const m = BULLETIN_RE.exec(String(c.body || "").trimStart());
    if (m) out[m[2]] = { kind: m[1], runId: Number(m[3]), commentId: c.id, url: c.html_url || "" };
  }
  return out;
}

/**
 * The decision, pure. `run` is the finished run (REST: id, path, event, head_branch, head_sha, conclusion, html_url);
 * `comments` the Board's comments; `labels` the Board's label names.
 * @returns {{ action: "red"|"green"|"none", reason: string, label: "add"|"remove"|null, workflow: string }}
 */
export function decide({ run, deployBranch, comments = [], labels = [] }) {
  const wf = workflowFile(run?.path);
  const none = (reason, label = null) => ({ action: "none", reason, label, workflow: wf });
  const spec = WATCHED[wf];
  if (!run || !spec) return none(`not a watched workflow (${wf || "?"})`);
  if (run.head_branch !== deployBranch) return none(`run ${run.id} is on ${run.head_branch}, not the deploy branch`);
  if (spec.events && !spec.events.includes(run.event)) return none(`${wf} run ${run.id} is a ${run.event} run; only ${spec.events.join("/")} runs judge the tip`);
  const open = openBulletins(comments);
  const mine = open[wf];
  const hasLabel = (labels || []).includes(LABEL);
  if (RED.has(run.conclusion)) {
    const label = spec.label && !hasLabel ? "add" : null;
    if (mine?.kind === "tip-red") return none(`${wf} already has an open tip-red bulletin (run ${mine.runId}, comment ${mine.commentId}); not duplicating`, label);
    return { action: "red", reason: `${wf} run ${run.id} on ${sha8(run.head_sha)} concluded ${run.conclusion}`, label, workflow: wf };
  }
  if (run.conclusion !== "success") return none(`${wf} run ${run.id} concluded ${run.conclusion || run.status || "?"}: not a verdict`);
  if (mine?.kind !== "tip-red") return none(`${wf} run ${run.id} is green and no tip-red bulletin is open`);
  if (Number(run.id) <= mine.runId) return none(`${wf} run ${run.id} is green but older than the red run ${mine.runId}: the red stands`);
  const otherRed = Object.entries(open).some(([w, b]) => w !== wf && b.kind === "tip-red" && WATCHED[w]?.label);
  const label = spec.label && hasLabel && !otherRed ? "remove" : null;
  return { action: "green", reason: `${wf} run ${run.id} on ${sha8(run.head_sha)} passed after red run ${mine.runId}`, label, workflow: wf };
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m|\[[0-9;]*m(?=\S)/g;
/** The failing tests (and the first assertion line after each) from a job log. Pure; at most `max` rows. */
export function failingTests(log, max = 3) {
  const lines = String(log || "").split(/\r?\n/).map((l) => l.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/, "").replace(ANSI, ""));
  const out = [];
  const seen = new Set();
  const PATTERNS = [
    /^\[[\d:]+\]\s+x FAIL\s+\d+\/\d+\s+(.+?)(?:\s+\([\d.]+m?s\))?\s*$/,   // run-playwright.mjs
    /^\s*\d+\)\s+(\[[^\]]+\]\s+›\s+.+?)\s*─*\s*$/,                        // Playwright list reporter
    /^\s*not ok \d+ - (.+?)\s*$/,                                       // node:test TAP
    /^\s*✖\s+(.+?)(?:\s+\([\d.]+m?s\))?\s*$/,                            // node:test spec reporter
  ];
  for (let i = 0; i < lines.length && out.length < max; i++) {
    let name = null;
    for (const re of PATTERNS) { const m = re.exec(lines[i]); if (m) { name = m[1].trim(); break; } }
    if (!name || seen.has(name) || /^(failing tests|tests? failed)/i.test(name)) continue;
    seen.add(name);
    const err = lines.slice(i + 1, i + 8).map((l) => l.trim()).find((l) => /^(Error|AssertionError|TypeError|expect\()/.test(l) || /^error:/i.test(l));
    out.push({ test: name, error: err || "" });
  }
  return out;
}

/** The bulletin bodies. Pure. `jobs`: [{ name, step, tests: [{test, error}] }]. */
export function redBody({ run, workflow, jobs = [] }) {
  const lines = [`tip-red: ${workflow} run ${run.id} on ${sha8(run.head_sha)} ${run.conclusion}`, "", `- sha: \`${run.head_sha}\``];
  if (!jobs.length) lines.push("- job: (no failed job listed; read the run)");
  for (const j of jobs.slice(0, 3)) {
    lines.push(`- job: ${j.name}${j.step ? ` (step "${j.step}")` : ""}`);
    if (!j.tests?.length) lines.push("  - test: (none found in the log tail; read the job log)");
    for (const t of j.tests || []) lines.push(`  - test: \`${t.test}\`${t.error ? ` — ${t.error.slice(0, 200)}` : ""}`);
  }
  if (jobs.length > 3) lines.push(`- … and ${jobs.length - 3} more failed job(s)`);
  lines.push(`- run: ${run.html_url}`, "",
    `Posted by tip-alarm.yml (tools/ci/tip-alarm.mjs). Fix through a PR labelled \`deploy:red\` (skill steward §Red 3); the next green ${workflow} run on the deploy branch posts \`tip-green:\`.`);
  return lines.join("\n");
}
export const greenBody = ({ run, workflow, redRunId }) =>
  `tip-green: ${workflow} run ${run.id} on ${sha8(run.head_sha)} passed (closes the tip-red bulletin of run ${redRunId})\n\n- sha: \`${run.head_sha}\`\n- run: ${run.html_url}\n\nPosted by tip-alarm.yml (tools/ci/tip-alarm.mjs).`;

const gh = (args, input) => execFileSync("gh", ["api", ...args], { encoding: "utf8", input, maxBuffer: 64 << 20, stdio: [input == null ? "ignore" : "pipe", "pipe", "pipe"] });
const first = (e) => String(e.stderr || e.message).trim().split("\n")[0];

function main(argv) {
  const apply = argv.includes("--apply");
  const { GITHUB_REPOSITORY: repo = "", RUN_ID: runId = "", DEPLOY_BRANCH: branch = "", BOARD_ISSUE: board = "" } = process.env;
  const out = (line) => {
    console.log(line);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  };
  if (!repo || !/^\d+$/.test(runId) || !branch || !/^\d+$/.test(board)) { console.log("::warning::tip-alarm: GITHUB_REPOSITORY, RUN_ID, DEPLOY_BRANCH and BOARD_ISSUE are required; nothing done"); return; }
  let run, comments, labels, verdict;
  try {
    run = JSON.parse(gh([`repos/${repo}/actions/runs/${runId}`]));
    comments = JSON.parse(gh(["--paginate", "--slurp", `repos/${repo}/issues/${board}/comments?per_page=100`])).flat();
    labels = JSON.parse(gh([`repos/${repo}/issues/${board}`])).labels.map((l) => l.name);
    verdict = decide({ run, deployBranch: branch, comments, labels });
  } catch (e) {
    console.log(`::warning::tip-alarm: lookup failed (${first(e)}); no bulletin posted`);
    return;
  }
  out(`**Tip alarm**: ${verdict.action}${verdict.label ? ` (label ${verdict.label} ${LABEL})` : ""}: ${verdict.reason}`);
  let body = null;
  if (verdict.action === "red") {
    let jobs = [];
    try {
      const all = JSON.parse(gh([`repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`])).jobs || [];
      jobs = all.filter((j) => RED.has(j.conclusion)).map((j) => {
        let tests = [];
        try { tests = failingTests(gh([`repos/${repo}/actions/jobs/${j.id}/logs`])); } catch { /* log expired or unreadable: the bulletin says so */ }
        return { name: j.name, step: (j.steps || []).find((s) => RED.has(s.conclusion))?.name || "", tests };
      });
    } catch (e) { console.log(`::warning::tip-alarm: job lookup failed (${first(e)}); the bulletin names the run only`); }
    body = redBody({ run, workflow: verdict.workflow, jobs });
  } else if (verdict.action === "green") {
    body = greenBody({ run, workflow: verdict.workflow, redRunId: openBulletins(comments)[verdict.workflow].runId });
  }
  if (body) out(`\n${body}\n`);
  if (!apply) return;
  try {
    if (body) gh(["-X", "POST", `repos/${repo}/issues/${board}/comments`, "--input", "-"], JSON.stringify({ body }));
    if (verdict.label === "add") gh(["-X", "POST", `repos/${repo}/issues/${board}/labels`, "--input", "-"], JSON.stringify({ labels: [LABEL] }));
    if (verdict.label === "remove") gh(["-X", "DELETE", `repos/${repo}/issues/${board}/labels/${encodeURIComponent(LABEL)}`]);
    out(`applied on #${board}`);
  } catch (e) {
    console.log(`::warning::tip-alarm: write failed (${first(e)}); the next run retries`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) main(process.argv.slice(2));
