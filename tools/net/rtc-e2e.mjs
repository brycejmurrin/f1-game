#!/usr/bin/env node
// rtc-e2e.mjs — a REAL WebRTC handshake between two pages.
// @doc A REAL WebRTC handshake between two pages (`npm run rtc:e2e`) — the one path the loopback transport cannot cover.
// @skill multiplayer-debug
//
//   node tools/net/rtc-e2e.mjs
//
// This covers the one path nothing else in the repo can: tests/unit/net-*.test.mjs
// run over the loopback transport, which has no SDP at all, and
// tests/specs/multiplayer-lobby.spec.js deliberately swaps in a fake transport
// because a real RTCPeerConnection never finishes ICE gathering in a sandboxed
// CI browser. So the offer/answer exchange, ICE negotiation and the two
// DataChannels actually opening were, until this existed, entirely unverified.
//
// It is NOT part of any npm test group, on purpose: it takes minutes on a
// loaded box (the invite alone can take 60 s here) and it depends on the
// machine's own network stack. Run it by hand after touching js/net/handshake.js
// or js/net/transport.js.
//
// It drives __apex.lobbyHost/lobbyJoin/lobbyAccept rather than clicking the
// lobby — click actionability fights the ~25 s the handshake genuinely takes,
// which would test the buttons rather than the wire. The buttons have their own
// spec.
//
// Exit 0 = a session came up on BOTH peers.
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
const PORT = 4467;
const alive = async () => {
  try { return (await fetch(`http://127.0.0.1:${PORT}/version.json`)).ok; } catch (e) { return false; }
};
// A previous run killed with SIGKILL leaves its server behind, and spawning a
// second one on the same port fails silently — the fetch below then succeeds
// against the ORPHAN and the run looks fine until shutdown() kills nothing.
// Adopt an already-listening server instead of racing it.
const adopted = await alive();
if (!adopted) await startStaticServer(ROOT, { port: PORT });
// Poll until it actually answers, rather than hoping a fixed sleep was enough.
let up = adopted;
for (let i = 0; i < 40 && !up; i++) {
  up = await alive();
  if (!up) await new Promise((r) => setTimeout(r, 250));
}
console.log("server up:", up, adopted ? "(adopted an existing one)" : "");
if (!up) { await shutdown(); process.exit(1); }
const log = (...a) => console.log(...a);

// Two pages in one browser means one of them is always the background tab, and
// Chromium throttles a background tab's rAF to a crawl. That is fatal here and
// not obviously so: the game loop is what pumps the transport, so a throttled
// page stops draining its receive inbox, stops answering pings, and the session
// times out 2.5 s later. It reads exactly like a network failure.
const b = await launchChromium({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=CalculateNativeWinOcclusion",
  ],
});
const mk = async () => {
  const c = await b.newContext({ viewport: { width: 844, height: 390 } });
  const p = await c.newPage();
  p.on("pageerror", (e) => log("  [pageerror]", String(e).slice(0, 160)));
  // "load" waits for every asset (5 MB of JS + WebGL init); __apex being
  // present is the real readiness signal, same as the Playwright specs use.
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForFunction(() => window.__apex != null, null, { timeout: 90000 });
  // Two software-rendered (SwiftShader) racing games on one box starve each
  // other's game loop down to well under 1 Hz — and the game loop is what pumps
  // the transport, so the session times out after 2.5 s of not being pumped and
  // it reads as a network failure. headless() skips render() only; physics,
  // netPlay.tick and the countdown all still run. The wire is what is under
  // test here, not the pixels.
  await p.evaluate(() => window.__apex.headless(true));
  return p;
};
const A = await mk(), B = await mk();
log("both pages booted");

const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";

const hostRes = await A.evaluate(() => window.__apex.lobbyHost());
log(el(), "host invite:", hostRes.ok ? `ok len=${hostRes.code.length}` : JSON.stringify(hostRes));
if (!hostRes.ok) { await shutdown(); process.exit(1); }

const joinRes = await B.evaluate((c) => window.__apex.lobbyJoin(c), hostRes.code);
log(el(), "guest answer:", joinRes.ok ? `ok len=${joinRes.code.length}` : JSON.stringify(joinRes));
if (!joinRes.ok) { await shutdown(); process.exit(1); }

const accRes = await A.evaluate((c) => window.__apex.lobbyAccept(c), joinRes.code);
log(el(), "host accepted:", JSON.stringify(accRes).slice(0, 120));

const deadline = Date.now() + 90000;
let ok = false;
while (Date.now() < deadline) {
  const [la, lb, na, nb] = await Promise.all([
    A.evaluate(() => window.__apex.lobby()), B.evaluate(() => window.__apex.lobby()),
    A.evaluate(() => window.__apex.net()),   B.evaluate(() => window.__apex.net()),
  ]);
  log(`${el()}  A wire=${JSON.stringify(la.wire)} active=${na.active} | B wire=${JSON.stringify(lb.wire)} active=${nb.active}`);
  if (na.active && nb.active) {
    ok = true;
    log(`\n*** REAL WebRTC SESSION UP at ${el()} ***`);
    log("A:", JSON.stringify(na)); log("B:", JSON.stringify(nb));
    break;
  }
  await new Promise((r) => setTimeout(r, 3000));
}
if (!ok) {
  log(`\n*** NO SESSION after 90s ***`);
  await shutdown();
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Connected is not the same as PLAYING. Everything above proves the handshake;
// this proves the thing the handshake is FOR — that both peers are in the same
// race and each one can see the other actually driving.
//
// Both cars are given throttle and left to run on real rAF (no step(), no
// virtual clock — this is the one harness where the real loop is the point).
// Then each peer is asked where it thinks the RIVAL is, and that is compared
// against where the rival says IT is. Agreement to within a few metres is the
// whole replication path working end to end: publish -> wire -> clock sync ->
// interpolation buffer -> poseRemote.
// ---------------------------------------------------------------------------
const raceUp = async (p) => p.evaluate(() => {
  const n = window.__apex.net();
  return { active: n.active, role: n.role, localId: n.localId, remoteId: n.remoteId,
           cars: (window.__apex.cars() || []).length };
});
const ra = await raceUp(A), rb = await raceUp(B);
log(`\n${el()} race: A ${JSON.stringify(ra)}\n${el()} race: B ${JSON.stringify(rb)}`);
if (!ra.cars || !rb.cars) {
  log("*** neither peer got onto a track — the lobby did not start the race ***");
  await shutdown(); process.exit(1);
}

// Lights-out is armed ~2.5 s ahead by hostStart(); give the countdown time to
// run out before expecting either car to move.
log(`${el()} waiting out the countdown, then driving both cars…`);
await Promise.all([A, B].map((p) => p.evaluate(() => window.__apex.setInput({ throttle: true, steer: 0 }))));

// Each peer's own car, and the rival as that peer sees it. Sampled REPEATEDLY,
// because the interesting failures here are transitions — a session that comes
// up and then times out, a countdown that never releases — and a single
// snapshot at the end cannot tell those apart from "never worked".
const readPair = (p) => p.evaluate(() => {
  const n = window.__apex.net();
  const mine = window.__apex.carAt(n.localId) || {};
  const rival = n.remoteId >= 0 ? (window.__apex.carAt(n.remoteId) || {}) : {};
  return {
    role: n.role, active: n.active, reason: n.reason, buffered: n.buffered,
    localId: n.localId, remoteId: n.remoteId, startPending: n.startPending,
    rtt: n.net ? Math.round(n.net.rtt) : null,
    synced: n.net ? n.net.synced : null,
    queued: n.net && window.__apex.lobby().wire ? window.__apex.lobby().wire.queued : null,
    mine: { s: +(mine.s || 0).toFixed(1), speed: +(mine.speed || 0).toFixed(1), lap: mine.lap },
    rival: { s: +(rival.s || 0).toFixed(1), speed: +(rival.speed || 0).toFixed(1), lap: rival.lap },
  };
});
let pa = null, pb = null;
for (let i = 0; i < 8; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  [pa, pb] = await Promise.all([readPair(A), readPair(B)]);
  log(`${el()} A ${JSON.stringify(pa)}`);
  log(`${el()} B ${JSON.stringify(pb)}`);
}

// A rival drawn ~100 ms in the past at racing speed is legitimately ~10 m
// behind where it says it is, and the two browsers' clocks are only agreed to
// within the RTT. 40 m is loose enough not to be flaky and tight enough that a
// car stuck on the grid, posed at the wrong slot, or never replicated at all
// fails it outright.
const TOL_M = 40;
const moving = pa.mine.speed > 5 && pb.mine.speed > 5;
const seesB = Math.abs(pa.rival.s - pb.mine.s) < TOL_M && pa.rival.speed > 5;
const seesA = Math.abs(pb.rival.s - pa.mine.s) < TOL_M && pb.rival.speed > 5;
log(`\nboth cars driving:        ${moving}`);
log(`A sees B where B says:    ${seesB}  (A thinks s=${pa.rival.s}, B says s=${pb.mine.s})`);
log(`B sees A where A says:    ${seesA}  (B thinks s=${pb.rival.s}, A says s=${pa.mine.s})`);

const playing = moving && seesB && seesA;
log(playing
  ? `\n*** TWO PEERS RACING EACH OTHER OVER REAL WebRTC at ${el()} ***`
  : `\n*** connected, but not racing correctly ***`);
await shutdown();
process.exit(playing ? 0 : 1);
