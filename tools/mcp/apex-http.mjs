#!/usr/bin/env node
// @doc Grok connector for apex_* tools: streamable HTTP on 127.0.0.1:3714 with a bearer token. Not a .mcp.json server.
// @skill apex-connector
/**
 * Same shape as tools/mcp/browser-http.mjs. Grok's custom connector cannot
 * see loopback and cannot spawn the stdio server in .mcp.json, so this
 * process stays up and a tunnel publishes it.
 *
 *   node tools/mcp/apex-http.mjs
 *   node tools/mcp/apex-http-up.mjs
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleRpc } from "./apex-tools-mcp.mjs";

export const APEX_HTTP_PORT = 3714;

function tokenOk(got, want) {
  const a = Buffer.from(String(got || ""));
  const b = Buffer.from(want);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function presentedToken(req, url) {
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return bearer || url.searchParams.get("token") || "";
}

export async function startApexHttp({ port = APEX_HTTP_PORT, token } = {}) {
  if (!token) throw new Error("token required");
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, name: "apex-tools-mcp" }));
      return;
    }
    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("MCP is at /mcp");
      return;
    }
    if (!tokenOk(presentedToken(req, url), token)) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (req.method === "GET" || req.method === "DELETE") {
      res.writeHead(405, { allow: "POST" });
      res.end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let msg;
    try { msg = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
    catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }));
      return;
    }
    const out = await handleRpc(msg);
    if (out == null) {
      res.writeHead(202);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(out));
  });
  server.requestTimeout = 0;
  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", ok);
  });
  const actual = server.address().port;
  return {
    port: actual,
    token,
    url: `http://127.0.0.1:${actual}/mcp`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("usage: node tools/mcp/apex-http.mjs [--port 3714]");
    process.exit(0);
  }
  const token = process.env.APEX_MCP_TOKEN || randomBytes(18).toString("hex");
  const mcp = await startApexHttp({ port: Number(arg("--port", String(APEX_HTTP_PORT))), token });
  console.log("apex tools MCP");
  console.log("  local:  " + mcp.url + "?token=" + token);
  console.log("  header: Authorization: Bearer " + token);
  console.log("  Grok:   grok.com/connectors → New Connector → Custom");
  console.log("          https://<the-tunnel-host>/mcp?token=" + token);
  const stop = async () => { await mcp.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
