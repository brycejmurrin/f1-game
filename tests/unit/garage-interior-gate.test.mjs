import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertGarageInterior, sampleGarageGapPixels } from "../../tools/capture/garage-interior.mjs";

describe("garage-interior gate", () => {
  it("rejects a flat teal wall (uniform mid luminance)", () => {
    const wall = Array.from({ length: 80 }, () => ({ rgb: [18, 92, 88], ny: 0.5 }));
    const r = assertGarageInterior(wall);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "flat_wall");
  });

  it("rejects exterior paddock sky bleed", () => {
    const mix = [];
    for (let i = 0; i < 20; i++) mix.push({ rgb: [180, 90, 40], ny: 0.1 });
    for (let i = 0; i < 60; i++) mix.push({ rgb: [70, 55, 45], ny: 0.85 });
    const r = assertGarageInterior(mix);
    assert.equal(r.ok, false);
    assert.equal(r.reason, "exterior_paddock");
  });

  it("accepts a varied garage gap (car + floor + lights)", () => {
    const mix = [];
    for (let i = 0; i < 40; i++) mix.push({ rgb: [12, 14, 16], ny: 0.88 });
    for (let i = 0; i < 30; i++) mix.push({ rgb: [180, 20, 24], ny: 0.45 });
    for (let i = 0; i < 20; i++) mix.push({ rgb: [90, 92, 98], ny: 0.12 });
    const r = assertGarageInterior(mix);
    assert.equal(r.ok, true);
  });

  it("samples the left gap region of canvas pixels", () => {
    const w = 400, h = 300;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        data[i] = x < 200 ? 30 : 200;
        data[i + 1] = 40;
        data[i + 2] = 50;
        data[i + 3] = 255;
      }
    }
    const px = sampleGarageGapPixels({ width: w, height: h, data }, w, h, 0.3);
    assert.ok(px.length >= 8);
    assert.ok(px.every((p) => p.rgb[0] === 30));
  });
});
