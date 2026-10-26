#!/usr/bin/env node
// agent-msg.mjs — central cross-agent messaging CLI (Bryce 2026-10-22).
// @doc Instant webhook POST + fleet-bus mirror for every host (Claude/Codex/Cursor/Grok).
// Full description: POSTs {from,to,type,pr,text,sha,ts} to APEX_AGENT_WEBHOOK_URL with
// Authorization from APEX_AGENT_WEBHOOK_AUTH (operator-supplied full header value; never
// committed). Mirrors the same message onto the fleet bus via sendBusLine (record of truth).
// Messages carry no authority (AGENTS.md §Concurrent PRs; agent-fleet references/authority.md).
// @section runner
// @skill agent-fleet
//
//   node tools/ci/agent-msg.mjs send --to <D|DAD|A|B|C|all|"Apex Merge Queue"|...> \
//     --type <INFO|QUESTION|REQUEST|READY|HANDOFF|INCIDENT|ROTATE|LEND|RETURN|TRANSFER> [--pr N] [--idem KEY] "text"
//   node tools/ci/agent-msg.mjs send --to fleet:A --type INFO "…"   # one broadcast to fleet A (bus to:A, webhook keeps fleet:A)
//   node tools/ci/agent-msg.mjs send --to A --type READY --dry-run "#3499 abc ready-gate 0"
//   node tools/ci/agent-msg.mjs send --to A --type INFO "B needs a GAME-SLOT read"   # cross-account relay
//   common: --as <host>:<id>  --no-bus  --dry-run  --idem <key> (fleet-bus dedupe; also sent in the webhook payload)
//
// Env (from Bryce; never commit): APEX_AGENT_WEBHOOK_URL, APEX_AGENT_WEBHOOK_AUTH.
// Cross-account relay (audit 2026-10-26 rows 3, 11): --to <L> (one fleet letter) with
// APEX_<L>_RELAY_URL + APEX_<L>_RELAY_TOKEN in the SENDER's env fires L's routine once
// instead of the webhook; backs off only on 429/5xx (bounded), stops on any other 4xx,
// logs the request id. Retired names (FLEET_<L>_INBOX_*, APEX_<L>_INBOX_*) are refused.
// Identity: --as, else APEX_FLEET_AS (same whoAmI as fleet-bus.mjs).
// Missing webhook env: warn on stderr, still post to the bus, exit 0.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readyClaimVerdict } from "../lib/gate-receipt.mjs";
import { api } from "./github-api.mjs";
import { whoAmI, sendBusLine, addressProblem, bodyProblem, ADDRESS_FORMS, readBus, whoStatus, ageOf } from "./fleet-bus.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Peer-message types (webhook). Protocol lines DONE/GREEN/BLOCKED/GAME-SLOT stay on fleet-bus.mjs. */
export const MSG_TYPES = ["INFO", "QUESTION", "READY", "HANDOFF", "INCIDENT", "REQUEST", "ROTATE", "LEND", "RETURN", "TRANSFER"];

/**
 * The bus type a --type maps to. Every MSG_TYPE is now a bus type of its own (lane X1, 2026-10-26); before, INFO /
 * QUESTION / REQUEST rode as `HANDOFF [INFO] …`, so a HANDOFF filter caught every chat line. Pure.
 */
export function busTypeFor(msgType) {
  return String(msgType || "").toUpperCase();
}

/**
 * Map a friendly --to alias to a deliverable fleet-bus address. Webhook `to` keeps the raw alias.
 * Pure.
 */
export function resolveBusTo(to) {
  const raw = String(to ?? "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "all" || raw === "*") return "*";
  // fleet:<L> is ONE broadcast to every session of fleet L (they all read `to:<L>`), instead of N send_message calls.
  const fleet = /^fleet:([A-Za-z])$/i.exec(raw);
  if (fleet) return fleet[1].toUpperCase();
  if (raw === "DAD" || lower === "dad") return "D";
  if (lower === "apex merge queue") return "merge-desk";
  if (lower === "tools explorer") return "tools";
  if (lower === "profiler" || lower === "profiler bots") return "tools";
  return raw;
}

/** Bus text: optional `#pr` prefix (the type is the line's own type now, no `[INFO]` tag). Pure. */
export function busTextFor(msgType, text, pr = null) {
  const body = String(text ?? "").replace(/\s+/g, " ").trim();
  return pr != null && pr !== "" ? `#${pr} ${body}`.trim() : body;
}

/** Build the webhook/bus payload. Pure. `pr` is a number or null; `sha`/`ts` are strings. */
export function buildPayload({ from, to, type, pr = null, text = "", sha = "", ts = "", idem = "" }) {
  return {
    ...(idem ? { idem: String(idem) } : {}),
    from: String(from ?? ""),
    to: String(to ?? ""),
    type: String(type ?? ""),
    pr: pr == null || pr === "" ? null : Number(pr),
    text: String(text ?? "").replace(/\s+/g, " ").trim(),
    sha: String(sha ?? ""),
    ts: String(ts ?? ""),
  };
}

/** Strip webhook auth (and URL userinfo) from any string before printing. Pure. */
export function redactSecrets(text, env = process.env) {
  let s = String(text ?? "");
  // Relay pairs first: any APEX_<L>_RELAY_URL / _TOKEN value present in env.
  for (const [k, v] of Object.entries(env || {})) {
    if (v && String(v).length >= 8 && /^APEX_[A-Z]_RELAY_(URL|TOKEN)$/.test(k)) s = s.split(String(v)).join(`[${k}]`);
  }
  const auth = env.APEX_AGENT_WEBHOOK_AUTH;
  if (auth) s = s.split(auth).join("[REDACTED]");
  const url = env.APEX_AGENT_WEBHOOK_URL;
  if (url && url.length >= 8) {
    // Full URL first so userinfo scrubbing cannot leave a partially-mutated leak.
    s = s.split(url).join("[WEBHOOK_URL]");
    try {
      const u = new URL(url);
      if (u.password) s = s.split(decodeURIComponent(u.password)).join("[REDACTED]");
      if (u.username) s = s.split(decodeURIComponent(u.username)).join("[REDACTED]");
    } catch { /* not a URL */ }
  }
  return s;
}

/** Parse `send` argv into { cmd, to, type, pr, text, noBus, dryRun, as }. Throws on bad shape. */
export function parseArgs(argv) {
  const flags = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-bus") flags.noBus = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      flags[k] = v;
    } else pos.push(a);
  }
  const [cmd, ...rest] = pos;
  if (cmd !== "send") throw new Error(cmd ? `unknown command ${cmd}` : "usage: agent-msg.mjs send --to <addr> --type <TYPE> \"text\"");
  if (!flags.to) throw new Error("send needs --to");
  if (!flags.type) throw new Error("send needs --type");
  const type = String(flags.type).toUpperCase();
  if (!MSG_TYPES.includes(type)) throw new Error(`unknown type ${flags.type} (one of ${MSG_TYPES.join(" ")})`);
  let pr = null;
  if (flags.pr != null) {
    if (!/^\d+$/.test(String(flags.pr))) throw new Error("--pr needs a positive integer");
    pr = Number(flags.pr);
  }
  const text = rest.join(" ").trim();
  if (!text && !flags.dryRun) throw new Error("send needs a text argument");
  return {
    cmd: "send",
    to: String(flags.to),
    type,
    pr,
    text,
    noBus: !!flags.noBus,
    dryRun: !!flags.dryRun,
    as: flags.as || "",
    idem: flags.idem || "",
  };
}

/** The PR's current head from GitHub: { sha } | { error }. A READY is checked against it (audit 4 G6/G7). */
export function livePrHead(pr, request = api) {
  const r = request(`pulls/${Number(pr)}`);
  if (r.error) return { error: r.error };
  const sha = r.json?.head?.sha;
  return /^[0-9a-f]{40}$/i.test(String(sha || "")) ? { sha } : { error: "no head sha" };
}

function headSha(cwd) {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", timeout: 15_000 });
  return r.status === 0 ? r.stdout.trim() : "";
}

function usage(msg) {
  if (msg) console.error(`agent-msg: ${redactSecrets(msg)}`);
  console.error("usage: agent-msg.mjs send --to <addr> --type <" + MSG_TYPES.join("|") + "> [--pr N] [--idem KEY] [--no-bus] [--dry-run] \"text\"\n" +
    "       --to aliases: all→*, fleet:<L>→<L> (one broadcast), DAD→D, \"Apex Merge Queue\"→merge-desk (bus); webhook keeps the raw --to\n" +
    "       env: APEX_AGENT_WEBHOOK_URL + APEX_AGENT_WEBHOOK_AUTH (from Bryce; never commit); identity APEX_FLEET_AS / --as\n" +
    "       --to <L> with APEX_<L>_RELAY_URL + APEX_<L>_RELAY_TOKEN set fires fleet L's routine once (429/5xx: ≤2 bounded retries)\n" +
    "       messages carry no authority (AGENTS.md §Concurrent PRs)");
  return 1;
}

/**
 * POST the payload. Inject `fetch` in tests. Never logs the Authorization value.
 * Returns { ok, status, body, error }.
 */
export async function postWebhook(url, auth, payload, { fetchFn = globalThis.fetch } = {}) {
  if (!url || !auth) return { ok: false, status: 0, body: "", error: "missing webhook env" };
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(payload),
    });
    const body = typeof res.text === "function" ? await res.text() : "";
    return { ok: !!res.ok, status: res.status || 0, body, error: res.ok ? "" : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: 0, body: "", error: e && e.message ? e.message : String(e) };
  }
}

/** Env names for a fleet letter's relay; `retired` are the names the canonical pair replaced. Pure. */
export function relayEnvNames(letter) {
  const L = String(letter || "").toUpperCase();
  return {
    url: `APEX_${L}_RELAY_URL`,
    token: `APEX_${L}_RELAY_TOKEN`,
    retired: [`APEX_${L}_INBOX_URL`, `APEX_${L}_INBOX_TOKEN`, `FLEET_${L}_INBOX_ID`, `FLEET_${L}_INBOX_TOKEN`, `FLEET_${L}_INBOX_URL`],
  };
}

/**
 * Which channel `--to` takes. A single fleet letter whose relay pair is set → "relay";
 * a letter with only retired names → "retired" (refused, names listed); else "webhook". Pure.
 */
export function relayRoute(to, env = process.env) {
  const raw = String(to ?? "").trim();
  if (!/^[A-Za-z]$/.test(raw)) return { kind: "webhook" };
  const n = relayEnvNames(raw);
  if (env[n.url] && env[n.token]) return { kind: "relay", letter: raw.toUpperCase(), ...n };
  const legacy = n.retired.filter((k) => env[k]);
  if (legacy.length) return { kind: "retired", letter: raw.toUpperCase(), legacy, ...n };
  return { kind: "webhook" };
}

/** Text the routine receives: one line, typed, with sender and pr. Pure. */
export function relayTextFor(payload) {
  const pr = payload.pr != null ? ` #${payload.pr}` : "";
  return `${payload.type} from:${payload.from}${pr} ${payload.text}`.trim();
}

const RELAY_MAX_RETRIES = 2;
const RELAY_MAX_WAIT_S = 120;

/** Seconds to wait before retry `attempt` (1-based); null = do not retry. Pure. */
export function relayBackoff(status, attempt, retryAfter) {
  if (attempt > RELAY_MAX_RETRIES) return null;
  if (status === 429) {
    const s = retryAfter == null || retryAfter === "" ? NaN : Number(retryAfter);
    if (!Number.isFinite(s) || s < 0) return 2 ** attempt;
    return s <= RELAY_MAX_WAIT_S ? s : null;
  }
  if (status >= 500 && status <= 599) return 2 ** attempt;
  return null; // any other 4xx, network error (it may have fired: no idempotency key), or success
}

/**
 * Fire a routine once (docs: https://platform.claude.com/docs/en/api/claude-code/routines-fire).
 * No idempotency key exists, so a retry happens only on 429 (nothing fired) or 5xx (bounded).
 * Returns { ok, status, requestId, sessionId, error, tries }. Never puts the token in a result.
 */
export async function fireRelay(url, token, text, { fetchFn = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = () => {} } = {}) {
  if (!/^https:\/\//.test(String(url || ""))) return { ok: false, status: 0, error: "relay URL must be https", tries: 0 };
  for (let tries = 1; ; tries++) {
    let res;
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "experimental-cc-routine-2026-04-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({ text: String(text).slice(0, 65536) }),
      });
    } catch (e) {
      return { ok: false, status: 0, error: `network: ${e && e.message ? e.message : String(e)} (not retried: it may have fired)`, tries };
    }
    const hdr = (k) => (res.headers && typeof res.headers.get === "function" ? res.headers.get(k) : null);
    const requestId = hdr("request-id") || hdr("x-request-id") || "";
    const raw = typeof res.text === "function" ? await res.text() : "";
    let body = {};
    try { body = JSON.parse(raw); } catch { /* not JSON */ }
    if (res.ok) return { ok: true, status: res.status, requestId, sessionId: body.claude_code_session_id || "", tries };
    const etype = body && body.error ? `${body.error.type || ""}: ${body.error.message || ""}` : raw.slice(0, 200);
    const wait = relayBackoff(res.status, tries, hdr("retry-after"));
    if (wait == null) return { ok: false, status: res.status, requestId, error: `HTTP ${res.status} ${etype}`.trim(), tries };
    log(`agent-msg: relay HTTP ${res.status}${requestId ? " request-id " + requestId : ""}; retry ${tries}/${RELAY_MAX_RETRIES} in ${wait}s`);
    await sleep(wait * 1000);
  }
}

/** The local bus (no fetch: a send just updated the tracking ref; a read never touches the network). */
const localBusEntries = (cwd) => readBus({ cwd, last: 500, fetch: false }).entries;

/**
 * The warning a message to a fleet letter earns when `fleet-bus.mjs who` would call its orchestrator STALE
 * (OrchA 36 was archived without a hand-off and `= webhook ok` still printed, 2026-10-26), else "". Never throws. Pure
 * given `entries`.
 */
export function staleWarning(to, { cwd = ROOT, busEntries = localBusEntries, nowS = Math.floor(Date.now() / 1000), dryRun = false } = {}) {
  const L = resolveBusTo(to);
  if (!/^[A-Z]$/.test(L)) return "";
  try {
    const w = whoStatus(busEntries(cwd) || [], L, nowS);
    return w && w.stale ? `! orchestrator ${L} stale: last bus line ${ageOf(w.lastSeenAt, nowS)} ago (${w.id}); message ${dryRun ? "would be " : ""}delivered but may be unread` : "";
  } catch { return ""; }
}

/**
 * CLI entry. deps: { cwd, env, now, fetchFn, sendBus, log, err, headShaFn, busEntries, nowS }.
 * Exit: 0 ok / dry-run / missing-env-with-bus; 1 usage or hard failure. A STALE warning never changes it.
 */
export async function main(argv, deps = {}) {
  const code = await send(argv, deps);
  if (code === 0) {
    const o = (() => { try { return parseArgs(argv); } catch { return { to: "" }; } })();
    const warn = staleWarning(o.to, { cwd: deps.cwd || ROOT, dryRun: !!o.dryRun, ...(deps.busEntries ? { busEntries: deps.busEntries } : {}), ...(deps.nowS ? { nowS: deps.nowS() } : {}) });
    if (warn) (deps.err || console.error)(warn);
  }
  return code;
}

async function send(argv, {
  cwd = ROOT,
  env = process.env,
  now = () => new Date().toISOString(),
  fetchFn = globalThis.fetch,
  sendBus = sendBusLine,
  log = console.log,
  err = console.error,
  headShaFn = headSha,
  readyCheck = readyClaimVerdict,
  prHead = livePrHead,
  sleep = undefined,
} = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    return usage(e.message);
  }

  // A READY carries the ready-gate's verdict, not the shell's (Transcript Auditor batch 9: `| tee` hid a refusal):
  // a receipt from the committed gate, for the PR's live head. No env bypass (audit 4 G11: APEX_READY_NO_RECEIPT
  // was in no doc and skipped all of it).
  if (opts.type === "READY" && !opts.dryRun) {
    const v = readyCheck(cwd, { pr: opts.pr, text: opts.text, prHead });
    if (!v.ok) { err(`agent-msg: READY refused: ${v.why}`); return 1; }
  }

  const me = whoAmI(env, opts.as);
  if (!me) return usage("no identity: pass --as <host>:<id> or set APEX_FLEET_AS");

  const sha = headShaFn(cwd, env);
  const payload = buildPayload({
    from: me,
    to: opts.to,
    type: opts.type,
    pr: opts.pr,
    text: opts.text,
    sha,
    ts: now(),
    idem: opts.idem,
  });

  const route = relayRoute(opts.to, env);
  if (route.kind === "retired") {
    err(`agent-msg: retired env name(s) ${route.legacy.join(", ")} — the canonical pair is ${route.url} + ${route.token} (Bryce renames them in the environment; references/communication.md)`);
    return 1;
  }

  if (opts.dryRun) {
    log(JSON.stringify(payload, null, 2));
    if (route.kind === "relay") log(`= would fire relay ${route.url} (once; text: ${relayTextFor(payload)})`);
    return 0;
  }

  const busTo = resolveBusTo(opts.to);
  const busProblem = addressProblem(busTo);
  if (!opts.noBus && busProblem) {
    err(`agent-msg: bus --to refused: ${busProblem}. --to takes one of: ${ADDRESS_FORMS} (or aliases all|DAD|"Apex Merge Queue")`);
    return 1;
  }

  const bType = busTypeFor(opts.type);
  const bText = busTextFor(opts.type, payload.text, opts.pr);
  // Refuse before the webhook too: a body the bus would refuse must not reach one channel and not the other.
  const bodyBad = bodyProblem(bType, bText);
  if (bodyBad) { err(`agent-msg: refused: ${bodyBad}`); return 1; }

  let busOk = opts.noBus;
  if (!opts.noBus) {
    try {
      const r = sendBus(bType, busTo, me, bText, { cwd, log, idem: opts.idem });
      busOk = !!r.ok;
      if (!r.ok) err(`agent-msg: bus mirror FAILED: ${redactSecrets(r.reason || "unknown", env)}`);
    } catch (e) {
      err(`agent-msg: bus mirror FAILED: ${redactSecrets(e.message || String(e), env)}`);
      busOk = false;
    }
  }

  if (route.kind === "relay") {
    const r = await fireRelay(env[route.url], env[route.token], relayTextFor(payload), { fetchFn, log: err, ...(sleep ? { sleep } : {}) });
    const rid = r.requestId ? ` request-id ${r.requestId}` : "";
    if (!r.ok) {
      err(`agent-msg: relay ${route.url} FAILED after ${r.tries} tr${r.tries === 1 ? "y" : "ies"}: ${redactSecrets(r.error || "unknown", env)}${rid} — not retrying; do not loop by hand`);
      return 1;
    }
    log(`= relay ok HTTP ${r.status} to:${route.letter} type:${payload.type}${rid}${r.sessionId ? " session " + r.sessionId : ""}`);
    return busOk || opts.noBus ? 0 : 1;
  }

  const url = env.APEX_AGENT_WEBHOOK_URL || "";
  const auth = env.APEX_AGENT_WEBHOOK_AUTH || "";
  if (!url || !auth) {
    err("agent-msg: APEX_AGENT_WEBHOOK_URL / APEX_AGENT_WEBHOOK_AUTH unset — skipped webhook (bus still posted; values come from Bryce, never commit them)");
    return busOk || opts.noBus ? 0 : 1;
  }

  const wh = await postWebhook(url, auth, payload, { fetchFn });
  if (!wh.ok) {
    err(`agent-msg: webhook FAILED: ${redactSecrets(wh.error || wh.body || "unknown", env)}`);
    return 1;
  }
  log(`= webhook ok${wh.status ? " HTTP " + wh.status : ""} to:${payload.to} type:${payload.type}`);
  return busOk || opts.noBus ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
