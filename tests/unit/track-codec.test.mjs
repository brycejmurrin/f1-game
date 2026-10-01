// track-codec — js/editor/codec.js: the APXT1 share code round-trips a design
// on the 0.25 m lattice with the same content id at both ends, compresses only
// when that is shorter, and refuses corrupt, truncated, oversized or
// out-of-range codes with a reason instead of an exception. Plus the URL
// fragment and file-envelope helpers.
//
// Run: node --test tests/unit/track-codec.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { bootEditor, ellipse, design, plain } from "../helpers/editor-vm.mjs";

test("encode → decode is the identity on the lattice, and the id survives", async () => {
  const { CD, C } = bootEditor();
  const d = design({ name: "Côte d'Azur GP ✓", theme: "harbour", baseHW: 6.5, seed: 123456789,
    hwZones: [{ s0: 0.2, s1: 0.3, hw: 5.5, ease: 0.02 }], bankZones: [{ frac: 0.4, angleDeg: 6, widthM: 120 }],
    elevations: [{ s: 0.6, halfM: 150, rise: 5 }], bridges: [{ s: 0.8, halfM: 160, rise: 8 }] });
  const it = C.sanitize(d);
  const code = await CD.encode(d);
  assert.match(code, /^APXT1\.[pz]\.[A-Za-z0-9_-]+$/);
  assert.ok(code.length < 1200, `code is ${code.length} chars`);
  const back = await CD.decode(code);
  assert.equal(back.ok, true, back.reason);
  assert.equal(back.id, it.id, "same content id on both ends");
  assert.deepEqual(plain(back.design.pts), plain(it.pts));
  assert.equal(back.design.theme, "harbour"); assert.equal(back.design.baseHW, 6.5); assert.equal(back.design.seed, 123456789);
  assert.equal(back.design.name, "CTE D'AZUR GP", "the name is re-sanitised (printable ASCII, upper-case)");
  // Fractions ride as u16: within 1/65535.
  assert.ok(Math.abs(back.design.hwZones[0].s0 - 0.2) < 1e-4 && back.design.hwZones[0].hw === 5.5);
  assert.ok(Math.abs(back.design.bankZones[0].frac - 0.4) < 1e-4 && back.design.bankZones[0].angleDeg === 6 && back.design.bankZones[0].widthM === 120);
  assert.deepEqual(plain(back.design.elevations), [{ s: back.design.elevations[0].s, halfM: 150, rise: 5 }]);
  assert.equal(back.design.bridges[0].rise, 8);
});

test("second-order deltas keep a 150-point loop under ~700 chars; deflate is used only when shorter", async () => {
  const { CD, TR } = bootEditor();
  const g = TR.generate(11);
  const bytes = CD.encodeBytes({ ...design({ pts: g.pts, seed: 11 }), id: "x", name: "RANDOM", turns: [], lengthM: 0 }, true);
  assert.ok(bytes.length < 600, `${g.pts.length} points in ${bytes.length} bytes`);
  const code = await CD.encode(design({ pts: g.pts, seed: 11 }));
  const plainCode = CD.MAGIC + ".p." + CD.b64url(CD.encodeBytes(bootEditor().C.sanitize(design({ pts: g.pts, seed: 11 })), true));
  if (code.startsWith("APXT1.z.")) assert.ok(code.length < plainCode.length, "z. only when it wins");
  else assert.equal(code, plainCode);
  assert.ok(code.length < 760, `code ${code.length} chars`);
  const back = await CD.decode(code);
  assert.equal(back.ok, true, back.reason);
  assert.deepEqual(plain(back.design.pts), plain(g.pts));
});

test("every bad code is refused with a reason, never an exception", async () => {
  const { CD, C } = bootEditor();
  const good = await CD.encode(design());
  const body = good.split(".")[2];
  const cases = [
    ["", "magic"], ["APXG1.p.abc", "magic"], ["APXT2.p." + body, "version"], ["APXT1.q." + body, "magic"],
    ["APXT1.p." + body.slice(0, -6), "check"],                                  // truncated: the check fails
    ["APXT1.p." + body.slice(0, 10) + (body[10] === "A" ? "B" : "A") + body.slice(11), "check"],   // one flipped character
    ["APXT1.p." + body + "!!", "magic"],                                       // not base64url
    ["APXT1.p." + "A".repeat(5000), "bounds"],
    ["APXT1.z." + body, "corrupt"],                                            // plain bytes are not a deflate stream
  ];
  for (const [code, reason] of cases) {
    const r = await CD.decode(code);
    assert.equal(r.ok, false, code.slice(0, 20));
    assert.equal(r.reason, reason, code.slice(0, 24));
  }
  // Bounds inside a well-formed record: N too small / too large, coordinates off the map, width out of range.
  const raw = (patch) => { const it = C.sanitize(design()); Object.assign(it, patch); return CD.decodeBytes(CD.encodeBytes(it, false)); };
  assert.equal(raw({ pts: ellipse(7) }).reason, "bounds");
  assert.equal(raw({ pts: ellipse(201, 900, 500) }).reason, "bounds");
  assert.equal(raw({ pts: ellipse(36, 20000, 500) }).reason, "bounds");
  assert.equal(raw({ baseHW: 9 }).reason, "bounds");
  assert.equal(raw({ theme: "parkland" }).ok, true);
  // A theme index this build does not have.
  const ok = C.sanitize(design()); const bytes = CD.encodeBytes(ok, false); bytes[2] = 99;
  const fixed = new Uint8Array(bytes); const c = CD.fnv16(fixed, fixed.length - 2); fixed[fixed.length - 2] = c & 0xff; fixed[fixed.length - 1] = c >> 8;
  assert.equal(CD.decodeBytes(fixed).reason, "theme");
  assert.equal(CD.decodeBytes(new Uint8Array(3)).reason, "bounds");
  assert.equal(CD.decodeBytes(null).reason, "bounds");
});

test("URL fragment and file envelope helpers", () => {
  const { CD } = bootEditor();
  assert.equal(CD.shareUrl("APXT1.p.AAA", "https://x.test/f1/"), "https://x.test/f1/#track=APXT1.p.AAA");
  assert.equal(CD.fromHash("#track=APXT1.p.AAA"), "APXT1.p.AAA");
  assert.equal(CD.fromHash("#ghost=zzz&track=APXT1.p.BBB"), "APXT1.p.BBB");
  assert.equal(CD.fromHash("#ghost=zzz"), null);
  assert.equal(CD.withoutTrack("#track=APXT1.p.AAA"), "");
  assert.equal(CD.withoutTrack("#ghost=zzz&track=APXT1.p.AAA"), "#ghost=zzz");
  const env = CD.fileEnvelope({ pts: [] }, "APXT1.p.AAA");
  assert.equal(env.format, "apex26.track"); assert.equal(env.v, 1); assert.equal(env.code, "APXT1.p.AAA");
  assert.deepEqual(plain(CD.fromFile(env)), { code: "APXT1.p.AAA" });
  assert.deepEqual(plain(CD.fromFile({ format: "apex26.track", design: { pts: [] } })), { design: { pts: [] } });
  assert.equal(CD.fromFile({ format: "apex26-career-backup-v1" }), null);
  assert.equal(CD.fromFile(null), null);
});
