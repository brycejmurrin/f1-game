/* manifest-screenshots.test.mjs — W24 row 6: Android's richer install UI on a
 * phone shows only screenshots whose form_factor is "narrow" or absent
 * (https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/screenshots).
 * Both were "wide", so a phone install prompt had none. The game is played
 * landscape on phones, so a landscape still with no form_factor is the true
 * picture there. Every declared size must be the file's real size.
 *
 * Also pins install / shortcut / appearance-picker icons under icons/** so a
 * bad regenerate cannot ship a wrong size or a maskable mark that bleeds past
 * Chrome's safe zone. SW seed membership is proven by behaviour in
 * offline-precache-nav.test.mjs (install fetch + cache, not source greps).
 *
 * Run: node --test tests/unit/manifest-screenshots.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel));
const manifest = JSON.parse(read("manifest.json").toString("utf8"));

function webpSize(buf) {
  const t = buf.toString("latin1", 12, 16);
  if (t === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (t === "VP8L") { const v = buf.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
  if (t === "VP8X") return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  throw new Error("not a webp");
}

function pngSize(buf) {
  assert.equal(buf.subarray(1, 4).toString("ascii"), "PNG", "not a PNG");
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test("at least one screenshot applies to a phone (narrow or no form_factor) and one to desktop", () => {
  const shots = manifest.screenshots;
  assert.ok(shots.some((s) => !("form_factor" in s) || s.form_factor === "narrow"), "a phone install prompt has a screenshot");
  assert.ok(shots.some((s) => !("form_factor" in s) || s.form_factor === "wide"));
  for (const s of shots) if ("form_factor" in s) assert.ok(["narrow", "wide"].includes(s.form_factor), s.src);
});

test("each screenshot exists at its declared size within Chrome's 2.3:1 aspect bound", () => {
  for (const s of manifest.screenshots) {
    const [w, h] = webpSize(read(s.src));
    assert.equal(`${w}x${h}`, s.sizes, s.src);
    assert.ok(Math.max(w, h) / Math.min(w, h) <= 2.3 && Math.min(w, h) >= 320, s.src);
  }
});

test("every manifest install icon exists at its declared PNG size", () => {
  assert.ok(manifest.icons.some((i) => !i.purpose || /\bany\b/.test(i.purpose)), "at least one any-purpose (or default) icon");
  assert.ok(manifest.icons.some((i) => i.purpose && /\bmaskable\b/.test(i.purpose)), "a maskable icon for Android adaptive icons");
  for (const icon of manifest.icons) {
    const [w, h] = pngSize(read(icon.src));
    assert.equal(`${w}x${h}`, icon.sizes, icon.src);
  }
});

test("manifest shortcut icons are shipped 96x96 PNGs", () => {
  const srcs = [...new Set((manifest.shortcuts || []).flatMap((s) => (s.icons || []).map((i) => i.src).filter(Boolean)))];
  assert.ok(srcs.length > 0, "shortcuts declare icons");
  for (const src of srcs) {
    const [w, h] = pngSize(read(src));
    assert.equal(w, 96, src);
    assert.equal(h, 96, src);
  }
});

test("appearance picker sets A–F ship 32px favicons and 180px apple-touch icons", () => {
  for (const letter of ["A", "B", "C", "D", "E", "F"]) {
    for (const [rel, size] of [["favicon-32.png", 32], ["apple-touch-180.png", 180]]) {
      const src = `icons/shortcuts/${letter}/${rel}`;
      const [w, h] = pngSize(read(src));
      assert.equal(w, size, src);
      assert.equal(h, size, src);
    }
  }
});

// Chrome's maskable safe zone is the central 80% circle (40% radius). Content
// outside it is cropped on Android adaptive icons.
// https://web.dev/articles/maskable-icon
test("the maskable install icon keeps non-background ink inside the safe zone", async () => {
  const icon = manifest.icons.find((i) => i.purpose && /\bmaskable\b/.test(i.purpose));
  assert.ok(icon, "manifest declares a maskable icon");
  const { data, info } = await sharp(path.join(ROOT, icon.src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  assert.equal(w, h, "maskable icons are square");
  const bg = [data[0], data[1], data[2]];
  const cx = w / 2, cy = h / 2, safeR = 0.4 * w;
  let outside = 0, ink = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * channels;
      const dr = Math.abs(data[o] - bg[0]) + Math.abs(data[o + 1] - bg[1]) + Math.abs(data[o + 2] - bg[2]);
      if (dr <= 24) continue;
      ink++;
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (dist > safeR) outside++;
    }
  }
  assert.ok(ink > 0, "maskable icon is not empty");
  assert.equal(outside, 0, `${outside} ink pixels sit outside the 80% safe zone`);
});
