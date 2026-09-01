#!/usr/bin/env node
// @doc chrome-devtools MCP over stdio against a running build: `probe --backend webgpu`, `--eval`, `--console RE`, `--dry-run`.
// @skill mcp-probe
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
 *   Prefer the repo wrapper (detects Chromium, SwiftShader args, local clone):
 *     tools/chrome-devtools-mcp.sh run
 *   Or register that script with `claude mcp add` / `.mcp.json` (already wired).
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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRAPPER = process.env.APEX_MCP_WRAPPER || path.join(ROOT, "tools/chrome-devtools-mcp.sh");

// ── probe mode ───────────────────────────────────────────────────────────────
// The raw call-array form below is the general escape hatch; `probe` is the shape
// every real session actually needed, and each flag is a mistake that cost a run:
//
//   --backend three|webgpu   the pick lives in localStorage, and each invocation
//       gets a FRESH browser profile — so setting it means load, set, RELOAD, in
//       one batch. Doing it as two commands silently probes the default backend.
//   --wait                   the boot is async (track build + pack fetch); a
//       probe that evaluates immediately reads a half-built world.
//   --console                the scenery/track SUPPRESSED warnings drown the
//       line you are looking for; this greps instead of printing 40 messages.
//
// GOTCHA the preamble cannot fix for you: js/*.js assign `const GLX = …` at
// script top level, which is a global LEXICAL binding, NOT a window property.
// `window.GLX` is undefined; bare `GLX` works. Same for Assets / Tracks / TLX.
// And navigator.gpu needs a SECURE CONTEXT — probe http://127.0.0.1, never
// about:blank, or WebGPU is missing no matter which Chrome flags are set.
function parseProbeArgs(argv) {
  const o = { url: "http://127.0.0.1:3456/", backend: null, wait: 6000,
              evalSrc: null, console: null, json: false, tlxWebgpu: false, tlxAuto: false, tlxAutoGl: false, lite: false,
              dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--url") o.url = next();
    else if (a === "--backend") o.backend = next();
    else if (a === "--tlx-webgpu") o.tlxWebgpu = true;
    else if (a === "--tlx-auto") o.tlxAuto = true;
    else if (a === "--tlx-auto-gl") o.tlxAutoGl = true;
    else if (a === "--lite") o.lite = true;
    else if (a === "--wait") o.wait = Number(next());
    else if (a === "--eval") o.evalSrc = next();
    else if (a === "--console") {
      const v = argv[i + 1];
      o.console = v && !v.startsWith("--") ? (i++, v) : "";
    } else if (a === "--json") o.json = true;
    else if (a === "--dry-run") o.dryRun = true;
    else throw new Error(`probe: unknown flag ${a}`);
  }
  return o;
}

function backendInitScript(pick, o) {
  const lines = [
    `localStorage.setItem("apex26.gfxBackend", ${JSON.stringify(pick)});`,
    `localStorage.removeItem("apex26.gfxWgxLevel");`,
    `localStorage.removeItem("apex26.gfxWgxFail");`,
    `localStorage.removeItem("apex26.gfxBackendProbe");`,
    `localStorage.removeItem("apex26.gfxTlxFail");`,
    `try { sessionStorage.removeItem("apex26.gfxBound"); } catch (_) {}`,
    `try { sessionStorage.removeItem("apex26.gfxClaimFail"); } catch (_) {}`,
  ];
  if (pick === "webgpu") {
    lines.push(`localStorage.setItem("apex26.gfxWgxAllowSoftware", "1");`);
    lines.push(`sessionStorage.setItem("apex26.wgxCapture", "1");`);
    if (o.lite) lines.push(`localStorage.setItem("apex26.gfxWgxLite", "1");`);
    else lines.push(`localStorage.removeItem("apex26.gfxWgxLite");`);
  } else if (pick === "three") {
    // Default pin is the CI WebGL2 path. --tlx-webgpu forces WebGPU.
    // --tlx-auto leaves the pin UNSET so we measure THREE PATH: AUTO.
    // --tlx-auto-gl is AUTO after a stay-GL latch (three WebGL2, still TLX).
    if (o.tlxAutoGl) {
      lines.push(`localStorage.removeItem("apex26.tlxForceGL");`);
      lines.push(`try { sessionStorage.setItem("apex26.tlxAutoGL", "1"); } catch (_) {}`);
    } else if (o.tlxAuto) {
      lines.push(`localStorage.removeItem("apex26.tlxForceGL");`);
      lines.push(`try { sessionStorage.removeItem("apex26.tlxAutoGL"); } catch (_) {}`);
    } else {
      const tlxPin = o.tlxWebgpu
        ? `localStorage.setItem("apex26.tlxForceGL", "0");`
        : `localStorage.setItem("apex26.tlxForceGL", "1");`;
      lines.push(tlxPin);
      lines.push(`try { sessionStorage.removeItem("apex26.tlxAutoGL"); } catch (_) {}`);
    }
  }
  return lines.join("\n");
}

function probeCalls(o) {
  const calls = [{ name: "new_page", arguments: { url: o.url } }];
  if (o.backend) {
    const pick = o.backend === "webgl2" ? "webgl2" : o.backend;
    const init = backendInitScript(pick, o);
    calls.push({ name: "evaluate_script", arguments: { function:
      `async () => { ${init} return "pick=" + localStorage.getItem("apex26.gfxBackend"); }` } });
    calls.push({ name: "navigate_page", arguments: { url: o.url } });
  }
  let body = "return JSON.stringify({ ok: true });";
  if (o.evalSrc) {
    const src = o.evalSrc === "-"
      ? fs.readFileSync(0, "utf8")
      : (fs.existsSync(o.evalSrc) ? fs.readFileSync(o.evalSrc, "utf8") : o.evalSrc);
    body = src;
  }
  calls.push({ name: "evaluate_script", arguments: { function:
    `async () => { await new Promise(r => setTimeout(r, ${o.wait | 0}));\n${body}\n}` } });
  if (o.console !== null) calls.push({ name: "list_console_messages", arguments: {} });
  return calls;
}

const argv = process.argv.slice(2);
let calls;
let consoleGrep = null;
if (argv[0] === "probe") {
  const o = parseProbeArgs(argv.slice(1));
  calls = probeCalls(o);
  consoleGrep = o.console;
  // --dry-run prints the call array a real run would send and exits, so the
  // browser is not on the critical path when what you are debugging is the
  // batch (an out-of-order set/reload probes the wrong backend, silently).
  if (o.dryRun) { console.log(JSON.stringify(calls, null, 2)); process.exit(0); }
} else if (argv[0] === "-h" || argv[0] === "--help" || argv.length === 0) {
  console.log(`mcp-cli — drive the chrome-devtools MCP server over stdio

  node tools/mcp-cli.mjs '[{"name":"navigate_page","arguments":{"url":"..."}}]'
  node tools/mcp-cli.mjs '[]'                       handshake + list tools
  node tools/mcp-cli.mjs probe [flags]              the common shape

probe flags:
  --url URL          default http://127.0.0.1:3456/ (serve the tree first)
  --backend NAME     webgl2 | three | webgpu — sets the pick, then RELOADS
  --lite             with --backend webgpu, force WGX_LITE (phone/WebKit stack)
  --tlx-webgpu       with --backend three, take three's WebGPU path (default is
                     the WebGL2 pin the specs use)
  --tlx-auto         with --backend three, leave tlxForceGL unset (THREE PATH: AUTO)
  --tlx-auto-gl      AUTO + session tlxAutoGL=1 (three WebGL2, still TLX)
  --wait MS          settle before evaluating (default 6000; a boot needs ~9000)
  --eval FILE|SRC|-  body of an async fn; return a string (JSON.stringify it)
  --console [RE]     print console messages, optionally filtered by regex
  --json             print the evaluate result raw
  --dry-run          print the MCP call batch and exit (no browser)

In page code use BARE globals (GLX / Assets / TLX): they are const script
bindings, so window.GLX is undefined. navigator.gpu needs http://127.0.0.1 —
it is absent on about:blank whatever the Chrome flags say.`);
  process.exit(0);
} else {
  calls = JSON.parse(argv[0] || "[]");
}

// Route through the repo wrapper (same as cdmcp-cli.py / .mcp.json). Do not
// hard-code a Playwright browser path — this box may only ship Google Chrome.
const srv = spawn(WRAPPER, ["run"], { stdio: ["pipe", "pipe", "pipe"] });

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
// Per-call ceiling. A SwiftShader measurement eval (cold boot + track build +
// timed frame blocks) can legitimately run past 180 s — override with
// MCP_CLI_TIMEOUT_MS for those runs; the default stays the safe ceiling.
const CALL_TIMEOUT_MS = Math.max(10000, parseInt(process.env.MCP_CLI_TIMEOUT_MS, 10) || 180000);
const send = (method, params) => new Promise((res, rej) => {
  const id = nextId++;
  pending.set(id, res);
  srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(`timeout on ${method}`)); } }, CALL_TIMEOUT_MS);
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

let toolFailed = false;
for (const c of calls) {
  const r = await send("tools/call", { name: c.name, arguments: c.arguments || {} });
  let out = (r.result?.content || []).map((x) => x.text ?? `[${x.type}]`).join("\n");
  // A console dump is the one result worth filtering rather than truncating: the
  // interesting line is routinely message 26 of 44, past any slice().
  let limit = 2500;
  if (c.name === "list_console_messages" && consoleGrep !== null) {
    if (consoleGrep) {
      const re = new RegExp(consoleGrep, "i");
      out = out.split("\n").filter((l) => re.test(l)).join("\n") || `(no console line matches /${consoleGrep}/i)`;
    }
    limit = 20000;
  }
  console.log(`\n--- ${c.name} ${JSON.stringify(c.arguments || {}).slice(0, 90)}`);
  const failed = Boolean(r.error || r.result?.isError);
  if (failed) toolFailed = true;
  console.log(r.error ? "ERROR: " + JSON.stringify(r.error).slice(0, 300) : out.slice(0, limit));
}
srv.kill();
process.exit(toolFailed ? 1 : 0);
