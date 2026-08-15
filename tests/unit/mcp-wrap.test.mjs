// mcp-wrap.test.mjs — guards the official apex-probes MCP server
// (chrome-devtools + tinyfish wrap: tools, resources, prompts, stdio).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");
const WRAP = path.join(ROOT, "tools/mcp-wrap.py");
const MCP_JSON = path.join(ROOT, ".mcp.json");
const REQ = path.join(ROOT, "tools/requirements-mcp.txt");

test("mcp-wrap.py is an official MCP Server with tools, resources, prompts", () => {
  const py = readFileSync(WRAP, "utf8");
  assert.match(py, /from mcp\.server\.lowlevel\.server import Server/);
  assert.match(py, /def build_server/);
  assert.match(py, /on_list_tools=/);
  assert.match(py, /on_list_resources=/);
  assert.match(py, /on_list_prompts=/);
  assert.match(py, /on_ping=/);
  assert.match(py, /streamable_http_app/);
  assert.match(py, /CHROME_PREFIX/);
  assert.match(py, /TINYFISH_PREFIX/);
  assert.match(py, /apex:\/\/status/);
  assert.match(py, /apex:\/\/deploy\/version/);
});

test("tools/requirements-mcp.txt pins the official SDK", () => {
  const req = readFileSync(REQ, "utf8");
  assert.match(req, /^mcp>=/m);
});

test(".mcp.json keeps chrome-devtools + tinyfish and adds apex-wrap", () => {
  const cfg = JSON.parse(readFileSync(MCP_JSON, "utf8"));
  assert.deepEqual(cfg.mcpServers.tinyfish, {
    url: "http://127.0.0.1:3711/mcp",
  });
  assert.deepEqual(cfg.mcpServers["chrome-devtools"], {
    command: "tools/chrome-devtools-mcp.sh",
    args: ["run"],
  });
  assert.match(cfg.mcpServers["apex-wrap"].command, /python/);
  assert.deepEqual(cfg.mcpServers["apex-wrap"].args, [
    "tools/mcp-wrap.py",
    "serve",
  ]);
});

test("stdio initialize advertises tools, resources, and prompts", () => {
  const init = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "mcp-wrap-test", version: "1" },
    },
  });
  const r = spawnSync("python3", [WRAP, "serve"], {
    cwd: ROOT,
    input: `${init}\n`,
    encoding: "utf8",
    timeout: 30_000,
  });
  const line = (r.stdout || "").split("\n").find((l) => l.startsWith("{"));
  assert.ok(line, `no JSON on stdout: ${r.stderr?.slice(0, 400)}`);
  const msg = JSON.parse(line);
  const caps = msg.result?.capabilities || {};
  assert.equal(msg.result?.serverInfo?.name, "apex-probes");
  assert.ok(caps.tools, "tools capability missing");
  assert.ok(caps.resources, "resources capability missing");
  assert.ok(caps.prompts, "prompts capability missing");
  assert.match(msg.result?.instructions || "", /tinyfish_fetch_content/);
});

test("mcp-wrap list-tools exits 0 and reports chrome + tinyfish prefixes", () => {
  const out = execFileSync("python3", [WRAP, "list-tools"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.match(out, /tools: \d+ \(chrome \d+, tinyfish \d+\)/);
  assert.match(out, /chrome_navigate_page/);
  assert.match(out, /tinyfish_fetch_content/);
});
