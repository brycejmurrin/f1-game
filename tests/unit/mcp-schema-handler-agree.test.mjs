// mcp-schema-handler-agree.test.mjs — #7227: a declared schema arg and its handler agree (hunt #7225 rows 4-8).
// No Chromium, no network: fake jobs, stub pages, fake MCP wrapper.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, extrasCtx } from "../helpers/apex-tools-mcp.mjs";

const body = (r) => JSON.parse(r.content[0].text);

test("apex_job_cancel {dryRun:true} previews and leaves the job running", async () => {
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const root = fs.mkdtempSync(path.join(ROOT, "artifacts", "mcp-cancel-dry-"));
  const sleeper = spawn("sleep", ["60"], { stdio: "ignore" });
  const argv = process.argv[2];
  try {
    process.argv[2] = "call";
    const ex = createExtras(extrasCtx({ ROOT: root, spawnJob: () => {
      const child = new EventEmitter(); child.pid = sleeper.pid; child.unref = () => {};
      child.stdin = Object.assign(new EventEmitter(), { end() {} });
      return child;
    } }).ctx);
    const started = body(ex.handlers.apex_job_start({ kind: "parts_sweep" }));
    assert.equal(started.ok, true, JSON.stringify(started));
    const dry = body(await ex.handlers.apex_job_cancel({ jobId: started.jobId, dryRun: true }));
    assert.equal(dry.ok, true);
    assert.equal(dry.dryRun, true);
    assert.equal(dry.jobId, started.jobId);
    assert.equal(dry.state, "running");
    assert.equal(dry.wouldCancel, true);
    assert.equal(sleeper.exitCode, null, "the preview did not signal the job");
    assert.equal(sleeper.signalCode, null);
    assert.equal(body(ex.handlers.apex_job_status({ jobId: started.jobId })).state, "running");
  } finally { process.argv[2] = argv; sleeper.kill("SIGKILL"); fs.rmSync(root, { recursive: true, force: true }); }
});

test("ui-tools schemas declare no arg the dispatcher always refuses", async () => {
  const { UI_INSPECT_SCHEMA, UI_DIFF_SCHEMA, UI_MISSION_SCHEMA } = await import("../../tools/mcp/ui-tools.mjs");
  for (const s of [UI_INSPECT_SCHEMA, UI_DIFF_SCHEMA, UI_MISSION_SCHEMA]) {
    assert.ok(!("target" in s.properties) && !("url" in s.properties), "deploy/url are always refused, so not advertised");
  }
  assert.match(UI_MISSION_SCHEMA.properties.timeoutSeconds.description, /advisory/i);
});

test("lsp_symbols with an offset past the last row says so, not 'no symbol matches'", async () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/mcp/lsp-mcp.mjs"), "utf8");
  assert.match(src, /offset \$\{offset\} is past the last of \$\{all\.length\}/);
});

test("probe --json prints a 5000-char evaluate result in full", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "mcp-probe-json-"));
  try {
    const fake = path.join(dir, "fake-mcp.cjs");
    const big = "x".repeat(5000);
    fs.writeFileSync(fake, `#!/usr/bin/env node
let b = "";
process.stdin.on("data", d => { b += d; let i; while ((i = b.indexOf("\\n")) >= 0) { const l = b.slice(0, i); b = b.slice(i + 1); if (!l.trim()) continue;
  const m = JSON.parse(l); if (m.id == null) continue;
  const text = m.method === "tools/call" && m.params.name === "evaluate_script" ? ${JSON.stringify(big)} : "ok";
  console.log(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: m.method === "tools/list" ? { tools: [] } : { content: [{ type: "text", text }] } })); } });
`, { mode: 0o755 });
    const run = (flags) => spawnSync(process.execPath, [path.join(ROOT, "tools/mcp/mcp-cli.mjs"), "probe", "--wait", "0", "--eval", "1", ...flags],
      { encoding: "utf8", env: { ...process.env, APEX_MCP_WRAPPER: fake }, timeout: 30000 });
    const cut = run([]), full = run(["--json"]);
    assert.ok(!cut.stdout.includes(big), "default output is cut at 2500");
    assert.ok(full.stdout.includes(big), `--json prints it whole: ${full.stdout.length} ${full.stderr.slice(0, 200)}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("browser-http: eval of undefined keeps text, a hung eval cannot hang close(), opens are serialised", async () => {
  const { startBrowserMcp } = await import("../../tools/mcp/browser-http.mjs");
  let contexts = 0, evalImpl = () => undefined;
  const page = { url: () => "x", evaluate: (...a) => evalImpl(...a) };
  const deps = {
    startStaticServer: async () => ({ url: "http://127.0.0.1:1/", close: async () => {} }),
    launchChromium: async () => ({ close: async () => {} }),
    openBrycePhone: async () => { contexts++; await new Promise((r) => setTimeout(r, 20)); return { context: { close: async () => {} }, page }; },
    gotoGame: async () => {}, installProbeInit: async () => {},
  };
  const mcp = await startBrowserMcp({ port: 0, token: "t", deps, evalTimeoutMs: 100 });
  const call = async (name, args = {}) => {
    const res = await fetch(mcp.url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer t" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
    return res.json();
  };
  try {
    page.evaluate = (f) => (typeof f === "function" ? { title: "", apex: true } : evalImpl(f));
    await Promise.all([call("browser_open"), call("browser_open")]);
    assert.equal(contexts, 1, "concurrent opens build one context");
    const u = await call("browser_eval", { expression: "undefined" });
    assert.equal(typeof u.result.content[0].text, "string");
    evalImpl = () => new Promise(() => {});
    const hung = await call("browser_eval", { expression: "while(1){}" });
    assert.ok(hung.error || hung.result?.isError, "a never-settling eval is reported, not awaited forever");
  } finally {
    await Promise.race([mcp.close(), new Promise((_, rej) => setTimeout(() => rej(new Error("close() hung")), 3000))]);
  }
});
