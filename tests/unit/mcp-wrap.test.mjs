// mcp-wrap.test.mjs — guards the unified chrome-devtools + tinyfish MCP wrapper.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");
const WRAP = path.join(ROOT, "tools/mcp-wrap.py");
const MCP_JSON = path.join(ROOT, ".mcp.json");

test("mcp-wrap.py exists and documents serve/list-tools/status/call", () => {
  const py = readFileSync(WRAP, "utf8");
  assert.match(py, /def cmd_serve/);
  assert.match(py, /CHROME_PREFIX/);
  assert.match(py, /TINYFISH_PREFIX/);
  assert.match(py, /Long-lived chrome-devtools/);
});

test(".mcp.json registers apex-probes via mcp-wrap.py serve", () => {
  const cfg = JSON.parse(readFileSync(MCP_JSON, "utf8"));
  assert.ok(cfg.mcpServers["apex-probes"], "expected apex-probes server entry");
  assert.match(cfg.mcpServers["apex-probes"].command, /python/);
  assert.deepEqual(cfg.mcpServers["apex-probes"].args, [
    "tools/mcp-wrap.py",
    "serve",
  ]);
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
