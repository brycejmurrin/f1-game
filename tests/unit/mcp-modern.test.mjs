// @doc Dual-stack MCP 2026-07-28: server/discover, resultType, cache hints, version errors; legacy replies unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { handleRpc as lspRpc } from "../../tools/mcp/lsp-mcp.mjs";
import { handleRpc as dbgRpc } from "../../tools/mcp/js-debugger-mcp.mjs";
import { MODERN, META_VERSION, modernize, versionError, discoverResult } from "../../tools/mcp/mcp-modern.mjs";

const meta = (v = MODERN) => ({ _meta: { [META_VERSION]: v } });

test("helpers: modernize only touches modern successes", () => {
  const legacy = { jsonrpc: "2.0", id: 1, result: { tools: [] } };
  assert.equal(modernize({ method: "tools/list", params: {} }, legacy), legacy);
  const m = modernize({ method: "tools/list", params: meta() }, legacy);
  assert.deepEqual([m.result.resultType, m.result.cacheScope, typeof m.result.ttlMs], ["complete", "private", "number"]);
  const call = modernize({ method: "tools/call", params: meta() }, { jsonrpc: "2.0", id: 2, result: { content: [] } });
  assert.equal(call.result.resultType, "complete");
  assert.equal(call.result.ttlMs, undefined);
  const err = { jsonrpc: "2.0", id: 3, error: { code: -1, message: "x" } };
  assert.equal(modernize({ method: "tools/list", params: meta() }, err), err);
});

test("helpers: unsupported version -> -32022 listing supported", () => {
  const e = versionError({ id: 7, method: "tools/list", params: meta("1900-01-01") }, [MODERN]);
  assert.equal(e.error.code, -32022);
  assert.deepEqual(e.error.data, { supported: [MODERN], requested: "1900-01-01" });
  assert.equal(versionError({ id: 7, method: "x" }, [MODERN]), null);
  assert.equal(discoverResult(1, [MODERN], { capabilities: {}, info: { name: "n", version: "1" } }).result.resultType, "complete");
});

test("apex-lsp and js-debugger: discover, modern list, legacy list unchanged", async () => {
  for (const rpc of [(m) => lspRpc({}, m), (m) => dbgRpc({}, m)]) {
    const d = (await rpc({ jsonrpc: "2.0", id: 1, method: "server/discover", params: meta() })).result;
    assert.equal(d.resultType, "complete");
    assert.ok(d.supportedVersions.includes(MODERN) && d.supportedVersions.includes("2025-06-18"));
    assert.ok(d._meta["io.modelcontextprotocol/serverInfo"].name);
    const modern = (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: meta() })).result;
    const legacy = (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" })).result;
    assert.deepEqual(modern.tools, legacy.tools);
    assert.equal(legacy.resultType, undefined);
    assert.equal(modern.resultType, "complete");
    const init = (await rpc({ jsonrpc: "2.0", id: 4, method: "initialize", params: { protocolVersion: "2025-06-18" } })).result;
    assert.equal(init.protocolVersion, "2025-06-18");
    const bad = await rpc({ jsonrpc: "2.0", id: 5, method: "tools/list", params: meta("1900-01-01") });
    assert.equal(bad.error.code, -32022);
  }
});

test("apex-tools over stdio: discover + modern list, legacy list bare, bad version refused", async () => {
  const { spawnSync } = await import("node:child_process");
  const M = { _meta: { [META_VERSION]: MODERN } };
  const lines = [
    { jsonrpc: "2.0", id: 1, method: "server/discover", params: M },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: M },
    { jsonrpc: "2.0", id: 3, method: "tools/list" },
    { jsonrpc: "2.0", id: 4, method: "tools/list", params: { _meta: { [META_VERSION]: "1900-01-01" } } },
  ].map((m) => JSON.stringify(m)).join("\n") + "\n";
  const r = spawnSync("node", ["tools/mcp/apex-tools-mcp.mjs", "serve"], { input: lines, encoding: "utf8", timeout: 60000 });
  const by = Object.fromEntries(r.stdout.trim().split("\n").map((l) => JSON.parse(l)).map((m) => [m.id, m]));
  assert.deepEqual(by[1].result.supportedVersions, [MODERN, "2025-06-18"]);
  assert.equal(by[2].result.resultType, "complete");
  assert.equal(by[2].result.cacheScope, "private");
  assert.equal(by[3].result.resultType, undefined);
  assert.deepEqual(by[2].result.tools, by[3].result.tools);
  assert.equal(by[4].error.code, -32022);
});
