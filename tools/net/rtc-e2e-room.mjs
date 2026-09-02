#!/usr/bin/env node
// rtc-e2e-room.mjs — the ROOM CODE path, end to end, against a relay we run.
// @doc The ROOM CODE path end to end, against a relay we run (`nostr-local.cjs`).
// @skill multiplayer-debug
//
//   npm i --no-save ws
//   node tools/net/nostr-local.cjs &
//   node tools/net/rtc-e2e-room.mjs [--peers=3]
//
// This is the path that had NO test of any kind. js/net/nostr.js's exchange()
// is unreachable from the suite — the loopback transport has no SDP and the
// lobby specs use a fake one — so every change to it shipped on reasoning
// alone. That is how a regression got out: onPeerJoin is a setter that REPLAYS
// for peers already in the room, my multi-joiner handler minted a whole
// RTCPeerConnection on every fire, and the relays started refusing us with
// "you are noting too much". Nothing could have caught it, because nothing
// looked.
//
// Testing it against the PUBLIC relays would not have caught it either, and
// would not catch the next one: a failure there is unattributable — dead DNS,
// rate limits and timeouts all look identical to a bug in our code. So the
// relay is ours, on localhost, and a failure here is ours by construction.
//
// Exit 0 = every peer reached the waiting room by room code alone.
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, startStaticServer } from "../harness.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");

const PORT = 4474;
// --relays=a,b,c — MULTIPLE relays, which is what reality is. The same Nostr
// event arrives once per connected relay, so a single-relay test cannot see
// any bug of the form "handled the same message twice" — and that is exactly
// the class of bug a real console produced (setRemoteDescription: stable).
const RELAY = ((process.argv.find((a) => a.startsWith("--relays=")) || process.argv.find((a) => a.startsWith("--relay=")) || "--relay=ws://127.0.0.1:7448").split("=")[1]);
const PEERS = Number((process.argv.find((a) => a.startsWith("--peers=")) || "--peers=2").slice(8));
// --delay=SECONDS — how long the host sits on its offer before a guest answers.
//
// THE DIFFERENCE THIS HARNESS COULD NOT SEE. It has always joined within a
// second of hosting, which is nothing like the real thing: a room code is read
// off one screen and typed into another, and the host's offer waits half a
// minute for it. An invite link pasted straight across connects in ~6 s on the
// same hardware where a room code fails, and elapsed time is the only
// difference left between them that this harness does not model.
const DELAY_S = Number((process.argv.find((a) => a.startsWith("--delay=")) || "--delay=0").split("=")[1]);

const alive = async () => {
  try { return (await fetch(`http://127.0.0.1:${PORT}/version.json`)).ok; } catch (e) { return false; }
};
const adopted = await alive();
if (!adopted) await startStaticServer(ROOT, { port: PORT });
let up = adopted;
for (let i = 0; i < 40 && !up; i++) { up = await alive(); if (!up) await new Promise((r) => setTimeout(r, 250)); }
if (!up) { await shutdown(); process.exit(1); }
const log = (...a) => console.log(...a);
log("relay:", RELAY, " peers:", PEERS);

const b = await launchChromium({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
});
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
const die = async (m) => { log(`\n*** ${m} ***`); await shutdown(); process.exit(1); };

const mk = async (name, teamIdx) => {
  const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage();
  p.on("pageerror", (e) => log(`  [${name} pageerror]`, String(e).slice(0, 140)));
  // Relay failures surface as console warnings from Trystero and nothing else,
  // so they are worth carrying up here — a silent room is the failure mode.
  p.on("console", (m) => {
    const t = m.text();
    if (/relay failure|rate-limited|WebSocket|NETDBG/i.test(t)) log(`  [${name}]`, t.slice(0, 160));
  });
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForFunction(() => window.__apex != null, null, { timeout: 90000 });
  await p.evaluate(([relay, ti]) => {
    localStorage.setItem("apex26.nostrRelays", JSON.stringify(relay.split(",")));
    localStorage.setItem("apex26.team", JSON.stringify(ti));
    localStorage.setItem("apex26.driver", "0");
    location.reload();
  }, [RELAY, teamIdx]);
  await p.waitForFunction(() => window.__apex != null, null, { timeout: 90000 });
  await p.evaluate(() => window.__apex.headless(true));
  return p;
};

const teams = [1, 3, 6, 7];
const pages = [];
for (let i = 0; i < PEERS; i++) pages.push(await mk("P" + (i + 1), teams[i]));
log(el(), PEERS + " pages booted");

// ---- host opens a room -----------------------------------------------------
const host = pages[0];
const res = await host.evaluate(() => window.__apex.lobbyCodeHost());
log(el(), "code:", JSON.stringify(res).slice(0, 160));
if (!res || !res.ok) await die("the host could not open a room: " + JSON.stringify(res));
const CODE = res.code;

// ---- guests join by code ---------------------------------------------------
if (DELAY_S > 0) {
  log(el(), `waiting ${DELAY_S}s before any guest joins — modelling a human carrying the code`);
  await new Promise((r) => setTimeout(r, DELAY_S * 1000));
}
for (let i = 1; i < PEERS; i++) {
  const r = await pages[i].evaluate((c) => window.__apex.lobbyCodeJoin(c), CODE);
  log(el(), "P" + (i + 1) + " join:", JSON.stringify(r).slice(0, 140));
}

// ---- did everyone actually arrive? ----------------------------------------
const guests = async () => (await host.evaluate(() => window.__apex.lobby())).guests || 0;
const want = PEERS - 1;
for (let i = 0; i < 45 && (await guests()) < want; i++) await new Promise((r) => setTimeout(r, 2000));
const got = await guests();
log(el(), `guests connected: ${got}/${want}`);
if (got < want) {
  // What each side BELIEVES, which is the only way to tell "the answer never
  // arrived" from "it arrived and the handshake failed" — they look identical
  // from outside.
  for (let i = 0; i < PEERS; i++) {
    const st = await pages[i].evaluate(() => {
      const l = window.__apex.lobby();
      return { role: l.role, guests: l.guests, pending: l.pending, connected: l.connected,
               status: l.statusText, wire: l.wire };
    });
    log(`  P${i + 1}: ${JSON.stringify(st)}`);
  }
  await die(`only ${got} of ${want} guest(s) arrived by room code`);
}

log(`\n*** ROOM CODE WORKS — ${PEERS} peers met over a relay, no invite pasted, at ${el()} ***`);
await shutdown();
process.exit(0);
