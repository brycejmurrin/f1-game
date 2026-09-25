/* radio-voice.test.mjs — the radio's VOICE, without a browser.
 *
 * Almost none of this feature is speech. The speaking is four lines; the rest is
 * policy, and policy is what goes wrong. So `plan()` is a pure function — no
 * DOM, no speechSynthesis, no clock — and this file is mostly that function.
 *
 * The two tests that matter most, and why:
 *
 *  1. BOOT MUST NOT PROBE. create() calls getVoices() ZERO times. On Chrome the
 *     first read is empty and a listener has to fill it later; anyone who
 *     "fixes" that by awaiting the voice list has put a speech API on the boot
 *     path of a racing game. The assertion is a call count, so that edit fails
 *     here rather than on a player's machine.
 *  2. NO SHIPPED LINE OUTLIVES ITS CARD. The real announce() strings are
 *     scraped out of js/ and planned against the real durations. A message that
 *     is still being spoken after its card has gone is the failure this whole
 *     module exists to prevent, and it is asserted against what actually ships
 *     rather than against a hypothetical.
 *
 * Run: node --test tests/unit/radio-voice.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { fnSource } from "../helpers/fn-source.mjs";
// VM timers are UNREF'd: they still fire while a test awaits, but a cue the
// module schedules seconds ahead no longer holds the process open after the
// last assertion (measured 2026-09-24: this file sat idle for most of its run).
const unrefTimeout = (fn, ms, ...a) => { const t = setTimeout(fn, ms, ...a); t.unref?.(); return t; };
// The synth is only ever touched from its own task, never inside say() (the game
// tick): a test lets that task run before it looks at what was spoken.
const flush = () => new Promise((r) => setTimeout(r, 5));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

/** A speechSynthesis stub that records every call, in order. */
function synthStub({ voices = [] } = {}) {
  const calls = [];
  return {
    calls,
    getVoices() { calls.push({ m: "getVoices" }); return voices; },
    speak(u) { calls.push({ m: "speak", text: u.text, voice: u.voice, rate: u.rate, volume: u.volume }); },
    cancel() { calls.push({ m: "cancel" }); },
    resume() { calls.push({ m: "resume" }); },
    set onvoiceschanged(fn) { this._vc = fn; },
  };
}
function load({ api = true, voices = [], stored = {} } = {}) {
  const saved = new Map(Object.entries(stored));
  const ctx = vm.createContext({ Math, JSON, Object, Array, Number, String, Set, console, setTimeout: unrefTimeout, clearTimeout });
  seedLog(ctx);
  const synth = api ? synthStub({ voices }) : null;
  ctx.window = api ? { speechSynthesis: synth, SpeechSynthesisUtterance: function (t) { this.text = t; } } : {};
  ctx.GameAudio = { setRadioDuck() {} };
  vm.runInContext(read("js/audio/radio-voice.js"), ctx, { filename: "js/audio/radio-voice.js" });
  const RV = vm.runInContext("RadioVoice", ctx);
  const G = { soundOn: true, state: "race", store: { get: (k, d) => (saved.has(k) ? saved.get(k) : d), set: (k, v) => saved.set(k, v) } };
  return { RV, G, synth, saved };
}
const { RV } = load();
const P = (over = {}) => RV.plan(Object.assign({ msg: "BOX BOX BOX", life: 3, kind: "info", enabled: true, soundOn: true, state: "race", api: true, volume: 1 }, over));

// ── 1. It degrades, and boot never touches it ───────────────────────────────

test("no speechSynthesis: create() returns an inert instance and nothing throws", () => {
  const { RV: R, G } = load({ api: false });
  const v = R.create(G);
  assert.equal(v.available(), false);
  assert.equal(v.say("BOX BOX BOX", 3, "info"), false);
  v.stop(); v.unlock(); v.setEnabled(true);          // all no-ops, none may throw
  assert.equal(R.inert().say(), false);
});

test("create() never reads the voice list — boot must not wait on a speech API", () => {
  const { RV: R, G, synth } = load({ voices: [{ name: "A", lang: "en-GB", localService: true }] });
  const v = R.create(G);
  assert.equal(synth.calls.filter((c) => c.m === "getVoices").length, 0,
    "create() probed the voice list; on Chrome the first read is empty and this is how a speech API ends up on the boot path");
  assert.equal(typeof v.say, "function");
  assert.equal(typeof v.then, "undefined", "create() must be synchronous, not a thenable");
});

// ── 2. plan(): every refusal, by reason ─────────────────────────────────────

test("plan refuses for exactly one reason at a time, and names it", () => {
  assert.equal(P({ enabled: false }).reason, "off");
  assert.equal(P({ soundOn: false }).reason, "master-off");
  assert.equal(P({ api: false }).reason, "no-api");
  // The title screen's career-conflict card is not radio.
  assert.equal(P({ state: "menu" }).reason, "not-racing");
  assert.equal(P({ msg: "   " }).reason, "empty");
  assert.equal(P({ state: "count" }).speak, true, "the countdown is the race's first seconds");
  assert.equal(P().speak, true);
});

test("a line that cannot fit its card is REFUSED, never trimmed", () => {
  // These lines are diagnosis then instruction — "FRONTS ARE GOING — BRAKE
  // EARLIER". Trimming keeps the diagnosis and drops the part you act on, and a
  // truncated instruction at 300 km/h is worse than silence. Silence still
  // leaves the card, which says everything.
  const long = new Array(60).fill("WORD").join(" ");
  const p = P({ msg: long, life: 3 });
  assert.equal(p.speak, false);
  assert.equal(p.reason, "too-long");
  // …and a line that only just misses is sped up rather than refused.
  const mid = new Array(10).fill("WORD").join(" ");
  const fast = P({ msg: mid, life: 3.5 });
  assert.equal(fast.speak, true);
  assert.ok(fast.rate > RV.TONE.radio.rate, "the rate should have been raised to make it fit");
  assert.ok(fast.rate <= RV.RATE_MAX);
});

// ── 3. The three speakers, and the map that must stay total ─────────────────

test("every ANN_PRI kind resolves to a speaker, and the map agrees with radioWho", () => {
  // Scraped from js/game.js, so adding a `kind` there turns the fast gate red
  // until the radio knows about it — rather than that kind silently speaking in
  // the engineer's voice because it fell through a default.
  const g = read("js/game.js");
  const kinds = [...g.match(/const ANN_PRI = \{([^}]*)\}/)[1].matchAll(/"?([a-z-]+)"?\s*:/g)].map((m) => m[1]);
  assert.ok(kinds.length >= 7, `expected the ANN_PRI keys, got ${kinds.join(",")}`);
  const who = g.match(/function radioWho\(kind\) \{[\s\S]*?\n\}/)[0];
  for (const k of kinds) {
    const speaker = RV.SPEAKERS[k];
    assert.ok(speaker, `ANN_PRI has "${k}" but RadioVoice.SPEAKERS does not`);
    assert.ok(RV.TONE[speaker], `speaker ${speaker} has no prosody`);
    // radioWho's own partition: race control kinds, coach kinds, the rest.
    const inControl = new RegExp(`"${k}"[^)]*\\)\\s*return "RACE CONTROL"`).test(who)
      || new RegExp(`return "RACE CONTROL"`).test(who) && who.split("RACE CONTROL")[0].includes(`"${k}"`);
    const inCoach = who.split("COACH")[0].includes(`"${k}"`) && !who.split("RACE CONTROL")[0].includes(`"${k}"`);
    // The broadcaster (js/race/race-radio.js) has its own WHO line and speaks
    // in the announcer's voice rather than on any of the three pit channels.
    const inComm = new RegExp(`"${k}"\\)\\s*return "COMMENTARY"`).test(who);
    if (inComm) assert.equal(speaker, "announcer", `${k} is the commentator in radioWho but ${speaker} here`);
    else if (inControl) assert.equal(speaker, "control", `${k} is race control in radioWho but ${speaker} here`);
    else if (inCoach) assert.equal(speaker, "coach", `${k} is the coach in radioWho but ${speaker} here`);
    else assert.equal(speaker, "radio", `${k} is the driver's channel in radioWho but ${speaker} here`);
  }
});

// ── 4. The words, normalised ────────────────────────────────────────────────

test("speakable strips what the card shows and fixes what engines mispronounce", () => {
  const s = RV.speakable;
  assert.equal(s("BOX BOX BOX — H"), "box box box, h");
  assert.equal(s("+5s TRACK LIMITS"), "plus 5 seconds track limits");
  assert.equal(s("TRACK LIMITS 2/4"), "track limits 2 of 4");
  assert.equal(s("STOP 2.4s — P5"), "stop 2.4 seconds, P 5");
  // Caps are kept only where they are an initialism, because several engines
  // spell a short all-caps token letter by letter.
  assert.match(s("DRS ENABLED"), /^DRS enabled$/);
  // "any three capitals is a code" was the shortcut, and it spelled BOX out
  // letter by letter. A driver code reading as a word is the acceptable cost.
  assert.equal(s("VER HAS BOXED"), "ver has boxed");
  assert.equal(s("…"), "");
  assert.equal(s(null), "");
});

test("no shipped radio line outlives its card", () => {
  // The real strings and the real durations, scraped from the tree. This is the
  // assertion that keeps the feature honest as the corpus grows.
  const files = ["js/game.js", "js/race/engineer.js", "js/race/pit-lane.js", "js/race/driving-coach.js",
    "js/race/race-insights.js", "js/race/session-records.js"];
  let checked = 0, refused = [];
  for (const f of files) {
    for (const m of read(f).matchAll(/announce\(\s*"([^"]{4,})"\s*,\s*([\d.]+)\s*(?:,\s*"([a-z-]+)")?\s*\)/g)) {
      const [, msg, dur, kind] = m;
      const life = Math.max(3, (+dur || 1.6) + 0.5);
      const p = P({ msg, life, kind: kind || "race" });
      checked++;
      if (!p.speak) refused.push(`${f}: "${msg}" (${p.reason})`);
    }
  }
  assert.ok(checked >= 10, `expected to find the shipped lines, found ${checked}`);
  // A SHORT, NAMED list, the way the repo handles every other justified
  // exception. Both of these are prose rather than radio: onboarding copy and a
  // drill refusal, neither of which is a call about something happening now.
  // A NEW entry here means somebody wrote a radio line nobody can hear.
  const ALLOWED_LONG = [
    'js/game.js: "ROOKIE — the car brakes, steers and accelerates with you. Turn it down in SETTINGS as you get quicker." (too-long)',
    'js/race/race-insights.js: "A START DRILL NEEDS OTHER CARS ON THE GRID" (too-long)',
  ];
  assert.deepEqual(refused.filter((r) => !ALLOWED_LONG.includes(r)), [],
    "these shipped lines cannot be spoken inside their card");
});

// ── 5. The speak path, at the API boundary ──────────────────────────────────

test("a preempt is cancel-then-speak-then-RESUME, which is the bug workaround", async () => {
  // Bugzilla 1522074 (open, Firefox AND Chrome): a speak() directly after a
  // cancel() is silently dropped. Without resume() the line that goes missing
  // is the PENALTY that interrupted, not the wear report it interrupted — the
  // priority order inverts in the audio channel while the picture gets it
  // right, which is worse than never speaking at all.
  const { RV: R, G, synth } = load({ stored: { radioVoice: true }, voices: [{ name: "A", lang: "en-GB", localService: true }] });
  const v = R.create(G);
  assert.equal(v.say("TYRES AT 50%", 3, "info"), true);
  assert.equal(synth.calls.filter((c) => c.m !== "getVoices").length, 0, "nothing touches the synth inside the game tick");
  await flush();
  assert.equal(v.say("5 SECOND PENALTY", 3, "penalty-hit"), true);
  await flush();
  const seq = synth.calls.filter((c) => ["cancel", "speak", "resume"].includes(c.m)).map((c) => c.m);
  // No cancel before the first line (nothing was speaking — a cancel on every
  // line was synchronous IPC in every frame), and resume() only after a cancel.
  assert.deepEqual(seq, ["speak", "cancel", "speak", "resume"]);
  const spoken = synth.calls.filter((c) => c.m === "speak");
  assert.match(spoken.at(-1).text, /penalty/, "the interrupting line is the one left speaking");
});

test("an empty voice list still speaks — that is the Safari path, not a refusal", async () => {
  // Safari returns nothing from getVoices() and picks a system default itself.
  // A design that requires a voice object before speaking is silent on Safari.
  const { RV: R, G, synth } = load({ stored: { radioVoice: true }, voices: [] });
  const v = R.create(G);
  assert.equal(v.say("BOX BOX BOX", 3, "info"), true);
  await flush();
  const spoke = synth.calls.find((c) => c.m === "speak");
  assert.equal(spoke.voice, null, "voice = null is legal and is what Safari needs");
});

test("a REMOTE voice is never chosen — its lead-in is unbounded", async () => {
  const { RV: R, G, synth } = load({ stored: { radioVoice: true },
    voices: [{ name: "Google UK", lang: "en-GB", localService: false }, { name: "Local", lang: "en-GB", localService: true }] });
  const v = R.create(G);
  v.say("BOX BOX BOX", 3, "info");
  await flush();
  const spoke = synth.calls.find((c) => c.m === "speak");
  assert.equal(spoke.voice && spoke.voice.name, "Local");
});

test("a card that will not be spoken still ends the words of the card it replaced", async () => {
  // The shipped defaults: TEAM RADIO off, the announcer on.
  const { RV: R, G, synth } = load();
  G.announcer = { enabled: () => true };
  const v = R.create(G);
  assert.equal(v.say("GASLY MAKES THE MOVE ON BOTTAS", 4, "comm"), true);
  await flush();
  assert.ok(synth.calls.some((c) => c.m === "speak"), "precondition: the commentator is talking");
  const cancels = synth.calls.filter((c) => c.m === "cancel").length;
  assert.equal(v.say("SAFETY CAR, SAFETY CAR. NO OVERTAKING", 3, "race"), false, "precondition: TEAM RADIO off does not speak the flag");
  await flush();
  assert.ok(synth.calls.filter((c) => c.m === "cancel").length > cancels, "the commentary kept talking over the flag card");
});

test("the setting round-trips, and turning it off stops a line in flight", async () => {
  const { RV: R, G, synth, saved } = load({ stored: { radioVoice: true } });
  const v = R.create(G);
  assert.equal(v.say("BOX BOX BOX", 3, "info"), true);
  await flush();
  v.setEnabled(false);
  await flush();
  assert.ok(synth.calls.some((c) => c.m === "cancel"), "disabling must silence what is already speaking");
  assert.equal(v.say("BOX BOX BOX", 3, "info"), false);
  assert.equal(v.setVolume(2), 1, "volume clamps to 0..1");
  assert.equal(v.setVolume(-1), 0);
  // Default is OFF: a fresh store speaks nothing until asked.
  const blank = load();
  assert.equal(blank.RV.create(blank.G).say("BOX BOX BOX", 3, "info"), false, "the radio ships OFF");
  assert.equal(blank.saved.has("radioVoice"), false, "create() must not write the setting; the panel owns it");
});

// ── 8. PER-CHANNEL TUNING ────────────────────────────────────────────────────
// sameTone, not deepEqual: toneFor() builds its result inside the vm realm the
// module is loaded in, so a strict deepEqual against a host-realm literal fails
// on prototype identity with every value matching. That has now cost three
// tests in this repo; compare the numbers.
const sameTone = (got, want, msg) => {
  assert.equal(got.pitch, want.pitch, `${msg}: pitch`);
  assert.equal(got.rate, want.rate, `${msg}: rate`);
};
// The three channels were always distinct (SPEAKERS/TONE); what is new is that
// a player may re-voice and re-tune each one. The risk is not a crash — it is a
// stored value silencing a channel, because the tune comes out of localStorage
// and can be stale, hand-edited, or from a machine with different voices.

test("toneFor is the shipped default until a tune overrides it, per channel", () => {
  for (const sp of Object.keys(RV.TONE)) {
    sameTone(RV.toneFor(sp, null), RV.TONE[sp], `${sp}: no tune must be the shipped prosody`);
    sameTone(RV.toneFor(sp, {}), RV.TONE[sp], `${sp}: an empty tune is no tune`);
  }
  // One channel tuned leaves the other two alone — that is what "per group" means.
  const t = { coach: { pitch: 1.4, rate: 0.8 } };
  sameTone(RV.toneFor("coach", t), { pitch: 1.4, rate: 0.8 }, "coach takes its tune");
  sameTone(RV.toneFor("control", t), RV.TONE.control, "control is untouched by coach's tune");
});

test("a junk or out-of-range tune falls back rather than silencing a channel", () => {
  // Every one of these is reachable: a hand-edited store, a save from a build
  // with a wider range, a half-written record. None may produce a pitch or rate
  // the speech API rejects — the card is the floor, the voice is the extra.
  const bad = [undefined, null, NaN, "loud", Infinity, -1, 0, 99, {}, []];
  for (const v of bad) {
    const t = RV.toneFor("radio", { radio: { pitch: v, rate: v } });
    assert.ok(Number.isFinite(t.pitch) && t.pitch >= RV.PITCH_MIN && t.pitch <= RV.PITCH_MAX,
      `pitch ${String(v)} produced ${t.pitch}`);
    assert.ok(Number.isFinite(t.rate) && t.rate >= RV.RATE_MIN && t.rate <= RV.RATE_MAX,
      `rate ${String(v)} produced ${t.rate}`);
  }
  // A partial record keeps the default for the field it omits.
  assert.equal(RV.toneFor("radio", { radio: { pitch: 1.5 } }).rate, RV.TONE.radio.rate);
});

test("a tuned rate reaches plan, and the card budget still wins over it", () => {
  const base = { msg: "box box", life: 3, kind: "box", enabled: true, soundOn: true, state: "race", api: true };
  assert.equal(RV.plan(base).rate, RV.TONE.radio.rate, "untuned is the shipped rate");
  assert.equal(RV.plan({ ...base, tune: { radio: { rate: 0.7 } } }).rate, 0.7, "a tuned rate is used");
  assert.equal(RV.plan({ ...base, tune: { radio: { pitch: 1.3 } } }).pitch, 1.3);
  // THE BUDGET OVERRIDES THE PREFERENCE, and that is not a bug to report as
  // "the slider does nothing": a long line at a slow rate outlives its card, so
  // plan() lifts it to RATE_MAX and refuses only if it STILL will not fit.
  const long = { ...base, msg: "box box box this lap we are switching to the hard tyre and expect traffic", life: 3 };
  const slow = RV.plan({ ...long, tune: { radio: { rate: 0.6 } } });
  assert.ok(slow.rate === RV.RATE_MAX || !slow.speak,
    `a slow tune on a long line must be sped up or refused, got rate ${slow.rate} speak ${slow.speak}`);
});

test("the tune cannot reach a channel that does not exist", () => {
  // SPEAKERS maps every kind onto one of three; a tune keyed by anything else
  // is a stale save, and must not become a fourth channel by accident.
  const t = { engineer: { pitch: 1.5, rate: 1.3 } };
  for (const sp of Object.keys(RV.TONE)) {
    sameTone(RV.toneFor(sp, t), RV.TONE[sp], `${sp} was moved by a tune for a channel that does not exist`);
  }
  // An unknown speaker resolves to the driver's channel, never to undefined.
  sameTone(RV.toneFor("nobody", null), RV.TONE.radio, "an unknown speaker is the driver's channel");
});

test("every channel has a preview line, and it survives speakable()", () => {
  for (const sp of Object.keys(RV.TONE)) {
    const line = RV.SAMPLE[sp];
    assert.ok(line && line.length > 10, `${sp}: no sample line to preview with`);
    const said = RV.speakable(line);
    assert.ok(said.length > 5, `${sp}: sample normalises to "${said}"`);
    assert.ok(!/[A-Z]{2,}/.test(said.replace(/\b(DRS|ERS|VSC|SC|MGU|PB|P\d{1,2})\b/g, "")),
      `${sp}: sample leaves an all-caps token engines spell out: "${said}"`);
  }
  // The control sample carries a penalty, which is the speakable() case that
  // matters most — "+5s" must become words, not be read as punctuation.
  assert.match(RV.speakable(RV.SAMPLE.control), /plus 5 seconds/);
});

// The INSTANCE side of tuning — the pure half is above; these are the parts that
// touch the store and the synth, exercised through the same stub the voice tests
// use. The VM game harness cannot reach any of this: it has no speechSynthesis,
// so create() hands back inert() and every setter is a no-op that returns false.

const LOCAL = (name, lang = "en-GB") => ({ name, lang, localService: true });

test("a tune round-trips through the store, per channel, and resets", () => {
  const { RV, G, saved } = load({ stored: { radioVoice: true } });
  const r = RV.create(G);
  assert.equal(r.available(), true, "the stub synth must give a live instance, not inert()");

  assert.equal(r.setTune("coach", { pitch: 1.3, rate: 0.8 }), true);
  assert.equal(r.tuneFor("coach").pitch, 1.3);
  assert.equal(r.tuneFor("coach").rate, 0.8);
  // The OTHER channels are untouched — the whole point of "per group".
  assert.equal(r.tuneFor("radio").rate, RV.TONE.radio.rate);
  assert.equal(r.tuneFor("control").pitch, RV.TONE.control.pitch);

  // One key, one object — the store guard wants a key to mean one type.
  const stored = saved.get("voiceTune");
  assert.ok(stored && typeof stored === "object", "voiceTune must persist as one record");
  assert.deepEqual(Object.keys(stored), ["coach"], "only the tuned channel is written");

  assert.equal(r.setTune("coach", null), true, "a null patch resets");
  assert.equal(r.tuneFor("coach").pitch, RV.TONE.coach.pitch, "reset is the shipped default again");
  assert.equal(r.setTune("nobody", { pitch: 1.2 }), false, "an unknown channel is refused, not created");
});

test("a stored tune is read at create() and reaches the utterance", async () => {
  const { RV, G, synth } = load({
    voices: [LOCAL("Alpha"), LOCAL("Beta")],
    stored: { radioVoice: true, voiceTune: { radio: { pitch: 1.25, rate: 0.9, name: "Beta" } } },
  });
  const r = RV.create(G);
  r.say("box box", 9, "box");
  await flush();
  const spoke = synth.calls.filter((c) => c.m === "speak").pop();
  assert.ok(spoke, "nothing was spoken");
  assert.equal(spoke.rate, 0.9, "the stored rate must reach the utterance");
  assert.equal(spoke.voice && spoke.voice.name, "Beta", "the stored voice must be the one chosen");
});

test("a stored voice that is no longer installed falls back, it does not silence the channel", async () => {
  // The realistic case: the save was made on another machine, or an OS update
  // removed a voice. Picking by NAME is what makes this recoverable at all — a
  // stored INDEX would silently become a different voice instead.
  const { RV, G, synth } = load({
    voices: [LOCAL("Alpha"), LOCAL("Beta")],
    stored: { radioVoice: true, voiceTune: { radio: { name: "A Voice That Left" } } },
  });
  const r = RV.create(G);
  assert.equal(r.say("box box", 9, "box"), true, "a missing voice must not stop the line");
  await flush();
  const spoke = synth.calls.filter((c) => c.m === "speak").pop();
  assert.ok(spoke.voice && spoke.voice.name, "it fell through to no voice at all");
  assert.ok(["Alpha", "Beta"].includes(spoke.voice.name), "it must land on an installed voice");
});

test("preview speaks the channel being tuned, with the TEAM RADIO switch either way", () => {
  const { RV, G, synth } = load({ voices: [LOCAL("Alpha")], stored: { radioVoice: true } });
  const r = RV.create(G);
  assert.equal(r.preview("control"), true);
  const spoke = synth.calls.filter((c) => c.m === "speak").pop();
  assert.match(spoke.text, /plus 5 seconds/, "the control sample is the penalty line, spoken");
  assert.equal(spoke.rate, RV.TONE.control.rate, "…at that channel's prosody");

  // A preview is NOT a say(): plan() refuses everything outside a race on
  // purpose, and the settings panel is exactly that case.
  //
  // IT IS ALSO NOT GATED ON THE SWITCH, and it was until 2026-09-20. TEAM RADIO
  // ships OFF, so in the shipped state every TEST button on the settings sheet
  // did nothing while the copy beside them promised "TEST to hear it without
  // starting a race" — a dead control with no explanation. Pressing TEST is the
  // consent; the switch keeps the meaning that matters, below.
  const off = load({ voices: [LOCAL("Alpha")], stored: { radioVoice: false } });
  const silent = off.RV.create(off.G);
  assert.equal(silent.preview("control"), true, "TEST must work on the sheet that offers it");
  assert.equal(silent.say("box box", 9, "box"), false,
    "…and OFF still means off where it counts: the radio stays silent through the race");
});

test("master sound silences a preview — that switch means silence", () => {
  // speechSynthesis is not in the WebAudio graph, so nothing else stops it.
  const q = load({ voices: [LOCAL("Alpha")], stored: { radioVoice: true } });
  q.G.soundOn = false;
  assert.equal(q.RV.create(q.G).preview("control"), false);
});

/* ── A PREEMPTED LINE MUST NOT TURN OFF THE ONE THAT REPLACED IT ─────────────
 *
 * Found by survey 2026-09-18, and it lands on exactly the lines this module was
 * built for. `deadline` and the music duck are instance state, and every
 * utterance shared ONE handler. speechSynthesis fires a cancelled line's
 * end/error ASYNCHRONOUSLY — after the replacement has started — so the dead
 * line's callback ran against the live one: it released the music duck under a
 * penalty call that was still speaking, and cleared that call's hard stop, the
 * one guarantee this module documents itself as providing ("spoken after it
 * left the screen").
 *
 * The stub below models the ONE behaviour the existing synthStub does not: a
 * cancel() ends the utterance that was speaking, on a later turn. That is not
 * embellishment — it is the whole bug.
 */
function lateCancelSynth() {
  const calls = [];
  let speaking = null;
  const pendingEnds = [];
  return {
    calls,
    getVoices() { return []; },
    speak(u) { calls.push({ m: "speak", text: u.text }); speaking = u; },
    cancel() {
      calls.push({ m: "cancel" });
      // The browser does not call this synchronously; queue it for the test to
      // release once the replacement line is already under way.
      if (speaking) { pendingEnds.push(speaking); speaking = null; }
    },
    resume() { calls.push({ m: "resume" }); },
    set onvoiceschanged(fn) { this._vc = fn; },
    /** Fire every queued end/error, the way the engine eventually does. */
    flushEnds() { const q = pendingEnds.splice(0); for (const u of q) if (u.onend) u.onend(); return q.length; },
  };
}

function loadWithSynth(synth) {
  const ducks = [];
  const ctx = vm.createContext({ Math, JSON, Object, Array, Number, String, Set, console, setTimeout: unrefTimeout, clearTimeout });
  seedLog(ctx);
  ctx.window = { speechSynthesis: synth, SpeechSynthesisUtterance: function (t) { this.text = t; } };
  ctx.GameAudio = { setRadioDuck(on) { ducks.push(!!on); } };
  vm.runInContext(read("js/audio/radio-voice.js"), ctx, { filename: "js/audio/radio-voice.js" });
  const RV = vm.runInContext("RadioVoice", ctx);
  const G = { soundOn: true, state: "race", store: { get: (k, d) => (k === "radioVoice" ? true : d), set: () => {} } };
  return { voice: RV.create(G), ducks };
}

test("a cancelled line's late end does not un-duck the line that replaced it", async () => {
  const synth = lateCancelSynth();
  const { voice, ducks } = loadWithSynth(synth);
  assert.equal(voice.say("Brake a little earlier here", 3, "coach"), true, "the coach line speaks");
  await flush();
  assert.equal(voice.say("Car 44, track limits — +5s penalty", 3, "penalty-hit"), true, "the penalty preempts it");
  await flush();
  const duckedBefore = ducks[ducks.length - 1];
  assert.equal(duckedBefore, true, "the penalty is speaking, so the music is ducked");

  assert.equal(synth.flushEnds(), 1, "the cancelled coach line reports its end, late");
  assert.equal(ducks[ducks.length - 1], true,
    "the DEAD coach line released the duck while the penalty was still speaking — the music jumps back up " +
    "underneath the one line the player most needs to hear");
});

test("a cancelled line's late end does not disarm the replacement's hard stop", async () => {
  const synth = lateCancelSynth();
  const { voice } = loadWithSynth(synth);
  voice.say("Brake a little earlier here", 3, "coach");
  // ONE word and a 0.6 s life: budget = life - LEAD_RESERVE(0.25) = 0.35 s, which
  // beats estimate("box") at RATE_MAX (1 / (2.4 * 1.35) = 0.31 s) so the line is
  // actually spoken, and puts the hard stop 350 ms out — inside this test rather
  // than behind a fake clock. A first draft asked for a 100 ms budget and plan()
  // rightly refused to speak a 2.5 s penalty call into it, so nothing armed.
  assert.equal(voice.say("Box", 0.6, "penalty-hit"), true, "the preempting line must actually speak");
  synth.flushEnds();                       // the dead coach line, arriving late
  const cancelsBefore = synth.calls.filter((c) => c.m === "cancel").length;
  await new Promise((r) => setTimeout(r, 520));
  const cancelsAfter = synth.calls.filter((c) => c.m === "cancel").length;
  assert.ok(cancelsAfter > cancelsBefore,
    "the penalty's hard stop never fired: a stale handler had cleared it, so a line whose end event never " +
    "arrives keeps the radio open and the music ducked for the rest of the race");
});

test("an engine that ends an utterance inside speak() still leaves it live", () => {
  // Claiming `current` BEFORE speak() rather than after. Some engines report a
  // refused utterance immediately, synchronously, from inside speak() — and if
  // the line has not been claimed yet, its OWN end runs as a stranger: the duck
  // it just raised is never released and the radio stays open over the music
  // for the rest of the session. Mutation-checked: move the claim after speak()
  // and this is the test that fails.
  const ducks = [];
  const calls = [];
  const synth = {
    calls, getVoices: () => [], cancel() { calls.push({ m: "cancel" }); }, resume() {},
    speak(u) { calls.push({ m: "speak" }); if (u.onend) u.onend(); },   // ends where it starts
    set onvoiceschanged(fn) { this._vc = fn; },
  };
  const ctx = vm.createContext({ Math, JSON, Object, Array, Number, String, Set, console, setTimeout: unrefTimeout, clearTimeout });
  seedLog(ctx);
  ctx.window = { speechSynthesis: synth, SpeechSynthesisUtterance: function (t) { this.text = t; } };
  ctx.GameAudio = { setRadioDuck(on) { ducks.push(!!on); } };
  vm.runInContext(read("js/audio/radio-voice.js"), ctx, { filename: "js/audio/radio-voice.js" });
  const RV = vm.runInContext("RadioVoice", ctx);
  const voice = RV.create({ soundOn: true, state: "race",
    store: { get: (k, d) => (k === "radioVoice" ? true : d), set: () => {} } });

  assert.equal(voice.say("Box", 3, "info"), true);
  assert.equal(ducks[ducks.length - 1], false,
    "the utterance ended, so the duck must be released — a line whose end ran before it was claimed leaves " +
    "the music ducked with nothing speaking");
});

/* ── THE iOS PRIMING GESTURE ─────────────────────────────────────────────────
 *
 * Reported 2026-09-18: on iPhone/iPad, nothing is EVER spoken — not a penalty,
 * not the coach, not even the settings preview. Two earlier fixes in this file
 * were both about what happens after a line starts, so neither could have
 * helped: on iOS no line ever started.
 *
 * WebKit refuses speechSynthesis.speak() outside a user gesture until the engine
 * has been primed by a speak() INSIDE one, and unlock() — called from the game's
 * first-gesture listener and from the radio toggle's own click — is the only
 * place that ever happens. It did `u.volume = 0; speak(u); cancel();`, which
 * primes nothing: cancelling in the same turn discards the utterance before it
 * is processed, and a muted utterance is not reliably counted. Every later say()
 * runs in the race loop, outside any gesture, so every one was refused.
 *
 * These pin the two halves, because both are invisible on every desktop engine —
 * which is precisely why it shipped.
 */
test("unlock() does not cancel the utterance that primes the engine", () => {
  const { RV, G, synth } = load();
  RV.create(G).unlock();
  const seq = synth.calls.filter((c) => ["speak", "cancel"].includes(c.m)).map((c) => c.m);
  assert.deepEqual(seq, ["speak"],
    "a cancel() in the same turn discards the priming utterance before iOS processes it, spending the one " +
    "gesture the platform gives us and leaving the engine locked for the rest of the session");
});

test("unlock() primes with an audible-volume utterance, not a muted one", () => {
  const { RV, G, synth } = load();
  RV.create(G).unlock();
  const spoke = synth.calls.find((c) => c.m === "speak");
  assert.ok(spoke, "unlock must speak");
  assert.ok(spoke.volume > 0,
    "WebKit does not reliably count a MUTED utterance as the audible speak that unlocks the engine; a space " +
    "has no phonemes so it stays inaudible whatever the volume says");
});

/* ── ASKED vs STARTED: the counter that ends the guessing ────────────────────
 *
 * Three rounds of "still isn't working" came from one gap: a speech engine that
 * REFUSES a speak() does it silently — no error, no event, nothing logged — so
 * "we never asked" and "we asked and the platform swallowed it" are the same
 * symptom from outside. They need opposite fixes. debug().asked and .started
 * separate them, and js/audio/panel.js prints the verdict where the player can
 * read it instead of relaying a feeling.
 */
test("debug() separates what we asked for from what the engine started", async () => {
  const calls = [];
  let pending = null;
  const synth = {
    getVoices: () => [], cancel() {}, resume() {},
    speak(u) { calls.push(u); pending = u; },
    set onvoiceschanged(fn) { this._vc = fn; },
    /** The engine actually beginning — what iOS never does when unprimed. */
    begin() { if (pending && pending.onstart) pending.onstart(); },
  };
  const ctx = vm.createContext({ Math, JSON, Object, Array, Number, String, Set, console, setTimeout: unrefTimeout, clearTimeout });
  seedLog(ctx);
  ctx.window = { speechSynthesis: synth, SpeechSynthesisUtterance: function (t) { this.text = t; } };
  ctx.GameAudio = { setRadioDuck() {} };
  vm.runInContext(read("js/audio/radio-voice.js"), ctx, { filename: "js/audio/radio-voice.js" });
  const RV = vm.runInContext("RadioVoice", ctx);
  const voice = RV.create({ soundOn: true, state: "race",
    store: { get: (k, d) => (k === "radioVoice" ? true : d), set: () => {} } });

  assert.deepEqual([voice.debug().asked, voice.debug().started], [0, 0], "nothing attempted yet");

  voice.say("Box", 3, "info");
  await flush();
  assert.equal(voice.debug().asked, 1, "the speak was handed to the platform");
  assert.equal(voice.debug().started, 0,
    "...and the engine has not begun it — which is exactly the state an unprimed iOS engine sits in for ever, " +
    "reporting nothing, and is what the panel must be able to tell the player");

  synth.begin();
  assert.equal(voice.debug().started, 1, "onstart is the only proof a line was actually voiced");
});

test("the settings preview counts too — it speaks directly, bypassing plan()", () => {
  // The preview is the player's one test button. If it is silent and uncounted,
  // pressing it teaches them nothing.
  const { RV, G, synth } = load();
  const voice = RV.create(Object.assign({}, G, { soundOn: true }));
  voice.setEnabled(true);
  voice.preview("control");
  assert.ok(voice.debug().asked > 0, "a preview must be counted like any other attempt");
});

test("every channel the radio partitions into is a considered decision in the engine", () => {
  // TWO TABLES, ONE FACT. RadioVoice.SPEAKERS maps a `kind` onto a channel and
  // js/audio/engine.js RADIO_CH gives that channel its click, hiss and squelch.
  // A channel added to one and forgotten in the other is silent — which is the
  // right default, and exactly why it would never be noticed. This is what makes
  // the silence deliberate.
  const RV = load().RV;
  const engine = read("js/audio/engine.js");
  const table = engine.match(/const RADIO_CH = Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(table, "could not find RADIO_CH in js/audio/engine.js");
  const voiced = new Set([...table[1].matchAll(/^\s*(\w[\w-]*):/gm)].map((m) => m[1]));
  // `coach` is the deliberate omission: the driving coach is not on a radio.
  // `announcer` too: in-race commentary (kind "comm") is the TV booth, not a
  // radio transmission, so it gets no click, hiss or squelch.
  const SILENT = new Set(["coach", "announcer"]);
  for (const ch of new Set(Object.values(RV.SPEAKERS)))
    assert.ok(voiced.has(ch) || SILENT.has(ch),
      `channel "${ch}" has no entry in RADIO_CH and is not in this test's silent set — decide which`);
  for (const ch of voiced)
    assert.ok(!SILENT.has(ch), `"${ch}" is listed as silent here but RADIO_CH gives it a sound`);
});

test("the sting is gated on the session, exactly as plan() is", () => {
  // showAnnounce draws MENU cards too — the title screen's save-conflict card is
  // the one plan() names. A radio squelch under it claims a transmission that is
  // not happening, on a screen where no car is running.
  const game = read("js/game.js");
  assert.match(game, /if \(state === "race" \|\| state === "count"\) GameAudio\.radioSting\(/);
  // ...and the VOICE gets the same channel's cue length as its lead, from the
  // engine rather than a second copy of the note table, so the words start when
  // the figure ends instead of underneath it.
  assert.match(game, /GameAudio\.radioLeadS\(_annCh\)/);
  assert.match(game, /radioVoice\.say\(msg, announceT, kind, _annLead\)/);
});

test("waiting for the courtesy figure costs no shipped line its voice", () => {
  /* THE WORDS NOW START AFTER THE CUE, which means the cue comes out of the
   * budget — and a budget that shrinks can silence a line that used to fit.
   * This is the measurement that says it does not. The engineer's figure is
   * four notes (~0.425 s) and race control's is two (~0.25 s); the lead is read
   * from js/audio/engine.js so the two cannot drift.
   *
   * A NEW entry here means the cue just took a line off the air, and the
   * trade has to be made deliberately rather than discovered by a player. */
  const src = read("js/audio/engine.js");
  const table = src.match(/const RADIO_CH = Object\.freeze\(\{([\s\S]*?)\n  \}\);/);
  assert.ok(table, "could not find RADIO_CH");
  const leadOf = (speaker) => {
    // up to the figure's closing "]]" — the notes are themselves arrays, so a
    // lazy [^\]] scan stops inside the first note instead of after the last.
    const row = table[1].match(new RegExp(speaker + ":[\\s\\S]*?tune: \\[([\\s\\S]*?\\]\\])"));
    if (!row) return 0;
    return 0.03 + [...row[1].matchAll(/\[\s*[\d.]+\s*,\s*([\d.]+)/g)].reduce((a, m) => a + +m[1], 0);
  };
  const leads = { control: leadOf("control"), radio: leadOf("radio"), coach: 0 };
  assert.ok(leads.radio > 0.3, "the engineer's figure should be four notes: " + leads.radio);
  assert.ok(leads.control > 0.1 && leads.control < leads.radio, "race control's is shorter: " + leads.control);

  const files = ["js/game.js", "js/race/engineer.js", "js/race/pit-lane.js", "js/race/driving-coach.js",
    "js/race/race-insights.js", "js/race/session-records.js"];
  let checked = 0; const newlyMute = [];
  for (const f of files) {
    for (const m of read(f).matchAll(/announce\(\s*"([^"]{4,})"\s*,\s*([\d.]+)\s*(?:,\s*"([a-z-]+)")?\s*\)/g)) {
      const [, msg, dur, kind0] = m, kind = kind0 || "race";
      const life = Math.max(3, (+dur || 1.6) + 0.5);
      const lead = leads[RV.SPEAKERS[kind] || "radio"] || 0;
      checked++;
      if (P({ msg, life, kind, lead: 0 }).speak && !P({ msg, life, kind, lead }).speak)
        newlyMute.push(`${f}: "${msg}" (${life.toFixed(1)} s card, ${lead.toFixed(3)} s cue)`);
    }
  }
  assert.ok(checked >= 10, `expected to find the shipped lines, found ${checked}`);
  assert.deepEqual(newlyMute, [], "the courtesy figure silenced these lines");
});

test("a preempt during the cue cancels the line waiting behind it", () => {
  /* The lead is a window where a speak is SCHEDULED but not yet handed over.
   * Without clearing it, the line that was interrupted arrives on top of the
   * line that interrupted it — the same inversion `current` prevents one step
   * later, and the case this game produces every time a penalty cuts in.
   *
   * ITS OWN CLOCK, because a real setTimeout fires long after a synchronous
   * test has returned: with the platform timer this passed whether or not
   * stop() cancelled anything, which is a test that cannot fail. */
  const timers = [];
  const ctx = vm.createContext({ Math, JSON, Object, Array, Number, String, Set, console,
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: (id) => { const t = timers[id - 1]; if (t) t.live = false; } });
  seedLog(ctx);
  const synth = synthStub({ voices: [{ name: "A", lang: "en-GB", localService: true }] });
  ctx.window = { speechSynthesis: synth, SpeechSynthesisUtterance: function (t) { this.text = t; } };
  ctx.GameAudio = { setRadioDuck() {} };
  vm.runInContext(read("js/audio/radio-voice.js"), ctx, { filename: "js/audio/radio-voice.js" });
  const saved = new Map([["radioVoice", true]]);
  const v = vm.runInContext("RadioVoice", ctx).create({
    soundOn: true, state: "race",
    store: { get: (k, d) => (saved.has(k) ? saved.get(k) : d), set: (k, x) => saved.set(k, x) },
  });
  const spoke = () => synth.calls.filter((c) => c.m === "speak").length;
  assert.equal(v.say("TYRES AT 50%", 3, "info", 0.4), true, "the wear report is scheduled behind its cue");
  assert.equal(spoke(), 0, "...and has not been handed over yet");
  v.stop();
  for (const t of timers) if (t.live) t.fn();          // the clock runs on regardless
  assert.equal(spoke(), 0, "a stop during the lead must cancel the pending speak, not let it fire");
});

test("quitting to the title ends the radio, not just the card", () => {
  // The hiss bed was torn down only by RadioVoice's #announce observer — the
  // VOICE's teardown, which is never registered at all on a browser without
  // speechSynthesis. Quitting mid-transmission then left the radio running over
  // the title screen. quitToMenu already ends every other session thing.
  const quit = fnSource(read("js/game.js"), "function quitToMenu()");
  assert.match(quit, /GameAudio\.radioStingStop\(\)/,
    "quitToMenu must end the sting itself rather than borrow the voice's observer");
  assert.match(quit, /_annQueue\.length = 0/, "…on the same pass that empties the announce queue");
});

// ── Regressions from the 2026-09-24 integration audit ───────────────────────

test("the radio never cancels speech that is not its own (the announcer shares the synth)", async () => {
  const { RV: R, G, synth } = load({ stored: { radioVoice: true } });
  synth.speaking = true;                       // the announcer is mid-read
  const v = R.create(G);
  v.stop();
  v.setEnabled(false); v.setEnabled(true);
  await flush();
  assert.equal(synth.calls.filter((c) => c.m === "cancel").length, 0, "no global cancel while nothing of ours is queued");
});

test("a line's own preempt cancels synchronously, before anything else can start speaking", async () => {
  const { RV: R, G, synth } = load({ stored: { radioVoice: true } });
  const v = R.create(G);
  v.say("TYRES AT 50%", 3, "info");
  await flush();                               // our line is on the synth
  v.stop();
  const n = synth.calls.length;
  assert.equal(synth.calls[n - 1].m, "cancel", "cancelled in the same task as stop()");
  // Something else (the announcer's wrap-up) speaks next, in the same task:
  synth.speak({ text: "And the winner is" });
  await flush();
  assert.equal(synth.calls.at(-1).m, "speak", "no deferred cancel lands after it and kills it");
});

test("the settings TEST sample is not cancelled a task later", async () => {
  const { RV: R, G, synth } = load({ stored: { radioVoice: true } });
  G.state = "menu";
  const speak = synth.speak.bind(synth);
  synth.speak = (u) => { synth.speaking = true; speak(u); };   // a real engine reports what it is saying
  const v = R.create(G);
  assert.equal(v.preview("radio"), true);
  await flush();
  const tail = synth.calls.filter((c) => c.m === "speak" || c.m === "cancel").map((c) => c.m);
  assert.equal(tail.at(-1), "speak", `the sample is the last thing on the synth: ${tail.join(",")}`);
});

test("a line still waiting out its cue when the race ends is dropped, not read over the results", async () => {
  const { RV: R, G, synth } = load({ stored: { radioVoice: true } });
  const v = R.create(G);
  assert.equal(v.say("BOX BOX BOX", 3, "info", 0.05), true);
  G.state = "results";                         // endRace() lands before the cue finishes
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(synth.calls.filter((c) => c.m === "speak").length, 0);
});
