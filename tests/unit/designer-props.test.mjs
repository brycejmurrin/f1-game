// TrackDesignerProps — capped place/remove scenery props for custom tracks
// (slice H). Sanitize, caps, place/remove, and codec/CustomTracks round-trip.
//
// Run: node --test tests/unit/designer-props.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { bootEditor, design, plain, ellipse } from "../helpers/editor-vm.mjs";

test("KINDS / CAPS / sanitize: known kinds only, per-kind and total caps", () => {
  const { P } = bootEditor();
  assert.equal(P.KINDS.join(","), "stand,gantry,trees,water,flood,billboard");
  assert.equal(P.TOTAL, 16);
  assert.equal(P.sanitize(null), null);
  assert.equal(P.sanitize([]), null);
  assert.equal(P.sanitize([{ kind: "nope", s: 0.2 }]), null);
  const one = P.sanitize([{ kind: "stand", s: 0.25, side: -1, gap: 20 }]);
  assert.deepEqual(plain(one), [{ kind: "stand", s: one[0].s, side: -1, gap: 20 }]);
  assert.ok(Math.abs(one[0].s - 0.25) < 1e-4);
  // Cap stand at 4: extras dropped.
  const many = [];
  for (let i = 0; i < 10; i++) many.push({ kind: "stand", s: i / 20, side: 1, gap: 18 });
  assert.equal(P.sanitize(many).length, P.CAPS.stand);
  // Total cap: mix that would exceed TOTAL.
  const mix = [];
  for (const k of P.KINDS) for (let i = 0; i < P.CAPS[k]; i++) mix.push({ kind: k, s: (mix.length + 1) / 40, side: 1 });
  assert.ok(mix.length > P.TOTAL);
  assert.equal(P.sanitize(mix).length, P.TOTAL);
});

test("place / removeLast / canPlace respect caps and UNDO-shaped lists", () => {
  const { P } = bootEditor();
  let list = null;
  assert.equal(P.canPlace(list, "stand"), true);
  list = P.place(list, "stand", { s: 0.1, side: 1 });
  assert.equal(list.length, 1);
  list = P.place(list, "billboard", { s: 0.4, side: -1, gap: 12 });
  assert.equal(list.length, 2);
  assert.equal(P.place(list, "nope", { s: 0.5 }), null);
  // Fill stands to the cap.
  while (P.canPlace(list, "stand")) list = P.place(list, "stand", { s: Math.random() });
  assert.equal(P.counts(list).stand, P.CAPS.stand);
  assert.equal(P.place(list, "stand", { s: 0.9 }), null);
  const before = list.length;
  list = P.removeLast(list, "stand");
  assert.equal(list.length, before - 1);
  assert.equal(P.counts(list).stand, P.CAPS.stand - 1);
  list = P.removeLast(list, null);
  assert.equal(list.length, before - 2);
});

test("pointFrac walks the control polygon arc", () => {
  const { P } = bootEditor();
  const pts = ellipse(40, 800, 500);
  assert.equal(P.pointFrac(pts, 0), 0);
  const mid = P.pointFrac(pts, 20);
  assert.ok(mid > 0.4 && mid < 0.6, "halfway around ≈ 0.5: " + mid);
});

test("CustomTracks: props round-trip in sanitize / id / toRaw scenery", () => {
  const { C, P, T } = bootEditor();
  const base = design();
  const withProps = C.sanitize({
    ...base,
    props: [{ kind: "gantry", s: 0.05, side: 1, gap: 0 }, { kind: "trees", s: 0.5, side: -1, gap: 30 }],
  });
  const without = C.sanitize(base);
  assert.ok(withProps.props && withProps.props.length === 2);
  assert.equal("props" in without, false);
  assert.notEqual(withProps.id, without.id, "props move the content id");
  assert.equal(C.sanitize(withProps).id, withProps.id, "idempotent");
  const raw = C.toRaw(withProps);
  assert.equal(typeof raw.scenery, "function");
  // The closure closes over the design's props (dress at build time).
  assert.ok(typeof T.sceneryFor === "function");
  assert.equal(P.sanitize(withProps.props).length, 2);
});

test("codec: empty props stay APXT1; placed props ride APXT2 and round-trip", async () => {
  const { CD, C, P } = bootEditor();
  const flat = design({ name: "NO PROPS" });
  const code1 = await CD.encode(flat);
  assert.match(code1, /^APXT1\.[pz]\./);
  const back1 = await CD.decode(code1);
  assert.equal(back1.ok, true, back1.reason);
  assert.equal(back1.design.props, undefined);

  const withP = C.sanitize({
    ...design({ name: "WITH PROPS" }),
    props: [
      { kind: "stand", s: 0.12, side: 1, gap: 18 },
      { kind: "flood", s: 0.6, side: -1, gap: 28 },
      { kind: "billboard", s: 0.8, side: 1, gap: 9 },
    ],
  });
  const code2 = await CD.encode(withP);
  assert.match(code2, /^APXT2\.[pz]\./, "props bump the outer magic to APXT2");
  const back2 = await CD.decode(code2);
  assert.equal(back2.ok, true, back2.reason);
  assert.equal(back2.id, withP.id);
  assert.equal(back2.design.props.length, 3);
  assert.equal(back2.design.props.map((p) => p.kind).join(","), "stand,flood,billboard");
  // A v1 decoder path refuses APXT2 as version (outer digit).
  const spoof = "APXT1" + code2.slice(5);
  const refused = await CD.decode(spoof);
  assert.equal(refused.ok, false);
  assert.ok(refused.reason === "version" || refused.reason === "corrupt", refused.reason);
  // Caps still apply after decode.
  assert.ok(P.counts(back2.design.props).total <= P.TOTAL);
});

function floodDress(P, side) {
  const calls = [];
  const api = {
    K: (f) => Math.round(f * 100),
    floodMast: (k, s, gap, opts) => { calls.push({ k, side: s, gap, opts }); },
  };
  const n = P.dress(api, { n: 1000 }, [{ kind: "flood", s: 0.25, side, gap: 20 }]);
  assert.equal(n, 1);
  return calls;
}

test("flood prop dress: one floodMast on the authored side (+1)", () => {
  const { P } = bootEditor();
  const calls = floodDress(P, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].side, 1);
  assert.equal(calls[0].gap, 20);
  assert.equal(calls[0].opts.h, 24);
  assert.equal(calls[0].opts.cool, true);
  assert.equal(calls[0].opts.pool, true);
});

test("flood prop dress: one floodMast on the authored side (-1)", () => {
  const { P } = bootEditor();
  const calls = floodDress(P, -1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].side, -1);
});

test("flood prop dress: default side +1 when omitted (codec stores 0/1 only)", () => {
  const { P } = bootEditor();
  const calls = [];
  const api = {
    K: () => 0,
    floodMast: (k, s, gap) => { calls.push({ side: s, gap }); },
  };
  P.dress(api, { n: 1 }, [{ kind: "flood", s: 0.5, gap: 28 }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].side, 1);
  assert.equal(calls[0].gap, 28);
});
