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

// ---------------------------------------------------------------------------
// NetScan — the platform decoder first, jsQR as the fallback, stop() absolute
// ---------------------------------------------------------------------------
import { seedLogGlobal } from "../helpers/seed-log.mjs";
seedLogGlobal();
const NetScan = eval(fs.readFileSync(path.join(ROOT, "js/net/scan.js"), "utf8") + ";NetScan");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function scanWorld({ detector, formats } = {}) {
  const tracks = [{ stopped: 0, stop() { this.stopped++; } }];
  const stream = { getTracks: () => tracks };
  // Node 21+ exposes a getter-only globalThis.navigator: define over it.
  const hadNav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true,
    value: { mediaDevices: { getUserMedia: async () => stream } } });
  globalThis.window = detector ? {
    BarcodeDetector: class {
      static async getSupportedFormats() { return formats || ["qr_code"]; }
      detect(v) { return detector(v); }
    },
  } : {};
  globalThis.document = {
    head: { appendChild() {} },
    createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4 * 4 * 4) }) }) }),
  };
  const video = { videoWidth: 4, videoHeight: 4, setAttribute() {}, play: async () => {}, srcObject: null, muted: false };
  const cleanup = () => {
    delete globalThis.navigator;
    if (hadNav) Object.defineProperty(globalThis, "navigator", hadNav);
    delete globalThis.window; delete globalThis.document;
  };
  return { tracks, video, cleanup };
}

test("NetScan uses BarcodeDetector when the platform reads qr_code, and stops the camera on a hit", async () => {
  let calls = 0;
  const w = scanWorld({ detector: async () => (++calls < 2 ? [] : [{ rawValue: "APEX1.s.SCANNED" }]) });
  try {
    const sc = NetScan.create();
    const got = [];
    assert.equal((await sc.start(w.video, (t) => got.push(t))).ok, true);
    assert.equal(sc.decoder(), "barcode");
    await sleep(450);
    assert.deepEqual(got, ["APEX1.s.SCANNED"]);
    assert.equal(sc.active(), false, "a hit stops the scan");
    assert.equal(w.tracks[0].stopped, 1, "…and the camera track");
    assert.ok(calls >= 2 && calls <= 4, `detect() runs once per tick, never stacked (${calls})`);
  } finally { w.cleanup(); }
});

test("a BarcodeDetector result landing after stop() delivers nothing", async () => {
  let release = null;
  const w = scanWorld({ detector: () => new Promise((r) => { release = r; }) });
  try {
    const sc = NetScan.create();
    const got = [];
    assert.equal((await sc.start(w.video, (t) => got.push(t))).ok, true);
    await sleep(200);
    assert.ok(release, "a detect() is in flight");
    sc.stop();
    release([{ rawValue: "LATE" }]);
    await sleep(50);
    assert.deepEqual(got, [], "the late decode is dropped");
    assert.equal(w.tracks[0].stopped, 1);
  } finally { w.cleanup(); }
});

test("without qr_code support (or without BarcodeDetector) NetScan falls back to jsQR", async () => {
  globalThis.jsQR = () => null;                      // already "loaded": no script inject needed
  const w = scanWorld({ detector: async () => [{ rawValue: "NEVER" }], formats: ["ean_13"] });
  try {
    assert.equal(await NetScan.platformDetector(), null, "qr_code missing from the formats");
    const sc = NetScan.create();
    const got = [];
    assert.equal((await sc.start(w.video, (t) => got.push(t))).ok, true);
    assert.equal(sc.decoder(), "jsqr");
    await sleep(200);
    assert.deepEqual(got, [], "the platform detector was never consulted");
    sc.stop();
    assert.equal(w.tracks[0].stopped, 1);
    globalThis.window = {};
    assert.equal(await NetScan.platformDetector(), null, "no BarcodeDetector at all");
  } finally { w.cleanup(); delete globalThis.jsQR; }
});
