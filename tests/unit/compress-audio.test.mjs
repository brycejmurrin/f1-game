/* compress-audio.test.mjs — the soundtrack's 128 kbps cap (tools/gen/compress-audio.mjs).
 *
 * The playlist streams through <audio> on every play, and Pages does not gzip
 * audio/mp3, so a track committed above the cap costs every player bytes. The
 * cap holds when EVERY frame of each listed track is at or under 128 kbps, the
 * track is still 44.1 kHz stereo, and it is as long as the original (a lost tail
 * or priming would show here). The frame walker is pinned on synthetic frames
 * so a parser bug cannot pass the real files vacuously.
 *
 * Run: node --test tests/unit/compress-audio.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAP_KBPS, TRACKS, check, scanMp3 } from "../../tools/gen/compress-audio.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// One MPEG-1 Layer III frame header: bitrate index, 44.1 kHz, no padding, joint stereo.
function frames(kbpsList, { mono = false, id3 = 0 } = {}) {
  const IDX = { 32: 1, 64: 5, 128: 9, 160: 10, 192: 11 };
  const parts = [];
  if (id3) {
    const h = Buffer.alloc(10 + id3);
    h.write("ID3", 0, "latin1"); h[3] = 4;
    h[6] = (id3 >> 21) & 0x7f; h[7] = (id3 >> 14) & 0x7f; h[8] = (id3 >> 7) & 0x7f; h[9] = id3 & 0x7f;
    parts.push(h);
  }
  for (const k of kbpsList) {
    const f = Buffer.alloc(Math.floor(144000 * k / 44100));
    f[0] = 0xff; f[1] = 0xfb; f[2] = (IDX[k] << 4) | (0 << 2); f[3] = mono ? 0xc0 : 0x40;
    parts.push(f);
  }
  return Buffer.concat(parts);
}

test("the frame walker reads every frame, skips ID3v2, and refuses non-MP3 bytes", () => {
  const s = scanMp3(frames([128, 128, 160, 128], { id3: 37 }));
  assert.deepEqual({ ...s }, { frames: 4, maxKbps: 160, minKbps: 128, seconds: +(4 * 1152 / 44100).toFixed(3), sampleRate: 44100, channels: 2 });
  assert.equal(scanMp3(frames([64], { mono: true })).channels, 1);
  assert.equal(scanMp3(Buffer.concat([frames([128, 128]), Buffer.from("TAG"), Buffer.alloc(125)])).frames, 2, "a trailing ID3v1 tag ends the stream");
  assert.throws(() => scanMp3(Buffer.concat([frames([128]), Buffer.from("junk"), frames([128])])), /not an MP3 frame/);
  assert.throws(() => scanMp3(Buffer.from("OggS\0\0\0\0")), /not an MP3 frame/);
});

test("every listed soundtrack track is at the cap, 44.1 kHz stereo, and full length", () => {
  assert.equal(CAP_KBPS, 128);
  assert.deepEqual(check(), []);
  for (const t of TRACKS) {
    const s = scanMp3(fs.readFileSync(path.join(ROOT, t.file)));
    assert.ok(s.maxKbps <= CAP_KBPS && t.kbps > CAP_KBPS, `${t.file}: a listed track was over the cap and is now under it`);
    assert.ok(s.frames > 7000, `${t.file}: a whole track, not a stub`);
  }
});

test("check() names an over-cap, re-sampled or truncated track", () => {
  const dir = fs.mkdtempSync(path.join(ROOT, "scratch", "compress-audio-test-"));
  try {
    const t = TRACKS[0];
    fs.mkdirSync(path.join(dir, path.dirname(t.file)), { recursive: true });
    for (const o of TRACKS.slice(1)) {
      fs.mkdirSync(path.join(dir, path.dirname(o.file)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, o.file), path.join(dir, o.file));
    }
    fs.writeFileSync(path.join(dir, t.file), frames([192, 128]));
    const problems = check(dir);
    assert.equal(problems.length, 2, problems.join("\n"));
    assert.ok(problems[0].includes("192 kbps, over the 128 kbps cap"), problems[0]);
    assert.ok(problems[1].includes("the original is"), problems[1]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the soundtrack credits still name every track the playlist plays", () => {
  const credits = fs.readFileSync(path.join(ROOT, "assets/music/CREDITS.txt"), "utf8");
  for (const t of TRACKS) assert.ok(credits.includes(path.basename(t.file)), `${t.file} credited`);
});
