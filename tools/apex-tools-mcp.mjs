#!/usr/bin/env node
/**
 * apex-tools-mcp — wrap committed week-1 CLIs under tools/ as MCP tools.
 *
 * Fourth .mcp.json server (beside tinyfish / chrome-devtools / probe). Prefix
 * apex_* only — never chrome_* / tinyfish_*. Local working tree only; no
 * github.io. Design: docs/research/APEX-TOOLS-MCP.md
 *
 *   node tools/apex-tools-mcp.mjs help
 *   node tools/apex-tools-mcp.mjs status
 *   node tools/apex-tools-mcp.mjs list-tools
 *   node tools/apex-tools-mcp.mjs call apex_pick_tests '{"dryRun":true}'
 *   node tools/apex-tools-mcp.mjs serve
 *   ./tools/apex-tools-mcp.sh call apex_status '{}'
 *
 * APEX_MCP_MOCK=1 freezes the catalog and returns fake results (no spawn).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROTOCOL = "2025-06-18";
const SERVER_NAME = "apex-tools-mcp";
const SERVER_VERSION = "1.0.0";
const PREFIX = "apex_";
const LOCK_PATH = path.join(ROOT, "scratch", "apex-browser.lock");
const TEST_BG_STATE = path.join(ROOT, "artifacts", "logs", "test-bg.json");
const CHROME_DAEMON_STATE = path.join(ROOT, "scratch", "probe-chrome-daemon.port");

function mockMode() {
  const v = (process.env.APEX_MCP_MOCK || "").trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false" && v !== "no";
}

function log(...args) {
  console.error(...args);
}

function toolResult(body, { isError = false } = {}) {
  const result = {
    content: [{ type: "text", text: JSON.stringify(body) }],
  };
  if (isError || body.ok === false) result.isError = true;
  return result;
}

function refuse(error, message, fix) {
  return toolResult({ ok: false, error, message, fix }, { isError: true });
}

function isLoopbackHost(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

function classifyUrl(raw) {
  if (raw == null || raw === "") return null;
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    return { error: "ssrf_blocked", message: `invalid url: ${raw}`,
      fix: "Pass a loopback http(s) URL (127.0.0.1 / localhost / [::1]) or omit url." };
  }
  const host = u.hostname.toLowerCase();
  if (host === "github.io" || host.endsWith(".github.io")) {
    return {
      error: "github_io_blocked",
      message: "apex_* tools never hit github.io / Pages.",
      fix: "Use TinyFish / deploy-research / tools/tinyfish-mcp.sh deploy-check --tip for live deploy checks.",
    };
  }
  if (!isLoopbackHost(host)) {
    return {
      error: "ssrf_blocked",
      message: `non-loopback host refused: ${host}`,
      fix: "SSRF allowlist is loopback only. Deployed-site checks belong to TinyFish.",
    };
  }
  return null;
}

function resolveTarget(args) {
  if (args.url != null && args.url !== "") return "url";
  if (args.target != null && args.target !== "") return String(args.target);
  if (process.env.APEX_MCP_TARGET) return String(process.env.APEX_MCP_TARGET);
  return "local";
}

function gateTreeArgs(args) {
  const urlGate = classifyUrl(args.url);
  if (urlGate) return refuse(urlGate.error, urlGate.message, urlGate.fix);
  const target = resolveTarget(args);
  if (target === "deploy") {
    return refuse(
      "tree_only",
      "Tree tools operate on the working tree only.",
      "Omit target / use target=local. Deployed Pages checks: TinyFish deploy-check --tip.",
    );
  }
  return null;
}

function alive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function daemonPort() {
  // Same discovery as probe-mcp.py daemon_port(): env → state file → 3712,
  // each health-checked. Sync via a short child so callers stay blocking.
  const candidates = [];
  const env = (process.env.PROBE_CHROME_PORT || "").trim();
  if (/^\d+$/.test(env)) candidates.push(Number(env));
  try {
    if (fs.existsSync(CHROME_DAEMON_STATE)) {
      const text = fs.readFileSync(CHROME_DAEMON_STATE, "utf8").trim();
      if (/^\d+$/.test(text)) candidates.push(Number(text));
    }
  } catch { /* ignore */ }
  candidates.push(3712);
  for (const port of [...new Set(candidates)]) {
    const r = spawnSync(
      process.execPath,
      [
        "-e",
        `require("http").get("http://127.0.0.1:${port}/healthz",r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on("error",()=>process.exit(1));setTimeout(()=>process.exit(1),500)`,
      ],
      { encoding: "utf8", timeout: 2000 },
    );
    if (r.status === 0) return port;
  }
  return null;
}

function playwrightLive() {
  // Process-table check for orphans invisible to test-bg --status.
  const r = spawnSync("ps", ["-eo", "pid,args"], { encoding: "utf8", timeout: 5000 });
  if (r.status !== 0) return { live: false, pids: [] };
  const pids = [];
  for (const line of r.stdout.split("\n")) {
    if (/playwright\s+test\b/.test(line) || /playwright.*test/.test(line)) {
      const m = line.trim().match(/^(\d+)\s/);
      if (m) pids.push(Number(m[1]));
    }
  }
  return { live: pids.length > 0, pids };
}

function testBgStatus() {
  if (!fs.existsSync(TEST_BG_STATE)) {
    return { recorded: false, running: [], runs: [] };
  }
  let state;
  try {
    state = JSON.parse(fs.readFileSync(TEST_BG_STATE, "utf8"));
  } catch {
    return { recorded: true, running: [], runs: [], error: "unreadable" };
  }
  const runs = Array.isArray(state.runs) ? state.runs : [];
  const running = runs.filter((run) => alive(run.pid));
  return { recorded: true, mode: state.mode, running, runs };
}

function lockInfo() {
  if (!fs.existsSync(LOCK_PATH)) return { held: false };
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
  } catch {
    return { held: true, stale: true, error: "unreadable" };
  }
  const pid = Number(raw.pid);
  if (!alive(pid)) return { held: false, stale: true, pid };
  return { held: true, pid, since: raw.since || null, tool: raw.tool || null };
}

function nodeTool(rel) {
  return [process.execPath, path.join(ROOT, "tools", rel)];
}

const WEEK1 = [
  {
    name: "apex_verify_track",
    description:
      "Headless TRACK_VM build check for one circuit id or --all. Working tree only.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Circuit id (e.g. monza). Omit with all=true." },
        all: { type: "boolean", description: "Verify every track in Tracks.LIST." },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_verify_change_fast",
    description:
      "verify-change.mjs --fast --json only (no browser groups, never --wait).",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string" },
        staged: { type: "boolean" },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_wgx_validate_static",
    description: "wgx-validate.mjs --static — source invariants, no Chromium.",
    inputSchema: {
      type: "object",
      properties: {
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_pick_tests",
    description: "pick-tests.mjs --json. Never --bg (that prints test-bg start lines).",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string" },
        staged: { type: "boolean" },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Explicit paths; overrides git selection when set.",
        },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_bump_cache_check",
    description: "bump-cache.mjs --check --json. Never --apply / --at / --merge.",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string" },
        dryRun: { type: "boolean" },
        target: { type: "string", enum: ["local", "deploy"] },
        url: { type: "string" },
      },
    },
  },
  {
    name: "apex_status",
    description:
      "Read-only: browser lock, probe chrome /healthz, test-bg, playwright test PIDs, loadavg. Does not take the lock.",
    inputSchema: {
      type: "object",
      properties: {
        dryRun: { type: "boolean" },
      },
    },
  },
];

function buildArgv(name, args) {
  switch (name) {
    case "apex_verify_track": {
      const base = nodeTool("verify-track.cjs");
      if (args.all) return [...base, "--all"];
      if (!args.id) {
        throw Object.assign(new Error("id or all=true required"), {
          refuse: refuse(
            "bad_args",
            "apex_verify_track needs id or all=true",
            'Pass {"id":"monza"} or {"all":true}.',
          ),
        });
      }
      return [...base, String(args.id)];
    }
    case "apex_verify_change_fast": {
      const argv = [...nodeTool("verify-change.mjs"), "--fast", "--json"];
      if (args.since) argv.push("--since", String(args.since));
      if (args.staged) argv.push("--staged");
      return argv;
    }
    case "apex_wgx_validate_static":
      return [...nodeTool("wgx-validate.mjs"), "--static"];
    case "apex_pick_tests": {
      const argv = [...nodeTool("pick-tests.mjs"), "--json"];
      if (args.since) argv.push("--since", String(args.since));
      if (args.staged) argv.push("--staged");
      if (Array.isArray(args.files)) {
        for (const f of args.files) argv.push(String(f));
      }
      return argv;
    }
    case "apex_bump_cache_check": {
      const argv = [...nodeTool("bump-cache.mjs"), "--check", "--json"];
      if (args.since) argv.push("--since", String(args.since));
      return argv;
    }
    default:
      throw new Error(`no argv builder for ${name}`);
  }
}

function parseOut(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Some CLIs print a trailing OK line; try last JSON-looking line.
    const lines = text.split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]);
      } catch { /* continue */ }
    }
    return null;
  }
}

function runSpawn(argv, { timeoutMs = 90000 } = {}) {
  const started = Date.now();
  const [cmd, ...args] = argv;
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    cwd: ROOT,
    env: process.env,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  const durationMs = Date.now() - started;
  const stdout = r.stdout || "";
  const stderr = r.stderr || "";
  const exit = r.status == null ? (r.signal ? 1 : 0) : r.status;
  const body = {
    ok: exit === 0,
    exit,
    argv,
    stdout,
    stderr,
    out: parseOut(stdout),
    durationMs,
  };
  if (r.error) {
    body.ok = false;
    body.error = "spawn_failed";
    body.message = String(r.error.message || r.error);
    body.fix = "Check node and that the CLI path exists under tools/.";
  }
  return toolResult(body, { isError: !body.ok });
}

function mockSuccess(name, argv) {
  return toolResult({
    ok: true,
    mock: true,
    tool: name,
    exit: 0,
    argv,
    stdout: JSON.stringify({ ok: true, mock: true, tool: name }),
    stderr: "",
    out: { ok: true, mock: true, tool: name },
    durationMs: 0,
  });
}

function handleStatus(args = {}) {
  if (args.dryRun) {
    return toolResult({
      ok: true,
      dryRun: true,
      argv: ["apex_status"],
      note: "read-only; does not take scratch/apex-browser.lock",
    });
  }
  if (mockMode()) {
    return toolResult({
      ok: true,
      mock: true,
      lock: { held: false },
      chromeDaemon: { up: false, port: null },
      testBg: { recorded: false, running: [] },
      playwright: { live: false, pids: [] },
      loadavg: os.loadavg(),
    });
  }
  const chromePort = daemonPort();
  return toolResult({
    ok: true,
    lock: lockInfo(),
    chromeDaemon: { up: chromePort != null, port: chromePort },
    testBg: testBgStatus(),
    playwright: playwrightLive(),
    loadavg: os.loadavg(),
  });
}

function dispatch(name, args = {}) {
  if (!name.startsWith(PREFIX)) {
    return refuse(
      "bad_prefix",
      `tool name must start with ${PREFIX} (got ${name})`,
      "Use apex_* tools only. chrome_* / tinyfish_* belong to probe-mcp.",
    );
  }
  const known = WEEK1.find((t) => t.name === name);
  if (!known) {
    return refuse(
      "unknown_tool",
      `unknown tool ${name}`,
      `list-tools for the week-1 catalog. Week-2 browser tools are not shipped yet.`,
    );
  }

  if (name === "apex_status") return handleStatus(args);

  const gated = gateTreeArgs(args);
  if (gated) return gated;

  let argv;
  try {
    argv = buildArgv(name, args);
  } catch (e) {
    if (e.refuse) return e.refuse;
    return refuse("bad_args", String(e.message || e), "See the tool inputSchema.");
  }

  // Structural pins — never trust caller to inject forbidden flags via files[].
  if (name === "apex_verify_change_fast") {
    if (!argv.includes("--fast") || !argv.includes("--json") || argv.includes("--wait")) {
      return refuse(
        "pin_violated",
        "apex_verify_change_fast must be --fast --json and never --wait",
        "Do not pass wait; use dryRun to inspect argv.",
      );
    }
  }
  if (name === "apex_bump_cache_check") {
    if (argv.includes("--apply") || argv.includes("--at") || argv.includes("--merge")) {
      return refuse(
        "pin_violated",
        "apex_bump_cache_check never writes cache versions",
        "Use the bump-cache CLI directly when you intend --apply (last edit before commit).",
      );
    }
  }
  if (name === "apex_pick_tests" && argv.includes("--bg")) {
    return refuse(
      "pin_violated",
      "apex_pick_tests never passes --bg",
      "Run test-bg yourself from a shell after reading pick-tests JSON.",
    );
  }

  if (args.dryRun) {
    return toolResult({
      ok: true,
      dryRun: true,
      exit: 0,
      argv,
      stdout: "",
      stderr: "",
      out: name === "apex_verify_change_fast"
        ? { plan: true, note: "dryRun — no spawn; --fast --json only" }
        : null,
      durationMs: 0,
    });
  }

  if (mockMode()) return mockSuccess(name, argv);

  const timeoutMs = name === "apex_verify_change_fast" ? 90000 : 60000;
  return runSpawn(argv, { timeoutMs });
}

function listTools() {
  return WEEK1.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

function writeRpc(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function cmdHelp() {
  const tools = WEEK1.map((t) => `  ${t.name}`).join("\n");
  process.stdout.write(`apex-tools-mcp — wrap week-1 tools/ CLIs as apex_* MCP tools

Commands:
  help
  status
  list-tools
  call <apex_name> '<json>'
  serve                 # stdio MCP (.mcp.json → tools/apex-tools-mcp.sh serve)

Week-1 tools:
${tools}

Local working tree only — no github.io. Deploy checks stay on TinyFish.
Mock: APEX_MCP_MOCK=1  Design: docs/research/APEX-TOOLS-MCP.md
`);
  return 0;
}

function cmdStatus() {
  const result = handleStatus({});
  const body = JSON.parse(result.content[0].text);
  process.stdout.write(JSON.stringify(body, null, 2) + "\n");
  return body.ok === false ? 1 : 0;
}

function cmdListTools() {
  process.stdout.write(JSON.stringify(listTools(), null, 2) + "\n");
  return 0;
}

function cmdCall(name, argsJson) {
  let args = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch (e) {
    log(`args must be JSON: ${e.message}`);
    return 2;
  }
  const result = dispatch(name, args);
  const body = JSON.parse(result.content[0].text);
  process.stdout.write(JSON.stringify(body, null, 2) + "\n");
  return result.isError ? 1 : 0;
}

function cmdServe() {
  const rl = require("readline").createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });
  rl.on("line", (line) => {
    line = line.trim();
    if (!line) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const mid = msg.id;
    const method = msg.method;
    if (method == null) return;
    // Notifications (no id) ignored.
    if (mid == null) return;

    if (method === "initialize") {
      writeRpc({
        jsonrpc: "2.0",
        id: mid,
        result: {
          protocolVersion: PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          instructions:
            "Apex week-1 tools MCP (apex_*). Working tree / TRACK_VM / static gates only. " +
            "Never github.io — use TinyFish / deploy-research for Pages. " +
            "chrome_* / tinyfish_* belong to probe-mcp.",
        },
      });
      return;
    }
    if (method === "tools/list") {
      writeRpc({ jsonrpc: "2.0", id: mid, result: { tools: listTools() } });
      return;
    }
    if (method === "tools/call") {
      const params = msg.params || {};
      const name = params.name || "";
      const arguments_ = params.arguments || {};
      try {
        const result = dispatch(name, arguments_);
        writeRpc({ jsonrpc: "2.0", id: mid, result });
      } catch (e) {
        // Unexpected crashes only — expected refuses are tool results.
        writeRpc({
          jsonrpc: "2.0",
          id: mid,
          error: { code: -32000, message: String(e.message || e).slice(0, 2000) },
        });
      }
      return;
    }
    if (method === "ping") {
      writeRpc({ jsonrpc: "2.0", id: mid, result: {} });
      return;
    }
    writeRpc({
      jsonrpc: "2.0",
      id: mid,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  });
  rl.on("close", () => process.exit(0));
  return 0;
}

function main(argv) {
  const cmd = argv[0] || "help";
  if (cmd === "help" || cmd === "--help" || cmd === "-h") return cmdHelp();
  if (cmd === "status") return cmdStatus();
  if (cmd === "list-tools") return cmdListTools();
  if (cmd === "call") return cmdCall(argv[1], argv[2] || "{}");
  if (cmd === "serve") return cmdServe();
  log(`unknown command: ${cmd}`);
  cmdHelp();
  return 2;
}

const code = main(process.argv.slice(2));
// serve keeps the process alive via readline; only exit for other commands.
if (process.argv[2] !== "serve") process.exitCode = code;
