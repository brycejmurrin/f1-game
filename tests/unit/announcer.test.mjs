/* announcer.test.mjs — the PRE-RACE ANNOUNCER, without a browser.
 *
 * Two halves, and only one of them is speech.
 *
 *  1. THE SCRIPT IS DERIVED, so it has to hold for circuits nobody wrote it
 *     for. `script()` is pure — an object in, an array of lines out — and the
 *     tests hand it the shapes a real def actually takes: a classic with no GP,
 *     a night race, a 7 km circuit with 10 corners and a 3 km one with 20.
 *     Every clause it emits has to be TRUE of the numbers it was given, because
 *     a broadcast opening that describes the wrong circuit is worse than none.
 *  2. THE VOICE CHAIN IS A FALLBACK LADDER. "Daniel or the British guy" is an
 *     Apple voice that exists on two platforms out of five, so the interesting
 *     cases are all the machines that do NOT have it. `pickVoice()` is pure over
 *     the list for exactly that reason: this file hands it macOS's voices,
 *     Windows's, a Linux box's and an empty list.
 *
 * Run: node --test tests/unit/announcer.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

function synthStub() {
  const calls = [];
  return {
    calls,
    getVoices() { calls.push({ m: "getVoices" }); return this._voices || []; },
    speak(u) { calls.push({ m: "speak", u, text: u.text, voice: u.voice, rate: u.rate, pitch: u.pitch, volume: u.volume }); },
    cancel() { calls.push({ m: "cancel" }); },
    resume() { calls.push({ m: "resume" }); },
  };
}

/** Both modules in one context: the announcer borrows RadioVoice.speakable()
 *  and RadioVoice.SAMPLE, so loading it alone would test a different file. */
function load({ api = true, voices = [], stored = {}, soundOn = true, lore = true } = {}) {
  const saved = new Map(Object.entries(stored));
  const ctx = vm.createContext({ Math, JSON, Object, Array, Number, String, Set, console, setTimeout, clearTimeout });
  seedLog(ctx);
  const synth = api ? synthStub() : null;
  if (synth) synth._voices = voices;
  ctx.window = api ? { speechSynthesis: synth, SpeechSynthesisUtterance: function (t) { this.text = t; } } : {};
  ctx.GameAudio = { setRadioDuck() {} };
  vm.runInContext(read("js/audio/radio-voice.js"), ctx, { filename: "js/audio/radio-voice.js" });
  // The authored half. Loaded by default because the shipped game always has
  // it; `lore: false` is how a test asks for the derived-only floor, which is
  // what a circuit with no row still gets.
  if (lore) vm.runInContext(read("js/data/circuit-lore.js"), ctx, { filename: "js/data/circuit-lore.js" });
  vm.runInContext(read("js/audio/announcer.js"), ctx, { filename: "js/audio/announcer.js" });
  const A = vm.runInContext("Announcer", ctx);
  const RV = vm.runInContext("RadioVoice", ctx);
  const G = {
    soundOn, state: "menu", track: null,
    store: { get: (k, d) => (saved.has(k) ? saved.get(k) : d), set: (k, v) => saved.set(k, v) },
    radio: RV.create({ soundOn, state: "race", store: { get: (k, d) => (saved.has(k) ? saved.get(k) : d), set: (k, v) => saved.set(k, v) } }),
  };
  return { A, RV, G, synth, saved, CircuitLore: lore ? vm.runInContext("CircuitLore", ctx) : null };
}

const { A } = load();
const info = (over = {}) => Object.assign({
  track: { id: "monza", name: "Monza", gp: "Italian Grand Prix", country: "Italy", lengthKm: 5.793 },
  laps: 12, turns: 11, relief: 4, weather: "dry", tod: "day",
}, over);
const said = (o) => A.script(o).join(" ");

// ── 1. The script says what it opens with, and describes the right circuit ──

test("it opens with the game's own name, every time", () => {
  // The line the request asked for by name. First, before the venue: it is the
  // broadcast's identity, and a welcome that starts with the circuit is a
  // caption rather than an opening.
  assert.equal(A.script(info())[0], "Welcome to Apex 26.");
  assert.equal(A.script(info({ track: {} }))[0], "Welcome to Apex 26.");
  assert.equal(A.script(null)[0], "Welcome to Apex 26.");
});

test("it names the circuit AND the event — both, because either alone reads as a placeholder", () => {
  assert.match(said(info()), /This is Monza, home of the Italian Grand Prix\./);
});

test("\"Bahrain GP\" is SPOKEN as a Grand Prix, not as two letters", () => {
  // Every `gp` in js/circuits/ ends in "GP" because that is what fits a chip on
  // the picker, and RadioVoice.speakable() lowercases any token it does not
  // recognise — so the unexpanded string reached the synth as "italian g p".
  // Found by printing the script from a live boot, not by reading the code.
  const { A: An, RV } = load();
  const line = An.script(info({ track: { name: "MONZA", gp: "Italian GP", lengthKm: 5.793 } }))[1];
  assert.match(line, /Italian Grand Prix/);
  assert.ok(!/\bGP\b/.test(RV.speakable(line)), RV.speakable(line));
});

test("an ALL-CAPS circuit name is title-cased for the printed script, multi-word ones included", () => {
  // Cosmetic only — speakable() lowercases it either way — but the flyby
  // editor PRINTS this, and "This is MONZA" reads as a placeholder there.
  // Whole-string, not per-word: a word-length rule leaves "RED BULL RING" as is.
  assert.match(said(info({ track: { name: "MONZA", lengthKm: 5.793 } })), /This is Monza/);
  assert.match(said(info({ track: { name: "RED BULL RING", lengthKm: 4.318 } })), /This is Red Bull Ring/);
  // A name that is already mixed case is left exactly alone.
  assert.match(said(info({ track: { name: "Mont-Tremblant", lengthKm: 4.265 } })), /This is Mont-Tremblant/);
});

test("a circuit with no Grand Prix falls back to the country, not to an empty clause", () => {
  // Every def carries a name; `gp` is optional and several classics have none.
  const s = said(info({ track: { name: "Brands Hatch", country: "United Kingdom", lengthKm: 3.908 } }));
  assert.match(s, /This is Brands Hatch, in the United Kingdom\./);
  assert.ok(!/home of the \./.test(s), "an empty gp left a dangling clause");
});

test("no name and no event leaves out the venue line rather than saying 'This is .'", () => {
  const lines = A.script(info({ track: { lengthKm: 4 } }));
  assert.ok(!lines.some((l) => /^This is/.test(l)), lines.join(" | "));
  assert.equal(lines[0], "Welcome to Apex 26.");
});

test("every number it speaks is the number it was given", () => {
  const s = said(info({ track: { name: "Spa", gp: "Belgian Grand Prix", lengthKm: 7.004 }, turns: 19, laps: 8 }));
  assert.match(s, /7\.004 kilometres/);
  assert.match(s, /19 corners/);
  assert.match(s, /8 laps\./);
});

test("a circuit with no built world yet omits the corner count instead of claiming zero", () => {
  // turns comes from the BUILT track (TrackMaps.corners); before a build it is
  // 0, and "0 corners" is the one wrong fact this script could state.
  const s = said(info({ turns: 0 }));
  assert.ok(!/corners/.test(s), s);
  assert.match(s, /5\.793 kilometres\./);
});

// ── 2. The character clause is a claim about the lap, so it must track it ───

test("corner DENSITY separates the circuits, not corner count", () => {
  // Monaco is 19 corners in 3.337 km and Spa 19 in 7.004. Counting corners alone
  // calls them the same lap, which is the whole reason this is a ratio.
  const monaco = said(info({ track: { name: "Monaco", lengthKm: 3.337 }, turns: 19 }));
  const monza = said(info({ track: { name: "Monza", lengthKm: 5.793 }, turns: 11 }));
  const spa = said(info({ track: { name: "Spa", lengthKm: 7.004 }, turns: 19 }));
  assert.match(monaco, /tight, technical lap/);
  assert.match(monza, /fast, flowing lap/);
  assert.match(spa, /mixes rhythm/);
});

test("relief is only mentioned when there is some, and the figure is rounded DOWN into a round number", () => {
  assert.ok(!/climbs|rolling/.test(said(info({ relief: 3 }))), "flat ground got an elevation clause");
  assert.match(said(info({ relief: 22 })), /rolling ground/);
  const hilly = said(info({ relief: 103 }));
  assert.match(hilly, /climbs and falls more than 100 metres/);
});

test("night and weather are stated, and only one of them", () => {
  assert.match(said(info({ track: { name: "Singapore", gp: "Singapore Grand Prix", lengthKm: 4.94, night: true } })), /under the lights/);
  assert.match(said(info({ tod: "night" })), /under the lights/);
  const wet = said(info({ weather: "rain" }));
  assert.ok(!/under the lights/.test(wet), "a wet night is about the water, not the floodlights");
  assert.equal(/rain|wet|grey|fog/i.test(said(info({ weather: "dry" }))), false,
    "a dry day says nothing about the weather at all");
});

test("each weather state gets its OWN line — one clause for five conditions said nothing", () => {
  // Before 2026-09-20 every non-dry state read "And the weather is against us",
  // so fog, drizzle and a downpour were one sentence, and `overcast` — which is
  // about TYRE TEMPERATURE, not adversity — read as a threat.
  const lines = ["overcast", "wet", "rain", "fog"].map((w) => {
    const rows = A.rows(info({ weather: w })).map((r) => r.text);
    const hit = rows.find((l) => /rain|wet|grey|fog|water|dry part/i.test(l));
    assert.ok(hit, `weather "${w}" produced no conditions line: ${rows.join(" | ")}`);
    return hit;
  });
  assert.equal(new Set(lines).size, 4, "two weather states share a line: " + lines.join(" / "));
});

test("it ends on the same line whatever it found, so the voice never trails off", () => {
  for (const o of [info(), info({ laps: 0 }), info({ track: {} }), info({ turns: 0, relief: 0 })]) {
    assert.match(A.script(o).slice(-1)[0], /Let's go racing\.$/);
  }
});

test("every line is a sentence — the synth pauses on the full stop, and a missing one runs two facts together", () => {
  for (const l of A.script(info())) assert.match(l, /\.$/, `"${l}" is not punctuated`);
});

test("the whole script survives speakable() — it is spoken through the radio's normaliser", () => {
  const { A: An, RV } = load();
  const words = RV.speakable(An.script(info()).join(" "));
  assert.ok(words.length > 40, words);
  assert.ok(!/undefined|NaN|\[object/.test(words), words);
});

// ── 3. The voice ladder: Daniel first, then the machines without him ────────

// localService, on every one: RadioVoice.voicesFor() drops REMOTE voices
// outright (a network round trip before a line lands is not a radio), so a
// stub without it hands the announcer an empty list and every voice assertion
// below would pass for the wrong reason.
const V = (name, lang) => ({ name, lang, localService: true });

test("Daniel in en-GB wins outright — the voice the request named", () => {
  const mac = [V("Alex", "en-US"), V("Daniel", "en-GB"), V("Karen", "en-AU")];
  assert.equal(A.pickVoice(mac, "").name, "Daniel");
});

test("a Daniel in the wrong language still beats a stranger in the right one", () => {
  // Ordered deliberately: name is the stronger signal for the ONE voice the
  // request asked for by name, and en-GB has dozens of members.
  assert.equal(A.pickVoice([V("Serena", "en-GB"), V("Daniel", "en-US")], "").name, "Daniel");
});

test("no Daniel: another British male, then any en-GB, then any English", () => {
  assert.equal(A.pickVoice([V("Zira", "en-US"), V("George", "en-GB")], "").name, "George");
  assert.equal(A.pickVoice([V("Zira", "en-US"), V("Hazel", "en-GB")], "").name, "Hazel");
  assert.equal(A.pickVoice([V("Zira", "en-US"), V("Amelie", "fr-FR")], "").name, "Zira");
});

test("an en-GB FEMALE voice is not preferred over an en-GB one whose name says nothing", () => {
  const list = [V("Google UK English Female", "en-GB"), V("Google UK English", "en-GB")];
  assert.equal(A.pickVoice(list, "").name, "Google UK English");
});

test("nothing English at all returns null, and the platform picks — never a throw and never a French announcer", () => {
  assert.equal(A.pickVoice([V("Amelie", "fr-FR"), V("Yuna", "ko-KR")], ""), null);
  assert.equal(A.pickVoice([], ""), null);
  assert.equal(A.pickVoice(null, ""), null);
  assert.equal(A.pickVoice([null, undefined], ""), null);
});

test("THE PLAYER'S PICK OUTRANKS THE WHOLE LADDER — that is what the settings row is for", () => {
  const list = [V("Daniel", "en-GB"), V("Yuna", "ko-KR")];
  assert.equal(A.pickVoice(list, "Yuna").name, "Yuna");
  // …but a pick for a voice this machine does not have falls back rather than
  // silencing the channel: a save made on a Mac opened on a Windows box.
  assert.equal(A.pickVoice(list, "Samantha").name, "Daniel");
});

// ── 4. The instance: degradation, gates, and the switch ─────────────────────

test("no speechSynthesis: create() is inert and every method is safe to call", () => {
  const { A: An, G } = load({ api: false });
  const a = An.create(G);
  assert.equal(a.available(), false);
  assert.equal(a.play(info(), 1000), false);
  assert.equal(a.preview(info()), false);
  assert.equal(a.sample(), false);
  assert.equal(a.scriptFor(info()).length, 0);
  a.stop(); a.setEnabled(true);
  assert.equal(An.inert().play(), false);
});

test("create() never reads the voice list — a speech API on the boot path is the defect radio-voice.js already pins", () => {
  const { A: An, G, synth } = load({ voices: [V("Daniel", "en-GB")] });
  An.create(G);
  assert.equal(synth.calls.filter((c) => c.m === "getVoices").length, 0);
});

test("ON by default, and the stored OFF is honoured", () => {
  assert.equal(load().A.create(load().G).enabled(), true);
  const off = load({ stored: { announcer: false } });
  assert.equal(off.A.create(off.G).enabled(), false);
});

test("MASTER SOUND OFF is silence, for play and preview alike — speech is outside the audio graph, so nothing else would stop it", () => {
  const { A: An, G, synth } = load({ soundOn: false, voices: [V("Daniel", "en-GB")] });
  const a = An.create(G);
  assert.equal(a.play(info(), 1000), false);
  assert.equal(a.preview(info()), false);
  assert.equal(synth.calls.filter((c) => c.m === "speak").length, 0);
});

test("the switch OFF stops play() but not preview() — pressing PLAY in the editor IS the consent", () => {
  const { A: An, G } = load({ stored: { announcer: false }, voices: [V("Daniel", "en-GB")] });
  const a = An.create(G);
  assert.equal(a.play(info(), 1000), false);
  assert.equal(a.preview(info()), true);
});

test("setEnabled writes through to the store, so the panel and the editor cannot disagree", () => {
  const { A: An, G, saved } = load({ voices: [V("Daniel", "en-GB")] });
  const a = An.create(G);
  a.setEnabled(false);
  assert.equal(saved.get("announcer"), false);
  assert.equal(a.enabled(), false);
  a.setEnabled(true);
  assert.equal(saved.get("announcer"), true);
});

test("speaking picks the voice by name off the live synth, at the announcer channel's prosody", () => {
  const { A: An, RV, G, synth } = load({ voices: [V("Alex", "en-US"), V("Daniel", "en-GB")] });
  const a = An.create(G);
  assert.equal(a.play(info(), 24000), true);
  const spoke = synth.calls.find((c) => c.m === "speak");
  assert.ok(spoke, "nothing was spoken");
  assert.equal(spoke.voice && spoke.voice.name, "Daniel");
  assert.equal(spoke.rate, RV.TONE.announcer.rate);
  assert.equal(spoke.pitch, RV.TONE.announcer.pitch);
  assert.match(spoke.text, /welcome to apex 26/i);
});

test("a cancel precedes every utterance and a resume follows it — Bugzilla 1522074, the same one the radio documents", () => {
  const { A: An, G, synth } = load({ voices: [V("Daniel", "en-GB")] });
  An.create(G).play(info(), 24000);
  const order = synth.calls.map((c) => c.m).filter((m) => m !== "getVoices");
  assert.deepEqual(order, ["cancel", "speak", "resume"], order.join(","));
});

test("VOICE VOLUME reaches it — one slider for everything the game speaks", () => {
  const { A: An, G, synth } = load({ voices: [V("Daniel", "en-GB")], stored: { volRadio: 0.3 } });
  An.create(G).play(info(), 24000);
  assert.equal(synth.calls.find((c) => c.m === "speak").volume, 0.3);
});

// ── 5. The channel this borrows has to exist ───────────────────────────────

test("`announcer` is a real RadioVoice channel, with prosody and a preview line", () => {
  // The settings row is a VOICE_CHANNELS entry like any other, which only works
  // because the channel is in TONE — and setTune() refuses a channel that is
  // not, so without this the player's pick would be silently dropped.
  const { RV } = load();
  assert.ok(RV.TONE[A.CHANNEL], "no prosody for the announcer channel");
  assert.ok(RV.SAMPLE[A.CHANNEL], "no TEST line for the announcer channel");
  assert.ok(RV.TONE[A.CHANNEL].rate < RV.TONE.radio.rate,
    "the announcer reads a paragraph over a still screen; it must not be quicker than the pit call");
  // ONE race-time kind routes here: "comm", the in-race commentary
  // (js/race/race-radio.js) — the same broadcaster. Nothing else may, and the
  // gate that keeps menu cards from being read aloud must still hold for it.
  const kinds = Object.keys(RV.SPEAKERS).filter((k) => RV.SPEAKERS[k] === A.CHANNEL);
  assert.deepEqual(kinds, ["comm"]);
  const menu = RV.plan({ msg: "SAVE CONFLICT", life: 4, kind: "comm", enabled: true, soundOn: true, api: true, state: "menu" });
  assert.equal(menu.reason, "not-racing");
});

/* ── THE READ IS A CHAIN OF LINES, NOT ONE BLOB ────────────────────────────── */

/** Fire the pending utterance's onend, as a real engine does when it finishes. */
function finishLine(synth) {
  const last = synth.calls.filter((c) => c.m === "speak").at(-1);
  if (last && last.u && last.u.onend) last.u.onend();
}
const spoken = (synth) => synth.calls.filter((c) => c.m === "speak").map((c) => c.text);

test("the script is spoken one line per utterance, in order", () => {
  const { A, G, synth } = load();
  const ann = A.create(G);
  // preview() and play() share speak(); preview just skips the player's toggle.
  ann.preview({ track: { name: "MONZA", gp: "Italian GP", lengthKm: 5.793 }, laps: 53 });
  assert.equal(spoken(synth).length, 1, "only the FIRST line may be handed over up front");
  let guard = 0;
  while (guard++ < 20) { const before = spoken(synth).length; finishLine(synth); if (spoken(synth).length === before) break; }
  const said = spoken(synth);
  assert.ok(said.length >= 4, "the whole script must be read, one line at a time: " + said.length);
  assert.match(said[0], /welcome to apex 26/i, "and in order, opening with the welcome");
  assert.match(said.at(-1), /racing/i, "…and ending with the last line of the script");
  assert.ok(said.every((t) => !/welcome to apex 26.*monza/i.test(t)),
    "no utterance may carry two lines — that is the join() this split replaced");
});

test("no single utterance can hit Chrome's ~14 s cap", () => {
  // THE BUG THIS SPLIT EXISTS FOR. Chrome Desktop silently fails an utterance
  // past roughly fourteen seconds. Joined into one blob, every real script was
  // over: Silverstone 15.4 s, Monaco 18.1 s, Spa at night 22.2 s, a classic in
  // the rain 26.3 s. Per line, none of them comes close.
  const { A, RV, G, synth } = load();
  const ann = A.create(G);
  const rate = RV.TONE.announcer.rate;
  const cases = [
    { track: { name: "SILVERSTONE", gp: "British GP", lengthKm: 5.891, country: "UK" }, turns: 18, laps: 52, relief: 20 },
    { track: { name: "SPA-FRANCORCHAMPS", gp: "Belgian GP", lengthKm: 7.004, night: true }, turns: 19, laps: 44, relief: 102 },
    { track: { name: "BRANDS HATCH", gp: "British GP", lengthKm: 4.207, classic: true }, turns: 19, laps: 60, relief: 45, weather: "rain" },
  ];
  for (const info of cases) {
    synth.calls.length = 0;
    ann.preview(info);
    let guard = 0;
    while (guard++ < 30) { const n = spoken(synth).length; finishLine(synth); if (spoken(synth).length === n) break; }
    for (const text of spoken(synth)) {
      const secs = RV.estimate(text, rate);
      assert.ok(secs < 14, `"${text}" is ${secs.toFixed(1)} s — Chrome drops an utterance past ~14 s`);
    }
  }
});

test("a stopped read does not wake up and carry on talking", () => {
  // The queued onend of a cancelled line is the hazard: without the generation
  // check it advances the dead chain over whatever replaced it.
  const { A, G, synth } = load();
  const ann = A.create(G);
  ann.preview({ track: { name: "MONZA", gp: "Italian GP", lengthKm: 5.793 }, laps: 53 });
  const first = spoken(synth).length;
  ann.stop();
  finishLine(synth);
  finishLine(synth);
  assert.equal(spoken(synth).length, first, "stop() must end the chain, not pause it");
});

test("a cancel from OUTSIDE the announcer ends its read instead of skipping to the next line", () => {
  // Bug hunt 2026-09-22: RadioVoice's hide handler cancels the shared synth
  // without bumping the announcer's generation, and the cancelled line's
  // error advanced the chain — reading on into a hidden tab.
  const { A, G, synth } = load();
  const ann = A.create(G);
  ann.preview({ track: { name: "MONZA", gp: "Italian GP", lengthKm: 5.793 }, laps: 53 });
  const first = spoken(synth).length;
  const u = synth.calls.filter((c) => c.m === "speak").at(-1).u;
  u.onerror({ error: "interrupted" });
  finishLine(synth);
  assert.equal(spoken(synth).length, first, "an interrupted line ends the chain");
});

test("the announcer may use a network voice; the race radio may not", () => {
  /* The rule that made the announcer worse. A remote voice's lead-in is
   * unbounded, which is disqualifying for a line budgeted against a card — and
   * irrelevant to a paragraph read over a loading screen. Every Chrome voice is
   * remote and every top-tier Microsoft voice is named "… Online (Natural)", so
   * the local-only filter was removing the GOOD voices, not the risky ones. */
  const voices = [
    { name: "Microsoft Ryan Online (Natural) - English (United Kingdom)", lang: "en-GB", localService: false },
    { name: "Microsoft George - English (United Kingdom)", lang: "en-GB", localService: true },
  ];
  const { RV } = load({ voices });
  const radio = RV.create({ soundOn: true, state: "race", store: { get: (k, d) => d, set() {} } });
  const forRadio = radio.voiceList("radio").map((v) => v.name);
  const forAnn = radio.voiceList("announcer").map((v) => v.name);
  assert.ok(!forRadio.some((n) => /Online \(Natural\)/.test(n)),
    "a race-radio line cannot wait on a network round trip");
  assert.ok(forAnn.some((n) => /Online \(Natural\)/.test(n)),
    "the announcer has no card to miss, and this is the voice the channel is for");
  assert.ok(forRadio.length < forAnn.length);
  assert.equal(RV.REMOTE_OK.announcer, true);
  assert.ok(!RV.REMOTE_OK.radio && !RV.REMOTE_OK.control && !RV.REMOTE_OK.coach);
});

test("pickVoice prefers the neural and enhanced voices over the compact ones", () => {
  const { A } = load();
  // Windows 11 / Edge: the Natural voices are the veryHigh tier of the curated
  // cross-platform list, and en-GB male is Ryan or Thomas.
  assert.match(A.pickVoice([
    { name: "Microsoft George - English (United Kingdom)", lang: "en-GB" },
    { name: "Microsoft Ryan Online (Natural) - English (United Kingdom)", lang: "en-GB" },
  ], "").name, /Ryan/);
  // macOS with the download: same character, a quality the compact voice cannot reach.
  assert.match(A.pickVoice([
    { name: "Daniel", lang: "en-GB" },
    { name: "Daniel (Enhanced)", lang: "en-GB" },
  ], "").name, /Enhanced/);
  // Chrome desktop, where the only voices there are are remote.
  assert.match(A.pickVoice([
    { name: "Google US English", lang: "en-US" },
    { name: "Google UK English Male", lang: "en-GB" },
  ], "").name, /UK English Male/);
  // The player's explicit pick still outranks the whole ladder.
  assert.equal(A.pickVoice([
    { name: "Daniel (Enhanced)", lang: "en-GB" },
    { name: "Microsoft George - English (United Kingdom)", lang: "en-GB" },
  ], "Microsoft George - English (United Kingdom)").name, "Microsoft George - English (United Kingdom)");
});

/* ── 6. THE SESSION, which never reached this script before ──────────────── */

// Until 2026-09-20 the welcome ended "12 laps. Let's go racing." whatever was
// about to happen: a qualifying hour, a duel with a legend, an unscored
// practice run. js/game.js tracks every one of these; loadingInfo() simply did
// not pass them on.

const tail = (o) => A.script(o).slice(-1)[0];

test("the last line names the session — and it IS the last line, whatever else was said", () => {
  assert.match(tail(info()), /^12 laps\. Let's go racing\.$/);
  assert.match(tail(info({ session: "quali" })), /Qualifying\./);
  assert.match(tail(info({ session: "quali", practice: true })), /Qualifying practice\./);
  assert.match(tail(info({ session: "tt" })), /Time trial\./);
  assert.match(tail(info({ practice: true })), /^Practice\./);
  assert.match(tail(info({ duel: true })), /^A duel\. Just the two of you/);
});

test("a duel names the rival when there is one to name", () => {
  const withLegend = tail(info({ duel: true, duelLegend: "SENNA" }));
  assert.match(withLegend, /A duel with Senna\./,
    "the legend id is shouted for the picker's chip; a broadcast says the name");
  assert.ok(!/SENNA/.test(withLegend), "all-caps reaches the synth as spelled-out letters");
});

test("the session outranks the laps, so a quali read never promises a race", () => {
  const q = said(info({ session: "quali" }));
  assert.ok(!/12 laps/.test(q), "qualifying is one lap — the race distance is not part of it");
});

/* ── 7. THE AUTHORED HALF (js/data/circuit-lore.js) ──────────────────────── */

test("every circuit has a lore row, and every lore row has a circuit", () => {
  // The failure js/audio/announcer.js's original header predicted, guarded:
  // "written for the six somebody bothered and missing on the rest". Both
  // directions, so a retired circuit cannot leave a dangling entry either.
  const { CircuitLore } = load();
  const onDisk = readdirSync(join(ROOT, "js/circuits"))
    .filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, "")).sort();
  const lore = CircuitLore.ids().sort();
  assert.deepEqual(lore.filter((id) => !onDisk.includes(id)), [], "a lore row names no circuit");
  assert.deepEqual(onDisk.filter((id) => !lore.includes(id)), [], "a circuit has no lore row");
});

test("every lore line is one spoken sentence the synth can read", () => {
  const { CircuitLore } = load();
  for (const [id, row] of Object.entries(CircuitLore.LORE)) {
    assert.ok(row.line, `${id} has no identity line`);
    for (const [slot, text] of Object.entries(row)) {
      const where = `${id}.${slot}`;
      assert.match(text, /[.!?]$/, `${where} is not punctuated — the synth runs it into the next line`);
      assert.ok(!/\bGP\b/.test(text), `${where} says "GP"; speakable() reads that as two letters`);
      // RadioVoice keeps a short closed set of initialisms and lowercases the
      // rest, which several engines then spell out letter by letter.
      const shouty = text.match(/\b[A-Z]{2,}\b/g) || [];
      assert.deepEqual(shouty, [], `${where} carries ALL-CAPS ${shouty.join(", ")}`);
      assert.ok(text.length < 160, `${where} is ${text.length} chars — one sentence, not a paragraph`);
    }
  }
});

test("the circuit's own line is spoken, and outranks the numbers when the budget is tight", () => {
  const spa = info({ track: { id: "spa", name: "Spa", gp: "Belgian Grand Prix", lengthKm: 7.004 }, turns: 19 });
  assert.match(said(spa), /Ardennes/, "Spa's identity line never reached the script");
  assert.match(said(spa), /Eau Rouge/, "…nor the corner it is known for");
  // The ORDERING, swept rather than asserted at one budget: for every budget
  // that still has room for the length, the circuit's own line is there too.
  // A listener who hears one sentence about Spa should hear the Ardennes one.
  for (let ms = 4000; ms <= 30000; ms += 500) {
    const kept = A.script(spa, ms).join(" ");
    if (/7\.004 kilometres/.test(kept)) {
      assert.match(kept, /Ardennes/, `at ${ms} ms the length survived and the circuit's own line did not`);
    }
  }
});

test("a wet circuit reads its OWN wet line, not the generic one", () => {
  const spa = { id: "spa", name: "Spa", gp: "Belgian Grand Prix", lengthKm: 7.004 };
  assert.match(said(info({ track: spa, weather: "rain" })), /rain on one half of this circuit/i);
  // …and a circuit whose row has no wet line still gets the floor.
  const plain = info({ track: { id: "catalunya", name: "Barcelona", gp: "Spanish Grand Prix", lengthKm: 4.7 }, weather: "rain" });
  assert.match(said(plain), /Heavy rain/);
});

/* ── 8. THE BUDGET — the read is cut to fit, not cut off ─────────────────── */

test("the script fits the flyby, and never loses the line that ends it", () => {
  // The flyby is 24 s (js/ui/loading-screen.js FLY_MS) and the longest reads
  // were already over it before the authored lines existed — measured at this
  // channel's rate: a classic circuit in the rain, 26.3 s.
  const RATE = 0.92;
  const worst = info({
    track: { id: "spa", name: "Spa", gp: "Belgian Grand Prix", country: "Belgium", lengthKm: 7.004, classic: true },
    turns: 19, relief: 103, weather: "rain", laps: 44,
  });
  const full = A.script(worst);
  const fitted = A.script(worst, 24000, RATE);
  assert.ok(fitted.length < full.length, "the worst case already fits — this test is not measuring anything");
  const secs = fitted.reduce((n, l) => n + A.seconds(l, RATE), 0);
  assert.ok(secs <= 24, `the fitted read is ${secs.toFixed(1)} s against a 24 s flyby`);
  assert.match(fitted.slice(-1)[0], /Let's go racing\.$/, "the cue the player waits for was dropped");
  assert.match(fitted[0], /^Welcome to Apex 26\.$/);
});

test("an impossible budget keeps the must-haves rather than falling silent", () => {
  // Array.from: script() builds its array inside the VM realm, so it carries
  // that context's Array.prototype and deepStrictEqual rejects it against a
  // host [] even when every element matches.
  const fitted = Array.from(A.script(info(), 1), (l) => l.replace(/ .*/, ""));
  assert.deepEqual(fitted, ["Welcome", "This", "12"],
    "welcome, venue and session are priority 0 — a one-millisecond budget still says them");
});
