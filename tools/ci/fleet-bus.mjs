#!/usr/bin/env node
// fleet-bus.mjs — the host-neutral message bus (and a generic lease mutex, no longer a merge gate since 2026-10-19 17:50Z): one git branch every host can push.
// @doc Merge lease (one holder, expiry, refusal) and typed fleet bus on the claude/fleet-bus branch, any host.
// Full description: The cross-host fleet channel. The claude/fleet-bus branch's TREE holds the merge lease (lease.json) and its COMMIT LOG is the message bus (one typed line per commit subject). Every write is a fast-forward push, so a lease acquire is compare-and-swap: two hosts racing for it cannot both win. `lease acquire|renew|release|break|check` and `send`/`read` (cursor reads, only new lines).
// @section runner
// @skill agent-fleet
//
// docs/notes/FLEET-BUS-2026-10-19.md is the design and the per-host recipe.
// Why a branch: on 2026-10-19 Cursor's DAD and a Claude ORCH merged
// independently, each pacing "one merge per green Pages run" alone, because
// "the merge holder" was named as a host (Grok Bot) that was not running. The
// only channel Claude, Cursor, Codex and Grok all share is GitHub, and the only
// GitHub write all of them have is `git push` (the cloud containers' proxy
// refuses most of the REST API; who-is-on-it.mjs records the 403s). A branch
// push is refused unless it fast-forwards (git-scm.com/docs/git-push, PUSH
// RULES), so "fetch, decide on the fetched lease, commit on top, push" is an
// atomic compare-and-swap: the loser's push is rejected, it refetches and
// decides again on the winner's lease. An issue comment or a label has no such
// precondition. A host with only the GitHub MCP gets the same swap from the
// Contents API, whose update must name the blob sha it replaces.
//
//   node tools/ci/fleet-bus.mjs lease                                  # who holds it, until when
//   node tools/ci/fleet-bus.mjs lease acquire [--ttl 60] [--note "…"]  # exit 2 = held by someone else
//   node tools/ci/fleet-bus.mjs lease renew | release
//   node tools/ci/fleet-bus.mjs lease check                            # exit 0 only if YOU hold a live lease
//   node tools/ci/fleet-bus.mjs lease break --grant "<the user's words>"   # take a live lease on a user grant
//   node tools/ci/fleet-bus.mjs send READY --to orchestrator "#2990 abc1234 ready-gate 0"
//   Prefer agent-msg.mjs for READY/HANDOFF/INCIDENT/INFO/QUESTION/REQUEST (webhook + bus mirror).
//   node tools/ci/fleet-bus.mjs send LEND --to A --idem lend-3790 "#3790 abc1234 lent for merge merger:A"   # HANDOFF/READY/DONE/BLOCKED/LEND: 20-600 chars
//   node tools/ci/fleet-bus.mjs send ROTATE --to '*' "ORCH B LIVE (replaces …)"   # size-stop succession; `who B` = this SENDER's id
//   node tools/ci/fleet-bus.mjs send GAME-SLOT --to '*' "#2990 <head sha>"   # before a game merge (merge-gate.mjs reads it)
//   node tools/ci/fleet-bus.mjs send BLOCKED --pr 2990 "text"   # --pr <n> is --to '#<n>'; empty text is refused
//   node tools/ci/fleet-bus.mjs send INCIDENT --to '*' --fix <sha> "open pages-red-3801 Pages red on abc1234"   # typed: open <id> <reason> | close <id>
//   node tools/ci/fleet-bus.mjs incidents [--json]   # open INCIDENT ids (artifacts/fleet-bus/incidents.json, whole branch log); exit 3 = a freeze is open
//   node tools/ci/fleet-bus.mjs read [--to merge-holder --to '#2990'] [--since <sha>] [--last 20] [--json] [--peek | --strict]
//   node tools/ci/fleet-bus.mjs who A [--last 500] [--json]   # fleet A's live orchestrator: `A <host:id> <sha7> <age>`; exit 1 none
//   node tools/ci/fleet-bus.mjs watch --to B --to '*' [--all] [--interval 20]   # the orchestrator's Monitor: each NEW line once, never exits
//
// `--to` must be deliverable (addressProblem): *, #<PR>, a fleet letter (A, B·O3), a role, or a real
// <host>:<session id>; a claims-board hash is refused (plan §8.7). A `to:#<PR>` send also dispatches fleet.yml,
// whose fleet-bus-mirror.mjs step posts the line as a comment on that PR (plan §7, item 2).
//
// --idem <key>: an idempotency key (Stripe's pattern: the same key from the same sender is one message). A resend whose key
// appears in the last 200 bus lines from the same sender writes nothing and exits 0, so a retry after a lost reply is safe.
// read --strict (with --to): the cursor stops before the first line the filter hid, so a later wider read still sees it.
// Trade-off: lines shown after that hidden one are shown again next time (at-least-once), and the cursor cannot pass a hidden
// line until some read without that filter (or --since) moves it. Default read is at-most-once for hidden lines (count printed).
//
// HANDOFF is a successor hand-off only (system audit 2 item 6, 2026-10-26: 78 of 138 lines were HANDOFF, ROTATE/LEND 0):
// a HANDOFF body shaped like ORCH LIVE (ROTATE), SEED/HB/[INFO] chatter (INFO), a lend (LEND) or a return (RETURN) is refused
// with the type to use (handoffMisuse). DONE and READY carry an automatic idempotency key `<TYPE>-<pr>-<sha7>` when no --idem
// is given (5 PRs got two DONE lines, #3576 was READY 8 times); an automatic DONE key dedupes across senders (the merge hook
// and the orchestrator report the same merge).
//
// watch: polls the bus every --interval s (default 20) and prints each line it has not printed, filtered by --to like `read`;
// by default a broadcast (to:*) GAME-SLOT / DONE / GREEN / LEASE from another sender is dropped (other fleets' train chatter
// woke ORCH B every ~3 min), --all keeps them. It starts at the tip (the wake pass's `read` covers the backlog), advances
// this sender's read cursor as it prints, writes nothing to stdout but bus lines, and never exits on its own.
//
// Identity: --as <host>:<id>, else APEX_FLEET_AS, else APEX_SESSION_ID (alias, with a hint: Cursor briefs set it), else
// claude:session_<id> (cloud), claude:<CLAUDE_CODE_SESSION_ID> or codex:<CODEX_THREAD_ID>. `--as` that differs from the
// session's own id is refused unless APEX_FLEET_AS is a fleet letter (the mismatch is logged). `send LIVE` is an alias of
// INFO (TYPE_ALIASES; never refused). Each `send` warns when this file's blob differs from the deploy tip's (tipDrift).
// Exit: 0 ok (`--help` too), 1 usage or git failure, 2 refused, 3 `incidents` found an open freeze.
import { readyClaimVerdict } from "../lib/gate-receipt.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pokeFleetBoard } from "./who-is-on-it.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const BUS_BRANCH = "claude/fleet-bus";
/** GAME-SLOT (2026-10-19): the claim a session pushes before a game merge — `#<PR> <head sha>`; the earlier line wins the
 *  push race, and merge-gate.mjs requires the newest live one to name the PR and come from the merging session. */
/** Typed peer and lending lines (system audit lane X1, 2026-10-26): INFO/QUESTION/REQUEST used to ride as `HANDOFF [INFO] …`,
 *  so a reader filtering HANDOFF for rotations got every chat line too. ROTATE is an orchestrator's or worker's size-stop
 *  succession; LEND / RETURN / TRANSFER move a PR's merge between fleets (LEND names the merger: `merger:<letter>`).
 *  Old lines keep parsing: every earlier type stays in the list. */
export const TYPES = ["READY", "GREEN", "BLOCKED", "HANDOFF", "DONE", "INCIDENT", "LEASE", "GAME-SLOT",
  "INFO", "QUESTION", "REQUEST", "ROTATE", "LEND", "RETURN", "TRANSFER"];
/** Protocol lines a reader acts on: the body must say what, which PR, which sha (BODY_MIN..BODY_MAX chars, marker excluded). */
export const PROTOCOL_TYPES = ["HANDOFF", "READY", "DONE", "BLOCKED", "LEND"];
export const BODY_MIN = 20;
export const BODY_MAX = 600;
/** `--idem <key>`: a resend carrying the same key from the same sender within the last IDEM_WINDOW lines is not written again. */
export const IDEM_WINDOW = 200;
const IDEM_KEY = /^[A-Za-z0-9][A-Za-z0-9._:#-]{0,63}$/;
/** Transcript Auditor batch 9: workers that hit "unknown type LIVE" fell back to a burst of HANDOFFs. */
export const TYPE_HINT = "Report status with READY / BLOCKED / DONE; peers talk with INFO / QUESTION / REQUEST; a size-stop " +
  "succession is ROTATE (HANDOFF still parses), and an orchestrator announces itself with `send ROTATE --to '*' \"ORCH <X> LIVE …\"` (`who` reads the sender id; agent-fleet communication.md).";
export const DEFAULT_TTL_MIN = 60;
/** A lease longer than this outlives the Pages p90 (73 min) three times over: a dead holder would block for hours. */
export const MAX_TTL_MIN = 240;
const LEASE_FILE = "lease.json";
const LAST_FILE = "last";
const CURSOR_DIR = path.join(ROOT, "artifacts", "fleet-bus");
/** Types a sender may write that are stored as another type, with the one-line hint printed (audit4 BH3/C4: DAD's
 *  workers are told `send LIVE`; refusing it cost a round trip per lane). The body keeps the word: `LIVE <text>`. */
export const TYPE_ALIASES = { LIVE: { type: "INFO", hint: "= LIVE is sent as INFO (alias): status lines are INFO / READY / BLOCKED" } };
/** { type, hint, prefix } for a typed-in type: an alias maps to its stored type, anything else passes through. Pure. */
export function resolveType(type) {
  const k = String(type || "");
  const a = TYPE_ALIASES[k];
  return a ? { type: a.type, hint: a.hint, prefix: k } : { type: k, hint: "", prefix: "" };
}

/** `<host>:<id>`; null when nothing identifies this session. */
export function whoAmI(env = process.env, flag = "") {
  if (flag) return flag;
  if (env.APEX_FLEET_AS) return env.APEX_FLEET_AS;
  // Cursor briefs export APEX_SESSION_ID=cursor:<bc-id> (who-is-on-it reads it); 27 of 31 lanes hit "no identity" (audit4 C6).
  if (/^(claude|codex|cursor|grok):\S+$/.test(env.APEX_SESSION_ID || "")) return env.APEX_SESSION_ID;
  // A cloud session's remote id (cse_X) is the session_X that send_message and get_session take.
  if (env.CLAUDE_CODE_REMOTE_SESSION_ID) return `claude:${env.CLAUDE_CODE_REMOTE_SESSION_ID.replace(/^cse_/, "session_")}`;
  if (env.CLAUDE_CODE_SESSION_ID) return `claude:${env.CLAUDE_CODE_SESSION_ID}`;
  if (env.CODEX_THREAD_ID) return `codex:${env.CODEX_THREAD_ID}`;
  return null;
}

/** The hint printed when identity came from the APEX_SESSION_ID alias, else "". Pure. */
export const identityHint = (env = process.env, flag = "") => (!flag && !env.APEX_FLEET_AS && env.APEX_SESSION_ID && whoAmI(env) === env.APEX_SESSION_ID
  ? `fleet-bus: identity ${env.APEX_SESSION_ID} from APEX_SESSION_ID (alias); set APEX_FLEET_AS to the same value` : "");

/**
 * May this session send `--as <as>`? Only as its own id (whoAmI without the flag). A session with no own id may name any
 * `<host>:<id>` (Cursor/Grok shells); APEX_FLEET_AS set to a fleet letter (D, D·W33) relays as anyone, the mismatch
 * logged (audit4 G10). Returns { ok, note }. Pure.
 */
export function asVerdict(env, as) {
  if (!as) return { ok: true, note: "" };
  if (/^[A-Z](?:·[A-Za-z0-9]+)*$/.test(env.APEX_FLEET_AS || "")) return { ok: true, note: `fleet-bus: --as ${as} differs from this session (APEX_FLEET_AS=${env.APEX_FLEET_AS}); sending as ${as}` };
  const own = whoAmI(env);
  if (!own || own === as) return { ok: true, note: "" };
  return { ok: false, note: `--as ${as} is not this session (${own}): a session signs only as itself (APEX_FLEET_AS=<fleet letter> to relay)` };
}

/** Bare-word roles that real bus traffic and the docs address (`git log origin/claude/fleet-bus --format=%s`, 2026-10-19). */
export const ROLES = ["orchestrator", "merge-holder", "merge-desk", "tools", "track-engine"];
/** The forms `--to` accepts, quoted in the refusal. */
export const ADDRESS_FORMS = "* | #<PR> | fleet letter A..Z[·<slot>] (A, B·O3) | role (" + ROLES.join(", ") +
  ") | claude:session_<id> | claude:cse_<id> | claude:<uuid> | codex:<uuid|slug-hex> | cursor:bc-<id> | cursor:<uuid|slug-hex> | grok:<uuid|slug-hex|name>";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** A lane slug ending in a hex disambiguator: `refactor-all-b71e`, `track-engine-8d41`. */
const SLUG_HEX = "[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{4,}";
const SESSION_ID = {
  claude: new RegExp(`^(?:session_[A-Za-z0-9]{20,}|cse_[A-Za-z0-9]{20,}|${UUID})$`),
  codex: new RegExp(`^(?:${UUID}|${SLUG_HEX})$`),
  cursor: new RegExp(`^(?:bc-[A-Za-z0-9-]{8,}|${UUID}|${SLUG_HEX})$`),
  // Grok sessions sign with a name (grok:DAD, 212 lines, the D merger): `--to grok:DAD` must deliver (audit4 BH4).
  grok: new RegExp(`^(?:${UUID}|${SLUG_HEX}|[A-Za-z][A-Za-z0-9_-]{1,31})$`),
};

/**
 * Why `to` cannot be delivered, or "" when it can. Pure. A bare 24-hex id is a claims-board hash
 * (who-is-on-it.mjs sessionId: sha256 of a session id cut to 24 hex), which no session receives:
 * on 2026-10-19 C·O1's BLOCKED lines to `claude:1923dcd1d9ef874aad548d82` reached nobody (plan §8.7).
 */
export function addressProblem(to) {
  const a = String(to || "");
  if (!a || /\s/.test(a)) return "--to needs one address";
  if (a === "*" || /^#\d+$/.test(a) || /^[A-Z](?:·[A-Z0-9][A-Za-z0-9]*)*$/.test(a) || ROLES.includes(a)) return "";
  const m = /^([a-z]+):(.+)$/.exec(a);
  if (!m) return `${a} is not an address`;
  if (!SESSION_ID[m[1]]) return `unknown host ${m[1]} (claude, codex, cursor, grok)`;
  if (/^[0-9a-f]{24}$/.test(m[2])) return `${a} is a claims-board hash, not a session id: no session receives it`;
  return SESSION_ID[m[1]].test(m[2]) ? "" : `${a} is not a ${m[1]} session id`;
}

/** The merger fleet letter a LEND line names (`merger:<letter>`), or null. Pure. */
export const lendMerger = (text) => (/(?:^|\s)merger:([A-Z])(?=\s|$|[,.;)])/.exec(String(text || "")) || [])[1] || null;

/** The `[idem:<key>]` marker `--idem` appends, and the key a line carries (null when none). Pure. */
export const idemMarker = (key) => `[idem:${key}]`;
export const idemOf = (text) => (/\[idem:([A-Za-z0-9][A-Za-z0-9._:#-]{0,63})\]\s*$/.exec(String(text || "")) || [])[1] || null;

/**
 * The typed shape a HANDOFF body really has, as { type, why }, or null when it reads as a hand-off. Pure.
 * Order matters: an `ORCH B LIVE … lent` announcement is a ROTATE, not a LEND. Anchored (audit4 BH3, verify-11-20 #14):
 * ROTATE only when the body STARTS `ORCH <L> LIVE`, LEND only on `merger:` or a lend verb at the start, and a SPAWN
 * body is never refused (a quoted "ORCH B LIVE" or "lent" mid-sentence used to bounce real hand-offs).
 */
export function handoffMisuse(body) {
  const b = String(body || "").trim();
  if (/^ORCH\s+[A-Z](?:·[A-Za-z0-9]+)*\s+LIVE\b/.test(b)) return { type: "ROTATE", why: "an `ORCH <L> LIVE` succession announcement" };
  if (/\bSPAWN(?:ED|ING|S)?\b/.test(b)) return null;
  if (/^\[(INFO|QUESTION|REQUEST)\]/i.test(b)) { const t = /^\[(\w+)\]/.exec(b)[1].toUpperCase(); return { type: t, why: `a [${t}] peer line` }; }
  if (/\bSEED\b[^.\n]{0,24}?\b(LIVE|QUOTA|FAILED)\b|^HB\s+[A-Z]\b|\bHB\s+[A-Z]\s+LIVE\b|\bFLEET\s+[A-Z]\s+LIVE\b|^(status|heartbeat)\b/i.test(b)) {
    return { type: "INFO", why: "seed / heartbeat / status chatter" };
  }
  if (/^(?:#\d+\s+(?:[0-9a-f]{7,40}\s+)?)?(?:lend|lent|lending)\b|(?:^|\s)merger:/i.test(b)) return { type: "LEND", why: "a lend (name the merger: `merger:<letter>`)" };
  if (/\breturned\b/i.test(b) || /\bRETURN\b/.test(b)) return { type: "RETURN", why: "a returned PR" };
  return null;
}

/** Why a body is not sendable for `type` ("" when it is). Body is whitespace-collapsed, marker excluded. Pure. */
export function bodyProblem(type, body) {
  // An empty body is never a message (2026-10-26: six empty HANDOFF lines from one
  // sender whose `--body` flag ate the text; the reader then asked for a resend).
  if (!body) return "empty text: a bus line needs a body (text is positional: send TYPE --to ADDR \"text\")";
  if (PROTOCOL_TYPES.includes(type) && (body.length < BODY_MIN || body.length > BODY_MAX)) {
    return `${type} body is ${body.length} chars; protocol lines (${PROTOCOL_TYPES.join(" ")}) take ${BODY_MIN}-${BODY_MAX}: what, which PR, which sha`;
  }
  if (type === "HANDOFF") {
    const m = handoffMisuse(body);
    if (m) return `HANDOFF is a successor hand-off only; this body is ${m.why}: send ${m.type} instead (fleet-bus.mjs send ${m.type} --to …)`;
  }
  if (type === "INCIDENT" && !incidentOf({ type, text: body }) && !/^lifted\b/i.test(body)) {
    return "INCIDENT is typed: `open <id> <reason>` freezes game merges until `close <id>` (id: letters, digits, . _ -; e.g. \"open pages-red-3801 Pages red on abc1234\")";
  }
  if (type === "LEND" && !lendMerger(body)) return "LEND names the fleet that merges: put `merger:<letter>` in the text (e.g. \"#3790 abc1234 merger:A\")";
  return "";
}

/** One bus line. Pure; throws on an unknown type, an unaddressable recipient or a bad body (parseLine still reads old lines). */
export function formatLine(type, to, from, text = "", { idem = "" } = {}) {
  if (!TYPES.includes(type)) throw new Error(`unknown type ${type} (one of ${TYPES.join(" ")}). ${TYPE_HINT}`);
  const bad = addressProblem(to);
  if (bad) throw new Error(`${bad}. --to takes one of: ${ADDRESS_FORMS}`);
  const body = String(text ?? "").replace(/\s+/g, " ").trim();
  const why = bodyProblem(type, body);
  if (why) throw new Error(why);
  if (idem && !IDEM_KEY.test(idem)) throw new Error(`--idem key must match ${IDEM_KEY} (got ${idem})`);
  return `${type} to:${to} from:${from} ${body}${idem ? " " + idemMarker(idem) : ""}`;
}

/** The newest entry in `entries` (oldest first) from `from` (any sender when `from` is null) carrying idempotency `key`, or null. Pure. */
export function findIdem(entries, from, key) {
  if (!key) return null;
  for (let i = (entries || []).length - 1; i >= 0; i--) if ((from === null || entries[i].from === from) && idemOf(entries[i].text) === key) return entries[i];
  return null;
}

/** Types that get an automatic idempotency key when the sender gives none. */
export const AUTO_IDEM_TYPES = ["DONE", "READY"];
/**
 * The automatic key for a DONE / READY line: `<TYPE>-<pr>-<sha7>` from the PR (`#<n>` in the address or body) and the
 * first commit sha in the body (7-40 hex with a letter, so a run id is not one); "" when either is missing. Pure.
 */
export function autoIdem(type, to, text) {
  if (!AUTO_IDEM_TYPES.includes(type)) return "";
  const body = String(text || "");
  const pr = (/^#(\d+)$/.exec(String(to || "")) || /#(\d+)\b/.exec(body) || [])[1];
  const sha = (/(?:^|[^0-9a-f])((?=[0-9a-f]*[a-f])(?=[0-9a-f]*[0-9])[0-9a-f]{7,40})(?![0-9a-f])/.exec(body.replace(/\[idem:[^\]]*\]/g, "")) || [])[1];
  return pr && sha ? `${type}-${pr}-${sha.slice(0, 7).toLowerCase()}` : "";
}

/** `[fix:<sha>]` marker an INCIDENT carries when `send INCIDENT --fix <sha>` names the commit whose green Pages lifts it. */
export const fixMarker = (sha) => `[fix:${sha}]`;
export const fixOf = (text) => (/\[fix:([0-9a-f]{7,40})\]/i.exec(String(text || "")) || [])[1] || null;

/**
 * A typed INCIDENT line (audit4 G2/G16): `open <id> <reason>` or `close <id>[ <note>]`, as { op, id, reason }, or null
 * for any other line. Freezes open and close by id, never by a keyword in free text. Pure.
 */
const INCIDENT_ID = "[A-Za-z0-9][A-Za-z0-9._-]{0,47}";
export function incidentOf(e) {
  if (!e || e.type !== "INCIDENT") return null;
  const m = new RegExp(`^(open|close)\\s+(${INCIDENT_ID})(?:\\s+(.*))?$`).exec(String(e.text || "").trim());
  if (!m || (m[1] === "open" && !String(m[3] || "").replace(/\[(?:fix|idem):[^\]]*\]/g, "").trim())) return null;
  return { op: m[1], id: m[2], reason: (m[3] || "").trim() };
}

/**
 * Fold bus entries (oldest first) into the typed incident ledger { open: { id: { sha, from, at, reason, fix } } }.
 * `close <id>` ends that id only; a legacy auto-lift line (`lifted: Pages green on <sha8> …`, incident-lift.mjs) closes the
 * typed opens whose `[fix:<sha>]` it names. Untyped legacy lines change nothing. Pure; returns a new ledger.
 */
export function foldIncidents(entries, ledger = { open: {} }) {
  const open = { ...(ledger.open || {}) };
  for (const e of entries || []) {
    if (e.type !== "INCIDENT") continue;
    const t = incidentOf(e);
    if (t && t.op === "open") open[t.id] = { sha: e.sha, from: e.from, at: e.at, reason: t.reason, fix: fixOf(e.text) };
    else if (t && t.op === "close") delete open[t.id];
    else if (/^lifted\b/i.test(e.text)) {
      for (const [id, o] of Object.entries(open)) if (o.fix && new RegExp(`\\b${o.fix.slice(0, 8)}`, "i").test(e.text)) delete open[id];
    }
  }
  return { open };
}

/**
 * The open INCIDENT that names a fix sha, as { entry, sha, id }, or null. Pure. entries: oldest first.
 * Typed opens win (newest first); with none, the legacy rule: the newest untyped INCIDENT not followed by `lifted`.
 */
export function openFixIncident(entries) {
  const typed = Object.entries(foldIncidents(entries).open).filter(([, o]) => o.fix).sort((a, b) => b[1].at - a[1].at)[0];
  if (typed) return { entry: (entries || []).find((e) => e.sha === typed[1].sha), sha: typed[1].fix, id: typed[0] };
  let open = null;
  for (const e of entries || []) {
    if (e.type !== "INCIDENT" || incidentOf(e)) continue;
    open = /\blifted\b/i.test(e.text) ? null : e;
  }
  if (!open) return null;
  const sha = fixOf(open.text);
  return sha ? { entry: open, sha } : null;
}

/** A commit subject -> { type, to, from, text }, or null when it is not a bus line. Pure. */
export function parseLine(subject) {
  const m = /^([A-Z][A-Z-]*) to:(\S+) from:(\S+)(?: (.*))?$/.exec(String(subject).trim());
  if (!m || !TYPES.includes(m[1])) return null;
  return { type: m[1], to: m[2], from: m[3], text: m[4] || "" };
}

/** Does a line addressed `to` reach a reader listening on `addrs`? `*` reaches everyone; no filter reads all. Pure. */
export const addressed = (to, addrs = []) => !addrs.length || to === "*" || addrs.includes(to);

/** lease.json text -> the lease, or null when free/unreadable. Pure. */
export function parseLease(text) {
  try {
    const l = JSON.parse(text);
    return l && typeof l.holder === "string" && l.holder && Number.isFinite(l.expires) ? l : null;
  } catch { return null; }
}

/** The lease as of `now` (unix s): { free, holder, expired, leftMin }. An expired lease is free to take. Pure. */
export function leaseState(lease, now) {
  if (!lease) return { free: true, holder: null, expired: false, leftMin: 0 };
  const expired = now >= lease.expires;
  return { free: expired, holder: lease.holder, expired, leftMin: Math.max(0, Math.ceil((lease.expires - now) / 60)) };
}

/**
 * The lease decision, made on the lease as just FETCHED (the push that follows is the swap). Pure.
 * op: acquire | renew | release | break. Returns { ok, lease (next lease.json object, null = free), verb, reason }.
 */
export function decide(op, lease, me, now, { ttlMin = DEFAULT_TTL_MIN, note = "", grant = "" } = {}) {
  const st = leaseState(lease, now);
  const mine = st.holder === me;
  const ttl = Math.min(Math.max(1, Math.round(Number(ttlMin) || DEFAULT_TTL_MIN)), MAX_TTL_MIN);
  const take = (verb) => ({ ok: true, verb, reason: "",
    lease: { holder: me, since: mine && !st.expired ? lease.since : now, expires: now + ttl * 60, ttlMin: ttl, note: note || (mine ? lease.note || "" : "") } });
  const held = `held by ${st.holder} for ${st.leftMin} more min`;
  switch (op) {
    case "acquire":
      return st.free || mine ? take(mine && !st.expired ? "renew" : "acquire") : { ok: false, reason: held };
    case "renew":
      return mine ? take("renew") : { ok: false, reason: st.holder ? `not yours: ${st.free ? "lapsed lease of " + st.holder : held}` : "no lease to renew (acquire)" };
    case "release":
      if (!st.holder) return { ok: false, reason: "no lease to release" };
      if (!mine && !st.expired) return { ok: false, reason: held };
      return { ok: true, verb: mine ? "release" : `clear lapsed ${st.holder}`, reason: "", lease: null };
    case "break":
      if (!String(grant).trim()) return { ok: false, reason: "break needs --grant with the user's words (authority.md)" };
      return { ...take("break"), verb: `break ${st.holder || "(free)"} grant="${String(grant).replace(/"/g, "'").trim()}"` };
    default:
      return { ok: false, reason: `unknown lease op ${op}` };
  }
}

/** The LEASE bus line a decision writes. Pure. */
export function leaseLine(d, me, now) {
  const until = d.lease ? ` ttl=${d.lease.ttlMin}m until=${new Date(d.lease.expires * 1000).toISOString().slice(0, 16)}Z` : "";
  return formatLine("LEASE", "*", me, `${d.verb}${until}${d.lease && d.lease.note ? " " + d.lease.note : ""}`);
}

/** `git log --format=%H%x09%ct%x09%s` lines -> bus entries (non-bus commits dropped). Pure. */
export function parseLog(text) {
  return String(text).split("\n").filter(Boolean).map((l) => {
    const [sha, t, ...s] = l.split("\t");
    const line = parseLine(s.join("\t"));
    return line ? { sha, at: Number(t), ...line } : null;
  }).filter(Boolean);
}

/** Types whose `ORCH <L> LIVE` line names an orchestrator (ROTATE; INFO and HANDOFF for the pre-ROTATE habit). */
export const LIVE_TYPES = ["ROTATE", "INFO", "HANDOFF"];
/** Sender hosts an orchestrator runs on. */
const ORCH_HOSTS = ["claude", "cursor", "grok"];

/**
 * The orchestrator a bus entry announces, as { letter, id }, or null. Pure. The id is the SENDER (audit4 BH1/G9): the
 * body token after LIVE was free text (`claude:OrchA`, `claude:on`, `claude:(booting` answered `who` for ~68 h), and any
 * quoting line re-pointed a fleet. So: a ROTATE/INFO/HANDOFF whose body starts `ORCH <L> LIVE` (after an optional `[INFO]`
 * and at most one lane tag such as `A·O1`), from a deliverable claude/cursor/grok id. `cse_` normalises to `session_`.
 */
export function parseLive(entry) {
  if (!entry || (entry.type && !LIVE_TYPES.includes(entry.type))) return null;
  const m = /^(?:\[INFO\]\s*)?(?:[A-Z](?:·[A-Za-z0-9]+)+\s+)?ORCH\s+([A-Z])\s+LIVE\b/.exec(String(entry.text || "").trim());
  const from = String(entry.from || "").replace(/^claude:cse_/, "claude:session_");
  const host = (/^([a-z]+):/.exec(from) || [])[1];
  if (!m || !ORCH_HOSTS.includes(host) || addressProblem(from)) return null;
  return { letter: m[1], id: from };
}

/** The newest entry announcing fleet `letter`'s orchestrator: { letter, id, sha, at }, or null. Entries oldest first. Pure. */
export function whoIs(entries, letter) {
  const want = String(letter || "").toUpperCase();
  for (let i = (entries || []).length - 1; i >= 0; i--) {
    const live = parseLive(entries[i]);
    if (live && live.letter === want) return { ...live, sha: entries[i].sha, at: entries[i].at };
  }
  return null;
}

/** "45m", "3h", "2d" between two unix-second times. Pure. */
export function ageOf(at, now) {
  const m = Math.max(0, Math.round((now - at) / 60));
  return m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}

/** The `who` output line: `<letter> <host:id> <sha7> <age>`. Pure. */
export const whoLine = (w, now) => `${w.letter} ${w.id} ${String(w.sha).slice(0, 7)} ${ageOf(w.at, now)}`;

/**
 * Write one typed bus line (shared with agent-msg.mjs). Does not shell out.
 * Returns { ok, sha, line, reason, refused }. `log` defaults to a no-op so
 * callers that already print their own status stay quiet; the CLI passes console.log.
 */
export function sendBusLine(type, to, from, text = "", {
  cwd = ROOT, dispatch = pokeFleetBoard, log = () => {}, idem = "",
} = {}) {
  if (type === "LEASE") throw new Error("LEASE lines are written by `lease …`, never sent by hand");
  const alias = resolveType(type);
  if (alias.hint) {
    log(alias.hint);
    type = alias.type;
    const t = String(text ?? "").trim();
    if (t && !new RegExp(`^${alias.prefix}\\b`).test(t)) text = `${alias.prefix} ${t}`;
  }
  // DONE / READY dedupe by (type, PR, sha) without a flag; an automatic DONE key is the merge's, whoever reports it.
  const auto = idem ? "" : autoIdem(type, to, text);
  idem = idem || auto;
  const line = formatLine(type, to, from, text, { idem });
  // The dedupe runs inside the compare-and-swap: a retry after a lost push re-reads the window it decides on.
  const r = writeBus((_lease, { recent }) => {
    const dup = idem ? findIdem(recent(IDEM_WINDOW), auto && type === "DONE" ? null : from, idem) : null;
    return dup ? { ok: true, skip: dup } : { ok: true, line, lease: undefined };
  }, { cwd });
  if (r.ok && r.deduped) { log(`= deduped: idem ${idem} already sent as ${r.sha}; nothing written`); return { ...r, line }; }
  if (r.ok) log(`= sent ${r.sha}: ${line}`);
  else log(`= send FAILED: ${r.reason}`);
  // A `to:#<PR>` line reaches the PR's owner as a comment (fleet-bus-mirror.mjs in fleet.yml).
  if (r.ok && /^#\d+$/.test(to)) {
    let how;
    try { how = dispatch(); } catch (e) { how = `not dispatched (${e.message})`; }
    log(`= mirror ${how}`);
  }
  return { ...r, line };
}

// ---- git -------------------------------------------------------------------

const gitIn = (cwd) => (args, input) => spawnSync("git", args, { cwd, encoding: "utf8", input, env: identityEnv(cwd), timeout: 60_000 });

/** An unconfigured box still signs (the bus line carries the real `from:`). */
function identityEnv(cwd) {
  const env = { ...process.env };
  const has = spawnSync("git", ["config", "user.email"], { cwd, encoding: "utf8" }).stdout.trim();
  if (!has) {
    env.GIT_AUTHOR_NAME = env.GIT_COMMITTER_NAME = "apex26 fleet-bus";
    env.GIT_AUTHOR_EMAIL = env.GIT_COMMITTER_EMAIL = "fleet-bus@apex26.invalid";
  }
  return env;
}

const tracking = (remote) => `refs/remotes/${remote}/${BUS_BRANCH}`;

/** Fetch the bus; returns the tip sha ("" when the branch does not exist yet). */
export function fetchBus({ cwd = ROOT, remote = "origin" } = {}) {
  const run = gitIn(cwd);
  run(["fetch", "--quiet", "--no-tags", remote, `+refs/heads/${BUS_BRANCH}:${tracking(remote)}`]);
  return run(["rev-parse", "--verify", "--quiet", tracking(remote) + "^{commit}"]).stdout.trim();
}

const readFileAt = (run, rev, file) => {
  const r = run(["show", `${rev}:${file}`]);
  return r.status === 0 ? r.stdout : "";
};

/**
 * One write: fetch, let `plan(lease)` decide on the fetched lease, commit on top of the fetched tip, push as a
 * fast-forward. A rejected push means another host wrote first: refetch and decide again (that is the CAS).
 * plan(lease, { tip, recent }) returns { ok, lease?, line, reason } — `lease: undefined` keeps lease.json as it is;
 * `skip: <entry>` writes nothing and reports that entry (an idempotent resend). `recent(n)` = the last n bus entries at tip.
 */
export function writeBus(plan, { cwd = ROOT, remote = "origin", tries = 5 } = {}) {
  const run = gitIn(cwd);
  const step = (a, input) => {
    const r = run(a, input);
    const out = (r.stdout || "").trim();
    // An empty object id would make the refspec `:refs/heads/<bus>`, which DELETES the branch.
    if (r.status !== 0 || !/^[0-9a-f]{40}$/.test(out)) throw new Error(`git ${a[0]} failed (status ${r.status}): ${(r.stderr || "").trim() || "no object id"}`);
    return out;
  };
  let err = "";
  for (let i = 0; i < tries; i++) {
    const tip = fetchBus({ cwd, remote });
    const leaseText = tip ? readFileAt(run, tip, LEASE_FILE) : "";
    const recent = (n) => (tip ? parseLog(run(["log", "--reverse", "--format=%H%x09%ct%x09%s", `-${n}`, tip]).stdout) : []);
    const d = plan(parseLease(leaseText), { tip, recent });
    if (!d.ok) return { ok: false, refused: true, reason: d.reason, sha: "" };
    if (d.skip) return { ok: true, deduped: true, sha: String(d.skip.sha).slice(0, 7), line: "", lease: undefined };
    let commit;
    try {
      const nextLease = d.lease === undefined ? leaseText : d.lease ? JSON.stringify(d.lease) + "\n" : "{}\n";
      const files = [[LAST_FILE, d.line + "\n"], [LEASE_FILE, nextLease || "{}\n"]];
      const rows = files.map(([name, body]) => `100644 blob ${step(["hash-object", "-w", "--stdin"], body)}\t${name}`);
      commit = step(["commit-tree", step(["mktree"], rows.join("\n") + "\n"), ...(tip ? ["-p", tip] : []), "-m", d.line]);
    } catch (e) { return { ok: false, refused: false, reason: e.message, sha: "" }; }
    const r = run(["push", "--quiet", remote, `${commit}:refs/heads/${BUS_BRANCH}`]);
    if (r.status === 0) { run(["update-ref", tracking(remote), commit]); return { ok: true, sha: commit.slice(0, 7), line: d.line, lease: d.lease }; }
    err = (r.stderr || "").trim().split("\n").filter((l) => !/^remote:|^To |^\s*$/.test(l)).join(" ");
  }
  return { ok: false, refused: false, reason: `push kept losing the race: ${err}`, sha: "" };
}

/** The current lease (after a fetch). */
export function readLease({ cwd = ROOT, remote = "origin", fetch = true } = {}) {
  const run = gitIn(cwd);
  const tip = fetch ? fetchBus({ cwd, remote }) : run(["rev-parse", "--verify", "--quiet", tracking(remote)]).stdout.trim();
  return tip ? parseLease(readFileAt(run, tip, LEASE_FILE)) : null;
}

/** Bus entries after `since` (oldest first); with no usable cursor, the last `last` entries. */
export function readBus({ cwd = ROOT, remote = "origin", since = "", last = 20, fetch = true } = {}) {
  const run = gitIn(cwd);
  const tip = fetch ? fetchBus({ cwd, remote }) : run(["rev-parse", "--verify", "--quiet", tracking(remote)]).stdout.trim();
  if (!tip) return { tip: "", entries: [], reset: false };
  const fmt = "--format=%H%x09%ct%x09%s";
  const known = since && run(["merge-base", "--is-ancestor", since, tip]).status === 0;
  const out = known
    ? run(["log", "--reverse", fmt, `${since}..${tip}`]).stdout
    : run(["log", "--reverse", fmt, `-${last}`, tip]).stdout;
  return { tip, entries: parseLog(out), reset: !!since && !known };
}

const bigGit = (cwd) => (args) => spawnSync("git", args, { cwd, encoding: "utf8", timeout: 60_000, maxBuffer: 256 << 20 });
const LOG_FMT = "--format=%H%x09%ct%x09%s";
export const incidentsFile = (cwd = ROOT) => path.join(cwd, "artifacts", "fleet-bus", "incidents.json");

/**
 * The typed incident ledger over the WHOLE bus branch, not a line window (audit4 G16: the 200-line window lasted
 * 1.6-44 h and dec625a65 stayed open 38.7 h). Cached in artifacts/fleet-bus/incidents.json as { tip, open }; extended
 * from the cached tip when it is an ancestor, else rebuilt from the full branch log. Returns { tip, open, rebuilt }.
 */
export function incidentLedger({ cwd = ROOT, remote = "origin", fetch = true, file = incidentsFile(cwd) } = {}) {
  const run = bigGit(cwd);
  const tip = fetch ? fetchBus({ cwd, remote }) : run(["rev-parse", "--verify", "--quiet", tracking(remote)]).stdout.trim();
  if (!tip) return { tip: "", open: {}, rebuilt: false };
  let cached = null;
  try { cached = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* missing: rebuild */ }
  const inc = !!(cached && cached.tip && cached.open && run(["merge-base", "--is-ancestor", cached.tip, tip]).status === 0);
  const r = run(["log", "--reverse", LOG_FMT, "--grep=^INCIDENT to:", inc ? `${cached.tip}..${tip}` : tip]);
  if (r.status !== 0) throw new Error(`git log failed: ${(r.stderr || "").trim()}`);
  const ledger = { tip, ...foldIncidents(parseLog(r.stdout), inc ? cached : { open: {} }) };
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(ledger, null, 1) + "\n"); } catch { /* read-only box */ }
  return { ...ledger, rebuilt: !inc };
}

/** Paths whose merge is a GAME merge (merge-gate.mjs GAME_PATH; one regex, kept equal by the fleet-bus test). */
export const GAME_PATH_RE = /^(js\/|css\/|assets\/|index\.html$|sw\.js$)/;
/** The first commit sha a line's body names (7-40 hex with a letter and a digit), or "". Pure. */
export const shaOf = (text) => ((/(?:^|[^0-9a-f])((?=[0-9a-f]*[a-f])(?=[0-9a-f]*[0-9])[0-9a-f]{7,40})(?![0-9a-f])/.exec(String(text || "").replace(/\[(?:idem|fix):[^\]]*\]/g, "")) || [])[1] || "");
/** The PR a DONE / GAME-SLOT names: `#<n>` in the address, else the first `#<n>` in the body; null when none. Pure. */
export const prOfLine = (e) => { const m = /^#(\d+)$/.exec(String(e?.to || "")) || /#(\d+)\b/.exec(String(e?.text || "")); return m ? Number(m[1]) : null; };

/** A GAME-SLOT claim: the GAME-SLOT type, or the older `HANDOFF GAME-SLOT …` text form; { pr, from, at, sha, text } or null. Pure. */
export function slotOf(e) {
  if (!e) return null;
  const text = e.type === "GAME-SLOT" ? e.text : e.type === "HANDOFF" && /^GAME-SLOT\b/.test(e.text || "") ? e.text.replace(/^GAME-SLOT\s*/, "") : null;
  if (text == null) return null;
  const m = /#(\d+)/.exec(text);
  return { pr: m ? Number(m[1]) : null, from: e.from, at: e.at, sha: e.sha, text };
}

/**
 * Was the merge a DONE line names a game merge? Decided from the merge's own diff (`git diff --name-only <sha>^1 <sha>`),
 * never from the word "game" (audit4 G3: 6 of 77 game merges said nothing, #3736 said both). true / false, or null when
 * the sha is missing or not in this clone (the caller decides; pacing treats null as game, fail-closed).
 */
export function doneIsGame(e, { cwd = ROOT, run = bigGit(cwd) } = {}) {
  const sha = shaOf(e?.text);
  if (!sha) return null;
  const r = run(["diff", "--name-only", `${sha}^1`, sha]);
  if (r.status !== 0) return null;
  return String(r.stdout).split("\n").some((p) => GAME_PATH_RE.test(p.trim()));
}

/**
 * The GAME-SLOT state from bus entries (oldest first): the newest slot, whether its OWN PR's DONE closed it (audit4 G4:
 * any DONE used to end any slot), and the newest DONE whose merge was a game merge. `isGame(e)` -> true | false | null;
 * null with a sha in the body counts as game (fail-closed), null with no sha falls back to the old `game` word.
 * Returns { slot, closedAt, lastGame }. Pure given `isGame`.
 */
export function gameSlotState(entries, { isGame = () => null } = {}) {
  let slot = null, closedAt = 0, lastGame = null;
  for (const e of entries || []) {
    const s = slotOf(e);
    if (s) { slot = s; closedAt = 0; continue; }
    if (e.type !== "DONE") continue;
    const pr = prOfLine(e);
    if (slot && pr !== null && pr === slot.pr) closedAt = e.at;
    const g = isGame(e);
    if (g === true || (g === null && (shaOf(e.text) || (/\bgame\b/i.test(e.text) && !/\bnon-game\b/i.test(e.text))))) lastGame = e;
  }
  return { slot, closedAt, lastGame };
}

export const DEPLOY_BRANCH = "claude/f1-game-project-26h3ng";
export const DRIFT_FETCH_S = 600;
/**
 * The "this copy is behind the deploy tip" warning, or "" (audit4: the seed and OrchA 35 kept refusing on old copies).
 * Compares `git hash-object` of the running fleet-bus.mjs with the deploy tip's blob; fetches the deploy branch at most once
 * per DRIFT_FETCH_S (cache artifacts/fleet-bus/tip-check.json). Never throws: any git failure is no warning.
 */
export function tipDrift({ cwd = ROOT, remote = "origin", now = Math.floor(Date.now() / 1000), self = fileURLToPath(import.meta.url),
  file = path.join(cwd, "artifacts", "fleet-bus", "tip-check.json"), run = bigGit(cwd) } = {}) {
  try {
    if (!fs.existsSync(self)) return "";
    const local = run(["hash-object", self]).stdout.trim();
    let c = null;
    try { c = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* first check */ }
    if (!c || !(now - c.at < DRIFT_FETCH_S)) {
      run(["fetch", "--quiet", "--no-tags", remote, `+refs/heads/${DEPLOY_BRANCH}:refs/remotes/${remote}/${DEPLOY_BRANCH}`]);
      const r = run(["rev-parse", "--verify", "--quiet", `refs/remotes/${remote}/${DEPLOY_BRANCH}:tools/ci/fleet-bus.mjs`]);
      c = { at: now, blob: r.status === 0 ? r.stdout.trim() : "" };
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(c) + "\n"); } catch { /* read-only */ }
    }
    return local && c.blob && local !== c.blob ? `= WARNING fleet-bus is behind the deploy tip; merge origin (blob ${local.slice(0, 7)} vs ${c.blob.slice(0, 7)} on ${DEPLOY_BRANCH})` : "";
  } catch { return ""; }
}

// ---- CLI -------------------------------------------------------------------

/**
 * Where a `read --strict` leaves the cursor: the tip when the filter hid nothing, else the last entry before the first
 * hidden one; "" (leave the cursor as it was) when the very first entry is hidden. Entries oldest first. Pure.
 */
export function strictCursor(entries, addrs, tip) {
  const i = (entries || []).findIndex((e) => !addressed(e.to, addrs));
  if (i < 0) return tip;
  return i === 0 ? "" : entries[i - 1].sha;
}

/** Broadcast types `watch` drops from other senders unless --all: the game train's chatter, not a wake for this fleet. */
export const WATCH_QUIET = ["GAME-SLOT", "DONE", "GREEN", "LEASE"];
/** Does `watch` print entry `e` for a reader `me` listening on `addrs`? Pure. */
export function watchShows(e, addrs = [], { all = false, me = "" } = {}) {
  if (!addressed(e.to, addrs)) return false;
  if (all) return true;
  return !(WATCH_QUIET.includes(e.type) && e.to === "*" && e.from !== me);
}
/** One `read`/`watch` output line. Pure. */
export const busOutLine = (e) => `${new Date(e.at * 1000).toISOString().slice(11, 16)}Z ${e.sha.slice(0, 7)} ${e.type} to:${e.to} from:${e.from} ${e.text}`.trimEnd();
/**
 * One watch poll: the entries (oldest first) not yet in `seen` that the filter shows, and the next state. `seen` is a bounded
 * set of shas, so a bus that is re-read from an older cursor (reset) never prints a line twice. Pure.
 */
export function watchStep(state, read, filter) {
  const seen = new Set(state.seen || []);
  const out = [];
  for (const e of read.entries || []) {
    if (seen.has(e.sha)) continue;
    seen.add(e.sha);
    if (filter(e)) out.push(e);
  }
  return { show: out, state: { cursor: read.tip || state.cursor, seen: [...seen].slice(-500) } };
}

/**
 * The follow mode: poll every `intervalS`, print each new shown line once, never exit (tests stop it with `polls`).
 * Fetch errors go to `err` and the loop keeps going. Advances `cursorPath` (when given) to the tip it has read.
 */
export async function watchBus({ cwd = ROOT, addrs = [], all = false, me = "", intervalS = 20, since = "", log = console.log,
  err = (l) => console.error(l), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), polls = Infinity, read = readBus, cursorPath = "" } = {}) {
  let state = { cursor: since, seen: [] };
  if (!since) {
    const r0 = read({ cwd, last: 1 });
    state = { cursor: r0.tip, seen: r0.entries.map((e) => e.sha) };
  }
  err(`= watch from ${state.cursor ? state.cursor.slice(0, 7) : "(empty bus)"} every ${intervalS}s, to ${addrs.length ? addrs.join(" ") : "(all)"}${all ? ", --all" : ""}`);
  let failing = false;
  for (let i = 0; i < polls; i++) {
    if (i > 0 || since) {
      try {
        const r = read({ cwd, since: state.cursor, last: 50 });
        const step = watchStep(state, r, (e) => watchShows(e, addrs, { all, me }));
        for (const e of step.show) log(busOutLine(e));
        state = step.state;
        if (cursorPath && state.cursor) { fs.mkdirSync(path.dirname(cursorPath), { recursive: true }); fs.writeFileSync(cursorPath, state.cursor + "\n"); }
        failing = false;
      } catch (e) {
        if (!failing) err(`= watch: bus read failed (${e.message}); retrying every ${intervalS}s`);
        failing = true;
      }
    }
    if (i + 1 < polls) await sleep(intervalS * 1000);
  }
  return 0;
}

/** The per-sender read cursor file (fleet-brief.mjs reads it for the hand-off). */
export const cursorFile = (me) => path.join(CURSOR_DIR, `cursor-${String(me).replace(/[^\w.-]+/g, "_")}.txt`);

function usage(msg, { help = false, out = help ? console.log : console.error } = {}) {
  if (msg) console.error(`fleet-bus: ${msg}`);
  out("usage: fleet-bus.mjs lease [acquire|renew|release|check|break] [--ttl MIN] [--note T] [--grant T]\n" +
    "       fleet-bus.mjs send <TYPE> (--to <ADDR> | --pr <n>) [--fix <sha>, INCIDENT only] [--idem KEY] \"<text>\"   ADDR: " + ADDRESS_FORMS + "\n" +
    "       (" + PROTOCOL_TYPES.join("/") + " bodies " + BODY_MIN + "-" + BODY_MAX + " chars; LEND names merger:<letter>; INCIDENT is `open <id> <reason>` | `close <id>`;\n" +
    "        LIVE is an alias of INFO; --idem dedupes a resend in the last " + IDEM_WINDOW + " lines)\n" +
    "       fleet-bus.mjs incidents [--json]   (open typed INCIDENT ids over the whole bus; exit 3: a freeze is open)\n" +
    "       fleet-bus.mjs read [--to ADDR ...] [--since SHA] [--last N] [--json] [--peek | --strict]   (--last applies only when no cursor is known; --peek leaves the cursor; --strict never moves it past a hidden line)\n" +
    "       fleet-bus.mjs who <fleet letter> [--last N] [--json]   (exit 1: no live orchestrator line)\n" +
    "       fleet-bus.mjs watch [--to ADDR ...] [--all] [--interval S] [--since SHA]   (follow mode for a Monitor: each new line once, never exits;\n" +
    "         drops other senders' to:* " + WATCH_QUIET.join("/") + " unless --all)\n" +
    "       common: --as <host>:<id> (only this session's own id, unless APEX_FLEET_AS is a fleet letter); identity env APEX_FLEET_AS,\n" +
    "         else APEX_SESSION_ID (alias)   types: " + TYPES.join(" ") + "   --help: this text, exit 0");
  return help ? 0 : 1;
}

export function main(argv, { cwd = ROOT, now = () => Math.floor(Date.now() / 1000), log = console.log, dispatch = pokeFleetBoard,
  readyCheck = readyClaimVerdict, watch = {}, env = process.env, drift = () => tipDrift({ cwd }), err = (l) => console.error(l) } = {}) {
  const flags = {}, multi = { to: [] }, pos = [];
  if (argv.includes("--help") || argv.includes("-h") || argv[0] === "help") return usage("", { help: true, out: log });
  // Flags are an allow-list: an unknown `--flag` used to swallow the next word
  // (so `--body "text"` sent an empty line). Text is positional.
  const VALUE_FLAGS = new Set(["to", "as", "since", "last", "ttl", "note", "grant", "idem", "pr", "fix", "interval"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") flags.json = true;
    else if (a === "--all") flags.all = true;
    else if (a === "--peek") flags.peek = true;
    else if (a === "--strict") flags.strict = true;
    else if (a.startsWith("--")) {
      const k = a.slice(2);
      if (!VALUE_FLAGS.has(k)) return usage(`unknown flag ${a} (text is positional; flags: --${[...VALUE_FLAGS].join(" --")} --json --peek --strict --all)`);
      const v = argv[++i];
      if (v === undefined) return usage(`${a} needs a value`);
      if (k === "to") multi.to.push(v); else flags[k] = v;
    } else pos.push(a);
  }
  const [cmd, sub] = pos;
  // --as is <host>:<id>; the id itself is not checked (grok:DAD and cursor bot ids are real senders).
  if (flags.as !== undefined && !/^(claude|codex|cursor|grok):\S+$/.test(flags.as)) return usage(`--as must be <host>:<id> (got ${flags.as})`);
  const asOk = asVerdict(env, flags.as);
  const me = whoAmI(env, flags.as);
  const needMe = () => {
    if (!me) throw new Error("no identity: pass --as <host>:<id> or set APEX_FLEET_AS (APEX_SESSION_ID=<host>:<id> also works)");
    if (!asOk.ok) { const e = new Error(asOk.note); e.refused = true; throw e; }
    if (asOk.note) err(asOk.note);
    const hint = identityHint(env, flags.as);
    if (hint) err(hint);
  };
  try {
    if (cmd === "lease") {
      if (!sub) {
        const l = readLease({ cwd }), st = leaseState(l, now());
        if (flags.json) log(JSON.stringify({ lease: l, ...st }));
        else log(st.holder && !st.expired ? `= lease held by ${st.holder} for ${st.leftMin} more min${l.note ? " — " + l.note : ""}`
          : `= lease free${st.expired ? ` (lapsed: ${st.holder})` : ""}`);
        return 0;
      }
      needMe();
      if (sub === "check") {
        const st = leaseState(readLease({ cwd }), now());
        const ok = st.holder === me && !st.expired;
        log(ok ? `= lease yours for ${st.leftMin} more min` : `= lease NOT yours: ${st.holder && !st.expired ? `held by ${st.holder}` : "free — acquire first"}`);
        return ok ? 0 : 2;
      }
      if (!["acquire", "renew", "release", "break"].includes(sub)) return usage(`unknown lease op ${sub}`);
      const r = writeBus((lease) => {
        const t = now();
        const d = decide(sub, lease, me, t, { ttlMin: flags.ttl, note: flags.note, grant: flags.grant });
        return d.ok ? { ...d, line: leaseLine(d, me, t) } : d;
      }, { cwd });
      if (r.ok) { log(`= lease ${sub} ok ${r.sha}: ${r.line}`); return 0; }
      log(`= lease ${sub} ${r.refused ? "REFUSED" : "FAILED"}: ${r.reason}`);
      return r.refused ? 2 : 1;
    }
    if (cmd === "send") {
      needMe();
      if (!sub) return usage("send needs a TYPE");
      if (sub === "LEASE") return usage("LEASE lines are written by `lease …`, never sent by hand");
      if (flags.pr !== undefined && multi.to.length === 0) {
        if (!/^#?\d+$/.test(flags.pr)) return usage("--pr takes a PR number");
        multi.to.push(`#${String(flags.pr).replace(/^#/, "")}`);
      }
      if (multi.to.length !== 1) return usage("send needs exactly one --to (or --pr <n>)");
      if (!TYPES.includes(sub) && !TYPE_ALIASES[sub]) return usage(`unknown type ${sub} (one of ${TYPES.join(" ")}). ${TYPE_HINT}`);
      // No env bypass (audit4 G11: APEX_READY_NO_RECEIPT was in no doc and skipped the receipt for any READY).
      if (sub === "READY") {
        const v = readyCheck(cwd, { text: `${multi.to[0]} ${pos.slice(2).join(" ")}` });
        if (!v.ok) { log(`= send REFUSED: ${v.why}`); return 2; }
      }
      let text = pos.slice(2).join(" ");
      if (flags.fix !== undefined) {
        if (sub !== "INCIDENT") return usage("--fix <sha> belongs on an INCIDENT line");
        if (!/^[0-9a-f]{7,40}$/i.test(flags.fix)) return usage("--fix takes a commit sha (7-40 hex)");
        text = `${text} ${fixMarker(flags.fix)}`.trim();
      }
      const stale = drift();
      if (stale) err(stale);
      const r = sendBusLine(sub, multi.to[0], me, text, { cwd, dispatch, log, idem: flags.idem || "" });
      return r.ok ? 0 : 1;
    }
    if (cmd === "incidents") {
      const l = incidentLedger({ cwd });
      const open = Object.entries(l.open).sort((a, b) => a[1].at - b[1].at);
      if (flags.json) log(JSON.stringify({ tip: l.tip, rebuilt: l.rebuilt, open: l.open }));
      else {
        for (const [id, o] of open) log(`OPEN ${id} ${String(o.sha).slice(0, 7)} from:${o.from} ${ageOf(o.at, now())} ${o.reason}`);
        log(`= incidents ${open.length} open${open.length ? " (game merges frozen until `INCIDENT close <id>`)" : ""}, bus ${l.tip ? l.tip.slice(0, 7) : "empty"}${l.rebuilt ? " (rebuilt from the full log)" : ""}`);
      }
      return open.length ? 3 : 0;
    }
    if (cmd === "who") {
      if (!sub || !/^[A-Za-z]$/.test(sub)) return usage("who needs one fleet letter (A, B, C, D, …)");
      const L = sub.toUpperCase(), last = Number(flags.last) || 500;
      // Not cursor-based: the newest LIVE line may sit behind this session's read cursor.
      const w = whoIs(readBus({ cwd, last }).entries, L);
      if (flags.json) log(JSON.stringify(w ? { ...w, age: ageOf(w.at, now()) } : { letter: L, id: null }));
      else log(w ? whoLine(w, now()) : `= who ${L}: no ORCH ${L} LIVE line in the last ${last} bus entries`);
      return w ? 0 : 1;
    }
    if (cmd === "watch") {
      for (const t of multi.to) { const bad = addressProblem(t); if (bad) return usage(`watch --to: ${bad}`); }
      const iv = flags.interval === undefined ? 20 : Number(flags.interval);
      if (!Number.isFinite(iv) || iv < 5 || iv > 600) return usage("--interval takes 5-600 seconds");
      return watchBus({ cwd, addrs: multi.to, all: !!flags.all, me: me || "", intervalS: iv, since: flags.since || "", log,
        cursorPath: me ? cursorFile(me) : "", ...watch });
    }
    if (cmd === "read") {
      if (flags.peek && flags.strict) return usage("--peek and --strict are exclusive (--peek never moves the cursor)");
      const file = me ? cursorFile(me) : "";
      let since = flags.since || "";
      if (!since && file) try { since = fs.readFileSync(file, "utf8").trim(); } catch { /* first read */ }
      const r = readBus({ cwd, since, last: Number(flags.last) || 20 });
      const shown = r.entries.filter((e) => addressed(e.to, multi.to));
      const hidden = r.entries.length - shown.length;
      if (flags.json) log(JSON.stringify({ tip: r.tip, reset: r.reset, hidden, entries: shown }));
      else for (const e of shown) log(busOutLine(e));
      // --peek reads without moving the cursor; a plain read advances it to the tip,
      // past lines a --to filter hid (the count is printed so nothing vanishes silently);
      // --strict stops it just before the first hidden line (strictCursor).
      const next = flags.strict ? strictCursor(r.entries, multi.to, r.tip) : r.tip;
      if (file && next && !flags.peek) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, next + "\n"); }
      if (!flags.json) {
        const note = r.reset ? " (cursor unknown: last " + (Number(flags.last) || 20) + ")"
          : (flags.last && !flags.since ? " (--last ignored: cursor known; use --since <sha> or --peek)" : "");
        const held = flags.strict && next !== r.tip ? ` (strict: held at ${next ? next.slice(0, 7) : "unchanged"}, before a hidden line)` : "";
        log(`= bus ${shown.length} new${hidden ? ` (${hidden} hidden by --to)` : ""}${note}, cursor ${(flags.strict ? next : r.tip) ? (flags.strict ? next : r.tip).slice(0, 7) : "none"}${flags.peek ? " (peek: cursor not moved)" : ""}${held}`);
      }
      return 0;
    }
    return usage(cmd ? `unknown command ${cmd}` : "");
  } catch (e) {
    console.error(`fleet-bus: ${e.message}`);
    return e.refused ? 2 : 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = main(process.argv.slice(2));
  if (code && typeof code.then === "function") code.then((c) => { process.exitCode = c; }, (e) => { console.error(`fleet-bus: ${e.message}`); process.exitCode = 1; });
  else process.exitCode = code;
}
