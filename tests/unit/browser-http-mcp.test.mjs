import assert from "node:assert/strict";
import test from "node:test";
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
