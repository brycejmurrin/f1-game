// @ts-check
// banking-probe — WHY DOES THE BROWSER'S BANKING TERM READ ~2x NODE'S?
//
// tests/terrain-over-road.spec.js reports nurburgring ROAD 0.37 m over the
// racing line at sourceFrac 0.7808 (the Schumacher-S bank, authored
// { frac: 0.780, angleDeg: 4.0, widthM: 130 }). Reproducing the test's own
// arithmetic in a Node VM gives
//     sample y = py[997] + banking(lat -4.84) = 2.151 - 0.335 = 1.816
// while the browser's failing sample reads 1.47 — an implied banking dy of
// -0.681 against node's -0.335, a ratio of 2.03. Node also shows the built
// track and the centreline-only build returning IDENTICAL dy at every lateral,
// so the divergence is somewhere between the two ENVIRONMENTS, not between the
// two builds. This prints every term of that computation side by side in the
// browser, so the diverging one is named rather than guessed at.
//
// Also measures the thing the test is FOR, directly: __apex.groundY(f, lat)
// .roadY is the real mesh surface height at the sample point. If
// py + centreline-dy sits ~0.35 BELOW roadY, the test's reference line is too
// low there and the "0.37 m over" is the test under-modelling the bank — a
// test defect. If they agree and a mesh face still sits 0.37 above both, the
// road mesh genuinely steps at the banking transition — a product defect.
import { test, expect } from "@playwright/test";

test("nurburgring banking: browser terms vs the node reproduction", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { polling: 100, timeout: 15_000 });
  await page.evaluate(() => window.__apex.race("nurburgring", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track === "nurburgring",
    { polling: 100, timeout: 60_000 });
  await page.waitForTimeout(1500);

  const r = await page.evaluate(() => {
    const F = 0.7807, LATS = [-8.07, -4.84, -4.03, 0, 4.03, 4.84, 8.07];
    const def = Tracks.LIST.find((t) => t.id === "nurburgring");
    // Fresh builds in-page, mirroring what the node probe did — if these differ
    // from node's, the environments diverge at build time, not at banking time.
    const built = Tracks.build(def);
    const cline = Tracks.buildCenterline(def);
    const node = window.__apex.nodeAt(F);
    const rows = LATS.map((lat) => {
      const bBuilt = Tracks.banking(built, F * built.total, lat);
      const bCline = Tracks.banking(cline, F * cline.total, lat);
      const g = window.__apex.groundY(F, lat);
      return {
        lat,
        dyBuilt: bBuilt && bBuilt.dy != null ? +bBuilt.dy.toFixed(3) : null,
        dyCline: bCline && bCline.dy != null ? +bCline.dy.toFixed(3) : null,
        testRefY: +(node.y + (bCline && bCline.dy != null ? bCline.dy : 0)).toFixed(3),
        roadY: g && g.roadY != null ? +g.roadY.toFixed(3) : null,
      };
    });
    return {
      builtN: built.n, builtTotal: +built.total.toFixed(1),
      clineN: cline.n, clineTotal: +cline.total.toFixed(1),
      nodeAt: { k: node.k, y: node.y },
      rows,
    };
  });

  console.log(`built  n=${r.builtN} total=${r.builtTotal}`);
  console.log(`cline  n=${r.clineN} total=${r.clineTotal}`);
  console.log(`nodeAt(0.7807): k=${r.nodeAt.k} y=${r.nodeAt.y}`);
  console.log("  lat     dyBuilt  dyCline  testRefY  roadY   roadY-testRefY");
  for (const w of r.rows)
    console.log(`  ${String(w.lat).padStart(6)}  ${String(w.dyBuilt).padStart(7)}  ` +
      `${String(w.dyCline).padStart(7)}  ${String(w.testRefY).padStart(8)}  ` +
      `${String(w.roadY).padStart(6)}  ${w.roadY != null ? (w.roadY - w.testRefY).toFixed(3) : "-"}`);

  // A probe that returns nothing must not read as a pass.
  expect(r.rows).toHaveLength(7);
  expect(r.nodeAt.y, "node y at the offender — node measured 2.151").toBeGreaterThan(0);
});
