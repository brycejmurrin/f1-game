// REAL REPLAY audio and radio focus: the pause card's team-radio clips, the GameAudioRadioFx route,
// the direct Audio fallback's focus ownership, and the engine voice of a puppet. Split from
// real-replay-vm.test.mjs (M1-15).
import { test } from "node:test";
import assert from "node:assert/strict";
import { transportReplay, directRadioReplay, audioHarness } from "../helpers/real-replay-fixtures.mjs";

test("WATCH: the pause card cuts a real team radio clip mid-sentence, as a hidden tab does", () => {
  // The game loop returns before update() while paused, so tick() — and the
  // replay clock — froze under the card while the HTMLAudio clip talked on.
  const clips = [], observers = [];
  const pause = { hidden: true };
  const document = { addEventListener() {}, getElementById: (id) => (id === "pausemenu" ? pause : null) };
  class MutationObserver {
    constructor(fn) { this.fn = fn; observers.push(this); }
    observe(el, o) { this.el = el; this.o = o; }
  }
  const { replay, G, options } = transportReplay({ document, MutationObserver, Audio: class {
    constructor() { this.paused = true; clips.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  } });
  options.script.radio = [{ t: 3, num: 1, url: "https://example.test/radio.mp3" }];
  G.soundOn = true;
  replay.start(options);
  replay.tick(3.5);
  assert.equal(clips.length, 1, "the clip fires at its moment");
  assert.equal(clips[0].paused, false);
  // What the browser does when setPaused(true) (Escape / blur / pad-lost) shows #pausemenu.
  const flip = (hidden) => { pause.hidden = hidden; for (const o of observers) if (o.el === pause) o.fn([]); };
  flip(false);
  assert.equal(clips[0].paused, true, "the clip stops with the game, not when it runs out");
  assert.equal(replay.status().paused, false, "the replay's own transport is untouched");
  flip(true);                              // RESUME: nothing restarts a stale clip
  assert.equal(clips[0].paused, true);
  replay.stop();
});

// ROTATE-BLOCK / PHOTO-MODE PAUSE HIDES THE CARD IN THE SAME TASK.
// setPaused(true) shows #pausemenu; syncRotateBlocker then sets
// els.pausemenu.hidden = active || photoMode because the blocker (or photo
// studio) owns the screen. MutationObserver callbacks run AFTER that task,
// so a gate on `if (!pause.hidden) cutClip()` sees the card already hidden
// and never cuts — the OpenF1 HTMLAudio clip talks over a frozen WATCH.
// Same blind spot #1029 fixed for radioVoice via setPaused → halt(); here
// the fix stays inside real-replay (G.paused survives the re-hide).
test("WATCH: a rotate-block pause that re-hides the card in the same task still cuts team radio", () => {
  const clips = [], observers = [], queued = [];
  const pause = { _hidden: true };
  Object.defineProperty(pause, "hidden", {
    get() { return this._hidden; },
    set(v) {
      this._hidden = !!v;
      for (const o of observers) if (o.el === pause) queued.push(o.fn);
    },
  });
  const document = { addEventListener() {}, getElementById: (id) => (id === "pausemenu" ? pause : null) };
  class MutationObserver {
    constructor(fn) { this.fn = fn; observers.push(this); }
    observe(el, o) { this.el = el; this.o = o; }
  }
  const { replay, G, options } = transportReplay({ document, MutationObserver, Audio: class {
    constructor() { this.paused = true; clips.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  } });
  options.script.radio = [{ t: 3, num: 1, url: "https://example.test/radio.mp3" }];
  G.soundOn = true;
  G.paused = false;
  replay.start(options);
  replay.tick(3.5);
  assert.equal(clips.length, 1, "precondition: a clip is on air");
  assert.equal(clips[0].paused, false);

  // setPaused(true, "rotate-block") then syncRotateBlocker(false), one task:
  G.paused = true;
  pause.hidden = false;                       // setPaused shows the card
  pause.hidden = true;                        // blocker / photo took the screen
  assert.equal(pause.hidden, true, "the card is gone by the end of the task");
  while (queued.length) queued.shift()();     // observers run now, seeing hidden
  assert.equal(clips[0].paused, true, "the clip stops — the observer never saw the card");
  assert.equal(replay.status().paused, false, "the replay's own transport is untouched");

  G.paused = false;
  pause.hidden = true;                        // RESUME: nothing restarts a stale clip
  while (queued.length) queued.shift()();
  assert.equal(clips[0].paused, true, "resume must not restart a stale clip");
  replay.stop();
});

test("WATCH OpenF1 team radio routes through GameAudioRadioFx.playWatchMedia (FX chain + duck)", () => {
  const ducks = [];
  const chain = [];
  const playWatchMedia = (url, o) => {
    chain.push({ url, volume: o && o.volume });
    ducks.push(true);
    return {
      chained: true,
      paused: false,
      ended: false,
      pause() { ducks.push(false); },
      play: () => Promise.resolve(),
      stop() { ducks.push(false); },
    };
  };
  const { replay, G, options } = transportReplay({
    Audio: class { play() { return Promise.resolve(); } pause() {} },
    GameAudioRadioFx: { playWatchMedia },
    GameAudio: { setRadioDuck: (on) => ducks.push(!!on) },
  });
  options.script.radio = [{ t: 3, num: 1, url: "https://example.test/radio.mp3" }];
  G.soundOn = true;
  G.radio = { volume: () => 0.8 };
  replay.start(options);
  replay.tick(3.5);
  assert.equal(chain.length, 1, "playWatchMedia is used instead of bare new Audio()");
  assert.equal(chain[0].url, "https://example.test/radio.mp3");
  assert.equal(chain[0].volume, 0.8);
  assert.ok(ducks.includes(true), "music duck latched for the clip");
  replay.stop();
  assert.ok(ducks.includes(false), "stop releases the duck");
});

test("WATCH direct Audio fallback focuses only audible playing and releases on interruption", () => {
  const { replay, G, clips, holds, focus, ducks } = directRadioReplay();
  replay.tick(3.5);
  const a = clips[0];
  assert.equal(holds.size, 0, "requesting playback does not claim focus");
  assert.deepEqual(ducks, [true], "the fallback preserves legacy radio ducking");
  a.emit("playing");
  assert.equal(holds.size, 1);
  const owner = focus[0].owner;
  a.emit("playing");
  assert.equal(focus.length, 1, "repeated playing is idempotent");
  a.emit("stalled");
  assert.equal(holds.size, 1, "a stalled fetch can still have buffered playback");
  a.emit("waiting");
  assert.equal(holds.size, 0);
  a.emit("volumechange");
  assert.equal(holds.size, 0, "volume changes cannot acquire while waiting");
  a.emit("playing");
  assert.equal(holds.size, 1, "playing after buffering recovers focus");
  a.volume = 0; a.emit("volumechange");
  assert.equal(holds.size, 0);
  a.volume = 0.8; a.emit("volumechange");
  assert.equal(holds.size, 1, "restoring volume recovers focus during confirmed playback");
  a.muted = true; a.emit("volumechange");
  assert.equal(holds.size, 0);
  a.muted = false; a.emit("volumechange");
  assert.equal(holds.size, 1, "unmuting ongoing playback recovers focus without another playing event");
  G.soundOn = false; a.emit("playing");
  assert.equal(holds.size, 0);
  G.soundOn = true; G.radio.volume = () => 0; a.emit("playing");
  assert.equal(holds.size, 0, "effective radio volume also gates the hold");
  G.radio.volume = () => 0.8; a.emit("playing");
  assert.equal(holds.size, 1);
  replay.setPaused(true);
  assert.equal(a.paused, true, "public transport pause pauses the existing element");
  assert.equal(holds.size, 0, "transport pause releases focus without disposing the source");
  assert.ok(a.listeners.has("playing"), "transport pause keeps resume listeners");
  assert.equal(ducks.at(-1), false, "transport pause preserves legacy duck release");
  a.emit("volumechange");
  assert.equal(holds.size, 0, "volume changes cannot acquire while paused");
  replay.setPaused(false);
  assert.equal(clips.length, 1, "public transport resume reuses the same Audio element");
  assert.equal(a.paused, false);
  assert.equal(ducks.at(-1), true, "resuming restores the legacy radio duck");
  a.emit("volumechange");
  assert.equal(holds.size, 0, "a play request after pause still needs confirmation");
  a.emit("playing");
  assert.equal(holds.size, 1, "the same element reacquires focus on resumed playing");
  a.muted = true; a.emit("volumechange");
  assert.equal(holds.size, 0);
  a.muted = false; a.emit("volumechange");
  assert.equal(holds.size, 1, "resumed playback also recovers focus after unmuting");
  replay.seek(0);
  assert.equal(holds.size, 0, "seek stops and releases the owned fallback");
  assert.equal(a.listeners.size, 0, "stop removes every event listener");
  assert.equal(ducks.at(-1), false);
  assert.ok(focus.every((entry) => entry.owner === owner), "one clip uses one stable owner object");
  replay.stop();
});

test("WATCH fallback rejects stale events and play failures without releasing a newer owner", async () => {
  const { replay, clips, holds, focus } = directRadioReplay();
  replay.tick(3.5);
  const old = clips[0], stalePlaying = old.listeners.get("playing"), staleEnded = old.listeners.get("ended");
  old.emit("playing");
  replay.tick(3);
  const current = clips[1];
  current.emit("playing");
  const owner = focus.at(-1).owner, before = focus.length;
  assert.equal(holds.size, 1);
  assert.notEqual(owner, focus[0].owner, "replacement clips get distinct ownership");
  stalePlaying(); staleEnded(); old.reject(new Error("late rejection"));
  await Promise.resolve();
  assert.equal(focus.length, before, "queued callbacks and an old rejection cannot touch the new hold");
  assert.ok(holds.has(owner));
  current.reject(new Error("autoplay refused"));
  await Promise.resolve();
  assert.equal(holds.size, 0, "a failed play request releases its own focus");
  assert.equal(current.listeners.size, 0, "rejection removes listeners");
  replay.tick(3);
  const last = clips[2];
  last.emit("playing"); last.emit("error");
  assert.equal(holds.size, 0, "media errors release focus");
  assert.equal(last.listeners.size, 0);
  replay.stop();
});

test("WATCH fallback callbacks from a previous audio context cannot claim or release focus", () => {
  const { replay, clips, holds, focus, ducks, rebuild } = directRadioReplay();
  replay.tick(3.5);
  const old = clips[0], stalePlaying = old.listeners.get("playing"), staleEnded = old.listeners.get("ended");
  old.emit("playing");
  rebuild();
  const before = focus.length, duckCount = ducks.length;
  stalePlaying(); staleEnded();
  assert.equal(focus.length, before, "old callbacks do not call the rebuilt engine");
  assert.equal(ducks.length, duckCount, "old callbacks cannot release the rebuilt radio duck");
  assert.equal(old.listeners.size, 0);
  replay.tick(3);
  const current = clips[1];
  current.emit("playing");
  assert.equal(holds.size, 1, "a clip created in the rebuilt context can focus");
  staleEnded();
  assert.equal(holds.size, 1);
  current.ended = true; current.emit("ended");
  assert.equal(holds.size, 0, "natural completion releases the current clip");
  assert.equal(current.listeners.size, 0);
  replay.stop();
});

test("WATCH transport pause hands the audio a stopped car, and playing again brings the speed back", () => {
  const { replay, a, b } = audioHarness();
  replay.seek(10); replay.tick(0.1);
  assert.ok(a.speed > 49 && b.speed > 49, "running: " + a.speed);
  replay.setPaused(true);
  replay.tick(0.1);
  assert.equal(a.speed, 0, "paused: the engine voice and rival feed read a standing car");
  assert.equal(b.speed, 0);
  replay.setPaused(false);
  replay.tick(0.1);
  assert.ok(a.speed > 49 && b.speed > 49, "playing again: " + a.speed);
  replay.stop();
});

test("WATCH at 4x: c.speed is the trace's real m/s (camera, CamFeel, ExtraRigs read it); the rate rides apart for the revs", () => {
  // 1a-F2: pose() wrote c.speed = trace x rate, so at 4x a 50 m/s car read 200 m/s to every camera reader of the
  // followed puppet (camVantage's speed dolly, the CamFeel vignette, ExtraRigs' battle gaps), not just the engine.
  const { replay, a, b } = audioHarness();
  replay.setSpeed(4);
  replay.seek(10); replay.tick(0);
  assert.ok(Math.abs(a.speed - 50) < 0.01 && Math.abs(b.speed - 50) < 0.01, "4x: the trace's own speed, not 4x it: " + a.speed);
  assert.equal(a.replayRate, 4, "the transport rate game.js multiplies into the revs (and only there)");
  replay.setSpeed(1); replay.tick(0);
  assert.ok(Math.abs(a.speed - 50) < 0.01, "1x: unchanged");
  assert.equal(a.replayRate, 1);
  replay.stop();
});

test("WATCH a car whose trace has ended drops to idle revs instead of keeping its last rpm", () => {
  const { replay, a, b } = audioHarness();
  replay.seek(10); replay.tick(0.1);
  assert.equal(b.retired, false);
  b.rpm = 14000;   // game.js left it here on the last running step
  replay.seek(40);   // LEC's data ended at 20 s
  replay.tick(0.1);
  assert.equal(b.retired, true);
  assert.equal(b.speed, 0);
  assert.equal(b.rpm, 5000, "parked at idle: game.js never recomputes rpm for a retired car");
  assert.equal(a.rpm, 12000, "a running car's revs are game.js's to set");
  replay.stop();
});
