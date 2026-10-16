import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root = path.resolve(new URL('../..', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const copy = (v) => JSON.parse(JSON.stringify(v));
test('Spotify actual input invalidates pending searches synchronously, including clear', async () => {
  const src = read('js/audio/spotify.js'), pending = [], timers = new Map(); let input, seq = 0;
  const ctx = vm.createContext({ sessionGen: 1, searchRevision: 0, results: [], searchT: null, render() {}, encodeURIComponent, readJson: (r) => Promise.resolve().then(() => r.json()).catch(() => null), api: () => new Promise((resolve) => pending.push(resolve)), on: (id, event, fn) => { input = fn; }, setTimeout: (fn) => { timers.set(++seq, fn); return seq; }, clearTimeout: (id) => timers.delete(id) });
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
