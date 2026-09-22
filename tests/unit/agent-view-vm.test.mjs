/* agent-view-vm.test.mjs — tests/specs/agent-view.spec.js replayed in the Node
 * VM (tools/lib/game-vm.cjs): the agent world view (js/agent/agentview.js +
 * agentview-raster.js) — world() typed errors, detail levels, look-ahead,
 * rivals, field(), road shape, atmosphere(), describe()/query(), delta mode,
 * the trackInfo() corner table, previously-invisible state, objective(),
 * nextCorner, render({what:"view"|"map"|"circuit"|"car"}), carView(), survey(),
 * rollout(), agentHelp(), scene(), scene({visible}) and terminal() — with the
 * SAME assertions and thresholds as the browser spec.
 *
 * Ported: 116 of 117 tests. The browser spec runs on `sharedTest` (one page
 * per worker), whose fixture resets clearInput / headless(false) /
 * logLevel("warn") / freeze(false) / camera("chase") before EVERY test —
 * fresh() below is that reset verbatim, and every load() runs it first (the
 * shipped camMode default is COCKPIT, index 3, so without the reset the live
 * frame never paints the player). The nine boot-only tests run FIRST against
 * the virgin boot (the VM boots without racing, so the pre-race state is
 * observable), then the one race-without-go test, then everything else races
 * like the spec's load(). `Parts` is read from the VM sandbox as the browser
 * reads the page global.
 * The spec's renderFrames() = snapCam() + ten requestAnimationFrame ticks; the
 * VM never pumps rAF on its own, so renderFrames() here drives the queued
 * tick through g.pumpFrame(now) with a SYNTHETIC 50 ms clock. Why a fixed
 * cadence and not the host clock: the live chase camera converges by
 * exponential damping per frame and game.js's tickBody() hands render() at
 * most 1/20 s of dt, so every cadence >= 50 ms is one camera regime — the one
 * SwiftShader's 50-150 ms frames put the browser in — whereas back-to-back
 * pumps on the host clock (~18 ms here) leave a 2.5 m camera lag the browser
 * never sees, and "the road dominates the lower frame" then measured 0.25
 * against its > 0.7 (measured: 1.00 at 16.7/33/50/100/150 ms, 0.25 on the
 * host clock).
 * Not portable: "visible() › reports scenery chunks inside the camera
 * frustum" — it reads the GLX renderer's chunk index (`track.meshes.props
 * .chunks`, built by js/render/glx/chunked.js against live GL buffers) and
 * GLX.aabbInFrustum; the harness stubs GLX, so the index does not exist and
 * the cull test passes everything. Deliberately left in the browser.
 * game-vm exposes no viewport option (the GLX stub is 1280x720, aspect 1.78,
 * where the spec pins LANDSCAPE 844x390): every aspect-sensitive assertion
 * here compares payload-internal values, and with the stub's aspect getter
 * forced to 2.16 every frame threshold held at the same cadence (road 40.5 %,
 * lower-rows 1.00, player 6.6 %, behind-corner bearing 109.5 deg against the
 * spec's own "~108 deg" note), so the viewport is not load-bearing.
 *
 * The browser spec stays the truth until CI has run this twin.
 * Run: node --test tests/unit/agent-view-vm.test.mjs   (~30 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

// Playwright's toBeCloseTo(expected, digits): |e - r| < 10^-digits / 2.
const closeTo = (r, e, d, m) => assert.ok(Math.abs(e - r) < Math.pow(10, -d) / 2, m || `${r} not within 10^-${d}/2 of ${e}`);
const gt = (a, b, m) => assert.ok(a > b, m || `${a} > ${b}`);
const lt = (a, b, m) => assert.ok(a < b, m || `${a} < ${b}`);
const gte = (a, b, m) => assert.ok(a >= b, m || `${a} >= ${b}`);
const lte = (a, b, m) => assert.ok(a <= b, m || `${a} <= ${b}`);
const isNum = (v, m) => assert.equal(typeof v, "number", m);
const truthy = (v, m) => assert.ok(v, m || `${JSON.stringify(v)} is not truthy`);
// expect(str).toContain(sub) / expect(arr).toContain(v)
const contains = (c, v, m) => assert.ok(c != null && c.includes(v), m || `${JSON.stringify(c)} does not contain ${JSON.stringify(v)}`);
// expect(obj).toHaveProperty(k) — the key exists, whatever its value.
const hasProp = (o, k, m) => assert.ok(o != null && k in Object(o), m || `${k} missing`);
// VM objects have the VM realm's prototypes: strict deepEqual sees a "not
// reference-equal" Array.prototype. Compare plain-data copies instead.
const host = (v) => JSON.parse(JSON.stringify(v));
const deepEq = (a, b, m) => assert.deepEqual(host(a), host(b), m);

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });
after(() => { if (g) g.close(); });

// The sharedTest fixture's per-test reset (tests/helpers/fixtures.js), hook
// for hook and best-effort per hook like the original.
function fresh() {
  const a = g.apex;
  try { a.clearInput(); } catch (_) {}
  try { a.headless(false); } catch (_) {}
  try { a.logLevel("warn"); } catch (_) {}
  try { a.freeze(false); } catch (_) {}
  try { a.camera("chase"); } catch (_) {}
}

// The spec's load(): boot (the reset), race(id), wait for the build, go(),
// jump. The harness's race() is race(id, "day", "dry") + the wait + go().
async function load(trackId = "monza", frac = 0.05, speed = 60) {
  fresh();
  await g.race(trackId);
  g.apex.go();
  g.apex.jump(frac, speed, 0);
}

// requestAnimationFrame ticks at a fixed cadence (see the header). The clock
// is synthetic and monotonic across the whole file, so every pumped frame is
// exactly FRAME_MS after the previous one however long the test in between took.
const FRAME_MS = 50;
let clock = 0;
function pump(n) {
  if (!clock) clock = g.sandbox.performance.now();
  for (let i = 0; i < n; i++) { clock += FRAME_MS; g.pumpFrame(clock); }
}
// The spec's renderFrames(): snapCam() (REQUIRED after park()/jump() before a
// shot), then let n frames draw from a camera already at its solved vantage.
function renderFrames(n = 10) { g.apex.snapCam(); pump(n); }

// ── before any race: the boot-only tests ────────────────────────────────────

test("before a race is started, the error names the hook that fixes it", () => {
  fresh();
  const r = g.apex.world();
  assert.notEqual(r, null);
  assert.equal(r.ok, false);
  // Which of the three guards fires is a timing detail; that every one of
  // them is actionable is the contract.
  contains(["NoTrackError", "NoPlayerError", "PlayerNotPlacedError"], r.error);
  assert.match(r.fix, /__apex\.|race|go|jump|step/);
  truthy(r.state.raceState);
});

test("trackInfo never returns null — payload or typed error", () => {
  fresh();
  const r = g.apex.trackInfo();
  truthy(r);
  if (r.ok === false) {
    assert.equal(r.error, "NoTrackError");
    contains(r.fix, "race");
  } else {
    // The menu flyby track is already built — a legitimate answer.
    assert.equal(Array.isArray(r.corners), true);
  }
});

test("never returns null — a render or an actionable error", () => {
  fresh();
  const f = g.apex.render({ what: "view" });
  truthy(f);
  if (f.ok === false) {
    contains(["NoTrackError", "NoFrameError"], f.error);
    truthy(f.fix);
  } else {
    gt(f.grid.lines.length, 0);
  }
});

test("errors before a track is loaded", () => {
  fresh();
  const pl = g.apex.render({ what: "map" });
  truthy(pl);
  if (pl.ok === false) contains(pl.fix, "race");
  else truthy(pl.grid);
});

test("errors before a track is loaded", () => {
  fresh();
  const s = g.apex.survey();
  truthy(s);
  if (s.ok === false) contains(s.fix, "race");
  else truthy(s.summary);
});

test("errors before a track is loaded, never returns null", () => {
  fresh();
  const s = g.apex.scene();
  truthy(s);
  if (s.ok === false) truthy(s.fix);
  else truthy(s.registry);
});

test("states the goal, the trade-offs and the constraints, compactly", () => {
  fresh();
  const o = g.apex.objective();
  assert.match(o.goal, /race|finish/i);
  truthy(o.winCondition);
  gte(o.tradeoffs.length, 3);
  gt(o.constraints.length, 0);
  assert.match(o.units, /metres/);
  const t = o.tradeoffs.join(" ");
  assert.match(t, /TRACK LIMITS/);
  assert.match(t, /ERS/);
  assert.match(o.note, /rollout|act/);
  lt(JSON.stringify(o).length, 2000);
});

test("needs no track loaded — it is static", () => {
  fresh();
  const o = g.apex.objective();
  assert.notEqual(o.ok, false);
  truthy(o.goal);
});

test("describes the surface without needing a track", () => {
  fresh();
  const h = g.apex.agentHelp();
  assert.equal(h.apiVersion, 1);
  const listed = Object.keys(h.perceive)
    .concat(Object.keys(h.know), Object.keys(h.act), Object.keys(h.detail || {})).join(" ");
  for (const k of ["world(", "field(", "scene(", "atmosphere(", "render(",
                   "trackInfo(", "carView(", "survey(", "rollout(", "terminal(",
                   "describe(", "query("]) {
    contains(listed, k, k + " missing from agentHelp()");
  }
  truthy(h.detail, "drill-down section missing");
  contains(listed, "visible");
  truthy(h.read, "read hooks missing");
  assert.match(JSON.stringify(h.read), /physState|lightState|timing/);
  truthy(h.fields, "field glossary missing");
  gt(Object.keys(h.fields).length, 8);
  for (const [k, v] of Object.entries(h.fields)) {
    lte(v.split(" ").length, 16, k + " is too wordy for a glossary line");
  }
  truthy(h.control, "control verbs missing");
  assert.match(JSON.stringify(h.control), /act\(|weather|jump/);
  const notes = h.notes.join(" ");
  assert.doesNotMatch(notes, /frame\(\)|plan\(\)|worldModel\(\)|visible\(\)/);
  contains(notes, "render({what})");
  contains(h.loop, "world()");
  contains(h.cli, "agent.mjs");
  contains(notes, "null");
  gt(Object.keys(h.model).length, 2);
  lt(JSON.stringify(h).length, 6000);
});

// ── race() without go(): the spec's second typed-error test ─────────────────

test("player not placed names the hook that fixes it", async () => {
  fresh();
  // __apex.race(id) then the spec's wait for info().track — the harness's
  // race() would also go(), which this test must not. A new cars[] identity
  // is the tell that startRace() ran to completion (game-vm.cjs race()).
  const carsBefore = g.G.cars;
  const r0 = g.apex.race("monza");
  assert.ok(r0, "race() refused the circuit");
  const ok = await g.settle(() => g.apex.info().track === "monza" && g.G.cars !== carsBefore, 4000);
  assert.ok(ok, "race(): track never built");
  const r = g.apex.world();
  if (r.ok === false) {
    assert.equal(r.error, "PlayerNotPlacedError");
    assert.match(r.fix, /jump|step/);
  } else {
    truthy(r.ego);
  }
});

// ── typed errors ────────────────────────────────────────────────────────────

test("a bad detail level is rejected with the valid set", async () => {
  await load();
  const r = g.apex.world({ detail: "everything" });
  assert.equal(r.ok, false);
  assert.equal(r.error, "BadArgumentError");
  contains(r.message, "brief");
});

// ── detail levels ───────────────────────────────────────────────────────────

test("brief carries the envelope, ego and a one-line summary", async () => {
  await load();
  const w = g.apex.world({ detail: "brief" });
  assert.equal(w.apiVersion, 1);
  isNum(w.physicsVersion);
  isNum(w.seq);
  contains(w.conventions, "+x");
  assert.equal(w.detail, "brief");
  truthy(w.ego);
  isNum(w.ego.speedKph);
  isNum(w.ego.lateralM);
  assert.equal(typeof w.ego.onTrack, "boolean");
  assert.match(w.ego.grip.state, /grip/);
  assert.equal(typeof w.brief, "string");
  gt(w.brief.length, 20);
  // brief must NOT carry the expensive sections
  assert.equal(w.rivals, undefined);
  assert.equal(w.ahead, undefined);
});

test("drive adds lookahead, rivals and affordances", async () => {
  await load();
  const w = g.apex.world({ detail: "drive" });
  assert.equal(Array.isArray(w.ahead.pts), true);
  gt(w.ahead.pts.length, 1);
  assert.equal(Array.isArray(w.rivals), true);
  assert.equal(Array.isArray(w.affordances), true);
  assert.equal(Array.isArray(w.unavailable), true);
  lte(w.rivals.length, 4);
});

test("full adds session, terminal and raw physics", async () => {
  await load();
  const w = g.apex.world({ detail: "full" });
  truthy(w.session);
  truthy(w.session.weather);
  truthy(w.terminal);
  assert.equal(typeof w.terminal.done, "boolean");
  truthy(w.physics);
  isNum(w.physics.kRaw);
  isNum(w.physics.kSmoothed);
  assert.equal(w.rivals.length, 21);
});

test("brief is materially smaller than full", async () => {
  await load();
  const sizes = {
    brief: JSON.stringify(g.apex.world({ detail: "brief" })).length,
    full: JSON.stringify(g.apex.world({ detail: "full" })).length,
  };
  lt(sizes.brief, sizes.full / 2);
});

// ── look-ahead scales with speed ────────────────────────────────────────────

test("horizon distance grows with speed at fixed horizonS", async () => {
  await load();
  g.apex.jump(0.05, 20, 0);
  const slow = g.apex.world({ horizonS: 4 }).ahead.horizonM;
  g.apex.jump(0.05, 80, 0);
  const fast = g.apex.world({ horizonS: 4 }).ahead.horizonM;
  gt(fast, slow * 2);
});

test("every look-ahead point carries a direction and a width", async () => {
  await load();
  const pts = g.apex.world().ahead.pts;
  for (const p of pts) {
    contains(["L", "R", "straight"], p.dir);
    gt(p.widthM, 0);
    gt(p.t, 0);
  }
});

// ── rivals ──────────────────────────────────────────────────────────────────

test("rivals are sorted by gap and framed relative to the player", async () => {
  await load();
  const rv = g.apex.world({ detail: "full" }).rivals;
  gt(rv.length, 0);
  for (let i = 1; i < rv.length; i++) gte(rv[i].gapM, rv[i - 1].gapM);
  for (const r of rv) {
    contains(["ahead", "behind"], r.rel);
    contains(["left", "right", "same line"], r.side);
    isNum(r.closingMps);
    gte(r.gapS, 0);
  }
});

test("lateralM is relative to the player, not the centreline", async () => {
  await load();
  g.apex.jump(0.05, 60, 4);          // player 4 m right of centre
  const w = g.apex.world({ detail: "full" });
  const cars = g.apex.cars();
  const me = cars.find((c) => c.p);
  const other = cars.find((c) => !c.p);
  const row = w.rivals.find((x) => x.id === other.id);
  const r = { expected: other.x - me.x, got: row ? row.lateralM : null };
  assert.notEqual(r.got, null);
  lt(Math.abs(r.got - r.expected), 0.15);
});

// ── field() ──────────────────────────────────────────────────────────────────

test("lists every car by position with second gaps, compactly", async () => {
  await load();
  const f = g.apex.field({ detail: "full" });
  assert.notEqual(f.ok, false);
  gt(f.of, 1);
  assert.equal(f.positions.length, f.of);
  for (let i = 0; i < f.positions.length; i++) assert.equal(f.positions[i].pos, i + 1);
  assert.equal(f.positions[0].gapToLeaderS, 0);
  const players = f.positions.filter((r) => r.isPlayer);
  assert.equal(players.length, 1);
  assert.equal(f.player.pos, players[0].pos);
  for (const r of f.positions) {
    contains(["string", "object"], typeof r.team);   // string id or null
    assert.equal(r.team === null || typeof r.team === "string", true);
    assert.equal(typeof r.code === "string" || r.code === null, true);
  }
  for (let i = 1; i < f.positions.length; i++) {
    gte(f.positions[i].gapToLeaderS, f.positions[i - 1].gapToLeaderS - 0.01);
  }
});

test("world().rivals stays compact — no team object is spread per rival", async () => {
  await load();
  const rv = g.apex.world({ detail: "full" }).rivals;
  gt(rv.length, 0);
  for (const r of rv) {
    assert.equal(r.team === null || typeof r.team === "string", true);
    assert.equal("drivers" in Object(r), false);
  }
});

// ── road shape: banking, gradient, kerbs ─────────────────────────────────────

test("Spa's corners carry gradient and kerbs", async () => {
  await load("spa", 0.03, 60);
  const cs = g.apex.trackInfo({ what: "corners" }).corners;
  for (const c of cs) {
    isNum(c.gradientPct);
    contains(["uphill", "downhill", "level"], c.elevation);
    contains(["flat", "banked into the turn", "off-camber"], c.camber);
    if (c.kerbs) for (const k of c.kerbs) contains(["left", "right"], k);
  }
  assert.equal(cs.some((c) => c.gradientPct > 5), true);
  assert.equal(cs.some((c) => c.gradientPct < -5), true);
  assert.equal(cs.some((c) => c.kerbs && c.kerbs.length), true);
});

test("authored bank zones read as banked INTO the turn, not off-camber", async () => {
  await load("abudhabi", 0.03, 60);
  const banked = g.apex.trackInfo({ what: "corners" }).corners
    .filter((c) => Math.abs(c.bankingDeg) > 0.5);
  gt(banked.length, 0);
  for (const c of banked) {
    assert.equal(c.camber, "banked into the turn", c.turn + " " + c.dir + " @" + c.bankingDeg + "deg");
    if (c.dir === "L") gt(c.bankingDeg, 0);
    if (c.dir === "R") lt(c.bankingDeg, 0);
  }
});

test("pacenotes pick up elevation and camber mutators", async () => {
  await load("spa", 0.03, 60);
  const pn = g.apex.world({ detail: "drive" }).pacenotes;
  assert.match(pn, /uphill|downhill/);
  assert.match(pn, /[LR][1-6] @\d+m/);
});

test("the added detail does not blow the world() budget", async () => {
  await load();
  const n = JSON.stringify(g.apex.world({ detail: "drive" })).length;
  lt(n, 4500);
});

// ── atmosphere() ─────────────────────────────────────────────────────────────
// The spec waits two requestAnimationFrame ticks after each setting; pump(2).

test("narrates a day scene and keeps the raw numbers", async () => {
  await load();
  g.apex.setTimeOfDay("day");
  pump(2);
  const a = g.apex.atmosphere();
  assert.notEqual(a.ok, false);
  assert.equal(typeof a.brief, "string");
  assert.equal(a.dark, false);
  assert.equal(a.sun.body, "sun");
  assert.notEqual(a.raw.sunDir, null);
  lt(JSON.stringify(a).length, 2000);
});

test("night is dark, floodlit, and names the moon — not a high sun", async () => {
  await load();
  g.apex.setTimeOfDay("night");
  pump(2);
  const a = g.apex.atmosphere();
  assert.equal(a.dark, true);
  assert.equal(a.sun.body, "moon");
  assert.doesNotMatch(a.brief, /\bsun\b/);
  gt(a.lights.active, 0);
  assert.match(a.brief, /floodlit/);
});

test("wet weather is called out and matches the grip model", async () => {
  await load();
  g.apex.setTimeOfDay("day");
  g.apex.weather("rain");
  pump(2);
  const r = { a: g.apex.atmosphere(), grip: g.apex.world({ detail: "drive" }).ego.grip };
  assert.equal(r.a.wetRoad, true);
  assert.match(r.a.brief, /wet|rain/);
  lt(r.grip.gripMult, 1);
});

test("visibility is a distance, not a raw fog density", async () => {
  await load();
  const v = g.apex.atmosphere().visibility;
  isNum(v.fogDensity);
  gt(v.approxRangeM, 0);
});

// ── describe() ──────────────────────────────────────────────────────────────

test("expands a scene() row into everything known about that prop", async () => {
  await load();
  const sc = g.apex.scene({ radius: 140, limit: 5 });
  const row = sc.props[0];
  const d = g.apex.describe(row.id);
  assert.match(row.id, /^prop:\d+$/);
  assert.equal(d.id, row.id);
  assert.equal(d.type, "prop");
  assert.equal(d.kind, row.kind);
  assert.equal(d.world.length, 3);
  assert.equal(d.sizeM.length, 3);
  isNum(d.volumeM3);
  isNum(d.s);
  assert.match(d.nearestCorner.id, /^corner:/);
  lt(JSON.stringify(d).length, 1200);
});

test("resolves corner, car and span ids", async () => {
  await load();
  const turn = g.apex.trackInfo({ what: "corners" }).corners[2].turn;
  const c = g.apex.describe("corner:" + turn);
  const car = g.apex.describe("car:0");
  assert.equal(c.type, "corner");
  assert.equal(c.corner.turn, turn);
  assert.equal(typeof c.sceneryWithin80m, "object");
  assert.equal(car.type, "car");
  assert.equal(car.team === null || typeof car.team === "string", true);
  contains(["ahead", "behind", "self"], car.rel);
});

test("unknown ids are typed errors that say how to find a real one", async () => {
  await load();
  const r = {
    missing: g.apex.describe("prop:999999"),
    badKind: g.apex.describe("banana:1"),
    empty: g.apex.describe(),
  };
  assert.equal(r.missing.ok, false);
  assert.equal(r.missing.error, "NotFoundError");
  assert.match(r.missing.fix, /indexed|scene\(\)|query\(\)/);
  assert.equal(r.badKind.ok, false);
  assert.equal(r.badKind.error, "BadArgumentError");
  assert.equal(r.empty.ok, false);
});

// ── query() ─────────────────────────────────────────────────────────────────

test("returns prototype + instances, not N near-identical records", async () => {
  await load();
  const q = g.apex.query({ kind: "pine", near: 250, limit: 8 });
  gt(q.matched, 0);
  gt(q.instances.length, 0);
  lte(q.instances.length, 8);
  assert.equal(q.prototypes.pine.sizeM.length, 3);
  const plain = q.instances.filter((r) => !r.sizeM);
  gt(plain.length, 0);
  for (const r of q.instances) {
    assert.match(r.id, /^prop:\d+$/);
    assert.equal(r.kind, "pine");
  }
});

test("is bounded and reports what it withheld", async () => {
  await load();
  const q = g.apex.query({ limit: 5 });
  lte(q.returned, 5);
  gte(q.matched, q.returned);
  assert.equal(q.truncated, q.matched - q.returned);
  lt(JSON.stringify(q).length, 4000);
});

test("filters compose: kind, arc window, radius", async () => {
  await load();
  const r = {
    win: g.apex.query({ fromS: 0, toS: 300, limit: 50 }),
    near: g.apex.query({ near: 60, limit: 50 }),
  };
  for (const row of r.win.instances) {
    gte(row.s, 0);
    lte(row.s, 300);
  }
  for (const row of r.near.instances) lte(row.distM, 60);
});

test("ids from query resolve through describe", async () => {
  await load();
  const q = g.apex.query({ near: 200, limit: 3 });
  const ok = q.instances.every((r) => {
    const d = g.apex.describe(r.id);
    return d.ok !== false && d.id === r.id && d.kind === r.kind;
  });
  assert.equal(ok, true);
});

// ── delta mode ──────────────────────────────────────────────────────────────

test("seq increments and a delta is smaller than the full payload", async () => {
  await load();
  const a = g.apex.world({ detail: "drive" });
  g.apex.step(1 / 60, 2);
  const d = g.apex.world({ detail: "drive", since: a.seq });
  const full = g.apex.world({ detail: "drive" });
  gt(d.seq, a.seq);
  assert.equal(d.deltaBase, a.seq);
  lt(JSON.stringify(d).length, JSON.stringify(full).length);
});

test("an unknown since returns the full payload with a note, not an error", async () => {
  await load();
  const d = g.apex.world({ since: 99999 });
  assert.notEqual(d.ok, false);
  truthy(d.ego);
  contains(d.note, "full payload");
});

// A DELTA CANNOT EXPRESS A REMOVED KEY. deltaOf walks the keys of the NEW
// payload, so a field the base carried and this one does not is never
// mentioned, and applyDelta merges — so the reconstruction keeps it forever.
// The reachable case is the one agentHelp() recommends: one "full" read for
// session/physics/tunables, then ride "brief" with `since`. Nothing makes the
// detail level match across a chain, so switching down used to pin those keys
// at their last full-read values for the rest of the episode. A shrink now
// takes the same full-payload escape hatch an unknown `since` takes.
test("dropping to a smaller detail level across a since chain returns the full payload", async () => {
  await load();
  const full = g.apex.world({ detail: "full" });
  truthy(full.tunables, "the full payload carries tunables");
  g.apex.step(1 / 60, 2);
  const d = g.apex.world({ detail: "brief", since: full.seq });
  assert.equal(d.deltaBase, null, "a shrinking payload cannot be sent as a delta");
  contains(d.note, "removed key");
  assert.equal(d.tunables, undefined, "the dropped key must not be reconstructed as stale");
});

test("a same-detail chain is still a delta, not a full payload", async () => {
  await load();
  const a = g.apex.world({ detail: "drive" });
  g.apex.step(1 / 60, 2);
  const d = g.apex.world({ detail: "drive", since: a.seq });
  assert.equal(d.deltaBase, a.seq, "the shrink guard must not break ordinary deltas");
});

// ── corner table ────────────────────────────────────────────────────────────

test("Monaco's hairpin is resolved as a hairpin", async () => {
  await load("monaco");
  const cs = g.apex.trackInfo({ what: "corners" }).corners;
  const tightest = cs.reduce((a, b) => (a.radiusM < b.radiusM ? a : b));
  lt(tightest.radiusM, 20);
  assert.equal(tightest.severity, "hairpin");
});

test("corners are well-formed and non-overlapping", async () => {
  await load("monza");
  const info = g.apex.trackInfo({ what: "corners" });
  gt(info.corners.length, 3);
  contains(info.source, "curated FIA apexes");
  for (const c of info.corners) {
    assert.match(c.turn, /^T\d+(-T\d+)?$/);
    contains(["L", "R", "straight"], c.dir);
    gt(c.radiusM, 0);
    gt(c.lengthM, 0);
    gte(c.frac, 0);
    lt(c.frac, 1);
    if (c.dir === "L") gt(c.sweepDeg, 0);
    if (c.dir === "R") lt(c.sweepDeg, 0);
    if (c.dir === "L") gt(c.k, 0);
    if (c.dir === "R") lt(c.k, 0);
  }
});

test("the lap closes: integrated heading is a full turn", async () => {
  await load("monza");
  const N = 1440;
  let psi = 0, prev = null;
  const ad = (x) => {
    while (x > Math.PI) x -= 2 * Math.PI;
    while (x < -Math.PI) x += 2 * Math.PI;
    return x;
  };
  for (let i = 0; i <= N; i++) {
    const n = g.apex.nodeAt((i % N) / N);
    const h = Math.atan2(n.tx, n.tz);
    if (prev !== null) psi += ad(h - prev);
    prev = h;
  }
  const deg = psi * 180 / Math.PI;
  lt(Math.abs(Math.abs(deg) - 360), 1);
});

test("sectors and profile are available and static", async () => {
  await load("monza");
  const r = {
    sectors: g.apex.trackInfo({ what: "sectors" }).sectors,
    profile: g.apex.trackInfo({ what: "profile" }).profile,
  };
  assert.equal(r.sectors.length, 3);
  assert.equal(r.sectors[0].fromFrac, 0);
  gt(r.profile.length, 10);
  isNum(r.profile[0].y);
});

test("an unknown `what` is rejected with the valid set", async () => {
  await load("monza");
  const r = g.apex.trackInfo({ what: "everything" });
  assert.equal(r.ok, false);
  assert.equal(r.error, "BadArgumentError");
  contains(r.message, "corners");
});

// ── state that used to be invisible ─────────────────────────────────────────

test("penalties are visible, with the rule that governs them", async () => {
  await load();
  const p = g.apex.world({ detail: "drive" }).ego.penalties;
  truthy(p);
  isNum(p.cuts);
  isNum(p.timePenaltyS);
  assert.equal(p.freeCutsLeft, 3 - p.cuts);
  assert.match(p.note, /\+5/);
});

test("ERS reports deployment and the overtake window, not just charge", async () => {
  await load();
  const e = g.apex.world({ detail: "drive" }).ego.ers;
  truthy(e);
  for (const k of ["charge", "deploying", "overtakeArmed", "boostRemainingS", "cooldownS"]) {
    hasProp(e, k, k + " missing from ers");
  }
  gte(e.charge, 0);
  lte(e.charge, 1);
});

test("rivals carry pace, so one AI is distinguishable from another", async () => {
  await load();
  const rv = g.apex.world({ detail: "full" }).rivals;
  gt(rv.length, 1);
  for (const r of rv) {
    isNum(r.pace);
    gt(r.pace, 0.5);
    lte(r.pace, 1.05);
  }
  gt(new Set(rv.map((r) => r.pace)).size, 1);
});

test("full detail exposes engine, recovery and the live tunables", async () => {
  await load();
  g.apex.jump(0.05, 60, 0);
  const w = g.apex.world({ detail: "full" });
  gt(w.physics.rpm, 0);
  for (const k of ["offroad", "stuckS", "wallContactS", "vertLoad"]) hasProp(w.physics, k, k + " missing");
  truthy(w.tunables);
  isNum(w.tunables.PACE);
  isNum(w.tunables.ROAD_FOLLOW);
});

// ── static grounding + session self-description ─────────────────────────────

test("trackInfo grounds the circuit in the real world", async () => {
  await load();
  const t = g.apex.trackInfo({ what: "corners" }).track;
  truthy(t.gp);
  gt(t.realLengthKm, 1);
  lt(Math.abs(t.lengthErrorPct), 15);
  isNum(t.startFrac);
  assert.equal(typeof t.reverse, "boolean");
});

test("a full snapshot carries the seed that reproduces it", async () => {
  await load();
  g.apex.go();
  g.apex.reset(0.05, 60, 0, 4242);
  const s = g.apex.world({ detail: "full" }).session;
  assert.equal(s.seed, 4242);
  for (const k of ["seasonMode", "raceLineAssist", "unlimitedBudget"]) hasProp(s, k, k + " missing from session");
});

// ── nextCorner ──────────────────────────────────────────────────────────────

test("names a corner ahead with a braking hint", async () => {
  await load();
  const nc = g.apex.world().nextCorner;
  assert.match(nc.turn, /^T\d+/);
  gte(nc.distM, 0);
  gte(nc.timeS, 0);
  gte(nc.suggestBrakeM, 0);
  assert.equal(typeof nc.status, "string");
  contains(nc.note, "hint");
});

test("the braking hint grows with speed", async () => {
  await load();
  g.apex.jump(0.001, 30, 0);
  const slow = g.apex.world().nextCorner;
  g.apex.jump(0.001, 90, 0);
  const fast = g.apex.world().nextCorner;
  gt(slow.suggestBrakeM, 0);
  gt(fast.suggestBrakeM, slow.suggestBrakeM);
});

test("pacenotes render the road ahead as a rally-style callout", async () => {
  await load();
  g.apex.jump(0.001, 60, 0);
  const pn = g.apex.world({ detail: "drive" }).pacenotes;
  assert.equal(typeof pn, "string");
  assert.match(pn, /[LR][1-6] @\d+m/);
  lt(pn.length, 160);
});

// ── frame() cameras and edges ───────────────────────────────────────────────

test("renders any of the 13 camera modes without a live frame", async () => {
  await load("monza", 0.05, 60);
  const cock = g.apex.render({ what: "view", cols: 32, camera: "cockpit" });
  const heli = g.apex.render({ what: "view", cols: 32, camera: "heli" });
  const chase = g.apex.render({ what: "view", cols: 64, camera: "chase" });
  assert.equal(cock.camera.mode, "cockpit");
  assert.equal(cock.camera.synthetic, true);
  assert.equal(heli.camera.mode, "heli");
  assert.equal(heli.camera.synthetic, true);
  gt(cock.grid.lines.length, 4);
  assert.equal((chase.coveragePct.player || 0) > 0, true);
  assert.equal((cock.coveragePct.player || 0) > 0, false);
});

test("an unknown camera errors with the valid set", async () => {
  await load();
  const r = g.apex.render({ what: "view", camera: "bogus" });
  assert.equal(r.ok, false);
  assert.equal(r.error, "BadArgumentError");
  contains(r.message, "bogus");
});

test("orbit frames the car from a bearing", async () => {
  await load("monza", 0.05, 60);
  const r = g.apex.render({ what: "view", cols: 32, orbit: { az: 180, el: 20, dist: 15 } });
  assert.equal(r.camera.mode, "orbit");
  assert.equal(r.camera.synthetic, true);
  gt(r.coveragePct.player || 0, 0);
});

test("edges overlay directional glyphs on silhouettes only", async () => {
  await load("monza", 0.05, 60);
  renderFrames();
  const plain = g.apex.render({ what: "view", cols: 56, camera: "chase" });
  const edged = g.apex.render({ what: "view", cols: 56, camera: "chase", edges: true });
  const count = (ls) => ls.join("").split("").filter((c) => "|-/\\".includes(c)).length;
  const r = { plainEdges: count(plain.grid.lines), edgedEdges: count(edged.grid.lines) };
  gt(r.edgedEdges, r.plainEdges);
  gt(r.edgedEdges, 3);
});

// ── frame() ─────────────────────────────────────────────────────────────────

test("rasterises the view into a labelled grid", async () => {
  await load();
  renderFrames();
  const f = g.apex.render({ what: "view", cols: 48, rows: 16 });
  assert.equal(f.grid.cols, 48);
  assert.equal(f.grid.lines.length, 16);
  for (const line of f.grid.lines) assert.equal(line.length, 48);
  const glyphs = new Set(f.grid.lines.join("").split(""));
  for (const gl of glyphs) truthy(f.legend[gl], `glyph ${JSON.stringify(gl)} not in legend`);
  const total = Object.values(f.coveragePct).reduce((a, b) => a + b, 0);
  lt(Math.abs(total - 100), 1.5);
});

test("driving on track, the road dominates the lower frame", async () => {
  await load("monza", 0.05, 60);
  renderFrames();
  const f = g.apex.render({ what: "view", cols: 48, rows: 16 });
  gt(f.coveragePct.road, 20);
  const lower = f.grid.lines.slice(-4).join("");
  const roadCells = lower.split("").filter((c) => c === "=" || c === ":").length;
  gt(roadCells / lower.length, 0.7);
});

test("the player car is drawn, and no single object owns the frame", async () => {
  await load();
  renderFrames();
  const f = g.apex.render({ what: "view", cols: 48, rows: 16 });
  gt(f.coveragePct.player, 0);
  for (const [kind, pct] of Object.entries(f.coveragePct)) {
    lt(pct, 85, kind + " covers the whole frame");
  }
});

test("sky sits above the horizon row and ground below", async () => {
  await load();
  renderFrames();
  const f = g.apex.render({ what: "view", cols: 32, rows: 16 });
  isNum(f.grid.horizonRow);
  const below = f.grid.lines.slice(f.grid.horizonRow + 1).join("");
  assert.equal(below.includes("."), false);      // no sky under the horizon
});

test("objects are ranked by how much of the frame they hold", async () => {
  await load();
  renderFrames();
  const objs = g.apex.render({ what: "view" }).objects;
  gt(objs.length, 0);
  for (let i = 1; i < objs.length; i++) lte(objs[i].cells, objs[i - 1].cells);
});

test("rows are derived so the image is not squashed", async () => {
  await load();
  renderFrames();
  const f = g.apex.render({ what: "view", cols: 48 });
  assert.equal(f.grid.aspect.corrected, true);
  lt(Math.abs(f.grid.aspect.renderedAspect - f.grid.aspect.viewport), 0.15);
  assert.equal(f.grid.rows, f.grid.lines.length);
});

test("pinned rows are honoured and flagged as uncorrected", async () => {
  await load();
  renderFrames();
  const f = g.apex.render({ what: "view", cols: 48, rows: 24 });
  assert.equal(f.grid.rows, 24);
  assert.equal(f.grid.aspect.corrected, false);
  contains(f.grid.aspect.note, "pinned");
});

test("the depth channel is a real, monotonic depth buffer", async () => {
  await load("monza", 0.05, 60);
  renderFrames();
  const f = g.apex.render({ what: "view", cols: 40, depth: true });
  assert.equal(f.depth.lines.length, f.grid.rows);
  assert.equal(f.depth.scaleM.length, 10);
  for (let i = 1; i < f.depth.scaleM.length; i++) gt(f.depth.scaleM[i], f.depth.scaleM[i - 1]);
  const digits = (line) => line.split("").filter((c) => c !== " ").map(Number);
  const bottom = digits(f.depth.lines[f.depth.lines.length - 1]);
  const mid = digits(f.depth.lines[Math.max(0, f.grid.horizonRow)]);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1);
  lt(avg(bottom), avg(mid));
});

test("depth is omitted unless asked for", async () => {
  await load();
  renderFrames();
  const f = g.apex.render({ what: "view", cols: 32 });
  assert.equal(f.depth, undefined);
});

test("flags a stale frame under headless", async () => {
  await load();
  renderFrames();
  g.apex.headless(true);
  const f = g.apex.render({ what: "view", cols: 24, rows: 8 });
  g.apex.headless(false);
  assert.equal(f.framePending, true);
  contains(f.warning, "stale");
});

// ── plan() ──────────────────────────────────────────────────────────────────

test("draws a car-up top-down map with a metric index", async () => {
  await load("monza", 0.28, 60);
  const pl = g.apex.render({ what: "map", radiusM: 180, cols: 60 });
  contains(pl.frame, "car-up");
  gt(pl.grid.lines.length, 10);
  const cc = Math.round(pl.scale.cols / 2), cr = Math.round(pl.scale.rows / 2);
  assert.equal(pl.grid.lines[cr][cc], "@");
  assert.notEqual(pl.ego.headingDeg, undefined);
  isNum(pl.scale.metresPerCol);
  for (const c of pl.corners) {
    assert.equal(c.cell.length, 2);
    assert.equal(c.world.length, 2);
    isNum(c.bearingDeg);
  }
});

test("northUp switches to the world frame", async () => {
  await load("monza", 0.28, 60);
  const pl = g.apex.render({ what: "map", northUp: true });
  contains(pl.frame, "north-up");
  contains(pl.scale.note, "east");
});

test("a bigger radius covers more track", async () => {
  await load("monza", 0.28, 60);
  const r = {
    near: g.apex.render({ what: "map", radiusM: 80 }).corners.length,
    far: g.apex.render({ what: "map", radiusM: 600 }).corners.length,
  };
  gte(r.far, r.near);
});

// ── carView() ───────────────────────────────────────────────────────────────

test("measures the car from a real build", async () => {
  await load();
  const c = g.apex.carView();
  gt(c.geometry.vertices, 500);
  gt(c.geometry.triangles, 200);
  gt(c.geometry.lengthM, 4.5);
  lt(c.geometry.lengthM, 6.5);
  gt(c.geometry.widthM, 1.8);
  lt(c.geometry.widthM, 2.4);
  lt(c.geometry.heightM, 1.3);
  closeTo(c.geometry.wheelbaseM, 3.3, 1);
});

test("reports the full parts spec and its effect", async () => {
  await load();
  const c = g.apex.carView();
  assert.equal(c.parts.chosen.length, g.sandbox.Parts.CATALOG.length);
  const cats = c.parts.chosen.map((p) => p.category);
  contains(cats, "engine");
  contains(cats, "aero");
  const cap = g.sandbox.Parts.BUDGET;
  assert.equal(c.parts.budget, cap);
  assert.equal(c.parts.spent + c.parts.remaining, cap);
  for (const k of ["speed", "accel", "cornering", "braking"]) isNum(c.parts.mods[k]);
});

test("carries team identity and the chassis silhouette knobs", async () => {
  await load();
  const c = g.apex.carView({ team: "ferrari" });
  assert.equal(c.team.id, "ferrari");
  assert.equal(c.team.colors.primary.length, 3);
  gt(c.team.drivers.length, 0);
  isNum(c.chassis.style.noseSlim);
  assert.equal(typeof c.chassis.bespokeSilhouette, "boolean");
  gt(c.chassis.axles.frontZ, c.chassis.axles.rearZ);
});

test("a different team gives different geometry or identity", async () => {
  await load();
  const a = g.apex.carView({ team: "ferrari" });
  const b = g.apex.carView({ team: "mercedes" });
  const r = { aId: a.team.id, bId: b.team.id, aCol: a.team.colors.primary, bCol: b.team.colors.primary };
  assert.notEqual(r.aId, r.bId);
  assert.notEqual(JSON.stringify(r.aCol), JSON.stringify(r.bCol));
});

test("detail:render draws edge+shade elevations from the real mesh", async () => {
  await load();
  const c = g.apex.carView({ detail: "render", cols: 60 });
  truthy(c.render);
  for (const view of ["side", "top", "front"]) {
    gt(c.render[view].lines.length, 3);
    const body = c.render[view].lines.join("");
    assert.equal(/[|/\\-]/.test(body), true);
    assert.equal(/[.:=+*oO#%@]/.test(body), true);
    isNum(c.render[view].mPerCol);
  }
  const front = c.render.front.lines;
  const w = front[0].length;
  const hasHeavy = (s) => /[O#%@]/.test(s);
  const leftHeavy = front.some((l) => hasHeavy(l.slice(0, Math.floor(w / 3))));
  const rightHeavy = front.some((l) => hasHeavy(l.slice(Math.floor(2 * w / 3))));
  assert.equal(leftHeavy && rightHeavy, true);
});

test("render is omitted unless asked for", async () => {
  await load();
  const c = g.apex.carView();
  assert.equal(c.render, undefined);
});

test("an unknown team errors instead of silently answering for another", async () => {
  await load();
  const c = g.apex.carView({ team: "nosuchteam" });
  assert.equal(c.ok, false);
  assert.equal(c.error, "NoTeamError");
  contains(c.fix, "teams()");
});

// ── survey() ────────────────────────────────────────────────────────────────

test("Monza surveys clean", async () => {
  await load("monza");
  const s = g.apex.survey();
  gt(s.summary.propsChecked, 500);
  assert.equal(s.summary.floating, 0);
  assert.equal(s.summary.buried, 0);
  assert.equal(s.summary.terrainHoles, 0);
  assert.equal(s.summary.groundCliffs, 0);
  assert.equal(s.summary.terrainOverRoad, 0);
  assert.equal(s.summary.modelsInvalid, 0);
  assert.equal(s.summary.clean, true);
});

test("no circuit ships a model the guard had to reject", async () => {
  await load("vegas");
  const s = g.apex.survey();
  assert.equal(s.summary.modelsInvalid, 0, JSON.stringify(s.modelDiagnostics.invalid));
});

test("props-over-road is labelled a screen, not a verdict", async () => {
  await load("monza");
  const s = g.apex.survey();
  hasProp(s.summary, "propsOverRoadCandidates");
  contains(s.authoritative.propsOverRoad, "measure-props-over-road");
  assert.equal(s.summary.clean, true);
});

test("the lateral profile is only returned when asked for", async () => {
  await load("monza");
  const r = {
    without: g.apex.survey().profile,
    with: g.apex.survey({ at: 4, profile: true }).profile,
  };
  assert.equal(r.without, undefined);
  assert.equal(r.with.length, 4);
  gt(r.with[0].samples.length, 4);
});

// ── carView parts ───────────────────────────────────────────────────────────

test("measures every section of the car", async () => {
  await load();
  const c = g.apex.carView({ detail: "parts" });
  gt(c.partCount, 12);
  assert.equal(c.parts.chosen.length, g.sandbox.Parts.CATALOG.length);
  const byName = Object.fromEntries(c.partGeometry.map((p) => [p.name, p]));
  for (const n of ["chassis", "frontWing", "rearAssembly", "wheels", "cockpit"]) {
    truthy(byName[n], n + " missing");
    gt(byName[n].vertices, 0);
  }
  gt(byName.frontWing.boundsZ[0], byName.rearAssembly.boundsZ[1]);
  gt(byName.frontWing.sizeM[0], 1.5);
});

test("instrumentation changed no geometry", async () => {
  await load();
  const plain = g.apex.carView();
  const parts = g.apex.carView({ detail: "parts" });
  const sum = parts.partGeometry.reduce((a, p) => a + p.vertices, 0);
  assert.equal(plain.geometry.vertices, parts.geometry.vertices);
  assert.equal(sum, plain.geometry.vertices);
});

test("parts are omitted unless requested", async () => {
  await load();
  const c = g.apex.carView();
  assert.equal(c.partGeometry, undefined);
  assert.equal(c.parts.chosen.length, g.sandbox.Parts.CATALOG.length);   // the spec is always present
  truthy(c.geometry);
});

test("per-team silhouette shows up in measured geometry", async () => {
  await load();
  const r = ["mclaren", "ferrari", "mercedes"].map((t) => {
    const c = g.apex.carView({ team: t, detail: "parts" });
    const chassis = c.partGeometry.find((p) => p.name === "chassis");
    return { team: t, noseZ: chassis.boundsZ[1], verts: c.geometry.vertices, fin: c.chassis.style.fin };
  });
  const noses = new Set(r.map((x) => x.noseZ));
  gt(noses.size, 1);
  const withFin = r.find((x) => x.fin > 0), without = r.find((x) => x.fin === 0);
  if (withFin && without) gt(withFin.verts, without.verts);
});

// ── worldModel() ────────────────────────────────────────────────────────────

test("summary aggregates thousands of objects into a readable document", async () => {
  await load();
  const w = g.apex.render({ what: "circuit", detail: "summary" });
  assert.equal(w.track.id, "monza");
  gt(w.totals.objects, 1000);
  assert.equal(w.totals.registryComplete, true);
  lt(w.features.length, w.totals.objects / 5);
  gt(w.features.length, 5);
  gt(w.landmarks.length, 0);
  gt(w.spans.length, 0);
  lt(JSON.stringify(w).length, 120000);
});

test("no feature spans the whole lap", async () => {
  await load();
  const w = g.apex.render({ what: "circuit" });
  const lap = w.track.lengthM;
  for (const f of w.features) {
    lt(f.runLengthM, lap * 0.2);
    gte(f.count, 3);
    contains(["left", "right", "across", "off-course"], f.side);
  }
});

test("landmarks are structures, not repeated dressing", async () => {
  await load();
  const w = g.apex.render({ what: "circuit" });
  const kinds = new Set(w.landmarks.map((l) => l.kind));
  assert.equal(kinds.has("ridge"), false);
  assert.equal(kinds.has("peak"), false);
  assert.equal(kinds.has("tree"), false);
  for (const l of w.landmarks) {
    assert.equal(l.sizeM.length, 3);
    gte(l.frac, 0);
    lt(l.frac, 1);
  }
});

// Kept in sync with js/track/scenery/structures.js by tests/unit/span-kinds.test.mjs.
const SPAN_KINDS = ["guardrail", "fence", "tyreWall", "wall",
                    "bleacher", "scaffoldStand", "terrace", "tieredBowl"];

test("linear furniture is spans, not thousands of segments", async () => {
  await load();
  const w = g.apex.render({ what: "circuit" });
  lt(w.spans.length, 60);
  gt(w.spans.length, 0, "a built Monza reported no linear furniture at all");
  for (const s of w.spans) {
    contains(SPAN_KINDS, s.kind);
    contains(["left", "right"], s.side);
    gt(s.lengthM, 0);
  }
});

test("sections walk the lap corner by corner", async () => {
  await load();
  const w = g.apex.render({ what: "circuit", detail: "sections" });
  gt(w.sections.length, 3);
  let sum = 0;
  for (const s of w.sections) {
    assert.match(s.from, /^T\d/);
    assert.match(s.to, /^T\d/);
    gt(s.lengthM, 0);
    assert.equal(typeof s.contains, "object");
    sum += s.lengthM;
  }
  lt(Math.abs(sum - w.track.lengthM), w.track.lengthM * 0.02);
});

test("full paginates the raw object list", async () => {
  await load();
  const all = g.apex.render({ what: "circuit", detail: "full", limit: 5000 });
  const a = g.apex.render({ what: "circuit", detail: "full", limit: 50 });
  const b = g.apex.render({ what: "circuit", detail: "full", offset: 50, limit: 50 });
  assert.equal(a.objects.length, 50);
  assert.equal(a.objectPage.more, true);
  gt(a.objectPage.total, 50);
  assert.equal(JSON.stringify(a.objects), JSON.stringify(all.objects.slice(0, 50)));
  assert.equal(JSON.stringify(b.objects), JSON.stringify(all.objects.slice(50, 100)));
  assert.equal(b.objectPage.offset, 50);
  assert.equal(b.objectPage.total, all.objectPage.total);
});

test("sign boards keep their meaning", async () => {
  await load("suzuka");
  const boards = g.apex.render({ what: "circuit", detail: "full", limit: 5000 })
    .objects.filter((o) => o.board);
  gt(boards.length, 0);
  assert.equal(boards.some((b) => b.board === "corner" && typeof b.value === "number"), true);
});

test("rejects an unknown detail level", async () => {
  await load();
  const w = g.apex.render({ what: "circuit", detail: "everything" });
  assert.equal(w.ok, false);
  assert.equal(w.error, "BadArgumentError");
  contains(w.message, "summary");
});

// ── rollout() ───────────────────────────────────────────────────────────────

test("summarises an interval instead of returning frames", async () => {
  await load("monza", 0.0, 55);
  const r = g.apex.rollout({ seconds: 4, samples: 5, input: { steer: 0, throttle: true } });
  assert.equal(r.ran.ticks, 240);
  contains(r.ran.policy, "open-loop");
  gt(r.distanceM, 0);
  gte(r.speedKph.max, r.speedKph.min);
  lte(r.samples.length, 6);
  isNum(r.minClearanceM);
  truthy(r.terminal);
  lt(JSON.stringify(r).length, 4000);
});

test("full throttle into Monza's first chicane goes off track", async () => {
  await load("monza", 0.05, 60);
  const r = g.apex.rollout({ seconds: 6, input: { steer: 0, throttle: true } });
  gt(r.offTrack.events, 0);
  gt(r.offTrack.seconds, 1);
  lt(r.speedKph.final, r.speedKph.max);
});

test("runs a closed-loop policy at policyHz", async () => {
  await load("monza", 0.0, 45);
  let calls = 0;
  const out = g.apex.rollout({
    seconds: 2, policyHz: 10,
    policy: (w) => { calls++; return { steer: -w.ego.lateralM * 0.05, throttle: true }; },
  });
  contains(out.ran.policy, "closed-loop");
  gte(calls, 19);
  lte(calls, 21);
});

test("a throwing policy returns a typed error, not a crash", async () => {
  await load("monza", 0.0, 45);
  const r = g.apex.rollout({ seconds: 1, policy: () => { throw new Error("boom"); } });
  assert.equal(r.ok, false);
  assert.equal(r.error, "PolicyError");
  contains(r.message, "boom");
  truthy(r.fix);
});

test("does not disturb the caller's delta chain", async () => {
  await load();
  const a = g.apex.world({ detail: "brief" });
  g.apex.rollout({ seconds: 1, policy: () => ({ throttle: true }) });
  const d = g.apex.world({ detail: "brief", since: a.seq });
  const r = { base: a.seq, deltaBase: d.deltaBase, note: d.note || null };
  assert.equal(r.deltaBase, r.base);
  assert.equal(r.note, null);
});

test("records minimum speed through corners actually driven", async () => {
  await load("monza", 0.0, 45);
  const cs = g.apex.rollout({ seconds: 10, input: { steer: 0.15, throttle: true } }).cornerMinSpeedKph;
  assert.equal(Array.isArray(cs), true);
  for (const c of cs) {
    assert.match(c.turn, /^T\d+/);
    gte(c.minSpeedKph, 0);
  }
});

// ── render() higher fidelity ────────────────────────────────────────────────

test("the default view is unchanged; cols raises the resolution on request", async () => {
  await load();
  const r = {
    def: g.apex.render({ what: "view", camera: "chase" }).grid.cols,
    big: g.apex.render({ what: "view", cols: 200, camera: "chase" }).grid.cols,
    overCap: g.apex.render({ what: "view", cols: 5000, camera: "chase" }).grid.cols,
  };
  assert.equal(r.def, 48);
  assert.equal(r.big, 200);
  lt(r.overCap, 5000);
  gt(r.overCap, 200);
});

test("ss raises supersampling on the car render and visibly changes it", async () => {
  await load();
  const lo = g.apex.carView({ team: "ferrari", detail: "render", cols: 40, ss: 1 });
  const hi = g.apex.carView({ team: "ferrari", detail: "render", cols: 40, ss: 6 });
  const huge = g.apex.carView({ team: "ferrari", detail: "render", cols: 999999, ss: 999 });
  assert.notEqual(lo.render.side.lines.join("\n"), hi.render.side.lines.join("\n"));
  lt(huge.render.side.cols, 999999);
});

test("stays flagged approximate and does not become the default surface", async () => {
  await load();
  const r = g.apex.render({ what: "view", cols: 200, camera: "chase" });
  contains(r.aid, "APPROXIMATE");
});

// ── render() consolidation ──────────────────────────────────────────────────

test("dispatches each what to the matching raster, flagged approximate", async () => {
  await load();
  const view = g.apex.render({ what: "view", cols: 40, camera: "chase" });
  const map = g.apex.render({ what: "map", cols: 40 });
  const circuit = g.apex.render({ what: "circuit", detail: "summary" });
  const car = g.apex.render({ what: "car", cols: 40 });
  assert.equal(view.what, "view");
  assert.equal(!!(view.grid && view.grid.lines), true);
  contains(view.aid, "APPROXIMATE");
  assert.equal(map.what, "map");
  assert.equal(!!(map.grid && map.grid.lines), true);
  assert.equal(circuit.what, "circuit");
  assert.equal(car.what, "car");
  assert.equal(!!car.render, true);      // render forces detail:"render"
  contains(car.aid, "APPROXIMATE");
});

test("an unknown what is a typed error with the valid set", async () => {
  await load();
  const r = g.apex.render({ what: "bogus" });
  assert.equal(r.ok, false);
  assert.equal(r.error, "BadArgumentError");
  assert.match(r.message, /view.*map.*circuit.*car|view/);
});

// ── scene() ─────────────────────────────────────────────────────────────────

test("records every semantic placement, dropping none", async () => {
  await load();
  const s = g.apex.scene({ radius: 150 });
  assert.equal(s.registry.dropped, 0);
  assert.equal(s.registry.complete, true);
  gt(s.registry.recorded, 100);
  lt(s.registry.recorded, s.registry.cap);
  gt(s.counts.byKindLapTotal.tree, 100);
  gt(s.counts.byKindLapTotal.grandstand, 0);
  gt(s.counts.byKindLapTotal.building, 0);
});

test("props are egocentric, sorted, and inside the radius", async () => {
  await load();
  const s = g.apex.scene({ radius: 120, limit: 20 });
  assert.equal(s.origin.from, "player");
  gt(s.props.length, 0);
  for (let i = 0; i < s.props.length; i++) {
    const p = s.props[i];
    lte(p.distM, 120);
    lte(Math.abs(p.bearingDeg), 180);
    if (p.side === "right") gt(p.bearingDeg, 0);
    if (p.side === "left") lt(p.bearingDeg, 0);
    contains(["left", "right", "across", "off-course"], p.trackSide);
    assert.equal(p.sizeM.length, 3);
    if (i) gte(p.distM, s.props[i - 1].distM);
  }
});

test("a bigger radius can only find more, never fewer", async () => {
  await load();
  const r = {
    near: g.apex.scene({ radius: 50 }).counts.inRadius,
    far: g.apex.scene({ radius: 400 }).counts.inRadius,
  };
  gt(r.far, r.near);
});

test("the kinds filter narrows results without changing lap totals", async () => {
  await load();
  const all = g.apex.scene({ radius: 300, limit: 200 });
  const trees = g.apex.scene({ radius: 300, limit: 200, kinds: ["tree"] });
  const r = { allN: all.counts.inRadius, treeN: trees.counts.inRadius,
              kinds: [...new Set(trees.props.map((p) => p.kind))],
              lapTotalSame: all.counts.lapTotal === trees.counts.lapTotal };
  deepEq(r.kinds, ["tree"]);
  lt(r.treeN, r.allN);
  assert.equal(r.lapTotalSame, true);
});

test("truncation is reported rather than hidden", async () => {
  await load();
  const s = g.apex.scene({ radius: 300, limit: 3 });
  assert.equal(s.props.length, 3);
  gt(s.truncated, 0);
  assert.equal(s.truncated, s.counts.inRadius - 3);
});

test("a street circuit has buildings and no trees", async () => {
  await load("monaco");
  const by = g.apex.scene({ radius: 200 }).counts.byKindLapTotal;
  gt(by.building, 0);
  assert.equal(by.tree || 0, 0);
});

test("floodlight masts come through with their fixture kind", async () => {
  await load("monza");
  const lamps = g.apex.scene({ radius: 300 }).lamps;
  gt(lamps.length, 0);
  for (const l of lamps) {
    assert.equal(typeof l.kind, "string");
    lte(l.distM, 300);
  }
});

// ── visible() ───────────────────────────────────────────────────────────────
// "reports scenery chunks inside the camera frustum" is NOT here — see the
// header: it reads the GLX chunk index the harness's renderer stub never builds.

test("the player car projects near the centre of frame", async () => {
  await load();
  renderFrames();
  const p = g.apex.scene({ visible: true }).cars.find((c) => c.isPlayer);
  assert.equal(p.inFrame, true);
  gt(p.screenPct[0], 20);
  lt(p.screenPct[0], 80);
  gt(p.screenPct[1], 20);
  lt(p.screenPct[1], 80);
  lt(p.distM, 40);
});

test("screenPct is null for anything not in frame", async () => {
  await load();
  renderFrames();
  const cars = g.apex.scene({ visible: true }).cars;
  const off = cars.filter((c) => !c.inFrame);
  gt(off.length, 0);
  for (const c of off) assert.equal(c.screenPct, null);
  for (let i = 1; i < cars.length; i++) gte(cars[i].distM, cars[i - 1].distM);
});

test("a corner behind the camera is kept, flagged, and bears past 90 deg", async () => {
  await load("monza", 0.05, 60);
  renderFrames();
  const cs = g.apex.scene({ visible: true }).corners;
  const behind = cs.find((c) => c.behindCamera);
  truthy(behind);
  assert.equal(behind.screenPct, null);
  assert.equal(behind.inFrame, false);
  gt(Math.abs(behind.bearingDeg), 90);
});

test("headless is flagged, because the frame is then stale", async () => {
  await load();
  renderFrames();
  g.apex.headless(true);
  const v = g.apex.scene({ visible: true });
  g.apex.headless(false);
  assert.equal(v.framePending, true);
  contains(v.warning, "stale");
});

// ── terminal() ──────────────────────────────────────────────────────────────

test("splits done into a reason", async () => {
  await load();
  const t = g.apex.terminal();
  assert.equal(typeof t.done, "boolean");
  assert.equal(t.done, false);
  assert.equal(t.reason, null);
});

test("reports finished after the race ends", async () => {
  await load();
  g.apex.finishRace();
  const t = g.apex.terminal();
  assert.equal(t.reason, "finished");
  assert.equal(t.done, true);
});
