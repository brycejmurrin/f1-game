#!/usr/bin/env node
// @doc Keep the phone browser MCP and its public tunnel up. Reuse a live address; start one only when it is dead.
// @skill phone-browser
/**
 *   node tools/mcp/browser-http-up.mjs
 *   node tools/mcp/browser-http-up.mjs --stop   # stop the recorded server + tunnel, forget the token
 *   node tools/mcp/browser-http-up.mjs --status # the recorded state and whether each end answers; starts nothing
 *   node tools/mcp/browser-http-up.mjs --help   # this usage; any other flag is refused (exit 2), never a start
 *
 * Prints one line:
 *   phone-browser reuse https://…/mcp?token=…
 *   phone-browser new https://…/mcp?token=…
 * reuse means the connector the user already added still works. new means
 * the public host changed and they must paste that one URL again.
 * --stop is teardown AND token rotation: the running server keeps the token it
 * was started with, so a new token needs the old server (and the old tunnel,
 * whose URL still answers) stopped first. Run --stop, then run again.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DIR = path.join(ROOT, "scratch/browser-http");
const STATE = path.join(DIR, "state.json");
const LOG = path.join(DIR, "cloudflared.log");
const SERVER_LOG = path.join(DIR, "server.log");
const PORT = 3001;
const CLOUDFLARED = path.join(DIR, "cloudflared");   // regenerable download: scratch/, never /tmp (AGENTS.md)

export function tunnelUrlFromLog(text) {
  const found = String(text).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  return found ? found[0] : null;
}

export function decide({ localOk, publicOk, url }) {
  if (localOk && publicOk && url) return "reuse";
  if (!localOk) return "start-both";
  return "start-tunnel";
}

function readState() {
  try { return JSON.parse(readFileSync(STATE, "utf8")); }
  catch { return {}; }
}

function writeState(state) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
}

async function ping(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    return res.ok;
  } catch {
    return false;
  }
}

function connectorUrl(host, token) {
  return `${host}/mcp?token=${token}`;
}

async function ensureCloudflared() {
  if (existsSync(CLOUDFLARED)) return CLOUDFLARED;
  mkdirSync(DIR, { recursive: true });
  const res = await fetch("https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64");
  if (!res.ok) throw new Error("could not download cloudflared");
  writeFileSync(CLOUDFLARED, Buffer.from(await res.arrayBuffer()));
  chmodSync(CLOUDFLARED, 0o755);
  return CLOUDFLARED;
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

export const USAGE = `usage: node tools/mcp/browser-http-up.mjs [--stop | --status | --help]
  (no flag)  reuse the live public address, or start the server and/or tunnel; prints "phone-browser reuse|new <url>"
  --stop     stop the recorded server + tunnel and forget the token (the next run mints a new URL)
  --status   print the recorded state and whether the local and public ends answer; starts nothing`;

/** The CLI mode for argv: only a bare run starts anything (#5674). */
export function cliMode(argv) {
  if (argv.length === 0) return "up";
  if (argv.length === 1 && ["--stop", "--status", "--help", "-h"].includes(argv[0])) return argv[0] === "-h" ? "help" : argv[0].slice(2);
  return "bad";
}

const DEFAULT_IO = { readState, writeState, ping, detach, ensureCloudflared, waitFor, readLog: () => readFileSync(LOG, "utf8") };

/** Start what is dead. State is written as each process starts, before the next step can throw, so a failed tunnel
 *  never leaves a server `--stop` cannot find (#5674). `io` is injectable for the unit test. */
export async function bringUp(io = DEFAULT_IO) {
  const { readState, writeState, ping, detach, ensureCloudflared, waitFor } = io;
  const prior = readState();
  const localOk = await ping(`http://127.0.0.1:${PORT}/healthz`);
  const publicOk = prior.url ? await ping(new URL(prior.url).origin + "/healthz") : false;
  const action = decide({ localOk, publicOk, url: prior.url });
  if (action === "reuse") return { kind: "reuse", url: prior.url };

  // A live server with no recorded token was started by a run whose state is
  // gone: its token is unknown, so a fresh one would answer 401. Refuse.
  if (localOk && !prior.token) throw new Error("a server is live on :" + PORT + " with no recorded token: stop it (its PID: ps), then re-run");
  const token = prior.token || randomBytes(18).toString("hex");
  let serverPid = prior.serverPid;
  if (!localOk) {
    mkdirSync(DIR, { recursive: true });
    serverPid = detach(process.execPath, ["tools/mcp/browser-http.mjs", "--port", String(PORT)], {
      ...process.env,
      APEX_MCP_TOKEN: token,
    }, SERVER_LOG);
    writeState({ token, port: PORT, serverPid });
    await waitFor("browser mcp", () => ping(`http://127.0.0.1:${PORT}/healthz`));
  }
  if (Number.isInteger(prior.tunnelPid)) stopRecorded({ tunnelPid: prior.tunnelPid });   // the dead tunnel's process, if any
  writeState({ token, port: PORT, serverPid });   // the server is known before the tunnel step can throw
  if (io === DEFAULT_IO) { mkdirSync(DIR, { recursive: true }); writeFileSync(LOG, ""); }
  const bin = await ensureCloudflared();
  const tunnelPid = detach(bin, ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"], process.env, LOG);
  writeState({ token, port: PORT, serverPid, tunnelPid });
  const host = await waitFor("tunnel", () => {
    try { return tunnelUrlFromLog(io.readLog()); }
    catch { return null; }
  });
  const url = connectorUrl(host, token);
  await waitFor("public mcp", () => ping(host + "/healthz"));
  writeState({ token, port: PORT, url, host, serverPid, tunnelPid });
  return { kind: "new", url };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = cliMode(process.argv.slice(2));
  if (mode === "help") { console.log(USAGE); process.exit(0); }
  if (mode === "bad") { console.error(`browser-http-up: unknown arguments ${process.argv.slice(2).join(" ")}\n${USAGE}`); process.exit(2); }
  if (mode === "status") {
    const st = readState();
    const localOk = await ping(`http://127.0.0.1:${PORT}/healthz`);
    const publicOk = st.host ? await ping(st.host + "/healthz") : false;
    console.log(JSON.stringify({ state: { ...st, token: st.token ? "(recorded)" : null, url: st.url ? "(recorded)" : null }, localOk, publicOk }));
    process.exit(0);
  }
  if (mode === "stop") {
    for (const line of stopRecorded(readState())) console.log("phone-browser " + line);
    rmSync(STATE, { force: true });
    console.log("phone-browser stopped; the next run mints a new token and URL");
    process.exit(0);
  }
  const result = await bringUp();
  console.log(`phone-browser ${result.kind} ${result.url}`);
}
