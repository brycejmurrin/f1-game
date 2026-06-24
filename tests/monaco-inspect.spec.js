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
    // Get 36 points around the track (every 10 degrees of turn)
    const profile = __apex.trackProfile(72);

    // Get corners
    const corners = __apex.corners();

    // Compute cumulative heading to understand track shape
    // We'll also sample the raw X/Z positions to see the 2D shape
    const pts = profile.map(p => ({
      frac: p.frac,
      y: p.y,
      slope: p.slope,
      k: p.k,     // curvature: positive = left turn, negative = right turn (or vice versa)
      hw: p.hw,
    }));

    return { profile: pts, corners };
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

  // Check sign convention: Monaco T1 Sainte-Devote is a RIGHT turn
  // If k > 0 at the first corner, positive k = right; if k < 0, positive k = left
  const firstCorner = data.profile.find(p => p.frac > 0.02 && Math.abs(p.k) > 0.005);
  console.log("\nFirst significant corner after start:", firstCorner);
  console.log("If Sainte-Devote (T1) is a RIGHT turn, k should be:", firstCorner?.k);

  expect(data.profile.length).toBeGreaterThan(0);
});
