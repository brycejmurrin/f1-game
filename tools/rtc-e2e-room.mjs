#!/usr/bin/env node
// rtc-e2e-room.mjs — the ROOM CODE path, end to end, against a relay we run.
//
//   npm i --no-save ws
//   node tools/nostr-local.cjs &
//   node tools/rtc-e2e-room.mjs [--peers=3]
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
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PORT = 4474;
const RELAY = (process.argv.find((a) => a.startsWith("--relay=")) || "--relay=ws://127.0.0.1:7448").slice(8);
const PEERS = Number((process.argv.find((a) => a.startsWith("--peers=")) || "--peers=2").slice(8));

const alive = async () => {
  try { return (await fetch(`http://127.0.0.1:${PORT}/version.json`)).ok; } catch (e) { return false; }
};
const adopted = await alive();
const srv = adopted ? null : spawn("python3", ["-m", "http.server", String(PORT)], { stdio: "ignore" });
const stopSrv = () => { if (srv) srv.kill(); };
let up = adopted;
for (let i = 0; i < 40 && !up; i++) { up = await alive(); if (!up) await new Promise((r) => setTimeout(r, 250)); }
if (!up) { stopSrv(); process.exit(1); }
const log = (...a) => console.log(...a);
log("relay:", RELAY, " peers:", PEERS);

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
});
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
const die = async (m) => { log(`\n*** ${m} ***`); await b.close(); stopSrv(); process.exit(1); };

const mk = async (name, teamIdx) => {
  const p = await (await b.newContext({ viewport: { width: 844, height: 390 } })).newPage();
  p.on("pageerror", (e) => log(`  [${name} pageerror]`, String(e).slice(0, 140)));
  // Relay failures surface as console warnings from Trystero and nothing else,
  // so they are worth carrying up here — a silent room is the failure mode.
  p.on("console", (m) => {
    const t = m.text();
    if (/relay failure|rate-limited|WebSocket/i.test(t)) log(`  [${name} relay]`, t.slice(0, 120));
  });
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForFunction(() => window.__apex != null, { timeout: 90000 });
  await p.evaluate(([relay, ti]) => {
    localStorage.setItem("apex26.nostrRelays", JSON.stringify([relay]));
    localStorage.setItem("apex26.team", JSON.stringify(ti));
    localStorage.setItem("apex26.driver", "0");
    location.reload();
  }, [RELAY, teamIdx]);
  await p.waitForFunction(() => window.__apex != null, { timeout: 90000 });
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
if (got < want) await die(`only ${got} of ${want} guest(s) arrived by room code`);

log(`\n*** ROOM CODE WORKS — ${PEERS} peers met over a relay, no invite pasted, at ${el()} ***`);
await b.close(); stopSrv();
process.exit(0);
