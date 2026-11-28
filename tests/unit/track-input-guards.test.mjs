// Authored-input guards in the track engine (#7367, hunt ledger #7345 rows 1
// and 6). Both paths are latent: no shipped circuit authors a bad value, but a
// hand-written or custom def could, and each one poisoned a build silently.
//   - TrackPit.resolve: a NaN band made every pit offset NaN (and the wall bar
//     NaN through openBoundary); a zero or negative limitKph froze or reversed
//     the limiter.
//   - TrackSceneryData.resolveCityStyle: `kinds: []` replaced the theme's list
//     (build-props takes `% kinds.length` = NaN), and prototype names such as
//     "constructor" passed the colour-table lookup.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createContext, runInContext } from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
function load(rel, name) {
  const ctx = createContext({ console });
  runInContext(readFileSync(path.join(ROOT, rel), "utf8") + `\n;globalThis.__out = ${name};`, ctx, { filename: rel });
  return ctx.__out;
}
const P = load("js/track/core/pit.js", "TrackPit");
const D = load("js/track/scenery/data.js", "TrackSceneryData");
const finite = (o) => Object.values(o).every(Number.isFinite);

test("pit resolve: a NaN or negative band keeps the preset's width", () => {
  const ref = P.resolve({});
  const nan = P.resolve({ pit: { bands: { fast: NaN } } });
  assert.ok(finite(nan.off), `off must be finite: ${JSON.stringify(nan.off)}`);
  assert.deepEqual({ ...nan.off }, { ...ref.off });
  const neg = P.resolve({ pit: { bands: { work: -3, corridor: "2" } } });
  assert.deepEqual({ ...neg.bands }, { ...ref.bands });
  assert.ok(!("bogus" in P.resolve({ pit: { bands: { bogus: 1 } } }).bands));
});

test("pit resolve: a valid authored band still overrides its key", () => {
  const r = P.resolve({ pit: { bands: { verge: 4 } } });
  assert.equal(r.bands.verge, 4);
  assert.equal(r.off.fastIn, 4 + r.bands.platform);
});

test("pit resolve: limitKph must be positive and is clamped to [20, 300]", () => {
  assert.equal(P.resolve({ pit: { limitKph: 0 } }).limitKph, 80);
  assert.equal(P.resolve({ pit: { limitKph: -5 } }).limitKph, 80);
  assert.equal(P.resolve({ pit: { limitKph: NaN } }).limitKph, 80);
  assert.equal(P.resolve({ pit: { limitKph: "90" } }).limitKph, 80);
  assert.equal(P.resolve({ pit: { mode: "narrow", limitKph: 0 } }).limitKph, 60);
  assert.equal(P.resolve({ pit: { limitKph: 1000 } }).limitKph, 300);
  assert.equal(P.resolve({ pit: { limitKph: 5 } }).limitKph, 20);
  assert.equal(P.resolve({ pit: { mode: "street", limitKph: 60 } }).limitKph, 60);
});

test("resolveCityStyle: an empty or non-array kinds keeps the theme's list", () => {
  const base = D.THEME_DEF.modern;
  assert.deepEqual([...D.resolveCityStyle({ kinds: [] }, "modern").kinds], [...base.kinds]);
  assert.deepEqual([...D.resolveCityStyle({ kinds: "slab" }, "modern").kinds], [...base.kinds]);
  assert.deepEqual([...D.resolveCityStyle({ kinds: ["slab"] }, "modern").kinds], ["slab"]);
  // neonKinds may legitimately be empty (street_day ships []).
  assert.equal(D.resolveCityStyle({ neonKinds: [] }, "modern").neonKinds.length, 0);
  assert.deepEqual([...D.resolveCityStyle({ neonKinds: null }, "modern").neonKinds], [...base.neonKinds]);
});

test("resolveCityStyle: prototype names never reach the palette", () => {
  const s = D.resolveCityStyle({ neon: ["constructor", "cyan", "toString", "__proto__"], dayPal: ["hasOwnProperty"] }, "modern");
  assert.deepEqual(s.neon.map((c) => [...c]), [[...D.NC.cyan]]);
  assert.deepEqual(s.dayPal.map((c) => [...c]), D.THEME_DEF.modern.dayPal.map((c) => [...c]));
});

test("resolveCityStyle: bad heights and bias fall back to the theme", () => {
  const base = D.THEME_DEF.street_day;
  const s = D.resolveCityStyle({ fh: [NaN, 3], bh: [10], bias: "x" }, "street_day");
  assert.deepEqual([...s.fh], [...base.fh]);
  assert.deepEqual([...s.bh], [...base.bh]);
  assert.equal(s.bias, base.bias);
  const ok = D.resolveCityStyle({ fh: [8, 20], bh: [14, 34], bias: 0.16 }, "street_day");
  assert.deepEqual([...ok.fh], [8, 20]);
  assert.equal(ok.bias, 0.16);
});
