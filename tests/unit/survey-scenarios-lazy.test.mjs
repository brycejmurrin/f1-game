// @doc shot-survey --list-locations --track builds ONE circuit's scenery rows on a stale catalog; surveys keep the full catalog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { sceneryRowsFor } from '../../tools/lib/survey-scenarios.mjs';

const require = createRequire(import.meta.url);

/** A deps seam that records which source answered. */
function seam(fresh) {
  const calls = { all: 0, one: [] };
  return { calls, deps: {
    fresh: () => fresh,
    all: () => { calls.all++; return [{ track: 'x-a', id: 'x-a/full' }, { track: 'x-b', id: 'x-b/full' }]; },
    one: (id) => { calls.one.push(id); return [{ track: id, id: `${id}/one` }]; },
  } };
}

test('a one-track listing on a stale catalog builds only that circuit, once, and never the full catalog', () => {
  const { calls, deps } = seam(false);
  const first = sceneryRowsFor('x-a', { oneTrack: true, deps });
  const again = sceneryRowsFor('x-a', { oneTrack: true, deps });
  assert.equal(calls.all, 0, 'the all-circuit rebuild is the cost this path avoids');
  assert.deepEqual(calls.one, ['x-a'], 'one build per circuit per process');
  assert.deepEqual(again, first);
});

test('a fresh receipt, or any caller that is not a one-track listing, reads the full catalog', () => {
  for (const [fresh, oneTrack] of [[true, true], [false, false], [true, false]]) {
    const { calls, deps } = seam(fresh);
    const rows = sceneryRowsFor('x-b', { oneTrack, deps });
    assert.equal(calls.all, 1, `fresh=${fresh} oneTrack=${oneTrack}`);
    assert.equal(calls.one.length, 0, `fresh=${fresh} oneTrack=${oneTrack}`);
    assert.ok(rows.every((r) => r.track === 'x-b'), 'filtered to the asked circuit');
  }
});

test('a one-circuit build emits the same rows as that circuit inside a multi-circuit build', () => {
  // The full catalog builds every circuit in ONE VM, alphabetically; monza sorts before spa (which carries
  // source viewpoints), so spa built alone must match spa built after another circuit in a shared context.
  const { generate } = require('../../tools/shot/gen-scenery-locations.cjs');
  const alone = generate({ tracks: ['spa'] });
  const shared = generate({ tracks: ['monza', 'spa'] });
  assert.ok(alone.locations.length > 0);
  assert.deepEqual(alone.locations, shared.locations.filter((l) => l.track === 'spa'));
  assert.deepEqual(alone.omitted, shared.omitted.filter((l) => l.track === 'spa'));
});
