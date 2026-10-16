// @doc lighting-campaign: per-region pixel metrics and the gate evaluation against `config.mjs` GATES.
// @skill lighting-tuner
import { GATES } from "./config.mjs";

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const percentile = (values, p) => values[Math.floor((values.length - 1) * p)];

function measureRegion(data, width, height, [rx, ry, rw, rh]) {
  const x0 = Math.min(width - 1, Math.max(0, Math.floor(rx * width)));
  const x1 = Math.min(width, Math.max(x0 + 1, Math.ceil((rx + rw) * width)));
  const y0 = Math.min(height - 1, Math.max(0, Math.floor(ry * height)));
  const y1 = Math.min(height, Math.max(y0 + 1, Math.ceil((ry + rh) * height)));
  const values = [];
  let sum = 0;
  let black = 0;
  let white = 0;
  let edge = 0;
  let edgeComparisons = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const value = luma(data[i], data[i + 1], data[i + 2]);
      values.push(value);
      sum += value;
      if (data[i] <= 1 && data[i + 1] <= 1 && data[i + 2] <= 1) black++;
      if (data[i] >= 254 && data[i + 1] >= 254 && data[i + 2] >= 254) white++;
      if (x > x0) {
        const j = i - 4;
        edge += Math.abs(value - luma(data[j], data[j + 1], data[j + 2]));
        edgeComparisons++;
      }
    }
  }

  values.sort((a, b) => a - b);
  return {
    count: values.length,
    mean: sum / values.length,
    p05: percentile(values, 0.05),
    p50: percentile(values, 0.50),
    p95: percentile(values, 0.95),
    blackClipFraction: black / values.length,
    whiteClipFraction: white / values.length,
    edgeEnergy: edgeComparisons ? edge / edgeComparisons : 0,
  };
}

export function measurePixels(data, width, height, regions) {
  return Object.fromEntries(
    Object.entries(regions).map(([id, rect]) => [
      id,
      measureRegion(data, width, height, rect),
    ]),
  );
}

export function evaluateGates({ metrics, lightState, webglError, pageErrors, tod }) {
  const failures = [];
  const frame = metrics.frame;
  if (frame.blackClipFraction >= GATES.maxBlackClip) failures.push("black-clip");
  if (frame.whiteClipFraction >= GATES.maxWhiteClip) failures.push("white-clip");
  if (frame.p95 - frame.p05 < GATES.minTonalRange) failures.push("tonal-range");
  if (webglError !== 0) failures.push("webgl-error");
  if (pageErrors.length) failures.push("page-error");
  if (tod === "night" && lightState.numLights <= 0) failures.push("night-lights");
  return { ok: failures.length === 0, failures };
}
