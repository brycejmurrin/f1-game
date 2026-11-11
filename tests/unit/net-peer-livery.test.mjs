// @doc VS FRIEND paint (#5037): HELLO carries the sender's livery, refused whole on any violation; the friend's car is stamped with it.
// net-peer-livery.test.mjs — a friend's car used to wear MY stored paint for
// their team: no net payload carried a livery. Three seams, each failing on the base:
//   1. the wire: LobbyRoster.packLivery -> HELLO `liv` -> cleanHello (a peer's
//      word: colours clamped, any violation refuses the whole livery; never in
//      an invite code);
//   2. the stamp: LobbyRoster.paintField marks the friend's car (car.netPaint)
//      and no other;
//   3. the draw: the REAL js/car/car-draw.js, driven the way game.js's race
//      loop drives it (`c.team` at every entry), builds the friend's body from
//      the sent colours while the same team's other car keeps the local paint.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { carDrawVm } from "../helpers/car-draw-vm.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
function boot() {
  const v = carDrawVm({});
  for (const rel of ["js/car/liveries.js", "js/net/lobby-roster.js"])
    vm.runInContext(read(rel).replace(/^const\b/gm, "var"), v.ctx, { filename: absSrc(rel) });
  return v;
}
const wire = (o) => JSON.parse(JSON.stringify(o));
const GOLD = [0.9, 0.7, 0.1], TEAL = [0.1, 0.6, 0.6];

test("HELLO carries a custom livery sparse; the factory one sends nothing (#5037)", () => {
  const { ctx } = boot(), R = ctx.LobbyRoster;
  assert.equal(R.packLivery({ id: "default", c1: GOLD, c2: TEAL }), null, "factory paint is not sent");
  const sent = wire(R.packLivery({ id: "cust-1", name: "Mine", c1: [0.123456, 0.5, 1], c2: TEAL, stripe: GOLD, halo: null, wing: undefined }));
  assert.deepEqual(sent, { c1: [0.123, 0.5, 1], c2: TEAL, stripe: GOLD }, "set fields only, colours to 3 decimals, no id or name");
  // The lobby's HELLO: the fitted id, looked up in the team's list.
  const G = { teamIdx: 0, getLiveryId: () => "cust-1", getLiveries: () => [{ id: "default", c1: TEAL, c2: TEAL }, null, { id: "cust-1", c1: GOLD, c2: TEAL }] };
  assert.deepEqual(wire(R.withLivery({ team: "t" }, G)), { team: "t", liv: { c1: GOLD, c2: TEAL } });
  assert.deepEqual(wire(R.withLivery({ team: "t" }, Object.assign(G, { getLiveryId: () => "default" }))), { team: "t" });
  assert.deepEqual(wire(R.withLivery({ team: "t" }, Object.assign(G, { getLiveryId: () => "gone" }))), { team: "t" }, "a dangling id sends nothing");
  const all = { id: "x", c1: GOLD, c2: TEAL };
  for (const k of ctx.Liveries.FIELDS) all[k] = [0.333, 0.666, 0.999];
  assert.ok(JSON.stringify(R.packLivery(all)).length < 4096, "every field set still fits in 4 KB");
});

test("a peer's livery is checked whole on receipt and refused whole on any violation (#5037)", () => {
  const { ctx } = boot(), R = ctx.LobbyRoster;
  const hello = (liv) => R.cleanHello(wire({ team: "ferrari", driver: 0, parts: null, liv }));
  assert.deepEqual(wire(hello({ c1: [7, -3, 0.5], c2: TEAL, stripe: [2, 2, 2], pod: GOLD }).liv),
    { c1: [1, 0, 0.5], c2: TEAL, stripe: [1, 1, 1], pod: GOLD }, "every colour is clamped to 0..1");
  const ok = { c1: GOLD, c2: TEAL };
  const bad = {
    "no base colours": { c1: "red", c2: TEAL },
    "a non-finite colour": { c1: [1e999, 0, 0], c2: TEAL },
    "a four-number colour": { c1: [1, 0, 0, 1], c2: TEAL },
    "an unknown key": { ...ok, evil: "x" },
    "an id (the receiver names it)": { ...ok, id: "mine" },
    "a constructor key": { ...ok, constructor: "y" },
    "a prototype-member enum value": { ...ok, finShape: "constructor" },
    "a string over 64 chars": { ...ok, halo: "h".repeat(65) },
    "an object in a field": { ...ok, nose: { r: 1 } },
    "a mixed-type colour": { ...ok, wing: [1, "a", 0] },
    "a number in a field": { ...ok, pod: 7 },
  };
  for (const [why, liv] of Object.entries(bad)) assert.equal(hello(liv).liv, undefined, `${why}: the whole livery is refused`);
  assert.equal(R.cleanHello(JSON.parse('{"team":"ferrari","driver":0,"liv":{"c1":[1,0,0],"c2":[0,0,1],"__proto__":{"stripe":[1,1,1]}}}')).liv,
    undefined, "a __proto__ key: refused");
  assert.equal(hello([GOLD, TEAL]).liv, undefined, "an array is not a livery");
  const fat = { ...ok };
  for (let i = 0; i < 400; i++) fat["k" + i] = GOLD;
  assert.equal(hello(fat).liv, undefined, "more keys than a livery has: refused");
  assert.equal(hello(undefined).team, "ferrari", "a HELLO with no livery is still a HELLO");
  assert.equal(R.cleanCodeProfile({ team: "ferrari", driver: 0, liv: ok }).liv, undefined, "an invite code never carries paint");
  // A refused livery reaches no cache key and no build: the car is the factory one.
  const team = ctx.Teams.LIST.find((t) => t.id === "ferrari");
  assert.equal(R.peerPaint({ team: "ferrari", liv: { ...ok, evil: 1 } }, team).tag, "~pf");
});

test("only a friend's car is stamped: sent paint, or factory when none was sent (#5037)", () => {
  const v = boot(), R = v.ctx.LobbyRoster;
  const cars = v.field((_c, i) => i * 10), me = v.G.player;
  const friend = cars.find((c) => c.team !== me.team), mate = cars.find((c) => c.team === friend.team && c !== friend);
  const profile = R.cleanHello(wire({ team: friend.team.id, driver: 0, parts: null, liv: R.packLivery({ id: "c", c1: GOLD, c2: TEAL }) }));
  R.paintField(cars, [{ car: friend, profile }], () => true);
  assert.deepEqual(wire(friend.netPaint.livery.c1), GOLD);
  assert.equal(friend.netPaint.livery.stripe, null, "the full shape: unset fields are null");
  assert.match(friend.netPaint.tag, /^~p[0-9a-z]+$/);
  assert.deepEqual(cars.filter((c) => c.netPaint), [friend], "no other car is stamped (AI paint is resolveLivery's policy)");
  // A friend in factory colours while this phone holds a custom livery for their team.
  R.paintField(cars, [{ car: friend, profile: R.cleanHello({ team: friend.team.id, driver: 0 }) }], () => false);
  assert.equal(friend.netPaint.tag, "~pf", "no livery sent = factory, not my stored paint");
  assert.equal(friend.netPaint.livery.id, "default");
  // The same, with this phone on factory paint for that team: nothing to do.
  R.paintField(cars, [{ car: friend, profile: R.cleanHello({ team: friend.team.id, driver: 0 }) }], () => true);
  assert.equal(friend.netPaint, undefined);
  // No profile (a late HELLO): left to the local store, and a new race clears old stamps.
  mate.netPaint = { stale: true };
  R.paintField(cars, [{ car: friend, profile: null }], () => true);
  assert.equal(friend.netPaint, undefined); assert.equal(mate.netPaint, undefined);
});

test("car-draw builds the friend's car from the sent paint, and only that car (#5037)", () => {
  const v = boot(), R = v.ctx.LobbyRoster, cd = v.carDraw;
  const seen = [], build = v.ctx.Car3D.build;
  v.ctx.Car3D.build = (c1, c2, o) => { seen.push({ num: o.num, team: o.teamId, c1: Array.from(c1), id: o.livery && o.livery.id }); return build(c1, c2, o); };
  const cars = v.field((_c, i) => i * 10), me = v.G.player;
  const friend = cars.find((c) => c.team !== me.team), mate = cars.find((c) => c.team === friend.team && c !== friend);
  const profile = R.cleanHello(wire({ team: friend.team.id, driver: 0, parts: null, liv: R.packLivery({ id: "c", c1: GOLD, c2: TEAL }) }));
  R.paintField(cars, [{ car: friend, profile }], () => true);
  // game.js's loop: c.team at every entry, team-only calls after the body.
  cd.beginDecals();
  const bodyF = cd.teamBodyMesh(friend.team, friend), stF = cd.teamDecalState(friend.team, false);
  const bodyM = cd.teamBodyMesh(mate.team, mate), stM = cd.teamDecalState(mate.team, false);
  const of = (c) => seen.filter((b) => b.num === c.num && b.team === c.team.id);
  assert.deepEqual(of(friend).map((b) => b.c1), [GOLD], "the friend's body is built once, in the sent colour");
  assert.equal(of(friend)[0].id, "peer");
  assert.deepEqual(of(mate).map((b) => b.c1), [[1, 0, 0]], "the same team's other car keeps the local paint");
  assert.notEqual(bodyF, bodyM);
  assert.notEqual(stF, stM, "a team-only entry called for the friend's car reads the friend's paint row");
  assert.equal(cd.teamBodyMesh(friend.team, friend), bodyF, "a second frame is a cache hit");
  assert.equal(seen.length, 2);
  // A warm (no car loop open) builds the friend's paint too, and leaves nothing behind.
  cd.flushDecals(false);
  assert.equal(cd.teamBodyMesh(friend.team, friend), bodyF);
  assert.equal(cd.teamDecalState(friend.team, false), stM, "outside a car loop a team-only call reads the local row");
});
