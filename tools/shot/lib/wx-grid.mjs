// Pure parts of wx-grid.mjs: weather×time cell layout, luminance / saturation maths,
// ratio helpers for the #3387 lighting baseline. No browser, no fs.
// @doc Weather×time grid maths: TODS×WEATHERS layout, Rec.709 luminance, cell ratios.
// @skill playwright-probe

/** Time-of-day rows (top → bottom on the contact sheet). */
export const TODS = Object.freeze(["dawn", "day", "dusk", "night"]);

/** Weather columns (left → right). Storm sits after rain — look-survey lacked it. */
export const WEATHERS = Object.freeze(["dry", "wet", "rain", "storm", "overcast", "fog"]);

export const CELL_COUNT = TODS.length * WEATHERS.length; // 24

/** Default capture framing (metres / degrees) — matches the Fleet D weather review pin. */
export const DEFAULT_EYE_H = 4.25;
export const DEFAULT_FOV = 60;
export const DEFAULT_SEED = 42;

/**
 * Build the 24 cells in sheet order (row-major: tod outer, weather inner).
 * @returns {{ tod: string, weather: string, row: number, col: number, key: string }[]}
 */
export function cellLayout(tods = TODS, weathers = WEATHERS) {
  const out = [];
  for (let row = 0; row < tods.length; row++) {
    for (let col = 0; col < weathers.length; col++) {
      const tod = tods[row];
      const weather = weathers[col];
      out.push({ tod, weather, row, col, key: `${tod}-${weather}` });
    }
  }
  return out;
}

/** Sheet pixel size for tileW×tileH cells with a label strip under each tile. */
export function sheetSize(cols, rows, tileW, tileH, labelH = 18) {
  if (!(cols >= 1 && rows >= 1 && tileW >= 1 && tileH >= 1 && labelH >= 0)) {
    throw new Error("sheetSize: positive cols/rows/tileW/tileH required");
  }
  return { width: cols * tileW, height: rows * (tileH + labelH), cellH: tileH + labelH, labelH };
}

/** Rec.709 relative luminance of one sRGB byte triple (0..255 → 0..255 scale). */
export function luma709(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** HSV-style saturation in 0..1 from one sRGB byte triple. */
export function saturation01(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max <= 0) return 0;
  return (max - min) / max;
}

/**
 * Whole-frame stats from a packed RGB(A) buffer (Uint8Array / Buffer).
 * @param {Uint8Array|Buffer} data
 * @param {number} width
 * @param {number} height
 * @param {number} [channels=3]
 */
export function luminanceStats(data, width, height, channels = 3) {
  const w = width | 0;
  const h = height | 0;
  const ch = channels | 0;
  if (!(w > 0 && h > 0 && (ch === 3 || ch === 4))) {
    throw new Error("luminanceStats: need positive WxH and 3 or 4 channels");
  }
  const n = w * h;
  if (data.length < n * ch) throw new Error("luminanceStats: buffer shorter than WxH×channels");
  let sumL = 0, sumR = 0, sumG = 0, sumB = 0, sumSat = 0;
  for (let i = 0, p = 0; i < n; i++, p += ch) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    sumL += luma709(r, g, b);
    sumR += r;
    sumG += g;
    sumB += b;
    sumSat += saturation01(r, g, b);
  }
  return {
    meanL: sumL / n,
    meanRGB: [sumR / n, sumG / n, sumB / n],
    saturation: sumSat / n,
    pixels: n,
    width: w,
    height: h,
  };
}

/** Look up a cell's meanL from a cells map keyed `${tod}-${weather}`. */
export function cellMeanL(cells, tod, weather) {
  const c = cells[`${tod}-${weather}`] || cells[`${tod}|${weather}`];
  if (!c || !(typeof c.meanL === "number" && Number.isFinite(c.meanL))) {
    throw new Error(`missing meanL for ${tod}-${weather}`);
  }
  return c.meanL;
}

/**
 * Ratio helpers for the lighting-lane baseline (#3387).
 * storm≈rain by day → stormDay / rainDay ≈ 1; fog night milky → fogNight / dryNight ≫ 1.
 */
export function lightingRatios(cells) {
  const stormDay = cellMeanL(cells, "day", "storm");
  const rainDay = cellMeanL(cells, "day", "rain");
  const fogNight = cellMeanL(cells, "night", "fog");
  const dryNight = cellMeanL(cells, "night", "dry");
  const overcastNight = cellMeanL(cells, "night", "overcast");
  return {
    stormVsRainDay: stormDay / Math.max(rainDay, 1e-6),
    fogNightVsDryNight: fogNight / Math.max(dryNight, 1e-6),
    overcastNightVsDryNight: overcastNight / Math.max(dryNight, 1e-6),
    values: { stormDay, rainDay, fogNight, dryNight, overcastNight },
  };
}

/**
 * Resolve a 1-based turn index against curated `def.turns` fractions.
 * @param {number[]} turns
 * @param {number} turn1Based
 */
export function turnFrac(turns, turn1Based) {
  if (!Array.isArray(turns) || !turns.length) throw new Error("turnFrac: circuit has no def.turns");
  const n = Number(turn1Based);
  if (!Number.isInteger(n) || n < 1 || n > turns.length) {
    throw new Error(`turnFrac: turn must be 1..${turns.length} (got ${turn1Based})`);
  }
  const f = Number(turns[n - 1]);
  if (!Number.isFinite(f) || f < 0 || f > 1) throw new Error(`turnFrac: turns[${n - 1}] out of 0..1`);
  return f;
}

/** Sort combos so day↔dark rebuilds at most once (same idea as look-survey). */
export function sortCombosMinRebuild(cells, preferDark = false) {
  const wxOrder = Object.fromEntries(WEATHERS.map((w, i) => [w, i]));
  const todOrder = Object.fromEntries(TODS.map((t, i) => [t, i]));
  const dark = (tod) => tod !== "day";
  return [...cells].sort((a, b) => {
    const ga = dark(a.tod) === preferDark ? 0 : 1;
    const gb = dark(b.tod) === preferDark ? 0 : 1;
    if (ga !== gb) return ga - gb;
    const ta = todOrder[a.tod] ?? 9;
    const tb = todOrder[b.tod] ?? 9;
    if (ta !== tb) return ta - tb;
    return (wxOrder[a.weather] ?? 9) - (wxOrder[b.weather] ?? 9);
  });
}
