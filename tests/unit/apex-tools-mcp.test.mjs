// apex-tools-mcp.test.mjs — apex-tools MCP (local CLI wrap): transport, host configs and the published catalog.
// APEX_MCP_MOCK=1 / dryRun only — no Chromium, no network. One of eight files split from the
// original apex-tools-mcp.test.mjs (T1-16, #3043); shared fixtures: tests/helpers/apex-tools-mcp.mjs.
import { nativeMcpConfig } from "../helpers/agent-output-launch.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, MCP, SH, MCP_JSON, rpc, callCli } from "../helpers/apex-tools-mcp.mjs";

test("apex-tools-mcp.mjs and shell entry exist", () => {
  assert.ok(fs.existsSync(MCP));
  assert.ok(fs.existsSync(SH));
  const src = fs.readFileSync(MCP, "utf8");
  assert.match(src, /apex-tools-mcp/);
  // Catalog must not REGISTER chrome_/tinyfish_ tools (design invariant).
  // Mentions in refuse/help copy are fine; the tools/list test is the hard gate.
  assert.doesNotMatch(src, /name:\s*"chrome_/);
  assert.doesNotMatch(src, /name:\s*"tinyfish_/);
});

test(".mcp.json registers apex-tools alongside the separate debugger server", () => {
  const cfg = nativeMcpConfig(JSON.parse(fs.readFileSync(MCP_JSON, "utf8")));
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/mcp/apex-tools-mcp.json"), "utf8"));
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), [
    "apex-lsp",
    "apex-tools",
    "browserstack",
    "chrome-devtools",
    "js-debugger",
    "playwright-official",
  ]);
  assert.equal(cfg.mcpServers["apex-tools"].type, "stdio");
  assert.equal(cfg.mcpServers["apex-tools"].command, "bash");
  assert.deepEqual(cfg.mcpServers["apex-tools"].args, ["tools/mcp/apex-tools-mcp.sh", "serve"]);
  assert.deepEqual(cfg.mcpServers["apex-tools"].args, catalog.stdio.args);
  assert.equal(catalog.stdio.command, "bash");
  assert.equal(catalog.http.bind, "127.0.0.1");
  assert.equal(catalog.http.port, 3713);
  assert.deepEqual(catalog.http.args, ["serve-http"]);
});

test("playwright-official pin matches the wrapper's audited package and never @latest", () => {
  const cfg = nativeMcpConfig(JSON.parse(fs.readFileSync(MCP_JSON, "utf8")));
  const cursorCfg = nativeMcpConfig(JSON.parse(fs.readFileSync(path.join(ROOT, ".cursor/mcp.json"), "utf8")));
  const pw = fs.readFileSync(path.join(ROOT, "tools/mcp/playwright-mcp.sh"), "utf8")
    .match(/MCP_NPM_PACKAGE="([^"]+)"/)[1];
  // The catalog launches the wrapper's `run` (2026-10-05: the bare package
  // cannot launch in the cloud container), and the wrapper is what pins the
  // audited package — so the pin is asserted on the wrapper, the launch line
  // on the catalog.
  assert.equal(cfg.mcpServers["playwright-official"].command, "bash");
  assert.deepEqual(cfg.mcpServers["playwright-official"].args, ["tools/mcp/playwright-mcp.sh", "run"]);
  assert.equal(pw, "@playwright/mcp@0.0.79");
  assert.deepEqual(cursorCfg.mcpServers["playwright-official"], cfg.mcpServers["playwright-official"]);
  // chrome-devtools-official (bare npx, no WebGPU flags) left the catalog 2026-09;
  // the wrapper server keeps the same pinned package as its network fallback.
  assert.equal(cfg.mcpServers["chrome-devtools-official"], undefined);
  assert.match(fs.readFileSync(path.join(ROOT, "tools/mcp/chrome-devtools-mcp.sh"), "utf8"),
    /MCP_NPM_PACKAGE="chrome-devtools-mcp@1\.11\.0"/);
  assert.doesNotMatch(JSON.stringify(cfg), /@latest/);
  assert.doesNotMatch(JSON.stringify(cursorCfg), /@latest/);
});

test("browserstack pin matches the wrapper's audited package and never @latest; credentials stay env-only", () => {
  const cfg = nativeMcpConfig(JSON.parse(fs.readFileSync(MCP_JSON, "utf8")));
  const cursorCfg = nativeMcpConfig(JSON.parse(fs.readFileSync(path.join(ROOT, ".cursor/mcp.json"), "utf8")));
  const wrapper = fs.readFileSync(path.join(ROOT, "tools/mcp/browserstack-mcp.sh"), "utf8");
  const pin = wrapper.match(/MCP_NPM_PACKAGE="([^"]+)"/)[1];
  // Official setup is `npx -y @browserstack/mcp-server@latest` with env
  // BROWSERSTACK_USERNAME / BROWSERSTACK_ACCESS_KEY; the catalog launches the
  // wrapper's `run` and the wrapper pins the audited package (playwright rule).
  assert.equal(cfg.mcpServers["browserstack"].command, "bash");
  assert.deepEqual(cfg.mcpServers["browserstack"].args, ["tools/mcp/browserstack-mcp.sh", "run"]);
  assert.equal(pin, "@browserstack/mcp-server@2.2.4");
  assert.deepEqual(cursorCfg.mcpServers["browserstack"], cfg.mcpServers["browserstack"]);
  // No credential material in the catalogs, and the wrapper resolves the two
  // env vars without ever assigning them a value.
  assert.equal(cfg.mcpServers["browserstack"].env, undefined);
  // Behaviour, not a source pin: with both env vars absent `run` refuses to
  // start (exit 1) and names each missing variable; `status` never prints values.
  const env = { PATH: process.env.PATH, HOME: process.env.HOME };
  const run = spawnSync("bash", [path.join(ROOT, "tools/mcp/browserstack-mcp.sh"), "run"], { encoding: "utf8", env });
  assert.equal(run.status, 1);
  assert.ok(run.stderr.includes("BROWSERSTACK_USERNAME") && run.stderr.includes("BROWSERSTACK_ACCESS_KEY"), run.stderr);
  const secret = "sentinel-not-a-real-key";
  const status = spawnSync("bash", [path.join(ROOT, "tools/mcp/browserstack-mcp.sh"), "status"], { encoding: "utf8", env: { ...env, BROWSERSTACK_USERNAME: secret, BROWSERSTACK_ACCESS_KEY: secret } });
  assert.equal(status.status, 0);
  assert.ok(!status.stdout.includes(secret), "status must never print credential values");
  assert.doesNotMatch(wrapper, /BROWSERSTACK_(USERNAME|ACCESS_KEY)=["']?[A-Za-z0-9]/);
});

test(".cursor/mcp.json locksteps the root catalog (Cloud/Claude load .mcp.json)", () => {
  const cursorCfg = JSON.parse(fs.readFileSync(path.join(ROOT, ".cursor/mcp.json"), "utf8"));
  const rootCfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  assert.deepEqual(Object.keys(cursorCfg.mcpServers).sort(), Object.keys(rootCfg.mcpServers).sort());
  assert.deepEqual(cursorCfg.mcpServers["apex-tools"], rootCfg.mcpServers["apex-tools"]);
  assert.equal(rootCfg.mcpServers["apex-tools"].type, "stdio");
});

test("help lists serve / list-tools / call / status", () => {
  const r = spawnSync(process.execPath, [MCP, "help"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /serve/);
  assert.match(r.stdout, /list-tools/);
  assert.match(r.stdout, /call/);
  assert.match(r.stdout, /status/);
  assert.match(r.stdout, /apex_/);
  assert.match(r.stdout, /apex_select_specs/);
  assert.match(r.stdout, /apex_graph_parity/);
  assert.match(r.stdout, /apex_shot/);
  assert.doesNotMatch(r.stdout, /apex_carshot|apex_select_recall|apex_ui_survey|apex_gfx_probe|apex_wgx_validate_static/,
    "trimmed wraps must not be advertised — the last two wrapped CLIs that left with the 2026-09-03 WGX/TLX spike-out");
  assert.match(r.stdout, /serve-http/);
});

test("shell help exits 0", () => {
  const r = spawnSync("bash", [SH, "help"], { encoding: "utf8", cwd: ROOT });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /apex_/);
});

test("apex_status reports the chrome-devtools stdio known gap", () => {
  const r = callCli("apex_status", {});
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.match(body.knownGap.chromeDevtoolsStdio, /3712/);
  assert.match(body.knownGap.hostPlaywrightMcp, /@playwright\/mcp/);
  assert.match(body.knownGap.playwrightMcpStdio, /playwright/);
  assert.ok(body.knownGap.outsideLock.includes("layout-audit"));
  assert.ok(body.knownGap.outsideLock.includes("playwright-mcp"));
  assert.equal(body.playwright.live, false);
  assert.equal(body.playwright.suite, false);
  assert.equal(body.playwright.hostMcp, false);
  assert.equal(body.playwright.hostBrowser, false);
});

test("initialize → serverInfo.name === apex-tools-mcp; tools are apex_* only", () => {
  const out = rpc([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "apex-tools-test", version: "1" },
      },
    },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ]);
  assert.equal(out[0].result.serverInfo.name, "apex-tools-mcp");
  assert.ok(out[0].result.capabilities.tools);
  const names = (out[1].result.tools || []).map((t) => t.name);
  // Pinned wrappers (2026-11-03 reset): readiness, test selection, track shots, jobs, UI, HUD, the two vendor READS.
  // The Codex pair, the four inbox tools and the pass-through audits (locations, car/track audit, diagnostics,
  // profile_query, rotate_markings_check) are plain CLIs now.
  assert.deepEqual([...names].sort(), [
    "apex_agent",
    "apex_bump_cache_check",
    "apex_catalog",
    "apex_claude_agents",
    "apex_cursor_agents",
    "apex_debug_chrome",
    "apex_doctor",
    "apex_eval",
    "apex_frame_report",
    "apex_garage",
    "apex_garage_plan",
    "apex_graph_parity",
    "apex_help",
    "apex_hud_mock",
    "apex_hud_shot",
    "apex_hud_survey",
    "apex_job_cancel",
    "apex_job_start",
    "apex_job_status",
    "apex_pick_tests",
    "apex_profile",
    "apex_select_specs",
    "apex_shot",
    "apex_shot_survey",
    "apex_status",
    "apex_track",
    "apex_ui_diff",
    "apex_ui_fit",
    "apex_ui_inspect",
    "apex_ui_mission_plan",
    "apex_ui_shot",
    "apex_unit_test",
    "apex_verify_change_fast",
    "apex_viewer",
  ]);
  for (const n of names) {
    assert.match(n, /^apex_/);
    assert.doesNotMatch(n, /^chrome_/);
    assert.doesNotMatch(n, /^tinyfish_/);
  }
  for (const never of [
    "apex_test_bg",
    "apex_bump_cache_apply",
    "tinyfish_deploy_check",
    "chrome_evaluate_script",
    // trimmed 2026-09 — CLIs now
    "apex_verify_track",
    "apex_survey_track",
    "apex_carshot",
    "apex_ui_survey",
    "apex_wgx_validate",
    "apex_cache_bump_only",
  ]) {
    assert.ok(!names.includes(never), `must not wrap ${never}`);
  }
});

test("dryRun / mock apex_verify_change_fast pins --fast --json, never --wait or test-bg", () => {
  const r = callCli("apex_verify_change_fast", { dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.ok(body.argv.includes("--fast"), body.argv);
  assert.ok(body.argv.includes("--json"), body.argv);
  assert.ok(!body.argv.includes("--wait"), body.argv);
  // A checkout can itself be named test-bg-start-3043. Guard the command,
  // not unrelated parent-directory text in the serialized response.
  assert.deepEqual([path.basename(body.argv[1]), ...body.argv.slice(2)], ["verify-change.mjs", "--fast", "--json"]);
});

test("apex_bump_cache_check argv never contains --apply", () => {
  const r = callCli("apex_bump_cache_check", { dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.ok(body.argv.includes("--check"), body.argv);
  assert.ok(body.argv.includes("--json"), body.argv);
  assert.ok(!body.argv.includes("--apply"), body.argv);
  assert.ok(!body.argv.includes("--at"), body.argv);
  assert.ok(!body.argv.includes("--merge"), body.argv);
});

test("apex_shot: a directory `out` becomes the CLI's default file inside it", () => {
  // shot.mjs's 4th positional is `[out.png]`; the wrap used to pass the
  // directory through and the CLI died with "unsupported mime type null".
  const r = callCli("apex_shot", { track: "monaco", frac: 0.52, cam: "trackside", out: "artifacts/mcp-track-test", dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  const outArg = body.argv.find((a) => a.includes("mcp-track-test"));
  assert.match(outArg, /mcp-track-test\/monaco-52-trackside\.png$/, body.argv);
  const r2 = callCli("apex_shot", { track: "monza", out: "artifacts/mcp-track-test/x.png", dryRun: true });
  assert.match(JSON.parse(r2.stdout).argv.find((a) => a.includes("mcp-track-test")), /x\.png$/);
});

test("apex_shot_survey dryRun plans a multi-shot session", () => {
  const r = callCli("apex_shot_survey", { track: "monza", preset: "lap", dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.dryRun, true);
  assert.equal(body.shots.length, 4);
  assert.match(body.out, /artifacts\/track-survey\/monza-survey/);
  assert.equal(typeof body.estimateMs, "number");
  // lap (4 shots) estimates past the MCP cancel window → async job by default
  assert.equal(body.asyncDefault, true);
});

test("apex_shot_survey dryRun multi-track prefers async job", () => {
  const r = callCli("apex_shot_survey", { tracks: ["monza", "spa"], preset: "quick", dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.deepEqual(body.tracks, ["monza", "spa"]);
  assert.equal(body.asyncDefault, true);
  assert.equal(body.shots.length, 4);
});

test("apex_shot_survey dryRun single-shot stays sync by default", () => {
  const r = callCli("apex_shot_survey", {
    track: "monza",
    preset: "custom",
    shots: [{ name: "only", frac: 0.5, cam: "orbit", tod: "day" }],
    dryRun: true,
  });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.asyncDefault, false);
});

test("apex_job_start shot_survey dryRun builds shot-survey.mjs argv", () => {
  const r = callCli("apex_job_start", {
    kind: "shot_survey",
    tracks: "monza,spa",
    preset: "dual_lite",
    label: "q",
    dryRun: true,
  });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.kind, "shot_survey");
  assert.ok(body.browser);
  assert.ok(body.argv.some((a) => String(a).endsWith("shot-survey.mjs")), body.argv);
  assert.ok(body.argv.includes("monza,spa"), body.argv);
  assert.ok(body.argv.includes("dual_lite"), body.argv);
});

test("apex_pick_tests argv never contains --bg; includes --json", () => {
  const r = callCli("apex_pick_tests", { dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.ok(body.argv.includes("--json"), body.argv);
  assert.ok(!body.argv.includes("--bg"), body.argv);
});

test("target=deploy on a tree tool is refused at the schema (the tree schemas no longer advertise target)", () => {
  const r = callCli("apex_pick_tests", { target: "deploy" });
  assert.equal(r.status, 1, r.stderr); // structured refuse → CLI exit 1
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error, "bad_args");
});

test("url with github.io on a tree tool is refused at the schema (no fetch)", () => {
  const r = callCli("apex_pick_tests", {
    url: "https://brycejmurrin.github.io/f1-game/",
  });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error, "bad_args");
});

test("tools/call preserves isError on tool failure (not JSON-RPC error)", () => {
  const out = rpc([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "t", version: "1" },
      },
    },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "apex_pick_tests",
        arguments: { target: "deploy" },
      },
    },
  ]);
  const failed = out[1];
  assert.equal(failed.error, undefined);
  assert.equal(failed.result.isError, true);
  const text = JSON.parse(failed.result.content[0].text);
  assert.equal(text.ok, false);
  assert.equal(text.error, "bad_args");
});

test("serve stdout is JSON-RPC only (no log lines)", () => {
  const r = spawnSync(process.execPath, [MCP, "serve"], {
    encoding: "utf8",
    input:
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "t", version: "1" },
        },
      }) + "\n",
    env: { ...process.env, APEX_MCP_MOCK: "1" },
    cwd: ROOT,
    timeout: 10000,
  });
  assert.equal(r.status, 0, r.stderr);
  for (const line of r.stdout.split("\n").filter(Boolean)) {
    assert.doesNotThrow(() => JSON.parse(line), `non-JSON stdout: ${line.slice(0, 120)}`);
  }
});
