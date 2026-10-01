// track-themes-build — every theme preset's GENERATED scenery closure
// (js/editor/track-themes.js sceneryFor) dresses a randomised custom circuit
// through the real `Tracks.build` in verify-track's VM, under the same guard
// the 52 shipped circuits pass (verifyDef: no rejected mesh, no required-model
// diagnostics, a non-empty props mesh under the fleet vertex cap, no tarmac
// fold). Two seeds per preset so a seed-dependent placement cannot hide; the
// same seed twice is byte-identical in vertex count. The dresser must also
// actually dress: a theme that fell back to generic dressing (its closure threw)
// is a silent failure, so the build is compared against the bare build.
//
// Run: node --test tests/unit/track-themes-build.test.mjs   (~8 presets × 2 full builds)
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext, verifyDef, customContext, customDef } = require(path.join(ROOT, "tools/track/verify-track.cjs"));

const SEEDS = [7, 23];
const PROP_VERT_CAP = 1100000;   // verify-track's fleet cap

function boot() {
  const Tracks = buildContext(undefined, { quiet: true });
  const ctx = customContext(Tracks);
  return { Tracks, ctx };
}
/** A valid random loop for a seed, as the designer would save it. */
function designFor(ctx, seed, theme) {
  const V = ctx.TrackValidate, TR = ctx.TrackRandom;
  const g = TR.generateValid(seed, (pts) => V.check({ theme, baseHW: 7, seed, pts }).red === 0, 12);
  assert.ok(g.ok, `seed ${seed} yields a valid loop`);
  return { name: theme.toUpperCase() + " " + seed, theme, baseHW: 7, seed, pts: g.pts };
}

test("every preset's generated scenery builds under the fleet guard, deterministically, and actually dresses", { timeout: 600000 }, () => {
  const { Tracks, ctx } = boot();
  const T = ctx.TrackThemes;
  const rows = [];
  for (const theme of T.ORDER) {
    for (const seed of SEEDS) {
      const design = designFor(ctx, seed, theme);
      const def = customDef(Tracks, design);
      assert.equal(typeof def.scenery, "function", theme + ": the def carries its generated closure");
      const r = verifyDef(Tracks, def, { quiet: true });
      assert.ok(r.props > 0 && r.props < PROP_VERT_CAP, `${theme}/${seed}: props ${r.props} within the fleet cap`);
      assert.ok(!r.folds || !/fold/.test(r.folds) || /known/.test(r.folds), `${theme}/${seed}: no tarmac fold`);
      // The dresser ran (a thrown dresser logs a warning and leaves the generic
      // dressing). On a permanent circuit the themed build has strictly more
      // props than the bare one; on a STREET preset the generic city pass fills
      // the same ground, so a stand or a shoreline can displace blocks and the
      // count may fall — there the warning check alone is the evidence.
      const bare = Object.assign({}, def, { scenery: () => {} });
      Object.defineProperty(bare, "points", { value: def.points, enumerable: true });
      const b = Tracks.build(bare);
      const bareProps = b.meshes.props ? b.meshes.props.verts : 0;
      if (!def.street) assert.ok(r.props > bareProps, `${theme}/${seed}: the theme adds scenery (${r.props} vs bare ${bareProps})`);
      const warned = (Tracks._vmConsole || []).filter((l) => /custom scenery .* failed/.test(l));
      assert.deepEqual(warned, [], theme + ": the dresser must not throw");
      // Lamp caps: the mast register never exceeds the engine's own cap.
      const lamps = r.track.lampPosts ? r.track.lampPosts.length : 0;
      assert.ok(lamps <= 512, `${theme}/${seed}: ${lamps} lamps ≤ 512`);
      rows.push({ theme, seed, props: r.props, inst: r.inst, bare: bareProps, lamps });
    }
    // Same seed, same bytes.
    const again = verifyDef(Tracks, customDef(Tracks, designFor(ctx, SEEDS[0], theme)), { quiet: true });
    assert.equal(again.props, rows.find((x) => x.theme === theme && x.seed === SEEDS[0]).props, theme + ": deterministic");
  }
  for (const r of rows) console.log(`themes: ${r.theme.padEnd(12)} seed ${String(r.seed).padStart(2)}  props ${String(r.props).padStart(7)}  (bare ${r.bare})  inst ${r.inst}  lamps ${r.lamps}`);
});

test("--custom accepts a share code: encode → verifyDef round trip", { timeout: 300000 }, async () => {
  const { Tracks, ctx } = boot();
  const design = designFor(ctx, 11, "harbour");
  const code = await ctx.TrackCodec.encode(design);
  const back = await ctx.TrackCodec.decode(code);
  assert.equal(back.ok, true);
  const r = verifyDef(Tracks, customDef(Tracks, back.design), { quiet: true });
  assert.ok(r.props > 0);
  assert.match(r.id, /^custom-[0-9a-f]{8}$/);
  assert.equal(r.id, ctx.CustomTracks.sanitize(design).id, "the built id is the design's content id");
});
