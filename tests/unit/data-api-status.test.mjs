// R8 N9: an error body of literal "null" is a LEGAL JSON parse whose .detail
// read used to throw a TypeError out of fetchOnce — an error carrying no
// .status and no "HTTP 401"/"HTTP 403" text, which let a lockout serve stale
// cache past the refusal in request(). The guard is `j && (j.detail||j.error)`.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const apiSource = (await Promise.all(["api-transport", "api"].map((name) =>
  readFile(new URL(`../../js/data/${name}.js`, import.meta.url), "utf8")))).join("\n");

// Own the clock so stalled bodies test the actual 15 s attempt deadline,
// not a shortened timeout or a second timer started after headers.
function bodyFailureHarness({ status = 403, body = "reject", retryAfter = null, controller = true, headersDelay = 0 } = {}) {
  let now = 1_000_000, nextId = 0;
  const timers = new Map(), calls = [], writes = [], lateBodies = [];
  const url = "https://api.openf1.org/v1/weather?session_key=7";
  const key = "apex26.api." + url;
  const stale = JSON.stringify({ t: now - 1000, data: [{ rainfall: 99 }] });
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({
    Date: Clock, AbortController: controller ? AbortController : undefined,
    setTimeout(fn, ms) { const id = ++nextId; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    localStorage: { getItem: (k) => k === key ? stale : null,
      setItem: (k, v) => writes.push({ k, v }), length: 1, key: () => key, removeItem() {} },
    fetch(url, init) {
      calls.push({ url, signal: init && init.signal, at: now });
      if (status === null) return Promise.reject(new TypeError("offline"));
      const read = () => {
        if (body === "throw") throw new TypeError("body threw");
        if (body === "reject") return Promise.reject(new TypeError("body rejected"));
        if (body === "primitive") return Promise.reject("unreadable body");
        if (body === "frozen") return Promise.reject(Object.freeze(new Error("frozen body")));
        return new Promise((resolve, reject) => {
          lateBodies.push({ resolve, reject });
          if (body === "abort" && init) init.signal.addEventListener("abort", () =>
            reject(Object.assign(new Error("body aborted"), { name: "AbortError" })));
        });
      };
      const response = { ok: status === 200, status,
        headers: { get: () => retryAfter }, text: read, json: read };
      return headersDelay ? new Promise((resolve) =>
        context.setTimeout(() => resolve(response), headersDelay)) : Promise.resolve(response);
    },
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.api=F1API", context);
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  async function advance(ms) {
    const target = now + ms;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      timers.delete(next[0]); now = next[1].at; next[1].fn(); await flush();
    }
    now = target; await flush();
  }
  return { api: context.api, calls, writes, timers, lateBodies, flush, advance };
}

for (const status of [401, 403]) {
  for (const body of ["reject", "throw", "stall", "abort"]) {
    test(`HTTP ${status} with a ${body} error body refuses cached weather`, async () => {
      const h = bodyFailureHarness({ status, body });
      let settled = false;
      const result = h.api.weather(7, 0).then(
        (value) => { settled = true; return { value }; },
        (error) => { settled = true; return { error }; });
      await h.flush();
      if (body === "stall" || body === "abort") {
        await h.advance(14999);
        assert.equal(settled, false, "body reading shares the original deadline");
        await h.advance(1);
        assert.equal(h.calls[0].signal.aborted, true);
      }
      const out = await result;
      assert.equal(out.value, undefined, "the cached rainfall must not hide a lockout");
      assert.equal(out.error.status, status);
      assert.equal(out.error.retryAfterMs, 0);
      if (body === "stall" || body === "abort") assert.match(out.error.message, /timed out/);
      assert.equal(out.error.cancelled, undefined, "a deadline is not user cancellation");
      assert.equal(h.calls.length, 1, "authentication failures never retry");
      assert.equal(h.timers.size, 0, "the deadline is reclaimed");
      assert.equal(h.api.cancelAll(), 0, "no controller leaks after failure");
      assert.equal(h.writes.length, 0, "the cache is untouched");
    });
  }
}

test("known error status survives a stalled body even without AbortController", async () => {
  const h = bodyFailureHarness({ controller: false });
  const result = h.api.weather(7, 0).catch((error) => error);
  await h.flush();
  assert.equal((await result).status, 403);
  assert.equal(h.timers.size, 0);
  const stalled = bodyFailureHarness({ controller: false, body: "stall" });
  const pending = stalled.api.weather(7, 0).catch((error) => error);
  await stalled.flush(); await stalled.advance(15000);
  assert.equal((await pending).status, 403);
  assert.equal(stalled.timers.size, 0);
});

test("headers arriving late do not restart or extend the attempt deadline", async () => {
  const h = bodyFailureHarness({ status: 401, body: "stall", headersDelay: 14000 });
  let settled = false;
  const pending = h.api.weather(7, 0).catch((error) => { settled = true; return error; });
  await h.flush(); await h.advance(14000);
  assert.equal(h.lateBodies.length, 1, "headers arrived and body consumption began");
  await h.advance(999);
  assert.equal(settled, false);
  await h.advance(1);
  const error = await pending;
  assert.equal(error.status, 401);
  assert.match(error.message, /timed out/);
  h.lateBodies[0].resolve('{"detail":"late detail"}');
  await h.flush();
  assert.match(error.message, /timed out/, "late body completion cannot mutate the delivered timeout");
  assert.equal(h.calls.length, 1);
  assert.equal(h.writes.length, 0);
  assert.equal(h.timers.size, 0);
});

test("primitive and frozen body rejections retain response metadata", async () => {
  for (const body of ["primitive", "frozen"]) {
    const h = bodyFailureHarness({ body });
    const error = await h.api.weather(7, 0).catch((error) => error);
    assert.equal(error.status, 403);
    assert.equal(error.retryAfterMs, 0);
    assert.equal(h.timers.size, 0);
  }
});

test("cancelAll during an error body drops cached and queued weather and ignores late completion", async () => {
  const h = bodyFailureHarness({ body: "stall", status: 429, retryAfter: "60" });
  const first = h.api.weather(7, 0).catch((error) => error);
  const queued = h.api.weather(8, 0).catch((error) => error);
  await h.flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.api.cancelAll(), 1);
  for (const error of await Promise.all([first, queued])) assert.equal(error.cancelled, true);
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(h.timers.size, 0);
  h.lateBodies[0].resolve('{"detail":"too late"}');
  await h.flush(); await h.advance(90000);
  assert.equal(h.calls.length, 1, "late error bodies cannot retry");
  assert.equal(h.writes.length, 0);
  const fresh = h.api.weather(8, 0).catch((error) => error);
  await h.flush();
  assert.equal(h.calls.length, 2, "cancellation releases the provider queue");
  h.api.cancelAll(); assert.equal((await fresh).cancelled, true);
});

for (const body of ["reject", "stall"]) {
  test(`HTTP 429 with a ${body} body preserves the Retry-After ceiling`, async () => {
    const h = bodyFailureHarness({ status: 429, body, retryAfter: "120" });
    const result = h.api.request("https://api.openf1.org/v1/weather?session_key=7", 0, { cache: false })
      .catch((error) => error);
    await h.flush();
    if (body === "stall") await h.advance(15000);
    const error = await result;
    assert.equal(error.status, 429);
    assert.equal(error.retryAfterMs, 120000);
    assert.equal(h.calls.length, 1, "long Retry-After fails fast instead of retrying");
    assert.equal(h.timers.size, 0);
  });
}

test("a stalled 429 keeps its 60 s retry delay outside the provider queue", async () => {
  const h = bodyFailureHarness({ status: 429, body: "stall", retryAfter: "60" });
  const result = h.api.weather(7, 0).catch((error) => error);
  await h.flush(); await h.advance(15000);
  assert.equal(h.calls.length, 1);
  assert.equal([...h.timers.values()][0].at - h.calls[0].at, 75000);
  const other = h.api.weather(8, 0).catch((error) => error);
  await h.flush();
  assert.equal(h.calls.length, 2, "a different endpoint starts during retry backoff");
  h.api.cancelAll();
  assert.equal((await result).cancelled, true);
  assert.equal((await other).cancelled, true);
  assert.equal(h.timers.size, 0);
});

test("rejected 503 bodies keep the existing two-retry budget and offline fallback", async () => {
  const h = bodyFailureHarness({ status: 503 });
  const result = h.api.weather(7, 0);
  await h.flush();
  assert.equal(h.calls.length, 1);
  await h.advance(10000);
  assert.equal(h.calls.length, 2);
  await h.advance(20000);
  assert.equal((await result).rainfall, 99, "exhausted server retries still allow stale fallback");
  assert.equal(h.calls.length, 3);
  assert.equal(h.timers.size, 0);
});

test("offline fetches and stalled successful bodies still allow cached weather", async () => {
  const offline = bodyFailureHarness({ status: null });
  assert.equal((await offline.api.weather(7, 0)).rainfall, 99);
  assert.equal(offline.timers.size, 0);
  const h = bodyFailureHarness({ status: 200, body: "stall" });
  const result = h.api.weather(7, 0);
  await h.flush(); await h.advance(15000);
  assert.equal((await result).rainfall, 99);
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(h.api.cancelAll(), 0);
  assert.equal(h.timers.size, 0);
});

test("replay location downloads bypass the raw cache while telemetry retains it", async () => {
  const cached = JSON.stringify({ t: Date.now(), data: [{ date: "2026-10-04T12:00:00Z", x: 10, y: 20 }] });
  let fetches = 0, writes = 0;
  const ctx = vm.createContext({ Date, AbortController, setTimeout, clearTimeout,
    localStorage: { getItem: () => cached, setItem() { writes++; } },
    fetch: async () => { fetches++; return { ok: true, json: async () => [{ date: "2026-10-04T12:00:01Z", x: 30, y: 40 }] }; },
  });
  seedLog(ctx); vm.runInContext(apiSource, ctx);
  const api = vm.runInContext("F1API", ctx);
  assert.equal((await api.locationData(123, 1, null, null))[0].x, 10);
  assert.equal(fetches, 0, "ordinary telemetry keeps its cache");
  assert.equal((await api.locationData(123, 1, null, null, { cache: false }))[0].x, 30);
  assert.equal(fetches, 1); assert.equal(writes, 0, "coverage-aware replay owns its persistence");
});

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

test("a session result cached before the session froze is refetched, not served for a week", async () => {
  // sessionTtl() picks the TTL at READ time: once a session is 6 h old it said
  // "frozen, a week", so the empty classification cached an hour into the race
  // was served for seven days. The TTL is now capped at the time since the
  // freeze instant, which an entry written before it always exceeds.
  let now = Date.parse("2026-10-04T13:00:00Z");   // the race started 12:00Z
  let published = false, fetches = 0;
  const store = new Map();
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const context = vm.createContext({
    fetch: async (url) => {
      fetches++;
      let body = [];
      if (/sessions\?meeting_key/.test(url)) body = [{ session_key: 9999, meeting_key: 1, session_name: "Race", session_type: "Race", date_start: "2026-10-04T12:00:00Z" }];
      else if (/session_result/.test(url)) body = published ? [{ position: 1, driver_number: 1 }] : [];
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => body, text: async () => JSON.stringify(body) };
    },
    AbortController,
    localStorage: { get length() { return store.size; }, key: (i) => [...store.keys()][i] ?? null,
      getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    Date: FakeDate, setTimeout: (f) => setImmediate(f), clearTimeout() {},
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.__api=F1API", context);
  const api = context.__api;
  await api.sessionsForMeeting(1);                 // the picker records date_start
  assert.equal((await api.sessionResult(9999)).length, 0, "an hour in: not published yet");
  published = true;
  now += 6.5 * 3600e3;                             // 7.5 h after the start: frozen, and published
  assert.equal((await api.sessionResult(9999)).length, 1, "the pre-freeze empty entry is refetched");
  const after = fetches;
  now += 5 * 24 * 3600e3;
  assert.equal((await api.sessionResult(9999)).length, 1);
  assert.equal(fetches, after, "an entry written after the freeze is served from cache");
});

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

test("same-resource callers share one fetch, then cancelAll detaches the next generation", async () => {
  const h = cancelHarness();
  const first = h.api.weather(1, 0).catch((e) => e);
  const duplicate = h.api.weather(1, 0).catch((e) => e);
  await h.settle();
  assert.equal(h.calls.length, 1, "duplicate URL is coalesced before the shared queue");

  h.api.cancelAll();
  const [e1, e2] = await Promise.all([first, duplicate]);
  assert.equal(e1.cancelled, true);
  assert.equal(e2.cancelled, true);

  const reopened = h.api.weather(1, 0);
  await h.settle();
  await h.fireTimers();
  assert.equal(h.calls.length, 2, "the reopened hub owns a fresh request generation");
  assert.equal((await reopened).rainfall, 3);
});

function pacedHarness(firstStatus = 200) {
  let now = 1_000_000, nextId = 0;
  const timers = new Map(), calls = [];
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({
    Date: Clock, AbortController,
    localStorage: { getItem: () => null },
    setTimeout(fn, ms) { const id = ++nextId; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url) => {
      calls.push({ url, at: now });
      const status = calls.length === 1 ? firstStatus : 200;
      return { ok: status === 200, status, headers: { get: () => null }, json: async () => [], text: async () => "" };
    },
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.api=F1API", context);
  const flush = () => new Promise((r) => setImmediate(r));
  async function advance(ms) {
    const target = now + ms;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      timers.delete(next[0]); now = next[1].at; next[1].fn(); await flush();
    }
    now = target; await flush();
  }
  return { api: context.api, calls, timers, flush, advance };
}

test("cancel during OpenF1 pacing releases work without erasing the actual minute budget", async () => {
  const h = pacedHarness();
  const openf1 = (n) => h.api.request("https://api.openf1.org/v1/laps?session_key=" + n, 0, { cache: false });
  for (let i = 0; i < 28; i++) {
    const p = openf1(i); await h.flush(); if (i) await h.advance(400); await p;
  }
  const cancelled = openf1(28).catch((e) => e);
  await h.flush();
  assert.equal(h.calls.length, 28);
  assert.equal([...h.timers.values()][0].at - h.calls.at(-1).at, 49250);

  // Provider separation also matters before cancellation: a standings fetch
  // does not spend OpenF1 quota and must not wait for it.
  await h.api.request("https://api.jolpi.ca/ergast/f1/2026.json", 0, { cache: false });
  assert.equal(h.calls.length, 29);
  assert.equal(h.api.cancelAll(), 0, "the blocked request has no fetch controller yet");
  await h.flush();
  assert.equal(h.timers.size, 0, "the obsolete pacing timer is reclaimed immediately");
  assert.equal((await cancelled).cancelled, true);

  let done = false;
  const fresh = openf1(29).then(() => { done = true; });
  await h.flush();
  await h.advance(49249);
  assert.equal(done, false, "closing the hub cannot reset the server's quota window");
  assert.equal(h.calls.length, 29);
  await h.advance(1); await fresh;
  assert.equal(h.calls.length, 30);
  assert.equal(h.calls.at(-1).at - h.calls[0].at, 60050);
  const next = openf1(30); await h.flush(); await h.advance(400); await next;
  assert.equal(h.calls.length, 31, "cancelled reservations did not consume extra quota");
});

test("cancel during retry backoff rejects promptly and never retries", async () => {
  const h = pacedHarness(429);
  const p = h.api.request("https://api.openf1.org/v1/laps", 0, { cache: false }).catch((e) => e);
  await h.flush();
  assert.equal(h.timers.size, 1);
  h.api.cancelAll(); await h.flush();
  assert.equal(h.timers.size, 0);
  assert.equal((await p).cancelled, true);
  await h.advance(10000);
  assert.equal(h.calls.length, 1);
});

test("a response stuck after headers is abortable and releases the shared queue on close", async () => {
  const calls = [];
  const context = vm.createContext({
    fetch(url, init) {
      calls.push({ url, signal: init.signal });
      return Promise.resolve({ ok: true, json: () => calls.length === 1
        ? new Promise(() => {}) : Promise.resolve([{ rainfall: 4 }]) });
    },
    AbortController, Date, setTimeout, clearTimeout,
    localStorage: { length: 0, getItem: () => null, setItem() {}, key: () => null, removeItem() {} },
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.__api=F1API", context);
  const api = context.__api;
  const first = api.weather(1, 0).catch((e) => e);
  const queued = api.weather(2, 0).catch((e) => e);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, 1, "body reading occupies the queue slot");
  assert.equal(api.cancelAll(), 1, "a controller remains live through body parsing");
  const [a, b] = await Promise.all([first, queued]);
  assert.equal(a.cancelled, true);
  assert.equal(b.cancelled, true);
  assert.equal(calls.length, 1);
  const recovered = await api.weather(3, 0);
  assert.equal(recovered.rainfall, 4, "a new request can start after the aborted body");
});

test("a response body that ignores abort is still bounded by the full-attempt timeout", async () => {
  let deadline = null, calls = 0;
  const context = vm.createContext({
    fetch() {
      calls++;
      return Promise.resolve({ ok: true, json: () => calls === 1
        ? new Promise(() => {}) : Promise.resolve([{ rainfall: 7 }]) });
    },
    AbortController, Date,
    setTimeout(fn, ms) { if (ms === 15000) { deadline = fn; return 1; } return setTimeout(fn, ms); },
    clearTimeout(id) { if (id !== 1) clearTimeout(id); },
    localStorage: { length: 0, getItem: () => null, setItem() {}, key: () => null, removeItem() {} },
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.__api=F1API", context);
  const first = context.__api.weather(1, 0).catch((e) => e);
  await new Promise((r) => setImmediate(r));
  deadline();
  const err = await first;
  assert.match(err.message, /timed out/);
  assert.equal(err.cancelled, undefined, "deadline remains a fetch failure, eligible for stale fallback");
  const recovered = await context.__api.weather(2, 0);
  assert.equal(recovered.rainfall, 7);
});

test("Data Hub, LIVE, and telemetry keep failed state distinct from a valid empty response", async () => {
  assert.match(hubSource, /status:\s*node[^\n]+dh-empty[^\n]+\?\s*"empty"\s*:\s*"ready"/);
  assert.match(hubSource, /status:\s*"failed",\s*error:\s*err/);
  const liveSource = await readFile(new URL("../../js/data/live.js", import.meta.url), "utf8");
  const telemetrySource = await readFile(new URL("../../js/data/telemetry.js", import.meta.url), "utf8");
  assert.match(liveSource, /failed\.length === batch\.length/);
  assert.match(liveSource, /data-state", hadData \? "stale" : "failed"/);
  assert.match(telemetrySource, /Couldn't load telemetry drivers/);
  assert.doesNotMatch(telemetrySource, /F1API\.sessionDrivers\([^)]*\)\.catch\(function \(\) \{ return null; \}\)/);
  assert.match(telemetrySource, /F1API\.carData\([\s\S]{0,180}F1API\.locationData/);
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

test("hunt fixes: OpenF1 is held under 30 req/min, cancelled rounds never reach the picker, the default is a round that has started", async () => {
  const { readFileSync } = await import("node:fs");
  const api = apiSource;
  assert.match(api, /const OPENF1_PER_MIN = 28/);
  assert.match(api, /if \(_of1Recent\.length >= OPENF1_PER_MIN\) wait = Math\.max\(wait, _of1Recent\[0\] \+ 60000 - now \+ 50\);/);
  assert.match(api, /out\.cancelled = m\.is_cancelled === true;/);
  assert.match(api, /return m\.meetingKey !== null && !m\.cancelled;/);
  const hub = readFileSync(new URL("../../js/data/hub.js", import.meta.url), "utf8");
  assert.match(hub, /started\.length \? started\[started\.length - 1\] : ms\[0\]/, "never December's unrun Abu Dhabi by default");
});

// THE DATA HUB'S CACHE MUST NOT COST THE GAME ITS SAVES. localStorage is one
// ~5 MiB quota per origin (MDN: Storage quotas and eviction criteria); a
// multi-MB /position body filled it and every career/settings/ghost write
// after it failed. Oversized bodies are not cached, and a full quota drops the
// disposable apex26.api.* cache so the save can land.
async function quotaCtx() {
  const { readFile } = await import("node:fs/promises");
  const vmm = await import("node:vm");
  const QUOTA = 5 * 1024 * 1024;
  const m = new Map();
  const used = () => { let n = 0; for (const [k, v] of m) n += k.length + v.length; return n; };
  const localStorage = {
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) { v = String(v); const prev = m.has(k) ? k.length + m.get(k).length : 0;
      if (used() - prev + k.length + v.length > QUOTA) { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; }
      m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
  };
  const big = "x".repeat(4_900_000);
  const fetch = async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => [{ driver_number: 1, position: 1, pad: big }] });
  const Log = { warn() {}, info() {}, debug() {}, error() {} };
  const ctx = vmm.createContext({ localStorage, Log, fetch, setTimeout, clearTimeout, AbortController, SaveMigrate: {} });
  for (const f of ["js/core/store.js", "js/data/api-transport.js", "js/data/api.js"]) vmm.runInContext(await readFile(f, "utf8"), ctx, { filename: f });
  return { ctx, m, run: (src) => vmm.runInContext(src, ctx) };
}

test("a multi-MB data-hub body is not cached, so the next save stays durable", async () => {
  const { m, run } = await quotaCtx();
  await run("F1API.positions(9999, 7*24*3600e3)");
  assert.equal([...m.keys()].filter((k) => k.startsWith("apex26.api.")).length, 0);
  const r = run("GameStore.store.write('career', {money: 2e6, blob: 'y'.repeat(400000)})");
  assert.equal(r.durable, true);
});

test("a full quota drops the disposable api cache and the save lands", async () => {
  const { m, run } = await quotaCtx();
  m.set("apex26.api.https://api.openf1.org/v1/position", "z".repeat(5_000_000));
  const r = run("GameStore.store.write('career', {money: 3e6, blob: 'y'.repeat(400000)})");
  assert.equal(r.durable, true);
  assert.equal([...m.keys()].filter((k) => k.startsWith("apex26.api.")).length, 0);
  assert.equal(run("GameStore.store.rawSet('apex26.x', 'y'.repeat(300000))"), true);
});

test("a quota full of real-race scripts is freed too, and the career save lands", async () => {
  const { m, run } = await quotaCtx();
  m.set("apex26.career", JSON.stringify({ money: 1 }));
  for (let i = 0; i < 115; i++) m.set("apex26.realrace.v1." + (9000 + i), "s".repeat(45_000));
  m.set("apex26.realrace.lru", "[]");
  const r = run("GameStore.store.write('settings', {blob: 'y'.repeat(300000)})");
  assert.equal(r.durable, true);
  assert.equal([...m.keys()].filter((k) => k.startsWith("apex26.realrace.")).length, 0);
  assert.equal(m.get("apex26.career"), JSON.stringify({ money: 1 }), "only disposable keys are dropped");
});


test("pit duration prefers OpenF1 lane_duration and accepts cached legacy pit_duration", async () => {
  const rows = [{ lane_duration: 22.2, pit_duration: 99 }, { pit_duration: 23.4 },
    { lane_duration: null, pit_duration: 24.5 }, { lane_duration: 0, pit_duration: 30 }];
  const context = vm.createContext({ fetch: async () => ({ ok: true, status: 200,
    headers: { get: () => null }, json: async () => rows, text: async () => JSON.stringify(rows) }),
    AbortController, Date, setTimeout, clearTimeout });
  seedLog(context);
  const api = vm.runInContext(apiSource + ";F1API", context);
  const pits = await api.pits(1);
  assert.deepEqual(Array.from(pits, (p) => p.duration), [22.2, 23.4, 24.5, 0]);
});

test("placeLabel remaps a moved venue's OpenF1 meeting country", () => {
  const context = vm.createContext({ Date, AbortController, setTimeout, clearTimeout,
    fetch: async () => ({ ok: true, json: async () => [] }) });
  seedLog(context);
  vm.runInContext(apiSource, context);
  const api = vm.runInContext("F1API", context);
  assert.equal(api.placeLabel("Kuala Lumpur", "Bahrain"), "Kuala Lumpur, Malaysia");
  assert.equal(api.placeLabel("Kuala Lumpur", "Bahrain", " · "), "Kuala Lumpur · Malaysia");
  assert.equal(api.placeLabel("Sakhir", "Bahrain"), "Sakhir, Bahrain");
  assert.equal(api.placeLabel("Baku", "Azerbaijan"), "Baku, Azerbaijan");
  assert.equal(api.placeLabel("", "Bahrain"), "Bahrain");
});
