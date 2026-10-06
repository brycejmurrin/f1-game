import assert from "node:assert/strict";
import test from "node:test";
import { startApexHttp } from "../../tools/mcp/apex-http.mjs";

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

test("apex connector rejects a missing token and lists apex_* tools", async () => {
  const mcp = await startApexHttp({ port: 0, token: "secret" });
  try {
    const denied = await post(mcp.url, init);
    assert.equal(denied.status, 401);
    const opened = await post(mcp.url, init, "secret");
    assert.equal(opened.status, 200);
    const hello = await opened.json();
    assert.equal(hello.result.serverInfo.name, "apex-tools-mcp");
    const listed = await post(mcp.url + "?token=secret", {
      jsonrpc: "2.0", id: 2, method: "tools/list", params: {},
    });
    const names = (await listed.json()).result.tools.map((tool) => tool.name);
    assert.ok(names.includes("apex_status"));
    assert.ok(names.every((name) => name.startsWith("apex_")));
    const quiet = await post(mcp.url, { jsonrpc: "2.0", method: "notifications/initialized" }, "secret");
    assert.equal(quiet.status, 202);
  } finally {
    await mcp.close();
  }
});
