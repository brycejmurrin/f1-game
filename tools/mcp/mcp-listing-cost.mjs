#!/usr/bin/env node
// @doc Sizes each .mcp.json server's tools/list: tool count, chars, est. tokens, names-only cost. `--json`, `--entry`.
// @skill agent-config
/* mcp-listing-cost — spawn every server exactly as `.mcp.json` launches it (through
 * the output-level wrapper), run initialize + tools/list (all pages), and size what
 * a client that loads every schema pays versus one that defers schemas and lists
 * names only (Claude Code's ToolSearch). Tokens are an estimate (chars / 4); the
 * note docs/notes/MCP-SINGLE-TOOL-REDESIGN-2026-10-20.md records the method.
 *
 *   node tools/mcp/mcp-listing-cost.mjs                 # table, every server
 *   node tools/mcp/mcp-listing-cost.mjs --only=apex-tools --json
 *   node tools/mcp/mcp-listing-cost.mjs --entry 'apex-one=bash tools/mcp/apex-tools-mcp.sh serve --one-tool'
 *
 * Read-only: it starts no browser (tools/list never launches one) and writes nothing.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TIMEOUT_MS = 90_000;

/** chars / 4: the usual English+JSON estimate; good to ±25 %, enough to rank servers. */
export const estTokens = (chars) => Math.round(chars / 4);

/** Size one tools/list result for a server named `server`. Pure: unit-tested. */
export function sizeListing(server, tools, instructions = "") {
  const rows = tools.map((t) => ({
    name: t.name,
    nameChars: t.name.length,
    descChars: (t.description || "").length,
    inputChars: JSON.stringify(t.inputSchema || {}).length,
    outputChars: t.outputSchema ? JSON.stringify(t.outputSchema).length : 0,
    totalChars: JSON.stringify(t).length,
  }));
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  // A deferring client lists `mcp__<server>__<tool>` once per line.
  const deferredChars = tools.reduce((a, t) => a + `mcp__${server}__${t.name}\n`.length, 0);
  const fullChars = JSON.stringify(tools).length;
  return {
    server, tools: rows.length,
    nameChars: sum("nameChars"), descChars: sum("descChars"),
    inputChars: sum("inputChars"), outputChars: sum("outputChars"),
    fullChars, fullTokens: estTokens(fullChars),
    deferredChars, deferredTokens: estTokens(deferredChars),
    instructionsChars: instructions.length,
    largest: [...rows].sort((a, b) => b.totalChars - a.totalChars).slice(0, 3).map((r) => `${r.name}:${r.totalChars}`),
  };
}

/** Run initialize + every tools/list page against one stdio command. */
export function listServer(command, args, { timeoutMs = TIMEOUT_MS, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env, stdio: ["pipe", "pipe", "pipe"] });
    let buf = "", stderr = "", nextId = 1, instructions = "";
    const tools = [];
    const waiting = new Map();
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`timeout after ${timeoutMs} ms; stderr: ${stderr.slice(-400)}`)); }, timeoutMs);
    const send = (method, params) => {
      const id = nextId++;
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }) + "\n");
      return new Promise((res) => waiting.set(id, res));
    };
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("exit", (code) => { if (waiting.size) { clearTimeout(timer); reject(new Error(`exited ${code} mid-listing; stderr: ${stderr.slice(-400)}`)); } });
    child.stdout.on("data", (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith("{")) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        const res = waiting.get(msg.id);
        if (res) { waiting.delete(msg.id); res(msg); }
      }
    });
    (async () => {
      const init = await send("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcp-listing-cost", version: "1" } });
      if (init.error) throw new Error(`initialize: ${init.error.message}`);
      instructions = init.result?.instructions || "";
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
      let cursor;
      do {
        const page = await send("tools/list", cursor ? { cursor } : undefined);
        if (page.error) throw new Error(`tools/list: ${page.error.message}`);
        tools.push(...(page.result?.tools || []));
        cursor = page.result?.nextCursor;
      } while (cursor);
      clearTimeout(timer);
      child.stdin.end(); child.kill("SIGTERM");
      resolve({ tools, instructions });
    })().catch((e) => { clearTimeout(timer); child.kill("SIGTERM"); reject(e); });
  });
}

function parseArgs(argv) {
  const out = { json: false, only: null, entries: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a.startsWith("--only=")) out.only = a.slice(7).split(",");
    else if (a === "--entry") {
      const spec = argv[++i] || "", eq = spec.indexOf("=");
      if (eq < 1) throw new Error("--entry needs NAME=command args...");
      out.entries.push({ name: spec.slice(0, eq), cmd: spec.slice(eq + 1).trim().split(/\s+/) });
    }
    else if (a === "--help" || a === "-h") { process.stdout.write(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]); process.exit(0); }
    else throw new Error(`unknown arg ${a}`);
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, ".mcp.json"), "utf8")).mcpServers;
  const targets = [
    ...Object.entries(cfg).map(([name, s]) => ({ name, command: s.command, args: s.args })),
    ...opts.entries.map((e) => ({ name: e.name, command: e.cmd[0], args: e.cmd.slice(1) })),
  ].filter((t) => !opts.only || opts.only.includes(t.name));
  const results = [];
  for (const t of targets) {
    try {
      const { tools, instructions } = await listServer(t.command, t.args);
      results.push(sizeListing(t.name, tools, instructions));
    } catch (e) {
      results.push({ server: t.name, error: String(e.message || e).slice(0, 300) });
    }
  }
  if (opts.json) { process.stdout.write(JSON.stringify(results, null, 2) + "\n"); return; }
  const head = "server               tools  full chars  ~tokens  names-only chars  ~tokens  desc  input  output  largest";
  const lines = results.map((r) => r.error ? `${r.server.padEnd(20)} ERROR ${r.error}` :
    `${r.server.padEnd(20)} ${String(r.tools).padStart(5)} ${String(r.fullChars).padStart(11)} ${String(r.fullTokens).padStart(8)} ${String(r.deferredChars).padStart(17)} ${String(r.deferredTokens).padStart(8)} ${String(r.descChars).padStart(5)} ${String(r.inputChars).padStart(6)} ${String(r.outputChars).padStart(7)}  ${r.largest.join(" ")}`);
  const ok = results.filter((r) => !r.error);
  const tot = (k) => ok.reduce((a, r) => a + r[k], 0);
  lines.push(`${"TOTAL".padEnd(20)} ${String(tot("tools")).padStart(5)} ${String(tot("fullChars")).padStart(11)} ${String(tot("fullTokens")).padStart(8)} ${String(tot("deferredChars")).padStart(17)} ${String(tot("deferredTokens")).padStart(8)}`);
  process.stdout.write([head, ...lines].join("\n") + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { process.stderr.write(`mcp-listing-cost: ${e.message}\n`); process.exit(1); });
}
