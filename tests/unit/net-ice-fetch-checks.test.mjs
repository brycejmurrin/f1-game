/* net-ice-fetch-checks.test.mjs — #6836 (#6632 S9): the TURN credentials fetch
 * checks r.ok and refuses a non-https endpoint. js/net/ice.js in a VM. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function boot(turnApi, respond) {
  const fetched = [];
  const sb = {
    console, Object, Array, String, Number, Promise, JSON, Math, Date, Map, Set, Error, URL,
    setTimeout, clearTimeout, AbortController, Uint8Array, btoa, atob,
    localStorage: { getItem: (k) => (k === "apex26.turnApi" ? turnApi : null) },
    Log: { info() {}, warn() {}, error() {} },
    fetch: (url) => { fetched.push(url); return Promise.resolve(respond()); },
  };
  const ctx = vm.createContext(sb);
  for (const f of ["js/net/bytes.js", "js/net/ice.js"]) {   // ice binds NetBytes.fetchBounded at call time
    const code = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var");
    vm.runInContext(code, ctx, { filename: absSrc(f) });
  }
  return { ice: vm.runInContext("NetIce.create()", ctx), fetched };
}
const list = [{ urls: "turn:relay.example:3478", username: "u", credential: "c" }];
const hasTurn = (ice) => ice.iceServers({}).some((e) => String(e.urls).startsWith("turn:"));

test("a normal https credentials endpoint still lands", async () => {
  const h = boot("https://relay.example/creds", () => ({ ok: true, status: 200, json: async () => list }));
  await h.ice.prefetchIce();
  assert.equal(h.fetched.length, 1);
  assert.ok(hasTurn(h.ice));
});

test("an HTTP error response is not parsed into the ICE list", async () => {
  const h = boot("https://relay.example/creds", () => ({ ok: false, status: 500, json: async () => list }));
  await h.ice.prefetchIce();
  assert.equal(hasTurn(h.ice), false, "a 500 body must not become TURN servers");
});

test("a non-https credentials URL is never fetched", async () => {
  const h = boot("http://relay.example/creds", () => ({ ok: true, status: 200, json: async () => list }));
  await h.ice.prefetchIce();
  assert.equal(h.fetched.length, 0);
  assert.equal(hasTurn(h.ice), false);
});

test("an http loopback credentials endpoint (local dev) is still fetched", async () => {
  const h = boot("http://localhost:8787/creds", () => ({ ok: true, status: 200, json: async () => list }));
  await h.ice.prefetchIce();
  assert.equal(h.fetched.length, 1);
  assert.ok(hasTurn(h.ice));
});
