#!/usr/bin/env node
// @doc Streamable-HTTP MCP on 127.0.0.1 that opens this tree in Chromium. Tunnel the printed URL for a Grok custom connector. Not a .mcp.json server.
// @skill mcp-probe
/**
 * Local browser MCP. One process keeps Chromium on the working tree and
 * answers MCP at http://127.0.0.1:<port>/mcp. Chromium is a phone (touch,
 * landscape 852×393, or portrait 393×852). Grok's custom connector cannot see
 * loopback, so tunnel that port and paste the https URL from the phone.
 *
 *   node tools/mcp/browser-http.mjs
 *   ngrok http 3001
 *   grok.com/connectors → New Connector → Custom → https://<tunnel>/mcp?token=<printed>
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium, startStaticServer } from "../lib/harness.mjs";
import { chromiumArgsForBackend, gotoGame, installProbeInit } from "../shot/probe-page.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PROTOCOL = "2025-06-18";

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

function presentedToken(req, url) {
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return bearer || url.searchParams.get("token") || "";
}

const PHONE = {
  landscape: { width: 852, height: 393 },
  portrait: { width: 393, height: 852 },
};
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export async function startBrowserMcp({ port = 3001, token, root = ROOT } = {}) {
  if (!token) throw new Error("token required");
  const state = { browser: null, context: null, page: null, game: null, orient: null };

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
    const out = await rpc(msg);
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
    close: async () => {
      await new Promise((r) => server.close(() => r()));
      if (state.browser) await state.browser.close().catch(() => {});
      if (state.game) await state.game.close();
    },
  };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log("usage: node tools/mcp/browser-http.mjs [--port 3001]");
    process.exit(0);
  }
  const token = process.env.APEX_MCP_TOKEN || randomBytes(18).toString("hex");
  const mcp = await startBrowserMcp({ port: Number(arg("--port", "3001")), token });
  console.log("apex browser MCP");
  console.log("  local:  " + mcp.url + "?token=" + token);
  console.log("  header: Authorization: Bearer " + token);
  console.log("  tunnel: ngrok http " + mcp.port);
  console.log("  Grok:   grok.com/connectors → New Connector → Custom");
  console.log("          https://<the-tunnel-host>/mcp?token=" + token);
  const stop = async () => { await mcp.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
