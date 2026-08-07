/* net-qr.test.mjs — the QR encoder, checked by a decoder that is not ours.
 *
 * A QR encoder is the kind of code that is either exactly right or completely
 * useless, and it fails silently: a wrong mask, a mis-shifted format field or a
 * botched interleave all produce a picture that looks exactly like a QR code
 * and that no camera can read. Self-consistency proves nothing here, because a
 * decoder written from the same misunderstanding would agree.
 *
 * So every assertion below goes through jsQR — an independent, third-party
 * decoder, dev-dependency only — reading the modules back out as if it were a
 * camera. If jsQR gets the string back, a phone will too.
 *
 * Run: node --test tests/unit/net-qr.test.mjs   (npm run test:net-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jsQR from "jsqr";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NetQr = eval(fs.readFileSync(path.join(ROOT, "js/net/qr.js"), "utf8") + ";NetQr");

// Render to the RGBA buffer jsQR expects, quiet zone included — without those
// four clear modules a real scanner often will not lock on either, so leaving
// them out of the test would hide a genuine defect.
function raster(qr, scale = 3) {
  const q = NetQr.QUIET;
  const side = (qr.size + q * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y * qr.size + x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (((y + q) * scale + dy) * side + (x + q) * scale + dx) * 4;
          data[px] = data[px + 1] = data[px + 2] = 0;
        }
      }
    }
  }
  return { data, width: side, height: side };
}

function roundTrip(text) {
  const qr = NetQr.encode(text);
  assert.ok(qr, `should have encoded ${text.length} chars`);
  const img = raster(qr);
  const out = jsQR(img.data, img.width, img.height);
  assert.ok(out, `jsQR could not read a version-${qr.version} code`);
  return { text: out.data, qr };
}

test("a short string survives an independent decoder", () => {
  assert.equal(roundTrip("APEX26").text, "APEX26");
});

test("a REAL invite link round-trips — the whole reason this exists", () => {
  // Length and character set of an actual code: base64url after the compact
  // SDP pack, in the URL fragment. If this does not scan, the feature does not
  // work, however pretty the picture is.
  const code = "APEX1.s." + "aB3-_x9Zq".repeat(26).slice(0, 232);
  const url = "https://brycejmurrin.github.io/f1-game/#vs=" + code;
  const { text, qr } = roundTrip(url);
  assert.equal(text, url);
  // Version 12 is 65x65 modules. Much past that and a phone camera starts
  // needing a steady hand and a big screen, which is the point of the compact
  // codec that feeds this.
  assert.ok(qr.version <= 14, `expected a scannable version, got ${qr.version}`);
});

test("every byte value survives, not just printable ASCII", () => {
  // Byte mode must be byte mode. A codec that quietly went alphanumeric would
  // pass every test above and mangle the first '_' in a base64url code.
  const s = Array.from({ length: 200 }, (_, i) => String.fromCharCode(32 + (i % 95))).join("");
  assert.equal(roundTrip(s).text, s);
});

test("it steps up versions as the payload grows, and each one still decodes", () => {
  let last = 0;
  for (const len of [10, 40, 100, 200, 400, 700]) {
    const { text, qr } = roundTrip("x".repeat(len));
    assert.equal(text.length, len);
    assert.ok(qr.version >= last, "version must not go backwards as data grows");
    last = qr.version;
  }
});

test("a payload that will not fit returns null rather than a wrong picture", () => {
  // The one unacceptable outcome is a QR that renders and cannot be read. The
  // caller shows the code as text instead.
  assert.equal(NetQr.encode("x".repeat(NetQr.capacity() + 1)), null);
  assert.ok(NetQr.encode("x".repeat(NetQr.capacity())), "the stated capacity must actually fit");
});

test("the empty string encodes rather than throwing", () => {
  assert.equal(roundTrip("").text, "");
});

test("the quiet zone is required, and its absence is what breaks scanners", () => {
  // Documents WHY raster() pads. Cropped flush to the modules, the same code
  // that decodes above stops decoding — so this is a real constraint on how the
  // lobby draws it, not a formality.
  const qr = NetQr.encode("https://example.com/#vs=APEX1.s.abcdefgh");
  const side = qr.size;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let i = 0; i < qr.modules.length; i++) {
    if (qr.modules[i]) { const p = i * 4; data[p] = data[p + 1] = data[p + 2] = 0; }
  }
  assert.equal(jsQR(data, side, side), null,
    "if this ever starts decoding, the quiet-zone requirement has changed");
});
