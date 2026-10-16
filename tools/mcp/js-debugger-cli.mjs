#!/usr/bin/env node
// @doc Separate debugger server CLI: stdio, persistent loopback daemon and state-preserving shell calls.
import { pathToFileURL } from "node:url";
import { serve, TOOLS } from "./js-debugger-mcp.mjs";
import { debuggerRequest, startDebuggerHttp } from "./js-debugger-http.mjs";

const print = body => process.stdout.write(JSON.stringify(body, null, 2) + "\n");
export async function main(args = process.argv.slice(2)) {
  const command = args[0] || "help";
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(`js-debugger-mcp — a separate stateful debugger server (Node22+, no browser launch)
  serve                       stdio MCP, owned by the MCP client
  serve-http                  persistent daemon on 127.0.0.1:3714 (APEX_DEBUGGER_PORT)
  call <debugger_tool> '<json>' call the running daemon; never starts a new session
  status                      daemon health and attachment state
  list-tools                  local tool schemas, no daemon or browser
  smoke                       parent-only native Chromium workflow (browser lock)
Detach before stopping the daemon with Ctrl-C/SIGTERM. Stdio and HTTP are separate sessions;
use one mode/controller for a browser target. The wrapper never installs an MCP catalog.
`); return 0;
  }
  if (["list-tools", "--list-tools"].includes(command)) { print(TOOLS); return 0; }
  if (command === "serve") { await serve(); return process.exitCode || 0; }
  if (command === "serve-http") {
    const daemon = await startDebuggerHttp();
    process.stderr.write(`[js-debugger] listening ${daemon.endpoint}\n`);
    await new Promise(resolve => {
      const stop = () => {
        process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
        daemon.close().then(result => {
          if (result.cleanupErrors?.length) { process.stderr.write(`Debugger cleanup incomplete: ${result.cleanupErrors.join("; ")}\n`); process.exitCode = 1; }
          resolve();
        }).catch(e => { process.stderr.write(`${e.message}\n`); process.exitCode = 1; resolve(); });
      };
      process.once("SIGINT", stop); process.once("SIGTERM", stop);
    });
    return process.exitCode || 0;
  }
  if (command === "status") {
    const result = await debuggerRequest("/healthz");
    if (result.name !== "js-debugger-mcp") throw Error("Port is not the js-debugger daemon");
    print(result); return 0;
  }
  if (command === "call") {
    if (!TOOLS.some(t => t.name === args[1])) throw Error("Unknown debugger tool; use list-tools");
    const a = JSON.parse(args[2] || "{}");
    const result = await debuggerRequest("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: args[1], arguments: a } });
    print(result.result.structuredContent); return result.result.isError ? 1 : 0;
  }
  if (command === "smoke") { await import("./js-debugger-smoke.mjs"); return 0; }
  throw Error(`Unknown command: ${command}; use help`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => { process.exitCode = code; }).catch(e => { print({ ok: false, error: e.message }); process.exitCode = 1; });
}
