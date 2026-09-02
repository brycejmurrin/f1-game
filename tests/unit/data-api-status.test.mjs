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

// ---- net+data hunt 2026-09-02 §Round 2: hub close aborts nothing / Retry-After
// capped at 25 s / quota purge by age not size --------------------------------

const hubSource = await readFile(new URL("../../js/data/hub.js", import.meta.url), "utf8");

// fetch that never resolves, exposes its AbortSignal, and can be told to
// resolve late; timers are collected so the 400 ms pacing gap is fired by hand.
function cancelHarness() {
  const calls = [], timers = [];
  let resolveFirst = null;
  const context = vm.createContext({
    fetch(url, init) {
      calls.push({ url: String(url), signal: init && init.signal });
      if (calls.length === 1) {
        return new Promise((resolve, reject) => {
          resolveFirst = resolve;
          init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        });
      }
      return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: async () => [{ rainfall: 3 }] });
    },
    AbortController,
    localStorage: { length: 0, getItem: () => null, setItem() {}, key: () => null, removeItem() {} },
    Date,
    // The 15 s fetch deadline is not under test: collecting it would let
    // fireTimers() abort a controller whose fetch already answered.
    setTimeout(fn, ms) { if (ms === 15000) return 0; timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.__api=F1API", context);
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  const fireTimers = async () => { while (timers.length) { timers.shift().fn(); await settle(); } };
  return { api: context.__api, calls, timers, settle, fireTimers, resolveFirst: () => resolveFirst };
}

test("cancelAll() aborts the in-flight fetch, drops the queued one, and frees the serialized queue", async () => {
  const h = cancelHarness();
  const inFlight = h.api.weather(1, 0).catch((e) => e);     // on the wire, never answers
  const queued = h.api.positions(1, 0).catch((e) => e);     // waiting behind it in the queue
  await h.settle();
  assert.equal(h.calls.length, 1, "the second request is serialized behind the first");
  assert.equal(h.calls[0].signal.aborted, false);

  const aborted = h.api.cancelAll();
  assert.equal(aborted, 1, "one controller was live");
  assert.equal(h.calls[0].signal.aborted, true, "the live fetch is aborted, not left to its 15 s timeout");
  const [e1, e2] = [await inFlight, await queued];
  assert.equal(e1.cancelled, true, "aborted request rejects with the cancelled shape");
  assert.equal(e2.cancelled, true, "queued request rejects without ever fetching");
  assert.equal(h.calls.length, 1, "the queued request never hit the network");

  // A request made AFTER the cancel is not stuck behind the dead ones.
  const fresh = h.api.weather(2, 0);
  await h.settle();
  await h.fireTimers();   // the 400 ms pacing gap, if any
  assert.equal(h.calls.length, 2, "a post-cancel request reaches the network");
  assert.equal(h.calls[1].signal.aborted, false, "a new controller, not the aborted one");
  assert.equal((await fresh).rainfall, 3);

  // The hub's close() is where this is wired — a source pin, since hub.js needs a DOM.
  const closeBody = /function close\(\) \{[\s\S]*?\n  \}\n/.exec(hubSource)[0];
  assert.match(closeBody, /F1API\.cancelAll\(\)/, "DataHub.close() must call F1API.cancelAll()");
  assert.match(closeBody, /for \(const k in gen\)/, "close() bumps every tab generation so the cancelled rejections are ignored");
});

// 429 fixture: `retryAfter` is the header value; timers are collected so the
// backoff sleep is observable instead of slept.
function retryHarness(retryAfter) {
  const timers = [];
  let calls = 0;
  const context = vm.createContext({
    fetch: async () => {
      calls++;
      return { ok: false, status: 429, headers: { get: (k) => (/retry-after/i.test(k) ? retryAfter : null) }, text: async () => "" };
    },
    AbortController,
    localStorage: { length: 0, getItem: () => null, setItem() {}, key: () => null, removeItem() {} },
    Date,
    setTimeout(fn, ms) { if (ms === 15000) return 0; timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},   // skip the fetch deadline
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.__api=F1API", context);
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  return { api: context.__api, timers, calls: () => calls, settle };
}

test("Retry-After is honoured as sent up to 90 s; longer than that fails fast on the first 429", async () => {
  // 60 s (the value OpenF1 commonly sends) used to be clamped to 25 s, so both
  // retries fired INSIDE the window — three 429s for one answer.
  const sixty = retryHarness("60");
  let parkedErr = null;
  sixty.api.weather(7, 0).catch((e) => { parkedErr = e; });   // parked on a fake timer that never fires
  await sixty.settle();
  assert.equal(sixty.timers.length, 1, "one backoff sleep is scheduled");
  assert.equal(sixty.timers[0].ms, 60000, "the sleep is the server's 60 s, not the 25 s cap");
  sixty.timers.shift().fn();
  await sixty.settle();
  while (sixty.timers.length && sixty.timers[0].ms < 1000) { sixty.timers.shift().fn(); await sixty.settle(); }   // the 400 ms pacing gap
  assert.equal(sixty.calls(), 2, "the retry fired after the full window");
  assert.equal(sixty.timers.length && sixty.timers[0].ms, 60000, "the second backoff honours the header too");
  assert.equal(parkedErr, null, "the parked request never rejected while its backoff timer was pending");

  // Past the ceiling nothing is retried: one request, the existing error shape.
  const twoMin = retryHarness("120");
  const err = await twoMin.api.weather(8, 0).catch((e) => e);
  assert.equal(twoMin.calls(), 1, "no retry against a 120 s ask");
  assert.equal(twoMin.timers.length, 0, "no backoff timer either");
  assert.equal(err.status, 429);
  assert.match(err.message, /HTTP 429/);
  assert.equal(err.retryAfterMs, 120000, "the server's ask is reported uncapped");
});

test("the quota purge evicts telemetry bodies largest-first before any small schedule/standings entry", async () => {
  // purgeOldestCache(16) by timestamp alone: fourteen small fresh entries plus
  // four huge car_data/location laps stamped NEWEST → the old order evicted
  // every small entry and kept two of the multi-KB laps that caused the quota
  // error in the first place.
  const now = Date.now();
  const store = new Map();
  const entry = (t, data) => JSON.stringify({ t, data });
  const smallKeys = [];
  for (let i = 0; i < 14; i++) {
    const k = "apex26.api.https://api.jolpi.ca/ergast/f1/2026/" + (i % 2 ? "driverstandings" : "schedule") + i + ".json";
    smallKeys.push(k);
    store.set(k, entry(now - (14 - i) * 3_600_000, { i }));   // i=13 is the freshest
  }
  const big = "x".repeat(40_000);
  const telemKeys = [
    "apex26.api.https://api.openf1.org/v1/car_data?session_key=1&driver_number=1&date>=a&date<=b",
    "apex26.api.https://api.openf1.org/v1/location?session_key=1&driver_number=1&date>=a&date<=b",
    "apex26.api.https://api.openf1.org/v1/car_data?session_key=2&driver_number=4&date>=a&date<=b",
    "apex26.api.https://api.openf1.org/v1/location?session_key=2&driver_number=4&date>=a&date<=b",
  ];
  telemKeys.forEach((k, i) => store.set(k, entry(now - 60_000 * (i + 1), big + i)));
  let quotaThrows = 1;
  const context = vm.createContext({
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => [{ rainfall: 1 }] }),
    AbortController,
    localStorage: {
      get length() { return store.size; },
      key: (i) => [...store.keys()][i] ?? null,
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem(k, v) { if (quotaThrows-- > 0) throw new Error("QuotaExceededError"); store.set(k, String(v)); },
      removeItem: (k) => { store.delete(k); },
    },
    Date, setTimeout, clearTimeout,
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.__api=F1API", context);
  await context.__api.weather(9, 60_000);

  for (const k of telemKeys) assert.equal(store.has(k), false, "telemetry body survived the purge: " + k);
  assert.equal(store.has(smallKeys[13]), true, "the freshest schedule entry must survive");
  assert.equal(store.has(smallKeys[12]), true, "the second-freshest standings entry must survive");
  assert.equal(store.has("apex26.api.https://api.openf1.org/v1/weather?session_key=9"), true, "the new entry landed after the purge");
});
