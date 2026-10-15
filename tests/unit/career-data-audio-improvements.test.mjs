import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root = path.resolve(new URL('../..', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const copy = (v) => JSON.parse(JSON.stringify(v));
function careerHarness() {
  const disk = new Map(), revisions = new Map();
  const store = { get: (k, d) => disk.has(k) ? copy(disk.get(k)) : d, set(k, v) { disk.set(k, copy(v)); revisions.set(k, (revisions.get(k) || 0) + 1); return true; }, keyRevision: (k) => revisions.get(k) || 0 };
  store.write = (k, v) => ({ ok: store.set(k, v), durable: true });
  const ctx = vm.createContext({ console, Log: { info() {}, warn() {}, debug() {} }, GameStore: { store, CAREER_V: 2, seasonDriverId: (t, i) => t + ':' + i, migrateCareer: (c) => c }, Tracks: { LIST: [{ id: 'a' }], SEASON: [{ id: 'a' }] } });
  ctx.window = ctx;
  for (const f of ['js/core/mat4.js', 'js/core/hash32.js', 'js/physics/consts.js', 'js/data/teams.js', 'js/data/driver-ratings.js', 'js/car/parts.js', 'js/career/team-identity.js', 'js/career/regulations.js', 'js/career/career.js']) vm.runInContext(read(f), ctx, { filename: f });
  vm.runInContext('Teams.LIST.push(Teams.sanitizeCustom(Teams.DEFAULT_CUSTOM))', ctx);
  return { C: vm.runInContext('Career', ctx), ctx, store, disk, Teams: vm.runInContext('Teams', ctx) };
}
test('two MY TEAM identities persist independently and never overwrite GP appearance', () => {
  const { C, store } = careerHarness();
  const team = (name) => ({ id: 'custom', name, short: name.slice(0, 3), color: [1, 0, 0], color2: [0, 0, 1], drivers: [{ name: 'You', code: 'YOU', num: 44 }] });
  store.set('customTeam', team('GP')); C.start({ flavour: 'myteam', slot: 0, seed: 7 }); C.engage(true);
  assert.equal(C.data().team, 'custom');
  assert.equal(C.setIdentityValue('customTeam', team('ALPHA')), true);
  C.start({ flavour: 'myteam', slot: 1, seed: 9 }); C.engage(true); C.setIdentityValue('customTeam', team('BETA'));
  C.useSlot('myteam', 0); assert.equal(C.identityValue('customTeam', null).name, 'ALPHA');
  store.set('customTeam', team('FOREIGN GP')); assert.equal(C.identityValue('customTeam', null).name, 'ALPHA');
  C.useSlot('myteam', 1); assert.equal(C.identityValue('customTeam', null).name, 'BETA');
  C.load(); C.engage(true); assert.equal(C.identityValue('customTeam', null).name, 'BETA');
  C.engage(false); assert.equal(C.identityValue('customTeam', store.get('customTeam')).name, 'FOREIGN GP');
  assert.equal(C.setIdentityValue('customLogo', 'javascript:bad'), false);
});
test('contract comparison is pure and final signing agrees on seat, deal, works parts and cap', () => {
  const { C, ctx } = careerHarness(); C.start({ teamId: 'haas', seed: 7 }); C.engage(true);
  const c = C.data(); c.offers = [{ teamId: 'mclaren', years: 2, salary: 125, goal: { type: 'beatMate', value: 0 } }]; c.owned.push('extra_research');
  const before = JSON.stringify(c), preview = C.offerPreview(0);
  assert.equal(JSON.stringify(c), before, 'preview/cancel changes no career data');
  assert.ok(preview.lostResearch.includes('extra_research'));
  assert.deepEqual(copy(preview.fitted), copy(vm.runInContext("Parts.getFactorySetup(Teams.LIST.find(t=>t.id==='mclaren'))", ctx)), 'preview matches actual unrestricted works build');
  const deal = C.acceptOffer(0, preview); assert.deepEqual(copy(deal), copy(preview.deal));
  assert.equal(C.data().seat, preview.seat); assert.deepEqual(copy(C.data().fitted), copy(preview.fitted));
  assert.equal(C.budget(), preview.cap);
  const mate = C.driverOverride('mclaren', preview.seat === 0 ? 1 : 0);
  assert.equal(mate && mate.code || preview.teammate.code, preview.teammate.code);
});
test('a reviewed contract cannot sign after an offer or career-state change', () => {
  const { C } = careerHarness(); C.start({ teamId: 'haas', seed: 4 }); C.engage(true);
  C.data().offers = [{ teamId: 'haas', years: 1, salary: 80, goal: { type: 'champPos', value: 20 } }];
  const preview = C.offerPreview(0); C.data().offers[0].salary = 81;
  const before = JSON.stringify(C.data()); assert.equal(C.acceptOffer(0, preview), null); assert.equal(JSON.stringify(C.data()), before);
});
test('winter report records actual applied driver/team deltas and reload never reapplies them', () => {
  const { C } = careerHarness(); C.start({ teamId: 'haas', seed: 71 }); C.engage(true);
  C.data().results = [{ r: 0, p: 1, pts: 25, craft: 1 }]; C.data().season.round = 1;
  const beforeDev = copy(C.data().dev); C.rollover();
  const report = copy(C.data().winterReport), developed = copy(C.data().dev);
  assert.equal(report.year, 2026); assert.equal(report.drivers.filter((d) => d.player).length, 1);
  const mine = report.drivers.find((d) => d.player); assert.equal(mine.axes.craft.after - mine.axes.craft.before, mine.axes.craft.delta);
  assert.equal(mine.axes.craft.delta, 3, 'clean season craft applies the bounded +3 rating development');
  assert.notDeepEqual(developed, beforeDev);
  C.load(); assert.deepEqual(copy(C.data().winterReport), report); assert.deepEqual(copy(C.data().dev), developed);
});
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
test('Spotify actual input invalidates pending searches synchronously, including clear', async () => {
  const src = read('js/audio/spotify.js'), pending = [], timers = new Map(); let input, seq = 0;
  const ctx = vm.createContext({ sessionGen: 1, searchRevision: 0, results: [], searchT: null, render() {}, encodeURIComponent, api: () => new Promise((resolve) => pending.push(resolve)), on: (id, event, fn) => { input = fn; }, setTimeout: (fn) => { timers.set(++seq, fn); return seq; }, clearTimeout: (id) => timers.delete(id) });
  vm.runInContext(src.slice(src.indexOf('  function searchPlaylists(q'), src.indexOf('  function playUri(uri) {')) + src.slice(src.indexOf('    on("sp-search", "input",'), src.indexOf('    on("as-sp-playlist",')), ctx);
  const fire = () => { const list = [...timers.values()]; timers.clear(); list.forEach((fn) => fn()); };
  const resolve = async (i, name) => { pending[i]({ ok: true, json: () => Promise.resolve({ playlists: { items: [{ name, uri: name }] } }) }); for (let j = 0; j < 10; j++) await Promise.resolve(); };
  input({ target: { value: 'old' } }); fire(); input({ target: { value: 'new' } }); await resolve(0, 'OLD'); assert.equal(ctx.results.length, 0, 'stale response during debounce is ignored');
  fire(); input({ target: { value: '' } }); assert.equal(ctx.results.length, 0); await resolve(1, 'REAPPEARED'); assert.equal(ctx.results.length, 0);
});
test('race mix audition respects disabled buses and cancels all owned work at Stop or mute', () => {
  let next = 0; const timers = new Map(), calls = []; let sound = true;
  const ctx = vm.createContext({ setTimeout: (fn) => { timers.set(++next, fn); return next; }, clearTimeout: (id) => timers.delete(id) }); vm.runInContext(read('js/audio/race-mix-audition.js'), ctx); const A = vm.runInContext('RaceMixAudition', ctx);
  let engineGeneration = 0;
  const audio = { enginePlaybackGeneration: () => engineGeneration, stopEngineIfGeneration(g) { if (g !== engineGeneration) return false; ++engineGeneration; calls.push('engine-stop'); return true; }, enabled: () => sound, init() {}, debug: () => ({ engineOn: false }), currentTrackId: () => 'already-playing', musicBackend: () => null, startEngine: () => { ++engineGeneration; calls.push('engine-start'); }, stopEngine: () => { ++engineGeneration; calls.push('engine-stop'); }, setEngine() {}, setSkid() {}, startMusic: () => calls.push('music-start'), stopMusic: () => calls.push('music-stop') };
  const store = { get: (key, d) => key === 'sfx' || key === 'radioVoice' ? false : d };
  assert.equal(A.start({ audio, store, soundOn: () => sound }), true); assert.deepEqual(calls, []); A.stop(); assert.equal(timers.size, 0);
  assert.equal(A.start({ audio, store: { get: (k, d) => d }, soundOn: () => sound }), true); assert.deepEqual(calls, ['engine-start']); sound = false; [...timers.values()][0](); assert.equal(A.active(), false); assert.ok(calls.includes('engine-stop')); assert.equal(timers.size, 0);
});
test('uploaded-track playback failures skip normally and report only the current track; success clears health', async () => {
  const states = [], media = [];
  const ctx = vm.createContext({ Log: { info() {}, warn() {} }, MusicLib: { playbackStatus: (id, state) => states.push([id, state.state]) }, localStorage: { getItem: () => '1' }, document: { hidden: false }, Audio: function () { const el = { play: () => Promise.resolve(), pause() {}, load() {}, removeAttribute() {} }; media.push(el); return el; } });
  vm.runInContext(read('js/audio/soundtrack.js'), ctx);
  const graph = { state: 'running', createGain: () => ({ gain: { value: 1, setTargetAtTime() {} }, connect() {} }), createMediaElementSource: () => ({ connect() {} }) };
  ctx.host = { context: () => graph, master: () => ({}), clamp01: (v) => Math.max(0, Math.min(1, v)), now: () => 0, enabled: () => true, engineRunning: () => false, sfxOk: () => true };
  const S = vm.runInContext('GameAudioSoundtrack.create(host)', ctx);
  S.addTracks([{ id: 'user:1', name: 'bad', url: 'blob:bad' }, { id: 'user:2', name: 'good', url: 'blob:good' }]); S.setMusicSource('user'); S.playTrackId('user:1');
  media[0].onerror(); assert.deepEqual(states[0], ['user:1', 'failed']); assert.equal(S.currentTrackId(), 'user:2');
  media[0].onplaying(); assert.deepEqual(states.at(-1), ['user:2', 'playing']); S.stopMusic();
});
test('music library health is scoped to an existing upload and focused Retry does not affect another row', async () => {
  const played = [], ctx = vm.createContext({ Log: { info() {}, warn() {} }, GameAudio: { addTracks() {}, tracks: () => [], playTrackId: (id) => { played.push(id); return true; } }, document: { readyState: 'loading', getElementById: () => null, addEventListener() {} }, URL: { createObjectURL: () => 'blob:upload', revokeObjectURL() {} }, setTimeout, clearTimeout,
    indexedDB: { open() { const request = {}; queueMicrotask(() => { request.result = { close() {}, transaction: () => ({ objectStore: () => ({ getAll() { const r = {}; queueMicrotask(() => { r.result = [{ id: 1, name: 'bad', blob: {}, size: 10 }, { id: 2, name: 'other', blob: {}, size: 10 }]; r.onsuccess(); }); return r; } }) }) }; request.onsuccess(); }); return request; } } });
  ctx.window = ctx; vm.runInContext(read('js/audio/music-lib.js'), ctx); const L = ctx.MusicLib; await L.init();
  assert.equal(L.playbackStatus('user:unknown', { state: 'failed' }), false);
  L.playbackStatus('user:1', { state: 'failed', reason: 'unsupported format' }); L.playbackStatus('user:2', { state: 'failed', reason: 'unavailable' });
  assert.equal(L.health('user:1').reason, 'unsupported format'); L.retry('user:1'); assert.deepEqual(played, ['user:1']); assert.equal(L.health('user:1'), null); assert.equal(L.health('user:2').state, 'failed');
  L.playbackStatus('user:2', { state: 'playing' }); assert.equal(L.health('user:2'), null);
});
test('stale primary slot revision prevents signing or repainting before any career mutation', () => {
  const { C, store } = careerHarness(); C.start({ teamId: 'haas', seed: 7 }); C.engage(true);
  C.data().offers = [{ teamId: 'mclaren', years: 1, salary: 99, goal: { type: 'beatMate', value: 0 } }]; const p = C.offerPreview(0);
  store.set('career.driver.0', { anotherTab: true }); const before = JSON.stringify(C.data());
  assert.equal(C.acceptOffer(0, p), null); assert.equal(JSON.stringify(C.data()), before);
});
test('legacy team identity is adopted once, independently per slot', () => {
  const { C, store } = careerHarness(); C.start({ flavour: 'myteam', seed: 3 });
  const old = copy(C.data()); delete old.myTeamIdentity; store.set('career.myteam.0', old);
  store.set('customTeam', { id: 'custom', name: 'LEGACY', drivers: [{ name: 'You', code: 'YOU', num: 1 }] }); C.load(); C.engage(true);
  assert.equal(C.identityValue('customTeam', null).name, 'LEGACY');
  store.set('customTeam', { id: 'custom', name: 'GP CHANGED', drivers: [{ name: 'You', code: 'YOU', num: 1 }] }); C.load(); C.engage(true);
  assert.equal(C.identityValue('customTeam', null).name, 'LEGACY');
});
test('contract preview preserves authored works research across era bans without changing the live legality predicate', () => {
  const { C, ctx } = careerHarness(); C.start({ teamId: 'haas', seed: 4 }); C.engage(true);
  const c = C.data(); c.year = 2030; C.applyRegs(); c.offers = [{ teamId: 'mclaren', years: 1, salary: 80, goal: { type: 'beatMate', value: 0 } }];
  const legal = vm.runInContext('Parts.legality()', ctx), key = vm.runInContext('Parts.legalityKey()', ctx);
  const p = C.offerPreview(0); assert.equal(vm.runInContext('Parts.legality()', ctx), legal); assert.equal(vm.runInContext('Parts.legalityKey()', ctx), key);
  ctx.preview = p; const rawEngine = vm.runInContext('Parts.FACTORY_PRESETS.mclaren.engine', ctx); assert.equal(p.fitted.engine, rawEngine, 'banned works engine is retained as researched ownership');
  C.acceptOffer(0, p); ctx.fitted = C.data().fitted; assert.deepEqual(copy(p.resolvedFitted), copy(vm.runInContext("Parts.resolveSetup(fitted, Teams.LIST.find(t=>t.id==='mclaren')).setup", ctx))); assert.equal(C.data().fitted.engine, rawEngine); assert.equal(vm.runInContext('Parts.legality()', ctx), legal);
});
function auditionMusicHarness() {
  const timers = new Map(), media = []; let timerId = 0;
  const graph = { state: 'running', createGain: () => ({ gain: { value: 1, setTargetAtTime() {} }, connect() {} }), createMediaElementSource: () => ({ connect() {} }) };
  const ctx = vm.createContext({ Log: { info() {}, warn() {} }, localStorage: { getItem: () => '1' }, document: { hidden: false }, Audio: function () { const el = { play: () => Promise.resolve(), pause() {}, load() {}, removeAttribute() {} }; media.push(el); return el; }, setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: (id) => timers.delete(id) });
  vm.runInContext(read('js/audio/soundtrack.js') + '\n' + read('js/audio/race-mix-audition.js'), ctx);
  ctx.host = { context: () => graph, master: () => ({}), clamp01: (v) => Math.max(0, Math.min(1, v)), now: () => 0, enabled: () => true, engineRunning: () => false, sfxOk: () => true };
  const S = vm.runInContext('GameAudioSoundtrack.create(host)', ctx), A = vm.runInContext('RaceMixAudition', ctx);
  S.addTracks([{ id: 'user:1', name: 'one', url: 'blob:one' }, { id: 'user:2', name: 'two', url: 'blob:two' }]); S.setMusicSource('user');
  const audio = { enabled: () => true, init() {}, debug: () => ({ engineOn: false }), currentTrackId: S.currentTrackId, musicBackend: S.musicBackend, startMusic: S.startMusic, stopMusic: S.stopMusic, musicPlaybackGeneration: S.musicPlaybackGeneration, stopMusicIfGeneration: S.stopMusicIfGeneration };
  const start = () => A.start({ audio, store: { get: (key, d) => key === 'sfx' ? false : d } });
  return { A, S, media, timers, start };
}
test('audition Stop leaves a later manual track action playing, even when selecting the same track id', () => {
  for (const id of ['user:2', 'user:1']) {
    const { A, S, timers, start } = auditionMusicHarness(); assert.equal(start(), true); assert.equal(S.currentTrackId(), 'user:1');
    S.playTrackId(id); A.stop(); assert.equal(S.currentTrackId(), id); assert.equal(timers.size, 0); S.stopMusic();
  }
});
test('audition ownership spans automatic playlist advancement but not a later manual skip or source choice', () => {
  { const { A, S, media, start } = auditionMusicHarness(); start(); const generation = S.musicPlaybackGeneration(); media[0].onended(); assert.equal(S.currentTrackId(), 'user:2'); assert.equal(S.musicPlaybackGeneration(), generation); A.stop(); assert.equal(S.currentTrackId(), null, 'automatically advanced audition music still stops'); }
  for (const action of [(S) => S.skipTrack(), (S) => S.setMusicSource('builtin')]) {
    const { A, S, start } = auditionMusicHarness(); start(); action(S); const selected = S.currentTrackId(); A.stop(); assert.equal(S.currentTrackId(), selected); S.stopMusic();
  }
});
test('audition deadline cancels its own playback and pending timers while preserving later user playback', () => {
  for (const takeover of [false, true]) {
    const { S, timers, start } = auditionMusicHarness(); start(); if (takeover) S.playTrackId('user:2');
    [...timers.values()].find((t) => t.ms === 6000).fn(); assert.equal(S.currentTrackId(), takeover ? 'user:2' : null); assert.equal(timers.size, 0); S.stopMusic();
  }
});
