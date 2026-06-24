// @ts-check
// Circuit directions for all F1 tracks using the game's real OSM coordinate data.
// CircuitPaths (js/circuits.js) holds [x, z] metre offsets for each circuit
// (x = east, z = north). Shoelace signed area: negative → CW, positive → CCW.
import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const OUT = path.join(import.meta.dirname, "f1-circuit-directions");

test("F1 circuit directions from OSM centerline data", async ({ page }) => {
  test.setTimeout(60_000);
  fs.mkdirSync(OUT, { recursive: true });

  await page.goto("/");
  await page.waitForFunction(() => typeof CircuitPaths !== "undefined", { timeout: 15_000 });

  // ── 1. Extract circuit data and compute direction ─────────────────────────
  const circuits = await page.evaluate(() => {
    // Track metadata (name, country) from Tracks.LIST
    const meta = {};
    if (typeof Tracks !== "undefined" && Tracks.LIST) {
      Tracks.LIST.forEach(t => {
        meta[t.id] = { name: t.name || t.id, country: t.country || "" };
      });
    }

    const results = [];
    for (const [id, circuit] of Object.entries(CircuitPaths)) {
      const pts = circuit.pts;
      if (!pts || pts.length < 4) continue;

      // Shoelace signed area (x=east, z=north → negative area = CW traversal)
      let area = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
      }
      area /= 2;

      // Normalise pts for SVG: x→right, flip z so north = top of map
      const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minZ = Math.min(...zs), maxZ = Math.max(...zs);
      const scale = Math.max(maxX - minX, maxZ - minZ) || 1;
      const svgPts = pts.map(p => ({
        x: +((p[0] - minX) / scale).toFixed(4),
        y: +((maxZ - p[1]) / scale).toFixed(4), // flip: north→top
      }));

      results.push({
        id,
        name: (meta[id] || {}).name || id,
        country: (meta[id] || {}).country || "",
        direction: area < 0 ? "CW" : "CCW",
        area: Math.round(area),
        len: circuit.len || 0,
        count: pts.length,
        svgPts,
        start: svgPts[0],
      });
    }

    // Sort alphabetically by id
    results.sort((a, b) => a.id.localeCompare(b.id));
    return results;
  });

  console.log(`\nFound ${circuits.length} circuits in CircuitPaths`);

  // ── 2. Print summary ──────────────────────────────────────────────────────
  console.log("\n=== F1 CIRCUIT DIRECTIONS (OSM centerline, CW/CCW) ===");
  circuits.forEach(c => {
    const len = c.len ? (c.len / 1000).toFixed(3) + " km" : "—";
    console.log(`  ${c.direction}\t${c.name.padEnd(28)}${len}  (${c.count} pts)`);
  });

  // ── 3. Inject grid into the page DOM and screenshot ───────────────────────
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.evaluate((circuits) => {
    const COLS = 5;
    const CW_COL  = "#4af";
    const CCW_COL = "#fa4";

    function card(c) {
      const col = c.direction === "CW" ? CW_COL : CCW_COL;
      const polyPoints = c.svgPts.map(p => `${p.x},${p.y}`).join(" ");
      const { x: sx, y: sy } = c.start || { x: 0, y: 0 };
      const len = c.len ? (c.len / 1000).toFixed(2) + " km" : "";
      return `
        <div style="border:1px solid #242424;border-radius:8px;padding:10px;
                    background:#141414;font-family:monospace;font-size:11px">
          <div style="color:#555;margin-bottom:1px">${c.country}</div>
          <div style="font-weight:bold;color:#ddd;font-size:13px">${c.name}</div>
          <div style="margin:3px 0">
            <span style="color:${col};font-weight:bold">${c.direction}</span>
            <span style="color:#444;margin-left:6px">${len}</span>
          </div>
          <svg viewBox="-0.04 -0.04 1.08 1.08" width="100%" height="90px"
               style="display:block;margin-top:4px">
            <polyline points="${polyPoints}"
              fill="none" stroke="${col}" stroke-width="0.016"
              stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="${sx}" cy="${sy}" r="0.045"
              fill="#0f0" stroke="#000" stroke-width="0.012"/>
          </svg>
          <div style="color:#333;margin-top:2px">${c.count} pts · id: ${c.id}</div>
        </div>`;
    }

    document.body.innerHTML = `
      <div style="background:#0b0b0b;padding:20px;min-height:100vh">
        <div style="margin-bottom:16px">
          <span style="color:#fff;font-family:monospace;font-size:16px;font-weight:bold">
            F1 CIRCUIT DIRECTIONS
          </span>
          <span style="color:#555;font-family:monospace;font-size:12px;margin-left:10px">
            source: OSM centerline data (CircuitPaths in circuits.js)
          </span>
          <span style="margin-left:16px;color:#4af;font-family:monospace;font-size:12px">● CW</span>
          <span style="margin-left:10px;color:#fa4;font-family:monospace;font-size:12px">● CCW</span>
          <span style="margin-left:10px;color:#0f0;font-family:monospace;font-size:12px">● start (frac=0)</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(${COLS},1fr);gap:10px">
          ${circuits.map(card).join("\n")}
        </div>
      </div>`;
  }, circuits);

  await page.waitForTimeout(200);

  // Screenshot the full grid
  const gridFile = path.join(OUT, "all-circuits.png");
  await page.screenshot({ path: gridFile, fullPage: true });
  console.log(`\nGrid screenshot → ${gridFile}`);

  // ── 4. Individual per-circuit screenshots ─────────────────────────────────
  for (const c of circuits) {
    const col = c.direction === "CW" ? "#4af" : "#fa4";
    const pts = c.svgPts.map(p => `${p.x},${p.y}`).join(" ");
    const { x: sx, y: sy } = c.start || { x: 0, y: 0 };

    await page.evaluate(({ c, col, pts, sx, sy }) => {
      const len = c.len ? (c.len / 1000).toFixed(3) + " km" : "";
      document.body.innerHTML = `
        <div style="background:#0b0b0b;padding:24px;width:380px">
          <div style="color:#555;font-family:monospace;font-size:11px">${c.country}</div>
          <div style="color:#fff;font-family:monospace;font-size:17px;font-weight:bold">${c.name}</div>
          <div style="color:${col};font-family:monospace;font-size:13px;margin:4px 0">
            ${c.direction} · ${len}
          </div>
          <svg viewBox="-0.04 -0.04 1.08 1.08" width="360" height="360"
               style="display:block;margin:8px 0">
            <polyline points="${pts}"
              fill="none" stroke="${col}" stroke-width="0.013"
              stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="${sx}" cy="${sy}" r="0.04"
              fill="#0f0" stroke="#000" stroke-width="0.01"/>
          </svg>
          <div style="color:#333;font-family:monospace;font-size:10px">
            ${c.count} OSM pts · session start ● · area=${c.area}
          </div>
        </div>`;
    }, { c, col, pts, sx, sy });

    await page.setViewportSize({ width: 420, height: 480 });
    const file = path.join(OUT, `${c.id}.png`);
    await page.screenshot({ path: file });
  }

  // ── 5. Save JSON summary ──────────────────────────────────────────────────
  const summary = circuits.map(({ id, name, country, direction, len, area, count }) => ({
    id, name, country, direction, len, area, count
  }));
  fs.writeFileSync(
    path.join(OUT, "directions.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log(`JSON → ${path.join(OUT, "directions.json")}`);

  expect(circuits.length).toBeGreaterThan(0);
  // Monaco sanity check: must be CW after our recent fix
  const monaco = circuits.find(c => c.id === "monaco");
  if (monaco) {
    console.log(`\nMonaco direction: ${monaco.direction} (expected CW)`);
    expect(monaco.direction).toBe("CW");
  }
});
