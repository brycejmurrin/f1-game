// Garage turntable frame quality gate — rejects uniform team-tint "wall" frames.
// @doc Used by garage-frame.mjs and garage-shot.mjs after canvas readback.

/** Sample the visible car gap (left of the docked #cs-inner panel). Returns [{rgb, ny}]. */
export function sampleGarageGapPixels(imageData, canvasW, canvasH, panelFrac = 0) {
  const x0 = Math.floor(canvasW * 0.04);
  const x1 = Math.floor(canvasW * Math.max(0.58 - panelFrac * 0.5, 0.35));
  const y0 = Math.floor(canvasH * 0.18);
  const y1 = Math.floor(canvasH * 0.82);
  const stepX = Math.max(6, Math.floor((x1 - x0) / 14));
  const stepY = Math.max(6, Math.floor((y1 - y0) / 10));
  const pixels = [];
  const w = imageData.width;
  const d = imageData.data;
  for (let y = y0; y < y1; y += stepY) {
    const ny = (y - y0) / Math.max(y1 - y0, 1);
    for (let x = x0; x < x1; x += stepX) {
      const i = (y * w + x) * 4;
      pixels.push({ rgb: [d[i], d[i + 1], d[i + 2]], ny });
    }
  }
  return pixels;
}

function lum([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Fail closed on flat wall OR exterior paddock bleed-through. */
export function assertGarageInterior(samples, { minSpread = 28, minDarkFrac = 0.06, minFloorDark = 0.12 } = {}) {
  const pixels = (samples || []).map((s) => (Array.isArray(s) ? { rgb: s, ny: 0.5 } : s));
  if (pixels.length < 8) {
    return { ok: false, reason: "too_few_samples", n: pixels?.length || 0 };
  }
  let lMin = 255, lMax = 0, dark = 0, floorDark = 0, floorN = 0;
  let topL = 0, topN = 0, botL = 0, botN = 0;
  const rs = [], gs = [], bs = [];
  for (const { rgb, ny } of pixels) {
    const L = lum(rgb);
    if (L < lMin) lMin = L;
    if (L > lMax) lMax = L;
    if (L < 42) dark++;
    if (ny >= 0.72) { floorN++; botL += L; if (L < 55) floorDark++; }
    if (ny <= 0.22) { topN++; topL += L; }
    rs.push(rgb[0]); gs.push(rgb[1]); bs.push(rgb[2]);
  }
  const spread = lMax - lMin;
  const darkFrac = dark / pixels.length;
  const floorDarkFrac = floorN ? floorDark / floorN : 0;
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = (arr, m) => Math.sqrt(arr.reduce((a, v) => a + (v - m) ** 2, 0) / arr.length);
  const mr = mean(rs), mg = mean(gs), mb = mean(bs);
  const rgbSpread = Math.max(std(rs, mr), std(gs, mg), std(bs, mb));
  const topMean = topN ? topL / topN : 0;
  const botMean = floorN ? botL / floorN : 0;

  // Uniform teal/grey bay wall — tight colour, almost no floor/car darks.
  if (spread < minSpread && rgbSpread < 14 && darkFrac < minDarkFrac) {
    return {
      ok: false, reason: "flat_wall", spread, rgbSpread, darkFrac,
      meanRgb: [Math.round(mr), Math.round(mg), Math.round(mb)],
    };
  }
  // Exterior paddock / sky leak: bright sunset band up top, no garage floor shadow below.
  if (topN >= 4 && floorN >= 4 && topMean > 90 && botMean > 45
      && topMean > botMean * 1.35 && mr > mg && mr > mb && mr > 80
      && floorDarkFrac < minFloorDark) {
    return {
      ok: false, reason: "exterior_paddock", spread, topMean, botMean, floorDarkFrac,
      meanRgb: [Math.round(mr), Math.round(mg), Math.round(mb)],
    };
  }
  if (spread < minSpread * 0.65 && darkFrac < minDarkFrac * 0.5) {
    return { ok: false, reason: "low_contrast", spread, darkFrac };
  }
  if (floorN >= 4 && floorDarkFrac < minFloorDark * 0.5 && spread > 80 && mr > 70) {
    return { ok: false, reason: "no_garage_floor", floorDarkFrac, spread };
  }
  return {
    ok: true, spread, rgbSpread, darkFrac, floorDarkFrac,
    meanRgb: [Math.round(mr), Math.round(mg), Math.round(mb)],
  };
}
