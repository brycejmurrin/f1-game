#!/usr/bin/env node
/*
 * @doc Author-time radio voice pack (Kokoro-82M) → `assets/voice/<id>.{bin,json}`; `--list` prints the phrases.
 * @skill audio-debug
 * AUTHOR-TIME ONLY: never loaded by the game. js/audio/voice-pack.js plays what
 * this writes, and both use VoicePack.norm, so a key written here is exactly a
 * key the game looks up.
 *
 * ONE PACK PER RACE CHANNEL (VOICES below; js/audio/radio-voice.js PACK_VOICE):
 * with RADIO VOICE: RECORDED a race never touches speech synthesis, so every
 * channel needs its own (docs/notes/VOICE-LAG-IPHONE-2026-10-01.md).
 *
 * THE PHRASES are harvested, not hand-listed, so a new radio line is covered by
 * re-running this (phrases(id) says exactly how):
 *   - the channel's phrasebook pools in js/race/radio-lines.js (eng.* for the
 *     engineer, tv.* for the commentator), cut at their {slots} and punctuation;
 *   - the card literals of the files that emit the channel's cards;
 *   - what the channel was heard saying in races (tools/gen/voice-corpus.json,
 *     written by tools/gen/voice-corpus.mjs), cut at its slot values;
 *   - the slot values a line can carry: P1-P22, 0-100, gaps 0.1-9.9, "seconds",
 *     "point" and "oh" for lap times, the surnames of the 2026 grid
 *     (js/data/teams.js) and the legends, key labels for the coach;
 *   - every word any card literal can carry, on its own: the safety net;
 *   - the spotter's calls (js/race/spotter.js Spotter.KEYS), in the engineer's.
 *
 * THE VOICES are Kokoro-82M (Apache-2.0, weights and voices), rendered on CPU by
 * kokoro-js, trimmed of its lead-in and tail silence and encoded as 24 kHz mono
 * MP3 by ffmpeg — MP3 because every browser's decodeAudioData takes it, where
 * Ogg Opus is still missing on older Safari. Neither tool ships: they live in a
 * scratch install (`--kokoro <dir>` holding node_modules/kokoro-js and
 * node_modules/ffmpeg-static; ~1 GB, never committed).
 *
 * Usage:
 *   node tools/gen/voicepack.mjs --list [--id george|michael|fable|bella|emma|heart]
 *   node tools/gen/voicepack.mjs --append --id <voice> --ffmpeg /usr/bin/ffmpeg
 *   node tools/gen/voicepack.mjs --integrity-only [--out assets/voice]
 *   node tools/gen/voicepack.mjs --kokoro scratch/voicepack --id <voice> [--voice bm_george] [--dtype q4] [--speed 1.08] [--opus]
 *   node tools/gen/voicepack.mjs --opus-only --id <voice> [--speaker <channel>] --kokoro scratch/voicepack --ffmpeg /usr/bin/ffmpeg
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/* THE COMMAND LINE, strictly: an unknown or misspelt flag (`--apend`) used to
 * fall through to a FULL rebuild, and a valued flag with no value read the next
 * flag as its value. Both now stop before any work. */
const CLI_FLAGS = new Set(["list", "append", "integrity-only", "opus", "opus-only"]);
const CLI_VALUES = new Set(["id", "speaker", "kokoro", "ffmpeg", "voice", "dtype", "speed", "out"]);
export function parseCli(argv) {
  const flags = new Set(), values = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], k = a.startsWith("--") ? a.slice(2) : null;
    if (k && CLI_FLAGS.has(k)) { flags.add(k); continue; }
    if (k && CLI_VALUES.has(k)) {
      const v = argv[i + 1];
      if (v == null || v.startsWith("--")) throw new Error(`--${k} needs a value`);
      values[k] = v; i++; continue;
    }
    throw new Error(`unknown argument ${a} (flags: ${[...CLI_FLAGS, ...CLI_VALUES].map((f) => "--" + f).join(" ")})`);
  }
  if (values.speed != null && !(Number.isFinite(+values.speed) && +values.speed > 0)) {
    throw new Error(`--speed must be a positive number, got ${values.speed}`);
  }
  return { flag: (k) => flags.has(k), arg: (k, d) => (k in values ? values[k] : d) };
}
let cli = null;
const arg = (k, d) => cli.arg(k, d);
const flag = (k) => cli.flag(k);

/* PUBLISH ATOMICALLY: every file is written beside its target under a temp
 * name, then each is renamed into place, the .json index LAST. A crash or a
 * full disk mid-write leaves the published pack whole (a rename is atomic on
 * one filesystem), never a .bin cut short under an index that names its bytes. */
export function publishFiles(entries) {
  const temps = [];
  try {
    for (const [file, data] of entries) {
      const tmp = file + ".tmp-" + process.pid;
      temps.push([tmp, file]);
      fs.writeFileSync(tmp, data);
    }
    for (const [tmp, file] of temps) fs.renameSync(tmp, file);
  } catch (e) {
    for (const [tmp] of temps) fs.rmSync(tmp, { force: true });
    throw e;
  }
}

/* AN APPEND EXTENDS ONLY A WHOLE PACK: the published .bin must hash to what its
 * index recorded, and every clip must lie inside it, or the new clips would be
 * indexed after bytes that are not the ones the old clips point at. */
export function checkPrior(man, bin, label) {
  if (man.binary) {
    const got = binaryIntegrity(bin);
    if (got.bytes !== man.binary.bytes || got.sha256 !== man.binary.sha256) {
      throw new Error(`${label}: the published binary does not match its index (${got.bytes} B ${got.sha256.slice(0, 12)} vs ${man.binary.bytes} B ${String(man.binary.sha256).slice(0, 12)}); rebuild without --append`);
    }
  }
  for (const [key, c] of Object.entries(man.clips || {})) {
    if (!Array.isArray(c) || !(c[0] >= 0) || !(c[1] > 0) || c[0] + c[1] > bin.length || !(c[2] > 0)) {
      throw new Error(`${label}: clip ${JSON.stringify(key)} ${JSON.stringify(c)} is outside the ${bin.length} B binary or has no duration`);
    }
  }
}

function sandbox(files) {
  const sb = { Math, Object, Array, Number, String, JSON, Map, Set, Promise, console, Log: { info() {}, warn() {} } };
  sb.window = sb;
  vm.createContext(sb);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var"), sb, { filename: f });
  return sb;
}

/* THE VOICES, one pack per radio channel (js/audio/radio-voice.js SPEAKERS →
 * PACK_VOICE). Each speaks only its own channel's lines, so each pack holds
 * only what that channel says. Kokoro grades its voices; these are the best
 * graded of the ones that keep the four channels apart by ear: the engineer
 * (British male), the commentator (a second British male, the broadcast's),
 * race control (flat, official) and the coach (the highest-graded voice, calm). */
// `runs`: the files whose card literals this channel speaks, recorded as whole
// phrases (game.js: only its announce() lines). The phrasebook is the
// engineer's and the commentator's source on top (phrases below).
const RUNS = {
  radio: ["js/game.js", "js/race/pit-lane.js", "js/race/weather-arc.js", "js/race/race-insights.js", "js/race/session-records.js"],
  announcer: [], control: ["js/game.js", "js/race/race-control.js", "js/race/sporting-regs.js"],
  coach: ["js/game.js", "js/race/driving-coach.js", "js/race/race-insights.js"],
};
export const VOICES = Object.freeze(Object.fromEntries(Object.entries(sandbox(["js/audio/voice-pack.js"]).VoicePack.VOICES)
  .map(([id, v]) => [id, { ...v, runs: RUNS[v.speaker] }])));
export const SPEAKERS = Object.freeze(Object.keys(RUNS));

/* ANY VOICE ON ANY CHANNEL (VoicePack.packFor): a voice speaks its own
 * channel from `<id>`, and every other channel from `<id>-<speaker>` — the
 * same voice and speed, that channel's phrases. The spec is the voice's, with
 * the channel (and its card sources) swapped in. */
export function specFor(id, speaker) {
  const v = VOICES[id];
  if (!v) throw new Error("unknown voice " + id + " (" + Object.keys(VOICES).join(", ") + ")");
  const sp = speaker || v.speaker;
  if (!RUNS[sp]) throw new Error("unknown speaker " + sp + " (" + SPEAKERS.join(", ") + ")");
  return { ...v, speaker: sp, runs: RUNS[sp], pack: sp === v.speaker ? id : id + "-" + sp };
}

// A replacement voice must also cover older calls retained in its shipped
// channel pack, even when the current phrase harvester no longer emits them.
export function fallbackVocabulary(id, speaker) {
  const base = sandbox(["js/audio/radio-voice.js"]).RadioVoice.PACK_VOICE[specFor(id, speaker).speaker];
  if (base === specFor(id, speaker).pack) return [];
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/voice", base + ".json"), "utf8"));
  return Object.keys(man.clips).filter((key) => !key.startsWith("@line:")).map((key) => ({ key, text: key }));
}

/* THE FILES THAT FEED THE RADIO CARD: every module that calls announce(), plus
 * the phrasebook and the engineer. Their ALL-CAPS literals are the words a
 * card can carry, so every word in them is recorded on its own — the safety
 * net that lets a line nobody harvested still splice whole. game.js is the one
 * exception: most of its literals are menus, so only literals on an announce()
 * line count there. */
export function feedFiles() {
  const out = new Set(["js/race/radio-lines.js", "js/race/engineer.js"]);
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = d + "/" + e.name;
      if (e.isDirectory()) { if (!/^(vendor|three)$/.test(e.name)) walk(rel); continue; }
      if (rel.endsWith(".js") && /\b(G\.)?announce\(|showAnnounce\(/.test(fs.readFileSync(path.join(ROOT, rel), "utf8"))) out.add(rel);
    }
  };
  walk("js");
  return [...out].sort();
}

/** The lines the game actually spoke, by speaker (tools/gen/voice-corpus.mjs). */
export const CORPUS = "tools/gen/voice-corpus.json";

/** Every phrase pack `id` should hold: [{ key, text }], de-duplicated by key. */
export function phrases(id = "george", speaker) {
  const spec = specFor(id, speaker);
  const sb = sandbox(["js/core/mat4.js", "js/audio/voice-pack.js", "js/audio/radio-voice.js", "js/race/radio-lines.js", "js/race/spotter.js", "js/data/teams.js", "js/data/legends.js"]);
  const { norm, keyOf } = sb.VoicePack;
  const speakable = sb.RadioVoice.speakable;
  const out = new Map();
  const add = (key, text) => { if (key && !out.has(key)) out.set(key, text || key); };
  // Cut speakable text into runs of words between pauses; each run is a key.
  const runs = (literal) => {
    const res = [];
    let cur = [];
    for (const t of norm(speakable(literal))) {
      if (typeof t === "string") cur.push(t); else { if (cur.length) res.push(cur); cur = []; }
    }
    if (cur.length) res.push(cur);
    return res;
  };
  const literalRuns = (tpl) => {
    // "P{pos}" is one spoken unit ("P seven"), recorded whole as a value below,
    // so the bare P in front of a position slot is not a phrase of its own.
    const parts = String(tpl).replace(/P\{(pos|grid)\}/g, "{$1}").split(/\{\w+\}/);
    // A log or store id ("aidrive.strat.caution_reach") is a literal on an
    // announce() line, never a word on the card.
    for (const part of parts) for (const r of runs(part)) if (!r.some((w) => /[_]|[a-z]\.[a-z]/.test(w))) add(keyOf(r));
  };
  // ── THE SLOT VALUES every channel's lines carry ──
  add("percent", "percent");
  for (let n = 1; n <= 22; n++) add("p " + n, "P " + n);
  for (let n = 0; n <= 100; n++) add(String(n), String(n));   // laps, laps to go, tyre percent, lap-time minutes and seconds
  for (let d = 1; d < 100; d++) { const g = (d / 10).toFixed(1); add(g, g); }
  add("seconds", "seconds");
  add("point", "point"); add("oh", "oh");                      // a lap time (VoicePack.norm reads "1:05.3" as "1 oh 5 point 3")
  const names = [];
  const slot = new Set();
  for (const t of sb.TEAMS || sb.Teams?.LIST || []) for (const d of t.drivers || []) {
    names.push(d.name);
    // The engineer names a rival by timing-screen code ("VER HAS BOXED"); on
    // the radio that is the surname, never the three letters read as a word.
    if (d.code) { add(String(d.code).toLowerCase(), String(d.name).trim().split(/\s+/).pop()); slot.add(String(d.code).toLowerCase()); }
  }
  // The next compound, which the pit call gives by its letter ("BOX BOX BOX — M"):
  // the engineer's alone. The coach and race control name the player's KEYS
  // instead ("ACTIVE AERO, Z, YOU CAN OPEN IT NOW", js/input/input.js keyLabel),
  // so there a letter is the letter — except "a" and "i", which are words first.
  if (spec.speaker === "radio") for (const [k, t] of Object.entries({ s: "Softs", m: "Mediums", h: "Hards", i: "Inters", w: "Wets" })) add(k, t);
  else if (spec.speaker !== "announcer") {
    for (const c of "bcdefghjklmnopqrstuvwxyz") add(c, c.toUpperCase());
    for (const k of ["shift", "space", "enter", "tab", "control", "alt", "up", "down", "left", "right", "num"]) add(k, k);
  }
  for (const l of sb.Legends?.LIST || sb.LEGENDS || []) names.push(l.name);
  for (const n of names) {
    const s = String(n).trim().split(/\s+/).pop();
    if (!s) continue;
    // RadioLines.surname is what a line carries; norm lowercases it the same way.
    const k = norm(speakable(s.toUpperCase())).filter((t) => typeof t === "string").join(" ");
    add(k, s); slot.add(k);
  }
  // ── THE CHANNEL'S OWN PHRASES ──
  const P = sb.RadioLines.POOLS;
  if (spec.speaker === "radio") {
    for (const [k, pool] of Object.entries(P)) if (k.startsWith("eng.")) for (const t of pool) literalRuns(t);
    const eng = fs.readFileSync(path.join(ROOT, "js/race/engineer.js"), "utf8");
    // Every string literal carrying an upper-case word, including the pieces a
    // line is concatenated from (", ABOUT ", " LAP"). A leading "s" is the
    // seconds suffix of a number before it ("21s LOST"), which speakable()
    // already turns into the word "seconds".
    for (const m of eng.matchAll(/"([^"\n]*[A-Z]{2,}[^"\n]*)"/g)) {
      literalRuns(m[1].replace(/^s\b/, "").replace(/\d+/g, "{n}").replace(/%/g, " PERCENT"));
    }
    for (const [key, text] of Object.entries(sb.Spotter.KEYS)) add(key, text);
  }
  if (spec.speaker === "announcer") {
    for (const [k, pool] of Object.entries(P)) if (k.startsWith("tv.")) for (const t of pool) literalRuns(t);
    for (const why of Object.values(sb.RadioLines.WHY || {})) literalRuns(why);
  }
  const cardLiterals = (f) => {
    let src = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (f === "js/game.js") src = src.split("\n").filter((l) => /announce\(/.test(l)).join("\n");
    return [...src.matchAll(/["`]([^"`\n]*[A-Z]{2,}[^"`\n]*)["`]/g)].map((m) => m[1].replace(/\$\{[^}]*\}/g, "{x}"));
  };
  for (const f of spec.runs) for (const lit of cardLiterals(f)) literalRuns(lit.replace(/\d+/g, "{n}").replace(/%/g, " PERCENT"));
  // What the channel was heard saying in real races, cut at its slot values
  // (numbers, positions, names), so the fixed wording records as whole phrases.
  const corpusPath = path.join(ROOT, CORPUS);
  const corpus = fs.existsSync(corpusPath) ? JSON.parse(fs.readFileSync(corpusPath, "utf8")) : {};
  const isSlot = (w, next) => /^\d/.test(w) || slot.has(w) || (w === "p" && /^\d/.test(next || ""));
  for (const line of corpus[spec.speaker] || []) {
    let cur = [];
    const toks = norm(line);
    toks.forEach((t, i) => {
      if (typeof t === "string" && !isSlot(t, toks[i + 1]) && !(i > 0 && toks[i - 1] === "p" && /^\d/.test(t))) cur.push(t);
      else { if (cur.length) add(keyOf(cur)); cur = []; }
    });
    if (cur.length) add(keyOf(cur));
  }
  // THE SAFETY NET: every word a card can carry, on its own (feedFiles above).
  // The commentator's lines are all phrasebook templates, which the runs above
  // already cover whole.
  if (spec.speaker !== "announcer") {
    for (const f of feedFiles()) {
      for (const lit of cardLiterals(f)) for (const t of norm(speakable(lit.replace(/\{x\}/g, " ")))) if (typeof t === "string" && /^[a-z][a-z']*$/.test(t)) add(t);
    }
    for (const line of corpus[spec.speaker] || []) for (const t of norm(line)) if (typeof t === "string" && /^[a-z][a-z']*$/.test(t)) add(t);
  }
  for (const p of fallbackVocabulary(id, speaker)) add(p.key, p.text);
  for (const p of fullPhrases(id, speaker)) add(p.key, p.text);
  return [...out].map(([key, text]) => ({ key, text }));
}

/** Whole calls first, fragments only for unbounded numbers and names. */
export function fullPhrases(id, speaker) {
  const spec = specFor(id, speaker);
  const sb = sandbox(["js/audio/voice-pack.js", "js/audio/radio-voice.js", "js/race/radio-lines.js",
    "js/data/circuit-lore.js", "js/audio/announcer.js"]);
  const out = new Map();
  const add = (line) => {
    const text = sb.RadioVoice.speakable(line);
    if (text) out.set(sb.VoicePack.lineKey(text), text);
  };
  add(sb.RadioVoice.SAMPLE[spec.speaker]);
  const prefix = spec.speaker === "radio" ? "eng." : spec.speaker === "announcer" ? "tv." : "";
  if (prefix) for (const [pool, lines] of Object.entries(sb.RadioLines.POOLS)) if (pool.startsWith(prefix)) {
    for (const line of lines) if (!/\{\w+\}/.test(line)) add(line);
  }
  if (spec.speaker === "announcer") {
    const require = createRequire(import.meta.url);
    const { CIRCUITS } = require("../manifest.cjs");
    for (const id of CIRCUITS) vm.runInContext(fs.readFileSync(path.join(ROOT, "js/circuits/" + id + ".js"), "utf8"), sb);
    for (const track of sb.TrackDefs) for (let variant = 0; variant < 3; variant++) {
      for (const row of sb.Announcer.rows({ track, variant })) add(row.text);
      for (const weather of ["rain", "wet", "fog", "overcast"]) {
        for (const row of sb.Announcer.rows({ track, weather, tod: "night" })) add(row.text);
      }
    }
    for (const session of ["tt", "quali"]) for (const practice of [false, true]) {
      for (const row of sb.Announcer.rows({ session, practice })) add(row.text);
    }
    for (const mode of [{ practice: true }, { duel: true }, { sprint: true },
      { real: { watch: true } }, { real: { watch: true, reel: true } }, { real: { startLap: 2 } }]) {
      for (const row of sb.Announcer.rows(mode)) add(row.text);
    }
    for (let laps = 1; laps <= 100; laps++) add(laps + " laps. Let's go racing.");
    add("Norris gets past Piastri for P3");
    add("By just 1.4! Norris wins it!");
  }
  return [...out].map(([key, text]) => ({ key, text }));
}

export function binaryIntegrity(bin) {
  return { sha256: createHash("sha256").update(bin).digest("hex"), bytes: bin.byteLength };
}

// Refresh metadata without synthesis or rewriting any recorded audio bytes.
export function stampIntegrity(outDir) {
  let count = 0;
  for (const file of fs.readdirSync(outDir).filter((f) => f.endsWith(".json")).sort()) {
    const jsonPath = path.join(outDir, file);
    const man = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    man.binary = binaryIntegrity(fs.readFileSync(path.join(outDir, file.replace(/\.json$/, ".bin"))));
    if (man.opus) man.opus.binary = binaryIntegrity(fs.readFileSync(path.join(outDir, man.opus.file)));
    publishFiles([[jsonPath, JSON.stringify(man) + "\n"]]);
    count++;
  }
  return count;
}

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const MODEL_OPTIONS = { device: "cpu", session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 } };
const ENCODING = ["-af",
  "silenceremove=start_periods=1:start_threshold=-38dB:start_silence=0.01,areverse,silenceremove=start_periods=1:start_threshold=-38dB:start_silence=0.03,areverse",
  "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "32k"];

// THE OPUS TWIN (`--opus`; docs/notes/ASSET-COMPRESSION-2026-10-24.md): the
// same trimmed render encoded a second time as self-contained Ogg Opus clips,
// written next to the MP3 as <pack>.opus.bin and indexed under the .json's
// `opus` block. js/audio/voice-pack.js plays it only where a real decode of an
// Ogg Opus probe succeeds, and the MP3 stays the fallback, so the MP3 encode
// above is never changed by this. Each clip carries its own OpusHead because
// the game decodes clips one slice at a time. Speech at 20 kbps is ~64 % of the
// 32 kbps MP3's bytes (measured over 150 george and fable clips).
export const OPUS_KBPS = 20;
const OPUS_ENCODING = [ENCODING[0], ENCODING[1], "-ac", "1", "-ar", "24000", "-c:a", "libopus",
  "-b:a", OPUS_KBPS + "k", "-application", "voip", "-map_metadata", "-1", "-fflags", "+bitexact", "-f", "ogg"];

// Shared by full builds and append: only a missing encode may load Kokoro.
// Hash the actual recipe; bump `recipe` when a dependency upgrade changes audio.
// `opus` ({ clips, chunks }) also records the Opus twin; omitted, nothing about
// the MP3 build changes.
export async function recordClips({ list, cache, voice, dtype, speed, loadTTS, getFFmpeg, clips = {}, chunks = [], opus = null }) {
  // A word said on its own gets a whole sentence's prosody, which is slow:
  // Kokoro gave "to" half a second. Short fragments are rendered faster so a
  // spliced line runs at an engineer's pace; numbers stay a touch clearer.
  const speedFor = (key) => {
    const words = key.split(" ").length;
    if (/^[0-9]/.test(key) || /^p [0-9]/.test(key)) return +(speed * 1.08).toFixed(2);
    return +(words <= 1 ? speed * 1.22 : words === 2 ? speed * 1.12 : speed).toFixed(2);
  };
  const safe = (k) => k.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
  // A clip with no readable duration is a broken encode: fail, never index a
  // 0 s clip the splicer would schedule on top of the next one.
  const durationOf = (file) => {
    const probe = spawnSync(getFFmpeg(), ["-i", file], { encoding: "utf8" }).stderr || "";
    const dm = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
    const secs = dm ? +((+dm[1]) * 3600 + (+dm[2]) * 60 + (+dm[3])).toFixed(3) : NaN;
    if (!(secs > 0)) throw new Error(`[voicepack] no duration for ${path.basename(file)}: ${dm ? dm[0] : "probe printed none"}`);
    return secs;
  };
  // A cache hit is a non-empty file: an encode killed mid-write leaves an empty
  // or missing one, which re-renders instead of publishing as silence.
  const cached = (file) => { try { return fs.statSync(file).size > 0; } catch (_) { return false; } };
  let off = chunks.reduce((n, buf) => n + buf.length, 0), i = 0, tts;
  let opusOff = opus ? opus.chunks.reduce((n, buf) => n + buf.length, 0) : 0;
  for (const { key, text } of list) {
    i++;
    const wantOpus = !!opus && !opus.clips[key];
    if (clips[key] && !wantOpus) continue;
    const sp = key.startsWith("@line:") ? speed : speedFor(key);
    const name = (encoding, ext) => path.join(cache, safe(key) + "_" + createHash("sha256").update(JSON.stringify({
      recipe: 1, key, text, model: MODEL, options: { ...MODEL_OPTIONS, dtype }, voice, speed: sp, encoding,
    })).digest("hex") + ext);
    const mp3 = name(ENCODING, ".mp3");
    const ogg = wantOpus ? name(OPUS_ENCODING, ".ogg") : null;
    if (!cached(mp3) || (ogg && !cached(ogg))) {
      const wav = mp3.replace(/\.mp3$/, ".wav");
      tts ||= await loadTTS();
      const audio = await tts.generate(text, { voice, speed: sp });
      await audio.save(wav);
      // Trim Kokoro's lead-in and tail, both ends, then encode.
      if (!cached(mp3)) execFileSync(getFFmpeg(), ["-y", "-loglevel", "error", "-i", wav, ...ENCODING, mp3]);
      if (ogg && !cached(ogg)) execFileSync(getFFmpeg(), ["-y", "-loglevel", "error", "-i", wav, ...OPUS_ENCODING, ogg]);
      fs.unlinkSync(wav);
    }
    if (!clips[key]) {
      const buf = fs.readFileSync(mp3);
      clips[key] = [off, buf.length, durationOf(mp3)];
      chunks.push(buf);
      off += buf.length;
    }
    if (ogg) {
      const buf = fs.readFileSync(ogg);
      opus.clips[key] = [opusOff, buf.length, durationOf(ogg)];
      opus.chunks.push(buf);
      opusOff += buf.length;
    }
    if (i % 25 === 0) console.log(`[voicepack] ${i}/${list.length}`);
  }
  const out = { clips, binary: Buffer.concat(chunks) };
  if (opus) out.opus = { clips: opus.clips, binary: Buffer.concat(opus.chunks) };
  return out;
}

async function build() {
  const kdir = path.resolve(ROOT, arg("kokoro", "scratch/voicepack"));
  const req = createRequire(path.join(kdir, "package.json"));
  let ffmpeg;
  const getFFmpeg = () => ffmpeg ||= arg("ffmpeg", null) || req("ffmpeg-static");
  const loadTTS = async () => {
    const { KokoroTTS } = await import(req.resolve("kokoro-js"));
    return KokoroTTS.from_pretrained(MODEL, { ...MODEL_OPTIONS, dtype });
  };
  const id = arg("id", "george"), dtype = arg("dtype", "q4");
  const spec = specFor(id, arg("speaker", null));
  const pack = spec.pack;   // the file written: <id>, or <id>-<speaker> for a channel that is not the voice's own
  const voice = arg("voice", VOICES[id].voice);
  const speed = +arg("speed", String(VOICES[id].speed));
  const outDir = path.resolve(ROOT, arg("out", "assets/voice"));
  const cache = path.join(ROOT, "artifacts", "voicepack", id, voice + "-" + dtype);
  fs.mkdirSync(cache, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  // --opus-only: add the Opus twin to a published pack without touching one MP3
  // byte. The twin covers exactly the pack's own keys (a phrase the harvester no
  // longer emits is spoken from its key, as fallbackVocabulary does).
  const opusOnly = flag("opus-only");
  let list = flag("append") || opusOnly ? [...fallbackVocabulary(id, spec.speaker), ...fullPhrases(id, spec.speaker)] : phrases(id, spec.speaker);
  if (opusOnly) {
    const textOf = new Map([...phrases(id, spec.speaker), ...list].map((p) => [p.key, p.text]));
    const published = JSON.parse(fs.readFileSync(path.join(outDir, pack + ".json"), "utf8")).clips;
    list = Object.keys(published).map((key) => ({ key, text: textOf.get(key) ?? key.replace(/^@line:/, "") }));
  }
  const clips = {};
  const chunks = [];
  const opusFile = pack + ".opus.bin";
  const opus = flag("opus") || opusOnly ? { clips: {}, chunks: [] } : null;
  if (flag("append") || opusOnly) {
    const old = JSON.parse(fs.readFileSync(path.join(outDir, pack + ".json"), "utf8"));
    if (old.voice !== voice) throw new Error("--append cannot mix different voices");
    const bin = fs.readFileSync(path.join(outDir, pack + ".bin"));
    checkPrior(old, bin, pack + ".bin");
    Object.assign(clips, old.clips); chunks.push(bin);
    // An existing twin is extended like the MP3; without one, --opus records every clip.
    if (opus && old.opus && fs.existsSync(path.join(outDir, opusFile))) {
      const twinBin = fs.readFileSync(path.join(outDir, opusFile));
      checkPrior(old.opus, twinBin, opusFile);
      Object.assign(opus.clips, old.opus.clips); opus.chunks.push(twinBin);
    }
  }
  const { binary, opus: twin } = await recordClips({ list, cache, voice, dtype, speed, loadTTS, getFFmpeg, clips, chunks, opus });
  const files = [[path.join(outDir, pack + ".bin"), binary]];
  const man = { v: 1, id: pack, voice, speaker: spec.speaker, model: "Kokoro-82M v1.0 (ONNX " + dtype + ")", licence: "Apache-2.0", speed, clips, binary: binaryIntegrity(binary) };
  if (twin) {
    files.push([path.join(outDir, opusFile), twin.binary]);
    man.opus = { codec: "opus", container: "ogg", kbps: OPUS_KBPS, file: opusFile, binary: binaryIntegrity(twin.binary), clips: twin.clips };
  }
  files.push([path.join(outDir, pack + ".json"), JSON.stringify(man) + "\n"]);
  publishFiles(files);
  // A twin must never outlive the MP3 it was cut beside; the new index no longer
  // names it, so it goes after the index is in place.
  if (!twin && fs.existsSync(path.join(outDir, opusFile))) fs.unlinkSync(path.join(outDir, opusFile));
  console.log(`[voicepack] ${pack}: ${list.length} clips, ${(binary.length / 1024).toFixed(0)} KB` +
    (twin ? `, opus ${(twin.binary.length / 1024).toFixed(0)} KB` : ""));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { cli = parseCli(process.argv.slice(2)); } catch (e) { console.error("[voicepack] " + e.message); process.exit(2); }
  if (flag("list")) for (const p of phrases(arg("id", "george"), arg("speaker", null))) console.log(p.key + (p.text !== p.key ? "\t" + p.text : ""));
  else if (flag("integrity-only")) console.log(`[voicepack] integrity metadata: ${stampIntegrity(path.resolve(ROOT, arg("out", "assets/voice")))} packs`);
  else await build();
}
