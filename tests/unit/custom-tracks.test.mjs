// custom-tracks — js/editor/custom-tracks.js (CustomTracks) + js/editor/track-themes.js
// (TrackThemes): the registry that turns the player's saved designs
// (apex26.customTracks) into Tracks.LIST entries through TrackDef.fromRaw,
// appended after the 52 shipped circuits with `custom: true`.
//
// Runs the REAL engine (verify-track's TRACK_VM context) plus the two modules
// over a stub GameStore, exactly as the page loads them: store → hash32 →
// tracks → def → themes → registry, sync() at eval.
//
// Run: node --test tests/unit/custom-tracks.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const MODULES = ["js/core/hash32.js", "js/editor/track-themes.js", "js/editor/custom-tracks.js"];
// VM-realm objects carry the sandbox's prototypes; deepEqual wants ours.
const plain = (o) => JSON.parse(JSON.stringify(o));

/** The engine + the registry over a store seeded with `stored` (short keys). */
function boot(stored = {}, pre) {
  const Tracks = buildContext(undefined, { quiet: true });
  const ctx = Tracks._vmContext;
  const data = Object.assign({}, stored);
  const writes = [];
  const store = {
    get: (k, d) => (k in data ? JSON.parse(JSON.stringify(data[k])) : d),
    set: (k, v) => { data[k] = v; },
    write: (k, v) => { data[k] = v; writes.push(k); return { ok: true, durable: true }; },
    rawDel: (k) => { delete data[k]; },
  };
  ctx.GameStore = { store };
  if (pre) pre(ctx);   // globals the registry reads at eval (e.g. a stub TrackDesignerProps)
  for (const f of MODULES) vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
  return { Tracks, ctx, data, writes, C: ctx.CustomTracks, T: ctx.TrackThemes };
}

function ellipse(n = 36, a = 760, b = 480, dx = 0) {
  const pts = [];
  // On the 0.25 m lattice already, so a sub-lattice nudge in a test rounds back onto it.
  const q = (v) => Math.round(v * 4) / 4;
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; pts.push([q(a * Math.cos(t) + dx), q(b * Math.sin(t))]); }
  return pts;
}
const design = (extra) => Object.assign({ name: "Test Loop", seed: 7, theme: "parkland", baseHW: 7, pts: ellipse() }, extra);

test("an empty store leaves the shipped roster exactly as it was", () => {
  const { Tracks, C } = boot();
  assert.equal(Tracks.LIST.length, 52);
  assert.equal(Tracks.LIST.filter((t) => t.custom).length, 0);
  assert.equal(Tracks.SEASON.length, 24);
  assert.equal(C.list().length, 0);
  assert.equal(C.sync(), 0);
  assert.equal(Tracks.LIST.length, 52, "sync is idempotent on an empty store");
});

test("stored designs are appended after the 52 as ordinary, buildable circuits", () => {
  const { Tracks, C } = boot({ customTracks: { v: 1, items: [design(), design({ name: "Second", theme: "oasis", pts: ellipse(36, 900, 420) })] } });
  assert.equal(Tracks.LIST.length, 54);
  assert.equal(Tracks.LIST.filter((t) => !t.custom).length, 52, "the pins count the shipped roster");
  assert.equal(Tracks.SEASON.length, 24, "SEASON never sees a custom");
  const [a, b] = Tracks.LIST.slice(52);
  assert.ok(a.custom && b.custom);
  assert.match(a.id, /^custom-[0-9a-f]{8}$/);
  assert.equal(a.name, "TEST LOOP", "names are upper-cased, printable ASCII");
  assert.equal(a.theme, "green"); assert.equal(b.theme, "desert");
  assert.equal(b.flatTerrain, true, "the oasis preset's terrain fields reach the def");
  assert.equal(typeof a.scenery, "function", "an inline closure, so ensureScenery fetches nothing");
  assert.equal(a.startFrac, 0); assert.equal(a.sceneryStartFrac, null); assert.equal(a.sceneryCoordinates, "racing");
  for (const d of [a, b]) {
    const tr = Tracks.buildCenterline(d);
    assert.ok(tr.total > 3500 && tr.total < 4500, `${d.id} lap ${tr.total}`);
    assert.ok(tr.line && tr.curv.length === tr.n, "racing line and curvature bake like any circuit");
  }
  // The same store synced again is the same tail — no duplicates.
  assert.equal(C.sync(), 2);
  assert.equal(Tracks.LIST.length, 54);
});

test("upsert / remove / select round-trip through the store and the roster", () => {
  const { Tracks, C, data, writes } = boot();
  const r = C.upsert(design());
  assert.equal(r.ok, true);
  assert.match(r.id, /^custom-/);
  assert.equal(writes.length, 1);
  assert.equal(data.customTracks.items.length, 1);
  assert.equal(Tracks.LIST.length, 53);
  assert.equal(Tracks.LIST[52].id, r.id);
  // Same content, new label: the id is the content hash, so it refreshes in place.
  const r2 = C.upsert(design({ name: "Renamed" }));
  assert.equal(r2.id, r.id);
  assert.equal(data.customTracks.items.length, 1);
  assert.equal(Tracks.LIST[52].name, "RENAMED");
  // A theme change is a different circuit (game.js rebuilds on a new id).
  const r3 = C.upsert(design({ theme: "alpine" }));
  assert.notEqual(r3.id, r.id);
  assert.equal(Tracks.LIST.length, 54);
  // select writes the stable id and the legacy index.
  assert.equal(C.select(r3.id), 53);
  assert.equal(data.trackId, r3.id); assert.equal(data.track, 53);
  assert.equal(C.select("custom-nope"), -1);
  // remove drops the entry, its TT board, and re-syncs.
  data["ttlb." + r.id] = [{ t: 90 }];
  C.remove(r.id);
  assert.equal(Tracks.LIST.length, 53);
  assert.equal(Tracks.LIST[52].id, r3.id);
  assert.equal(data["ttlb." + r.id], undefined);
  // The cap.
  for (let i = 0; i < 30; i++) C.upsert(design({ pts: ellipse(36, 700 + i * 3, 450) }));
  assert.equal(data.customTracks.items.length, C.LIMITS.items);
  assert.equal(C.upsert(design({ pts: ellipse(36, 999, 450) })).reason, "full");
});

test("stored input is player input: hostile shapes are dropped or repaired, never thrown", () => {
  const items = [
    null, 42, "x", {}, { pts: "no" },
    { pts: [[0, 0], [1, NaN], [2, 2]] },                           // NaN
    { pts: ellipse(3) },                                           // too few
    { pts: ellipse(5000, 2000, 2000) },                            // too many
    { pts: ellipse(36, 20000, 20000) },                            // off the map
    design({ theme: "<script>", name: "<img src=x onerror=1>\u0007​", baseHW: 99, seed: -3.7,
      hwZones: [{ s0: 2.5, s1: -0.1, hw: 1 }, "junk", { s0: 0.1, s1: 0.2, hw: 6, ease: 9 }],
      bankZones: [{ frac: 0.3, angleDeg: 400, widthM: 5 }],
      elevations: [{ s: 0.5, halfM: 1, rise: 1e9 }], bridges: null, turns: [0.1, "x", 7.25] }),
  ];
  const { Tracks, C } = boot({ customTracks: { v: 1, items } });
  assert.equal(Tracks.LIST.length, 53, "exactly the one repairable design survives");
  const d = Tracks.LIST[52];
  assert.equal(d.theme, "green", "unknown theme → the default preset");
  assert.equal(d.name, "<IMG SRC=X ONERROR=1>", "control chars stripped; markup is harmless as textContent (html-sink-lint keeps it out of innerHTML)");
  const it = C.list()[0];
  assert.equal(it.baseHW, 8, "baseHW clamps to 5–8");
  assert.equal(it.seed, (-4) >>> 0, "seed is floored into a u32");
  const g = (v) => Math.round(v * 65535) / 65535;   // the share code's u16 fraction grid
  assert.deepEqual(plain(it.hwZones), [{ s0: g(0.5), s1: g(0.9), hw: 5, ease: 0.025 }, { s0: g(0.1), s1: g(0.2), hw: 6, ease: 0.2 }],
    "fractions wrap onto the u16 grid, hw floors at the registry's 5 m, ease is always stored and clamps, junk rows drop — repair over discard where the geometry is sound");
  assert.deepEqual(plain(it.bankZones), [{ frac: g(0.3), angleDeg: 30, widthM: 20 }], "bank angle and width clamp to their limits");
  assert.deepEqual(plain(it.elevations), [{ s: g(0.5), halfM: 20, rise: 1 }], "a 1e9 m spike over 40 m is held to the 8 % grade cap (halfM / 19.6, on the 0.25 m rise grid)");
  assert.equal(it.bridges, null, "null stays null");
  assert.deepEqual(plain(it.turns), [g(0.1), g(0.25)], "turns wrap to [0,1) on the fraction grid");
  assert.ok(it.lengthM > 3000, "a missing lengthM is recomputed from the chord");
  assert.equal(C.sanitize(null), null);
  assert.equal(C.sanitize({ pts: [[0, 0]] }), null);
  Tracks.buildCenterline(d);   // and it still builds
});

test("fractional hill lengths keep the saved id through registration and reload", () => {
  const { C, Tracks, data } = boot();
  const raw = design({ elevations: [{ s: 0.5, halfM: 22.2, rise: 60 }],
    bridges: [{ s: 0.8, halfM: 22.2, rise: -60 }] });
  const once = C.sanitize(raw);
  assert.equal(once.elevations[0].halfM, 22);
  assert.equal(once.elevations[0].rise, 1);
  assert.equal(once.bridges[0].rise, -1);
  assert.deepEqual(plain(C.sanitize(once)), plain(once), "canonical geometry is idempotent");
  const saved = C.upsert(raw);
  assert.equal(saved.ok, true);
  assert.equal(saved.id, once.id);
  assert.equal(C.get(saved.id).id, saved.id, "upsert returns the registered id");
  assert.equal(Tracks.LIST[C.select(saved.id)].id, saved.id, "the returned id is raceable");
  const reloaded = boot(plain(data));
  assert.equal(reloaded.C.get(saved.id).id, saved.id, "stored geometry preserves its identity");
  assert.equal(reloaded.C.upsert(raw).id, saved.id);
  assert.equal(reloaded.C.list().length, 1, "re-saving the input never duplicates the circuit");
});

test("hill canonicalization preserves stable legacy geometry and sampled identities", () => {
  const { C } = boot();
  const legacy = design({ elevations: [{ s: 0.5, halfM: 23, rise: 1.25 }],
    bridges: [{ s: 0.8, halfM: 23, rise: -1.25 }] });
  const stable = C.sanitize(legacy);
  assert.equal(stable.id, "custom-d20a0e5d", "pre-fix content id: existing TT/ghost keys still resolve");
  assert.equal(stable.elevations[0].rise, 1.25, "preserve the old nearest-quarter cap");
  assert.equal(stable.bridges[0].rise, -1.25);
  assert.equal(C.sanitize(stable).id, stable.id);
  let seed = 0x51a7;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const samples = [20, 22.2, 23, 24.5, 149.9, 1999.8].flatMap(halfM => [-60, -1.13, 1.13, 60].map(rise => [halfM, rise]));
  for (let i = 0; i < 200; i++) samples.push([20 + random() * 1980, random() * 160 - 80]);
  for (const [halfM, rise] of samples) {
    const once = C.sanitize(design({ elevations: [{ s: 0.5, halfM, rise }] }));
    const bump = once.elevations[0];
    assert.ok(Number.isInteger(bump.rise * 4), "quarter-metre rise");
    assert.equal(C.sanitize(once).id, once.id, `${halfM}/${rise}: repeat sanitization keeps identity`);
  }
});

test("the id is the content: lattice, theme, width, seed and zones — not the name", () => {
  const { C } = boot();
  const a = C.sanitize(design()), b = C.sanitize(design({ name: "Other Name" }));
  assert.equal(a.id, b.id);
  assert.notEqual(C.sanitize(design({ baseHW: 6 })).id, a.id);
  assert.notEqual(C.sanitize(design({ seed: 8 })).id, a.id);
  assert.notEqual(C.sanitize(design({ elevations: [{ s: 0.5, halfM: 100, rise: 3 }] })).id, a.id);
  // 0.25 m lattice: a 0.1 m nudge rounds away and is the same circuit; 0.3 m is not.
  const nudged = design(); nudged.pts = nudged.pts.map(([x, z]) => [x + 0.1, z]);
  const moved = design(); moved.pts = moved.pts.map(([x, z]) => [x + 0.3, z]);
  assert.equal(C.sanitize(nudged).id, a.id);
  assert.notEqual(C.sanitize(moved).id, a.id);
  assert.ok(a.pts.every(([x, z]) => Number.isInteger(x * 4) && Number.isInteger(z * 4)), "stored on the lattice");
});

test("toRaw hands the factory what a circuit file would author", () => {
  const { C, T } = boot();
  const it = C.sanitize(design({ theme: "harbour", hwZones: [{ s0: 0.5, s1: 0.6, hw: 5 }] }));
  const raw = C.toRaw(it);
  assert.equal(raw.id, it.id); assert.equal(raw.custom, true);
  assert.equal(raw.street, true, "harbour is a street circuit");
  assert.deepEqual(plain(raw.pit), { mode: "street" });
  assert.ok(raw.cityStyle && raw.cityStyle.neon.includes("gold"));
  assert.equal(raw.path.pts.length, 36);
  assert.ok(raw.path.len > 3000);
  // applyHwZones keys i/N: the ellipse's control points are evenly spaced in
  // ANGLE, not arc, so 0.5 (the far vertex, by symmetry) is index 18 exactly
  // and 0.6 is wherever the cumulative chord length says — not 21.6.
  assert.equal(raw.hwZones.length, 1);
  assert.ok(Math.abs(raw.hwZones[0].s0 - 18 / 36) < 1e-4, "arc 0.5 → index 18/36: " + raw.hwZones[0].s0);
  assert.ok(Math.abs(raw.hwZones[0].s1 - C.arcToIndexFrac(it.pts, it.hwZones[0].s1)) < 1e-12);
  assert.equal(raw.hwZones[0].hw, 5); assert.equal(raw.hwZones[0].ease, 0.025);
  assert.equal(raw.turns, null, "no turns stored → the engine's curvature peaks");
  assert.equal(typeof raw.scenery, "function");
  for (const id of T.ORDER) {
    const f = T.defFields(id);
    assert.ok(["green", "desert", "street_day", "street_night", "modern"].includes(f.theme), id);
    assert.ok(f.furniture && f.furniture.tree && Array.isArray(f.standSet) && f.standSet.length === 3, id);
  }
  assert.equal(T.get("nope"), T.PRESETS.parkland, "unknown preset → parkland");
});

test("the picker knows the custom tail (source contract)", () => {
  const src = read("js/ui/select-screen.js");
  assert.match(src, /\["custom", "MY CIRCUITS"\]/, "a MY CIRCUITS chip");
  assert.match(src, /filter === "season"\) return !\(t\.classic \|\| t\.custom\)/, "SEASON hides customs");
  assert.match(src, /filter === "custom"\) return !!t\.custom/, "MY CIRCUITS shows only customs");
  assert.match(src, /trb trb-custom/, "the CUSTOM badge");
  assert.match(read("css/race-setup.css"), /\.trb-custom \{/, "…styled");
  assert.match(read("js/career/season-ui.js"), /!t\.custom && !used\.has/, "the season shelf never offers a custom");
  assert.match(read("js/net/lobby.js"), /Tracks\.LIST\[d\.track\]\.custom\) return null/, "the guest refuses a custom index");
  assert.match(read("js/core/lazy-bundles.js"), /!def\.scenery && !sceneryResident/, "ensureScenery fetches nothing for an inline closure");
});

test("sanitize: bank angle in [1, 30], hwZone width ≥ the 5 m floor, ease always stored and > 0", () => {
  const { C } = boot();
  const banks = C.sanitize(design({ bankZones: [{ frac: 0.1, angleDeg: 0, widthM: 100 }, { frac: 0.2, angleDeg: -12, widthM: 100 }, { frac: 0.3, angleDeg: 45, widthM: 100 }, { frac: 0.4, angleDeg: 12.3, widthM: 100 }] })).bankZones;
  // mesh.js reads (angleDeg || 18): 0 would build 18°, a negative adverse camber.
  assert.deepEqual(plain(banks.map((z) => z.angleDeg)), [1, 1, 30, 12.25]);
  const hz = C.sanitize(design({ hwZones: [{ s0: 0.1, s1: 0.2, hw: 2 }, { s0: 0.3, s1: 0.4, hw: 6, ease: 0 }, { s0: 0.5, s1: 0.6, hw: 6.5, ease: 0.04 }] })).hwZones;
  assert.deepEqual(plain(hz.map((z) => [z.hw, z.ease])), [[5, 0.025], [6, 0.005], [6.5, 0.04]], "hw floors at LIMITS.hwMin; a zero ease (a step) floors at 0.005; absent → the engine's 0.025");
  // The id must not depend on whether the author wrote the default ease: the
  // share code always carries one, so the receiver's id has to match.
  assert.equal(C.sanitize(design({ hwZones: [{ s0: 0.2, s1: 0.3, hw: 6 }] })).id, C.sanitize(design({ hwZones: [{ s0: 0.2, s1: 0.3, hw: 6, ease: 0.025 }] })).id);
});

test("sanitize refuses a loop the engine cannot build: coincident / sub-8 m points, a polygon under 1 km", () => {
  const { C, Tracks } = boot({ customTracks: { v: 1, items: [{ name: "dot", pts: Array.from({ length: 8 }, () => [5, 5]) }, design()] } });
  assert.equal(Tracks.LIST.length, 53, "8 coincident points never register as a raceable circuit");
  assert.equal(C.sanitize({ pts: Array.from({ length: 8 }, () => [5, 5]) }), null);
  const close = ellipse(); close[4] = [close[3][0] + 7.75, close[3][1]];
  assert.equal(C.sanitize(design({ pts: close })), null, "two consecutive points 7.75 m apart");
  assert.equal(C.sanitize(design({ pts: ellipse(36, 120, 80) })), null, "a ~630 m polygon");
  assert.ok(C.sanitize(design({ pts: ellipse(36, 200, 120) })), "a ~1.0 km polygon is a (red) design, not garbage");
  // The designer's own autosave is a work in progress: it restores loosely.
  assert.ok(C.sanitize(design({ pts: close }), { loose: true }), "opts.loose keeps a red draft");
  assert.ok(C.sanitize(design({ pts: ellipse(36, 120, 80) }), { loose: true }));
});

test("remove() / a replacing upsert re-resolve the selection by id and rewrite both stored keys", () => {
  const { Tracks, C, data } = boot();
  const G = { trackIdx: 0 };
  C.create(G, {});
  const a = C.upsert(design({ pts: ellipse(36, 700, 450) })).id;
  const b = C.upsert(design({ pts: ellipse(36, 720, 450) })).id;
  const c = C.upsert(design({ pts: ellipse(36, 740, 450) })).id;
  G.trackIdx = C.select(b);
  assert.equal(G.trackIdx, 53);
  C.remove(b);
  assert.equal(G.trackIdx, 0, "the removed selection falls back to index 0, not its successor");
  assert.equal(data.trackId, Tracks.LIST[0].id); assert.equal(data.track, 0);
  G.trackIdx = C.select(c);
  assert.equal(G.trackIdx, 53);
  C.remove(a);
  assert.equal(Tracks.LIST[G.trackIdx].id, c, "a custom ahead of it went: the selection follows its id down one slot");
  assert.equal(G.trackIdx, 52); assert.equal(data.trackId, c); assert.equal(data.track, 52);
  // Without the façade (before game.js hands it over) the stored id is the selection.
  const s2 = boot();
  const x = s2.C.upsert(design({ pts: ellipse(36, 700, 450) })).id, y = s2.C.upsert(design({ pts: ellipse(36, 720, 450) })).id;
  s2.C.select(y);
  s2.C.remove(x);
  assert.equal(s2.data.trackId, y); assert.equal(s2.data.track, 52);
  // EDIT → SAVE after a geometry change replaces the circuit it came from.
  data["ttlb." + c] = [{ t: 80 }];
  const before = C.list().length;
  const r = C.upsert(design({ pts: ellipse(36, 760, 455) }), { replace: c });
  assert.equal(r.ok, true); assert.equal(r.replaced, c); assert.notEqual(r.id, c);
  assert.equal(C.list().length, before, "replaced in place, not duplicated");
  assert.equal(C.get(c), null);
  assert.equal(data["ttlb." + c], undefined, "the old geometry's board goes with it");
  assert.equal(Tracks.LIST[G.trackIdx].id, r.id, "the selection follows the edit");
  assert.equal(data.trackId, r.id);
  // …and a full library still accepts the replacing save.
  for (let i = 0; C.list().length < C.LIMITS.items; i++) C.upsert(design({ pts: ellipse(36, 800 + i * 3, 450) }));
  assert.equal(C.upsert(design({ pts: ellipse(36, 999, 450) })).reason, "full");
  const r2 = C.upsert(design({ pts: ellipse(36, 999, 450) }), { replace: r.id });
  assert.equal(r2.ok, true, "replacing needs no free slot");
  assert.equal(C.list().length, C.LIMITS.items);
});

test("toRaw maps hwZone ARC fractions to INDEX fractions exactly on unequal spacing", () => {
  const { C } = boot();
  // A 1000 × 500 rectangle (perimeter 3000 m) with its control points bunched
  // on the first side: equal-spacing algebra would be badly wrong here.
  const pts = [[0, 0], [50, 0], [100, 0], [1000, 0], [1000, 250], [1000, 500], [500, 500], [0, 500]];
  const f = (a) => C.arcToIndexFrac(pts, a);
  assert.equal(f(0), 0);
  assert.ok(Math.abs(f(1000 / 3000) - 3 / 8) < 1e-12, "the corner at 1000 m is control 3");
  assert.ok(Math.abs(f(0.5) - 5 / 8) < 1e-12, "1500 m is control 5");
  assert.ok(Math.abs(f(550 / 3000) - 2.5 / 8) < 1e-12, "halfway along the 900 m segment 2 → 3");
  assert.ok(Math.abs(f(2750 / 3000) - 7.5 / 8) < 1e-12, "halfway along the closing chord");
  const it = C.sanitize({ name: "rect", pts, hwZones: [{ s0: 1 / 3, s1: 0.5, hw: 6 }] });
  assert.ok(it, "the rectangle is a storable loop");
  const z = C.toRaw(it).hwZones[0];
  assert.ok(Math.abs(z.s0 - 3 / 8) < 1e-4 && Math.abs(z.s1 - 5 / 8) < 1e-4, JSON.stringify(z));
});

test("TIME OF DAY: AUTO keeps the preset; NIGHT lights a day preset; DAY / DUSK un-light a night one (street presets swap city); TREES FEW thins the roadside", () => {
  const { T, C } = boot();
  const withLook = (theme, look) => T.defFields(theme, { theme, look, lengthM: 3400 });
  for (const id of T.ORDER) assert.deepEqual(plain(withLook(id, undefined)), plain(T.defFields(id, { theme: id, lengthM: 3400 })), id + ": no look = the preset");
  // NIGHT on a day preset: night flag, a dark sky, and a lamp where the theme had none.
  const pn = withLook("parkland", { time: "night" });
  assert.equal(pn.night, true);
  assert.notEqual(pn.furniture.lamp, "none", "lamps at night");
  assert.ok(pn.pal.zenith[2] < 0.2, "a night sky");
  assert.equal(withLook("savanna", { time: "night" }).pal.zenith[0], T.defFields("desertnight").pal.zenith[0], "desert presets take the warm night");
  // DAY / DUSK on a night preset.
  const md = withLook("marina", { time: "day" });
  assert.equal(md.night, false); assert.equal(md.theme, "street_day", "a street preset by day gets the day city");
  assert.ok(md.dressingExclusions === undefined, "a 3.4 km lap is under the day city's budget length");
  assert.ok(T.defFields("marina", { theme: "marina", look: { time: "day" }, lengthM: 7000 }).dressingExclusions, "…and a 7 km one thins it like harbour");
  assert.equal(withLook("harbour", { time: "night" }).theme, "street_night");
  const dusk = withLook("desertnight", { time: "dusk" });
  assert.equal(dusk.night, false);
  assert.ok(dusk.pal.sunDir[1] < 0.3, "a low sun");
  assert.equal(withLook("parkland", { time: "day" }).night, false, "DAY on a day preset changes nothing");
  assert.deepEqual(plain(withLook("parkland", { time: "day" })), plain(withLook("parkland", undefined)));
  // TREES FEW → sparse roadside planting.
  assert.equal(withLook("parkland", { trees: "few" }).furniture.sparse, true);
  // Every preset × time builds a palette the factory accepts.
  for (const id of T.ORDER) for (const time of T.LOOK.time) {
    const f = withLook(id, { time });
    assert.ok(["green", "desert", "street_day", "street_night", "modern"].includes(f.theme), id + "/" + time);
    assert.ok(f.pal && Array.isArray(f.pal.grass) && f.pal.grass.every(Number.isFinite), id + "/" + time + " grass");
  }
  // The stored record keeps a look only when it is off default, and the id follows it.
  assert.equal(C.sanitize(design({ look: { time: "auto", trees: "normal", crowd: "normal" } })).look, undefined);
  assert.notEqual(C.sanitize(design({ look: { crowd: "packed" } })).id, C.sanitize(design()).id);
});

test("remove() and a replacing upsert clear the circuit's pose ghost and input ghost with its board", () => {
  const { ctx, C } = boot();
  const cleared = [];
  ctx.Ghost = { clear: (id) => cleared.push("pose:" + id) };
  ctx.InputGhost = { clear: (id) => cleared.push("input:" + id) };
  const a = C.upsert(design({ pts: ellipse(36, 700, 450) })).id;
  const b = C.upsert(design({ pts: ellipse(36, 720, 450) })).id;
  assert.deepEqual(cleared, [], "a plain save clears nothing");
  C.remove(a);
  assert.deepEqual(cleared, ["pose:" + a, "input:" + a], "remove clears both ghosts");
  cleared.length = 0;
  const r = C.upsert(design({ pts: ellipse(36, 760, 455) }), { replace: b });
  assert.equal(r.replaced, b);
  assert.deepEqual(cleared, ["pose:" + b, "input:" + b], "a replacing save clears the OLD geometry's ghosts");
  // A throwing ghost store never blocks the delete; the registry also loads without either module.
  ctx.Ghost = { clear: () => { throw new Error("storage full"); } };
  assert.equal(C.remove(r.id).ok, true);
  delete ctx.Ghost; delete ctx.InputGhost;
  const c = C.upsert(design({ pts: ellipse(36, 780, 450) })).id;
  assert.equal(C.remove(c).ok, true, "no Ghost / InputGhost loaded: nothing to clear");
});

test("sanitize refuses a loop thousands of km long before anything walks it (6.2)", () => {
  // A 5-point star on a 10 km box: each chord ~19 km, ~2,000 km of perimeter in 200 points.
  const star = [];
  for (let i = 0; i < 200; i++) star.push(i % 2 ? [-9990, 9990 - (i % 7)] : [9990, -9990 + (i % 5)]);
  const { C } = boot();
  const t0 = performance.now();
  assert.equal(C.sanitize(design({ pts: star })), null, "strict");
  assert.equal(C.sanitize(design({ pts: star }), { loose: true }), null, "an autosaved draft of it is refused too");
  assert.ok(performance.now() - t0 < 500, "O(points): no centreline is built to decide");
  // The ceiling sits well above a sound design (lenMax 7 km) and below the freeze.
  assert.ok(C.sanitize(design({ pts: ellipse(36, 2000, 1400) })), "a ~11 km polygon is a (red) design, not garbage");
  assert.equal(C.sanitize(design({ pts: ellipse(36, 3000, 2000) })), null, "~16 km: over the strict ceiling");
  assert.ok(C.sanitize(design({ pts: ellipse(36, 3000, 2000) }), { loose: true }), "…but a loose WIP draft may run to the loose one");
  const stored = boot({ customTracks: { v: 1, items: [design({ pts: star }), design()] } });
  assert.equal(stored.Tracks.LIST.filter((t) => t.custom).length, 1, "the stored giant never registers; the sound design does");
});

test("a record's lengthM is kept only when it is near the polygon's; otherwise derived (6.5)", () => {
  const { C } = boot();
  const honest = C.sanitize(design());
  const poly = honest.lengthM;   // no lengthM on the record: the polygon's perimeter
  assert.ok(poly > 3500 && poly < 4500);
  // The designer saves the BUILT lap, a few per cent off the polygon: that value stays.
  const built = Math.round(poly * 0.96);
  assert.equal(C.sanitize(design({ lengthM: built })).lengthM, built, "a sane saved value is kept");
  assert.equal(C.sanitize(design({ lengthM: Math.round(poly * 0.75) })).lengthM, Math.round(poly * 0.75), "…down to 0.75x");
  assert.equal(C.sanitize(design({ lengthM: Math.round(poly * 1.24) })).lengthM, Math.round(poly * 1.24), "…and up to ~1.25x");
  for (const lie of [1, 49, 50000, -5, NaN, "9", Math.round(poly * 0.7), Math.round(poly * 1.3)]) {
    const it = C.sanitize(design({ lengthM: lie }));
    assert.equal(it.lengthM, poly, "an imported lengthM of " + lie + " is replaced by the polygon's");
    assert.equal(C.toRaw(it).lengthKm, Math.round(poly / 100) / 10, "…so the lap count preset sees a real length");
  }
  assert.equal(C.sanitize(design({ lengthM: 1 })).id, honest.id, "and it was never part of the content id");
});

test("one throwing stored record is skipped, not fatal, at eval and on sync (6.6a)", () => {
  // A stub props sanitiser that throws on one record's props: load() isolates it.
  const bad = design({ name: "Bad", seed: 99, props: "boom" });
  const pre = (ctx) => { ctx.TrackDesignerProps = { sanitize(p) { if (p === "boom") throw new Error("props exploded"); return null; } }; };
  const { Tracks } = boot({ customTracks: { v: 1, items: [design({ name: "First" }), bad, design({ name: "Third", seed: 8, pts: ellipse(36, 900, 420) })] } }, pre);
  assert.deepEqual(plain(Tracks.LIST.filter((t) => t.custom).map((t) => t.name)), ["FIRST", "THIRD"], "the good records load");
  // And a record that sanitises but cannot BUILD (toRaw / fromRaw throws) is skipped by sync().
  const { Tracks: T2, ctx, data, C: C2 } = boot({ customTracks: { v: 1, items: [design({ name: "One" }), design({ name: "Two", seed: 5, pts: ellipse(36, 900, 420) })] } });
  assert.equal(T2.LIST.filter((t) => t.custom).length, 2);
  // TrackThemes is frozen, but the registry reads the GLOBAL at call time: swap in a wrapper.
  const real = ctx.TrackThemes;
  let armed = true;
  ctx.TrackThemes = Object.assign({}, real, { sceneryFor(it) { if (armed && it.name === "ONE") throw new Error("scenery exploded"); return real.sceneryFor(it); } });
  assert.equal(C2.sync(), 1, "sync reports what registered");
  assert.deepEqual(plain(T2.LIST.filter((t) => t.custom).map((t) => t.name)), ["TWO"]);
  armed = false;
  assert.equal(C2.sync(), 2, "the skipped record stayed in storage and loads once it can");
  assert.equal(data.customTracks.items.length, 2);
});

test("sanitize refuses a loop thousands of km long (13-F1): strict above loopMax, loose above loopMaxLoose", () => {
  const { C } = boot();
  const star = (R) => {   // 40 points zig-zagging corner to corner at radius R
    const pts = [];
    for (let i = 0; i < 40; i++) pts.push(i % 2 ? [-R + (i % 7) * 100, R - i * 10] : [R - (i % 5) * 100, -R + i * 10]);
    return pts;
  };
  assert.ok(C.LIMITS.loopMax > 7000 && C.LIMITS.loopMaxLoose >= C.LIMITS.loopMax, "the ceiling clears the 7 km lap cap");
  assert.equal(C.sanitize(design({ pts: star(9000) })), null, "a ~990 km zig-zag is refused");
  assert.equal(C.sanitize(design({ pts: star(9000) }), { loose: true }), null, "…also as a draft");
  assert.ok(C.sanitize(design()), "a sound 4 km circuit still passes");
  // A loop sized to land between 14 km and 20 km: scale an ellipse by perimeter.
  const e = (k) => ellipse(36, 760 * k, 480 * k);
  const per = (pts) => pts.reduce((s, p, i) => s + Math.hypot(pts[(i + 1) % pts.length][0] - p[0], pts[(i + 1) % pts.length][1] - p[1]), 0);
  let k = 1; while (per(e(k)) < 16000) k += 0.25;
  assert.ok(per(e(k)) > C.LIMITS.loopMax && per(e(k)) < C.LIMITS.loopMaxLoose);
  assert.equal(C.sanitize(design({ pts: e(k) })), null, "over loopMax: refused for storage");
  assert.ok(C.sanitize(design({ pts: e(k) }), { loose: true }), "…but a red work-in-progress draft restores");
});
