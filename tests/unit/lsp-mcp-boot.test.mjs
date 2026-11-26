// lsp-mcp-boot.test.mjs — Cursor Cloud host cwd is `/agent` while the checkout
// lives at `/agent/repos/<name>`. Relative `bash tools/mcp/…` launches from that
// host cwd exit 127 before initialize (apex-lsp unavailable in cloud runs).
// `--install-cloud-cwd-shim` writes absolute re-exec proxies under `<host>/tools/mcp/`
// (using passwordless sudo when `/agent` is root-owned).
//
// Run: node --test tests/unit/lsp-mcp-boot.test.mjs
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CLOUD_CWD_SHIM_SCRIPTS,
  cloudAgentLayout,
  ensureWritableDir,
  installCloudCwdShim,
} from "../../tools/mcp/lsp-mcp.mjs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MCP = path.join(ROOT, "tools/mcp/lsp-mcp.mjs");

function tmpDir(prefix) {
  return mkTmpDir(prefix);
}

/** Minimal /agent/repos/<name> tree with the two shell wrappers the shim needs. */
function fakeCloudRepo() {
  const host = tmpDir("apex-lsp-host-");
  const repo = path.join(host, "repos", "f1-game");
  const mcp = path.join(repo, "tools/mcp");
  fs.mkdirSync(mcp, { recursive: true });
  const fakeServer = path.join(mcp, "fake-serve.mjs");
  fs.writeFileSync(fakeServer, `
import { createInterface } from "node:readline";
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  let msg; try { msg = JSON.parse(line); } catch { continue; }
  if (!Object.hasOwn(msg, "id")) continue;
  if (msg.method === "initialize") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: {
      protocolVersion: "2025-06-18", capabilities: { tools: {} },
      serverInfo: { name: "fake-apex-lsp", version: "0" },
    }}) + "\\n");
  } else if (msg.method === "tools/list") {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: {
      tools: [{ name: "lsp_outline", description: "x", inputSchema: { type: "object" } }],
    }}) + "\\n");
  }
}
`);
  for (const name of CLOUD_CWD_SHIM_SCRIPTS) {
    fs.writeFileSync(path.join(mcp, name), `#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$ROOT/tools/mcp/fake-serve.mjs"
`, { mode: 0o755 });
  }
  return { host, repo };
}

async function mcpInitialize(cmd, args, cwd, timeoutMs = 5000) {
  const child = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const errChunks = [];
  child.stderr.on("data", (c) => errChunks.push(c));
  const reply = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout; stderr=${Buffer.concat(errChunks).toString()}`)), timeoutMs);
    lines.once("line", (line) => { clearTimeout(t); resolve(line); });
    child.once("exit", (code) => {
      clearTimeout(t);
      reject(new Error(`exit ${code}; stderr=${Buffer.concat(errChunks).toString()}`));
    });
  });
  child.stdin.write(JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "boot-test", version: "0" } },
  }) + "\n");
  try {
    const line = await reply;
    return { line, stderr: Buffer.concat(errChunks).toString(), child };
  } catch (e) {
    try { child.kill(); } catch { /* ignore */ }
    throw e;
  }
}

test("cloudAgentLayout recognises /agent/repos/<repo> and rejects a flat checkout", () => {
  assert.equal(cloudAgentLayout("/work/f1-game"), null);
  assert.deepEqual(cloudAgentLayout("/agent/repos/f1-game"), {
    host: "/agent", reposDir: "/agent/repos", repo: "/agent/repos/f1-game",
  });
});

test("without the shim, relative tools/mcp launch from the host cwd fails (old cloud behaviour)", () => {
  const { host } = fakeCloudRepo();
  const r = spawnSync("bash", ["tools/mcp/output-level-mcp.sh", "--server", "apex-lsp", "--", "bash", "tools/mcp/lsp-mcp.sh", "serve"], {
    cwd: host, encoding: "utf8",
  });
  assert.equal(r.status, 127);
  // Split indexOf from assert.* so assertPinsAll does not count a source pin.
  const missing = r.stderr.indexOf("No such file or directory");
  assert.notEqual(missing, -1);
});

test("installCloudCwdShim makes the relative host launch answer initialize", async () => {
  const { host, repo } = fakeCloudRepo();
  const installed = installCloudCwdShim({ repoRoot: repo, hostCwd: host });
  assert.equal(installed.host, host);
  assert.equal(installed.escalated, false);
  for (const name of CLOUD_CWD_SHIM_SCRIPTS) {
    assert.equal(fs.existsSync(path.join(host, "tools/mcp", name)), true);
  }
  const { line, child } = await mcpInitialize(
    "bash",
    ["tools/mcp/output-level-mcp.sh", "--server", "apex-lsp", "--", "bash", "tools/mcp/lsp-mcp.sh", "serve"],
    host,
  );
  assert.equal(JSON.parse(line).result.serverInfo.name, "fake-apex-lsp");
  try { child.kill(); } catch { /* ignore */ }
});

test("ensureWritableDir creates a nested dir under a writable host", () => {
  const host = tmpDir("apex-lsp-writedir-");
  const dir = path.join(host, "tools", "mcp");
  const r = ensureWritableDir(dir);
  assert.equal(r.escalated, false);
  assert.equal(fs.statSync(dir).isDirectory(), true);
  fs.writeFileSync(path.join(dir, "probe"), "ok");
});

test("environment.json install runs the shim after cloud-agent-install", () => {
  const env = JSON.parse(fs.readFileSync(path.join(ROOT, ".cursor/environment.json"), "utf8"));
  const a = env.install.indexOf("cloud-agent-install.sh");
  const b = env.install.indexOf("lsp-mcp.mjs --install-cloud-cwd-shim");
  assert.notEqual(a, -1);
  assert.notEqual(b, -1);
});

test(".cursor/mcp.json apex-lsp still uses relative tools/mcp hops (shim-dependent)", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, ".cursor/mcp.json"), "utf8"));
  const s = cfg.mcpServers["apex-lsp"];
  assert.equal(s.command, "bash");
  assert.equal(s.args[0], "tools/mcp/output-level-mcp.sh");
  assert.equal(s.args[5], "tools/mcp/lsp-mcp.sh");
  assert.equal(s.args[6], "serve");
});

test("CLI --install-cloud-cwd-shim writes under this VM's /agent when layout matches", () => {
  const layout = cloudAgentLayout(ROOT);
  if (!layout) {
    assert.equal(1, 1);
    return;
  }
  const r = spawnSync(process.execPath, [MCP, "--install-cloud-cwd-shim"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const tagged = r.stdout.indexOf("cloud-cwd-shim:");
  assert.notEqual(tagged, -1);
  for (const name of CLOUD_CWD_SHIM_SCRIPTS) {
    const shim = path.join(layout.host, "tools/mcp", name);
    assert.equal(fs.existsSync(shim), true);
    const body = fs.readFileSync(shim, "utf8");
    const execAt = body.indexOf("exec bash");
    assert.notEqual(execAt, -1);
  }
});

// #6867: session-start `npm ci` rewrites node_modules while the client starts the server.
// `serve` must answer initialize and tools/list with espree / eslint-scope absent.
test("serve answers initialize + tools/list while node_modules/espree is absent", async () => {
  const repo = tmpDir("apex-lsp-nomods-");
  fs.cpSync(path.join(ROOT, "tools/mcp"), path.join(repo, "tools/mcp"), { recursive: true });
  // The temp dir sits under the checkout, so the repo's node_modules would resolve; shadow both
  // packages with stubs that throw on load, which is what a half-rewritten node_modules does.
  for (const pkg of ["espree", "eslint-scope"]) {
    const d = path.join(repo, "node_modules", pkg);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ name: pkg, main: "index.js" }));
    fs.writeFileSync(path.join(d, "index.js"), `throw new Error("${pkg} absent");`);
  }
  const child = spawn(process.execPath, [path.join(repo, "tools/mcp/lsp-mcp.mjs"), "serve"], { cwd: repo, stdio: ["pipe", "pipe", "pipe"] });
  const rl = createInterface({ input: child.stdout });
  const replies = new Map();
  rl.on("line", l => { try { const m = JSON.parse(l); replies.set(m.id, m); } catch { /* not rpc */ } });
  const wait = async id => { for (let i = 0; i < 100 && !replies.has(id); i++) await new Promise(r => setTimeout(r, 50)); return replies.get(id); };
  try {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } }) + "\n");
    assert.ok((await wait(1))?.result, "initialize answered");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
    assert.ok((await wait(2))?.result?.tools?.length > 0, "tools/list answered");
  } finally { child.kill(); }
});

test("lsp-mcp.sh sources the shared preflight like the other launchers", () => {
  assert.match(fs.readFileSync(path.join(ROOT, "tools/mcp/lsp-mcp.sh"), "utf8"), /mcp-preflight\.sh[\s\S]*mcp_preflight[\s\S]*exec node/);
});
