// mcp-wrap.test.mjs — guards the official apex-wrap MCP server.
//
// NOTHING HERE SKIPS. Two of these tests used to be gated behind APEX_MCP_LIVE=1
// because they appeared to need a real Chromium and a keyed tinyfish account, so
// they never ran anywhere — a green suite that had checked neither. They run for
// real now, by removing the dependency rather than the assertion:
//
//   * `stdio initialize` needs only the Python MCP SDK — no browser, no network.
//     CI installs tools/requirements-mcp.txt so it executes on every push.
//   * `list-tools` runs against a STUB tinyfish endpoint (TINYFISH_MCP_BASE) with
//     Chromium switched off (APEX_MCP_BACKENDS), so the prefixing, the counting
//     and the degrade-don't-crash path are all exercised in milliseconds.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const ROOT = path.resolve(import.meta.dirname, "../..");
const WRAP = path.join(ROOT, "tools/mcp-wrap.py");
const MCP_JSON = path.join(ROOT, ".mcp.json");
const REQ = path.join(ROOT, "tools/requirements-mcp.txt");
const execFileAsync = promisify(execFile);

/**
 * A minimal Streamable-HTTP MCP endpoint standing in for the tinyfish proxy:
 * /healthz, then initialize → notifications/initialized → tools/list, which is
 * exactly the handshake TinyfishBackend.ensure() performs.
 */
async function stubTinyfish(toolNames) {
  const server = createServer((req, res) => {
    if (req.url === "/healthz") return res.writeHead(200).end("ok");
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const msg = JSON.parse(body || "{}");
      if (msg.id === undefined) return res.writeHead(202).end(""); // notification
      const result =
        msg.method === "tools/list"
          ? { tools: toolNames.map((name) => ({ name, description: name })) }
          : { protocolVersion: "2025-06-18", serverInfo: { name: "stub" } };
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Mcp-Session-Id": "stub-session",
      });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
    });
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((ok) => server.close(ok)),
  };
}

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
  assert.match(py, /pip install -r tools\/requirements-mcp.txt/);
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

test("serve --help documents stdio and Streamable HTTP", () => {
  const r = spawnSync("python3", [WRAP, "serve", "--help"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /--http/);
});

// Needs the Python MCP SDK and nothing else — see the CI "MCP Python SDK" step.
// If this fails locally with an install hint, that hint IS the fix.
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
    env: { ...process.env, APEX_MCP_BACKENDS: "" },
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

// The prefixing and the count line are the whole wire contract of list-tools, and
// a stub upstream proves them as well as a real one. Chromium is switched OFF here
// on purpose: `chrome 0` alongside a served tinyfish IS the degradation guarantee —
// an unreachable upstream must cost its own tools and nothing else.
test("list-tools prefixes each upstream and reports the per-backend split", async () => {
  const tf = await stubTinyfish(["fetch_content", "search"]);
  try {
    const { stdout } = await execFileAsync("python3", [WRAP, "list-tools"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 60_000,
      env: {
        ...process.env,
        APEX_MCP_BACKENDS: "tinyfish",
        TINYFISH_MCP_BASE: tf.base,
      },
    });
    assert.match(stdout, /^tools: 2 \(chrome 0, tinyfish 2\)$/m);
    assert.match(stdout, /^ {2}- tinyfish_fetch_content$/m);
    assert.match(stdout, /^ {2}- tinyfish_search$/m);
    assert.ok(!/chrome_/.test(stdout), "a backend that is off contributes no tools");
  } finally {
    await tf.close();
  }
});
