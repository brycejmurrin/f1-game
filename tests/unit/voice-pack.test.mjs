/* voice-pack.test.mjs — the recorded radio voice and the spotter.
 *
 * js/audio/voice-pack.js speaks a line by splicing recorded clips, and the
 * one rule that matters is NOTHING HALF-SAID: a line the pack cannot cover
 * whole goes back to speech synthesis. So the composer is pinned on its own,
 * then the COMMITTED pack (assets/voice/george.*) is checked against the lines
 * the engineer actually says, then the RadioVoice hand-off and the spotter.
 *
 * Run: node --test tests/unit/voice-pack.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const unrefTimeout = (fn, ms, ...a) => { const t = setTimeout(fn, ms, ...a); t.unref?.(); return t; };

function sandbox(files, extra) {
  const sb = Object.assign({ Math, Object, Array, Number, String, JSON, Map, Set, Promise, console, Error,
    setTimeout: unrefTimeout, clearTimeout, Log: { info() {}, warn() {}, debug() {} } }, extra || {});
  sb.window = sb.window || sb;
  vm.createContext(sb);
  for (const f of files) vm.runInContext(read(f).replace(/^const\b/gm, "var"), sb, { filename: f });
  return sb;
}
const J = (x) => JSON.parse(JSON.stringify(x));   // across the VM realm boundary

const SB = sandbox(["js/core/mat4.js", "js/audio/voice-pack.js", "js/audio/radio-voice.js", "js/race/radio-lines.js",
  "js/race/spotter.js", "js/data/teams.js"]);
const { VoicePack, RadioVoice, RadioLines, Spotter } = SB;
const say = (t) => RadioVoice.speakable(t);

// ── 1. The composer ─────────────────────────────────────────────────────────

test("norm keeps a gap a word, and turns sentence punctuation into pauses", () => {
  assert.deepEqual(J(VoicePack.norm(say("1.4s TO NORRIS. YOU'RE IN RANGE"))),
    ["1.4", "seconds", "to", "norris", { p: 0.14 }, "you're", "in", "range"]);
  assert.deepEqual(J(VoicePack.norm(say("P7. NICE MOVE"))), ["p", "7", { p: 0.14 }, "nice", "move"]);
  assert.deepEqual(J(VoicePack.norm("rain in 3 laps, be ready!")), ["rain", "in", "3", "laps", { p: 0.07 }, "be", "ready"],
    "a trailing pause is dropped: the squelch ends the line, not silence");
});

test("compose takes the LONGEST key at each step and refuses a line it cannot cover whole", () => {
  const keys = new Set(["box", "box box box", "next lap", "p 3"]);
  const has = (k) => keys.has(k);
  assert.deepEqual(J(VoicePack.compose("box box box", has)), [{ k: "box box box" }], "one clip, not three");
  assert.deepEqual(J(VoicePack.compose(say("P3. BOX NEXT LAP"), has)), [{ k: "p 3" }, { p: 0.14 }, { k: "box" }, { k: "next lap" }]);
  assert.equal(VoicePack.compose(say("BOX NEXT LAP, VERSTAPPEN"), has), null, "one missing word and the pack stays out of it");
  assert.equal(VoicePack.compose("", has), null);
});

// ── 2. The committed pack covers what the engineer says ─────────────────────

const MAN = JSON.parse(read("assets/voice/george.json"));
const BIN = fs.statSync(path.join(ROOT, "assets/voice/george.bin")).size;
const hasKey = (k) => Object.prototype.hasOwnProperty.call(MAN.clips, k);

test("the pack is one contiguous, licensed, small file", () => {
  assert.equal(MAN.licence, "Apache-2.0", "Kokoro-82M's weights and voices are Apache-2.0");
  let off = 0;
  // By offset, not by key order: JS walks integer-like keys ("0"-"60") first.
  for (const [k, [o, len, secs]] of Object.entries(MAN.clips).sort((a, b) => a[1][0] - b[1][0])) {
    assert.equal(o, off, `${k} starts where the last clip ended`);
    assert.ok(len > 100, `${k} has audio`);
    assert.ok(secs > 0.05 && secs < 5, `${k} lasts ${secs}s`);
    off += len;
  }
  assert.equal(off, BIN, "the index accounts for every byte of the .bin");
  assert.ok(BIN < 3 * 1024 * 1024, `the pack is ${(BIN / 1048576).toFixed(2)} MB — a radio voice is not worth more than 3 MB`);
});

test("every engineer line with no lap time in it composes from the pack, for every driver on the grid", () => {
  const names = [];
  for (const t of SB.Teams.LIST) for (const d of t.drivers || []) names.push(RadioLines.surname(d));
  const misses = [];
  let n = 0;
  for (const [pool, lines] of Object.entries(RadioLines.POOLS)) {
    if (!pool.startsWith("eng.")) continue;
    for (const tpl of lines) {
      if (/\{(time|delta)\}/.test(tpl)) continue;   // "1:32.4" is speech synthesis' job
      for (const name of names) {
        const text = RadioLines.fill(tpl, { pos: 7, grid: 12, n: 3, left: 5, laps: 4, passed: name, by: name, ahead: name,
          behind: name, name, leader: name, gap: RadioLines.gapText(1.4) + "s", gapA: RadioLines.gapText(0.8) + "s", gapB: RadioLines.gapText(2.3) + "s", rate: RadioLines.gapText(0.3) + "s", a: name, b: name });
        if (!text) continue;   // a slot this sweep does not fill (the radio check's pair of gaps)
        n++;
        if (!VoicePack.compose(say(text), hasKey)) misses.push(text);
      }
    }
  }
  assert.ok(n > 1000, "the sweep is real");
  assert.deepEqual([...new Set(misses)], [], "lines the pack cannot say (re-run tools/gen/voicepack.mjs)");
});

test("the positions, gaps and spotter calls a line can carry are all recorded", () => {
  for (let p = 1; p <= 22; p++) assert.ok(hasKey("p " + p), "P" + p);
  for (const g of [0.1, 0.9, 1.4, 5.5, 9.9]) assert.ok(hasKey(RadioLines.gapText(g)), "gap " + g);
  for (const k of Object.keys(Spotter.KEYS)) assert.ok(hasKey(k), "spotter: " + k);
});

// ── 3. RadioVoice hands a covered line to the pack ──────────────────────────

function radio({ covers = true, packOn } = {}) {
  const spoken = [], packCalls = [];
  const synth = { speaking: false, speak(u) { spoken.push(u.text); }, cancel() {}, resume() {}, getVoices: () => [] };
  let onEnd = null;
  const fakePack = {
    ensure() { return "ready"; }, stop() { packCalls.push("stop"); }, busy: () => false,
    speak(id, text, o) { packCalls.push({ id, text, leadS: o.leadS }); if (!covers) return false; onEnd = o.onEnd; return true; },
    debug: () => ({}),
  };
  const ducks = [];
  const sb = sandbox(["js/audio/radio-voice.js"], {
    window: { speechSynthesis: synth, SpeechSynthesisUtterance: function (t) { this.text = t; } },
    GameAudio: { setRadioDuck: (b) => ducks.push(b), radioStingStop() {} },
    VoicePack: { create: () => fakePack },
  });
  const saved = new Map(packOn == null ? [] : [["radioPack", packOn]]);
  const G = { soundOn: true, state: "race", store: { get: (k, d) => (saved.has(k) ? saved.get(k) : d), set: (k, v) => saved.set(k, v) } };
  const v = sb.RadioVoice.create(G);
  v.setEnabled(true);
  return { v, spoken, packCalls, ducks, end: () => onEnd && onEnd() };
}

test("a line the pack covers is played from it, after the courtesy figure, and synthesis stays quiet", () => {
  const r = radio();
  assert.equal(r.v.say("BOX BOX BOX", 3, "info", 0.5), true);
  const call = r.packCalls.find((c) => c.id);
  assert.equal(call.id, "george");
  assert.equal(call.leadS, 0.5, "the words start after the figure, as synthesis' do");
  assert.deepEqual(r.spoken, [], "speech synthesis did not also say it");
  assert.equal(r.ducks.at(-1), true, "the music ducks under the recorded voice too");
  r.end();
  assert.equal(r.ducks.at(-1), false, "and comes back when it ends");
});

test("a line the pack cannot cover falls back to speech synthesis; SYSTEM never asks the pack", () => {
  const miss = radio({ covers: false });
  assert.equal(miss.v.say("BOX BOX BOX", 3, "info"), true);
  assert.deepEqual(miss.spoken, ["BOX BOX BOX".toLowerCase()]);
  const sys = radio({ packOn: false });
  sys.v.say("BOX BOX BOX", 3, "info");
  assert.equal(sys.packCalls.filter((c) => c.id).length, 0, "the SYSTEM setting keeps every line on synthesis");
  assert.equal(sys.spoken.length, 1);
});

test("race control and the coach are never recorded: only the engineer's channel has a pack voice", () => {
  const r = radio();
  r.v.say("5 SECOND PENALTY", 3, "penalty-hit");
  assert.equal(r.packCalls.filter((c) => c.id).length, 0);
  assert.equal(r.spoken.length, 1);
  assert.deepEqual(J(RadioVoice.PACK_VOICE), { radio: "george" });
});

// ── 4. The spotter ──────────────────────────────────────────────────────────

const run = (st, occ, secs, dt = 1 / 60) => {
  const out = [];
  for (let t = 0; t < secs; t += dt) { const k = Spotter.step(st, occ, dt); if (k) out.push(k); }
  return out;
};

test("a car alongside is called once, after the debounce, and 'clear' only follows a call", () => {
  const st = Spotter.fresh();
  assert.deepEqual(run(st, 0, 1), [], "nothing alongside, nothing said");
  assert.deepEqual(run(st, 1, 0.1), [], "a car darting in for 0.1 s is not called");
  assert.deepEqual(run(st, 0, 0.5), [], "...and its leaving is not a 'clear' either");
  assert.deepEqual(run(st, 1, 1), ["car left"]);
  assert.deepEqual(run(st, 3, 1), ["three wide"]);
  assert.deepEqual(run(st, 0, 1), ["clear"]);
});

test("one 'still there' when a car stays alongside, not one a second", () => {
  const st = Spotter.fresh();
  assert.deepEqual(run(st, 2, 10), ["car right", "still there"]);
});

test("occupancy: side by sign of lateral, across the start/finish wrap, pit-lane cars ignored", () => {
  const me = { s: 998, x: 0 };
  const LAP = 1000;
  assert.equal(Spotter.occupancy(me, [me, { s: 2, x: -2.5 }], LAP), 1, "4 m up the road over the line, on your left");
  assert.equal(Spotter.occupancy(me, [me, { s: 996, x: 2.5 }], LAP), 2, "on your right");
  assert.equal(Spotter.occupancy(me, [me, { s: 998, x: 0.3 }], LAP), 0, "dead in line is not alongside");
  assert.equal(Spotter.occupancy(me, [me, { s: 998, x: 6 }], LAP), 0, "a lane over is not alongside");
  assert.equal(Spotter.occupancy(me, [me, { s: 990, x: 2 }], LAP), 0, "8 m back is behind, not beside");
  assert.equal(Spotter.occupancy(me, [me, { s: 998, x: 2, pitState: "lane" }], LAP), 0);
  assert.equal(Spotter.occupancy(me, [me, { s: 998, x: 2, retired: true }], LAP), 0);
});

test("the spotter speaks only from the pack, and not over the engineer", () => {
  const said = [];
  const pack = { ensure() {}, busy: () => false, speak: (id, t) => { said.push(t); return true; } };
  const store = new Map();
  const me = { s: 500, x: 0, speed: 60 };
  const G = { state: "race", soundOn: true, player: me, cars: [me, { s: 501, x: -2.5 }], track: { total: 5000 },
    vTop: () => 90, radio: { pack, volume: () => 1 }, store: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) } };
  const s = Spotter.create(G);
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  assert.deepEqual(said, ["Car left."]);
  store.set("spotter", false);
  G.cars[1].x = 2.5;
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  assert.equal(said.length, 1, "SPOTTER off is silent");
  store.set("spotter", true);
  G.radio = { pack: null };
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  assert.equal(said.length, 1, "no pack, no spotter — synthesis is too slow for 'car left'");
});
