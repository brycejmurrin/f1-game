// The opt-in one-tool apex-tools surface (tools/mcp/apex-one-tool.mjs) and the
// listing-cost meter behind docs/notes/MCP-SINGLE-TOOL-REDESIGN-2026-10-20.md.
// Mock-mode stdio server (APEX_MCP_MOCK=1), no browser, ~1 s.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ONE_TOOL, oneToolEnabled, oneToolListing, routeOneTool, isBrowserOp } from "../../tools/mcp/apex-one-tool.mjs";
import { sizeListing, estTokens } from "../../tools/mcp/mcp-listing-cost.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MCP = path.join(ROOT, "tools/mcp/apex-tools-mcp.mjs");
const CATALOG = [
  { name: "apex_status", kind: "tree" },
  { name: "apex_help", kind: "tree" },
  { name: "apex_shot", kind: "browser" },
  { name: "apex_job_start", kind: "tree" },
];

function rpc(lines, env = {}) {
  const r = spawnSync(process.execPath, [MCP, "serve"], {
    encoding: "utf8",
    input: lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
    env: { ...process.env, APEX_MCP_MOCK: "1", APEX_MCP_ONE_TOOL: "", ...env },
    cwd: ROOT, timeout: 15000, maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(r.status, 0, r.error?.message || r.stderr);
  return r.stdout.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}
const call = (id, args) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "apex", arguments: args } });
const body = (msg) => msg.result.structuredContent;

test("off by default: only the env var or --one-tool switches it on", () => {
  assert.equal(oneToolEnabled({}, ["node", "x", "serve"]), false);
  assert.equal(oneToolEnabled({ APEX_MCP_ONE_TOOL: "1" }, []), true);
  assert.equal(oneToolEnabled({}, ["node", "x", "serve", "--one-tool"]), true);
});

test("listing derives the op enum and the tree/browser split from the catalog", () => {
  const t = oneToolListing(CATALOG);
  assert.equal(t.name, ONE_TOOL);
  assert.deepEqual(t.inputSchema.properties.op.enum, ["status", "help", "shot", "job_start"]);
  assert.deepEqual(t.inputSchema.required, ["op"]);
  assert.ok(t.description.includes("Tree ops (no lock): status, help."), t.description);
  assert.ok(t.description.endsWith("never inside a subagent): shot, job_start."), t.description);
});

test("routing: prefix optional, help's tool normalised, malformed calls refused", () => {
  assert.deepEqual(routeOneTool({ op: "status" }, CATALOG), { name: "apex_status", args: {} });
  assert.deepEqual(routeOneTool({ op: "apex_shot", args: { track: "spa" } }, CATALOG), { name: "apex_shot", args: { track: "spa" } });
  assert.deepEqual(routeOneTool({ op: "help", args: { tool: "shot" } }, CATALOG), { name: "apex_help", args: { tool: "apex_shot" } });
  assert.equal(routeOneTool({ op: "nope" }, CATALOG).error, "unknown_op");
  assert.equal(routeOneTool({ op: "status", track: "spa" }, CATALOG).error, "bad_args");
  assert.equal(routeOneTool({ op: "status", args: [] }, CATALOG).error, "bad_args");
  assert.equal(routeOneTool(null, CATALOG).error, "bad_args");
  assert.equal(isBrowserOp({ op: "shot" }, CATALOG), true);
  assert.equal(isBrowserOp({ op: "job_start" }, CATALOG), true, "tree kind, but the guard refuses it in a subagent");
  assert.equal(isBrowserOp({ op: "status" }, CATALOG), false);
});

test("isBrowserOp covers exactly mcp-browser-guard.sh's apex list", () => {
  const out = rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }], { APEX_MCP_ONE_TOOL: "1" });
  const desc = out[0].result.tools[0].description;
  const listed = desc.split("subagent): ")[1].replace(/\.$/, "").split(", ").sort();
  const guard = fs.readFileSync(path.join(ROOT, ".claude/hooks/mcp-browser-guard.sh"), "utf8").match(/apex-tools__apex_\(([^)]+)\)/)[1].split("|").sort();
  assert.deepEqual(listed, guard);
});

test("default server listing is unchanged (the 41-tool catalog, no `apex`)", () => {
  const tools = rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }])[0].result.tools;
  assert.ok(tools.length > 30, tools.length);
  assert.ok(!tools.some((t) => t.name === ONE_TOOL));
  const off = rpc([call(2, { op: "status" })])[0];
  assert.equal(body(off).error, "bad_prefix", "the apex tool is not callable while the surface is off");
});

test("one-tool server: one entry, every catalog op in the enum, calls reach dispatch", () => {
  const out = rpc([
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    call(2, { op: "help", args: { tool: "status" } }),
    call(3, { op: "catalog", args: { bogus: 1 } }),
    call(4, { op: "nope" }),
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "apex_help", arguments: { tool: "apex_status" } } },
  ], { APEX_MCP_ONE_TOOL: "1" });
  const byId = Object.fromEntries(out.map((m) => [m.id, m]));
  const tools = byId[1].result.tools;
  assert.equal(tools.length, 1);
  const full = rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }])[0].result.tools;
  assert.deepEqual([...tools[0].inputSchema.properties.op.enum].sort(), full.map((t) => t.name.slice(5)).sort());
  assert.ok(JSON.stringify(tools).length * 10 < JSON.stringify(full).length, "the one-tool listing is < 1/10 of the catalog's");
  assert.equal(body(byId[2]).ok, true);
  assert.equal(body(byId[2]).tool, "apex_status");
  assert.equal(body(byId[3]).error, "bad_args", "per-op validation still runs");
  assert.equal(body(byId[4]).error, "unknown_op");
  assert.equal(body(byId[5]).ok, true, "legacy apex_* names still route");
});

test("sizeListing: chars, name-only cost and the largest entries", () => {
  const tools = [{ name: "a", description: "xy", inputSchema: { type: "object" } }, { name: "bb", description: "", inputSchema: {} }];
  const r = sizeListing("srv", tools, "hi");
  assert.equal(r.tools, 2);
  assert.equal(r.descChars, 2);
  assert.equal(r.deferredChars, "mcp__srv__a\n".length + "mcp__srv__bb\n".length);
  assert.equal(r.fullChars, JSON.stringify(tools).length);
  assert.equal(r.fullTokens, estTokens(r.fullChars));
  assert.equal(r.instructionsChars, 2);
  assert.equal(r.largest[0], `a:${JSON.stringify(tools[0]).length}`);
});
