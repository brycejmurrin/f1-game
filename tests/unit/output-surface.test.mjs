import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "../../tools/gen/gen-lib.mjs";
import { walkTools } from "../../tools/gen/gen-tools-readme.mjs";
import {
  classify, collect, render, TARGET, RUNNER, agentCommandFor, npmAgentCommand, resolveToolPolicy,
} from "../../tools/gen/gen-output-surface.mjs";

test("static inventory distinguishes commands from libraries, data and ambiguous modules", () => {
  assert.equal(classify("lib/math.mjs", "export const x = 1;").classification, "library");
  assert.equal(classify("mcp/helper.mjs", "export const x = 1;").classification, "ambiguous");
  assert.equal(classify("mcp/catalog.json", "{}").classification, "data");
  assert.equal(classify("carview.html", "<html>").classification, "asset");
  assert.equal(classify("check/x.mjs", "if (isMain(import.meta.url)) main();").classification, "entrypoint-candidate");
  assert.equal(classify("env/x.sh", "#!/bin/bash\necho ok").classification, "entrypoint-candidate");
  assert.equal(classify("check/x.mjs", "console.log(1)", ["x"]).classification, "entrypoint-candidate");
});

test("catalog covers every file, npm command and configured MCP route without fake native flags", () => {
  const inventory = collect();
  assert.equal(inventory.version, 2);
  assert.deepEqual(inventory.runner, RUNNER);
  assert.deepEqual(inventory.tools.map(row => row.path), walkTools().map(file => `tools/${file}`));
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;
  assert.deepEqual(inventory.npmScripts.map(row => row.name), Object.keys(scripts).sort());
  for (const row of inventory.npmScripts) {
    assert.equal(row.command, scripts[row.name]);
    assert.equal(row.agentCommand, undefined, "compact catalog omits npm agentCommand arrays");
    assert.deepEqual(npmAgentCommand(row.name), ["node", "tools/agent-run.mjs", "--", "npm", "run", row.name]);
  }
  const servers = JSON.parse(fs.readFileSync(path.join(ROOT, ".mcp.json"), "utf8")).mcpServers;
  assert.deepEqual(inventory.mcpRoutes.map(row => row.name), Object.keys(servers).sort());
  for (const row of inventory.mcpRoutes) {
    assert.equal(row.command, servers[row.name].command);
    assert.deepEqual(row.args, servers[row.name].args);
    assert.equal(row.gatewayConfigured, true, `${row.name} bypasses output gateway`);
    assert.equal(row.scope, undefined, "scope lives under output.mcp");
    assert.equal(inventory.output.mcp.parameter, "outputLevel");
    assert.equal(inventory.output.mcp.retrievalTool, "output_read");
  }
  assert.equal(inventory.output.defaultLevel, "compact");
  assert.deepEqual(inventory.output.levels, ["compact", "diagnostic", "full"]);
  for (const row of inventory.tools) {
    assert.equal(!!agentCommandFor(row), row.classification === "entrypoint-candidate");
    if (row.classification === "entrypoint-candidate") {
      assert.equal(typeof row.interpreter, "string");
      assert.deepEqual(agentCommandFor(row).slice(0, 3), RUNNER);
      assert.equal(row.agentCommand, undefined, "compact catalog stores interpreter, not argv arrays");
    }
    assert.equal(row.outputContract, undefined, "preserve contracts stay in policies.json");
    assert.equal(row.doc, undefined);
    assert.equal(row.sourceBytes, undefined);
  }
  const policies = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/agent-output/policies.json"), "utf8"));
  assert.deepEqual(Object.keys(policies.tools).sort(), inventory.tools.map(row => row.path).sort());
  for (const row of inventory.tools) {
    const policy = resolveToolPolicy(policies, row.path);
    assert.equal(row.outputPolicy, policy.action);
    assert.ok(policy.preserve !== undefined, row.path);
    if (row.outputPolicy === "protocol-only") assert.equal(agentCommandFor(row), undefined, row.path);
  }
});

test("static flag mentions are labelled and generation is deterministic", () => {
  const options = { files: ["lib/pure.mjs", "check/x.mjs"], scripts: { z: "node tools/" + "check/x.mjs" }, servers: {},
    read: file => file.includes("pure") ? "export const x = 1;" : "// @doc Fixture command\n// --json is mentioned, not necessarily accepted\nprocess.argv;" };
  const data = collect(options);
  assert.deepEqual(data.tools.find(r => r.path.endsWith("check/x.mjs")).nativeOutputFlagMentions, ["--json"]);
  assert.match(data.output.limitations, /comments or subcommand-specific/);
  assert.equal(render(options), render({ ...options, files: [...options.files].reverse() }));
  assert.equal(render(), fs.readFileSync(path.join(ROOT, TARGET), "utf8"), "regenerate catalog from current source");
});

test("generator help, unknown arguments and a clean --check never write", () => {
  const before = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  for (const [arg, status] of [["--help", 0], ["--unknown", 2], ["--check", 0]]) {
    const result = spawnSync(process.execPath, ["tools/gen/gen-output-surface.mjs", arg], { cwd: ROOT, encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, status, result.stdout + result.stderr);
    assert.equal(fs.readFileSync(path.join(ROOT, TARGET), "utf8"), before);
  }
});
