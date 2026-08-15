// mcp-wrap.test.mjs — guards the official apex-wrap MCP server.
// Does NOT launch Chromium, tinyfish, or require the Python MCP SDK
// (CI has none of those; cdmcp-measure.test.mjs is the same contract).
// Live serve/list-tools: APEX_MCP_LIVE=1.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");
const WRAP = path.join(ROOT, "tools/mcp-wrap.py");
const MCP_JSON = path.join(ROOT, ".mcp.json");
const REQ = path.join(ROOT, "tools/requirements-mcp.txt");
const LIVE = process.env.APEX_MCP_LIVE === "1";

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

// TWO DIFFERENT REQUIREMENTS, TWO DIFFERENT GATES. The flag above collapsed
// both onto one opt-in, which skipped the stdio test on a box that could have
// run it. `serve` needs ONLY the Python MCP SDK — no browser, no tinyfish — and
// ci.yml's guards job now installs it (setup-python + requirements-mcp.txt), so
// detect the SDK and run the test wherever it is importable rather than hiding
// it behind a flag nobody sets. `list-tools` is the one that must stay opt-in:
// it LAUNCHES CHROMIUM to enumerate chrome-devtools and wants the authenticated
// tinyfish proxy, neither of which belongs in a structural-guards job.
const HAS_SDK = spawnSync("python3", ["-c", "import mcp"], { timeout: 15_000 }).status === 0;

test(
  "stdio initialize advertises tools, resources, and prompts",
  { skip: HAS_SDK ? false : "python3 -c 'import mcp' failed — pip install -r tools/requirements-mcp.txt" },
  () => {
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
  },
);

test(
  "mcp-wrap list-tools reports chrome + tinyfish prefixes",
  { skip: LIVE ? false : "needs APEX_MCP_LIVE=1 (launches Chromium + the tinyfish proxy)" },
  () => {
    const out = execFileSync("python3", [WRAP, "list-tools"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120_000,
    });
    const counts = out.match(/tools: (\d+) \(chrome (\d+), tinyfish (\d+)\)/);
    assert.ok(counts, `no counts line in list-tools output:\n${out.slice(0, 400)}`);
    assert.match(out, /chrome_navigate_page/);
    assert.match(out, /tinyfish_fetch_content/);
    // The counts line is the wrapper's own claim about what it merged; check it
    // against what it actually printed. A run where one upstream is up and the
    // other is not still exercises this, and it is the only assertion here that
    // would catch the wrapper enumerating one upstream while reporting another.
    const [, total, chrome, tinyfish] = counts.map(Number);
    assert.equal(chrome + tinyfish, total, "the per-upstream counts do not add up to the total");
    assert.equal(/^\s*-\s*chrome_/m.test(out), chrome > 0, `chrome count ${chrome} disagrees with the listed chrome_ tools`);
    assert.equal(/^\s*-\s*tinyfish_/m.test(out), tinyfish > 0, `tinyfish count ${tinyfish} disagrees with the listed tinyfish_ tools`);
  },
);
