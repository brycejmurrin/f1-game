#!/usr/bin/env node
// turn-local.cjs — a TURN server on localhost, so the RELAY leg can be tested.
// @doc A TURN server on localhost so the RELAY leg of ICE can be tested.
// @skill multiplayer-debug
//
//   npm i --no-save node-turn && node tools/net/turn-local.cjs [--debug]
//   node tools/net/rtc-e2e-3p.mjs --relay --turn=turn:127.0.0.1:3478,apex,apex
//
// WHY THIS EXISTS. On one machine — and on most home networks — ICE forms a
// direct host pair instantly and TURN is never touched. So the relay leg is
// precisely the path a developer never exercises and a player behind
// carrier-grade NAT always does, and "it works on my machine" is guaranteed to
// tell you nothing about it. Pointing every peer at a local TURN server and
// forcing iceTransportPolicy "relay" makes a direct pair impossible, so every
// byte has to go through the relay.
//
// NOT a dependency of the repo. node-turn is installed on demand with
// --no-save: it is an unmaintained 0.0.6 pure-JS implementation, fine as a test
// fixture and not something to ship a lockfile entry for. If it is missing this
// says so and exits rather than failing obscurely.
//
// KNOWN, AND UNRESOLVED: against this server three peers replicate correctly
// for roughly 20-30 s and then the guests' sessions drop, while the same run
// without --relay is stable across the identical window. Whether that is our
// code or a pure-JS TURN server being asked to carry 20 Hz of snapshots for
// three peers is NOT established — the sandbox this was written in has no route
// to a production TURN host to cross-check against. --debug makes the server
// report what it is doing, which is where to start.
let Turn;
try { Turn = require("node-turn"); }
catch (e) {
  console.error("node-turn is not installed. Run:  npm i --no-save node-turn");
  process.exit(2);
}

const DEBUG = process.argv.includes("--debug");
const server = new Turn({
  listeningPort: 3478,
  listeningIps: ["127.0.0.1"],
  authMech: "long-term",
  credentials: { apex: "apex" },
  debugLevel: DEBUG ? "ALL" : "ERROR",
});
server.start();
console.log("TURN on 127.0.0.1:3478  user=apex pass=apex" + (DEBUG ? "  [debug]" : ""));
console.log("point the harness at it:  --relay --turn=turn:127.0.0.1:3478,apex,apex");

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { try { server.stop(); } catch (e) {} process.exit(0); });
}
