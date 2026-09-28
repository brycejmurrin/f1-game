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
  const phone = { roll: null, thr: 0, brk: 0, held: 0, buzz: [], huds: [] };
  const session = PhonePad.padSession(padEnd, {
    roll: () => phone.roll, thr: () => phone.thr, brk: () => phone.brk, held: () => phone.held,
  }, { now: () => clock.t, heartbeat: false, vibrate: (ms) => phone.buzz.push(ms), onHud: (h) => phone.huds.push(h) });
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
  assert.equal(el.aero.textContent, "X-MODE");
  assert.equal(el.flag.textContent, "");
  assert.equal(el.ers.style.width, "40%");
  assert.equal(el.leds.children.filter((s) => s.classes.has("on")).length, 12, "80% revs lights 12 of 15 LEDs");
  assert.ok(el.screen.classes.has("ot-ready") && el.screen.classes.has("x-open") && !el.screen.classes.has("idle"));
  assert.equal(el.team.style["--team"], "#dc0000", "the LCD tints with the team");
  // Neutral in the pit lane, a caution on track, the lights before the start.
  PhonePad.paintHud(el, { ...phone.huds[0], gear: 0, kmh: 0, rpm: 0.2, state: "menu", flags: 0 });
  assert.equal(el.gear.textContent, "N"); assert.equal(el.speed.textContent, "---"); assert.equal(el.flag.textContent, "PIT LANE");
  assert.equal(el.leds.children.filter((s) => s.classes.has("on")).length, 0, "no rev lights out of the race");
  assert.ok(el.screen.classes.has("idle"));
  PhonePad.paintHud(el, { ...phone.huds[0], state: "race", caution: 3 });
  assert.equal(el.flag.textContent, "SAFETY CAR"); assert.ok(el.screen.classes.has("caution"));
  PhonePad.paintHud(el, { ...phone.huds[0], state: "count", flags: PhonePad.DASH.timeTrial });
  assert.equal(el.flag.textContent, "LIGHTS"); assert.equal(el.lap.textContent, "TT"); assert.equal(el.pos.textContent, "");
  PhonePad.paintHud(el, { ...phone.huds[0], flags: PhonePad.DASH.retired });
  assert.equal(el.pos.textContent, "DNF");
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
  assert.equal(el.aero.textContent, "AUTO X-MODE");
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
  assert.match(read("js/game.js"), /gearsManual\(\) \? 0 : D\.gearsAuto[\s\S]*autoThrottle\(\) \? D\.throttleAuto[\s\S]*raceAeroMode === "auto" \? D\.aeroAuto[\s\S]*D\.aeroNone/,
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
  const seen = [];
  const ctl = PhonePad.pad(dom, { now: () => clock.t, deps: {
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
    rtc: () => hostEnd, prefetchIce: async () => null, makeCode: () => "ABC234",
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
  // The phone's own door: a touch device opens controller.html from the title
  // and from CONTROLS; a mouse never sees either button (live with the pointer
  // kind, next to body.desktop). Plain navigation — no net stack on the phone.
  const idx = read("index.html"), gameJs = read("js/game.js");
  assert.match(idx, /<button id="mb-phonepad" class="bigbtn alt minibtn" hidden /, "title door, hidden until the pointer is coarse");
  assert.match(idx, /<button id="pm-phonepad-go" type="button" hidden>/, "CONTROLS door, hidden until the pointer is coarse");
  assert.match(gameJs, /function syncPointerKind\(\) \{[\s\S]*?\$\("mb-phonepad"\)\.hidden = !touch;[\s\S]*?\$\("pm-phonepad-go"\)\.hidden = !touch;/,
    "both doors flip with the live pointer kind");
  assert.match(gameJs, /location\.assign\(new URL\("controller\.html", location\.href\)\.href\)/, "the door is a navigation beside index.html");
  assert.match(gameJs, /\$\("mb-phonepad"\)\.onclick = goPhonePad;[\s\S]*?\$\("pm-phonepad-go"\)\.onclick = goPhonePad;/, "both doors wired");
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
                    "b-shiftUp", "b-shiftDown", "b-ot-big", "b-boost-big", "b-overtake", "b-boost", "b-aero", "b-camera", "b-radio", "b-look", "b-recover", "b-pause", "b-center", "gas", "brake"]) {
    assert.ok(page.includes(`id="${id}"`), `controller.html declares #${id}, which its inline script hands to PhonePad.pad`);
  }
  assert.equal((page.match(/<div id="leds"[^>]*>((?:<span><\/span>)+)/) || [])[1]?.length, 15 * "<span></span>".length, "fifteen rev LEDs");
  const game = read("js/game.js");
  assert.match(game, /hud: phonePadDash/, "game.js hands the dash sampler to PhonePad.host");
  assert.match(game, /function phonePadDash\(\)[\s\S]*dashKph\(p\.speed\)[\s\S]*cautionLevel\(\)/, "the sampler reads the HUD's own fields");
});
