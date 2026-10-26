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
//     --type <INFO|QUESTION|READY|HANDOFF|INCIDENT|REQUEST> [--pr N] "text"
//   node tools/ci/agent-msg.mjs send --to fleet:A --type INFO "…"   # one broadcast to fleet A (bus to:A, webhook keeps fleet:A)
//   node tools/ci/agent-msg.mjs send --to A --type READY --dry-run "#3499 abc ready-gate 0"
//   common: --as <host>:<id>  --no-bus  --dry-run
//
// Env (from Bryce; never commit): APEX_AGENT_WEBHOOK_URL, APEX_AGENT_WEBHOOK_AUTH.
// Identity: --as, else APEX_FLEET_AS (same whoAmI as fleet-bus.mjs).
// Missing webhook env: warn on stderr, still post to the bus, exit 0.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readyClaimVerdict } from "../lib/gate-receipt.mjs";
import { whoAmI, sendBusLine, addressProblem, ADDRESS_FORMS } from "./fleet-bus.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Peer-message types (webhook). Protocol lines DONE/GREEN/BLOCKED/GAME-SLOT stay on fleet-bus.mjs. */
export const MSG_TYPES = ["INFO", "QUESTION", "READY", "HANDOFF", "INCIDENT", "REQUEST"];

/** INFO/QUESTION/REQUEST → bus HANDOFF; READY/HANDOFF/INCIDENT keep their type. Pure. */
export function busTypeFor(msgType) {
  const t = String(msgType || "").toUpperCase();
  if (t === "INFO" || t === "QUESTION" || t === "REQUEST") return "HANDOFF";
  return t;
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

/** Bus text: optional `#pr` prefix, plus `[INFO]`/`[QUESTION]`/`[REQUEST]` when mapped. Pure. */
export function busTextFor(msgType, text, pr = null) {
  const t = String(msgType || "").toUpperCase();
  const mapped = (t === "INFO" || t === "QUESTION" || t === "REQUEST") ? `[${t}] ` : "";
  const body = `${mapped}${String(text ?? "").replace(/\s+/g, " ").trim()}`.trim();
  return pr != null && pr !== "" ? `#${pr} ${body}`.trim() : body;
}

/** Build the webhook/bus payload. Pure. `pr` is a number or null; `sha`/`ts` are strings. */
export function buildPayload({ from, to, type, pr = null, text = "", sha = "", ts = "" }) {
  return {
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
  };
}

function headSha(cwd) {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", timeout: 15_000 });
  return r.status === 0 ? r.stdout.trim() : "";
}

function usage(msg) {
  if (msg) console.error(`agent-msg: ${redactSecrets(msg)}`);
  console.error("usage: agent-msg.mjs send --to <addr> --type <" + MSG_TYPES.join("|") + "> [--pr N] [--no-bus] [--dry-run] \"text\"\n" +
    "       --to aliases: all→*, fleet:<L>→<L> (one broadcast), DAD→D, \"Apex Merge Queue\"→merge-desk (bus); webhook keeps the raw --to\n" +
    "       env: APEX_AGENT_WEBHOOK_URL + APEX_AGENT_WEBHOOK_AUTH (from Bryce; never commit); identity APEX_FLEET_AS / --as\n" +
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

/**
 * CLI entry. deps: { cwd, env, now, fetchFn, sendBus, log, err, headShaFn }.
 * Exit: 0 ok / dry-run / missing-env-with-bus; 1 usage or hard failure.
 */
export async function main(argv, {
  cwd = ROOT,
  env = process.env,
  now = () => new Date().toISOString(),
  fetchFn = globalThis.fetch,
  sendBus = sendBusLine,
  log = console.log,
  err = console.error,
  headShaFn = headSha,
  readyCheck = readyClaimVerdict,
} = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    return usage(e.message);
  }

  // A READY carries the ready-gate's verdict, not the shell's (Transcript Auditor batch 9: `| tee` hid a refusal).
  if (opts.type === "READY" && !opts.dryRun && env.APEX_READY_NO_RECEIPT !== "1") {
    const v = readyCheck(cwd, { pr: opts.pr, text: opts.text });
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
  });

  if (opts.dryRun) {
    log(JSON.stringify(payload, null, 2));
    return 0;
  }

  const busTo = resolveBusTo(opts.to);
  const busProblem = addressProblem(busTo);
  if (!opts.noBus && busProblem) {
    err(`agent-msg: bus --to refused: ${busProblem}. --to takes one of: ${ADDRESS_FORMS} (or aliases all|DAD|"Apex Merge Queue")`);
    return 1;
  }

  let busOk = opts.noBus;
  if (!opts.noBus) {
    const bType = busTypeFor(opts.type);
    const bText = busTextFor(opts.type, payload.text, opts.pr);
    try {
      const r = sendBus(bType, busTo, me, bText, { cwd, log });
      busOk = !!r.ok;
      if (!r.ok) err(`agent-msg: bus mirror FAILED: ${redactSecrets(r.reason || "unknown", env)}`);
    } catch (e) {
      err(`agent-msg: bus mirror FAILED: ${redactSecrets(e.message || String(e), env)}`);
      busOk = false;
    }
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
