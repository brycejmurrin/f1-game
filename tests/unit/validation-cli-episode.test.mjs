// validation-cli-episode.test.mjs — bounded negative contracts: an invalid or uncovered
// request cannot report green. tools/check/episode-diff.mjs: an episode request is bounds-checked before boot, its evidence envelope is checked, and headless is restored on every error.
// Regrouped per tool out of validation-cli.test.mjs (#3043 T5-30), assertions unchanged.
// Run: node --test tests/unit/validation-cli-episode.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { episodeLeaks, snapshot, verdict } from "../../tools/check/episode-diff.mjs";
import { cli } from "../helpers/validation-cli.mjs";

const mockGame = (overrides = {}) => {
  const headless = [];
  const g = { G: { cars: [{ code: "AAA", speed: 0 }] }, headless, close() {} };
  g.apex = {
    headless(v) { headless.push(v); }, reset() { return { ok: true }; },
    rollout() { return { ran: { ticks: 6 }, distanceM: 12, speedKph: { min: 1, max: 2, mean: 1.5, final: 2 }, to: { frac: .02, lap: 0 } }; },
    field() { return { positions: g.G.cars.map((c) => ({ code: c.code, pace: 1 })) }; },
    ...overrides,
  };
  return g;
};

test("episode requests validate numeric bounds before boot or headless mutation", async () => {
  for (const opts of [{ seconds: NaN }, { seconds: 0 }, { seconds: 121 }, { episodes: 1 }, { episodes: 2.5 }, { seed: Infinity }]) {
    const game = mockGame();
    await assert.rejects(episodeLeaks({ ...opts, game }), /seconds|episodes|seed/);
    assert.deepEqual(game.headless, []);
  }
  const result = cli("tools/check/episode-diff.mjs", ["--seconds", "abc", "--json"]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).ok, false);
});

test("episode evidence checks rollout envelopes, finite digest and field count; restores headless on errors", async () => {
  for (const rollout of [null, { ok: false }, { ran: { ticks: 0 } }, { ran: { ticks: 1 }, distanceM: NaN }]) {
    const game = mockGame({ rollout: () => rollout });
    await assert.rejects(episodeLeaks({ game }), /Rollout/);
    assert.deepEqual(game.headless, [true, false]);
  }
  const game = mockGame({ field: () => ({ positions: [] }) });
  await assert.rejects(episodeLeaks({ game }), /Field/);
  assert.deepEqual(game.headless, [true, false]);
  const valid = await episodeLeaks({ game: mockGame() });
  assert.equal(valid.digestsMatch, true);
  assert.equal(valid.episodesChecked, 3);
  assert.equal(valid.carsChecked, 1);
});

test("episode rejects an empty or changing car field and a failed reset", async () => {
  const empty = mockGame(); empty.G.cars = [];
  await assert.rejects(episodeLeaks({ game: empty }), /empty field/);
  const changed = mockGame(); let resets = 0;
  changed.apex.reset = () => { if (++resets === 2) changed.G.cars.push({ code: "BBB" }); return { ok: true }; };
  await assert.rejects(episodeLeaks({ game: changed }), /Car count/);
  await assert.rejects(episodeLeaks({ game: mockGame({ reset: () => false }) }), /reset failed/);
});

// #5329 S29(d): an object only one car holds is walked one level; a shared one stays a tag.
test("snapshot walks one level into an object the car owns alone, never a shared one", () => {
  const team = { name: "T", points: 3 };
  const cars = [{ code: "AAA", team, ctl: { acc: 0.5, lane: null, sub: {} }, trail: [1, 2], gap: undefined },
                { code: "BBB", team, ctl: { acc: 0 }, trail: [], gap: 1 }];
  assert.deepEqual(snapshot(cars), [
    { code: "AAA", team: "<object>", ctl: "<object>", "ctl.acc": 0.5, "ctl.lane": null, "ctl.sub": "<object>",
      trail: "<array:2>", gap: "<undefined>" },
    { code: "BBB", team: "<object>", ctl: "<object>", "ctl.acc": 0, trail: "<array:0>", gap: 1 },
  ]);
});

test("a leak inside a car-owned object is reported, and a found leak fails the verdict", async () => {
  const g = mockGame(); g.G.cars[0].ctl = { acc: undefined };
  let resets = 0;
  g.apex.reset = () => { if (++resets === 2) g.G.cars[0].ctl.acc = 0.25; return { ok: true }; };
  const { digestsMatch, rows } = await episodeLeaks({ game: g, episodes: 2 });
  assert.equal(digestsMatch, true);
  assert.deepEqual(rows, [{ field: "ctl.acc", cars: 1,
    example: { car: 0, code: "AAA", field: "ctl.acc", cold: "<undefined>", warm: 0.25 } }]);
  assert.deepEqual(verdict(true, rows), { ok: false, exit: 1 });
  assert.deepEqual(verdict(true, []), { ok: true, exit: 0 });
  assert.deepEqual(verdict(false, []), { ok: false, exit: 1 });
});
