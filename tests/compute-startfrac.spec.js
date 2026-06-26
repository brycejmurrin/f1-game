// One-off: compute correct startFrac via GPS world-position Procrustes alignment.
// Samples the game spline's actual x,z positions using eyeAt+camState, then
// matches those to the GPS trace coordinates (both in meters) to find the phase offset.
// Run: npx playwright test tests/compute-startfrac.spec.js --reporter=dot
import { test } from "@playwright/test";
import fs from "fs";

const SCRATCHPAD = "/tmp/claude-0/-home-user-f1-game/a7c80858-b2ae-5716-b58b-8f8dd8a8b4f7/scratchpad";
const GPS_JSON = `${SCRATCHPAD}/gps5/startlines-2025.json`;
const OUT_JSON = `${SCRATCHPAD}/startfrac-computed.json`;

const CIRCUITS = [
  { game: "bahrain",      gps: "Sakhir",             rev: false },
  { game: "albert_park",  gps: "Melbourne",           rev: false },
  { game: "cota",         gps: "Austin",              rev: false },
  { game: "hungaroring",  gps: "Hungaroring",         rev: false },
  { game: "imola",        gps: "Imola",               rev: false },
  { game: "interlagos",   gps: "Interlagos",          rev: false },
  { game: "jeddah",       gps: "Jeddah",              rev: false },
  { game: "miami",        gps: "Miami",               rev: false },
  { game: "monaco",       gps: "Monte Carlo",         rev: true  },
  { game: "montreal",     gps: "Montreal",            rev: false },
  { game: "monza",        gps: "Monza",               rev: false },
  { game: "qatar",        gps: "Lusail",              rev: false },
  { game: "redbull",      gps: "Spielberg",           rev: false },
  { game: "shanghai",     gps: "Shanghai",            rev: false },
  { game: "silverstone",  gps: "Silverstone",         rev: false },
  { game: "singapore",    gps: "Singapore",           rev: false },
  { game: "spa",          gps: "Spa-Francorchamps",   rev: false },
  { game: "suzuka",       gps: "Suzuka",              rev: false },
  { game: "vegas",        gps: "Las Vegas",           rev: false },
  { game: "zandvoort",    gps: "Zandvoort",           rev: false },
  { game: "abudhabi",     gps: "Yas Marina Circuit",  rev: false },
  { game: "barcelona",    gps: "Catalunya",           rev: false },
  { game: "mexico",       gps: "Mexico City",         rev: false },
];

// Resample closed GPS trace to N evenly-spaced arc-length points.
// startIdx: GPS index to treat as fraction-0 (default 0 = S/F position).
function resampleGPS(pts, N, startIdx, reverse) {
  // Rotate so startIdx is first, then optionally reverse
  let reordered = [...pts.slice(startIdx), ...pts.slice(0, startIdx)];
  if (reverse) reordered = [...reordered].reverse();
  // Close the loop
  const closed = [...reordered, reordered[0]];
  const d = [0];
  for (let i = 1; i < closed.length; i++) {
    d.push(d[i-1] + Math.hypot(closed[i][0]-closed[i-1][0], closed[i][1]-closed[i-1][1]));
  }
  const L = d[d.length-1];
  const n = closed.length;
  let j = 0;
  const out = [];
  for (let i = 0; i < N; i++) {
    const s = (i / N) * L;
    while (j < n-2 && d[j+1] < s) j++;
    const t = Math.max(0, Math.min(1, (s-d[j]) / (d[j+1]-d[j]+1e-9)));
    out.push([closed[j][0]+t*(closed[j+1][0]-closed[j][0]),
              closed[j][1]+t*(closed[j+1][1]-closed[j][1])]);
  }
  return out;
}

// Find the rotation angle that best aligns two zero-mean point sets A (game) and B (GPS).
// Returns the Procrustes score (higher = better alignment).
function procrustesScore(A, B) {
  const N = A.length;
  let sxx = 0, sxy = 0, syx = 0, syy = 0;
  for (let i = 0; i < N; i++) {
    sxx += A[i][0] * B[i][0];
    sxy += A[i][0] * B[i][1];
    syx += A[i][1] * B[i][0];
    syy += A[i][1] * B[i][1];
  }
  // Optimal rotation: theta = atan2(syx-sxy, sxx+syy)
  // Procrustes score = sqrt((sxx+syy)^2 + (syx-sxy)^2) (up to constant)
  return Math.sqrt((sxx+syy)*(sxx+syy) + (syx-sxy)*(syx-sxy));
}

// Find the GPS phase shift (0..N-1) that best aligns GPS to game points.
// Tries all shifts and both driving directions. Returns {shift, frac, score, rev}.
function findBestAlignment(gameXZ, gpsTrace, N, reverseBase) {
  // Center the game points
  let cx = 0, cz = 0;
  for (const p of gameXZ) { cx += p[0]; cz += p[1]; }
  cx /= N; cz /= N;
  const gameCentered = gameXZ.map(p => [p[0]-cx, p[1]-cz]);

  // Try both directions
  let best = { score: -Infinity };
  for (const rev of [reverseBase, !reverseBase]) {
    // GPS resampled to N evenly-spaced points (starting at S/F = GPS trace[0])
    const gpsN = resampleGPS(gpsTrace, N, 0, rev);

    // Center GPS
    let gcx = 0, gcy = 0;
    for (const p of gpsN) { gcx += p[0]; gcy += p[1]; }
    gcx /= N; gcy /= N;
    const gpsCen = gpsN.map(p => [p[0]-gcx, p[1]-gcy]);

    // Try all N phase shifts (shift = how many game-steps ahead of GPS S/F the game's frac=0 is)
    for (let sh = 0; sh < N; sh++) {
      // For this shift: game point i corresponds to GPS point (i+sh)%N
      // Build GPS array with this shift applied
      const gpsShifted = Array.from({length: N}, (_, i) => gpsCen[(i+sh)%N]);
      const s = procrustesScore(gameCentered, gpsShifted);
      if (s > best.score) {
        best = { score: s, shift: sh, frac: sh/N, rev };
      }
    }
  }
  return best;
}

test.setTimeout(900000);

test("compute startFrac via world-position Procrustes", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 675 });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 15000 });

  const gpsData = JSON.parse(fs.readFileSync(GPS_JSON, "utf8")).circuits;
  const N = 120;
  const results = {};

  for (const { game, gps, rev } of CIRCUITS) {
    const circ = gpsData[gps];
    if (!circ) { console.log(`  SKIP ${game}: no GPS data`); continue; }

    // Sample game spline world positions (x, z) at N evenly-spaced fractions
    const gameXZ = await page.evaluate(async ([id, n]) => {
      __apex.race(id);
      await new Promise(r => setTimeout(r, 3500));
      const pts = [];
      for (let i = 0; i < n; i++) {
        __apex.eyeAt(i/n, 0, 1); // lat=0 centerline, 1m above surface
        const cs = __apex.camState();
        pts.push([cs.eye[0], cs.eye[2]]); // eye is [x,y,z]
      }
      return pts;
    }, [game, N]);

    // Find best phase alignment between game world positions and GPS trace
    const best = findBestAlignment(gameXZ, circ.trace, N, rev);

    // startFrac = the game fraction at which the GPS S/F (trace[0]) falls.
    // The "shift" tells us: GPS point 0 aligns with game point "shift".
    // So the game's fraction-0 is "shift" steps BEFORE the GPS S/F.
    // startFrac = (N - shift) / N (where game should place the car = GPS frac 0)
    // Actually: GPS S/F is at game index "shift" → startFrac = shift/N
    const sf = Math.round(best.frac * 10000) / 10000;
    const norm = (best.score / N / N).toFixed(4);
    console.log(`  ${game.padEnd(12)} startFrac=${sf.toFixed(4)}  conf=${norm}  rev=${best.rev}`);
    results[game] = { startFrac: sf, conf: +norm, rev: best.rev };
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(results, null, 2));
  console.log(`\nResults written to ${OUT_JSON}`);
});
