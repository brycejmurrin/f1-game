// A GameCtx-checked fake of the G façade (#5982).
//
// A hand-rolled `{ … }` fake can invent members the real G lacks (`isRaining`
// was fed to six tests; G has no such member), and then a test models a
// façade that does not exist. `fakeG(partial)` refuses any own key that is
// not a member of `interface GameCtx` in types/game-ctx.d.ts — the same
// parser the parity check uses (tools/check/check-gctx.mjs scanDts) — and
// closes the object like js/game.js closes the real G, so a module under test
// that writes a non-member throws too. Keep test-only recorders (a list of
// announcements, caught cautions) in the test's own closure, not on the fake.
import { scanDts } from "../../tools/check/check-gctx.mjs";

let members = null;

/** The member names of `interface GameCtx` (cached). */
export function gameCtxMembers() {
  if (!members) members = new Set(scanDts().members.keys());
  return members;
}

/** The own keys of `obj` that GameCtx does not declare (getters are not invoked). */
export function nonMembers(obj) {
  const known = gameCtxMembers();
  return Object.getOwnPropertyNames(obj).filter((k) => !known.has(k));
}

/**
 * @template {object} T
 * @param {T} partial  the members this test needs, real names only
 * @param {{ open?: boolean }} [opts]  open: leave the fake extensible (default: closed, like the real G)
 * @returns {T}
 */
export function fakeG(partial, opts = {}) {
  const bad = nonMembers(partial);
  if (bad.length) {
    throw new TypeError(`fakeG: not GameCtx members (types/game-ctx.d.ts): ${bad.join(", ")} — `
      + "a fake may only carry members the real G has; keep test recorders outside the fake");
  }
  return opts.open ? partial : Object.preventExtensions(partial);
}

/**
 * The NetPlay grid fake the net tests share: `n` cars, car `local` is the
 * player (-1: a spectator). `over` adds or replaces members (still checked).
 */
export function netStubG(n = 2, local = 0, over = {}) {
  const cars = Array.from({ length: n }, (_, i) => ({
    idx: i, local: i === local, human: i === local, isPlayer: i === local,
    s: i * 10, x: 0, px: 0, pz: 0, speed: 0, head: 0, lap: 0, mods: null,
    name: "D" + i, code: "D" + i, driverId: "drv" + i,
  }));
  return fakeG({
    cars, player: local >= 0 ? cars[local] : null,
    track: { total: 5000, n: 500 },
    lapsTarget: 3, raceT: 20, netNow: null, netStart: null, COUNTDOWN_S: 3,
    wireId: (car) => car.idx,
    setCarRole(car, human, isLocal) { car.human = human; car.local = isLocal; },
    worldFromTrack: (s, x) => ({ x, z: s }),
    announce() {},
    ...over,
  });
}
