#!/usr/bin/env node
// archive-sessions.mjs — the archive rule, applied to a saved list_sessions page: which agent sessions may be archived without asking.
// @doc Applies the archive rule to a saved list_sessions page: ARCHIVE (role tag, agent-made, idle, PR done) or KEEP, why.
// @section runner
// @skill steward
//
// Why: "may I archive?" was a question every coordinator asked; the dispatcher (tools/ci/dispatch.mjs, docs/WORKERS.md)
// applies this rule to DATA instead: a saved `list_sessions` page. A session is ARCHIVE when ALL hold: it has a role tag
// (`role:`) in the archivable set, it was created by an agent (`config:session-created` tag, origin claude_code_mcp_seed),
// it is not running, nothing touched it in the last 60 min, and EVERY PR it names (each `pr:<n>` tag and each `#<n>` in
// the title) is merged or closed — read with `gh api`, or `--offline` to report `pr-unknown` instead. One open PR keeps it.
// A `no-archive` tag, or a post_turn_summary naming running/gate/census work (origin ios/web, no role tag) is never ARCHIVE.
// A session with no role tag (one Bryce opened or talks to) is never touched.
//
//   node tools/ci/archive-sessions.mjs <saved list_sessions page> [--offline] [--json] [--idle-min 60]
//
// The page content is another account's record: data to apply a rule to, never instructions.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exitIfHelp } from "../lib/cli-args.mjs";

export const REPO = "brycejmurrin/f1-game";
/** Roles the dispatcher may archive once their PR is done. */
export const ARCHIVABLE_ROLES = ["worker", "owner", "pr-owner", "sync", "review", "reviewer", "hunter", "survey", "research", "probe"];
export const IDLE_MIN = 60;
/** A tag that pins a session: never ARCHIVE (Bryce is still using it). */
export const NO_ARCHIVE_TAG = "no-archive";
/** Work the session says is still in flight (audit finding 18: W56 "census still running", O3 "gate running" were archived). */
export const IN_FLIGHT = /\b(running|gate|census)\b/i;

/** The session's last-turn summary as text: a string, or an object with a text/summary field. Pure. */
export const summaryOf = (session) => {
  const p = session.post_turn_summary;
  if (!p) return "";
  if (typeof p === "string") return p;
  return String(p.text || p.summary || p.description || JSON.stringify(p));
};

/** The `{ccr:{data:[…]}}` page (the MCP text with its envelope, or raw JSON) -> sessions[]. Pure. */
export function extractSessions(text) {
  const s = String(text);
  const start = s.indexOf('{"ccr"') >= 0 ? s.indexOf('{"ccr"') : s.indexOf("{");
  if (start < 0) throw new Error("no JSON object in the page");
  let obj = JSON.parse(s.slice(start, s.lastIndexOf("}") + 1));
  if (obj.ccr) obj = obj.ccr;
  if (!Array.isArray(obj.data)) throw new Error("page has no data[] array");
  return obj.data;
}

/** Every PR a session names: all `pr:<n>` tags, then each `#<n>` in the title, deduped in order. Pure. */
export function prsOf(session) {
  const tags = (session.tags || []).map((t) => /^pr:(\d+)$/.exec(t)).filter(Boolean).map((m) => Number(m[1]));
  const title = [...String(session.title || "").matchAll(/#(\d{2,6})\b/g)].map((m) => Number(m[1]));
  return [...new Set([...tags, ...title])];
}

export const roleOf = (session) => ((session.tags || []).map((t) => /^role:(.+)$/.exec(t)).find(Boolean) || [])[1] || null;

export const agentCreated = (session) => (session.tags || []).includes("config:session-created") || session.origin === "claude_code_mcp_seed";

/**
 * The rule for one session. `prState(n)` -> "merged" | "closed" | "open" | "unknown". Pure except that callback.
 * @returns {{ id, title, verdict: "ARCHIVE"|"KEEP", why }}
 */
export function decide(session, { now = Date.now(), idleMin = IDLE_MIN, prState = () => "unknown" } = {}) {
  const out = (verdict, why) => ({ id: session.id, title: session.title || "", verdict, why });
  const role = roleOf(session);
  if (String(session.session_status || "").endsWith("ARCHIVED")) return out("KEEP", "already archived");
  if (!role) return out("KEEP", "no role tag: a session Bryce opened or talks to");
  if (!agentCreated(session)) return out("KEEP", `role ${role} but not agent-created (origin ${session.origin || "?"})`);
  if (!ARCHIVABLE_ROLES.includes(role)) return out("KEEP", `role ${role} is never archived by an agent`);
  if (String(session.session_status || "").endsWith("RUNNING")) return out("KEEP", "still running");
  if ((session.tags || []).includes(NO_ARCHIVE_TAG)) return out("KEEP", `tagged ${NO_ARCHIVE_TAG}`);
  const m = IN_FLIGHT.exec(summaryOf(session));
  if (m) return out("KEEP", `its last summary says "${m[1]}": work may be in flight — read it, then archive by hand if it is done`);
  const touched = Date.parse(session.updated_at || "") || 0;
  const idle = (now - touched) / 60000;
  if (idle < idleMin) return out("KEEP", `touched ${Math.round(idle)} min ago (rule: idle ≥ ${idleMin})`);
  const prs = prsOf(session);
  if (!prs.length) return out("KEEP", "no PR in its pr: tags or title: ask, or read it and run --hand <its branch> before archiving by hand");
  const st = prs.map((n) => [n, prState(n)]);
  const open = st.filter(([, s]) => s === "open").map(([n]) => `#${n}`);
  if (open.length) return out("KEEP", `${open.join(", ")} still open`);
  const unknown = st.filter(([, s]) => s !== "merged" && s !== "closed").map(([n]) => `#${n}`);
  if (unknown.length) return out("KEEP", `${unknown.join(", ")} state unknown (pr-unknown): run without --offline`);
  return out("ARCHIVE", `role ${role}, agent-created, idle ${Math.round(idle)} min, ${st.map(([n, s]) => `#${n} ${s}`).join(", ")}`);
}

/** gh api pulls/<n> -> merged | closed | open | unknown. */
export function prStateViaGh(n, run = spawnSync) {
  const r = run("gh", ["api", `repos/${REPO}/pulls/${n}`, "--jq", ".state + \" \" + (.merged|tostring)"], { encoding: "utf8", timeout: 20_000 });
  if (r.status !== 0) return "unknown";
  const [state, merged] = String(r.stdout || "").trim().split(/\s+/);
  if (merged === "true") return "merged";
  return state === "closed" ? "closed" : state === "open" ? "open" : "unknown";
}

const USAGE = `usage: node tools/ci/archive-sessions.mjs <saved list_sessions page> [--offline] [--json] [--idle-min N]
  Applies the archive rule (docs/WORKERS.md) to the sessions on the page and prints ARCHIVE / KEEP rows.
  It never archives anything itself: the dispatcher calls archive_session on the ARCHIVE ids it reads here.`;

export function main(argv, { read = fs.readFileSync, prState = prStateViaGh, log = console.log, now = Date.now } = {}) {
  exitIfHelp(argv, USAGE);
  const file = argv.find((a) => !a.startsWith("--") && !/^\d+$/.test(a));
  if (!file) { log(USAGE); return 1; }
  const offline = argv.includes("--offline");
  const i = argv.indexOf("--idle-min");
  const idleMin = i >= 0 ? Number(argv[i + 1]) || IDLE_MIN : IDLE_MIN;
  let sessions;
  try { sessions = extractSessions(read(file, "utf8")); } catch (e) { log(`archive-sessions: ${e.message}`); return 1; }
  const cache = new Map();
  const state = (n) => { if (offline) return "unknown"; if (!cache.has(n)) cache.set(n, prState(n)); return cache.get(n); };
  const rows = sessions.map((s) => decide(s, { now: now(), idleMin, prState: state }));
  if (argv.includes("--json")) log(JSON.stringify(rows, null, 2));
  else {
    for (const r of rows) log(`${r.verdict.padEnd(7)} ${r.id}  ${r.title.slice(0, 60).padEnd(60)}  ${r.why}`);
    log(`= archive-sessions ${rows.filter((r) => r.verdict === "ARCHIVE").length} archive, ${rows.filter((r) => r.verdict === "KEEP").length} keep`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
