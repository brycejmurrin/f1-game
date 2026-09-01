// probe-mcp.test.mjs — unified Chrome DevTools + TinyFish bridge, CLI ONLY.
// Not MCP-attached since 2026-09 (.mcp.json is apex-tools / playwright-official
// / chrome-devtools). Does NOT launch Chromium or hit TinyFish (CI-safe). The
// chrome-start daemon + call auto-routing is why the CLI stays.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROBE = path.join(ROOT, "tools/probe-mcp.py");
const MCP_JSON = path.join(ROOT, ".mcp.json");

test("probe-mcp.py exists and says it is a CLI, not an attached server", () => {
  assert.ok(fs.existsSync(PROBE));
  const src = fs.readFileSync(PROBE, "utf8");
  assert.match(src, /NOT MCP-ATTACHED/);
  assert.match(src, /chrome_/);
  assert.match(src, /tinyfish_/);
  assert.match(src, /def serve|cmd_serve|"serve"/);
  assert.match(src, /chrome-devtools-mcp\.sh|cdmcp/);
  assert.match(src, /tinyfish-mcp\.sh/);
});

test(".mcp.json does NOT register probe — chrome-devtools is the attached Chrome MCP", () => {
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), [
    "apex-tools",
    "chrome-devtools",
    "playwright-official",
  ]);
  assert.equal(cfg.mcpServers.probe, undefined);
  assert.equal(cfg.mcpServers.tinyfish, undefined);
  assert.equal(cfg.mcpServers["chrome-devtools"].command, "bash");
  assert.deepEqual(cfg.mcpServers["chrome-devtools"].args, ["tools/chrome-devtools-mcp.sh", "run"]);
  assert.equal(cfg.mcpServers["apex-tools"].command, "bash");
  assert.deepEqual(cfg.mcpServers["apex-tools"].args, ["tools/apex-tools-mcp.sh", "serve"]);
  // The daemon flow is the reason the CLI survives the catalog trim.
  const help = spawnSync("python3", [PROBE, "help"], { encoding: "utf8" });
  assert.match(help.stdout, /chrome-start/);
  assert.match(help.stdout, /not in \.mcp\.json/);
});

test("probe-mcp status stays usable when tinyfish is down", () => {
  const src = fs.readFileSync(PROBE, "utf8");
  assert.match(src, /tinyfish DOWN/);
  assert.match(src, /return 0 if r\.returncode == 0 else 1/);
  const r = spawnSync("python3", [PROBE, "status"], {
    encoding: "utf8",
    cwd: ROOT,
    timeout: 20000,
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /=== chrome-devtools ===/);
  assert.match(r.stdout, /=== tinyfish ===/);
});

test("probe-mcp help lists serve / list-tools / call / status", () => {
  const r = spawnSync("python3", [PROBE, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /serve/);
  assert.match(r.stdout, /list-tools/);
  assert.match(r.stdout, /call/);
  assert.match(r.stdout, /status/);
  assert.match(r.stdout, /chrome_/);
  assert.match(r.stdout, /tinyfish_/);
});

test("probe-mcp route resolves chrome_ and tinyfish_ prefixes", () => {
  const r = spawnSync("python3", [PROBE, "route", "chrome_navigate_page"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /backend=chrome/);
  assert.match(r.stdout, /tool=navigate_page/);

  const t = spawnSync("python3", [PROBE, "route", "tinyfish_fetch_content"], {
    encoding: "utf8",
  });
  assert.equal(t.status, 0, t.stderr);
  assert.match(t.stdout, /backend=tinyfish/);
  assert.match(t.stdout, /tool=fetch_content/);
});

test("probe-mcp route rejects unprefixed tool names", () => {
  const r = spawnSync("python3", [PROBE, "route", "navigate_page"], {
    encoding: "utf8",
  });
  assert.notEqual(r.status, 0);
  assert.match(`${r.stdout}\n${r.stderr}`, /chrome_|tinyfish_/);
});

test("probe-mcp serve handshake (mock) advertises prefixed tools", () => {
  const env = { ...process.env, PROBE_MCP_MOCK: "1" };
  const init = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "probe-test", version: "1" },
    },
  });
  const tools = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  const failedCall = JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "chrome_list_pages",
      arguments: { __probeMockError: true },
    },
  });
  const r = spawnSync("python3", [PROBE, "serve"], {
    encoding: "utf8",
    input: `${init}\n${tools}\n${failedCall}\n`,
    env,
    timeout: 15000,
  });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  assert.ok(lines.length >= 2, `expected ≥2 JSON lines, got ${lines.length}: ${r.stdout.slice(0, 400)}`);
  const hi = JSON.parse(lines[0]);
  assert.equal(hi.result.serverInfo.name, "probe-mcp");
  assert.ok(hi.result.capabilities.tools);
  const listed = JSON.parse(lines[1]);
  const names = (listed.result.tools || []).map((t) => t.name);
  assert.ok(names.includes("chrome_navigate_page"), names.slice(0, 10));
  assert.ok(names.includes("chrome_evaluate_script"), names);
  assert.ok(names.includes("tinyfish_fetch_content"), names);
  assert.ok(names.includes("tinyfish_search"), names);
  assert.ok(names.length >= 50, `expected full catalog, got ${names.length}`);
  const failed = JSON.parse(lines[2]);
  assert.equal(failed.result.isError, true,
    "stdio MCP must preserve tool-level isError instead of inventing a JSON-RPC error");
  assert.equal(failed.error, undefined);
});

test("chrome daemon (mock): healthz, /call routing, CLI auto-route to a live daemon", async () => {
  // A bare `probe-mcp.py call` spawns a fresh Chromium per invocation, so page
  // state never survives between calls (measured 2026-08-17: navigate_page in
  // one call, list_pages in the next reads about:blank). The daemon is the fix
  // — this proves the wiring without launching a real browser.
  const { spawn } = await import("node:child_process");
  const env = { ...process.env, PROBE_MCP_MOCK: "1" };
  const daemon = spawn("python3", [PROBE, "chrome-daemon", "--port", "0"], {
    env,
    cwd: ROOT,
  });
  const port = await new Promise((resolve, reject) => {
    let buf = "";
    const t = setTimeout(
      () => reject(new Error(`daemon never printed its port: ${buf}`)),
      15000,
    );
    daemon.stdout.on("data", (chunk) => {
      buf += chunk;
      const m = buf.match(/listening on 127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(t);
        resolve(Number(m[1]));
      }
    });
    daemon.on("exit", (code) => reject(new Error(`daemon exited ${code}: ${buf}`)));
  });
  try {
    const hz = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json();
    assert.equal(hz.ok, true);
    assert.equal(hz.mock, true);

    const tools = await (await fetch(`http://127.0.0.1:${port}/tools`)).json();
    const toolNames = (tools.tools || []).map((t2) => t2.name);
    assert.ok(toolNames.includes("navigate_page"), toolNames.slice(0, 5));

    const res = await (
      await fetch(`http://127.0.0.1:${port}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "chrome_navigate_page", // prefixed name must be accepted too
          arguments: { url: "about:blank" },
        }),
      })
    ).json();
    assert.match(res.content[0].text, /"mock": true/);

    const failedResponse = await fetch(`http://127.0.0.1:${port}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "chrome_list_pages",
        arguments: { __probeMockError: true },
      }),
    });
    assert.equal(failedResponse.status, 200,
      "an MCP tool error is a successful transport response, not an HTTP failure");
    const failedResult = await failedResponse.json();
    assert.equal(failedResult.isError, true);

    // The CLI — NOT in mock mode — must prefer the live daemon over spawning
    // its own Chromium (which would hang this test for a browser launch).
    const cli = spawnSync("python3", [PROBE, "call", "chrome_list_pages", "{}"], {
      encoding: "utf8",
      cwd: ROOT,
      env: { ...process.env, PROBE_CHROME_PORT: String(port), PROBE_MCP_MOCK: "" },
      timeout: 20000,
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stderr, /via daemon/);
    assert.match(cli.stdout, /mock/);

    const failedCli = spawnSync(
      "python3",
      [PROBE, "call", "chrome_list_pages", '{"__probeMockError":true}'],
      {
        encoding: "utf8",
        cwd: ROOT,
        env: { ...process.env, PROBE_CHROME_PORT: String(port), PROBE_MCP_MOCK: "" },
        timeout: 20000,
      },
    );
    assert.notEqual(failedCli.status, 0, "shell CLI must fail when MCP returns isError");
    assert.match(failedCli.stdout, /"isError": true/);
  } finally {
    daemon.kill("SIGKILL");
  }
});

test("tools/list without mock does not spawn backends (Cursor discovery)", () => {
  // Live ensure() used to start Chromium + tinyfish ensure during tools/list.
  // Cursor then marked project-0-f1-game-probe as error and cached 0 tools.
  const env = { ...process.env };
  delete env.PROBE_MCP_MOCK;
  delete env.PROBE_MCP_FAIL_BACKENDS;
  const init = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const tools = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const r = spawnSync("python3", [PROBE, "serve"], {
    encoding: "utf8",
    input: `${init}\n${tools}\n`,
    env,
    timeout: 4000,
  });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const listed = JSON.parse(lines[1]);
  const names = (listed.result.tools || []).map((t) => t.name);
  assert.ok(names.includes("chrome_navigate_page"), names.slice(0, 8));
  assert.ok(names.includes("tinyfish_fetch_content"), names.slice(0, 8));
  assert.ok(names.length >= 50, `static catalog too small: ${names.length}`);
});

test("tools/list still advertises both catalogs when a backend ensure() throws", () => {
  // The cloud host (apex-wrap) lists tools ONCE. A throw from tinyfish.ensure()
  // used to empty the whole catalog for the session. FAIL_BACKENDS forces that
  // path; the static fallback must still name chrome_* and tinyfish_*.
  const env = { ...process.env, PROBE_MCP_FAIL_BACKENDS: "1" };
  const init = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const tools = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const r = spawnSync("python3", [PROBE, "serve"], {
    encoding: "utf8",
    input: `${init}\n${tools}\n`,
    env,
    timeout: 15000,
  });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  const listed = JSON.parse(lines[1]);
  const names = (listed.result.tools || []).map((t) => t.name);
  assert.ok(names.includes("chrome_navigate_page"), names.slice(0, 8));
  assert.ok(names.includes("tinyfish_fetch_content"), names.slice(0, 8));
  assert.ok(names.length >= 50, `fallback catalog too small: ${names.length}`);
});

test("probe-mcp help documents the persistent daemon commands", () => {
  const r = spawnSync("python3", [PROBE, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /chrome-start/);
  assert.match(r.stdout, /chrome-stop/);
  assert.match(r.stdout, /test-bg\.mjs|Playwright/);
});

// ── mcp-cli probe mode + the Chrome flags it depends on ─────────────────────
const CLI = path.join(ROOT, "tools/mcp-cli.mjs");
const dryRun = (...args) => {
  const r = spawnSync("node", [CLI, "probe", "--dry-run", ...args], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test("probe --backend sets the pick BEFORE reloading (order is the whole point)", () => {
  const calls = dryRun("--backend", "webgpu", "--wait", "9000");
  const names = calls.map((c) => c.name);
  assert.deepEqual(names, ["new_page", "evaluate_script", "navigate_page", "evaluate_script"]);
  // Each invocation gets a fresh profile, so the pick must be written and then
  // reloaded within ONE batch; splitting it across runs probes the default.
  assert.match(calls[1].arguments.function, /apex26\.gfxBackend", "webgpu"/);
  assert.match(calls[3].arguments.function, /setTimeout\(r, 9000\)/);
  const noBackend = dryRun();
  assert.deepEqual(noBackend.map((c) => c.name), ["new_page", "evaluate_script"]);
  assert.equal(noBackend[0].arguments.url, "http://127.0.0.1:3456/",
    "the documented `npx serve` redirects /index.html, so probes must use the root URL");
});

test("gfx-probe --tlx-webgpu unpins TLX ForceGL and --lavapipe uses the Lavapipe ICD", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/gfx-probe.mjs"), "utf8");
  assert.match(src, /--tlx-webgpu/);
  assert.match(src, /--lavapipe/);
  assert.match(src, /tlxForceGL", wantTlxGpu \? "0" : "1"/);
  assert.match(src, /WEBGPU_LAVAPE_CHROMIUM_ARGS/);
  assert.match(src, /WEBGPU_LAVAPE_ENV/);
  assert.match(src, /opts\.backend === "webgpu" \|\| opts\.tlxWebgpu/,
    "--tlx-webgpu must wait on GLX.awaitSoftPresent like the WGX path");
  assert.doesNotMatch(src, /no TLX soft-present/,
    "do not excuse a black TLX WebGPU #game — soft-present is the gate");
});

test("mcp-cli exits non-zero when an MCP tool returns isError", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-mcp-cli-"));
  const wrapper = path.join(dir, "mock-mcp.mjs");
  fs.writeFileSync(wrapper, `#!/usr/bin/env node
process.stdin.setEncoding("utf8");
let buf = "";
process.stdin.on("data", chunk => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id == null) continue;
    let result = {};
    if (msg.method === "initialize") result = { serverInfo: { name: "mock", version: "1" } };
    else if (msg.method === "tools/list") result = { tools: [{ name: "fail" }] };
    else if (msg.method === "tools/call") result = { isError: true, content: [{ type: "text", text: "mock failure" }] };
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\\n");
  }
});
`);
  fs.chmodSync(wrapper, 0o755);
  try {
    const r = spawnSync("node", [CLI, '[{"name":"fail","arguments":{}}]'], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, APEX_MCP_WRAPPER: wrapper },
      timeout: 15000,
    });
    assert.notEqual(r.status, 0, `tool error must propagate to the shell:\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /mock failure/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("probe --backend three pins three to WebGL2 unless --tlx-webgpu / --tlx-auto", () => {
  // Default pin matches tests/specs/tlx-probes.spec.js (CI WebGL2).
  // --tlx-webgpu forces three's WebGPU path; --tlx-auto leaves the pin unset.
  // --tlx-auto-gl is AUTO after the stay-GL latch (three WebGL2, still TLX).
  assert.match(dryRun("--backend", "three")[1].arguments.function,
    /apex26\.tlxForceGL", "1"/);
  assert.match(dryRun("--backend", "three", "--tlx-webgpu")[1].arguments.function,
    /apex26\.tlxForceGL", "0"/);
  assert.match(dryRun("--backend", "three", "--tlx-auto")[1].arguments.function,
    /removeItem\("apex26\.tlxForceGL"\)/);
  assert.match(dryRun("--backend", "three", "--tlx-auto-gl")[1].arguments.function,
    /apex26\.tlxAutoGL", "1"/);
  assert.match(dryRun("--backend", "three", "--tlx-auto-gl")[1].arguments.function,
    /removeItem\("apex26\.tlxForceGL"\)/);
  // The pin is three-only: it must not appear for the other backends.
  for (const b of ["webgl2", "webgpu"]) {
    assert.doesNotMatch(dryRun("--backend", b)[1].arguments.function, /tlxForceGL/);
  }
});

test("probe --console appends the console dump; --eval carries the body", () => {
  const calls = dryRun("--console", "WGX", "--eval", "return JSON.stringify({a:1});");
  assert.equal(calls[calls.length - 1].name, "list_console_messages");
  assert.match(calls[calls.length - 2].arguments.function, /JSON\.stringify\(\{a:1\}\)/);
  assert.equal(dryRun("--eval", "return \"x\";").at(-1).name, "evaluate_script");
});

test("probe rejects an unknown flag instead of silently probing the default", () => {
  const r = spawnSync("node", [CLI, "probe", "--backendd", "webgpu"], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unknown flag/);
});

test("the Chrome wrapper passes the flags WebGPU and software WebGL need", () => {
  // Flags live in tools/webgpu-chrome-args.cjs — chrome-devtools-mcp.sh and
  // harness.mjs must stay in sync or MCP reads "no adapter" while wgx-shot passes.
  const src = fs.readFileSync(path.join(ROOT, "tools/chrome-devtools-mcp.sh"), "utf8");
  assert.match(src, /webgpu-chrome-args\.cjs/);
  assert.match(src, /APEX_CHROME_ARGS/);
  assert.match(src, /SECURE CONTEXT/);
  const argsMod = fs.readFileSync(path.join(ROOT, "tools/webgpu-chrome-args.cjs"), "utf8");
  assert.match(argsMod, /--enable-unsafe-webgpu/);
  assert.match(argsMod, /--use-webgpu-adapter=swiftshader/);
  assert.match(argsMod, /--enable-unsafe-swiftshader/);
});
