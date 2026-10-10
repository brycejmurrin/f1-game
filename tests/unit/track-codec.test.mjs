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

test("the country rides as a label: round-trips, stays out of the content id, absent when unset", async () => {
  const { CD, C } = bootEditor();
  const base = design({ name: "LAKE LOOP", theme: "lakeside" });
  const withC = C.sanitize({ ...base, country: "Sweden" }), without = C.sanitize(base);
  assert.equal(withC.country, "Sweden");
  assert.equal("country" in without, false, "unset: nothing stored");
  assert.equal(withC.id, without.id, "a label: same content id");
  assert.equal(C.toRaw(withC).country, "Sweden", "the def carries it to the picker's flag");
  const back = await CD.decode(await CD.encode({ ...base, country: "Sweden" }));
  assert.equal(back.ok, true, back.reason);
  assert.equal(back.design.country, "Sweden");
  const bytes = CD.encodeBytes(without, true);
  assert.equal(bytes[1] & CD.FLAG.country, 0, "a code without a country sets no country bit (older builds refuse it)");
  assert.equal(C.sanitizeCountry("  Côte  d'Ivoire<script>  "), "Côte d'Ivoirescript", "letters, digits, space . ' - only");
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
  const { CD, ctx } = bootEditor();
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
  for (const origin of ["https://localhost", "app://apex", "capacitor://localhost"]) {
    ctx.location = { origin, pathname: "/" };
    ctx.Native = { isNative: () => true };
    assert.equal(CD.shareUrl("APXT1.p.AAA"), "https://brycejmurrin.github.io/f1-game/#track=APXT1.p.AAA");
    assert.equal(CD.shareUrl("APXT1.p.AAA", "https://x.test/game/"), "https://x.test/game/#track=APXT1.p.AAA");
  }
  ctx.Native = { isNative: () => false };
  ctx.location = { origin: "https://x.test", pathname: "/game/" };
  assert.equal(CD.shareUrl("APXT1.p.AAA"), "https://x.test/game/#track=APXT1.p.AAA");
});

// ── content-id stability (the TT board and ghosts key on the id) ────────────
const EDGE = 0.9999995;   // a lap fraction that rounds to the lattice's 1.0
/** encode → decode keeps the id the SENDER's store computed. */
async function sameId(CD, C, d, label, resanitize = true) {
  const it = C.sanitize(d);
  assert.ok(it, label + ": sanitises");
  const code = await CD.encode(d);
  assert.ok(code, label + ": encodes");
  const back = await CD.decode(code);
  assert.equal(back.ok, true, label + ": " + back.reason);
  assert.equal(back.id, it.id, label + ": same content id on both ends");
  if (resanitize) assert.equal(C.sanitize(back.design).id, it.id, label + ": …and after the receiver's own sanitize");
  return { it, back };
}

test("fractional hill lengths retain the sender's content id in a share code", async () => {
  const { CD, C } = bootEditor();
  await sameId(CD, C, design({ elevations: [{ s: 0.5, halfM: 22.2, rise: 60 }],
    bridges: [{ s: 0.8, halfM: 22.2, rise: -60 }] }), "fractional hills at both grade caps");
});

test("id equality: an hwZone without `ease`, 24 of every zone list, and fractions ≈ 1", async () => {
  const { CD, C } = bootEditor();
  // (i) No ease: whatever the store keeps (absent, or the 0.025 default) the code carries.
  await sameId(CD, C, design({ hwZones: [{ s0: 0.2, s1: 0.3, hw: 5.5 }] }), "no ease");
  // (ii) The codec caps ARE the storage caps: nothing is dropped on the way.
  assert.deepEqual(Object.values(CD.ZONE_CAPS), [C.LIMITS.zones, C.LIMITS.zones, C.LIMITS.zones, C.LIMITS.zones], "ZONE_CAPS = CustomTracks.LIMITS.zones");
  const n = C.LIMITS.zones, at = (i) => (i + 0.5) / n;
  const full = design({
    hwZones: Array.from({ length: n }, (_, i) => ({ s0: at(i), s1: at(i) + 0.01, hw: 6, ease: 0.02 })),
    bankZones: Array.from({ length: n }, (_, i) => ({ frac: at(i), angleDeg: 5 + (i % 5), widthM: 60 })),
    elevations: Array.from({ length: n }, (_, i) => ({ s: at(i), halfM: 60, rise: 1 })),
    bridges: Array.from({ length: n }, (_, i) => ({ s: at(i), halfM: 80, rise: 2 })),
  });
  const { back } = await sameId(CD, C, full, "24 of each");
  for (const k of ["hwZones", "bankZones", "elevations", "bridges"]) assert.equal(back.design[k].length, n, k + ": all " + n + " survive");
  // Over the cap is a refusal, never a silent truncation.
  const over = C.sanitize(full); over.bridges = over.bridges.concat([{ s: 0.01, halfM: 80, rise: 2 }]);
  assert.throws(() => CD.encodeBytes(over, true), /zones/);
  // (iii) 0.9999995 rounds to the lattice's 1.0 in storage; the code must not turn it into 0.
  // (A re-sanitize of that 1.0 is CustomTracks' own idempotence — the TODO test below.)
  await sameId(CD, C, design({ hwZones: [{ s0: 0.95, s1: EDGE, hw: 6, ease: 0.02 }], bankZones: [{ frac: EDGE, angleDeg: 6, widthM: 80 }],
    elevations: [{ s: EDGE, halfM: 100, rise: 2 }], bridges: [{ s: EDGE, halfM: 120, rise: 3 }] }), "frac ≈ 1", false);
  await sameId(CD, C, design({ elevations: [{ s: 0, halfM: 100, rise: 2 }, { s: 1, halfM: 90, rise: 1 }] }), "frac 0 and 1");
});

// CustomTracks.sanitize's frac() (js/editor/custom-tracks.js) rounds 0.9999995
// to 1.0 and KEEPS it, but maps a stored 1.0 to 0 on the next load — so the
// id of such a design changes between upsert() and load(), share code or not.
// The fix is there (wrap 65535 → 0 inside frac); TODO until it lands.
{
  const { C } = bootEditor();
  const once = C.sanitize(design({ elevations: [{ s: EDGE, halfM: 100, rise: 2 }] }));
  const idempotent = C.sanitize(once).id === once.id;
  test("CustomTracks.sanitize is idempotent at a fraction ≈ 1 (the stored id survives a reload)",
    { todo: idempotent ? false : "js/editor/custom-tracks.js frac(): wrap a rounded 1.0 to 0" }, async () => {
      const { CD, C: C2 } = bootEditor();
      const d = design({ hwZones: [{ s0: 0.95, s1: EDGE, hw: 6, ease: 0.02 }], bankZones: [{ frac: EDGE, angleDeg: 6, widthM: 80 }], elevations: [{ s: EDGE, halfM: 100, rise: 2 }] });
      const it = C2.sanitize(d);
      assert.equal(C2.sanitize(it).id, it.id, "sanitize(sanitize(x)) keeps the id");
      await sameId(CD, C2, d, "frac ≈ 1, re-sanitised");
    });
}

test("fromHash: a malformed %-escape is null, not a URIError", () => {
  const { CD } = bootEditor();
  assert.equal(CD.fromHash("#track=%E0%A4%A"), null);
  assert.equal(CD.fromHash("#ghost=1&track=%"), null);
  assert.equal(CD.fromHash("#track=APXT1.p.%41"), "APXT1.p.A");
});

test("inflate: an oversized stream is cut off under MAX_BYTES; no DecompressionStream reads as unsupported", async () => {
  const { CD, ctx } = bootEditor();
  // 64 KiB of zeros deflates to a few dozen bytes — a tiny code that would inflate past MAX_BYTES.
  const cs = new CompressionStream("deflate-raw");
  const wr = cs.writable.getWriter(); wr.write(new Uint8Array(65536)); wr.close();
  const bomb = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  assert.ok(bomb.length < 200, `the bomb is ${bomb.length} bytes`);
  const r = await CD.inflate(bomb);
  assert.deepEqual([r.ok, r.reason], [false, "bounds"]);
  const viaCode = await CD.decode("APXT1.z." + CD.b64url(bomb));
  assert.deepEqual([viaCode.ok, viaCode.reason], [false, "bounds"]);
  // A real z. code still inflates.
  const small = new CompressionStream("deflate-raw"); const w2 = small.writable.getWriter(); w2.write(new Uint8Array([1, 2, 3])); w2.close();
  const ok = await CD.inflate(new Uint8Array(await new Response(small.readable).arrayBuffer()));
  assert.equal(ok.ok, true); assert.deepEqual([...ok.bytes], [1, 2, 3]);
  // A browser without DecompressionStream cannot read a z. code: say so, not "corrupt".
  const keep = ctx.DecompressionStream;
  ctx.DecompressionStream = undefined;
  try {
    const u = await CD.decode("APXT1.z." + CD.b64url(bomb));
    assert.deepEqual([u.ok, u.reason], [false, "unsupported"]);
  } finally { ctx.DecompressionStream = keep; }
});

test("scenery options (FLAG.look): one byte only when off default, round-trips, moves the id; a bad byte or an unknown flag is refused", async () => {
  const { CD, C } = bootEditor();
  const base = design({ theme: "parkland", seed: 99 });
  const plainBytes = CD.encodeBytes(C.sanitize(base), false);
  // All defaults: byte-identical to a design with no look at all (older codes and ids hold).
  const dflt = CD.encodeBytes(C.sanitize(Object.assign({}, base, { look: { time: "auto", trees: "normal", crowd: "normal" } })), false);
  assert.deepEqual([...dflt], [...plainBytes]);
  assert.equal(C.sanitize(Object.assign({}, base, { look: { time: "auto" } })).id, C.sanitize(base).id, "default look → the same id");
  const look = { time: "dusk", trees: "many", crowd: "few" };
  const it = C.sanitize(Object.assign({}, base, { look }));
  assert.notEqual(it.id, C.sanitize(base).id, "a look is a different circuit (rebuild)");
  const bytes = CD.encodeBytes(it, false);
  assert.equal(bytes.length, plainBytes.length + 1, "one byte");
  assert.equal(bytes[1] & CD.FLAG.look, CD.FLAG.look);
  const back = await CD.decode(await CD.encode(Object.assign({}, base, { look })));
  assert.equal(back.ok, true, back.reason);
  assert.deepEqual(plain(back.design.look), look);
  assert.equal(back.id, it.id);
  // Every combination round-trips.
  const L = { time: ["auto", "day", "dusk", "night"], trees: ["normal", "few", "many"], crowd: ["normal", "few", "packed"] };
  for (const time of L.time) for (const trees of L.trees) for (const crowd of L.crowd) {
    const r = CD.decodeBytes(CD.encodeBytes(C.sanitize(Object.assign({}, base, { look: { time, trees, crowd } })), false));
    assert.equal(r.ok, true);
    const want = time === "auto" && trees === "normal" && crowd === "normal" ? undefined : { time, trees, crowd };
    assert.deepEqual(r.design.look ? plain(r.design.look) : undefined, want);
  }
  const reCheck = (b) => { const f = new Uint8Array(b); const c = CD.fnv16(f, f.length - 2); f[f.length - 2] = c & 0xff; f[f.length - 1] = c >> 8; return f; };
  // The look byte is the last before the check: trees index 3 does not exist.
  const bad = new Uint8Array(bytes); bad[bad.length - 3] = 3 << 2;
  assert.equal(CD.decodeBytes(reCheck(bad)).reason, "bounds");
  const high = new Uint8Array(bytes); high[high.length - 3] = 0x40;
  assert.equal(CD.decodeBytes(reCheck(high)).reason, "bounds");
  const flag = new Uint8Array(plainBytes); flag[1] |= 0x40;
  assert.equal(CD.decodeBytes(reCheck(flag)).reason, "corrupt", "an unknown flag bit is still refused");
  // Sanitize drops unknown names to the default.
  assert.equal(C.sanitize(Object.assign({}, base, { look: { time: "noon", trees: 7 } })).look, undefined);
  assert.deepEqual(plain(C.sanitize(Object.assign({}, base, { look: { crowd: "packed", time: "x" } })).look), { time: "auto", trees: "normal", crowd: "packed" });
});

test("surface opts (kerb + berms): trailing byte only when off default; round-trips; moves the id; bad byte refused", async () => {
  const { CD, C } = bootEditor();
  const base = design({ theme: "parkland", seed: 42 });
  const plainBytes = CD.encodeBytes(C.sanitize(base), false);
  // Defaults: flat kerbs + berms on → no trailing byte (older codes hold).
  assert.equal(CD.surfaceByte(C.sanitize(base)), 0);
  assert.equal(C.sanitize(Object.assign({}, base, { kerbStyle: "flat", berms: true })).id, C.sanitize(base).id);
  const sausage = C.sanitize(Object.assign({}, base, { kerbStyle: "sausage" }));
  assert.notEqual(sausage.id, C.sanitize(base).id, "sausage kerbs are a different circuit");
  assert.equal(sausage.kerbStyle, "sausage");
  const bytes = CD.encodeBytes(sausage, false);
  assert.equal(bytes.length, plainBytes.length + 1, "one trailing surface byte");
  const back = await CD.decode(await CD.encode(Object.assign({}, base, { kerbStyle: "sausage" })));
  assert.equal(back.ok, true, back.reason);
  assert.equal(back.design.kerbStyle, "sausage");
  assert.equal(back.id, sausage.id);
  // Rumble + berms off.
  const both = C.sanitize(Object.assign({}, base, { kerbStyle: "rumble", berms: false }));
  assert.equal(both.berms, false);
  const r2 = await CD.decode(await CD.encode(Object.assign({}, base, { kerbStyle: "rumble", berms: false })));
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(r2.design.kerbStyle, "rumble");
  assert.equal(r2.design.berms, false);
  assert.equal(r2.id, both.id);
  // Bad surface nibble refused.
  const reCheck = (b) => { const f = new Uint8Array(b); const c = CD.fnv16(f, f.length - 2); f[f.length - 2] = c & 0xff; f[f.length - 1] = c >> 8; return f; };
  const bad = new Uint8Array(bytes); bad[bad.length - 3] = 3; // kerb index 3 invalid
  assert.equal(CD.decodeBytes(reCheck(bad)).reason, "bounds");
  // toRaw carries kerbStyle and berms when banking exists.
  const banked = C.sanitize(Object.assign({}, base, { kerbStyle: "sausage", bankZones: [{ frac: 0.3, angleDeg: 12, widthM: 100 }] }));
  const raw = C.toRaw(banked);
  assert.equal(raw.kerbStyle, "sausage");
  assert.equal(raw.berms, true);
});

test("a hostile 282-char share code of a ~990 km loop is refused before anything builds it (13-F1)", async () => {
  const { CD } = bootEditor();
  const code = "APXT1.z.Hc7PSgJhFIbxBCHbve8dtPRGahUYOPfRLZwgBBEiiEgCnUGESCL8AyKEnI8gugY3zizKTQYiRKNIn3xn-_BbPAUcnB6W3bCow2I6L_U_SzKgftDfU94pHvpG_wVxTJbQKeM25ZXBTMyMmbSpI2o3RNegvlDXkGe6GfSJ8RLyaKZrpmMmNtNilkMfmPYoTbop9c7MrZkbM9dmGvT_kDplAa0xzSFXzHrUS_p-mJQmdYdgtgjmD8H8Ipg1glmZ-THzjaPopBodn1Uq5xebPQ";
  assert.equal(code.length, 282);
  const r = await CD.decode(code);
  assert.equal(r.ok, false, "the base decoded this to lengthM 993532 and V.check then took 10 s / 227 MB");
  assert.equal(r.reason, "geometry");
});
