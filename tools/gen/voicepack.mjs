#!/usr/bin/env node
/*
 * @doc Author-time radio voice pack (Kokoro-82M) → `assets/voice/<id>.{bin,json}`; `--list` prints the phrases.
 * @skill audio-debug
 * AUTHOR-TIME ONLY: never loaded by the game. js/audio/voice-pack.js plays what
 * this writes, and both use VoicePack.norm, so a key written here is exactly a
 * key the game looks up.
 *
 * THE PHRASES are harvested, not hand-listed, so a new radio line is covered by
 * re-running this:
 *   - every literal run of every `eng.*` template in js/race/radio-lines.js,
 *     cut at its {slots} and its punctuation;
 *   - every ALL-CAPS string literal in js/race/engineer.js, cut the same way;
 *   - the slot values a line can carry: P1-P22, 1-60, gaps 0.1-9.9, "seconds",
 *     the surnames of the 2026 grid (js/data/teams.js) and the legends;
 *   - the spotter's calls (js/race/spotter.js Spotter.KEYS).
 *
 * THE VOICE is Kokoro-82M (Apache-2.0, weights and voices), rendered on CPU by
 * kokoro-js, trimmed of its lead-in and tail silence and encoded as 24 kHz mono
 * MP3 by ffmpeg — MP3 because every browser's decodeAudioData takes it, where
 * Ogg Opus is still missing on older Safari. Neither tool ships: they live in a
 * scratch install (`--kokoro <dir>` holding node_modules/kokoro-js and
 * node_modules/ffmpeg-static; ~1 GB, never committed).
 *
 * Usage:
 *   node tools/gen/voicepack.mjs --list
 *   node tools/gen/voicepack.mjs --kokoro scratch/voicepack [--voice bm_george] [--id george] [--dtype q4] [--speed 1.08]
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes("--" + k);

function sandbox(files) {
  const sb = { Math, Object, Array, Number, String, JSON, Map, Set, Promise, console, Log: { info() {}, warn() {} } };
  sb.window = sb;
  vm.createContext(sb);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var"), sb, { filename: f });
  return sb;
}

/** Every phrase the pack should hold: [{ key, text }], de-duplicated by key. */
export function phrases() {
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
    for (const part of parts) for (const r of runs(part)) add(keyOf(r));
  };
  for (const [k, pool] of Object.entries(sb.RadioLines.POOLS)) if (k.startsWith("eng.")) for (const t of pool) literalRuns(t);
  const eng = fs.readFileSync(path.join(ROOT, "js/race/engineer.js"), "utf8");
  // Every string literal carrying an upper-case word, including the pieces a
  // line is concatenated from (", ABOUT ", " LAP"). A leading "s" is the
  // seconds suffix of a number before it ("21s LOST"), which speakable()
  // already turns into the word "seconds".
  for (const m of eng.matchAll(/"([^"\n]*[A-Z]{2,}[^"\n]*)"/g)) {
    literalRuns(m[1].replace(/^s\b/, "").replace(/\d+/g, "{n}").replace(/%/g, " PERCENT"));
  }
  add("percent", "percent");
  for (let n = 1; n <= 22; n++) add("p " + n, "P " + n);
  for (let n = 0; n <= 100; n++) add(String(n), String(n));   // laps, laps to go, tyre percent
  for (let d = 1; d < 100; d++) { const g = (d / 10).toFixed(1); add(g, g); }
  add("seconds", "seconds");
  const names = [];
  for (const t of sb.TEAMS || sb.Teams?.LIST || []) for (const d of t.drivers || []) {
    names.push(d.name);
    // The engineer names a rival by timing-screen code ("VER HAS BOXED"); on
    // the radio that is the surname, never the three letters read as a word.
    if (d.code) add(String(d.code).toLowerCase(), String(d.name).trim().split(/\s+/).pop());
  }
  // The next compound, which the pit call gives by its letter ("BOX BOX BOX — M").
  for (const [k, t] of Object.entries({ s: "Softs", m: "Mediums", h: "Hards", i: "Inters", w: "Wets" })) add(k, t);
  for (const l of sb.Legends?.LIST || sb.LEGENDS || []) names.push(l.name);
  for (const n of names) { const s = String(n).trim().split(/\s+/).pop(); if (s) add(s.toLowerCase(), s); }
  for (const [key, text] of Object.entries(sb.Spotter.KEYS)) add(key, text);
  return [...out].map(([key, text]) => ({ key, text }));
}

async function build() {
  const kdir = path.resolve(ROOT, arg("kokoro", "scratch/voicepack"));
  const req = createRequire(path.join(kdir, "package.json"));
  const { KokoroTTS } = await import(req.resolve("kokoro-js"));
  const ffmpeg = req("ffmpeg-static");
  const voice = arg("voice", "bm_george"), id = arg("id", "george"), dtype = arg("dtype", "q4");
  const speed = +arg("speed", "1.12");
  // A word said on its own gets a whole sentence's prosody, which is slow:
  // Kokoro gave "to" half a second. Short fragments are rendered faster so a
  // spliced line runs at an engineer's pace; numbers stay a touch clearer.
  const speedFor = (key) => {
    const words = key.split(" ").length;
    if (/^[0-9]/.test(key) || /^p [0-9]/.test(key)) return +(speed * 1.08).toFixed(2);
    return +(words <= 1 ? speed * 1.22 : words === 2 ? speed * 1.12 : speed).toFixed(2);
  };
  const KBPS = 32;
  const outDir = path.resolve(ROOT, arg("out", "assets/voice"));
  const cache = path.join(ROOT, "artifacts", "voicepack", id);
  fs.mkdirSync(cache, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  const list = phrases();
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype, device: "cpu" });
  const safe = (k) => k.replace(/[^a-z0-9]+/gi, "_").slice(0, 60) + "_" + Buffer.from(k).toString("hex").slice(0, 8);
  const clips = {};
  const chunks = [];
  let off = 0, i = 0;
  for (const { key, text } of list) {
    i++;
    const sp = speedFor(key);
    const mp3 = path.join(cache, safe(key) + "_" + sp + "_" + KBPS + ".mp3");
    if (!fs.existsSync(mp3)) {
      const wav = mp3.replace(/\.mp3$/, ".wav");
      const audio = await tts.generate(text, { voice, speed: sp });
      await audio.save(wav);
      // Trim Kokoro's lead-in and tail, both ends, then encode.
      execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", wav, "-af",
        "silenceremove=start_periods=1:start_threshold=-38dB:start_silence=0.01,areverse,silenceremove=start_periods=1:start_threshold=-38dB:start_silence=0.03,areverse",
        "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", KBPS + "k", mp3]);
      fs.unlinkSync(wav);
    }
    const buf = fs.readFileSync(mp3);
    const probe = spawnSync(ffmpeg, ["-i", mp3], { encoding: "utf8" }).stderr || "";
    const dm = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
    const dur = dm ? (+dm[1]) * 3600 + (+dm[2]) * 60 + (+dm[3]) : 0;
    clips[key] = [off, buf.length, +dur.toFixed(3)];
    chunks.push(buf);
    off += buf.length;
    if (i % 25 === 0) console.log(`[voicepack] ${i}/${list.length}`);
  }
  fs.writeFileSync(path.join(outDir, id + ".bin"), Buffer.concat(chunks));
  const man = { v: 1, id, voice, model: "Kokoro-82M v1.0 (ONNX " + dtype + ")", licence: "Apache-2.0", speed, clips };
  fs.writeFileSync(path.join(outDir, id + ".json"), JSON.stringify(man) + "\n");
  console.log(`[voicepack] ${id}: ${list.length} clips, ${(off / 1024).toFixed(0)} KB`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (flag("list")) for (const p of phrases()) console.log(p.key + (p.text !== p.key ? "\t" + p.text : ""));
  else await build();
}
