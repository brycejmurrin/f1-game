// Shared output routes preserve native MCP pins, host mirrors and allowlists.
// Static configuration only; no browser or external server launches.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { nativeMcpConfig } from "../helpers/agent-output-launch.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => fs.readFileSync(ROOT + p, "utf8");

test("every configured MCP server uses the common output gateway and retains its native pinned launcher", () => {
  const cfg = JSON.parse(read(".mcp.json"));
  assert.deepEqual(JSON.parse(read(".cursor/mcp.json")), cfg);
  const native = nativeMcpConfig(cfg);
  const expected = {
    "apex-tools": ["tools/mcp/apex-tools-mcp.sh", "serve"],
    "apex-lsp": ["tools/mcp/lsp-mcp.sh", "serve"],
    "js-debugger": ["tools/mcp/js-debugger-mcp.sh", "serve"],
    "chrome-devtools": ["tools/mcp/chrome-devtools-mcp.sh", "run"],
    "playwright-official": ["tools/mcp/playwright-mcp.sh", "run"],
  };
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), Object.keys(expected).sort());
  for (const [name, row] of Object.entries(cfg.mcpServers)) {
    assert.equal(row.command, "bash");
    assert.deepEqual(row.args, ["tools/mcp/output-level-mcp.sh", "--server", name, "--", "bash", ...expected[name]]);
    assert.equal(native.mcpServers[name].command, "bash");
    assert.deepEqual(native.mcpServers[name].args, expected[name]);
  }
  assert.equal(cfg.mcpServers["apex-tools"].timeout, 900000);
  const env = JSON.parse(read(".cursor/environment.json"));
  for (const row of env.mcpServerAllowlist) {
    const server = cfg.mcpServers[row.name];
    assert.equal(row.command, `*${server.command} ${server.args.join(" ")}`);
  }
  const toml = read(".codex/config.toml");
  for (const [name, row] of Object.entries(cfg.mcpServers)) {
    const start = toml.indexOf(`[mcp_servers.${name}]`);
    assert.ok(start >= 0, name);
    const block = toml.slice(start).split(/\n\[/)[0];
    assert.match(block, /^command = "bash"$/m);
    assert.deepEqual(JSON.parse(block.match(/^args = (.*)$/m)?.[1] ?? "null"), row.args, name);
  }
});

test("native pin inspection rejects a malformed or substituted gateway route", () => {
  assert.throws(() => nativeMcpConfig({ mcpServers: { sample: { command: "bash",
    args: ["tools/mcp/output-level-mcp.sh", "--server", "wrong", "--", "bash", "pinned.sh"] } } }), /malformed/);
  assert.throws(() => nativeMcpConfig({ mcpServers: { sample: { command: "bash",
    args: ["tools/mcp/output-level-mcp.sh", "--server", "sample", "--", "sh", "pinned.sh"] } } }), /pinned bash/);
});
