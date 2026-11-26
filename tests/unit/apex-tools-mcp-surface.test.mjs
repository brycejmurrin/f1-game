// apex-tools-mcp-surface.test.mjs — apex-tools MCP (local CLI wrap): status, job waits, compact descriptions, UI inspector, garage plan and server lifecycle.
// APEX_MCP_MOCK=1 / dryRun only — no Chromium, no network. One of eight files split from the
// original apex-tools-mcp.test.mjs (T1-16, #3043); shared fixtures: tests/helpers/apex-tools-mcp.mjs.
import "../helpers/git-fixture-env.mjs";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, MCP, mkOutsideTemp, rpc, callCli, callTools, extrasCtx, jid } from "../helpers/apex-tools-mcp.mjs";
import { mkTmpDir } from "../helpers/tmp-dir.mjs";

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
    const SURVEY_TOTAL = findings.length;   // the survey's own count of what it wrote
    fs.writeFileSync(path.join(fake, "artifacts/survey/report.json"), JSON.stringify({ findings }));
    fs.writeFileSync(path.join(fake, "tools/track/verify-track.cjs"),
      'setTimeout(() => { const cells = Array.from({ length: 3000 }, (_, i) => ({ c: "c" + i, pad: "x".repeat(20) }));\n'
      + 'console.log(JSON.stringify({ ok: true, report: "artifacts/survey/report.json", counts: { total: ' + SURVEY_TOTAL + ' }, cells })); }, 3500);\n');
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
    assert.equal(done.out.findingsTotal, SURVEY_TOTAL, "the total is the report's, though only ten are shipped");
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
  const outside = mkOutsideTemp("apex-gallery-outside-");
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
  // Bryce 2026-10-20 ("All five"): the required circuit-id enum points at apex_catalog instead of listing 52 ids;
  // a shorter required enum (apex_job_start kind) stays inline, and the server still rejects an unknown id.
  for (const name of ["apex_frame_report"]) {
    const track = listed.tools.find((t) => t.name === name).inputSchema.properties.track;
    assert.equal(track.enum, undefined, `${name}.track lists no ids`);
    assert.ok(track.description.includes("apex_catalog"), `${name}.track points at apex_catalog`);
  }
  assert.ok(Array.isArray(listed.tools.find((t) => t.name === "apex_job_start").inputSchema.properties.kind.enum));
  const miss = out.find((m) => m.id === 3).result;
  assert.equal(miss.isError, true);
});

test("tools/list preserves every accepted top-level input for compact discovery tools", () => {
  const names = ["apex_ui_inspect", "apex_ui_diff", "apex_ui_mission_plan", "apex_garage_plan", "apex_viewer"];
  const out = rpc([
    { jsonrpc: "2.0", id: "list", method: "tools/list" },
    ...names.flatMap((tool) => [
      { jsonrpc: "2.0", id: tool, method: "tools/call", params: { name: "apex_help", arguments: { tool } } },
      { jsonrpc: "2.0", id: `${tool}:unknown`, method: "tools/call", params: { name: tool, arguments: { unsupportedDiscoveryInput: true } } },
    ]),
  ]);
  const listed = out.find((m) => m.id === "list").result;
  assert.ok(Buffer.byteLength(JSON.stringify(listed)) < 55000, "retain the discovery byte budget");
  // A small schema-aware client: exercise the published constraints, without invoking
  // browser tools or confusing a handler's business rules with JSON-schema admission.
  function accepts(value, spec) {
    if (spec.anyOf && !spec.anyOf.some((part) => accepts(value, part))) return false;
    if (Object.hasOwn(spec, "const") && value !== spec.const) return false;
    if (spec.enum && !spec.enum.includes(value)) return false;
    const type = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    if (spec.type && !(Array.isArray(spec.type) ? spec.type : [spec.type]).some((t) => t === type || t === "integer" && Number.isInteger(value))) return false;
    if (typeof value === "number" && (spec.minimum != null && value < spec.minimum || spec.maximum != null && value > spec.maximum || spec.exclusiveMinimum != null && value <= spec.exclusiveMinimum || spec.exclusiveMaximum != null && value >= spec.exclusiveMaximum)) return false;
    if (typeof value === "string" && (spec.minLength != null && value.length < spec.minLength || spec.maxLength != null && value.length > spec.maxLength || spec.pattern && !new RegExp(spec.pattern).test(value))) return false;
    if (Array.isArray(value)) {
      if (spec.minItems != null && value.length < spec.minItems || spec.maxItems != null && value.length > spec.maxItems) return false;
      if (spec.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) return false;
      if (spec.items && !value.every((v) => accepts(v, spec.items))) return false;
    } else if (value && typeof value === "object") {
      if ((spec.required || []).some((key) => !Object.hasOwn(value, key))) return false;
      for (const [key, v] of Object.entries(value)) {
        if (!Object.hasOwn(spec.properties || {}, key)) {
          if (spec.additionalProperties === false) return false;
        } else if (!accepts(v, spec.properties[key])) return false;
      }
    }
    return true;
  }
  function sample(spec) {
    if (spec.enum) return spec.enum[0];
    if (spec.type === "boolean") return false;
    if (spec.type === "integer" || spec.type === "number") return spec.minimum ?? (spec.exclusiveMinimum != null ? spec.exclusiveMinimum + 1 : 0);
    if (spec.type === "array") return Array.from({ length: spec.minItems || 0 }, () => sample(spec.items || {}));
    if (spec.type === "object") return Object.fromEntries((spec.required || []).map((key) => [key, sample(spec.properties[key])]));
    return "x".repeat(spec.minLength || 1);
  }
  for (const name of names) {
    const published = listed.tools.find((tool) => tool.name === name).inputSchema;
    const full = out.find((m) => m.id === name).result.structuredContent.inputSchema;
    assert.deepEqual(Object.keys(published.properties).sort(), Object.keys(full.properties).sort(), `${name}: optional inputs remain discoverable`);
    assert.deepEqual(published.required || [], full.required || [], `${name}: required inputs retained`);
    assert.equal(published.additionalProperties, false, name);
    const base = sample(full);
    for (const [key, spec] of Object.entries(full.properties)) {
      const values = spec.enum ? [...spec.enum] : [sample(spec)];
      if (spec.minimum != null) values.push(spec.minimum);
      if (spec.maximum != null) values.push(spec.maximum);
      for (const value of values) {
        const args = { ...base, [key]: value };
        assert.ok(accepts(args, full), `${name}.${key}: fixture is valid against the full schema`);
        assert.ok(accepts(args, published), `${name}.${key}: valid full-schema value ${JSON.stringify(value)} survives discovery`);
      }
      const advertised = published.properties[key];
      if (advertised.enum) {
        assert.deepEqual(advertised.enum, spec.enum, `${name}.${key}: advertised enum stays accurate`);
        assert.equal(accepts({ ...base, [key]: "unsupported-enum-value" }, published), false, `${name}.${key}: advertised enum rejects invalid values`);
      }
      if (advertised.minimum != null) assert.equal(accepts({ ...base, [key]: advertised.minimum - 1 }, published), false, `${name}.${key}: advertised minimum rejects values below it`);
      if (advertised.maximum != null) assert.equal(accepts({ ...base, [key]: advertised.maximum + 1 }, published), false, `${name}.${key}: advertised maximum rejects values above it`);
      for (const bound of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) {
        if (advertised[bound] != null) assert.equal(advertised[bound], spec[bound], `${name}.${key}.${bound}`);
      }
    }
    for (const key of published.required || []) {
      const missing = { ...base };
      delete missing[key];
      assert.equal(accepts(missing, published), false, `${name}: missing ${key} rejected`);
    }
    assert.equal(accepts({ ...base, unsupportedDiscoveryInput: true }, published), false, `${name}: client rejects unknown keys`);
    assert.equal(out.find((m) => m.id === `${name}:unknown`).result.isError, true, `${name}: server still rejects unknown keys`);
  }
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
  const dir = mkTmpDir('apex-ui-contract-');
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
  const dir = mkTmpDir('apex-ui-diff-');
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
  const gloss = callCli('apex_garage_plan', { team: 'mclaren', frames: ['spineTop'], field: 'finish', options: ['gloss', 'chrome'], maxShots: 2, budgetSeconds: 180 });
  assert.equal(gloss.status, 0, gloss.stderr + gloss.stdout);
  const finishPlan = JSON.parse(gloss.stdout);
  assert.equal(finishPlan.browser, false); assert.equal(finishPlan.planOnly, true);
  assert.equal(finishPlan.plan.shotCount, 2); assert.equal(finishPlan.withinBudget, true);
});

test('canonical catalog and car filters integrate with the published MCP schemas', () => {
  let r = callCli('apex_catalog', { section: 'parts', category: 'fuel', team: 'haas', limit: 2 });
  assert.equal(r.status, 0, r.stderr);
  let b = JSON.parse(r.stdout);
  assert.equal(b.section, 'parts'); assert.ok(b.rows.length <= 2);
  assert.ok(b.rows.every(row => row.category === 'fuel'));
  for (const [name, args] of [
    ['apex_job_start', { kind: 'parts_sweep', categories: ['fuel'], team: 'haas' }],
  ]) {
    r = callCli(name, { ...args, dryRun: true });
    assert.equal(r.status, 0, r.stderr);
    b = JSON.parse(r.stdout);
    assert.ok(b.argv.includes('--cats=fuel')); assert.ok(b.argv.includes('--team=haas'));
    assert.equal(callCli(name, { ...args, team: 'invented', dryRun: true }).status, 1);
  }
});

test('the four diagnostics job kinds stay on apex_job_start (the apex_diagnostics wrap left 2026-11-03)', async () => {
  const { DIAGNOSTIC_JOB_KINDS } = await import('../../tools/mcp/diagnostics-tools.mjs');
  assert.deepEqual([...DIAGNOSTIC_JOB_KINDS], ['memory_census', 'gpu_memory_census', 'renderer_probe', 'vm_lifecycle']);
  for (const kind of DIAGNOSTIC_JOB_KINDS) {
    const run = callCli('apex_job_start', { kind, dryRun: true });
    assert.equal(run.status, 0, run.stderr + run.stdout);
    const plan = JSON.parse(run.stdout);
    assert.equal(plan.kind, kind);
    assert.ok(plan.argv.some(s => s.endsWith('/tools/perf/diagnostics.mjs')), 'persistent bounded supervisor owns execution');
  }
  assert.equal(callCli('apex_job_start', { kind: 'shell', dryRun: true }).status, 1);
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
  // Hermetic occupancy (#5787): its own lock file and test-bg registry, so a parallel file holding the shared
  // scratch/apex-browser.lock (the contract and occupancy suites write it with their live pid) cannot refuse the open.
  const envKeys = ["APEX_MCP_PS", "APEX_BROWSER_LOCK", "APEX_TEST_BG_STATE"];
  const envBefore = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "apex-mcp-garage-epipe-"));
  process.env.APEX_MCP_PS = "";
  process.env.APEX_BROWSER_LOCK = path.join(dir, "apex-browser.lock");
  process.env.APEX_TEST_BG_STATE = path.join(dir, "test-bg.json");
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.pid = process.pid; child.kill = () => true;
  try {
    const r = await garageOpen({}, { spawnChild: () => { setImmediate(() => child.stdout.write('{"ready":true}\n')); return child; } });
    assert.equal(JSON.parse(r.content[0].text).ok, true, r.content[0].text);
    assert.equal(fs.existsSync(process.env.APEX_BROWSER_LOCK), true, "the open took this test's own lock");
    assert.doesNotThrow(() => child.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" })));
  } finally {
    garageClose("fixture teardown"); child.emit("exit", 0); releaseLock();
    for (const k of envKeys) { if (envBefore[k] === undefined) delete process.env[k]; else process.env[k] = envBefore[k]; }
    fs.rmSync(dir, { recursive: true, force: true });
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
    manifest(jid("verify_all", 1), false);
    assert.equal(ex.runningBrowserJob(), null, "a node-only job is not browser occupancy");
    manifest(jid("hud_shot", 2), true);
    assert.deepEqual(ex.runningBrowserJob(), { id: jid("hud_shot", 2), kind: "hud_shot", pid: process.pid });
    fs.writeFileSync(path.join(dir, `${jid("hud_shot", 2)}.exit`), "0");
    assert.equal(ex.runningBrowserJob(), null, "the job's recorded exit frees it");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  const src = fs.readFileSync(MCP, "utf8");
  assert.match(src, /function occupancyRefuse\(\) \{[^}]*?lockInfo\(\)[\s\S]{0,800}?runningBrowserJob\(\)/, "occupancyRefuse consults the job list");
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


// ---- apex_cursor_agents: one tool, a verb argument, a four-property listing -------------------------------------------

// W25 (2026-11-10): the instructions named 29 of 34 tools; apex_bump_cache_check advertised since (the CLI exits 2 on
// --since) plus target/url that changed nothing; apex_graph_parity {base:"HEAD"} on a clean tree diffed the tree with itself.
test("the server instructions name every tool in the table, and a tool the prose misses is appended", async () => {
  const out = rpc([{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } },
    { jsonrpc: "2.0", id: 2, method: "tools/list" }]);
  const instructions = out.find((m) => m.id === 1).result.instructions;
  const names = out.find((m) => m.id === 2).result.tools.map((t) => t.name).filter((n) => n.startsWith("apex_"));
  assert.ok(names.length >= 34, names.join(","));
  const missing = names.filter((n) => !new RegExp(`\\b${n}\\b`).test(instructions));
  assert.deepEqual(missing, [], "every registered apex_* tool appears in the instructions");
  assert.ok(instructions.length <= 4096, `Claude Code keeps 4,096 chars of instructions (got ${instructions.length})`);
  const { routesFor } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  const extra = routesFor([{ name: "apex_status" }, { name: "apex_zz_new", description: "Tree (no browser) — does a new thing, briefly; more text." }]);
  assert.equal(extra.split("\n").at(-1), "Also: apex_zz_new (does a new thing, briefly).");
});

test("apex_bump_cache_check: every schema field maps to a flag bump-cache.mjs accepts (dryRun is the wrapper's)", () => {
  const usage = spawnSync(process.execPath, [path.join(ROOT, "tools/ci/bump-cache.mjs"), "--bogus-flag"], { encoding: "utf8", cwd: ROOT });
  assert.equal(usage.status, 2);
  const accepted = new Set((usage.stderr.match(/accepts: (.*)/) || [])[1].trim().split(/\s+/));
  assert.ok(accepted.has("--check") && accepted.has("--json"), usage.stderr);
  const tools = rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]).find((m) => m.id === 1).result.tools;
  const props = tools.find((t) => t.name === "apex_bump_cache_check").inputSchema.properties;
  const flagsOf = (argv) => argv.slice(2).filter((a) => a.startsWith("-"));
  const base = JSON.parse(callCli("apex_bump_cache_check", { dryRun: true }).stdout);
  assert.equal(base.dryRun, true, "dryRun plans without running");
  for (const f of flagsOf(base.argv)) assert.ok(accepted.has(f), `${f} is not a bump-cache flag`);
  const sample = { string: "HEAD~1", boolean: true, number: 1, integer: 1 };
  for (const [key, spec] of Object.entries(props)) {
    if (key === "dryRun") continue;
    const r = JSON.parse(callCli("apex_bump_cache_check", { dryRun: true, [key]: spec.enum ? spec.enum.at(-1) : sample[spec.type] }).stdout);
    assert.notEqual(r.error, "bad_args", `${key}: ${r.message}`);
    const added = flagsOf(r.argv || []).filter((f) => !flagsOf(base.argv).includes(f));
    assert.ok(added.length, `${key} is advertised but changes nothing in the argv (${JSON.stringify(r.error || "")})`);
    for (const f of added) assert.ok(accepted.has(f), `${key} maps to ${f}, which bump-cache.mjs rejects`);
  }
  const real = JSON.parse(callCli("apex_bump_cache_check", {}, { APEX_MCP_MOCK: "" }).stdout);
  assert.notEqual(real.exit, 2, `the pinned argv is accepted by the CLI: ${real.stderr}`);
});

test("graph parity: selfParity spots a base that IS the working tree (tracked diff and untracked files count)", async () => {
  const { selfParity } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
  const repo = fs.mkdtempSync(path.join(ROOT, "scratch", "graph-parity-self-"));
  const git = (...a) => { const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: repo, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };
  try {
    git("init", "-q");
    const engine = path.join(repo, "js", "engine.js");
    fs.mkdirSync(path.dirname(engine));
    fs.writeFileSync(engine, "1\n");
    fs.writeFileSync(path.join(repo, "README"), "x\n");
    git("add", ".");
    git("commit", "-qm", "base");
    assert.equal(selfParity("HEAD", repo), true, "clean tree vs HEAD is a self-comparison");
    fs.writeFileSync(path.join(repo, "README"), "y\n");
    assert.equal(selfParity("HEAD", repo), true, "a change outside js/ and the manifest does not affect parity");
    fs.writeFileSync(engine, "2\n");
    assert.equal(selfParity("HEAD", repo), false, "a tracked js/ edit is a real diff");
    fs.writeFileSync(engine, "1\n");
    fs.writeFileSync(path.join(repo, "js", "added.js"), "new\n");
    assert.equal(selfParity("HEAD", repo), false, "an untracked js/ file is a real diff");
    assert.equal(selfParity("no-such-ref", repo), false, "an unknown ref is left to the CLI to report");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("apex_graph_parity refuses a base that is the working tree itself; dryRun still shows the plan", async (t) => {
  const { selfParity } = await import("../../tools/mcp/apex-tools-mcp.mjs");
  if (!selfParity("HEAD")) return t.skip("js/ or tools/manifest.cjs differs from HEAD in this checkout, so HEAD is a real base here");
  for (const args of [{ base: "HEAD", id: "monza" }, { base: "HEAD", all: true }]) {
    const r = callCli("apex_graph_parity", args, { APEX_MCP_MOCK: "" });
    const body = JSON.parse(r.stdout);
    assert.equal(body.error, "bad_args", r.stdout.slice(0, 600));
    assert.equal(body.message.startsWith('apex_graph_parity: base "HEAD" is the working tree itself'), true, body.message);
    assert.equal(body.argv, undefined, "refused before graph-parity.cjs spawns");
  }
  assert.equal(JSON.parse(callCli("apex_graph_parity", { base: "HEAD", id: "monza", dryRun: true }, { APEX_MCP_MOCK: "" }).stdout).dryRun, true);
});

test("MCP concurrency: the first cancel marker is published whole; a concurrent reader never parses a partial file (#5695)", { timeout: 20000 }, async () => {
  const { publishJobFileOnce } = await import("../../tools/mcp/job-admission.mjs");
  const root = fs.mkdtempSync(path.join(ROOT, "artifacts", "mcp-cancel-marker-"));
  const marker = path.join(root, "job.cancelled"), write = fs.writeFileSync;
  // A marker big enough that a non-atomic write lands in several chunks.
  const body = { state: "cancelled", ended: 1, exit: null, cleanup: { pids: Array.from({ length: 4000 }, (_, i) => i + 1), complete: false } };
  let reader;
  try {
    // Deterministic half: while the bytes are being written the marker name does not exist yet.
    let checked = false;
    fs.writeFileSync = (file, ...rest) => {
      if (String(file).startsWith(`${marker}.`)) { checked = true; assert.equal(fs.existsSync(marker), false, "marker name is visible before its bytes"); }
      return write(file, ...rest);
    };
    assert.equal(publishJobFileOnce(marker, body), true);
    fs.writeFileSync = write;
    assert.ok(checked, "the marker is written through a sibling temp file");
    assert.deepEqual(JSON.parse(fs.readFileSync(marker, "utf8")), body);
    // A second canceller neither throws nor replaces the first marker, and leaves no temp file.
    assert.equal(publishJobFileOnce(marker, { ...body, ended: 2 }), false);
    assert.equal(JSON.parse(fs.readFileSync(marker, "utf8")).ended, 1, "first canceller wins");
    assert.deepEqual(fs.readdirSync(root), ["job.cancelled"]);
    fs.rmSync(marker);
    // Loaded-reader half: another OS process polls the marker the way readCancellation does.
    const done = path.join(root, "done");
    reader = spawn(process.execPath, ["-e", `
      const fs=require('node:fs'); let seen=0, torn=0;
      while (!fs.existsSync(${JSON.stringify(done)})) {
        let text; try { text = fs.readFileSync(${JSON.stringify(marker)}, 'utf8'); } catch { continue; }
        seen++; try { JSON.parse(text); } catch { torn++; }
      }
      process.stdout.write(JSON.stringify({ seen, torn }));
    `], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    reader.stdout.on("data", (d) => { out += d; });
    const exited = new Promise((resolve) => reader.on("exit", resolve));
    const deadline = Date.now() + 3000;
    for (let i = 0; i < 400 && Date.now() < deadline; i++) {
      assert.equal(publishJobFileOnce(marker, { ...body, ended: i }), true);
      await new Promise((r) => setImmediate(r));
      fs.rmSync(marker);
    }
    write(done, "");
    await exited;
    const { seen, torn } = JSON.parse(out);
    assert.equal(torn, 0, `reader parsed ${torn} partial markers of ${seen} reads`);
  } finally { fs.writeFileSync = write; if (reader?.exitCode === null) reader.kill(); fs.rmSync(root, { recursive: true, force: true }); }
});

test("MCP concurrency: apex-extras writes no job marker or manifest in place (#5695)", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/mcp/apex-extras.mjs"), "utf8");
  assert.doesNotMatch(src, /writeFileSync\(\s*(jobCancelPath|jobManifestPath|mf\b)/, "use publishJobFileOnce / publishJobManifest (tmp in the same dir, then link or rename)");
});
