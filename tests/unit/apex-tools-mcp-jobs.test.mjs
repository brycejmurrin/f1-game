// apex-tools-mcp-jobs.test.mjs — apex-tools MCP (local CLI wrap): track sessions, resources, jobs and their logs.
// No Chromium or network. The unit-test reporter fixture runs the real Node test runner. One of eight files split from the
// original apex-tools-mcp.test.mjs (T1-16, #3043); shared fixtures: tests/helpers/apex-tools-mcp.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, MCP, rpc, callCli, jid } from "../helpers/apex-tools-mcp.mjs";

test("2026-10-03 tools: track session, jobs and UI pin their argv and refuse bad input", () => {
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
  bad("apex_job_status", { jobId: "missing" });   // not the shape jobStart mints
  bad("apex_job_cancel", { jobId: "../missing" });
  bad("apex_job_status", { jobId: jid("float_all", 404) }, "unknown_job");
  bad("apex_job_cancel", { jobId: jid("float_all", 404) }, "unknown_job");
  ok("apex_ui_fit", { screen: "settings", scale: 130 }, /--screens=settings","--viewports=ios-iphone-landscape","--jobs=1","--json","--scale=130/);
  bad("apex_ui_fit", { screen: "--all" });
  bad("apex_ui_fit", { screen: "settings", scale: 500 });
  ok("apex_ui_shot", { screen: "garage", viewport: "desktop-1440x900" }, /--screen=garage","--viewport=desktop-1440x900/);
  // apex_unit_test: one file under tests/unit/, optional --test-name-pattern.
  const unit = ok("apex_unit_test", { file: "tests/unit/hud-layout.test.mjs" });
  assert.deepEqual(unit.argv.slice(1), ["--test", "--test-reporter=tap", "tests/unit/hud-layout.test.mjs"]);
  const pat = ok("apex_unit_test", { file: "tests/unit/hud-layout.test.mjs", pattern: "HELMET" });
  assert.deepEqual(pat.argv.slice(1), ["--test", "--test-reporter=tap", "--test-name-pattern", "HELMET", "tests/unit/hud-layout.test.mjs"]);
  bad("apex_unit_test", { file: "tests/specs/camera.spec.js" });
  bad("apex_unit_test", { file: "tests/unit/" + "no-such-file.test.mjs" });   // a missing file is refused (docs-integrity: not a path literal)
  bad("apex_unit_test", { file: "../etc/passwd" });
  bad("apex_unit_test", {});
  const src = fs.readFileSync(MCP, "utf8");
  for (const n of ["apex_track", "apex_ui_fit", "apex_ui_shot"]) assert.match(src, new RegExp(`name: "${n}",\\s*week: 7,\\s*kind: "browser"`), `${n} takes the browser lock`);
  for (const n of ["apex_job_start", "apex_job_status", "apex_job_cancel"]) assert.match(src, new RegExp(`name: "${n}",\\s*week: 7,\\s*kind: "tree"`), `${n} is a tree tool`);
});

test("apex_unit_test reports real pass/fail counts and preserves full TAP output", (t) => {
  const file = "tests/unit/visual-oracle.test.mjs";
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "unit-reporter-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const preload = path.join(dir, "failure.cjs");
  // Register the intentional failure only in the selected test worker.
  fs.writeFileSync(preload, [
    'if (process.env.NODE_TEST_CONTEXT && process.argv[1] === process.env.APEX_REPORTER_TEST_FILE) {',
    '  require("node:test")("reporter fixture", () => { throw Error("fixture failure"); });',
    '}',
  ].join("\n"));
  const run = (full, fail) => {
    const env = { APEX_MCP_MOCK: "0", NODE_TEST_CONTEXT: undefined };
    if (fail) {
      env.APEX_REPORTER_TEST_FILE = path.join(ROOT, file);
      env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--require="${preload}"`].filter(Boolean).join(" ");
    }
    const pattern = "^visual content|^reporter fixture$";
    const result = callCli("apex_unit_test", { file, full, pattern }, env);
    assert.equal(result.status, fail ? 1 : 0, result.stdout + result.stderr);
    return JSON.parse(result.stdout);
  };
  const pass = run(false, false);
  assert.equal(pass.exit, 0);
  assert.deepEqual(pass.out, { tests: 1, pass: 1, fail: 0, failing: [] });
  const failed = run(false, true);
  assert.equal(failed.exit, 1);
  assert.deepEqual(failed.out, { tests: 2, pass: 1, fail: 1, failing: ["reporter fixture"] });
  assert.match(failed.stdout, /fixture failure/);
  const full = run(true, false);
  const lines = full.stdout.trimEnd().split("\n");
  assert.equal(lines[0], "TAP version 13");
  assert.deepEqual(lines.filter(line => line.startsWith("# pass ")), ["# pass 1"]);
});

test("resources/list and resources/read serve the agent references", () => {
  const out = rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "resources/list", params: {} },
    { jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "apex://debug-hooks" } },
    { jsonrpc: "2.0", id: 4, method: "resources/read", params: { uri: "file:///etc/passwd" } },
    { jsonrpc: "2.0", id: 5, method: "resources/templates/list", params: {} },
    { jsonrpc: "2.0", id: 6, method: "resources/read", params: { uri: "apex://debug-hooks/cameras" } },
    { jsonrpc: "2.0", id: 7, method: "resources/read", params: { uri: "apex://debug-hooks/../../etc" } },
    { jsonrpc: "2.0", id: 8, method: "resources/read", params: { uri: "apex://start-here" } },
  ]);
  const byId = (i) => out.find((m) => m.id === i);
  assert.ok(byId(1).result.capabilities.resources);
  assert.equal(byId(1).result.instructions, byId(8).result.contents[0].text, "start-here is the instructions map");
  assert.ok(byId(1).result.instructions.length < 3600, "room for the gateway's sentence inside Claude Code's 4,096-char cap");
  assert.deepEqual(byId(2).result.resources.map((r) => r.name), ["start-here", "debug-hooks", "AGENT-SURFACE.md", "APEX-TOOLS-MCP.md"]);
  const index = byId(3).result.contents[0].text;
  const slugs = index.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).split(" — ")[0]);
  assert.ok(slugs.some((s) => s === "cameras"), slugs);
  assert.equal(byId(4).error.code, -32002, "only the listed docs are readable");
  assert.equal(byId(5).result.resourceTemplates[0].uriTemplate, "apex://debug-hooks/{section}");
  const cameras = byId(6).result.contents[0].text;
  assert.equal(cameras.split("\n")[0], "## Cameras");
  assert.ok(cameras.length < 50000, "a section fits under Claude Code's 50,000-char spill threshold");
  assert.equal(byId(7).error.code, -32002);
  // Every section the index names is readable and fits; the sections rebuild the whole file.
  const parts = rpc(slugs.map((s, i) => ({ jsonrpc: "2.0", id: 100 + i, method: "resources/read", params: { uri: `apex://debug-hooks/${s}` } })));
  const texts = slugs.map((_, i) => parts.find((m) => m.id === 100 + i).result.contents[0].text);
  assert.ok(texts.every((t) => t.length < 50000), "every DEBUG-HOOKS section fits; split one that outgrows 50,000 chars");
  assert.equal(texts.join(""), fs.readFileSync(path.join(ROOT, "docs/DEBUG-HOOKS.md"), "utf8"));
});

test("server instructions name every tool they route to, and only real ones", () => {
  const out = rpc([{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }]);
  const names = new Set(out.find((m) => m.id === 2).result.tools.map((t) => t.name));
  const routed = new Set(out.find((m) => m.id === 1).result.instructions.match(/apex_\w+/g));
  for (const n of routed) assert.ok(names.has(n), `instructions route to unknown tool ${n}`);
  for (const n of names) if (!["apex_job_cancel", "apex_debug_chrome", "apex_ui_diff", "apex_ui_mission_plan", "apex_garage_plan"].includes(n)) assert.ok(routed.has(n), `instructions omit ${n}`);
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
