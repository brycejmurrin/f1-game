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
  const ctx = vm.createContext({ Math, JSON, Object, Array, Number, String, Set, console, setTimeout, clearTimeout });
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
    if (inControl) assert.equal(speaker, "control", `${k} is race control in radioWho but ${speaker} here`);
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

test("a preempt is cancel-then-speak-then-RESUME, which is the bug workaround", () => {
  // Bugzilla 1522074 (open, Firefox AND Chrome): a speak() directly after a
  // cancel() is silently dropped. Without resume() the line that goes missing
  // is the PENALTY that interrupted, not the wear report it interrupted — the
  // priority order inverts in the audio channel while the picture gets it
  // right, which is worse than never speaking at all.
  const { RV: R, G, synth } = load({ stored: { radioVoice: true }, voices: [{ name: "A", lang: "en-GB", localService: true }] });
  const v = R.create(G);
  assert.equal(v.say("TYRES AT 50%", 3, "info"), true);
  assert.equal(v.say("5 SECOND PENALTY", 3, "penalty-hit"), true);
  const seq = synth.calls.filter((c) => ["cancel", "speak", "resume"].includes(c.m)).map((c) => c.m);
  assert.deepEqual(seq, ["cancel", "speak", "resume", "cancel", "speak", "resume"]);
  const spoken = synth.calls.filter((c) => c.m === "speak");
  assert.match(spoken.at(-1).text, /penalty/, "the interrupting line is the one left speaking");
});

test("an empty voice list still speaks — that is the Safari path, not a refusal", () => {
  // Safari returns nothing from getVoices() and picks a system default itself.
  // A design that requires a voice object before speaking is silent on Safari.
  const { RV: R, G, synth } = load({ stored: { radioVoice: true }, voices: [] });
  const v = R.create(G);
  assert.equal(v.say("BOX BOX BOX", 3, "info"), true);
  const spoke = synth.calls.find((c) => c.m === "speak");
  assert.equal(spoke.voice, null, "voice = null is legal and is what Safari needs");
});

test("a REMOTE voice is never chosen — its lead-in is unbounded", () => {
  const { RV: R, G, synth } = load({ stored: { radioVoice: true },
    voices: [{ name: "Google UK", lang: "en-GB", localService: false }, { name: "Local", lang: "en-GB", localService: true }] });
  const v = R.create(G);
  v.say("BOX BOX BOX", 3, "info");
  const spoke = synth.calls.find((c) => c.m === "speak");
  assert.equal(spoke.voice && spoke.voice.name, "Local");
});

test("the setting round-trips, and turning it off stops a line in flight", () => {
  const { RV: R, G, synth, saved } = load({ stored: { radioVoice: true } });
  const v = R.create(G);
  assert.equal(v.say("BOX BOX BOX", 3, "info"), true);
  v.setEnabled(false);
  assert.ok(synth.calls.some((c) => c.m === "cancel"), "disabling must silence what is already speaking");
  assert.equal(v.say("BOX BOX BOX", 3, "info"), false);
  assert.equal(v.setVolume(2), 1, "volume clamps to 0..1");
  assert.equal(v.setVolume(-1), 0);
  // Default is OFF: a fresh store speaks nothing until asked.
  const blank = load();
  assert.equal(blank.RV.create(blank.G).say("BOX BOX BOX", 3, "info"), false, "the radio ships OFF");
  assert.equal(blank.saved.has("radioVoice"), false, "create() must not write the setting; the panel owns it");
});
