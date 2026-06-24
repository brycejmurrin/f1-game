// @ts-check
// Compares the game's CircuitPaths OSM data against the real bacinger/f1-circuits
// GeoJSON outlines (fetched from GitHub). For each circuit:
//   - Computes CW/CCW direction from BOTH sources using shoelace signed area
//   - Renders an overlay: yellow=GeoJSON (real), cyan=game CircuitPaths
//   - Reports MATCH / MISMATCH per circuit
// Source: https://github.com/bacinger/f1-circuits (ODbL)
import { test, expect } from "@playwright/test";
import https from "https";
import fs from "fs";
import path from "path";

const OUT = path.join(import.meta.dirname, "f1-track-accuracy");

// game circuit id → bacinger/f1-circuits feature id
const CIRCUIT_MAP = {
  abudhabi:    "ae-2009",
  albert_park: "au-1953",
  bahrain:     "bh-2002",
  baku:        "az-2016",
  cota:        "us-2012",
  hungaroring: "hu-1986",
  imola:       "it-1953",
  interlagos:  "br-1940",
  jeddah:      "sa-2021",
  madrid:      "es-2026",
  mexico:      "mx-1962",
  miami:       "us-2022",
  monaco:      "mc-1929",
  monza:       "it-1922",
  montreal:    "ca-1978",
  qatar:       "qa-2004",
  redbull:     "at-1969",
  shanghai:    "cn-2004",
  silverstone: "gb-1948",
  singapore:   "sg-2008",
  spa:         "be-1925",
  suzuka:      "jp-1962",
  vegas:       "us-2023",
  zandvoort:   "nl-1948",
};

function fetchGeoJSON(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ host: u.host, path: u.pathname, timeout: 20_000 }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

// Shoelace signed area. coord pairs must be [east, north] (lon/lat or x/z-north).
// Negative → CW, Positive → CCW.
function signedArea(pairs) {
  let s = 0;
  for (let i = 0; i < pairs.length - 1; i++) {
    s += pairs[i][0] * pairs[i + 1][1] - pairs[i + 1][0] * pairs[i][1];
  }
  return s / 2;
}

// Normalise coordinate pairs to [0,1]. yFlip=true flips vertical for screen display.
function normalise(pairs, yFlip = false) {
  const xs = pairs.map(p => p[0]), ys = pairs.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.max(maxX - minX, maxY - minY) || 1;
  return pairs.map(p => ({
    x: +((p[0] - minX) / scale).toFixed(4),
    y: yFlip
      ? +((maxY - p[1]) / scale).toFixed(4)
      : +((p[1] - minY) / scale).toFixed(4),
  }));
}

test("verify game track shapes against real GeoJSON outlines", async ({ page }) => {
  test.setTimeout(120_000);
  fs.mkdirSync(OUT, { recursive: true });

  // ── 1. Fetch GeoJSON from GitHub (Node.js context, not browser) ───────────
  console.log("\nFetching bacinger/f1-circuits GeoJSON from GitHub...");
  const geoJSON = await fetchGeoJSON(
    "https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson"
  );
  console.log(`GeoJSON: ${geoJSON.features.length} circuits`);

  // Index by feature id
  const geoByID = {};
  geoJSON.features.forEach(f => { geoByID[f.properties.id] = f; });

  // ── 2. Load game page and get CircuitPaths ────────────────────────────────
  await page.goto("/");
  await page.waitForFunction(() => typeof CircuitPaths !== "undefined", { timeout: 15_000 });

  const gameCircuits = await page.evaluate(() => {
    const out = {};
    for (const [id, c] of Object.entries(CircuitPaths)) {
      out[id] = { pts: c.pts, len: c.len };
    }
    return out;
  });
  console.log(`Game CircuitPaths: ${Object.keys(gameCircuits).length} circuits`);

  // ── 3. Compare each circuit ───────────────────────────────────────────────
  const results = [];

  for (const [gameId, geoId] of Object.entries(CIRCUIT_MAP)) {
    const game  = gameCircuits[gameId];
    const geo   = geoByID[geoId];

    if (!game) {
      console.log(`  SKIP  ${gameId}: not in CircuitPaths`);
      continue;
    }
    if (!geo) {
      console.log(`  SKIP  ${gameId}: GeoJSON id "${geoId}" not found`);
      continue;
    }

    // GeoJSON coords are [lon, lat] → treat as [east, north] for shoelace
    const geoPairs  = geo.geometry.coordinates;         // [[lon,lat], ...]
    const gamePairs = game.pts;                          // [[x, z_north], ...]

    const geoArea  = signedArea(geoPairs);
    const gameArea = signedArea(gamePairs);

    const geoDir  = geoArea  < 0 ? "CW" : "CCW";
    const gameDir = gameArea < 0 ? "CW" : "CCW";
    const match   = geoDir === gameDir;

    // Normalise for SVG (flip y: north → top of map)
    const geoNorm  = normalise(geoPairs,  /* yFlip= */ true);
    const gameNorm = normalise(gamePairs, /* yFlip= */ true);

    const name    = geo.properties.Name;
    const country = geo.properties.Location;
    const len     = (geo.properties.length / 1000).toFixed(3);

    results.push({
      gameId, geoId, name, country, len,
      geoDir, gameDir, match,
      geoNorm, gameNorm,
      geoStart:  geoNorm[0],
      gameStart: gameNorm[0],
    });

    const icon = match ? "✓" : "✗";
    console.log(`  ${icon}  ${name.padEnd(38)} real=${geoDir}  game=${gameDir}`);
  }

  const ok   = results.filter(r => r.match).length;
  const fail = results.filter(r => !r.match).length;
  console.log(`\nTotal: ${results.length}  MATCH: ${ok}  MISMATCH: ${fail}`);

  // ── 4. DOM overview grid ──────────────────────────────────────────────────
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.evaluate((results) => {
    function svgTrack(pts, color) {
      return `<polyline points="${pts.map(p => `${p.x},${p.y}`).join(" ")}"
        fill="none" stroke="${color}" stroke-width="0.016"
        stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
    }

    const cards = results.map(r => {
      const border = r.match ? "#1a2a1a" : "#2a1a1a";
      const badge  = r.match
        ? `<span style="color:#3fb950">✓ MATCH</span>`
        : `<span style="color:#f85149">✗ MISMATCH</span>`;
      return `
        <div style="border:1px solid ${border};border-radius:8px;padding:10px;
                    background:#141414;font-family:monospace">
          <div style="color:#555;font-size:10px">${r.country}</div>
          <div style="color:#ddd;font-size:13px;font-weight:bold">${r.name}</div>
          <div style="font-size:11px;margin:2px 0">
            ${badge}
            <span style="color:#555;margin-left:8px">real=${r.geoDir} game=${r.gameDir}</span>
          </div>
          <svg viewBox="-0.04 -0.04 1.08 1.08" width="100%" height="88px"
               style="display:block;margin-top:4px">
            ${svgTrack(r.geoNorm,  "#f6d200")}
            ${svgTrack(r.gameNorm, "#39d0ff")}
            <circle cx="${r.geoStart.x}"  cy="${r.geoStart.y}"  r="0.045" fill="#f6d200"/>
            <circle cx="${r.gameStart.x}" cy="${r.gameStart.y}" r="0.035" fill="#39d0ff"/>
          </svg>
          <div style="color:#333;font-size:9px">${r.len} km · ${r.gameId}</div>
        </div>`;
    });

    const ok   = results.filter(r => r.match).length;
    const fail = results.filter(r => !r.match).length;

    document.body.innerHTML = `
      <div style="background:#0b0b0b;padding:20px;min-height:100vh">
        <div style="margin-bottom:14px;font-family:monospace">
          <span style="color:#fff;font-size:16px;font-weight:bold">F1 TRACK ACCURACY CHECK</span>
          <span style="color:#555;font-size:11px;margin-left:10px">
            source: bacinger/f1-circuits GeoJSON (real) vs game CircuitPaths (OSM)
          </span>
          <br>
          <span style="color:#f6d200;font-size:12px">● real GPS outline (GeoJSON)</span>
          <span style="color:#39d0ff;font-size:12px;margin-left:12px">● game centerline (CircuitPaths)</span>
          <span style="margin-left:16px;color:#3fb950;font-size:12px">✓ ${ok} MATCH</span>
          <span style="margin-left:12px;color:#f85149;font-size:12px">✗ ${fail} MISMATCH</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px">
          ${cards.join("\n")}
        </div>
      </div>`;
  }, results);

  await page.waitForTimeout(200);
  const gridFile = path.join(OUT, "overview.png");
  await page.screenshot({ path: gridFile, fullPage: true });
  console.log(`\nOverview → ${gridFile}`);

  // ── 5. Individual detailed screenshots for each circuit ───────────────────
  for (const r of results) {
    await page.evaluate((r) => {
      function svgTrack(pts, color, width = "0.013") {
        return `<polyline points="${pts.map(p => `${p.x},${p.y}`).join(" ")}"
          fill="none" stroke="${color}" stroke-width="${width}"
          stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      const match = r.match
        ? `<span style="color:#3fb950;font-size:14px">✓ MATCH  —  both ${r.geoDir}</span>`
        : `<span style="color:#f85149;font-size:14px">✗ MISMATCH  —  real=${r.geoDir}  game=${r.gameDir}</span>`;

      document.body.innerHTML = `
        <div style="background:#0b0b0b;padding:24px;width:420px;font-family:monospace">
          <div style="color:#555;font-size:11px">${r.country} · ${r.len} km</div>
          <div style="color:#fff;font-size:17px;font-weight:bold;margin:2px 0">${r.name}</div>
          <div style="margin-bottom:8px">${match}</div>
          <svg viewBox="-0.04 -0.04 1.08 1.08" width="380" height="380"
               style="display:block">
            ${svgTrack(r.geoNorm,  "#f6d200")}
            ${svgTrack(r.gameNorm, "#39d0ff")}
            <circle cx="${r.geoStart.x}"  cy="${r.geoStart.y}"  r="0.045" fill="#f6d200"/>
            <circle cx="${r.gameStart.x}" cy="${r.gameStart.y}" r="0.035" fill="#39d0ff"/>
          </svg>
          <div style="color:#444;font-size:10px;margin-top:6px">
            <span style="color:#f6d200">●</span> real GPS (GeoJSON frac=0)
            <span style="margin-left:12px;color:#39d0ff">●</span> game CircuitPaths frac=0
          </div>
        </div>`;
    }, r);
    await page.setViewportSize({ width: 460, height: 520 });
    await page.screenshot({ path: path.join(OUT, `${r.gameId}.png`) });
  }

  // ── 6. Save JSON report ───────────────────────────────────────────────────
  const report = results.map(({ gameId, geoId, name, country, len, geoDir, gameDir, match }) => ({
    gameId, geoId, name, country, len, geoDir, gameDir, match
  }));
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Report → ${path.join(OUT, "report.json")}`);

  // ── 7. Assert ─────────────────────────────────────────────────────────────
  expect(results.length).toBeGreaterThan(20);
  const monaco = results.find(r => r.gameId === "monaco");
  if (monaco) expect(monaco.geoDir).toBe("CW");   // real Monaco is CW
});
