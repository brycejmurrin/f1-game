/* rival-attach-init.test.mjs — GameAudio.init() binds the rival pass-by pool.
 *
 * PR #1735 built RivalAudio.attach(ctx, dest); nothing called it in a live
 * race, so the four-voice whoosh sat silent. This file is the init-site
 * contract: attach is called exactly once on first init, the pool lands on
 * the GameAudio SFX bus, recovery rebuilds without duplicating voices, and
 * the title stub (no attach) stays a no-op.
 *
 * Run: node --test tests/unit/rival-attach-init.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const fakeAudio = require("./fake-audio-vm.cjs");

const ENGINE_SRC = ["js/audio/tone-model.js", "js/audio/signal.js", "js/audio/soundtrack.js",
  "js/audio/radio-fx.js", "js/audio/engine.js"].map((file) =>
  fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n").replace(/^const\b/gm, "var");
const RIVALS_SRC = fs.readFileSync(path.join(ROOT, "js/audio/rivals.js"), "utf8");
const MAT4 = fs.readFileSync(path.join(ROOT, "js/core/mat4.js"), "utf8").replace(/^const\b/gm, "var");
const CONSTS = fs.readFileSync(path.join(ROOT, "js/physics/consts.js"), "utf8");

function wrapConnect(node) {
  if (!node || node._apexConn) return node;
  node._apexConn = true;
  node.connectedTo = [];
  const orig = node.connect;
  node.connect = function (t) {
    node.connectedTo.push(t);
    return orig.call(this, t);
  };
  return node;
}

function boot(opts = {}) {
  const attachCalls = [];
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, Promise,
    Date: opts.Date || Date, Error, parseFloat, parseInt, isFinite, Float32Array,
    Log: { info() {}, warn() {}, debug() {}, error() {} },
    document: { addEventListener() {}, hidden: false },
    addEventListener() {}, removeEventListener() {},
    setTimeout: (fn, ms) => { if (typeof fn === "function") return setTimeout(fn, ms || 0); return 0; },
    clearTimeout: (id) => { if (id) clearTimeout(id); },
    navigator: opts.userActivation ? { userActivation: opts.userActivation } : {},
    fetch: () => Promise.reject(new Error("no fetch")),
  };
  sb.window = sb;
  if (opts.stubRival) {
    sb.RivalAudio = { create: () => ({ collect: () => [] }), sprayAhead: () => 0 };
  }
  fakeAudio.install(sb);
  const Orig = sb.AudioContext;
  sb.AudioContext = function RecordingAC() {
    const ctx = new Orig();
    wrapConnect(ctx.destination);
    for (const name of ["createGain", "createBiquadFilter", "createOscillator",
      "createBufferSource", "createStereoPanner", "createDynamicsCompressor",
      "createWaveShaper", "createConvolver", "createAnalyser"]) {
      if (typeof ctx[name] !== "function") continue;
      const orig = ctx[name].bind(ctx);
      ctx[name] = function () {
        return wrapConnect(orig());
      };
    }
    return ctx;
  };
  const v = vm.createContext(sb);
  vm.runInContext(MAT4, v);
  if (!opts.stubRival) {
    vm.runInContext(CONSTS, v);
    vm.runInContext(RIVALS_SRC, v, { filename: "rivals.js" });
  }
  if (opts.spyAttach && !opts.stubRival) {
    const RA = vm.runInContext("RivalAudio", v);
    const orig = RA.attach.bind(RA);
    RA.attach = function (ctx, dest) {
      attachCalls.push({ ctx, dest });
      return orig(ctx, dest);
    };
  }
  vm.runInContext(ENGINE_SRC, v, { filename: "engine.js" });
  return {
    A: vm.runInContext("GameAudio", v),
    RivalAudio: () => vm.runInContext("typeof RivalAudio !== 'undefined' ? RivalAudio : null", v),
    attachCalls,
    sandbox: sb,
    vm: v,
    loadRivals() {
      vm.runInContext(CONSTS, v);
      vm.runInContext(RIVALS_SRC, v, { filename: "rivals.js" });
      return vm.runInContext("RivalAudio", v);
    },
  };
}

const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };

test("GameAudio.init calls RivalAudio.attach exactly once with the SFX bus", () => {
  const { A, RivalAudio, attachCalls } = boot({ spyAttach: true });
  assert.equal(typeof RivalAudio().attach, "function");
  A.init();
  assert.equal(attachCalls.length, 1, "first init binds the pool once");
  const dest = attachCalls[0].dest;
  assert.ok(dest, "attach receives a dest (the SFX/mix bus, not a missing argument)");
  assert.notEqual(dest, attachCalls[0].ctx.destination, "dest is the SFX bus, not the raw destination");
  A.init();
  assert.equal(attachCalls.length, 1, "a second init on the same context does not re-attach");
  assert.equal(RivalAudio().passByVoices().length, 4, "the pool is the fixed four voices");
});

test("the pass-by pool output connects to the GameAudio SFX bus", () => {
  const { A, RivalAudio, attachCalls } = boot({ spyAttach: true });
  A.init();
  assert.equal(attachCalls.length, 1);
  const dest = attachCalls[0].dest;
  const voices = RivalAudio().passByVoices();
  assert.equal(voices.length, 4);
  for (const v of voices) {
    assert.ok(v.pan.connectedTo.includes(dest), "each stereo panner lands on the SFX bus");
  }
});

test("context recovery replaces the pool and does not duplicate voices", async () => {
  let now = 10000;
  class ClockDate extends Date { static now() { return now; } }
  const { A, RivalAudio, attachCalls } = boot({ spyAttach: true, Date: ClockDate });
  A.init();
  await flush();
  const first = RivalAudio().passByVoices();
  assert.equal(first.length, 4);
  const firstSrc = first.map((v) => v.src);
  const oldCtx = attachCalls[0].ctx;
  oldCtx.state = "interrupted";
  A.init();
  now += 1000;
  A.init();
  await flush();
  const after = RivalAudio().passByVoices();
  assert.equal(after.length, 4, "recovery keeps a four-voice pool");
  assert.equal(attachCalls.length, 2, "the new context gets one attach (old ctx + new ctx)");
  assert.notEqual(attachCalls[1].ctx, oldCtx, "the second attach is the rebuilt context");
  for (const v of after) {
    assert.ok(!firstSrc.includes(v.src), "recovery does not keep the dead-context sources");
    assert.ok(v.pan.connectedTo.includes(attachCalls[1].dest), "new voices land on the new SFX bus");
  }
});

test("the audio stub fallback does not throw when attach is missing", () => {
  const { A, RivalAudio } = boot({ stubRival: true });
  assert.equal(typeof RivalAudio().attach, "undefined");
  assert.doesNotThrow(() => A.init());
  assert.equal(typeof RivalAudio().attach, "undefined", "init does not invent attach on the stub");
});

test("lazy first-bind: init before rivals.js still attaches once the module lands", () => {
  const { A, sandbox, loadRivals } = boot({ stubRival: true });
  A.init();
  assert.ok(sandbox.RivalAudio._pendingAttach, "stub holds the dest until rivals.js evaluates");
  assert.equal(sandbox.RivalAudio._pendingAttach.dest.kind, "gain");
  const RA = loadRivals();
  assert.equal(typeof RA.attach, "function");
  assert.equal(RA.passByVoices().length, 4, "pending dest is consumed on load — no second init required");
  const dest = sandbox.RivalAudio._pendingAttach
    ? sandbox.RivalAudio._pendingAttach.dest
    : null;
  // The stub object is replaced; the consumed dest is the one the panners used.
  const voices = RA.passByVoices();
  const landed = voices.filter((v) => v.pan.connectedTo && v.pan.connectedTo.length);
  assert.equal(landed.length, 4, "lazy bind connects every voice");
  void dest;
});

// #2187: the pool runs for the life of the context and only collect() — the
// race step — aimed its gains, so stopEngine() (pause, finish, quit, scrub
// exit) left a nearby rival's whoosh hissing at its last gain under the pause
// menu, results and title. stopEngine must silence it like ErsLayer.
test("stopEngine silences every pass-by voice (#2187)", () => {
  const { A, RivalAudio } = boot();
  A.init();
  A.setEnabled(true);
  A.startEngine();
  const me = { s: 500, x: 0, speed: 50, rpm: 5000, retired: false };
  const rival = { s: 504, x: 0, speed: 50, rpm: 5000, retired: false };
  const R = RivalAudio().create({ track: { total: 1000 }, cars: [me, rival] });
  R.collect(me);
  assert.ok(R.passByState().some((v) => v.gain > 0), "a rival 4 m ahead opens a voice");
  A.stopEngine();
  assert.deepEqual([...R.passByState().map((v) => v.gain)], [0, 0, 0, 0], "every voice ramps to 0");
});

test("RivalAudio.silence(t) zeroes the pool; the title stub has it too (#2187)", () => {
  const { A, RivalAudio } = boot();
  A.init();
  const RA = RivalAudio();
  const me = { s: 500, x: 0, speed: 50, rpm: 5000, retired: false };
  const R = RA.create({ track: { total: 1000 }, cars: [me, { ...me, s: 504 }] });
  R.collect(me);
  assert.equal(typeof RA.silence, "function");
  assert.equal(typeof R.silence, "function", "the instance exposes it as well");
  RA.silence(0);
  assert.deepEqual([...R.passByState().map((v) => v.gain)], [0, 0, 0, 0]);
  const stub = fs.readFileSync(path.join(ROOT, "js/audio/stub.js"), "utf8");
  const sc = vm.createContext({});
  vm.runInContext(stub, sc);
  assert.doesNotThrow(() => vm.runInContext("RivalAudio.create({}).silence(); RivalAudio.silence()", sc));
});


test("Rivals switch and zero level mute both engine and pass-by without another frame", () => {
  const { A, RivalAudio } = boot();
  A.init(); A.setEnabled(true); A.startEngine();
  const me = { s: 500, speed: 50, x: 0 };
  const R = RivalAudio().create({ track: { total: 1000 }, cars: [me, { s: 504, speed: 80, rpm: 12000 }] });
  const feed = () => A.setRivals(R.collect(me));
  feed();
  assert.ok(R.passByState().some(v => v.gain > 0));
  assert.ok(A.rivalState().some(v => v.gain > 0));
  A.setLayer("rivals", false);
  assert.ok(R.passByState().every(v => v.gain === 0), "toggle immediately fades pass-by");
  feed();
  assert.ok(R.passByState().every(v => v.gain === 0), "collect cannot reopen muted hiss");
  assert.ok(A.rivalState().every(v => v.gain === 0));
  A.setLayer("rivals", true); feed();
  assert.ok(R.passByState().some(v => v.gain > 0));
  A.setTune({ rivals: 0 });
  assert.ok(R.passByState().every(v => v.gain === 0), "zero trim immediately fades pass-by");
  feed();
  assert.ok(A.rivalState().every(v => v.gain === 0));
  A.setTune({ rivals: 1 }); feed();
  assert.ok(R.passByState().some(v => v.gain > 0), "restoring trim restores sound");
});

test("Rivals mute survives lazy first binding", () => {
  const b = boot({ stubRival: true });
  b.A.init(); b.A.setLayer("rivals", false);
  const RA = b.loadRivals();
  const me = { s: 500, speed: 50 };
  const R = RA.create({ track: { total: 1000 }, cars: [me, { s: 504, speed: 80 }] });
  R.collect(me);
  assert.ok(R.passByState().every(v => v.gain === 0));
});
