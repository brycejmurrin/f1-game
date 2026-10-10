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
// At the validator's lap cap (lenMax 7 km) every preset must also stay under
// 1.0 M prop vertices and 480 lamps (the city, belts and flood ring scale with
// the lap: TrackThemes.cityGaps / BELT_REF_M / LAMP_BUDGET); survey() lists
// the start straight once; and one dresser that throws leaves the others.
//
// Run: node --test tests/unit/track-themes-build.test.mjs   (every preset × 2 full builds + each at 6.9 km + the scenery-option builds at 6.9 km)
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
  // quiet: false CAPTURES the VM's console.warn lines (Tracks._vmConsole; the
  // VM never prints) — under quiet: true the capture is empty and the
  // "dresser must not throw" check below would be vacuous.
  const Tracks = buildContext(undefined, { quiet: false });
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

/** A validator-green design stretched to a ~6.95 km control polygon (≤ 200
 *  points, so RANDOMISE's 30 m spacing cannot reach it: a player's drag can). */
function longDesign(ctx, seed, theme, targetL = 6950) {
  const V = ctx.TrackValidate, S = ctx.TrackShape;
  const base = designFor(ctx, seed, theme);
  const f = targetL / S.polyLen(base.pts);
  const pts = base.pts.map((p) => [Math.round(p[0] * f * 4) / 4, Math.round(p[1] * f * 4) / 4]);
  const d = Object.assign({}, base, { pts, name: theme.toUpperCase() + " LONG" });
  const v = V.check(d);
  assert.equal(v.red, 0, `${theme}: the stretched loop is validator-green: ` + JSON.stringify(v.issues.filter((i) => i.level === "red")));
  assert.ok(v.stats.lengthM > 6700 && v.stats.lengthM <= V.LIMITS.lenMax, `${theme}: built ${v.stats.lengthM} m, near the ${V.LIMITS.lenMax} m cap`);
  return d;
}

test("authored nature and venue objects survive sharing and add real scenery without build warnings", { timeout: 300000 }, async () => {
  const { Tracks, ctx } = boot();
  for (const kind of ["palms", "hedge", "pines", "bushes", "marshal", "camera"]) {
    const design = designFor(ctx, 7, "blossom");
    const bare = verifyDef(Tracks, customDef(Tracks, design), { quiet: true });
    design.props = [0.2, 0.45, 0.7].flatMap((s) => [-1, 1].map((side) => ({ kind, s, side, gap: 24 }))).slice(0, ctx.TrackDesignerProps.CAPS[kind]);
    const back = await ctx.TrackCodec.decode(await ctx.TrackCodec.encode(design));
    assert.equal(back.ok, true);
    assert.equal(back.design.props.length, ctx.TrackDesignerProps.CAPS[kind]);
    const before = Tracks._vmConsole.length;
    const built = verifyDef(Tracks, customDef(Tracks, back.design), { quiet: true });
    // Pines and marshal shelters use instance batches, not the flat props mesh.
    const added = kind === "pines" || kind === "marshal" ? built.inst > bare.inst : built.props > bare.props;
    assert.ok(added, `${kind}: authored geometry grows (vertices ${bare.props} → ${built.props}, instances ${bare.inst} → ${built.inst})`);
    assert.ok(built.props < PROP_VERT_CAP);
    assert.deepEqual(Tracks._vmConsole.slice(before).filter((l) => /custom (?:prop|scenery).*failed/.test(l)), []);
  }
});
/** The def as CustomTracks.toRaw builds it once it hands the DESIGN to
 *  TrackThemes.defFields (the length-scaled fields): the theme's fields re-applied with the design. */
function scaledDef(ctx, design) {
  const it = ctx.CustomTracks.sanitize(design);
  return ctx.TrackDef.fromRaw(Object.assign(ctx.CustomTracks.toRaw(it), ctx.TrackThemes.defFields(it.theme, it)));
}
const LONG_PROP_CAP = 1000000, LONG_LAMP_CAP = 480;

test("every preset at ~6.9 km (the validator's lap cap) builds under 1.0 M prop vertices and 480 lamps", { timeout: 600000 }, () => {
  const { Tracks, ctx } = boot();
  const T = ctx.TrackThemes;
  const rows = [];
  for (const theme of T.ORDER) {
    const design = longDesign(ctx, 7, theme);
    const r = verifyDef(Tracks, scaledDef(ctx, design), { quiet: true });
    const lamps = r.track.lampPosts ? r.track.lampPosts.length : 0;
    rows.push(`${theme} ${Math.round(r.track.total)} m: props ${r.props}, lamps ${lamps}`);
    assert.ok(r.props < LONG_PROP_CAP, `${theme} at ${Math.round(r.track.total)} m: props ${r.props} < ${LONG_PROP_CAP}`);
    assert.ok(lamps <= LONG_LAMP_CAP, `${theme} at ${Math.round(r.track.total)} m: ${lamps} lamps ≤ ${LONG_LAMP_CAP}`);
  }
  for (const r of rows) console.log("themes @7 km: " + r);
});

// SCENERY OPTIONS (TrackThemes.LOOK): the heaviest combination — NIGHT (flood
// masts + roadside lamps), MANY TREES, PACKED CROWD — on every preset at the lap
// cap stays under the same caps, and a night street preset run by DAY (the
// day city, the fleet's densest dressing) thins like harbour.
test("every preset with NIGHT · MANY TREES · PACKED CROWD at ~6.9 km stays under 1.0 M prop vertices and 480 lamps; FEW < MANY", { timeout: 900000 }, () => {
  const { Tracks, ctx } = boot();
  const T = ctx.TrackThemes;
  const rows = [];
  const heavy = { time: "night", trees: "many", crowd: "packed" };
  const cases = T.ORDER.map((theme) => [theme, heavy]).concat([["marina", { time: "day", trees: "many", crowd: "packed" }], ["twilight", { time: "day", trees: "many", crowd: "packed" }]]);
  for (const [theme, look] of cases) {
    const design = Object.assign(longDesign(ctx, 7, theme), { look });
    const before = (Tracks._vmConsole || []).length;
    const r = verifyDef(Tracks, scaledDef(ctx, design), { quiet: true });
    const lamps = r.track.lampPosts ? r.track.lampPosts.length : 0;
    const tag = `${theme} ${look.time}/${look.trees}/${look.crowd} ${Math.round(r.track.total)} m`;
    rows.push(`${tag}: props ${r.props}, lamps ${lamps}`);
    assert.ok(r.props > 0 && r.props < LONG_PROP_CAP, `${tag}: props ${r.props} < ${LONG_PROP_CAP}`);
    assert.ok(lamps <= LONG_LAMP_CAP, `${tag}: ${lamps} lamps ≤ ${LONG_LAMP_CAP}`);
    if (look.time === "night") assert.equal(r.track.def.night, true, tag + ": night");
    const warned = (Tracks._vmConsole || []).slice(before).filter((l) => /custom scenery .* failed/.test(l));
    assert.deepEqual(warned, [], tag + ": no dresser threw");
  }
  for (const r of rows) console.log("look @7 km: " + r);
  // TREES and CROWD do something: FEW builds fewer props than MANY / PACKED.
  const few = verifyDef(Tracks, scaledDef(ctx, Object.assign(designFor(ctx, 7, "parkland"), { look: { trees: "few", crowd: "few" } })), { quiet: true }).props;
  const many = verifyDef(Tracks, scaledDef(ctx, Object.assign(designFor(ctx, 7, "parkland"), { look: { trees: "many", crowd: "packed" } })), { quiet: true }).props;
  console.log(`look parkland seed 7: few/few ${few} < many/packed ${many}`);
  assert.ok(few < many, `FEW (${few}) < MANY (${many})`);
});

// CustomTracks.toRaw (js/editor/custom-tracks.js) must pass the design:
// `TrackThemes.defFields(it.theme, it)`. Until it does, the length-scaled
// fields never reach a saved circuit — reported as a TODO, strict once wired.
{
  const probe = boot().ctx;
  const d = { theme: "harbour", baseHW: 7, seed: 1, pts: Array.from({ length: 40 }, (_, i) => [Math.round(1400 * Math.cos(i / 40 * 2 * Math.PI)), Math.round(900 * Math.sin(i / 40 * 2 * Math.PI))]) };
  const it = probe.CustomTracks.sanitize(d);
  const wired = !!(it && probe.CustomTracks.toRaw(it).dressingExclusions);
  test("CustomTracks.toRaw hands the design to TrackThemes.defFields (a long street lap carries its city gaps)",
    { todo: wired ? false : "js/editor/custom-tracks.js toRaw: TrackThemes.defFields(it.theme) → defFields(it.theme, it)" }, () => {
      assert.ok(it.lengthM > 3600, "the probe lap is longer than harbour's cityM");
      assert.deepEqual(JSON.parse(JSON.stringify(probe.CustomTracks.toRaw(it).dressingExclusions || null)),
        JSON.parse(JSON.stringify(probe.TrackThemes.cityGaps(it.lengthM, probe.TrackThemes.PRESETS.harbour.cityM))));
    });
}

test("survey() lists the start straight once; cityGaps scale with the lap", { timeout: 300000 }, () => {
  const { Tracks, ctx } = boot();
  const T = ctx.TrackThemes;
  const design = designFor(ctx, 7, "parkland");
  const def = customDef(Tracks, design);
  const orig = def.scenery;
  let sv = null;
  def.scenery = (api) => { sv = T.survey(api); orig(api); };
  Tracks.build(def);
  assert.ok(sv && sv.straights.length >= 1, "the survey ran");
  // A run covers node 0 when it starts there or wraps past the end of the lap.
  const covers0 = sv.straights.filter((s) => s.k0 === 0 || s.k1 < s.k0);
  assert.equal(covers0.length, 1, "exactly one run holds the start line: " + JSON.stringify(sv.straights.map((s) => [s.k0, s.k1, Math.round(s.lenM)])));
  for (let i = 0; i < sv.straights.length; i++) for (let j = i + 1; j < sv.straights.length; j++) {
    const a = sv.straights[i], b = sv.straights[j];
    const inA = (k) => (a.k0 <= a.k1 ? k >= a.k0 && k < a.k1 : k >= a.k0 || k < a.k1);
    assert.ok(!inA(b.k0), `runs ${i} and ${j} overlap`);
  }
  // City gaps: none up to cityM; past it the five windows drop (1 − cityM / L) of the lap.
  assert.equal(T.cityGaps(3500, 3600), null);
  const g = T.cityGaps(7000, 3600);
  assert.equal(g.length, 5);
  const drop = g.reduce((a, w) => a + (w.s1 - w.s0), 0);
  assert.ok(Math.abs(drop - (1 - 3600 / 7000)) < 1e-3, `drops ${drop.toFixed(3)} of the lap`);
  assert.ok(g.every((w) => w.kind === "city" && w.s0 > 0.04 && w.s1 < 0.96), "clear of the pit straight");
  assert.equal(T.defFields("harbour").dressingExclusions, undefined, "no design, no gaps");
  assert.equal(T.defFields("parkland", { lengthM: 7000 }).dressingExclusions, undefined, "no city, no gaps");
});

test("one dresser that throws is logged and skipped; the others still dress", { timeout: 300000 }, () => {
  const { Tracks, ctx } = boot();
  const T = ctx.TrackThemes;
  const design = designFor(ctx, 23, "parkland");
  const steps = T.DRESS.parkland;
  const belts = steps.find((st) => st[0] === "belts");
  const keep = belts[1];
  belts[1] = () => { throw new Error("test: belts down"); };
  try {
    const before = Tracks._vmConsole.length;
    const def = customDef(Tracks, design);
    const withOthers = Tracks.build(def).meshes.props.verts;
    const bare = Object.assign({}, def, { scenery: () => {} });
    Object.defineProperty(bare, "points", { value: def.points, enumerable: true });
    const bareProps = Tracks.build(bare).meshes.props.verts;
    const warned = Tracks._vmConsole.slice(before).filter((l) => /custom scenery parkland failed \(belts\)/.test(l));
    assert.equal(warned.length, 1, "the failure is logged once, by name");
    assert.ok(withOthers > bareProps, `stands + horizon still dressed (${withOthers} vs bare ${bareProps})`);
  } finally { belts[1] = keep; }
});
