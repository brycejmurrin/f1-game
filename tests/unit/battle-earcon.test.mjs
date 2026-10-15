/* Finite gap motifs and context/cancel safety; no browser or real audio. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
function load() {
  const c = vm.createContext({ ArrayBuffer, DataView, Math, Object, Number, Promise, Set });
  vm.runInContext(fs.readFileSync(root + "js/audio/battle-earcon.js", "utf8"), c);
  return c.BattleEarcon;
}
function audio() {
  let gen = 1, now = 0, enabled = true, voices = 0;
  const played = [], decoded = [], stops = [];
  return { played, decoded, stops, setGen: (n) => gen = n, setNow: (n) => now = n,
    setEnabled: (b) => enabled = b, setVoices: (n) => voices = n,
    ctxGen: () => gen, now: () => now, enabled: () => enabled, radioVoicesLive: () => voices,
    decodeClip: async (bytes) => { decoded.push(bytes); return { duration: (bytes.byteLength - 44) / 32000 }; },
    radioVoice: (parts, at, opts) => { played.push({ parts, at, opts }); return { end: at + parts[0].duration, stop: () => stops.push(true) }; } };
}
test("battle motif selection uses finite measured trend, current opponent and nearest valid gap", () => {
  const B = load(), f = { ahead: {}, behind: {}, gapA: 1, gapB: 2, rateA: -0.2, rateB: 0.4 };
  assert.equal(B.select(f), "ahead:closing");
  assert.equal(B.select({ ...f, gapB: 0.5 }), "behind:opening");
  assert.equal(B.select({ ...f, ahead: null }), "behind:opening");
  assert.equal(B.select({ ...f, rateA: null, rateB: NaN }), "");
  assert.equal(B.select({ ...f, rateA: 0.02, rateB: -0.03 }), "");
  assert.equal(B.select({ ...f, gapA: Infinity, rateB: -0.2 }), "behind:closing");
  assert.equal(B.select({ ...f, rateA: 0.2 }), "ahead:opening");
  assert.equal(B.select(null), "");
  assert.equal(B.select({ ...f, ahead: { pitState: "lane" }, behind: null }), "");
  assert.equal(B.select({ ...f, ahead: null, behind: { pitState: "box" } }), "");
  assert.equal(B.select({ ...f, ahead: { finished: true }, behind: null }), "");
});
test("four small finite PCM motifs cache per context; refused/muted/occupied playback stays silent", async () => {
  const B = load(), A = audio(), b = B.create(A);
  assert.equal(b.play("ahead:closing", 0.2), false);
  assert.equal(await b.prepare(), true); assert.equal(A.decoded.length, 4);
  assert.equal(await b.prepare(), true); assert.equal(A.decoded.length, 4);
  for (const bytes of A.decoded) {
    const v = new DataView(bytes);
    assert.equal(v.getUint16(20, true), 1); assert.equal(v.getUint16(22, true), 1);
    assert.equal(v.getUint32(24, true), 16000); assert.equal(v.getUint16(34, true), 16);
    assert.ok(bytes.byteLength < 12000);
  }
  assert.equal(b.play("ahead:closing", 0), false);
  A.setEnabled(false); assert.equal(b.play("ahead:closing", 0.2), false);
  A.setEnabled(true); A.setVoices(1); assert.equal(b.play("ahead:closing", 0.2), false);
  A.setVoices(0); assert.equal(b.play("ahead:closing", 0.2), true);
  assert.equal(A.played[0].opts.channel, "coach");
  assert.equal(b.play("behind:opening", 0.2), false, "one finite motif at a time");
  b.stop(); assert.equal(A.stops.length, 1); assert.equal(b.busy(), false);
  A.setGen(2); assert.equal(b.ready(), false); assert.equal(b.play("ahead:closing", 0.2), false);
  assert.equal(await b.prepare(), true); assert.equal(A.decoded.length, 8);
  const reject = audio(), retried = B.create(reject); let bad = true;
  reject.decodeClip = async () => bad ? null : { duration: 0.2 };
  assert.equal(await retried.prepare(), false); assert.equal(retried.ready(), false);
  bad = false; assert.equal(await retried.prepare(), true, "null decode permits same-context retry");
  reject.radioVoice = () => { throw new Error("audio context replaced"); };
  assert.equal(retried.play("ahead:closing", 0.2), false); assert.equal(retried.busy(), false);
  const invalid = audio(), noClip = B.create(invalid);
  invalid.decodeClip = async () => ({ duration: Infinity });
  assert.equal(await noClip.prepare(), false); assert.equal(noClip.ready(), false);
});
test("late canceled and superseded decode completions neither play nor install", async () => {
  const B = load(), A = audio(), resolve = [];
  A.decodeClip = () => new Promise((r) => resolve.push(r));
  const b = B.create(A), old = b.prepare();
  await Promise.resolve(); await Promise.resolve();
  b.stop(); for (const done of resolve.splice(0)) done({ duration: 0.3 });
  assert.equal(await old, false); assert.equal(b.ready(), false); assert.equal(A.played.length, 0);
  const next = b.prepare(); await Promise.resolve(); await Promise.resolve(); A.setGen(2);
  for (const done of resolve.splice(0)) done({ duration: 0.3 });
  assert.equal(await next, false); assert.equal(b.ready(), false); assert.equal(A.played.length, 0);
  const third = b.prepare(); await Promise.resolve(); await Promise.resolve();
  B.stopAll(); for (const done of resolve.splice(0)) done({ duration: 0.3 });
  assert.equal(await third, false); assert.equal(b.ready(), false);
  assert.equal(A.played.length, 0, "global stop cancels unpublished preparations");
});

// Controlled RaceFacts output isolates the actual request/lifecycle branch;
// select() above is independently pinned against missing/invalid real-fact slots.
function radioHost(on = true) {
  const A = audio(), c = vm.createContext({ Math, Object, Array, Number, JSON, String, Map, Set, Promise,
    ArrayBuffer, DataView, Log: { info() {} }, GameAudio: A,
    CamModes: { CAM_MODES: [{ id: "chase" }] } });
  const f = { t: 1, pos: 2, rawPos: 2, n: 2, lap: 2, laps: 10, toGo: 9,
    ahead: { name: "Driver AAA", code: "AAA" }, behind: null, gapA: 1, gapB: null,
    rateA: -0.2, rateB: null, caution: 0, pitting: false, finished: false, retired: false };
  let occupied = false;
  c.Spotter = { create: () => ({ update() {}, occupied: () => occupied }) };
  c.RaceFacts = { create: () => ({ reset() {}, observe: () => ({ f, ev: [] }), order: () => [], battles: () => [] }) };
  for (const path of ["js/audio/radio-voice.js", "js/audio/battle-earcon.js", "js/race/radio-lines.js", "js/race/race-radio.js"]) {
    vm.runInContext(fs.readFileSync(root + path, "utf8"), c);
  }
  const said = [], data = { battleEarcon: on, radioChat: "off", commentary: "off", volRadio: 0.8 };
  const player = { name: "Player", code: "PLY", speed: 60 };
  const G = { soundOn: true, state: "race", raceT: 1, player, cars: [f.ahead, player], track: { total: 3200 },
    store: { get: (k, d) => k in data ? data[k] : d, set: (k, v) => data[k] = v },
    announce: (msg) => { said.push(msg); return true; }, LAT_MAX: 30, camMode: 0 };
  const radio = c.RaceRadio.create(G);
  radio.update(0.1);
  return { A, f, G, said, radio, occupied: (b) => occupied = b };
}
test("actual request defaults off, falls back until prepared and never replays a cold request", async () => {
  const off = radioHost(false);
  assert.ok(off.radio.request()); assert.equal(off.A.played.length, 0); assert.equal(off.A.decoded.length, 0);
  const r = radioHost();
  assert.ok(r.radio.request(), "cold cache keeps usual spoken/card status");
  await new Promise((done) => setImmediate(done));
  assert.equal(r.A.played.length, 0, "decode completion itself never plays");
  assert.equal(r.radio.request(), ""); assert.equal(r.A.played.length, 1);
  r.radio.stopBattleEarcon(); r.f.rateA = null;
  assert.ok(r.radio.request(), "unknown trend keeps honest status");
  assert.equal(r.A.played.length, 1);
});
test("actual opt-in requests suppress unsafe cases and reset/WATCH/off/mute stop finite playback", async () => {
  for (const mode of ["braking", "corner", "caution", "spotter", "voice", "announcer", "card", "pause", "stale", "watch"]) {
    const r = radioHost(); r.radio.setBattleEarcon(true);
    await new Promise((done) => setImmediate(done));
    if (mode === "braking") r.G.player.brakeDemand = 0.3;
    if (mode === "corner") r.G.player.lateralAccel = 20;
    if (mode === "caution") r.f.caution = 1;
    if (mode === "spotter") r.occupied(true);
    if (mode === "voice") r.A.setVoices(1);
    if (mode === "announcer") r.G.announcer = { speaking: () => true };
    if (mode === "card") r.G.announceBusy = true;
    if (mode === "pause") r.G.paused = true;
    if (mode === "stale") r.G.raceT += 2;
    if (mode === "watch") r.radio.setWatching({});
    assert.equal(r.radio.request(), "", mode); assert.equal(r.A.played.length, 0, mode);
  }
  for (const mode of ["reset", "watch", "off", "mute"]) {
    const r = radioHost(); r.radio.setBattleEarcon(true);
    await new Promise((done) => setImmediate(done)); r.radio.request();
    assert.equal(r.A.played.length, 1);
    if (mode === "reset") r.radio.reset();
    if (mode === "watch") r.radio.setWatching({});
    if (mode === "off") r.radio.setBattleEarcon(false);
    if (mode === "mute") { r.G.soundOn = false; r.radio.request(); }
    assert.equal(r.A.stops.length, 1, mode);
  }
});

test("no-speech inert stop/halt and singleton visibility/pause/pagehide cancel owned finite sources", async () => {
  const observers = [], events = new Map(), winEvents = new Map();
  const pause = { hidden: true }, doc = { hidden: false, getElementById: (id) => id === "pausemenu" ? pause : null,
    addEventListener: (name, fn) => events.set(name, fn) };
  const A = audio(), c = vm.createContext({ ArrayBuffer, DataView, Math, Object, Number, Promise, Set,
    document: doc, window: { addEventListener: (name, fn) => winEvents.set(name, fn) },
    MutationObserver: class { constructor(fn) { this.fn = fn; } observe(el) { observers.push({ el, fn: this.fn }); } },
    Log: { info() {} } });
  for (const path of ["js/audio/battle-earcon.js", "js/audio/radio-voice.js"]) {
    vm.runInContext(fs.readFileSync(root + path, "utf8"), c);
  }
  // RadioVoice.create returns inert without speechSynthesis or VoicePack.
  const inert = c.RadioVoice.create({});
  for (const mode of ["stop", "halt", "visibility", "pause", "pagehide"]) {
    doc.hidden = false; pause.hidden = true;
    const b = c.BattleEarcon.create(A); assert.equal(await b.prepare(), true);
    assert.equal(b.play("ahead:closing", 0.2), true);
    const before = A.stops.length;
    if (mode === "stop") inert.stop();
    if (mode === "halt") inert.halt();
    if (mode === "visibility") { doc.hidden = true; events.get("visibilitychange")(); }
    if (mode === "pause") { pause.hidden = false; observers[0].fn(); }
    if (mode === "pagehide") winEvents.get("pagehide")();
    assert.equal(A.stops.length, before + 1, mode); assert.equal(b.busy(), false);
  }
  assert.equal(observers.length, 1, "one observer shared across services and preparations");
});
