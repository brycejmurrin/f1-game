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
 * Run: node --test tests/unit/net-transport.test.mjs   (npm run test:net-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
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

test("RTC inbox pressure drops state snapshots, never reliable events", () => {
  class FakePC {
    constructor() {
      this.connectionState = "new";
      this.iceConnectionState = "new";
      this.iceGatheringState = "new";
    }
    close() {}
  }
  const channel = (label) => ({ label, readyState: "open", close() {} });
  global.RTCPeerConnection = FakePC;
  global.localStorage = { getItem: () => null };
  try {
    const fresh = load("js/net/transport.js", "NetTransport");
    const ep = fresh.rtc({ role: "guest" });
    const state = channel("state"), event = channel("event");
    ep.pc.ondatachannel({ channel: state });
    ep.pc.ondatachannel({ channel: event });
    state.onopen(); event.onopen();

    const got = [];
    ep.onMessage((kind, data) => got.push([kind, data]));
    for (let i = 0; i < 80; i++) state.onmessage({ data: "s" + i });
    for (let i = 0; i < 80; i++) event.onmessage({ data: "e" + i });
    ep.pump();

    const states = got.filter(([kind]) => kind === fresh.STATE).map(([, data]) => data);
    const events = got.filter(([kind]) => kind === fresh.EVENT).map(([, data]) => data);
    assert.equal(states.length, 64, "only the newest bounded snapshot window survives");
    assert.equal(states[0], "s16");
    assert.deepEqual(events, Array.from({ length: 80 }, (_, i) => "e" + i),
      "reliable protocol events must remain complete and ordered");
  } finally {
    delete global.RTCPeerConnection;
    delete global.localStorage;
  }
});

test("RTC disconnects instead of dropping reliable events when its inbox overflows", () => {
  let pcClosed = 0;
  class FakePC {
    constructor() {
      this.connectionState = "new";
      this.iceConnectionState = "new";
      this.iceGatheringState = "new";
    }
    close() { pcClosed++; }
  }
  const channel = (label) => ({ label, readyState: "open", close() {} });
  global.RTCPeerConnection = FakePC;
  global.localStorage = { getItem: () => null };
  try {
    const fresh = load("js/net/transport.js", "NetTransport");
    const ep = fresh.rtc({ role: "guest" });
    const state = channel("state"), event = channel("event");
    ep.pc.ondatachannel({ channel: state });
    ep.pc.ondatachannel({ channel: event });
    state.onopen(); event.onopen();
    const closed = [];
    ep.onClose((why) => closed.push(why));

    for (let i = 0; i < 257; i++) event.onmessage({ data: "e" + i });

    assert.equal(ep.status, "closed");
    assert.deepEqual(closed, ["overflow"], "overflow must be explicit to the session");
    assert.equal(pcClosed, 1);
    assert.equal(ep.stats().queued, 0, "closing releases the retained payloads");
  } finally {
    delete global.RTCPeerConnection;
    delete global.localStorage;
  }
});

test("a congested outbound STATE queue drops the snapshot instead of buffering it", () => {
  class FakePC {
    constructor() {
      this.connectionState = "new";
      this.iceConnectionState = "new";
      this.iceGatheringState = "new";
    }
    close() {}
  }
  // maxRetransmits:0 only drops on the network — the local SCTP queue still
  // buffers, so a backed-up channel must refuse STATE sends (stale beats late)
  // while reliable EVENTs keep queueing.
  const channel = (label, buffered) => ({
    label, readyState: "open", bufferedAmount: buffered, sent: [],
    send(d) { this.sent.push(d); }, close() {},
  });
  global.RTCPeerConnection = FakePC;
  global.localStorage = { getItem: () => null };
  try {
    const fresh = load("js/net/transport.js", "NetTransport");
    const ep = fresh.rtc({ role: "guest" });
    const state = channel("state", 999999), event = channel("event", 999999);
    ep.pc.ondatachannel({ channel: state });
    ep.pc.ondatachannel({ channel: event });
    state.onopen(); event.onopen();

    assert.equal(ep.send(fresh.STATE, "snap"), false, "backed-up STATE send must drop");
    assert.equal(state.sent.length, 0);
    assert.equal(ep.send(fresh.EVENT, "ev"), true, "reliable events still deliver");
    assert.equal(event.sent.length, 1);

    state.bufferedAmount = 0;
    assert.equal(ep.send(fresh.STATE, "snap2"), true, "a drained queue accepts again");
    assert.equal(state.sent.length, 1);
  } finally {
    delete global.RTCPeerConnection;
    delete global.localStorage;
  }
});

// ---------------------------------------------------------------------------
// ICE configuration
// ---------------------------------------------------------------------------

test("no HARDCODED-PASSWORD relay ships, and a credentials URL becomes iceServers", async () => {
  // Open Relay's embeddable static credentials were retired by Metered — the
  // shipped config gathered ZERO relay candidates on a real device while STUN
  // worked, which is worse than shipping nothing: it looks like a relay exists
  // and diagnosis chases the wrong thing. That named constant must stay gone;
  // build 972's replacement DERIVES an expiring credential instead (see the
  // next test), which is a different thing wearing the same word "free".
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

// A localStorage stub for the tests that need one flag set. The real one is a
// browser global; these modules read it directly on purpose, so that the real
// transport and any harness behave identically.
function withStore(map, fn) {
  global.localStorage = { getItem: (k) => (k in map ? map[k] : null) };
  try { return fn(); } finally { delete global.localStorage; }
}

test("NO relay ships by default, because both free ones were measured dead", () => {
  // Two independent vantage points, each with a Google-STUN control that DID
  // produce an srflx candidate, and zero relay candidates from Open Relay or
  // freestun on both. A dead relay is worse than none — it looks like a relay
  // exists and diagnosis chases the wrong thing — so the default is none, and
  // the lobby is then telling the truth when it says so.
  //
  // A FRESH module instance, because prefetchIce() memoises what it fetched
  // and an earlier test in this file configures a credentials URL. Asserting
  // "the default" against leaked state would pass or fail on test order.
  const fresh = load("js/net/transport.js", "NetTransport");
  const urls = fresh.iceServers({})
    .flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
  assert.ok(!urls.some((u) => /^turns?:/.test(u)),
    "no measured-dead TURN entry is baked into the synchronous list");
  assert.ok(urls.some((u) => /^stun:/.test(u)), "STUN is unaffected");
  assert.equal(fresh.hasRelay(), false,
    "before prefetchIce() resolves there is genuinely no relay, and hasRelay() "
    + "must say so — the lobby's failure copy branches on it");
});

test("a credentials URL ships by default, and yours overrides it", async () => {
  // The relay is a FETCH URL with expiring credentials, not an embedded
  // password — that is the difference between this and the Open Relay static
  // credentials that were retired out from under build 971.
  //
  // It exists because two devices on ONE WI-FI could not reach each other:
  // the only host candidate a browser offers is mDNS-obfuscated, and when
  // that name will not resolve the sole remaining pair is srflx-to-srflx,
  // which needs router hairpinning that many do not do.
  const fresh = load("js/net/transport.js", "NetTransport");
  const seen = [];
  const turnServer = { urls: ["turn:relay.metered.example:443"], username: "u", credential: "c" };
  global.fetch = async (u) => { seen.push(u); return { json: async () => ({ iceServers: [turnServer] }) }; };
  try {
    // No apex26.turnApi configured: the shipped default is used.
    global.localStorage = { getItem: () => null };
    await fresh.prefetchIce();
    assert.equal(seen.length, 1, "the default credentials URL is fetched");
    assert.match(seen[0], /^https:\/\/\S+\/api\/v1\/turn\/credentials\?apiKey=/,
      "and it is a credentials endpoint, not a bare TURN server");
    assert.equal(fresh.hasRelay(), true, "once it answers, a relay exists");

    // A player (or a fork) who sets their own must not be moved onto ours.
    const mine = load("js/net/transport.js", "NetTransport");
    seen.length = 0;
    global.localStorage = { getItem: (k) => (k === "apex26.turnApi" ? "https://mine.example/creds" : null) };
    await mine.prefetchIce();
    assert.deepEqual(seen, ["https://mine.example/creds"],
      "a configured URL wins outright — never a silent fallback to ours");
  } finally {
    delete global.fetch; delete global.localStorage;
  }
});

test("the coturn REST credential is derived, not hardcoded, and expires", async () => {
  // The shared secret is published by the operator as its Nextcloud/Matrix
  // config, and the scheme is coturn's standard one:
  //   username   = <unix expiry>
  //   credential = base64(HMAC-SHA1(secret, username))
  // Pinning it against an independently computed HMAC is the point: a wrong
  // digest, a hex-instead-of-base64, or signing the secret with the username
  // as key all produce a credential that LOOKS right and is rejected by the
  // relay with a 401 nobody sees.
  const { createHmac } = await import("node:crypto");
  const before = Math.floor(Date.now() / 1000);
  global.localStorage = { getItem: (k) => (k === "apex26.freeTurn" ? "true" : null) };
  let relays;
  try {
    await NetTransport.prefetchIce();
    relays = NetTransport.iceServers({})
      .filter((s) => /openrelay/.test(Array.isArray(s.urls) ? s.urls[0] : s.urls));
  } finally { delete global.localStorage; }
  const after = Math.floor(Date.now() / 1000);
  assert.ok(relays.length, "opting in must produce a derived relay entry");

  const { username, credential } = relays[0];
  const expiry = Number(username);
  assert.ok(Number.isInteger(expiry), "the username IS the expiry, as an integer");
  assert.ok(expiry >= before + 86400 && expiry <= after + 86400,
    "the expiry must be a day out — a credential valid forever is a password");

  const want = createHmac("sha1", "openrelayprojectsecret").update(username).digest("base64");
  assert.equal(credential, want, "credential = base64(HMAC-SHA1(secret, username))");

  // Every derived entry shares one credential — they are the same host on
  // different ports, and re-deriving per port would spend three HMACs to get
  // the same answer.
  for (const r of relays) assert.equal(r.credential, credential);
  assert.ok(relays.some((r) => /:443\?transport=tcp/.test(r.urls)),
    "443/TCP must be offered — it is what survives a corporate firewall");
});

test("opting in adds relays LAST, and hasRelay() then says so", () => {
  // The lobby's failure copy branches on hasRelay(): "no relay is configured"
  // and "a relay is configured and did not answer" are opposite instructions
  // to give a stuck player, and getting it backwards sends them round a loop
  // that cannot succeed. So the predicate is pinned, not assumed.
  withStore({ "apex26.freeTurn": "true" }, () => {
    assert.equal(NetTransport.hasRelay(), true);
    const urls = NetTransport.iceServers({})
      .flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]));
    assert.ok(urls.some((u) => /^turns?:/.test(u)), "a TURN entry appears");
    assert.ok(urls.some((u) => /^stun:/.test(u)), "STUN is never displaced by it");
    // Intent ordering: STUN first (it is the cheap common case), free relays
    // LAST so anything the player configured outranks them.
    const freeAt = urls.findIndex((u) => /freestun|openrelay/.test(u));
    assert.ok(freeAt > 0, "the free relays are appended, never prepended");
  });
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
  assert.equal((await NetHandshake.decodeCode("APEX1.x.e30")).ok, false,
    "unknown envelopes must not bypass the plain-payload size policy");
});

test("invite decoding rejects oversized encoded and plain payloads before use", async () => {
  const tooLong = "APEX1.p." + "A".repeat(512 * 1024 + 1);
  assert.equal((await NetHandshake.decodeCode(tooLong)).ok, false,
    "encoded input must be bounded before atob allocates it");

  // Still below the encoded ceiling, but above the decoded JSON/SDP ceiling.
  const plain = JSON.stringify({ k: "offer", pad: "x".repeat(270 * 1024) });
  const encoded = Buffer.from(plain).toString("base64url");
  assert.ok(encoded.length < 512 * 1024, "fixture must exercise the decoded cap");
  assert.equal((await NetHandshake.decodeCode("APEX1.p." + encoded)).ok, false);

  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  for (const id of ["vs-answer-in", "vs-invite-in"]) {
    assert.match(html, new RegExp(`<textarea id="${id}"[^>]*maxlength="524288"`),
      `${id} must enforce the same encoded ceiling before script runs`);
  }
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

// An UNKNOWN build is not a matching build. localBuild() used to answer a failed
// version.json fetch with 0 and memoise it, so two peers who had both failed —
// one flaky network, one service worker mid-update — compared 0 === 0 and were
// waved through the one guard that keeps mismatched splines, barriers and tuning
// constants off the same track. They then desynced on it, which is a far harder
// thing to diagnose than a refusal at the lobby.
test("an unknown build is refused, not treated as a match", () => {
  for (const [mine, theirs] of [[null, null], [null, 817], [817, null],
                                [undefined, 817], [817, undefined]]) {
    const r = NetHandshake.checkBuild(mine, theirs);
    assert.equal(r.ok, false, `checkBuild(${mine}, ${theirs}) must not pass`);
    assert.equal(r.error, "build_unknown");
    // The old failure mode told people to "reload the page to update", which
    // could not work: the reload hit the same dead fetch. Say what is true.
    assert.match(r.message, /could not confirm/i);
  }

  // A real pair of equal builds still matches — the guard above must not have
  // swallowed the ordinary case.
  assert.equal(NetHandshake.checkBuild(817, 817).ok, true);
  // 0 is a LEGITIMATE build number, not the sentinel it used to double as.
  assert.equal(NetHandshake.checkBuild(0, 0).ok, true);
  assert.equal(NetHandshake.checkBuild(0, 817).error, "build_mismatch");
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

// ── round 8: teardown really tears down ──────────────────────────────────────
// A peer-initiated close used to flip ep.status directly, which turned
// shutdown() — the ONLY caller of pc.close() — into a permanent no-op: every
// normal "the other player closed the tab" leaked a live RTCPeerConnection,
// its ICE agent, and up to 1 MiB of inbox. These pin the routed-through-
// shutdown contract from every close origin, and its idempotency.

function pcHarness() {
  let closed = 0;
  class FakePC {
    constructor() {
      this.connectionState = "new";
      this.iceConnectionState = "new";
      this.iceGatheringState = "new";
    }
    close() { closed++; }
  }
  const channel = (label) => ({ label, readyState: "open", close() {} });
  global.RTCPeerConnection = FakePC;
  global.localStorage = { getItem: () => null };
  const fresh = load("js/net/transport.js", "NetTransport");
  const ep = fresh.rtc({ role: "guest" });
  const state = channel("state"), event = channel("event");
  ep.pc.ondatachannel({ channel: state });
  ep.pc.ondatachannel({ channel: event });
  state.onopen(); event.onopen();
  const done = () => { delete global.RTCPeerConnection; delete global.localStorage; };
  return { ep, state, event, pcClosed: () => closed, done };
}

test("a peer channel close releases the RTCPeerConnection, exactly once", () => {
  const h = pcHarness();
  try {
    const reasons = [];
    h.ep.onClose((r) => reasons.push(r));
    h.state.onclose();
    assert.equal(h.ep.status, "closed");
    assert.equal(h.pcClosed(), 1, "pc.close() must run on a peer-initiated close");
    assert.deepEqual(reasons, ["peer"]);
    h.ep.close();                       // a later local close must not double-release
    h.event.onclose();                  // nor the second channel's close event
    assert.equal(h.pcClosed(), 1, "shutdown must stay idempotent");
    assert.deepEqual(reasons, ["peer"], "close fires once");
  } finally { h.done(); }
});

test("a connectionState failure releases the RTCPeerConnection too", () => {
  const h = pcHarness();
  try {
    const reasons = [];
    h.ep.onClose((r) => reasons.push(r));
    h.ep.pc.connectionState = "failed";
    h.ep.pc.onconnectionstatechange();
    assert.equal(h.pcClosed(), 1, "pc.close() must run on a connection failure");
    assert.deepEqual(reasons, ["failed"]);
  } finally { h.done(); }
});

test("rtc stamps message ARRIVAL and hands it to onMessage; loopback stays unstamped", () => {
  // The clock-sync PONG math reads the third argument: rtc supplies a
  // performance.now() arrival stamp recorded at inbox push (pump-time
  // stamping put up to a frame of scheduling into every RTT sample — C-12).
  // Loopback deliberately passes none: its wire time is epoch-relative,
  // a different clock domain the session must not mix in.
  const h = pcHarness();
  try {
    const stamps = [];
    h.ep.onMessage((ch, data, at) => stamps.push(at));
    const before = performance.now();
    h.state.onmessage({ data: "x" });
    const after = performance.now();
    h.ep.pump();
    assert.equal(stamps.length, 1);
    assert.ok(stamps[0] >= before && stamps[0] <= after,
      `arrival stamp ${stamps[0]} outside [${before}, ${after}]`);
  } finally { h.done(); }

  const [a, b] = NetTransport.loopback({ latencyMs: 0, rnd: seededRnd(7) });
  const atArgs = [];
  b.onMessage((ch, d, at) => atArgs.push(at));
  a.pump(0); b.pump(0);
  a.send(NetTransport.STATE, "y");
  b.pump(1);
  assert.deepEqual(atArgs, [undefined], "loopback must not invent an arrival clock");
});
