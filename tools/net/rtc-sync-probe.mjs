#!/usr/bin/env node
// rtc-sync-probe.mjs — DO BOTH PLAYERS GO GREEN AT THE SAME INSTANT, and stay
// on the same race clock? Measured, not reasoned about.
// @doc Two real peers: the lights-out skew between them and the race-clock drift, in ms (`node tools/net/rtc-sync-probe.mjs`).
// @skill multiplayer-debug
//
//   node tools/net/rtc-sync-probe.mjs [--laps=N]
//
// rtc-e2e.mjs proves the handshake and that each peer sees the other where it
// says it is. This answers the timing question those poses cannot: the host
// names ONE lights-out instant (netplay.js nameTheMoment), each guest converts
// it through its clock offset (session.js), game.js derives the countdown from
// it and anchors raceT to it (netGreen). Any error in that chain is a player
// who launches early or late, or whose lap times are compared on a different
// clock — the "5 s behind on the road, classified 5 s ahead" class.
//
// Both pages run in ONE Chromium on ONE box, so Date.now() is a clock they
// genuinely share: the green skew below is measured on it, independent of the
// peers' own offset estimate (which is reported beside it, so the two can be
// compared). Sampling is a 2 ms in-page poll of __apex.info().state, so the
// resolution is a few ms; the evaluate() round trips add a few more to the
// race-clock comparison, which is why those samples are taken from both pages
// in one Promise.all and corrected by the wall-clock gap between them.
//
// Exit 0 = green skew and race-clock drift both within TOL_MS.
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
const PORT = 4468;
const TOL_MS = 60;
const alive = async () => {
  try { return (await fetch(`http://127.0.0.1:${PORT}/version.json`)).ok; } catch (e) { return false; }
};
const adopted = await alive();
if (!adopted) await startStaticServer(ROOT, { port: PORT });
let up = adopted;
for (let i = 0; i < 40 && !up; i++) { up = await alive(); if (!up) await new Promise((r) => setTimeout(r, 250)); }
console.log("server up:", up);
if (!up) { await shutdown(); process.exit(1); }
const log = (...a) => console.log(...a);

const b = await launchChromium({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding", "--disable-features=CalculateNativeWinOcclusion"],
});
const mk = async () => {
  const c = await b.newContext({ viewport: { width: 844, height: 390 } });
  const p = await c.newPage();
  p.on("pageerror", (e) => log("  [pageerror]", String(e).slice(0, 160)));
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForFunction(() => window.__apex != null, null, { timeout: 90000 });
  await p.evaluate(() => window.__apex.headless(true));
  return p;
};
const A = await mk(), B = await mk();
log("both pages booted");
const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
const die = async (why) => { log(`\n*** ${why} ***`); await shutdown(); process.exit(1); };

// ---- lobby: host invites, guest answers, host accepts, both READY, START ----
const inv = await A.evaluate(() => window.__apex.lobbyHost());
if (!inv.ok) await die("host invite failed: " + JSON.stringify(inv));
const ans = await B.evaluate((c) => window.__apex.lobbyJoin(c), inv.code);
if (!ans.ok) await die("guest answer failed: " + JSON.stringify(ans));
const acc = await A.evaluate((c) => window.__apex.lobbyAccept(c), ans.code);
if (!acc.ok) await die("host accept failed: " + JSON.stringify(acc));
const inRoom = async () => ((await A.evaluate(() => window.__apex.lobby())).guests || 0) >= 1;
for (let i = 0; i < 30 && !(await inRoom()); i++) await new Promise((r) => setTimeout(r, 2000));
if (!(await inRoom())) await die("the guest never reached the room");
log(el(), "guest is in the room");
await Promise.all([A, B].map((p) => p.evaluate(() => window.__apex.lobbyReady(true))));
let readyAll = false;
for (let i = 0; i < 20 && !readyAll; i++) {
  const r = await A.evaluate(() => window.__apex.lobbyRoom());
  readyAll = !!(r && r.selfReady && r.peerReady);
  if (!readyAll) await new Promise((z) => setTimeout(z, 1000));
}
if (!readyAll) await die("the host never saw the guest READY");

// The green watcher goes in BEFORE start: a 2 ms poll that stamps the first
// frame in state "race" on both clocks. Installed on both pages first, so
// neither can miss a green that lands while the other is still being set up.
const arm = (p) => p.evaluate(() => {
  window.__sync = { green: null, armedAt: Date.now() };
  const tick = () => {
    const st = window.__apex.info().state;
    if (st === "race") { window.__sync.green = { wall: Date.now(), perf: performance.now() }; return; }
    setTimeout(tick, 2);
  };
  tick();
});
await Promise.all([arm(A), arm(B)]);
const started = await A.evaluate(() => window.__apex.lobbyStart());
log(el(), "start pressed ->", started);
if (started === false) await die("the host refused to start");

// ---- lights out on both ----
const green = (p) => p.evaluate(() => window.__sync.green);
let ga = null, gb = null;
for (let i = 0; i < 90 && !(ga && gb); i++) {
  [ga, gb] = await Promise.all([green(A), green(B)]);
  if (!(ga && gb)) await new Promise((r) => setTimeout(r, 1000));
}
if (!(ga && gb)) await die(`no green on both peers after 90 s (host ${JSON.stringify(ga)}, guest ${JSON.stringify(gb)})`);
const skewMs = gb.wall - ga.wall;   // + = the guest went green AFTER the host
const nets = await Promise.all([A, B].map((p) => p.evaluate(() => { const n = window.__apex.net(); return n.net ? { rtt: n.net.rtt, offset: n.net.offset, synced: n.net.synced } : null; })));
log(`\n${el()} lights out — host at wall ${ga.wall}, guest at wall ${gb.wall}: guest − host = ${skewMs} ms`);
log(`      clock sync: host ${JSON.stringify(nets[0])}  guest ${JSON.stringify(nets[1])}`);

// ---- race clock: sampled together, corrected by the wall gap between reads ----
await Promise.all([A, B].map((p) => p.evaluate(() => window.__apex.setInput({ throttle: true, steer: 0 }))));
const read = (p) => p.evaluate(() => {
  const f = window.__apex.field ? window.__apex.field({ detail: "brief" }) : window.__apex.world();
  return { wall: Date.now(), raceT: f.t, state: f.raceState || window.__apex.info().state };
});
let worst = 0;
const rows = [];
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const [ra, rb] = await Promise.all([read(A), read(B)]);
  // raceT is reported at 10 ms resolution; the two reads land a few ms apart.
  const drift = Math.round((rb.raceT - ra.raceT) * 1000 - (rb.wall - ra.wall));
  worst = Math.max(worst, Math.abs(drift));
  rows.push(drift);
  log(`${el()} raceT host ${ra.raceT.toFixed(2)} guest ${rb.raceT.toFixed(2)} (reads ${rb.wall - ra.wall} ms apart) → guest − host = ${drift} ms`);
}

const ok = Math.abs(skewMs) <= TOL_MS && worst <= TOL_MS;
log(`\ngreen skew ${skewMs} ms (tolerance ±${TOL_MS}); race-clock drift worst ${worst} ms over ${rows.length} samples`);
log(ok ? `\n*** BOTH PEERS ON ONE CLOCK at ${el()} ***` : `\n*** TIMING OUT OF TOLERANCE ***`);
await shutdown();
process.exit(ok ? 0 : 1);
