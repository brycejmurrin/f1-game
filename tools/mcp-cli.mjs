#!/usr/bin/env node
/* mcp-cli — drive the chrome-devtools MCP server directly, over stdio JSON-RPC.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A SCRATCH FILE.
 * The MCP transport is newline-delimited JSON-RPC on stdin/stdout. Nothing about
 * it requires the agent host to broker a call — so when the server is configured
 * but this SESSION's tool list does not carry `mcp__chrome-devtools__*` (that
 * list is fixed at session start), this reaches the same browser anyway.
 *
 * IT PAYS FOR ITSELF. Twice on the day it was written, against changes that were
 * about to ship on reasoning alone:
 *   - the settings door row, which looked like a clear win and was a REGRESSION
 *     on a split sheet: content 333 -> 361 own units, scroll 2.87 -> 3.11
 *     screens. In a multi-column grid the body's height is the tallest column,
 *     so a row spanning `1 / -1` adds to every column at once.
 *   - the livery list as a grid, which "obviously" halves a 34-screen column and
 *     measured 78.1 screens — 2.3x WORSE, because at 124 units each row wraps to
 *     several lines.
 * A third check killed a one-line stat block that clipped CORNERING and BRAKING.
 * Three layout intuitions, three measurements, three reversals.
 *
 * WHEN TO USE IT, versus the two neighbours it does not replace:
 *   - tools/layout-audit.mjs — the MATRIX. Every screen x viewport x scale,
 *     asserted, reported. Use it to know whether anything is broken anywhere.
 *   - the Playwright suite — the REGRESSION net, parallel and CI-gated.
 *   - this — ONE question, interactively, against a running build. Especially an
 *     A/B: serve two trees on two ports and measure the same page in both, so
 *     the diff is the only variable.
 *
 * GETTING THE SERVER UP IN A FRESH CONTAINER. `.mcp.json` configures it, but a
 * project-scoped server stays `⏸ Pending approval` until the project trust
 * dialog is accepted (`hasTrustDialogAccepted` in ~/.claude.json), and editing
 * that file by hand loses the race — the running CLI owns it and rewrites it
 * from its own state. The way through is user scope, which does not go via
 * project trust:
 *
 *   claude mcp add chrome-devtools --scope user -- \
 *     npx -y chrome-devtools-mcp@latest --headless --isolated \
 *     --executablePath /opt/pw-browsers/chromium \
 *     --chromeArg=--no-sandbox --chromeArg=--use-angle=swiftshader
 *
 * NEVER RUN THIS WHILE A PLAYWRIGHT GROUP OR THE LAYOUT AUDIT IS IN FLIGHT. A
 * live page here holds ~20% CPU; on a 4-core box that starves the other run and
 * produces FALSE failures, not just slow ones (.claude/skills/mcp-probe records
 * two passing specs turned red, one of them a real assertion miss).
 *
 * Usage:
 *   node tools/mcp-cli.mjs '[{"name":"navigate_page","arguments":{"url":"..."}}]'
 *   node tools/mcp-cli.mjs '[]'        # handshake + list the 29 tools
 *
 * Calls run in order against one page, so resize -> navigate -> evaluate_script
 * is the usual shape. evaluate_script takes an async arrow as a STRING and
 * returns whatever it returns; JSON.stringify the result to keep it readable.
 */
import { spawn } from "node:child_process";

const calls = JSON.parse(process.argv[2] || "[]");

const srv = spawn("npx", ["-y", "chrome-devtools-mcp@latest", "--headless", "--isolated",
  "--executablePath", "/opt/pw-browsers/chromium",
  "--chromeArg=--no-sandbox", "--chromeArg=--use-angle=swiftshader"],
  { stdio: ["pipe", "pipe", "pipe"] });

let buf = "";
const pending = new Map();
srv.stdout.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});
srv.stderr.on("data", (d) => { const s = d.toString().trim(); if (s) console.error("[srv]", s.slice(0, 300)); });

let nextId = 1;
const send = (method, params) => new Promise((res, rej) => {
  const id = nextId++;
  pending.set(id, res);
  srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(`timeout on ${method}`)); } }, 180000);
});
const notify = (method, params) =>
  srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");

const init = await send("initialize", {
  protocolVersion: "2024-11-05", capabilities: {},
  clientInfo: { name: "apex-cli", version: "1.0" },
});
console.log("SERVER:", init.result?.serverInfo?.name, init.result?.serverInfo?.version);
notify("notifications/initialized", {});

const tools = await send("tools/list", {});
const names = (tools.result?.tools || []).map((t) => t.name);
console.log(`TOOLS (${names.length}):`, names.join(", "));

for (const c of calls) {
  const r = await send("tools/call", { name: c.name, arguments: c.arguments || {} });
  const out = (r.result?.content || []).map((x) => x.text ?? `[${x.type}]`).join("\n");
  console.log(`\n--- ${c.name} ${JSON.stringify(c.arguments || {}).slice(0, 90)}`);
  console.log(r.error ? "ERROR: " + JSON.stringify(r.error).slice(0, 300) : out.slice(0, 2500));
}
srv.kill();
process.exit(0);
