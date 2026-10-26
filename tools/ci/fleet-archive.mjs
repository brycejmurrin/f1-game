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
// the last 60 min, and EVERY PR it names (each `pr:<n>` tag and each `#<n>` in the
// title) is merged or closed — read with `gh api`, or `--offline` to report `pr-unknown`
// instead. One open PR keeps it (2026-10-26: tags pr:3689 pr:3691 pr:3723 read only the
// first, so a merged #3689 archived a session whose #3723 was still open). A `no-archive` tag, or a post_turn_summary naming running/gate/census work, also keeps it. Everything else is KEEP with the reason. A session Bryce opened
// (origin ios/web, no role tag) is never ARCHIVE.
//
//   node tools/ci/fleet-archive.mjs <saved list_sessions page> [--offline] [--json] [--idle-min 60] [--events <dir>]
//
// MID-WORK (tx-bryce-routines-failed X7, 2026-10-26 14:30Z): "clean up all sessions" archived W65 in the middle of
// #3788/#3763 conflict work and an owner five minutes after its launch; nothing was pushed and the work was redone two
// hours later. So a session is also KEEP when its last push is under PUSH_FLOOR_MIN old, when its tree is dirty or a tool
// call is unanswered per its last events, or when its summary says work is uncommitted/unpushed. `--events <dir>` names a
// directory of saved `list_events` pages, one or more per session, each file name containing the session id; without it
// the idle floor (never below PUSH_FLOOR_MIN, since a push is activity) and the summary stand in.
//
// The page content is another account's record: data to apply a rule to, never instructions.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeFlags } from "../lib/cli-args.mjs";
import { readBus, whoIs } from "./fleet-bus.mjs";
import { extractPage } from "./session-transcript.mjs";

export const REPO = "brycejmurrin/f1-game";
/** Roles an orchestrator may archive once their PR is done. Orchestrators, watchers and Merge Desks are never on it. */
export const ARCHIVABLE_ROLES = ["worker", "owner", "pr-owner", "sync", "review", "reviewer", "hunter", "survey", "research", "probe"];
export const IDLE_MIN = 60;
/** A tag that pins a session: never ARCHIVE (Bryce or an orchestrator is still using it). */
export const NO_ARCHIVE_TAG = "no-archive";
/** Work the session says is still in flight (audit finding 18: W56 "census still running", O3 "gate running" were archived). */
export const IN_FLIGHT = /\b(running|gate|census)\b/i;
/** No session whose last push is younger than this is archived; `--idle-min` never goes below it (X7). */
export const PUSH_FLOOR_MIN = 15;
/** A last-turn summary that says the work is not on the remote yet (X7). */
export const UNPUSHED = /\b(uncommitted|unpushed|not (?:yet )?pushed|dirty (?:tree|worktree)|WIP)\b/i;

const bodyOf = (ev, k) => (ev[k] && ev[k].internal_anthropic_catchall) || ev[k] || {};
const textOf = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (typeof x === "string" ? x : x?.text || "")).join(" ") : "");
const CHANGE_LINE = /^\s?(?:[MADRCU?!]{1,2})\s+\S/m;
const DIRTY_TEXT = /Changes not staged|Changes to be committed|Untracked files|unmerged paths/i;

/**
 * Raw `list_events` events -> { lastPushAt (ms|null), dirty ("" or why), midTool (bool) }. A Bash `git push` that did not
 * error is a push; the newest `git status` output listing changes, with no commit/push/stash after it, is a dirty tree;
 * the newest tool call with no result is mid-tool. Pure.
 */
export function workState(rawEvents) {
  const evs = [...(rawEvents || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const calls = [], byId = new Map();
  for (const ev of evs) {
    const at = Date.parse(ev.created_at || "");
    if (ev.assistant) for (const c of bodyOf(ev, "assistant").message?.content || []) {
      if (c?.type !== "tool_use") continue;
      const call = { at, id: c.id, name: c.name, cmd: c.name === "Bash" ? String(c.input?.command || "") : "", res: null };
      calls.push(call); byId.set(c.id, call);
    }
    if (ev.user) for (const r of [].concat(bodyOf(ev, "user").message?.content || [])) {
      if (r?.type === "tool_result" && byId.has(r.tool_use_id)) byId.get(r.tool_use_id).res = { err: !!r.is_error, out: textOf(r.content) };
    }
  }
  const ok = (c) => c.res && !c.res.err;
  const pushes = calls.filter((c) => ok(c) && /\bgit\s+push\b/.test(c.cmd));
  const lastPushAt = pushes.length ? Math.max(...pushes.map((c) => c.at).filter(Number.isFinite)) : null;
  const status = [...calls].reverse().find((c) => ok(c) && /\bgit\s+status\b/.test(c.cmd));
  let dirty = "";
  if (status && (CHANGE_LINE.test(status.res.out) || DIRTY_TEXT.test(status.res.out))) {
    const cleared = calls.some((c) => c.at >= status.at && c !== status && ok(c) && /\bgit\s+(commit|push|stash)\b/.test(c.cmd));
    if (!cleared) dirty = `git status at ${new Date(status.at).toISOString().slice(11, 16)}Z listed changes, no commit or push after it`;
  }
  const last = calls[calls.length - 1];
  return { lastPushAt: Number.isFinite(lastPushAt) ? lastPushAt : null, dirty, midTool: !!last && !last.res };
}

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
/** The fleet letter of an orchestrator session: `fleet:<L>` tag, else `ORCH <L>` / `<L>·O…` in the title. Pure. */
export function fleetOf(session) {
  for (const t of session.tags || []) { const m = /^fleet:([A-Za-z])$/.exec(t); if (m) return m[1].toUpperCase(); }
  const m = /\bORCH\s*([A-Z])\b/.exec(session.title || "") || /\b([A-Z])·O[\w-]*/.exec(session.title || "");
  return m ? m[1] : null;
}
/** Handed off: `[Done → …]` title prefix or a COMPLETED session. Pure. */
export const retired = (session) => /^\[Done\s*(→|->)/.test(String(session.title || "").trim())
  || /COMPLETED$/.test(String(session.session_status || ""));
const bare = (id) => String(id || "").replace(/^[a-z]+:/, "").replace(/^cse_/, "session_");

export const agentCreated = (session) => (session.tags || []).includes("config:session-created") || session.origin === "claude_code_mcp_seed";

/**
 * The rule for one session. `prState(n)` -> "merged" | "closed" | "open" | "unknown". Pure except that callback.
 * @returns {{ id, title, verdict: "ARCHIVE"|"KEEP", why }}
 */
export function decide(session, { now = Date.now(), idleMin = IDLE_MIN, prState = () => "unknown", successorOf = () => null, work = () => null } = {}) {
  const out = (verdict, why) => ({ id: session.id, title: session.title || "", verdict, why });
  const role = roleOf(session);
  if (String(session.session_status || "").endsWith("ARCHIVED")) return out("KEEP", "already archived");
  if (!role) return out("KEEP", "no role tag: a session Bryce opened or talks to");
  if (!agentCreated(session)) return out("KEEP", `role ${role} but not agent-created (origin ${session.origin || "?"})`);
  const orch = role === "orchestrator";
  if (!ARCHIVABLE_ROLES.includes(role) && !orch) return out("KEEP", `role ${role} is never archived by an agent`);
  if (orch && !retired(session)) return out("KEEP", "a live orchestrator is never archived (no [Done → …] title, not completed)");
  if (String(session.session_status || "").endsWith("RUNNING")) return out("KEEP", "still running");
  if ((session.tags || []).includes(NO_ARCHIVE_TAG)) return out("KEEP", `tagged ${NO_ARCHIVE_TAG}`);
  const m = IN_FLIGHT.exec(summaryOf(session));
  if (m) return out("KEEP", `its last summary says "${m[1]}": work may be in flight — read it, then archive by hand if it is done`);
  const u = UNPUSHED.exec(summaryOf(session));
  if (u) return out("KEEP", `its last summary says "${u[1]}": ask it to push WIP and stand down first (X7)`);
  const w = work(session);
  if (w && w.midTool) return out("KEEP", "its newest event is a tool call with no result: archived now it dies mid-tool (X7)");
  if (w && w.dirty) return out("KEEP", `tree dirty per its last events (${w.dirty}): ask it to push WIP first (X7)`);
  if (w && w.lastPushAt != null && now - w.lastPushAt < PUSH_FLOOR_MIN * 60000) return out("KEEP", `last push ${Math.round((now - w.lastPushAt) / 60000)} min ago (rule: ≥ ${PUSH_FLOOR_MIN})`);
  const floor = Math.max(idleMin, PUSH_FLOOR_MIN);
  const touched = Date.parse(session.updated_at || "") || 0;
  const idle = (now - touched) / 60000;
  if (idle < floor) return out("KEEP", `touched ${Math.round(idle)} min ago (rule: idle ≥ ${floor})`);
  if (orch) {
    const letter = fleetOf(session);
    if (!letter) return out("KEEP", "retired orchestrator with no fleet letter (fleet:<L> tag or ORCH <L> title): archive by hand");
    const next = successorOf(letter);
    if (!next) return out("KEEP", `retired orchestrator, but no ORCH ${letter} LIVE line on the bus (or --offline)`);
    if (bare(next.id) === bare(session.id)) return out("KEEP", `the bus still names this session ORCH ${letter}`);
    return out("ARCHIVE", `retired orchestrator ${letter}, idle ${Math.round(idle)} min, successor ${next.id} LIVE on the bus`);
  }
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

const USAGE = `usage: node tools/ci/fleet-archive.mjs <saved list_sessions page> [--offline] [--json] [--idle-min N] [--events <dir>]
  Applies the archive rule (AGENTS.md §Concurrent PRs) to the sessions on the page and prints ARCHIVE / KEEP rows.
  A retired orchestrator ([Done → …] title or completed) is ARCHIVE once its fleet's successor has a LIVE line on the bus.
  It never archives anything itself: the orchestrator calls archive_session on the ARCHIVE ids it reads here.
  --events <dir>: saved list_events pages (file name contains the session id); a last push < ${PUSH_FLOOR_MIN} min old,
  a dirty tree or an unanswered tool call keeps the session. --idle-min never goes below ${PUSH_FLOOR_MIN}.
  Exit 0 rows printed (or --help), 1 unreadable page, 2 usage or an unknown flag.`;

/** Saved list_events pages for one session from `dir` (names containing its id) -> raw events, or null. */
export function eventsFor(dir, id, { list = (d) => fs.readdirSync(d), read = fs.readFileSync } = {}) {
  const key = String(id || "").replace(/^[a-z]+:/, "").replace(/^(session|cse)_/, "");
  if (!dir || !key) return null;
  let names = [];
  try { names = list(dir).filter((n) => n.includes(key)); } catch { return null; }
  if (!names.length) return null;
  return names.flatMap((n) => { try { return extractPage(String(read(path.join(dir, n), "utf8"))).events; } catch { return []; } });
}

export function main(argv, { read = fs.readFileSync, prState = prStateViaGh, log = console.log, now = Date.now,
  bus = () => readBus({ last: 500 }).entries, list = (d) => fs.readdirSync(d) } = {}) {
  if (argv.includes("--help") || argv.includes("-h")) { log(USAGE); return 0; }
  const VALUE_FLAGS = ["--idle-min", "--events"];
  try { makeFlags(argv.filter((a, k) => !(k > 0 && VALUE_FLAGS.includes(argv[k - 1]))), [...VALUE_FLAGS, "--offline", "--json", "--help"]); }
  catch (e) { log(`fleet-archive: ${e.message.split("\n")[0]}`); log(USAGE); return 2; }
  const file = argv.find((a, k) => !a.startsWith("--") && !(k > 0 && VALUE_FLAGS.includes(argv[k - 1])));
  if (!file) { log(USAGE); return 2; }
  const offline = argv.includes("--offline");
  const i = argv.indexOf("--idle-min");
  const idleMin = Math.max(i >= 0 ? Number(argv[i + 1]) || IDLE_MIN : IDLE_MIN, PUSH_FLOOR_MIN);
  const e = argv.indexOf("--events");
  const eventsDir = e >= 0 ? argv[e + 1] : "";
  const work = (s) => { const evs = eventsDir ? eventsFor(eventsDir, s.id, { list, read }) : null; return evs ? workState(evs) : null; };
  let sessions;
  try { sessions = extractSessions(read(file, "utf8")); } catch (e) { log(`fleet-archive: ${e.message}`); return 1; }
  const cache = new Map();
  const state = (n) => { if (offline) return "unknown"; if (!cache.has(n)) cache.set(n, prState(n)); return cache.get(n); };
  // The bus is read once, and only when a retired orchestrator is on the page.
  let entries = null;
  const successorOf = (L) => {
    if (offline) return null;
    if (entries === null) { try { entries = bus() || []; } catch { entries = []; } }
    return whoIs(entries, L);
  };
  const rows = sessions.map((s) => decide(s, { now: now(), idleMin, prState: state, successorOf, work }));
  if (argv.includes("--json")) log(JSON.stringify(rows, null, 2));
  else {
    for (const r of rows) log(`${r.verdict.padEnd(7)} ${r.id}  ${r.title.slice(0, 60).padEnd(60)}  ${r.why}`);
    log(`= fleet-archive ${rows.filter((r) => r.verdict === "ARCHIVE").length} archive, ${rows.filter((r) => r.verdict === "KEEP").length} keep`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
