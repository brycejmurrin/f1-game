/* manifest-screenshots.test.mjs — W24 row 6: Android's richer install UI on a
 * phone shows only screenshots whose form_factor is "narrow" or absent
 * (https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/screenshots).
 * Both were "wide", so a phone install prompt had none. The game is played
 * landscape on phones, so a landscape still with no form_factor is the true
 * picture there. Every declared size must be the file's real size.
 *
 * Run: node --test tests/unit/manifest-screenshots.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync(new URL("../../manifest.json", import.meta.url), "utf8"));
function webpSize(buf) {
  const t = buf.toString("latin1", 12, 16);
  if (t === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (t === "VP8L") { const v = buf.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
  if (t === "VP8X") return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  throw new Error("not a webp");
}

test("at least one screenshot applies to a phone (narrow or no form_factor) and one to desktop", () => {
  const shots = manifest.screenshots;
  assert.ok(shots.some((s) => !("form_factor" in s) || s.form_factor === "narrow"), "a phone install prompt has a screenshot");
  assert.ok(shots.some((s) => !("form_factor" in s) || s.form_factor === "wide"));
  for (const s of shots) if ("form_factor" in s) assert.ok(["narrow", "wide"].includes(s.form_factor), s.src);
});

test("each screenshot exists at its declared size within Chrome's 2.3:1 aspect bound", () => {
  for (const s of manifest.screenshots) {
    const [w, h] = webpSize(fs.readFileSync(new URL("../../" + s.src, import.meta.url)));
    assert.equal(`${w}x${h}`, s.sizes, s.src);
    assert.ok(Math.max(w, h) / Math.min(w, h) <= 2.3 && Math.min(w, h) >= 320, s.src);
  }
});
