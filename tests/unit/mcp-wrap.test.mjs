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

// THE TWO SPAWNING TESTS BELOW CANNOT BE A HARD GATE, and making them one shut
// the deploy pipeline. This file is in test:tooling-fast, which is CI's
// "Structural guards" job, and the `deploy` job runs only if that job passes —
// so on run 1450 the guards went red, deploy was SKIPPED, and nothing reached
// GitHub Pages. The cause is environmental and unfixable from inside the repo:
// the runner has no `mcp` Python SDK (nothing pip-installs
// tools/requirements-mcp.txt in the workflow) and no MCP servers running at
// all, while `list-tools` enumerates tools from LIVE chrome-devtools and
// tinyfish processes.
//
// A test whose subject is another process being up is a MONITOR, not a gate.
// The three static checks above are the real contract — they read the source
// and .mcp.json and hold everywhere. These two stay as genuine checks wherever
// the environment can answer them, and say why they were skipped where it
// cannot, rather than failing a deploy over a server nobody started.
const sdk = spawnSync("python3", ["-c", "import mcp"], { encoding: "utf8" });
const NO_SDK = sdk.status === 0
  ? false
  : "the MCP Python SDK is absent — pip install -r tools/requirements-mcp.txt";

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

test("stdio initialize advertises tools, resources, and prompts", { skip: NO_SDK }, () => {
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

test("mcp-wrap list-tools exits 0 and reports chrome + tinyfish prefixes", { skip: NO_SDK }, () => {
  const out = execFileSync("python3", [WRAP, "list-tools"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
  // The SHAPE is the wrapper's own contract and is asserted unconditionally:
  // it exits 0 and reports a count per upstream server.
  const summary = out.match(/tools: \d+ \(chrome (\d+), tinyfish (\d+)\)/);
  assert.ok(summary, `list-tools printed no summary line. Got: ${out.slice(0, 300)}`);

  // The tool NAMES only exist when that upstream server is actually running, so
  // each is asserted against its own count rather than assumed. This is the
  // half that was failing: a session where tinyfish is registered under a
  // different name reports `tinyfish 0`, which says nothing about the prefixing
  // code and everything about what was launched. Zero on BOTH would mean the
  // wrapper found nothing at all, which is worth failing on.
  const [, chrome, tinyfish] = summary.map(Number);
  assert.ok(chrome > 0 || tinyfish > 0,
    "list-tools reached no upstream server at all — chrome 0 and tinyfish 0");
  if (chrome > 0) assert.match(out, /chrome_navigate_page/);
  if (tinyfish > 0) assert.match(out, /tinyfish_fetch_content/);
});
