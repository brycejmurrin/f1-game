// validation-cli-episode.test.mjs — bounded negative contracts: an invalid or uncovered
// request cannot report green. tools/check/episode-diff.mjs: an episode request is bounds-checked before boot, its evidence envelope is checked, and headless is restored on every error.
// Regrouped per tool out of validation-cli.test.mjs (#3043 T5-30), assertions unchanged.
// Run: node --test tests/unit/validation-cli-episode.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { episodeLeaks } from "../../tools/check/episode-diff.mjs";
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
