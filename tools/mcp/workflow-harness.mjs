#!/usr/bin/env node
// @doc Authenticated loopback server for bounded, frozen-source agent workflow experiments.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { WorkflowHarness, ALL_TOOL_SCHEMAS, PROBE_HELP } from "./workflow-harness-core.mjs";

function options(argv) { const out = {}, allowed = new Set(["help","run-dir","plan","repo","sha","request-timeout-ms","probe-timeout-ms","http-timeout-ms","client-timeout-ms","lsp-command"]); for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === "--help") { out.help = true; continue; } if (!a.startsWith("--")) throw Error(`unexpected argument: ${a}`); const [k, inline] = a.slice(2).split("=", 2); if (!allowed.has(k)) throw Error(`unknown option: --${k}`); const value = inline ?? argv[++i]; if (value === undefined || value.startsWith("--")) throw Error(`missing value for --${k}`); out[k] = value; } return out; }
export async function startServer(opts) {
  const repo = path.resolve(opts.repo || process.cwd()), runDir = path.resolve(opts.runDir), plan = JSON.parse(fs.readFileSync(opts.plan, "utf8"));
  const token = crypto.randomBytes(32).toString("hex");
  const harness = new WorkflowHarness({ repo, runDir, plan, sha: opts.sha || "HEAD", requestTimeoutMs: +(opts.requestTimeoutMs || 30_000), probeTimeoutMs: +(opts.probeTimeoutMs || 1_000), lspCommand: opts.lspCommand, createLsp: opts.createLsp, invokeLsp: opts.invokeLsp });
  const server = http.createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method !== "POST" || req.url !== "/call" || req.headers["x-workflow-token"] !== token) { res.statusCode = 403; return res.end(JSON.stringify({ error: "forbidden" })); }
    try { let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > 64_000) throw Error("request exceeds 64000 characters"); } const value = await harness.call(JSON.parse(raw)); res.end(JSON.stringify(value)); }
    catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: String(e.message || e) })); }
  });
  server.requestTimeout = +(opts.httpTimeoutMs || 120_000); server.headersTimeout = 5_000;
  let endpoint;
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    endpoint = { host: "127.0.0.1", port: server.address().port, token, pid: process.pid, runDir, originalSha: harness.originalSha, clientTimeoutMs: +(opts.clientTimeoutMs || 120_000) };
    fs.writeFileSync(path.join(runDir, "endpoint.json"), JSON.stringify(endpoint, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  } catch (e) { server.closeAllConnections(); server.close(); await harness.close(); throw e; }
  const stop = async () => { server.closeAllConnections(); await harness.close(); await new Promise(r => server.close(r)); };
  return { server, harness, endpoint, stop };
}
async function main() {
  const opts = options(process.argv.slice(2));
  if (opts.help || !opts["run-dir"] || !opts.plan) { process.stdout.write(`Usage: node tools/mcp/workflow-harness.mjs --run-dir DIR --plan FILE [--repo DIR] [--sha REV] [--request-timeout-ms N] [--client-timeout-ms N]\nLocal and production LSP schemas: ${JSON.stringify(ALL_TOOL_SCHEMAS)}\n${PROBE_HELP}\n`); return opts.help ? 0 : 2; }
  const running = await startServer({ ...opts, runDir: opts["run-dir"], requestTimeoutMs: opts["request-timeout-ms"], probeTimeoutMs: opts["probe-timeout-ms"], httpTimeoutMs: opts["http-timeout-ms"], clientTimeoutMs: opts["client-timeout-ms"], lspCommand: opts["lsp-command"] });
  const shutdown = () => running.stop().then(() => process.exit(0)); process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then(code => { if (code) process.exitCode = code; }).catch(e => { process.stderr.write(`${e.message}\n`); process.exitCode = 1; });
