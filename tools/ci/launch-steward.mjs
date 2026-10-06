#!/usr/bin/env node
// launch-steward.mjs — launch a FULL Cursor Cloud Agent onto an open PR head.
// @doc Launch a full Cloud Agent steward (prUrl + workOnCurrentBranch); never a Task child.
// @skill steward
//
// Task `environment: cloud` stewards are source=internal, often branchName:null,
// and cannot receive subscribe_github_pr / subscribe_github_ci. A steward of
// PR #N is a Cloud Agents API create:
//   POST https://api.cursor.com/v1/agents
//   repos[0].prUrl + workOnCurrentBranch:true + autoCreatePR:false
// so the agent pushes to the existing PR head and can subscribe itself.
// Docs: https://cursor.com/docs/cloud-agent/api/endpoints (2026-10-06).
//
//   node tools/ci/launch-steward.mjs --pr 1024 --prompt-file body.txt
//   node tools/ci/launch-steward.mjs --pr 1024 --prompt "…" --dry-run
//   CURSOR_API_KEY from Dashboard → Cloud Agents → API Keys (Basic -u KEY:).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_URL = "https://github.com/brycejmurrin/f1-game";
export const API_URL = "https://api.cursor.com/v1/agents";
export const MODEL_ID = "default";

const FOOTER = `

You are a full Cursor Cloud Agent, not a Task subagent. After start:
- Stay on this PR's existing head ref. Do not create a new cursor/<topic>-<hash>. Do not open a second PR.
- Arm subscribe_github_pr on this PR and subscribe_github_ci on this branch (those events reach you).
- Do not merge.
- Do not disable squash auto-merge if it is already armed.
- Sync = merge origin/claude/f1-game-project-26h3ng; never rebase or force-push.
`;

export function prUrl(n) {
  return `${REPO_URL}/pull/${Number(n)}`;
}

export function buildPayload({ pr, prompt, name }) {
  const n = Number(pr);
  if (!Number.isInteger(n) || n < 1) throw new Error("need --pr <positive integer>");
  const text = String(prompt || "").trim();
  if (!text) throw new Error("need --prompt or --prompt-file");
  if (!/Do not merge/i.test(text)) {
    throw new Error("prompt must include the line `Do not merge.`");
  }
  return {
    prompt: { text: text.replace(/\s+$/, "") + FOOTER },
    name: (name && String(name).slice(0, 100)) || `Steward PR #${n}`,
    model: { id: MODEL_ID },
    workOnCurrentBranch: true,
    autoCreatePR: false,
    repos: [{ url: REPO_URL, prUrl: prUrl(n) }],
  };
}

export function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--pr") out.pr = argv[++i];
    else if (a === "--prompt") out.prompt = argv[++i];
    else if (a === "--prompt-file") {
      const p = argv[++i];
      if (!p) throw new Error("need --prompt-file <path>");
      out.prompt = fs.readFileSync(path.resolve(p), "utf8");
    } else if (a === "--name") out.name = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`unknown arg ${a}`);
  }
  return out;
}

const HELP = `usage: node tools/ci/launch-steward.mjs --pr N --prompt "…" [--name TITLE] [--dry-run]
       node tools/ci/launch-steward.mjs --pr N --prompt-file FILE [--dry-run]

Launch a FULL Cursor Cloud Agent onto an existing GitHub PR head
(workOnCurrentBranch + prUrl). Do not use Task environment:cloud for stewards.

CURSOR_API_KEY is required unless --dry-run. Dashboard → Cloud Agents → API Keys.
`;

export async function postAgent(payload, { fetchImpl = fetch, apiKey, apiUrl = API_URL } = {}) {
  if (!apiKey) throw new Error("CURSOR_API_KEY is missing (Dashboard → Cloud Agents → API Keys)");
  const res = await fetchImpl(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${apiKey}:`).toString("base64"),
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  let json;
  try { json = JSON.parse(body); } catch { json = { raw: body }; }
  if (!res.ok) {
    const err = new Error(`Cloud Agents API ${res.status}: ${body.slice(0, 500)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

function printLaunch(json) {
  const agent = json.agent || json;
  const id = agent.id || agent.bcId || "";
  const url = agent.target?.url || agent.url || (id ? `https://cursor.com/agents/${id}` : "");
  console.log(`steward ${id} ${url}`.trim());
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) { process.stdout.write(HELP); return 0; }
  const payload = buildPayload(args);
  if (args.dryRun) {
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return 0;
  }
  const json = await postAgent(payload, { apiKey: process.env.CURSOR_API_KEY });
  printLaunch(json);
  return 0;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
    console.error(err.message || err);
    process.exit(2);
  });
}
