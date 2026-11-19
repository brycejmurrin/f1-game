// apex-tools-mcp-contract.test.mjs — apex-tools MCP (local CLI wrap): schema contracts, stdio envelopes, atomic claims and spawn plumbing.
// APEX_MCP_MOCK=1 / dryRun only — no Chromium, no network. One of eight files split from the
// original apex-tools-mcp.test.mjs (T1-16, #3043); shared fixtures: tests/helpers/apex-tools-mcp.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ROOT, MCP, mkOutsideTemp, rpc, callCli, LOCK } from "../helpers/apex-tools-mcp.mjs";

// Regression evidence from the tool survey: malformed callers must fail at
// the seam, before any tree command, browser occupancy check or VM boot.
test("every tool carries title and honest MCP annotations; tool-specific outputSchemas only; results mirror structuredContent", () => {
  // MCP 2025-06-18 ToolAnnotations default to destructiveHint: true and
  // openWorldHint: true — wrong for 25 of these 26 wraps. The hints derive from
  // the catalog's kind (docs/notes/AGENT-SURFACE-SURVEY-2026-10-05.md §4).
  const listed = rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }])[0].result.tools;
  const readOnly = [], destructive = [], openWorld = [], withSchema = [];
  for (const t of listed) {
    assert.match(t.title, /^Apex 26 · /, t.name);
    // The generic CLI envelope is not published (docs/notes/MCP-SINGLE-TOOL-REDESIGN-2026-10-20.md §6);
    // a tool with a measured shape still advertises it.
    if (t.outputSchema) {
      withSchema.push(t.name);
      assert.equal(t.outputSchema.type, "object", t.name);
      assert.equal(typeof t.outputSchema.properties.ok, "object", t.name);
    }
    const a = t.annotations;
    for (const k of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) assert.equal(typeof a[k], "boolean", `${t.name}.${k}`);
    if (a.readOnlyHint) readOnly.push(t.name);
    if (a.destructiveHint) destructive.push(t.name);
    if (a.openWorldHint) openWorld.push(t.name);
    if (a.readOnlyHint) assert.equal(a.idempotentHint, true, `${t.name}: read-only implies idempotent`);
    if (/^apex_(eval|shot|agent|garage|track|ui_fit|ui_shot|hud_shot|hud_survey)$/.test(t.name)) assert.equal(a.readOnlyHint, false, `${t.name} takes the browser lock and writes artifacts`);
  }
  assert.deepEqual(withSchema.sort(), ["apex_bump_cache_check", "apex_catalog", "apex_doctor", "apex_help", "apex_hud_mock",
    "apex_hud_shot", "apex_hud_survey", "apex_job_status", "apex_pick_tests", "apex_select_specs",
    "apex_status", "apex_viewer"], "exactly the tools with a measured result shape");
  // 2026-11-03: no tool on this server writes to a vendor; the only destructive one stops a local job.
  assert.deepEqual(destructive, ["apex_job_cancel"]);
  assert.deepEqual(openWorld.sort(), ["apex_cursor_agents"], "only the Cursor READS reach a network");
  for (const n of ["apex_claude_agents", "apex_cursor_agents", "apex_status", "apex_doctor", "apex_pick_tests", "apex_select_specs", "apex_bump_cache_check", "apex_job_status", "apex_frame_report", "apex_unit_test"]) assert.ok(readOnly.includes(n), `${n} is read-only`);
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
    ["apex_bump_cache_check", {}], ["apex_job_status", {}],
  ];
  const results = rpc(calls.map(([name, args], i) => ({ jsonrpc: "2.0", id: 10 + i, method: "tools/call", params: { name, arguments: args } })));
  for (const [i, [name]] of calls.entries()) {
    const r = results.find((m) => m.id === 10 + i).result;
    assert.ok(r.structuredContent && typeof r.structuredContent === "object", `${name}: structuredContent present`);
    assert.deepEqual(validate(r.structuredContent, schemaOf(name), name, []), [], `${name} conforms to its outputSchema`);
  }
  for (const t of listed.filter((x) => x.outputSchema)) {
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
  const outside = mkOutsideTemp("apex-mcp-output-");
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
  // One reply per request line: the count is the request list's, not a literal.
  const requests = [
    "null", "true", '"text"', "[]", '[{"jsonrpc":"2.0","id":1,"method":"ping"}]',
    "{", { jsonrpc: "1.0", id: 1, method: "ping" },
    { jsonrpc: "2.0", id: {}, method: "ping" },
    { jsonrpc: "2.0", id: 2, method: "ping", params: [] },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "apex_status", arguments: null } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: 3 } },
    { jsonrpc: "2.0", id: 99, method: "ping" },
    { jsonrpc: "2.0", id: 100, method: "tools/list" },
  ];
  const errors = rpc(requests);
  assert.equal(errors.length, requests.length);
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
