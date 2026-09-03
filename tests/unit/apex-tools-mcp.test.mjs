// apex-tools-mcp.test.mjs — apex-tools MCP (local CLI wrap).
// APEX_MCP_MOCK=1 / dryRun only — no Chromium, no network.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MCP = path.join(ROOT, "tools/apex-tools-mcp.mjs");
const SH = path.join(ROOT, "tools/apex-tools-mcp.sh");
const MCP_JSON = path.join(ROOT, ".mcp.json");

function rpc(lines, env = {}) {
  const r = spawnSync(process.execPath, [MCP, "serve"], {
    encoding: "utf8",
    input: lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + "\n",
    env: { ...process.env, APEX_MCP_MOCK: "1", ...env },
    cwd: ROOT,
    timeout: 15000,
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function callCli(name, args = {}, extraEnv = {}) {
  const r = spawnSync(
    process.execPath,
    [MCP, "call", name, JSON.stringify(args)],
    {
      encoding: "utf8",
      env: { ...process.env, APEX_MCP_MOCK: "1", ...extraEnv },
      cwd: ROOT,
      timeout: 15000,
    },
  );
  return r;
}

test("apex-tools-mcp.mjs and shell entry exist", () => {
  assert.ok(fs.existsSync(MCP));
  assert.ok(fs.existsSync(SH));
  const src = fs.readFileSync(MCP, "utf8");
  assert.match(src, /apex-tools-mcp/);
  assert.match(src, /apex_/);
  // Catalog must not REGISTER chrome_/tinyfish_ tools (design invariant).
  // Mentions in refuse/help copy are fine; the tools/list test is the hard gate.
  assert.doesNotMatch(src, /name:\s*"chrome_/);
  assert.doesNotMatch(src, /name:\s*"tinyfish_/);
});

test(".mcp.json registers apex-tools in the three-server catalog", () => {
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/apex-tools-mcp.json"), "utf8"));
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), [
    "apex-tools",
    "chrome-devtools",
    "playwright-official",
  ]);
  assert.equal(cfg.mcpServers["apex-tools"].type, "stdio");
  assert.equal(cfg.mcpServers["apex-tools"].command, "bash");
  assert.deepEqual(cfg.mcpServers["apex-tools"].args, ["tools/apex-tools-mcp.sh", "serve"]);
  assert.deepEqual(cfg.mcpServers["apex-tools"].args, catalog.stdio.args);
  assert.equal(catalog.stdio.command, "bash");
  assert.equal(catalog.http.bind, "127.0.0.1");
  assert.equal(catalog.http.port, 3713);
  assert.deepEqual(catalog.http.args, ["serve-http"]);
});

test("playwright-official pin matches the wrapper's audited package and never @latest", () => {
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  const cursorCfg = JSON.parse(fs.readFileSync(path.join(ROOT, ".cursor/mcp.json"), "utf8"));
  const pw = fs.readFileSync(path.join(ROOT, "tools/playwright-mcp.sh"), "utf8")
    .match(/MCP_NPM_PACKAGE="([^"]+)"/)[1];
  assert.equal(cfg.mcpServers["playwright-official"].command, "npx");
  assert.deepEqual(cfg.mcpServers["playwright-official"].args, ["-y", pw]);
  assert.deepEqual(cursorCfg.mcpServers["playwright-official"], cfg.mcpServers["playwright-official"]);
  // chrome-devtools-official (bare npx, no WebGPU flags) left the catalog 2026-09;
  // the wrapper server keeps the same pinned package as its network fallback.
  assert.equal(cfg.mcpServers["chrome-devtools-official"], undefined);
  assert.match(fs.readFileSync(path.join(ROOT, "tools/chrome-devtools-mcp.sh"), "utf8"),
    /MCP_NPM_PACKAGE="chrome-devtools-mcp@1\.7\.0"/);
  assert.doesNotMatch(JSON.stringify(cfg), /@latest/);
  assert.doesNotMatch(JSON.stringify(cursorCfg), /@latest/);
});

test(".cursor/mcp.json locksteps the root catalog (Cloud/Claude load .mcp.json)", () => {
  const cursorCfg = JSON.parse(fs.readFileSync(path.join(ROOT, ".cursor/mcp.json"), "utf8"));
  const rootCfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  assert.deepEqual(Object.keys(cursorCfg.mcpServers).sort(), Object.keys(rootCfg.mcpServers).sort());
  assert.deepEqual(cursorCfg.mcpServers["apex-tools"], rootCfg.mcpServers["apex-tools"]);
  assert.equal(rootCfg.mcpServers["apex-tools"].type, "stdio");
});

test("help lists serve / list-tools / call / status", () => {
  const r = spawnSync(process.execPath, [MCP, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /serve/);
  assert.match(r.stdout, /list-tools/);
  assert.match(r.stdout, /call/);
  assert.match(r.stdout, /status/);
  assert.match(r.stdout, /apex_/);
  assert.match(r.stdout, /apex_select_specs/);
  assert.match(r.stdout, /apex_graph_parity/);
  assert.match(r.stdout, /apex_gfx_probe/);
  assert.doesNotMatch(r.stdout, /apex_carshot|apex_select_recall|apex_ui_survey/, "trimmed wraps must not be advertised");
  assert.match(r.stdout, /serve-http/);
});

test("shell help exits 0", () => {
  const r = spawnSync("bash", [SH, "help"], { encoding: "utf8", cwd: ROOT });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /apex_/);
});

test("apex_status reports the chrome-devtools stdio known gap", () => {
  const r = callCli("apex_status", {});
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.match(body.knownGap.chromeDevtoolsStdio, /3712/);
  assert.match(body.knownGap.hostPlaywrightMcp, /@playwright\/mcp/);
  assert.match(body.knownGap.playwrightMcpStdio, /playwright/);
  assert.ok(body.knownGap.outsideLock.includes("layout-audit"));
  assert.ok(body.knownGap.outsideLock.includes("playwright-mcp"));
  assert.equal(body.playwright.live, false);
  assert.equal(body.playwright.suite, false);
  assert.equal(body.playwright.hostMcp, false);
  assert.equal(body.playwright.hostBrowser, false);
});

test("initialize → serverInfo.name === apex-tools-mcp; tools are apex_* only", () => {
  const out = rpc([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "apex-tools-test", version: "1" },
      },
    },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ]);
  assert.equal(out[0].result.serverInfo.name, "apex-tools-mcp");
  assert.ok(out[0].result.capabilities.tools);
  const names = (out[1].result.tools || []).map((t) => t.name);
  // 30 → 12 on 2026-09: everything else is a plain tools/ CLI.
  assert.deepEqual([...names].sort(), [
    "apex_agent",
    "apex_bump_cache_check",
    "apex_eval",
    "apex_gfx_probe",
    "apex_graph_parity",
    "apex_pick_tests",
    "apex_rotate_markings_check",
    "apex_select_specs",
    "apex_shot",
    "apex_status",
    "apex_verify_change_fast",
    "apex_wgx_validate_static",
  ]);
  for (const n of names) {
    assert.match(n, /^apex_/);
    assert.doesNotMatch(n, /^chrome_/);
    assert.doesNotMatch(n, /^tinyfish_/);
  }
  for (const never of [
    "apex_test_bg",
    "apex_bump_cache_apply",
    "tinyfish_deploy_check",
    "chrome_evaluate_script",
    // trimmed 2026-09 — CLIs now
    "apex_verify_track",
    "apex_survey_track",
    "apex_carshot",
    "apex_ui_survey",
    "apex_wgx_validate",
    "apex_cache_bump_only",
  ]) {
    assert.ok(!names.includes(never), `must not wrap ${never}`);
  }
});

test("dryRun / mock apex_verify_change_fast pins --fast --json, never --wait or test-bg", () => {
  const r = callCli("apex_verify_change_fast", { dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.ok(body.argv.includes("--fast"), body.argv);
  assert.ok(body.argv.includes("--json"), body.argv);
  assert.ok(!body.argv.includes("--wait"), body.argv);
  const blob = JSON.stringify(body);
  assert.doesNotMatch(blob, /test-bg/);
});

test("apex_bump_cache_check argv never contains --apply", () => {
  const r = callCli("apex_bump_cache_check", { dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.ok(body.argv.includes("--check"), body.argv);
  assert.ok(body.argv.includes("--json"), body.argv);
  assert.ok(!body.argv.includes("--apply"), body.argv);
  assert.ok(!body.argv.includes("--at"), body.argv);
  assert.ok(!body.argv.includes("--merge"), body.argv);
});

test("apex_pick_tests argv never contains --bg; includes --json", () => {
  const r = callCli("apex_pick_tests", { dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.ok(body.argv.includes("--json"), body.argv);
  assert.ok(!body.argv.includes("--bg"), body.argv);
});

test("target=deploy on a tree tool → tree_only", () => {
  const r = callCli("apex_pick_tests", { target: "deploy" });
  assert.equal(r.status, 1, r.stderr); // structured refuse → CLI exit 1
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error, "tree_only");
  assert.ok(body.fix);
});

test("url with github.io → github_io_blocked (no fetch)", () => {
  const r = callCli("apex_pick_tests", {
    url: "https://brycejmurrin.github.io/f1-game/",
  });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error, "github_io_blocked");
  assert.match(body.fix || "", /deploy-research/i);
  assert.doesNotMatch(body.fix || "", /tinyfish-mcp\.sh/, "the in-repo tinyfish wrapper is not the route any more");
});

test("tools/call preserves isError on tool failure (not JSON-RPC error)", () => {
  const out = rpc([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "t", version: "1" },
      },
    },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "apex_pick_tests",
        arguments: { target: "deploy" },
      },
    },
  ]);
  const failed = out[1];
  assert.equal(failed.error, undefined);
  assert.equal(failed.result.isError, true);
  const text = JSON.parse(failed.result.content[0].text);
  assert.equal(text.ok, false);
  assert.equal(text.error, "tree_only");
});

test("serve stdout is JSON-RPC only (no log lines)", () => {
  const r = spawnSync(process.execPath, [MCP, "serve"], {
    encoding: "utf8",
    input:
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "t", version: "1" },
        },
      }) + "\n",
    env: { ...process.env, APEX_MCP_MOCK: "1" },
    cwd: ROOT,
    timeout: 10000,
  });
  assert.equal(r.status, 0, r.stderr);
  for (const line of r.stdout.split("\n").filter(Boolean)) {
    assert.doesNotThrow(() => JSON.parse(line), `non-JSON stdout: ${line.slice(0, 120)}`);
  }
});

const LOCK = path.join(ROOT, "scratch", "apex-browser.lock");
const TEST_BG = path.join(ROOT, "artifacts", "logs", "test-bg.json");

test("playwright occupancy matches `playwright test` tokens, not MCP JSON", async () => {
  const { classifyPlaywrightLine, scanPlaywrightLines } = await import("../../tools/ci/playwright-occupancy.mjs");
  assert.equal(
    classifyPlaywrightLine("4321 /usr/bin/npx playwright test --reporter=line")?.kind,
    "suite",
  );
  assert.equal(
    classifyPlaywrightLine('12 /exec-daemon/cursor-exec-daemon --mcp-config {"playwright":{"command":"npx","args":["@playwright/mcp@latest"]}}'),
    null,
    "Cursor --mcp-config JSON is not a live Playwright process",
  );
  assert.equal(
    classifyPlaywrightLine("88 node /opt/cursor/node_modules/@playwright/mcp/cli.js --headless")?.kind,
    "hostMcp",
  );
  assert.equal(
    classifyPlaywrightLine("99 /opt/google/chrome/chrome --user-data-dir=/workspace/.playwright-mcp --headless")?.kind,
    "hostBrowser",
  );
  const scan = scanPlaywrightLines([
    "1 /exec-daemon/cursor-exec-daemon --mcp-config {\"playwright\":{}}",
    "2 node /x/@playwright/mcp/cli.js",
  ].join("\n"));
  assert.equal(scan.live, true);
  assert.equal(scan.hostMcp, true);
  assert.equal(scan.suite, false);
  assert.deepEqual(scan.pids, [2]);
});

test("browser tool target=deploy → local_only", () => {
  const r = callCli("apex_eval", { track: "monza", expr: "a.info()", target: "deploy", dryRun: true });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.error, "local_only");
});

test("browser tool github.io url → github_io_blocked (no fetch)", () => {
  const r = callCli("apex_shot", {
    track: "monza",
    url: "https://brycejmurrin.github.io/f1-game/",
    dryRun: true,
  });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.error, "github_io_blocked");
});

test("apex_select_specs dryRun pins --since --json, never --bg", () => {
  const r = callCli("apex_select_specs", { dryRun: true, since: "HEAD~1" });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.ok(body.argv.includes("--since"), body.argv);
  assert.ok(body.argv.includes("HEAD~1"), body.argv);
  assert.ok(body.argv.includes("--json"), body.argv);
  assert.ok(!body.argv.includes("--bg"), body.argv);
});

test("apex_select_specs without since → bad_args", () => {
  const r = callCli("apex_select_specs", { dryRun: true });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.error, "bad_args");
});

test("apex_shot out outside artifacts/scratch → path_escaped", () => {
  const r = callCli("apex_shot", { dryRun: true, track: "monza", out: "/tmp/apex-shot.png" });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.error, "path_escaped");
});

test("tree pins: rotate-markings --check only, graph-parity needs base", () => {
  const rot = callCli("apex_rotate_markings_check", { dryRun: true });
  assert.equal(rot.status, 0, rot.stderr);
  const rotBody = JSON.parse(rot.stdout);
  assert.ok(rotBody.argv.includes("--check"), rotBody.argv);
  assert.ok(!rotBody.argv.includes("--write"), rotBody.argv);

  const gp = callCli("apex_graph_parity", { dryRun: true, base: "HEAD~1", id: "monza" });
  assert.equal(gp.status, 0, gp.stderr);
  const gpBody = JSON.parse(gp.stdout);
  assert.match(gpBody.argv.join(" "), /graph-parity\.cjs/);
  assert.equal(gpBody.env.BASE, "HEAD~1");
  assert.ok(gpBody.argv.includes("monza"), gpBody.argv);

  const gpMiss = callCli("apex_graph_parity", { dryRun: true, id: "monza" });
  assert.equal(gpMiss.status, 1, gpMiss.stderr);
  assert.equal(JSON.parse(gpMiss.stdout).error, "bad_args");

  // A trimmed wrap must be refused as unknown, not silently routed to a CLI.
  const gone = callCli("apex_verify_track", { dryRun: true, id: "monza" });
  assert.equal(gone.status, 1);
  assert.equal(JSON.parse(gone.stdout).error, "unknown_tool");
});

test("committed catalog JSON matches tools/list and never binds 0.0.0.0", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/apex-tools-mcp.json"), "utf8"));
  const r = spawnSync(process.execPath, [MCP, "list-tools"], { encoding: "utf8", cwd: ROOT });
  assert.equal(r.status, 0, r.stderr);
  const names = JSON.parse(r.stdout).map((t) => t.name);
  assert.deepEqual(names, catalog.tools);
  const src = fs.readFileSync(MCP, "utf8");
  assert.match(src, /127\.0\.0\.1/);
  assert.doesNotMatch(src, /listen\([^)]*0\.0\.0\.0/);
  assert.match(src, /serve-http/);
});

test("serve-http /healthz and /mcp stay on loopback", async () => {
  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, [MCP, "serve-http"], {
    env: { ...process.env, APEX_MCP_HTTP_PORT: "0", APEX_MCP_MOCK: "1" },
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const port = await new Promise((resolve, reject) => {
    let err = "";
    const t = setTimeout(() => reject(new Error(`no listen: ${err}`)), 5000);
    child.stderr.on("data", (chunk) => {
      err += chunk;
      const m = err.match(/apex-tools-mcp http 127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(t);
        resolve(Number(m[1]));
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`serve-http exited ${code}: ${err}`)));
  });
  try {
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.ok, true);
    assert.equal(body.bind, "127.0.0.1");
    const rpc = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });
    assert.equal(rpc.status, 200);
    const listed = await rpc.json();
    const names = (listed.result.tools || []).map((t) => t.name);
    assert.ok(names.includes("apex_graph_parity"), names);
    assert.ok(names.every((n) => n.startsWith("apex_")));
  } finally {
    child.kill();
  }
});

test("apex_verify_change_fast classifies --fast partial (exit 2) as ok", () => {
  const src = fs.readFileSync(MCP, "utf8");
  assert.match(
    src,
    /name === "apex_verify_change_fast" \? new Set\(\[0, 2\]\)/,
    "partial is the success outcome of --fast when browser groups remain",
  );
});

test("browser tool loopback url → url_not_supported in v1", () => {
  const r = callCli("apex_eval", {
    track: "monza",
    url: "http://127.0.0.1:3456/",
    dryRun: true,
  });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.error, "url_not_supported");
});

describe("occupancy", { concurrency: 1 }, () => {
test("tree tools do not take or refuse the browser lock", () => {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, tool: "test", since: Date.now() }));
  try {
    const r = callCli("apex_rotate_markings_check", { dryRun: true });
    assert.equal(r.status, 0, r.stderr);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
  } finally {
    try { fs.unlinkSync(LOCK); } catch { /* ignore */ }
  }
});

test("week-1 tools do not take or refuse the browser lock", () => {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, tool: "test", since: Date.now() }));
  try {
    const r = callCli("apex_pick_tests", { dryRun: true });
    assert.equal(r.status, 0, r.stderr);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
  } finally {
    try { fs.unlinkSync(LOCK); } catch { /* ignore */ }
  }
});

test("week-2 dryRun refuses lock_held by a live PID (no Chromium)", () => {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, tool: "test", since: Date.now() }));
  try {
    const r = callCli("apex_eval", { track: "monza", expr: "1", dryRun: true }, { APEX_MCP_MOCK: "0", APEX_MCP_PS: "" });
    assert.equal(r.status, 1, r.stderr);
    const body = JSON.parse(r.stdout);
    assert.equal(body.error, "lock_held");
    assert.ok(body.fix);
  } finally {
    try { fs.unlinkSync(LOCK); } catch { /* ignore */ }
  }
});

test("week-2 dryRun steals a stale lock (dead PID)", () => {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: 999999999, tool: "dead", since: 1 }));
  try {
    const r = callCli("apex_eval", { track: "monza", expr: "1", dryRun: true }, { APEX_MCP_MOCK: "0", APEX_MCP_PS: "" });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
    assert.ok(!fs.existsSync(LOCK), "stale lock must be reaped");
  } finally {
    try { fs.unlinkSync(LOCK); } catch { /* ignore */ }
  }
});

test("week-2 dryRun refuses playwright_live from test-bg.json (no Chromium)", () => {
  fs.mkdirSync(path.dirname(TEST_BG), { recursive: true });
  let prev = null;
  if (fs.existsSync(TEST_BG)) prev = fs.readFileSync(TEST_BG, "utf8");
  fs.writeFileSync(TEST_BG, JSON.stringify({ mode: "test", runs: [{ pid: process.pid, group: "tiny" }] }));
  try {
    const r = callCli("apex_shot", { track: "monza", dryRun: true }, { APEX_MCP_MOCK: "0", APEX_MCP_PS: "" });
    assert.equal(r.status, 1, r.stderr);
    const body = JSON.parse(r.stdout);
    assert.equal(body.error, "playwright_live");
  } finally {
    if (prev == null) {
      try { fs.unlinkSync(TEST_BG); } catch { /* ignore */ }
    } else {
      fs.writeFileSync(TEST_BG, prev);
    }
  }
});

test("week-2 dryRun refuses host Playwright MCP from APEX_MCP_PS", () => {
  const r = callCli(
    "apex_eval",
    { track: "monza", expr: "1", dryRun: true },
    { APEX_MCP_MOCK: "0", APEX_MCP_PS: "88 node /opt/cursor/node_modules/@playwright/mcp/cli.js --headless\n" },
  );
  assert.equal(r.status, 1, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.error, "playwright_live");
  assert.match(body.message, /Playwright MCP/);
});

test("a live Node-only test-bg group does not impersonate Playwright", () => {
  fs.mkdirSync(path.dirname(TEST_BG), { recursive: true });
  let prev = null;
  if (fs.existsSync(TEST_BG)) prev = fs.readFileSync(TEST_BG, "utf8");
  fs.writeFileSync(TEST_BG, JSON.stringify({
    mode: "sequential",
    runs: [{ pid: process.pid, group: "tooling-fast", browser: false }],
  }));
  try {
    const r = callCli("apex_shot", { track: "monza", dryRun: true }, {
      APEX_MCP_MOCK: "0",
      APEX_MCP_PS: "1 bash\n",
    });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(JSON.parse(r.stdout).ok, true);
  } finally {
    if (prev == null) {
      try { fs.unlinkSync(TEST_BG); } catch { /* ignore */ }
    } else {
      fs.writeFileSync(TEST_BG, prev);
    }
  }
});

test("week-2 dryRun refuses chrome_daemon_up when /healthz answers", async () => {
  // Server MUST be a sibling process. spawnSync(MCP) blocks this event loop,
  // so an in-process http.Server cannot answer the occupancy probe.
  const { spawn } = await import("node:child_process");
  const child = spawn(
    process.execPath,
    [
      "-e",
      `require("http").createServer((req,res)=>{if(req.url==="/healthz"){res.writeHead(200);res.end("ok")}else{res.writeHead(404);res.end()}}).listen(0,"127.0.0.1",function(){process.stdout.write(String(this.address().port))})`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const port = await new Promise((resolve, reject) => {
    let buf = "";
    const t = setTimeout(() => reject(new Error(`no port: ${buf}`)), 5000);
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      if (/^\d+$/.test(buf.trim())) {
        clearTimeout(t);
        resolve(Number(buf.trim()));
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`healthz child exited ${code}`)));
  });
  try {
    const r = callCli(
      "apex_eval",
      { track: "monza", expr: "1", dryRun: true },
      { APEX_MCP_MOCK: "0", APEX_MCP_PS: "", PROBE_CHROME_PORT: String(port) },
    );
    assert.equal(r.status, 1, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.error, "chrome_daemon_up");
  } finally {
    child.kill();
  }
});
});
