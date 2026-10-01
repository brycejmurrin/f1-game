// track-def-factory — js/track/core/def.js (TrackDef) is the ONE path from an
// authored circuit def to a Tracks.LIST entry, for the 52 script-tag circuits
// and for a runtime def alike (the track designer's js/editor/custom-tracks.js).
//
// It was carved out of js/track/tracks.js verbatim (dayPal/nightPal,
// elevationAt/hasRealElevation, realPoints/applyHwZones, the LIST mapper and
// materializeListPoints). The move is only safe if every circuit builds to the
// same bytes it did before, so this pins a golden hash per circuit — metadata
// plus the MATERIALISED points (startFrac / reverse / hwZones remaps) — captured
// from the pre-extraction tree (tests/data/def-factory-golden.json). A change
// here means every circuit's road moved: re-capture the golden deliberately, in
// the commit that means it, and say why.
//
// Run: node --test tests/unit/track-def-factory.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));
const GOLDEN = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/def-factory-golden.json"), "utf8")).hashes;

// The exact canon the capture script used: every enumerable non-function field
// except `points` (hashed separately, materialised) and `custom` (added by the
// extraction; the golden predates it and a runtime flag is not geometry).
function hashEntry(d) {
  const pts = d.points;
  const meta = {};
  for (const k of Object.keys(d)) { const v = d[k]; if (k === "points" || k === "custom" || typeof v === "function") continue; meta[k] = v; }
  const canon = JSON.stringify({ meta, pts: pts.map((p) => p.map((v) => +v.toFixed(6))) });
  return crypto.createHash("sha256").update(canon).digest("hex").slice(0, 16);
}

// A synthetic closed loop the way the designer stores one: [x, z] metres,
// ~40 control points, ~4.1 km, nothing a script tag ever authored.
function ellipsePath(n = 40, a = 800, b = 500) {
  const pts = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; pts.push([+(a * Math.cos(t)).toFixed(2), +(b * Math.sin(t)).toFixed(2)]); }
  let len = 0;
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; len += Math.hypot(q[0] - p[0], q[1] - p[1]); }
  return { len: Math.round(len), pts };
}

test("every shipped circuit builds to the bytes it built to before the factory moved", () => {
  const Tracks = buildContext(undefined, { quiet: true });
  const ctx = Tracks._vmContext;
  assert.equal(typeof ctx.TrackDef, "object", "js/track/core/def.js must define TrackDef in the TRACK_VM context");
  assert.equal(typeof ctx.TrackDef.fromRaw, "function");
  const bad = [];
  for (const d of Tracks.LIST) {
    if (!(d.id in GOLDEN)) { bad.push(`${d.id}: no golden row`); continue; }
    const h = hashEntry(d);
    if (h !== GOLDEN[d.id]) bad.push(`${d.id}: ${h} != golden ${GOLDEN[d.id]}`);
  }
  assert.deepEqual(bad, [], "a LIST entry no longer matches the pre-extraction golden — the def factory changed how that circuit builds");
  assert.equal(Object.keys(GOLDEN).length, Tracks.LIST.filter((t) => !t.custom).length, "golden rows == shipped circuits");
});

test("fromRaw IS the LIST mapper: the same raw def yields the same entry", () => {
  const Tracks = buildContext(undefined, { quiet: true });
  const ctx = Tracks._vmContext;
  const raw = ctx.TrackDefs.find((d) => d.id === "suzuka");   // startFrac + bridges + hwZones: the remap-heavy one
  const again = ctx.TrackDef.fromRaw(raw);
  const built = Tracks.LIST.find((t) => t.id === "suzuka");
  assert.deepEqual(Object.keys(again).sort(), Object.keys(built).sort(), "same key set");
  assert.equal(hashEntry(again), hashEntry(built), "same metadata and materialised points");
  assert.equal(again.custom, false);
});

test("a runtime def (no script tag, no scenery file) builds a centreline through the same factory", () => {
  const Tracks = buildContext(undefined, { quiet: true });
  const { TrackDef } = Tracks._vmContext;
  const path40 = ellipsePath();
  const marker = [];
  const def = TrackDef.fromRaw({
    id: "custom-test0001", custom: true, name: "TEST LOOP", gp: "TEST LOOP GP", country: "",
    theme: "green", night: false, lengthKm: 4.1, baseHW: 7,
    pal: { grass: [0.2, 0.4, 0.2] },
    path: path40, startFrac: 0, sceneryCoordinates: "racing",
    hwZones: [{ s0: 0.25, s1: 0.35, hw: 5.5, ease: 0.02 }],
    elevations: [{ s: 0.6, halfM: 150, rise: 6 }],
    turns: [0.25, 0.5, 0.75],
    scenery: (api) => { marker.push(api && api.def && api.def.id); },
  });
  assert.equal(def.custom, true);
  assert.equal(def.classic, false);
  assert.ok(Number.isFinite(def.gpLaps) && def.gpLaps > 10, "gpLaps derives from lengthKm");
  assert.deepEqual(JSON.parse(JSON.stringify(def.palette.grass)), [0.2, 0.4, 0.2], "pal merges over dayPal defaults");
  assert.ok(Array.isArray(def.palette.kerbA), "…which supply the rest");
  assert.equal(typeof def.scenery, "function", "an inline closure rides the def (build-props resolves def.scenery before the registry)");
  // Points materialise lazily from `path`, then the hwZone narrows its window.
  const pts = def.points;
  assert.equal(pts.length, 40);
  assert.ok(pts.every((p) => p.length === 5 && p.every(Number.isFinite)));
  assert.equal(pts[0][3], 7, "baseHW outside the window");
  assert.ok(pts[12][3] < 6, "hwZone 0.25–0.35 narrows index 12/40");
  assert.deepEqual(JSON.parse(JSON.stringify(def.elevations)), [{ s: 0.6, halfM: 150, rise: 6 }], "no startFrac → no remap");
  const tr = Tracks.buildCenterline(def);
  assert.ok(Math.abs(tr.total - path40.len) / path40.len < 0.03, `total ${tr.total} ≈ chord length ${path40.len}`);
  assert.ok(tr.n >= 200 && tr.curv.length === tr.n);
  let kmax = 0; for (let i = 0; i < tr.n; i++) kmax = Math.max(kmax, Math.abs(tr.curv[i]));
  assert.ok(kmax > 1 / 400 && kmax < 1 / 150, `an 800x500 ellipse peaks near 1/312 m⁻¹ (got 1/${(1 / kmax).toFixed(0)})`);
  assert.equal(marker.length, 0, "buildCenterline never runs scenery (that is build())");
});

test("a def without a path still fails loudly, naming the circuit", () => {
  const Tracks = buildContext(undefined, { quiet: true });
  const { TrackDef } = Tracks._vmContext;
  const def = TrackDef.fromRaw({ id: "custom-nopath", custom: true, name: "X", theme: "green", baseHW: 7 });
  assert.throws(() => def.points, /custom-nopath.*no `path`/);
});
