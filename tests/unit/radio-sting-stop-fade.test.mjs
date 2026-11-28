/* radio-sting-stop-fade.test.mjs — #7252 member 4 (hunt #7147 row 7): radioStingStop schedules a 50 ms fade
 * and stop(t + 0.08) on the hiss bed. On a RUNNING context the bed stays wired until the fade has played
 * (a timer cuts it after), so the fade is heard; on a suspended or closed context, where onended may never
 * fire and the fade is never heard, it still disconnects at once (the voice-chain M8 contract).
 * Run: node --test tests/unit/radio-sting-stop-fade.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const SRC = fs.readFileSync(new URL("../../js/audio/radio-fx.js", import.meta.url), "utf8");

function param() { return { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} }; }
function makeRig(state) {
  const nodes = [], timers = [];
  const node = (kind) => {
    const n = { kind, connected: false, gain: param(), frequency: param(), Q: param(), detune: param(),
      connect(to) { n.connected = true; return to; }, disconnect() { n.connected = false; }, start() {}, stop() {} };
    nodes.push(n); return n;
  };
  const ctx = { state, currentTime: 0, createBufferSource: () => node("src"), createBiquadFilter: () => node("biquad"),
    createGain: () => node("gain"), createOscillator: () => node("osc") };
  const sb = { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, Math, Object, Array, Number, Map, Set };
  vm.createContext(sb);
  vm.runInContext(SRC, sb, { filename: absSrc("js/audio/radio-fx.js") });
  const signal = { bindNoise: () => 0, noisePool: () => ({}), env() {}, noisePoolSeconds: 2 };
  const host = { context: () => ctx, bus: () => node("bus"), master: () => node("master"), enabled: () => true, sfxOk: () => true, now: () => ctx.currentTime };
  const fx = sb.GameAudioRadioFx.create(host, signal);
  return { fx, nodes, timers, ctx };
}

test("running context: the bed stays connected through the fade, then a timer disconnects it", () => {
  const rig = makeRig("running");
  assert.equal(rig.fx.radioSting("radio", 2), true, "the sting played");
  const before = rig.nodes.filter((n) => n.connected);
  rig.fx.radioStingStop();
  const stillWired = before.filter((n) => n.connected);
  assert.ok(stillWired.some((n) => n.kind === "gain"), "a faded bed gain is still connected straight after the stop");
  const cut = rig.timers.filter((t) => t.ms >= 80 && t.ms <= 200);
  assert.ok(cut.length >= 1, "a timer cuts the bed after the 50 ms fade + stop(t+0.08): " + JSON.stringify(rig.timers.map((t) => t.ms)));
  for (const t of cut) t.fn();
  assert.deepEqual(before.filter((n) => n.connected).map((n) => n.kind), [], "every node of the sting is disconnected after the timer");
});

test("suspended or closed context: the bed disconnects at once (onended may never fire)", () => {
  for (const state of ["suspended", "closed"]) {
    const rig = makeRig(state);
    assert.equal(rig.fx.radioSting("radio", 2), true);
    const before = rig.nodes.filter((n) => n.connected);
    rig.fx.radioStingStop();
    assert.deepEqual(before.filter((n) => n.connected).map((n) => n.kind), [], state + ": nothing left wired");
  }
});
