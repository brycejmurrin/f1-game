import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../js/garage/scene.js", import.meta.url), "utf8");

test("garage scene livery fallbacks are hoisted frozen consts, not per-call literals", () => {
  // rgb(c, [..]) returns its fallback by identity: an inline literal allocates per call.
  const inline = src.split("\n").filter((l) => /rgb\([^)]*,\s*\[\s*0?\.\d/.test(l));
  assert.deepEqual(inline, [], "inline rgb() fallback literal:\n" + inline.join("\n"));
  for (const k of ["FB_C1", "FB_C1_ROOM", "FB_ACC", "FB_ACC_ALT"]) {
    assert.match(src, new RegExp(`${k} = Object\\.freeze\\(\\[`), `${k} must be frozen`);
  }
});

test("rgb() returns the hoisted fallback by identity (no allocation)", () => {
  const rgb = (c, d) => (c && c.length === 3 ? c : d);
  const fb = Object.freeze([0.1, 0.2, 0.3]);
  assert.equal(rgb(null, fb), fb);
  assert.equal(rgb(undefined, fb), fb);
});
