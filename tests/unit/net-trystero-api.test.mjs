/* net-trystero-api.test.mjs — the vendored Trystero surface we actually use.
 *
 * WHY THIS EXISTS. js/net/nostr.js guards its relay setup with try/catch,
 * because a relay being unreachable must degrade to "use the invite link"
 * rather than throw inside a click handler. That is right, and it has a nasty
 * consequence: a WRONG API CALL also lands in that catch and comes back as a
 * relay failure. A bug is then indistinguishable from a bad network — it
 * happened once, when Trystero 0.25 turned onPeerJoin into a setter.
 *
 * The direct exchange (the ONLY path since the full-room legacy branch was
 * deleted 2026-09-10) reaches exactly two vendored exports — createEvent and
 * subscribe, the NIP-01 framing — so those are what is pinned here, against
 * the vendored source. This runs in node with no browser and no network.
 *
 * Run: node --test tests/unit/net-trystero-api.test.mjs   (npm run test:net-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const VENDOR = path.join(ROOT, "vendor/trystero-0.25.4");
const nostrSrc = fs.readFileSync(path.join(VENDOR, "nostr/index.js"), "utf8");
const ours = fs.readFileSync(path.join(ROOT, "js/net/nostr.js"), "utf8");
// CODE, not prose: the file's comments record why the room join was removed,
// so the "must not creep back" pins below run against a comment-stripped copy.
const oursCode = ours.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");

test("the direct exchange reaches createEvent and subscribe, and both are exported", () => {
  // The two framing helpers are the whole of what we take from the vendor:
  // a signed NIP-01 EVENT frame and a REQ frame. If a bump renames or drops
  // either, this fails here instead of in a lobby that blames the network.
  const exported = nostrSrc.match(/export \{([^}]+)\}/);
  assert.ok(exported, "the vendored nostr module has a named export list");
  const names = exported[1].split(",").map((x) => x.trim().split(/\s+as\s+/).pop());
  assert.ok(names.includes("createEvent"), "createEvent must be exported");
  assert.ok(names.includes("subscribe"), "subscribe must be exported");
  assert.match(nostrSrc, /const createEvent = async \(topic, content\)/, "createEvent(topic, content) -> frame text");
  assert.match(nostrSrc, /const subscribe = \(subId, topic\)/, "subscribe(subId, topic) -> REQ frame text");
  assert.match(ours, /mod\.createEvent\(mineTopic,/, "we frame our sealed payload with it");
  assert.match(ours, /mod\.subscribe\(subId, theirTopic\)/, "and subscribe to the other slot's topic");
  assert.doesNotMatch(oursCode, /joinRoom|makeAction|onPeerJoin|getRelaySockets/,
    "the full Trystero room is gone; nothing may creep back through the catch");
  assert.doesNotMatch(oursCode, /nostrTrystero/, "and so is its opt-in switch");
});

test("the direct exchange owns its sockets and reads NIP-01 refusals itself", () => {
  // The legacy branch learned of a refusal only by intercepting console.warn.
  // The direct path opens the WebSockets, so it sees ["OK", id, false, why]
  // and ["CLOSED", subId, why] first-hand — and must never touch console.
  assert.match(ours, /new WebSocket\(url\)/);
  assert.match(ours, /m\[0\] === "OK" && pubIds\.has\(m\[1\]\) && m\[2\] === false/, "an OK=false on OUR event id is a refusal");
  assert.match(ours, /m\[0\] === "CLOSED" && subId && m\[1\] === subId/, "a CLOSED for our REQ is a refusal");
  assert.match(ours, /all_rejected/, "surfaced as a typed, advisory outcome");
  assert.match(ours, /rejectedBy\.size < live\) return/, "one fussy relay out of six must not scare a player off");
  assert.doesNotMatch(oursCode, /console\.warn\s*=/, "no console.warn interception survives");
});

test("the vendored version is 0.25.4 and carries the relay backoff this bump was for", () => {
  // 0.25.4's nostr adapter retires a relay that refuses terminally, backs off
  // one that rate-limits, and closes a client whose reconnects are exhausted
  // (utils.js client.close/isClosed). We do not run its room, but the
  // importmap and sw.js precache name the directory, so the pin is the dir.
  assert.match(nostrSrc, /retireRelay/, "0.25.4 relay retirement");
  assert.match(nostrSrc, /backoffRelay/, "0.25.4 rate-limit backoff");
  const utils = fs.readFileSync(path.join(VENDOR, "core/utils.js"), "utf8");
  assert.match(utils, /client\.isClosed = true/, "0.25.4 exhausted-reconnect close");
  assert.ok(!fs.existsSync(path.join(ROOT, "vendor/trystero-0.25.3")), "the old tree is gone");
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
  // nostr/index.js imports the core barrel, and the barrel re-exports the
  // strategy -> room -> peer graph, so EVERY core file is loaded by the
  // browser even though the direct exchange calls two functions. Trimming
  // was measured (scratch, 2026-09-10): all fourteen are reachable.
  for (const f of ["core/index.js", "core/room.js", "core/utils.js", "core/crypto.js", "core/strategy.js",
                   "core/topic-strategy.js", "nostr/index.js", "noble-secp256k1.js"]) {
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
