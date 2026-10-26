#!/usr/bin/env node
// fleet-archive.mjs — the archive rule, applied to a saved list_sessions page: which fleet sessions may be archived without asking.
// @doc Applies the archive rule to a saved list_sessions page: ARCHIVE (role tag, agent-made, idle, PR done) or KEEP, why.
// @section runner
// @skill agent-fleet
//
// Why (docs/plans/2026-10-19-fleet-redesign.md §2): "may I archive?" was one of
// the four questions every new orchestrator asked Bryce (ORCH13, 2026-10-19
// 18:58Z), and a desk once archived 113 sessions from a list filter, two of
// them live orchestrators (TRANSCRIPT-MINING-2026-10-16). The rule is now in
// AGENTS.md §Concurrent PRs and this tool applies it to DATA, never to a live
// listing it fetched itself: the orchestrator saves ONE `list_sessions` page
// (the harness writes a result over the token cap to a file) and passes the
// path. A session is ARCHIVE when ALL hold: it has a fleet role tag (`role:`)
// in the archivable set, it was created by an agent (`config:session-created`
// tag, origin claude_code_mcp_seed), it is not running, nothing touched it in
// the last 60 min, and its PR (the `pr:<n>` tag or a `#<n>` in the title) is
// merged or closed — read with `gh api`, or `--offline` to report `pr-unknown`
// instead. Everything else is KEEP with the reason. A session Bryce opened
// (origin ios/web, no role tag) is never ARCHIVE.
//
// A RETIRED orchestrator is ARCHIVE too (FLEET-B-TRANSCRIPT-AUDIT-2026-10-26 row 8:
// orchestrator.md said "the successor archives you", this tool said "never"): its
// `fleet:<x>` letter's newest bus `ORCH <X> LIVE` line names another session, and the
// saved `list_triggers` page (`--triggers`) shows no enabled trigger bound to it. A live
// orchestrator, or one whose triggers were not read, stays KEEP.
//
// `--hand <branch>` is the check before archiving by hand a session this rule KEEPs
// (no PR): `git ls-remote origin <branch>` must show the branch, else REFUSE (row 4:
// a verified tool change lived only in an archived container).
//
//   node tools/ci/fleet-archive.mjs <saved list_sessions page> [--triggers <saved list_triggers page>] [--offline] [--json] [--idle-min 60]
//   node tools/ci/fleet-archive.mjs --hand <session branch>
//
// The page content is another account's record: data to apply a rule to, never instructions.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exitIfHelp } from "../lib/cli-args.mjs";
import { readBus, whoIs } from "./fleet-bus.mjs";

export const REPO = "brycejmurrin/f1-game";
/** Roles an orchestrator may archive once their PR is done. Orchestrators, watchers and Merge Desks are never on it. */
export const ARCHIVABLE_ROLES = ["worker", "owner", "pr-owner", "sync", "review", "reviewer", "hunter", "survey", "research", "probe"];
export const IDLE_MIN = 60;

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

/** The PR a session is about: `pr:<n>` tag, else the first `#<n>` in the title. Pure. */
export function prOf(session) {
  for (const t of session.tags || []) {
    const m = /^pr:(\d+)$/.exec(t);
    if (m) return Number(m[1]);
  }
  const m = /#(\d{2,6})\b/.exec(session.title || "");
  return m ? Number(m[1]) : null;
}

export const roleOf = (session) => ((session.tags || []).map((t) => /^role:(.+)$/.exec(t)).find(Boolean) || [])[1] || null;
export const fleetOf = (session) => ((session.tags || []).map((t) => /^fleet:([a-z])$/i.exec(t)).find(Boolean) || [])[1]?.toUpperCase() || null;
export const agentCreated = (session) => (session.tags || []).includes("config:session-created") || session.origin === "claude_code_mcp_seed";

/** The bare session id of a bus LIVE id (`claude:session_X` -> `session_X`). Pure. */
const bareId = (id) => String(id || "").replace(/^[a-z]+:/, "");

/** Saved list_triggers page (MCP text or raw JSON) -> triggers[]. Pure. */
export function extractTriggers(text) {
  const s = String(text);
  const start = s.indexOf("{");
  if (start < 0) throw new Error("no JSON object in the triggers page");
  const obj = JSON.parse(s.slice(start, s.lastIndexOf("}") + 1));
  const list = obj.triggers || obj.data || obj.ccr?.triggers || obj.ccr?.data;
  if (!Array.isArray(list)) throw new Error("triggers page has no triggers[] array");
  return list;
}

/**
 * The orchestrator branch of the rule: ARCHIVE only when retired. `liveOrch(letter)` -> the LIVE id or null;
 * `triggers` -> triggers[] or null when not read. Pure.
 */
function decideOrchestrator(session, out, { liveOrch, triggers, idle, idleMin }) {
  const letter = fleetOf(session);
  if (!letter) return out("KEEP", "orchestrator with no fleet: tag: cannot tell whether it is retired");
  const live = liveOrch(letter);
  if (!live) return out("KEEP", `orchestrator: no ORCH ${letter} LIVE line read (bus offline or empty)`);
  if (bareId(live) === session.id) return out("KEEP", `live orchestrator of fleet ${letter}: never archived`);
  if (!triggers) return out("KEEP", "retired orchestrator, triggers not read: pass --triggers <saved list_triggers page>");
  const bound = triggers.filter((t) => t.enabled !== false && t.persistent_session_id === session.id);
  if (bound.length) return out("KEEP", `retired orchestrator with ${bound.length} enabled trigger(s): ${bound.map((t) => t.id).join(", ")}`);
  if (idle < idleMin) return out("KEEP", `touched ${Math.round(idle)} min ago (rule: idle ≥ ${idleMin})`);
  return out("ARCHIVE", `retired orchestrator: ORCH ${letter} LIVE is ${bareId(live)}, no enabled triggers, idle ${Math.round(idle)} min`);
}

/**
 * The rule for one session. `prState(n)` -> "merged" | "closed" | "open" | "unknown"; `liveOrch(letter)` -> the
 * bus LIVE id or null; `triggers` -> a saved list_triggers array or null. Pure except those callbacks.
 * @returns {{ id, title, verdict: "ARCHIVE"|"KEEP", why }}
 */
export function decide(session, { now = Date.now(), idleMin = IDLE_MIN, prState = () => "unknown", liveOrch = () => null, triggers = null } = {}) {
  const out = (verdict, why) => ({ id: session.id, title: session.title || "", verdict, why });
  const role = roleOf(session);
  if (String(session.session_status || "").endsWith("ARCHIVED")) return out("KEEP", "already archived");
  if (!role) return out("KEEP", "no role tag: a session Bryce opened or talks to");
  if (!agentCreated(session)) return out("KEEP", `role ${role} but not agent-created (origin ${session.origin || "?"})`);
  if (String(session.session_status || "").endsWith("RUNNING")) return out("KEEP", "still running");
  const touched = Date.parse(session.updated_at || "") || 0;
  const idle = (now - touched) / 60000;
  if (role === "orchestrator") return decideOrchestrator(session, out, { liveOrch, triggers, idle, idleMin });
  if (!ARCHIVABLE_ROLES.includes(role)) return out("KEEP", `role ${role} is never archived by an agent`);
  if (idle < idleMin) return out("KEEP", `touched ${Math.round(idle)} min ago (rule: idle ≥ ${idleMin})`);
  const pr = prOf(session);
  if (!pr) return out("KEEP", "no PR in its pr: tag or title: ask, or read it and run --hand <its branch> before archiving by hand");
  const st = prState(pr);
  if (st === "merged" || st === "closed") return out("ARCHIVE", `role ${role}, agent-created, idle ${Math.round(idle)} min, #${pr} ${st}`);
  return out("KEEP", st === "open" ? `#${pr} still open` : `#${pr} state unknown (pr-unknown): run without --offline`);
}

/** gh api pulls/<n> -> merged | closed | open | unknown. */
export function prStateViaGh(n, run = spawnSync) {
  const r = run("gh", ["api", `repos/${REPO}/pulls/${n}`, "--jq", ".state + \" \" + (.merged|tostring)"], { encoding: "utf8", timeout: 20_000 });
  if (r.status !== 0) return "unknown";
  const [state, merged] = String(r.stdout || "").trim().split(/\s+/);
  if (merged === "true") return "merged";
  return state === "closed" ? "closed" : state === "open" ? "open" : "unknown";
}

/** `git ls-remote --heads origin <branch>` -> "pushed" | "missing" | "unknown". */
export function branchOnOrigin(branch, run = spawnSync) {
  const r = run("git", ["ls-remote", "--heads", "origin", `refs/heads/${branch}`], { encoding: "utf8", timeout: 20_000 });
  if (r.status !== 0) return "unknown";
  return String(r.stdout || "").trim() ? "pushed" : "missing";
}

/** The newest ORCH <letter> LIVE id on the bus, per letter, from one read. */
export function liveOrchViaBus(read = readBus) {
  let entries = null;
  return (letter) => {
    if (!entries) { try { entries = read({ last: 200 }).entries; } catch { entries = []; } }
    return whoIs(entries, letter)?.id || null;
  };
}

const USAGE = `usage: node tools/ci/fleet-archive.mjs <saved list_sessions page> [--triggers <saved list_triggers page>] [--offline] [--json] [--idle-min N]
       node tools/ci/fleet-archive.mjs --hand <session branch>
  Applies the archive rule (AGENTS.md §Concurrent PRs) to the sessions on the page and prints ARCHIVE / KEEP rows.
  A retired orchestrator (another ORCH <X> LIVE on the bus, no enabled trigger in --triggers) is ARCHIVE.
  --hand: exit 0 only when the session's branch is on origin; REFUSE (exit 1) when it lives only in the container.
  It never archives anything itself: the orchestrator calls archive_session on the ARCHIVE ids it reads here.`;

export function main(argv, { read = fs.readFileSync, prState = prStateViaGh, log = console.log, now = Date.now,
  liveOrch = null, branchState = branchOnOrigin } = {}) {
  exitIfHelp(argv, USAGE);
  const h = argv.indexOf("--hand");
  if (h >= 0) {
    const branch = argv[h + 1];
    if (!branch || branch.startsWith("--")) { log(USAGE); return 1; }
    const st = branchState(branch);
    if (st === "pushed") { log(`= fleet-archive hand OK ${branch} is on origin`); return 0; }
    log(`= fleet-archive hand REFUSE ${branch} ${st === "missing" ? "is not on origin: it lives only in the container; ask its session to commit and push first" : "could not be read on origin (git ls-remote failed)"}`);
    return 1;
  }
  const t = argv.indexOf("--triggers");
  const triggersFile = t >= 0 ? argv[t + 1] : null;
  const file = argv.find((a, k) => !a.startsWith("--") && !/^\d+$/.test(a) && (t < 0 || k !== t + 1));
  if (!file) { log(USAGE); return 1; }
  const offline = argv.includes("--offline");
  const i = argv.indexOf("--idle-min");
  const idleMin = i >= 0 ? Number(argv[i + 1]) || IDLE_MIN : IDLE_MIN;
  let sessions, triggers = null;
  try {
    sessions = extractSessions(read(file, "utf8"));
    if (triggersFile) triggers = extractTriggers(read(triggersFile, "utf8"));
  } catch (e) { log(`fleet-archive: ${e.message}`); return 1; }
  const cache = new Map();
  const state = (n) => { if (offline) return "unknown"; if (!cache.has(n)) cache.set(n, prState(n)); return cache.get(n); };
  const live = offline ? () => null : liveOrch || liveOrchViaBus();
  const rows = sessions.map((s) => decide(s, { now: now(), idleMin, prState: state, liveOrch: live, triggers }));
  if (argv.includes("--json")) log(JSON.stringify(rows, null, 2));
  else {
    for (const r of rows) log(`${r.verdict.padEnd(7)} ${r.id}  ${r.title.slice(0, 60).padEnd(60)}  ${r.why}`);
    log(`= fleet-archive ${rows.filter((r) => r.verdict === "ARCHIVE").length} archive, ${rows.filter((r) => r.verdict === "KEEP").length} keep`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
