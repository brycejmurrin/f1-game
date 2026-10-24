#!/usr/bin/env node
// @doc Cap soundtrack bitrate: re-encode listed assets/music tracks to 128 kbps from their git originals; --check scans frames.
/**
 * compress-audio — the soundtrack's bitrate cap (docs/notes/ASSET-COMPRESSION-2026-10-24.md).
 *
 * The playlist streams through <audio> (js/audio/soundtrack.js), so every
 * kilobit is paid for on every play, and GitHub Pages does not gzip audio/mp3.
 * Three of Bryce's tracks shipped at 160-192 kbps. Bryce approved 128 kbps for
 * them on 2026-10-24, via OrchA 32: "Yes, 128 kbps".
 *
 * REPRODUCIBLE FROM GIT: each TRACKS row names the commit that holds the
 * original bytes, with their digest. `--apply` re-encodes FROM THAT ORIGINAL,
 * never from an already-capped file, so a re-run never stacks a second lossy
 * pass. A file whose bytes are neither the original nor a valid capped encode
 * is refused.
 *
 *   node tools/gen/compress-audio.mjs            # same as --check
 *   node tools/gen/compress-audio.mjs --check    # every frame of every listed track at the cap
 *   node tools/gen/compress-audio.mjs --apply [--ffmpeg /usr/bin/ffmpeg]
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const CAP_KBPS = 128;
// The originals, as committed before the cap (deploy tip dd923f85).
const ORIGIN = "dd923f8596bac7670a8a32995f6bf19953c02610";
export const TRACKS = Object.freeze([
  { file: "assets/music/menu.mp3", origin: ORIGIN, sha256: "15374e2cfa90c16b6399063f81b755b70e2df8c794f697d72a40f0b685fd043a", bytes: 3898559, kbps: 160, seconds: 194.900 },
  { file: "assets/music/song2.mp3", origin: ORIGIN, sha256: "822efd8b83c7416ff055bcf314672f892221c48c805231b3ed59fa7cdab187ff", bytes: 4651395, kbps: 192, seconds: 193.776 },
  { file: "assets/music/song5.mp3", origin: ORIGIN, sha256: "66fe0302d942e2e35197d3e2055bc950d1876eef9f275a6c5fe5b8f15ce1c995", bytes: 4764244, kbps: 192, seconds: 198.478 },
]);

// 44.1 kHz stereo CBR: the originals' rate and layout, so only the bitrate changes.
// -bitexact keeps the encoder string out of the stream; no tags, no cover art.
export const ENCODING = ["-map", "0:a:0", "-c:a", "libmp3lame", "-b:a", CAP_KBPS + "k", "-ar", "44100", "-ac", "2",
  "-map_metadata", "-1", "-id3v2_version", "0", "-write_xing", "1", "-fflags", "+bitexact", "-flags:a", "+bitexact", "-f", "mp3"];

const BITRATE_L3_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const RATE_V1 = [44100, 48000, 32000, 0];

/** Walk every MPEG-1 Layer III frame: { frames, maxKbps, minKbps, seconds, sampleRate, channels }. Throws on anything else. */
export function scanMp3(buf) {
  let p = 0;
  if (buf.length >= 10 && buf.toString("latin1", 0, 3) === "ID3") {
    p = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  }
  let frames = 0, maxKbps = 0, minKbps = Infinity, samples = 0, sampleRate = 0, channels = 0;
  while (p + 4 <= buf.length) {
    if (buf[p] !== 0xff || (buf[p + 1] & 0xe0) !== 0xe0) {
      // A trailing ID3v1 tag or padding after the last frame ends the stream; junk mid-stream is an error.
      if (frames && (buf.toString("latin1", p, p + 3) === "TAG" || buf.subarray(p).every((b) => b === 0))) break;
      throw new Error(`not an MP3 frame at byte ${p}`);
    }
    const version = (buf[p + 1] >> 3) & 3, layer = (buf[p + 1] >> 1) & 3;
    if (version !== 3 || layer !== 1) throw new Error(`frame ${frames}: not MPEG-1 Layer III`);
    const kbps = BITRATE_L3_V1[buf[p + 2] >> 4], rate = RATE_V1[(buf[p + 2] >> 2) & 3], pad = (buf[p + 2] >> 1) & 1;
    if (!kbps || !rate) throw new Error(`frame ${frames}: bad bitrate or sample rate`);
    sampleRate ||= rate;
    channels ||= (buf[p + 3] >> 6) === 3 ? 1 : 2;
    maxKbps = Math.max(maxKbps, kbps); minKbps = Math.min(minKbps, kbps);
    p += Math.floor(144000 * kbps / rate) + pad;
    frames++; samples += 1152;
  }
  if (!frames) throw new Error("no MP3 frames");
  return { frames, maxKbps, minKbps, seconds: +(samples / sampleRate).toFixed(3), sampleRate, channels };
}

const sha = (b) => createHash("sha256").update(b).digest("hex");

/** Problems with the listed tracks as committed: [] when every one is at the cap. */
export function check(root = ROOT) {
  const problems = [];
  for (const t of TRACKS) {
    const buf = fs.readFileSync(path.join(root, t.file));
    let s;
    try { s = scanMp3(buf); } catch (e) { problems.push(`${t.file}: ${e.message}`); continue; }
    if (s.maxKbps > CAP_KBPS) problems.push(`${t.file}: frames up to ${s.maxKbps} kbps, over the ${CAP_KBPS} kbps cap (run --apply)`);
    if (s.sampleRate !== 44100 || s.channels !== 2) problems.push(`${t.file}: ${s.sampleRate} Hz × ${s.channels} ch, not the original 44.1 kHz stereo`);
    // An encoder adds at most a frame or two of priming; a lost tail would be far more.
    if (Math.abs(s.seconds - t.seconds) > 0.1) problems.push(`${t.file}: ${s.seconds} s, the original is ${t.seconds} s`);
  }
  return problems;
}

function apply(ffmpeg) {
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(ROOT, "scratch", "compress-audio-"));
  try {
    for (const t of TRACKS) {
      const abs = path.join(ROOT, t.file);
      const now = fs.readFileSync(abs);
      if (sha(now) !== t.sha256) {
        const s = scanMp3(now);
        if (s.maxKbps <= CAP_KBPS) { console.log(`[compress-audio] ${t.file}: already ${s.maxKbps} kbps, kept`); continue; }
        throw new Error(`${t.file}: neither the recorded original nor a capped encode; update TRACKS first`);
      }
      // Encode from the git original, byte-checked, never from the working file's history.
      const orig = execFileSync("git", ["-C", ROOT, "show", `${t.origin}:${t.file}`], { maxBuffer: 64 << 20 });
      if (sha(orig) !== t.sha256 || orig.length !== t.bytes) throw new Error(`${t.file}: ${t.origin} does not hold the recorded original`);
      const src = path.join(tmp, "src.mp3"), out = path.join(tmp, "out.mp3");
      fs.writeFileSync(src, orig);
      execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", src, ...ENCODING, out]);
      const bytes = fs.readFileSync(out);
      fs.writeFileSync(abs, bytes);
      console.log(`[compress-audio] ${t.file}: ${t.kbps} → ${CAP_KBPS} kbps, ${t.bytes} → ${bytes.length} B (${(100 * bytes.length / t.bytes).toFixed(1)} %)`);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf("--ffmpeg");
  if (process.argv.includes("--apply")) apply(i > 0 ? process.argv[i + 1] : "ffmpeg");
  const problems = check();
  for (const p of problems) console.error(`[compress-audio] ${p}`);
  console.log(problems.length ? `= compress-audio ${problems.length} problem(s)` : `= compress-audio ok (${TRACKS.length} tracks at ≤ ${CAP_KBPS} kbps)`);
  process.exitCode = problems.length ? 1 : 0;
}
