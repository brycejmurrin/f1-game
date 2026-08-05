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

  test("culling packs the visible instances to the front of the buffer", async ({ racePage: page }) => {
    await page.evaluate(() => __apex.race("monza"));
    await page.waitForFunction(() => __apex.info().track === "monza", null, { timeout: 180000 });

    const r = await page.evaluate(() => {
      const graph = __apex.trackGraph && __apex.trackGraph();
      if (!graph) return { skipped: "no graph" };
      const { batches } = graph.batches();
      if (!batches.length) return { skipped: "no batches" };
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

      const out = { cells: batch.cells.length, total: batch.instances, none, every };
      GLX.freeInstancedBatch(batch);
      return out;
    });

    test.skip(!!r.skipped, r.skipped || "");
    expect(r.cells).toBeGreaterThan(0);
    expect(r.none, "an empty frustum should cull everything").toBe(0);
    expect(r.every, "a containing frustum should keep every instance").toBe(r.total);
  });

  test("the radial cap culls what the frustum would admit", async ({ racePage: page }) => {
    // drawChunked culls TWICE — frustum, then radially against frame.cullDist —
    // and its own comment says why the second exists: "the frustum's far plane
    // is the only distance cull, so when it's pushed out (free camera) a
    // high/wide vantage admits the whole ~5 M-vert city at once — a mobile-tiler
    // OOM". cullInstances did frustum only, so wiring these batches into the
    // draw path without the same cap would reopen exactly that, on the backend
    // nearest its memory ceiling. See docs/research/SCENE-GRAPH-PLAN.md §8.3.
    //
    // The frustum here is the all-containing one, so anything removed below was
    // removed by the CAP and nothing else.
    await page.evaluate(() => __apex.race("monza"));
    await page.waitForFunction(() => __apex.info().track === "monza", null, { timeout: 180000 });

    const r = await page.evaluate(() => {
      const graph = __apex.trackGraph && __apex.trackGraph();
      if (!graph) return { skipped: "no graph" };
      const { batches } = graph.batches();
      if (!batches.length) return { skipped: "no batches" };
      const big = batches.reduce((a, b) => (b.count > a.count ? b : a));
      const batch = GLX.createInstancedBatch(big.geo, big.matrices, big.colors, { cellSize: 72 });
      const all = [[1,0,0,1e9],[-1,0,0,1e9],[0,1,0,1e9],[0,-1,0,1e9],[0,0,1,1e9],[0,0,-1,1e9]];

      // The centre of the batch, so a cap around it keeps a plausible middle.
      let cx = 0, cz = 0;
      for (let i = 0; i < batch.instances; i++) {
        cx += big.matrices[i * 16 + 12]; cz += big.matrices[i * 16 + 14];
      }
      cx /= batch.instances; cz /= batch.instances;
      const eye = [cx, 0, cz];

      const out = {
        cells: batch.cells.length,
        total: batch.instances,
        // No cap when it is not asked for — the old two-argument behaviour, and
        // what every existing caller still relies on.
        uncapped: GLX.cullInstances(batch, all),
        // Explicit zero means the same thing.
        capZero: GLX.cullInstances(batch, all, eye, 0),
        // No eye means no cap either, however large the distance.
        capNoEye: GLX.cullInstances(batch, all, null, 500),
        near: GLX.cullInstances(batch, all, eye, 150),
        far: GLX.cullInstances(batch, all, eye, 2000),
        // Far outside the circuit: the cap must be able to reject EVERYTHING,
        // which is the case it exists for — a cull that merely thins is no use
        // against a vantage that would otherwise admit the whole city.
        away: GLX.cullInstances(batch, all, [1e6, 0, 1e6], 1000),
      };
      GLX.freeInstancedBatch(batch);
      return out;
    });

    test.skip(!!r.skipped, r.skipped || "");
    // Unchanged for anyone not asking for a cap.
    expect(r.uncapped, "two-argument culling must stay frustum-only").toBe(r.total);
    expect(r.capZero, "cullDist 0 is no cap").toBe(r.total);
    expect(r.capNoEye, "a distance without an eye is no cap").toBe(r.total);
    // The cap bites, and monotonically.
    expect(r.near).toBeLessThan(r.total);
    expect(r.near).toBeLessThanOrEqual(r.far);
    expect(r.away, "a vantage far outside the circuit keeps nothing").toBe(0);
  });

  test("instanced geometry can cast shadows", async ({ racePage: page }) => {
    const api = await page.evaluate(() => typeof GLX.castShadowInstanced);
    expect(api, "instanced props would light correctly but drop no shadow").toBe("function");
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
