/* net-trystero-api.test.mjs — the vendored Trystero surface we actually use.
 *
 * WHY THIS EXISTS. js/net/nostr.js wraps its room setup in try/catch, because
 * a relay being unreachable must degrade to "use the invite link" rather than
 * throw inside a click handler. That is right, and it has a nasty consequence:
 * a WRONG API CALL also lands in that catch and comes back as "could not reach
 * the room service". A bug is then indistinguishable from a bad network.
 *
 * It already happened. Trystero 0.25 turned `onPeerJoin` from a method into a
 * SETTER; calling it threw, the catch swallowed it, and the room-code path
 * reported a relay failure while every relay was fine.
 *
 * So the shape of the vendored API is asserted directly against the vendored
 * source. This runs in node with no browser and no network — it is about what
 * the library exposes, not about whether Nostr is up.
 *
 * Run: node --test tests/unit/net-trystero-api.test.mjs   (npm run test:net-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const VENDOR = path.join(ROOT, "vendor/trystero-0.25.3");
const room = fs.readFileSync(path.join(VENDOR, "core/room.js"), "utf8");
const actions = fs.readFileSync(path.join(VENDOR, "core/actions.js"), "utf8");
const ours = fs.readFileSync(path.join(ROOT, "js/net/nostr.js"), "utf8");

test("onPeerJoin is a SETTER, and we assign to it rather than calling it", () => {
  // The regression. If a future Trystero makes it a method again, this fails
  // here instead of in a lobby that blames the network.
  assert.match(room, /set onPeerJoin\(/, "vendored Trystero exposes onPeerJoin as a setter");
  assert.match(ours, /room\.onPeerJoin\s*=/, "we must ASSIGN the handler");
  assert.doesNotMatch(ours, /room\.onPeerJoin\(/, "calling it would throw into the relay catch");
});

test("makeAction returns an OBJECT with send + an onMessage setter", () => {
  // The second shape change to bite. Trystero used to return a [send, receive]
  // tuple; 0.25 returns an object whose onMessage is a setter. Destructuring
  // the old tuple threw `pair[1] is not a function` straight into the relay
  // catch, so the lobby blamed the network for a wrong API call.
  //
  // Asserted against the VENDORED LIBRARY, not against our own text — the
  // first version of this test only checked that our source matched a pattern,
  // which is why it passed while the code was broken.
  assert.match(actions, /send:\s*async/, "actions expose send()");
  assert.match(actions, /set onMessage\(/, "onMessage is a setter, not a callback arg");

  assert.match(ours, /room\.makeAction\(/, "we still make the action");
  assert.match(ours, /\.onMessage\s*=/, "we must ASSIGN the handler");
  assert.doesNotMatch(ours, /const \[[^\]]+\]\s*=\s*room\.makeAction/,
    "destructuring a tuple would throw into the relay catch");
});

test("send TARGETS with an options object, and onMessage reports the sender", () => {
  // The third and fourth shapes, pinned before they bite rather than after.
  // Multi-joiner needs BOTH: a fresh offer per arrival has to reach that
  // arrival alone (an untargeted post is exactly what makes two joiners answer
  // the same connection and one of them lose), and answering a joiner needs to
  // know WHICH joiner sent it.
  //
  // Neither is send(data, id) nor onMessage(data, id). Trystero 0.25 takes
  // send(data, options) with options.target, and hands the handler a metadata
  // object carrying peerId. Both wrong guesses fail SILENTLY into nostr.js's
  // relay catch and surface as "could not reach the room service" — a bug
  // wearing a network failure's clothes, which is this file's whole reason to
  // exist.
  assert.match(actions, /send:\s*async\s*\(\s*data\s*,\s*options/,
    "send takes (data, options), not (data, peerId)");
  assert.match(actions, /options\.target/, "targeting is options.target");
  assert.match(actions, /peerId/, "the receive path carries peerId in its metadata");

  assert.match(ours, /swap\.send\(data,\s*\{\s*target:/,
    "our targeted post must pass { target: id }");
  assert.match(ours, /ctx\s*&&\s*ctx\.peerId/,
    "we read the sender off the metadata object, not a bare second argument");
});

test("leave() exists, because a room we never leave keeps sockets open", () => {
  assert.match(room, /leave\s*[(:]/, "vendored Trystero must expose leave");
  assert.match(ours, /room\.leave\(\)/, "every exit path has to close the room");
});

test("the vendored tree ships as .js, not .mjs", () => {
  // NOT the cause of the reported failure — that was pages.yml never staging
  // vendor/ at all (tests/unit/deploy-staging.test.mjs). This is the belt to that
  // braces: `.mjs` has a history of being served as application/octet-stream by
  // static hosts, and a browser REFUSES an octet-stream module script outright.
  // The repo's other ESM island (vendor/three-0.185.1) is .js already, so
  // matching it costs nothing and removes a variable we cannot test from here.
  const stray = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".mjs")) stray.push(path.relative(ROOT, full));
    }
  };
  walk(VENDOR);
  assert.deepEqual(stray, [], "these will not load from GitHub Pages");
});

test("a .nojekyll file exists, so Pages publishes the tree verbatim", () => {
  // Without it GitHub Pages runs the files through Jekyll, which has its own
  // ideas about what to publish. A static game has nothing to gain from that
  // and a whole class of silent omissions to lose.
  assert.ok(fs.existsSync(path.join(ROOT, ".nojekyll")), ".nojekyll must be committed");
});

test("the vendored tree is complete and self-contained", () => {
  // A missing file here is a dynamic import that fails at the exact moment a
  // player taps a button, which is the worst possible time to discover it.
  for (const f of ["core/index.js", "core/room.js", "nostr/index.js", "noble-secp256k1.js"]) {
    assert.ok(fs.existsSync(path.join(VENDOR, f)), `missing vendored file: ${f}`);
  }
  // Licences travel with the code — both packages are MIT.
  assert.ok(fs.existsSync(path.join(VENDOR, "LICENSE-trystero")));
  assert.ok(fs.existsSync(path.join(VENDOR, "LICENSE-noble-secp256k1")));
});

test("every bare import in the vendored tree is covered by the importmap", () => {
  // The tree uses bare specifiers (@noble/secp256k1, @trystero-p2p/core). A
  // browser resolves those ONLY through the importmap in index.html — miss one
  // and the module fails to load with nothing in the console but a bad URL.
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;

  const bare = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.js$/.test(e.name)) continue;
      const src = fs.readFileSync(full, "utf8");
      for (const m of src.matchAll(/from\s*"([^"]+)"/g)) {
        if (!m[1].startsWith(".")) bare.add(m[1]);
      }
    }
  };
  walk(VENDOR);

  assert.ok(bare.size, "expected the vendored tree to use bare specifiers");
  for (const spec of bare) {
    assert.ok(map[spec], `importmap is missing "${spec}" — the module will not load`);
    assert.ok(fs.existsSync(path.join(ROOT, map[spec].replace(/^\.\//, ""))),
      `importmap points "${spec}" at a file that is not there`);
  }
});

test("Trystero is dynamic-imported, never in the boot path", () => {
  // ~170 KB with its schnorr dependency, for a feature most sessions never
  // touch. It must not be a <script> tag and must not be in the load manifest.
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.doesNotMatch(html, /<script[^>]+trystero/i, "must not be a boot script");
  assert.match(ours, /import\("@trystero-p2p\/nostr"\)/, "reached by dynamic import");
  const manifest = fs.readFileSync(path.join(ROOT, "tools/manifest.cjs"), "utf8");
  assert.ok(!manifest.includes("trystero"), "not part of the IIFE load order");
});

// ---------------------------------------------------------------------------
// A relay that refuses us must be distinguishable from a relay that is down
// ---------------------------------------------------------------------------

test("a rejection is console.warn and NOTHING else, which is why we intercept it", () => {
  // This pins the vendor behaviour our diagnosis depends on. NIP-01 says a
  // relay refuses with ["OK", <id>, false, "<reason>"], and the whole of
  // Trystero's response to that is one console.warn: no retry, no backoff,
  // the relay is not dropped from the pool, and nothing is handed back to the
  // caller. If a future vendor bump gives us a real callback, this test fails
  // and the console.warn interception in js/net/nostr.js should be replaced
  // by it rather than kept out of habit.
  const nostr = fs.readFileSync(path.join(VENDOR, "nostr/index.js"), "utf8");
  assert.match(nostr, /relay failure from/,
    "the warning text our matcher keys on must still exist");
  assert.match(nostr, /msgType === "OK" && !payload/,
    "an OK with payload=false is how a rejection arrives");
  // The warning is the ONLY reaction: no throw, no callback, no removal.
  const around = nostr.slice(Math.max(0, nostr.indexOf("relay failure from") - 400),
                             nostr.indexOf("relay failure from") + 400);
  assert.ok(!/throw |reject\(|onRelayReject|removeRelay/.test(around),
    "if the vendor gains a real error channel, use it instead of the warn hook");
});

test("our exchange reports 'connected but refused' as its own outcome", () => {
  // getRelaySockets() only ever reports TRANSPORT state, so a relay that
  // completes the WebSocket handshake and then throws away every event we
  // publish counts as live. Without a separate signal the host waits the full
  // JOIN_TIMEOUT_MS and blames the other player for not joining — which is
  // precisely what a real phone reported while wellorder was answering
  // "blocked: spam not permitted".
  assert.match(ours, /rejectedBy/,
    "rejections must be tracked, not merely printed");
  assert.match(ours, /all_rejected/,
    "and surfaced as a typed outcome distinct from no_relay and expired");
  // Only when EVERY live relay refuses — one fussy relay out of six must not
  // scare a player off a room that is working.
  assert.match(ours, /rejectedBy\.size >= live/,
    "a single rejecting relay is survivable and must not be reported");
  assert.match(ours, /restoreWarn/,
    "console.warn must be restored, or the patch outlives the lobby");
});

test("a bad relay override is dropped, never handed to WebSocket", () => {
  // Trystero does `new WebSocket(url)` on every entry it is given, and a
  // malformed one throws SyntaxError out of joinRoom — which our catch
  // reported as "could not reach the room service", pointing at the network
  // when the fault was one localStorage value. That left a device permanently
  // unable to use room codes while the invite link kept working and hid it.
  //
  // It happened from a copy-pasted debugging line: '["wss://…","wss://…"]' is
  // valid JSON and an invalid URL.
  //
  // Driven through the REAL relayUrls(), not asserted against the source text
  // — a source-text test here would pass while the code was broken.
  const NetNostr = eval(fs.readFileSync(path.join(ROOT, "js/net/nostr.js"), "utf8") + ";NetNostr");
  const withStore = (value, fn) => {
    global.localStorage = { getItem: () => JSON.stringify(value) };
    try { return fn(); } finally { delete global.localStorage; }
  };

  assert.deepEqual(withStore(["wss://\u2026", "wss://\u2026"], () => NetNostr.relayUrls()),
    NetNostr.RELAYS, "the ellipsis placeholders that caused this fall back");
  assert.deepEqual(withStore(["nope", "", null, 42], () => NetNostr.relayUrls()),
    NetNostr.RELAYS, "junk falls back rather than leaving no relays at all");
  assert.deepEqual(withStore(["https://nos.lol"], () => NetNostr.relayUrls()),
    NetNostr.RELAYS, "http is not a socket");
  assert.deepEqual(
    withStore(["wss://nos.lol", "wss://\u2026", "wss://nostr.mom"], () => NetNostr.relayUrls()),
    ["wss://nos.lol", "wss://nostr.mom"],
    "one bad entry is dropped without poisoning the good ones");
  assert.deepEqual(
    withStore(["wss://relay.example", "ws://127.0.0.1:7448"], () => NetNostr.relayUrls()),
    ["wss://relay.example", "ws://127.0.0.1:7448"],
    "and a real override still wins — ws:// matters, it is the local fixture");
});

test("direct relay frames are rejected before unbounded parsing or decoding", () => {
  const NetNostr = eval(fs.readFileSync(path.join(ROOT, "js/net/nostr.js"), "utf8") + ";NetNostr");
  const huge = "x".repeat(NetNostr.MAX_FRAME_CHARS + 1);
  const frame = NetNostr.readRelayFrame(huge);
  assert.equal(frame.close, true);
  assert.equal(frame.message, null);
  assert.equal(NetNostr.readRelayFrame({ toString: () => '["EVENT"]' }).close, true,
    "Nostr JSON is text; arbitrary objects must not be coerced before measuring");
  assert.deepEqual(NetNostr.readRelayFrame('["EVENT","s",{"content":"ok"}]').message,
    ["EVENT", "s", { content: "ok" }]);
});

test("direct relay dedupe and decrypt work stay hard bounded", async () => {
  const NetNostr = eval(fs.readFileSync(path.join(ROOT, "js/net/nostr.js"), "utf8") + ";NetNostr");
  const releases = [];
  const inbox = NetNostr.createBoundedInbox(() => new Promise((resolve) => releases.push(resolve)));

  for (let i = 0; i < NetNostr.MAX_HEARD_ACTIVE; i++) assert.equal(inbox.accept("msg-" + i), true);
  assert.equal(inbox.accept("msg-0"), true, "a duplicate consumes no second decrypt slot");
  assert.equal(inbox.accept("overflow"), "busy",
    "beyond the concurrency cap the message drops but the relay socket survives");
  assert.equal(inbox.stats().active, NetNostr.MAX_HEARD_ACTIVE);
  assert.equal(inbox.accept("x".repeat(NetNostr.MAX_CONTENT_CHARS + 1)), false);

  await new Promise((resolve) => setImmediate(resolve));
  for (const release of releases) release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(inbox.stats().active, 0);

  // Let each task settle before admitting the next, exercising the FIFO bound
  // rather than the concurrency rejection above.
  const quick = NetNostr.createBoundedInbox(async () => {});
  for (let i = 0; i < NetNostr.MAX_SEEN + 20; i++) {
    assert.equal(quick.accept("unique-" + i), true);
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(quick.stats().seen <= NetNostr.MAX_SEEN);
  assert.ok(quick.stats().seenChars <= NetNostr.MAX_SEEN_CHARS);
  assert.equal(quick.stats().active, 0);

  for (let i = 0; i < 4; i++) {
    assert.equal(quick.accept(String(i) + "z".repeat(NetNostr.MAX_CONTENT_CHARS - 1)), true);
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(quick.stats().seenChars <= NetNostr.MAX_SEEN_CHARS,
    "a handful of individually legal near-limit frames must not multiply retention");
});
