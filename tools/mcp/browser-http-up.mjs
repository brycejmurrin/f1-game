#!/usr/bin/env node
// @doc Keep the phone browser MCP and its public tunnel up. Reuse a live address; start one only when it is dead.
// @skill phone-browser
/**
 *   node tools/mcp/browser-http-up.mjs [--idle-min 30] [--allow-query-token]
 *   node tools/mcp/browser-http-up.mjs --stop      # stop the recorded server + tunnel, forget the token
 *   node tools/mcp/browser-http-up.mjs --dry-run   # print what would run; starts nothing, downloads nothing
 *
 * Prints:
 *   phone-browser reuse https://…/mcp            (plus the Authorization header line)
 *   phone-browser new https://…/mcp
 * reuse means the connector the user already added still works. new means
 * the server was (re)started: the public host AND the token changed, so both are pasted again.
 * Every start mints a fresh token (a live server keeps the one it was started with, so anything
 * short of a full reuse restarts it). The token travels only in the Authorization header unless
 * --allow-query-token is given, for a connector that cannot send headers; that URL is a credential.
 * The server exits after --idle-min minutes with no authenticated request (default 30).
 * cloudflared is a pinned release, its sha256 checked before every chmod and exec.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DIR = path.join(ROOT, "scratch/browser-http");
const STATE = path.join(DIR, "state.json");
const LOG = path.join(DIR, "cloudflared.log");
const SERVER_LOG = path.join(DIR, "server.log");
const PORT = 3001;

/** The pinned cloudflared release (linux-amd64). The sha256 is the one the release page lists under
 *  "SHA256 Checksums", and matched the served file when pinned (2026-11-10). Bump both together. */
export const CLOUDFLARED_PIN = Object.freeze({
  version: "2026.10.6",
  asset: "cloudflared-linux-amd64",
  sha256: "1d356dac769d0dbf62ebe588c4034824bbff98d5790c2f844cc99e0e2f57462d",
});
const pinUrl = (pin) => `https://github.com/cloudflare/cloudflared/releases/download/${pin.version}/${pin.asset}`;
// regenerable download: scratch/, never /tmp (AGENTS.md); versioned so a bump never runs the old file
const CLOUDFLARED = path.join(DIR, `cloudflared-${CLOUDFLARED_PIN.version}`);

export const USAGE = "usage: node tools/mcp/browser-http-up.mjs [--idle-min 30] [--allow-query-token] [--dry-run] | --stop | --help";
/** Strict argv: {help} | {error} (exit 2, nothing started) | {stop} | {idleMin, allowQueryToken, dryRun}. */
export function parseUpArgs(argv) {
  const out = { stop: false, dryRun: false, allowQueryToken: false, idleMin: 30 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { help: true };
    if (a === "--stop") out.stop = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--allow-query-token") out.allowQueryToken = true;
    else if (a === "--idle-min") {
      const v = argv[++i], n = Number(v);
      if (v == null || v === "" || !Number.isInteger(n) || n < 0 || n > 1440) return { error: "--idle-min needs an integer 0-1440" };
      out.idleMin = n;
    } else return { error: `unknown argument ${JSON.stringify(a)}` };
  }
  if (out.stop && (out.dryRun || out.allowQueryToken || argv.includes("--idle-min"))) return { error: "--stop takes no other flags" };
  return out;
}

export const sha256Of = (buf) => createHash("sha256").update(buf).digest("hex");
/** True only when the bytes hash to the pinned value (lowercase hex, exact). */
export function hashMatches(buf, want) {
  return typeof want === "string" && /^[0-9a-f]{64}$/.test(want) && sha256Of(buf) === want;
}

export function tunnelUrlFromLog(text) {
  const found = String(text).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  return found ? found[0] : null;
}

/** reuse only when the server and tunnel answer AND the recorded mode is the one asked for; otherwise restart both. */
export function decide({ localOk, publicOk, url, sameMode = true }) {
  if (localOk && publicOk && url && sameMode) return "reuse";
  if (!localOk) return "start-both";
  return "restart-both";
}

function readState() {
  try { return JSON.parse(readFileSync(STATE, "utf8")); }
  catch { return {}; }
}

function writeState(state) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
}

async function ping(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    return res.ok;
  } catch {
    return false;
  }
}

export function connectorLines(host, token, allowQueryToken) {
  const lines = [`${host}/mcp`, `header: Authorization: Bearer ${token}`];
  if (allowQueryToken) lines.push(`query-token URL (a credential; anyone holding it can drive the page): ${host}/mcp?token=${token}`);
  return lines;
}

/** The pinned binary, verified before every use; a download is hashed before it is made executable. */
export async function ensureCloudflared({ file = CLOUDFLARED, pin = CLOUDFLARED_PIN, fetchImpl = fetch, platform = process.platform, arch = process.arch } = {}) {
  if (platform !== "linux" || arch !== "x64") throw new Error(`cloudflared pin is linux-amd64 only (this is ${platform}-${arch}); install cloudflared yourself`);
  if (existsSync(file)) {
    if (hashMatches(readFileSync(file), pin.sha256)) { chmodSync(file, 0o755); return file; }
    rmSync(file, { force: true });   // stale or altered: fetch the pinned one again
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const res = await fetchImpl(pinUrl(pin));
  if (!res.ok) throw new Error(`could not download cloudflared ${pin.version} (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!hashMatches(buf, pin.sha256)) throw new Error(`cloudflared ${pin.version} download does not match the pinned sha256; refusing to run it`);
  const part = `${file}.${process.pid}.part`;
  writeFileSync(part, buf, { mode: 0o600 });
  renameSync(part, file);
  chmodSync(file, 0o755);
  return file;
}

function detach(cmd, args, env, log) {
  mkdirSync(DIR, { recursive: true });
  const out = log ? openSync(log, "a") : "ignore";
  const child = spawn(cmd, args, {
    cwd: ROOT,
    env,
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
  return child.pid;
}

// Kill the recorded server and tunnel. `kill` is injectable for the unit test.
// A PID that is already gone is fine; it is reported, not thrown.
export function stopRecorded(state, kill = (pid) => process.kill(pid, "SIGTERM")) {
  const out = [];
  for (const key of ["tunnelPid", "serverPid"]) {
    const pid = state && state[key];
    if (!Number.isInteger(pid) || pid <= 0) continue;
    try { kill(pid); out.push(`${key} ${pid} stopped`); }
    catch (e) { out.push(`${key} ${pid} not running (${e && e.code || e})`); }
  }
  return out;
}

async function waitFor(label, probe) {
  for (let i = 0; i < 40; i++) {
    const hit = await probe();
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(label + " did not come up");
}

const serverArgs = (opts) => ["tools/mcp/browser-http.mjs", "--port", String(PORT), "--idle-min", String(opts.idleMin),
  ...(opts.allowQueryToken ? ["--allow-query-token"] : [])];

async function bringUp(opts) {
  const prior = readState();
  const localOk = await ping(`http://127.0.0.1:${PORT}/healthz`);
  const publicOk = prior.host ? await ping(prior.host + "/healthz") : false;
  const sameMode = Boolean(prior.allowQueryToken) === opts.allowQueryToken && prior.idleMin === opts.idleMin;
  const action = decide({ localOk, publicOk, url: prior.token ? prior.host : null, sameMode });
  if (action === "reuse") return { kind: "reuse", host: prior.host, token: prior.token, allowQueryToken: opts.allowQueryToken };

  // A live server with no recorded PID was started by a run whose state is gone: refuse rather than guess.
  if (localOk && !Number.isInteger(prior.serverPid)) throw new Error("a server is live on :" + PORT + " with no recorded PID: stop it (its PID: ps), then re-run");
  if (localOk || Number.isInteger(prior.tunnelPid)) {
    stopRecorded(prior);
    rmSync(STATE, { force: true });
    await waitFor("old server exit", async () => !(await ping(`http://127.0.0.1:${PORT}/healthz`)));
  }
  const bin = await ensureCloudflared();   // before anything starts: a refused binary leaves nothing running
  const token = randomBytes(24).toString("hex");   // a fresh token on every start
  const state = { port: PORT, token, allowQueryToken: opts.allowQueryToken, idleMin: opts.idleMin, startedAt: new Date().toISOString() };
  try {
    state.serverPid = detach(process.execPath, serverArgs(opts), { ...process.env, APEX_MCP_TOKEN: token }, SERVER_LOG);
    await waitFor("browser mcp", () => ping(`http://127.0.0.1:${PORT}/healthz`));
    writeState(state);   // recorded at once: --stop can clean up whatever fails next
    writeFileSync(LOG, "");
    state.tunnelPid = detach(bin, ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"], process.env, LOG);
    writeState(state);
    const host = await waitFor("tunnel", () => {
      try { return tunnelUrlFromLog(readFileSync(LOG, "utf8")); }
      catch { return null; }
    });
    await waitFor("public mcp", () => ping(host + "/healthz"));
    state.host = host;
    writeState(state);
    return { kind: "new", host, token, allowQueryToken: opts.allowQueryToken };
  } catch (e) {
    stopRecorded(state);
    rmSync(STATE, { force: true });
    throw e;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseUpArgs(process.argv.slice(2));
  if (opts.help) { console.log(USAGE); process.exit(0); }
  if (opts.error) { console.error(`phone-browser: ${opts.error}\n${USAGE}`); process.exit(2); }
  if (opts.stop) {
    for (const line of stopRecorded(readState())) console.log("phone-browser " + line);
    rmSync(STATE, { force: true });
    console.log("phone-browser stopped; the next run mints a new token and URL");
    process.exit(0);
  }
  if (opts.dryRun) {
    console.log(JSON.stringify({ dryRun: true, server: [process.execPath, ...serverArgs(opts)], cloudflared: { ...CLOUDFLARED_PIN, url: pinUrl(CLOUDFLARED_PIN), file: path.relative(ROOT, CLOUDFLARED) },
      tokenIn: opts.allowQueryToken ? "Authorization header or ?token=" : "Authorization header only", idleMin: opts.idleMin }, null, 2));
    process.exit(0);
  }
  const result = await bringUp(opts);
  const [url, ...rest] = connectorLines(result.host, result.token, result.allowQueryToken);
  console.log(`phone-browser ${result.kind} ${url}`);
  for (const line of rest) console.log(`phone-browser ${line}`);
}
