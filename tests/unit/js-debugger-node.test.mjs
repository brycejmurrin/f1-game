// #2957 + workflow tools: Node targets, debugger_node_test (probes, captures, parallel files,
// child auto-attach, node --test runner, timeout), debugger_break / debugger_collect against a live
// Node inspector, and the pause-cause / step-wait / query-less URL fixes. Real Node processes, no browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { spawn } from "node:child_process";
import { targets } from "../../tools/mcp/js-debugger-cdp.mjs";
import { DebugSession, attachableUrl, breakpointTarget } from "../../tools/mcp/js-debugger-session.mjs";
import { callTool, TOOLS } from "../../tools/mcp/js-debugger-mcp.mjs";
import { nodeTest, probeCondition, repoFile } from "../../tools/mcp/js-debugger-node.mjs";

const FX = "tests/fixtures/js-debugger";
async function inspectBrk(file) {
  const p = spawn(process.execPath, ["--inspect-brk=127.0.0.1:0", file], { stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  p.stderr.on("data", d => { err += d; });
  while (!/ws:\/\/127\.0\.0\.1:(\d+)/.test(err)) await new Promise(r => setTimeout(r, 20));
  return { p, endpoint: `http://127.0.0.1:${err.match(/ws:\/\/127\.0\.0\.1:(\d+)/)[1]}` };
}

test("#2957: a Node inspector lists as type node; the default and node/all filters include it", async () => {
  const { p, endpoint } = await inspectBrk(`${FX}/live.fixture.cjs`);
  try {
    const rows = await targets(endpoint);
    assert.equal(rows.length, 1); assert.equal(rows[0].type, "node"); assert.match(rows[0].url, /^file:\/\/.*live\.fixture\.cjs$/);
    assert.equal((await targets(endpoint, "node")).length, 1);
    assert.equal((await targets(endpoint, "all")).length, 1);
    assert.equal((await targets(endpoint, "page")).length, 0);
  } finally { p.kill("SIGKILL"); }
});

test("attachable URLs: node file scripts and url-less workers attach; remote pages and url-less pages do not", () => {
  assert.equal(attachableUrl({ type: "node", url: "file:///repo/x.mjs" }), true);
  assert.equal(attachableUrl({ type: "worker", url: "" }), true);
  assert.equal(attachableUrl({ type: "page", url: "http://127.0.0.1:3456/" }), true);
  assert.equal(attachableUrl({ type: "page", url: "" }), false);
  assert.equal(attachableUrl({ type: "page", url: "https://brycejmurrin.github.io/f1-game/" }), false);
  assert.equal(attachableUrl({ type: "node", url: "https://evil.test/x.js" }), false);
});

test("query-less and bare-path breakpoint URLs match any ?v= query; Node targets take repo paths", () => {
  const re = new RegExp(breakpointTarget("js/agent/apex.js", { type: "page" }).urlRegex);
  for (const u of ["http://127.0.0.1:3456/js/agent/apex.js?v=dev", "http://127.0.0.1:3456/js/agent/apex.js?v=1695", "http://127.0.0.1:3456/js/agent/apex.js"]) assert.match(u, re);
  assert.doesNotMatch("http://127.0.0.1:3456/js/agent/apex.json", re);
  assert.doesNotMatch("http://127.0.0.1:3456/js/agent/xapex.js", re);
  assert.deepEqual(breakpointTarget("http://127.0.0.1:3456/a.js?v=1", { type: "page" }), { url: "http://127.0.0.1:3456/a.js?v=1" });
  assert.match(breakpointTarget(`${FX}/lib.fixture.cjs`, { type: "node" }).url, /^file:\/\/\/.*tests\/fixtures\/js-debugger\/lib\.fixture\.cjs$/);
});

test("debugger_node_test: exact hit counts, values, locals captures, TAP failures, probes in another file", async () => {
  const r = await nodeTest({ file: `${FX}/sample.fixture.mjs`, probes: [
    { line: 7, expression: "({a, b, sum})", captureLocals: 2 },
    { file: `${FX}/lib.fixture.cjs`, line: 4, expression: "x * k" },
    { line: 6, condition: "a === 1" }, { line: 7, column: 3 }] });
  const run = r.runs[0];
  assert.equal(r.ok, false); assert.deepEqual(r.failed, [`${FX}/sample.fixture.mjs`]);
  assert.equal(run.exitCode, 1); assert.equal(run.summary.pass, 2); assert.equal(run.summary.fail, 1);
  assert.deepEqual(run.summary.failed, ["fails on purpose"]);
  const [p1, p2] = run.probes;
  assert.equal(p1.hits, 1501); assert.deepEqual(p1.resolved, [7]);
  assert.equal(p1.values.length, 20); assert.equal(p1.values[0], '{"a":0,"b":1,"sum":1}');
  assert.equal(p1.captures.length, 2); assert.deepEqual([p1.captures[1].locals.a, p1.captures[1].locals.sum], [1, 2]);
  assert.match(p1.captures[0].stack[0], /^add tests\/fixtures\/js-debugger\/sample\.fixture\.mjs:7:/);
  assert.match(p1.captures[0].locals.add, /^function add\(a, b\) \{$/);
  assert.equal(p2.hits, 1); assert.deepEqual(p2.values, [6]);
  assert.equal(run.probes[2].hits, 2); // a === 1 in "adds" and in "fails on purpose"
  // Line 7 col 1 and col 3 resolve to the same `return`: both count, captures stay with p1.
  assert.equal(run.probes[3].hits, 1501); assert.equal(run.probes[3].captures.length, 0);
});

test("debugger_node_test runs files in parallel, each on its own inspector port", async () => {
  const started = Date.now();
  const r = await nodeTest({ files: [`${FX}/sample.fixture.mjs`, `${FX}/sample.fixture.mjs`, `${FX}/spawner.fixture.mjs`], probes: [{ file: `${FX}/lib.fixture.cjs`, line: 4 }], concurrency: 3 });
  assert.equal(r.files, 3);
  assert.deepEqual(r.runs.map(x => x.probes[0].hits), [1, 1, 0]);
  assert.equal(r.runs[2].exitCode, 0);
  assert.ok(Date.now() - started < 20000);
});

test("children:true auto-attaches a spawned Node process; runner:test debugs the real node --test child", async () => {
  const kids = (await nodeTest({ file: `${FX}/spawner.fixture.mjs`, children: true, probes: [{ file: `${FX}/lib.fixture.cjs`, line: 4, expression: "x" }] })).runs[0];
  assert.equal(kids.exitCode, 0); assert.equal(kids.processes.length, 1);
  assert.equal(kids.probes[0].hits, 1); assert.deepEqual(kids.probes[0].values, [5]);
  const viaTest = (await nodeTest({ file: `${FX}/sample.fixture.mjs`, runner: "test", probes: [{ line: 7, expression: "sum" }] })).runs[0];
  assert.equal(viaTest.runner, "test"); assert.equal(viaTest.probes[0].hits, 1501); assert.equal(viaTest.summary.fail, 1);
});

test("a hanging test is killed at timeoutMs and reported, not left running", async () => {
  const run = (await nodeTest({ file: `${FX}/hang.fixture.mjs`, timeoutMs: 2500 })).runs[0];
  assert.equal(run.timedOut, true); assert.equal(run.signal, "SIGKILL"); assert.match(run.note, /Killed after timeoutMs 2500/);
});

test("node_test refuses files outside the repository and malformed probes before spawning", async () => {
  assert.throws(() => repoFile("/etc/passwd"), /outside the repository/);
  assert.throws(() => repoFile("../x.test.mjs"), /outside the repository/);
  const s = new DebugSession();
  for (const args of [{ file: "/etc/hosts" }, { file: `${FX}/sample.fixture.mjs`, probes: [{ line: 7, surprise: 1 }] },
    { file: `${FX}/sample.fixture.mjs`, probes: [{ expression: "x" }] }, { files: new Array(9).fill(`${FX}/sample.fixture.mjs`) }]) {
    const r = await callTool(s, "debugger_node_test", args);
    assert.equal(r.isError, true, JSON.stringify(args));
  }
  assert.match(probeCondition("p1", { expression: "x", pauses: 2 }), /return n<=2/);
});

test("attach a live Node target: Break on start, debugger_break returns locals, debugger_collect counts, detach lets it exit", async () => {
  const { p, endpoint } = await inspectBrk(`${FX}/live.fixture.cjs`);
  const s = new DebugSession();
  try {
    const [{ id }] = (await s.listTargets(endpoint)).targets;
    const st = await s.attach(endpoint, id);
    assert.match(st.note, /Break on start/);
    assert.ok(await s.waitForPause(3000)); assert.equal(s.pause.cause, "start");
    await s.control("resume", s.pause.token, 0);
    await new Promise(r => setTimeout(r, 200));
    const hit = await callTool(s, "debugger_break", { breakpoints: [{ url: `${FX}/live.fixture.cjs`, line: 4 }], trigger: "mul(6, 7)", frames: 1 });
    const b = hit.structuredContent;
    assert.equal(b.paused, true, JSON.stringify(b)); assert.equal(b.cause, "breakpoint");
    assert.deepEqual([b.locals[0].vars.a, b.locals[0].vars.b, b.locals[0].vars.product], [6, 7, 42]);
    assert.match(b.stack[0], /^mul .*live\.fixture\.cjs:4:/);
    const ev = await callTool(s, "debugger_evaluate", { pauseToken: b.token, expression: "product + 1" });
    assert.equal(ev.structuredContent.result.value, 43);
    await s.control("resume", b.token, 0);
    for (const bp of [...s.breakpoints.values()]) await s.removeBreakpoint(bp.id);
    const c = (await callTool(s, "debugger_collect", { logpoints: [{ url: `${FX}/live.fixture.cjs`, line: 4, expression: "product" }],
      trigger: "[1,2,3].map(n => mul(n, 10)).length" })).structuredContent;
    assert.equal(c.logpoints[0].hits, 3, JSON.stringify(c)); assert.deepEqual(c.logpoints[0].values, [10, 20, 30]);
    assert.equal(c.removed.length, 1); assert.equal(s.breakpoints.size, 0);
  } finally {
    await s.detach();
    p.kill("SIGKILL");
  }
});

class FakeCdp extends EventEmitter {
  calls = []; closed = false;
  async send(method, params) {
    this.calls.push({ method, params });
    if (method === "Debugger.setBreakpointByUrl") return { breakpointId: "mine", locations: [] };
    if (method === "Debugger.stepOver") setTimeout(() => this.emit("Debugger.paused", { reason: "other", callFrames: [] }), 30);
    return {};
  }
  close() { this.closed = true; this.emit("disconnect", Error("x")); }
}
test("pause cause says when a pause is not ours; a step waits for and returns the new token", async () => {
  const c = new FakeCdp();
  const s = new DebugSession({ discover: async () => [{ type: "page", id: "t", url: "about:blank", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/t" }], open: async () => c });
  await s.attach("http://127.0.0.1:9222", "t");
  await s.setBreakpoint("about:blank", 1);
  c.emit("Debugger.paused", { reason: "other", hitBreakpoints: ["theirs"], callFrames: [] });
  assert.match(s.pause.cause, /^unowned: .*ANOTHER debugger client/);
  c.emit("Debugger.paused", { reason: "other", hitBreakpoints: ["mine"], callFrames: [] });
  assert.equal(s.pause.cause, "breakpoint");
  const before = s.pause.token;
  const st = await s.control("over", before);
  assert.equal(st.paused, true); assert.notEqual(st.pause.token, before); assert.equal(st.pause.cause, "step");
  assert.equal(TOOLS.filter(t => ["debugger_break", "debugger_collect", "debugger_node_test"].includes(t.name)).length, 3);
});
