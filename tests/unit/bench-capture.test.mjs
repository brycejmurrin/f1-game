// BenchCapture (js/perf/bench-capture.js): the profiling record BENCHMARK writes per leg and per step. A real capture
// needs a phone; what a VM can pin is the caps, the sampling, the size budget, and that a page with none of the
// optional APIs records "unsupported" instead of throwing. Plus bench-run's schema bump keeps /1 readers working.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/perf/bench-capture.js"), "utf8");
const RUN = readFileSync(join(ROOT, "js/perf/bench-run.js"), "utf8");
const J = (x) => JSON.parse(JSON.stringify(x));
function load(extra) {
  const store = new Map();
  const ctx = Object.assign({
    performance: { now: () => 1000 },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    setInterval: () => 1, clearInterval: () => {},
  }, extra);
  const B = vm.runInNewContext(SRC + "\n;BenchCapture", ctx, { filename: absSrc("js/perf/bench-capture.js") });
  return { B, store, ctx };
}

test("bench-capture: logs keep every warn/error, sample info after the first CAP.info, cap the total and strip URL queries", () => {
  const { B } = load();
  const recs = [];
  for (let i = 0; i < 200; i++) recs.push({ id: i, t: i, ns: "gfx", level: i % 50 === 0 ? "warn" : "info", msg: "m" + i + " https://x.io/a.js?token=secret#h" });
  recs.push({ id: 999, t: 999, ns: "game", level: "debug", msg: "dropped" });
  const out = J(B.sampleLogs(recs));
  assert.ok(out.length <= B.CAP.logs);
  assert.ok(out.every((r) => r.level !== "debug"));
  assert.ok(out.every((r) => !/token|secret/.test(r.msg) && r.msg.includes("https://x.io/a.js")));
  const all = J(B.sampleLogs(recs.slice(0, 60)));
  assert.equal(all.filter((r) => r.level === "warn").length, 2);
  assert.equal(all.filter((r) => r.level === "info").length, B.CAP.info + 7);   // 58 info: 20 kept, then every 5th of 21..58 (25..55)
  assert.ok(J(B.sampleLogs([{ level: "error", msg: "x".repeat(5000) }]))[0].msg.length <= B.CAP.msg);
});

test("bench-capture: rAF gap buckets and per-render-call GPU times from three's timestamp uids", () => {
  const { B } = load();
  assert.deepEqual(J(B.gapStats([16, 17, 40, 60, 120, 300, 1500])), { frames: 7, max: 1500, over33: 5, over50: 4, over100: 3, over250: 2, over1000: 1 });
  const ts = new Map([["r:0:5:f10", 1.5], ["r:1:6:f10", 3.25], ["c:0:7:f10", 0.5], ["r:0:5:f11", 2], ["r:1:6:f11", 4], ["junk", 9]]);
  const p = J(B.passTimes(ts));
  assert.equal(p.frame, 11);
  assert.equal(p.calls, 2);
  assert.equal(p.totalMs, 6);
  assert.deepEqual(p.top.map((r) => r.call), ["r1", "r0"]);
  assert.equal(B.passTimes(new Map()), null);
  assert.equal(B.passTimes(null), null);
});

test("bench-capture: compile stats split by window and kind", () => {
  const { B } = load();
  const list = [{ t: 10, kind: "pipeAsync", ms: 40 }, { t: 20, kind: "shader", ms: 2 }, { t: 900, kind: "pipeAsync", ms: 10 }];
  const entry = J(B.compileStats(list, 0, 500)), after = J(B.compileStats(list, 500, Infinity));
  assert.deepEqual([entry.n, entry.ms, entry.max], [2, 42, 40]);
  assert.deepEqual(entry.byKind.pipeAsync, { n: 1, ms: 40 });
  assert.deepEqual([after.n, after.ms], [1, 10]);
});

test("bench-capture: a page with none of the optional APIs captures a leg without throwing and says unsupported", () => {
  const { B } = load();
  assert.equal(B.active(), false);
  assert.equal(B.step(), null);
  assert.equal(B.legEnd(), null);
  assert.equal(B.legStart({ label: "Monza dry" }, { state: "menu" }), true);
  assert.equal(B.active(), true);
  const st = J(B.step());
  assert.equal(st.heap, "unsupported");
  assert.equal(st.gpuPasses, null);
  const c = J(B.legEnd());
  assert.equal(B.active(), false);
  assert.equal(c.v, B.VERSION);
  assert.equal(c.start.heapMB, "unsupported");
  assert.equal(c.longTasks, "unsupported");
  assert.equal(c.loaf, "unsupported");
  assert.equal(c.gpu.timer, "unsupported");
  assert.equal(c.gpu.passes, "unsupported");
  assert.equal(c.entry, "unsupported");
  assert.equal(c.device.thermal, "unavailable");
  assert.equal(c.device.battery, "unsupported");
  assert.ok(String(c.uaMemory).startsWith("unsupported"));
  assert.ok(JSON.stringify(c).length < 8000);
});

test("bench-capture: performance.memory, Log and the device-loss breadcrumb", () => {
  const recs = [{ id: 1, t: 5, ns: "gfx", level: "warn", msg: "before" }];
  const Log = { records: (f) => recs.filter((r) => !f || !f.since || r.id > f.since) };
  const { B, store } = load({ performance: { now: () => 1000, memory: { usedJSHeapSize: 50 * 1048576, totalJSHeapSize: 60 * 1048576, jsHeapSizeLimit: 4096 * 1048576 } }, Log });
  B.legStart({ label: "Spa rain" }, null);
  recs.push({ id: 2, t: 6, ns: "gfx", level: "error", msg: "TLX GPU error #1" });
  const st = J(B.step());
  assert.equal(st.heap, 50);
  const c = J(B.legEnd());
  assert.deepEqual(c.logs.map((r) => r.msg), ["TLX GPU error #1"]);   // the line before legStart is not this leg's
  assert.equal(c.end.heapLimitMB, 4096);
  store.set(B.CRUMB, JSON.stringify({ v: B.VERSION, label: "Spa rain", logs: [] }));
  assert.equal(J(B.recover()).label, "Spa rain");
  assert.equal(store.has(B.CRUMB), false);
  assert.equal(B.recover(), null);
});

test("bench-capture: budget() trims logs, then timelines, then step captures, until the plan fits", () => {
  const { B } = load();
  const big = (n) => Array.from({ length: n }, (_, i) => ({ t: i, ns: "gfx", level: i % 3 ? "info" : "warn", msg: "x".repeat(150) }));
  const leg = () => ({ capture: { logs: big(60), timeline: big(120), end: { heapMB: 1 } }, steps: [{ p50: 17, cap: { logs: big(30) } }] });
  const plan = { legs: [leg(), leg(), leg()] };
  const before = JSON.stringify(plan).length;
  const small = J(B.budget(plan, 10 * 1e6));
  assert.deepEqual(small.trimmed, []);
  assert.equal(small.bytes, before);
  const r = J(B.budget(plan, 30000));
  assert.ok(r.bytes <= 30000, "fits: " + r.bytes);
  assert.ok(r.trimmed.length >= 1 && r.trimmed[0] === "logs");
  assert.ok(JSON.stringify(plan).length <= 30000);
  assert.equal(plan.legs[0].steps[0].p50, 17);   // frame stats are never trimmed
});

test("bench-run: schema /2 with the capture hooks; /1 plans still resume and summarize/scenes read /2 legs unchanged", () => {
  const R = vm.runInNewContext(RUN + "\n;BenchRun", { performance: { now: () => 0 } }, { filename: absSrc("js/perf/bench-run.js") });
  assert.equal(R.SCHEMA, "apex26.bench/2");
  assert.deepEqual(J(R.SCHEMAS), ["apex26.bench/1", "apex26.bench/2"]);   // resume() reads both
  const st = (id) => ({ id, p50: 17, p95: 18, p99: 21, fps: 60, links: 0, pipes: 0 });
  const v1 = { kind: "garage", label: "Garage", state: "done", entry: { cold: { goMs: 247 } }, steps: [st("idle")] };
  const v2 = Object.assign({}, v1, { capture: { v: 1 }, steps: [Object.assign(st("idle"), { cap: { heap: "unsupported" } })] });
  assert.deepEqual(J(R.scenes([v2])), J(R.scenes([v1])));
  assert.deepEqual(J(R.summarize([v2])), J(R.summarize([v1])));
});
