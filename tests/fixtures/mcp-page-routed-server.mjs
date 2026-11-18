#!/usr/bin/env node
// A stand-in chrome-devtools-mcp for tests/unit/mcp-cli.test.mjs: page tools
// REQUIRE `pageId` (chrome-devtools-mcp 1.11 `pageIdRouting`), new_page reports
// page 7 as selected, and every tools/call is appended to $MCP_FAKE_LOG.
import fs from "node:fs";
import readline from "node:readline";

const page = { type: "object", properties: { pageId: { type: "number" } }, required: ["pageId"] };
const tools = [
  { name: "new_page", inputSchema: { type: "object", properties: { url: { type: "string" } } } },
  { name: "list_pages", inputSchema: { type: "object", properties: {} } },
  { name: "evaluate_script", inputSchema: page },
  { name: "navigate_page", inputSchema: page },
  { name: "list_console_messages", inputSchema: page },
];
const out = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line);
  if (!m.id) return;
  if (m.method === "initialize") return out(m.id, { serverInfo: { name: "fake", version: "0" } });
  if (m.method === "tools/list") return out(m.id, { tools });
  const { name, arguments: a = {} } = m.params;
  fs.appendFileSync(process.env.MCP_FAKE_LOG, JSON.stringify({ name, pageId: a.pageId ?? null }) + "\n");
  if (name === "new_page" || name === "list_pages") {
    return out(m.id, { content: [{ type: "text", text: "## Pages\n1: about:blank\n7: http://127.0.0.1:3456/ [selected]" }] });
  }
  const tool = tools.find((t) => t.name === name);
  const bad = tool && tool.inputSchema.required && typeof a.pageId !== "number";
  out(m.id, bad ? { isError: true, content: [{ type: "text", text: "pageId: Invalid input: expected number, received undefined" }] }
    : { content: [{ type: "text", text: "ok" }] });
});
