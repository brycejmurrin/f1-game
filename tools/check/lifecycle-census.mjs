#!/usr/bin/env node
// @doc Offline VM lifecycle census: typed resource snapshots and diffs across entry, reset, cancellation and failed boot.
// @skill check-changes
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { ROOT } from '../shot/capture-contract.mjs';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCaptureArgs, usage, invoked } from '../shot/capture-contract.mjs';
const { createGame } = createRequire(import.meta.url)('../lib/game-vm.cjs');
export function snapshot(game, phase) {
  const resources = game.resourceSnapshot();
  const info = game.apex.info();
  return { phase, resources, state: info.state, track: info.track, owners: { raceCars: game.G.cars?.length || 0, pendingRace: !!game.G.raceAssetsPending, caution: game.apex.caution(), debris: game.apex.debris(), incident: game.apex.incident() } };
}
export function resourceDiff(before, after) {
  return Object.fromEntries(['timers', 'rafFrames', 'rejectionListeners'].map((key) => [key, after.resources[key] - before.resources[key]]));
}
export async function pendingWatchCancellation() {
  let release, pendingRequests = 0, launches = 0;
  const context = vm.createContext({
    F1API: { locationData: () => { pendingRequests++; return new Promise((resolve) => { release = (value) => { pendingRequests--; resolve(value); }; }); } },
    RealRace: { launch: () => { launches++; return true; } },
    Log: { info() {}, warn() {} },
  });
  vm.runInContext(readFileSync(resolve(ROOT, 'js/data/real-race-tab.js'), 'utf8'), context);
  const Data = vm.runInContext('DataRealRace', context);
  const tab = Data.create({ sel: { meta: { sessionKey: 987654 } }, isOpen: () => true });
  const script = { sessionKey: 987654, t0: 1700000000000, laps: 1, drivers: [{ num: 1, code: 'FIX', laps: [60], lapStart: [0] }] };
  tab.setSeat('FIX'); tab.watch(script, null, 1, false);
  for (let i = 0; i < 16 && !release; i++) await new Promise((resolve) => setImmediate(resolve));
  if (!release) throw new Error('census fixture WATCH did not create the pending request');
  const before = { pendingRequests, launches, cachedTraces: !!tab.traces() };
  tab.cancel();
  release([{ date: script.t0, x: 100, y: 100 }]);
  for (let i = 0; i < 16; i++) await new Promise((resolve) => setImmediate(resolve));
  const after = { pendingRequests, launches, cachedTraces: !!tab.traces() };
  return { path: 'DataRealRace.watch -> pending fixture F1API.locationData -> cancel -> resolve stale completion', before, after, ok: before.pendingRequests === 1 && after.pendingRequests === 0 && after.launches === 0 && !after.cachedTraces };
}
export async function lifecycleCensus(opts) {
  const rows = []; let game;
  try {
    game = await createGame({ search: '?seed=' + opts.seed, carMeshes: false });
    rows.push(snapshot(game, 'before-entry'));
    await game.race(opts.track); game.step(2); rows.push(snapshot(game, 'entry'));
    game.apex.reset(0.1, 30, 0, opts.seed);
    game.G.holdCaution(3, 'lifecycle-census'); game.apex.act({}, 1 / 60, 1);
    game.apex.debris({ burst: 3, sev: 8 }); rows.push(snapshot(game, 'transient-owners-seeded'));
    game.apex.reset(0.1, 30, 0, opts.seed); rows.push(snapshot(game, 'reset'));
    game.G.resetEpisodeOwners(); rows.push(snapshot(game, 'owner-reset'));
  } finally { game?.close(); if (game) rows.push(snapshot(game, 'closed')); }
  const cancellation = await pendingWatchCancellation();
  let failure;
  try { const bad = await createGame({ track: '__census_unknown_track__', carMeshes: false }); bad.close(); failure = { rejected: false }; }
  catch (err) { failure = { rejected: true, error: err.message, resources: err.resources }; }
  const seeded = rows.find((r) => r.phase === 'transient-owners-seeded')?.owners;
  const reset = rows.find((r) => r.phase === 'reset')?.owners;
  const resetClean = seeded?.caution.level === 3 && seeded?.debris.queued === 3 && reset?.caution.level === 0 && reset?.debris.queued === 0 && reset?.incident.count === 0 && reset?.incident.owned === 0;
  const closed = rows.at(-1)?.resources;
  const clean = (r) => r && r.closed && r.timers === 0 && r.rafFrames === 0 && r.rejectionListeners === 0;
  return { schemaVersion: 1, mode: 'vm-no-renderer', requestedSeed: opts.seed, seed: game.apex.seed(), track: opts.track, ok: resetClean && cancellation.ok && clean(closed) && failure.rejected && clean(failure.resources), snapshots: rows, diffs: rows.slice(1).map((row, i) => ({ from: rows[i].phase, to: row.phase, resources: resourceDiff(rows[i], row) })), resetOwners: { ok: resetClean, incidentPhysicalLaunch: 'not-exercised: optional Rapier unavailable in VM' }, cancellation, failedBoot: failure };
}
if (invoked(import.meta.url)) {
  try {
    const opts = parseCaptureArgs(process.argv.slice(2), 'lifecycle-census');
    if (opts.help) console.log(usage('lifecycle-census'));
    else if (opts.plan) console.log(JSON.stringify(opts, null, 2));
    else { const report = await lifecycleCensus(opts); mkdirSync(opts.out, { recursive: true }); writeFileSync(resolve(opts.out, 'census.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
  } catch (err) { console.error(err.message); process.exitCode = 2; }
}
