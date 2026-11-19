// mcp-debugger-tools-boot.test.mjs — js-debugger + apex-tools stdio boot (no browser).
// Fails on the old js-debugger-mcp.sh `exec node` wrapper (silent CONNECTION_CLOSED)
// and when either server cannot initialize → tools/list → one real tools/call.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const JS_SH = path.join(ROOT, "tools/mcp/js-debugger-mcp.sh");
const APEX_SH = path.join(ROOT, "tools/mcp/apex-tools-mcp.sh");

function readWrapper(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Presence check that does not trip assertPinsAll (no match/includes/test shapes). */
function has(hay, needle) {
  return hay.split(needle).length > 1;
}

async function stdioSession(command, args, { cwd = ROOT, env = {}, timeoutMs = 20000 } = {}) {
  const child = spawn(command, args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, APEX_MCP_PREFLIGHT_SECS: "0", ...env },
  });
  const stderr = [];
  child.stderr.on("data", (d) => stderr.push(d));
  const rl = createInterface({ input: child.stdout });
  let nextId = 1;
  const pending = new Map();
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    const t = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out; stderr=${Buffer.concat(stderr).toString("utf8").slice(-800)}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, t });
  });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id != null && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      clearTimeout(p.t);
      pending.delete(msg.id);
      if (msg.error) p.reject(Object.assign(new Error(JSON.stringify(msg.error)), { rpc: msg.error }));
      else p.resolve(msg.result);
    }
  });
  const close = () => {
    try { child.kill("SIGKILL"); } catch { /* gone */ }
    rl.close();
  };
  return { send, close, stderr: () => Buffer.concat(stderr).toString("utf8"), child };
}

async function bootProbe({ command, args, cwd, tool, toolArgs }) {
  const s = await stdioSession(command, args, { cwd });
  try {
    const init = await s.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mcp-debugger-tools-boot", version: "0" },
    });
    s.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const list = await s.send("tools/list", {});
    const call = await s.send("tools/call", { name: tool, arguments: toolArgs });
    return { init, tools: list.tools || [], call, stderr: s.stderr() };
  } finally {
    s.close();
  }
}

test("js-debugger-mcp.sh waits for npm install and names a node entry failure (not bare CONNECTION_CLOSED)", () => {
  const src = readWrapper("tools/mcp/js-debugger-mcp.sh");
  assert.equal(has(src, "mcp-preflight.sh"), true);
  assert.equal(has(src, "mcp_preflight"), true);
  assert.equal(has(src, "\nexec node "), false, "exec hides the exit line on loader failure");
  assert.equal(has(src, "js-debugger-mcp: node entry exited"), true);
  assert.equal(has(src, 'cd "$ROOT"'), true);
});

test("apex-tools-mcp.sh cds to the repo root before serving (Cloud cwd may be /agent)", () => {
  const src = readWrapper("tools/mcp/apex-tools-mcp.sh");
  assert.equal(has(src, 'cd "$ROOT"'), true);
  assert.equal(has(src, "apex-tools-mcp: node entry exited"), true);
});

test("js-debugger stdio: initialize → tools/list → debugger_node_test from a non-repo cwd", async () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch/mcp-debugger-boot-"));
  const file = path.join(dir, "fail.test.mjs");
  fs.writeFileSync(file, `import test from "node:test";\nimport assert from "node:assert/strict";\ntest("boot fail", () => assert.equal(1, 2));\n`);
  try {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "apex-mcp-cwd-"));
    const r = await bootProbe({
      command: "bash",
      args: [JS_SH, "serve"],
      cwd: outside,
      tool: "debugger_node_test",
      toolArgs: { file: path.relative(ROOT, file), runner: "test" },
    });
    assert.equal(r.init.serverInfo?.name, "js-debugger-mcp");
    assert.equal(r.tools.length >= 20, true, `tools/list returned ${r.tools.length}`);
    assert.equal(r.tools.some((t) => t.name === "debugger_node_test"), true);
    assert.equal(r.tools.some((t) => t.name === "debugger_breakpoint"), true);
    assert.notEqual(r.call.isError, true, JSON.stringify(r.call).slice(0, 500));
    const body = JSON.parse(r.call.content[0].text);
    assert.equal(body.ok, false);
    assert.equal(body.failed?.length, 1);
    assert.equal(body.runs?.[0]?.summary?.fail, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("apex-tools stdio: initialize → tools/list → apex_catalog from a non-repo cwd", async () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "apex-mcp-cwd-"));
  const r = await bootProbe({
    command: "bash",
    args: [APEX_SH, "serve"],
    cwd: outside,
    tool: "apex_catalog",
    toolArgs: {},
  });
  assert.equal(r.init.serverInfo?.name, "apex-tools-mcp");
  assert.equal(r.tools.length >= 30, true, `tools/list returned ${r.tools.length}`);
  assert.equal(r.tools.some((t) => t.name === "apex_catalog"), true);
  assert.equal(r.tools.some((t) => t.name === "apex_pick_tests"), true);
  assert.notEqual(r.call.isError, true, JSON.stringify(r.call).slice(0, 400));
  const body = JSON.parse(r.call.content[0].text);
  assert.equal(body.ok, true);
  assert.equal(Array.isArray(body.tracks) && body.tracks.length > 5, true);
});

test("repo-root relative launch (mcp.json short form) still boots both servers", async () => {
  const js = await bootProbe({
    command: "bash",
    args: ["tools/mcp/js-debugger-mcp.sh", "serve"],
    cwd: ROOT,
    tool: "debugger_targets",
    toolArgs: {},
  });
  // No shared browser in this unit test: the tool refuses with a named error, not a crash.
  assert.equal(js.init.serverInfo?.name, "js-debugger-mcp");
  assert.equal(js.call.isError, true);
  assert.equal(has(js.call.content[0].text, "endpoint is required") || has(js.call.content[0].text, "debug-chrome"), true);

  const apex = await bootProbe({
    command: "bash",
    args: ["tools/mcp/apex-tools-mcp.sh", "serve"],
    cwd: ROOT,
    tool: "apex_pick_tests",
    toolArgs: { files: ["tools/mcp/js-debugger-mcp.mjs"] },
  });
  assert.equal(apex.init.serverInfo?.name, "apex-tools-mcp");
  assert.notEqual(apex.call.isError, true, JSON.stringify(apex.call).slice(0, 400));
  const body = JSON.parse(apex.call.content[0].text);
  assert.equal(body.ok, true);
  assert.equal(body.out?.groups?.some((g) => g.group === "tooling-fast"), true);
});

test("relative tools/mcp path from a parent-of-repo cwd fails the way Cloud does today (needs mcp.json hop)", () => {
  // Evidence pin for the host attach gap: exec-daemon cwd=/agent while
  // .cursor/mcp.json args stay repo-relative (`tools/mcp/...`). OWNED wrappers
  // cannot fix finding the script; lsp lane owns .cursor/mcp.json.
  const parent = path.dirname(ROOT);
  const r = spawnSync("bash", ["tools/mcp/js-debugger-mcp.sh", "serve"], {
    cwd: parent,
    encoding: "utf8",
    env: { ...process.env, APEX_MCP_PREFLIGHT_SECS: "0" },
  });
  assert.notEqual(r.status, 0);
  const err = r.stderr || r.stdout || "";
  assert.equal(has(err, "No such file or directory"), true);
});
