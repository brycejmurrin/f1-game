// REAL REPLAY audio: real team radio is caption-only (docs/DECISIONS.md D-031) and the engine
// voice of a puppet. Split from real-replay-vm.test.mjs (M1-15).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transportReplay, audioHarness } from "../helpers/real-replay-fixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// TEAM RADIO IS CAPTION-ONLY (D-031). The replay used to hot-link OpenF1's recording_url
// (real broadcast audio) and play it through three fallbacks; now the message is a caption,
// status().radio carries the source link for the transport, and nothing is fetched or played.
test("WATCH real team radio is a caption with a source link: no Audio, no fetch, no media clip", () => {
  const made = [], fetched = [], media = [], cards = [];
  const { replay, G, options } = transportReplay({
    Audio: class { constructor(u) { made.push(u); } play() { return Promise.resolve(); } pause() {} },
    fetch: (u) => { fetched.push(u); return Promise.reject(new Error("no")); },
    GameAudioRadioFx: { playWatchMedia: (u) => { media.push(u); return null; } },
    GameAudio: { radioMediaClip: (u) => { media.push(u); return null; } },
  });
  options.script.radio = [{ t: 3, num: 1, lap: 1, url: "https://example.test/radio.mp3" }];
  G.soundOn = true;
  G.radio = { volume: () => 0.9 };
  G.announce = (text, dur, kind) => cards.push({ text, kind });
  replay.start(options);
  assert.equal(replay.status().radio, null, "no radio before the message");
  replay.tick(3.5);
  assert.deepEqual(made, [], "no HTMLAudio element is ever made for a radio clip");
  assert.deepEqual(fetched, [], "the recording is never fetched");
  assert.deepEqual(media, [], "no media-clip route is called");
  assert.ok(cards.some((c) => c.text === "RADIO · AAA"), "the message is captioned with the driver's code");
  const r = replay.status().radio;
  assert.equal(r && r.url, "https://example.test/radio.mp3", "status().radio links out to the source");
  replay.setSpeed(4);
  assert.ok(replay.status().radio, "a faster replay still shows the link (no audio to cut)");
  replay.seek(0);
  assert.equal(replay.status().radio, null, "a seek clears a stale radio link");
  replay.stop();
});

test("radio-fx no longer exports a WATCH media player (the three-attempt fallback is gone)", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/audio/radio-fx.js"), "utf8");
  for (const gone of ["playWatchMedia", "radioMediaClip", "createMediaElementSource", "fetch("]) {
    assert.ok(!src.includes(gone), "js/audio/radio-fx.js still carries " + gone);
  }
  const replaySrc = fs.readFileSync(path.join(ROOT, "js/race/real-replay.js"), "utf8");
  assert.ok(!/new Audio\(/.test(replaySrc), "real-replay.js makes no Audio element");
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
