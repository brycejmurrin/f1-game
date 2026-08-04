#!/usr/bin/env node
// rtc-e2e-3p.mjs — THREE peers, over real WebRTC, in one room.
//
//   node tools/rtc-e2e-3p.mjs
//
// The two-peer harness next door proves the handshake and that two people can
// see each other drive. This proves the thing that is genuinely new and that
// NOTHING else in the repo can reach: a room with more than two people in it.
//
// Why it has to exist. js/net/nostr.js's exchange() has no automated coverage
// at all, and cannot get any from the existing rigs — the loopback transport
// has no SDP, and the lobby specs deliberately swap in a fake transport because
// a real RTCPeerConnection never finishes ICE in a sandboxed CI browser. So
// every "65/65" on the multi-peer work says only that nothing ELSE broke. The
// claim "four players can race" was, until this file, untested.
//
// What it actually checks, in order:
//   1. the host can mint a SECOND invite without dropping the first guest —
//      the single line (teardown() in newTransport) that used to make that
//      impossible;
//   2. all three sessions come up;
//   3. THE RELAY: guest B and guest C have no connection to each other, so if
//      B can see C at all, it is only because the host forwarded it. That is
//      the whole star topology in one assertion, and it is the one thing a
//      two-peer test can never show.
//
// Not in any npm group, same as its sibling: it takes minutes and depends on
// the machine's network stack. Exit 0 = three peers racing, each seeing the
// other two.
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PORT = 4468;                       // not 4467 — so it can run beside the 2-peer one
const alive = async () => {
  try { return (await fetch(`http://127.0.0.1:${PORT}/version.json`)).ok; } catch (e) { return false; }
};
const adopted = await alive();
const srv = adopted ? null : spawn("python3", ["-m", "http.server", String(PORT)], { stdio: "ignore" });
const stopSrv = () => { if (srv) srv.kill(); };
let up = adopted;
for (let i = 0; i < 40 && !up; i++) {
  up = await alive();
  if (!up) await new Promise((r) => setTimeout(r, 250));
}
console.log("server up:", up, adopted ? "(adopted an existing one)" : "");
if (!up) { stopSrv(); process.exit(1); }
const log = (...a) => console.log(...a);

// Three pages means two of them are always background tabs, and Chromium
// throttles a background tab's rAF to a crawl. Fatal and not obviously so: the
// game loop pumps the transport, so a throttled page stops draining its inbox
// and the session times out — reading exactly like a network failure.
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=CalculateNativeWinOcclusion",
  ],
});
const mk = async (name) => {
  const c = await b.newContext({ viewport: { width: 844, height: 390 } });
  const p = await c.newPage();
  p.on("pageerror", (e) => log(`  [${name} pageerror]`, String(e).slice(0, 160)));
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForFunction(() => window.__apex != null, { timeout: 90000 });
  // THREE software-rendered racing games on one box starve each other's game
  // loop well below 1 Hz, and the game loop is what pumps the transport.
  // headless() skips render() only — physics, netPlay.tick and the countdown
  // all still run. The wire is what is under test, not the pixels.
  await p.evaluate(() => window.__apex.headless(true));
  return p;
};
const A = await mk("A"), B = await mk("B"), C = await mk("C");
log("three pages booted");

const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
const die = async (msg) => { log(`\n*** ${msg} ***`); await b.close(); stopSrv(); process.exit(1); };

// Distinct seats, so nothing is decided by the seat-clash rule and a car can be
// told apart by who is driving it. Teams.LIST: 1 = Ferrari, 3 = Red Bull,
// 6 = Haas.
const seat = async (p, team, driver) => p.evaluate(([t, d]) => {
  localStorage.setItem("apex26.team", JSON.stringify(t));
  localStorage.setItem("apex26.driver", JSON.stringify(d));
  location.reload();
}, [team, driver]);
await Promise.all([seat(A, 1, 0), seat(B, 3, 0), seat(C, 6, 0)]);
for (const p of [A, B, C]) {
  await p.waitForFunction(() => window.__apex != null, { timeout: 90000 });
  await p.evaluate(() => window.__apex.headless(true));
}
log("seated: A ferrari:0, B redbull:0, C haas:0");

// ---- guest 1 -------------------------------------------------------------
const inv1 = await A.evaluate(() => window.__apex.lobbyHost());
if (!inv1.ok) await die(`host invite failed: ${JSON.stringify(inv1)}`);
log(el(), "invite 1 len=", inv1.code.length);

const ans1 = await B.evaluate((c) => window.__apex.lobbyJoin(c), inv1.code);
if (!ans1.ok) await die(`B could not answer: ${JSON.stringify(ans1)}`);
await A.evaluate((c) => window.__apex.lobbyAccept(c), ans1.code);
log(el(), "B accepted");

const guests = async () => (await A.evaluate(() => window.__apex.lobby())).guests || 0;
for (let i = 0; i < 30 && (await guests()) < 1; i++) await new Promise((r) => setTimeout(r, 2000));
if ((await guests()) < 1) await die("B never connected");
log(el(), "B is in — guests =", await guests());

// ---- guest 2: the part that could not happen before ----------------------
// If this drops B, the whole C.2a change is wrong: newTransport() used to call
// teardown() on every mint, which closed the connection already made.
const inv2 = await A.evaluate(() => window.__apex.lobbyInviteAnother());
if (!inv2.ok) await die(`second invite failed: ${JSON.stringify(inv2)}`);
log(el(), "invite 2 len=", inv2.code.length);
if ((await guests()) < 1) await die("minting a second invite DROPPED the first guest");
log(el(), "first guest survived the second invite");

const ans2 = await C.evaluate((c) => window.__apex.lobbyJoin(c), inv2.code);
if (!ans2.ok) await die(`C could not answer: ${JSON.stringify(ans2)}`);
await A.evaluate((c) => window.__apex.lobbyAccept(c), ans2.code);
log(el(), "C accepted");

for (let i = 0; i < 30 && (await guests()) < 2; i++) await new Promise((r) => setTimeout(r, 2000));
if ((await guests()) < 2) await die(`only ${await guests()} guest(s) connected, wanted 2`);
log(el(), `\n*** THREE PEERS IN ONE ROOM at ${el()} ***`);

// ---- race ----------------------------------------------------------------
await Promise.all([A, B, C].map((p) => p.evaluate(() => window.__apex.lobbyReady(true))));
await A.evaluate(() => window.__apex.lobbyStart());
log(el(), "start pressed");

const upNow = async (p) => (await p.evaluate(() => window.__apex.net())).active;
const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  const [a, b2, c] = await Promise.all([upNow(A), upNow(B), upNow(C)]);
  log(`${el()} active: A=${a} B=${b2} C=${c}`);
  if (a && b2 && c) break;
  await new Promise((r) => setTimeout(r, 3000));
}
const [a0, b0, c0] = await Promise.all([upNow(A), upNow(B), upNow(C)]);
if (!(a0 && b0 && c0)) await die(`not every peer got a session: A=${a0} B=${b0} C=${c0}`);

log(`${el()} waiting out the countdown, then driving all three…`);
await Promise.all([A, B, C].map((p) => p.evaluate(() => window.__apex.setInput({ throttle: true, steer: 0 }))));

// Each peer's own car, and EVERY rival it holds — keyed by driverId, which is
// the one name all three screens agree on. cars[] index is not comparable
// across peers, which is the whole reason wireId/driverId exist.
const read = (p) => p.evaluate(() => {
  const A2 = window.__apex, n = A2.net();
  const mine = A2.carAt(n.localId) || {};
  const rivals = {};
  for (const r of (n.remotes || [])) {
    const c = A2.carAt(r.id) || {};
    rivals[r.driverId] = { s: +(c.s || 0).toFixed(1), speed: +(c.speed || 0).toFixed(1) };
  }
  return {
    role: n.role, driverId: mine.driverId,
    mine: { s: +(mine.s || 0).toFixed(1), speed: +(mine.speed || 0).toFixed(1) },
    rivals,
  };
});
let ra, rb, rc;
for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  [ra, rb, rc] = await Promise.all([read(A), read(B), read(C)]);
  log(`${el()} A ${JSON.stringify(ra)}`);
  log(`${el()} B ${JSON.stringify(rb)}`);
  log(`${el()} C ${JSON.stringify(rc)}`);
}

// Same tolerance and reasoning as the two-peer harness: a rival drawn ~100 ms
// in the past is legitimately ~10 m behind where it says it is, and the clocks
// agree only to within the RTT. Loose enough not to flake, tight enough that a
// car stuck on the grid or never replicated fails outright.
const TOL_M = 40;
const sees = (viewer, targetId, targetS) => {
  const r = viewer.rivals[targetId];
  return !!r && Math.abs(r.s - targetS) < TOL_M && r.speed > 5;
};
const moving = ra.mine.speed > 5 && rb.mine.speed > 5 && rc.mine.speed > 5;

// THE RELAY. B and C have no connection to each other — every peer holds one
// RTCPeerConnection to the HOST and nothing else. So B seeing C at all is only
// possible because the host forwarded C's state, and this pair of lines is the
// entire star topology under test. A two-peer harness cannot express it.
const bSeesC = sees(rb, rc.driverId, rc.mine.s);
const cSeesB = sees(rc, rb.driverId, rb.mine.s);
const aSeesBoth = sees(ra, rb.driverId, rb.mine.s) && sees(ra, rc.driverId, rc.mine.s);

log(`\nall three driving:            ${moving}`);
log(`host sees both guests:        ${aSeesBoth}`);
log(`guest B sees guest C:         ${bSeesC}   <- only possible via the host relay`);
log(`guest C sees guest B:         ${cSeesB}   <- likewise`);

const playing = moving && aSeesBoth && bSeesC && cSeesB;
log(playing
  ? `\n*** THREE PEERS RACING, GUESTS SEEING EACH OTHER THROUGH THE HOST at ${el()} ***`
  : `\n*** connected, but not racing correctly ***`);
await b.close(); stopSrv();
process.exit(playing ? 0 : 1);
