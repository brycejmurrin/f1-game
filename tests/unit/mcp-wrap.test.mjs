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

// BOTH UPSTREAMS ARE DEVELOPER-MACHINE-ONLY. chrome-devtools lives in a
// gitignored clone (scratch/chrome-devtools-mcp, tools/chrome-devtools-mcp.sh)
// and tinyfish behind a local authenticated proxy that needs TINYFISH_API_KEY
// (tools/tinyfish-mcp.sh). Neither exists on a CI runner or in a fresh
// container, so the previous form — asserting `tinyfish_fetch_content` in the
// LIVE tool list — could only pass on the box it was written on. It went red on
// `npm run test:tooling-fast`, which ci.yml runs as its structural gate, i.e. it
// shipped broken on every machine but one.
//
// WHAT THIS STILL COVERS, AND WHAT IT DOES NOT. Covered every run, no upstream
// needed: mcp-wrap.py imports and runs, `list-tools` exits 0, and its counts
// line AGREES with the tools it actually printed — the consistency check is what
// catches a wrapper that enumerates one upstream and reports another. NOT
// covered when an upstream is missing: that the upstream's tools are really
// reachable. The prefix contract itself does not depend on reachability and is
// asserted statically above (CHROME_PREFIX/TINYFISH_PREFIX in test 1, the
// instructions string in test 4), so no assertion was traded away for this.
test("mcp-wrap list-tools exits 0, and its counts agree with the tools it lists", () => {
  const out = execFileSync("python3", [WRAP, "list-tools"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
  const counts = out.match(/tools: (\d+) \(chrome (\d+), tinyfish (\d+)\)/);
  assert.ok(counts, `no counts line in list-tools output:\n${out.slice(0, 400)}`);
  const [, total, chrome, tinyfish] = counts.map(Number);
  assert.equal(chrome + tinyfish, total, "the per-upstream counts do not add up to the total");
  // A count of 0 must mean NO tools of that prefix were listed, and a count above
  // 0 must mean its tools ARE listed. Either mismatch is a real wrapper bug, and
  // this is what makes the absent-upstream path an assertion rather than a skip.
  const listed = (re) => re.test(out);
  assert.equal(listed(/^\s*-\s*chrome_/m), chrome > 0, `chrome count ${chrome} disagrees with the listed chrome_ tools`);
  assert.equal(listed(/^\s*-\s*tinyfish_/m), tinyfish > 0, `tinyfish count ${tinyfish} disagrees with the listed tinyfish_ tools`);
  if (chrome > 0) assert.match(out, /chrome_navigate_page/);
  if (tinyfish > 0) assert.match(out, /tinyfish_fetch_content/);
});
