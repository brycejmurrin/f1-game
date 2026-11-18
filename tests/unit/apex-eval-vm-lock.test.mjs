// apex_eval {vm:true} is a tree call (#5674): it boots the Node VM, so a live browser beside it must not refuse it,
// while the browser form of the same call still is. Occupancy comes from APEX_MCP_PS only, so this file never touches
// the shared scratch/apex-browser.lock other tests write.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MCP = path.join(ROOT, "tools/mcp/apex-tools-mcp.mjs");
const LIVE_BROWSER = "88 node /opt/cursor/node_modules/@playwright/mcp/cli.js --headless\n"
  + "91 /opt/pw-browsers/chromium --user-data-dir=/tmp/playwright-mcp-abc --headless\n";
const call = (args) => spawnSync(process.execPath, [MCP, "call", "apex_eval", JSON.stringify(args)], {
  encoding: "utf8", cwd: ROOT, timeout: 15000, env: { ...process.env, APEX_MCP_MOCK: "0", APEX_MCP_PS: LIVE_BROWSER },
});

test("apex_eval {vm:true} runs beside a live browser", () => {
  const r = call({ track: "monza", expr: "1", vm: true, dryRun: true });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(JSON.parse(r.stdout).ok, true);
});

test("apex_eval without vm is still refused beside a live browser", () => {
  const r = call({ track: "monza", expr: "1", dryRun: true });
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.equal(JSON.parse(r.stdout).error, "playwright_live");
});

test("apex_eval {vm:false} keeps the browser gate", () => {
  const r = call({ track: "monza", expr: "1", vm: false, dryRun: true });
  assert.equal(JSON.parse(r.stdout).error, "playwright_live");
});

test("apex_status's ready hint names the subagent's no-browser route", async () => {
  const { statusNext } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const ready = statusNext({ held: false }, { busy: false }, [0.1, 0.1, 0.1]);
  assert.equal(ready.tool, "apex_shot_survey");
  assert.equal(ready.subagentTool, "apex_eval {vm:true}");
  assert.equal(statusNext({ held: true, tool: "apex_shot" }, {}, [0]).subagentTool, undefined);
});
