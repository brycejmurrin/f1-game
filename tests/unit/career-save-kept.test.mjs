/* career-save-kept.test.mjs — #5657 rows 2–6: a career DECISION is kept durably
 * or not at all.
 *
 * save() answered the career object on every path, so acceptOffer / renewHire /
 * hireDriver / grant / upgradeFacility / start / chooseSponsor / setIdentityValue
 * reported a signing, hire or purchase as done after a refused write, and the
 * player lost it at the next reload (a revision conflict did it silently). Each
 * now goes through Career's commit(): write with requireDurable, restore the
 * career in place on refusal, answer falsy. start() is the one exception on a
 * FULL store: the new career plays session-only under the "Saving unavailable"
 * banner (persistence-dom.spec); a REFUSED write still opens no hub.
 *
 * The guard runs every decision twice on the REAL GameStore (js/core/store.js):
 * healthy storage proves the call changes the save (or the refusal half proves
 * nothing), then a store that refuses the write proves the call answers falsy,
 * RAM is unchanged, and a reload reads the save from before. Every career-slot
 * write a decision makes must ask for requireDurable, so a new decision that
 * slips back to a bare save() fails here.
 *
 * Run: node --test tests/unit/career-save-kept.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { i18nStub } from "../helpers/i18n-stub.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOGO = "data:image/png;base64,AAAA";

function boot(disk, state) {
  const ctx = vm.createContext({ I18n: i18nStub(),
    Math, JSON, Object, Array, String, Number, Date, Set, Map, Promise,
    isNaN, isFinite, parseInt, console, queueMicrotask, setTimeout, clearTimeout,
    localStorage: {
      getItem: (k) => (disk.has(k) ? disk.get(k) : null),
      removeItem: (k) => disk.delete(k),
      setItem: (k, v) => {
        if (state.full) { const e = new Error("full"); e.name = "QuotaExceededError"; throw e; }
        disk.set(k, String(v));
      },
    },
    window: { addEventListener() {} },
    Log: { warn() {}, info() {} },
    Teams: {
      POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      isReal: (t) => !!t && !t.custom && !t.legends,
      LIST: [
        { id: "custom", tier: 2, custom: true, stats: {}, drivers: [{ name: "You", code: "YOU", num: 99 }] },
        { id: "haas", tier: 4, stats: {}, drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }] },
        { id: "sauber", tier: 3, stats: {}, drivers: [{ name: "C", code: "CCC", num: 3 }, { name: "D", code: "DDD", num: 4 }] },
      ],
    },
    Tracks: { LIST: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], SEASON: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }], seasonIndex: () => 0 },
    Parts: { CATALOG: [], getFactorySetup: () => ({}), getCost: () => 0 },
  });
  for (const f of ["js/core/hash32.js", "js/core/mat4.js", "js/data/driver-ratings.js", "js/career/save-migrate.js",
    "js/core/store.js", "js/career/team-identity.js", "js/career/career-planning.js", "js/career/career.js"])
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
  const store = vm.runInContext("GameStore.store", ctx);
  const write = store.write.bind(store);
  // Every career-slot write, with the options it asked for.
  const writes = [];
  store.write = (k, v, o) => {
    if (!String(k).startsWith("career.")) return write(k, v, o);
    writes.push({ k, o: o || {} });
    // state.refuse: the store refuses the career write outright, as a revision conflict does.
    return state.refuse ? { ok: false, durable: false, reason: "conflict" } : write(k, v, o);
  };
  return { Career: vm.runInContext("Career", ctx), store, writes };
}

// A healthy career on disk to act on; `setup` tunes it through a durable write.
function harness(flavour, setup) {
  const disk = new Map(), state = { full: false };
  const h = boot(disk, state);
  h.Career.start(flavour === "myteam" ? { flavour, teamId: "custom", seed: 7 } : { flavour, teamId: "haas", seed: 7 });
  h.Career.engage(true);
  h.Career.data().money = 1e6;   // every priced decision is affordable
  if (setup) setup(h.Career.data());
  h.Career.save();
  assert.equal(h.Career.saveStatus().durable, true, "the fixture must start on a durable save");
  return Object.assign(h, { disk, state,
    reload() { const r = boot(new Map(disk), { full: false }); r.Career.load(); r.Career.engage(true); return r.Career; } });
}

const snap = (Career) => JSON.stringify(Career.data());
// load() normalises a save (migrateCareer), so compare reload with reload.
const reloaded = (h) => JSON.stringify(h.reload().data());
const offers = (c) => { c.offers = [{ teamId: "sauber", years: 2, salary: 120, goal: { type: "teamPos", value: 6 } }]; };
const renewal = (c) => { c.roster[0].pending = { kind: "renew", ask: 77 }; };

// [name, flavour, setup, act]: act answers the call's return value.
const DECISIONS = [
  ["grant", "driver", null, (C) => C.grant(500)],
  ["research", "driver", null, (C) => C.research({ id: "wing", cost: 1 })],
  ["upgradeFacility", "driver", null, (C) => C.upgradeFacility()],
  ["chooseObjective", "driver", null, (C) => C.chooseObjective(2)],
  ["setAmbition", "driver", offers, (C) => C.setAmbition(2) === 2],
  ["acceptOffer", "driver", offers, (C) => C.acceptOffer(0)],
  ["chooseStake", "driver", null, (C) => C.planning().chooseStake(true)],
  ["chooseSponsor", "myteam", null, (C) => C.planning().chooseSponsor(1)],
  ["renewHire", "myteam", renewal, (C) => C.renewHire(2)],
  ["hireDriver", "myteam", null, (C) => C.hireDriver(C.freeAgents().find((a) => a.code !== C.data().roster[0].code).code, 2)],
  ["setIdentityValue", "myteam", null, (C) => C.setIdentityValue("customLogo", LOGO)],
];

for (const [name, flavour, setup, act] of DECISIONS) {
  test(`${name}: healthy storage keeps the decision; a refused write answers falsy and changes nothing (#5657)`, () => {
    const ok = harness(flavour, setup);
    const before = reloaded(ok);
    ok.writes.length = 0;
    assert.ok(act(ok.Career), `${name} must succeed on healthy storage, or the refusal half proves nothing`);
    assert.notEqual(reloaded(ok), before, `${name} must change the save a reload reads`);
    assert.ok(ok.writes.length > 0 && ok.writes.every((w) => w.o.requireDurable === true),
      `${name} must write only with requireDurable: ${JSON.stringify(ok.writes)}`);

    const h = harness(flavour, setup);
    const disk = JSON.stringify([...h.disk]);
    const ram = snap(h.Career), was = reloaded(h);
    h.state.full = true;
    assert.ok(!act(h.Career), `${name} must answer falsy when the write is refused`);
    assert.equal(h.Career.saveStatus().durable, false);
    assert.equal(snap(h.Career), ram, "RAM is the career from before the tap");
    assert.equal(JSON.stringify([...h.disk]), disk, "disk is untouched");
    assert.equal(h.store.writeFailed(), null, "a refused decision queues no RETRY SAVE of the change");
    assert.equal(reloaded(h), was, "the reload reads the save from before");
  });
}

test("acceptOffer refused: the old contract and the offers stay on the table (#5657)", () => {
  const h = harness("driver", offers);
  const deal = JSON.stringify(h.Career.data().deal);
  h.state.full = true;
  assert.equal(h.Career.acceptOffer(0), null);
  assert.equal(h.Career.data().team, "haas");
  assert.equal(JSON.stringify(h.Career.data().deal), deal);
  assert.equal(h.Career.data().offers.length, 1);
});

test("start on full storage plays on session-only under the Saving unavailable banner; disk keeps the old career", () => {
  // persistence-dom.spec pins this: with storage full the career still exists for the
  // session, and RETRY SAVE / the recovery EXPORT keep it. The save on disk is untouched.
  const h = harness("driver");
  const was = reloaded(h), disk = JSON.stringify([...h.disk]);
  h.state.full = true;
  assert.ok(h.Career.start({ flavour: "myteam", teamId: "custom", seed: 9 }));
  assert.equal(h.Career.data().flavour, "myteam");
  assert.equal(h.Career.saveStatus().durable, false);
  assert.equal(h.store.writeFailed(), "QuotaExceededError", "the banner (RETRY SAVE, EXPORT) is up");
  assert.equal(JSON.stringify([...h.disk]), disk);
  assert.equal(reloaded(h), was);
});

test("start refused by the store: no hub career, the one being left and its slot pointer come back (#5657)", () => {
  const h = harness("driver");
  const ram = snap(h.Career), was = reloaded(h);
  const slot = JSON.stringify(h.Career.slot());
  h.state.refuse = true;
  assert.equal(h.Career.start({ flavour: "myteam", teamId: "custom", seed: 9 }), null);
  assert.equal(h.Career.saveStatus().reason, "conflict");
  assert.equal(JSON.stringify(h.Career.slot()), slot);
  assert.equal(snap(h.Career), ram, "Career.active() is the career on disk, not the unsaved new one");
  h.state.refuse = false;
  assert.equal(reloaded(h), was);
});

test("start refused with no career loaded leaves none active (#5657)", () => {
  const disk = new Map(), state = { refuse: true };
  const { Career } = boot(disk, state);
  assert.equal(Career.start({ flavour: "driver", teamId: "haas", seed: 7 }), null);
  assert.equal(Career.active(), false);
  assert.equal([...disk.keys()].some((k) => k.startsWith("apex26.career.")), false);
});
