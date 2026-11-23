#!/usr/bin/env node
// @doc CLI: tail the console of an iPhone Safari tab via ios-webkit-debug-proxy (status, tabs, console); needs phone and cable.
// Usage: node tools/mcp/ios-console.mjs status | tabs [--port 9222] | console [--match <url substring>] [--seconds 20] [--port 9222] [--json]
// Route, prerequisites and what only Bryce can do: docs/notes/IOS-SAFARI-CONSOLE-ROUTE-2026-10-29.md.
// The proxy speaks the WebKit Inspector protocol on its page sockets (not Chrome's), so this sends Console.enable and
// prints Console.messageAdded; it never attaches Chrome DevTools to it. Node 22 global WebSocket, no dependency.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const LIST_PORT = 9221;

export function parseArgs(argv) {
  const o = { cmd: argv[0] || "status", port: 9222, seconds: 20, match: "", json: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--port" || a === "--seconds" || a === "--match") {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      o[a.slice(2)] = a === "--match" ? v : Number(v);
      if (a !== "--match" && !Number.isFinite(o[a.slice(2)])) throw new Error(`${a} must be a number`);
    } else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

// The proxy's /json lists tabs with webSocketDebuggerUrl; a device list item carries url "localhost:<port>".
export function pickTab(tabs, match = "") {
  const live = (tabs || []).filter(t => t && t.webSocketDebuggerUrl);
  return (match ? live.filter(t => (t.url || "").includes(match) || (t.title || "").includes(match)) : live)[0] || null;
}

export function formatMessage(m, json = false) {
  const x = m && m.message ? m.message : m || {};
  if (json) return JSON.stringify(x);
  const where = x.url ? ` (${x.url}${x.line ? ":" + x.line : ""})` : "";
  return `[${x.level || x.type || "log"}] ${x.text ?? ""}${where}`;
}

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}

function have(bin) { return spawnSync("which", [bin], { encoding: "utf8" }).status === 0; }

export async function status() {
  const out = { proxyBinary: have("ios_webkit_debug_proxy"), idevice_id: have("idevice_id"), devices: null, hint: "" };
  try { out.devices = await getJson(`http://127.0.0.1:${LIST_PORT}/json`); }
  catch { out.hint = out.proxyBinary ? "proxy not running: ios_webkit_debug_proxy -F  (phone plugged in, unlocked, trusted, Web Inspector ON)"
    : "ios_webkit_debug_proxy not installed (macOS: brew install ios-webkit-debug-proxy; Linux: build from source, see the route note)"; }
  return out;
}

export async function tail({ port, match, seconds, json }, log = console.log) {
  const tab = pickTab(await getJson(`http://127.0.0.1:${port}/json`), match);
  if (!tab) throw new Error(`no open Safari tab${match ? ` matching "${match}"` : ""} on port ${port} (open the game in Safari, keep the phone unlocked)`);
  log(`# ${tab.title || ""} ${tab.url || ""}`);
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("websocket failed")); });
  ws.onmessage = ev => {
    let d; try { d = JSON.parse(ev.data); } catch { return; }
    if (d.method === "Console.messageAdded") log(formatMessage(d.params, json));
  };
  ws.send(JSON.stringify({ id: 1, method: "Console.enable" }));
  await new Promise(r => setTimeout(r, seconds * 1000));
  ws.close();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.cmd === "status") console.log(JSON.stringify(await status(), null, 2));
    else if (o.cmd === "tabs") console.log(JSON.stringify(await getJson(`http://127.0.0.1:${o.port}/json`), null, 2));
    else if (o.cmd === "console") await tail(o);
    else throw new Error(`unknown command ${o.cmd}`);
  } catch (e) { console.error(`ios-console: ${e.message}`); process.exit(1); }
}
