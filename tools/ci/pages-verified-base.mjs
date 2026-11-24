#!/usr/bin/env node
// @doc Resolve the last byte-verified Pages publication on the deploy commit's first-parent chain.
// @section runner
// Only a completed Pages publication that checked its live bytes can shorten
// the selection window. Successful "nothing new" ticks and superseded checks
// do not certify a publication.
import { pathToFileURL } from "node:url";
import { firstParents } from "../lib/changed-files.mjs";
import { api } from "./github-api.mjs";

const LIVE_JOB = "Live shell matches the published commit and build";
const BYTES_STEP = "Verify published runtime bytes and lazy assets";
const RUN_LIMIT = 10;
const JOBS_PER_PAGE = 100;
const SHA = /^[a-f0-9]{40}$/;

export function verifiedBase(chain, live, branch, request) {
  const liveIndex = chain.indexOf(live);
  if (liveIndex < 0) return "";
  const runs = request(`actions/workflows/pages.yml/runs?branch=${encodeURIComponent(branch)}&status=success&per_page=${RUN_LIMIT}`).json?.workflow_runs;
  if (!Array.isArray(runs)) return "";
  const candidates = runs.filter((r) => r?.status === "completed" && r.conclusion === "success"
    && r.head_branch === branch && SHA.test(r.head_sha) && Number.isSafeInteger(r.id)
    && Number.isSafeInteger(r.run_attempt) && r.run_attempt > 0)
    .map((r) => ({ ...r, distance: chain.indexOf(r.head_sha) }))
    .filter(({ distance }) => distance >= liveIndex)
    .sort((a, b) => a.distance - b.distance);
  for (const run of candidates) {
    // Bind the evidence to the successful attempt named by the runs list.
    // A rerun can change the latest jobs between these two API reads.
    for (let page = 1; page <= 4; page++) {
      const jobs = request(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=${JOBS_PER_PAGE}&page=${page}`).json?.jobs;
      if (!Array.isArray(jobs)) return "";
      const liveJob = jobs.find((job) => job?.name === LIVE_JOB);
      if (liveJob?.conclusion === "success"
          && liveJob.steps?.some((step) => step.name === BYTES_STEP && step.conclusion === "success")) return run.head_sha;
      if (liveJob || jobs.length < JOBS_PER_PAGE) break;
      if (page === 4) return "";
    }
  }
  return "";
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [head, live, branch] = process.argv.slice(2);
  if (!SHA.test(head) || !SHA.test(live) || !branch) process.exit(0);
  try {
    const repo = process.env.GITHUB_REPOSITORY;
    if (!repo || !process.env.GH_TOKEN) process.exit(0);
    const request = (endpoint) => api(`https://api.github.com/repos/${repo}/${endpoint}`, {
      token: process.env.GH_TOKEN, timeoutS: 4, retries: [],
    });
    process.stdout.write(verifiedBase(firstParents(head), live, branch, request));
  } catch (error) {
    console.error(`::warning::Could not read verified Pages history: ${error.message}`);
  }
}
