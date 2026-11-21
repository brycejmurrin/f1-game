// apex-tools-mcp-args.test.mjs — apex-tools MCP (local CLI wrap): minimal calls, bad_args guidance, catalogs and the optional-argument sweep.
// APEX_MCP_MOCK=1 / dryRun only — no Chromium, no network. One of eight files split from the
// original apex-tools-mcp.test.mjs (T1-16, #3043); shared fixtures: tests/helpers/apex-tools-mcp.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ROOT, MCP, rpc, callCli, callTools } from "../helpers/apex-tools-mcp.mjs";

// 2026-10-10: a tool must say what it needs. Ten first calls in one session came back bad_args with no way forward
// ("arguments must match one of the advertised types", "tool needs file"); the survey dropped `cams` and still said ok.
// These keep every tool answerable to a minimal valid call, and every refusal self-explaining.
const MIN_ARGS = {
  apex_unit_test: { file: "tests/unit/a11y-pwa-pass.test.mjs" },
  apex_cursor_agents: { verb: "digest" },
  apex_claude_agents: { verb: "capabilities" },
  apex_select_specs: { since: "HEAD~1" },
  apex_graph_parity: { base: "HEAD~1", id: "monza" },
  apex_frame_report: { track: "monza" },
  apex_shot_survey: { track: "monza" },
  apex_ui_fit: { screen: "title" },
  apex_profile: { track: "monza" },
  apex_ui_shot: { screen: "title" },
  apex_job_start: { kind: "verify_all" },
};

test("every tool answers a minimal valid call (mock): ok, not a bad_args refusal", () => {
  const out = rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "apex_catalog", arguments: {} } }]);
  const tools = out.find((m) => m.id === 1).result.tools;
  assert.ok(tools.length >= 28, `catalog has ${tools.length} tools`);
  // A schema-aware client: an enum gives the value; a `track` that points at apex_catalog takes its first id there.
  const firstTrack = out.find((m) => m.id === 2).result.structuredContent.tracks[0];
  const valueFor = (spec) => spec.enum?.[0] ?? (/apex_catalog/.test(spec.description || "") && firstTrack ? (firstTrack.id ?? firstTrack) : "x");
  const skip = new Set(["apex_job_cancel", "apex_garage", "apex_track"]);   // need a prior job / a live session
  const calls = tools.filter((t) => !skip.has(t.name)).map((t) => {
    const args = { ...(MIN_ARGS[t.name] || {}) };
    for (const k of t.inputSchema.required || []) if (!(k in args)) args[k] = valueFor(t.inputSchema.properties[k]);
    return [t.name, args];
  });
  const res = callTools(calls);
  const bad = res.map((r, i) => [calls[i][0], r]).filter(([, r]) => r.body.error === "bad_args");
  assert.deepEqual(bad.map(([n, r]) => `${n}: ${r.body.message}`), [], "a minimal valid call must not be refused as bad_args");
});

test("bad_args names the way forward: required hint, did-you-mean, valid keys, got-type", () => {
  const [needs, parity, key, en, type] = callTools([
    ["apex_unit_test", {}],
    ["apex_graph_parity", { base: "HEAD" }],
    ["apex_shot", { track: "monza", fracc: 0.1 }],
    ["apex_shot", { track: "monza", cam: "orbt" }],
    ["apex_shot", { track: "monza", frac: "x" }],
  ]).map((r) => r.body);
  assert.match(needs.fix, /Pass "file": string/, "required key: what to pass");
  assert.match(parity.message, /id or all:true/);
  assert.match(parity.fix, /"base":"HEAD","id":"monza"/);
  assert.match(key.fix, /Did you mean "frac"\?.*Valid: track, frac, cam/, "unknown key: nearest + the valid list");
  assert.match(en.fix, /Did you mean "orbit"\?/);
  assert.match(type.message, /frac must be number, got string/);
});

test("parity, survey and spec selectors survive local discovery and the configured host-facing adapter", async (t) => {
  const local = rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }])[0].result.tools;
  const client = new Client({ name: "selector-schema-test", version: "1" });
  const { command, args } = JSON.parse(fs.readFileSync(path.join(ROOT, ".mcp.json"), "utf8")).mcpServers["apex-tools"];
  t.after(() => client.close());
  await client.connect(new StdioClientTransport({ command, args, cwd: ROOT, env: { ...process.env, APEX_MCP_MOCK: "1" } }));
  const published = (await client.listTools()).tools;
  const parity = "apex_graph_parity", survey = "apex_shot_survey", specs = "apex_select_specs";
  for (const [name, keys] of [[parity, ["base", "id", "all"]], [survey, ["track", "tracks", "reports"]], [specs, ["files", "since"]]]) {
    for (const list of [local, published]) {
      const schema = list.find(tool => tool.name === name).inputSchema;
      assert.equal(schema.type, "object");
      assert.equal(schema.anyOf, undefined, "host projection would discard the root fields");
      assert.deepEqual(schema.required || [], name === parity ? ["base"] : []);
      for (const key of [...keys, "dryRun", ...(list === published ? ["outputLevel"] : [])]) assert.ok(schema.properties[key], key);
    }
  }
  for (const [name, selectors] of [
    [parity, { base: "HEAD", id: "spa", all: false }], [parity, { base: "HEAD", all: true }],
    [survey, { track: "spa" }], [survey, { tracks: ["spa", "monza"] }],
    [survey, { reports: ["artifacts/track-survey/spa/findings.json"] }],
    [specs, { files: ["js/ui/hud.js"] }], [specs, { since: "HEAD" }], [specs, { since: "HEAD", files: ["js/ui/hud.js"] }],
  ]) {
    const result = await client.callTool({ name, arguments: { ...selectors, dryRun: true, outputLevel: "full" } });
    assert.equal(result.structuredContent.ok, true, JSON.stringify(result.content));
    assert.equal(result.structuredContent.dryRun, true);
  }
});

test("parity and survey reject missing or conflicting selectors before dispatch", () => {
  const parity = "apex_graph_parity", survey = "apex_shot_survey";
  const cases = [
    [parity, { id: "spa" }, /needs base/],
    [parity, { base: "HEAD", all: false }, /exactly one of id or all:true/],
    [parity, { base: "HEAD", id: "spa", all: true }, /exactly one of id or all:true/],
    ...[{}, { track: "spa", tracks: ["monza"] }, { track: "spa", reports: ["scratch/a.json"] },
      { tracks: ["monza"], reports: ["scratch/a.json"] }].map(args => [survey, args, /exactly one of track, tracks or reports/]),
  ];
  const results = callTools(cases.map(([name, args]) => [name, { ...args, dryRun: true }]));
  for (const [i, result] of results.entries()) {
    assert.equal(result.body.error, "bad_args");
    assert.match(result.body.message, cases[i][2]);
  }
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
  const cases = [
    ["ios-iphone-landscape-844", "phone-landscape-844x390"],
    ["ios-iphone-landscape", "ios-iphone-landscape"],
    ["ios-iphone-portrait", "ios-iphone-portrait"],
    ["ios-iphone-landscape-safari", "ios-iphone-landscape-safari"],
    ["bryce-portrait", "bryce-393x852"],
  ];
  const results = callTools(cases.map(([device]) => ["apex_hud_shot", { device, dryRun: true }]));
  for (const [i, { body }] of results.entries()) {
    assert.equal(body.ok, true, JSON.stringify(body));
    assert.equal(body.argv[body.argv.indexOf("--device") + 1], cases[i][1]);
  }
  const miss = callTools([["apex_hud_shot", { device: "phone-landscape-844", dryRun: true }]])[0].body;
  assert.equal(miss.ok, false);
  assert.equal(miss.error, "bad_args");
  assert.match(miss.fix, /Did you mean "phone-landscape-844x390"\?/, miss.fix);
});

test("menu and HUD shots resolve shared viewport names to the same CSS dimensions", async () => {
  const { VIEWPORTS } = await import("../../tools/ui/menu-screens.mjs");
  const { DEVICES } = await import("../../tools/lib/hud-survey-matrix.mjs");
  const names = ["ios-iphone-landscape", "ios-iphone-landscape-safari", "ios-iphone-portrait", "ios-iphone-landscape-844",
    "bryce-standalone", "bryce-safari", "ios-ipad-landscape", "ios-ipad-portrait",
    "desktop-1280x800", "desktop-1440x900", "desktop-1920x1080", "desktop-windowed-1920x937"];
  const results = callTools(names.flatMap((name) => [
    ["apex_ui_shot", { screen: "title", viewport: name, dryRun: true }],
    ["apex_hud_shot", { device: name, dryRun: true }],
  ]));
  for (const [i, name] of names.entries()) {
    const menu = results[2 * i].body, hud = results[2 * i + 1].body;
    assert.deepEqual(menu.argv.filter(arg => arg.startsWith("--viewport=")), [`--viewport=${name}`]);
    const device = DEVICES[hud.argv[hud.argv.indexOf("--device") + 1]];
    const [, context, , , owner] = VIEWPORTS.find(([id]) => id === name);
    assert.deepEqual({ width: device.w, height: device.h }, context.viewport, name);
    assert.equal(device.owner, owner?.bryce, name);
  }
});

test("explicit legacy HUD devices keep their original sizes", async () => {
  const { DEVICES } = await import("../../tools/lib/hud-survey-matrix.mjs");
  const cases = [["phone-landscape-844x390", 844, 390], ["phone-short-734x343", 734, 343],
    ["phone-portrait-390x844", 390, 844], ["desktop-1280", 1280, 720], ["desktop-1920", 1920, 1080],
    ["tablet-1180x820", 1180, 820]];
  const shots = callTools(cases.map(([device]) => ["apex_hud_shot", { device, dryRun: true }]));
  for (const [i, [id, w, h]] of cases.entries()) {
    const { argv } = shots[i].body;
    assert.equal(argv[argv.indexOf("--device") + 1], id);
    assert.deepEqual([DEVICES[id].w, DEVICES[id].h], [w, h], id);
  }
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
test("shot surveys take the authored location ids shot-survey.mjs --list-locations prints (apex_locations left 2026-11-03)", async () => {
  // The catalog is a plain CLI now: the same listSurveyLocations the CLI prints feeds apex_shot_survey.location.
  const { listSurveyLocations } = await import("../../tools/lib/survey-scenarios.mjs");
  assert.ok(listSurveyLocations("monaco").some((l) => l.id === "monaco/turn-1"));
  assert.ok(listSurveyLocations("spa").some((l) => l.id === "spa/eau-rouge" && l.aliases.includes("eau rouge")));
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

test('custom survey collection flows through the location catalog and async job argv', async () => {
  const { design } = await import('../helpers/editor-vm.mjs');
  const { loadSurveyDesigns } = await import('../../tools/lib/custom-survey-locations.mjs');
  const { listSurveyLocations } = await import('../../tools/lib/survey-scenarios.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-custom-survey-')), file = path.join(dir, 'designs.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ format: 'apex26.tracks', v: 1, items: [design({ props: [{ kind: 'pond', s: .25, side: 1, gap: 40 }] })] }));
    const custom = loadSurveyDesigns(file);
    const id = custom.designs[0].id;
    const locations = listSurveyLocations(id, custom);
    assert.equal(locations[0].id, `${id}/pond-1`);
    const plan = JSON.parse(callCli('apex_shot_survey', { track: id, designs: file, location: `${id}/pond-1`, angles: ['overhead'], dryRun: true }).stdout);
    assert.equal(plan.ok, true);
    assert.equal(plan.options.profile, 'preview');
    assert.deepEqual(plan.shots[0].target, locations[0].target);
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
  apex_viewer: [{}],
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
