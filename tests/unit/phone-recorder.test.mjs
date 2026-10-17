/* phone-recorder.test.mjs — PhoneRecorder sampler, serializer and SHARE/COPY, in a VM.
 *
 * Contract: nothing runs until start(); facts are captured once; samples land on
 * the 2 min timer and every 2048 frames; the file is valid JSON with a schema
 * tag; a long soak is capped; SHARE prefers navigator.share({files}) and falls
 * back to a download link; COPY falls back to a textarea; the live readers
 * never throw without the game and never touch the GPU timer.
 *
 * Run: node --test tests/unit/phone-recorder.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/perf/phone-recorder.js"), "utf8");

function load(extra) {
  const sandbox = Object.assign({ Math, JSON, Object, Array, String, Number, Date, Promise, Blob, File, Map, isFinite, setTimeout }, extra || {});
  sandbox.globalThis = sandbox;
  return vm.runInNewContext(SRC + "\n;PhoneRecorder", sandbox);
}

function fakeEnv() {
  const e = { t: 1000, facts: 0, samples: 0, saved: [] };
  e.env = {
    now: () => e.t, wall: () => Date.UTC(2026, 9, 17, 10, 30, 0) + e.t,
    facts: () => { e.facts++; return { ua: "test", dpr: 3 }; },
    sample: () => { e.samples++; return { frame: { p50: 16.7, p95: 20, p99: 30 }, renderScale: 1, tier: 0 }; },
    save: (txt) => e.saved.push(txt), load: () => e.saved[e.saved.length - 1] || null,
  };
  return e;
}

test("nothing runs until start()", () => {
  const PR = load();
  const f = fakeEnv();
  const r = PR.create(f.env);
  r.frame(1000); r.frame(1016);
  assert.equal(r.isOn(), false);
  assert.equal(f.facts + f.samples, 0);
  assert.equal(r.serialize(), "");
});

test("start captures facts once, then samples on 2048 frames and on the 2 min timer", () => {
  const PR = load();
  const f = fakeEnv();
  const r = PR.create(f.env);
  assert.equal(r.start(), true);
  assert.equal(r.start(), false);
  assert.equal(f.facts, 1);
  let t = f.t;
  for (let i = 0; i < PR.WINDOW_FRAMES; i++) { t += 16.7; f.t = t; r.frame(t); }
  const rec = r.record();
  assert.deepEqual(JSON.parse(JSON.stringify(rec.samples.map((s) => s.trigger))), ["start", "window"]);
  assert.equal(rec.cadence.frames, PR.CADENCE_FRAMES);
  assert.ok(rec.cadence.hz > 59 && rec.cadence.hz < 60.5, "60 Hz cadence: " + rec.cadence.hz);
  f.t += PR.SAMPLE_MS; r.frame(f.t);
  assert.equal(rec.samples[rec.samples.length - 1].trigger, "timer");
  assert.equal(f.facts, 1, "facts are captured once per recording");
  r.stop();
  assert.equal(rec.samples[rec.samples.length - 1].trigger, "stop");
  assert.ok(rec.endedAt && rec.durationMin > 1.9);
});

test("a 30 Hz page (Low Power Mode) reads as 30 Hz", () => {
  const PR = load();
  const f = fakeEnv();
  const r = PR.create(f.env);
  r.start();
  let t = f.t;
  for (let i = 0; i < 130; i++) { t += 33.3; r.frame(t); }
  assert.ok(r.record().cadence.hz > 29 && r.record().cadence.hz < 31);
});

test("serialize is valid JSON, mirrored to storage after each sample, and re-adoptable", () => {
  const PR = load();
  const f = fakeEnv();
  const r = PR.create(f.env);
  r.start(); f.t += 60000; r.stop();
  const o = JSON.parse(r.serialize());
  assert.equal(o.schema, PR.SCHEMA);
  assert.equal(o.facts.dpr, 3);
  assert.equal(o.samples.length, 2);
  assert.equal(o.samples[1].min, 1);
  assert.equal(f.saved.length, 3, "a mirror write per sample, plus the final ended-at write");
  assert.ok(JSON.parse(f.saved[2]).endedAt);
  const r2 = PR.create(f.env);
  assert.equal(r2.adopt(f.saved[f.saved.length - 1]), true);
  assert.equal(r2.count(), 2);
  assert.equal(r2.adopt("{not json"), false);
});

test("a long soak is capped, not unbounded", () => {
  const PR = load();
  const f = fakeEnv();
  const r = PR.create(f.env);
  r.start();
  for (let i = 0; i < PR.MAX_SAMPLES + 20; i++) r.sample("timer");
  assert.equal(r.record().samples.length, PR.MAX_SAMPLES);
  assert.equal(r.record().truncated, true);
});

test("numericLeaves keeps numbers and booleans, flattens one level, drops strings", () => {
  const PR = load();
  const o = PR.numericLeaves({ a: 1.234, b: "x", c: true, d: { e: 2, f: "y", g: { h: 3 } }, i: NaN });
  assert.deepEqual(JSON.parse(JSON.stringify(o)), { a: 1.23, c: true, "d.e": 2 });
});

test("live readers never throw without the game and never touch the GPU timer", () => {
  const PR = load();
  const env = PR.liveEnv();
  const s = env.sample();
  assert.equal(s.frame.frames, 0);
  assert.equal(s.renderScale, null);
  assert.doesNotThrow(() => env.facts());
  let touched = false;
  const PR2 = load({ __apex: { gpuTimer() { touched = true; throw new Error("no"); }, info: () => ({ track: "monza" }), weather: () => "wet" } });
  const s2 = PR2.liveEnv().sample();
  assert.equal(touched, false);
  assert.equal(s2.circuit, "monza");
  assert.equal(s2.weather, "wet");
});

test("live sample reads PerfGov and GLX but writes neither", () => {
  const calls = [];
  const PerfGov = {
    frameStats: () => ({ frames: 2048, p50: 16.6, p95: 22.1, p99: 33.4, maxMs: 80, droppedSimS: 0 }),
    fpsEMA: () => 16.7, floorMs: () => 16.7, tier: () => 2, userTier: () => 1, autoShed: () => 1,
    autoRes: () => true, scaleFutile: () => false, tierFutile: () => false,
    setAutoRes() { calls.push("set"); }, setUserTier() { calls.push("set"); },
  };
  const GLX = { getRenderScale: () => 0.8, __tlx: { memState: () => ({ mats: 40, progs: 12, mirror: { sweeps: 3 }, name: "x" }) } };
  const s = load({ PerfGov, GLX, GfxQuality: { current: () => "medium" } }).liveEnv().sample();
  assert.equal(s.frame.p99, 33.4);
  assert.equal(s.renderScale, 0.8);
  assert.equal(s.tier, 2);
  assert.equal(s.preset, "medium");
  assert.deepEqual(JSON.parse(JSON.stringify(s.mem)), { mats: 40, progs: 12, "mirror.sweeps": 3 });
  assert.deepEqual(calls, []);
});

test("share: files via navigator.share, download fallback, cancel is not an error", async () => {
  const PR = load();
  let got = null;
  const ok = await PR.share("{}", "a.json", { nav: { canShare: () => true, share: async (d) => { got = d; } } });
  assert.equal(ok.how, "share");
  assert.equal(got.files[0].name, "a.json");
  assert.equal(got.files[0].type, "application/json");
  const abort = await PR.share("{}", "a.json", { nav: { share: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; } } });
  assert.equal(abort.how, "cancelled");
  const anchors = [];
  const doc = { createElement: () => { const a = { style: {}, click() { anchors.push(a); }, remove() {} }; return a; }, body: { appendChild() {} } };
  const URLc = { createObjectURL: () => "blob:x" };
  const dl = await PR.share("{}", "a.json", { nav: { canShare: () => false, share: async () => {} }, doc, URL: URLc });
  assert.equal(dl.how, "download");
  assert.equal(dl.url, "blob:x");
  assert.equal(anchors[0].download, "a.json");
  const none = await PR.share("{}", "a.json", { nav: {}, doc: null, URL: null });
  assert.equal(none.how, "none");
});

test("copy: clipboard first, textarea + execCommand second", async () => {
  const PR = load();
  let wrote = "";
  assert.equal(await PR.copy("abc", { nav: { clipboard: { writeText: async (t) => { wrote = t; } } } }), true);
  assert.equal(wrote, "abc");
  let cmd = "";
  const doc = {
    createElement: () => ({ style: {}, setAttribute() {}, select() {}, remove() {} }),
    body: { appendChild() {} }, execCommand: (c) => { cmd = c; return true; },
  };
  assert.equal(await PR.copy("abc", { nav: { clipboard: { writeText: async () => { throw new Error("denied"); } } }, doc }), true);
  assert.equal(cmd, "copy");
  assert.equal(await PR.copy("abc", { nav: {}, doc: null }), false);
});

test("file name carries the start stamp; how-to is six lines", () => {
  const PR = load();
  assert.equal(PR.fileName({ startedAt: "2026-10-17T10:30:00.000Z" }), "apex26-soak-20261017-103000.json");
  assert.equal(PR.HOWTO.length, 6);
});
