// probe-mcp.test.mjs — unified Chrome DevTools + TinyFish MCP bridge.
// Does NOT launch Chromium or hit TinyFish (CI-safe). Live probes stay in
// tools/probe-mcp.py list-tools / call when an agent needs them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROBE = path.join(ROOT, "tools/probe-mcp.py");
const MCP_JSON = path.join(ROOT, ".mcp.json");

test("probe-mcp.py exists and is executable-ish", () => {
  assert.ok(fs.existsSync(PROBE));
  const src = fs.readFileSync(PROBE, "utf8");
  assert.match(src, /chrome_/);
  assert.match(src, /tinyfish_/);
  assert.match(src, /def serve|cmd_serve|"serve"/);
  assert.match(src, /chrome-devtools-mcp\.sh|cdmcp/);
  assert.match(src, /tinyfish-mcp\.sh/);
});

test(".mcp.json registers probe as the unified stdio bridge", () => {
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), [
    "chrome-devtools",
    "probe",
    "tinyfish",
  ]);
  assert.equal(cfg.mcpServers.probe.command, "python3");
  assert.deepEqual(cfg.mcpServers.probe.args, ["tools/probe-mcp.py", "serve"]);
  assert.equal(cfg.mcpServers.tinyfish.url, "http://127.0.0.1:3711/mcp");
  assert.match(cfg.mcpServers["chrome-devtools"].command, /chrome-devtools-mcp\.sh$/);
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
  const r = spawnSync("python3", [PROBE, "serve"], {
    encoding: "utf8",
    input: `${init}\n${tools}\n`,
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
});

test("mcp-wrap.py compat shim forwards to probe-mcp serve", () => {
  const wrap = path.join(ROOT, "tools/mcp-wrap.py");
  assert.ok(fs.existsSync(wrap));
  const src = fs.readFileSync(wrap, "utf8");
  assert.match(src, /probe-mcp\.py/);
  const env = { ...process.env, PROBE_MCP_MOCK: "1" };
  const init = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "wrap-test", version: "1" },
    },
  });
  const tools = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  const r = spawnSync("python3", [wrap, "serve"], {
    encoding: "utf8",
    input: `${init}\n${tools}\n`,
    env,
    timeout: 15000,
  });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const hi = JSON.parse(lines[0]);
  assert.equal(hi.result.serverInfo.name, "probe-mcp");
  const listed = JSON.parse(lines[1]);
  const names = (listed.result.tools || []).map((t) => t.name);
  assert.ok(names.includes("chrome_navigate_page"));
  assert.ok(names.includes("tinyfish_fetch_content"));
});
