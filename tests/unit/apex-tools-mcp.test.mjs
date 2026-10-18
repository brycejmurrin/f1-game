// apex-tools-mcp.test.mjs — apex-tools MCP (local CLI wrap).
// APEX_MCP_MOCK=1 / dryRun only — no Chromium, no network.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MCP = path.join(ROOT, "tools/mcp/apex-tools-mcp.mjs");
const SH = path.join(ROOT, "tools/mcp/apex-tools-mcp.sh");
const MCP_JSON = path.join(ROOT, ".mcp.json");

function rpc(lines, env = {}) {
  const r = spawnSync(process.execPath, [MCP, "serve"], {
    encoding: "utf8",
    input: lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + "\n",
    env: { ...process.env, APEX_MCP_MOCK: "1", ...env },
    cwd: ROOT,
    timeout: 15000,
    // Batched schema-contract probes now publish 38 tool schemas and hundreds
    // of typed refusals; keep the transport fixture bounded above 1 MiB.
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(r.status, 0, r.error?.message || r.stderr);
  return r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function callCli(name, args = {}, extraEnv = {}) {
  const r = spawnSync(
    process.execPath,
    [MCP, "call", name, JSON.stringify(args)],
    {
      encoding: "utf8",
      env: { ...process.env, APEX_MCP_MOCK: "1", ...extraEnv },
      cwd: ROOT,
      timeout: 15000,
    },
  );
  return r;
}

test("apex-tools-mcp.mjs and shell entry exist", () => {
  assert.ok(fs.existsSync(MCP));
  assert.ok(fs.existsSync(SH));
  const src = fs.readFileSync(MCP, "utf8");
  assert.match(src, /apex-tools-mcp/);
  assert.match(src, /apex_/);
  // Catalog must not REGISTER chrome_/tinyfish_ tools (design invariant).
  // Mentions in refuse/help copy are fine; the tools/list test is the hard gate.
  assert.doesNotMatch(src, /name:\s*"chrome_/);
  assert.doesNotMatch(src, /name:\s*"tinyfish_/);
});

test(".mcp.json registers apex-tools alongside the separate debugger server", () => {
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/mcp/apex-tools-mcp.json"), "utf8"));
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), [
    "apex-lsp",
    "apex-tools",
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
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  const cursorCfg = JSON.parse(fs.readFileSync(path.join(ROOT, ".cursor/mcp.json"), "utf8"));
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
    /MCP_NPM_PACKAGE="chrome-devtools-mcp@1\.7\.0"/);
  assert.doesNotMatch(JSON.stringify(cfg), /@latest/);
  assert.doesNotMatch(JSON.stringify(cursorCfg), /@latest/);
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
  // Pinned wrappers: readiness, location catalog, session checks, track shots, jobs, UI and audits.
  assert.deepEqual([...names].sort(), [
    "apex_agent",
    "apex_bump_cache_check",
    "apex_car_audit",
    "apex_catalog",
    "apex_ci_status",
    "apex_diagnostics",
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
    "apex_locations",
    "apex_pick_tests",
    "apex_profile",
    "apex_profile_query",
    "apex_rotate_markings_check",
    "apex_select_specs",
    "apex_session_status",
    "apex_shot",
    "apex_shot_survey",
    "apex_status",
    "apex_track",
    "apex_track_audit",
    "apex_ui_diff",
    "apex_ui_fit",
    "apex_ui_inspect",
    "apex_ui_mission_plan",
    "apex_ui_shot",
    "apex_unit_test",
    "apex_verify_change_fast",
    "apex_viewer",
    "apex_who_is_on_it",
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
  const blob = JSON.stringify(body);
  assert.doesNotMatch(blob, /test-bg/);
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

test("target=deploy on a tree tool → tree_only", () => {
  const r = callCli("apex_pick_tests", { target: "deploy" });
  assert.equal(r.status, 1, r.stderr); // structured refuse → CLI exit 1
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error, "tree_only");
  assert.match(body.fix || "", /deploy-research/i);
  assert.doesNotMatch(body.fix || "", /tinyfish/i, "tree_only must not route to TinyFish");
});

test("url with github.io → github_io_blocked (no fetch)", () => {
  const r = callCli("apex_pick_tests", {
    url: "https://brycejmurrin.github.io/f1-game/",
  });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error, "github_io_blocked");
  assert.match(body.fix || "", /deploy-research/i);
  assert.doesNotMatch(body.fix || "", /tinyfish-mcp\.sh/, "the in-repo tinyfish wrapper is not the route any more");
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
  assert.equal(text.error, "tree_only");
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

const LOCK = path.join(ROOT, "scratch", "apex-browser.lock");
// A private test-bg registry per test (TS1): these tests used to overwrite the REAL
// artifacts/logs/test-bg.json and restore it afterwards, which loses a live run's
// update in that window and, when the per-file timeout SIGKILLs the file, leaves
// the fake in place and hides the real run from --status/--wait/--stop.
function withFakeRegistry(state, fn) {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "fake-test-bg-"));
  const file = path.join(dir, "test-bg.json");
  fs.writeFileSync(file, JSON.stringify(state));
  try { return fn({ APEX_TEST_BG_STATE: file }); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test("playwright occupancy matches `playwright test` tokens, not MCP JSON", async () => {
  const { classifyPlaywrightLine, scanPlaywrightLines } = await import("../../tools/ci/playwright-occupancy.mjs");
  assert.equal(
    classifyPlaywrightLine("4321 /usr/bin/npx playwright test --reporter=line")?.kind,
    "suite",
  );
  assert.equal(
    classifyPlaywrightLine(`2430 /bin/bash -c timeout 1500 bash -c 'until grep -q done log; do sleep 15; done'; npx playwright test tests/specs/ui-scale.spec.js -g x`),
    null,
    "a shell whose command string merely mentions the suite is not a live suite",
  );
  assert.equal(classifyPlaywrightLine("77 sh -c npx playwright test --reporter=line"), null);
  assert.equal(
    classifyPlaywrightLine("5492 node /home/runner/work/f1-game/node_modules/.bin/playwright test tests/specs/hud-layout.spec.js")?.kind,
    "suite",
  );
  assert.equal(
    classifyPlaywrightLine('12 /exec-daemon/cursor-exec-daemon --mcp-config {"playwright":{"command":"npx","args":["@playwright/mcp@latest"]}}'),
    null,
    "Cursor --mcp-config JSON is not a live Playwright process",
  );
  assert.equal(
    classifyPlaywrightLine("88 node /opt/cursor/node_modules/@playwright/mcp/cli.js --headless")?.kind,
    "hostMcp",
  );
  assert.equal(
    classifyPlaywrightLine("99 /opt/google/chrome/chrome --user-data-dir=/workspace/.playwright-mcp --headless")?.kind,
    "hostBrowser",
  );
  assert.equal(
    classifyPlaywrightLine("260 node /root/.npm/_npx/51691537fc71f2b0/node_modules/.bin/playwright-mcp --isolated --headless --browser chromium --executable-path /opt/pw-browsers/chromium-1194/chrome-linux/chrome --no-sandbox --output-dir /home/user/f1-game/artifacts/playwright-mcp")?.kind,
    "hostMcp",
    "the idle server names a Chromium path and an output dir as ARGUMENTS — it is not the browser",
  );
  assert.equal(
    classifyPlaywrightLine("137 npm exec @playwright/mcp@0.0.79 --isolated --headless --browser chromium --executable-path /opt/pw-browsers/chromium-1194/chrome-linux/chrome --no-sandbox")?.kind,
    "hostMcp",
  );
  const scan = scanPlaywrightLines([
    "1 /exec-daemon/cursor-exec-daemon --mcp-config {\"playwright\":{}}",
    "2 node /x/@playwright/mcp/cli.js",
  ].join("\n"));
  assert.equal(scan.live, true);
  assert.equal(scan.hostMcp, true);
  assert.equal(scan.suite, false);
  assert.deepEqual(scan.pids, [2]);
});

test("browser tool target=deploy → local_only", () => {
  const r = callCli("apex_eval", { track: "monza", expr: "a.info()", target: "deploy", dryRun: true });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.error, "local_only");
});

test("browser tool github.io url → github_io_blocked (no fetch)", () => {
  const r = callCli("apex_shot", {
    track: "monza",
    url: "https://brycejmurrin.github.io/f1-game/",
    dryRun: true,
  });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.error, "github_io_blocked");
});

test("apex_select_specs dryRun pins --since --json, never --bg", () => {
  const r = callCli("apex_select_specs", { dryRun: true, since: "HEAD~1" });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.ok(body.argv.includes("--since"), body.argv);
  assert.ok(body.argv.includes("HEAD~1"), body.argv);
  assert.ok(body.argv.includes("--json"), body.argv);
  assert.ok(!body.argv.includes("--bg"), body.argv);
});

test("apex_agent describe passes its id as --id (agent.mjs describe needs one)", () => {
  const r = callCli("apex_agent", { dryRun: true, track: "suzuka", command: "describe", id: "corner:T1" });
  assert.equal(r.status, 0, r.stderr);
  const argv = JSON.parse(r.stdout).argv;
  assert.equal(argv[argv.indexOf("--id") + 1], "corner:T1", argv);
  assert.equal(callCli("apex_agent", { dryRun: true, command: "describe", id: "--url" }).status, 1, "id is flag-guarded");
});

test("apex_select_specs without since → bad_args", () => {
  const r = callCli("apex_select_specs", { dryRun: true });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.error, "bad_args");
});

test("apex_garage: open spawns garage-angles --serve; ops refuse until open; call ends the session", () => {
  // The one wrap that is a SESSION: open boots one browser and every later op
  // is a JSON line to it. dryRun shows the argv (open) or the command (an op);
  // an op with no session is a refusal, not a boot; mock mode never spawns.
  const open = callCli("apex_garage", { op: "open", team: "ferrari", out: "artifacts/gs", dryRun: true });
  assert.equal(open.status, 0, open.stderr);
  const body = JSON.parse(open.stdout);
  assert.ok(body.argv.some((a) => a.endsWith("garage-angles.mjs")), body.argv);
  assert.ok(body.argv.includes("--serve") && body.argv.includes("ferrari"), body.argv);
  assert.ok(!body.argv.includes("--url"));
  const three = callCli("apex_garage", { op: "open", team: "ferrari", backend: "three", livery: "shipped", dryRun: true });
  assert.equal(three.status, 0, three.stderr);
  const threeArgv = JSON.parse(three.stdout).argv;
  assert.equal(threeArgv[threeArgv.indexOf("--backend") + 1], "three");
  assert.equal(threeArgv[threeArgv.indexOf("--livery") + 1], "shipped");
  const shot = callCli("apex_garage", { op: "shot", frame: "spineTop", design: { spineLogo: "wrap" }, name: "a", dryRun: true });
  assert.equal(shot.status, 0, shot.stderr);
  const cmd = JSON.parse(shot.stdout).command;
  assert.deepEqual(cmd, { design: { spineLogo: "wrap" }, frame: "spineTop", shot: "a" }, "keys ride along, applied design → frame → shot");
  const cold = callCli("apex_garage", { op: "shot" }, { APEX_MCP_MOCK: "0", APEX_MCP_PS: "" });
  assert.equal(cold.status, 1);
  assert.equal(JSON.parse(cold.stdout).error, "garage_not_open");
  const esc = callCli("apex_garage", { op: "open", out: "/tmp/gs", dryRun: true });
  assert.equal(JSON.parse(esc.stdout).error, "path_escaped");
  const src = fs.readFileSync(path.join(ROOT, "tools/mcp/apex-tools-mcp.mjs"), "utf8");
  assert.match(src, /garageClose\("call ended"\)/, "a one-shot call cannot keep the child alive");
  assert.match(src, /acquireLock\("apex_garage"\)/, "the session holds the browser lock while open");
});

test("apex_shot out outside artifacts/scratch → path_escaped", () => {
  const r = callCli("apex_shot", { dryRun: true, track: "monza", out: "/tmp/apex-shot.png" });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.error, "path_escaped");
});

test("tree pins: rotate-markings --check only, graph-parity needs base", () => {
  const rot = callCli("apex_rotate_markings_check", { dryRun: true });
  assert.equal(rot.status, 0, rot.stderr);
  const rotBody = JSON.parse(rot.stdout);
  assert.ok(rotBody.argv.includes("--check"), rotBody.argv);
  assert.ok(!rotBody.argv.includes("--write"), rotBody.argv);

  const gp = callCli("apex_graph_parity", { dryRun: true, base: "HEAD~1", id: "monza" });
  assert.equal(gp.status, 0, gp.stderr);
  const gpBody = JSON.parse(gp.stdout);
  assert.match(gpBody.argv.join(" "), /graph-parity\.cjs/);
  assert.equal(gpBody.env.BASE, "HEAD~1");
  assert.ok(gpBody.argv.includes("monza"), gpBody.argv);

  const gpMiss = callCli("apex_graph_parity", { dryRun: true, id: "monza" });
  assert.equal(gpMiss.status, 1, gpMiss.stderr);
  assert.equal(JSON.parse(gpMiss.stdout).error, "bad_args");

  // A trimmed wrap must be refused as unknown, not silently routed to a CLI.
  const gone = callCli("apex_verify_track", { dryRun: true, id: "monza" });
  assert.equal(gone.status, 1);
  assert.equal(JSON.parse(gone.stdout).error, "unknown_tool");
});

test("apex_frame_report: tree tool, validated track / u / frames / shots, never --out or --fleet", () => {
  const body = (r) => JSON.parse(r.stdout);
  const ok = callCli("apex_frame_report", { dryRun: true, track: "monaco", u: [0.25, 0.5], json: true });
  assert.equal(ok.status, 0, ok.stderr);
  const argv = body(ok).argv;
  assert.match(argv.join(" "), /shot\/frame-report\.mjs --track monaco --u=0\.25,0\.5 --json$/);
  for (const bad of ["--out", "--fleet", "--diff", "--pose", "--url"]) assert.ok(!argv.some((a) => a.startsWith(bad)), bad);
  // Tree kind: no browser lock, so a dryRun never consults occupancy.
  const src = fs.readFileSync(MCP, "utf8");
  assert.match(src, /name: "apex_frame_report",\s*week: 5,\s*kind: "tree"/);

  const fr = callCli("apex_frame_report", { dryRun: true, track: "spa", frames: 12 });
  assert.equal(fr.status, 0, fr.stderr);
  assert.ok(body(fr).argv.includes("--frames=12"));

  const refused = [
    [{}, "bad_args", /needs track/],
    [{ track: "atlantis" }, "bad_args", /track must be one of/],
    [{ track: "../monza" }, "bad_args", /track must be one of/],
    [{ track: "monza", u: [0.2], frames: 3 }, "bad_args", /u or frames/],
    [{ track: "monza", u: [] }, "bad_args", /u must (?:be array|have 1\.\.64 items)/],
    [{ track: "monza", u: "0.5" }, "bad_args", /u must (?:be array|have 1\.\.64 items)/],
    [{ track: "monza", u: [1.5] }, "bad_args", /0\.\.1/],
    [{ track: "monza", u: [0.1, "x"] }, "bad_args", /u\[1\] must be number/],
    [{ track: "monza", u: Array(65).fill(0.5) }, "bad_args", /u must have 1\.\.64 items/],
    [{ track: "monza", frames: 0 }, "bad_args", /1\.\.120/],
    [{ track: "monza", frames: 2.5 }, "bad_args", /frames must be integer/],
    [{ track: "monza", frames: 500 }, "bad_args", /1\.\.120/],
    [{ track: "monza", shots: "/etc/passwd" }, "path_escaped", /artifacts\/ or scratch\//],
    [{ track: "monza", shots: "scratch/../package.json" }, "path_escaped", /artifacts\/ or scratch\//],
    [{ track: "monza", shots: "scratch" }, "path_escaped", /artifacts\/ or scratch\//],
    [{ track: "monza", shots: "scratch/frame-report-test-missing.json" }, "bad_args", /not found/],
  ];
  for (const [args, error, msg] of refused) {
    const r = callCli("apex_frame_report", { dryRun: true, ...args });
    assert.equal(r.status, 1, `${JSON.stringify(args)} should be refused: ${r.stdout}`);
    const b = body(r);
    assert.equal(b.error, error, JSON.stringify(args));
    assert.match(b.message, msg, JSON.stringify(args));
  }
  const gone = callCli("apex_frame_report", { dryRun: true, track: "monza", target: "deploy" });
  assert.equal(body(gone).error, "tree_only");

  // A shots file under scratch/ is passed through (absolute); a symlink out of
  // scratch/ is refused once resolved.
  const dir = path.join(ROOT, "scratch", `frame-report-mcp-test-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(path.join(dir, "shots.json"), "[]");
    fs.symlinkSync(path.join(ROOT, "package.json"), path.join(dir, "link.json"));
    const s = callCli("apex_frame_report", { dryRun: true, track: "monza", shots: path.relative(ROOT, path.join(dir, "shots.json")) });
    assert.equal(s.status, 0, s.stdout);
    const sa = body(s).argv;
    assert.equal(sa[sa.indexOf("--shots") + 1], fs.realpathSync(path.join(dir, "shots.json")));
    const l = callCli("apex_frame_report", { dryRun: true, track: "monza", shots: path.relative(ROOT, path.join(dir, "link.json")) });
    assert.equal(body(l).error, "path_escaped");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("committed catalog JSON matches tools/list and never binds 0.0.0.0", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/mcp/apex-tools-mcp.json"), "utf8"));
  const r = spawnSync(process.execPath, [MCP, "list-tools"], { encoding: "utf8", cwd: ROOT });
  assert.equal(r.status, 0, r.stderr);
  const names = JSON.parse(r.stdout).map((t) => t.name);
  assert.deepEqual(names, catalog.tools);
  const src = fs.readFileSync(MCP, "utf8");
  assert.match(src, /127\.0\.0\.1/);
  assert.doesNotMatch(src, /listen\([^)]*0\.0\.0\.0/);
  assert.match(src, /serve-http/);
});

test("serve-http /healthz and /mcp stay on loopback", async () => {
  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, [MCP, "serve-http"], {
    env: { ...process.env, APEX_MCP_HTTP_PORT: "0", APEX_MCP_MOCK: "1" },
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const port = await new Promise((resolve, reject) => {
    let err = "";
    const t = setTimeout(() => reject(new Error(`no listen: ${err}`)), 5000);
    child.stderr.on("data", (chunk) => {
      err += chunk;
      const m = err.match(/apex-tools-mcp http 127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(t);
        resolve(Number(m[1]));
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`serve-http exited ${code}: ${err}`)));
  });
  try {
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.ok, true);
    assert.equal(body.bind, "127.0.0.1");
    const rpc = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });
    assert.equal(rpc.status, 200);
    const listed = await rpc.json();
    const names = (listed.result.tools || []).map((t) => t.name);
    assert.ok(names.includes("apex_graph_parity"), names);
    assert.ok(names.every((n) => n.startsWith("apex_")));
    // Keep using the same HTTP process after each malformed request.
    for (const [payload, code] of [["null", -32600], ["true", -32600], ['"text"', -32600], ["[]", -32600], ['[{"jsonrpc":"2.0","id":1,"method":"ping"}]', -32600], ["{", -32700], [JSON.stringify({jsonrpc:"2.0",id:7,method:"tools/call",params:{name:"apex_status",arguments:null}}), -32602]]) {
      const failed = await fetch(`http://127.0.0.1:${port}/mcp`, {method:"POST",headers:{"Content-Type":"application/json"},body:payload});
      assert.equal((await failed.json()).error.code, code, payload);
      const ping = await fetch(`http://127.0.0.1:${port}/mcp`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:99,method:"ping"})});
      assert.deepEqual((await ping.json()).result, {});
    }
  } finally {
    child.kill();
  }
});

test("apex_verify_change_fast classifies --fast partial (exit 2) as ok", () => {
  const src = fs.readFileSync(MCP, "utf8");
  assert.match(
    src,
    /name === "apex_verify_change_fast" \? new Set\(\[0, 2\]\)/,
    "partial is the success outcome of --fast when browser groups remain",
  );
});

test("browser tool loopback url → url_not_supported in v1", () => {
  const r = callCli("apex_eval", {
    track: "monza",
    url: "http://127.0.0.1:3456/",
    dryRun: true,
  });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.error, "url_not_supported");
});

describe("occupancy", { concurrency: 1 }, () => {
test("tree tools do not take or refuse the browser lock", () => {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, tool: "test", since: Date.now() }));
  try {
    const r = callCli("apex_rotate_markings_check", { dryRun: true });
    assert.equal(r.status, 0, r.stderr);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
  } finally {
    try { fs.unlinkSync(LOCK); } catch { /* ignore */ }
  }
});

test("week-1 tools do not take or refuse the browser lock", () => {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, tool: "test", since: Date.now() }));
  try {
    const r = callCli("apex_pick_tests", { dryRun: true });
    assert.equal(r.status, 0, r.stderr);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
  } finally {
    try { fs.unlinkSync(LOCK); } catch { /* ignore */ }
  }
});

test("week-2 dryRun refuses lock_held by a live PID (no Chromium)", () => {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, tool: "test", since: Date.now() }));
  try {
    const r = callCli("apex_eval", { track: "monza", expr: "1", dryRun: true }, { APEX_MCP_MOCK: "0", APEX_MCP_PS: "" });
    assert.equal(r.status, 1, r.stderr);
    const body = JSON.parse(r.stdout);
    assert.equal(body.error, "lock_held");
    assert.ok(body.fix);
  } finally {
    try { fs.unlinkSync(LOCK); } catch { /* ignore */ }
  }
});

test("the HUD survey wraps are browser tools: a held lock refuses both", () => {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, tool: "test", since: Date.now() }));
  try {
    for (const name of ["apex_hud_shot", "apex_hud_survey", "apex_hud_mock"]) {
      const r = callCli(name, { dryRun: true }, { APEX_MCP_MOCK: "0", APEX_MCP_PS: "" });
      assert.equal(r.status, 1, r.stderr);
      assert.equal(JSON.parse(r.stdout).error, "lock_held", name);
    }
  } finally {
    try { fs.unlinkSync(LOCK); } catch { /* ignore */ }
  }
});

test("week-2 dryRun steals a stale lock (dead PID)", () => {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: 999999999, tool: "dead", since: 1 }));
  try {
    const r = callCli("apex_eval", { track: "monza", expr: "1", dryRun: true }, { APEX_MCP_MOCK: "0", APEX_MCP_PS: "" });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
    assert.ok(!fs.existsSync(LOCK), "stale lock must be reaped");
  } finally {
    try { fs.unlinkSync(LOCK); } catch { /* ignore */ }
  }
});

test("week-2 dryRun refuses playwright_live from test-bg.json (no Chromium)", () => {
  withFakeRegistry({ mode: "test", runs: [{ pid: process.pid, group: "tiny" }] }, (reg) => {
    const r = callCli("apex_shot", { track: "monza", dryRun: true }, { APEX_MCP_MOCK: "0", APEX_MCP_PS: "", ...reg });
    assert.equal(r.status, 1, r.stderr);
    const body = JSON.parse(r.stdout);
    assert.equal(body.error, "playwright_live");
  });
});

test("a completed zombie supervisor cannot block browser tools", { skip: process.platform !== "linux", timeout: 25_000 }, async () => {
  // A real zombie passes kill(pid, 0). Keep its parent alive so this test,
  // rather than PID 1, can explicitly reap it in finally. No browser starts.
  const supervisor = spawn("python3", ["-c", [
    "import os, sys, time",
    "pid = os.fork()",
    "if pid == 0: os._exit(0)",
    "try:",
    " for _ in range(200):",
    "  state = open('/proc/%d/stat' % pid).read().rsplit(')', 1)[1].split()[0]",
    "  if state == 'Z': break",
    "  time.sleep(.01)",
    " print(pid, flush=True)",
    " sys.stdin.readline()",
    "finally: os.waitpid(pid, 0)",
  ].join("\n")], { stdio: ["pipe", "pipe", "pipe"] });
  const closed = new Promise((resolve) => {
    supervisor.once("close", resolve);
    supervisor.once("error", () => resolve(null));
  });
  try {
    const pid = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("zombie fixture did not report its child")), 3000);
      supervisor.stdout.once("data", (b) => { clearTimeout(timer); resolve(Number(b.toString().trim())); });
      supervisor.once("error", (e) => { clearTimeout(timer); reject(e); });
    });
    assert.match(fs.readFileSync(`/proc/${pid}/stat`, "utf8"), /\) Z /);
    assert.doesNotThrow(() => process.kill(pid, 0), "kill(0) alone incorrectly calls this zombie live");
    withFakeRegistry({ runs: [{ pid, group: "finished-browser", browser: true }] }, (reg) => {
      const r = callCli("apex_shot", { track: "monza", dryRun: true }, { APEX_MCP_MOCK: "0", APEX_MCP_PS: "", ...reg });
      assert.equal(r.status, 0, r.stderr + r.stdout);
      assert.equal(JSON.parse(r.stdout).ok, true);
    });
  } finally {
    supervisor.stdin.end("reap\n");
    assert.equal(await closed, 0, "the fixture supervisor must reap its child and exit");
  }
});

test("a reused PID with a different start identity cannot block browser tools", () => {
  withFakeRegistry({ runs: [{ pid: process.pid, starttime: "impossible-previous-start", browser: true }] }, (reg) => {
    const r = callCli("apex_shot", { track: "monza", dryRun: true }, { APEX_MCP_MOCK: "0", APEX_MCP_PS: "", ...reg });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(JSON.parse(r.stdout).ok, true);
  });
});

test("an IDLE host Playwright MCP server is reported, not occupancy; its launched browser is", () => {
  // The @playwright/mcp server is a stdio process waiting for its first
  // browser_* call — attached for a whole Cloud session, 0 % CPU, no canvas.
  // Refusing on it refused every apex_* browser tool, always (2026-09-10).
  const idle = "88 node /opt/cursor/node_modules/@playwright/mcp/cli.js --headless\n";
  const r = callCli("apex_eval", { track: "monza", expr: "1", dryRun: true }, { APEX_MCP_MOCK: "0", APEX_MCP_PS: idle });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(JSON.parse(r.stdout).ok, true, "an idle server must not refuse");
  const st = callCli("apex_status", {}, { APEX_MCP_MOCK: "0", APEX_MCP_PS: idle });
  const pw = JSON.parse(st.stdout).playwright;
  assert.equal(pw.hostMcp, true, "…but it is still reported");
  assert.equal(pw.busy, false);
  const launched = idle + "91 /opt/pw-browsers/chromium --user-data-dir=/tmp/playwright-mcp-abc --headless\n";
  const b = callCli("apex_eval", { track: "monza", expr: "1", dryRun: true }, { APEX_MCP_MOCK: "0", APEX_MCP_PS: launched });
  assert.equal(b.status, 1, b.stderr + b.stdout);
  const body = JSON.parse(b.stdout);
  assert.equal(body.error, "playwright_live");
  assert.match(body.message, /Playwright MCP browser/);
});

test("a live Node-only test-bg group does not impersonate Playwright", () => {
  withFakeRegistry({
    mode: "sequential",
    runs: [{ pid: process.pid, group: "tooling-fast", browser: false }],
  }, (reg) => {
    const r = callCli("apex_shot", { track: "monza", dryRun: true }, {
      APEX_MCP_MOCK: "0",
      APEX_MCP_PS: "1 bash\n",
      ...reg,
    });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(JSON.parse(r.stdout).ok, true);
  });
});

test("week-2 dryRun refuses chrome_daemon_up when /healthz answers", async () => {
  // Server MUST be a sibling process. spawnSync(MCP) blocks this event loop,
  // so an in-process http.Server cannot answer the occupancy probe.
  const { spawn } = await import("node:child_process");
  const child = spawn(
    process.execPath,
    [
      "-e",
      `require("http").createServer((req,res)=>{if(req.url==="/healthz"){res.writeHead(200);res.end("ok")}else{res.writeHead(404);res.end()}}).listen(0,"127.0.0.1",function(){process.stdout.write(String(this.address().port))})`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const port = await new Promise((resolve, reject) => {
    let buf = "";
    const t = setTimeout(() => reject(new Error(`no port: ${buf}`)), 5000);
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      if (/^\d+$/.test(buf.trim())) {
        clearTimeout(t);
        resolve(Number(buf.trim()));
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`healthz child exited ${code}`)));
  });
  try {
    const r = callCli(
      "apex_eval",
      { track: "monza", expr: "1", dryRun: true },
      { APEX_MCP_MOCK: "0", APEX_MCP_PS: "", PROBE_CHROME_PORT: String(port) },
    );
    assert.equal(r.status, 1, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.error, "chrome_daemon_up");
  } finally {
    child.kill();
  }
});
});

// Regression evidence from the tool survey: malformed callers must fail at
// the seam, before any tree command, browser occupancy check or VM boot.
test("every tool carries title, honest MCP annotations and an outputSchema; results mirror structuredContent", () => {
  // MCP 2025-06-18 ToolAnnotations default to destructiveHint: true and
  // openWorldHint: true — wrong for 25 of these 26 wraps. The hints derive from
  // the catalog's kind (docs/notes/AGENT-SURFACE-SURVEY-2026-10-05.md §4).
  const listed = rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }])[0].result.tools;
  const readOnly = [], destructive = [], openWorld = [];
  for (const t of listed) {
    assert.match(t.title, /^Apex 26 · /, t.name);
    assert.equal(t.outputSchema.type, "object", t.name);
    assert.equal(typeof t.outputSchema.properties.ok, "object", t.name);
    const a = t.annotations;
    for (const k of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) assert.equal(typeof a[k], "boolean", `${t.name}.${k}`);
    if (a.readOnlyHint) readOnly.push(t.name);
    if (a.destructiveHint) destructive.push(t.name);
    if (a.openWorldHint) openWorld.push(t.name);
    if (a.readOnlyHint) assert.equal(a.idempotentHint, true, `${t.name}: read-only implies idempotent`);
    if (/^apex_(eval|shot|agent|garage|track|ui_fit|ui_shot|hud_shot|hud_survey)$/.test(t.name)) assert.equal(a.readOnlyHint, false, `${t.name} takes the browser lock and writes artifacts`);
  }
  assert.deepEqual(destructive, ["apex_job_cancel"]);
  assert.deepEqual(openWorld.sort(), ["apex_ci_status", "apex_who_is_on_it"]);
  for (const n of ["apex_status", "apex_doctor", "apex_pick_tests", "apex_select_specs", "apex_bump_cache_check", "apex_job_status", "apex_session_status", "apex_frame_report", "apex_car_audit", "apex_track_audit", "apex_unit_test"]) assert.ok(readOnly.includes(n), `${n} is read-only`);
  for (const n of ["apex_job_start", "apex_job_cancel", "apex_verify_change_fast", "apex_viewer"]) assert.ok(!readOnly.includes(n), `${n} is not read-only`);
  const call = rpc([{ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "apex_status", arguments: { dryRun: true } } }])[0].result;
  assert.deepEqual(call.structuredContent, JSON.parse(call.content[0].text), "structuredContent mirrors the first text block");
});

test("real results of the fast tree tools conform to their advertised outputSchema", () => {
  // MCP 2025-06-18: a server that advertises outputSchema MUST return
  // conforming structuredContent. The shapes were measured from these same
  // calls on 2026-10-05; a CLI that renames a key fails here, not in a client.
  const listed = rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }])[0].result.tools;
  const schemaOf = (n) => listed.find((t) => t.name === n).outputSchema;
  const typeOk = (v, type) => (Array.isArray(type) ? type : [type]).some((t) =>
    t === "null" ? v === null
    : t === "array" ? Array.isArray(v)
    : t === "object" ? (v !== null && typeof v === "object" && !Array.isArray(v))
    : t === "integer" ? Number.isInteger(v)
    : typeof v === t);
  const validate = (value, schema, where, errors) => {
    if (schema.type && !typeOk(value, schema.type)) errors.push(`${where}: expected ${JSON.stringify(schema.type)}, got ${Array.isArray(value) ? "array" : value === null ? "null" : typeof value}`);
    if (schema.properties && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, sub] of Object.entries(schema.properties)) if (k in value) validate(value[k], sub, `${where}.${k}`, errors);
    }
    return errors;
  };
  const calls = [
    ["apex_status", {}], ["apex_doctor", {}], ["apex_pick_tests", {}], ["apex_select_specs", { since: "HEAD~1" }],
    ["apex_session_status", {}], ["apex_bump_cache_check", {}], ["apex_job_status", {}],
    ["apex_track_audit", { track: "monza" }], ["apex_car_audit", { check: "ladder" }],
  ];
  const results = rpc(calls.map(([name, args], i) => ({ jsonrpc: "2.0", id: 10 + i, method: "tools/call", params: { name, arguments: args } })));
  for (const [i, [name]] of calls.entries()) {
    const r = results.find((m) => m.id === 10 + i).result;
    assert.ok(r.structuredContent && typeof r.structuredContent === "object", `${name}: structuredContent present`);
    assert.deepEqual(validate(r.structuredContent, schemaOf(name), name, []), [], `${name} conforms to its outputSchema`);
  }
  for (const t of listed) {
    assert.equal(t.outputSchema.additionalProperties, true, `${t.name}: a CLI may grow a key before the schema does`);
    assert.equal(t.outputSchema.required, undefined, `${t.name}: refusal and dryRun bodies share the tool, so nothing is required`);
  }
});

test("all advertised schemas reject unknown keys; argument shapes, enums and bounds are enforced", () => {
  const listed = rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }])[0].result.tools;
  for (const tool of listed) {
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
    const r = callCli(tool.name, { dryRun: true, unsupported: true });
    assert.equal(r.status, 1, tool.name);
    assert.equal(JSON.parse(r.stdout).error, "bad_args", tool.name);
  }
  const invalid = [
    ["apex_pick_tests", null], ["apex_pick_tests", []], ["apex_status", 2],
    ["apex_pick_tests", { files: "js/car/parts.js" }], ["apex_pick_tests", { files: [12] }],
    ["apex_pick_tests", { staged: "false" }], ["apex_status", { dryRun: "false" }],
    ["apex_eval", { track: "unknown" }], ["apex_garage", { op: "bogus" }],
    ["apex_garage", { seat: 2 }], ["apex_garage", { frame: [] }],
    ["apex_garage", { diff: ["one"] }], ["apex_graph_parity", { base: "HEAD", all: false }], ["apex_shot", { frac: 1.1 }],
    ["apex_agent", { command: "unknown" }], ["apex_agent", { limit: 1.5 }],
    ["apex_agent", { seconds: 121 }], ["apex_agent", { weather: "snow" }],
    ["apex_select_specs", { since: "HEAD", budgetMin: 0 }],
    ["apex_eval", { expr: "x".repeat(65537) }],
    ["apex_pick_tests", { files: Array(257).fill("js/car/parts.js") }],
    ["apex_pick_tests", JSON.parse('{"__proto__":{}}')],
  ];
  for (const [name, args] of invalid) {
    const r = callCli(name, args);
    assert.equal(r.status, 1, `${name}: ${r.stdout} ${r.stderr}`);
    assert.equal(JSON.parse(r.stdout).error, "bad_args", `${name}: ${r.stdout}`);
    assert.doesNotMatch(r.stderr, /TypeError|uncaught/i);
  }
});

test("positional values cannot replace pinned CLI flags", () => {
  for (const [name, args] of [
    ["apex_graph_parity", { base: "HEAD", id: "--all" }],
    ["apex_graph_parity", { base: "--all", id: "monza" }],
    ["apex_pick_tests", { files: ["--since", "HEAD"] }],
    ["apex_select_specs", { since: "--all" }],
    ["apex_eval", { expr: "--backend=webgpu" }],
    ["apex_garage", { op: "open", team: "--out" }],
    ["apex_agent", { detail: "--url" }],
  ]) {
    const r = callCli(name, { ...args, dryRun: true });
    assert.equal(r.status, 1, r.stdout);
    assert.equal(JSON.parse(r.stdout).error, "bad_args");
  }
  assert.equal(callCli("apex_eval", { dryRun: true, expr: "-1" }).status, 0);
});

test("output preflight resolves existing and nearest ancestors without creating paths", () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "apex-mcp-output-"));
  const dir = path.join(ROOT, "scratch", `apex-mcp-output-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(path.join(outside, "file.png"), "untouched");
    fs.symlinkSync(outside, path.join(dir, "escape"));
    fs.symlinkSync(path.join(outside, "file.png"), path.join(dir, "file.png"));
    fs.symlinkSync(path.join(outside, "missing"), path.join(dir, "dangling"));
    for (const out of [path.join(dir, "escape", "nested", "new.png"), path.join(dir, "file.png"), path.join(dir, "dangling", "new.png")]) {
      const r = callCli("apex_shot", { dryRun: true, out });
      assert.equal(r.status, 1, r.stdout);
      assert.ok(["path_escaped", "bad_args"].includes(JSON.parse(r.stdout).error));
    }
    const safe = path.join(dir, "not-created", "new.png");
    assert.equal(callCli("apex_shot", { dryRun: true, out: safe }).status, 0);
    assert.equal(fs.existsSync(path.dirname(safe)), false);
    assert.equal(fs.readFileSync(path.join(outside, "file.png"), "utf8"), "untouched");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});

test("read-only framing refuses executable shot sources; legacy literals require explicit CLI mode", async () => {
  const { readShots } = await import("../../tools/shot/frame-report.mjs");
  const dir = path.join(ROOT, "scratch", `apex-mcp-shots-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  const shot = { id: "test", dur: 0.5, ease: "linear", eye: [{ at: "start" }, { at: "start" }], look: [{ at: "start" }, { at: "start" }], fov: [45, 45] };
  try {
    const json = path.join(dir, "shots.json"), legacy = path.join(dir, "shots.js"), malicious = path.join(dir, "executable.json");
    fs.writeFileSync(json, JSON.stringify([shot]));
    fs.writeFileSync(legacy, `window.FlybyShots = [${JSON.stringify(shot).replace('"id":', 'id:')}];`);
    fs.writeFileSync(malicious, "(() => { globalThis.__apexFrameSurveyExecuted = true; return []; })()");
    assert.deepEqual(readShots(json), [shot]);
    assert.throws(() => readShots(legacy), /JSON data/);
    assert.deepEqual(readShots(legacy, { trustedJs: true }), [shot]);
    assert.throws(() => readShots(malicious), /JSON data/);
    assert.equal(globalThis.__apexFrameSurveyExecuted, undefined);
    for (const shots of [legacy, malicious]) {
      const r = callCli("apex_frame_report", { dryRun: true, track: "monza", shots });
      assert.equal(r.status, 1, r.stdout);
      assert.equal(JSON.parse(r.stdout).error, "bad_args");
      assert.match(JSON.parse(r.stdout).message, /JSON/);
    }
    assert.equal(callCli("apex_frame_report", { dryRun: true, track: "monza", shots: json, trustedShotsJs: true }).status, 1);
    fs.writeFileSync(json, "[{}]");
    assert.throws(() => readShots(json), /no string id/);
    assert.equal(callCli("apex_frame_report", { dryRun: true, track: "monza", shots: json }).status, 1);
    fs.writeFileSync(json, "[]");
    assert.deepEqual(readShots(json), []); // empty override keeps the live default
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("stdio survives null/scalar/batch/malformed envelopes and invalid arguments", () => {
  const errors = rpc([
    "null", "true", '"text"', "[]", '[{"jsonrpc":"2.0","id":1,"method":"ping"}]',
    "{", { jsonrpc: "1.0", id: 1, method: "ping" },
    { jsonrpc: "2.0", id: {}, method: "ping" },
    { jsonrpc: "2.0", id: 2, method: "ping", params: [] },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "apex_status", arguments: null } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: 3 } },
    { jsonrpc: "2.0", id: 99, method: "ping" },
    { jsonrpc: "2.0", id: 100, method: "tools/list" },
  ]);
  assert.equal(errors.length, 13);
  assert.deepEqual(errors.filter((r) => r.error).map((r) => r.error.code).sort(), [-32600, -32600, -32600, -32600, -32600, -32700, -32600, -32600, -32602, -32602, -32602].sort());
  assert.deepEqual(errors.find((r) => r.id === 99).result, {});
  assert.ok(errors.find((r) => r.id === 100).result.tools.some((t) => t.name === "apex_doctor"));
});

test("doctor wrapper pins inspection only and rejects caller-supplied command/root/catalog", () => {
  const r = callCli("apex_doctor", { dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).argv.slice(1), [path.join(ROOT, "tools/check/doctor.mjs"), "--tree", "--json"]);
  for (const key of ["root", "catalog", "command", "install", "url"]) {
    assert.equal(callCli("apex_doctor", { dryRun: true, [key]: "untrusted" }).status, 1, key);
  }
});

test("probe backend and wait errors fail before dispatch; integer boundary plans remain exact", () => {
  const cli = path.join(ROOT, "tools/mcp/mcp-cli.mjs");
  for (const args of [["--backend", "bogus"], ["--backend"], ["--wait"], ["--wait", "NaN"], ["--wait", "Infinity"], ["--wait", "-1"], ["--wait", "0.5"], ["--wait", "180001"], ["--backend", "--dry-run"], ["--tlx-auto"], ["--backend", "three", "--tlx-auto", "--tlx-webgpu"], ["--lite", "--backend", "three"]]) {
    const r = spawnSync(process.execPath, [cli, "probe", "--dry-run", ...args], { encoding: "utf8", cwd: ROOT });
    assert.equal(r.status, 2, `${args}: ${r.stdout} ${r.stderr}`);
    assert.match(r.stderr, /probe:/);
    assert.doesNotMatch(r.stderr, /TypeError|uncaught|stack/i);
    assert.equal(r.stdout.trim(), "");
  }
  for (const wait of [0, 180000]) {
    const r = spawnSync(process.execPath, [cli, "probe", "--dry-run", "--wait", String(wait)], { encoding: "utf8", cwd: ROOT });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(JSON.parse(r.stdout).at(-1).arguments.function.includes(`setTimeout(r, ${wait})`));
  }
});

test("atomic browser claim preserves the competing owner that wins after preflight", async () => {
  const { acquireLock, releaseLock } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  const write = fs.writeFileSync, psBefore = process.env.APEX_MCP_PS;
  process.env.APEX_MCP_PS = "";
  let inserted = false;
  fs.writeFileSync = (file, ...args) => {
    if (file === LOCK && !inserted) {
      inserted = true;
      write(LOCK, JSON.stringify({ pid: process.pid, tool: "winner", since: Date.now() }));
    }
    return write(file, ...args);
  };
  try {
    const result = acquireLock("loser");
    assert.equal(inserted, true);
    assert.equal(JSON.parse(result.content[0].text).error, "lock_held");
    assert.equal(JSON.parse(fs.readFileSync(LOCK, "utf8")).tool, "winner");
  } finally {
    fs.writeFileSync = write;
    releaseLock();
    if (psBefore === undefined) delete process.env.APEX_MCP_PS; else process.env.APEX_MCP_PS = psBefore;
  }
});

test("partially written or malformed lock cannot be stolen during an atomic claim", async () => {
  const { acquireLock } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, "");
  try {
    const result = acquireLock("loser");
    assert.equal(JSON.parse(result.content[0].text).error, "lock_held");
    assert.equal(fs.readFileSync(LOCK, "utf8"), "");
  } finally { fs.rmSync(LOCK, { force: true }); }
});

test("fake garage early exits, spawn errors and timeout settle open and retain ownership until child exit", { timeout: 5000 }, async () => {
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  const { garageOpen, garageClose, acquireLock, releaseLock } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const psBefore = process.env.APEX_MCP_PS;
  process.env.APEX_MCP_PS = "";
  const fake = () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.pid = process.pid; child.kill = () => true;
    return child;
  };
  const body = (r) => JSON.parse(r.content[0].text);
  try {
    const early = fake();
    const earlyOpen = garageOpen({}, { spawnChild: () => { setImmediate(() => early.emit("exit", 2)); return early; } });
    assert.equal(body(await earlyOpen).error, "garage_boot_failed");
    assert.equal(fs.existsSync(LOCK), false);

    const failedSpawn = fake(); delete failedSpawn.pid;
    const failed = garageOpen({}, { spawnChild: () => { setImmediate(() => failedSpawn.emit("error", new Error("fixture ENOENT"))); return failedSpawn; } });
    assert.equal(body(await failed).error, "garage_boot_failed");
    assert.equal(fs.existsSync(LOCK), false);

    const thrown = await garageOpen({}, { spawnChild: () => { throw new Error("synchronous spawn failure"); } });
    assert.equal(body(thrown).error, "garage_boot_failed");
    assert.equal(fs.existsSync(LOCK), false);

    const timed = fake();
    const timeout = await garageOpen({}, { spawnChild: () => timed, readyTimeoutMs: 20 });
    assert.equal(body(timeout).error, "garage_boot_failed");
    assert.equal(fs.existsSync(LOCK), true, "timed-out child still owns its browser until exit");
    assert.equal(body(acquireLock("another")).error, "lock_held");
    timed.emit("exit", 1);
    assert.equal(fs.existsSync(LOCK), false);

    const ready = fake();
    const recovered = await garageOpen({}, { spawnChild: () => { setImmediate(() => ready.stdout.write('{"ready":true}\n')); return ready; } });
    assert.equal(body(recovered).ok, true, "a fresh session recovers after earlier failures");
    const closed = garageClose("fixture close");
    assert.equal(closed.closed, true);
    assert.equal(fs.existsSync(LOCK), true, "close alone cannot release the browser");
    assert.equal(body(acquireLock("another")).error, "lock_held");
    ready.emit("exit", 0);
    assert.equal(fs.existsSync(LOCK), false);
  } finally {
    garageClose("fixture teardown"); releaseLock();
    if (psBefore === undefined) delete process.env.APEX_MCP_PS; else process.env.APEX_MCP_PS = psBefore;
  }
});

test("graph-parity cleans partial archives and every load/build failure using small scratch fixtures", () => {
  const require = createRequire(import.meta.url);
  const { materialiseBaseline, main } = require("../../tools/track/graph-parity.cjs");
  const fixture = path.join(ROOT, "scratch", `graph-parity-cleanup-${process.pid}`);
  fs.mkdirSync(fixture, { recursive: true });
  const log = console.log, error = console.error;
  console.log = () => {}; console.error = () => {};
  try {
    for (const failedStage of ["git", "tar"]) {
      const commands = [];
      assert.throws(() => materialiseBaseline("HEAD", { scratchRoot: fixture, run(command, args) {
        commands.push(command);
        if (command === "tar") fs.writeFileSync(path.join(args.at(-1), "partial.json"), "fixture");
        if (command === failedStage) throw new Error(`fixture ${command} failed`);
        return Buffer.from("fixture archive");
      } }), new RegExp(`fixture ${failedStage} failed`));
      assert.deepEqual(fs.readdirSync(fixture), [], `${failedStage} failure leaked its tree`);
      assert.deepEqual(commands, failedStage === "git" ? ["git"] : ["git", "tar"]);
    }
    const tracks = { LIST: [{ id: "fixture" }], setKeepGeometry() {}, build() { return Object.fromEntries(["propsGeo", "glassGeo", "waterGeo", "roadGeo", "terrainGeo"].map((name) => [name, { pos: [] }])); } };
    for (const stage of ["baseline-load", "head-load", "unknown-track", "build", "comparison", "success"]) {
      let dir, loads = 0;
      const code = main({ args: [stage === "unknown-track" ? "missing" : "fixture"], baseRef: "HEAD", explicitBase: true,
        materialise() { dir = fs.mkdtempSync(path.join(fixture, "baseline-")); fs.writeFileSync(path.join(dir, "fixture.json"), "{}"); return dir; },
        loadContext() {
          loads++;
          if (stage === "baseline-load" && loads === 1 || stage === "head-load" && loads === 2) throw new Error(`fixture ${stage} failed`);
          if (stage === "build") return { ...tracks, build() { throw new Error("fixture build failed"); } };
          if (stage === "comparison") return { ...tracks, build() { return { get propsGeo() { throw new Error("fixture comparison failed"); } }; } };
          return tracks;
        },
      });
      assert.equal(code, stage === "success" ? 0 : 1, stage);
      assert.equal(fs.existsSync(dir), false, `${stage} leaked baseline`);
      assert.deepEqual(fs.readdirSync(fixture), [], stage);
    }
  } finally {
    console.log = log; console.error = error;
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("splitOut takes the trailing JSON block, never a number from inside it", async () => {
  const { splitOut } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const parseOut = (stdout) => splitOut(stdout).out;
  // apex_shot: a text line, then pretty-printed JSON whose last value line is a bare number.
  const shot = 'wrote x.png (20.3 KB)\n{\n  "frame": {\n    "tgt": [\n      -285.6,\n      563.528\n    ]\n  }\n}';
  assert.deepEqual(parseOut(shot), { frame: { tgt: [-285.6, 563.528] } });
  assert.equal(parseOut("42"), 42, "a whole-stdout scalar is still apex_eval's answer");
  assert.equal(parseOut("plain text\n  7"), null, "an indented scalar line is not a result");
  assert.deepEqual(parseOut('log\n{"a":1}'), { a: 1 });
  assert.equal(parseOut(""), null);
});

test("splitOut returns the JSON once: in out, and only the text before it in rest", async () => {
  const { splitOut } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const shot = 'wrote x.png (20 KB)\n{\n  "frame": 1\n}';
  assert.deepEqual(splitOut(shot), { out: { frame: 1 }, rest: "wrote x.png (20 KB)" });
  assert.deepEqual(splitOut('{"a":1}'), { out: { a: 1 }, rest: "" }, "pure JSON leaves no stdout");
  assert.deepEqual(splitOut("plain text"), { out: null, rest: "plain text" }, "unparsed text is kept whole");
  assert.deepEqual(splitOut(""), { out: null, rest: "" });
});

test("ciVerdict lifts ci-watch's terminal line into out", async () => {
  const { ciVerdict } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const v = ciVerdict([
    "[ci-watch] CI #1 (push) queued https://x/1",
    "[ci-watch] CI › Smoke (2) → failure — step \"Run smoke shard\": boom https://x/2",
    "[ci-watch] = ci failed (19 jobs, 1 failed, 4 skipped) sha=e3bd067",
  ].join("\n"));
  assert.equal(v.verdict, "failed");
  assert.equal(v.summary, "(19 jobs, 1 failed, 4 skipped) sha=e3bd067");
  assert.equal(v.jobs.length, 2);
  assert.match(v.jobs[1], /^CI › Smoke/);
  assert.equal(ciVerdict("").verdict, null);
});

test("session-check wraps are read-only and pinned", () => {
  const body = (r) => JSON.parse(r.stdout);
  const ss = callCli("apex_session_status", { dryRun: true });
  assert.equal(ss.status, 0, ss.stderr);
  assert.match(body(ss).argv.join(" "), /ci\/session-status\.mjs --json$/);

  const who = callCli("apex_who_is_on_it", { dryRun: true, hours: 12, noFetch: true, paths: ["js/game.js"] });
  assert.equal(who.status, 0, who.stderr);
  assert.match(body(who).argv.join(" "), /ci\/who-is-on-it\.mjs --json --hours 12 --no-fetch js\/game\.js$/);
  for (const [args, re] of [
    [{ paths: ["--claim"] }, /not flags/],
    [{ paths: ["-x"] }, /not flags/],
    [{ paths: "js/game.js" }, /array/],
    [{ hours: 0 }, /hours must be/],
    [{ hours: 999 }, /hours must be/],
  ]) {
    const r = callCli("apex_who_is_on_it", args);
    assert.equal(body(r).error, "bad_args", JSON.stringify(args));
    assert.match(body(r).message, re);
  }

  const ci = callCli("apex_ci_status", { dryRun: true, sha: "e21bcf4" });
  assert.equal(ci.status, 0, ci.stderr);
  assert.match(body(ci).argv.join(" "), /ci\/ci-watch\.mjs --once --sha e21bcf4$/);
  for (const sha of ["--pages", "main", "e21b", "e21bcf4; rm -rf /"]) {
    assert.equal(body(callCli("apex_ci_status", { sha })).error, "bad_args", sha);
  }
  const src = fs.readFileSync(MCP, "utf8");
  for (const n of ["apex_session_status", "apex_who_is_on_it", "apex_ci_status"]) {
    assert.match(src, new RegExp(`name: "${n}",\\s*week: 6,\\s*kind: "tree"`), `${n} takes no browser lock`);
  }
});

test("runSpawn never blocks, and a cancel or timeout kills the child's process group", async () => {
  const { runSpawn } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const body = (r) => JSON.parse(r.content[0].text);
  // A client's notifications/cancelled: the call ends at once, not after the child's 30 s.
  const ctl = new AbortController();
  const t0 = Date.now();
  const pending = runSpawn([process.execPath, "-e", "setTimeout(() => {}, 30000)"], { timeoutMs: 60000, signal: ctl.signal });
  setTimeout(() => ctl.abort(), 200);
  const cancelled = body(await pending);
  assert.equal(cancelled.error, "cancelled");
  assert.equal(cancelled.ok, false);
  assert.ok(Date.now() - t0 < 5000, `cancel took ${Date.now() - t0} ms`);
  // Its own timeout.
  const timedOut = body(await runSpawn([process.execPath, "-e", "setTimeout(() => {}, 30000)"], { timeoutMs: 300 }));
  assert.equal(timedOut.error, "timeout");
  // A normal run still splits stdout from out.
  const fine = body(await runSpawn([process.execPath, "-e", 'console.log("note"); console.log(JSON.stringify({a:1}))']));
  assert.equal(fine.ok, true);
  assert.deepEqual(fine.out, { a: 1 });
  assert.equal(fine.stdout, "note");
});

test("rotateReport lifts rotate-markings --check rows into out", async () => {
  const { rotateReport } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const r = rotateReport([
    "abudhabi      shift 10.15% of lap  16 turns  (sectors left alone)",
    "brands_hatch  shift 83.64% of lap  11 turns",
    "",
    "2 circuit file(s) would change (--write to apply)",
  ].join("\n"));
  assert.equal(r.wouldChange, 2);
  assert.deepEqual(r.circuits[0], { id: "abudhabi", shiftPct: 10.15, turns: 16, sectorsLeftAlone: true });
  assert.equal(r.circuits[1].sectorsLeftAlone, false);
  assert.deepEqual(rotateReport(""), { wouldChange: 0, circuits: [] });
});

test("2026-10-03 tools: track session, jobs, UI and audits pin their argv and refuse bad input", () => {
  const body = (r) => JSON.parse(r.stdout);
  const ok = (name, args, re) => {
    const r = callCli(name, { dryRun: true, ...args });
    assert.equal(r.status, 0, `${name} ${JSON.stringify(args)}: ${r.stdout}${r.stderr}`);
    const b = body(r);
    if (re) assert.match(JSON.stringify(b.argv ?? b.command), re, name);
    return b;
  };
  const bad = (name, args, code = "bad_args") => {
    const b = body(callCli(name, args));
    assert.equal(b.ok, false, `${name} ${JSON.stringify(args)} should refuse`);
    assert.equal(b.error, code, `${name} ${JSON.stringify(args)}: ${b.message}`);
  };
  ok("apex_track", { op: "open", track: "spa" }, /track-session\.mjs","--serve","--track","spa","--out",".*artifacts\/track-session\/spa/);
  bad("apex_track", { op: "open", track: "atlantis" });
  bad("apex_track", { op: "open", track: "spa", out: "/tmp/x" }, "path_escaped");
  bad("apex_track", { op: "shot", cam: "drone" });
  bad("apex_track", { op: "shot", frac: 2 });
  bad("apex_track", { op: "shot" }, "track_not_open");
  ok("apex_job_start", { kind: "survey_track", track: "monza", oblique: true }, /survey-track\.mjs","monza","--oblique/);
  const matrix = ok("apex_job_start", { kind: "ui_matrix", screens: "settings,garage", viewports: "ios-*", scale: "100,130" }, /--screens=settings,garage","--viewports=ios-\*","--scale=100,130/);
  assert.equal(typeof matrix.estimateMs, "number", "ui_matrix dryRun names estimateMs (hud_survey-style)");
  assert.ok(matrix.estimateMs > 0 && matrix.cells >= 2, `ui_matrix cells/estimate: ${JSON.stringify(matrix)}`);
  ok("apex_job_start", { kind: "flicker_gate", site: "a,b" }, /"--site","a","--site","b"/);
  ok("apex_job_start", { kind: "livery_contrast", team: "ferrari" }, /--team=ferrari/);
  bad("apex_job_start", { kind: "rm_rf" });
  bad("apex_job_start", { kind: "ui_gallery", screens: "--write" });
  bad("apex_job_start", { kind: "survey_track", track: "nope" });
  bad("apex_job_status", { jobId: "missing" }, "unknown_job");
  bad("apex_job_cancel", { jobId: "missing" }, "unknown_job");
  ok("apex_ui_fit", { screen: "settings", scale: 130 }, /--screens=settings","--viewports=ios-iphone-landscape","--jobs=1","--json","--scale=130/);
  bad("apex_ui_fit", { screen: "--all" });
  bad("apex_ui_fit", { screen: "settings", scale: 500 });
  ok("apex_ui_shot", { screen: "garage", viewport: "desktop-1440x900" }, /--screen=garage","--viewport=desktop-1440x900/);
  ok("apex_car_audit", { check: "ladder" }, /parts-ladder\.mjs","--json/);
  ok("apex_car_audit", { check: "crest", teams: ["haas", "audi"] }, /crest-sweep\.mjs","haas","audi","--json/);
  bad("apex_car_audit", { check: "sweep" });
  bad("apex_car_audit", { check: "crest", teams: ["--x"] });
  const audit = ok("apex_track_audit", { track: "monza" });
  assert.match(JSON.stringify(audit.argv), /verify-track\.cjs","monza","--quiet".*float-audit\.cjs","monza","--json/);
  bad("apex_track_audit", { track: "x" });
  // `checks` routes through tools/track/audit-circuit.cjs (every per-circuit
  // audit against its baseline, 2026-10-05); the bare call keeps the old pair.
  const full = ok("apex_track_audit", { track: "monza", checks: ["clip", "coplanar"] });
  assert.match(JSON.stringify(full.argv), /audit-circuit\.cjs","monza","--json","--checks","clip,coplanar"/);
  bad("apex_track_audit", { track: "monza", checks: ["nope"] });
  bad("apex_track_audit", { track: "monza", checks: [] });
  // apex_unit_test: one file under tests/unit/, optional --test-name-pattern.
  const unit = ok("apex_unit_test", { file: "tests/unit/hud-layout.test.mjs" });
  assert.match(JSON.stringify(unit.argv), /"--test","tests\/unit\/hud-layout\.test\.mjs"\]$/);
  const pat = ok("apex_unit_test", { file: "tests/unit/hud-layout.test.mjs", pattern: "HELMET" });
  assert.match(JSON.stringify(pat.argv), /"--test","--test-name-pattern","HELMET","tests\/unit\/hud-layout\.test\.mjs"\]$/);
  bad("apex_unit_test", { file: "tests/specs/camera.spec.js" });
  bad("apex_unit_test", { file: "tests/unit/" + "no-such-file.test.mjs" });   // a missing file is refused (docs-integrity: not a path literal)
  bad("apex_unit_test", { file: "../etc/passwd" });
  bad("apex_unit_test", {});
  const src = fs.readFileSync(MCP, "utf8");
  for (const n of ["apex_track", "apex_ui_fit", "apex_ui_shot"]) assert.match(src, new RegExp(`name: "${n}",\\s*week: 7,\\s*kind: "browser"`), `${n} takes the browser lock`);
  for (const n of ["apex_job_start", "apex_job_status", "apex_job_cancel", "apex_car_audit", "apex_track_audit"]) assert.match(src, new RegExp(`name: "${n}",\\s*week: 7,\\s*kind: "tree"`), `${n} is a tree tool`);
});

test("resources/list and resources/read serve the agent references", () => {
  const out = rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "resources/list", params: {} },
    { jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "file:///docs/DEBUG-HOOKS.md" } },
    { jsonrpc: "2.0", id: 4, method: "resources/read", params: { uri: "file:///etc/passwd" } },
  ]);
  const byId = (i) => out.find((m) => m.id === i);
  assert.ok(byId(1).result.capabilities.resources);
  assert.deepEqual(byId(2).result.resources.map((r) => r.name), ["DEBUG-HOOKS.md", "AGENT-SURFACE.md", "APEX-TOOLS-MCP.md"]);
  assert.match(byId(3).result.contents[0].text, /__apex/);
  assert.equal(byId(4).error.code, -32002, "only the listed docs are readable");
});

test("thumbBlock returns an MCP image block a client can render", async () => {
  const { thumbBlock } = await import("../../tools/mcp/apex-extras.mjs");
  const sharp = (await import("sharp")).default;
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "thumb-test-"));
  try {
    const png = path.join(dir, "x.png");
    await sharp({ create: { width: 1280, height: 720, channels: 3, background: "#336699" } }).png().toFile(png);
    const b = await thumbBlock(png);
    assert.equal(b.type, "image");
    assert.equal(b.mimeType, "image/jpeg");
    const meta = await sharp(Buffer.from(b.data, "base64")).metadata();
    assert.equal(meta.width, 640);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// 2026-10-05: three apex-tools defects (job log empty, graph_parity --all past
// the 180 s cap, apex_track unable to frame anything high in the air).
test("a job's reported log is the file holding its output, and status tails it", async () => {
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { splitOut } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  // A fake ROOT whose job CLIs report the way the real ones do: text, then JSON on stdout.
  const fake = fs.mkdtempSync(path.join(ROOT, "artifacts", "apex-jobs-test-"));
  try {
    fs.mkdirSync(path.join(fake, "tools", "track"), { recursive: true });
    fs.writeFileSync(path.join(fake, "tools/track/verify-track.cjs"),
      'console.log("52/52 circuits ok"); console.error("a warning"); console.log(JSON.stringify({ ok: true, n: 52 }));\n');
    fs.writeFileSync(path.join(fake, "tools/track/graph-parity.cjs"),
      'console.log(`BASE=${process.env.BASE} args=${process.argv.slice(2).join(" ")}`);\n');
    const toolResult = (body, { isError = false } = {}) => ({ content: [{ type: "text", text: JSON.stringify(body) }], ...(isError || body.ok === false ? { isError: true } : {}) });
    const refuse = (error, message, fix) => toolResult({ ok: false, error, message, fix });
    const x = createExtras({ ROOT: fake, toolResult, refuse, acquireLock: () => null, releaseLock() {}, occupancyRefuse: () => null,
      assertSafeOut: (p) => p, knownCircuits: () => ["monza"], runSpawn: null, splitOut, log() {}, mockMode: () => false });
    const body = (r) => JSON.parse(r.content[0].text);
    const settle = async (jobId) => {
      for (let i = 0; i < 200; i++) {
        const b = body(x.handlers.apex_job_status({ jobId }));
        if (b.state !== "running") return b;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error(`job ${jobId} never finished`);
    };
    const started = body(x.handlers.apex_job_start({ kind: "verify_all" }));
    assert.match(started.log, /^artifacts\/logs\/apex-jobs\/verify_all-.*\.log$/);
    const done = await settle(started.jobId);
    assert.equal(done.state, "done", JSON.stringify(done));
    const logText = fs.readFileSync(path.join(fake, done.log), "utf8");
    assert.match(logText, /52\/52 circuits ok/, "the reported log holds the CLI's output, not 0 bytes");
    assert.match(fs.readFileSync(path.join(fake, done.stderr), "utf8"), /a warning/);
    assert.equal(done.tail, undefined, "a finished job whose log parsed carries out, not the same text again (#2672)");
    assert.deepEqual(done.out, { ok: true, n: 52 });
    assert.ok(!fs.readdirSync(path.join(fake, "artifacts/logs/apex-jobs")).some((f) => f.endsWith(".out")), "no unreported side file");

    // graph_parity_all: BASE travels by env, --all is pinned.
    const gp = body(x.handlers.apex_job_start({ kind: "graph_parity_all", base: "HEAD~1" }));
    assert.match((await settle(gp.jobId)).tail, /BASE=HEAD~1 args=--all/);
  } finally { fs.rmSync(fake, { recursive: true, force: true }); }
});

// 2026-10-09: a one-shot `call` parent dies before a job's exit handler runs, so a later apex_job_status (another
// process, disk manifest only) used to read the verdict off the log's last line: a plain-text CLI that exited 0 was
// "failed". The sh wrapper now leaves the real exit code beside the log. And a finished result over the cap
// (hud_survey: ~150 KB of cells) keeps its headline keys instead of blowing the client's reply limit.
test("job exit code survives the parent (disk-only status) and a huge result is capped", async () => {
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { splitOut } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const fake = fs.mkdtempSync(path.join(ROOT, "artifacts", "apex-jobs-test-"));
  try {
    fs.mkdirSync(path.join(fake, "tools", "track"), { recursive: true });
    fs.writeFileSync(path.join(fake, "tools/track/verify-track.cjs"),
      'const big = Array.from({ length: 4000 }, (_, i) => ({ cell: "c" + i, pad: "x".repeat(20) }));\n'
      + 'console.log(JSON.stringify({ ok: true, counts: { total: 4000 }, cells: big }));\n');
    fs.writeFileSync(path.join(fake, "tools/track/graph-parity.cjs"), 'console.log("all within caps - exit 0");\n');
    fs.writeFileSync(path.join(fake, "tools/track/float-audit.cjs"), 'console.log("nope"); process.exit(3);\n');
    const toolResult = (body, { isError = false } = {}) => ({ content: [{ type: "text", text: JSON.stringify(body) }], ...(isError || body.ok === false ? { isError: true } : {}) });
    const refuse = (error, message, fix) => toolResult({ ok: false, error, message, fix });
    const mk = () => createExtras({ ROOT: fake, toolResult, refuse, acquireLock: () => null, releaseLock() {}, occupancyRefuse: () => null,
      assertSafeOut: (p) => p, knownCircuits: () => ["monza"], runSpawn: null, splitOut, log() {}, mockMode: () => false });
    const body = (r) => JSON.parse(r.content[0].text);
    const first = mk();
    const settle = async (x, jobId) => {
      for (let i = 0; i < 200; i++) {
        const b = body(x.handlers.apex_job_status({ jobId }));
        if (b.state !== "running") return b;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error(`job ${jobId} never finished`);
    };
    const ok = body(first.handlers.apex_job_start({ kind: "graph_parity_all", base: "HEAD" }));
    const bad = body(first.handlers.apex_job_start({ kind: "float_all" }));
    await settle(first, ok.jobId); await settle(first, bad.jobId);
    const big = body(first.handlers.apex_job_start({ kind: "verify_all" }));   // two jobs at a time
    await settle(first, big.jobId);
    const dir = path.join(fake, "artifacts/logs/apex-jobs");
    assert.equal(fs.readFileSync(path.join(dir, `${ok.jobId}.exit`), "utf8"), "0");
    assert.equal(fs.readFileSync(path.join(dir, `${bad.jobId}.exit`), "utf8"), "3");

    // The parent "died" with the manifest still running: a fresh process judges by the exit file, not the log.
    for (const id of [ok.jobId, bad.jobId]) {
      const f = path.join(dir, `${id}.json`);
      const m = JSON.parse(fs.readFileSync(f, "utf8"));
      // The wrapper's shell may be an unreaped zombie: kill(pid, 0) still
      // succeeds. A live PID here proves the recorded .exit wins over that.
      Object.assign(m, { state: "running", exit: null, pid: process.pid, ended: null });
      fs.writeFileSync(f, JSON.stringify(m));
    }
    const second = mk();
    const okS = body(second.handlers.apex_job_status({ jobId: ok.jobId }));
    assert.equal(okS.state, "done", "plain-text last line, exit 0: done");
    assert.equal(okS.exit, 0);
    assert.equal(body(second.handlers.apex_job_status({ jobId: bad.jobId })).exit, 3);
    const bigS = body(second.handlers.apex_job_status({ jobId: big.jobId }));
    assert.equal(bigS.out.truncated, true, "over the cap");
    assert.deepEqual(bigS.out.counts, { total: 4000 }, "headline keys survive");
    assert.ok(bigS.out.keys.includes("cells") && !("cells" in bigS.out), "the big array is named, not returned");
    assert.ok(JSON.stringify(bigS).length < 40000, `status reply stays small (${JSON.stringify(bigS).length})`);
  } finally { fs.rmSync(fake, { recursive: true, force: true }); }
});

// 2026-10-09: the async survey job carried only preset/fracs/tod/count, so cams (and cam/az/el/dist/h/side/hud/shots)
// vanished: {cams:[orbit,eye]} came back orbit-only. shot-survey.mjs takes the rest as --plan-json.
test("shot-survey --plan-json carries cams into the plan", () => {
  const run = (...extra) => JSON.parse(spawnSync(process.execPath, [path.join(ROOT, "tools/shot/shot-survey.mjs"),
    "--tracks", "monza", "--preset", "custom", "--fracs", "0.1", "--dry-run", ...extra], { encoding: "utf8", cwd: ROOT }).stdout);
  assert.equal(run().shotsPerTrack, 1);
  const two = run("--plan-json", JSON.stringify({ cams: ["orbit", "eye"] }));
  assert.deepEqual(two.shots.map((x) => x.cam), ["orbit", "eye"]);
});

// 2026-10-07 (#1192): apex_hud_shot / apex_hud_survey outlast the host's
// ~60–120 s MCP call, so they default to hud_* jobs. Those kinds run only the
// argv the server built and pinned — never one a JSON caller supplies.
test("hud_shot / hud_survey jobs take a server-pinned argv only", async () => {
  const body = (r) => JSON.parse(r.stdout);
  for (const kind of ["hud_shot", "hud_survey"]) {
    const bare = body(callCli("apex_job_start", { dryRun: true, kind }));
    assert.equal(bare.error, "bad_args", `${kind} without a pinned argv must refuse`);
    const smuggled = body(callCli("apex_job_start", { dryRun: true, kind, _argv: ["/bin/sh", "-c", "id"] }));
    assert.equal(smuggled.error, "bad_args", `${kind} must reject a caller argv`);
  }
  const { createExtras, HUD_JOB_ARGV, JOB_KINDS } = await import("../../tools/mcp/apex-extras.mjs");
  assert.ok(JOB_KINDS.includes("hud_shot") && JOB_KINDS.includes("hud_survey"));
  assert.equal(typeof HUD_JOB_ARGV, "symbol");
  const toolResult = (b, { isError = false } = {}) => ({ content: [{ type: "text", text: JSON.stringify(b) }], ...(isError || b.ok === false ? { isError: true } : {}) });
  const refuse = (error, message, fix) => toolResult({ ok: false, error, message, fix });
  const x = createExtras({ ROOT, toolResult, refuse, acquireLock: () => null, releaseLock() {}, occupancyRefuse: () => null,
    assertSafeOut: (p) => p, knownCircuits: () => ["monza"], runSpawn: null, splitOut: () => ({}), log() {}, mockMode: () => false });
  const argv = [process.execPath, "tools/shot/hud-survey.mjs", "--device", "desktop-1280", "--cam", "chase"];
  const planned = JSON.parse(x.handlers.apex_job_start({ kind: "hud_shot", dryRun: true, [HUD_JOB_ARGV]: argv }).content[0].text);
  assert.equal(planned.ok, true, JSON.stringify(planned));
  assert.deepEqual(planned.argv, argv);
  assert.equal(planned.browser, true, "hud jobs hold the browser lock");
  const viaString = JSON.parse(x.handlers.apex_job_start({ kind: "hud_shot", dryRun: true, "Symbol(apex.hudJobArgv)": argv }).content[0].text);
  assert.equal(viaString.error, "bad_args", "a string key never stands in for the Symbol");
});

test("apex_graph_parity all:true routes to the graph_parity_all job, never the 180 s spawn", () => {
  const body = (r) => JSON.parse(r.stdout);
  const all = callCli("apex_graph_parity", { dryRun: true, base: "HEAD~1", all: true });
  assert.equal(all.status, 0, all.stdout + all.stderr);
  const b = body(all);
  assert.equal(b.kind, "graph_parity_all");
  assert.equal(b.routed, "apex_job_start graph_parity_all");
  assert.deepEqual(b.env, { BASE: "HEAD~1" });
  assert.match(JSON.stringify(b.argv), /graph-parity\.cjs","--all"\]$/);
  const job = body(callCli("apex_job_start", { dryRun: true, kind: "graph_parity_all", base: "origin/main" }));
  assert.deepEqual(job.env, { BASE: "origin/main" });
  for (const args of [{ kind: "graph_parity_all" }, { kind: "graph_parity_all", base: "--output=/x" }, { kind: "graph_parity_all", base: "a b" }]) {
    const r = body(callCli("apex_job_start", { dryRun: true, ...args }));
    assert.equal(r.error, "bad_args", JSON.stringify(args));
  }
  assert.equal(body(callCli("apex_graph_parity", { dryRun: true, all: true })).error, "bad_args", "base stays required");
});

test("apex_track shot carries el and h: eye pitch / eye height, orbit aim height", () => {
  const body = (r) => JSON.parse(r.stdout);
  const eye = body(callCli("apex_track", { dryRun: true, op: "shot", frac: 0.523, cam: "eye", el: -12, h: 206 }));
  assert.equal(eye.ok, true, JSON.stringify(eye));
  assert.equal(eye.command.el, -12);
  assert.equal(eye.command.h, 206);
  const orbit = body(callCli("apex_track", { dryRun: true, op: "shot", frac: 0.523, cam: "orbit", el: 15, dist: 120, h: 206 }));
  assert.deepEqual([orbit.command.cam, orbit.command.h, orbit.command.dist], ["orbit", 206, 120]);
  for (const bad of [{ h: 5000 }, { h: -500 }, { h: "206" }, { el: 120 }, { dist: 0 }, { az: 1e6 }]) {
    const r = body(callCli("apex_track", { dryRun: true, op: "shot", ...bad }));
    assert.equal(r.error, "bad_args", JSON.stringify(bad));
  }
  assert.equal(body(callCli("apex_track", { op: "shot", h: 10 })).error, "track_not_open", "a real shot still needs a session");
  // The page half: h reaches eyeAt / orbit, an explicit el re-aims eye through view({eye,yaw,pitch}).
  const ts = fs.readFileSync(path.join(ROOT, "tools/shot/track-session.mjs"), "utf8");
  assert.match(ts, /a\.eyeAt\(o\.frac, o\.lat \|\| 0, o\.h == null \? 2\.5 : o\.h, o\.lookFrac\)/);
  assert.match(ts, /a\.view\(\{ eye: r\.eye, yaw, pitch: o\.pitch \}\)/);
  assert.match(ts, /a\.orbit\(o\.frac, o\.az, o\.el, o\.dist, o\.h == null \? 1\.5 : o\.h, \{ clear: o\.clear \}\)/);
  assert.match(ts, /clear: !op\.through/, "survey shots step round blockers like shot.mjs unless op.through");
});

test("apex-eval: the shapeOf helper it injects into the page parses (named fn expr, no source rewrite)", async () => {
  // 2026-10-05: a global /shapeOf\(/ -> "window.__shape(" rewrite also hit the
  // declaration and injected `function window.__shape(` — a SyntaxError that
  // failed EVERY browser apex_eval. Rebuild the injected string from source.
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../../tools/shot/apex-eval.mjs", import.meta.url), "utf8");
  assert.ok(!/SHAPE\.replace\(/.test(src), "the injected helper must not be source-rewritten");
  const body = src.slice(src.indexOf("function shapeOf("), src.indexOf("\nconst SHAPE"));
  const shapeLine = src.match(/^const SHAPE = (.+);$/m)[1];
  const SHAPE = new Function("shapeOf", "return " + shapeLine)(new Function("return " + body)());
  const win = {};
  new Function("window", SHAPE)(win);
  assert.equal(typeof win.__shape, "function");
  assert.equal(win.__shape([1, 2]).startsWith("Array(2)"), true);
});

// 2026-10-10: a tool must say what it needs. Ten first calls in one session came back bad_args with no way forward
// ("arguments must match one of the advertised types", "tool needs file"); the survey dropped `cams` and still said ok.
// These keep every tool answerable to a minimal valid call, and every refusal self-explaining.
const MIN_ARGS = {
  apex_unit_test: { file: "tests/unit/a11y-pwa-pass.test.mjs" },
  apex_select_specs: { since: "HEAD~1" },
  apex_graph_parity: { base: "HEAD~1", id: "monza" },
  apex_frame_report: { track: "monza" },
  apex_shot_survey: { track: "monza" },
  apex_locations: { track: 'monza' },
  apex_car_audit: { check: "ladder" },
  apex_ui_fit: { screen: "title" },
  apex_profile: { track: "monza" },
  apex_ui_shot: { screen: "title" },
  apex_job_start: { kind: "verify_all" },
};
const callTools = (calls) => {
  const out = rpc([
    { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    ...calls.map(([name, args], i) => ({ jsonrpc: "2.0", id: i + 1, method: "tools/call", params: { name, arguments: args } })),
  ]);
  return calls.map((_, i) => {
    const r = out.find((m) => m.id === i + 1);
    assert.ok(r && r.result, `no reply for ${calls[i][0]}`);
    return { isError: !!r.result.isError, body: JSON.parse(r.result.content[0].text) };
  });
};

test("every tool answers a minimal valid call (mock): ok, not a bad_args refusal", () => {
  const tools = rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]).find((m) => m.id === 1).result.tools;
  assert.ok(tools.length >= 28, `catalog has ${tools.length} tools`);
  const skip = new Set(["apex_job_cancel", "apex_garage", "apex_track"]);   // need a prior job / a live session
  const calls = tools.filter((t) => !skip.has(t.name)).map((t) => {
    const args = { ...(MIN_ARGS[t.name] || {}) };
    for (const k of t.inputSchema.required || []) if (!(k in args)) args[k] = t.inputSchema.properties[k].enum?.[0] ?? "x";
    return [t.name, args];
  });
  const res = callTools(calls);
  const bad = res.map((r, i) => [calls[i][0], r]).filter(([, r]) => r.body.error === "bad_args");
  assert.deepEqual(bad.map(([n, r]) => `${n}: ${r.body.message}`), [], "a minimal valid call must not be refused as bad_args");
});

test("bad_args names the way forward: required hint, did-you-mean, valid keys, got-type", () => {
  const [needs, anyOf, key, en, type] = callTools([
    ["apex_unit_test", {}],
    ["apex_graph_parity", {}],
    ["apex_shot", { track: "monza", fracc: 0.1 }],
    ["apex_shot", { track: "monza", cam: "orbt" }],
    ["apex_shot", { track: "monza", frac: "x" }],
  ]).map((r) => r.body);
  assert.match(needs.fix, /Pass "file": string/, "required key: what to pass");
  assert.match(anyOf.message, /id or all:true/, "anyOf: the alternatives, not 'one of the advertised types'");
  assert.match(anyOf.fix, /Required: base/);
  assert.match(key.fix, /Did you mean "frac"\?.*Valid: track, frac, cam/, "unknown key: nearest + the valid list");
  assert.match(en.fix, /Did you mean "orbit"\?/);
  assert.match(type.message, /frac must be number, got string/);
});

test("apex_ui_fit / apex_ui_shot refuse an id the audit does not know instead of ok:true, out:null", () => {
  const [menu, typo, vp] = callTools([
    ["apex_ui_fit", { screen: "menu" }],
    ["apex_ui_shot", { screen: "settngs" }],
    ["apex_ui_fit", { screen: "settings", viewport: "phone-landscape-844x390" }],
  ]).map((r) => r.body);
  for (const b of [menu, typo, vp]) { assert.equal(b.ok, false); assert.equal(b.error, "bad_args"); }
  assert.match(typo.fix, /Did you mean settings\?/);
  assert.match(vp.fix, /ios-iphone-landscape-844/, "the phone-landscape id is in the list");
});

test("apex_hud_shot aliases layout-audit viewport ids and did-you-means a near miss", () => {
  const aliased = callTools([["apex_hud_shot", { device: "ios-iphone-landscape-844", dryRun: true }]])[0].body;
  assert.equal(aliased.ok, true, JSON.stringify(aliased));
  assert.match(JSON.stringify(aliased.argv), /phone-landscape-844x390/, "alias rewrites before the CLI");
  const miss = callTools([["apex_hud_shot", { device: "phone-landscape-844", dryRun: true }]])[0].body;
  assert.equal(miss.ok, false);
  assert.equal(miss.error, "bad_args");
  assert.match(miss.fix, /Did you mean "phone-landscape-844x390"\?/, miss.fix);
});

test("image and inlineImage are aliases across shot / ui_shot / hud_shot", () => {
  const hud = callTools([["apex_hud_shot", { image: true, dryRun: true }]])[0].body;
  assert.equal(hud.ok, true, `hud image→inlineImage: ${JSON.stringify(hud)}`);
  const ui = callTools([["apex_ui_shot", { screen: "title", inlineImage: true, dryRun: true }]])[0].body;
  assert.equal(ui.ok, true, `ui_shot inlineImage→image: ${JSON.stringify(ui)}`);
  const shot = callTools([["apex_shot", { track: "monza", inlineImage: false, dryRun: true }]])[0].body;
  assert.equal(shot.ok, true, `shot inlineImage→image: ${JSON.stringify(shot)}`);
});

test("apex_job_status {} is bounded: newest first, limit, state filter, total", async () => {
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { splitOut } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const fake = fs.mkdtempSync(path.join(ROOT, "artifacts", "apex-jobs-test-"));
  try {
    const dir = path.join(fake, "artifacts/logs/apex-jobs");
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 1; i <= 5; i++) {
      fs.writeFileSync(path.join(dir, `float_all-t${i}.json`), JSON.stringify({ id: `float_all-t${i}`, kind: "float_all", state: i % 2 ? "done" : "failed", exit: i % 2 ? 0 : 1,
        started: 1000 * i, ended: Date.now() - 5, argv: [], log: `artifacts/logs/apex-jobs/float_all-t${i}.log`, stderr: "" }));   // recent: older than 7 days is pruned
    }
    const toolResult = (b) => ({ content: [{ type: "text", text: JSON.stringify(b) }] });
    const x = createExtras({ ROOT: fake, toolResult, refuse: (e, m, f) => toolResult({ ok: false, error: e, message: m, fix: f }), acquireLock: () => null, releaseLock() {},
      occupancyRefuse: () => null, assertSafeOut: (p) => p, knownCircuits: () => ["monza"], runSpawn: null, splitOut, log() {}, mockMode: () => false });
    const list = (a) => JSON.parse(x.handlers.apex_job_status(a).content[0].text);
    const two = list({ limit: 2 });
    assert.deepEqual(two.jobs.map((j) => j.jobId), ["float_all-t5", "float_all-t4"], "newest first");
    assert.equal(two.total, 5);
    assert.match(two.hint, /3 older job\(s\) not shown/);
    const failed = list({ state: "failed" });
    assert.deepEqual(failed.jobs.map((j) => j.jobId), ["float_all-t4", "float_all-t2"]);
    assert.equal(failed.hint, undefined, "nothing hidden, no hint");
  } finally { fs.rmSync(fake, { recursive: true, force: true }); }
});

test("apex_job_status {} prunes manifests older than 7 days and re-judges a pre-.exit failed job whose log says ok:true", async () => {
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { splitOut } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const fake = fs.mkdtempSync(path.join(ROOT, "artifacts", "apex-jobs-test-"));
  try {
    const rel = "artifacts/logs/apex-jobs";
    const dir = path.join(fake, rel);
    fs.mkdirSync(dir, { recursive: true });
    const now = Date.now();
    const mk = (id, state, ended, logText, exitText) => {
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, kind: "float_all", state, exit: state === "done" ? 0 : 1, started: ended - 10, ended, argv: [], log: `${rel}/${id}.log`, stderr: `${rel}/${id}.err` }));
      fs.writeFileSync(path.join(dir, `${id}.log`), logText);
      fs.writeFileSync(path.join(dir, `${id}.err`), "");
      if (exitText != null) fs.writeFileSync(path.join(dir, `${id}.exit`), exitText);
    };
    const old = now - 8 * 86400000;
    mk("old-done", "done", old, "{}", "0");
    mk("old-failed", "failed", old, "{}", "1");
    mk("stale-failed", "failed", now - 1000, 'noise\n{"ok": true, "n": 3}\n');   // no .exit, log says ok:true
    mk("real-failed", "failed", now - 2000, '{"ok": false}\n');                   // no .exit, log says ok:false
    mk("exit-failed", "failed", now - 3000, '{"ok": true}\n', "1");               // has .exit: trust it
    const toolResult = (b) => ({ content: [{ type: "text", text: JSON.stringify(b) }] });
    const x = createExtras({ ROOT: fake, toolResult, refuse: (e, m, f) => toolResult({ ok: false, error: e, message: m, fix: f }), acquireLock: () => null, releaseLock() {},
      occupancyRefuse: () => null, assertSafeOut: (p) => p, knownCircuits: () => ["monza"], runSpawn: null, splitOut, log() {}, mockMode: () => false });
    const res = JSON.parse(x.handlers.apex_job_status({}).content[0].text);
    const state = Object.fromEntries(res.jobs.map((j) => [j.jobId, j.state]));
    assert.deepEqual(state, { "stale-failed": "done", "real-failed": "failed", "exit-failed": "failed" });
    assert.equal(res.total, 3);
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.startsWith("old-")), [], "json, log, err and exit of an expired job are all gone");
    assert.ok(fs.existsSync(path.join(dir, "real-failed.log")), "recent jobs keep their files");
  } finally { fs.rmSync(fake, { recursive: true, force: true }); }
});

// 2026-10-10: serve-http (127.0.0.1:3713 /mcp + /healthz) had no test. Real process, a FREE port (APEX_MCP_HTTP_PORT), mock mode.
test("serve-http answers /healthz and a JSON-RPC tools/list on loopback, then stops", async () => {
  const net = await import("node:net");
  const http = await import("node:http");
  const port = await new Promise((res, rej) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); s.on("error", rej); });
  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, [MCP, "serve-http"], { cwd: ROOT, env: { ...process.env, APEX_MCP_MOCK: "1", APEX_MCP_HTTP_PORT: String(port) }, stdio: ["ignore", "ignore", "pipe"] });
  const req = (method, urlPath, body) => new Promise((res, rej) => {
    const r = http.request({ host: "127.0.0.1", port, path: urlPath, method, headers: body ? { "Content-Type": "application/json" } : {} }, (m) => {
      let d = ""; m.on("data", (c) => (d += c)); m.on("end", () => res({ status: m.statusCode, body: d ? JSON.parse(d) : null }));
    });
    r.on("error", rej); if (body) r.write(JSON.stringify(body)); r.end();
  });
  try {
    let health = null;
    for (let i = 0; i < 60 && !health; i++) {
      try { health = await req("GET", "/healthz"); } catch { await new Promise((r) => setTimeout(r, 250)); }
    }
    assert.ok(health, "serve-http never answered /healthz");
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.bind, "127.0.0.1", "loopback only, never 0.0.0.0");
    assert.ok(health.body.tools >= 28, `tools ${health.body.tools}`);
    const list = await req("POST", "/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" });
    assert.equal(list.status, 200);
    assert.ok(list.body.result.tools.some((t) => t.name === "apex_status"));
    const bad = await req("POST", "/mcp", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "apex_shot", arguments: { track: "monza", fracc: 1 } } });
    assert.match(JSON.parse(bad.body.result.content[0].text).fix, /Did you mean "frac"/, "the same self-explaining refusals over HTTP");
    assert.equal((await req("GET", "/nope")).status, 404);
  } finally { child.kill("SIGTERM"); }
});

// 2026-10-10: "2 jobs already running" sent the caller to a second call to learn which.
test("jobs_busy names the running jobs and the limit", async () => {
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { splitOut } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const fake = fs.mkdtempSync(path.join(ROOT, "artifacts", "apex-jobs-test-"));
  try {
    const dir = path.join(fake, "artifacts/logs/apex-jobs");
    fs.mkdirSync(dir, { recursive: true });
    for (const [id, kind] of [["hud_survey-a", "hud_survey"], ["frame_fleet-b", "frame_fleet"]]) {
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, kind, state: "running", exit: null, pid: process.pid, started: Date.now() - 5000, argv: [], log: `artifacts/logs/apex-jobs/${id}.log`, stderr: "" }));
    }
    const toolResult = (b) => ({ content: [{ type: "text", text: JSON.stringify(b) }] });
    const x = createExtras({ ROOT: fake, toolResult, refuse: (e, m, f) => toolResult({ ok: false, error: e, message: m, fix: f }), acquireLock: () => null, releaseLock() {},
      occupancyRefuse: () => null, assertSafeOut: (p) => p, knownCircuits: () => ["monza"], runSpawn: null, splitOut, log() {}, mockMode: () => false });
    const r = JSON.parse(x.handlers.apex_job_start({ kind: "verify_all" }).content[0].text);
    assert.equal(r.error, "jobs_busy");
    assert.match(r.message, /hud_survey-a \(hud_survey, \d+s\)/);
    assert.match(r.message, /frame_fleet-b \(frame_fleet, \d+s\)/);
    assert.match(r.fix, /At most 2 run at once/);
  } finally { fs.rmSync(fake, { recursive: true, force: true }); }
});

// apex_catalog: one read for every id the tools accept; it reads the tools' own schemas, so it cannot drift.
test("apex_catalog lists the ids the other tools accept, from their own schemas and the UI audit catalogs", () => {
  const r = callCli("apex_catalog", {});
  assert.equal(r.status, 0, r.stderr);
  const b = JSON.parse(r.stdout);
  assert.equal(b.ok, true);
  const list = JSON.parse(spawnSync(process.execPath, [MCP, "list-tools"], { encoding: "utf8", cwd: ROOT }).stdout);
  const enumOf = (tool, prop) => list.find((t) => t.name === tool).inputSchema.properties[prop].enum;
  assert.deepEqual(b.tracks, enumOf("apex_shot", "track"));
  assert.deepEqual(b.hudDevices, enumOf("apex_hud_shot", "device"));
  assert.deepEqual(b.shotPresets, enumOf("apex_shot_survey", "preset"));
  assert.ok(b.uiScreens.includes("settings") && b.uiViewports.includes("ios-iphone-landscape"), "the UI audit's catalogs");
  assert.ok(b.jobKinds.includes("ui_matrix") && b.jobKinds.includes("float_all"));
  assert.ok(!b.uiViewports.includes("phone-landscape-844x390"), "the two viewport families stay distinct");
});
test("apex_locations discovers authored turns and scenery names for shot surveys", () => {
  const list = JSON.parse(callCli("apex_locations", { track: "monaco", search: "turn-1" }).stdout);
  assert.equal(list.ok, true);
  assert.deepEqual(list.locations.map(l => l.id), ["monaco/turn-1"]);
  const named = JSON.parse(callCli("apex_locations", { track: "spa", search: "eau rouge" }).stdout);
  assert.deepEqual(named.locations.map(l => l.id), ["spa/eau-rouge"]);
  const plan = JSON.parse(callCli("apex_shot_survey", { track: "monaco", location: "monaco/turn-1",
    angles: ["apex"], dryRun: true }).stdout);
  assert.equal(plan.shots[0].location, "monaco/turn-1");
  assert.equal(plan.options.profile, 'preview');
  const batch = JSON.parse(callCli('apex_shot_survey', { tracks: ['monaco', 'spa'],
    locations: ['monaco/turn-1', 'spa/eau-rouge'], angles: ['overview'], dryRun: true }).stdout);
  assert.equal(batch.ok, true);
  assert.equal(batch.plans.spa.shots[0].location, 'spa/eau-rouge');
  assert.equal(batch.plans.monaco.shots[0].location, 'monaco/turn-1');
  assert.equal(batch.options.profile, 'preview');
  const comparison = JSON.parse(callCli('apex_shot_survey', { track: 'monaco', location: 'monaco/turn-1', profile: 'comparison', dryRun: true }).stdout);
  assert.equal(comparison.options.profile, 'comparison');
});

test('custom survey collection flows through location catalog and async job argv', async () => {
  const { design } = await import('../helpers/editor-vm.mjs');
  const { loadSurveyDesigns } = await import('../../tools/lib/custom-survey-locations.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-custom-survey-')), file = path.join(dir, 'designs.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ format: 'apex26.tracks', v: 1, items: [design({ props: [{ kind: 'pond', s: .25, side: 1, gap: 40 }] })] }));
    const id = loadSurveyDesigns(file).designs[0].id;
    const catalog = JSON.parse(callCli('apex_locations', { track: id, designs: file }).stdout);
    assert.equal(catalog.ok, true);
    assert.equal(catalog.locations[0].id, `${id}/pond-1`);
    const plan = JSON.parse(callCli('apex_shot_survey', { track: id, designs: file, location: `${id}/pond-1`, angles: ['overhead'], dryRun: true }).stdout);
    assert.equal(plan.ok, true);
    assert.equal(plan.options.profile, 'preview');
    assert.deepEqual(plan.shots[0].target, catalog.locations[0].target);
    const { buildTrackShotSurveyPlan } = await import('../../tools/lib/track-shot-survey.mjs');
    const selected = buildTrackShotSurveyPlan({ preset: 'quick' }).shots[0].name;
    const job = JSON.parse(callCli('apex_job_start', { kind: 'shot_survey', track: id, designs: file, preset: 'quick', select: [selected], profile: 'preview', dryRun: true }).stdout);
    assert.equal(job.ok, true);
    assert.equal(job.argv[job.argv.indexOf('--designs') + 1], file);
    assert.equal(job.argv[job.argv.indexOf('--profile') + 1], 'preview');
    assert.equal(job.argv[job.argv.indexOf('--select') + 1], selected);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// A misspelled key used to hide behind "tool needs <required>" / the anyOf message; the typo is the likelier mistake.
test("a misspelled key is reported with a did-you-mean before the missing required argument", () => {
  const msg = (name, args) => { const b = JSON.parse(callCli(name, args).stdout); return `${b.message} | ${b.fix}`; };
  assert.match(msg("apex_unit_test", { fil: "x" }), /unknown argument fil \| Did you mean "file"\?/);
  assert.match(msg("apex_graph_parity", { bse: "HEAD", id: "monza" }), /unknown argument bse \| Did you mean "base"\?/);
  assert.match(msg("apex_shot_survey", { trak: "monza" }), /unknown argument trak \| Did you mean "track"\?/);
  // No typo: the missing required argument is still named.
  assert.match(msg("apex_unit_test", {}), /tool needs file \| Pass "file"/);
});

// apex_verify_change_fast is ~10 min (tooling-fast on one job): past the host cap and its own 600 s. It runs as a job.
test("apex_verify_change_fast routes to a background verify_change_fast job, pinned --fast --json, sync:true opts out", () => {
  const body = (r) => JSON.parse(r.stdout);
  const job = body(callCli("apex_job_start", { kind: "verify_change_fast", since: "HEAD~1", staged: true, dryRun: true }));
  assert.equal(job.ok, true);
  assert.deepEqual(job.argv.slice(1).map((a) => a.replace(/^.*\/tools\//, "tools/")), ["tools/ci/verify-change.mjs", "--fast", "--json", "--since", "HEAD~1", "--staged"]);
  assert.equal(job.browser, false, "a tree job: no browser lock");
  assert.match(body(callCli("apex_job_start", { kind: "verify_change_fast", since: "--wait", dryRun: true })).message, /may not start with a CLI flag|since must be a git ref/);
  // The tool: dryRun keeps its plan; a real call routes (mock mode: no process is started).
  assert.equal(body(callCli("apex_verify_change_fast", { dryRun: true })).out.plan, true);
  const routed = body(callCli("apex_verify_change_fast", { since: "HEAD~1" }, { APEX_MCP_MOCK: "1" }));
  assert.equal(routed.routed, "apex_job_start verify_change_fast", JSON.stringify(routed));
  assert.equal(routed.kind, "verify_change_fast");
  assert.match(routed.hint, /apex_job_status/);
  // sync:true is still accepted (it blocks); its dryRun shows the same pinned argv.
  const sync = body(callCli("apex_verify_change_fast", { since: "HEAD~1", sync: true, dryRun: true }));
  assert.ok(sync.argv.includes("--fast") && sync.argv.includes("--json") && !sync.argv.includes("--wait"));
});

// verify-change --fast exits 2 for a "partial" verdict (browser groups not run, by design): the job is done, not failed.
test("a verify_change_fast job that exits 2 (partial) is done; any other non-zero exit is failed", async () => {
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { splitOut } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const fake = fs.mkdtempSync(path.join(ROOT, "artifacts", "apex-jobs-test-"));
  try {
    fs.mkdirSync(path.join(fake, "tools", "ci"), { recursive: true });
    fs.mkdirSync(path.join(fake, "tools", "track"), { recursive: true });
    fs.writeFileSync(path.join(fake, "tools/ci/verify-change.mjs"), 'console.log(JSON.stringify({ verdict: "partial", notRun: ["browser"] })); process.exit(Number(process.env.VC_EXIT || 2));\n');
    fs.writeFileSync(path.join(fake, "tools/track/verify-track.cjs"), "process.exit(2);\n");
    const toolResult = (body, { isError = false } = {}) => ({ content: [{ type: "text", text: JSON.stringify(body) }], ...(isError || body.ok === false ? { isError: true } : {}) });
    const refuse = (error, message, fix) => toolResult({ ok: false, error, message, fix });
    const x = createExtras({ ROOT: fake, toolResult, refuse, acquireLock: () => null, releaseLock() {}, occupancyRefuse: () => null,
      assertSafeOut: (p) => p, knownCircuits: () => ["monza"], runSpawn: null, splitOut, log() {}, mockMode: () => false });
    const body = (r) => JSON.parse(r.content[0].text);
    const settle = async (jobId) => body(await x.handlers.apex_job_status({ jobId, wait: 30 }));
    const vc = await settle(body(x.handlers.apex_job_start({ kind: "verify_change_fast" })).jobId);
    assert.equal(vc.state, "done", JSON.stringify(vc));
    assert.equal(vc.exit, 2);
    assert.equal(vc.out.verdict, "partial");
    // The same exit 2 from another kind is a failure.
    const other = await settle(body(x.handlers.apex_job_start({ kind: "verify_all" })).jobId);
    assert.equal(other.state, "failed", JSON.stringify(other));
  } finally { fs.rmSync(fake, { recursive: true, force: true }); }
});

// ui_fit / ui_shot / ci_status / rotate_markings_check refine a CLI body by rewriting content[0].text; the spec's primary
// channel is structuredContent, which used to keep the raw CLI body (ui_fit: no `clean`; ci_status: out null).
test("syncStructured makes structuredContent match the refined text body, and leaves consistent results alone", async () => {
  const { syncStructured } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const stale = { content: [{ type: "text", text: JSON.stringify({ ok: true, out: { clean: true } }) }], structuredContent: { ok: true, out: { rows: [1] } } };
  assert.deepEqual(syncStructured(stale).structuredContent, { ok: true, out: { clean: true } });
  const same = { content: [{ type: "text", text: JSON.stringify({ ok: true }) }], structuredContent: { ok: true } };
  assert.deepEqual(syncStructured(same).structuredContent, { ok: true });
  // No structuredContent (a refusal-free text result) and non-JSON text are untouched.
  const bare = { content: [{ type: "text", text: "not json" }], structuredContent: { ok: true, keep: 1 } };
  assert.deepEqual(syncStructured(bare).structuredContent, { ok: true, keep: 1 });
  assert.deepEqual(syncStructured({ content: [{ type: "text", text: "{}" }] }), { content: [{ type: "text", text: "{}" }] });
});

// 2026-10-10: async surveys silently dropped `cams` (and cam/az/el/dist/h/side/hud/shots/cols/sheetName) and still said ok.
// This is the class guard: for every optional argument of every dry-run-able tool, SOME value must change the dry-run plan (or the
// call must be refused as invalid), unless the argument is exempt below WITH a reason. A new argument that does nothing fails here
// until it is wired or exempted; an exemption that has become unnecessary fails too, so the table cannot rot.
const ARG_BASES = {
  apex_ui_inspect: [{ screen: "title" }],
  apex_ui_diff: [{ before: "scratch/before.json", after: "scratch/after.json" }],
  apex_ui_mission_plan: [{ mission: "first-race" }],
  apex_garage_plan: [{}],
  apex_diagnostics: [{ op: "run", kind: "memory_census" }],
  apex_catalog: [{ section: "parts" }],
  apex_shot: [{ track: "monza" }],
  apex_agent: [{ track: "monza" }],
  apex_eval: [{ track: "monza", expr: "1" }],
  apex_frame_report: [{ track: "monza" }],
  apex_hud_shot: [{ track: "monza" }],
  apex_hud_survey: [{}],
  apex_shot_survey: [{ track: "monza" }],
  apex_ui_fit: [{ screen: "title" }],
  apex_ui_shot: [{ screen: "title" }],
  apex_unit_test: [{ file: "tests/unit/a11y-pwa-pass.test.mjs" }],
  apex_select_specs: [{ since: "HEAD~1" }],
  apex_graph_parity: [{ base: "HEAD", id: "monza" }],
  apex_pick_tests: [{}],
  apex_track_audit: [{ track: "monza" }],
  apex_viewer: [{}],
  apex_car_audit: [{ check: "ladder" }, { check: "crest" }],               // teams: the crest sweep only
  apex_garage: [{ op: "open", team: "ferrari" }, { op: "team", team: "mercedes" }, { op: "design" }, { op: "design", design: { stripe: "#ffffff" } }, { op: "shot" }, { op: "sheet" }],   // each op reads its own keys; base only with a design
  apex_track: [{ op: "survey", track: "monza" }, { op: "shot" }, { op: "eval" }],
  apex_job_start: ["shot_survey", "flicker_gate", "livery_contrast", "survey_track", "graph_parity_all", "ui_matrix"].map((kind) => ({ kind, track: "monza" })),
};
const ARG_EXEMPT = {
  "apex_hud_shot.async": "routing only: job vs inline; never part of the pinned argv",
  "apex_hud_shot.inlineImage": "output only: attach the PNG inline; not part of the pinned argv",
  "apex_hud_survey.async": "routing only: job vs inline; never part of the pinned argv",
  "apex_select_specs.full": "reply shaping only (slimBody): keeps shard spec lists; never part of the argv",
  "apex_unit_test.full": "reply shaping only (slimBody): keeps the whole TAP stream; never part of the argv",
};
const ARG_ALWAYS = new Set(["dryRun", "target", "url", "image"]);   // transport / output flags of every tool
const argCandidates = (spec) => {
  if (spec.enum) return spec.enum;
  if (spec.type === "boolean") return [true, false];
  if (spec.type === "integer" || spec.type === "number") {
    const lo = spec.exclusiveMinimum != null ? spec.exclusiveMinimum + 1 : (spec.minimum ?? 0) + 1;
    return [lo, lo + 1];
  }
  if (spec.type === "array") return spec.items?.enum ? [[spec.items.enum[0]], [spec.items.enum.at(-1)]] : [spec.items?.type === "number" ? [0.3] : spec.items?.type === "object" ? [{}] : ["a"]];
  if (spec.type === "object") return [{ a: 1 }];
  return [spec.pattern ? "probe-1" : "probe"];
};
test("every optional argument of every dry-run-able tool changes the plan (or is exempt with a reason)", () => {
  const tools = rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]).find((m) => m.id === 1).result.tools;
  const cases = [];
  for (const t of tools) {
    const bases = ARG_BASES[t.name];
    if (!bases || !t.inputSchema.properties.dryRun) continue;
    for (const base of bases) {
      cases.push({ tool: t.name, base, key: null, args: base });
      for (const [k, spec] of Object.entries(t.inputSchema.properties)) {
        if (ARG_ALWAYS.has(k) || k in base) continue;
        for (const v of argCandidates(spec)) cases.push({ tool: t.name, base, key: k, args: { ...base, [k]: v } });
      }
    }
  }
  const norm = (b) => JSON.stringify(b, (k, v) => (k === "durationMs" ? undefined : v)).replace(/20\d\d-\d\d-\d\dT[\d.:-]+Z?/g, "T").replace(/-[a-z0-9]{8,}-\d+/g, "");
  const res = callTools(cases.map((c) => [c.tool, { ...c.args, dryRun: true }])).map((r) => r.body);
  const baseline = new Map();
  cases.forEach((c, i) => { if (c.key === null) baseline.set(c.tool + JSON.stringify(c.base), res[i]); });
  const used = new Map();   // "tool.key" -> true once any case under any base shows an effect or a validation refusal
  cases.forEach((c, i) => {
    if (c.key === null) return;
    const id = `${c.tool}.${c.key}`;
    const b = res[i], bb = baseline.get(c.tool + JSON.stringify(c.base));
    const effect = b && (b.ok === false || (bb && norm(b) !== norm(bb)));
    if (!used.has(id)) used.set(id, false);
    if (effect) used.set(id, true);
  });
  const dead = [...used].filter(([id, u]) => !u && !(id in ARG_EXEMPT)).map(([id]) => id);
  assert.deepEqual(dead, [], "these optional arguments change nothing in the dry-run plan: wire them, or exempt each in ARG_EXEMPT with a reason");
  const stale = Object.keys(ARG_EXEMPT).filter((id) => used.get(id) === true || !used.has(id));
  assert.deepEqual(stale, [], "these exemptions are no longer needed (the argument now has an effect) or name no argument: remove them");
});

// 2026-10-10: "does the running server need a restart?" was a guess all session. apex_status now says: the server's start time, and
// which of the files it loaded (tools/mcp/*.mjs and the tools/lib modules they import) changed after it.
test("serverFreshness: stale only when a loaded file is newer than the server; a missing file is not stale", async () => {
  const { serverFreshness } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const files = [path.join(ROOT, "fixture-dir", "alpha.mjs"), path.join(ROOT, "fixture-dir", "beta.mjs"), path.join(ROOT, "fixture-dir", "gone.mjs")];
  const mt = { [files[0]]: 1000, [files[1]]: 5000 };
  const fresh = serverFreshness(2000, [files[0], files[2]], (f) => { if (f in mt) return mt[f]; throw new Error("ENOENT"); });
  assert.equal(fresh.stale, false);
  assert.deepEqual(fresh.staleFiles, []);
  assert.equal(fresh.fix, undefined);
  const stale = serverFreshness(2000, files, (f) => { if (f in mt) return mt[f]; throw new Error("ENOENT"); });
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.staleFiles, [path.join("fixture-dir", "beta.mjs")]);
  assert.match(stale.fix, /restart the apex-tools MCP server/);
});

test("apex_status reports the server and the open sessions", () => {
  const r = callCli("apex_status", {});
  assert.equal(r.status, 0, r.stderr);
  const b = JSON.parse(r.stdout);
  assert.equal(b.server.stale, false, "a one-shot call is a fresh process");
  assert.ok(b.server.watched >= 3, `watched ${b.server.watched}`);
  assert.ok(b.server.startedAt && b.server.version);
  assert.deepEqual(b.sessions.garage, null);
  assert.deepEqual(b.sessions.track, null);
});

// 2026-10-10: a bad `out` on apex_shot_survey / apex_track open threw an error that carried its refusal and nothing caught it:
// a bare JSON-RPC "path_escaped" over stdio, a stack trace from `call`.
test("a bad `out` is the normal refusal (with its fix), not a thrown error", () => {
  for (const [tool, args] of [["apex_shot_survey", { track: "monza", out: "probe-1", dryRun: true }], ["apex_track", { op: "open", track: "monza", out: "../etc" }]]) {
    const r = callCli(tool, args);
    assert.equal(r.status, 1, `${tool}: ${r.stderr}`);
    const b = JSON.parse(r.stdout);
    assert.equal(b.error, "path_escaped");
    assert.match(b.fix, /under artifacts\/ or scratch\//);
    assert.doesNotMatch(r.stderr, /at assertSafeOut|node:internal/, "no stack trace");
  }
});

// 2026-10-10: polling apex_job_status in a loop (or a Monitor on the manifest) for a 20-50 min survey; and a capped result that
// said only "see the log". `wait` holds the call; `topFindings` puts the worst findings in the reply.
test("apex_job_status wait holds until the job is done; a capped survey result carries topFindings", async () => {
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const { splitOut } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const fake = fs.mkdtempSync(path.join(ROOT, "artifacts", "apex-jobs-test-"));
  try {
    fs.mkdirSync(path.join(fake, "tools", "track"), { recursive: true });
    fs.mkdirSync(path.join(fake, "artifacts", "survey"), { recursive: true });
    const findings = [
      ...Array.from({ length: 30 }, (_, i) => ({ cell: `c${i}`, kind: "overlap", severity: "medium", detail: "m".repeat(400) })),
      { cell: "worst", kind: "tinyText", severity: "high", detail: "h".repeat(400) },
      { cell: "info", kind: "lead", severity: "info", detail: "i" },
      { cell: "worst2", kind: "overlap", severity: "high", detail: "second" },
    ];
    fs.writeFileSync(path.join(fake, "artifacts/survey/report.json"), JSON.stringify({ findings }));
    fs.writeFileSync(path.join(fake, "tools/track/verify-track.cjs"),
      'setTimeout(() => { const cells = Array.from({ length: 3000 }, (_, i) => ({ c: "c" + i, pad: "x".repeat(20) }));\n'
      + 'console.log(JSON.stringify({ ok: true, report: "artifacts/survey/report.json", counts: { total: 33 }, cells })); }, 3500);\n');
    const toolResult = (b) => ({ content: [{ type: "text", text: JSON.stringify(b) }] });
    const x = createExtras({ ROOT: fake, toolResult, refuse: (e, m, f) => toolResult({ ok: false, error: e, message: m, fix: f }), acquireLock: () => null, releaseLock() {},
      occupancyRefuse: () => null, assertSafeOut: (p) => p, knownCircuits: () => ["monza"], runSpawn: null, splitOut, log() {}, mockMode: () => false });
    const body = (r) => JSON.parse(r.content[0].text);
    const j = body(x.handlers.apex_job_start({ kind: "verify_all" }));
    const short = body(await x.handlers.apex_job_status({ jobId: j.jobId, wait: 1 }));
    assert.equal(short.state, "running");
    assert.equal(short.stillRunning, true, "a wait that ran out says so");
    assert.ok(short.waitedS >= 1);
    const done = body(await x.handlers.apex_job_status({ jobId: j.jobId, wait: 20 }));
    assert.equal(done.state, "done");
    assert.equal(done.stillRunning, undefined);
    assert.equal(done.out.truncated, true);
    assert.equal(done.out.findingsTotal, 33);
    assert.equal(done.out.topFindings.length, 10, "the worst ten");
    assert.deepEqual(done.out.topFindings.slice(0, 2).map((f) => f.cell), ["worst", "worst2"], "high before medium before info");
    assert.ok(done.out.topFindings.every((f) => f.detail.length <= 200), "long details are cut");
    assert.deepEqual(body(await x.handlers.apex_job_status({ jobId: j.jobId })).state, "done", "no wait: unchanged");
  } finally { fs.rmSync(fake, { recursive: true, force: true }); }
});

// 2026-10-10 (apex_agent matrix, 17 real commands): `describe` with no id cost a ~100 s browser boot to learn "describe(id) needs an id",
// and the reply said error:null / message:null with that text buried in `out`.
test("apex_agent describe without an id is refused up front, with the id forms", () => {
  const [bad, ok] = callTools([
    ["apex_agent", { track: "monza", command: "describe", at: 0.3 }],
    ["apex_agent", { track: "monza", command: "describe", id: "corner:T3", dryRun: true }],
  ]).map((r) => r.body);
  assert.equal(bad.error, "bad_args");
  assert.match(bad.message, /describe needs id/);
  assert.match(bad.fix, /corner:T3/);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.argv.slice(-4), ["monza", "describe", "--id", "corner:T3"]);
});

test("a CLI that fails with its own {error, message, fix} has them lifted out of `out`", async () => {
  const { runSpawn } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const script = 'console.log(JSON.stringify({ ok: false, error: "BadArgumentError", message: "describe(id) needs an id", fix: "ids look like corner:T3" })); process.exit(2);';
  const r = await runSpawn([process.execPath, "-e", script], { timeoutMs: 15000 });
  const b = JSON.parse(r.content[0].text);
  assert.equal(b.ok, false);
  assert.equal(b.exit, 2);
  assert.equal(b.error, "BadArgumentError");
  assert.equal(b.message, "describe(id) needs an id");
  assert.equal(b.fix, "ids look like corner:T3");
  assert.equal(b.out.error, "BadArgumentError", "`out` still holds the CLI's own JSON");
  // a failure whose out carries no error is untouched
  const plain = JSON.parse((await runSpawn([process.execPath, "-e", 'console.log(JSON.stringify({ n: 1 })); process.exit(1);'], { timeoutMs: 15000 })).content[0].text);
  assert.equal(plain.ok, false);
  assert.equal(plain.error, undefined);
});

// 2026-10-10: apex_agent atmosphere {weather:"wet", tod:"dusk"} WORKS but took 269 s; the flat 180 s browser cap killed it (the other 14
// apex_agent commands took 100-130 s).
test("browserTimeoutMs: 180 s, 420 s for an apex_agent call that changes weather or time of day", async () => {
  const { browserTimeoutMs } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  assert.equal(browserTimeoutMs("apex_agent", { command: "world" }), 180000);
  assert.equal(browserTimeoutMs("apex_agent", { command: "atmosphere" }), 180000, "reading the atmosphere changes nothing");
  assert.equal(browserTimeoutMs("apex_agent", { command: "atmosphere", weather: "wet" }), 420000);
  assert.equal(browserTimeoutMs("apex_agent", { command: "atmosphere", tod: "dusk" }), 420000);
  assert.equal(browserTimeoutMs("apex_shot", { tod: "night" }), 180000, "only apex_agent rebuilds the scene on a tod");
  assert.ok(browserTimeoutMs("apex_agent", { weather: "wet" }) > 269000, "above the measured duration");
});


test("apex_shot_survey reports rebuilds portable multi-custom-track HTML without a browser", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "survey-gallery-test-"));
  try {
    const reports = ["custom-first", "custom-second"].map((track, i) => {
      const image = path.join(dir, `image-${i}.jpg`);
      fs.writeFileSync(image, "JPEG fixture");
      const report = path.join(dir, `report-${i}.json`);
      fs.writeFileSync(report, JSON.stringify({ track: "monza", actualTrack: track, shots: [{ name: "aerial", file: image, cam: "orbit", frac: 0.5, tod: "day" }] }));
      return report;
    });
    const out = path.join(dir, "gallery");
    const r = callCli("apex_shot_survey", { reports, out });
    assert.equal(r.status, 0, r.stderr);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.browser, false);
    const html = fs.readFileSync(body.indexHtml, "utf8");
    assert.match(html, /custom-first/);
    assert.match(html, /custom-second/);
    assert.equal(fs.readdirSync(path.join(out, "assets")).length, 2);
    const cli = spawnSync(process.execPath, [path.join(ROOT, "tools/shot/shot-survey.mjs"), "--reports", reports.join(","), "--out", path.join(dir, "cli-gallery")], { cwd: ROOT, encoding: "utf8", timeout: 15000 });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(JSON.parse(cli.stdout).browser, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("apex_shot_survey report images cannot escape artifact roots", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "survey-gallery-test-"));
  try {
    const report = path.join(dir, "report.json");
    fs.writeFileSync(report, JSON.stringify({ track: "custom-a", shots: [{ name: "bad", file: path.join(ROOT, "outside.jpg") }] }));
    const r = callCli("apex_shot_survey", { reports: [report], out: path.join(dir, "gallery") });
    assert.equal(JSON.parse(r.stdout).ok, false);
    assert.match(JSON.stringify(JSON.parse(r.stdout)), /artifacts|scratch/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test("saved gallery cannot write through an assets directory symlink", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "survey-gallery-symlink-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "apex-gallery-outside-"));
  try {
    const image = path.join(dir, "source.jpg"), report = path.join(dir, "report.json"), out = path.join(dir, "out");
    fs.writeFileSync(image, "JPEG fixture");
    fs.writeFileSync(report, JSON.stringify({ track: "custom-a", shots: [{ name: "view", file: image }] }));
    fs.mkdirSync(out);
    fs.symlinkSync(outside, path.join(out, "assets"), "dir");
    const r = callCli("apex_shot_survey", { reports: [report], out });
    assert.equal(JSON.parse(r.stdout).ok, false);
    assert.equal(fs.readdirSync(outside).length, 0);
    assert.equal(fs.existsSync(path.join(out, "index.html")), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});

test("slimBody (#2672): doctor keeps failures + pass count, unit_test keeps counts + failing names, select_specs drops shard spec lists; full restores", async () => {
  const { slimBody } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const doc = { ok: true, out: { checks: [{ id: "a", status: "pass" }, { id: "b", status: "warn" }, { id: "c", status: "pass" }], summary: { pass: 2 } } };
  const d = slimBody("apex_doctor", doc);
  assert.deepEqual(d.out.checks.map((c) => c.id), ["b"]); assert.equal(d.out.passed, 2);
  assert.equal(slimBody("apex_doctor", doc, { full: true }).out.checks.length, 3);
  const tap = (fail) => ({ ok: !fail, out: null, stdout: `ok 1 - a\n${fail ? "not ok 2 - broken thing\n" : "ok 2 - b\n"}# tests 2\n# pass ${2 - fail}\n# fail ${fail}\n` });
  const ok = slimBody("apex_unit_test", tap(0));
  assert.deepEqual(ok.out, { tests: 2, pass: 2, fail: 0, failing: [] }); assert.equal(ok.stdout, "");
  const bad = slimBody("apex_unit_test", tap(1));
  assert.deepEqual(bad.out.failing, ["broken thing"]); assert.match(bad.stdout, /not ok 2/);
  const sel = slimBody("apex_select_specs", { out: { selected: [{ file: "x" }], shards: [{ name: "s1", specs: "a.js b.js" }] } });
  assert.deepEqual(sel.out.shards, [{ name: "s1", specCount: 2 }]);
});

test("slimBody: eval scope hint, profile_query ENOENT hint, who_is_on_it drops stale and released claims", async () => {
  const { slimBody } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  assert.match(slimBody("apex_eval", { ok: false, out: { err: "info is not defined" } }).fix, /a\.info\(\)/);
  const browserThrow = slimBody("apex_eval", { ok: true, exit: 0, out: { err: "boom" } });
  assert.equal(browserThrow.ok, false); assert.equal(browserThrow.fix, undefined);
  assert.equal(slimBody("apex_eval", { ok: true, out: { v: 1 } }).ok, true);
  assert.match(slimBody("apex_profile_query", { ok: false, stderr: "ENOENT: no such file" }).fix, /apex_job_start/);
  const w = slimBody("apex_who_is_on_it", { out: { claims: [{ slug: "a" }, { slug: "b", stale: true }, { slug: "c", released: true }] } });
  assert.deepEqual(w.out.claims, [{ slug: "a" }]); assert.equal(w.out.hiddenClaims, 2);
});

test("hudEstimateMs (#2673): tracks measured cost and scales with cells; the kill budget is not the estimate", async () => {
  const { hudEstimateMs } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const { expandMatrix } = await import("../../tools/lib/hud-survey-matrix.mjs");
  assert.ok(hudEstimateMs("apex_hud_shot", {}) <= 90000 && hudEstimateMs("apex_hud_mock", {}) <= 90000);
  const id = expandMatrix("quick", {}).cells[0].id;
  const one = hudEstimateMs("apex_hud_survey", { matrix: "quick", only: [id] });
  const all = hudEstimateMs("apex_hud_survey", { matrix: "quick" });
  assert.ok(one <= 90000, `one cell ~47 s measured, got ${one}`);
  assert.ok(all > one * 3, "the full quick matrix costs several times one cell");
  assert.ok(all < 20 * 60000, "and far less than the old 18-minute claim for one cell");
});

test("tools/list stays compact and apex_help returns the full text it shortens", () => {
  const out = rpc([
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "apex_help", arguments: { tool: "apex_shot_survey" } } },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "apex_help", arguments: { tool: "apex_nope" } } },
  ]);
  const listed = out.find((m) => m.id === 1).result;
  assert.ok(JSON.stringify(listed).length < 55000, `tools/list is ${JSON.stringify(listed).length} bytes`);
  const help = listed.tools.find((t) => t.name === "apex_help");
  assert.equal(help.annotations.readOnlyHint, true);
  assert.ok(help.outputSchema && help.outputSchema.type === "object");
  const short = listed.tools.find((t) => t.name === "apex_shot_survey");
  const full = out.find((m) => m.id === 2).result.structuredContent;
  assert.equal(full.ok, true);
  assert.ok(full.description.length > short.description.length, "help carries the uncompacted description");
  assert.match(short.description, /apex_help/);
  assert.ok(Object.keys(full.inputSchema.properties.camera.properties).includes("fov"), "nested object bodies live in apex_help");
  for (const t of listed.tools) for (const k of t.inputSchema.required || []) assert.ok(t.inputSchema.properties[k], `${t.name} keeps required ${k}`);
  const miss = out.find((m) => m.id === 3).result;
  assert.equal(miss.isError, true);
});

test("tool descriptions state the host ceiling and the per-call boot (#2673)", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/mcp/apex-tools-mcp.mjs"), "utf8");
  assert.match(src, /name: "apex_job_status"[\s\S]{0,400}~120 s/);
  assert.match(src, /name: "apex_agent"[\s\S]{0,300}COLD-BOOTS/);
});

test("servers boot with no node_modules: static import graphs (apex-tools, js-debugger) name only node: and relative modules", () => {
  // .mcp.json starts the server alongside SessionStart's npm install; a bare static import (sharp, 2026-10-18) crashed it to CONNECTION_CLOSED.
  const seen = new Set(), bare = [];
  const walk = (f) => {
    if (seen.has(f) || !fs.existsSync(f)) return;
    seen.add(f);
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/^\s*(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']/gm)) {
      const spec = m[1] || m[2];
      if (spec.startsWith(".")) walk(path.resolve(path.dirname(f), spec));
      else if (!spec.startsWith("node:")) bare.push(`${spec} <- ${path.relative(ROOT, f)}`);
    }
  };
  walk(MCP);
  walk(path.join(ROOT, "tools/mcp/js-debugger-mcp.mjs"));
  assert.ok(seen.size > 3, `walked ${seen.size} files`);
  assert.deepEqual(bare, [], "load npm packages with a lazy `await import()` at the call site");
});

// Semantic inspection wrappers: browser-free contract tests, with injected CLI
// execution. A browser pass is owned by the parent and is not implied here.
test('UI inspector schema bounds sizes, selectors, flags and local target', () => {
  for (const args of [
    { viewports: Array(9).fill({ width: 844, height: 390 }) },
    { safe: [0, 1, 2] }, { safe: [0, 0, 201, 0] },
    { selector: 'x'.repeat(513) }, { screen: 'not-a-screen' },
    { boot: { width: 239, height: 390 } }, { flags: '--help' },
    { roundtrip: true },
  ]) {
    const r = callCli('apex_ui_inspect', { ...args, dryRun: true });
    assert.equal(r.status, 1, JSON.stringify(args));
    assert.equal(JSON.parse(r.stdout).error, 'bad_args');
  }
  const r = callCli('apex_ui_inspect', { screen: 'title', selector: '--help', styles: '#title', viewports: [{ width: 844, height: 390 }], touch: true, safe: [0, 59, 21, 59], roundtrip: true, dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  const b = JSON.parse(r.stdout);
  assert.ok(b.argv.includes('--selector=--help'), 'selector cannot turn into CLI option');
  assert.ok(b.argv.includes('844x390'));
  assert.equal(b.lockOwner, 'tools/ui/explorer.mjs');
  for (const args of [{ target: 'deploy' }, { url: 'https://example.com' }, { out: '../escape' }]) {
    assert.equal(callCli('apex_ui_inspect', { ...args, dryRun: true }).status, 1);
  }
});

test('UI inspector delegates locking to the canonical CLI and summarizes unknown bindings', async () => {
  const { createUITools } = await import('../../tools/mcp/ui-tools.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-ui-contract-'));
  const report = { viewport: { width: 844, height: 390 }, controls: [
    { selector: '#a', binding: { status: 'matches' } },
    { selector: '#b', binding: { status: 'unavailable' } },
    { selector: '#c', binding: { status: 'unmapped' } },
  ], issues: [{ kind: 'small-target', selector: '#a' }], settlement: { stable: false } };
  const result = body => ({ content: [{ type: 'text', text: JSON.stringify(body) }] });
  let spawned = 0;
  const ctx = { ROOT: dir, assertSafeOut: p => path.resolve(dir, p), mockMode: () => false,
    occupancyRefuse: () => null, toolResult: result,
    refuse: (error, message) => result({ ok: false, error, message }),
    runSpawn: async (argv, options) => {
      spawned++; assert.equal(options.timeoutMs, 180000);
      const out = argv[argv.indexOf('--out') + 1];
      fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'inspection.json'), JSON.stringify(report));
      return result({ ok: true });
    } };
  try {
    const handlers = createUITools(ctx).handlers;
    const b = JSON.parse((await handlers.apex_ui_inspect({})).content[0].text);
    assert.equal(spawned, 1); assert.equal(b.ok, true);
    assert.equal(b.records[0].bindings.unavailable, 1);
    assert.equal(b.records[0].bindings.unmapped, 1);
    assert.equal(b.records[0].advisoryTotal, 1);
    assert.equal(b.records[0].settlement.stable, false);
    assert.match(b.limitation, /not a UI pass/);
    const busy = createUITools({ ...ctx, occupancyRefuse: () => result({ ok: false, error: 'lock_held' }) }).handlers;
    assert.equal(JSON.parse((await busy.apex_ui_inspect({})).content[0].text).error, 'lock_held');
    assert.equal(spawned, 1, 'busy check must prevent CLI spawn');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('saved UI diffs are browser free, reject incompatible or oversized evidence, and bound findings', async () => {
  const { createUITools } = await import('../../tools/mcp/ui-tools.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-ui-diff-'));
  const result = body => ({ content: [{ type: 'text', text: JSON.stringify(body) }] });
  const ctx = { ROOT: dir, assertSafeOut: p => path.resolve(dir, p), mockMode: () => false,
    toolResult: result, refuse: (error, message) => result({ ok: false, error, message }),
    runSpawn: () => { throw new Error('must not spawn'); }, occupancyRefuse: () => { throw new Error('must not inspect browser'); } };
  const handler = createUITools(ctx).handlers.apex_ui_diff;
  const save = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
  const report = { provenance: { screen: 'title' }, viewport: { width: 844, height: 390 }, controls: [{ selector: '#a', value: 'one', binding: { status: 'unmapped' } }], issues: [] };
  try {
    save('before', report); save('after', { ...report, controls: [{ ...report.controls[0], value: 'two' }], issues: Array(101).fill({ kind: 'test' }) });
    let b = JSON.parse(handler({ before: 'before', after: 'after' }).content[0].text);
    assert.equal(b.ok, true); assert.equal(b.browser, false);
    assert.equal(b.comparisons[0].changedTotal, 1); assert.equal(b.comparisons[0].issues.length, 100); assert.equal(b.comparisons[0].totals.issues, 101);
    save('after', { ...report, viewport: { width: 1280, height: 800 } });
    assert.equal(JSON.parse(handler({ before: 'before', after: 'after' }).content[0].text).error, 'incompatible_inspections');
    save('after', { invalid: true });
    assert.equal(JSON.parse(handler({ before: 'before', after: 'after' }).content[0].text).error, 'bad_args');
    fs.writeFileSync(path.join(dir, 'after'), 'x'.repeat(5 * 1024 * 1024 + 1));
    assert.equal(JSON.parse(handler({ before: 'before', after: 'after' }).content[0].text).error, 'bad_args');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('named UI mission plans cannot supply actions or unbounded capture budgets', () => {
  for (const args of [{ mission: 'anything' }, { mission: 'first-race', maxShots: 6 }, { mission: 'first-race', timeoutSeconds: 181 }, { mission: 'first-race', actions: [] }]) {
    assert.equal(callCli('apex_ui_mission_plan', { ...args, dryRun: true }).status, 1);
  }
  const r = callCli('apex_ui_mission_plan', { mission: 'first-race', maxShots: 2, timeoutSeconds: 60, dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  const b = JSON.parse(r.stdout);
  assert.equal(b.planOnly, true); assert.equal(b.written, false);
  assert.equal(b.limits.missions, 1); assert.equal(b.limits.maxShots, 2); assert.equal(b.limits.timeoutMs, 60000);
  assert.ok(b.argv.includes('replay'));
});

test('garage plan uses canonical frame/paint/team selectors and explicit budgets without a browser', () => {
  for (const args of [
    { team: 'invented' }, { frames: ['unknown'] },
    { frames: ['spineTop', 'spineSide'], maxShots: 1 },
    { field: 'spineLogo', options: ['unknown'] },
    { field: 'spineLogo' }, { maxShots: 17 }, { budgetSeconds: 181 },
  ]) assert.equal(callCli('apex_garage_plan', { ...args, dryRun: true }).status, 1, JSON.stringify(args));
  const r = callCli('apex_garage_plan', { team: 'mclaren', frames: ['spineTop'], maxShots: 1, budgetSeconds: 180 });
  assert.equal(r.status, 0, r.stderr);
  const b = JSON.parse(r.stdout);
  assert.equal(b.browser, false); assert.equal(b.planOnly, true);
  assert.equal(b.plan.shotCount, 1); assert.equal(b.plan.budget, 180);
});

test('canonical catalog and car filters integrate with the published MCP schemas', () => {
  let r = callCli('apex_catalog', { section: 'parts', category: 'fuel', team: 'haas', limit: 2 });
  assert.equal(r.status, 0, r.stderr);
  let b = JSON.parse(r.stdout);
  assert.equal(b.section, 'parts'); assert.ok(b.rows.length <= 2);
  assert.ok(b.rows.every(row => row.category === 'fuel'));
  for (const [name, args] of [
    ['apex_car_audit', { check: 'ladder', categories: ['fuel'], team: 'haas' }],
    ['apex_job_start', { kind: 'parts_sweep', categories: ['fuel'], team: 'haas' }],
  ]) {
    r = callCli(name, { ...args, dryRun: true });
    assert.equal(r.status, 0, r.stderr);
    b = JSON.parse(r.stdout);
    assert.ok(b.argv.includes('--cats=fuel')); assert.ok(b.argv.includes('--team=haas'));
    assert.equal(callCli(name, { ...args, team: 'invented', dryRun: true }).status, 1);
  }
});

test('diagnostics registry exposes bounded capabilities and all four named job kinds', () => {
  const r = callCli('apex_diagnostics', { op: 'capabilities' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).jobs, ['memory_census', 'gpu_memory_census', 'renderer_probe', 'vm_lifecycle']);
  for (const kind of ['memory_census', 'gpu_memory_census', 'renderer_probe', 'vm_lifecycle']) {
    const run = callCli('apex_job_start', { kind, dryRun: true });
    assert.equal(run.status, 0, run.stderr + run.stdout);
    const plan = JSON.parse(run.stdout);
    assert.equal(plan.kind, kind);
    assert.ok(plan.argv.some(s => s.endsWith('/tools/perf/diagnostics.mjs')), 'persistent bounded supervisor owns execution');
  }
  assert.equal(callCli('apex_diagnostics', { op: 'run', kind: 'shell', dryRun: true }).status, 1);
});

test("track-session accepts the flags shot-survey passes (--output-root, --designs): apex_shot_survey died with 'unknown flag'", async () => {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, ["tools/shot/track-session.mjs", "--serve", "--track", "monza", "--output-root", "scratch/none", "--designs", "scratch/none.json"], { encoding: "utf8", timeout: 20000 });
  assert.doesNotMatch(r.stderr, /unknown flag/);
});

// ── robustness (code-hunter 2026-10-18) ──────────────────────────────────
test("serve exits through process.on('exit') on SIGTERM, so its child cleanup hooks run", { timeout: 15000 }, async () => {
  // Node's default SIGTERM skips exit hooks: every detached runSpawn group, garage, job and track session outlived the server.
  const dir = path.join(ROOT, "scratch", `apex-mcp-sig-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  const marker = path.join(dir, "exit-hook"), preload = path.join(dir, "hook.cjs");
  fs.writeFileSync(preload, `process.on("exit", (c) => require("fs").writeFileSync(${JSON.stringify(marker)}, String(c)));\n`);
  try {
    const child = spawn(process.execPath, ["-r", preload, MCP, "serve"], { cwd: ROOT, env: { ...process.env, APEX_MCP_MOCK: "1" }, stdio: ["pipe", "pipe", "ignore"] });
    const exited = new Promise((r) => child.on("exit", (code, sig) => r({ code, sig })));
    const replied = new Promise((r) => child.stdout.once("data", r));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
    await replied;   // the handlers are in place once serve answers
    child.kill("SIGTERM");
    const { code, sig } = await exited;
    assert.equal(sig, null, "the server exits itself instead of dying on the signal");
    assert.equal(code, 143);
    assert.equal(fs.readFileSync(marker, "utf8"), "143", "process.on('exit') hooks ran");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

function extrasCtx(over = {}) {
  const toolResult = (b) => ({ content: [{ type: "text", text: JSON.stringify(b) }] });
  const released = { n: 0 };
  return { released, ctx: { ROOT, toolResult, refuse: (error, message, fix) => toolResult({ ok: false, error, message, fix }),
    acquireLock: () => null, releaseLock: () => { released.n++; }, occupancyRefuse: () => null, assertSafeOut: (p) => p,
    knownCircuits: () => ["monza"], runSpawn: null, splitOut: (s) => ({ out: null, rest: s }), log: () => {}, mockMode: () => false, ...over } };
}

test("closeAll ends an open apex_track session and frees its lock; a stdin EPIPE does not crash the server", { timeout: 15000 }, async () => {
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  // A stand-in track-session child: ready line, one reply per request, exits on stdin EOF. No browser.
  const FIX = `process.stdout.write('{"ready":true}\\n');let b="";process.stdin.on("data",(d)=>{b+=d;let i;while((i=b.indexOf("\\n"))>=0){const m=JSON.parse(b.slice(0,i));b=b.slice(i+1);process.stdout.write(JSON.stringify({id:m.id,ok:true})+"\\n");}});`;
  let child;
  const { ctx, released } = extrasCtx({ spawnChild: (_c, _a, opts) => (child = spawn(process.execPath, ["-e", FIX], opts)) });
  const ex = createExtras(ctx);
  const open = JSON.parse((await ex.handlers.apex_track({ op: "open", track: "monza" })).content[0].text);
  assert.equal(open.ok, true, JSON.stringify(open));
  assert.doesNotThrow(() => child.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" })));
  const closing = ex.closeAll("stdio closed");
  assert.equal(ex.sessionInfo(), null, "the session is gone at once");
  const done = await closing;
  assert.equal(done.closed, true);
  assert.equal(released.n, 1, "the browser lock is released once the tree is gone");
  assert.equal(await ex.closeAll("again"), null, "closeAll with nothing open is a no-op");
});

test("garage stdin EPIPE on a dying child is logged, not an unhandled 'error'", { timeout: 5000 }, async () => {
  const { EventEmitter } = await import("node:events");
  const { PassThrough } = await import("node:stream");
  const { garageOpen, garageClose, releaseLock } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const psBefore = process.env.APEX_MCP_PS;
  process.env.APEX_MCP_PS = "";
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.pid = process.pid; child.kill = () => true;
  try {
    const r = await garageOpen({}, { spawnChild: () => { setImmediate(() => child.stdout.write('{"ready":true}\n')); return child; } });
    assert.equal(JSON.parse(r.content[0].text).ok, true);
    assert.doesNotThrow(() => child.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" })));
  } finally {
    garageClose("fixture teardown"); child.emit("exit", 0); releaseLock();
    if (psBefore === undefined) delete process.env.APEX_MCP_PS; else process.env.APEX_MCP_PS = psBefore;
  }
});

test("a running browser job on disk is occupancy even after its one-shot `call` owner died", async () => {
  // jobStart via `call` records the CALL pid in the lock; it dies at once, the lock reads stale, and the job's browser runs on.
  const { createExtras } = await import("../../tools/mcp/apex-extras.mjs");
  const root = path.join(ROOT, "scratch", `apex-mcp-jobs-${process.pid}`);
  const dir = path.join(root, "artifacts", "logs", "apex-jobs");
  fs.mkdirSync(dir, { recursive: true });
  try {
    const ex = createExtras(extrasCtx({ ROOT: root }).ctx);
    assert.equal(ex.runningBrowserJob(), null);
    const manifest = (id, browser) => fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, kind: browser ? "hud_shot" : "verify_all",
      state: "running", pid: process.pid, browser, started: Date.now(), log: `artifacts/logs/apex-jobs/${id}.log` }));
    manifest("verify_all-x-1", false);
    assert.equal(ex.runningBrowserJob(), null, "a node-only job is not browser occupancy");
    manifest("hud_shot-x-2", true);
    assert.deepEqual(ex.runningBrowserJob(), { id: "hud_shot-x-2", kind: "hud_shot", pid: process.pid });
    fs.writeFileSync(path.join(dir, "hud_shot-x-2.exit"), "0");
    assert.equal(ex.runningBrowserJob(), null, "the job's recorded exit frees it");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  const src = fs.readFileSync(MCP, "utf8");
  assert.match(src, /function occupancyRefuse\(\) \{[^}]*?lockInfo\(\)[\s\S]{0,800}?runningBrowserJob\(\)/, "occupancyRefuse consults the job list");
});

test("apex_locations with an unreadable designs file is bad_args, not internal_error", () => {
  const r = callCli("apex_locations", { track: "monza", designs: "nope.json" });
  const b = JSON.parse(r.stdout);
  assert.equal(b.ok, false);
  assert.equal(b.error, "bad_args");
});

test("chrome-devtools-mcp.sh run tolerates a missing Chromium instead of exiting under set -e", () => {
  // SessionStart may still be installing Chromium when the MCP server starts; detect_chrome's exit 1 killed it for the session.
  const sh = fs.readFileSync(path.join(ROOT, "tools/mcp/chrome-devtools-mcp.sh"), "utf8");
  const fn = sh.match(/^wait_chrome\(\) \{[\s\S]*?^\}$/m);
  assert.ok(fn, "wait_chrome()");
  assert.match(sh, /run_mcp\(\) \{[\s\S]*?\n  local chrome\n  chrome="\$\(wait_chrome\)"/);   // the preflight lines sit between the brace and `local chrome`
  const r = spawnSync("bash", ["-c", `set -euo pipefail\nfind_chrome() { return 1; }\n${fn[0]}\nc="$(wait_chrome)"\nargs=(--x \${c:+--executablePath "$c"})\necho "rc=$? c=[$c] n=\${#args[@]}"`],
    { encoding: "utf8", env: { ...process.env, APEX_CHROME_WAIT_S: "0" }, timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /rc=0 c=\[\] n=1/);
  assert.match(r.stderr, /starting without --executablePath/);
});
