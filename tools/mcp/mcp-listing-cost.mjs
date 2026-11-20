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
 *   node tools/mcp/mcp-listing-cost.mjs --entry 'raw-apex=bash tools/mcp/apex-tools-mcp.sh serve'   # without the gateway
 *   node tools/mcp/mcp-listing-cost.mjs --preflight [--json] [--config=.cursor/mcp.json]
 *   bash tools/mcp/mcp-preflight.sh --all               # same preflight, one PASS/FAIL line each
 *
 * Read-only: it starts no browser (tools/list never launches one) and writes nothing.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

/** Prefer upstream launcher lines over the gateway's retain-path summary. */
export function summarizeStderr(stderr, { max = 240 } = {}) {
  const lines = String(stderr || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const useful = lines.filter((l) => !/^output-level-mcp:/.test(l) && !/stderr retained at /.test(l));
  const pick = (useful.length ? useful : lines).slice(0, 4).join(" | ");
  return pick.slice(0, max);
}

/** Run initialize + every tools/list page against one stdio command. */
export function listServer(command, args, { timeoutMs = TIMEOUT_MS, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env, stdio: ["pipe", "pipe", "pipe"] });
    let buf = "", stderr = "", nextId = 1, instructions = "";
    const tools = [];
    const waiting = new Map();
    const fail = (prefix) => {
      const detail = summarizeStderr(stderr);
      reject(new Error(detail ? `${prefix}; ${detail}` : prefix));
    };
    const timer = setTimeout(() => { child.kill("SIGTERM"); fail(`timeout after ${timeoutMs} ms`); }, timeoutMs);
    const send = (method, params) => {
      const id = nextId++;
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) }) + "\n");
      return new Promise((res) => waiting.set(id, res));
    };
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("exit", (code) => { if (waiting.size) { clearTimeout(timer); fail(`exited ${code} mid-listing`); } });
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

/** One-line initialize + tools/list check per server in a Cursor/Claude mcp.json. */
export async function preflightServers({
  configPath = path.join(ROOT, ".cursor/mcp.json"),
  timeoutMs = 45_000,
  env = process.env,
  only = null,
} = {}) {
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8")).mcpServers;
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) throw new Error(`no mcpServers in ${configPath}`);
  const names = only?.length ? only : Object.keys(cfg);
  const results = [];
  // Pass stderr through the output-level wrapper so FAIL reasons are the real
  // upstream lines (missing creds, MODULE_NOT_FOUND), not only the retain path.
  const childEnv = { ...env, APEX_MCP_STDERR_PASS: env.APEX_MCP_STDERR_PASS || "1" };
  for (const name of names) {
    const s = cfg[name];
    if (!s) {
      results.push({ server: name, ok: false, tools: 0, reason: `missing from ${path.basename(configPath)}` });
      continue;
    }
    const command = s.command, args = s.args || [];
    try {
      const { tools } = await listServer(command, args, { timeoutMs, env: childEnv });
      results.push({ server: name, ok: true, tools: tools.length, reason: `tools=${tools.length}` });
    } catch (e) {
      const reason = String(e.message || e).replace(/\s+/g, " ").trim().slice(0, 240);
      results.push({ server: name, ok: false, tools: 0, reason: reason || "unknown failure" });
    }
  }
  return results;
}

export function formatPreflightLine(r) {
  return `${r.ok ? "PASS" : "FAIL"} ${r.server}: ${r.reason}`;
}

function parseArgs(argv) {
  const out = { json: false, only: null, entries: [], preflight: false, config: null, timeoutMs: null, selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--preflight") out.preflight = true;
    else if (a === "--self-test") out.selfTest = true;
    else if (a.startsWith("--config=")) out.config = a.slice(9);
    else if (a === "--config") out.config = argv[++i] || "";
    else if (a.startsWith("--timeout-ms=")) out.timeoutMs = Number(a.slice(13));
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

/** Cheap fixture probe (no network): fails if stderr stay private or --all cannot see a crash reason. */
export async function selfTestPreflight({ gateway = path.join(ROOT, "tools/mcp/output-level-mcp.mjs") } = {}) {
  const okFixture = [
    "const {createInterface}=require('node:readline');",
    "const send=m=>process.stdout.write(JSON.stringify(m)+'\\n');",
    "createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);",
    " if(m.method==='initialize')send({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'ok',version:'1'}}});",
    " else if(m.method==='tools/list')send({jsonrpc:'2.0',id:m.id,result:{tools:[{name:'ping',inputSchema:{type:'object'}}]}});});",
  ].join("\n");
  const dieFixture = "process.stderr.write('CREDENTIAL_MISSING: demo\\n'); process.exit(3);";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-preflight-self-"));
  const cfgPath = path.join(dir, "mcp.json");
  try {
    fs.writeFileSync(cfgPath, JSON.stringify({
      mcpServers: {
        good: { command: process.execPath, args: [gateway, "--server", "good", "--", process.execPath, "-e", okFixture] },
        bad: { command: process.execPath, args: [gateway, "--server", "bad", "--", process.execPath, "-e", dieFixture] },
      },
    }));
    const privateEnv = { ...process.env };
    delete privateEnv.APEX_MCP_STDERR_PASS;
    let privateHid = false;
    try {
      await listServer(process.execPath, [gateway, "--server", "die", "--", process.execPath, "-e", dieFixture], {
        timeoutMs: 10_000, env: privateEnv,
      });
    } catch (e) {
      privateHid = !/CREDENTIAL_MISSING/.test(String(e.message));
    }
    if (!privateHid) throw new Error("default gateway still leaked upstream stderr");
    const rows = await preflightServers({ configPath: cfgPath, timeoutMs: 15_000 });
    const good = rows.find((r) => r.server === "good");
    const bad = rows.find((r) => r.server === "bad");
    if (!good?.ok || good.tools < 1) throw new Error(`expected PASS good, got ${JSON.stringify(good)}`);
    if (bad?.ok || !/CREDENTIAL_MISSING: demo/.test(bad?.reason || "")) {
      throw new Error(`expected FAIL bad with CREDENTIAL_MISSING, got ${JSON.stringify(bad)}`);
    }
    if (formatPreflightLine(good) !== `PASS good: tools=${good.tools}`) throw new Error("formatPreflightLine PASS shape");
    if (!formatPreflightLine(bad).startsWith("FAIL bad:")) throw new Error("formatPreflightLine FAIL shape");
    return { ok: true, rows };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.selfTest) {
    const r = await selfTestPreflight();
    process.stdout.write(JSON.stringify(r) + "\n");
    return;
  }
  if (opts.preflight) {
    const results = await preflightServers({
      configPath: opts.config || path.join(ROOT, ".cursor/mcp.json"),
      timeoutMs: Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : 45_000,
      only: opts.only,
    });
    if (opts.json) {
      process.stdout.write(JSON.stringify(results, null, 2) + "\n");
    } else {
      process.stdout.write(results.map(formatPreflightLine).join("\n") + "\n");
    }
    if (results.some((r) => !r.ok)) process.exitCode = 1;
    return;
  }
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
