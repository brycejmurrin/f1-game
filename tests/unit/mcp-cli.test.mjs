// mcp-cli.test.mjs — the MCP surface that stays on the fast gate: mcp-cli.mjs
// probe mode (dry-run call plans), the Chrome wrapper's flags and release pin,
// gfx-probe's backend flags, and the Playwright MCP pin. Nothing here launches
// a browser or needs network. The tinyfish proxy and the probe bridge have
// their own suites in `npm run test:mcp` (tinyfish-mcp / probe-mcp).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MCP_JSON = path.join(ROOT, ".mcp.json");
const MCP_CLI = path.join(ROOT, "tools/mcp-cli.mjs");
const CD_SH = path.join(ROOT, "tools/chrome-devtools-mcp.sh");

test("chrome-devtools-mcp.sh clone/build never prompts npx", () => {
  const src = fs.readFileSync(CD_SH, "utf8");
  assert.match(src, /npx --yes tsx/);
  assert.match(src, /npx --yes tsc/);
  assert.doesNotMatch(src, /^\s*npx tsx /m);
});

test("chrome-devtools-mcp.sh help lists clone / verify / run", () => {
  const r = spawnSync("bash", [CD_SH, "help"], { encoding: "utf8" });
  // help is the default unknown-path; script exits 1 with usage on bad cmd —
  // `status` exits 0. Usage text lives on stderr+stdout for the catch-all.
  const text = `${r.stdout}\n${r.stderr}`;
  assert.match(text, /clone/);
  assert.match(text, /verify/);
  assert.match(text, /run/);
  assert.match(text, /chrome-devtools-mcp/);
});


test("mcp-cli.mjs drives chrome via chrome-devtools-mcp.sh, not a hard-coded pw path", () => {
  const src = fs.readFileSync(MCP_CLI, "utf8");
  assert.match(src, /chrome-devtools-mcp\.sh/);
  assert.doesNotMatch(src, /\/opt\/pw-browsers\/chromium/);
  assert.ok(fs.existsSync(CD_SH));
});

test("Chrome MCP network fallback is pinned to the audited release", () => {
  const src = fs.readFileSync(CD_SH, "utf8");
  assert.match(src, /MCP_NPM_PACKAGE="chrome-devtools-mcp@1\.7\.0"/);
  assert.doesNotMatch(src, /chrome-devtools-mcp@latest/);
});


test("Playwright MCP network fallback is pinned to the audited release", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/playwright-mcp.sh"), "utf8");
  assert.match(src, /MCP_NPM_PACKAGE="@playwright\/mcp@0\.0\.79"/);
  assert.match(src, /NOT MCP-ATTACHED/, "the wrapper is a CLI now; playwright-official is the server");
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  assert.deepEqual(cfg.mcpServers["playwright-official"].args, ["-y", "@playwright/mcp@0.0.79"]);
  assert.doesNotMatch(src, /@playwright\/mcp@latest/);
  assert.match(src, /never --port \/ 0\.0\.0\.0/);
  assert.doesNotMatch(src, /npx[\s\S]*--port/);
});

// ── mcp-cli probe mode + the Chrome flags it depends on ─────────────────────
const CLI = MCP_CLI;
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
