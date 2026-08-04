/* net-mqtt.test.mjs — the hand-written MQTT wire format.
 *
 * This is byte packing against a spec, and it fails SILENTLY: a wrong
 * remaining-length, a missing mandatory SUBSCRIBE flag, or a mis-sized string
 * prefix does not throw — the broker simply closes the socket, and from the
 * lobby that is indistinguishable from "the network is bad today". So every
 * packet is asserted byte for byte against MQTT 3.1.1, and the parser is fed
 * the fragmentation a real WebSocket produces.
 *
 * Run: node --test tests/net-mqtt.test.mjs   (npm run test:net-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NetMqtt = eval(fs.readFileSync(path.join(ROOT, "js/net/mqtt.js"), "utf8") + ";NetMqtt");
const T = NetMqtt.types;

test("the remaining-length varint matches the spec's boundaries", () => {
  // The four worked examples from MQTT 3.1.1 §2.2.3. Getting the 128 boundary
  // wrong is the classic bug and only shows up once a payload crosses it —
  // which for us is exactly when a real SDP arrives.
  assert.deepEqual(NetMqtt._varInt(0), [0x00]);
  assert.deepEqual(NetMqtt._varInt(127), [0x7f]);
  assert.deepEqual(NetMqtt._varInt(128), [0x80, 0x01]);
  assert.deepEqual(NetMqtt._varInt(16383), [0xff, 0x7f]);
  assert.deepEqual(NetMqtt._varInt(16384), [0x80, 0x80, 0x01]);
});

test("strings carry a two-byte big-endian length", () => {
  assert.deepEqual(NetMqtt._str("MQTT"), [0, 4, 77, 81, 84, 84]);
  // Multi-byte UTF-8 must be counted in BYTES, not characters.
  assert.deepEqual(NetMqtt._str("é"), [0, 2, 0xc3, 0xa9]);
});

test("CONNECT declares MQTT 3.1.1 with a clean session", () => {
  const p = NetMqtt._connectPacket("apex26-abc");
  assert.equal(p[0] >> 4, T.CONNECT);
  // Protocol name, then level 4 — anything else and the broker refuses with a
  // CONNACK return code rather than a readable error.
  assert.deepEqual([...p.subarray(2, 8)], [0, 4, 77, 81, 84, 84]);
  assert.equal(p[8], 4, "protocol level must be 4 (3.1.1)");
  assert.equal(p[9], 0x02, "clean session, no will, no auth");
  // The declared length must match what actually follows it.
  assert.equal(p[1], p.length - 2);
});

test("SUBSCRIBE sets the reserved bits the spec makes mandatory", () => {
  // 0x02 in the fixed header is REQUIRED. Without it a broker must reject the
  // packet and close the connection — silently, from our side.
  const p = NetMqtt._subscribePacket("apex26/rv/abc/offer", 7);
  assert.equal(p[0] >> 4, T.SUBSCRIBE);
  assert.equal(p[0] & 0x0f, 0x02, "the reserved flags are not optional");
  const parsed = NetMqtt._parse(p);
  assert.equal((parsed.body[0] << 8) | parsed.body[1], 7, "packet id round-trips");
  assert.equal(parsed.body[parsed.body.length - 1], 0, "requested QoS 0");
});

test("PUBLISH carries the retain flag, which is the whole rendezvous", () => {
  // Retain is what lets the host leave an offer and the guest collect it
  // minutes later. Without it the two would have to be connected at the same
  // instant, and there would be no room code feature at all.
  const retained = NetMqtt._publishPacket("t/x", [1, 2, 3], true);
  assert.equal(retained[0] & 0x01, 1, "retain bit must be set");
  const plain = NetMqtt._publishPacket("t/x", [1, 2, 3], false);
  assert.equal(plain[0] & 0x01, 0);
  // QoS 0 both ways: no packet identifier in the variable header.
  assert.equal((retained[0] >> 1) & 0x03, 0, "QoS must be 0");
});

test("a publish round-trips its topic and payload", () => {
  const body = NetMqtt._parse(NetMqtt._publishPacket("apex26/rv/deadbeef/answer", [9, 8, 7], true)).body;
  const m = NetMqtt._readPublish(body);
  assert.equal(m.topic, "apex26/rv/deadbeef/answer");
  assert.deepEqual([...m.payload], [9, 8, 7]);
});

test("a payload past the 128-byte boundary still parses", () => {
  // Where the varint gains a second byte — and where a real encrypted SDP sits.
  for (const n of [127, 128, 300, 5000]) {
    const payload = new Uint8Array(n).fill(0x41);
    const p = NetMqtt._publishPacket("t", payload, true);
    const m = NetMqtt._readPublish(NetMqtt._parse(p).body);
    assert.equal(m.payload.length, n, `payload of ${n} bytes should survive`);
  }
});

test("a partial buffer parses to null rather than a garbage packet", () => {
  // WebSocket frames do not align with MQTT packets, so the reader MUST be
  // able to say "not yet" — the alternative is acting on a half-read topic.
  const full = NetMqtt._publishPacket("apex26/rv/x/offer", new Uint8Array(200).fill(7), true);
  for (const cut of [1, 2, 3, 10, full.length - 1]) {
    assert.equal(NetMqtt._parse(full.subarray(0, cut)), null, `${cut} bytes is not a packet`);
  }
  assert.ok(NetMqtt._parse(full), "the whole thing must parse");
});

test("two packets in one frame are drained one at a time", () => {
  // Brokers coalesce. `size` is what lets the caller advance past the first.
  const a = NetMqtt._publishPacket("t/a", [1], false);
  const b = NetMqtt._publishPacket("t/b", [2], false);
  const both = new Uint8Array(a.length + b.length);
  both.set(a); both.set(b, a.length);

  const first = NetMqtt._parse(both);
  assert.equal(NetMqtt._readPublish(first.body).topic, "t/a");
  assert.equal(first.size, a.length);
  const second = NetMqtt._parse(both.subarray(first.size));
  assert.equal(NetMqtt._readPublish(second.body).topic, "t/b");
});

test("more than one broker is configured, from different operators", () => {
  // A single public broker is a single point of failure for the only feature
  // in this game that leans on somebody else's server.
  assert.ok(NetMqtt.BROKERS.length >= 2, "one broker is not a fallback plan");
  const hosts = NetMqtt.BROKERS.map((u) => new URL(u).hostname.split(".").slice(-2).join("."));
  assert.ok(new Set(hosts).size >= 2, "brokers must not all be the same operator");
  for (const u of NetMqtt.BROKERS) {
    assert.ok(u.startsWith("wss://"), `${u} must be TLS — a browser will not open ws://`);
  }
});
