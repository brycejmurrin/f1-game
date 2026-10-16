import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root = path.resolve(new URL('../..', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const copy = (v) => JSON.parse(JSON.stringify(v));
function dataHarness(request = () => Promise.reject(new Error('offline'))) {
  const disk = new Map(); const ctx = vm.createContext({ Log: { info() {}, warn() {} }, F1API: { request, cancelAll() {} }, localStorage: { getItem: (k) => disk.get(k) || null, setItem: (k, v) => disk.set(k, v), removeItem: (k) => disk.delete(k) } });
  for (const f of ['js/core/mat4.js', 'js/race/real-race.js', 'js/race/real-replay.js', 'js/data/real-race-tab.js']) vm.runInContext(read(f), ctx, { filename: f });
  return { D: vm.runInContext('DataRealRace', ctx), R: vm.runInContext('RealReplay', ctx), ctx, disk };
}
function rawStatus(flag) { return { session: { session_key: 1, date_start: '2026-01-01T00:00:00Z' }, drivers: [{ driver_number: 44, name_acronym: 'HAM' }], laps: [1, 2].map((n) => ({ driver_number: 44, lap_number: n, lap_duration: 90, date_start: new Date(Date.UTC(2026, 0, 1) + (n - 1) * 90000).toISOString() })), result: [{ driver_number: 44, position: flag ? null : 1, number_of_laps: 2, [flag || 'fin']: true }] }; }
test('completed-distance DSQ never generates an invented OUT highlight; true DNF still does', () => {
  const { D, R } = dataHarness();
  const dsq = D.build(rawStatus('dsq'), null, []); assert.equal(dsq.drivers[0].dsq, true); assert.equal(dsq.drivers[0].outT, undefined); assert.equal(R.highlightsFor(dsq).filter((e) => e.kind === 'out').length, 0);
  const dnf = D.build(rawStatus('dnf'), null, []); assert.equal(R.highlightsFor(dnf).find((e) => e.kind === 'out').lap, 3);
  const dnsRaw = rawStatus('dns'); dnsRaw.laps = []; dnsRaw.result[0].number_of_laps = 0;
  assert.equal(R.highlightsFor(D.build(dnsRaw, null, [])).filter((e) => e.kind === 'out').length, 0);
});
test('only comparisons downstream of filled laps are marked approximate, without changing cumulative simulation times', () => {
  const { D, ctx } = dataHarness(); const script = { drivers: [{ num: 1, code: 'A', laps: [90, 90, 90], stints: [] }, { num: 2, code: 'B', laps: [91, null, 92], stints: [] }, { num: 3, code: 'C', laps: [92, 92, 92], stints: [] }] };
  ctx.script = script; const before = vm.runInContext('JSON.stringify(RealRace.cumTable(script))', ctx);
  assert.equal(D.lapBoard(script, 1).every((r) => !r.gapApproximate), true);
  const board = D.lapBoard(script, 3); assert.equal(board.find((r) => r.num === 2).gapApproximate, true); assert.equal(board.find((r) => r.num === 3).gapApproximate, false);
  assert.equal(vm.runInContext('JSON.stringify(RealRace.cumTable(script))', ctx), before);
});
test('explicit refresh bypasses raw cache and failed refresh preserves previous usable cached script', async () => {
  const seen = []; const { D, disk } = dataHarness((url, ttl, options) => { seen.push(options); return Promise.reject(new Error('offline')); });
  const script = D.build(rawStatus(null), null, []); assert.ok(Date.parse(script.fetchedAt)); D.remember(script);
  const tab = D.create({}); const hit = await tab.scriptFor(1); assert.equal(hit.provenance, 'cached'); const before = disk.get(D.CACHE_KEY + 1);
  await assert.rejects(tab.scriptFor(1, true), /offline/); assert.equal(disk.get(D.CACHE_KEY + 1), before); assert.ok(seen.length && seen.every((o) => o.cache === false));
});