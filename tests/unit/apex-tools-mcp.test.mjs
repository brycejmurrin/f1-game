// apex-tools-mcp.test.mjs — apex-tools MCP (local CLI wrap).
// APEX_MCP_MOCK=1 / dryRun only — no Chromium, no network.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  });
  assert.equal(r.status, 0, r.stderr);
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

test(".mcp.json registers apex-tools in the three-server catalog", () => {
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/mcp/apex-tools-mcp.json"), "utf8"));
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), [
    "apex-tools",
    "chrome-devtools",
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
  // Twenty-seven pinned wrappers: readiness, session checks, track session + shot survey, jobs, UI, audits and the race-HUD survey pair.
  assert.deepEqual([...names].sort(), [
    "apex_agent",
    "apex_bump_cache_check",
    "apex_car_audit",
    "apex_ci_status",
    "apex_doctor",
    "apex_eval",
    "apex_frame_report",
    "apex_garage",
    "apex_graph_parity",
    "apex_hud_shot",
    "apex_hud_survey",
    "apex_job_cancel",
    "apex_job_start",
    "apex_job_status",
    "apex_pick_tests",
    "apex_rotate_markings_check",
    "apex_select_specs",
    "apex_session_status",
    "apex_shot",
    "apex_shot_survey",
    "apex_status",
    "apex_track",
    "apex_track_audit",
    "apex_ui_fit",
    "apex_ui_shot",
    "apex_unit_test",
    "apex_verify_change_fast",
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
    for (const name of ["apex_hud_shot", "apex_hud_survey"]) {
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
  for (const n of ["apex_job_start", "apex_job_cancel", "apex_verify_change_fast"]) assert.ok(!readOnly.includes(n), `${n} is not read-only`);
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

test("parseOut takes the trailing JSON block, never a number from inside it", async () => {
  const { parseOut } = await import("../../tools/mcp/apex-tools-mcp.mjs");
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
  ok("apex_job_start", { kind: "ui_matrix", screens: "settings,garage", viewports: "ios-*", scale: "100,130" }, /--screens=settings,garage","--viewports=ios-\*","--scale=100,130/);
  ok("apex_job_start", { kind: "flicker_gate", site: "a,b" }, /"--site","a","--site","b"/);
  ok("apex_job_start", { kind: "livery_contrast", team: "ferrari" }, /--team=ferrari/);
  bad("apex_job_start", { kind: "rm_rf" });
  bad("apex_job_start", { kind: "ui_gallery", screens: "--write" });
  bad("apex_job_start", { kind: "survey_track", track: "nope" });
  bad("apex_job_status", { jobId: "missing" }, "unknown_job");
  bad("apex_job_cancel", { jobId: "missing" }, "unknown_job");
  ok("apex_ui_fit", { screen: "settings", scale: 130 }, /--screens=settings","--viewports=ios-iphone-landscape","--jobs=1","--scale=130/);
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
    assert.match(done.tail, /52\/52 circuits ok[\s\S]*--- stderr ---\na warning/);
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
      Object.assign(m, { state: "running", exit: null, pid: 2 ** 22 + 1, ended: null });
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
  assert.match(ts, /a\.eyeAt\(o\.frac, 0, o\.h == null \? 2\.5 : o\.h\)/);
  assert.match(ts, /a\.view\(\{ eye: r\.eye, yaw, pitch: o\.pitch \}\)/);
  assert.match(ts, /a\.orbit\(o\.frac, o\.az, o\.el, o\.dist, o\.h == null \? 1\.5 : o\.h\)/);
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
