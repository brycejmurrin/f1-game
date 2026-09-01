#!/usr/bin/env node
// nostr-probe.mjs — WHICH RELAYS WILL ACTUALLY CARRY OUR SIGNALLING?
// @doc Which public relays will actually carry our signalling? Probes each and reports.
// @skill multiplayer-debug
//
//   npm i --no-save ws @noble/curves
//   node tools/net/nostr-probe.mjs
//   node tools/net/nostr-probe.mjs wss://a wss://b
//
// WHY THIS EXISTS. The shipped relay list in js/net/nostr.js has been changed
// three times, each on a different piece of reasoning, and every time the
// criterion used was the WRONG one — reachability, popularity, uptime. All six
// of the current list pass every one of those: they resolve, they serve NIP-11,
// they accept a WebSocket, they answer REQ with EVENT and EOSE.
//
// And room codes still do not work, because the criterion that decides it is:
//
//     does this relay ACCEPT AN EPHEMERAL EVENT FROM AN UNKNOWN PUBKEY?
//
// Trystero signs with a key generated per session, so any relay gating on a web
// of trust, a paid account, a whitelist or proof-of-work refuses us forever —
// and refuses us SILENTLY, because a rejection is a NIP-01 OK frame that the
// vendored library turns into a console.warn and nothing more. From the
// outside it is indistinguishable from "nobody joined". A real phone showed
// wellorder answering "blocked: spam not permitted" while every relay in the
// list reported itself healthy.
//
// So this publishes what the game publishes — kind 22xxx, ephemeral, fresh
// key — and records the verdict. A relay belongs in RELAYS if and only if it
// says OK here.
//
// NOT a dependency of the repo: ws and @noble/curves are installed on demand
// with --no-save, same as the TURN and Nostr fixtures next door.
import { createHash } from "node:crypto";

const DEFAULT = [
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://nostr.mom",
  "wss://relay.snort.social",
  "wss://nostr-pub.wellorder.net",
  "wss://relay.mostr.pub",
  // Worth measuring alongside the shipped six — all previously dropped or
  // never tried, and the point of this tool is that reputation decides nothing.
  "wss://relay.damus.io",
  "wss://relay.nostr.bg",
  "wss://nostr.oxtr.dev",
  "wss://relay.nostr.wirednet.jp",
  "wss://nostr.bitcoiner.social",
  "wss://relay.nostrplebs.com",
];

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const RELAYS = args.length ? args : DEFAULT;
const TIMEOUT_MS = 12000;
// The kind Trystero uses. Ephemeral (20000-29999) means relays are not
// expected to store it — which is exactly why a spam filter is the only thing
// standing between us and delivery.
const KIND = 22222;

let WebSocket, schnorr;
try { ({ WebSocket } = await import("ws")); }
catch { console.error("ws is not installed. Run:  npm i --no-save ws"); process.exit(2); }
try { ({ schnorr } = await import("@noble/curves/secp256k1")); }
catch {
  console.error("@noble/curves is not installed. Run:  npm i --no-save @noble/curves");
  console.error("(it is what signs the event — an unsigned one is refused by everyone,");
  console.error(" which would make every relay look hostile.)");
  process.exit(2);
}

const hex = (b) => Buffer.from(b).toString("hex");

// A FRESH KEY PER RUN, deliberately. That is what the game does, and a relay
// that would accept a known pubkey while refusing an unknown one is a relay
// that cannot carry this feature — the whole point is to catch exactly that.
const sk = crypto.getRandomValues(new Uint8Array(32));
const pk = hex(schnorr.getPublicKey(sk));

async function makeEvent() {
  const ev = {
    pubkey: pk,
    created_at: Math.floor(Date.now() / 1000),
    kind: KIND,
    tags: [["x", "apexprobe" + Date.now().toString(36)]],
    content: "apex26 relay probe",
  };
  const serial = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
  ev.id = createHash("sha256").update(serial).digest("hex");
  ev.sig = hex(await schnorr.sign(ev.id, sk));
  return ev;
}

function probe(url, ev) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let ws, settled = false;
    const done = (verdict, detail) => {
      if (settled) return;
      settled = true;
      try { ws && ws.close(); } catch {}
      resolve({ url, verdict, detail: detail || "", ms: Date.now() - t0 });
    };
    const timer = setTimeout(() => done("TIMEOUT", `no verdict in ${TIMEOUT_MS}ms`), TIMEOUT_MS);
    try { ws = new WebSocket(url); } catch (e) { clearTimeout(timer); return done("ERROR", String(e)); }

    ws.on("open", () => ws.send(JSON.stringify(["EVENT", ev])));
    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      // ["OK", <id>, <accepted>, "<reason>"] is the verdict we came for.
      if (msg[0] === "OK" && msg[1] === ev.id) {
        clearTimeout(timer);
        done(msg[2] ? "ACCEPT" : "REJECT", msg[3] || "");
      } else if (msg[0] === "NOTICE") {
        // Some relays answer a refusal as a NOTICE instead of an OK=false.
        clearTimeout(timer);
        done("REJECT", String(msg[1] || "").slice(0, 120));
      }
    });
    ws.on("error", (e) => { clearTimeout(timer); done("ERROR", String(e && e.message || e).slice(0, 120)); });
    ws.on("close", () => { clearTimeout(timer); done("CLOSED", "closed before a verdict"); });
  });
}

const ev = await makeEvent();
console.log(`probing ${RELAYS.length} relays with an ephemeral kind-${KIND} event`);
console.log(`fresh pubkey ${pk.slice(0, 16)}…  (unknown to every relay, exactly as in game)\n`);

const results = await Promise.all(RELAYS.map((u) => probe(u, ev)));
results.sort((a, b) => a.verdict.localeCompare(b.verdict) || a.ms - b.ms);

const pad = Math.max(...results.map((r) => r.url.length));
for (const r of results) {
  const mark = r.verdict === "ACCEPT" ? "  OK  " : r.verdict === "REJECT" ? " REFUSED" : " " + r.verdict;
  console.log(`${mark.padEnd(9)} ${r.url.padEnd(pad)}  ${String(r.ms).padStart(5)}ms  ${r.detail}`);
}

const good = results.filter((r) => r.verdict === "ACCEPT");
console.log(`\n${good.length}/${results.length} will carry our signalling.`);
if (good.length) {
  console.log("\nPaste into RELAYS in js/net/nostr.js:\n");
  console.log("  const RELAYS = [");
  for (const r of good) console.log(`    ${JSON.stringify(r.url)},`);
  console.log("  ];");
}
// A non-zero exit when nothing works, so this is usable as a check and not
// only as something a human reads.
process.exit(good.length ? 0 : 1);
