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
    removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: { vibrate: (ms) => { vibrated.push(ms); return true; } },
    screen: {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: {
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener() {},
      getElementById: el, querySelector: el, querySelectorAll: () => [], hidden: false,
      body: { classList: { add() {}, remove() {}, toggle() {} } },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  const src = (f) => read(f).replace(/^const\b/gm, "var");
  vm.runInContext(src("js/core/mat4.js"), ctx, { filename: "js/core/mat4.js" });
  vm.runInContext(src("js/input/tilt-roll.js"), ctx, { filename: "js/input/tilt-roll.js" });
  vm.runInContext(src("js/input/input.js"), ctx, { filename: "js/input/input.js" });
  const Input = vm.runInContext("Input", ctx);
  let paused = 0;
  Input.init(el(), { onPause: () => { paused++; } });
  Input.reset();
  const key = (k, down) => (listeners[down ? "keydown" : "keyup"] || [])
    .forEach((f) => f({ key: k, code: k, repeat: false, preventDefault() {}, target: { tagName: "BODY" } }));
  return { Input, key, clock, vibrated, pausedCount: () => paused };
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
  const phone = { roll: null, thr: 0, brk: 0, held: 0, buzz: [] };
  const session = PhonePad.padSession(padEnd, {
    roll: () => phone.roll, thr: () => phone.thr, brk: () => phone.brk, held: () => phone.held,
  }, { now: () => clock.t, heartbeat: false, vibrate: (ms) => phone.buzz.push(ms) });
  let closed = 0;
  const link = PhonePad.link(hostEnd, { input: desk.Input, pump: false, now: () => clock.t, onClose: () => { closed++; } });
  // One frame: the phone sends, the wire carries, the desktop pumps, and the
  // game loop reads steer() — the read is what advances the slew, exactly as
  // js/game.js reads Input.steer() once per frame.
  const frame = (sendSample = true) => {
    clock.t += STEP;
    if (sendSample) session.sample();
    session.pump(); link.pump();
    desk.Input.steer();
  };
  return { ...desk, phone, session, link, frame, closedCount: () => closed, padEnd, hostEnd };
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
  assert.match(read(".github/workflows/pages.yml"), /cp index\.html bench\.html controller\.html /, "the page is staged by name");
  assert.match(page, /<script type="importmap">[\s\S]*@trystero-p2p\/nostr/, "the room-code courier needs the importmap");
  assert.doesNotMatch(read("js/input/phone-pad.js"), /getElementById|querySelector\(/, "the module never looks an id up — controller.html hands elements in");
});
