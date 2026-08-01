/* instanced-draw.spec.js — the GLX consumer of TrackGraph.batches().
 *
 * Division of labour with tests/track-graph.test.mjs, which owns the MATHS:
 * that suite proves an instance matrix reproduces replay()'s vertices exactly,
 * headlessly and in milliseconds. Nothing here re-derives that.
 *
 * What needs a browser is the wiring:
 *   * the lit shader still COMPILES after gaining the instance attributes, and
 *     ordinary draws are unaffected — that is the regression that would matter,
 *     because uInstanced leaking on, or the instance-colour attribute defaulting
 *     to (0,0,0), would black out the whole game;
 *   * a real track's batches() payload survives the trip into GL buffers.
 */
import { test, expect } from "./fixtures.js";

test.describe("GLX instanced draw", () => {
  test("exposes the batches() consumer API", async ({ racePage: page }) => {
    const api = await page.evaluate(() => ({
      create: typeof GLX.createInstancedBatch,
      draw: typeof GLX.drawInstanced,
      free: typeof GLX.freeInstancedBatch,
    }));
    expect(api).toEqual({ create: "function", draw: "function", free: "function" });
  });

  test("a real track's batches() payload uploads as GL instance buffers", async ({ racePage: page }) => {
    await page.evaluate(() => __apex.race("monza"));
    await page.waitForFunction(() => __apex.info().track === "monza", null, { timeout: 180000 });

    const r = await page.evaluate(() => {
      const graph = __apex.trackGraph && __apex.trackGraph();
      if (!graph) return { skipped: "no graph on the loaded track" };
      const { batches, bakeOnly } = graph.batches();
      if (!batches.length) return { skipped: "track produced no batches" };

      // Take the largest batch — the one an instanced renderer would care about.
      const big = batches.reduce((a, b) => (b.count > a.count ? b : a));
      const built = GLX.createInstancedBatch(big.geo, big.matrices, big.colors);
      const ok = {
        instances: built.instances,
        expected: big.count,
        hasMatrixBuffer: !!built.ibo,
        // colours only exist for models whose colour rides the node
        colourBufferMatchesPayload: !!built.cbo === !!(big.colors && big.colors.length),
        verts: big.verts,
        batches: batches.length,
        bakeOnly: bakeOnly.length,
      };
      GLX.freeInstancedBatch(built);
      return ok;
    });

    test.skip(!!r.skipped, r.skipped || "");
    expect(r.instances).toBe(r.expected);
    expect(r.hasMatrixBuffer).toBe(true);
    expect(r.colourBufferMatchesPayload).toBe(true);
    expect(r.verts).toBeGreaterThan(0);
    // The whole point of the split rules: nearly everything should instance.
    expect(r.bakeOnly).toBeLessThan(r.batches);
  });

  test("ordinary draws are unaffected — the scene still renders", async ({ racePage: page }) => {
    await page.evaluate(() => __apex.race("monza"));
    await page.waitForFunction(() => __apex.info().track === "monza", null, { timeout: 180000 });
    await page.evaluate(() => { __apex.park(0.1); __apex.snapCam(); });
    await page.waitForTimeout(4000);

    // page.screenshot(), not locator.screenshot(): the latter waits for element
    // stability, which starves under SwiftShader on a full circuit.
    const png = await page.screenshot({ timeout: 120000 });
    // A blank/black frame compresses to a few KB; a real 3D frame is tens of KB.
    expect(png.length, "the scene went black — instancing state leaked into normal draws").toBeGreaterThan(20000);
  });
});
