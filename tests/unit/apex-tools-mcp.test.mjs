// apex-tools-mcp.test.mjs — apex-tools MCP (local CLI wrap).
// APEX_MCP_MOCK=1 / dryRun only — no Chromium, no network.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MCP = path.join(ROOT, "tools/apex-tools-mcp.mjs");
const SH = path.join(ROOT, "tools/apex-tools-mcp.sh");
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

test(".mcp.json registers apex-tools as the fourth stdio server", () => {
  const cfg = JSON.parse(fs.readFileSync(MCP_JSON, "utf8"));
  assert.deepEqual(Object.keys(cfg.mcpServers).sort(), [
    "apex-tools",
    "chrome-devtools",
    "probe",
    "tinyfish",
  ]);
  assert.match(cfg.mcpServers["apex-tools"].command, /apex-tools-mcp\.sh$/);
  assert.deepEqual(cfg.mcpServers["apex-tools"].args, ["serve"]);
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
  assert.match(r.stdout, /apex_carshot/);
  assert.match(r.stdout, /apex_select_recall/);
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
  assert.ok(body.knownGap.outsideLock.includes("layout-audit"));
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
  assert.ok(names.length >= 29, names);
  for (const n of names) {
    assert.match(n, /^apex_/);
    assert.doesNotMatch(n, /^chrome_/);
    assert.doesNotMatch(n, /^tinyfish_/);
  }
  for (const need of [
    "apex_verify_track",
    "apex_verify_change_fast",
    "apex_wgx_validate_static",
    "apex_pick_tests",
    "apex_bump_cache_check",
    "apex_status",
    "apex_eval",
    "apex_shot",
    "apex_survey_track",
    "apex_gfx_probe",
    "apex_wgx_validate",
    "apex_wgx_capture",
    "apex_ui_survey",
    "apex_agent",
    "apex_select_specs",
    "apex_assets_verify",
    "apex_float_audit",
    "apex_clip_audit",
    "apex_coplanar_audit",
    "apex_track_verts",
    "apex_carshot",
    "apex_wgx_shot",
    "apex_quick_validate",
    "apex_select_recall",
    "apex_cache_bump_only",
    "apex_rotate_markings_check",
    "apex_startline_snap",
    "apex_startline_probe",
    "apex_aero_zone_turns",
  ]) {
    assert.ok(names.includes(need), `missing ${need} in ${names}`);
  }
  for (const never of [
    "apex_test_bg",
    "apex_graph_parity",
    "apex_bump_cache_apply",
    "tinyfish_deploy_check",
    "chrome_evaluate_script",
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

test("apex_pick_tests argv never contains --bg; includes --json", () => {
  const r = callCli("apex_pick_tests", { dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.ok(body.argv.includes("--json"), body.argv);
  assert.ok(!body.argv.includes("--bg"), body.argv);
});

test("target=deploy on a tree tool → tree_only", () => {
  const r = callCli("apex_verify_track", { id: "monza", target: "deploy" });
  assert.equal(r.status, 1, r.stderr); // structured refuse → CLI exit 1
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error, "tree_only");
  assert.ok(body.fix);
});

test("url with github.io → github_io_blocked (no fetch)", () => {
  const r = callCli("apex_verify_track", {
    id: "monza",
    url: "https://brycejmurrin.github.io/f1-game/",
  });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error, "github_io_blocked");
  assert.match(body.fix || "", /tinyfish|deploy-research/i);
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
        name: "apex_verify_track",
        arguments: { target: "deploy", id: "monza" },
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

const UI_SCREENS = "title,select,garage,settings,career,datahub";
const UI_VIEWPORTS = "ios-iphone-landscape";
const LOCK = path.join(ROOT, "scratch", "apex-browser.lock");
const TEST_BG = path.join(ROOT, "artifacts", "logs", "test-bg.json");

test("playwright occupancy matches `playwright test` tokens, not MCP JSON", () => {
  const src = fs.readFileSync(MCP, "utf8");
  assert.doesNotMatch(src, /playwright\.\*test/);
  assert.match(src, /playwright\\s\+test/);
});

test("apex_ui_survey dryRun freezes the alias recipe and never --url", () => {
  const r = callCli("apex_ui_survey", { dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  const argv = body.argv.join(" ");
  assert.match(argv, /ui-survey\.mjs/);
  assert.ok(body.argv.includes(`--screens=${UI_SCREENS}`), body.argv);
  assert.ok(body.argv.includes(`--viewports=${UI_VIEWPORTS}`), body.argv);
  assert.ok(body.argv.includes("--jobs=1"), body.argv);
  assert.ok(!body.argv.includes("--url"), body.argv);
});

test("apex_ui_survey refuses caller flags that widen the matrix", () => {
  const r = callCli("apex_ui_survey", { dryRun: true, jobs: 4 });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.error, "recipe_frozen");
});

test("apex_wgx_validate dryRun is live Dawn argv, never --static", () => {
  const r = callCli("apex_wgx_validate", { dryRun: true, track: "montreal", lite: true });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.ok(body.argv.includes("montreal"), body.argv);
  assert.ok(body.argv.includes("--lite"), body.argv);
  assert.ok(!body.argv.includes("--static"), body.argv);
  assert.ok(!body.argv.includes("--url"), body.argv);
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

test("apex_select_specs without since → bad_args", () => {
  const r = callCli("apex_select_specs", { dryRun: true });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.error, "bad_args");
});

test("apex_assets_verify argv is verify only (never bake)", () => {
  const r = callCli("apex_assets_verify", { dryRun: true });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.ok(body.argv.includes("verify"), body.argv);
  const blob = body.argv.join(" ");
  assert.doesNotMatch(blob, /bake|fetch|import-pack/);
});

test("apex_float_audit pins --json and never --clip / --foliage", () => {
  const r = callCli("apex_float_audit", { dryRun: true, id: "monza" });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.ok(body.argv.includes("monza"), body.argv);
  assert.ok(body.argv.includes("--json"), body.argv);
  assert.ok(!body.argv.includes("--clip"), body.argv);
  assert.ok(!body.argv.includes("--foliage"), body.argv);
});

test("apex_clip_audit / apex_coplanar_audit pin --json and default tunables", () => {
  for (const name of ["apex_clip_audit", "apex_coplanar_audit"]) {
    const r = callCli(name, { dryRun: true, id: "monza", gate: true });
    assert.equal(r.status, 0, r.stderr);
    const body = JSON.parse(r.stdout);
    assert.ok(body.argv.includes("--json"), body.argv);
    assert.ok(body.argv.includes("--gate"), body.argv);
    assert.ok(!body.argv.includes("--depth"), body.argv);
    assert.ok(!body.argv.includes("--adj"), body.argv);
    assert.ok(!body.argv.includes("--gap"), body.argv);
  }
});

test("apex_survey_track fracs without label emits default survey label", () => {
  const r = callCli("apex_survey_track", { dryRun: true, id: "montreal", fracs: "0.25" });
  assert.equal(r.status, 0, r.stderr);
  const body = JSON.parse(r.stdout);
  const i = body.argv.indexOf("montreal");
  assert.ok(i >= 0, body.argv);
  assert.equal(body.argv[i + 1], "survey");
  assert.equal(body.argv[i + 2], "0.25");
});

test("apex_shot out outside artifacts/scratch → path_escaped", () => {
  const r = callCli("apex_shot", { dryRun: true, track: "monza", out: "/tmp/apex-shot.png" });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.error, "path_escaped");
});

test("apex_carshot / apex_wgx_shot / apex_quick_validate dryRun pins", () => {
  const car = callCli("apex_carshot", { dryRun: true, az: 40, tod: "night" });
  assert.equal(car.status, 0, car.stderr);
  const carBody = JSON.parse(car.stdout);
  assert.match(carBody.argv.join(" "), /car\/carshot\.mjs/);
  assert.ok(!carBody.argv.includes("--url"), carBody.argv);

  const shot = callCli("apex_wgx_shot", { dryRun: true, track: "singapore", lite: true });
  assert.equal(shot.status, 0, shot.stderr);
  const shotBody = JSON.parse(shot.stdout);
  assert.match(shotBody.argv.join(" "), /wgx-shot\.mjs/);
  assert.ok(shotBody.argv.includes("singapore"), shotBody.argv);
  assert.ok(shotBody.argv.includes("--lite"), shotBody.argv);

  const qv = callCli("apex_quick_validate", { dryRun: true });
  assert.equal(qv.status, 0, qv.stderr);
  const qvBody = JSON.parse(qv.stdout);
  assert.match(qvBody.argv.join(" "), /quick-validate\.mjs/);
  assert.ok(!qvBody.argv.some((a) => /^\d+$/.test(String(a))), qvBody.argv);
});

test("week-4 tree pins: recall / bump-only / markings / startline / aero", () => {
  const recall = callCli("apex_select_recall", { dryRun: true });
  assert.equal(recall.status, 0, recall.stderr);
  assert.ok(JSON.parse(recall.stdout).argv.includes("--json"));

  const bump = callCli("apex_cache_bump_only", { dryRun: true, since: "HEAD~1" });
  assert.equal(bump.status, 0, bump.stderr);
  const bumpBody = JSON.parse(bump.stdout);
  assert.ok(bumpBody.argv.includes("HEAD~1"), bumpBody.argv);
  assert.ok(bumpBody.argv.includes("--json"), bumpBody.argv);

  const miss = callCli("apex_cache_bump_only", { dryRun: true });
  assert.equal(miss.status, 1, miss.stderr);
  assert.equal(JSON.parse(miss.stdout).error, "bad_args");

  const rot = callCli("apex_rotate_markings_check", { dryRun: true });
  assert.equal(rot.status, 0, rot.stderr);
  const rotBody = JSON.parse(rot.stdout);
  assert.ok(rotBody.argv.includes("--check"), rotBody.argv);
  assert.ok(!rotBody.argv.includes("--write"), rotBody.argv);

  const snap = callCli("apex_startline_snap", { dryRun: true, ids: ["monza"] });
  assert.equal(snap.status, 0, snap.stderr);
  const snapBody = JSON.parse(snap.stdout);
  assert.ok(snapBody.argv.includes("--json"), snapBody.argv);
  assert.ok(snapBody.argv.includes("monza"), snapBody.argv);

  const aero = callCli("apex_aero_zone_turns", { dryRun: true, id: "monza" });
  assert.equal(aero.status, 0, aero.stderr);
  assert.ok(JSON.parse(aero.stdout).argv.includes("monza"));
});

test("apex_cache_bump_only live classify stays ok when the CLI exits 1", () => {
  const r = callCli("apex_cache_bump_only", { since: "HEAD~1" }, { APEX_MCP_MOCK: "0" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const body = JSON.parse(r.stdout);
  assert.equal(body.ok, true);
  assert.ok(body.exit === 0 || body.exit === 1, body);
  assert.equal(typeof body.out?.pure, "boolean");
});

test("apex_quick_validate port → port_not_supported", () => {
  const r = callCli("apex_quick_validate", { dryRun: true, port: 3477 });
  assert.equal(r.status, 1, r.stderr);
  const body = JSON.parse(r.stdout);
  assert.equal(body.error, "port_not_supported");
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
test("week-3 tree tools do not take or refuse the browser lock", () => {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, tool: "test", since: Date.now() }));
  try {
    const r = callCli("apex_float_audit", { dryRun: true, id: "monza" });
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
    const r = callCli("apex_eval", { track: "monza", expr: "1", dryRun: true }, { APEX_MCP_MOCK: "0" });
    assert.equal(r.status, 1, r.stderr);
    const body = JSON.parse(r.stdout);
    assert.equal(body.error, "lock_held");
    assert.ok(body.fix);
  } finally {
    try { fs.unlinkSync(LOCK); } catch { /* ignore */ }
  }
});

test("week-2 dryRun steals a stale lock (dead PID)", () => {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, JSON.stringify({ pid: 999999999, tool: "dead", since: 1 }));
  try {
    const r = callCli("apex_eval", { track: "monza", expr: "1", dryRun: true }, { APEX_MCP_MOCK: "0" });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.ok, true);
    assert.ok(!fs.existsSync(LOCK), "stale lock must be reaped");
  } finally {
    try { fs.unlinkSync(LOCK); } catch { /* ignore */ }
  }
});

test("week-2 dryRun refuses playwright_live from test-bg.json (no Chromium)", () => {
  fs.mkdirSync(path.dirname(TEST_BG), { recursive: true });
  let prev = null;
  if (fs.existsSync(TEST_BG)) prev = fs.readFileSync(TEST_BG, "utf8");
  fs.writeFileSync(TEST_BG, JSON.stringify({ mode: "test", runs: [{ pid: process.pid, group: "tiny" }] }));
  try {
    const r = callCli("apex_shot", { track: "monza", dryRun: true }, { APEX_MCP_MOCK: "0" });
    assert.equal(r.status, 1, r.stderr);
    const body = JSON.parse(r.stdout);
    assert.equal(body.error, "playwright_live");
  } finally {
    if (prev == null) {
      try { fs.unlinkSync(TEST_BG); } catch { /* ignore */ }
    } else {
      fs.writeFileSync(TEST_BG, prev);
    }
  }
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
      { APEX_MCP_MOCK: "0", PROBE_CHROME_PORT: String(port) },
    );
    assert.equal(r.status, 1, r.stderr + r.stdout);
    const body = JSON.parse(r.stdout);
    assert.equal(body.error, "chrome_daemon_up");
  } finally {
    child.kill();
  }
});
});
