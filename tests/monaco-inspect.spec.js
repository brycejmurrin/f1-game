// @ts-check
import { test, expect } from "@playwright/test";

test("monaco track shape inspection", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex, { timeout: 15000 });

  await page.evaluate(async () => {
    __apex.race("monaco");
    await new Promise(r => setTimeout(r, 3000));
  });

  const data = await page.evaluate(() => {
    const profile = __apex.trackProfile(72);
    const shape = __apex.trackShape(120);   // 120 normalised X/Z points
    const corners = __apex.corners();
    const pts = profile.map(p => ({
      frac: p.frac, y: p.y, slope: p.slope, k: p.k,
    }));
    return { profile: pts, corners, shape };
  });

  // Print the curvature profile - positive k = one direction, negative = other
  console.log("\n=== MONACO TRACK PROFILE ===");
  console.log("frac\t\tk(curv)\t\tslope\t\ty");
  data.profile.forEach(p => {
    const dir = p.k > 0.001 ? "LEFT" : p.k < -0.001 ? "RIGHT" : "straight";
    console.log(`${p.frac.toFixed(3)}\t\t${p.k.toFixed(4)}\t\t${p.slope.toFixed(3)}\t\t${p.y.toFixed(1)}\t${dir}`);
  });

  console.log("\n=== CORNERS (apex fractions) ===");
  console.log(JSON.stringify(data.corners, null, 2));

  // ASCII art (80×40 grid)
  const W = 80, H = 40;
  const grid = Array.from({length: H}, () => Array(W).fill(' '));
  data.shape.forEach((p, i) => {
    const col = Math.min(W - 1, Math.max(0, Math.round(p.x * (W - 1))));
    const row = Math.min(H - 1, Math.max(0, Math.round(p.z * (H - 1))));
    const frac = i / data.shape.length;
    grid[row][col] = frac < 0.008 ? 'S' :
      (frac > 0.24 && frac < 0.26) ? '1' :
      (frac > 0.49 && frac < 0.51) ? '2' :
      (frac > 0.74 && frac < 0.76) ? '3' : '·';
  });
  // Mark strongest corner (hairpin)
  const hairpin = data.profile.reduce((best, p) => Math.abs(p.k) > Math.abs(best.k) ? p : best, {k:0});
  const hpIdx = Math.round(hairpin.frac * data.shape.length);
  const hpPt = data.shape[Math.min(hpIdx, data.shape.length-1)];
  if (hpPt) {
    const col = Math.min(W-1, Math.max(0, Math.round(hpPt.x * (W-1))));
    const row = Math.min(H-1, Math.max(0, Math.round(hpPt.z * (H-1))));
    grid[row][col] = hairpin.k > 0 ? 'R' : 'L';
  }
  console.log("\n=== MONACO SHAPE: x→RIGHT, z↓DOWN (S=start,1=25%,2=50%,3=75%, R/L=sharpest corner) ===");
  console.log("  +" + "─".repeat(W) + "+");
  grid.forEach(row => console.log("  |" + row.join('') + "|"));
  console.log("  +" + "─".repeat(W) + "+");
  console.log(`  Sharpest corner: frac=${hairpin.frac} k=${hairpin.k} (${hairpin.k>0?'RIGHT':'LEFT'}) — real Monaco hairpin is RIGHT`);
  console.log("");

  // Sign convention check
  const firstCorner = data.profile.find(p => p.frac > 0.02 && Math.abs(p.k) > 0.005);
  console.log("First significant corner (k>0=RIGHT per tracks.js):", firstCorner);

  expect(data.profile.length).toBeGreaterThan(0);
});
