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
function boot(stored = {}) {
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
  assert.deepEqual(plain(it.hwZones), [{ s0: g(0.5), s1: g(0.9), hw: 3 }, { s0: g(0.1), s1: g(0.2), hw: 6, ease: 0.2 }],
    "fractions wrap onto the u16 grid, hw and ease clamp, junk rows drop — repair over discard where the geometry is sound");
  assert.deepEqual(plain(it.bankZones), [{ frac: g(0.3), angleDeg: 30, widthM: 20 }], "bank angle and width clamp to their limits");
  assert.deepEqual(plain(it.elevations), [{ s: g(0.5), halfM: 20, rise: 1 }], "a 1e9 m spike over 40 m is held to the 8 % grade cap (halfM / 19.6, on the 0.25 m rise grid)");
  assert.equal(it.bridges, null, "null stays null");
  assert.deepEqual(plain(it.turns), [g(0.1), g(0.25)], "turns wrap to [0,1) on the fraction grid");
  assert.ok(it.lengthM > 3000, "a missing lengthM is recomputed from the chord");
  assert.equal(C.sanitize(null), null);
  assert.equal(C.sanitize({ pts: [[0, 0]] }), null);
  Tracks.buildCenterline(d);   // and it still builds
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
  assert.deepEqual(plain(raw.hwZones), [{ s0: 18 / 36, s1: 22 / 36, hw: 5 }], "arc fractions snap to the control grid (applyHwZones keys i/N)");
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
  assert.match(src, /filter === "season" && \(t\.classic \|\| t\.custom\)/, "SEASON hides customs");
  assert.match(src, /filter === "custom" && !t\.custom/, "MY CIRCUITS shows only customs");
  assert.match(src, /trb trb-custom/, "the CUSTOM badge");
  assert.match(read("css/menus.css"), /\.trb-custom \{/, "…styled");
  assert.match(read("js/career/season-ui.js"), /!t\.custom && !used\.has/, "the season shelf never offers a custom");
  assert.match(read("js/net/lobby.js"), /Tracks\.LIST\[d\.track\]\.custom\) return null/, "the guest refuses a custom index");
  assert.match(read("js/game.js"), /def\.scenery \|\| sceneryResident/, "ensureScenery fetches nothing for an inline closure");
});
