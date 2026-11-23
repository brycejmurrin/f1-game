#!/usr/bin/env node
// @doc Explain one PR's current wait from bounded GET evidence, without polling or changing GitHub.
// @skill steward
// GitHub concurrency docs (read 2026-10-30): pending is a concurrency wait;
// FIFO uses time entering the group, not workflow creation. Never infer position.
// queued alone does not identify runner availability or another blocking cause.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "./github-api.mjs";

const BAD = new Set(["failure", "timed_out", "startup_failure", "action_required"]);
const labels = (p) => (p.labels || []).map((l) => typeof l === "string" ? l : l.name);
const realCi = (r, sha) => r.head_sha === sha && r.name === "CI" && !/^CI ignored: /.test(r.display_title || "");
const newest = (xs) => [...xs].sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0) || b.id - a.id)[0];

/** Fixture: {pr,runs,jobs,jobsRunId,gate,complete,issues,deploy?}. Pure, advisory. */
export function explainPrWait(s = {}) {
  const issues = Array.isArray(s.issues) ? s.issues.slice(0, 64).map((x) => String(x).slice(0, 512)) : [];
  const p = s.pr;
  const out = { schemaVersion: 1, at: s.at || null, pr: p?.number || null, head: p?.head?.sha || null,
    complete: s.complete === true, state: "unknown", reasons: [], issues, queuePosition: null };
  const issue = (text) => { out.complete = false; if (issues.length < 64) issues.push(text); };
  const rows = (name) => {
    const value = s[name] || [];
    if (!Array.isArray(value)) { issue(`${name} must be an array`); return []; }
    if (value.length > 300) issue(`${name} limit reached: inspect at most 300`);
    return value.slice(0, 300).filter((row) => row && typeof row === "object");
  };
  const runs = rows("runs"), observedJobs = rows("jobs");
  const reason = (state, detail, evidence = {}) => {
    if (out.reasons.length >= 200) { issue("Reason output limit reached: at most 200 retained"); return; }
    const bounded = Object.fromEntries(Object.entries(evidence).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 512) : v]));
    out.reasons.push({ state, detail: String(detail).slice(0, 512), ...bounded });
  };
  if (!p?.head?.sha) { issues.push("PR head unavailable"); out.complete = false; return out; }
  if (p.merged) {
    if (s.deploy?.sourceSha === p.merge_commit_sha && s.deploy?.ancestor === true && s.deploy?.liveSha) {
      reason("deployed", "Merge commit is proven an ancestor of the observed live SHA", { liveSha: s.deploy.liveSha });
    } else reason("deployment-unknown", "PR merged; live deployment ancestry has not been established");
  } else if (p.state === "closed") reason("closed", "PR closed without a merge");
  else {
    if (p.mergeable_state === "dirty" || p.mergeable === false) reason("conflict", "GitHub reports a merge conflict");
    if (labels(p).includes("hold")) reason("hold", "The hold label vetoes landing");
    if (p.draft) reason("draft", "PR is still a draft");
    const r = newest(runs.filter((r) => realCi(r, p.head.sha)));
    if (!r) reason("ci-unknown", "No CI run named CI observed on this head; ignored edit/label runs do not count");
    else if (r.status !== "completed") {
      if (s.jobsRunId !== r.id) { issues.push("Jobs are unavailable or belong to a different CI run"); out.complete = false; }
      const jobs = s.jobsRunId === r.id ? observedJobs : [];
      const failed = jobs.filter((j) => BAD.has(j.conclusion));
      for (const j of failed) reason("ci-failed", "Job failed; assertion requires its log", { runId: r.id, jobId: j.id, job: j.name });
      for (const j of jobs.filter((j) => j.status !== "completed")) {
        const state = j.status === "pending" ? "concurrency-wait" : j.status === "queued" ? "queued" : j.status === "in_progress" ? "executing" : "ci-wait";
        reason(state, state === "concurrency-wait" ? "Job waiting; exact concurrency lane and queue position are not exposed here" : state === "queued" ? "CI job is queued; the blocking cause is unknown" : "CI job has not completed", { runId: r.id, jobId: j.id, job: j.name, since: j.started_at || null });
      }
      if (!jobs.length) reason("ci-wait", "CI has not completed; job details unavailable", { runId: r.id });
    } else if (BAD.has(r.conclusion)) {
      const failed = s.jobsRunId === r.id ? observedJobs.filter((j) => BAD.has(j.conclusion)) : [];
      if (failed.length) for (const j of failed) reason("ci-failed", "Job failed; assertion requires its log", { runId: r.id, jobId: j.id, job: j.name });
      else reason("ci-failed", "CI failed; failed-job details or assertions unavailable", { runId: r.id });
    }
    else if (r.conclusion !== "success") reason("ci-unknown", "CI ended without success; cancellation alone does not identify its cause", { runId: r.id, conclusion: r.conclusion });
    else {
      const g = s.gate;
      if (!g) reason("gate-unknown", "CI passed; no gate status observed");
      else if (g.state === "failure" || g.state === "error") reason("gate-refused", g.description || "Merge gate refused", { url: g.target_url || null });
      else if (/tip moved|re-gating|will retry/i.test(g.description || "")) reason("gate-revalidation", g.description, { url: g.target_url || null });
      else if (g.state === "success") reason("landing", "CI and gate passed; PR is not observed merged");
      else reason("gate-wait", g.description || "CI passed; merge gate pending", { url: g.target_url || null });
    }
  }
  out.state = out.reasons[0]?.state || "unknown";
  return out;
}

/** GET-only collection. Finite pages; uncertainty stays visible rather than implying success. */
export function collectPrWait(number, { request = api, maxPages = 3, at = new Date().toISOString() } = {}) {
  const s = { at, complete: true, issues: [], runs: [], jobs: [] };
  const get = (url) => { try { const r = request(url); if (r.error) throw new Error(r.error); return r.json; } catch (e) { s.complete = false; s.issues.push(`${url}: ${e.message}`); return null; } };
  s.pr = get(`pulls/${number}`);
  if (!s.pr?.head?.sha) return explainPrWait(s);
  const sha = s.pr.head.sha;
  const pages = (base, key) => {
    const all = [];
    for (let page = 1; page <= maxPages; page++) {
      const data = get(`${base}${base.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      const batch = key ? data?.[key] : data;
      if (!Array.isArray(batch)) { s.complete = false; s.issues.push(`Invalid page: ${base}`); break; }
      all.push(...batch);
      if (batch.length < 100 && (!key || !Number.isFinite(data.total_count) || all.length >= data.total_count)) return all;
      if (page === maxPages) { s.complete = false; s.issues.push(`Page limit reached: ${base}`); }
    }
    return all;
  };
  s.runs = pages(`actions/workflows/ci.yml/runs?head_sha=${sha}`, "workflow_runs");
  const r = newest(s.runs.filter((r) => realCi(r, sha)));
  if (r) { s.jobsRunId = r.id; s.jobs = pages(`actions/runs/${r.id}/jobs`, "jobs"); }
  s.gate = newest(pages(`commits/${sha}/statuses`).filter((g) => g.context === "gate"));
  // Detect a push during collection: never combine evidence from different heads.
  const after = get(`pulls/${number}`);
  if (after?.head?.sha !== sha) { s.complete = false; s.issues.push("PR head changed during collection; repeat one snapshot"); s.pr = null; }
  return explainPrWait(s);
}

function readBoundedJSON(file) {
  const limit = 1024 * 1024, fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error("JSON input must be a regular file of at most 1048576 bytes");
    const buffer = Buffer.alloc(limit + 1);
    let size = 0, read;
    while (size < buffer.length && (read = fs.readSync(fd, buffer, size, buffer.length - size, null)) > 0) size += read;
    if (size > limit) throw new Error("JSON input must be at most 1048576 bytes");
    return JSON.parse(buffer.subarray(0, size).toString("utf8"));
  } finally { fs.closeSync(fd); }
}

function main(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (["--help", "--json"].includes(argv[i])) continue;
    if (!["--pr", "--fixture"].includes(argv[i])) throw new Error(`Unknown argument ${argv[i]}`);
    if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Missing value for ${argv[i]}`);
    i++;
  }
  const value = (flag) => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null;
  if (argv.includes("--help")) { console.log("Usage: pr-wait.mjs --pr N | --fixture snapshot.json [--json]\nRead-only snapshot; incomplete evidence exits 2. No polling, queue position or merge authorization."); return; }
  const fixture = value("--fixture"), pr = Number(value("--pr"));
  if (!fixture && (!Number.isSafeInteger(pr) || pr <= 0)) throw new Error("Supply --pr N or --fixture snapshot.json");
  const result = fixture ? explainPrWait(readBoundedJSON(fixture)) : collectPrWait(pr);
  console.log(argv.includes("--json") ? JSON.stringify(result, null, 2) : `${result.state}: ${result.reasons.map((r) => r.detail).join("; ")}\ncomplete=${result.complete}; ${result.issues.join("; ")}`);
  if (!result.complete) process.exitCode = 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 2; }
}
