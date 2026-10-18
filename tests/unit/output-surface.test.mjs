import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "../../tools/gen/gen-lib.mjs";
import { walkTools } from "../../tools/gen/gen-tools-readme.mjs";
import { classify, collect, render, TARGET } from "../../tools/gen/gen-output-surface.mjs";

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
  assert.deepEqual(inventory.tools.map(row => row.path), walkTools().map(file => `tools/${file}`));
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;
  assert.deepEqual(inventory.npmScripts.map(row => row.name), Object.keys(scripts).sort());
  for (const row of inventory.npmScripts) {
    assert.equal(row.command, scripts[row.name]);
    assert.deepEqual(row.agentCommand, ["node", "tools/agent-run.mjs", "--", "npm", "run", row.name]);
  }
  const servers = JSON.parse(fs.readFileSync(path.join(ROOT, ".mcp.json"), "utf8")).mcpServers;
  assert.deepEqual(inventory.mcpRoutes.map(row => row.name), Object.keys(servers).sort());
  for (const row of inventory.mcpRoutes) {
    assert.equal(row.command, servers[row.name].command);
    assert.deepEqual(row.args, servers[row.name].args);
    assert.equal(row.gatewayConfigured, true, `${row.name} bypasses output gateway`);
    assert.equal(row.scope, "all tools/list pages via gateway");
    assert.equal(row.parameter, "outputLevel");
    assert.equal(row.retrievalTool, "output_read");
  }
  assert.equal(inventory.output.defaultLevel, "compact");
  assert.deepEqual(inventory.output.levels, ["compact", "diagnostic", "full"]);
  for (const row of inventory.tools) {
    assert.equal(!!row.agentCommand, row.classification === "entrypoint-candidate");
    if (row.agentCommand) assert.deepEqual(row.agentCommand.slice(0, 3), ["node", "tools/agent-run.mjs", "--"]);
  }
  const policies = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/agent-output/policies.json'), 'utf8'));
  assert.deepEqual(Object.keys(policies.tools).sort(), inventory.tools.map(row => row.path).sort());
  for (const row of inventory.tools) {
    assert.equal(row.outputPolicy, policies.tools[row.path].action);
    assert.deepEqual(row.outputContract, policies.tools[row.path].preserve);
    if (row.outputPolicy === 'protocol-only') assert.equal(row.agentCommand, undefined, row.path);
  }
});

test("static flag mentions are labelled and generation is deterministic", () => {
  const options = { files: ["lib/pure.mjs", "check/x.mjs"], scripts: { z: "node tools/" + "check/x.mjs" }, servers: {},
    read: file => file.includes("pure") ? "export const x = 1;" : "// @doc Fixture command\n// --json is mentioned, not necessarily accepted\nprocess.argv;" };
  const data = collect(options);
  assert.deepEqual(data.tools[0].nativeOutputFlagMentions, ["--json"]);
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
