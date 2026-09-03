/* new-hooks-vm.test.mjs — tests/specs/new-hooks.spec.js replayed in the Node
 * VM (tools/lib/game-vm.cjs): the timing(), sectorState(), lapHistory(),
 * fieldState(), aiPlace(), setEnergy(), setLap(), trackProfile() and
 * obs().gear contracts, plus the shared-track-foundation diagnostics
 * (modelDiagnostics / geometryDiagnostics / wallStats / groundY, day and
 * night manifests) — with the SAME assertions and thresholds.
 *
 * Ported: 55 of 56 tests. The eight "before a track is loaded" tests run
 * FIRST against the virgin boot (the VM boots without racing so the pre-race
 * state is observable — every later test races, like the spec's load()).
 * The two Singapore tests and the Shanghai one race day then night on the
 * same boot; TT mode goes through __apex.tt() with the same wait the harness
 * uses for race(). The Jeddah test reads `Tracks.LIST` from the VM sandbox as
 * the browser reads the page global.
 * Not portable: "Madrid track foundation migration › owns safe grounded
 * scenery…" — the hidden ~300 s foundation test (test.setTimeout(300000) at
 * the spec's line 793), deliberately left in the browser.
 *
 * The browser spec stays the truth until CI has run this twin.
 * Run: node --test tests/unit/new-hooks-vm.test.mjs   (~30 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const closeTo = (r, e, d, m) => assert.ok(Math.abs(e - r) < Math.pow(10, -d) / 2, m || `${r} not within 10^-${d}/2 of ${e}`);
const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);
const gte = (a, b, m) => assert.ok(a >= b, m || `${a} >= ${b}`);
const lte = (a, b, m) => assert.ok(a <= b, m || `${a} <= ${b}`);
const isNum = (v, m) => assert.equal(typeof v, "number", m);
// VM objects have the VM realm's prototypes: strict deepEqual sees a "not
// reference-equal" Array.prototype. Compare plain-data copies instead.
const host = (v) => JSON.parse(JSON.stringify(v));
const deepEq = (a, b, m) => assert.deepEqual(host(a), host(b), m);
// expect(arr).toEqual(expect.arrayContaining(items)): every item deep-equals a member.
const arrayContaining = (arr, items, m) => {
  for (const it of items) assert.ok(host(arr).some((x) => isDeepStrictEqual(x, host(it))), (m ? m + ": " : "") + `missing ${JSON.stringify(it)}`);
};

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });
after(() => { if (g) g.close(); });

// The spec's load(): race(id), go() (the harness's race() does), jump so
// obs()/physState() have a world position.
async function load(trackId = "monza") {
  await g.race(trackId);
  g.apex.go();
  g.apex.jump(0.1, 40, 0);
}
// __apex.tt() with the harness's own race() wait: startRace() is async and a
// new cars[] identity is the tell that it ran to completion for THIS call.
async function loadTT(trackId) {
  const carsBefore = g.G.cars;
  const r = g.apex.tt(trackId);
  assert.ok(r, "tt() refused the circuit");
  const ok = await g.settle(() => g.apex.info().track === r.track && g.G.cars !== carsBefore, 4000);
  assert.ok(ok, "tt(): track never built");
  g.apex.go();
}

// ── before any race: the virgin-page tests ──────────────────────────────────

test("timing() returns null before a track is loaded", () => {
  assert.equal(g.apex.timing(), null);
});

test("sectorState() returns null before a track is loaded", () => {
  assert.equal(g.apex.sectorState(), null);
});

test("lapHistory() returns null before a track is loaded", () => {
  assert.equal(g.apex.lapHistory(), null);
});

test("fieldState() returns null before a track is loaded", () => {
  assert.equal(g.apex.fieldState(), null);
});

test("aiPlace() returns false before a track is loaded", () => {
  assert.equal(g.apex.aiPlace(0, 0.5), false);
});

test("setEnergy() returns false before a track is loaded", () => {
  assert.equal(g.apex.setEnergy(0.5), false);
});

test("setLap() returns false before a track is loaded", () => {
  assert.equal(g.apex.setLap(3), false);
});

test("trackProfile() works on the default track loaded at startup (no race() call)", () => {
  const pts = g.apex.trackProfile(10);
  assert.ok(Array.isArray(pts));
  assert.equal(pts.length, 10);
});

// ── timing() ────────────────────────────────────────────────────────────────

test("timing() returns an object with all expected fields", async () => {
  await load();
  const t = g.apex.timing();
  for (const k of ["raceT", "lapTime", "lap", "pos", "total", "energy", "gear", "sector", "sectorElapsed"]) isNum(t[k], k);
  assert.equal(t.best === null || typeof t.best === "number", true);
  assert.equal(t.lastLap === null || typeof t.lastLap === "number", true);
  assert.equal(t.gapAhead === null || typeof t.gapAhead === "number", true);
  assert.equal(t.gapBehind === null || typeof t.gapBehind === "number", true);
});

test("timing().pos is between 1 and total", async () => {
  await load();
  const t = g.apex.timing();
  gte(t.pos, 1); lte(t.pos, t.total); gt(t.total, 1);
});

test("timing().sector is 1, 2, or 3", async () => {
  await load();
  assert.ok([1, 2, 3].includes(g.apex.timing().sector));
});

test("timing().gear is between 1 and 8", async () => {
  await load();
  const t = g.apex.timing();
  gte(t.gear, 1); lte(t.gear, 8);
});

test("timing().energy is between 0 and 1", async () => {
  await load();
  const t = g.apex.timing();
  gte(t.energy, 0); lte(t.energy, 1);
});

test("timing().raceT advances after stepping physics", async () => {
  await load();
  const before = g.apex.timing().raceT;
  g.apex.step(1 / 60, 30);
  gt(g.apex.timing().raceT, before);
});

// ── sectorState() ───────────────────────────────────────────────────────────

test("sectorState() returns idx, elapsed, bests, last", async () => {
  await load();
  const s = g.apex.sectorState();
  assert.ok([0, 1, 2].includes(s.idx));
  gte(s.elapsed, 0);
  assert.ok(Array.isArray(s.bests)); assert.equal(s.bests.length, 3);
  assert.ok(Array.isArray(s.last)); assert.equal(s.last.length, 3);
});

test("sectorState() bests are null before first lap completes", async () => {
  await load();
  g.apex.jump(0.01, 0, 0);
  for (const b of g.apex.sectorState().bests) assert.equal(b === null || typeof b === "number", true);
});

test("sector index is 0 in S1 and 1 in S2", async () => {
  await load();
  const sec = g.apex.info().sectors || [1 / 3, 2 / 3];
  const s1 = sec[0], s2 = sec[1];
  g.apex.jump(s1 * 0.5, 40, 0);
  g.apex.step(1 / 60, 3);
  assert.equal(g.apex.sectorState().idx, 0);
  g.apex.jump((s1 + s2) * 0.5, 40, 0);
  g.apex.step(1 / 60, 3);
  assert.equal(g.apex.sectorState().idx, 1);
});

// ── lapHistory() ────────────────────────────────────────────────────────────

test("lapHistory() returns mode, laps, best, lastLap in race mode", async () => {
  await load();
  const h = g.apex.lapHistory();
  assert.equal(h.mode, "race");
  assert.ok(Array.isArray(h.laps));
  assert.equal(h.best === null || typeof h.best === "number", true);
  assert.equal(h.lastLap === null || typeof h.lastLap === "number", true);
});

test("TT mode has mode:'tt'", async () => {
  await loadTT("monza");
  const h = g.apex.lapHistory();
  assert.equal(h.mode, "tt");
  assert.ok(Array.isArray(h.laps));
});

// ── fieldState() ─────────────────────────────────────────────────────────────

test("fieldState() returns an array with one entry per car", async () => {
  await load();
  const field = g.apex.fieldState();
  assert.ok(Array.isArray(field));
  gt(field.length, 1);
});

test("fieldState() entries have required fields", async () => {
  await load();
  for (const c of g.apex.fieldState()) {
    isNum(c.pos); isNum(c.id);
    assert.equal(typeof c.name, "string");
    assert.equal(typeof c.code, "string");
    assert.equal(typeof c.isPlayer, "boolean");
    isNum(c.lap); isNum(c.frac); isNum(c.speed); isNum(c.gap);
    assert.equal(typeof c.finished, "boolean");
  }
});

test("fieldState(): exactly one entry is the player", async () => {
  await load();
  assert.equal(g.apex.fieldState().filter((c) => c.isPlayer).length, 1);
});

test("fieldState(): pos is sequential 1..n and leader has gap 0", async () => {
  await load();
  const field = g.apex.fieldState();
  assert.equal(field[0].pos, 1);
  assert.equal(field[0].gap, 0);
  for (let i = 0; i < field.length; i++) assert.equal(field[i].pos, i + 1);
});

test("fieldState(): frac values are in [0, 1)", async () => {
  await load();
  for (const c of g.apex.fieldState()) { gte(c.frac, 0); lt(c.frac, 1); }
});

// ── aiPlace() ───────────────────────────────────────────────────────────────

test("aiPlace() returns false when called on the player car", async () => {
  await load();
  const cars = g.apex.cars();
  const pi = cars.findIndex((c) => c.p);
  assert.equal(g.apex.aiPlace(pi, 0.5), false);
});

test("aiPlace() returns false for out-of-range index", async () => {
  await load();
  assert.equal(g.apex.aiPlace(999, 0.5), false);
});

test("aiPlace() places an AI car at the specified fraction", async () => {
  await load();
  const cars = g.apex.cars();
  const ai = cars.find((c) => !c.p);
  const result = g.apex.aiPlace(cars.indexOf(ai), 0.6, 40, 0);
  assert.notEqual(result, false);
  closeTo(result.frac, 0.6, 1);
  closeTo(result.speed, 40, 0);
  closeTo(result.x, 0, 1);
});

test("aiPlace() result is reflected in fieldState", async () => {
  await load();
  const cars = g.apex.cars();
  const ai = cars.find((c) => !c.p);
  g.apex.aiPlace(cars.indexOf(ai), 0.8, 50, 0);
  const fracs = g.apex.fieldState().map((c) => c.frac);
  assert.equal(fracs.some((f) => Math.abs(f - 0.8) < 0.05), true);
});

// ── setEnergy() ─────────────────────────────────────────────────────────────

test("setEnergy() sets energy to the given value", async () => {
  await load();
  closeTo(g.apex.setEnergy(0.42).energy, 0.42, 2);
  closeTo(g.apex.obs().energy, 0.42, 2);
});

test("setEnergy() clamps to 0", async () => {
  await load();
  assert.equal(g.apex.setEnergy(-5).energy, 0);
});

test("setEnergy() clamps to 1", async () => {
  await load();
  assert.equal(g.apex.setEnergy(99).energy, 1);
});

test("energy is visible in timing() after setEnergy()", async () => {
  await load();
  g.apex.setEnergy(0.25);
  closeTo(g.apex.timing().energy, 0.25, 2);
});

// ── setLap() ────────────────────────────────────────────────────────────────

test("setLap() sets the player lap counter", async () => {
  await load();
  assert.equal(g.apex.setLap(4).lap, 4);
  assert.equal(g.apex.physState().lap, 4);
});

test("setLap() clamps negative to 0", async () => {
  await load();
  assert.equal(g.apex.setLap(-1).lap, 0);
});

test("setLap() floors fractional input", async () => {
  await load();
  assert.equal(g.apex.setLap(2.9).lap, 2);
});

test("lap change is visible in timing()", async () => {
  await load();
  g.apex.setLap(5);
  assert.equal(g.apex.timing().lap, 5);
});

// ── trackProfile() ──────────────────────────────────────────────────────────

test("trackProfile() default returns 100 entries", async () => {
  await load();
  assert.equal(g.apex.trackProfile().length, 100);
});

test("trackProfile() respects custom n", async () => {
  await load();
  assert.equal(g.apex.trackProfile(36).length, 36);
});

test("trackProfile() clamps n to max 1000", async () => {
  await load();
  assert.equal(g.apex.trackProfile(9999).length, 1000);
});

test("trackProfile() entries have frac, y, k, hw, slope", async () => {
  await load();
  for (const p of g.apex.trackProfile(10)) for (const k of ["frac", "y", "k", "hw", "slope"]) isNum(p[k], k);
});

test("trackProfile() fracs run from 0 up to just below 1", async () => {
  await load();
  const pts = g.apex.trackProfile(50);
  closeTo(pts[0].frac, 0, 3);
  lt(pts[pts.length - 1].frac, 1);
});

test("trackProfile(): all y values are finite numbers", async () => {
  await load();
  for (const p of g.apex.trackProfile(100)) assert.ok(isFinite(p.y));
});

test("trackProfile(): hw (half-width) is positive everywhere", async () => {
  await load();
  for (const p of g.apex.trackProfile(100)) gt(p.hw, 0);
});

test("Spa has measurable elevation change (>10 m)", async () => {
  await load("spa");
  const pts = g.apex.trackProfile(360);
  const maxY = Math.max(...pts.map((p) => p.y));
  const minY = Math.min(...pts.map((p) => p.y));
  gt(maxY - minY, 10);
});

test("Shanghai stays flat-by-F1-standards, with a real back-straight crest", async () => {
  await load("shanghai");
  const pts = g.apex.trackProfile(400);
  const at = (frac) => pts.reduce((best, point) =>
    Math.abs(point.frac - frac) < Math.abs(best.frac - frac) ? point : best);
  const minY = Math.min(...pts.map((point) => point.y));
  const maxY = Math.max(...pts.map((point) => point.y));
  const range = maxY - minY;
  // Racing fractions after 7a17351's start-line move — see the browser spec.
  const firstBumpRise = at(0.1495).y - minY;
  const backStraightCrestRise = at(0.3895).y - minY;
  gte(range, 5.5);
  lte(range, 7.5);
  gt(firstBumpRise, 0.35);
  gt(backStraightCrestRise, 0.35);
});

// ── obs().gear ──────────────────────────────────────────────────────────────

test("obs().gear field is present and in 1-8 range", async () => {
  await load();
  const obs = g.apex.obs();
  assert.notEqual(obs, null);
  isNum(obs.gear);
  gte(obs.gear, 1); lte(obs.gear, 8);
});

test("obs().gear matches timing().gear", async () => {
  await load();
  assert.equal(g.apex.obs().gear, g.apex.timing().gear);
});

test("gear increases at high speed after stepping physics", async () => {
  await load();
  g.apex.jump(0.05, 80, 0);
  g.apex.setInput({ steer: 0, throttle: true, brake: false });
  g.apex.step(1 / 60, 120);  // ~2 s
  g.apex.clearInput();
  gte(g.apex.obs().gear, 4);
});

// ── shared track foundation diagnostics ─────────────────────────────────────

const hardRequired = (m) => [...m.invalid, ...m.suppressed, ...m.unsafe].filter((entry) => entry.required);

test("Silverstone uses grounded required landmarks and airfield-scale terrain", async () => {
  await load("silverstone");
  const A = g.apex;
  const profile = A.trackProfile(400);
  const peak = profile.reduce((a, b) => b.y > a.y ? b : a);
  const trough = profile.reduce((a, b) => b.y < a.y ? b : a);
  const ground = [0.04, 0.12, 0.45, 0.55, 0.85].flatMap((frac) =>
    [-30, 0, 30].map((lat) => ({ lat, sample: A.groundY(frac, lat) })));
  const walls = A.wallStats();
  const models = A.modelDiagnostics();
  const geometry = A.geometryDiagnostics();
  const elevationRange = peak.y - trough.y;

  gte(elevationRange, 10);
  lte(elevationRange, 20);
  lt(Math.abs(peak.frac - 0.265), 0.03);
  lt(Math.abs(trough.frac - 0.6975), 0.03);
  assert.equal(ground.every(({ lat, sample }) =>
    (lat === 0 || sample.terrainY != null) && (sample.gap == null || sample.gap <= 0.18)), true);
  assert.equal(walls.anyNaN, false);
  gt(walls.tightFrac, 0.15);
  assert.equal(geometry.every((entry) => entry.ok), true);

  const requiredIds = models.emitted.filter((entry) => entry.required).map((entry) => entry.id);
  arrayContaining(requiredIds, ["silverstone-control-tower", "silverstone-start-gantry"]);
  const wingSegments = models.emitted.filter((entry) => entry.id.startsWith("silverstone-wing-facade-"));
  deepEq(wingSegments.map((entry) => entry.id), [
    "silverstone-wing-facade-1", "silverstone-wing-facade-2",
    "silverstone-wing-facade-3", "silverstone-wing-facade-4",
  ]);
  assert.equal(wingSegments.every((entry) => entry.required && entry.vertices >= 96), true);
  deepEq(hardRequired(models), []);
  for (const span of models.emitted.filter((entry) => entry.overhead)) gte(span.clearance, 4.8);
});

test("reports finite geometry and structured model outcomes", async () => {
  await load("cota");
  const geometry = g.apex.geometryDiagnostics();
  const models = g.apex.modelDiagnostics();
  gt(geometry.length, 5);
  assert.equal(geometry.every((entry) => entry.ok), true);
  for (const k of ["emitted", "suppressed", "invalid", "unsafe"]) assert.ok(Array.isArray(models[k]), k);
  deepEq(hardRequired(models), []);
  for (const span of models.emitted.filter((entry) => entry.overhead)) gte(span.clearance, 4.8);
});

test("Miami emits validated water, grouped heroes, and safe overpasses", async () => {
  await load("miami");
  const A = g.apex;
  const geometry = A.geometryDiagnostics();
  const models = A.modelDiagnostics();
  const profile = A.trackProfile(240);
  const walls = A.wallStats();
  const groundGaps = [0.20, 0.42, 0.66].flatMap((frac) => [-6, 0, 6].map((lat) => A.groundY(frac, lat).gap));
  assert.equal(geometry.every((entry) => entry.ok), true);
  deepEq(hardRequired(models), []);
  const ids = new Set(models.emitted.map((entry) => entry.id));
  for (const id of [
    "beach-club-sand", "beach-club-pool", "beach-club-cabana",
    "mia-marina-water-0", "mia-marina-water-1", "mia-marina-water-2",
    "msc-yacht-club",
  ]) assert.equal(ids.has(id), true, id);
  const spans = models.emitted.filter((entry) => entry.id.startsWith("turnpike-overpass-"));
  assert.equal(spans.length, 2);
  assert.equal(spans.every((entry) => entry.overhead && entry.clearance >= 4.8), true);
  const peak = profile.reduce((best, point) => point.y > best.y ? point : best);
  lt(Math.abs(peak.frac - 0.8583), 0.04);
  gt(peak.y, 3);
  gt(walls.tightFrac, 0.35);
  assert.equal(groundGaps.every((gap) => gap === null || gap <= 0.18), true);
});

test("Jeddah declares its migrated waterfront foundation contracts", async () => {
  await load("jeddah");
  const A = g.apex;
  const def = g.sandbox.Tracks.LIST.find((entry) => entry.id === "jeddah");
  const profile = A.trackProfile(360);
  const terrainGaps = [];
  for (let i = 0; i < 72; i++) {
    for (const lat of [-6, -3, 0, 3, 6]) {
      const gap = A.groundY(i / 72, lat).gap;
      if (gap != null) terrainGaps.push(gap);
    }
  }
  const elevationRange = Math.max(...profile.map((entry) => entry.y)) - Math.min(...profile.map((entry) => entry.y));
  const walls = A.wallStats();
  const geometry = A.geometryDiagnostics();
  const models = A.modelDiagnostics();

  assert.equal(def.sceneryCoordinates, "racing");
  assert.equal(def.terrainOuter, 28);
  arrayContaining(def.dressingExclusions, [
    { kind: "city", s0: 0.05, s1: 0.66, side: 1 },
    { kind: "lamps", s0: 0, s1: 1 },
    { kind: "foliage", s0: 0.05, s1: 0.66, side: 1 },
  ]);
  lte(elevationRange, 3);
  lte(Math.max(...terrainGaps), 0.18);
  gt(walls.tightFrac, 0.99);
  gte(walls.minOverHw, 0);
  assert.equal(geometry.every((entry) => entry.ok), true);
  gt(geometry.find((entry) => entry.name === "water")?.vertices, 0);
  const required = models.emitted.filter((entry) => entry.required).map((entry) => entry.id);
  arrayContaining(required, ["jeddah-fountain", "jeddah-floating-mosque", "jeddah-flagpole"]);
  deepEq(hardRequired(models), []);
  const overhead = models.emitted.filter((entry) => entry.overhead);
  assert.equal(overhead.length, 2);
  for (const span of overhead) gte(span.clearance, 4.8);
});

test("night rebuilds expose a distinct validated props manifest", async () => {
  await g.race("singapore", "day", "dry");
  const day = g.apex.geometryDiagnostics().find((entry) => entry.name === "props").vertices;
  await g.race("singapore", "night", "dry");
  const night = g.apex.geometryDiagnostics().find((entry) => entry.name === "props").vertices;
  gt(day, 0);
  gt(night, 0);
  assert.notEqual(night, day);
});

test("Singapore migration keeps models, walls, terrain, and elevation intentional", async () => {
  const A = g.apex;
  await g.race("singapore", "day", "dry");
  const day = { geometry: A.geometryDiagnostics(), models: A.modelDiagnostics() };
  await g.race("singapore", "night", "dry");
  const geometry = A.geometryDiagnostics();
  const models = A.modelDiagnostics();
  const profile = A.trackProfile(720);
  const low = profile.reduce((a, b) => b.y < a.y ? b : a);
  const high = profile.reduce((a, b) => b.y > a.y ? b : a);
  const terrainGaps = [];
  for (let i = 0; i < 120; i++) for (const lat of [-6, 0, 6]) terrainGaps.push(A.groundY(i / 120, lat).gap);
  const walls = A.wallStats();
  const props = geometry.find((entry) => entry.name === "props")?.vertices;

  assert.equal(day.geometry.every((entry) => entry.ok), true);
  deepEq(day.models.invalid, []);
  deepEq(day.models.suppressed, []);
  deepEq(day.models.unsafe, []);
  assert.equal(geometry.every((entry) => entry.ok), true);
  gt(props, 0);
  lt(props, 1_050_000);
  deepEq(models.invalid, []);
  deepEq(models.suppressed, []);
  deepEq(models.unsafe, []);
  const emitted = new Set(models.emitted.map((entry) => entry.id));
  for (const id of [
    "marina-bay-sands", "marina-water-30", "marina-water-84",
    "sheares-deck-0", "finish-underpass-deck-2", "start-light-cluster",
  ]) assert.equal(emitted.has(id), true, id);
  for (const span of models.emitted.filter((entry) => entry.overhead)) gte(span.clearance, 4.8);
  assert.equal(walls.tightFrac, 1);
  gte(walls.minOverHw, 0);
  assert.equal(terrainGaps.every((gap) => gap === null || gap <= 0.18), true);
  gt(high.y - low.y, 4);
  lt(high.y - low.y, 6);
  closeTo(low.frac, 0.10, 1);
  closeTo(high.frac, 0.62, 1);
});

test("Shanghai declares safe required heroes and reflective water", async () => {
  await load("shanghai");
  const A = g.apex;
  const inspect = () => ({
    models: A.modelDiagnostics(),
    geometry: A.geometryDiagnostics(),
    walls: A.wallStats(),
    ground: [0, 0.06, 0.30, 0.62, 0.90].flatMap((frac) => [-6, 0, 6].map((lat) => A.groundY(frac, lat).gap)),
  });
  const day = inspect();
  await g.race("shanghai", "night", "dry");
  const sessions = { day, night: inspect() };
  for (const [time, state] of Object.entries(sessions)) {
    const diagnostics = state.models;
    const emitted = new Map(diagnostics.emitted.map((entry) => [entry.id, entry]));
    for (const id of ["shanghai-wing-east", "shanghai-wing-west", "shanghai-pudong"])
      assert.equal(emitted.get(id)?.required, true, `${time}: ${id}`);
    assert.equal([...emitted.values()].filter((entry) => entry.overhead && entry.id.startsWith("shanghai-wing-")).length, 2);
    for (const id of ["shanghai-yu-lake-south", "shanghai-yu-lake-north", "shanghai-marsh-pool"])
      assert.equal(emitted.get(id)?.water, true, `${time}: ${id}`);
    deepEq(hardRequired(diagnostics), []);
    assert.equal(state.geometry.every((entry) => entry.ok), true);
    assert.equal(state.walls.anyNaN, false);
    gt(state.walls.minB, 1);
    lt(state.walls.maxB, 60);
    gt(state.walls.minOverHw, -1.5);
    assert.equal(state.ground.every((gap) => gap == null || gap <= 0.18), true);
  }
});
