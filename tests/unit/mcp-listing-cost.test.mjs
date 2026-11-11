// The MCP listing-cost meter (tools/mcp/mcp-listing-cost.mjs) and the bound on
// what the output-level gateway adds to every tools/list entry
// (docs/notes/MCP-SINGLE-TOOL-REDESIGN-2026-10-20.md). Inline fixture server, ~1 s.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { sizeListing, estTokens, listServer } from "../../tools/mcp/mcp-listing-cost.mjs";
import { SERVER_PREFACES, GATEWAY_INSTRUCTIONS } from "../../tools/mcp/output-level-mcp.mjs";

const GATEWAY = fileURLToPath(new URL("../../tools/mcp/output-level-mcp.mjs", import.meta.url));
const FIXTURE = String.raw`
const {createInterface}=require('node:readline');
const tools=[
 {name:'plain',description:'Plain tool',inputSchema:{type:'object',properties:{x:{type:'string'}}}},
 {name:'typed',description:'Typed tool',inputSchema:{type:'object',properties:{}},outputSchema:{type:'object',properties:{ok:{type:'boolean'}}}}
];
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);
 if(m.method==='initialize')send({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'fx',version:'1'},instructions:'fixture'}});
 else if(m.method==='tools/list')send({jsonrpc:'2.0',id:m.id,result:{tools}});});
`;
const raw = () => listServer(process.execPath, ["-e", FIXTURE], { timeoutMs: 15000 });
const wrapped = () => listServer(process.execPath, [GATEWAY, "--server", "fx", "--", process.execPath, "-e", FIXTURE], { timeoutMs: 15000 });

test("sizeListing: chars, names-only cost and the largest entries", () => {
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

test("listServer runs initialize + tools/list and returns the instructions", async () => {
  const { tools, instructions } = await raw();
  assert.deepEqual(tools.map((t) => t.name), ["plain", "typed"]);
  assert.equal(instructions, "fixture");
});

test("the output-level gateway adds a bounded amount per tool to tools/list", async () => {
  // Measured on this fixture 2026-10-20: +469 / +667 chars (plain / typed) while
  // LEVEL and a per-tool hint carried prose; +276 / +474 with bare LEVEL; the hint
  // then moved to initialize's instructions (once per server), leaving the level
  // key and, for a typed tool, the output envelope.
  const before = await raw(), after = await wrapped();
  const size = (t) => JSON.stringify(t).length;
  for (const t of before.tools) {
    const w = after.tools.find((x) => x.name === t.name);
    assert.ok(w, t.name);
    assert.equal(w.inputSchema.properties.outputLevel.description, undefined, "LEVEL carries no per-tool prose");
    const budget = t.outputSchema ? 300 : 120;
    assert.ok(size(w) - size(t) <= budget, `${t.name}: +${size(w) - size(t)} chars (budget ${budget})`);
  }
  const reader = after.tools.find((x) => x.name === "output_read");
  assert.ok(reader.inputSchema.properties.outputLevel.description, "output_read keeps the level prose, once per server");
  assert.ok(after.instructions.startsWith("fixture\n\n"), "upstream instructions come first");
  assert.ok(after.instructions.includes("outputLevel=compact"), "the gateway hint follows them");
});

test("a server with no instructions of its own gets its preface, then the gateway hint", async () => {
  const silent = FIXTURE.replace(",instructions:'fixture'", "");
  const as = (server) => listServer(process.execPath, [GATEWAY, "--server", server, "--", process.execPath, "-e", silent], { timeoutMs: 15000 });
  for (const server of Object.keys(SERVER_PREFACES)) {
    const { instructions } = await as(server);
    assert.equal(instructions, `${SERVER_PREFACES[server]}\n\n${GATEWAY_INSTRUCTIONS}`, server);
    // 240 -> 300 (2026-10-30): the preface now names the URL and serve command a cold agent spent two calls finding.
    assert.ok(SERVER_PREFACES[server].length <= 300, `${server}: preface stays one short sentence pair`);
  }
  assert.equal((await as("unlisted")).instructions, GATEWAY_INSTRUCTIONS, "no preface invented for an unlisted server");
});
