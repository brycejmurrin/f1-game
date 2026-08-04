#!/usr/bin/env node
// rtc-e2e.mjs — a REAL WebRTC handshake between two pages.
//
//   node tools/rtc-e2e.mjs
//
// This covers the one path nothing else in the repo can: tests/net-*.test.mjs
// run over the loopback transport, which has no SDP at all, and
// tests/multiplayer-lobby.spec.js deliberately swaps in a fake transport
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
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const PORT = 4467;
const srv = spawn("python3", ["-m", "http.server", String(PORT)], { stdio: "ignore" });
srv.on("error", (e) => console.log("[srv error]", String(e)));
srv.on("exit", (c) => console.log("[srv exited]", c));
// Poll until it actually answers, rather than hoping a fixed sleep was enough.
let up = false;
for (let i = 0; i < 40 && !up; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/version.json`); up = r.ok; } catch (e) {}
  if (!up) await new Promise((r) => setTimeout(r, 250));
}
console.log("server up:", up);
if (!up) { srv.kill(); process.exit(1); }
const log = (...a) => console.log(...a);

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const mk = async () => {
  const c = await b.newContext({ viewport: { width: 844, height: 390 } });
  const p = await c.newPage();
  p.on("pageerror", (e) => log("  [pageerror]", String(e).slice(0, 160)));
  // "load" waits for every asset (5 MB of JS + WebGL init); __apex being
  // present is the real readiness signal, same as the Playwright specs use.
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForFunction(() => window.__apex != null, { timeout: 90000 });
  return p;
};
const A = await mk(), B = await mk();
log("both pages booted");

const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";

const hostRes = await A.evaluate(() => window.__apex.lobbyHost());
log(el(), "host invite:", hostRes.ok ? `ok len=${hostRes.code.length}` : JSON.stringify(hostRes));
if (!hostRes.ok) { await b.close(); srv.kill(); process.exit(1); }

const joinRes = await B.evaluate((c) => window.__apex.lobbyJoin(c), hostRes.code);
log(el(), "guest answer:", joinRes.ok ? `ok len=${joinRes.code.length}` : JSON.stringify(joinRes));
if (!joinRes.ok) { await b.close(); srv.kill(); process.exit(1); }

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
if (!ok) log(`\n*** NO SESSION after 90s ***`);
await b.close(); srv.kill();
process.exit(ok ? 0 : 1);
