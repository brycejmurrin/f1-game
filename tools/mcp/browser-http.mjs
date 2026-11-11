#!/usr/bin/env node
// @doc Phone-sized Chromium over streamable HTTP on 127.0.0.1. Not a .mcp.json server.
// @skill phone-browser
/**
 * Local browser MCP. One process keeps Chromium on the working tree and
 * answers MCP at http://127.0.0.1:<port>/mcp. Chromium is a phone (touch,
 * landscape 852×393, or portrait 393×852). Grok's custom connector cannot see
 * loopback, so tunnel that port and paste the https URL from the phone.
 *
 *   node tools/mcp/browser-http.mjs [--port 3001] [--idle-min 30] [--allow-query-token]
 *   node tools/mcp/browser-http-up.mjs   (cloudflared quick tunnel; it starts this server too)
 *   grok.com/connectors → New Connector → Custom → https://<tunnel>/mcp, header Authorization: Bearer <printed>
 * The token is read from the Authorization header only; --allow-query-token also accepts ?token= for a
 * connector that cannot send headers (that URL is then itself a credential). The server exits after
 * --idle-min minutes with no authenticated request (default 30; 0 disables).
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium, startStaticServer } from "../lib/harness.mjs";
import { chromiumArgsForBackend, gotoGame, installProbeInit } from "../shot/probe-page.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PROTOCOL = "2025-06-18";
const MAX_REQUEST_BYTES = 64_000;

const TOOLS = [
  {
    name: "browser_open",
    description: "Open this game tree in a phone-sized Chromium and wait until it boots.",
    inputSchema: {
      type: "object",
      properties: {
        orientation: { type: "string", enum: ["landscape", "portrait"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "browser_eval",
    description: "Evaluate a JavaScript expression in the open game page.",
    inputSchema: {
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_shot",
    description: "Screenshot the open game page.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "browser_status",
    description: "Whether Chromium is open and which page it is on.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function tokenOk(got, want) {
  const a = Buffer.from(String(got || ""));
  const b = Buffer.from(want);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The bearer token from the Authorization header; ?token= only when the server was started with allowQueryToken. */
export function presentedToken(req, url, { allowQueryToken = false } = {}) {
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (bearer || header) return bearer;   // a header is authoritative: a bad bearer is never rescued by the query
  return allowQueryToken ? url.searchParams.get("token") || "" : "";
}

export const USAGE = "usage: node tools/mcp/browser-http.mjs [--port 3001] [--idle-min 30] [--allow-query-token]";
/** Strict argv: every flag known, every value valid; {help} or {error} otherwise (the caller exits 2 on error). */
export function parseServerArgs(argv) {
  const out = { port: 3001, idleMin: 30, allowQueryToken: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { help: true };
    if (a === "--allow-query-token") { out.allowQueryToken = true; continue; }
    if (a === "--port" || a === "--idle-min") {
      const v = argv[++i];
      const n = Number(v);
      if (v == null || v === "" || !Number.isInteger(n)) return { error: `${a} needs an integer` };
      if (a === "--port") { if (n < 0 || n > 65535) return { error: "--port must be 0-65535" }; out.port = n; }
      else { if (n < 0 || n > 24 * 60) return { error: "--idle-min must be 0-1440" }; out.idleMin = n; }
      continue;
    }
    return { error: `unknown argument ${JSON.stringify(a)}` };
  }
  return out;
}

/** A restartable one-shot timer: fire() after ms of no touch(); ms <= 0 never fires. */
export function idleTimer(ms, fire, { setT = setTimeout, clearT = clearTimeout } = {}) {
  let t = null, stopped = false;
  const arm = () => {
    if (stopped || !(ms > 0)) return;
    if (t) clearT(t);
    const mine = t = setT(() => { if (stopped || t !== mine) return; t = null; fire(); }, ms);   // only the latest arm fires
    t?.unref?.();
  };
  arm();
  return { touch: arm, stop: () => { stopped = true; if (t) clearT(t); t = null; } };
}

const PHONE = {
  landscape: { width: 852, height: 393 },
  portrait: { width: 393, height: 852 },
};
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function startBrowserMcp({ port = 3001, token, root = ROOT, allowQueryToken = false, idleMs = 0, onIdle = null } = {}) {
  if (!token) throw new Error("token required");
  let mcp;
  const idle = idleTimer(idleMs, () => { (onIdle || (() => mcp?.close()))(); });
  const state = { browser: null, context: null, page: null, game: null, orient: null };
  const uploads = new Set(), pending = new Set();
  let closing = false, closePromise;
  function send(res, status, body) {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  }
  const invalid = (code, message) => ({ jsonrpc: "2.0", id: null, error: { code, message } });

  async function ensurePage(orientation) {
    const orient = orientation === "portrait" ? "portrait" : "landscape";
    if (!state.game) state.game = await startStaticServer(root);
    if (state.page && state.orient !== orient) {
      await state.context.close();
      state.context = null;
      state.page = null;
    }
    if (!state.page) {
      if (!state.browser) {
        state.browser = await launchChromium({
          headless: true,
          args: chromiumArgsForBackend("webgl2"),
        });
      }
      const size = PHONE[orient];
      state.context = await state.browser.newContext({
        viewport: size,
        screen: size,
        isMobile: true,
        hasTouch: true,
        userAgent: PHONE_UA,
      });
      state.page = await state.context.newPage();
      state.orient = orient;
      await installProbeInit(state.page, { backend: "webgl2" });
    }
    return state.page;
  }

  async function callTool(name, args) {
    if (name === "browser_status") {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            browser: !!state.page,
            orientation: state.orient,
            game: state.game ? state.game.url : null,
            href: state.page ? state.page.url() : null,
          }),
        }],
      };
    }
    if (name === "browser_open") {
      const page = await ensurePage(args.orientation);
      await gotoGame(page, state.game.url);
      const info = await page.evaluate(() => ({
        title: document.title,
        apex: !!(window.__apex && window.__apex.race),
        width: window.innerWidth,
        height: window.innerHeight,
        desktop: document.body.classList.contains("desktop"),
        coarse: window.matchMedia("(pointer: coarse)").matches,
      }));
      return { content: [{ type: "text", text: JSON.stringify({ url: state.game.url, ...info }) }] };
    }
    if (name === "browser_eval") {
      if (!state.page) throw new Error("call browser_open first");
      const value = await state.page.evaluate(String(args.expression || ""));
      return { content: [{ type: "text", text: JSON.stringify(value) }] };
    }
    if (name === "browser_shot") {
      if (!state.page) throw new Error("call browser_open first");
      const jpeg = await state.page.screenshot({ type: "jpeg", quality: 60 });
      return {
        content: [
          { type: "text", text: `jpeg ${jpeg.length} bytes` },
          { type: "image", data: jpeg.toString("base64"), mimeType: "image/jpeg" },
        ],
      };
    }
    throw new Error("unknown tool " + name);
  }

  function rpc(msg) {
    const id = msg.id;
    const finish = (result) => ({ jsonrpc: "2.0", id, result });
    const fail = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
    if (msg.method === "initialize") {
      return finish({
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "apex-browser", version: "1.0.0" },
      });
    }
    if (msg.method === "ping") return finish({});
    if (msg.method === "tools/list") return finish({ tools: TOOLS });
    if (msg.method === "tools/call") {
      return callTool(String(msg.params?.name || ""), msg.params?.arguments || {})
        .then((result) => finish(result))
        .catch((err) => finish({
          content: [{ type: "text", text: String(err && err.message || err) }],
          isError: true,
        }));
    }
    if (id == null) return null;
    return fail(-32601, "method not found: " + msg.method);
  }

  const server = createServer(async (req, res) => {
    try {
      if (closing) return send(res, 503, invalid(-32603, "Browser MCP is shutting down"));
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/healthz") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, browser: !!state.page }));
        return;
      }
      if (url.pathname !== "/mcp") {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("MCP is at /mcp");
        return;
      }
      if (!tokenOk(presentedToken(req, url, { allowQueryToken }), token)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      idle.touch();   // only an authenticated request keeps the server up
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
      let bytes = 0;
      uploads.add(req);
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > MAX_REQUEST_BYTES) {
          send(res, 413, invalid(-32700, "Request exceeds 64000 bytes"));
          return;
        }
        chunks.push(chunk);
      }
      uploads.delete(req);
      let msg;
      try { msg = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }));
        return;
      }
      if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string" ||
          (msg.params !== undefined && (!msg.params || typeof msg.params !== "object" || Array.isArray(msg.params))) ||
          (msg.id !== undefined && msg.id !== null && typeof msg.id !== "string" && typeof msg.id !== "number")) {
        return send(res, 400, invalid(-32600, "Invalid JSON-RPC request"));
      }
      const task = Promise.resolve().then(() => rpc(msg));
      pending.add(task);
      let out;
      try { out = await task; } finally { pending.delete(task); }
      if (out == null) {
        res.writeHead(202);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    } catch {
      // A phone or tunnel can disconnect halfway through an upload. The
      // IncomingMessage iterator rejects; it must not reject the server callback.
      if (!req.destroyed) send(res, 500, invalid(-32603, "Browser MCP request failed"));
    } finally { uploads.delete(req); }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", ok);
  });
  const actual = server.address().port;
  return mcp = {
    port: actual,
    token,
    url: `http://127.0.0.1:${actual}/mcp`,
    close: () => {
      if (!closePromise) closePromise = (async () => {
        closing = true;
        idle.stop();
        const stopped = new Promise((r) => server.close(() => r()));
        // server.close does not end active uploads (Node's HTTP contract).
        // Stop those first, while letting already-dispatched calls finish.
        for (const req of uploads) req.destroy();
        try {
          await Promise.allSettled([...pending]);
          if (state.browser) await state.browser.close().catch(() => {});
          if (state.game) await state.game.close();
        } finally {
          server.closeAllConnections();
          await stopped;
        }
      })();
      return closePromise;
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseServerArgs(process.argv.slice(2));
  if (opts.help) { console.log(USAGE); process.exit(0); }
  if (opts.error) { console.error(`browser-http: ${opts.error}\n${USAGE}`); process.exit(2); }
  const token = process.env.APEX_MCP_TOKEN || randomBytes(18).toString("hex");
  const exitIdle = () => { console.log(`apex browser MCP: no authenticated request for ${opts.idleMin} min; exiting`); mcp.close().then(() => process.exit(0)); };
  const mcp = await startBrowserMcp({ port: opts.port, token, allowQueryToken: opts.allowQueryToken, idleMs: opts.idleMin * 60000, onIdle: exitIdle });
  console.log("apex browser MCP");
  console.log("  local:  " + mcp.url);
  console.log("  header: Authorization: Bearer " + token);
  if (opts.allowQueryToken) console.log("  query:  " + mcp.url + "?token=" + token + "   (this URL is a credential)");
  console.log("  idle:   exits after " + (opts.idleMin || "no") + " idle minute(s)");
  console.log("  tunnel: node tools/mcp/browser-http-up.mjs (cloudflared, port " + mcp.port + ")");
  const stop = async () => { await mcp.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
