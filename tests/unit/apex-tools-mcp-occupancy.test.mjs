// apex-tools-mcp-occupancy.test.mjs — apex-tools MCP (local CLI wrap): the browser lock, test-bg occupancy and browser-tool refusals.
// APEX_MCP_MOCK=1 / dryRun only — no Chromium, no network. One of eight files split from the
// original apex-tools-mcp.test.mjs (T1-16, #3043); shared fixtures: tests/helpers/apex-tools-mcp.mjs.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, MCP, rpc, callCli, LOCK } from "../helpers/apex-tools-mcp.mjs";

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

test("apex_select_specs files plans a hypothetical change; paths stay repo-relative", () => {
  const r = callCli("apex_select_specs", { dryRun: true, files: ["js/ui/hud.js", "css/hud.css"] });
  assert.equal(r.status, 0, r.stderr);
  const argv = JSON.parse(r.stdout).argv;
  assert.equal(argv[argv.indexOf("--files") + 1], "js/ui/hud.js,css/hud.css", argv);
  assert.deepEqual(argv.filter((a) => a === "--since"), [], argv);
  for (const bad of [["/etc/passwd"], ["../x.js"], ["a.js,b.js"]]) {
    assert.equal(JSON.parse(callCli("apex_select_specs", { dryRun: true, files: bad }).stdout).error, "bad_args", bad);
  }
});

test("a capitalised circuit id is taken as the lowercase id; catalog filter narrows the general catalog", () => {
  const shot = JSON.parse(callCli("apex_shot", { dryRun: true, track: "Monza" }).stdout);
  assert.ok(shot.argv.some((a) => a === "monza"), shot.argv);
  assert.equal(JSON.parse(callCli("apex_shot", { dryRun: true, track: "Monzaa" }).stdout).error, "bad_args");
  const cat = JSON.parse(callCli("apex_catalog", { filter: "monza" }).stdout);
  assert.deepEqual(cat.tracks, ["monza"]);
  assert.deepEqual(cat.cams, []);
  assert.equal(JSON.parse(callCli("apex_nope", {}).stdout).fix.split(" ")[0], "apex_help");
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

test("tree pins: graph-parity needs base; a retired wrap is unknown", () => {
  const gp = callCli("apex_graph_parity", { dryRun: true, base: "HEAD~1", id: "monza" });
  assert.equal(gp.status, 0, gp.stderr);
  const gpBody = JSON.parse(gp.stdout);
  assert.match(gpBody.argv.join(" "), /graph-parity\.cjs/);
  assert.equal(gpBody.env.BASE, "HEAD~1");
  assert.ok(gpBody.argv.includes("monza"), gpBody.argv);

  const gpMiss = callCli("apex_graph_parity", { dryRun: true, id: "monza" });
  assert.equal(gpMiss.status, 1, gpMiss.stderr);
  assert.equal(JSON.parse(gpMiss.stdout).error, "bad_args");

  // A trimmed wrap must be refused as unknown, not silently routed to a CLI (2026-09 and 2026-11-03 trims alike).
  for (const name of ["apex_verify_track", "apex_rotate_markings_check", "apex_track_audit", "apex_car_audit", "apex_locations", "apex_profile_query", "apex_diagnostics", "apex_codex_control", "apex_codex_agents", "apex_inbox_sync"]) {
    const gone = callCli(name, { dryRun: true, id: "monza" });
    assert.equal(gone.status, 1, name);
    assert.equal(JSON.parse(gone.stdout).error, "unknown_tool", name);
  }
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
    const r = callCli("apex_bump_cache_check", { dryRun: true });
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
