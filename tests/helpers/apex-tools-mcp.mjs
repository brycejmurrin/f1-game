// tests/helpers/apex-tools-mcp.mjs — fixtures shared by the tests/unit/apex-tools-mcp*.test.mjs files
// (split from one 3,158-line file, T1-16, #3043): paths, the stdio / `call` transports, the browser lock
// path, a batched tools/call runner and an apex-extras context stub. Moved verbatim; only `export` added.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const MCP = path.join(ROOT, "tools/mcp/apex-tools-mcp.mjs");

export const SH = path.join(ROOT, "tools/mcp/apex-tools-mcp.sh");

export const MCP_JSON = path.join(ROOT, ".mcp.json");

/** Temp dir guaranteed outside artifacts/ and scratch/ (TMPDIR may live under artifacts/). */
export function mkOutsideTemp(prefix = "apex-mcp-outside-") {
  const artifacts = path.join(ROOT, "artifacts");
  const scratch = path.join(ROOT, "scratch");
  const inside = (base, target) => {
    const rel = path.relative(base, target);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };
  for (const parent of [os.tmpdir(), "/tmp", path.join(ROOT, "..")]) {
    try {
      const dir = fs.mkdtempSync(path.join(parent, prefix));
      if (!inside(artifacts, dir) && !inside(scratch, dir) && !inside(ROOT, dir)) return dir;
      fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* try next parent */ }
  }
  throw new Error("could not allocate a temp directory outside the repo roots");
}

export function rpc(lines, env = {}) {
  const r = spawnSync(process.execPath, [MCP, "serve"], {
    encoding: "utf8",
    input: lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + "\n",
    env: { ...process.env, APEX_MCP_MOCK: "1", ...env },
    cwd: ROOT,
    timeout: 15000,
    // Batched schema-contract probes publish every tool schema and hundreds
    // of typed refusals; keep the transport fixture bounded above 1 MiB.
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(r.status, 0, r.error?.message || r.stderr);
  return r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

export function callCli(name, args = {}, extraEnv = {}) {
  const r = spawnSync(
    process.execPath,
    [MCP, "call", name, JSON.stringify(args)],
    {
      encoding: "utf8",
      env: { ...process.env, APEX_MCP_MOCK: "1", ...extraEnv },
      cwd: ROOT,
      timeout: 15000,
    },
  );
  return r;
}

export const LOCK = path.join(ROOT, "scratch", "apex-browser.lock");

export const callTools = (calls) => {
  const out = rpc([
    { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    ...calls.map(([name, args], i) => ({ jsonrpc: "2.0", id: i + 1, method: "tools/call", params: { name, arguments: args } })),
  ]);
  return calls.map((_, i) => {
    const r = out.find((m) => m.id === i + 1);
    assert.ok(r && r.result, `no reply for ${calls[i][0]}`);
    return { isError: !!r.result.isError, body: JSON.parse(r.result.content[0].text) };
  });
};

export function extrasCtx(over = {}) {
  const toolResult = (b) => ({ content: [{ type: "text", text: JSON.stringify(b) }] });
  const released = { n: 0 };
  return { released, ctx: { ROOT, toolResult, refuse: (error, message, fix) => toolResult({ ok: false, error, message, fix }),
    acquireLock: () => null, releaseLock: () => { released.n++; }, occupancyRefuse: () => null, assertSafeOut: (p) => p,
    knownCircuits: () => ["monza"], runSpawn: null, splitOut: (s) => ({ out: null, rest: s }), log: () => {}, mockMode: () => false, ...over } };
}

/** A job id in the exact shape jobStart mints (<kind>-<base36>-<pid>-<12 hex>); anything else is refused (#5296 W25). */
export const jid = (kind, n) => `${kind}-t${n}-1-${String(n).padStart(12, "0")}`;
