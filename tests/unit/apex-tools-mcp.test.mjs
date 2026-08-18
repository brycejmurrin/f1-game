// apex-tools-mcp.test.mjs — week-1 apex-tools MCP (local CLI wrap).
// APEX_MCP_MOCK=1 / dryRun only — no Chromium, no network.
import { test } from "node:test";
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

test(".mcp.json registers apex-tools as the fourth stdio server", () => {
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), [
    "apex-tools",
    "chrome-devtools",
    "probe",
    "tinyfish",
  ]);
  assert.match(cfg.mcpServers["apex-tools"].command, /apex-tools-mcp\.sh$/);
  assert.deepEqual(cfg.mcpServers["apex-tools"].args, ["serve"]);
});

test("help lists serve / list-tools / call / status", () => {
  const r = spawnSync(process.execPath, [MCP, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /serve/);
  assert.match(r.stdout, /list-tools/);
  assert.match(r.stdout, /call/);
  assert.match(r.stdout, /status/);
  assert.match(r.stdout, /apex_/);
});

test("shell help exits 0", () => {
  const r = spawnSync("bash", [SH, "help"], { encoding: "utf8", cwd: ROOT });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /apex_/);
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
  assert.ok(names.length >= 6, names);
  for (const n of names) {
    assert.match(n, /^apex_/);
    assert.doesNotMatch(n, /^chrome_/);
    assert.doesNotMatch(n, /^tinyfish_/);
  }
  for (const need of [
    "apex_verify_track",
    "apex_verify_change_fast",
    "apex_wgx_validate_static",
    "apex_pick_tests",
    "apex_bump_cache_check",
    "apex_status",
  ]) {
    assert.ok(names.includes(need), `missing ${need} in ${names}`);
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
  const r = callCli("apex_verify_track", { id: "monza", target: "deploy" });
  assert.equal(r.status, 1, r.stderr); // structured refuse → CLI exit 1
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error, "tree_only");
  assert.ok(body.fix);
});

test("url with github.io → github_io_blocked (no fetch)", () => {
  const r = callCli("apex_verify_track", {
    id: "monza",
    url: "https://brycejmurrin.github.io/f1-game/",
  });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error, "github_io_blocked");
  assert.match(body.fix || "", /tinyfish|deploy-research/i);
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
        name: "apex_verify_track",
        arguments: { target: "deploy", id: "monza" },
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
