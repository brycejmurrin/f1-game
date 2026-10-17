// @doc Persistent loopback JSON-RPC bridge for the debugger's separate shell-call processes.
import http from "node:http";
import { DebugSession } from "./js-debugger-session.mjs";
import { handleRpc, TOOLS } from "./js-debugger-mcp.mjs";

export const DEFAULT_PORT = 3714;
export function debuggerPort(raw = process.env.APEX_DEBUGGER_PORT) {
  if (raw === undefined) return DEFAULT_PORT;
  if (!/^\d+$/.test(String(raw)) || Number(raw) < 0 || Number(raw) > 65535) throw Error("APEX_DEBUGGER_PORT must be 0..65535 (0 only for serve-http)");
  return Number(raw);
}
const rpcError = (code, message) => ({ jsonrpc: "2.0", id: null, error: { code, message } });
function send(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}
export function httpRefusal(req) {
  if (!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i.test(String(req.headers.host || ""))) return "Host must be loopback";
  // This bridge is for CLI agents, not website scripts (including local ones).
  if (req.headers.origin !== undefined) return "Browser Origin is not allowed";
  if (req.method === "POST" && !/^application\/json\s*(?:;|$)/i.test(String(req.headers["content-type"] || ""))) return "Content-Type must be application/json";
  const version = req.headers["mcp-protocol-version"];
  if (version && !["2025-03-26", "2025-06-18"].includes(version)) return "Unsupported MCP protocol version";
  return "";
}
export async function startDebuggerHttp({ port = debuggerPort(), session = new DebugSession() } = {}) {
  const pending = new Set(), uploads = new Set();
  let closing = false, closePromise;
  const server = http.createServer((req, res) => {
    const refusal = httpRefusal(req);
    if (refusal) return send(res, refusal.startsWith("Unsupported") ? 400 : 403, rpcError(-32600, refusal));
    if (closing) return send(res, 503, rpcError(-32603, "Debugger is shutting down"));
    if (req.method === "GET" && req.url === "/healthz") return send(res, 200, {
      ok: true, name: "js-debugger-mcp", pid: process.pid, tools: TOOLS.length, connected: session.state().connected,
    });
    if (req.url !== "/mcp") return send(res, 404, rpcError(-32600, "Unknown path"));
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return send(res, 405, rpcError(-32600, "Use POST; no SSE stream")); }
    if (pending.size >= 32) return send(res, 429, rpcError(-32603, "Too many debugger requests"));
    let finish;
    const task = new Promise(resolve => { finish = resolve; });
    pending.add(task); uploads.add(req);
    let bytes = 0, chunks = [], ended = false;
    const done = () => { uploads.delete(req); if (!ended) { ended = true; pending.delete(task); finish(); } };
    req.on("error", done);
    req.on("aborted", done);
    req.on("data", chunk => {
      bytes += chunk.length;
      if (bytes > 64000) { send(res, 413, rpcError(-32700, "Request exceeds 64000 bytes")); chunks = []; }
      else chunks.push(chunk);
    });
    req.on("end", async () => {
      uploads.delete(req);
      try {
        if (bytes > 64000) return;
        let msg;
        try { msg = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
        catch { return send(res, 400, rpcError(-32700, "Invalid JSON")); }
        const out = await handleRpc(session, msg);
        send(res, out ? 200 : 202, out ?? undefined);
      } catch { send(res, 500, rpcError(-32603, "Debugger request failed")); }
      finally { done(); }
    });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
  });
  return {
    server, session, endpoint: `http://127.0.0.1:${server.address().port}`,
    close() {
      if (!closePromise) closePromise = (async () => {
        closing = true;
        const stopped = new Promise(resolve => server.close(resolve));
        // An incomplete upload has not dispatched a debugger command. Do not
        // let it hold a paused Chrome hostage while waiting for a body timeout.
        for (const req of uploads) req.destroy();
        await Promise.allSettled([...pending]);
        const cleanup = await session.detach();
        server.closeAllConnections(); await stopped;
        return cleanup;
      })();
      return closePromise;
    },
  };
}
export async function debuggerRequest(path, body, port = debuggerPort()) {
  if (!port) throw Error("A shell client needs a nonzero APEX_DEBUGGER_PORT");
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(35000),
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) { throw Error(`Debugger daemon unavailable (nothing listening on 127.0.0.1:${port}) or request timed out; start js-debugger-mcp.sh serve-http on port ${port}. A timeout does not cancel execution. (${e.cause?.code || e.name})`); }
  const reader = response.body.getReader();
  let size = 0, chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      // A 128KB tool body appears twice; escaping content.text can add a third
      // body's worth of bytes. Leave room for that and the JSON-RPC envelope.
      if (size > 512000) { await reader.cancel(); throw Error("Debugger response exceeds 512000 bytes"); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!response.ok) throw Error(result.error?.message || `Debugger HTTP ${response.status}`);
  if (result.error) throw Error(result.error.message);
  return result;
}
