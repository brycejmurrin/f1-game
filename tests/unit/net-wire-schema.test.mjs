/* net-wire-schema.test.mjs — the reliable-wire table (js/net/wire-schema.js, #6859 phase 1).
 *
 * The PROPERTY, not one bespoke case per bug: every reliable event VS FRIEND
 * sends is a declared NetWire row, and NetSession hands a handler only that
 * row's decoded value. Each row is fuzzed through a real NetSession ingress
 * (the transport's session binder, fed raw frames): wrong type, oversize,
 * NaN/Infinity, `__proto__`, the wrong sender role, a flood. A type sent
 * anywhere in js/net without a row, or a row without a sample here, fails.
 *
 * Run: node --test tests/unit/net-wire-schema.test.mjs   (npm run test:net-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
seedLogGlobal();
const load = (rel, name) => eval(read(rel) + ";" + name);
globalThis.M4 = load("js/core/mat4.js", "M4");
globalThis.NetBytes = load("js/net/bytes.js", "NetBytes");
globalThis.NetIce = load("js/net/ice.js", "NetIce");
const NetTransport = load("js/net/transport.js", "NetTransport");
globalThis.NetTransport = NetTransport;
globalThis.NetInterp = load("js/net/interp.js", "NetInterp");
globalThis.NetSnapshot = load("js/net/snapshot.js", "NetSnapshot");
globalThis.NetWire = load("js/net/wire-schema.js", "NetWire");
const NetWire = globalThis.NetWire;
const NetSession = load("js/net/session.js", "NetSession");
globalThis.QualiWire = load("js/net/quali-wire.js", "QualiWire");
globalThis.StrategyWire = load("js/net/strategy-wire.js", "StrategyWire");
const NetPlay = load("js/net/netplay.js", "NetPlay");

// One valid payload per declared type. A row added without a sample fails below.
const SAMPLES = {
  model: { physics: "rev-1", strategy: 1, epoch: "e-1" },
  strategy: { version: 1, physics: "rev-1", wire: 1, track: "monza", fields: { tyreWear: 0.5 }, epoch: "e-1" },
  hello: { team: "ferrari", driver: 0, parts: { wing: "a" } },
  settings: { track: "monza", laps: 5, weather: "dry" },
  ready: { ready: true, revision: 2 },
  go: { revision: 1 },
  start: { at: 1234.5, hold: 0.5 },
  armed: {},
  quali: { driverId: "ferrari:0", t: 80.123 },
  qlive: { driverId: "ferrari:0", t: 12, frac: 0.3 },
  lap: { lap: 2, time: 81.2, best: 80.9, driverId: "ferrari:0" },
  result: [{ d: "ferrari:0", t: 5000, p: 0, lap: 5, classified: true, r: 0 }],
  caution: { level: 1, sector: 2, sectors: [0, 1, 0] },
  bye: {},
  left: { wire: 2, why: "bye" },
  qabort: null,
  qgo: null,
};
// Rows whose payload carries nothing: any value decodes to the one frozen {}.
const EMPTY_ROWS = new Set(["armed", "bye", "qabort", "qgo"]);
// Rows that decode to a plain bounded copy their owner validates further.
const STRUCT_ROWS = new Set(["strategy", "hello", "settings", "caution"]);
const TYPES = Object.keys(NetWire.ROWS);

// A NetSession on one loopback endpoint, fed raw frames through the binder the
// transport delivers EVENT frames to (the path test 421 in net-session uses).
function ingress(role) {
  const [ta] = NetTransport.loopback({ latencyMs: 0, rnd: () => 0.5 });
  const s = NetSession.create({ transport: ta, pingEveryMs: 100, role });
  const binder = ta._handlers.message.find((fn) => fn && fn._netSessionMsg);
  const got = [];
  for (const t of TYPES) s.onEvent(t, (d, type) => got.push({ t: type, d }));
  s.onEvent("bogus", (d) => got.push({ t: "bogus", d }));
  return {
    s, got,
    raw(frame) { binder(NetTransport.EVENT, frame, 0); return got.splice(0); },
    send(t, d) { return this.raw(JSON.stringify({ t, d: d === undefined ? null : d })); },
  };
}
// The role of a receiver that may hear row t (a host-only row is heard by a guest).
const receiverRole = (t) => NetWire.ROWS[t].from === "host" ? "guest" : NetWire.ROWS[t].from === "guest" ? "host" : null;

test("every event type sent anywhere in js/net is a declared row, and every row has a sample", () => {
  for (const name of Object.values(NetPlay.EV)) assert.ok(NetWire.ROWS[name], "NetPlay.EV." + name + " has a row");
  assert.equal(NetPlay.EV, NetWire.EV, "NetPlay.EV is the table's own names");
  for (const name of Object.values(NetWire.LOBBY_EV)) assert.ok(NetWire.ROWS[name], "lobby " + name + " has a row");
  const lobby = read("js/net/lobby.js");
  assert.ok(!/const QABORT = "|const QGO = "/.test(lobby), "the lobby's types come from NetWire.LOBBY_EV");
  for (const t of TYPES) {
    assert.ok(t in SAMPLES, t + " has a fuzz sample");
    const r = NetWire.ROWS[t];
    assert.ok(Object.isFrozen(r), t + " row frozen");
    assert.ok(["host", "guest", "any"].includes(r.from), t + " declares its sender");
    assert.ok(Number.isInteger(r.maxBytes) && r.maxBytes > 0 && r.maxBytes <= NetWire.MAX_FRAME_BYTES, t + " declares maxBytes");
    assert.ok(r.rate === null || r.rate in NetWire.RATES, t + " rate is a RATES key");
    assert.equal(typeof r.decode, "function");
  }
});

for (const t of TYPES) {
  test(`row ${t}: a valid frame reaches its handler as the decoded value, idempotently`, () => {
    const io = ingress(receiverRole(t));
    const out = io.send(t, SAMPLES[t]);
    assert.equal(out.length, 1, t + " delivered once");
    const d = out[0].d;
    assert.deepEqual(d, NetWire.decode(t, JSON.parse(JSON.stringify(SAMPLES[t] ?? null))));
    assert.deepEqual(NetWire.decode(t, d), d, "decode(decode(x)) === decode(x)");
    if (!STRUCT_ROWS.has(t) && t !== "result") assert.ok(Object.isFrozen(d), t + " scalar value is frozen");
    if (EMPTY_ROWS.has(t)) assert.equal(d, NetWire.decode(t, "anything"), "the one empty value");
  });

  test(`row ${t}: wrong type, oversize and __proto__ never reach the handler raw`, () => {
    const io = ingress(null);
    const junk = io.send(t, "junk-string");
    if (EMPTY_ROWS.has(t)) {
      assert.equal(junk.length, 1);
      assert.deepEqual(junk[0].d, {}, t + ": the payload is not handed on");
      assert.ok(Object.isFrozen(junk[0].d));
    } else assert.equal(junk.length, 0, t + ": a string payload is refused");
    assert.equal(io.send(t, [1, 2, 3]).length, EMPTY_ROWS.has(t) ? 1 : 0, t + ": an array payload");
    // Oversize: a valid shape padded past the row's own cap (inside the frame cap).
    const pad = "x".repeat(NetWire.ROWS[t].maxBytes);
    const big = SAMPLES[t] && !Array.isArray(SAMPLES[t]) ? { ...SAMPLES[t], pad } : { pad };
    assert.equal(io.send(t, big).length, 0, t + ": over maxBytes is dropped before decode");
    assert.ok(io.s.wireDrops().oversize >= 1);
    // An own "__proto__" key from JSON.parse never survives into a delivered value.
    if (SAMPLES[t] && typeof SAMPLES[t] === "object" && !Array.isArray(SAMPLES[t])) {
      const plain = JSON.stringify({ t, d: SAMPLES[t] });
      const frame = plain.endsWith(':{}}') ? plain.replace(/\{\}\}$/, '{"__proto__":{"polluted":1}}}')
        : plain.replace(/\}\}$/, ',"__proto__":{"polluted":1}}}');
      assert.doesNotThrow(() => JSON.parse(frame), t + ": the hostile frame is valid JSON");
      for (const e of io.raw(frame)) {
        assert.ok(!Object.prototype.hasOwnProperty.call(e.d, "__proto__"), t + ": no own __proto__");
        assert.equal(e.d.polluted, undefined);
        assert.equal(Object.assign({}, e.d).polluted, undefined, t + ": a relay copy is not re-parented");
      }
    }
  });

  test(`row ${t}: the wrong sender role is dropped at ingress`, () => {
    const from = NetWire.ROWS[t].from;
    if (from === "any") {
      assert.equal(ingress("host").send(t, SAMPLES[t]).length, 1);
      assert.equal(ingress("guest").send(t, SAMPLES[t]).length, 1);
      return;
    }
    // A host-only row arriving AT a host came from a guest, and vice versa.
    const wrong = ingress(from === "host" ? "host" : "guest");
    assert.equal(wrong.send(t, SAMPLES[t]).length, 0, `${t} (from ${from}) refused`);
    assert.equal(wrong.s.wireDrops().role, 1);
    assert.equal(ingress(from === "host" ? "guest" : "host").send(t, SAMPLES[t]).length, 1);
    if (from === "host") assert.equal(ingress("spectator").send(t, SAMPLES[t]).length, 1, "a spectator hears the host");
  });

  test(`row ${t}: a flood past the row's rate is refused, and the window reopens`, () => {
    const key = NetWire.ROWS[t].rate;
    if (!key) { assert.equal(NetWire.gate(null, "host"), null); return; }
    for (const role of ["host", "guest"]) {
      const limit = role === "host" ? NetWire.RATES[key].host : NetWire.RATES[key].guest;
      if (!limit) { assert.equal(NetWire.gate(key, role), null, `${t}: no ${role} cap declared`); continue; }
      let now = 0;
      const b = NetWire.bucket(limit, NetWire.EVENT_WINDOW_MS, () => now);
      let passed = 0;
      for (let i = 0; i < limit * 10; i++) if (b.take()) passed++;
      assert.equal(passed, limit, `${t}/${role}: a burst passes exactly ${limit}`);
      // Spread out over the same window: still never more than `limit` in it.
      now = NetWire.EVENT_WINDOW_MS / 2;
      assert.equal(b.take(), false, `${t}/${role}: no refill inside the window`);
      assert.ok(b.waitMs() > 0 && b.waitMs() <= NetWire.EVENT_WINDOW_MS);
      now = NetWire.EVENT_WINDOW_MS + 1;
      assert.equal(b.waitMs(), 0);
      assert.equal(b.take(), true, `${t}/${role}: the window reopens`);
    }
  });
}

test("an undeclared type is dropped and counted, even with a handler registered", () => {
  const io = ingress("host");
  assert.equal(io.send("bogus", { a: 1 }).length, 0);
  assert.equal(io.s.wireDrops().undeclared, 1);
  assert.equal(io.raw("{not json").length, 0);
  assert.equal(io.raw(JSON.stringify({ t: 7, d: {} })).length, 0);
  assert.equal(io.s.wireDrops().malformed, 2);
  // Nothing bigger than any row is even parsed.
  assert.equal(io.raw("x".repeat(NetWire.MAX_FRAME_BYTES + 1)).length, 0);
  assert.equal(io.s.wireDrops().oversize, 1);
});

test("hostile numbers: Infinity, NaN-making and huge values are refused or clamped by the row", () => {
  const io = ingress("guest");
  const frame = (t, body) => io.raw(`{"t":"${t}","d":${body}}`);
  assert.equal(frame("start", '{"at":1e999}').length, 0, "START at Infinity refused");
  assert.equal(frame("start", '{"at":"soon"}').length, 0, "START at a word refused");
  assert.equal(frame("start", '{"at":10,"hold":1e9}')[0].d.hold, 2, "hold clamped to 2 s");
  assert.equal(frame("start", '{"at":10}')[0].d.hold, 0.5, "a missing hold defaults");
  assert.equal(frame("quali", '{"driverId":"a:0","t":1e999}').length, 0, "an infinite QUALI time refused");
  assert.equal(frame("quali", '{"driverId":"a:0","t":"80"}')[0].d.t, 80, "a string time is coerced to a number");
  assert.equal(frame("quali", '{"driverId":{"x":1},"t":80}').length, 0, "an object driverId refused");
  const live = frame("qlive", '{"driverId":"a:0","t":1e999,"frac":9}')[0].d;
  assert.deepEqual([live.t, live.frac], [0, 1], "QLIVE bounded, not refused");
  assert.equal(frame("ready", '{"ready":"yes"}').length, 0, "READY needs a boolean");
  assert.equal(frame("ready", '{"ready":true,"revision":"3"}').length, 0, "a non-integer revision is refused, never read as rev 0");
  assert.equal(frame("go", '{"revision":-1}').length, 0);
  const lap = frame("lap", `{"lap":3,"code":"${"x".repeat(200)}","blob":{"big":[1,2,3]}}`)[0].d;
  assert.deepEqual(Object.keys(lap), ["lap"], "LAP keeps only bounded scalars of its declared keys");
  const left = frame("left", '{"wire":"2","why":{"x":1},"evicted":"yes"}')[0].d;
  assert.deepEqual({ ...left }, {}, "LEFT drops a string wire, an object why and a non-true evicted");
  assert.equal(frame("result", '[{"d":"a:0","t":1},"junk"]').length, 0, "a RESULT row that is not an object refuses the sheet");
  assert.equal(frame("result", JSON.stringify(Array.from({ length: 65 }, () => ({ d: "x" })))).length, 0, "RESULT bounded to 64 rows");
  assert.equal(frame("model", '"rev"').length, 0, "MODEL must be an object");
  const longR = frame("result", JSON.stringify([{ d: "a:0", r: "DSQ — " + "x".repeat(200) }]))[0].d;
  assert.equal(longR[0].r.length, 128, "a long RESULT reason is truncated, never dropped (review #6972)");
  // The largest real STRATEGY: 256 stints with 64-char ids and float colours (strategy-wire STINT_MAX).
  const stint = { code: "S", id: "x".repeat(64), colour: [0.123456789, 0.987654321, 0.555555555], lap0: 999.5, lap1: 1000 };
  const fullState = { ...SAMPLES.strategy, tyreLog: Array.from({ length: 256 }, () => stint) };
  assert.ok(JSON.stringify({ t: "strategy", d: fullState }).length > 32768, "fixture is past the old cap");
  assert.equal(io.send("strategy", fullState).length, 1, "a 256-stint STRATEGY fits its row");
  const deep = "[".repeat(20) + "]".repeat(20);
  assert.equal(frame("caution", `{"a":${deep}}`).length, 0, "a structural row refuses depth past its bound");
});

test("the one rate primitive replaced both gates: no underRate, no rateGate left in js/net", () => {
  for (const f of fs.readdirSync(path.join(ROOT, "js/net"))) {
    const src = read("js/net/" + f);
    assert.ok(!/\bunderRate\b/.test(src), f + " has no underRate");
    assert.ok(!/\brateGate\b/.test(src), f + " has no rateGate");
  }
  assert.equal(globalThis.QualiWire.create(NetWire.EV).rateGate, undefined);
});

test("the race and lobby handlers register through NetWire.on, never on a raw payload", () => {
  const lobby = read("js/net/lobby.js"), netplay = read("js/net/netplay.js"), quali = read("js/net/quali-wire.js");
  assert.ok(!/\bmade\.onEvent\(/.test(lobby), "lobby: every handler goes through NetWire.on");
  assert.ok(!/\bs\.onEvent\(name\b/.test(netplay), "netplay bindSession goes through NetWire.on");
  assert.ok(!/\bs\.onEvent\(EV\./.test(quali), "bindQuali goes through NetWire.on");
  // A test double that is not a NetSession is decoded by on() itself.
  const handlers = new Map();
  const fake = { onEvent(t, fn) { handlers.set(t, fn); return this; } };
  const got = [];
  NetWire.on(fake, "start", (d) => got.push(d));
  handlers.get("start")({ at: 5, hold: 1e9, extra: { big: 1 } });
  handlers.get("start")("junk");
  assert.deepEqual(got, [{ at: 5, hold: 2 }]);
});
