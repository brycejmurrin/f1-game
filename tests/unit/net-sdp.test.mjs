/* net-sdp.test.mjs — the compact invite codec.
 *
 * This is the module that makes an invite scannable instead of merely
 * pasteable, and it works by NOT sending the SDP: it extracts five facts and
 * rebuilds a complete description from a template. That is exactly the shape
 * of change that broke every real connection last time (a rejoin that dropped
 * the trailing CRLF), so the round trip is pinned line by line here, against
 * SDP captured from a real gathered RTCPeerConnection rather than invented.
 *
 * Run: node --test tests/unit/net-sdp.test.mjs   (npm run test:net-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NetSdp = eval(fs.readFileSync(path.join(ROOT, "js/net/sdp.js"), "utf8") + ";NetSdp");

// Captured verbatim from Chromium after ICE gathering completed, with the two
// data channels this game actually opens. The mDNS `.local` host candidate is
// Chrome's LAN-address privacy form and is the common case, so it is the one
// that must survive.
const REAL = [
  "v=0",
  "o=- 3676103885910906122 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0",
  "a=extmap-allow-mixed",
  "a=msid-semantic: WMS",
  "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
  "c=IN IP4 0.0.0.0",
  "a=candidate:669599788 1 udp 2113937151 50a48b8e-b13b-42b4-b448-0ae6d08aaaf0.local 48941 typ host generation 0 network-cost 999",
  "a=ice-ufrag:0BnP",
  "a=ice-pwd:cYngfNsQbABEXhLKe2Bg/q3E",
  "a=ice-options:trickle",
  "a=fingerprint:sha-256 85:93:AA:4F:69:8F:E1:43:B7:87:D4:D5:6D:24:BD:FB:4D:F5:AA:1E:CC:1A:F6:17:61:6F:41:81:38:77:97:4B",
  "a=setup:actpass",
  "a=mid:0",
  "a=sctp-port:5000",
  "a=max-message-size:262144",
].join("\r\n") + "\r\n";

const field = (sdp, re) => { const m = sdp.match(re); return m ? m[1] : null; };

test("the five facts survive a real gathered offer", () => {
  const out = NetSdp.unpack(NetSdp.pack(REAL));
  assert.ok(out, "should have packed");
  assert.equal(field(out, /^a=ice-ufrag:(\S+)/m), "0BnP");
  assert.equal(field(out, /^a=ice-pwd:(\S+)/m), "cYngfNsQbABEXhLKe2Bg/q3E");
  assert.equal(field(out, /^a=fingerprint:sha-256 (\S+)/m),
    field(REAL, /^a=fingerprint:sha-256 (\S+)/m));
  assert.equal(field(out, /^a=setup:(\S+)/m), "actpass");
  assert.match(out, /50a48b8e-b13b-42b4-b448-0ae6d08aaaf0\.local 48941 typ host/);
});

test("every line is CRLF-terminated, including the last", () => {
  // THE regression. An SDP whose final line has no terminator is refused
  // outright by Chrome with "Invalid SDP line", and it is invisible until two
  // real browsers try to connect.
  const out = NetSdp.unpack(NetSdp.pack(REAL));
  assert.ok(out.endsWith("\r\n"), "the final line MUST be terminated");
  assert.ok(!out.includes("\n\n"), "no blank lines");
  assert.ok(!/[^\r]\n/.test(out), "every LF must be preceded by CR");
});

test("the rebuild keeps the lines a data channel cannot connect without", () => {
  const out = NetSdp.unpack(NetSdp.pack(REAL));
  for (const required of [
    "v=0", "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0", "a=group:BUNDLE 0", "a=mid:0",
    "a=sctp-port:5000", "a=max-message-size:262144",
  ]) assert.ok(out.includes(required), `missing: ${required}`);
});

test("it is dramatically smaller than the text it replaces", () => {
  // The whole reason the module exists: a QR of ~650 characters needs a
  // density phone cameras struggle with, and ~130 does not.
  const packed = NetSdp.pack(REAL);
  assert.ok(packed.length < 100, `expected under 100 bytes, got ${packed.length}`);
  const b64 = Math.ceil(packed.length / 3) * 4;
  assert.ok(b64 < REAL.length / 4, `expected 4x smaller than the raw SDP, got ${b64} vs ${REAL.length}`);
});

test("pack() allocates exactly the bytes it writes — no stray trailing 0x00", () => {
  // The regression this pins: the allocation arithmetic once carried a spare
  // `+ 1`, so every packed struct ended with one 0x00 the writer never touched.
  // Decode-harmless (unpack walks by count, not to the end) but a wire-format
  // wart, and a byte of QR density paid for nothing. The struct is
  //   ver + setup + count | fp(32) | len+ufrag | len+pwd | (kind+addr+port)*
  // and for REAL that is one mDNS candidate (16-byte uuid + 2-byte port).
  const packed = NetSdp.pack(REAL);
  const ufrag = "0BnP", pwd = "cYngfNsQbABEXhLKe2Bg/q3E";
  const expected = 3 + 32 + (1 + ufrag.length) + (1 + pwd.length) + (1 + 16 + 2);
  assert.equal(packed.length, expected,
    `packed length must equal the struct size exactly, got ${packed.length} vs ${expected}`);
  // And the last byte is the port's low byte, not padding (48941 & 0xff).
  assert.equal(packed[packed.length - 1], 48941 & 0xff, "struct must END on the port low byte");
});

test("a server-reflexive IPv4 candidate round-trips with its port", () => {
  // The candidate that actually connects two people on different networks.
  const withSrflx = REAL.replace("a=ice-ufrag:0BnP",
    "a=candidate:842163049 1 udp 1677729535 203.0.113.7 54321 typ srflx raddr 192.168.1.10 rport 54321 generation 0\r\n"
    + "a=ice-ufrag:0BnP");
  const out = NetSdp.unpack(NetSdp.pack(withSrflx));
  assert.match(out, /203\.0\.113\.7 54321 typ srflx/);
  // rel-addr is masked, not carried — diagnostic only, and ICE never connects
  // through it.
  assert.match(out, /typ srflx raddr 0\.0\.0\.0 rport 0/);
});

test("an IPv6 host candidate round-trips, including :: compression", () => {
  const withV6 = REAL.replace("a=ice-ufrag:0BnP",
    "a=candidate:1 1 udp 2113937151 2001:db8::1 9999 typ host generation 0\r\n"
    + "a=ice-ufrag:0BnP");
  const out = NetSdp.unpack(NetSdp.pack(withV6));
  assert.match(out, /2001:db8::1 9999 typ host/);
});

test("TCP and non-data components are dropped, not mangled", () => {
  // Dropping them is most of the remaining size, and a TCP candidate is
  // near-useless for a data channel across a NAT.
  const withTcp = REAL.replace("a=ice-ufrag:0BnP",
    "a=candidate:9 1 tcp 1518280447 192.168.1.10 9 typ host tcptype active generation 0\r\n"
    + "a=candidate:8 2 udp 2113937150 192.168.1.10 5001 typ host generation 0\r\n"
    + "a=ice-ufrag:0BnP");
  const out = NetSdp.unpack(NetSdp.pack(withTcp));
  assert.ok(!out.includes(" tcp "), "TCP candidate should be gone");
  assert.ok(!out.includes("5001"), "component 2 is RTCP, not for a data channel");
  assert.match(out, /48941 typ host/, "the usable candidate must remain");
});

test("an answer keeps its setup role, which is what makes it an answer", () => {
  const answer = REAL.replace("a=setup:actpass", "a=setup:active");
  assert.equal(field(NetSdp.unpack(NetSdp.pack(answer)), /^a=setup:(\S+)/m), "active");
});

test("anything not fully understood packs to null rather than partially", () => {
  // A partial pack is worse than a long code: it produces an invite that looks
  // perfectly fine and cannot connect.
  assert.equal(NetSdp.pack(""), null);
  assert.equal(NetSdp.pack(REAL.replace(/^a=fingerprint:.*$/m, "")), null, "no fingerprint");
  assert.equal(NetSdp.pack(REAL.replace(/^a=ice-pwd:.*$/m, "")), null, "no ice-pwd");
  assert.equal(NetSdp.pack(REAL.replace(/^a=candidate:.*$/m, "")), null, "no candidates");
  // sha-1 fingerprints are not packed — refuse rather than silently truncate.
  assert.equal(NetSdp.pack(REAL.replace(/a=fingerprint:sha-256 \S+/, "a=fingerprint:sha-1 AB:CD")), null);
});

test("a truncated struct unpacks to null rather than a plausible offer", () => {
  const packed = NetSdp.pack(REAL);
  assert.equal(NetSdp.unpack(packed.slice(0, packed.length - 3)), null);
  assert.equal(NetSdp.unpack(new Uint8Array([9, 0, 1])), null, "wrong version");
  assert.equal(NetSdp.unpack(null), null);
});

test("the relay candidate survives the budget, because it arrives last", () => {
  // MEASURED, and unguarded until now. SDP lists candidates in GATHERING
  // order — host, then srflx once STUN answers, then relay once TURN
  // allocates — so relay is ALWAYS last. Truncating the raw sequence at
  // MAX_CANDS therefore dropped exactly the candidate that matters most, and
  // dropped it on precisely the machines that need one: a laptop with Wi-Fi,
  // Ethernet, a VPN and IPv6 fills eight slots before a relay line is emitted.
  //
  // The symptom was maddening. __apex.turnProbe() reported every Metered
  // server reachable, the connection gathered relay candidates, and the invite
  // code carried none — so the peer was handed addresses it could not reach.
  // Every wire dump read relay:0 and looked exactly like a dead relay.
  const cands = [
    "a=candidate:1 1 udp 2113937151 192.168.1.10 5001 typ host",
    "a=candidate:2 1 udp 2113937151 192.168.1.11 5002 typ host",
    "a=candidate:3 1 udp 2113937151 10.0.0.5 5003 typ host",
    "a=candidate:4 1 udp 2113937151 10.211.55.2 5004 typ host",
    "a=candidate:5 1 udp 2113937151 172.16.0.3 5005 typ host",
    "a=candidate:6 1 udp 2113937151 192.168.64.1 5006 typ host",
    "a=candidate:7 1 udp 1677729535 203.0.113.9 5007 typ srflx raddr 0.0.0.0 rport 0",
    "a=candidate:8 1 udp 1677729535 203.0.113.10 5008 typ srflx raddr 0.0.0.0 rport 0",
    "a=candidate:9 1 udp 16777215 198.51.100.7 5009 typ relay raddr 0.0.0.0 rport 0",
  ];
  const sdp = [
    "v=0", "o=- 1 2 IN IP4 127.0.0.1", "s=-", "t=0 0",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0", "a=ice-ufrag:AbCd",
    "a=ice-pwd:0123456789abcdefghijklmn",
    "a=fingerprint:sha-256 " + Array.from({ length: 32 },
      (_, i) => ((i * 7) % 256).toString(16).toUpperCase().padStart(2, "0")).join(":"),
    "a=setup:actpass", "a=sctp-port:5000",
  ].concat(cands).join("\r\n") + "\r\n";

  assert.ok(cands.length > 8, "the fixture must actually exceed the budget");

  const bytes = NetSdp.pack(sdp);
  assert.ok(bytes, "a crowded SDP must still pack");
  const out = NetSdp.unpack(bytes);
  assert.ok(out, "and unpack");

  assert.match(out, /198\.51\.100\.7 5009 typ relay/,
    "THE RELAY MUST SURVIVE — it is the one candidate that works when none of "
    + "the others can, and it is always the last one gathered");
  assert.match(out, /typ srflx/, "the public address keeps its place too");
  assert.match(out, /typ host/,
    "and the LAN keeps one, because two phones on a sofa are the case the "
    + "mDNS packing exists for");
});

test("an IPv6 relay candidate round-trips — it is the whole relay leg on a v6-only path", () => {
  const withV6Relay = REAL.replace("a=ice-ufrag:0BnP",
    "a=candidate:7 1 udp 16777215 2001:db8:5::9 3478 typ relay raddr 2001:db8::1 rport 5000 generation 0\r\n"
    + "a=ice-ufrag:0BnP");
  const out = NetSdp.unpack(NetSdp.pack(withV6Relay));
  assert.match(out, /2001:db8:5::9 3478 typ relay raddr :: rport 0/, "kind C_RELAY6 exists and masks rel-addr the v6 way");
});

test("an IPv4-mapped IPv6 address is packed as the IPv4 candidate it is", () => {
  // ::ffff:a.b.c.d parsed as hex words was garbage (parseInt("1.2.3.4", 16)).
  const withMapped = REAL.replace("a=ice-ufrag:0BnP",
    "a=candidate:8 1 udp 1677729535 ::ffff:203.0.113.9 40000 typ srflx raddr 0.0.0.0 rport 0 generation 0\r\n"
    + "a=ice-ufrag:0BnP");
  const out = NetSdp.unpack(NetSdp.pack(withMapped));
  assert.match(out, /203\.0\.113\.9 40000 typ srflx/);
});
