/* crowd-ctx-rebuild.test.mjs — #3289: crowd bed leaves a closed AudioContext.
 *
 * rebuildCtx() restarts via startEngineGraph() (not the wrapped startEngine),
 * so the bed must re-attach onto the new context. update() must not treat a
 * bedGain from a closed context as attached.
 *
 * Run: node --test tests/unit/crowd-ctx-rebuild.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CROWD = fs.readFileSync(path.join(ROOT, "js/audio/crowd.js"), "utf8");
const SIGNAL = fs.readFileSync(path.join(ROOT, "js/audio/signal.js"), "utf8");
const ENGINE = fs.readFileSync(path.join(ROOT, "js/audio/engine.js"), "utf8");

function param(v) {
  const p = {
    value: v, targets: [],
    setTargetAtTime(x) { p.value = x; p.targets.push(x); p._apexCrowdTgt = x; },
    setValueAtTime(x) { p.value = x; },
    linearRampToValueAtTime(x) { p.value = x; },
    exponentialRampToValueAtTime(x) { p.value = x; },
    cancelScheduledValues() {},
    cancelAndHoldAtTime() {},
  };
  return p;
}

function fakeContext(label) {
  const nodes = [];
  function node(kind) {
    const n = {
      kind, label, context: null,
      connect(t) { return t; }, disconnect() { n.disc = (n.disc || 0) + 1; },
      start() {}, stop() {},
      type: "", loop: false, buffer: null,
      gain: param(0), frequency: param(900), Q: param(1),
      playbackRate: param(1),
    };
    nodes.push(n);
    return n;
  }
  const ctx = {
    label, currentTime: 0, state: "running", sampleRate: 44100,
    destination: null,
    createGain() { const n = node("gain"); n.context = ctx; return n; },
    createBiquadFilter() { const n = node("biquad"); n.context = ctx; return n; },
    createBufferSource() { const n = node("src"); n.context = ctx; return n; },
    createBuffer(ch, len, sr) {
      return {
        sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch,
        getChannelData: () => new Float32Array(len),
      };
    },
    close() { ctx.state = "closed"; return Promise.resolve(); },
  };
  ctx.destination = node("dest");
  ctx.destination.context = ctx;
  return { ctx, nodes };
}

function bootCrowd() {
  let liveCtx = null, liveBus = null;
  const a = fakeContext("A");
  liveCtx = a.ctx;
  liveBus = a.ctx.createGain();
  const results = { hidden: true };
  const G = {
    state: "race", paused: false, photoMode: false,
    track: { total: 5000, props: [] },
    player: { s: 50, pos: 5, finished: false },
  };
  const GameAudio = {
    _stub: false, enabled: () => true,
    context: () => liveCtx, sfxBus: () => liveBus,
    setEngine() {}, stopEngine() {}, setGridIdle() {},
    setSfxEnabled() {}, finish() {}, startEngine() {},
  };
  const sb = {
    Math, console, Object, Array, Number, String, isFinite, Float32Array, GameAudio,
    document: { getElementById: (id) => (id === "results" ? results : null) },
  };
  sb.window = sb;
  const vctx = vm.createContext(sb);
  vm.runInContext(SIGNAL, vctx, { filename: absSrc("js/audio/signal.js") });
  vm.runInContext(CROWD, vctx, { filename: absSrc("js/audio/crowd.js") });
  const CrowdAudio = vm.runInContext("CrowdAudio", vctx);
  const host = {
    context: () => liveCtx,
    bus: () => liveBus,
    sfxOk: () => true,
    now: () => liveCtx.currentTime,
  };
  CrowdAudio.bindHost(host);
  CrowdAudio.bind(G);
  assert.equal(CrowdAudio.attach(), true);
  return {
    CrowdAudio, GameAudio, G, a,
    swapTo(b) {
      a.ctx.state = "closed";
      liveCtx = b.ctx;
      liveBus = b.ctx.createGain();
    },
    setLive(ctx, bus) { liveCtx = ctx; liveBus = bus; },
  };
}

test("update() reattaches the bed onto a new AudioContext after a closed-ctx rebuild", () => {
  const { CrowdAudio, a, swapTo } = bootCrowd();
  const bedA = CrowdAudio.inspect().bedGain;
  assert.ok(bedA, "bed attached on context A");
  assert.equal(bedA.context, a.ctx);
  assert.equal(CrowdAudio.inspect().ctx, a.ctx);

  const b = fakeContext("B");
  swapTo(b);
  // No setEngine / startEngine wrapper — only update(), the race hot path.
  CrowdAudio.update();

  const info = CrowdAudio.inspect();
  assert.equal(info.attached, true);
  assert.equal(info.ctx, b.ctx, "bed graph is owned by the rebuilt context");
  assert.ok(info.bedGain, "bedGain present after rebuild");
  assert.equal(info.bedGain.context, b.ctx, "bedGain.context is the new AudioContext");
  assert.notEqual(info.bedGain, bedA, "old closed-context bedGain was dropped");
  assert.ok((bedA.disc || 0) > 0, "old bedGain was disconnected");
});

test("ensureAttached / update refuse a bedGain whose context is already closed", () => {
  const { CrowdAudio, a, setLive } = bootCrowd();
  const bedA = CrowdAudio.inspect().bedGain;
  assert.ok(bedA);

  // Host still points at the closed context (stale until rebuild finishes).
  a.ctx.state = "closed";
  setLive(a.ctx, a.ctx.createGain());
  CrowdAudio.update();
  assert.equal(CrowdAudio.inspect().attached, false, "closed context is not treated as attached");
  assert.equal(CrowdAudio.inspect().bedGain, null);

  // After the host moves to a live context, update builds a fresh bed.
  const b = fakeContext("B");
  setLive(b.ctx, b.ctx.createGain());
  CrowdAudio.update();
  assert.equal(CrowdAudio.inspect().ctx, b.ctx);
  assert.equal(CrowdAudio.inspect().bedGain.context, b.ctx);
});

test("rebuildCtx / startEngineGraph in engine.js call CrowdAudio detach+attach (#3289)", () => {
  // Structural gate: the bypass path must own the rebind (crowd wrappers alone
  // are not enough when startEngineGraph runs without startEngine).
  assert.match(ENGINE, /CrowdAudio\.detach/, "rebuildCtx tears the crowd bed off the dying context");
  assert.match(ENGINE, /CrowdAudio\.attach/, "rebuildCtx / startEngineGraph re-attach onto the new context");
  const rebuildIdx = ENGINE.indexOf("function rebuildCtx()");
  const detachIdx = ENGINE.indexOf("CrowdAudio.detach", rebuildIdx);
  const createIdx = ENGINE.indexOf("if (!createCtx())", rebuildIdx);
  const attachIdx = ENGINE.indexOf("CrowdAudio.attach", createIdx);
  assert.ok(rebuildIdx > 0 && detachIdx > rebuildIdx && detachIdx < createIdx,
    "detach runs inside rebuildCtx before createCtx");
  assert.ok(attachIdx > createIdx, "attach runs after createCtx in rebuildCtx");
  const graphIdx = ENGINE.indexOf("function startEngineGraph()");
  const graphAttach = ENGINE.indexOf("CrowdAudio.attach", graphIdx);
  const stopIdx = ENGINE.indexOf("function stopEngine()", graphIdx);
  assert.ok(graphAttach > graphIdx && graphAttach < stopIdx,
    "startEngineGraph re-binds crowd after the engine body (visibility / rebuild bypass)");
});
