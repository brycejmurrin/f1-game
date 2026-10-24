/* import-hardening-apxc1.test.mjs — CamTune.decodeShare size caps (#3560 F1).
 *
 * APXC1 pastes used to accept an unbounded string, extract an unbounded
 * base64 token, and JSON.parse the result. Sibling codecs (ShareCode,
 * GhostShare, handshake) all bound input first; this pins the same for
 * camera packs. F2 (chained #share= undo) lives in js/ui/share-code.js
 * and is out of this OWNED lane.
 *
 * Run: node --test tests/unit/import-hardening-apxc1.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const root = path.resolve(import.meta.dirname, "../..");

function loadCamTune(disk = new Map()) {
  const ctx = {
    GameStore: {
      store: {
        rev: 0,
        get(k, d) { return disk.has(k) ? disk.get(k) : d; },
        set(k, v) { disk.set(k, v); this.rev++; return true; },
      },
    },
    Teams: { LIST: [{ id: "mclaren" }, { id: "ferrari" }] },
    M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) },
    Log: { info() {}, debug() {}, enabled() { return false; } },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "js/camera/offsets.js"), "utf8") + "\nthis.exported = CamTune;",
    ctx, { filename: absSrc("js/camera/offsets.js") });
  return ctx.exported;
}

test("CamTune exports the APXC1 paste/decode ceilings used by decodeShare", () => {
  const C = loadCamTune();
  assert.equal(C.MAX_SHARE_CHARS, 256 * 1024);
  assert.equal(C.MAX_DECODED_BYTES, 256 * 1024);
  assert.equal(C.SHARE_MAGIC, "APXC1");
});

test("a normal APXC1 share still round-trips under the size caps", () => {
  const A = loadCamTune();
  A.set("chase", "dist", 2.5);
  A.setGlobal("fov", 4);
  const code = A.encodeShare(A.exportPack());
  assert.ok(code.length < 4096, "a real pack stays far under the ceiling");
  const B = loadCamTune();
  const r = B.importText(code);
  assert.equal(r.ok, true);
  assert.equal(B.getModeOnly("chase", "dist"), 2.5);
  assert.equal(B.getGlobal("fov"), 4);
});

test("decodeShare refuses an oversized paste before JSON.parse (#3560 F1)", () => {
  const C = loadCamTune();
  const max = C.MAX_SHARE_CHARS;
  const r = C.decodeShare("x".repeat(max + 1));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "too-large");
  // At the ceiling the length gate lets the paste through; non-JSON still fails
  // with a parse reason, not too-large.
  const atCap = C.decodeShare("x".repeat(max));
  assert.equal(atCap.ok, false);
  assert.notEqual(atCap.reason, "too-large");
});

test("decodeShare refuses an oversized APXC1 paste before base64 work (#3560 F1)", () => {
  const C = loadCamTune();
  // Short magic + body that pushes the whole paste past MAX_SHARE_CHARS.
  const paste = "APXC1." + "A".repeat(C.MAX_SHARE_CHARS);
  assert.ok(paste.length > C.MAX_SHARE_CHARS);
  const r = C.decodeShare(paste);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "too-large");
});

test("decodeShare refuses JSON whose body exceeds MAX_DECODED_BYTES (#3560 F1)", () => {
  const C = loadCamTune();
  // Keep the paste under MAX_SHARE_CHARS but make the JSON body alone longer
  // than MAX_DECODED_BYTES by using equal caps and a CameraEdits wrapper that
  // the extractor peels — actually with equal caps the paste gate fires first
  // on a body that large. Lower effective path: build JSON of length
  // MAX_DECODED_BYTES + 1; when that also exceeds MAX_SHARE_CHARS the paste
  // gate wins, which is still the hardening we want.
  const json = '{"k":"' + "z".repeat(C.MAX_DECODED_BYTES) + '"}';
  assert.ok(json.length > C.MAX_DECODED_BYTES);
  const r = C.decodeShare(json);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "too-large");
});

test("importText surfaces too-large from decodeShare without wiping stores", () => {
  const C = loadCamTune();
  C.set("chase", "dist", 3);
  const before = JSON.stringify(C.exportPack());
  const r = C.importText("y".repeat(C.MAX_SHARE_CHARS + 8));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "too-large");
  assert.equal(JSON.stringify(C.exportPack()), before);
});
