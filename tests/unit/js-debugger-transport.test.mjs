// js-debugger transports: CDP timeouts, JSON-RPC, stdio, wrapper shell and HTTP. No browser.
// Split from js-debugger-mcp.test.mjs (T3-16); fixtures live in tests/helpers/js-debugger-rig.mjs.
import { nativeMcpConfig } from "../helpers/agent-output-launch.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { Cdp } from "../../tools/mcp/js-debugger-cdp.mjs";
import { DebugSession } from "../../tools/mcp/js-debugger-session.mjs";
import { handleRpc } from "../../tools/mcp/js-debugger-mcp.mjs";
import http from "node:http";
import { startDebuggerHttp, debuggerRequest, debuggerPort, httpRefusal } from "../../tools/mcp/js-debugger-http.mjs";
import { frame, paused, attached } from "../helpers/js-debugger-rig.mjs";

test("CDP timeout and close reject pending calls without claiming cancellation", async () => {
  const socket = new EventTarget(); socket.readyState = 1; socket.send = () => {}; socket.close = () => {};
  const c = new Cdp(socket, 5);
  await assert.rejects(c.send("Runtime.evaluate"), /execution may still be active/);
  const pending = c.send("Debugger.enable"); c.close(); await assert.rejects(pending, /detached/); assert.equal(c.pending.size, 0);
});
test("JSON-RPC protocol responds to initialize/list/ping, not notifications", async () => {
  const s = new DebugSession();
  const request = method => ({ jsonrpc: "2.0", id: 1, method });
  assert.equal((await handleRpc(s, request("initialize"))).result.serverInfo.name, "js-debugger-mcp");
  assert.equal((await handleRpc(s, request("tools/list"))).result.tools.length, 22);
  assert.equal(await handleRpc(s, { jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.equal((await handleRpc(s, request("missing"))).error.code, -32601);
  assert.equal((await handleRpc(s, [])).error.code, -32600);
});
test("tools/call allows omitted arguments but rejects explicit null and other non-objects before dispatch", async () => {
  const s = new DebugSession(); let reads = 0;
  s.state = () => { reads++; return { connected: false }; };
  const request = args => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "debugger_state", ...args } });
  assert.equal((await handleRpc(s, request({}))).result.structuredContent.connected, false);
  for (const argumentsValue of [null, [], "", 0, false]) {
    assert.equal((await handleRpc(s, request({ arguments: argumentsValue }))).error.code, -32602);
  }
  assert.equal(reads, 1, "invalid argument envelopes must not dispatch even a zero-argument tool");
});
test("real stdio subprocess discovery and malformed JSON recovery, no browser launch", async () => {
  const child = spawn(process.execPath, ["tools/mcp/js-debugger-mcp.mjs"], { cwd: new URL("../..", import.meta.url), stdio: ["pipe", "pipe", "pipe"] });
  let out = "", err = ""; child.stdout.on("data", b => { out += b; }); child.stderr.on("data", b => { err += b; });
  child.stdin.end('bad json\n{"jsonrpc":"2.0","id":1,"method":"initialize"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"debugger_state","arguments":null}}\n');
  const [code] = await once(child, "exit"); assert.equal(code, 0, err);
  const rows = out.trim().split("\n").map(JSON.parse); assert.equal(rows.length, 4); assert.equal(rows[0].error.code, -32700);
  assert.equal(rows.find(r => r.id === 2).result.tools.length, 22);
  assert.equal(rows.find(r => r.id === 3).error.code, -32602);
});
test("project catalogs launch the separate debugger wrapper and discover its tools", async () => {
  const read = path => JSON.parse(readFileSync(new URL("../../" + path, import.meta.url), "utf8"));
  const cfg = read(".mcp.json");
  assert.deepEqual(cfg, read(".cursor/mcp.json"));
  const server = nativeMcpConfig(cfg).mcpServers["js-debugger"];
  assert.deepEqual(server, read("tools/mcp/js-debugger-mcp.json").mcpServers["js-debugger"]);
  const child = spawn(server.command, server.args, { cwd: new URL("../..", import.meta.url), stdio: ["pipe", "pipe", "pipe"] });
  let out = "", err = ""; child.stdout.on("data", b => { out += b; }); child.stderr.on("data", b => { err += b; });
  child.stdin.end('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"debugger_state"}}\n');
  assert.equal((await once(child, "exit"))[0], 0, err);
  const rows = out.trim().split("\n").map(JSON.parse);
  assert.equal(rows.find(r => r.id === 1).result.serverInfo.name, "js-debugger-mcp");
  assert.equal(rows.find(r => r.id === 2).result.tools.length, 22);
  assert.equal(rows.find(r => r.id === 3).result.structuredContent.connected, false);
});

async function shell(command, port) {
  const child = spawn("bash", [new URL("../../tools/mcp/js-debugger-mcp.sh", import.meta.url).pathname, ...command],
    { cwd: new URL("..", import.meta.url), env: { ...process.env, APEX_DEBUGGER_PORT: String(port) } });
  let out = "", err = "";
  child.stdout.on("data", b => { out += b; }); child.stderr.on("data", b => { err += b; });
  const [code] = await once(child, "exit"); return { code, body: JSON.parse(out), err };
}
test("wrapper shell calls share attachment, breakpoint and pause state across subprocesses", async () => {
  const { s, c } = await attached();
  const daemon = await startDebuggerHttp({ session: s, port: 0 });
  const port = daemon.server.address().port;
  try {
    assert.equal((await shell(["status"], port)).body.connected, true);
    assert.equal((await shell(["call", "debugger_breakpoint", JSON.stringify({ url: frame.url, line: 4 })], port)).code, 0);
    paused(c); const token = s.pause.token;
    const snapshot = await shell(["call", "debugger_state", "{}"], port);
    assert.equal(snapshot.body.breakpointCount, 1); assert.equal(snapshot.body.pause.token, token);
    c.reply = async method => { if (method === "Debugger.evaluateOnCallFrame") return { result: { type: "number", value: 42 } }; return {}; };
    assert.equal((await shell(["call", "debugger_evaluate", JSON.stringify({ pauseToken: token, expression: "answer" })], port)).body.result.value, 42);
    assert.equal((await shell(["call", "debugger_evaluate", JSON.stringify({ pauseToken: "stale", expression: "answer" })], port)).code, 1);
    assert.equal((await shell(["call", "debugger_detach", "{}"], port)).code, 0);
    assert.equal((await shell(["status"], port)).body.connected, false);
  } finally { await daemon.close(); }
});
test("HTTP transports bounded source results with escaped ASCII and Unicode", async () => {
  const { s, c } = await attached();
  const daemon = await startDebuggerHttp({ session: s, port: 0 });
  const port = daemon.server.address().port;
  try {
    for (const [character, count] of [["\"", 60], ["漢", 40]]) {
      c.reply = async method => method === "Debugger.getScriptSource"
        ? { scriptSource: (character.repeat(990) + "\n").repeat(count) } : {};
      c.emit("Debugger.scriptParsed", { scriptId: "s1", url: frame.url, startLine: 0, endLine: count });
      const result = await debuggerRequest("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "debugger_source", arguments: { scriptId: "s1", count } } }, port);
      assert.equal(result.result.isError, false);
      assert.equal(result.result.structuredContent.source.split("\n").length, count);
      assert.ok(result.result.structuredContent.source.includes(character.repeat(990)));
      assert.equal(result.result.content[0].text, JSON.stringify(result.result.structuredContent));
    }
  } finally { await daemon.close(); }
});
test("HTTP reports oversized Unicode tool bodies as explicit tool errors", async () => {
  const { s, c } = await attached();
  c.reply = async method => method === "Debugger.getScriptSource"
    ? { scriptSource: ("漢".repeat(990) + "\n").repeat(60) } : {};
  c.emit("Debugger.scriptParsed", { scriptId: "s1", url: frame.url, startLine: 0, endLine: 60 });
  const daemon = await startDebuggerHttp({ session: s, port: 0 });
  try {
    const result = await debuggerRequest("/mcp", { jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "debugger_source", arguments: { scriptId: "s1", count: 60 } } }, daemon.server.address().port);
    assert.equal(result.result.isError, true);
    assert.match(result.result.structuredContent.error, /Result exceeds 128KB; narrow the request/);
  } finally { await daemon.close(); }
});
test("HTTP rejects browser origins, rebound hosts, non-JSON, bad versions and oversized requests before dispatch", async () => {
  const s = new DebugSession(); let dispatched = 0;
  s.state = () => { dispatched++; return { connected: false }; };
  const daemon = await startDebuggerHttp({ session: s, port: 0 });
  const post = (body, headers = {}) => new Promise((resolve, reject) => {
    const req = http.request(daemon.endpoint + "/mcp", { method: "POST", headers: { "Content-Type": "application/json", ...headers } }, res => {
      res.resume(); res.on("end", () => resolve(res.statusCode));
    }); req.on("error", reject); req.end(body);
  });
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "debugger_state" } });
  try {
    for (const headers of [{ Origin: "http://evil.test" }, { Origin: "http://localhost:3456" }, { Host: "127.0.0.1.evil.test" }, { "Content-Type": "text/plain" }]) {
      assert.equal(await post(body, headers), 403);
    }
    assert.equal(await post(body, { "MCP-Protocol-Version": "invalid" }), 400);
    assert.equal(await post("{"), 400);
    assert.equal(await post(" ".repeat(64001)), 413); assert.equal(dispatched, 0);
    assert.equal(await post(body), 200); assert.equal(dispatched, 1);
  } finally { await daemon.close(); }
});
test("HTTP notifications return202, unsupported SSE gets405, errors do not poison the daemon", async () => {
  const daemon = await startDebuggerHttp({ port: 0 });
  try {
    assert.equal((await fetch(daemon.endpoint + "/mcp")).status, 405);
    const headers = { "Content-Type": "application/json" };
    const notification = await fetch(daemon.endpoint + "/mcp", { method: "POST", headers,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    assert.equal(notification.status, 202); assert.equal(await notification.text(), "");
    const port = daemon.server.address().port;
    await assert.rejects(debuggerRequest("/mcp", { jsonrpc: "2.0", id: 1, method: "missing" }, port), /Method not found/);
    assert.equal((await debuggerRequest("/healthz", undefined, port)).name, "js-debugger-mcp");
    const [a, b] = await Promise.all([daemon.close(), daemon.close()]); assert.equal(a, b);
  } finally { await daemon.close(); }
});
test("wrapper validates port and missing-daemon calls fail without creating a session", async () => {
  for (const value of ["", "-1", "65536", "3714x"]) assert.throws(() => debuggerPort(value));
  assert.equal(debuggerPort("3714"), 3714);
  assert.ok(httpRefusal({ method: "GET", headers: {} }));
  const daemon = await startDebuggerHttp({ port: 0 }); const port = daemon.server.address().port; await daemon.close();
  const result = await shell(["call", "debugger_state", "{}"], port);
  assert.equal(result.code, 1); assert.match(result.body.error, /start js-debugger-mcp.sh serve-http/);
  assert.equal((await shell(["list-tools"], port)).body.length, 22);
});
test("daemon shutdown drops incomplete uploads before cleaning up a paused target", { timeout: 3000 }, async () => {
  const { s, c } = await attached(); paused(c);
  const daemon = await startDebuggerHttp({ session: s, port: 0 });
  const arrived = once(daemon.server, "request");
  const req = http.request(daemon.endpoint + "/mcp", { method: "POST", headers: { "Content-Type": "application/json" } });
  req.on("error", () => {}); req.write("{");
  try {
    await arrived; const result = await daemon.close();
    assert.deepEqual(result.cleanupErrors, []); assert.equal(c.closed, true);
    assert.ok(c.calls.some(x => x.method === "Debugger.resume"));
  } finally { req.destroy(); await daemon.close(); }
});
