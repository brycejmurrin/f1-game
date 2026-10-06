#!/usr/bin/env node
// @doc Keep the phone browser MCP and its public tunnel up. Reuse a live address; start one only when it is dead.
// @skill phone-browser
/**
 *   node tools/mcp/browser-http-up.mjs
 *
 * Prints one line:
 *   phone-browser reuse https://…/mcp?token=…
 *   phone-browser new https://…/mcp?token=…
 * reuse means the connector the user already added still works. new means
 * the public host changed and they must paste that one URL again.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DIR = path.join(ROOT, "scratch/browser-http");
const STATE = path.join(DIR, "state.json");
const LOG = path.join(DIR, "cloudflared.log");
const PORT = 3001;
const CLOUDFLARED = "/tmp/cloudflared";

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
}

async function waitFor(label, probe) {
  for (let i = 0; i < 40; i++) {
    const hit = await probe();
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(label + " did not come up");
}

export async function bringUp() {
  const prior = readState();
  const localOk = await ping(`http://127.0.0.1:${PORT}/healthz`);
  const publicOk = prior.url ? await ping(new URL(prior.url).origin + "/healthz") : false;
  const action = decide({ localOk, publicOk, url: prior.url });
  if (action === "reuse") return { kind: "reuse", url: prior.url };

  const token = prior.token || randomBytes(18).toString("hex");
  if (!localOk) {
    mkdirSync(DIR, { recursive: true });
    detach(process.execPath, ["tools/mcp/browser-http.mjs", "--port", String(PORT)], {
      ...process.env,
      APEX_MCP_TOKEN: token,
    });
    await waitFor("browser mcp", () => ping(`http://127.0.0.1:${PORT}/healthz`));
  }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(LOG, "");
  const bin = await ensureCloudflared();
  detach(bin, ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"], process.env, LOG);
  const host = await waitFor("tunnel", () => {
    try { return tunnelUrlFromLog(readFileSync(LOG, "utf8")); }
    catch { return null; }
  });
  const url = connectorUrl(host, token);
  await waitFor("public mcp", () => ping(host + "/healthz"));
  writeState({ token, port: PORT, url, host });
  return { kind: "new", url };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await bringUp();
  console.log(`phone-browser ${result.kind} ${result.url}`);
}
