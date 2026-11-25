/* surface-detail-6509.test.mjs — #6509 items 1 + 2 (closeLayers, wearMask): the tier gate (desktop
 * EXTREME only; phones and ULTRA and below unchanged), the Monza def flag that opts a circuit in, the wear strip
 * TLXSurface.wearMask (js/render/three/tsl-surface.js, lazy) packs from the racing line, and tracks.js handing the
 * built track to a backend that asks.
 * The lit-program build (off / bundle absent = today's program, on = a new branch) is in tlx-mat-detail.test.mjs.
 *
 * Run: node --test tests/unit/surface-detail-6509.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { seedLogGlobal } from "../helpers/seed-log.mjs";
import { seedStoreGlobal } from "../helpers/seed-store.mjs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
seedStoreGlobal();
const QSRC = fs.readFileSync(path.join(ROOT, "js/perf/quality-preset.js"), "utf8");
const require = createRequire(import.meta.url);
const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));

function boot(preset, overrides = {}) {
  GameStore.store.set("gfxPreset", preset);
  GameStore.store.set("gfxFeatureOverrides", overrides);
  GameStore.store.set("gfxPhoneFeatureOverrides", overrides);
  for (const k of ["apex26.gfxDetail", "apex26.gfxx.closeLayers", "apex26.gfxx.wearMask"]) GameStore.store.rawSet(k, "");
  return eval(QSRC + ";GfxQuality");
}
const NAMES = ["closeLayers", "wearMask"];

test("desktop: on at EXTREME, off at ULTRA and below", () => {
  for (const [preset, on] of [["low", false], ["medium", false], ["high", false], ["ultra", false], ["extreme", true]]) {
    const Q = boot(preset);
    for (const n of NAMES) {
      assert.equal(Q.feature(n), on, `${n} at ${preset}`);
      assert.equal(Q.presetRule(n), "extreme", n);
    }
  }
  // The Graphics details row turns one off at EXTREME (and nothing else); an EXTREME override loads the bundle.
  const Q = boot("extreme", { closeLayers: false });
  assert.equal(Q.feature("closeLayers"), false);
  assert.equal(Q.feature("wearMask"), true);
  assert.equal(boot("high", { wearMask: true }).needsBundle(), true, "a desktop override fetches LAZY_GFX_HI");
});

test("phones: off at every preset, and a phone override cannot turn it on", () => {
  globalThis.GLX = { isMobile: true };
  try {
    for (const preset of ["low", "medium", "high", "ultra", "extreme"]) {
      const Q = boot(preset, { closeLayers: true, wearMask: true });
      for (const n of NAMES) {
        assert.equal(Q.feature(n), false, `${n} on a phone at ${preset}`);
        assert.equal(Q.supportsOption(n), false, n);
      }
    }
  } finally { delete globalThis.GLX; }
});

const T = buildContext(null, { quiet: true });
const SRC = "js/render/three/tsl-surface.js";
const S = vm.runInNewContext(fs.readFileSync(path.join(ROOT, SRC), "utf8") + ";TLXSurface", {}, { filename: absSrc(SRC) });
const MANIFEST = require(path.join(ROOT, "tools/manifest.cjs"));

test("tsl-surface.js is in the lazy EXTREME bundle, not on the boot wall", () => {
  assert.ok(MANIFEST.LAZY_GFX_HI.includes(SRC));   // boot-load-budget.test.mjs keeps every lazy group off the wall
});

test("Monza is the pilot: its built def carries surfaceDetail, others do not", () => {
  assert.equal(T.LIST.find((d) => d.id === "monza").surfaceDetail, true);
  for (const id of ["spa", "silverstone", "monaco"]) assert.equal(T.LIST.find((d) => d.id === id).surfaceDetail, undefined, id);
});

test("wearMask packs the racing line, rubber, braking and half-width along s", () => {
  const G = T._vmContext.GLX, seen = [];
  G.setTrackWear = (make) => { seen.push(make); return false; };
  let track;
  try { track = T.build(T.LIST.find((d) => d.id === "monza")); } finally { delete G.setTrackWear; }
  assert.equal(seen.length, 1);
  assert.equal(seen[0], track, "Monza hands its built track; the strip is built only by a lit program that wants it");
  const m = S.wearMask(track);
  assert.equal(m.width, 2048);
  assert.equal(m.data.length, 2048 * 4);
  assert.equal(m.length, track.total);
  const L = T._vmContext.TrackLine;   // the racing line the strip must carry
  let brakeTexels = 0, cornerTexels = 0;
  for (let j = 0; j < m.width; j++) {
    const s = (j + 0.5) / m.width * track.total;
    const line = m.data[j * 4] / 255 * 32 - 16, rub = m.data[j * 4 + 1] / 255, brk = m.data[j * 4 + 2] / 255;
    assert.ok(Math.abs(line - L.at(track, s).x) < 0.25, `line at texel ${j}: ${line} vs ${L.at(track, s).x}`);
    assert.ok(rub >= 0.54 && rub <= 1.0, `rubber ${rub}`);
    if (brk > 0.2) brakeTexels++;
    if (rub > 0.9) cornerTexels++;
    const i = Math.floor(s / track.total * track.n);
    assert.ok(Math.abs(m.data[j * 4 + 3] / 255 * 20 - track.hw[i]) < 0.5, `half-width at texel ${j}`);
  }
  assert.ok(brakeTexels > 40, `Monza has braking zones (${brakeTexels} texels)`);
  assert.ok(cornerTexels > 40, `Monza has corner windows (${cornerTexels} texels)`);
  // No line, no strip.
  assert.equal(S.wearMask({ n: 10, total: 100, line: null }), null);
});

test("a circuit without the flag hands null (the lit program turns the branch off)", () => {
  const G = T._vmContext.GLX, seen = [];
  G.setTrackWear = (make) => { seen.push(make); return false; };
  try { T.build(T.LIST.find((d) => d.id === "spa")); } finally { delete G.setTrackWear; }
  assert.deepEqual(seen, [null]);
});
