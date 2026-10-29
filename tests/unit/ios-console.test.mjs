// No phone: argument parsing, tab choice, message format and a loopback fake of the proxy's page socket (tools/mcp/ios-console.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { parseArgs, pickTab, formatMessage, tail } from "../../tools/mcp/ios-console.mjs";

test("parseArgs defaults and refusals", () => {
  assert.deepEqual(parseArgs([]), { cmd: "status", port: 9222, seconds: 20, match: "", json: false });
  assert.equal(parseArgs(["console", "--match", "apex", "--seconds", "5", "--json"]).seconds, 5);
  assert.throws(() => parseArgs(["console", "--seconds"]), /needs a value/);
  assert.throws(() => parseArgs(["console", "--port", "x"]), /number/);
  assert.throws(() => parseArgs(["console", "--bogus"]), /unknown/);
});
test("pickTab skips tabs without a socket and honours --match", () => {
  const tabs = [{ url: "a" }, { url: "https://x/apex", webSocketDebuggerUrl: "ws://1" }, { url: "https://y", webSocketDebuggerUrl: "ws://2" }];
  assert.equal(pickTab(tabs).webSocketDebuggerUrl, "ws://1");
  assert.equal(pickTab(tabs, "https://y").webSocketDebuggerUrl, "ws://2");
  assert.equal(pickTab(tabs, "nope"), null);
});
test("formatMessage reads the WebKit Console.messageAdded shape", () => {
  assert.equal(formatMessage({ message: { level: "error", text: "boom", url: "u.js", line: 3 } }), "[error] boom (u.js:3)");
  assert.equal(formatMessage({ message: { level: "log", text: "hi" } }, true), '{"level":"log","text":"hi"}');
});
test("tail enables Console and prints messageAdded from a fake proxy", async () => {
  const sent = [];
  const Real = globalThis.WebSocket;
  globalThis.WebSocket = class { constructor() { setTimeout(() => this.onopen(), 0); }
    send(s) { sent.push(JSON.parse(s)); setTimeout(() => this.onmessage({ data: JSON.stringify({ method: "Console.messageAdded", params: { message: { level: "warning", text: "gpu lost" } } }) }), 0); }
    close() {} };
  const srv = http.createServer((q, r) => r.end(JSON.stringify([{ title: "Apex", url: "https://x/apex", webSocketDebuggerUrl: "ws://fake" }]))).listen(0);
  await new Promise(r => srv.once("listening", r));
  const lines = [];
  try { await tail({ port: srv.address().port, match: "", seconds: 0.05, json: false }, l => lines.push(l)); }
  finally { globalThis.WebSocket = Real; srv.close(); }
  assert.equal(sent[0].method, "Console.enable");
  assert.deepEqual(lines, ["# Apex https://x/apex", "[warning] gpu lost"]);
});
