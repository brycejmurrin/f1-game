#!/usr/bin/env node
/**
 * @doc Claude Code CLI adapter, reads only: auth status, the remembered cloud-address registry and local session reads.
 * Cloud references are a local address book, NOT a live provider inventory. Nothing here sends a message,
 * launches a worker, uploads a repository or reads a cloud transcript: the followup / remember / transcript verbs
 * left on 2026-11-03 (no agent session acts through Bryce's personal login; docs/AGENT-SURFACE.md §Per vendor).
 * Sources: https://code.claude.com/docs/en/cli-reference
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SESSION = /^(?:cse_|session_)[A-Za-z0-9_-]{1,128}$/;
export const CLAUDE_OPTIONS = Object.freeze({
  capabilities: [], auth: [], list: ["limit"], "local-list": ["all", "limit"], "local-logs": ["maxChars"],
});
/** The verbs that left the adapter; named so a caller gets a reason instead of a bare unsupported_verb. */
export const RETIRED_VERBS = Object.freeze(["followup", "remember", "transcript"]);
const fail = (error, message, fix) => Object.assign(new Error(message), { code: error, fix });
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
function text(x, label, max) {
  if (typeof x !== "string" || !x.trim() || x.length > max || x.includes("\0")) throw fail("bad_args", `${label} must be nonempty text, at most ${max} characters, without NUL`);
  return x;
}
function integer(x, label, max) {
  if (!Number.isInteger(x) || x < 1 || x > max) throw fail("bad_args", `${label} must be an integer in 1..${max}`);
  return x;
}
export function validateClaudeRequest(args) {
  if (!object(args)) throw fail("bad_args", "Arguments must be an object");
  for (const key of Object.keys(args)) if (!["verb", "id", "options", "dryRun"].includes(key)) throw fail("bad_args", `Unknown argument: ${key}`);
  const { verb } = args;
  if (RETIRED_VERBS.includes(verb)) throw fail("unsupported_verb", `${verb} left this adapter on 2026-11-03: no agent session messages or reads a cloud session through Bryce's personal login`, "Reads only: capabilities, auth, list, local-list, local-logs. Reach a cloud session through the host's own session tools, or GitHub.");
  if (typeof verb !== "string" || !Object.hasOwn(CLAUDE_OPTIONS, verb)) throw fail("unsupported_verb", `Supported verbs: ${Object.keys(CLAUDE_OPTIONS).join(", ")}`, "Cloud launch, attach, followup, cancel and usage are not implemented; capabilities describes the supported routes.");
  if (args.dryRun != null && typeof args.dryRun !== "boolean") throw fail("bad_args", "dryRun must be boolean");
  const o = args.options ?? {};
  if (!object(o)) throw fail("bad_args", "options must be an object");
  for (const key of Object.keys(o)) if (!CLAUDE_OPTIONS[verb].includes(key)) throw fail("bad_args", `Unknown option ${key} for ${verb}`);
  const out = { verb, options: { ...o }, dryRun: args.dryRun === true };
  if (verb === "local-logs") out.id = text(args.id, "local session id", 128);
  else if (args.id != null) throw fail("bad_args", `${verb} does not accept an id`);
  if (verb === "local-logs" && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(out.id)) throw fail("bad_args", "Use a local session id, not flags, a URL or a name");
  if (["list", "local-list"].includes(verb)) out.options.limit = integer(o.limit ?? 20, "limit", 100);
  if (verb === "local-list" && o.all != null && typeof o.all !== "boolean") throw fail("bad_args", "all must be boolean");
  if (verb === "local-logs") out.options.maxChars = integer(o.maxChars ?? 8000, "maxChars", 32000);
  return out;
}
const within = (base, target) => { const rel = path.relative(base, target); return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)); };
const clean = (s) => String(s).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\b(?:sk-ant-[A-Za-z0-9_-]+|Bearer\s+[^\s"']+)/gi, "[REDACTED]");
const capabilities = () => ({
  ok: true, provider: "claude-code-cli", verbs: Object.keys(CLAUDE_OPTIONS), retired: RETIRED_VERBS,
  cloud: { list: "known_references_only", discover: "interactive claude --teleport", followup: "not_implemented", attach: "not_implemented", launch: "not_implemented", transcript: "not_implemented", usage: "not_implemented" },
  local: { list: true, logs: true, launch: false },
  auth: "Uses the CLI login on the MCP server host; credentials never belong in tool arguments.",
});

/** Asynchronous and bounded; no shell, terminal, automatic login, downloads or request retry. */
export function runClaude(argv, { input = "", cwd = ROOT, signal, timeoutMs = 45000, env = process.env, executable } = {}) {
  return new Promise((resolve) => {
    let child, stdout = "", stderr = "", bytes = 0, settled = false, timer;
    let sent = false;
    const finish = (result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort);
      resolve({ ...result, stdout: clean(stdout), stderr: clean(stderr), started: sent });
    };
    const stop = (error) => {
      if (settled) return;
      // Only this adapter's ephemeral CLI process group is stopped, never a remote session.
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* already exited */ }
      finish({ exit: null, error });
    };
    const abort = () => stop("cancelled");
    if (signal?.aborted) return finish({ exit: null, error: "cancelled" });
    try {
      const bin = executable || env.APEX_CLAUDE_BIN || "claude";
      child = spawn(bin, argv, { cwd, env, detached: true, stdio: ["pipe", "pipe", "pipe"], shell: false });
      child.once("spawn", () => { sent = true; });
    } catch { return finish({ exit: null, error: "cli_unavailable" }); }
    timer = setTimeout(() => stop("timeout"), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    child.on("error", (e) => finish({ exit: null, error: e.code === "ENOENT" ? "cli_unavailable" : "spawn_failed" }));
    child.stdin.on("error", () => {});
    for (const [stream, name] of [[child.stdout, "stdout"], [child.stderr, "stderr"]]) {
      stream.setEncoding("utf8");
      stream.on("data", (s) => {
        bytes += Buffer.byteLength(s);
        if (bytes > 1024 * 1024) return stop("output_limit");
        if (name === "stdout") stdout += s; else stderr += s;
      });
    }
    child.once("close", (exit, childSignal) => finish({ exit, ...(childSignal && { error: "signal" }) }));
    child.stdin.end(input);
  });
}

export function createClaudeAgents({ root = ROOT, run = runClaude } = {}) {
  const registry = path.join(root, "artifacts", "claude-agents.json");
  /** The address book `remember` used to write; still read so a session that has one keeps its list. */
  function readRegistry() {
    try {
      if (fs.lstatSync(registry).isSymbolicLink() || !within(fs.realpathSync(root), fs.realpathSync(registry))) throw fail("path_escaped", "Cloud reference registry must stay inside the checkout");
      if (fs.statSync(registry).size > 1024 * 1024) throw fail("registry_invalid", "Cloud reference registry is too large");
      const data = JSON.parse(fs.readFileSync(registry, "utf8"));
      if (data.version !== 1 || !Array.isArray(data.sessions) || data.sessions.length > 1000 || data.sessions.some((s) => !object(s) || !SESSION.test(s.id) || typeof s.title !== "string" || s.title.length > 160)) throw fail("registry_invalid", "Invalid cloud reference registry");
      return { version: 1, sessions: data.sessions.map((s) => ({ id: s.id, title: s.title, url: `https://claude.ai/code/${s.id}`, ...(typeof s.rememberedAt === "string" && { rememberedAt: s.rememberedAt.slice(0, 40) }) })) };
    } catch (e) { if (e.code === "ENOENT") return { version: 1, sessions: [] }; throw e; }
  }
  return async function handle(args, { signal } = {}) {
    let r;
    try {
      r = validateClaudeRequest(args);
      const { verb, options: o } = r;
      if (r.dryRun) return { ok: true, dryRun: true, verb, ...(r.id && { id: r.id }), source: verb === "list" ? "local_reference_registry" : "claude-code-cli", options: Object.keys(o) };
      if (verb === "capabilities") return capabilities();
      if (verb === "list") {
        const sessions = readRegistry().sessions;
        return { ok: true, source: "local_reference_registry", live: false, total: sessions.length, sessions: sessions.slice(0, o.limit), truncated: sessions.length > o.limit, hint: "These are remembered addresses, not account inventory. Use claude --teleport interactively to discover cloud sessions." };
      }
      const argv = verb === "auth" ? ["auth", "status"] : verb === "local-list" ? ["agents", "--json", ...(o.all ? ["--all"] : [])] : ["logs", r.id];
      const result = await run(argv, { cwd: root, signal });
      if (result.error) return { ok: false, error: result.error, cause: result.error, fix: result.error === "cli_unavailable" ? "Install Claude Code on the MCP server host or configure APEX_CLAUDE_BIN; sign in there with claude auth login." : "See cause; the read made no change." };
      if (verb === "local-logs") {
        if (result.exit !== 0) return { ok: false, error: "cli_error", exit: result.exit, message: "Claude local logs command failed" };
        return { ok: true, source: "local_cli_logs", id: r.id, text: clean(result.stdout).slice(-o.maxChars), truncated: result.stdout.length > o.maxChars, untrustedData: true };
      }
      let data;
      try { data = JSON.parse(result.stdout); } catch { return { ok: false, error: "invalid_cli_output", message: "Claude CLI did not return valid JSON" }; }
      if (verb === "auth") {
        if (typeof data.loggedIn !== "boolean") throw fail("invalid_cli_output", "Auth status omitted loggedIn");
        return { ok: result.exit === 0 && data.loggedIn, loggedIn: data.loggedIn, authMethod: data.authMethod, subscriptionType: data.subscriptionType, ...(result.exit !== 0 && { error: "not_authenticated", fix: "Run claude auth login on this MCP server host; do not put credentials in tool arguments." }) };
      }
      // local-list
      if (result.exit !== 0 || !Array.isArray(data)) throw fail("invalid_cli_output", "Local session list was not a successful JSON array");
      return { ok: true, source: "local_cli_sessions", total: data.length, sessions: data.slice(0, o.limit).map((s) => ({ sessionId: s.sessionId, name: s.name, cwd: s.cwd, kind: s.kind, startedAt: s.startedAt })), truncated: data.length > o.limit };
    } catch (e) { return { ok: false, error: e.code || "adapter_error", message: clean(e.message).slice(0, 500), ...(e.fix && { fix: e.fix }) }; }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let request;
  try { request = JSON.parse(process.argv[2] || '{"verb":"capabilities"}'); }
  catch { console.log(JSON.stringify({ ok: false, error: "bad_args", message: "Pass one JSON argument" })); process.exitCode = 1; }
  if (request) {
    const result = await createClaudeAgents()(request);
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
  }
}
