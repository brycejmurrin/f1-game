// R8 N9: an error body of literal "null" is a LEGAL JSON parse whose .detail
// read used to throw a TypeError out of fetchOnce — an error carrying no
// .status and no "HTTP 401"/"HTTP 403" text, which let a lockout serve stale
// cache past the refusal in request(). The guard is `j && (j.detail||j.error)`.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const apiSource = await readFile(new URL("../../js/data/api.js", import.meta.url), "utf8");

function lockoutHarness(status, body) {
  const url = "https://api.openf1.org/v1/weather?session_key=7";
  const key = "apex26.api." + url;
  const stale = JSON.stringify({ t: 1, data: [{ rainfall: 99 }] });
  const context = vm.createContext({
    fetch: async () => ({
      ok: false, status,
      headers: { get: () => null },
      text: async () => body,
    }),
    AbortController,
    localStorage: {
      length: 1,
      getItem: (k) => k === key ? stale : null,
      setItem() {}, key: () => key, removeItem() {},
    },
    Date, setTimeout, clearTimeout,
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.__api=F1API", context);
  return context.__api;
}

test('a "null" error body cannot dodge the 403 stale-cache refusal', async () => {
  const api = lockoutHarness(403, "null");
  await assert.rejects(api.weather(7, 0), (err) => {
    // The generic HTTP path must fire — with its status attached — instead of
    // a statusless TypeError from reading .detail off null.
    assert.equal(err.status, 403);
    assert.match(err.message, /HTTP 403/);
    return true;
  });
});

test('a "null" error body cannot dodge the 401 stale-cache refusal', async () => {
  const api = lockoutHarness(401, "null");
  await assert.rejects(api.weather(7, 0), (err) => {
    assert.equal(err.status, 401);
    assert.match(err.message, /HTTP 401/);
    return true;
  });
});

test("a structured detail body still surfaces its own message and status", async () => {
  const api = lockoutHarness(403, JSON.stringify({ detail: "Not authenticated" }));
  await assert.rejects(api.weather(7, 0), (err) => {
    assert.equal(err.status, 403);
    assert.match(err.message, /Not authenticated/);
    return true;
  });
});

test("a cache entry stamped in the future (clock stepped back) is not served as fresh", async () => {
  // (now - t) < ttl is trivially true for a negative age, so an entry written
  // before the device clock was stepped back read as fresh for as long as the
  // skew lasted. The sweep has the same blind spot (fixed alongside).
  const url = "https://api.openf1.org/v1/weather?session_key=7";
  const key = "apex26.api." + url;
  const future = JSON.stringify({ t: Date.now() + 3_600_000, data: [{ rainfall: 99 }] });
  let fetched = 0;
  const context = vm.createContext({
    fetch: async () => { fetched++; return { ok: true, status: 200, headers: { get: () => null }, json: async () => [{ rainfall: 1 }], text: async () => JSON.stringify([{ rainfall: 1 }]) }; },
    AbortController,
    localStorage: { length: 1, getItem: (k) => (k === key ? future : null), setItem() {}, key: () => key, removeItem() {} },
    Date, setTimeout, clearTimeout,
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.__api=F1API", context);
  const out = await context.__api.weather(7, 60_000);
  assert.equal(fetched, 1, "the future-stamped entry must not satisfy the TTL");
  assert.equal(out.rainfall, 1, "the live answer wins (weather() maps the last row to an object)");
});
