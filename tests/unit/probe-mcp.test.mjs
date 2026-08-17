// probe-mcp.test.mjs — unified Chrome DevTools + TinyFish MCP bridge.
// Does NOT launch Chromium or hit TinyFish (CI-safe). Live probes stay in
// tools/probe-mcp.py list-tools / call when an agent needs them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROBE = path.join(ROOT, "tools/probe-mcp.py");
const MCP_JSON = path.join(ROOT, ".mcp.json");

test("probe-mcp.py exists and is executable-ish", () => {
  assert.ok(fs.existsSync(PROBE));
  const src = fs.readFileSync(PROBE, "utf8");
  assert.match(src, /chrome_/);
  assert.match(src, /tinyfish_/);
  assert.match(src, /def serve|cmd_serve|"serve"/);
  assert.match(src, /chrome-devtools-mcp\.sh|cdmcp/);
  assert.match(src, /tinyfish-mcp\.sh/);
});

test(".mcp.json registers probe as the unified stdio bridge", () => {
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), [
    "chrome-devtools",
    "probe",
    "tinyfish",
  ]);
  assert.equal(cfg.mcpServers.probe.command, "python3");
  assert.deepEqual(cfg.mcpServers.probe.args, ["tools/probe-mcp.py", "serve"]);
  assert.equal(cfg.mcpServers.tinyfish.url, "http://127.0.0.1:3711/mcp");
  assert.match(cfg.mcpServers["chrome-devtools"].command, /chrome-devtools-mcp\.sh$/);
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
  const r = spawnSync("python3", [PROBE, "serve"], {
    encoding: "utf8",
    input: `${init}\n${tools}\n`,
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
  } finally {
    daemon.kill("SIGKILL");
  }
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
});

test("probe --backend three pins three to WebGL2 unless --tlx-webgpu", () => {
  // tlx.js auto-picks three's WebGPU backend on Chromium desktop. Under
  // SwiftShader that path dies in three's own buffer upload, so the default
  // pin matches tests/specs/tlx-probes.spec.js rather than handing back a
  // broken renderer that reads as a TLX regression.
  assert.match(dryRun("--backend", "three")[1].arguments.function,
    /apex26\.tlxForceGL", "1"/);
  assert.match(dryRun("--backend", "three", "--tlx-webgpu")[1].arguments.function,
    /apex26\.tlxForceGL", "0"/);
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
  // --enable-unsafe-webgpu: headless Chrome does not expose navigator.gpu
  // without it, so every WGX probe read "No available adapters" and the whole
  // WebGPU backend was untestable. --enable-unsafe-swiftshader silences the
  // deprecation warning for the software WebGL path GLX/TLX run on here.
  const src = fs.readFileSync(path.join(ROOT, "tools/chrome-devtools-mcp.sh"), "utf8");
  assert.match(src, /--chromeArg=--enable-unsafe-webgpu/);
  assert.match(src, /--chromeArg=--enable-unsafe-swiftshader/);
  assert.match(src, /APEX_CHROME_ARGS/);
  // The secure-context trap belongs next to the flags: navigator.gpu is absent
  // on about:blank whatever is passed, which reads exactly like a bad flag.
  assert.match(src, /SECURE CONTEXT/);
});
