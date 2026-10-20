import assert from "node:assert/strict";
import test from "node:test";
import net from "node:net";
import { once } from "node:events";
import { startBrowserMcp } from "../../tools/mcp/browser-http.mjs";

const init = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  },
};

async function post(url, body, token) {
  return fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: "Bearer " + token } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function partialUpload(mcp) {
  const url = new URL(mcp.url);
  const socket = net.connect(Number(url.port), "127.0.0.1");
  socket.on("error", () => {}); // A shutdown deliberately destroys this upload.
  await once(socket, "connect");
  socket.write(`POST /mcp?token=secret HTTP/1.1\r\nHost: ${url.host}\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{`);
  // A second request is handled only after the earlier socket's data has
  // reached this process; this also proves the server remains responsive.
  await (await post(mcp.url, init, "secret")).arrayBuffer();
  return socket;
}

test("browser MCP rejects malformed envelopes and oversized uploads, then still answers", async () => {
  const mcp = await startBrowserMcp({ port: 0, token: "secret" });
  try {
    for (const value of [null, [], true, 1, "ping", {}, { ...init, jsonrpc: "1.0" }, { ...init, method: null }, { ...init, params: null }, { ...init, id: {} }]) {
      const response = await post(mcp.url, value, "secret");
      assert.equal(response.status, 400, JSON.stringify(value));
      assert.equal((await response.json()).error.code, -32600);
    }
    for (const body of ["", "{"]) {
      const response = await fetch(mcp.url + "?token=secret", { method: "POST", body });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, -32700);
    }
    const large = await post(mcp.url, { ...init, padding: "x".repeat(64_000) }, "secret");
    assert.equal(large.status, 413);
    assert.match((await large.json()).error.message, /64000/);
    assert.equal((await (await post(mcp.url, init, "secret")).json()).result.serverInfo.name, "apex-browser");
  } finally { await mcp.close(); }
});

test("browser MCP survives an aborted upload and shuts down with an incomplete upload", { timeout: 5000 }, async () => {
  const mcp = await startBrowserMcp({ port: 0, token: "secret" });
  let socket;
  try {
    socket = await partialUpload(mcp);
    const aborted = once(socket, "close");
    socket.destroy();
    await aborted;
    assert.equal((await (await post(mcp.url, init, "secret")).json()).result.serverInfo.name, "apex-browser");
    socket = await partialUpload(mcp);
    const closed = once(socket, "close");
    const shutdown = mcp.close();
    assert.equal(mcp.close(), shutdown, "concurrent shutdown shares cleanup");
    await shutdown;
    await closed;
    await assert.rejects(fetch(mcp.url + "?token=secret"), /fetch failed/);
  } finally { socket?.destroy(); await mcp.close(); }
});

test("browser MCP rejects a missing token and lists its tools", async () => {
  const mcp = await startBrowserMcp({ port: 0, token: "secret" });
  try {
    const denied = await post(mcp.url, init);
    assert.equal(denied.status, 401);
    const opened = await post(mcp.url, init, "secret");
    assert.equal(opened.status, 200);
    const hello = await opened.json();
    assert.equal(hello.result.serverInfo.name, "apex-browser");
    const listed = await post(mcp.url + "?token=secret", {
      jsonrpc: "2.0", id: 2, method: "tools/list", params: {},
    });
    const names = (await listed.json()).result.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, ["browser_eval", "browser_open", "browser_shot", "browser_status"]);
    const quiet = await post(mcp.url, { jsonrpc: "2.0", method: "notifications/initialized" }, "secret");
    assert.equal(quiet.status, 202);
  } finally {
    await mcp.close();
  }
});

test("browser MCP refuses a WRONG token (same and different length), even beside a valid query token", async () => {
  const mcp = await startBrowserMcp({ port: 0, token: "secret" });
  try {
    for (const bad of ["secreT", "s", "secret-but-longer"]) {
      const r = await post(mcp.url, init, bad);
      assert.equal(r.status, 401, `bearer ${bad}`);
    }
    // the Authorization header wins over ?token=, so a bad bearer cannot be rescued by a good query token
    const mixed = await post(mcp.url + "?token=secret", init, "wrong!");
    assert.equal(mixed.status, 401);
  } finally {
    await mcp.close();
  }
});

test("browser MCP answers ping, tools/call (status, unknown tool, no page yet) and an unknown method", async () => {
  const mcp = await startBrowserMcp({ port: 0, token: "secret" });
  try {
    const ping = await (await post(mcp.url, { jsonrpc: "2.0", id: 7, method: "ping" }, "secret")).json();
    assert.deepEqual(ping, { jsonrpc: "2.0", id: 7, result: {} });

    const status = await (await post(mcp.url, { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "browser_status", arguments: {} } }, "secret")).json();
    const body = JSON.parse(status.result.content[0].text);
    assert.equal(body.browser, false, "nothing launched by a status call");
    assert.equal(body.href, null);

    const unknown = await (await post(mcp.url, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "nope", arguments: {} } }, "secret")).json();
    assert.equal(unknown.result.isError, true);
    assert.match(unknown.result.content[0].text, /unknown tool nope/);

    const early = await (await post(mcp.url, { jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "browser_eval", arguments: { expression: "1" } } }, "secret")).json();
    assert.equal(early.result.isError, true);
    assert.match(early.result.content[0].text, /call browser_open first/);

    const nomethod = await (await post(mcp.url, { jsonrpc: "2.0", id: 11, method: "bogus/method" }, "secret")).json();
    assert.equal(nomethod.error.code, -32601);
  } finally {
    await mcp.close();
  }
});
