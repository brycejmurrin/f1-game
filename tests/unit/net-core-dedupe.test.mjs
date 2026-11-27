/* net-core-dedupe.test.mjs — #7135 (#6482 rows 8-10): one retry table, one bounded fetch, one hex codec.
 * Pins what the callers did before the dedupe: [400,1200] ms backoffs, 8000/4000 ms aborts with today's error
 * shape, and lowercase wire hex vs uppercase bytesToHex. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const run = (ctx, f, tail = "") =>
  vm.runInContext(read(f).replace(/^const\b/gm, "var") + tail, ctx, { filename: absSrc(f) });

// Fake clock: records every setTimeout ms; fire(ms) runs the timer set for that delay.
function clock() {
  const timers = [];
  return {
    timers,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    fire: (ms) => { const t = timers.find((x) => x.ms === ms && !x.cleared); assert.ok(t, "a " + ms + " ms timer is armed"); t.fn(); },
  };
}
// A fetch that never resolves but honours abort, like a real one.
const hangingFetch = (seen) => (url, init) => new Promise((_, reject) => {
  seen.push({ url, init });
  init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
});

test("the retry table is one frozen [400,1200] list (the data hub reads it as ScriptLoader.retryMs)", () => {
  const sb = vm.createContext({ console, Object, Array, Promise, Map, Set, Math, Date, JSON, String, Number, Error, URL });
  sb.window = sb; sb.document = { head: { appendChild() {} }, createElement: () => ({}) };
  sb.Log = { info() {}, warn() {}, error() {} };
  run(sb, "js/core/script-loader.js");
  const t = vm.runInContext("ScriptLoader.retryMs", sb);
  assert.deepEqual([...t], [400, 1200]);
  assert.ok(Object.isFrozen(t));
});

test("rendezvous aborts a stalled relay at 8000 ms with the timeout result", async () => {
  const c = clock(), seen = [];
  const sb = vm.createContext({
    console, Object, Array, Promise, JSON, String, Number, Error, URL, Uint8Array, Math, Date, TextEncoder, TextDecoder,
    AbortController, crypto: webcrypto, atob, btoa,
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, fetch: hangingFetch(seen),
    localStorage: { getItem: () => "https://relay.example", setItem() {} },
  });
  run(sb, "js/net/bytes.js"); run(sb, "js/net/rendezvous.js");
  const p = vm.runInContext('(async () => { const rv = NetRendezvous; return rv.get(rv.makeCode(), "offer"); })()', sb);
  for (let i = 0; i < 300 && !seen.length; i++) await new Promise((r) => setTimeout(r, 10));   // PBKDF2 runs first
  assert.equal(seen.length, 1);
  c.fire(8000);
  const res = await p;
  assert.deepEqual({ ok: res.ok, error: res.error, message: res.message },
    { ok: false, error: "timeout", message: "The room service timed out." });
});

test("ice aborts a stalled credentials endpoint at 4000 ms and keeps the STUN-only list", async () => {
  const c = clock(), seen = [], warns = [];
  const sb = vm.createContext({
    console, Object, Array, Promise, JSON, String, Number, Error, URL, Uint8Array, Math, Date, Map, Set, AbortController,
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, fetch: hangingFetch(seen),
    localStorage: { getItem: (k) => (k === "apex26.turnApi" ? "https://relay.example/creds" : null) },
    Log: { info() {}, warn: (...a) => warns.push(a.join(" ")), error() {} },
  });
  run(sb, "js/net/bytes.js"); run(sb, "js/net/ice.js");
  const ice = vm.runInContext("NetIce.create()", sb);
  const p = ice.prefetchIce();
  for (let i = 0; i < 50 && !seen.length; i++) await new Promise((r) => setImmediate(r));
  c.fire(4000);
  await p;
  assert.equal(ice.hasRelay(), false);
  assert.ok(warns.join("\n").includes("TURN credential fetch failed, gathering STUN-only: aborted"));
});

test("fetchBounded covers the body read and clears its timer", async () => {
  const c = clock();
  const sb = vm.createContext({ Object, Uint8Array, btoa, atob, String, AbortController, Promise,
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, fetch: async () => ({ ok: true, v: 7 }) });
  run(sb, "js/net/bytes.js");
  const out = await vm.runInContext("NetBytes.fetchBounded('u', { cache: 'no-store' }, 123, async (r) => r.v)", sb);
  assert.equal(out, 7);
  assert.equal(c.timers.length, 1);
  assert.equal(c.timers[0].ms, 123);
  assert.ok(c.timers[0].cleared);
});

test("hex codec: golden vectors, wire hex lowercase, bytesToHex stays uppercase", async () => {
  const NetBytes = vm.runInContext("(function(){" + read("js/net/bytes.js") + ";return NetBytes})()",
    vm.createContext({ Object, Uint8Array, btoa, atob, String, Array, parseInt }), { filename: absSrc("js/net/bytes.js") });
  const digest = new Uint8Array(await webcrypto.subtle.digest("SHA-256",
    new TextEncoder().encode("apex26-ice-restart|pwdOFFER|pwdANSWER")));
  const oldWire = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");   // the pre-dedupe expression
  assert.equal(NetBytes.bytesToHexLower(digest), oldWire);
  assert.equal(NetBytes.bytesToHexLower(digest).length, 64);
  assert.equal(NetBytes.bytesToHexLower(new Uint8Array([0, 10, 171, 255])), "000aabff");
  assert.equal(NetBytes.bytesToHex(new Uint8Array([0, 10, 171, 255])), "000AABFF");
  assert.equal(NetBytes.bytesToHex(new Uint8Array([0, 10, 171, 255]), ":"), "00:0A:AB:FF");
});
