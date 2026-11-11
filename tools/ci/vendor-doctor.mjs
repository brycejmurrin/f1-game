#!/usr/bin/env node
/**
 * @doc Vendor doctor, reads only: per vendor (Claude, Cursor, Codex, Grok) CLI, sign-in, key state and the next fix.
 * It starts, messages and stops no agent (docs/AGENT-SURFACE.md §Per vendor) and prints no key, token, e-mail or
 * account id: only versions, booleans, HTTP codes and the next step. Measured 2026-11-11 (PR body of this tool):
 *   - Cursor: an API-key cloud launch is checked against the prepaid credit balance, not the weekly pool
 *     (https://forum.cursor.com/t/cloud-agent-runs-via-api-for-my-account-not-working/176226).
 *   - Codex: cloud needs a ChatGPT sign-in and one cloud environment (https://learn.chatgpt.com/docs/auth).
 *   - Grok Build: `grok login --device-auth`; no cloud launch of its own (https://docs.x.ai/build/cli/reference).
 *   - Claude: a second account is a second scheduled task with an API trigger (https://code.claude.com/docs/en/routines).
 *
 *   node tools/ci/vendor-doctor.mjs            one JSON line per vendor
 *   node tools/ci/vendor-doctor.mjs --only cursor,grok
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Select the runner's saved Codex sign-in directory without creating or writing files. */
export function codexHome(env) {
  return env.APEX_CODEX_HOME || (env.APEX_CODEX_AUTH_JSON_B64 ? path.join(env.HOME || os.homedir(), ".codex-apex") : null);
}

/** Each vendor: candidate binaries, the argv that reports sign-in, the env key and the read-only URL that proves it. */
export const VENDORS = Object.freeze({
  claude: { bins: ["claude"], version: ["--version"], login: ["auth", "status"], loggedIn: /"loggedIn":\s*true|logged in/i },
  cursor: { bins: ["cursor-agent", "agent"], version: ["--version"], login: ["status"], loggedIn: /logged in as/i,
    keyEnv: ["CURSOR_API_KEY"], api: "https://api.cursor.com/v1/me" },
  codex: { bins: ["codex"], version: ["--version"], login: ["login", "status"], loggedIn: /logged in using/i,
    keyEnv: ["OPENAI_API_KEY"], api: "https://api.openai.com/v1/models" },
  grok: { bins: ["grok"], version: ["--version"], login: ["models"], loggedIn: /logged in with/i,
    keyEnv: ["XAI_API_KEY", "GROK_API_KEY"], api: "https://api.x.ai/v1/models" },
});

const NEXT = Object.freeze({
  claude: { install: "npm i -g @anthropic-ai/claude-code", login: "claude auth login",
    cloud: "a second account launches through its own scheduled task with an API trigger (claude.ai/code/routines); no CLI token starts a cloud session" },
  cursor: { install: "curl -fsSL https://cursor.com/install | bash", login: "NO_OPEN_BROWSER=1 cursor-agent login",
    cloud: "API-key cloud launches need a prepaid credit balance (grok.com/dashboard/billing); web, app and Automation launches use the weekly pool" },
  codex: { install: "npm i -g @openai/codex", login: "codex login --device-auth (enable device code login in ChatGPT Settings > Security first)",
    cloud: "create one cloud environment for the repository in the Codex web settings; `codex cloud exec --env <id>` needs it" },
  grok: { install: "curl -fsSL https://x.ai/cli/install.sh | bash", login: "grok login --device-auth",
    cloud: "Grok Build has no cloud launch; cloud work is a Grok Bot routine delegating to Cursor cloud agents" },
});

/** Strip terminal codes, then anything that names a person or carries a credential. */
export function scrub(text) {
  return String(text ?? "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>")
    .replace(/\b(?:sk-|xai-|crsr_|grok_|key_)[A-Za-z0-9_-]{12,}/g, "<key>")
    .replace(/\bBearer\s+\S+/gi, "Bearer <key>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>");
}

/** Bounded child process: no shell, no stdin, output capped; resolves `{ code, out }` and never rejects. */
export function runBin(bin, argv, { timeoutMs = 20000, env = process.env } = {}) {
  return new Promise((resolve) => {
    let out = "";
    let child;
    try { child = spawn(bin, argv, { env, stdio: ["ignore", "pipe", "pipe"] }); }
    catch { resolve({ code: 127, out: "" }); return; }
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const take = (d) => { if (out.length < 16384) out += d; };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", () => { clearTimeout(timer); resolve({ code: 127, out: "" }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 1, out }); });
  });
}

/** One vendor's row. `run` and `fetchImpl` are injected so the unit test needs no CLI and no network. */
export async function checkVendor(name, { run = runBin, fetchImpl = globalThis.fetch, env = process.env } = {}) {
  const v = VENDORS[name];
  if (!v) throw new Error(`unknown vendor: ${name} (one of ${Object.keys(VENDORS).join(", ")})`);
  const home = name === "codex" ? codexHome(env) : null;
  const childEnv = home !== null ? { ...env, CODEX_HOME: home } : env;
  const row = { vendor: name, cli: null, version: null, login: false, key: null, api: null, next: [] };
  for (const bin of v.bins) {
    const r = await run(bin, v.version, { env: childEnv });
    if (r.code === 0) { row.cli = bin; row.version = (scrub(r.out).match(/\d+\.\d+[\w.-]*/) || scrub(r.out).match(/\d[\w.-]*/) || [null])[0]; break; }
  }
  if (!row.cli) row.next.push(`install: ${NEXT[name].install}`);
  else {
    const r = await run(row.cli, v.login, { env: childEnv });
    row.login = r.code === 0 && v.loggedIn.test(r.out) && !/not logged in/i.test(r.out);
    if (!row.login) row.next.push(`sign in: ${NEXT[name].login}`);
  }
  const keyName = (v.keyEnv || []).find((k) => env[k]);
  if (keyName && v.api && fetchImpl) {
    row.key = keyName;
    try {
      const res = await fetchImpl(v.api, { headers: { Authorization: `Bearer ${env[keyName]}` }, signal: AbortSignal.timeout(15000) });
      row.api = res.status;
    } catch { row.api = "unreachable"; }
    if (row.api !== 200) row.next.push(`${keyName} did not answer 200 at ${new URL(v.api).host}`);
  }
  row.next.push(`cloud: ${NEXT[name].cloud}`);
  return row;
}

/** Which saved sign-ins the runner (vendor-run.mjs) will find: variable NAMES and booleans only. */
export function savedSignIns(env = process.env) {
  const has = (k) => Boolean(env[k]);
  return { vendor: "saved", claudeB: has("APEX_CLAUDE_B_OAUTH_TOKEN") ? "APEX_CLAUDE_B_OAUTH_TOKEN" : has("APEX_CLAUDE_CONFIG_DIR") ? "APEX_CLAUDE_CONFIG_DIR" : null,
    codex: has("APEX_CODEX_AUTH_JSON_B64") ? "APEX_CODEX_AUTH_JSON_B64" : has("APEX_CODEX_HOME") ? "APEX_CODEX_HOME" : null,
    next: [...(has("APEX_CLAUDE_B_OAUTH_TOKEN") || has("APEX_CLAUDE_CONFIG_DIR") ? [] : ["second Claude account: save a `claude setup-token` token as APEX_CLAUDE_B_OAUTH_TOKEN in the cloud environment"]),
      ...(has("APEX_CODEX_AUTH_JSON_B64") || has("APEX_CODEX_HOME") ? [] : ["codex: save base64 of ~/.codex/auth.json as APEX_CODEX_AUTH_JSON_B64 and set APEX_CODEX_HOME, or `codex login --device-auth` each session"])] };
}

/** The child env for a second Claude account: its own token or config dir, none of the hosting session's identity. */
export function secondAccountEnv(env, { tmpDir } = {}) {
  const token = env.APEX_CLAUDE_B_OAUTH_TOKEN, dir = env.APEX_CLAUDE_CONFIG_DIR;
  if (!token && !dir) throw new Error("claude needs APEX_CLAUDE_B_OAUTH_TOKEN or APEX_CLAUDE_CONFIG_DIR (the second account)");
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (/^(CLAUDE_|CLAUDECODE$|ANTHROPIC_|CCR_|APEX_CLAUDE_|APEX_CODEX_)/.test(k)) continue;
    out[k] = v;
  }
  if (dir) out.CLAUDE_CONFIG_DIR = dir;
  else { out.CLAUDE_CONFIG_DIR = path.join(tmpDir, "claude-b-config"); out.CLAUDE_CODE_OAUTH_TOKEN = token; }
  return out;
}

/** Whether the second Claude account's saved sign-in answers `claude auth status`: the variable NAME and a boolean only. */
export async function checkSecondClaude({ run = runBin, env = process.env } = {}) {
  const via = env.APEX_CLAUDE_CONFIG_DIR ? "APEX_CLAUDE_CONFIG_DIR" : env.APEX_CLAUDE_B_OAUTH_TOKEN ? "APEX_CLAUDE_B_OAUTH_TOKEN" : null;
  if (!via) return { vendor: "claude-b", via: null, login: false, next: ["save a `claude setup-token` token as APEX_CLAUDE_B_OAUTH_TOKEN in the cloud environment"] };
  const tmpDir = via === "APEX_CLAUDE_B_OAUTH_TOKEN" ? fs.mkdtempSync(path.join(os.tmpdir(), "vendor-doctor-")) : null;
  try {
    const r = await run("claude", VENDORS.claude.login, { env: secondAccountEnv(env, { tmpDir }) });
    const out = scrub(r.out);
    let json = null;
    try { json = JSON.parse(out.trim()); } catch { /* plain-text status */ }
    const login = r.code === 0 && (json?.loggedIn === true || (/logged in/i.test(out) && !/not logged in/i.test(out)));
    const next = login ? [] : r.code === 127 ? [`install: ${NEXT.claude.install}`]
      : via === "APEX_CLAUDE_B_OAUTH_TOKEN" ? ["sign in: APEX_CLAUDE_B_OAUTH_TOKEN did not sign in; save a fresh `claude setup-token` token of the second account as APEX_CLAUDE_B_OAUTH_TOKEN"]
      : ["sign in: run `CLAUDE_CONFIG_DIR=\"$APEX_CLAUDE_CONFIG_DIR\" claude auth login` once as the second account"];
    return { vendor: "claude-b", via, login, next };
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const i = argv.indexOf("--only");
  const names = i >= 0 ? String(argv[i + 1] || "").split(",").filter(Boolean) : Object.keys(VENDORS);
  const rows = [];
  for (const name of names) rows.push(await checkVendor(name, deps));
  if (i < 0) {
    rows.push(savedSignIns(deps.env || process.env));
    rows.push(await checkSecondClaude({ run: deps.run, env: deps.env }));
  }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((rows) => { for (const r of rows) console.log(JSON.stringify(r)); })
    .catch((e) => { console.error(scrub(e.message)); process.exit(2); });
}
