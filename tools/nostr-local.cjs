#!/usr/bin/env node
// nostr-local.cjs — a Nostr relay on localhost, so the ROOM CODE path can be
// tested without depending on somebody else's server.
//
//   npm i --no-save ws && node tools/nostr-local.cjs
//   then point the game at it:  localStorage apex26.nostrRelays = ["ws://127.0.0.1:7448"]
//
// WHY. Room codes are the one part of this game that leans on infrastructure
// nobody here controls, and it shows: a real console showed two of the relays
// Trystero picked with DEAD DNS, one timing out, and the last rate-limiting us.
// Worse, getRelays() chooses its subset DETERMINISTICALLY from a hash of the
// appId, so every player of this game gets the same handful forever — a bad
// draw is bad permanently, not intermittently. None of that is testable against
// the public network: a failure there tells you nothing about whether OUR code
// is right.
//
// So this is the relay, and it makes the room-code path a thing that can be
// tested at all. It is deliberately the SMALLEST relay that Trystero needs,
// which is very small, because Trystero uses ephemeral events with
// `since: now()` — no history, no storage, just live fan-out:
//
//   in   ["EVENT", ev]                     -> fan out to matching subscribers
//   in   ["REQ", subId, {kinds, #x, since}] -> register, then EOSE
//   in   ["CLOSE", subId]                   -> unregister
//   out  ["EVENT", subId, ev]
//
// NOT a dependency: `ws` is installed on demand with --no-save, same as the
// TURN fixture next door. This is test scaffolding, not something every
// checkout should carry.
let WebSocketServer;
try { ({ WebSocketServer } = require("ws")); }
catch (e) {
  console.error("ws is not installed. Run:  npm i --no-save ws");
  process.exit(2);
}

const PORT = Number(process.argv.find((a) => /^\d+$/.test(a)) || 7448);
const DEBUG = process.argv.includes("--debug");
const wss = new WebSocketServer({ host: "127.0.0.1", port: PORT });

// socket -> subId -> filter
const subs = new Map();

// Only the two things Trystero filters on. `since` is deliberately ignored:
// it is always now() and clock skew between a browser and this process would
// silently drop live events, which would look exactly like a broken relay.
function matches(filter, ev) {
  if (!filter) return false;
  if (filter.kinds && !filter.kinds.includes(ev.kind)) return false;
  const want = filter["#x"];
  if (want) {
    const tags = (ev.tags || []).filter((t) => t[0] === "x").map((t) => t[1]);
    if (!want.some((w) => tags.includes(w))) return false;
  }
  return true;
}

wss.on("connection", (sock) => {
  subs.set(sock, new Map());
  sock.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch (e) { return; }
    const [type] = msg;

    if (type === "REQ") {
      const [, subId, filter] = msg;
      subs.get(sock).set(subId, filter);
      // EOSE means "that is all the history there is" — there is none, and
      // saying so promptly is what lets a client move on.
      sock.send(JSON.stringify(["EOSE", subId]));
      if (DEBUG) console.log("REQ", subId, JSON.stringify(filter));
      return;
    }

    if (type === "CLOSE") { subs.get(sock).delete(msg[1]); return; }

    if (type === "EVENT") {
      const ev = msg[1];
      // Accepted unconditionally. A relay that verified signatures would be
      // more faithful and would test nothing extra here — the signing is
      // Trystero's, not ours, and a fixture that can reject our own traffic is
      // a fixture that invents failures.
      sock.send(JSON.stringify(["OK", ev.id, true, ""]));
      let sent = 0;
      for (const [peer, peerSubs] of subs) {
        if (peer === sock || peer.readyState !== 1) continue;
        for (const [subId, filter] of peerSubs) {
          if (matches(filter, ev)) { peer.send(JSON.stringify(["EVENT", subId, ev])); sent++; break; }
        }
      }
      if (DEBUG) console.log("EVENT kind=" + ev.kind + " -> " + sent + " peer(s)");
    }
  });
  sock.on("close", () => subs.delete(sock));
});

console.log("nostr relay on ws://127.0.0.1:" + PORT + (DEBUG ? "  [debug]" : ""));
console.log('point the game at it:  localStorage.setItem("apex26.nostrRelays", \'["ws://127.0.0.1:' + PORT + '"]\')');

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { try { wss.close(); } catch (e) {} process.exit(0); });
}
