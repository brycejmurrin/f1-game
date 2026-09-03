// probe-mcp.test.mjs — unified Chrome DevTools + TinyFish bridge, CLI ONLY.
// Not MCP-attached since 2026-09 (.mcp.json is apex-tools / playwright-official
// / chrome-devtools). Does NOT launch Chromium or hit TinyFish (CI-safe). The
// chrome-start daemon + call auto-routing is why the CLI stays. Runs in
// `npm run test:mcp`; the mcp-cli / gfx-probe / Chrome-flag assertions are in
// tests/unit/mcp-cli.test.mjs on the fast gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROBE = path.join(ROOT, "tools/probe-mcp.py");
const MCP_JSON = path.join(ROOT, ".mcp.json");

test("probe-mcp.py exists and says it is a CLI, not an attached server", () => {
  assert.ok(fs.existsSync(PROBE));
  const src = fs.readFileSync(PROBE, "utf8");
  assert.match(src, /NOT MCP-ATTACHED/);
  assert.match(src, /chrome_/);
  assert.match(src, /tinyfish_/);
  assert.match(src, /def serve|cmd_serve|"serve"/);
  assert.match(src, /chrome-devtools-mcp\.sh|cdmcp/);
  assert.match(src, /tinyfish-mcp\.sh/);
});

test(".mcp.json does NOT register probe — chrome-devtools is the attached Chrome MCP", () => {
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), [
    "apex-tools",
    "chrome-devtools",
    "playwright-official",
  ]);
  assert.equal(cfg.mcpServers.probe, undefined);
  assert.equal(cfg.mcpServers.tinyfish, undefined);
  assert.equal(cfg.mcpServers["chrome-devtools"].command, "bash");
  assert.deepEqual(cfg.mcpServers["chrome-devtools"].args, ["tools/chrome-devtools-mcp.sh", "run"]);
  assert.equal(cfg.mcpServers["apex-tools"].command, "bash");
  assert.deepEqual(cfg.mcpServers["apex-tools"].args, ["tools/apex-tools-mcp.sh", "serve"]);
  // The daemon flow is the reason the CLI survives the catalog trim.
  const help = spawnSync("python3", [PROBE, "help"], { encoding: "utf8" });
  assert.match(help.stdout, /chrome-start/);
  assert.match(help.stdout, /not in \.mcp\.json/);
});

test("probe-mcp status stays usable when tinyfish is down", () => {
  const src = fs.readFileSync(PROBE, "utf8");
  assert.match(src, /tinyfish DOWN/);
  assert.match(src, /return 0 if r\.returncode == 0 else 1/);
  const r = spawnSync("python3", [PROBE, "status"], {
    encoding: "utf8",
    cwd: ROOT,
    timeout: 20000,
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /=== chrome-devtools ===/);
  assert.match(r.stdout, /=== tinyfish ===/);
});

test("probe-mcp help lists serve / list-tools / call / status", () => {
  const r = spawnSync("python3", [PROBE, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /serve/);
  assert.match(r.stdout, /list-tools/);
  assert.match(r.stdout, /call/);
  assert.match(r.stdout, /status/);
  assert.match(r.stdout, /chrome_/);
  assert.match(r.stdout, /tinyfish_/);
});

test("probe-mcp route resolves chrome_ and tinyfish_ prefixes", () => {
  const r = spawnSync("python3", [PROBE, "route", "chrome_navigate_page"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /backend=chrome/);
  assert.match(r.stdout, /tool=navigate_page/);

  const t = spawnSync("python3", [PROBE, "route", "tinyfish_fetch_content"], {
    encoding: "utf8",
  });
  assert.equal(t.status, 0, t.stderr);
  assert.match(t.stdout, /backend=tinyfish/);
  assert.match(t.stdout, /tool=fetch_content/);
});

test("probe-mcp route rejects unprefixed tool names", () => {
  const r = spawnSync("python3", [PROBE, "route", "navigate_page"], {
    encoding: "utf8",
  });
  assert.notEqual(r.status, 0);
  assert.match(`${r.stdout}\n${r.stderr}`, /chrome_|tinyfish_/);
});

test("probe-mcp serve handshake (mock) advertises prefixed tools", () => {
  const env = { ...process.env, PROBE_MCP_MOCK: "1" };
  const init = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "probe-test", version: "1" },
    },
  });
  const tools = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  const failedCall = JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "chrome_list_pages",
      arguments: { __probeMockError: true },
    },
  });
  const r = spawnSync("python3", [PROBE, "serve"], {
    encoding: "utf8",
    input: `${init}\n${tools}\n${failedCall}\n`,
    env,
    timeout: 15000,
  });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  assert.ok(lines.length >= 2, `expected ≥2 JSON lines, got ${lines.length}: ${r.stdout.slice(0, 400)}`);
  const hi = JSON.parse(lines[0]);
  assert.equal(hi.result.serverInfo.name, "probe-mcp");
  assert.ok(hi.result.capabilities.tools);
  const listed = JSON.parse(lines[1]);
  const names = (listed.result.tools || []).map((t) => t.name);
  assert.ok(names.includes("chrome_navigate_page"), names.slice(0, 10));
  assert.ok(names.includes("chrome_evaluate_script"), names);
  assert.ok(names.includes("tinyfish_fetch_content"), names);
  assert.ok(names.includes("tinyfish_search"), names);
  assert.ok(names.length >= 50, `expected full catalog, got ${names.length}`);
  const failed = JSON.parse(lines[2]);
  assert.equal(failed.result.isError, true,
    "stdio MCP must preserve tool-level isError instead of inventing a JSON-RPC error");
  assert.equal(failed.error, undefined);
});

test("chrome daemon (mock): healthz, /call routing, CLI auto-route to a live daemon", async () => {
  // A bare `probe-mcp.py call` spawns a fresh Chromium per invocation, so page
  // state never survives between calls (measured 2026-08-17: navigate_page in
  // one call, list_pages in the next reads about:blank). The daemon is the fix
  // — this proves the wiring without launching a real browser.
  const { spawn } = await import("node:child_process");
  const env = { ...process.env, PROBE_MCP_MOCK: "1" };
  const daemon = spawn("python3", [PROBE, "chrome-daemon", "--port", "0"], {
    env,
    cwd: ROOT,
  });
  const port = await new Promise((resolve, reject) => {
    let buf = "";
    const t = setTimeout(
      () => reject(new Error(`daemon never printed its port: ${buf}`)),
      15000,
    );
    daemon.stdout.on("data", (chunk) => {
      buf += chunk;
      const m = buf.match(/listening on 127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(t);
        resolve(Number(m[1]));
      }
    });
    daemon.on("exit", (code) => reject(new Error(`daemon exited ${code}: ${buf}`)));
  });
  try {
    const hz = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json();
    assert.equal(hz.ok, true);
    assert.equal(hz.mock, true);

    const tools = await (await fetch(`http://127.0.0.1:${port}/tools`)).json();
    const toolNames = (tools.tools || []).map((t2) => t2.name);
    assert.ok(toolNames.includes("navigate_page"), toolNames.slice(0, 5));

    const res = await (
      await fetch(`http://127.0.0.1:${port}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "chrome_navigate_page", // prefixed name must be accepted too
          arguments: { url: "about:blank" },
        }),
      })
    ).json();
    assert.match(res.content[0].text, /"mock": true/);

    const failedResponse = await fetch(`http://127.0.0.1:${port}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "chrome_list_pages",
        arguments: { __probeMockError: true },
      }),
    });
    assert.equal(failedResponse.status, 200,
      "an MCP tool error is a successful transport response, not an HTTP failure");
    const failedResult = await failedResponse.json();
    assert.equal(failedResult.isError, true);

    // The CLI — NOT in mock mode — must prefer the live daemon over spawning
    // its own Chromium (which would hang this test for a browser launch).
    const cli = spawnSync("python3", [PROBE, "call", "chrome_list_pages", "{}"], {
      encoding: "utf8",
      cwd: ROOT,
      env: { ...process.env, PROBE_CHROME_PORT: String(port), PROBE_MCP_MOCK: "" },
      timeout: 20000,
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stderr, /via daemon/);
    assert.match(cli.stdout, /mock/);

    const failedCli = spawnSync(
      "python3",
      [PROBE, "call", "chrome_list_pages", '{"__probeMockError":true}'],
      {
        encoding: "utf8",
        cwd: ROOT,
        env: { ...process.env, PROBE_CHROME_PORT: String(port), PROBE_MCP_MOCK: "" },
        timeout: 20000,
      },
    );
    assert.notEqual(failedCli.status, 0, "shell CLI must fail when MCP returns isError");
    assert.match(failedCli.stdout, /"isError": true/);
  } finally {
    daemon.kill("SIGKILL");
  }
});

test("tools/list without mock does not spawn backends (Cursor discovery)", () => {
  // Live ensure() used to start Chromium + tinyfish ensure during tools/list.
  // Cursor then marked project-0-f1-game-probe as error and cached 0 tools.
  const env = { ...process.env };
  delete env.PROBE_MCP_MOCK;
  delete env.PROBE_MCP_FAIL_BACKENDS;
  const init = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const tools = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const r = spawnSync("python3", [PROBE, "serve"], {
    encoding: "utf8",
    input: `${init}\n${tools}\n`,
    env,
    timeout: 4000,
  });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const listed = JSON.parse(lines[1]);
  const names = (listed.result.tools || []).map((t) => t.name);
  assert.ok(names.includes("chrome_navigate_page"), names.slice(0, 8));
  assert.ok(names.includes("tinyfish_fetch_content"), names.slice(0, 8));
  assert.ok(names.length >= 50, `static catalog too small: ${names.length}`);
});

test("tools/list still advertises both catalogs when a backend ensure() throws", () => {
  // The cloud host (apex-wrap) lists tools ONCE. A throw from tinyfish.ensure()
  // used to empty the whole catalog for the session. FAIL_BACKENDS forces that
  // path; the static fallback must still name chrome_* and tinyfish_*.
  const env = { ...process.env, PROBE_MCP_FAIL_BACKENDS: "1" };
  const init = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const tools = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const r = spawnSync("python3", [PROBE, "serve"], {
    encoding: "utf8",
    input: `${init}\n${tools}\n`,
    env,
    timeout: 15000,
  });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const listed = JSON.parse(lines[1]);
  const names = (listed.result.tools || []).map((t) => t.name);
  assert.ok(names.includes("chrome_navigate_page"), names.slice(0, 8));
  assert.ok(names.includes("tinyfish_fetch_content"), names.slice(0, 8));
  assert.ok(names.length >= 50, `fallback catalog too small: ${names.length}`);
});

test("probe-mcp help documents the persistent daemon commands", () => {
  const r = spawnSync("python3", [PROBE, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /chrome-start/);
  assert.match(r.stdout, /chrome-stop/);
  assert.match(r.stdout, /test-bg\.mjs|Playwright/);
});

