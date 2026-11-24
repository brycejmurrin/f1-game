/* pause-resume-fence.test.mjs — driving input does not cross Pause or Resume.
 *
 * #6268: a friend race keeps simulating under the pause card. Keys HELD when
 * the card opened must not keep throttle, brake, look-back or the steering
 * ramp going under it (touch, pad and phone already yield to an open menu).
 *
 * #6330: a paired-phone drive sample still in flight across Resume must not
 * drive. PhonePad.link fences any sample that echoes a dash older than the
 * first drive dash sent after Resume; peers without the echo keep the old wire.
 *
 * The real js/input/input.js runs in a VM (phone-pad.test.mjs's harness) and
 * the phone half joins it over NetTransport.loopback with a 30 ms wire.
 *
 * Run: node --test tests/unit/pause-resume-fence.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
seedLogGlobal();
const load = (rel, name) => eval(read(rel) + ";" + name);
globalThis.NetBytes = load("js/net/bytes.js", "NetBytes");
const NetIce = load("js/net/ice.js", "NetIce");   // transport calls NetIce.create() at eval
const NetTransport = globalThis.NetTransport = load("js/net/transport.js", "NetTransport");
globalThis.TiltRoll = load("js/input/tilt-roll.js", "TiltRoll");
globalThis.PedalTravel = load("js/input/pedal-travel.js", "PedalTravel");
globalThis.TouchButtonActions = load("js/input/touch-button-actions.js", "TouchButtonActions");
const PhonePadCodec = globalThis.PhonePadCodec = load("js/input/phone-pad-codec.js", "PhonePadCodec");
globalThis.PhonePadPage = load("js/input/phone-pad-page.js", "PhonePadPage");
const PhonePad = globalThis.PhonePad = load("js/input/phone-pad.js", "PhonePad");

const STEP = 1000 / 60;

function bootInput() {
  const listeners = {};
  const clock = { t: 0 };
  const layers = { open: false };
  const el = () => ({
    addEventListener() {}, removeEventListener() {}, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, children: [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
  });
  class FakeEvent { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } }
  const sb = {
    Math, Object, Array, Number, isFinite, JSON, Map, Set, Date,
    performance: { now: () => clock.t },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    dispatchEvent: (e) => { for (const f of listeners[e.type] || []) f(e); return true; },
    removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: {}, screen: {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    KeyboardEvent: FakeEvent, Event: FakeEvent,
    // A race with the pause card closed or open: anyOpen()/navOpen() follow it.
    UiLayers: { inRace: () => true, anyOpen: () => layers.open, navOpen: () => layers.open, top: () => null },
    document: {
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener() {},
      getElementById: el, querySelector: el, querySelectorAll: () => [], hidden: false,
      body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
      activeElement: null, dispatchEvent: () => true,
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  const src = (f) => read(f).replace(/^const\b/gm, "var");
  for (const f of ["js/core/mat4.js", "js/input/tilt-roll.js", "js/input/bindings.js", "js/input/pad-menu.js", "js/input/haptics.js",
    "js/input/pedal-travel.js", "js/input/hold-buttons.js", "js/input/input.js"])
    vm.runInContext(src(f), ctx, { filename: absSrc(f) });
  const Input = vm.runInContext("Input", ctx);
  Input.init(el(), { onPause() {}, onPadLost() {} });
  Input.reset();
  const key = (k, down) => (listeners[down ? "keydown" : "keyup"] || [])
    .forEach((f) => f({ key: k, code: k, repeat: false, preventDefault() {}, target: { tagName: "BODY" } }));
  // What js/game.js does: setPaused(true) opens the card; setPaused(false)
  // closes it and calls Input.invalidateRemoteDrive() (game.js setPaused).
  const pause = () => { layers.open = true; Input.poll(); };
  const resume = () => { layers.open = false; Input.invalidateRemoteDrive(); Input.poll(); };
  return { Input, key, clock, pause, resume, layers };
}

test("#6268: keys held into Pause stop driving under the card and the steering ramp restarts on Resume", () => {
  const { Input, key, clock, pause, resume } = bootInput();
  Input.poll();
  key("ArrowUp", true); key("ArrowLeft", true);
  for (let i = 0; i < 20; i++) { clock.t += STEP; Input.steer(STEP / 1000); }
  assert.equal(Input.throttle(), true, "the held accelerator drives before Pause");
  const before = Input.steer(STEP / 1000);
  assert.ok(before < -0.3, "the held Left has ramped the wheel: " + before);

  pause();
  for (let i = 0; i < 30; i++) {
    clock.t += STEP;
    assert.equal(Input.steer(STEP / 1000), 0, "no steering ramps beneath the pause card");
  }
  assert.equal(Input.throttle(), false, "a held accelerator does not drive under Pause");
  assert.equal(Input.throttleLevel(), 0);
  assert.equal(Input.braking(), false);
  assert.equal(Input.brakeLevel(), 0);

  resume();
  clock.t += STEP;
  const after = Input.steer(STEP / 1000);
  assert.ok(after < 0 && after > before, "the still-held Left ramps from centre after Resume, not from " + before + ": " + after);
  assert.equal(Input.throttle(), true, "the still-held accelerator drives again after Resume");
  key("ArrowUp", false); key("ArrowLeft", false);
  assert.equal(Input.throttle(), false);
});

test("#6268: a held brake key and look-back yield to the pause card too", () => {
  const { Input, key, pause, resume } = bootInput();
  Input.poll();
  key("ArrowDown", true);
  assert.equal(Input.braking(), true);
  assert.equal(Input.brakeLevel(), 1);
  pause();
  assert.equal(Input.braking(), false, "the pause card owns a held brake key");
  assert.equal(Input.brakeLevel(), 0);
  assert.equal(Input.lookingBack(), false);
  resume();
  assert.equal(Input.braking(), true, "the held brake is still down for Resume");
});

// A phone and a desktop on a 30 ms wire; the desktop dash names its surface.
function pair({ phoneFence = true } = {}) {
  const desk = bootInput();
  const { clock, layers } = desk;
  const [padEnd, hostEnd] = NetTransport.loopback({ latencyMs: 30, rnd: NetTransport.seededRnd(3) });
  padEnd.pump(0); hostEnd.pump(0);
  const phone = { roll: null, thr: 0, brk: 0, held: 0 };
  const session = PhonePad.padSession(padEnd, {
    roll: () => phone.roll, thr: () => phone.thr, brk: () => phone.brk, held: () => phone.held,
  }, { now: () => clock.t, heartbeat: false });
  if (!phoneFence) {
    // A phone page from before the fence: it ignores the host's driveFence offer.
    const send = padEnd.send.bind(padEnd);
    padEnd.send = (ch, data) => {
      const a = ch === NetTransport.STATE ? JSON.parse(data) : null;
      if (Array.isArray(a) && a.length === 8) { a.pop(); if (a[0] === 1) a.pop(); return send(ch, JSON.stringify(a)); }
      return send(ch, data);
    };
  }
  const hud = () => ({ gear: 3, kmh: 100, rpm: 0.5, lap: 1, laps: 5, pos: 1, cars: 2, ers: 0.5, flags: 0, caution: 0,
    lastLapMs: 0, state: "race", surface: layers.open ? "menu" : "drive", team: "" });
  const link = PhonePad.link(hostEnd, { input: desk.Input, pump: false, now: () => clock.t, hud });
  const frame = (send = true) => { clock.t += STEP; if (send) session.sample(true); session.pump(); link.pump(); desk.Input.poll(); desk.Input.steer(); };
  const drain = () => { for (let i = 0; i < 5; i++) { clock.t += STEP; session.pump(); link.pump(); } };
  return { ...desk, phone, session, link, frame, drain, padEnd, hostEnd };
}

test("#6330: a drive sample in flight across Resume stays neutral until a post-Resume sample", () => {
  const h = pair();
  const { Input, phone, frame, pause, resume, session, link } = h;
  phone.thr = 1; phone.roll = 0;
  for (let i = 0; i < 20; i++) frame();
  assert.equal(Input.throttle(), true, "the fenced link still drives once the phone has seen a drive dash");

  pause();
  phone.thr = 0;
  for (let i = 0; i < 20; i++) frame();
  assert.equal(Input.throttle(), false);
  // The packet the phone sends just before the host resumes: it has seen only
  // menu dashes, and it is still on the 30 ms wire when Resume runs.
  phone.thr = 0.49; phone.brk = 0.25; phone.held = PhonePad.HELD.lookBack; phone.roll = 25;
  session.sample(true);
  resume();
  for (let i = 0; i < 2; i++) frame(false);
  // The queued packet has now landed (2 × 16.7 ms > 30 ms) and must not drive.
  assert.equal(Input.remoteActive(), true, "the link stays live");
  assert.equal(Input.throttle(), false, "queued throttle stays neutral after Resume");
  assert.equal(Input.braking(), false, "queued brake stays neutral after Resume");
  assert.equal(Input.lookingBack(), false, "queued look-back stays neutral after Resume");
  assert.equal(Input.steer(), 0, "queued tilt stays neutral after Resume");
  assert.ok(link.stats().fenced > 0, "the link counted the fenced sample");

  // Fresh input after the phone has seen the drive dash: calibrated values land.
  phone.thr = 1; phone.brk = 0; phone.held = 0; phone.roll = 0;
  for (let i = 0; i < 12; i++) frame();
  assert.equal(Input.throttle(), true, "a post-Resume sample drives");
});

test("#6330: two quick resumes with no menu dash between still fence the in-flight sample", () => {
  const h = pair();
  const { Input, phone, frame, pause, resume, session } = h;
  phone.thr = 1;
  for (let i = 0; i < 20; i++) frame();
  assert.equal(Input.throttle(), true);
  pause();
  phone.thr = 0.8;
  session.sample(true);            // echoes the last DRIVE dash: no menu dash reached the phone yet
  resume();
  frame(false); frame(false);
  assert.equal(Input.throttle(), false, "a new drive generation fences the old echo");
  for (let i = 0; i < 12; i++) frame();
  assert.equal(Input.throttle(), true);
});

test("#6330: a phone without the echo keeps working (legacy queue limitation recorded)", () => {
  const h = pair({ phoneFence: false });
  const { Input, phone, frame, pause, resume, session, link } = h;
  phone.thr = 1;
  for (let i = 0; i < 20; i++) frame();
  assert.equal(Input.throttle(), true, "an old phone still drives on a new host");
  pause(); phone.thr = 0;
  for (let i = 0; i < 10; i++) frame();
  phone.thr = 0.8; session.sample(true); resume(); frame(false); frame(false);
  assert.equal(link.stats().fenced, 0, "no echo, no fence");
  assert.equal(Input.throttle(), true, "LEGACY LIMITATION: an old phone's in-flight sample can still land after Resume");
});

test("#6330: wire — the echo is an 8th field, old shapes decode unchanged, camera packets never fence", () => {
  const { encodeSample, decodeSample, encodeHello, decodeEvent } = PhonePadCodec;
  assert.deepEqual(JSON.parse(encodeSample({ seq: 4, roll: 1, thr: 0.5, brk: 0, held: 0 })), [1, 4, 1, 0.5, 0, 0], "v1 without echo is unchanged");
  const v1 = encodeSample({ seq: 4, roll: 1, thr: 0.5, brk: 0, held: 0, driveEcho: 9 });
  assert.deepEqual(JSON.parse(v1), [1, 4, 1, 0.5, 0, 0, null, 9]);
  assert.deepEqual(decodeSample(v1), { seq: 4, roll: 1, thr: 0.5, brk: 0, held: 0, driveEcho: 9 });
  const v3 = decodeSample(encodeSample({ seq: 5, steer: 0.7, thr: 0.02, brk: 0.05, held: 0, calibratedPedals: true, driveEcho: -1 }));
  assert.deepEqual(v3, { calibratedPedals: true, steer: 0.7, seq: 5, roll: null, thr: 0.02, brk: 0.05, held: 0, driveEcho: -1 }, "calibrated pedals survive the echo");
  assert.equal(decodeSample(JSON.stringify([1, 4, 1, 0.5, 0, 0, 0.3, 9])), null, "a v1 echo needs the null steer slot");
  assert.equal(decodeSample(JSON.stringify([1, 4, 1, 0.5, 0, 0, null, -2])), null);
  const cam = encodeSample({ seq: 6, camera: { moveX: 1 }, driveEcho: 3 });
  assert.equal(JSON.parse(cam).length, 7, "camera packets carry no echo");
  assert.equal(decodeEvent(encodeHello("host", false, true, undefined, true, false, true)).driveFence, true);
  assert.equal(decodeEvent(encodeHello("host", false, true, undefined, true)).driveFence, undefined, "an old host offers no fence");
});
