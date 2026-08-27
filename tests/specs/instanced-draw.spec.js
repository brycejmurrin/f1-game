/* instanced-draw.spec.js — the GLX consumer of TrackGraph.batches().
 *
 * Division of labour with tests/unit/track-graph.test.mjs, which owns the MATHS:
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
import { test, expect } from "../helpers/fixtures.js";

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
    await page.waitForFunction(() => __apex.info().track === "monza", null, { polling: 100, timeout: 180000 });

    const r = await page.evaluate(() => {
      const graph = __apex.trackGraph && __apex.trackGraph();
      if (!graph) return { skipped: "no graph on the loaded track" };
      const { batches, bakeOnly } = graph.batches();

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
    // NOT a skip. Zero batches is instancing failing completely, which is the
    // regression this file exists to catch — routing it to test.skip() made the
    // loudest possible failure report as green. track-graph.test.mjs already
    // proves Monza produces batches headlessly, so an empty list here is real.
    expect(r.batches, "a built Monza produced no instanced batches at all").toBeGreaterThan(0);
    expect(r.instances).toBe(r.expected);
    expect(r.hasMatrixBuffer).toBe(true);
    expect(r.colourBufferMatchesPayload).toBe(true);
    expect(r.verts).toBeGreaterThan(0);
    // The whole point of the split rules: nearly everything should instance.
    expect(r.bakeOnly).toBeLessThan(r.batches);
  });

  test("culling packs the visible instances to the front of the buffer", async ({ racePage: page }) => {
    await page.evaluate(() => __apex.race("monza"));
    await page.waitForFunction(() => __apex.info().track === "monza", null, { polling: 100, timeout: 180000 });

    const r = await page.evaluate(() => {
      const graph = __apex.trackGraph && __apex.trackGraph();
      if (!graph) return { skipped: "no graph" };
      const { batches } = graph.batches();
      const big = batches.reduce((a, b) => (b.count > a.count ? b : a));
      const batch = GLX.createInstancedBatch(big.geo, big.matrices, big.colors, { cellSize: 72 });

      // A frustum that contains nothing: all six planes reject everything. Built
      // as raw planes rather than from a camera so the test cannot drift with
      // the projection.
      const away = [[1,0,0,-1e9],[-1,0,0,-1e9],[0,1,0,-1e9],[0,-1,0,-1e9],[0,0,1,-1e9],[0,0,-1,-1e9]];
      const none = GLX.cullInstances(batch, away);

      // A frustum that contains everything.
      const all = [[1,0,0,1e9],[-1,0,0,1e9],[0,1,0,1e9],[0,-1,0,1e9],[0,0,1,1e9],[0,0,-1,1e9]];
      const every = GLX.cullInstances(batch, all);

      const out = { cells: batch.cells.length, total: batch.instances, none, every,
                    batches: batches.length };
      GLX.freeInstancedBatch(batch);
      return out;
    });

    test.skip(!!r.skipped, r.skipped || "");
    expect(r.batches, "a built Monza produced no instanced batches at all").toBeGreaterThan(0);
    expect(r.cells).toBeGreaterThan(0);
    expect(r.none, "an empty frustum should cull everything").toBe(0);
    expect(r.every, "a containing frustum should keep every instance").toBe(r.total);
  });

  test("instanced geometry can cast shadows", async ({ racePage: page }) => {
    const api = await page.evaluate(() => typeof GLX.castShadowInstanced);
    expect(api, "instanced props would light correctly but drop no shadow").toBe("function");
  });

  test("ordinary draws are unaffected — the scene still renders", async ({ racePage: page }) => {
    await page.evaluate(() => __apex.race("monza"));
    await page.waitForFunction(() => __apex.info().track === "monza", null, { polling: 100, timeout: 180000 });
    await page.evaluate(() => { __apex.park(0.1); __apex.snapCam(); });
    await page.waitForTimeout(4000);

    // page.screenshot(), not locator.screenshot(): the latter waits for element
    // stability, which starves under SwiftShader on a full circuit.
    const png = await page.screenshot({ timeout: 120000 });
    // A blank/black frame compresses to a few KB; a real 3D frame is tens of KB.
    expect(png.length, "the scene went black — instancing state leaked into normal draws").toBeGreaterThan(20000);
  });
});
