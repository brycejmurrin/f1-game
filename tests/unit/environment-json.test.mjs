// environment-json.test.mjs — repo Cloud Agent bootstrap contract.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ENV_JSON = path.join(ROOT, ".cursor/environment.json");
const MCP_JSON = path.join(ROOT, ".mcp.json");

test(".cursor/environment.json exists and bootstraps chrome MCP", () => {
  const env = JSON.parse(fs.readFileSync(ENV_JSON, "utf8"));
  assert.equal(env.name, "Apex 26");
  assert.match(env.install, /cloud-agent-install\.sh/);
  assert.equal(env.chromeExecutablePath, "/opt/pw-browsers/chromium");
  const names = (env.mcpServerAllowlist || []).map((row) => row.name).sort();
  assert.deepEqual(names, [
    "apex-tools",
    "chrome-devtools",
    "chrome-devtools-mcp",
    "playwright-official",
  ]);
});

test(".cursor/environment.json allowlist covers every stdio MCP command in .mcp.json", () => {
  const env = JSON.parse(fs.readFileSync(ENV_JSON, "utf8"));
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  const allowed = new Set((env.mcpServerAllowlist || []).map((row) => row.command));
  for (const [name, row] of Object.entries(cfg.mcpServers)) {
    assert.ok(allowed.has(row.command), `${name} command ${row.command} must be allowlisted`);
  }
});
