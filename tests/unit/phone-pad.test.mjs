/* phone-pad.test.mjs — PHONE AS CONTROLLER, measured end to end with no phone.
 *
 * js/input/phone-pad.js has two halves that must agree on a wire format, and
 * a desktop half whose whole job is to reach js/input/input.js's tilt pipeline
 * exactly as the local sensor does. Both are pure enough to run here: the
 * phone half over NetTransport.loopback() (deterministic, in-process, pumped
 * by hand), the desktop half against the REAL input.js in a VM with a
 * hand-stepped clock — the digital-steer.test.mjs harness — so "the phone
 * steers through the same One-Euro filter, dead zone and slew" is asserted by
 * driving it, not by reading it.
 *
 * Run: node --test tests/unit/phone-pad.test.mjs   (npm run test:steering-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
seedLogGlobal();

// The modules under test, as globals — each is a "use strict" IIFE assigning one.
const load = (rel, name) => eval(read(rel) + ";" + name);
globalThis.NetBytes = load("js/net/bytes.js", "NetBytes");
const NetTransport = globalThis.NetTransport = load("js/net/transport.js", "NetTransport");
const TiltRoll = globalThis.TiltRoll = load("js/input/tilt-roll.js", "TiltRoll");
const PhonePad = globalThis.PhonePad = load("js/input/phone-pad.js", "PhonePad");

// The real js/input/input.js in a VM (digital-steer.test.mjs's harness), with
// TiltRoll present so a local orientation event and a remote sample can be
// compared, and a clock the test steps.
function bootInput() {
  const listeners = {};
  const clock = { t: 0 };
  const vibrated = [];
  const keys = [];   // every synthetic key the menu seam dispatches at document
  class FakeEvent { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } }
  const el = () => ({
    addEventListener() {}, removeEventListener() {}, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, children: [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
  });
  const sb = {
    Math, Object, Array, Number, isFinite, JSON, Map, Set, Date,
    performance: { now: () => clock.t },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    dispatchEvent: (e) => { for (const f of listeners[e.type] || []) f(e); return true; },
    removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: { vibrate: (ms) => { vibrated.push(ms); return true; } },
    screen: {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    KeyboardEvent: FakeEvent, Event: FakeEvent,
    document: {
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener() {},
      getElementById: el, querySelector: el, querySelectorAll: () => [], hidden: false,
      body: { classList: { add() {}, remove() {}, toggle() {} } },
      activeElement: null,
      dispatchEvent(e) { keys.push("doc:" + (e.key || e.type)); return true; },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  const src = (f) => read(f).replace(/^const\b/gm, "var");
  vm.runInContext(src("js/core/mat4.js"), ctx, { filename: "js/core/mat4.js" });
  vm.runInContext(src("js/input/tilt-roll.js"), ctx, { filename: "js/input/tilt-roll.js" });
  for (const f of ["js/input/bindings.js", "js/input/pad-menu.js", "js/input/haptics.js", "js/input/hold-buttons.js", "js/input/input.js"])
    vm.runInContext(src(f), ctx, { filename: f });
  const Input = vm.runInContext("Input", ctx);
  let paused = 0;
  Input.init(el(), { onPause: () => { paused++; } });
  Input.reset();
  const key = (k, down) => (listeners[down ? "keydown" : "keyup"] || [])
    .forEach((f) => f({ key: k, code: k, repeat: false, preventDefault() {}, target: { tagName: "BODY" } }));
  return { Input, key, clock, vibrated, pausedCount: () => paused, sb, keys };
}

// Timers pad() can be handed instead of the wall clock (its `timers` seam).
function fakeTimers() {
  const q = []; let id = 0;
  const t = {
    setTimeout: (f, ms) => { q.push({ id: ++id, f, ms, every: 0 }); return id; },
    setInterval: (f, ms) => { q.push({ id: ++id, f, ms, every: ms }); return id; },
    clearTimeout: (i) => { const k = q.findIndex((e) => e.id === i); if (k >= 0) q.splice(k, 1); },
    clearInterval: (i) => t.clearTimeout(i),
    advance(ms) {
      for (const e of [...q]) {
        e.ms -= ms;
        while (e.ms <= 0 && q.includes(e)) { if (e.every) { e.f(); e.ms += e.every; } else { t.clearTimeout(e.id); e.f(); } }
      }
    },
    pending: () => q.length,
  };
  return t;
}

const STEP = 1000 / 60;

// A phone and a desktop joined by the loopback wire: the phone half is
// padSession over one end, the desktop half is link() over the other, pumped
// by the same hand-stepped clock the VM's Input reads.
function pair(opts = {}) {
  const desk = bootInput();
  const { clock } = desk;
  const [padEnd, hostEnd] = NetTransport.loopback({ latencyMs: opts.latencyMs ?? 5, rnd: NetTransport.seededRnd(7) });
  padEnd.pump(0); hostEnd.pump(0);
  const phone = { roll: null, thr: 0, brk: 0, held: 0, buzz: [], huds: [] };
  const session = PhonePad.padSession(padEnd, {
    roll: () => phone.roll, thr: () => phone.thr, brk: () => phone.brk, held: () => phone.held,
  }, { now: () => clock.t, heartbeat: false, vibrate: opts.phoneHaptics === false ? undefined : (ms) => phone.buzz.push(ms), onHud: (h) => phone.huds.push(h) });
  let closed = 0;
  const dash = { value: null };   // what the desktop's sampler returns (null = nothing to send)
  const link = PhonePad.link(hostEnd, { input: desk.Input, pump: false, now: () => clock.t, hud: () => dash.value, onClose: () => { closed++; } });
  // One frame: the phone sends, the wire carries, the desktop pumps, and the
  // game loop reads steer() — the read is what advances the slew, exactly as
  // js/game.js reads Input.steer() once per frame.
  const frame = (sendSample = true) => {
    clock.t += STEP;
    if (sendSample) session.sample();
    session.pump(); link.pump();
    desk.Input.steer();
  };
  return { ...desk, phone, session, link, frame, dash, closedCount: () => closed, padEnd, hostEnd };
}

// A stand-in for the wheel's LCD: the DOM surface paintHud touches, nothing more.
function lcd() {
  const node = () => ({ textContent: "", style: { width: "", setProperty(k, v) { this[k] = v; } },
    classes: new Set(), classList: { toggle(c, on) { on ? this.owner.classes.add(c) : this.owner.classes.delete(c); } } });
  const mk = () => { const n = node(); n.classList.owner = n; return n; };
  const leds = { children: Array.from({ length: 15 }, mk) };
  const el = { gear: mk(), speed: mk(), lap: mk(), pos: mk(), ers: mk(), flag: mk(), ot: mk(), aero: mk(), last: mk(), leds, screen: mk(), team: mk(), body: mk() };
  return el;
}

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

test("a sample round-trips, and junk / a foreign protocol / an out-of-range pedal never reach Input", () => {
  const s = PhonePad.decodeSample(PhonePad.encodeSample({ seq: 41, roll: -12.346, thr: 0.5, brk: 0, held: 1 }));
  assert.deepEqual(s, { seq: 41, roll: -12.35, thr: 0.5, brk: 0, held: 1 }, "two decimals is the wire's precision");
  assert.equal(PhonePad.decodeSample(PhonePad.encodeSample({ seq: 1, roll: null, thr: 1, brk: 1, held: 0 })).roll, null,
    "a phone with no sensor sends a null roll, which decodes as null (pedals only)");
  for (const bad of ["", "nope", "{}", "[]", JSON.stringify([2, 1, 0, 0, 0, 0]), JSON.stringify([1, 1, 0, 0, 0]), 42, null]) {
    assert.equal(PhonePad.decodeSample(bad), null, `accepted ${JSON.stringify(bad)}`);
  }
  const clamped = PhonePad.decodeSample(JSON.stringify([1, 3, 720, 7, -3, 0]));
  assert.equal(clamped.thr, 1); assert.equal(clamped.brk, 0);
  assert.equal(clamped.roll, 180, "a roll beyond half a turn is clamped, never NaN");
  assert.equal(PhonePad.decodeSample(JSON.stringify([1, 3, "12", 0, 0, 0])).roll, null, "a string roll is no roll");
});

test("events: only the named edges decode, haptics are bounded, the rest is dropped", () => {
  for (const k of PhonePad.EVENTS) assert.deepEqual(PhonePad.decodeEvent(PhonePad.encodeEvent(k)), { t: "ev", k });
  assert.equal(PhonePad.decodeEvent(JSON.stringify({ t: "ev", k: "__proto__" })), null);
  assert.equal(PhonePad.decodeEvent(JSON.stringify({ t: "ev", k: "eval" })), null);
  assert.deepEqual(PhonePad.decodeEvent(PhonePad.encodeHaptic(5000)), { t: "hap", ms: 1000 }, "a buzz is capped at a second");
  assert.equal(PhonePad.decodeEvent("[1,2,3]"), null);
  assert.equal(PhonePad.decodeEvent(JSON.stringify({ t: "state" })), null);
});

test("the dash round-trips, is refused by the sample decoder, and clamps every field", () => {
  const h = { gear: 6, kmh: 287.6, rpm: 0.912, lap: 3, laps: 12, pos: 4, cars: 20, ers: 0.55, flags: PhonePad.DASH.otArmed | PhonePad.DASH.redline,
    caution: 1, lastLapMs: 91234, state: "race", team: "#00b4ab" };
  const back = PhonePad.decodeHud(PhonePad.encodeHud(h));
  assert.deepEqual(back, { gear: 6, kmh: 288, rpm: 0.91, lap: 3, laps: 12, pos: 4, cars: 20, ers: 0.55,
    flags: PhonePad.DASH.otArmed | PhonePad.DASH.redline, caution: 1, lastLapMs: 91234, state: "race", team: "#00b4ab" });
  assert.equal(PhonePad.decodeSample(PhonePad.encodeHud(h)), null, "a dash is not a sample");
  assert.equal(PhonePad.decodeHud(PhonePad.encodeSample({ seq: 1, roll: 0, thr: 0, brk: 0, held: 0 })), null, "a sample is not a dash");
  assert.equal(PhonePad.encodeHud(null), null, "nothing to show sends nothing");
  const wild = PhonePad.decodeHud(JSON.stringify(["H", 40, 5000, 7, -3, 9999, 200, 0, 2, -1, 9, 1e9, "x".repeat(40), "javascript:alert(1)"]));
  assert.deepEqual(wild, { gear: 9, kmh: 999, rpm: 1, lap: 0, laps: 999, pos: 99, cars: 0, ers: 1, flags: 0, caution: 4,
    lastLapMs: 3600000, state: "xxxxxxxx", team: "" }, "every field is clamped and the team colour must be a hex");
  assert.equal(PhonePad.teamHex([0.0, 0.706, 0.671]), "#00b4ab", "a TeamDef colour becomes the CSS hex");
  assert.equal(PhonePad.teamHex(null), "");
  assert.equal(PhonePad.fmtLap(91234), "1:31.234"); assert.equal(PhonePad.fmtLap(0), "");
});

test("the pairing URL lands on controller.html beside the game with the code in the FRAGMENT", () => {
  assert.equal(PhonePad.padUrl("ABC234", "https://brycejmurrin.github.io/f1-game/index.html"),
    "https://brycejmurrin.github.io/f1-game/controller.html#pad=ABC234");
  assert.equal(PhonePad.padUrl("ABC234", "https://brycejmurrin.github.io/f1-game/"),
    "https://brycejmurrin.github.io/f1-game/controller.html#pad=ABC234", "a directory URL gets the same page");
  assert.equal(PhonePad.codeFromUrl("https://x.test/f1-game/controller.html#pad=ABC234"), "ABC234");
  assert.equal(PhonePad.codeFromUrl("https://x.test/f1-game/controller.html?x=1#other=1&pad=ABC234"), "ABC234");
  assert.equal(PhonePad.codeFromUrl("https://x.test/f1-game/controller.html"), null);
});

// ---------------------------------------------------------------------------
// The roll math, shared by both ends
// ---------------------------------------------------------------------------

test("TiltRoll: the roll the phone sends is the roll the game would have read itself", () => {
  // Portrait, screen-right edge dipped 20°: gamma = +20 → +20 (steer right).
  assert.ok(Math.abs(TiltRoll.rollDeg(0, 20, 0) - 20) < 1e-9);
  assert.ok(Math.abs(TiltRoll.rollDeg(0, -20, 0) + 20) < 1e-9);
  // Landscape (home button right, angle 90): the same physical dip is beta.
  assert.ok(Math.abs(TiltRoll.rollDeg(20, 0, 90) - 20) < 1e-9);
  assert.ok(Math.abs(TiltRoll.rollDeg(20, 0, 270) + 20) < 1e-9, "the other landscape flips the sign");
  assert.ok(Math.abs(TiltRoll.rollDeg(0, 20, 180) + 20) < 1e-9, "upside-down portrait flips it too");
  assert.equal(TiltRoll.rollDeg(null, null, 0), null, "no angles at all (no sensor) is null, not 0");
  assert.equal(TiltRoll.rollDeg(0, 0, 0), 0);
  assert.ok(Math.abs(TiltRoll.rollDeg(45, 0, 0)) < 1e-9, "pitch alone is not roll");
  assert.equal(TiltRoll.rollDeg(0, 20, -270), TiltRoll.rollDeg(0, 20, 90), "a negative angle wraps");
});

// ---------------------------------------------------------------------------
// The desktop half against the real Input
// ---------------------------------------------------------------------------

test("a tilted phone steers through Input's tilt pipeline — the same filter, dead zone and slew as the local sensor", () => {
  const { Input, phone, frame, link } = pair();
  assert.equal(Input.steer(), 0, "nothing paired: no steer");
  phone.roll = 30;                       // MAX_TILT is 36°, so 30° is most of the lock
  for (let i = 0; i < 60; i++) frame();
  const remote = Input.steer();
  assert.ok(remote > 0.6 && remote <= 1, `30° of phone roll should be most of the lock, got ${remote}`);
  assert.ok(Input.remoteActive(), "the source is live while samples arrive");
  assert.ok(link.stats().samples >= 55, `samples should be flowing, got ${link.stats().samples}`);

  // The local pipeline fed the same reading by simTilt agrees to the digit:
  // that is what "the same pipeline" means.
  const local = bootInput();
  local.Input.simTiltReset();
  let v = 0;
  for (let i = 0; i < 60; i++) v = local.Input.simTilt(30, STEP / 1000);
  assert.ok(Math.abs(v - remote) < 0.05, `remote ${remote} vs local ${v} for the same 30° roll`);

  // Inside the dead zone nothing moves — a resting hand does not creep.
  phone.roll = 1;
  for (let i = 0; i < 120; i++) frame();
  assert.equal(Input.steer(), 0, "1° is inside DEADZONE (2.5°)");
  // A negative roll is a left turn.
  phone.roll = -30;
  for (let i = 0; i < 60; i++) frame();
  assert.ok(Input.steer() < -0.6, "roll left steers left");
});

test("RECALIBRATE zeroes the phone's current roll, and the roll is what debugState reports", () => {
  const { Input, phone, frame } = pair();
  phone.roll = 12;
  for (let i = 0; i < 60; i++) frame();
  assert.ok(Input.steer() > 0.1, "12° steers before calibration");
  Input.calibrate();
  for (let i = 0; i < 60; i++) frame();
  assert.equal(Input.steer(), 0, "the held lean is the new straight-ahead");
  assert.equal(Input.debugState().remote.roll, 12);
  assert.equal(Input.debugState().remote.active, true);
});

test("the phone's pedals reach throttle()/braking() and their travel reaches the levels", () => {
  const { Input, phone, frame } = pair();
  frame();
  assert.equal(Input.throttle(), false); assert.equal(Input.braking(), false);
  phone.thr = 0.8; frame();
  assert.equal(Input.throttle(), true);
  assert.equal(Input.throttleLevel(), 0.8, "an on-screen pedal reports how far it is pressed");
  phone.thr = 0; phone.brk = 0.35; frame();
  assert.equal(Input.throttle(), false);
  assert.equal(Input.braking(), true);
  assert.equal(Input.brakeLevel(), 0.35);
  phone.brk = 0.05; frame();
  assert.equal(Input.braking(), false, "a resting thumb (< 0.1) is not a brake");
  phone.brk = 0; phone.held = PhonePad.HELD.lookBack; frame();
  assert.equal(Input.lookingBack(), true, "LOOK BACK is held, not edged");
  phone.held = 0; frame();
  assert.equal(Input.lookingBack(), false);
});

test("a button edge crosses on the reliable channel exactly once, and PAUSE reaches the game's callback", () => {
  const { Input, session, frame, link, pausedCount } = pair();
  frame();
  assert.equal(Input.consumeShiftUp(), false);
  assert.ok(session.event("shiftUp"));
  frame(false);
  assert.equal(Input.consumeShiftUp(), true, "the edge arrived");
  assert.equal(Input.consumeShiftUp(), false, "and was consumed once");
  assert.equal(session.event("notAnAction"), false, "an unknown name is refused at the sender");
  session.event("pause"); frame(false);
  assert.equal(pausedCount(), 1, "PAUSE is the pad's Start button");
  session.event("overtake"); session.event("boost"); frame(false);
  assert.equal(Input.consumeOvertake(), true); assert.equal(Input.consumeBoostToggle(), true);
  assert.equal(link.stats().events, 4);
  assert.equal(link.stats().junk, 0);
});

test("an OLDER sample arriving after a newer one is dropped, never applied", () => {
  const { Input, phone, frame, link, hostEnd } = pair();
  phone.roll = 30;
  for (let i = 0; i < 60; i++) frame();
  const before = Input.steer();
  // Replay a stale sample straight into the desktop's inbox: seq 0, roll -30.
  hostEnd._emit("message", NetTransport.STATE, PhonePad.encodeSample({ seq: 0, roll: -30, thr: 0, brk: 0, held: 0 }));
  frame(false);
  assert.ok(Input.steer() >= before - 0.02, "the stale left-roll must not pull the wheel back");
  assert.equal(link.stats().stale, 1);
  hostEnd._emit("message", NetTransport.STATE, "garbage");
  frame(false);
  assert.equal(link.stats().junk, 1, "junk is counted and ignored");
});

test("the desktop's vibrate() is forwarded to the phone while it is the live source", () => {
  const { Input, phone, frame } = pair();
  phone.roll = 5;
  frame();
  Input.vibrate(40);
  frame(false); frame(false);
  assert.deepEqual(phone.buzz, [40], "the kerb reaches the phone in the player's hand");
});

test("a capable phone exposes haptics on pairing, respects strength/off, and hides on disconnect", () => {
  const { Input, phone, frame, link, sb } = pair();
  let changes = 0;
  sb.addEventListener("apexhapticschange", () => changes++);
  assert.equal(Input.hapticsSupported(), false, "desktop has no motor and the hello is pending");
  frame(false);
  assert.equal(Input.hapticsSupported(), true, "capability arrives before a steering sample");
  assert.equal(changes, 1);
  frame();
  Input.setHaptics(0.5); Input.vibrate(80);
  frame(false); frame(false);
  assert.deepEqual(phone.buzz, [40]);
  Input.setHaptics(0); Input.vibrate(80);
  frame(false); frame(false);
  assert.deepEqual(phone.buzz, [40], "OFF prevents the remote command");
  link.close();
  assert.equal(Input.hapticsSupported(), false);
  assert.equal(changes, 2);
});

test("a phone without a vibrator does not advertise haptics", () => {
  const { Input, frame } = pair({ phoneHaptics: false });
  frame();
  assert.equal(Input.remoteActive(), true);
  assert.equal(Input.hapticsSupported(), false);
});

test("missing, malformed, or wrong-protocol phone capabilities cannot enable haptics", () => {
  const { Input, hostEnd } = pair({ phoneHaptics: false });
  for (const hi of [
    { t: "hi", side: "pad", p: 1 },
    { t: "hi", side: "pad", p: 1, haptics: "true" },
    { t: "hi", side: "pad", p: 999, haptics: true },
    { t: "hi", side: "host", p: 1, haptics: true },
  ]) {
    hostEnd._emit("message", NetTransport.EVENT, JSON.stringify(hi));
    assert.equal(Input.hapticsSupported(), false);
  }
});

test("phone capabilities arriving before both RTC channels open survive the host open callback", () => {
  const { Input } = bootInput();
  const cb = {};
  const transport = { status: "connecting", onMessage: (f) => { cb.message = f; }, onOpen: (f) => { cb.open = f; },
    onClose: (f) => { cb.close = f; }, send: () => true, pump() {}, close() { cb.close(); } };
  const link = PhonePad.link(transport, { input: Input, pump: false });
  assert.equal(Input.hapticsSupported(), false);
  cb.message(NetTransport.EVENT, JSON.stringify({ t: "hi", side: "pad", p: 1, haptics: true }));
  assert.equal(Input.hapticsSupported(), true, "reliable EVENT channel can deliver before STATE opens");
  transport.status = "open"; cb.open();
  assert.equal(Input.hapticsSupported(), true, "opening the second channel must not erase the hello");
  link.close();
  assert.equal(Input.hapticsSupported(), false);
});

test("silence makes the source stale in 700 ms, and the keyboard takes over meanwhile", () => {
  const { Input, phone, frame, key } = pair();
  phone.roll = 30;
  for (let i = 0; i < 60; i++) frame();
  assert.ok(Input.steer() > 0.6);
  // The phone goes quiet (no samples, no heartbeat) — e.g. the screen locked.
  for (let i = 0; i < 30; i++) frame(false);         // 500 ms: still fresh
  assert.ok(Input.remoteActive(), "under 700 ms of silence is still live");
  for (let i = 0; i < 15; i++) frame(false);         // 750 ms
  assert.equal(Input.remoteActive(), false, "700 ms of silence is gone");
  assert.equal(Input.steer(), 0, "and the wheel is released, not left where the phone had it");
  // The keyboard always wins over the phone, live or not: the phone keeps
  // sending (frame() samples), and held ArrowLeft still owns the wheel.
  phone.roll = 30;
  key("ArrowLeft", true);
  for (let i = 0; i < 60; i++) frame();
  assert.ok(Input.remoteActive(), "the phone is live throughout");
  assert.ok(Input.steer() < -0.9, "held ArrowLeft beats a live phone rolled right");
  key("ArrowLeft", false);
});

test("a silent phone cannot leave its last roll steering through local tilt mode", () => {
  for (const mode of ["buttons", "touch", "tilt"]) {
    const { Input, clock } = bootInput();
    Input.setSteerMode(mode);
    for (let i = 1; i <= 60; i++) {
      clock.t = i * 16;
      Input.remoteSample({ roll: 30, thr: 1, brk: 1, held: 1 });
      Input.steer();
    }
    assert.ok(Input.steer() > 0.6, mode + ": the phone has the wheel");
    clock.t += 699;
    assert.ok(Input.remoteActive(), mode + ": fresh until the deadline");
    clock.t++;
    assert.equal(Input.remoteActive(), false);
    assert.equal(Input.steer(), 0, mode + ": expired roll cannot become a local gyro sample");
    assert.equal(Input.throttle(), false);
    assert.equal(Input.braking(), false);
    assert.equal(Input.lookingBack(), false);
    clock.t += 10000;
    assert.equal(Input.steer(), 0, mode + ": no stale steering later either");
  }
});

test("local gyro reacquires steering after a phone expires or disconnects", async () => {
  for (const disconnect of [false, true]) {
    const { Input, clock, sb } = bootInput();
    Input.setSteerMode("tilt");
    sb.DeviceOrientationEvent = {};
    let orient;
    sb.addEventListener = (kind, fn) => { if (kind === "deviceorientation") orient = fn; };
    await Input.requestGyro();
    clock.t = 16;
    orient({ beta: 0, gamma: -30 });
    for (let i = 0; i < 60; i++) {
      clock.t += 16;
      Input.remoteSample({ roll: 30 });
      orient({ beta: 0, gamma: -30 });
      Input.steer();
    }
    assert.ok(Input.steer() > 0.6, "the host sensor cannot overwrite the live phone's roll");
    if (disconnect) Input.remoteLost();
    else clock.t += 700;
    assert.equal(Input.steer(), 0, "attached local gyro must not claim the last phone sample");
    for (let i = 0; i < 120; i++) {
      clock.t += 16;
      orient({ beta: 0, gamma: -30 });
      Input.steer();
    }
    assert.ok(Input.tiltActive());
    assert.ok(Input.steer() < -0.6, "fresh local readings restore local tilt steering");
  }
});

test("the dash reaches the phone ~15 Hz on the unreliable channel and paints the wheel's LCD", () => {
  const { phone, frame, dash, link } = pair();
  frame();
  assert.equal(phone.huds.length, 0, "a sampler returning null sends nothing");
  dash.value = { gear: 5, kmh: 241, rpm: 0.8, lap: 2, laps: 10, pos: 3, cars: 20, ers: 0.4,
    flags: PhonePad.DASH.otArmed | PhonePad.DASH.xOpen, caution: 0, lastLapMs: 88123, state: "race", team: "#dc0000" };
  for (let i = 0; i < 60; i++) frame();    // one second of frames
  assert.ok(phone.huds.length >= 12 && phone.huds.length <= 17, `about 15 dash packets a second, got ${phone.huds.length}`);
  const sent = link.stats().huds;
  assert.ok(sent >= phone.huds.length && sent - phone.huds.length <= 1, `sent ${sent}, received ${phone.huds.length} — the last one may still be on the wire`);
  const el = lcd();
  PhonePad.paintHud(el, phone.huds[phone.huds.length - 1]);
  assert.equal(el.gear.textContent, "5");
  assert.equal(el.speed.textContent, "241");
  assert.equal(el.lap.textContent, "LAP 2/10");
  assert.equal(el.pos.textContent, "P3/20");
  assert.equal(el.last.textContent, "LAST 1:28.123");
  assert.equal(el.ot.textContent, "OT READY");
  assert.equal(el.aero.textContent, "STRAIGHT MODE");
  assert.equal(el.flag.textContent, "");
  assert.equal(el.ers.style.width, "40%");
  assert.equal(el.leds.children.filter((s) => s.classes.has("on")).length, 12, "80% revs lights 12 of 15 LEDs");
  assert.ok(el.screen.classes.has("ot-ready") && el.screen.classes.has("x-open") && !el.screen.classes.has("idle"));
  assert.equal(el.team.style["--team"], "#dc0000", "the LCD tints with the team");
  // Neutral in the pit lane, a caution on track, the lights before the start.
  PhonePad.paintHud(el, { ...phone.huds[0], gear: 0, kmh: 0, rpm: 0.2, state: "menu", flags: 0 });
  assert.equal(el.gear.textContent, "N"); assert.equal(el.speed.textContent, "---"); assert.equal(el.flag.textContent, "MENU");
  assert.equal(el.leds.children.filter((s) => s.classes.has("on")).length, 0, "no rev lights out of the race");
  assert.ok(el.screen.classes.has("idle"));
  assert.ok(el.body.classes.has("menu"), "out of a race the page shows the MENU PAD");
  PhonePad.paintHud(el, { ...phone.huds[0], state: "race", flags: PhonePad.DASH.paused });
  assert.ok(el.body.classes.has("menu") && el.flag.textContent === "PAUSED", "paused inside a race: the pad, for the pause menu");
  PhonePad.paintHud(el, { ...phone.huds[0], state: "race", flags: 0 });
  assert.ok(!el.body.classes.has("menu"), "racing again: the wheel");
  PhonePad.paintHud(el, { ...phone.huds[0], state: "race", caution: 3 });
  assert.equal(el.flag.textContent, "SAFETY CAR"); assert.ok(el.screen.classes.has("caution"));
  PhonePad.paintHud(el, { ...phone.huds[0], state: "count", flags: PhonePad.DASH.timeTrial });
  assert.equal(el.flag.textContent, "LIGHTS"); assert.equal(el.lap.textContent, "TT"); assert.equal(el.pos.textContent, "");
  PhonePad.paintHud(el, { ...phone.huds[0], flags: PhonePad.DASH.retired });
  assert.equal(el.pos.textContent, "DNF");
});

test("the LCD says Q / PRAC where the race HUD does, not a race position (R2-08)", () => {
  const D = PhonePad.DASH, el = lcd();
  const base = { gear: 3, kmh: 100, rpm: 0.5, lap: 1, laps: 1, pos: 1, cars: 1, ers: 0.5, flags: 0, caution: 0, lastLapMs: 0, state: "race", team: "" };
  PhonePad.paintHud(el, base);
  assert.equal(el.pos.textContent, "P1/1", "a race still reads its position");
  PhonePad.paintHud(el, { ...base, flags: D.quali });
  assert.equal(el.pos.textContent, "Q");
  PhonePad.paintHud(el, { ...base, pos: 7, cars: 20, flags: D.practice });
  assert.equal(el.pos.textContent, "PRAC");
  PhonePad.paintHud(el, { ...base, flags: D.quali | D.retired });
  assert.equal(el.pos.textContent, "DNF", "a retirement outranks the session tag, as on the HUD");
  const back = PhonePad.decodeHud(PhonePad.encodeHud({ ...base, flags: D.quali | D.practice }));
  assert.equal(back.flags, D.quali | D.practice, "the session bits survive the wire");
  assert.match(read("js/ui/platform-session.js"), /G\.session === "quali" \? D\.quali : G\.practice && !G\.timeTrial \? D\.practice/,
    "the sampler tags the session from the game's own state");
});

test("the control modes reach the wheel's layout: no paddles on AUTO gears, no GAS zone on AUTO throttle, AERO greyed on AUTO or no zones", () => {
  const D = PhonePad.DASH, el = lcd();
  const base = { gear: 3, kmh: 100, rpm: 0.5, lap: 1, laps: 5, pos: 2, cars: 20, ers: 0.5, flags: 0, caution: 0, lastLapMs: 0, state: "race", team: "" };
  PhonePad.paintHud(el, base);
  assert.deepEqual([...el.body.classes].sort(), [], "everything manual: no layout class");
  assert.equal(el.aero.textContent, "AERO");
  PhonePad.paintHud(el, { ...base, flags: D.gearsAuto | D.throttleAuto });
  assert.deepEqual([...el.body.classes].sort(), ["gears-auto", "throttle-auto"]);
  PhonePad.paintHud(el, { ...base, flags: D.aeroAuto | D.xOpen });
  assert.deepEqual([...el.body.classes].sort(), ["aero-auto"], "a mode change clears the classes it no longer needs");
  assert.equal(el.aero.textContent, "AUTO STRAIGHT");
  PhonePad.paintHud(el, { ...base, flags: D.aeroAuto });
  assert.equal(el.aero.textContent, "AERO AUTO");
  PhonePad.paintHud(el, { ...base, flags: D.aeroNone | D.xArmed });
  assert.deepEqual([...el.body.classes].sort(), ["aero-none"]);
  assert.equal(el.aero.textContent, "NO ZONES", "a circuit with no zones says so whatever the arming");
  const back = PhonePad.decodeHud(PhonePad.encodeHud({ ...base, flags: D.gearsAuto | D.throttleAuto | D.aeroAuto | D.aeroNone }));
  assert.equal(back.flags, D.gearsAuto | D.throttleAuto | D.aeroAuto | D.aeroNone, "the mode bits survive the wire");
  const page = read("controller.html");
  for (const rule of ["body.gears-auto .shift", "body.gears-auto .tap { display: flex; }", "body.throttle-auto #gas", "body.aero-auto #b-aero, body.aero-none #b-aero"]) {
    assert.ok(page.includes(rule), `controller.html styles ${rule}`);
  }
  assert.match(read("js/ui/platform-session.js"), /controls\.gearsManual \? 0 : D\.gearsAuto[\s\S]*controls\.autoThrottle \? D\.throttleAuto[\s\S]*G\.raceAeroMode === "auto" \? D\.aeroAuto[\s\S]*D\.aeroNone/,
    "the sampler reads the game's own mode functions");
});

test("closing the link drops the pedals and the source at once and unhooks the haptics", () => {
  const { Input, phone, frame, link, session, closedCount } = pair();
  phone.thr = 1; phone.roll = 20;
  for (let i = 0; i < 30; i++) frame();
  assert.equal(Input.throttle(), true);
  session.close();
  frame(false);
  assert.equal(closedCount(), 1, "the desktop learned the phone left");
  assert.equal(Input.remoteActive(), false);
  assert.equal(Input.throttle(), false, "a dropped phone cannot hold the throttle open");
  assert.equal(Input.steer(), 0);
  assert.equal(link.stats().open, false);
  Input.vibrate(30);
  assert.equal(phone.buzz.length, 0, "no haptic is forwarded to a phone that is gone");
});

test("Input.reset() (blur / everything-off) clears the phone's pedals until it re-sends", () => {
  const { Input, phone, frame } = pair();
  phone.thr = 1; frame();
  assert.equal(Input.throttle(), true);
  Input.reset();
  assert.equal(Input.throttle(), false, "reset drops the held pedal like every other source");
  frame();
  assert.equal(Input.throttle(), true, "the next sample restores it — the phone is still pressing");
});

test("menu pad: the phone's nav events land on the gamepad's menu seam (arrows, activate, back)", () => {
  const { Input, sb, keys } = bootInput();
  // No menu on top: a direction is a no-op, not a stray key into the race.
  assert.equal(Input.remoteEvent("navDown"), true); assert.deepEqual(keys, []);
  // A menu with nothing focused: the first press SEEDS focus (ArrowDown), as the pad's first press does.
  const btn = { tagName: "BUTTON", disabled: false, clicks: 0, click() { this.clicks++; }, matches: () => true,
    dispatchEvent: (e) => { keys.push("btn:" + (e.key || e.type)); return true; } };
  const layer = { tagName: "DIV", contains: (n) => n === btn, dispatchEvent: (e) => { keys.push("layer:" + e.type); return true; } };
  sb.MenuNav = { activeLayer: () => layer, FOCUSABLE: "button" };
  sb.UiLayers = { top: () => layer };
  Input.remoteEvent("navRight");
  assert.deepEqual(keys, ["doc:ArrowDown"], "seeded, not moved");
  sb.document.activeElement = btn;
  Input.remoteEvent("navRight"); Input.remoteEvent("navUp"); Input.remoteEvent("navLeft"); Input.remoteEvent("navDown");
  assert.deepEqual(keys.slice(1), ["btn:ArrowRight", "btn:ArrowUp", "btn:ArrowLeft", "btn:ArrowDown"], "arrows at the focused control");
  Input.remoteEvent("navSelect"); assert.equal(btn.clicks, 1, "SELECT clicks the focused control (a synthetic Enter would not)");
  Input.remoteEvent("navBack"); assert.equal(keys.at(-1), "btn:Escape", "BACK is Escape on a plain layer");
  layer.tagName = "DIALOG"; Input.remoteEvent("navBack"); assert.equal(keys.at(-1), "layer:cancel", "and the cancel seam on a <dialog>");
  assert.equal(Input.remoteEvent("navSideways"), false, "an unknown nav name is refused");
});

// ---------------------------------------------------------------------------
// The phone page's wiring: pad() over a mini DOM, connected through injected
// signalling onto the loopback wire, so a pointer on the fake GAS zone and a
// press on the fake paddle are what reach the desktop's Input.
// ---------------------------------------------------------------------------

function fakeEl() {
  const listeners = {};
  const el = {
    textContent: "", disabled: false, value: "", style: { setProperty(k, v) { this[k] = v; } },
    classes: new Set(),
    addEventListener(t, f) { (listeners[t] ||= []).push(f); },
    dispatch(t, ev) { for (const f of listeners[t] || []) f(Object.assign({ preventDefault() {}, pointerId: 1 }, ev)); },
    setPointerCapture() {},
    getBoundingClientRect: () => ({ top: 100, height: 200, left: 0, width: 100 }),
  };
  el.classList = { add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c), toggle: (c, on) => (on ? el.classes.add(c) : el.classes.delete(c)) };
  return el;
}

test("the phone controller accepts a full private relay token and explains an incomplete one", async () => {
  const dom = { codeIn: fakeEl(), status: fakeEl() };
  dom.codeIn.maxLength = 8;
  const page = PhonePad.pad(dom, { deps: { privateRelay: () => true, normalise: (c) => c, valid: () => false } });
  assert.equal(dom.codeIn.maxLength, 32);
  assert.equal(dom.codeIn.placeholder, "PRIVATE ROOM TOKEN");
  assert.equal((await page.connect("ABC123")).error, "bad_code");
  assert.match(dom.status.textContent, /full 32-character token/);
});

test("a fresh phone learns the private Worker only on CONNECT, with its token confined to the fragment", async () => {
  const secret = "ABCDEFGH23456789ABCDEFGH23456789";
  const endpoint = "https://relay.test/custom/base";
  const url = PhonePad.padUrl(secret, "https://game.test/index.html", endpoint);
  const parsed = new URL(url);
  assert.equal(parsed.search, ""); assert.equal(parsed.pathname, "/controller.html");
  assert.equal(parsed.hash, "#pad=" + secret + "&relay=" + encodeURIComponent(endpoint));
  let selected = null;
  const calls = [], swaps = [];
  const dom = { codeIn: fakeEl(), status: fakeEl() };
  const ctl = PhonePad.pad(dom, { href: url, deps: {
    privateRelay: () => !!selected,
    setSessionUrl(value) { calls.push(value); selected = value; return true; },
    normalise: (c) => c, valid: (c) => !!selected && c.length === 32,
    prefetchIce: async () => null, rtc: () => ({ close() {} }),
    swap: async (o) => { swaps.push({ code: o.code, endpoint: selected }); return { ok: false, error: "expired" }; },
  } });
  assert.equal(dom.codeIn.value, secret); assert.equal(dom.codeIn.maxLength, 32);
  assert.deepEqual(calls, [], "opening a QR URL must not change relay configuration");
  await ctl.connect(dom.codeIn.value);
  assert.deepEqual(calls, [endpoint]);
  assert.deepEqual(swaps, [{ code: secret, endpoint }]);
});

test("public QR clears a previous private document override, while invalid relay metadata makes no network request", async () => {
  for (const relay of [null, "http://remote.test", "https://u:p@relay.test", "https://relay.test/?secret=x", "https://relay.test/#x", "%E0%A4%A"]) {
    let selected = "https://previous.test", changes = 0, network = 0;
    const href = "https://game.test/controller.html#pad=ABC234" + (relay === null ? "" : "&relay=" + encodeURIComponent(relay));
    const ctl = PhonePad.pad({ codeIn: fakeEl(), status: fakeEl() }, { href, deps: {
      privateRelay: () => !!selected, setSessionUrl(value) { selected = value; changes++; return true; },
      normalise: (c) => c, valid: (c) => !selected && c.length === 6,
      prefetchIce: async () => { network++; }, rtc: () => null,
    } });
    assert.equal(changes, 0);
    const result = await ctl.connect("ABC234");
    assert.equal(changes, relay === null ? 1 : 0);
    assert.equal(network, relay === null ? 1 : 0);
    assert.equal(result.error, relay === null ? "no_transport" : "bad_relay");
  }
  assert.throws(() => PhonePad.padUrl("ABC234", "https://game.test/", "http://remote.test"), /Invalid private pairing/);
});

test("pad(): the page's pedals, paddles and LCD are wired through to the wire and back", async () => {
  const desk = bootInput();
  const [padEnd, hostEnd] = NetTransport.loopback({ latencyMs: 2, rnd: NetTransport.seededRnd(3) });
  padEnd.pump(0); hostEnd.pump(0);
  const clock = desk.clock;
  const dash = { value: { gear: 7, kmh: 301, rpm: 0.95, lap: 9, laps: 9, pos: 1, cars: 20, ers: 0.1, flags: PhonePad.DASH.redline, caution: 0, lastLapMs: 0, state: "race", team: "#0b0e10" } };
  const link = PhonePad.link(hostEnd, { input: desk.Input, pump: false, now: () => clock.t, hud: () => dash.value });
  const dom = { body: fakeEl(), status: fakeEl(), codeIn: fakeEl(), connect: fakeEl(), gas: fakeEl(), brake: fakeEl(), lookBack: fakeEl(),
    center: fakeEl(), rim: fakeEl(), buttons: Object.fromEntries(PhonePad.EVENTS.map((k) => [k, fakeEl()])), hud: lcd() };
  dom.buttons.overtake = [fakeEl(), fakeEl()];   // OT lives on the grip AND the face
  dom.stick = fakeEl(); dom.nub = fakeEl();
  dom.arrows = { navUp: fakeEl(), navDown: fakeEl(), navLeft: fakeEl(), navRight: fakeEl() };
  const seen = [];
  const timers = fakeTimers();
  const ctl = PhonePad.pad(dom, { now: () => clock.t, timers, deps: {
    rtc: () => padEnd, prefetchIce: async () => null, normalise: (c) => String(c).toUpperCase(), valid: (c) => c.length === 6,
    // The courier, stood in for: hand the page an "offer", take its answer.
    swap: async (o) => { seen.push("swap:" + o.code); const ans = await o.reply("OFFER"); return ans ? { ok: true } : { ok: false, error: "reply_failed" }; },
    acceptInvite: async (t, invite) => { seen.push("accept:" + invite); return { ok: true, code: "ANSWER" }; },
  } });
  assert.match(dom.status.textContent, /room code/i, "the page asks for a code when the URL carries none");
  const bad = await ctl.connect("nope");
  assert.equal(bad.error, "bad_code"); assert.ok(dom.status.classes.has("bad"));
  const ok = await ctl.connect("abc234");
  assert.deepEqual(ok, { ok: true });
  assert.deepEqual(seen, ["swap:ABC234", "accept:OFFER"], "the code is normalised, the offer answered");
  assert.ok(ctl.state().linked && dom.body.classes.has("linked"), "the wheel shows once the channel is open");
  const frame = () => { clock.t += STEP; ctl.pump(); link.pump(); desk.Input.steer(); };
  // GAS: a thumb two-thirds down the zone is two-thirds travel; lifting it is zero.
  dom.gas.dispatch("pointerdown", { clientY: 100 + 200 * (2 / 3) });
  for (let i = 0; i < 3; i++) frame();
  assert.ok(desk.Input.throttle(), "GAS reaches throttle()");
  assert.ok(Math.abs(desk.Input.throttleLevel() - 2 / 3) < 0.02, `travel ${desk.Input.throttleLevel()}`);
  assert.ok(dom.gas.classes.has("on"));
  dom.gas.dispatch("pointerup", {});
  for (let i = 0; i < 3; i++) frame();
  assert.equal(desk.Input.throttle(), false); assert.ok(!dom.gas.classes.has("on"));
  // The paddle: an edge on the DOWN, once.
  dom.buttons.shiftUp.dispatch("pointerdown", {});
  for (let i = 0; i < 3; i++) frame();
  assert.equal(desk.Input.consumeShiftUp(), true); assert.equal(desk.Input.consumeShiftUp(), false);
  dom.center.dispatch("pointerdown", {});
  for (let i = 0; i < 3; i++) frame();   // CENTRE TILT → Input.calibrate() on the desktop (no throw, no edge)
  dom.buttons.overtake[1].dispatch("pointerdown", {});
  for (let i = 0; i < 3; i++) frame();
  assert.equal(desk.Input.consumeOvertake(), true, "the second OT button (the grip's) fires the same edge");
  // MENU PAD: a held direction repeats at a keyboard's cadence (380 ms, then every 110 ms); the release stops it.
  const e0 = link.stats().events;
  dom.buttons.navDown.dispatch("pointerdown", {});
  for (let i = 0; i < 3; i++) frame();
  assert.equal(link.stats().events, e0 + 1, "one edge on the down");
  timers.advance(379); for (let i = 0; i < 3; i++) frame();
  assert.equal(link.stats().events, e0 + 1, "nothing before the delay");
  timers.advance(1); timers.advance(220); for (let i = 0; i < 3; i++) frame();
  assert.equal(link.stats().events, e0 + 3, "then two repeats in 220 ms");
  dom.buttons.navDown.dispatch("pointerup", {});
  timers.advance(1000); for (let i = 0; i < 3; i++) frame();
  assert.equal(link.stats().events, e0 + 3, "released: no more"); assert.equal(timers.pending(), 0, "and no timer left behind");
  dom.buttons.navSelect.dispatch("pointerdown", {}); dom.buttons.navSelect.dispatch("pointerup", {});
  for (let i = 0; i < 3; i++) frame();
  assert.equal(link.stats().events, e0 + 4, "SELECT is one edge"); assert.equal(timers.pending(), 0, "and never repeats");
  // THE MENU STICK: one disc (fakeEl's box: centre 50,200, radius 50). A tap
  // on an edge is that arrow at once; a drag turns to another; the middle is
  // dead; the arrow under the live direction lights; release stops the repeat.
  const s0 = link.stats().events;
  dom.stick.dispatch("pointerdown", { clientX: 50, clientY: 205 });
  for (let i = 0; i < 3; i++) frame();
  assert.equal(link.stats().events, s0, "a thumb in the middle fires nothing");
  dom.stick.dispatch("pointermove", { clientX: 50, clientY: 110 });
  for (let i = 0; i < 3; i++) frame();
  assert.equal(link.stats().events, s0 + 1, "dragged up: one navUp");
  assert.ok(dom.arrows.navUp.classes.has("on") && dom.stick.classes.has("on"), "the up arrow lights");
  assert.match(dom.nub.style.transform, /^translate\(0\.0px,-27\.5px\)$/, "the nub follows, clamped to 55 % of the radius");
  dom.stick.dispatch("pointermove", { clientX: 60, clientY: 150 });   // still mostly up: no flicker
  dom.stick.dispatch("pointermove", { clientX: 95, clientY: 195 });
  for (let i = 0; i < 3; i++) frame();
  assert.equal(link.stats().events, s0 + 2, "turned right: one navRight, and no second navUp");
  assert.ok(dom.arrows.navRight.classes.has("on") && !dom.arrows.navUp.classes.has("on"));
  timers.advance(380); timers.advance(110); for (let i = 0; i < 3; i++) frame();
  assert.equal(link.stats().events, s0 + 3, "held right repeats like a key");
  dom.stick.dispatch("pointerup", {});
  timers.advance(1000); for (let i = 0; i < 3; i++) frame();
  assert.equal(link.stats().events, s0 + 3, "released: nothing more");
  assert.equal(timers.pending(), 0, "and no timer left behind");
  assert.equal(dom.nub.style.transform, "", "the nub springs home");
  assert.ok(!dom.arrows.navRight.classes.has("on") && !dom.stick.classes.has("on"));
  dom.stick.dispatch("pointerdown", { clientX: 5, clientY: 200 });
  for (let i = 0; i < 3; i++) frame();
  assert.equal(link.stats().events, s0 + 4, "a tap on the left edge is navLeft at once");
  dom.stick.dispatch("pointerup", {});
  // Tilt: setRoll() stands in for the sensor; the rim turns, the desktop steers.
  ctl.setRoll(30);
  for (let i = 0; i < 60; i++) { frame(); ctl.setRoll(30); }
  assert.equal(dom.rim.style.transform, "rotate(18.0deg)", "the rim leans at 0.6 of the roll");
  ctl.setRoll(80); assert.equal(dom.rim.style.transform, "rotate(25.0deg)", "and never past 25°");
  ctl.setRoll(30);
  assert.ok(desk.Input.steer() > 0.6, `the phone's 30° steers, got ${desk.Input.steer()}`);
  // The dash came back and painted the LCD: gear 7, redline, one LED short of all fifteen.
  assert.equal(dom.hud.gear.textContent, "7");
  assert.equal(dom.hud.speed.textContent, "301");
  assert.equal(dom.hud.lap.textContent, "LAP 9/9");
  assert.equal(dom.hud.pos.textContent, "P1/20");
  assert.ok(dom.hud.screen.classes.has("redline"));
  assert.equal(dom.hud.leds.children.filter((s) => s.classes.has("on")).length, 14);
  assert.equal(dom.hud.team.style["--team"], "#0b0e10");
  assert.ok(ctl.state().stats.huds > 5, "dash packets counted on the phone");
  // The desktop drops the link: the wheel goes back to the pairing screen.
  link.close();
  frame();
  assert.equal(ctl.state().linked, false); assert.ok(!dom.body.classes.has("linked"));
  assert.match(dom.status.textContent, /Disconnected/);
  assert.equal(dom.connect.disabled, false, "CONNECT is offered again");
});

test("pad(): a lost lift on the menu stick or a held arrow is caught by the all-fingers-up / hidden nets (hunt3 7-F5)", async () => {
  const desk = bootInput();
  const [padEnd, hostEnd] = NetTransport.loopback({ latencyMs: 2, rnd: NetTransport.seededRnd(3) });
  padEnd.pump(0); hostEnd.pump(0);
  const clock = desk.clock;
  const link = PhonePad.link(hostEnd, { input: desk.Input, pump: false, now: () => clock.t, hud: () => null });
  const docL = {};
  const hadDoc = Object.prototype.hasOwnProperty.call(globalThis, "document");
  const prevDoc = globalThis.document;
  globalThis.document = { hidden: false, visibilityState: "visible", addEventListener(t, f) { (docL[t] ||= []).push(f); } };
  try {
    const dom = { body: fakeEl(), status: fakeEl(), codeIn: fakeEl(), connect: fakeEl(), gas: fakeEl(), brake: fakeEl(), lookBack: fakeEl(),
      center: fakeEl(), rim: fakeEl(), buttons: Object.fromEntries(PhonePad.EVENTS.map((k) => [k, fakeEl()])), hud: lcd() };
    dom.stick = fakeEl(); dom.nub = fakeEl();
    dom.arrows = { navUp: fakeEl(), navDown: fakeEl(), navLeft: fakeEl(), navRight: fakeEl() };
    const timers = fakeTimers();
    const ctl = PhonePad.pad(dom, { now: () => clock.t, timers, deps: {
      rtc: () => padEnd, prefetchIce: async () => null, normalise: (c) => String(c).toUpperCase(), valid: (c) => c.length === 6,
      swap: async (o) => { const ans = await o.reply("OFFER"); return ans ? { ok: true } : { ok: false, error: "reply_failed" }; },
      acceptInvite: async () => ({ ok: true, code: "ANSWER" }),
    } });
    assert.deepEqual(await ctl.connect("abc234"), { ok: true });
    const frame = () => { clock.t += STEP; ctl.pump(); link.pump(); };
    const fire = (t, ev) => { for (const f of docL[t] || []) f(ev); };
    // The stick held right; its pointerup is lost, then the last finger lifts.
    dom.stick.dispatch("pointerdown", { clientX: 95, clientY: 200 });
    for (let i = 0; i < 3; i++) frame();
    const s0 = link.stats().events;
    fire("touchend", { touches: [] });
    timers.advance(1000); for (let i = 0; i < 3; i++) frame();
    assert.equal(link.stats().events, s0, "no repeat after every finger is up");
    assert.equal(timers.pending(), 0, "and no timer left behind");
    assert.ok(!dom.stick.classes.has("on") && !dom.arrows.navRight.classes.has("on"), "the stick and its arrow go dark");
    dom.stick.dispatch("pointerdown", { pointerId: 2, clientX: 5, clientY: 200 });
    for (let i = 0; i < 3; i++) frame();
    assert.equal(link.stats().events, s0 + 1, "the stick takes the next press (its pointer slot was freed)");
    dom.stick.dispatch("pointerup", { pointerId: 2 });
    // A held D-pad arrow; the page is hidden (a call, the lock button) with no pointercancel.
    dom.buttons.navDown.dispatch("pointerdown", {});
    for (let i = 0; i < 3; i++) frame();
    const a0 = link.stats().events;
    globalThis.document.hidden = true;
    fire("visibilitychange", {});
    timers.advance(1000); for (let i = 0; i < 3; i++) frame();
    assert.equal(link.stats().events, a0, "a hidden page stops the arrow's repeat");
    assert.equal(timers.pending(), 0);
    assert.ok(!dom.buttons.navDown.classes.has("on"));
    link.close(); frame();
  } finally {
    if (hadDoc) globalThis.document = prevDoc; else delete globalThis.document;
  }
});

// ---------------------------------------------------------------------------
// The desktop's pairing flow: host() with the signalling stood in for, onto the
// loopback wire — the phase machine, the QR hand-off, the lost-link cleanup.
// ---------------------------------------------------------------------------

const tick = () => new Promise((r) => setImmediate(r));
async function settle(n = 6) { for (let i = 0; i < n; i++) await tick(); }

function hostHarness(over = {}) {
  const desk = bootInput();
  const [padEnd, hostEnd] = NetTransport.loopback({ latencyMs: 1, rnd: NetTransport.seededRnd(5) });
  padEnd.pump(0); hostEnd.pump(0);
  const ui = { said: [], qrs: [], linkedN: 0, lostN: 0,
    say: (t, bad) => ui.said.push((bad ? "!" : "") + t), qr: (url, code) => ui.qrs.push({ url, code }),
    linked: () => ui.linkedN++, lost: () => ui.lostN++, hud: () => null };
  const room = { stopped: 0, onJoiner: null, stop() { room.stopped++; } };
  const deps = Object.assign({
    rtc: () => hostEnd, prefetchIce: async () => null, makeCode: () => "ABC234", relayUrl: () => "https://relay.test/base",
    usingPrivateRelay: () => false,
    createInvite: async () => ({ ok: true, code: "OFFER" }),
    acceptAnswer: async () => ({ ok: true }),
    hostRoom: async (o) => { room.onJoiner = o.onJoiner; room.onFail = o.onFail; room.token = o.token; return { ok: true, stop: room.stop }; },
  }, over);
  // host() reads the page's Input; the harness's is handed through the global.
  globalThis.Input = desk.Input;
  const ctl = PhonePad.host(ui, deps);
  return { ...desk, ui, room, ctl, padEnd, hostEnd };
}

test("host(): prepares, mints a code, paints the QR, waits, links on the phone's answer, then closes the room", async () => {
  const h = hostHarness();
  await settle();
  assert.equal(h.ctl.state().phase, "waiting");
  assert.equal(h.ctl.state().code, "ABC234");
  assert.deepEqual(h.ui.qrs, [{ url: PhonePad.padUrl("ABC234"), code: "ABC234" }], "the QR carries controller.html#pad=CODE");
  assert.match(h.ui.said.at(-1), /Scan the code/);
  assert.ok(h.room.onJoiner, "the room is hosted");
  await h.room.onJoiner(null, "ANSWER");
  await settle();
  assert.equal(h.ctl.state().phase, "linked", "the loopback end is already open, so the link opens at once");
  assert.equal(h.ui.linkedN, 1);
  assert.equal(h.room.stopped, 1, "the room closes once the phone is on");
  assert.ok(h.room.token.cancelled);
  assert.deepEqual(h.ui.qrs.at(-1), { url: null, code: null }, "the QR is taken down");
  assert.match(h.ui.said.at(-1), /connected/i);
  // A second answer (another scan of the same code) is ignored.
  await h.room.onJoiner(null, "ANSWER-2"); await settle();
  assert.equal(h.ui.linkedN, 1);
  // The phone drops: lost, said, and the page told to re-press.
  h.padEnd.close(); await settle();
  assert.equal(h.ctl.state().phase, "lost");
  assert.equal(h.ui.lostN, 1);
  assert.match(h.ui.said.at(-1), /^!Phone disconnected/);
  assert.equal(h.Input.remoteActive(), false);
  h.ctl.cancel();   // idempotent after lost
  assert.equal(h.ctl.state().phase, "cancelled");
});

test("host(): an unreadable answer goes back to waiting; a room that will not open fails; cancel while waiting tears down", async () => {
  const bad = hostHarness({ acceptAnswer: async () => ({ ok: false, error: "corrupt_code", message: "That code is incomplete." }) });
  await settle();
  await bad.room.onJoiner(null, "JUNK"); await settle();
  assert.equal(bad.ctl.state().phase, "waiting", "back to waiting for a readable answer");
  assert.match(bad.ui.said.at(-1), /^!That code is incomplete/);
  bad.ctl.cancel();
  assert.equal(bad.room.stopped, 1); assert.equal(bad.hostEnd.status, "closed");

  const noRoom = hostHarness({ hostRoom: async () => ({ ok: false, error: "no_relay", message: "Could not reach any room service." }) });
  await settle();
  assert.equal(noRoom.ctl.state().phase, "failed");
  assert.match(noRoom.ui.said.at(-1), /^!Could not reach any room service/);

  const noRtc = hostHarness({ rtc: () => null });
  await settle();
  assert.equal(noRtc.ctl.state().phase, "failed");
  assert.match(noRtc.ui.said.at(-1), /WebRTC is unavailable/);

  const lostEarly = hostHarness();
  await settle();
  await lostEarly.room.onJoiner(null, "ANSWER");
  // ICE never completes: the wire dies before/after opening — the room must not linger.
  lostEarly.padEnd.close(); await settle();
  assert.equal(lostEarly.ctl.state().phase, "lost");
  assert.equal(lostEarly.room.stopped, 1, "a lost link drops the room's relay sockets");
});

test("a phone with no motion sensor is pedals and buttons only: it never blocks the local steering", () => {
  const { Input, phone, frame } = pair();
  Input.setSteerMode("buttons");
  phone.roll = null; phone.thr = 0.5;
  for (let i = 0; i < 10; i++) frame();
  assert.ok(Input.remoteActive(), "the link is live");
  assert.equal(Input.remoteSteers(), false, "but it does not steer");
  assert.equal(Input.throttle(), true, "its pedal still works");
  assert.equal(Input.debugState().remote.steers, false);
  // The local on-screen arrows reach steer(): the remote is not sitting in front of them.
  assert.equal(Input.steer(), 0);
  phone.roll = 20;
  for (let i = 0; i < 60; i++) frame();
  assert.ok(Input.remoteSteers() && Input.steer() > 0.3, "a roll appearing later takes the wheel");
});

test("pad(): SCAN reads the game's QR in the page, fills the code and connects; a refused camera says so", async () => {
  const [padEnd] = NetTransport.loopback({ latencyMs: 1, rnd: NetTransport.seededRnd(9) });
  let onCode = null, started = 0, stopped = 0, cam = { ok: true };
  const Scan = { supported: () => true, create: () => ({
    start: async (video, cb) => { started++; onCode = cb; return cam; },
    stop: () => { stopped++; onCode = null; }, active: () => !!onCode }) };
  const swaps = [];
  const dom = { body: fakeEl(), status: fakeEl(), codeIn: fakeEl(), connect: fakeEl(), scan: fakeEl(), scanBox: fakeEl(), video: fakeEl(),
    buttons: {}, hud: lcd() };
  dom.scanBox.hidden = true;
  const ctl = PhonePad.pad(dom, { deps: { scan: () => Scan, rtc: () => padEnd, prefetchIce: async () => null,
    normalise: (c) => String(c).toUpperCase(), valid: (c) => c.length === 6,
    swap: async (o) => { swaps.push(o.code); return { ok: false, error: "expired" }; }, acceptInvite: async () => ({ ok: false }) } });
  assert.match(dom.status.textContent, /Scan the game's QR code/, "the prompt offers the camera first");
  const r = await ctl.scan();
  assert.ok(r.ok && started === 1 && !dom.scanBox.hidden, "the camera view opens");
  assert.equal(dom.scan.textContent, "CANCEL SCAN");
  const deliver = onCode; onCode = null;   // NetScan stops itself before it hands the code over
  deliver("https://example.test/f1-game/controller.html#pad=xyz789");
  await settle();
  assert.equal(dom.codeIn.value, "xyz789", "the code is lifted from the game's pairing URL");
  assert.deepEqual(swaps, ["XYZ789"], "and CONNECT runs on it without another tap");
  assert.ok(dom.scanBox.hidden && dom.scan.textContent === "SCAN QR CODE", "the camera view closes");
  cam = { ok: false, error: "denied", message: "Camera access was refused. Allow it, or paste the code instead." };
  const r2 = await ctl.scan();
  assert.equal(r2.error, "denied");
  assert.match(dom.status.textContent, /or type the code instead/, "the page's own words: there is no paste box here");
  assert.ok(dom.status.classes.has("bad") && dom.scanBox.hidden);
  // A browser with no camera API never shows the button.
  const dom2 = { body: fakeEl(), status: fakeEl(), codeIn: fakeEl(), connect: fakeEl(), scan: fakeEl(), buttons: {}, hud: lcd() };
  PhonePad.pad(dom2, { deps: { scan: () => ({ supported: () => false }) } });
  assert.equal(dom2.scan.hidden, true);
});

test("link(): the phone's focus wears .pad-ring (a browser may not draw it), until a real key or pointer takes over", () => {
  const desk = bootInput();
  const [padEnd, hostEnd] = NetTransport.loopback({ latencyMs: 1, rnd: NetTransport.seededRnd(4) });
  padEnd.pump(0); hostEnd.pump(0);
  const L = {};
  const mk = (id) => { const n = { id, classes: new Set() };
    n.classList = { add: (c) => n.classes.add(c), remove: (c) => n.classes.delete(c) }; return n; };
  const a = mk("a"), b = mk("b");
  const doc = { body: mk("body"), documentElement: mk("html"), activeElement: null,
    addEventListener: (t, f) => { (L[t] ||= []).push(f); }, removeEventListener: (t, f) => { L[t] = (L[t] || []).filter((g) => g !== f); } };
  const fire = (t, ev) => { for (const f of L[t] || []) f(ev); };
  // The desktop's Input stands in: a nav moves focus the way MenuNav would.
  const input = Object.assign(Object.create(desk.Input), {
    remoteEvent: (k) => { if (k === "navDown") { doc.activeElement = doc.activeElement === a ? b : a; fire("focusin", { target: doc.activeElement }); } return true; } });
  const clock = desk.clock;
  const link = PhonePad.link(hostEnd, { input, pump: false, now: () => clock.t, doc });
  const sess = PhonePad.padSession(padEnd, { roll: () => null, thr: () => 0, brk: () => 0, held: () => 0 }, { now: () => clock.t, heartbeat: false });
  const step = () => { for (let i = 0; i < 4; i++) { clock.t += STEP; sess.pump(); link.pump(); } };
  step();
  // Focus moved by the page itself (a screen opening) is not the phone's.
  doc.activeElement = b; fire("focusin", { target: b });
  assert.ok(!b.classes.has("pad-ring"), "no ring before the phone navigates");
  sess.event("navDown"); step();
  assert.ok(a.classes.has("pad-ring") && !b.classes.has("pad-ring"), "the phone's focus is ringed");
  sess.event("navDown"); step();
  assert.ok(b.classes.has("pad-ring") && !a.classes.has("pad-ring"), "and the ring moves with it");
  fire("keydown", { isTrusted: false });
  assert.ok(b.classes.has("pad-ring"), "the pad's own synthetic keys do not count as the desktop's");
  fire("pointerdown", { isTrusted: true });
  assert.ok(!b.classes.has("pad-ring"), "a real click on the desktop takes over");
  sess.event("navDown"); step();
  assert.ok(a.classes.has("pad-ring"));
  link.close();
  assert.ok(!a.classes.has("pad-ring") && !(L.focusin || []).length, "closing the link clears the ring and its listeners");
});

// ---------------------------------------------------------------------------
// The two shells agree
// ---------------------------------------------------------------------------

test("controller.html carries exactly the manifest's CONTROLLER subset and both roll ends load TiltRoll", async () => {
  const MANIFEST = (await import(path.join(ROOT, "tools/manifest.cjs"))).default;
  const page = read("controller.html");
  const tags = [...page.matchAll(/<script[^>]+src="([^"?]+)\?v=dev"/g)].map((m) => m[1]);
  assert.deepEqual(tags, MANIFEST.CONTROLLER, "the generated block must match the manifest (run node tools/gen/gen-shell.mjs)");
  assert.ok(MANIFEST.CONTROLLER.includes("js/input/tilt-roll.js") && MANIFEST.FULL.includes("js/input/tilt-roll.js"),
    "the roll math is on both pages");
  assert.ok(MANIFEST.FULL.indexOf("js/input/tilt-roll.js") < MANIFEST.FULL.indexOf("js/input/input.js"),
    "tilt-roll loads before input.js, which calls it");
  assert.ok(MANIFEST.LAZY_NET.includes("js/input/phone-pad.js"), "the desktop half loads with the net stack");
  const { STAGE_ROOT_FILES } = await import("../../tools/desktop/stage-files.mjs");
  assert.ok(STAGE_ROOT_FILES.includes("controller.html"),
    "controller.html must be in the shared stage allow-list (tools/desktop/stage-files.mjs)");
  assert.match(read(".github/workflows/pages.yml"), /tools\/desktop\/stage\.mjs/,
    "pages.yml must stage via the shared stage script (not a forked cp list)");
  // The phone's own door: a touch device opens controller.html from the title
  // and from CONTROLS; a mouse never sees either button (live with the pointer
  // kind, next to body.desktop). Plain navigation — no net stack on the phone.
  const idx = read("index.html"), gameJs = read("js/ui/platform-session.js") + read("js/game.js");
  assert.match(idx, /<button id="mb-phonepad" class="bigbtn alt minibtn" hidden /, "title door, hidden until the pointer is coarse");
  assert.match(idx, /<button id="pm-phonepad-go" type="button" hidden>/, "CONTROLS door, hidden until the pointer is coarse");
  assert.match(gameJs, /function syncPointerKind\(\) \{[\s\S]*?\$\("mb-phonepad"\)\.hidden = !touch;[\s\S]*?\$\("pm-phonepad-go"\)\.hidden = !touch;/,
    "both doors flip with the live pointer kind");
  assert.match(gameJs, /location\.assign\(new URL\("controller\.html", location\.href\)\.href\)/, "the door is a navigation beside index.html");
  // A linked phone is the wheel, so the screen shows VISOR (the cockpit eye past the drawn wheel)
  // while it drives, and the player's own camera comes back when the phone is gone.
  assert.match(gameJs, /const VISOR_CAM = CamModes\.CAM_MODES\.findIndex\(\(c\) => c\.id === "visor"\)/, "the visor mode is looked up by id, never by index");
  assert.match(gameJs, /linked: \(\) => \{[\s\S]*?if \(VISOR_CAM >= 0 && G.camMode !== VISOR_CAM\) \{ phonePadCam = G.camMode; G\.setCamMode\(VISOR_CAM, \{ persist: false \}\); \}/, "linking switches to VISOR (not saved as the player's camera) and remembers the camera it left");
  assert.match(gameJs, /phonePad\.cancel\(\);\s+phonePad = null;[\s\S]{0,200}?if \(phonePadCam >= 0 && G.camMode === VISOR_CAM\) G\.setCamMode\(phonePadCam\);/, "UNPAIR PHONE restores that camera too (cancel() never calls lost())");
  assert.match(gameJs, /lost: \(\) => \{[\s\S]*?if \(phonePadCam >= 0 && G.camMode === VISOR_CAM\) G\.setCamMode\(phonePadCam\);/, "losing the phone restores that camera, unless the player cycled away");
  assert.match(gameJs, /\$\("mb-phonepad"\)\.onclick = goPhonePad;[\s\S]*?\$\("pm-phonepad-go"\)\.onclick = goPhonePad;/, "both doors wired");
  // The face keys (OT/BOOST/AERO/CAM/RADIO/LOOK/RESET/PAUSE) are thumb-sized:
  // never under a 48px tap target, growing with the phone's height; the
  // screen is the flex child that gives way.
  assert.match(page, /#keys button \{ padding: 0; min-height: clamp\(48px, 14vh, 80px\); font-weight: 800; font-size: clamp\(12px, 3\.2vh, 18px\);/, "thumb-sized keys");
  assert.match(page, /#keys \.wide \{[^}]*min-height: clamp\(36px, 9vh, 52px\)/, "the CENTRE TILT bar grows too");
  assert.match(page, /#screen \{ flex: 1 1 0; min-height: 0;/, "the screen gives way, the keys do not");
  // The MENU PAD is its own screen: hidden until body.menu, when the wheel
  // hides instead; the D-pad, SELECT/BACK and both PAUSE buttons are wired.
  assert.match(page, /#menupad \{ position: absolute; inset: 0; display: none;/, "the pad screen is hidden on the wheel");
  assert.match(page, /body\.linked\.menu #menupad \{ display: grid; \}/, "and shows, linked, in a menu");
  assert.match(page, /body\.menu #ctl \{ display: none; \}/, "while the wheel goes");
  assert.match(page, /#ctl, #ctl \*, #menupad, #menupad \* \{ touch-action: none; \}/, "the pad refuses browser gestures too");
  assert.match(page, /pause: \[\$\("b-pause"\), \$\("b-pause-menu"\)\]/, "PAUSE on the wheel and on the pad");
  assert.match(page, /navSelect: \$\("b-navSelect"\), navBack: \$\("b-navBack"\)/, "SELECT and BACK wired");
  assert.match(page, /mtitle: \$\("mp-title"\)/, "the pad's title is painted from the dash");
  assert.match(page, /demo=menu/, "the menu pad has a demo");
  // Zoom off on the wheel, landscape only: touch-action is not inherited, so
  // every wheel element owns its touches; the canceller mirrors index.html's;
  // portrait shows the TURN card instead of a squeezed grid; the lock rides
  // the CONNECT tap behind fullscreen (Android), best effort.
  assert.match(page, /#ctl, #ctl \*, #menupad, #menupad \* \{ touch-action: none; \}/, "every wheel and pad element refuses browser gestures");
  for (const ev of ["gesturestart", "gesturechange", "gestureend", "dblclick", "touchend"]) {
    assert.match(page, new RegExp(`document\\.addEventListener\\("${ev}"`), `the ${ev} canceller`);
  }
  assert.match(page, /closest\("button,input"\)\) \{ lastT = 0; return; \}/, "native controls keep every tap");
  assert.match(page, /<div id="rotate" role="status">[\s\S]*TURN THE PHONE SIDEWAYS/, "the portrait card");
  assert.match(page, /@media \(orientation: portrait\) \{ body\.linked #rotate \{ display: flex; \} \}/, "portrait shows the card once linked");
  assert.doesNotMatch(page, /#face \{ grid-column: 1 \/ -1; grid-row: 1; \}/, "no portrait wheel layout any more");
  assert.match(page, /requestFullscreen\(\{ navigationUI: "hide" \}\)[\s\S]*?screen\.orientation\.lock\("landscape"\)/, "fullscreen then lock, on the CONNECT tap");
  // The room service and its schnorr dependency resolve only through the page's
  // own importmap: every non-three entry of the game's map must be here too.
  const mapOf = (html) => JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  const gameMap = mapOf(read("index.html")), padMap = mapOf(page);
  for (const [spec, target] of Object.entries(gameMap)) {
    if (spec.startsWith("three")) continue;
    assert.equal(padMap[spec], target, `controller.html's importmap must carry "${spec}" exactly as index.html does`);
  }
  assert.doesNotMatch(read("js/input/phone-pad.js"), /getElementById|querySelector\(/, "the module never looks an id up — controller.html hands elements in");
  for (const id of ["h-gear", "h-speed", "h-lap", "h-pos", "h-ers", "h-flag", "h-ot", "h-aero", "h-last", "leds", "screen", "rim",
                    "b-shiftUp", "b-shiftDown", "b-ot-big", "b-boost-big", "b-overtake", "b-boost", "b-aero", "b-camera", "b-radio", "b-look", "b-recover", "b-pause", "b-center", "gas", "brake",
                    "menupad", "dpad", "dpad-hub", "b-navUp", "b-navDown", "b-navLeft", "b-navRight", "mp-mid", "mp-title", "b-pause-menu", "ab", "b-navSelect", "b-navBack"]) {
    assert.ok(page.includes(`id="${id}"`), `controller.html declares #${id}, which its inline script hands to PhonePad.pad`);
  }
  assert.equal((page.match(/<div id="leds"[^>]*>((?:<span><\/span>)+)/) || [])[1]?.length, 15 * "<span></span>".length, "fifteen rev LEDs");
  const game = read("js/ui/platform-session.js");
  assert.match(game, /hud: phonePadDash/, "game.js hands the dash sampler to PhonePad.host");
  assert.match(game, /function phonePadDash\(\)[\s\S]*G\.dashKph\(p\.speed\)[\s\S]*G\.cautionLevel\(\)/, "the sampler reads the HUD's own fields");
});

test('host cancellation wins over a late answer, successful or rejected', async () => {
  for (const ok of [true, false]) {
    let resolve;
    const h = hostHarness({acceptAnswer: () => new Promise(r => { resolve = r; })});
    await settle();
    const answer = h.room.onJoiner(null, 'ANSWER');
    h.ctl.cancel();
    resolve({ok}); await answer; await settle();
    assert.equal(h.ctl.state().phase, 'cancelled');
    assert.equal(h.ctl.state().stats, null, 'a cancelled attempt cannot create a new input link');
    assert.equal(h.ui.linkedN, 0);
  }
});

test('host closes a room that arrives after cancellation and ignores its late failure', async () => {
  let resolve, callbacks, stopped = 0;
  const h = hostHarness({hostRoom: o => { callbacks = o; return new Promise(r => { resolve = r; }); }});
  await settle(); h.ctl.cancel();
  resolve({ok:true, stop(){stopped++;}}); await settle();
  assert.equal(stopped, 1, 'the late room handle must not leak relay subscriptions');
  const said = h.ui.said.length;
  callbacks.onFail({error:'offline',message:'Old attempt failed'});
  assert.equal(h.ctl.state().phase,'cancelled');
  assert.equal(h.ui.said.length,said);
});

test('closed phone sessions ignore late packets and open callbacks', () => {
  for (const side of ['host', 'pad']) {
    const cb = {}, calls = [];
    const transport = {status:'connecting', onMessage:f=>{cb.message=f;}, onClose:f=>{cb.close=f;}, onOpen:f=>{cb.open=f;},
      send(){calls.push('send');return true;}, pump(){}, close(){cb.close();}};
    const input = {remoteSample(){calls.push('sample');},remoteEvent(){calls.push('event');},remoteLost(){},setRemoteHaptics(h){if(h)calls.push('haptics');}};
    const session = side === 'host' ? PhonePad.link(transport,{input,pump:false,onOpen(){calls.push('open');}})
      : PhonePad.padSession(transport,{roll:()=>0,thr:()=>0,brk:()=>0,held:()=>0},
          {heartbeat:false,onOpen(){calls.push('open');},onHud(){calls.push('hud');},vibrate(){calls.push('buzz');}});
    session.close(); cb.open();
    cb.message(NetTransport.STATE,side === 'host' ? PhonePad.encodeSample({seq:1,roll:10,thr:1,brk:0,held:0}) : PhonePad.encodeHud({state:'race'}));
    cb.message(NetTransport.EVENT,PhonePad.encodeHaptic(50));
    assert.deepEqual(calls,[],side);
  }
});

test('a phone connecting before hostRoom returns still closes the late room without losing the link', async () => {
  let resolve, callbacks, stopped = 0;
  const h = hostHarness({hostRoom: o => {callbacks=o;return new Promise(r=>{resolve=r;});}});
  await settle(); await callbacks.onJoiner(null,'ANSWER');
  assert.equal(h.ctl.state().phase,'linked');
  resolve({ok:true,stop(){stopped++;}}); await settle();
  assert.equal(stopped,1); assert.equal(h.ctl.state().phase,'linked');
  assert.equal(h.ui.linkedN,1); h.ctl.cancel();
});

test("PlatformSession: out of a race (no player) the dash still goes out, so the phone shows its MENU PAD", async () => {
  // The sampler returned null with no player, and a null sends nothing (the test above), so a
  // phone paired from the title menu never left the wheel's placeholder LCD.
  const elements = new Map();
  const G = { player: null, paused: false, state: "menu", els: {}, store: {},
    $(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } };
  let sample;
  const context = vm.createContext({ G,
    PhysicsConsts: { MAX_RPM: 15000, IDLE_RPM: 3000 },
    CamModes: { CAM_MODES: [{ id: "visor" }] },
    PhonePad: { ...PhonePad, padUrl: () => "https://apex.test/controller.html",
      host(options) { sample = options.hud; return { cancel() {} }; } },
  });
  const source = fs.readFileSync(new URL("../../js/ui/platform-session.js", import.meta.url), "utf8");
  vm.runInContext(source, context);
  vm.runInContext("PlatformSession.create(G, { ensureNet: () => Promise.resolve(true) }).wirePhone();", context);
  G.$("pm-phonepad").onclick();
  await Promise.resolve();
  assert.equal(typeof sample, "function", "phone pairing receives the live dash sampler");
  for (const [state, paused, why] of [["menu", false, "the title menu"], ["select", false, "car select"], ["race", true, "a pause before the car exists"]]) {
    G.state = state; G.paused = paused;
    const h = sample();
    assert.ok(h, why + ": a dash, not null");
    const back = PhonePad.decodeHud(PhonePad.encodeHud(h));
    assert.ok(back && back.state === state, why + ": it survives the wire");
    const el = lcd();
    PhonePad.paintHud(el, back);
    assert.ok(el.body.classes.has("menu"), why + ": the phone shows the MENU PAD");
  }
});

/* P3 INPUT PASS (2026-10-04): an XR thumbstick is a STICK, not a lean; and a
 * burst of phone samples delivered in one millisecond is not a duplicate. */
test("an XR stick steers directly: no tilt filter lag, and lamp 1's calibrate cannot capture it", () => {
  const { Input, clock } = bootInput();
  clock.t = 1000;
  Input.remoteSample({ steer: 0.5, thr: 0, brk: 0, held: 0 });
  assert.ok(Input.remoteSteers(), "a stick sample steers");
  assert.equal(Input.steer(), 0.5, "the first frame already carries the stick (no One-Euro, no 8/s slew)");
  Input.calibrate();                               // lamp 1 with the stick held over
  Input.remoteSample({ steer: 0, thr: 0, brk: 0, held: 0 });
  assert.equal(Input.steer(), 0, "centred stick is centre: the held deflection was not taken as the race's zero");
  Input.remoteSample({ steer: -0.8, thr: 0, brk: 0, held: 0 });
  assert.equal(Input.steer(), -0.8);
  assert.equal(Input.debugState().remote.stick, -0.8);
  Input.remoteLost();
  assert.equal(Input.remoteSteers(), false, "a lost link drops the stick at once");
});

test("phone samples bunched into one millisecond still reach the filter", () => {
  const { Input, clock } = bootInput();
  clock.t = 1000;
  Input.remoteSample({ seq: 1, roll: 0, thr: 0, brk: 0, held: 0 });
  clock.t = 1100;
  Input.remoteSample({ seq: 2, roll: 0, thr: 0, brk: 0, held: 0 });
  Input.remoteSample({ seq: 3, roll: 20, thr: 0, brk: 0, held: 0 });   // same host millisecond as seq 2
  // The newer roll entered the filter: steering heads right on the next frames.
  let v = 0;
  for (let i = 0; i < 30; i++) { clock.t += 16; v = Input.steer(); }
  assert.ok(v > 0.1, "the burst's newer roll was applied, not dropped (odt 0 returned the old value): " + v);
});

// Cold start through the REAL XR seam (vr-emulated.spec.js drives the same
// path under IWER): one mapFrame -> inject on a fresh Input carries a finite
// `steer` and NO `roll`, and the first frame's steer/pedals are finite.
test("XR from a cold start: the first injected stick sample is finite all the way through Input", () => {
  const { Input, sb, clock } = bootInput();
  for (const f of ["js/xr/xr-rig.js", "js/xr/xr-input.js"]) vm.runInContext(read(f).replace(/^const\b/gm, "var"), sb, { filename: f });
  const XrInput = vm.runInContext("XrInput", sb);
  const pad = (axes, buttons) => ({ axes, buttons: buttons.map((v) => ({ value: v, pressed: v > 0.5 })) });
  const sources = [
    { handedness: "left", targetRayMode: "tracked-pointer", gamepad: pad([0, 0, 0.9, 0], [0.8, 0, 0, 0, 0, 0]) },
    { handedness: "right", targetRayMode: "tracked-pointer", gamepad: pad([0, 0, 0, 0], [1, 1, 0, 0, 1, 1]) },
  ];
  const seen = [];
  const real = Input.remoteSample;
  const spy = { remoteSample: (s) => { seen.push(s); return real(s); }, remoteEvent: Input.remoteEvent };
  clock.t = 5000;
  const mapped = XrInput.mapFrame(sources, null);
  assert.ok(XrInput.inject(spy, mapped));
  const s = seen[0];
  assert.ok(Number.isFinite(s.steer) && s.steer > 0.5, "a finite rightward stick: " + s.steer);
  assert.equal(s.roll, undefined, "no roll: the stick is not dressed as a lean");
  const steer = Input.steer(1 / 60);
  assert.ok(Number.isFinite(steer) && steer > 0.5, "the very first frame steers, finite: " + steer);
  assert.ok(Number.isFinite(Input.throttleLevel()) && Input.throttleLevel() > 0.5);
  assert.ok(Number.isFinite(Input.brakeLevel()) && Input.brakeLevel() > 0.5);
  assert.ok(Input.lookingBack(), "squeeze is the look-back hold bit");
});

test("wheel pedal axes never feed onboard free-look; an ordinary right stick still does", () => {
  const { Input, sb, clock } = bootInput();
  const pad = { index: 0, connected: true, id: "wheel", mapping: "", axes: [0, 0, -1, -1],
    buttons: Array.from({ length: 18 }, () => ({ pressed: false, value: 0 })) };
  sb.navigator.getGamepads = () => [pad];
  const cam = vm.createContext({ Input, M4: { clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) } });
  vm.runInContext(read("js/camera/feel.js"), cam);
  const feel = vm.runInContext("CamFeel", cam);
  Input.setPadAxisMap({ throttle: 2, brake: 3 });
  for (const pedal of [-1, 0, 1]) {
    pad.axes[2] = pad.axes[3] = pedal;
    for (let i = 0; i < 120; i++) {
      clock.t += STEP; Input.poll(); feel.tickRace("cockpit", 1 / 60, false, true, 0);
    }
    assert.deepEqual({ ...feel.freeLookState() }, { yaw: 0, pitch: 0 }, "pedal rest and travel leave the view centered");
    // Pedal travel (pedal + 1) / 2 through input.js's rescaled 0.12 dead zone (padPedalLevel).
    const lvl = ((pedal + 1) / 2) > 0.12 ? (((pedal + 1) / 2) - 0.12) / 0.88 : 0;
    assert.ok(Math.abs(Input.throttleLevel() - lvl) < 1e-12, "the mapped throttle still drives");
    assert.ok(Math.abs(Input.brakeLevel() - lvl) < 1e-12, "the mapped brake still drives");
  }
  Input.setPadAxisMap({ steer: 2, brake: 3 });
  Input.poll(); feel.tickRace("cockpit", 1 / 60, false, true, 0);
  assert.deepEqual({ ...feel.freeLookState() }, { yaw: 0, pitch: 0 }, "a custom steering axis is owned by driving too");
  Input.setPadAxisMap(null); pad.mapping = "standard";
  pad.axes[2] = 0.5; pad.axes[3] = -0.5;
  Input.poll(); feel.tickRace("cockpit", 1 / 60, false, true, 0);
  assert.ok(feel.freeLookState().yaw > 0 && feel.freeLookState().pitch > 0, "unmapped right stick retains free-look");
});

test("PlatformSession: STOP cancels a pending phone load and a fresh attempt owns its host", async () => {
  const elements = new Map(), loads = [], hosts = [];
  const G = { els: {}, store: {}, camMode: 1, announce() {}, setCamMode(i) { this.camMode = i; },
    $(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } };
  const context = vm.createContext({ G, PhysicsConsts: {}, CamModes: { CAM_MODES: [{ id: "visor" }] },
    ensureNet: () => new Promise((resolve) => loads.push(resolve)),
    PhonePad: { padUrl: () => "https://apex.test/controller.html", host(options) {
      const h = { cancelled: 0, options, cancel() { h.cancelled++; } }; hosts.push(h); return h;
    } },
  });
  vm.runInContext(read("js/ui/platform-session.js"), context);
  vm.runInContext("PlatformSession.create(G, { ensureNet }).wirePhone();", context);
  const btn = G.$("pm-phonepad"), box = G.$("pm-phonepad-box");
  btn.onclick(); assert.equal(btn.textContent, "STOP PAIRING");
  btn.onclick(); assert.equal(box.hidden, true);
  loads[0](true); await settle();
  assert.equal(hosts.length, 0, "a cancelled bundle completion cannot start a host");
  btn.onclick(); btn.onclick(); btn.onclick();
  loads[1](false); await settle();
  assert.equal(G.$("pm-phonepad-status").textContent, "Loading…", "stale failures leave the new attempt alone");
  assert.equal(hosts.length, 0);
  loads[2](true); await settle();
  assert.equal(hosts.length, 1, "only the newest start creates a host");
  hosts[0].options.linked(); assert.equal(G.camMode, 0, "a linked phone switches to visor");
  btn.onclick();
  assert.equal(G.camMode, 1, "UNPAIR restores the prior camera");
  assert.equal(hosts[0].cancelled, 1, "STOP owns and cancels the sole host");
  assert.equal(box.hidden, true);
  btn.onclick(); loads[3](false); await settle();
  assert.equal(btn.textContent, "STEER THIS GAME WITH A PHONE", "a load failure offers retry, not a misleading STOP");
});

test("host(): private relay swaps one offer/answer and the linked phone can drive", async () => {
  let request, accepted, publicRooms = 0;
  const h = hostHarness({ usingPrivateRelay: () => true,
    makeCode: () => "ABCDEFGH23456789ABCDEFGH23456789",
    hostRoom: async () => { publicRooms++; return { ok: false, error: "not_supported" }; },
    swap: async (o) => { request = o; o.onTick(); return { ok: true, payload: "PRIVATE ANSWER" }; },
    acceptAnswer: async (transport, answer) => { accepted = { transport, answer }; return { ok: true }; },
  });
  await settle();
  assert.equal(publicRooms, 0, "the private mailbox never uses the public multi-guest API");
  assert.equal(request.code, "ABCDEFGH23456789ABCDEFGH23456789"); assert.equal(request.mine, "OFFER");
  assert.equal(h.ui.qrs[0].url, PhonePad.padUrl(request.code, null, "https://relay.test/base"));
  assert.equal(request.slot, "offer"); assert.equal(request.want, "answer");
  assert.equal(accepted.transport, h.hostEnd); assert.equal(accepted.answer, "PRIVATE ANSWER");
  assert.equal(h.ctl.state().phase, "linked"); assert.equal(h.ui.linkedN, 1);
  assert.ok(request.token.cancelled, "linking stops the rendezvous");
  h.clock.t = 100;
  h.padEnd.send(NetTransport.STATE, PhonePad.encodeSample({ seq: 0, thr: 0.8, brk: 0, roll: 0, held: 0 }));
  h.hostEnd.pump(100);
  assert.ok(h.Input.throttleLevel() > 0.79, "the accepted answer installs the real Input link");
  h.ctl.cancel(); assert.equal(h.hostEnd.status, "closed"); assert.equal(h.Input.remoteActive(), false);
});

test("host(): cancelling a private exchange ignores a late answer and closes the transport", async () => {
  let resolve, request, accepted = 0;
  const h = hostHarness({ usingPrivateRelay: () => true,
    swap: (o) => { request = o; return new Promise((r) => { resolve = r; }); },
    acceptAnswer: async () => { accepted++; return { ok: true }; },
  });
  await settle(); h.ctl.cancel();
  assert.ok(request.token.cancelled); assert.equal(h.hostEnd.status, "closed");
  resolve({ ok: true, payload: "LATE ANSWER" }); await settle();
  assert.equal(accepted, 0); assert.equal(h.ui.linkedN, 0); assert.equal(h.ctl.state().phase, "cancelled");
});

test("host(): private exchange and unreadable-answer failures release their transport", async () => {
  for (const badAnswer of [false, true]) {
    const h = hostHarness({ usingPrivateRelay: () => true,
      swap: async () => badAnswer ? { ok: true, payload: "BAD ANSWER" } : { ok: false, message: "Relay offline" },
      acceptAnswer: async () => ({ ok: false, message: "Unreadable answer" }),
    });
    await settle();
    assert.equal(h.ctl.state().phase, "failed"); assert.equal(h.hostEnd.status, "closed");
    assert.match(h.ui.said.at(-1), badAnswer ? /Unreadable answer/ : /Relay offline/);
    assert.equal(h.ui.linkedN, 0); h.ctl.cancel();
  }
});

function wakePad(over = {}) {
  const events = {}, requests = [], transports = [];
  const sb = { URL, URLSearchParams, Promise, Log: { info() {}, warn() {} }, NetTransport,
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
    navigator: { wakeLock: { request: () => {
      let resolve, reject;
      const promise = new Promise((a, b) => { resolve = a; reject = b; });
      requests.push({ resolve, reject }); return promise;
    } } },
    document: { visibilityState: "visible", addEventListener(t, fn) { (events[t] ||= []).push(fn); } },
    addEventListener(t, fn) { (events[t] ||= []).push(fn); },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/input/phone-pad.js"), ctx);
  const P = vm.runInContext("PhonePad", ctx);
  const dom = { connect: fakeEl(), body: fakeEl(), status: fakeEl() };
  const ctl = P.pad(dom, { deps: {
    privateRelay: () => false, normalise: (c) => c, valid: () => true, prefetchIce: async () => {},
    rtc: () => {
      let close;
      const t = { status: "open", send: () => true, pump() {}, onMessage() {}, onClose(f) { close = f; },
        close() { t.status = "closed"; if (close) close(); } };
      transports.push(t); return t;
    }, swap: async () => ({ ok: true }), ...over,
  } });
  const lock = () => {
    let onRelease;
    return { releases: 0, addEventListener(_t, fn) { onRelease = fn; },
      release() { this.releases++; return Promise.resolve(); }, signal() { if (onRelease) onRelease(); } };
  };
  return { ctl, dom, requests, transports, lock, fire: (t) => { for (const fn of events[t] || []) fn(); } };
}

test("phone wake lock is released on pairing failure, including acquisition arriving after failure", async () => {
  for (const late of [false, true]) {
    let finish;
    const h = wakePad({ swap: () => new Promise((r) => { finish = r; }) });
    const connecting = h.ctl.connect("ABC234"); await settle();
    const lock = h.lock();
    if (!late) { h.requests[0].resolve(lock); await settle(); }
    finish({ ok: false, error: "expired" });
    assert.equal((await connecting).error, "expired");
    if (late) { h.requests[0].resolve(lock); await settle(); }
    assert.equal(lock.releases, 1);
    assert.equal(h.dom.connect.disabled, false);
  }
});

test("phone disconnect releases its lock; stale release events cannot clear a reconnect's lock", async () => {
  const h = wakePad();
  await h.ctl.connect("ABC234");
  const first = h.lock(); h.requests[0].resolve(first); await settle();
  h.transports[0].close(); assert.equal(first.releases, 1);
  await h.ctl.connect("ABC234");
  const second = h.lock(); h.requests[1].resolve(second); await settle();
  first.signal(); h.fire("visibilitychange"); await settle();
  assert.equal(h.requests.length, 2, "old sentinel event cannot cause a duplicate current acquisition");
  h.ctl.cancel(); assert.equal(second.releases, 1);
  assert.equal(h.ctl.state().linked, false);
});

test("page exit cancels pending pairing; its late lock and answer cannot affect a fresh connection", async () => {
  let finish; let swaps = 0;
  const h = wakePad({ swap: () => ++swaps === 1 ? new Promise((r) => { finish = r; }) : Promise.resolve({ ok: true }) });
  const first = h.ctl.connect("ABC234"); await settle();
  h.fire("pagehide");
  assert.equal(h.transports[0].status, "closed");
  await h.ctl.connect("ABC234");
  const current = h.lock(); h.requests[1].resolve(current); await settle();
  const stale = h.lock(); h.requests[0].resolve(stale); finish({ ok: true });
  assert.equal((await first).error, "cancelled"); await settle();
  assert.equal(stale.releases, 1); assert.equal(current.releases, 0);
  assert.equal(h.ctl.state().linked, true);
  h.ctl.cancel(); assert.equal(current.releases, 1);
});

test("a refused wake lock does not block pairing or reacquisition on visibility return", async () => {
  const h = wakePad();
  await h.ctl.connect("ABC234"); h.requests[0].reject(new Error("denied")); await settle();
  assert.equal(h.ctl.state().linked, true);
  h.fire("visibilitychange"); await settle();
  const lock = h.lock(); h.requests[1].resolve(lock); await settle();
  h.ctl.cancel(); assert.equal(lock.releases, 1);
});

test("a transport closing during controller session setup cannot strand its wake lock or reconnect", async () => {
  const h = wakePad({ rtc: () => ({ status: "closed", onMessage() {}, onClose(f) { f(); }, onOpen() {}, close() {} }) });
  assert.equal((await h.ctl.connect("ABC234")).error, "cancelled");
  const lock = h.lock(); h.requests[0].resolve(lock); await settle();
  assert.equal(lock.releases, 1); assert.equal(h.ctl.state().linked, false);
  assert.equal(h.dom.connect.disabled, false);
  assert.equal((await h.ctl.connect("ABC234")).error, "cancelled", "a second attempt is not stuck busy");
});
