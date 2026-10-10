/* voice-pack.test.mjs — the recorded radio voice and the spotter.
 *
 * js/audio/voice-pack.js speaks a line by splicing recorded clips, and the
 * one rule that matters is NOTHING HALF-SAID: a line the pack cannot cover
 * whole is not spoken from it — with RADIO VOICE: RECORDED it stays written,
 * because speech synthesis held the game up on iPhone. So the composer is
 * pinned on its own, then the COMMITTED packs (assets/voice/*, one per radio
 * channel) are checked against the lines each channel actually says, then the
 * RadioVoice hand-off and the spotter.
 *
 * Run: node --test tests/unit/voice-pack.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { fullPhrases } from "../../tools/gen/voicepack.mjs";
import { SAMPLES, requestFor } from "../../tools/gen/voice-audition.mjs";

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

test("a lap time splices from number clips, the way the broadcast reads one", () => {
  assert.deepEqual(J(VoicePack.norm(say("PERSONAL BEST, 1:32.4"))), ["personal", "best", { p: 0.05 }, "1", "32", "point", "4"]);
  assert.deepEqual(J(VoicePack.norm(say("FASTEST LAP 1:05.3."))), ["fastest", "lap", "1", "oh", "5", "point", "3"]);
  assert.deepEqual(J(VoicePack.norm("1.4 seconds")), ["1.4", "seconds"], "a gap is not a lap time");
});

test("norm keeps a gap a word, and turns sentence punctuation into pauses", () => {
  assert.deepEqual(J(VoicePack.norm(say("1.4s TO NORRIS. YOU'RE IN RANGE"))),
    ["1.4", "seconds", "to", "norris", { p: 0.1 }, "you're", "in", "range"]);
  assert.deepEqual(J(VoicePack.norm(say("P7. NICE MOVE"))), ["p", "7", { p: 0.1 }, "nice", "move"]);
  assert.deepEqual(J(VoicePack.norm("rain in 3 laps, be ready!")), ["rain", "in", "3", "laps", { p: 0.05 }, "be", "ready"],
    "a trailing pause is dropped: the squelch ends the line, not silence");
});

test("compose takes the LONGEST key at each step and refuses a line it cannot cover whole", () => {
  const keys = new Set(["box", "box box box", "next lap", "p 3"]);
  const has = (k) => keys.has(k);
  assert.deepEqual(J(VoicePack.compose("box box box", has)), [{ k: "box box box" }], "one clip, not three");
  assert.deepEqual(J(VoicePack.compose(say("P3. BOX NEXT LAP"), has)), [{ k: "p 3" }, { p: 0.1 }, { k: "box" }, { k: "next lap" }]);
  assert.equal(VoicePack.compose(say("BOX NEXT LAP, VERSTAPPEN"), has), null, "one missing word and the pack stays out of it");
  assert.equal(VoicePack.compose("", has), null);
});

test("a complete performance wins over fragments, including internal pauses and long circuit lore", () => {
  const text = "Welcome to Apex 26. This is Silverstone, home of the British Grand Prix.";
  const full = VoicePack.lineKey(text);
  const keys = new Set([full, ...VoicePack.norm(text).filter((t) => typeof t === "string")]);
  assert.deepEqual(J(VoicePack.compose(text, (k) => keys.has(k))), [{ k: full }]);
  assert.equal(VoicePack.compose("Welcome to a different circuit", (k) => keys.has(k)), null);
});

// ── 2. The committed packs cover what each channel says ─────────────────────

// EVERY VOICE ON EVERY CHANNEL: a voice's own channel is `<id>`, every other
// channel `<id>-<speaker>` (VoicePack.packFor). All of them ship.
const SPEAKERS_ALL = Object.keys(J(RadioVoice.PACK_VOICE));
const PACKS = {};
const COMBOS = [];   // [voice, speaker, pack]
for (const id of Object.keys(J(VoicePack.VOICES))) for (const sp of SPEAKERS_ALL) {
  const pk = VoicePack.packFor(id, sp);
  COMBOS.push([id, sp, pk]);
  PACKS[pk] = { man: JSON.parse(read(`assets/voice/${pk}.json`)), bin: fs.statSync(path.join(ROOT, `assets/voice/${pk}.bin`)).size };
}
const packsFor = (sp) => COMBOS.filter(([, s2]) => s2 === sp).map(([, , pk]) => pk);
const hasIn = (id) => (k) => Object.prototype.hasOwnProperty.call(PACKS[id].man.clips, k);
const MAN = PACKS.george.man;
const hasKey = hasIn("george");

test("every pack is one contiguous, licensed, small file", () => {
  let total = 0;
  for (const [id, { man, bin }] of Object.entries(PACKS)) {
    assert.equal(man.licence, "Apache-2.0", `${id}: Kokoro-82M's weights and voices are Apache-2.0`);
    let off = 0;
    // By offset, not by key order: JS walks integer-like keys ("0"-"60") first.
    for (const [k, [o, len, secs]] of Object.entries(man.clips).sort((a, b) => a[1][0] - b[1][0])) {
      assert.equal(o, off, `${id}: ${k} starts where the last clip ended`);
      assert.ok(len > 100, `${id}: ${k} has audio`);
      assert.ok(secs > 0.05 && secs < (k.startsWith("@line:") ? 20 : 6), `${id}: ${k} lasts ${secs}s`);
      off += len;
    }
    assert.equal(off, bin, `${id}: the index accounts for every byte of the .bin`);
    // Fetched only while that channel is switched on (never precached), but a
    // phone on a cellular link still pays for every megabyte of it.
    // Circuit lore is now a full performance, not word clips. Only the selected
    // voice is fetched: alternatives must never double the player's download.
    assert.ok(bin < 8 * 1024 * 1024, `${id} exceeds the 8 MB complete-recording budget`);
    total += bin;
  }
  assert.equal(Object.keys(PACKS).length, Object.keys(J(VoicePack.VOICES)).length * SPEAKERS_ALL.length, "every voice ships every channel");
  // Repository weight, not a player's download: a player fetches one pack per channel in use.
  assert.ok(total < 120 * 1024 * 1024, `all ${Object.keys(PACKS).length} packs total ${(total / 1048576).toFixed(2)} MB`);
  const defaults = Object.values(J(RadioVoice.PACK_VOICE)).reduce((n, id) => n + PACKS[id].bin, 0);
  assert.ok(defaults < 18 * 1024 * 1024, "selected defaults stay within an 18 MB race download; alternatives load only when selected");
});

test("every voice's pack for every channel includes that channel's complete calls and fallback vocabulary", () => {
  for (const [id, sp, pk] of COMBOS) {
    const base = RadioVoice.PACK_VOICE[sp];
    assert.equal(PACKS[pk].man.voice, J(VoicePack.VOICES)[id].voice, pk + " is " + id + "'s voice");
    for (const key of Object.keys(PACKS[base].man.clips)) {
      if (!key.startsWith("@line:")) assert.ok(hasIn(pk)(key), pk + ": " + key);
    }
    for (const { key, text } of fullPhrases(id, sp)) {
      assert.ok(hasIn(pk)(key), pk + ": " + text);
      assert.deepEqual(J(VoicePack.compose(text, hasIn(pk))), [{ k: key }]);
    }
  }
});

test("provider auditions use the same 12 race calls and checked speech APIs", () => {
  assert.equal(SAMPLES.length, 12);
  for (const s of SAMPLES) {
    const openai = requestFor("openai", "cedar", "gpt-4o-mini-tts-2025-12-15", s);
    assert.equal(openai.url, "https://api.openai.com/v1/audio/speech");
    assert.equal(openai.body.input, s.text);
    assert.ok(openai.body.instructions.includes(s.delivery));
    const eleven = requestFor("elevenlabs", "chosen-voice", "eleven_v4", s);
    assert.equal(eleven.url, "https://api.elevenlabs.io/v1/text-to-dialogue");
    assert.equal(eleven.body.inputs[0].voice_id, "chosen-voice");
    assert.ok(eleven.body.inputs[0].text.endsWith(s.text));
    assert.equal(eleven.body.model_id, "eleven_v4");
  }
});

test("every commentary line composes from the commentator's pack, for every driver on the grid", () => {
  const names = [];
  for (const t of SB.Teams.LIST) for (const d of t.drivers || []) names.push(RadioLines.surname(d));
  const misses = [];
  let n = 0;
  for (const [pool, lines] of Object.entries(RadioLines.POOLS)) {
    if (!pool.startsWith("tv.")) continue;
    for (const tpl of lines) names.forEach((name, i) => {
      const text = RadioLines.fill(tpl, { pos: 1 + (i % 22), grid: 15, a: name, b: names[(i + 1) % names.length], leader: name, name,
        gap: RadioLines.gapText(0.7), time: RadioLines.timeText(80 + i * 1.7), why: RadioLines.WHY.mechanical, n: 3, laps: 4 });
      if (!text) return;
      n++;
      for (const pk of packsFor("announcer")) if (!VoicePack.compose(say(text), hasIn(pk))) misses.push(pk + ": " + text);
    });
  }
  assert.ok(n > 300, "the sweep is real");
  assert.deepEqual([...new Set(misses)], [], "commentary the pack cannot say (re-run tools/gen/voicepack.mjs --id fable)");
});

test("every line the game was heard saying in a race composes from its own channel's pack", () => {
  // tools/gen/voice-corpus.mjs: real races in the game VM, every card that
  // reached the voice, by speaker. The generator records from it, so a miss
  // here is a pack older than its corpus.
  const corpus = JSON.parse(read("tools/gen/voice-corpus.json"));
  const misses = [];
  let n = 0;
  for (const [, speaker, pk] of COMBOS) {
    for (const line of corpus[speaker] || []) { n++; if (!VoicePack.compose(line, hasIn(pk))) misses.push(pk + ": " + line); }
  }
  assert.ok(n > 50, "the corpus is real: " + n);
  assert.deepEqual(misses, [], "re-run tools/gen/voicepack.mjs for the channel named");
});

test("every engineer line, lap times included, composes from the pack, for every driver on the grid", () => {
  const names = [];
  for (const t of SB.Teams.LIST) for (const d of t.drivers || []) names.push(RadioLines.surname(d));
  const misses = [];
  let n = 0;
  for (const [pool, lines] of Object.entries(RadioLines.POOLS)) {
    if (!pool.startsWith("eng.")) continue;
    for (const tpl of lines) {
      names.forEach((name, i) => {
        const text = RadioLines.fill(tpl, { pos: 7, grid: 12, n: 3, left: 5, laps: 4, passed: name, by: name, ahead: name,
          behind: name, name, leader: name, gap: RadioLines.gapText(1.4) + "s", gapA: RadioLines.gapText(0.8) + "s", gapB: RadioLines.gapText(2.3) + "s", rate: RadioLines.gapText(0.3) + "s", a: name, b: name,
          time: RadioLines.timeText(64.9 + i * 2.3), delta: RadioLines.gapText(0.4) });
        if (!text) return;   // a slot this sweep does not fill (the radio check's pair of gaps)
        n++;
        for (const pk of packsFor("radio")) if (!VoicePack.compose(say(text), hasIn(pk))) misses.push(pk + ": " + text);
      });
    }
  }
  assert.ok(n > 1000, "the sweep is real");
  assert.deepEqual([...new Set(misses)], [], "lines the pack cannot say (re-run tools/gen/voicepack.mjs)");
});

test("every tyre and pit call the engineer (js/race/engineer.js) makes composes from the pack", () => {
  const RE = sandbox(["js/core/mat4.js", "js/physics/consts.js", "js/data/teams.js", "js/car/parts.js",
    "js/physics/tyre-model.js", "js/race/engineer.js"]).RaceEngineer;
  const E = RE.create({});
  const base = { wear: 0, step: -1, axle: 0, front: true, graining: 0, blistering: 0, belowWindow: 0, outLap: false,
    wrongTread: false, cheapStop: false, wet: false, rainInLaps: null, lap: 5, lapsToStop: null, nextCode: null,
    rivalBoxed: null, marginS: null, pitLoss: null };
  const cases = [];
  for (const wet of [false, true]) cases.push({ wrongTread: true, wet });
  cases.push({ cheapStop: true, marginS: 3 }, { cheapStop: true, pitLoss: 21 }, { cheapStop: true });
  for (const t of SB.Teams.LIST) for (const d of t.drivers || []) cases.push({ rivalBoxed: d.code, lapsToStop: 3 });
  for (const r of [1, 2, 4]) cases.push({ rainInLaps: r, lapsToStop: 9, lap: 58 }, { rainInLaps: r });
  cases.push({ blistering: 1 }, { wear: 1.2 }, { graining: 1 }, { outLap: true, belowWindow: 1 }, { axle: 0.5, front: true }, { axle: 0.5, front: false });
  for (const c of ["S", "M", "H", "I", "W", null]) cases.push({ lapsToStop: 0, nextCode: c }, { lapsToStop: 1, nextCode: c });
  for (let st = 0; st < RE.WEAR_STEPS.length; st++) cases.push({ step: st });
  const misses = [];
  for (const c of cases) {
    const got = E.callFor(Object.assign({}, base, c));
    const text = got && got[0];
    if (text && !VoicePack.compose(say(text), hasKey)) misses.push(text);
  }
  assert.deepEqual([...new Set(misses)], [], "engineer calls the pack cannot say (re-run tools/gen/voicepack.mjs)");
});

test("the positions, gaps and spotter calls a line can carry are all recorded", () => {
  for (let p = 1; p <= 22; p++) assert.ok(hasKey("p " + p), "P" + p);
  for (const g of [0.1, 0.9, 1.4, 5.5, 9.9]) assert.ok(hasKey(RadioLines.gapText(g)), "gap " + g);
  for (const k of Object.keys(Spotter.KEYS)) assert.ok(hasKey(k), "spotter: " + k);
});

// ── 3. RadioVoice hands a covered line to the pack ──────────────────────────

function radio({ covers = true, packOn, spotterLeft = 0, loading = null, voiceTune = null } = {}) {
  const spoken = [], packCalls = [];
  const synth = { speaking: false, speak(u) { spoken.push(u.text); }, cancel() {}, resume() {}, getVoices: () => [] };
  let onEnd = null;
  const fakePack = {
    ensure() { return "ready"; }, stop() { packCalls.push("stop"); }, busy: () => false, remaining: (ch) => (ch === "spotter" ? spotterLeft : 0),
    speak(id, text, o) { packCalls.push({ id, text, leadS: o.leadS, fx: o.fx }); if (!covers) return false; onEnd = o.onEnd; return true; },
    debug: () => ({}),
    ready: () => !loading,
  };
  if (loading) fakePack.load = () => loading;
  const ducks = [];
  const sb = sandbox(["js/audio/radio-voice.js"], {
    window: { speechSynthesis: synth, SpeechSynthesisUtterance: function (t) { this.text = t; } },
    GameAudio: { setRadioDuck: (b) => ducks.push(b), radioStingStop() {} },
    VoicePack: { create: () => fakePack, choices: VoicePack.choices, packFor: VoicePack.packFor },
  });
  const saved = new Map(packOn == null ? [] : [["radioPack", packOn]]);
  if (voiceTune) saved.set("voiceTune", voiceTune);
  const G = { soundOn: true, state: "race", store: { get: (k, d) => (saved.has(k) ? saved.get(k) : d), set: (k, v) => saved.set(k, v) } };
  const v = sb.RadioVoice.create(G);
  v.setEnabled(true);
  return { v, spoken, packCalls, ducks, saved, reload: () => sb.RadioVoice.create(G), end: () => onEnd && onEnd() };
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

test("a selected engineer is persisted, prepared and played; any voice may take any channel, an unknown one is refused", () => {
  const r = radio();
  assert.equal(r.v.setRecordedVoice("radio", "michael"), true);
  assert.equal(r.v.recordedVoice("radio"), "michael");
  assert.equal(r.saved.get("voiceTune").radio.pack, "michael");
  assert.equal(r.reload().recordedVoice("radio"), "michael", "the selected pack survives reload");
  assert.equal(r.v.setRecordedVoice("radio", "missing"), false);
  assert.equal(r.v.say("BOX BOX BOX", 3, "info"), true);
  assert.equal(r.packCalls.find((c) => c.id).id, "michael", "a voice on its own channel speaks from its own pack");
  // The commentator's voice on the team radio: the same voice, the radio's words.
  assert.equal(r.v.setRecordedVoice("radio", "bella"), true);
  assert.equal(r.v.recordedPack("radio"), "bella-radio");
  r.packCalls.length = 0;
  assert.equal(r.v.say("BOX BOX BOX", 3, "info"), true);
  assert.equal(r.packCalls.find((c) => c.id).id, "bella-radio");
  for (const sp of SPEAKERS_ALL) {
    assert.deepEqual(J(VoicePack.choices(sp)).map((c) => c.id).sort(), Object.keys(J(VoicePack.VOICES)).sort(), sp + " offers every voice");
    assert.equal(J(VoicePack.choices(sp))[0].id, RadioVoice.PACK_VOICE[sp], sp + ": the shipped default heads the list");
  }
});

test("pre-race announcer source is independent of the recorded race radio", () => {
  const old = radio({ voiceTune: { announcer: { name: "Samantha", rate: 1.1 } } });
  assert.equal(old.v.announcerPackOn(), false, "existing system announcer choices survive the upgrade");
  assert.equal(old.v.packOn(), true);
  const r = radio();
  assert.equal(r.v.announcerPackOn(), true);
  r.v.setTune("announcer", { name: "System presenter" });
  assert.equal(r.v.announcerPackOn(), false);
  assert.equal(r.v.packOn(), true);
  r.v.setPackOn(false);
  r.v.setRecordedVoice("announcer", "bella");
  assert.equal(r.v.packOn(), false, "a recorded presenter does not change race-radio source");
  assert.equal(r.v.announcerPackOn(), true);
  assert.equal(r.v.preview("announcer"), true);
  assert.equal(r.packCalls.find((c) => c.id).id, "bella");
  assert.equal(r.reload().announcerPackOn(), true, "the independent presenter source survives reload");
});

test("a cancelled recorded audition cannot start after its download; no platform speech while waiting", async () => {
  let resolve;
  const loading = new Promise((r) => { resolve = r; });
  const r = radio({ loading });
  assert.equal(r.v.preview("radio"), true);
  assert.deepEqual(r.spoken, []);
  r.v.stop();
  resolve(true); await loading; await Promise.resolve();
  assert.equal(r.packCalls.filter((c) => c.id).length, 0);
});

test("RECORDED never hands a race line to speech synthesis: a line no clip covers stays written; SYSTEM never asks the pack", async () => {
  // Speech synthesis is main-thread IPC, and on iPhone Safari every line it
  // spoke held the game up (docs/notes/VOICE-LAG-IPHONE-2026-10-01.md).
  const miss = radio({ covers: false });
  assert.equal(miss.v.say("BOX BOX BOX", 3, "info"), false, "not spoken");
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(miss.spoken, [], "and not by speech synthesis either");
  assert.equal(miss.v.debug().last.reason, "not-recorded", "the audio panel can say why");
  assert.equal(miss.v.busy(), false, "a written line does not hold the channel");
  const sys = radio({ packOn: false });
  sys.v.say("BOX BOX BOX", 3, "info");
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(sys.packCalls.filter((c) => c.id).length, 0, "the SYSTEM setting keeps every line on synthesis");
  assert.equal(sys.spoken.length, 1);
});

test("every race channel speaks in its own recorded voice and its own sound", async () => {
  assert.deepEqual(J(RadioVoice.PACK_VOICE), { radio: "george", announcer: "fable", control: "emma", coach: "heart" });
  const r = radio();
  for (const [kind, id, fx] of [["penalty-hit", "emma", "control"], ["coach", "heart", "coach"], ["comm", "fable", "announcer"], ["info", "george", "radio"]]) {
    r.packCalls.length = 0;
    if (kind === "comm") continue;   // commentary obeys the ANNOUNCER switch, which this harness has no module for
    r.v.say("5 SECOND PENALTY", 3, kind);
    const call = r.packCalls.find((c) => c.id);
    assert.equal(call && call.id, id, kind);
    assert.equal(call.fx, fx, kind + " has its own sound");
  }
  await new Promise((r2) => setTimeout(r2, 5));
  assert.deepEqual(r.spoken, [], "no channel reached speech synthesis");
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
  const ids = [];
  const pack = { ensure() {}, busy: () => false, speak: (id, t) => { ids.push(id); said.push(t); return true; } };
  const store = new Map([["spotter", true]]);
  const me = { s: 500, x: 0, speed: 60 };
  const G = { state: "race", soundOn: true, player: me, cars: [me, { s: 501, x: -2.5 }], track: { total: 5000 },
    vTop: () => 90, radio: { pack, recordedVoice: () => "michael", volume: () => 1 }, store: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) } };
  const s = Spotter.create(G);
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  assert.deepEqual(said, ["Car left."]);
  assert.deepEqual(ids, ["michael"], "the spotter uses the selected engineer");
  store.set("spotter", false);
  G.cars[1].x = 2.5;
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  assert.equal(said.length, 1, "SPOTTER off is silent");
  store.set("spotter", true);
  G.radio = { pack: null };
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  assert.equal(said.length, 1, "no pack, no spotter — synthesis is too slow for 'car left'");
});

// ── 5. Regressions from the PR #294 audit ───────────────────────────────────

test("a side change the spotter cannot say yet stays pending, and is said when the channel frees — never lost", () => {
  const st = Spotter.fresh();
  let free = false;
  const out = [];
  for (let i = 0; i < 120; i++) {           // 2 s alongside, channel busy the whole time
    const k = Spotter.step(st, 1, 1 / 60, () => free);
    if (k) out.push(k);
  }
  assert.deepEqual(out, [], "nothing said while the engineer has the channel");
  free = true;
  for (let i = 0; i < 30; i++) { const k = Spotter.step(st, 1, 1 / 60, () => free); if (k) out.push(k); }
  assert.deepEqual(out, ["car left"], "the call is made the moment it can be — not skipped to 'still there'");
});

test("two spotter calls are at least GAP_S apart (lights-out is a wall of cars)", () => {
  const st = Spotter.fresh();
  const at = [];
  let t = 0;
  const seq = [1, 3, 2, 0];                  // left, three wide, right, clear — each held only 0.3 s
  for (const occ of seq) for (let i = 0; i < 18; i++) { t += 1 / 60; const k = Spotter.step(st, occ, 1 / 60); if (k) at.push(t); }
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= Spotter.GAP_S - 1e-9, `calls ${at.map((x) => x.toFixed(2))}`);
});

test("the spotter is silent while paused and once the player has taken the flag", () => {
  const said = [];
  const pack = { ensure() {}, busy: () => false, speak: (id, t) => { said.push(t); return true; } };
  const me = { s: 500, x: 0, speed: 60 };
  const G = { state: "race", soundOn: true, paused: true, player: me, cars: [me, { s: 501, x: -2.5 }], track: { total: 5000 },
    vTop: () => 90, radio: { pack, volume: () => 1, busy: () => false }, store: { get: (k, d) => (k === "spotter" ? true : d), set() {} } };
  const s = Spotter.create(G);
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  G.paused = false; me.finished = true;
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  assert.deepEqual(said, []);
  me.finished = false;
  G.radio.busy = () => true;                 // an engineer line waiting out its courtesy figure
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  assert.deepEqual(said, [], "not over an engineer line that is about to start");
  G.radio.busy = () => false;
  for (let i = 0; i < 30; i++) s.update(1 / 60);
  assert.deepEqual(said, ["Car left."], "and called as soon as the channel is clear");
});

test("VoicePack keeps one transmission per channel: the engineer never cuts the spotter off", async () => {
  const man = { clips: { "car left": [0, 4, 0.5], "box box box": [4, 4, 0.6] } };
  const handles = [];
  const GA = {
    now: () => 0, ctxGen: () => 1,
    decodeClip: () => Promise.resolve({ duration: 0.5 }),
    radioVoice: (parts, at, o) => { const h = { ch: o.channel, stopped: false, end: at + 0.5, stop() { h.stopped = true; } }; handles.push(h); return h; },
  };
  const sb = sandbox(["js/audio/voice-pack.js"], {
    GameAudio: GA,
    fetch: (u) => Promise.resolve({ ok: true, json: () => Promise.resolve(man), arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
  });
  const P = sb.VoicePack.create({});
  P.ensure("george");
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(P.ready("george"), true);
  assert.equal(P.speak("george", "car left", { channel: "spotter" }), true);
  await new Promise((r) => setImmediate(r));
  assert.equal(P.busy("spotter"), true);
  P.stop("radio");                           // what RadioVoice.stop() now does
  assert.equal(handles[0].stopped, false, "an engineer preempt leaves the spotter call alone");
  assert.equal(P.speak("george", "box box box", { channel: "radio" }), true);
  await new Promise((r) => setImmediate(r));
  assert.equal(handles[0].stopped, false, "a new engineer line does not cut the spotter either");
  P.stop();
  assert.equal(handles.every((h) => h.stopped), true, "stop() with no channel cuts everything");
});

test("a failed fetch is retried later instead of disabling the pack for the session", async () => {
  let calls = 0;
  const sb = sandbox(["js/audio/voice-pack.js"], {
    GameAudio: { now: () => 0 },
    fetch: () => { calls++; return Promise.resolve({ ok: false, status: 404 }); },
  });
  const P = sb.VoicePack.create({});
  P.ensure("george");
  for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r));
  assert.equal(P.ensure("george"), "failed", "still failed inside the retry window");
  const n = calls;
  const realNow = Date.now;
  sb.Date = { now: () => realNow() + 31000 };
  vm.runInContext("Date = this.Date", sb);
  P.ensure("george");
  assert.ok(calls > n, "fetched again after the retry window");
});

test("'40%' is spoken as a word, so the tyre call comes from the pack", () => {
  assert.equal(say("TYRES AT 40%"), "tyres at 40 percent");
  assert.ok(VoicePack.compose(say("TYRES AT 85%"), hasKey), "85 and 'percent' are both recorded");
  assert.ok(VoicePack.compose(say("VER HAS BOXED — UNDERCUT ON, BOX NOW OR PUSH 2 LAPS"), hasKey), "a rival's code is its surname");
});

test("an engineer line waits for a spotter call on the air, and RadioVoice reports itself busy meanwhile", () => {
  const r = radio({ spotterLeft: 0.5 });
  assert.equal(r.v.say("BOX BOX BOX", 3, "info", 0.2), true);
  const call = r.packCalls.find((c) => c.id);
  assert.ok(call.leadS >= 0.58, `the line starts after the spotter's 0.5 s: lead ${call.leadS}`);
  assert.equal(r.v.busy(), true, "the spotter asks this before it keys up");
  r.end();
  assert.equal(r.v.busy(), false);
  assert.equal(RadioVoice.inert().busy(), false);
});

test("an AudioContext rebuilt while a line decodes drops the line instead of scheduling it on the old clock", async () => {
  const man = { clips: { "car left": [0, 4, 0.5] } };
  let gen = 1, played = 0, decodeRes;
  const GA = {
    now: () => 0, ctxGen: () => gen,
    decodeClip: () => new Promise((r) => { decodeRes = r; }),
    radioVoice: () => { played++; return { end: 0.5, stop() {} }; },
  };
  const sb = sandbox(["js/audio/voice-pack.js"], {
    GameAudio: GA,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(man), arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
  });
  const P = sb.VoicePack.create({});
  P.ensure("george");
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.equal(P.speak("george", "car left", { channel: "spotter" }), true);
  gen = 2;                                   // GameAudio.rebuildCtx() mid-decode
  decodeRes({ duration: 0.5 });
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.equal(played, 0, "the line was scheduled on the dead context's clock");
  assert.equal(P.busy("spotter"), false, "the channel is held for a line that will never play");
});

test("spotter holds the overlap envelope and names the remaining side after three wide", () => {
  const me = { s: 10, x: 0 }, other = { s: 15.8, x: -2 };
  assert.equal(Spotter.occupancy(me, [me, other], 1000), 0);
  assert.equal(Spotter.occupancy(me, [me, other], 1000, 1), 1);
  other.s = 16.5;
  assert.equal(Spotter.occupancy(me, [me, other], 1000, 1), 0);
  other.s = NaN;
  assert.equal(Spotter.occupancy(me, [me, other], 1000), 0);
  other.s = 10; other.x = NaN;
  assert.equal(Spotter.occupancy(me, [me, other], 1000), 0);
  const st = Spotter.fresh();
  assert.deepEqual(run(st, 3, 1), ['three wide']);
  assert.deepEqual(run(st, 1, 1), ['car left']);
  assert.deepEqual(run(st, 0, .25), [], 'clear needs sustained separation');
  assert.deepEqual(run(st, 1, .5), [], 'brief dropout does not repeat the warning');
});

test("spotter never says still there while clearance is being debounced, and ignores invalid dt", () => {
  const st = Spotter.fresh();
  run(st, 1, 1);
  st.t = st.lastCallT + 4;
  assert.equal(Spotter.step(st, 0, .05), '');
  const before = J(st);
  assert.equal(Spotter.step(st, 1, Infinity), '');
  assert.deepEqual(J(st), before);
});

test("routine speech yields to the spotter but race control and pit calls keep priority", () => {
  for (const kind of ['info', 'coach', 'comm', 'race', 'box', 'warning', 'penalty-hit']) {
    const r = radio();
    // Commentary obeys a separate switch; exercise the remaining routine kinds here.
    if (kind === 'comm') continue;
    assert.equal(r.v.say('BOX BOX BOX', 4, kind, .5), true);
    const routine = ['info', 'coach'].includes(kind);
    assert.equal(r.v.yieldToSpotter(), routine, kind);
    assert.equal(r.v.busy(), !routine, kind);
    r.v.stop();
  }
});

test("spotter interrupts routine speech only with a ready clip, retains awareness when muted, and stops on retirement", () => {
  let ready = false, busy = true, yielded = 0, stopped = 0, valid;
  const said = [], me = { s: 100, x: 0, speed: 60 };
  const pack = { ensure() {}, plan: () => ready, busy: ch => ch ? false : busy,
    stop() { stopped++; }, speak(id, text, opt) { said.push(text); valid = opt.valid; return true; } };
  const G = { state: 'race', soundOn: true, player: me, cars: [me, { s: 100, x: -2 }], track: { total: 1000 },
    vTop: () => 100, store: { get: (k, d) => (k === "spotter" ? true : d) }, radio: { pack, busy: () => busy, volume: () => 1,
      yieldToSpotter() { yielded++; busy = false; } } };
  const s = Spotter.create(G);
  for (let i = 0; i < 10; i++) s.update(.05);
  assert.equal(yielded, 0, 'a loading pack cannot cut a useful line');
  ready = true; s.update(.05);
  assert.deepEqual(said, ['Car left.']); assert.equal(yielded, 1);
  assert.equal(valid(), true);
  G.cars[1].s += 20;
  assert.equal(valid(), false, 'a car that left while decoding is not called');
  for (let i = 0; i < 20; i++) s.update(.05);
  assert.deepEqual(said, ['Car left.'], 'discarded speech is not followed by an orphan clear call');
  G.cars[1].s = 100; G.soundOn = false; s.update(.05);
  assert.equal(s.occupied(), true, 'muting speech does not invite coach chatter alongside');
  me.retired = true; s.update(.05);
  assert.equal(s.occupied(), false); assert.ok(stopped > 0);
});

test("recorded engineer and spotter packs do not depend on speechSynthesis existing", () => {
  const calls = [];
  const pack = { ensure() {}, stop() {}, remaining: () => 0, speak: (...a) => { calls.push(a); return true; } };
  const sb = sandbox(['js/audio/radio-voice.js'], { window: {}, GameAudio: {}, VoicePack: { create: () => pack } });
  const v = sb.RadioVoice.create({ state: 'race', soundOn: true, store: { get: (k, d) => d, set() {} } });
  assert.equal(v.pack, pack);
  v.setEnabled(true);
  assert.equal(v.say('BOX BOX BOX', 4, 'race'), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(J(v.voiceList('radio')), []);
  v.stop();
  assert.equal(v.say('KEEP INPUTS SMOOTH', 4, 'coach'), true, 'the coach has a recorded voice too');
  assert.equal(calls.length, 2);
});

test("ensureStaged fetches lap-1 engineer/spotter packs before coach and announcer on a cold cache", async () => {
  const order = [];
  const pending = new Map();
  const man = { clips: { hello: [0, 4, 0.5] } };
  const packResponse = () => ({
    ok: true,
    json: async () => man,
    arrayBuffer: async () => new ArrayBuffer(4),
  });
  const deferFetch = (url) => {
    order.push(url);
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    pending.set(url, () => resolve(packResponse()));
    return promise;
  };
  const resolveFetch = (url) => {
    const go = pending.get(url);
    assert.ok(go, "unexpected resolve: " + url);
    pending.delete(url);
    go();
  };
  const drain = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  const sb = sandbox(["js/audio/voice-pack.js"], {
    GameAudio: { now: () => 0 },
    fetch: deferFetch,
  });
  const P = sb.VoicePack.create({});
  P.ensureStaged([["george"], ["heart", "fable"]]);
  await drain();
  assert.equal(order.length, 2, "tier 0 alone before engineer loads settle");
  assert.ok(order.every((u) => u.includes("george.")), "only engineer fetches started");
  resolveFetch("assets/voice/george.json");
  resolveFetch("assets/voice/george.bin");
  await drain();
  for (let i = 0; i < 20; i++) { await drain(); if (P.ready("george")) break; }
  assert.equal(order.length, 6, "every pack fetch started once engineer tier settled");
  const idx = (id, ext) => order.findIndex((u) => u.endsWith(`${id}.${ext}`));
  assert.ok(idx("george", "json") >= 0 && idx("george", "bin") >= 0, "engineer pack started");
  const coachStart = Math.min(idx("heart", "json"), idx("heart", "bin"));
  const annStart = Math.min(idx("fable", "json"), idx("fable", "bin"));
  assert.ok(coachStart > idx("george", "bin"), "coach waits until engineer tier finishes");
  assert.ok(annStart > idx("george", "bin"), "announcer waits until engineer tier finishes");
  assert.equal(P.ready("george"), true, "engineer ready while lower tiers were still fetching");
  assert.equal(P.ready("heart"), false, "coach still pending when engineer is ready");
  assert.equal(P.ready("fable"), false, "announcer still pending when engineer is ready");
  assert.equal(pending.size, 4, "tier-1 fetches still in flight");
  for (const url of [...pending.keys()]) resolveFetch(url);
  await drain();
  for (let i = 0; i < 20; i++) { await drain(); if (P.ready("heart") && P.ready("fable")) break; }
  assert.equal(P.ready("heart"), true, "coach ready after tier 1 settles");
  assert.equal(P.ready("fable"), true, "announcer ready after tier 1 settles");
  assert.deepEqual([...new Set(order)].sort(), ["assets/voice/fable.bin", "assets/voice/fable.json",
    "assets/voice/george.bin", "assets/voice/george.json", "assets/voice/heart.bin", "assets/voice/heart.json"]);
});

test("ensureStaged does not refetch a pack that is already ready", async () => {
  let calls = 0;
  const sb = sandbox(["js/audio/voice-pack.js"], {
    GameAudio: { now: () => 0 },
    fetch: () => { calls++; return Promise.resolve({ ok: true, json: async () => ({ clips: { a: [0, 4, 1] } }), arrayBuffer: async () => new ArrayBuffer(4) }); },
  });
  const P = sb.VoicePack.create({});
  P.ensureStaged([["george"]]);
  for (let i = 0; i < 20; i++) { await new Promise((r) => setImmediate(r)); if (P.ready("george")) break; }
  assert.equal(calls, 2);
  P.ensureStaged([["george"], ["heart"]]);
  for (let i = 0; i < 20; i++) { await new Promise((r) => setImmediate(r)); if (P.ready("heart")) break; }
  assert.equal(calls, 4, "only the not-yet-loaded pack is fetched");
});

test("RadioVoice ensureVoices stages the engineer pack ahead of coach and announcer", async () => {
  const order = [];
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const man = { clips: { hello: [0, 4, 0.5] } };
  const sb = sandbox(["js/core/mat4.js", "js/audio/voice-pack.js", "js/audio/radio-voice.js"], {
    window: { speechSynthesis: { speak() {}, cancel() {}, resume() {}, getVoices: () => [] }, SpeechSynthesisUtterance: function (t) { this.text = t; } },
    GameAudio: { setRadioDuck() {}, radioStingStop() {} },
    fetch: (url) => {
      order.push(url);
      return delay(url.includes("george.") ? 40 : 5).then(() => Promise.resolve({
        ok: true, json: async () => man, arrayBuffer: async () => new ArrayBuffer(4),
      }));
    },
  });
  const G = { soundOn: true, state: "race", announcer: { enabled: () => true }, store: { get: (k, d) => d, set() {} } };
  const v = sb.RadioVoice.create(G);
  v.setEnabled(true);
  v.say("P3. NICE MOVE", 3, "info");
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && !order.some((u) => u.includes("heart."))) await delay(10);
  assert.ok(order.some((u) => u.includes("heart.")), "coach pack fetch started");
  const coachJson = order.findIndex((u) => u.endsWith("heart.json"));
  const engBin = order.findIndex((u) => u.endsWith("george.bin"));
  assert.ok(engBin >= 0 && coachJson > engBin, "first-race ensure starts engineer before coach");
});

test("loading a selected pack is shared and never fetches the alternatives", async () => {
  const requested = [];
  const sb = sandbox(["js/audio/voice-pack.js"], { fetch: (url) => {
    requested.push(url);
    return Promise.resolve({ ok: true, json: async () => ({ clips: { hello: [0, 4, 1] } }),
      arrayBuffer: async () => new ArrayBuffer(4) });
  } });
  const pack = sb.VoicePack.create({});
  assert.deepEqual(await Promise.all([pack.load("michael"), pack.load("michael")]), [true, true]);
  assert.deepEqual(requested.sort(), ["assets/voice/michael.bin", "assets/voice/michael.json"]);
  assert.equal(pack.ready("george"), false);
  assert.equal(pack.ready("bella"), false);
});

test("VoicePack drops a spotter warning whose situation changed during decoding", async () => {
  let decode, plays = 0, relevant = true;
  const sb = sandbox(['js/audio/voice-pack.js'], {
    GameAudio: { now: () => 0, ctxGen: () => 1, decodeClip: () => new Promise(r => { decode = r; }),
      radioVoice: () => { plays++; return { end: .5, stop() {} }; } },
    fetch: () => Promise.resolve({ ok: true, json: async () => ({ clips: { 'car left': [0, 4, .5] } }), arrayBuffer: async () => new ArrayBuffer(4) }),
  });
  const pack = sb.VoicePack.create({}); pack.ensure('george');
  await new Promise(r => setImmediate(r));
  assert.equal(pack.speak('george', 'car left', { channel: 'spotter', valid: () => relevant }), true);
  relevant = false; decode({ duration: .5 });
  await new Promise(r => setImmediate(r));
  assert.equal(plays, 0); assert.equal(pack.busy(), false);
});

test('the engineer TEST previews the selected recorded source; SYSTEM previews synthesis', async () => {
  const rec=radio(); assert.equal(rec.v.preview('radio'),true);
  assert.ok(rec.packCalls.some(c=>c.id==='george')); assert.deepEqual(rec.spoken,[]);
  assert.equal(rec.v.busy(),true); rec.v.stop();
  const sys=radio({packOn:false}); assert.equal(sys.v.preview('radio'),true);
  assert.equal(sys.packCalls.filter(c=>c.id).length,0); assert.equal(sys.spoken.length,1); sys.v.stop();
});


test('engineer waits for the full spotter clip, and behind a still-decoding one uses a bounded lead instead of being dropped', () => {
  const long = radio({spotterLeft: 1.8});
  assert.equal(long.v.say('BOX BOX BOX', 5, 'info'), true);
  assert.ok(long.packCalls.find(c => c.id).leadS >= 1.88);
  long.v.stop();
  // remaining() is Infinity while the spotter clip decodes; that used to make the
  // budget -Infinity ("too-long") and the BOX line was lost with no retry.
  const pending = radio({spotterLeft: Infinity});
  assert.equal(pending.v.say('BOX BOX BOX', 5, 'info'), true);
  const call = pending.packCalls.find(c => c.id);
  assert.ok(call, 'the line is spoken');
  assert.ok(call.leadS >= 0.6 && call.leadS < 1, 'behind a bounded 0.6 s lead, got ' + call.leadS);
  assert.deepEqual(pending.spoken, []);
  pending.v.stop();
});

test('recorded decoding consumes the card budget and pending clips have no known finish time', async () => {
  for (const delay of [0.1, 1.5]) {
    let now = 0, resolve, ends = 0;
    const plays = [];
    const sb = sandbox(['js/audio/voice-pack.js'], {
      GameAudio: { now: () => now, ctxGen: () => 1,
        decodeClip: () => new Promise(r => { resolve = r; }),
        radioVoice: (parts, at) => { plays.push(at); return {end:at + 0.5, stop(){}}; } },
      fetch: () => Promise.resolve({ok:true, json:async()=>({clips:{'car left':[0,4,0.5]}}), arrayBuffer:async()=>new ArrayBuffer(4)}),
    });
    const pack = sb.VoicePack.create({}); pack.ensure('george');
    await new Promise(r => setImmediate(r));
    assert.equal(pack.speak('george','car left',{channel:'spotter',budgetS:1,onEnd(){ends++;}}),true);
    assert.equal(pack.remaining('spotter'),Infinity,'decoding cannot promise an end time');
    now = delay; resolve({duration:0.5}); await new Promise(r => setImmediate(r));
    assert.equal(plays.length, delay < 1 ? 1 : 0);
    if (delay < 1) assert.ok(Number.isFinite(pack.remaining('spotter')));
    else { assert.equal(pack.busy(),false); assert.equal(ends,1); }
    pack.stop(); assert.equal(ends,1,'completion fires once even after a late stop');
  }
});

test("the decoded clip cache is bounded by SECONDS per voice, oldest out first (perf-memory M-5)", async () => {
  // 80 clips with no size cap could pin ~160 s of announcer PCM (~30 MB). Each
  // clip here is 4 s, so a phone's 24 s budget holds six and desktop's 90 s twenty-two.
  const clips = {};
  for (let i = 0; i < 40; i++) clips["w" + i] = [i * 4, 4, 4];
  const run = async (isMobile) => {
    const decoded = [];
    const sb = sandbox(["js/audio/voice-pack.js"], {
      ...(isMobile ? { GLX: { isMobile: true } } : {}),
      GameAudio: { now: () => 0, ctxGen: () => 1,
        decodeClip: (ab) => { decoded.push(ab.byteLength); return Promise.resolve({ duration: 4 }); },
        radioVoice: (parts, at) => ({ end: at, stop() {} }) },
      fetch: (u) => Promise.resolve({ ok: true, json: () => Promise.resolve({ clips }), arrayBuffer: () => Promise.resolve(new ArrayBuffer(160)) }),
    });
    const P = sb.VoicePack.create({});
    assert.equal(await P.load("george"), true);
    for (let i = 0; i < 30; i++) { P.speak("george", "w" + i, { channel: "radio" }); await new Promise((r) => setImmediate(r)); }
    const d = J(P.debug());
    const n = decoded.length;
    P.speak("george", "w29", { channel: "radio" }); await new Promise((r) => setImmediate(r));
    const newestHit = decoded.length === n;
    P.speak("george", "w0", { channel: "radio" }); await new Promise((r) => setImmediate(r));
    return { d, newestHit, oldestRedecoded: decoded.length === n + 1 };
  };
  const phone = await run(true);
  assert.equal(phone.d.cacheS, 24);
  assert.ok(phone.d.cache.george.secs <= 24, `phone holds ${phone.d.cache.george.secs} s`);
  assert.equal(phone.d.cache.george.clips, 6);
  assert.ok(phone.newestHit, "the most recent clip is still decoded");
  assert.ok(phone.oldestRedecoded, "the oldest was evicted and decodes again from the kept .bin");
  const desk = await run(false);
  assert.equal(desk.d.cacheS, 90);
  assert.equal(desk.d.cache.george.clips, 22, "desktop: the larger budget, still under the 80-clip count bound");
});

// THE PIT GARAGE STOPS THE RADIO. openPitWork freezes the race behind
// #carsetup WITHOUT the pause card, so the #pausemenu observer that halts the
// radio never fires, and the frozen card never ages out: an engineer line, a
// spotter clip and the hiss bed played on over the garage. halt() is the pause
// card's own stop — every channel, duck released — and the garage calls it.
test("the pit garage halts every radio channel the way the pause card does", () => {
  const r = radio();
  assert.equal(r.v.say("BOX BOX BOX", 3, "info", 0.5), true);
  assert.equal(r.v.busy(), true, "precondition: a line is on air");
  assert.equal(r.ducks.at(-1), true, "precondition: the music is ducked under it");
  r.packCalls.length = 0;
  r.v.halt();
  assert.equal(r.v.busy(), false, "the line is gone");
  assert.equal(r.ducks.at(-1), false, "the music comes back up");
  assert.ok(r.packCalls.filter((c) => c === "stop").length >= 2, "the engineer channel and then every channel (the spotter's too) are cut");
  assert.equal(typeof RadioVoice.inert().halt, "function", "the inert radio carries it, so the call site needs no guard");
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const body = game.slice(game.indexOf("function openPitWork() {"), game.indexOf("function closePitWork() {"));
  assert.match(body, /paused = true;/, "precondition: found openPitWork");
  assert.doesNotMatch(body, /setPaused\(/, "precondition: the garage pauses without the card (so the observer cannot help)");
  assert.ok(body.indexOf("radioVoice.halt();") > 0 && body.indexOf("radioVoice.halt();") < body.indexOf('openGarage("pit")'),
    "openPitWork halts the radio before the garage opens");
  assert.match(body, /GameAudio\.stopRain\(\)/,
    "openPitWork stops rain with the engine — the garage is a pause without the card");
  const close = game.slice(game.indexOf("function closePitWork() {"), game.indexOf("function leaveGarage() {"));
  assert.match(close, /if \(isRaining\(\)\) GameAudio\.startRain\(\)/,
    "leaving the pit garage restarts rain the way RESUME does");
});
