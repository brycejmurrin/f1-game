#!/usr/bin/env node
/**
 * @doc Which cloud sessions can be archived: a session whose PR (named by its session-link footer) merged or closed.
 * @section runner
 * @skill dispatcher
 *
 * One call replaces paging `list_sessions` by hand. Read-only: it prints candidates; the caller archives them.
 *   node tools/ci/archive-sweep.mjs --sessions <file.json> [--json]
 * `file.json` is the saved `list_sessions` result (an array, or `{sessions: [...]}`) holding objects with `id`
 * (and optionally `status`). Closed PRs are read from GitHub (GET only); a PR body or its footer names its
 * session as `claude.ai/code/session_<id>`. A session still working (`status` working/blocked) is never listed.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { api } from "./github-api.mjs";

const SESSION_LINK = /claude\.ai\/code\/(session_[A-Za-z0-9_-]+)/g;
const LIVE = new Set(["working", "blocked", "running"]);

/** Pure: sessions + closed PRs → [{ id, pr, reason }] for sessions that are done and whose PR is finished. */
export function sweep(sessions, closedPrs) {
  const byId = new Map();
  for (const pr of closedPrs) {
    for (const m of String(pr.body ?? "").matchAll(SESSION_LINK)) {
      if (!byId.has(m[1])) byId.set(m[1], pr);
    }
  }
  const out = [];
  for (const s of sessions) {
    const pr = byId.get(s.id);
    if (!pr || LIVE.has(s.status) || s.archived) continue;
    out.push({ id: s.id, pr: pr.number, reason: pr.merged_at ? "merged" : "closed" });
  }
  return out;
}

function readSessions(file) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const list = Array.isArray(j) ? j : j.sessions ?? j.data;
  if (!Array.isArray(list)) throw new Error("sessions file must hold an array or {sessions: [...]}");
  return list;
}

function main(argv) {
  const i = argv.indexOf("--sessions");
  if (i < 0 || !argv[i + 1]) { console.error("usage: archive-sweep.mjs --sessions <file.json> [--json]"); return 2; }
  const sessions = readSessions(argv[i + 1]);
  const prs = [];
  for (let page = 1; page <= 5; page++) {
    const r = api(`pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`);
    if (r.error) { console.error(String(r.error)); return 3; }
    prs.push(...r.json);
    if (r.json.length < 100) break;
  }
  const found = sweep(sessions, prs);
  if (argv.includes("--json")) console.log(JSON.stringify(found));
  else {
    for (const f of found) console.log(`${f.id} PR #${f.pr} ${f.reason}`);
    console.log(`archive-sweep: ${found.length} of ${sessions.length} sessions can be archived`);
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
