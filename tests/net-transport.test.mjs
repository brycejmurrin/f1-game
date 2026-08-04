/* net-transport.test.mjs — the wire, tested with no wire.
 *
 * js/net/transport.js and js/net/handshake.js are pure logic: no DOM, no
 * renderer, no game state. So they get a node --test suite rather than a
 * Playwright spec — it runs in milliseconds instead of minutes, which matters
 * because these are the modules everything else in multiplayer sits on.
 *
 * The loopback transport is the reason this is testable at all. It wires two
 * endpoints together IN PROCESS with injectable latency, jitter and loss, and
 * it only delivers when pump(now) is called — so "what happens at 40% packet
 * loss" is a deterministic question with a repeatable answer, rather than
 * something that depends on how busy the machine was.
 *
 * Run: node --test tests/net-transport.test.mjs   (npm run test:net-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (rel, name) =>
  eval(fs.readFileSync(path.join(ROOT, rel), "utf8") + ";" + name);

const NetTransport = load("js/net/transport.js", "NetTransport");
const NetHandshake = load("js/net/handshake.js", "NetHandshake");

// A seeded uniform, so a loss pattern is a fact rather than a coin flip.
function seededRnd(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 0x100000000; };
}

// ---------------------------------------------------------------------------
// Loopback transport
// ---------------------------------------------------------------------------

test("nothing is delivered before its latency has elapsed", () => {
  const [a, b] = NetTransport.loopback({ latencyMs: 50, rnd: seededRnd(1) });
  const got = [];
  b.onMessage((ch, d) => got.push(d));
  a.pump(0); b.pump(0);              // establish both epochs
  a.send(NetTransport.STATE, "x");
  b.pump(10); assert.equal(got.length, 0, "arrived at 10ms");
  b.pump(49); assert.equal(got.length, 0, "arrived at 49ms");
  b.pump(50); assert.equal(got.length, 1, "should have arrived at 50ms");
});

test("loss hits the unreliable channel and never the reliable one", () => {
  // 100% loss: the state channel goes silent, the event channel must not.
  // This is the honest model — the browser genuinely does guarantee the
  // reliable channel, so simulating loss on it would test an impossible case.
  const [a, b] = NetTransport.loopback({ latencyMs: 0, loss: 1, rnd: seededRnd(2) });
  let state = 0, event = 0;
  b.onMessage((ch) => { if (ch === NetTransport.STATE) state++; else event++; });
  for (let i = 0; i < 20; i++) {
    a.send(NetTransport.STATE, i);
    a.send(NetTransport.EVENT, i);
  }
  b.pump(1);
  assert.equal(state, 0, "state channel should have dropped everything");
  assert.equal(event, 20, "event channel must be lossless");
});

test("partial loss is reproducible for a given seed", () => {
  function run() {
    const [a, b] = NetTransport.loopback({ latencyMs: 0, loss: 0.4, rnd: seededRnd(99) });
    const got = [];
    b.onMessage((ch, d) => got.push(d));
    for (let i = 0; i < 100; i++) a.send(NetTransport.STATE, i);
    b.pump(1);
    return got.join(",");
  }
  assert.equal(run(), run(), "same seed must drop the same packets");
  const [a, b] = NetTransport.loopback({ latencyMs: 0, loss: 0.4, rnd: seededRnd(99) });
  let n = 0;
  b.onMessage(() => n++);
  for (let i = 0; i < 100; i++) a.send(NetTransport.STATE, i);
  b.pump(1);
  assert.ok(n > 40 && n < 80, `~60 of 100 should survive 40% loss, got ${n}`);
});

test("the reliable channel preserves send order", () => {
  const [a, b] = NetTransport.loopback({ latencyMs: 20, rnd: seededRnd(3) });
  const got = [];
  b.onMessage((ch, d) => got.push(d));
  a.pump(0); b.pump(0);              // establish both epochs — see loopback()
  for (let i = 0; i < 10; i++) a.send(NetTransport.EVENT, i);
  b.pump(100);
  assert.equal(got.join(","), "0,1,2,3,4,5,6,7,8,9");
});

test("traffic flows both ways and close is seen by both ends", () => {
  const [a, b] = NetTransport.loopback({ latencyMs: 0, rnd: seededRnd(4) });
  let toA = 0;
  a.onMessage(() => toA++);
  b.send(NetTransport.EVENT, "hi");
  a.pump(1);
  assert.equal(toA, 1, "b -> a should deliver");

  const closed = [];
  a.onClose(() => closed.push("a"));
  b.onClose(() => closed.push("b"));
  a.close();
  assert.deepEqual(closed.sort(), ["a", "b"], "both ends should be notified");
  assert.equal(a.send(NetTransport.EVENT, "x"), false, "send after close must fail");
});

test("a throwing message handler cannot take down the transport", () => {
  // A rendering bug upstream must not read as a dropped connection.
  const [a, b] = NetTransport.loopback({ latencyMs: 0, rnd: seededRnd(5) });
  let second = 0;
  b.onMessage(() => { throw new Error("handler blew up"); });
  b.onMessage(() => second++);
  a.send(NetTransport.EVENT, 1);
  b.pump(1);
  assert.equal(second, 1, "the surviving handler should still have run");
  assert.equal(b.status, "open", "the transport should still be open");
});

// ---------------------------------------------------------------------------
// ICE configuration
// ---------------------------------------------------------------------------

test("no DEAD relay ships, and a credentials URL becomes iceServers", async () => {
  // Open Relay's embeddable static credentials were retired by Metered — the
  // shipped config gathered ZERO relay candidates on a real device while STUN
  // worked, which is worse than shipping nothing: it looks like a relay exists
  // and diagnosis chases the wrong thing. So the contract flips: nothing
  // static ships, and a Metered-style credentials URL (apex26.turnApi) is
  // fetched and merged instead — the model the operator actually offers.
  assert.equal(NetTransport.OPEN_RELAY, undefined, "the dead static relay must be gone");

  // The fetch path, driven with stubs: a credentials URL configured, the
  // endpoint answering the documented {iceServers: [...]} shape.
  const turnServer = { urls: ["turn:relay.example:443?transport=tcp"], username: "u", credential: "c" };
  global.localStorage = { getItem: (k) => (k === "apex26.turnApi" ? "https://app.example/api/turn?apiKey=x" : null) };
  global.fetch = async () => ({ json: async () => ({ iceServers: [turnServer] }) });
  try {
    await NetTransport.prefetchIce();
    const list = NetTransport.iceServers({});
    assert.ok(list.some((s2) => s2.username === "u"), "fetched credentials must be merged");
    const urls = list.flatMap((s2) => (Array.isArray(s2.urls) ? s2.urls : [s2.urls]));
    assert.ok(urls.some((u) => u.startsWith("turn:")), "the merged entry is a relay");
    assert.ok(urls.some((u) => u.startsWith("stun:")), "STUN still present");
  } finally {
    delete global.localStorage;
    delete global.fetch;
  }
});

test("more STUN servers than one, from different operators", () => {
  // A single STUN server is a single point of failure for the one thing that
  // decides whether two people can connect at all: learning your public
  // address. When it fails you gather only LAN candidates, silently.
  assert.ok(NetTransport.STUN.length >= 2, "one STUN server is not a plan");
  const hosts = NetTransport.STUN.map((u) => u.split(":")[1]);
  assert.ok(new Set(hosts.map((h) => h.split(".").slice(-2).join("."))).size >= 2,
    "STUN servers must not all be the same operator");
});

// ---------------------------------------------------------------------------
// Handshake codec
// ---------------------------------------------------------------------------

test("an invite code round-trips through compression", async () => {
  const payload = {
    v: NetHandshake.MAGIC, b: 817, k: "offer",
    p: { team: "ferrari", driver: 0 },
    s: "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\na=ice-ufrag:abcd\r\n".repeat(20),
  };
  const code = await NetHandshake.encodeCode(payload);
  const back = await NetHandshake.decodeCode(code);
  assert.equal(back.ok, true);
  assert.deepEqual(back.payload, payload);
});

test("the code is markedly smaller than the SDP it carries", async () => {
  // The whole point of compressing: a raw gathered SDP is a miserable paste.
  const sdp = ("a=candidate:1 1 udp 2113937151 192.168.1.10 54321 typ host generation 0\r\n").repeat(40);
  const code = await NetHandshake.encodeCode({ v: NetHandshake.MAGIC, b: 1, k: "offer", p: null, s: sdp });
  assert.ok(code.startsWith(NetHandshake.MAGIC + ".z."), "should have taken the compressed path");
  assert.ok(code.length < sdp.length / 4, `expected heavy compression, got ${code.length} vs ${sdp.length}`);
});

test("garbage and truncated codes are rejected with a usable message", async () => {
  for (const bad of ["", "hello", "APEX1.z", "NOPE.z.AAAA"]) {
    const r = await NetHandshake.decodeCode(bad);
    assert.equal(r.ok, false, `"${bad}" should be rejected`);
    assert.ok(r.message && r.message.length > 10, "should explain itself to a human");
  }
  // Right envelope, ruined body.
  const truncated = await NetHandshake.decodeCode("APEX1.z.####");
  assert.equal(truncated.ok, false);
  assert.equal(truncated.error, "corrupt_code");
});

test("whitespace from a sloppy copy/paste is tolerated", async () => {
  const code = await NetHandshake.encodeCode({ v: NetHandshake.MAGIC, b: 1, k: "offer", p: null, s: "v=0" });
  const mangled = "  " + code.slice(0, 10) + "\n  " + code.slice(10) + "\t\n";
  const back = await NetHandshake.decodeCode(mangled);
  assert.equal(back.ok, true, "a code split across lines by a chat client must still work");
});

test("a build mismatch is refused, and says which side is stale", () => {
  assert.equal(NetHandshake.checkBuild(817, 817).ok, true);

  const older = NetHandshake.checkBuild(817, 800);
  assert.equal(older.ok, false);
  assert.equal(older.error, "build_mismatch");
  assert.match(older.message, /ask them to reload/i);

  const newer = NetHandshake.checkBuild(800, 817);
  assert.equal(newer.ok, false);
  assert.match(newer.message, /reload the page to update/i);
});

test("SDP survives the round trip verbatim, CRLF-terminated", () => {
  // The regression this exists for. An earlier version stripped "regenerable"
  // attributes and rejoined with \n, which dropped the trailing terminator —
  // so the last line arrived unterminated and Chrome refused the whole
  // description with "Invalid SDP line". Every attribute must survive, every
  // line must end CRLF, and the final line must be terminated too.
  const sdp = [
    "v=0",
    "o=- 4611731400430051336 2 IN IP4 127.0.0.1",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "a=ice-ufrag:4ZcD",
    "a=ice-pwd:2/1muCWoOi3uLifh0NuRHlZw",
    "a=fingerprint:sha-256 AB:CD",
    "a=candidate:1 1 udp 2113937151 192.168.1.10 54321 typ host",
    "a=sctp-port:5000",
    "a=max-message-size:262144",          // the line that was being orphaned
  ].join("\r\n") + "\r\n";

  const out = NetHandshake.normaliseSdp(sdp);
  assert.equal(out, sdp, "the SDP must survive untouched");
  assert.ok(out.endsWith("\r\n"), "the final line MUST be terminated");
  assert.ok(out.includes("a=max-message-size:262144"));
  assert.ok(!out.includes("\n\n"), "no blank lines");

  // Bare-LF input (some stacks) is normalised up to CRLF rather than passed on.
  const lf = NetHandshake.normaliseSdp("v=0\na=ice-ufrag:x\na=max-message-size:262144");
  assert.equal(lf, "v=0\r\na=ice-ufrag:x\r\na=max-message-size:262144\r\n");
});

test("the invite link keeps the code in the fragment", () => {
  // The fragment never leaves the browser, so the code never reaches a server
  // log — which matters because there is no server in this design at all.
  const code = "APEX1.z.SOMECODE";
  assert.equal(NetHandshake.inviteFromUrl("https://x.dev/#vs=" + code), code);
  assert.equal(NetHandshake.inviteFromUrl("https://x.dev/#a=1&vs=" + code), code);
  assert.equal(NetHandshake.inviteFromUrl("https://x.dev/?vs=nope"), null,
    "a query-string code must NOT be honoured — that one does reach the server");
});
