// @ts-check
// Deterministic comparison against a pinned subset of bacinger/f1-circuits
// (ODbL-1.0). Refreshing the fixture is an explicit maintenance operation via
// tools/track/refresh-f1-circuit-reference.mjs, never part of this test.
import { test, expect } from "../helpers/fixtures.js";
import fs from "node:fs";
import path from "node:path";
import { galleryDir } from "../helpers/output-paths.js";
import {
  compareCircuit,
  MAX_SHAPE_ERROR,
  signedArea,
  validateMappings,
} from "../../tools/track/track-accuracy-validator.mjs";
import { CIRCUIT_MAP, RACE_DIRECTION_OVERRIDES } from "../helpers/track-accuracy-map.mjs";

const OUT = galleryDir("f1-track-accuracy");
const REFERENCE = JSON.parse(fs.readFileSync(
  new URL("../data/f1-circuit-reference.geojson", import.meta.url),
  "utf8",
));
function normalise(pairs) {
  const xs = pairs.map((p) => p[0]), ys = pairs.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.max(maxX - minX, maxY - minY) || 1;
  return pairs.map((p) => ({
    x: +((p[0] - minX) / scale).toFixed(4),
    y: +((maxY - p[1]) / scale).toFixed(4),
  }));
}

test("every game circuit matches its pinned real-circuit reference", async ({ page }) => {
  // MEASURED, IDLE BOX, 2026-09-02: 108.1 s, PASSING. This was 120_000 — the
  // same number as the config default, so it read as a deliberate budget while
  // granting nothing, and left 11% headroom that a shared CI runner eats. It
  // timed out in runs 1898 and 1901 while passing locally, which is the
  // signature of a budget rather than a hang. The cost is the roster: it
  // rebuilds every circuit and compares each against its pinned reference.
  test.setTimeout(300_000);
  await page.goto("/");
  // Title boots LAZY_CIRCUIT meta stubs (picker fields only). Hydrate every
  // full js/circuits/<id>.js before reading path.pts — same gate as race entry.
  await page.waitForFunction((n) => typeof Tracks !== "undefined" && Tracks.LIST.length === n, Object.keys(CIRCUIT_MAP).length, { polling: 100 });
  await page.evaluate(async () => {
    const ensure = window.__apex && window.__apex.ensureCircuit;
    if (!ensure) throw new Error("ensureCircuit not on __apex — circuit meta split needs a hydrate gate");
    for (let i = 0; i < Tracks.LIST.length; i++) {
      if (Tracks.LIST[i] && Tracks.LIST[i].custom) continue;
      await ensure(i);
    }
  });
  const gameCircuits = await page.evaluate(() =>
    Object.fromEntries(Tracks.LIST.map((definition) => [
      definition.id,
      { pts: definition.path.pts, len: definition.path.len, reverse: !!definition.reverse },
    ])));
  const references = new Map(REFERENCE.features.map((feature) => [feature.properties.id, feature]));

  expect(validateMappings(CIRCUIT_MAP, gameCircuits, references)).toEqual([]);
  expect(Object.keys(gameCircuits).sort()).toEqual(Object.keys(CIRCUIT_MAP).sort());
  expect(references.size).toBe(Object.keys(CIRCUIT_MAP).length);

  const results = Object.entries(CIRCUIT_MAP).map(([gameId, referenceId]) => {
    const feature = references.get(referenceId);
    let referenceCoords = feature.geometry.coordinates;
    const expectedDirection = RACE_DIRECTION_OVERRIDES[referenceId];
    const sourceDirection = signedArea(referenceCoords) < 0 ? "CW" : "CCW";
    if (expectedDirection && sourceDirection !== expectedDirection) {
      referenceCoords = [...referenceCoords].reverse();
    }
    // circuits.js stores projected screen-style [x,z], where +z is south;
    // GeoJSON is [east,north], so invert z before direction/shape comparison.
    let gameEastNorth = gameCircuits[gameId].pts.map(([x, z]) => [x, -z]);
    if (gameCircuits[gameId].reverse) gameEastNorth = [...gameEastNorth].reverse();
    const comparison = compareCircuit(referenceCoords, gameEastNorth);
    return {
      gameId,
      referenceId,
      name: feature.properties.Name,
      ...comparison,
      referenceNorm: normalise(referenceCoords),
      gameNorm: normalise(gameEastNorth),
    };
  });

  const failures = results.flatMap((result) => [
    ...(!result.directionMatch ? [`${result.gameId}: direction ${result.gameDirection} vs ${result.referenceDirection}`] : []),
    ...(result.shapeError > MAX_SHAPE_ERROR
      ? [`${result.gameId}: shape ${result.shapeError.toFixed(3)} > ${MAX_SHAPE_ERROR}`]
      : []),
  ]);
  if (failures.length) console.log(`TRACK VALIDATION FAILURES\n${failures.join("\n")}`);
  expect(failures).toEqual([]);

  fs.mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(({ results, maxError }) => {
    const polyline = (pts, color) =>
      `<polyline points="${pts.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${color}" stroke-width=".014"/>`;
    document.body.innerHTML = `<main style="background:#0b0b0b;color:#ddd;padding:20px;font:12px monospace;min-height:100vh">
      <h1>F1 TRACK ACCURACY — pinned reference</h1>
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">${results.map((r) =>
        `<section><b>${r.gameId}</b> · ${r.shapeError.toFixed(3)} / ${maxError}
          <svg viewBox="-.04 -.04 1.08 1.08" width="100%" height="110">
            ${polyline(r.referenceNorm, "#f6d200")}${polyline(r.gameNorm, "#39d0ff")}
          </svg></section>`).join("")}</div></main>`;
  }, { results, maxError: MAX_SHAPE_ERROR });
  await page.screenshot({ path: path.join(OUT, "overview.png"), fullPage: true });
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(
    results.map(({ referenceNorm, gameNorm, ...result }) => result),
    null,
    2,
  ));
});
