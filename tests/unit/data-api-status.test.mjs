// R8 N9: an error body of literal "null" is a LEGAL JSON parse whose .detail
// read used to throw a TypeError out of fetchOnce — an error carrying no
// .status and no "HTTP 401"/"HTTP 403" text, which let a lockout serve stale
// cache past the refusal in request(). The guard is `j && (j.detail||j.error)`.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { evalRealRace } from "../helpers/eval-real-race.mjs";

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
  assert.equal(h.calls.length, 1, "a different endpoint waits for the shared Retry-After window");
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

function overlapHarness(reply = () => ({ delay: 2000, data: [] }), onTimer = null) {
  let now = 1_000_000, nextId = 0;
  const timers = new Map(), calls = [], active = { openf1: 0, other: 0 }, peak = { openf1: 0, other: 0 };
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({ Date: Clock, AbortController,
    localStorage: { length: 0, getItem: () => null, setItem() {}, key: () => null, removeItem() {} },
    setTimeout(fn, ms) { const id = ++nextId; timers.set(id, { fn: () => { fn(); if (onTimer) onTimer(ms); }, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, init) {
      const provider = url.startsWith("https://api.openf1.org/") ? "openf1" : "other";
      const call = { url, at: now, signal: init.signal };
      calls.push(call); active[provider]++; peak[provider] = Math.max(peak[provider], active[provider]);
      const spec = reply(url, calls.length), status = spec.status || 200;
      const body = () => new Promise((resolve, reject) => {
        let ended = false, timer;
        const finish = (value, error) => {
          if (ended) return;
          ended = true; active[provider]--; context.clearTimeout(timer);
          init.signal.removeEventListener("abort", abort);
          error ? reject(error) : resolve(value);
        };
        const abort = () => finish(null, new Error("aborted body"));
        init.signal.addEventListener("abort", abort, { once: true });
        if (spec.delay != null) timer = context.setTimeout(() => finish(spec.data || []), spec.delay);
      });
      const response = { ok: status === 200, status,
        headers: { get: () => { if (spec.headerRead) spec.headerRead(); return spec.retryAfter || null; } }, json: body,
        text: () => body().then(() => JSON.stringify({ detail: "rate limited" })) };
      if (spec.headersReady) return new Promise(resolve => spec.headersReady(() => resolve(response)));
      return spec.headersDelay ? new Promise(resolve => context.setTimeout(() => resolve(response), spec.headersDelay))
        : Promise.resolve(response);
    } });
  seedLog(context); vm.runInContext(apiSource + ";globalThis.api=F1API", context, { filename: absSrc("js/data/api.js") });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  async function advance(ms) {
    const target = now + ms;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      timers.delete(next[0]); now = next[1].at; next[1].fn(); await flush();
    }
    now = target; await flush();
  }
  async function finish(promise) {
    let done = false, value, failure;
    promise.then(v => { done = true; value = v; }, e => { done = true; failure = e; });
    await flush();
    for (let i = 0; !done && i < 500; i++) {
      const next = [...timers.values()].sort((a, b) => a.at - b.at)[0];
      assert.ok(next, "pending request graph owns a timer");
      await advance(next.at - now);
    }
    assert.equal(done, true, "request graph settles within a bounded number of clock steps");
    if (failure) throw failure;
    return value;
  }
  return { api: context.api, context, calls, timers, peak, active, advance, flush, finish, get now() { return now; } };
}

const rawURL = n => "https://api.openf1.org/v1/location?session_key=" + n;
const rawRequest = (h, n) => h.api.request(rawURL(n), 0, { cache: false });

test("provider bodies overlap at cap two while shared callers, cancellation and other providers stay independent", async () => {
  const h = overlapHarness(() => ({ delay: null }));
  const first = rawRequest(h, 1), duplicate = rawRequest(h, 1);
  assert.equal(first, duplicate, "duplicate URLs share the complete attempt");
  const jobs = [first, rawRequest(h, 2), rawRequest(h, 3)].map(p => p.catch(e => e));
  await h.flush(); await h.advance(400);
  assert.deepEqual(h.calls.map(c => c.at), [1_000_000, 1_000_400]);
  await h.advance(400);
  assert.equal(h.calls.length, 2, "a third body waits for capacity after the pacing gap expires");
  const other = h.api.request("https://api.jolpi.ca/ergast/f1/2026.json", 0, { cache: false }).catch(e => e);
  await h.flush();
  assert.equal(h.calls.length, 3, "Jolpica has its own body capacity and start coordinator");
  assert.equal(h.api.cancelAll(), 3, "both OpenF1 bodies and the other provider retain abort ownership");
  assert.ok((await Promise.all([...jobs, other])).every(e => e.cancelled));
  assert.ok(h.calls.every(c => c.signal.aborted));
  assert.equal(h.timers.size, 0, "cancel releases pacing/capacity waits and body deadlines");
  const fresh = rawRequest(h, 4).catch(e => e); await h.flush();
  assert.equal(h.calls.length, 4, "a new generation is not held by cancelled bodies");
  h.api.cancelAll(); assert.equal((await fresh).cancelled, true);
  assert.equal(h.peak.openf1, 2);
});

test("overlapping attempts retain separate original deadlines and release capacity on timeout", async () => {
  const h = overlapHarness(url => ({ delay: url === rawURL(3) ? 0 : null }));
  const first = rawRequest(h, 1).catch(e => e), second = rawRequest(h, 2).catch(e => e);
  const third = rawRequest(h, 3);
  await h.flush(); await h.advance(14999);
  assert.equal(h.calls.length, 2);
  await h.advance(1);
  assert.match((await first).message, /timed out/);
  assert.equal(h.calls[0].signal.aborted, true);
  assert.equal(h.calls[1].signal.aborted, false);
  assert.equal(h.calls[2].at, 1_015_000, "first deadline releases a slot without waiting for the second body");
  await third;
  await h.advance(400);
  assert.match((await second).message, /timed out/);
  assert.equal(h.calls[1].signal.aborted, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.peak.openf1, 2);
});

test("bounded overlap preserves 400 ms starts and the shared 28-start sliding minute window", async () => {
  const h = overlapHarness(() => ({ delay: 1000 }));
  await h.finish(Promise.all(Array.from({ length: 35 }, (_, i) => rawRequest(h, i))));
  assert.equal(h.peak.openf1, 2);
  const starts = h.calls.map(c => c.at);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 400);
  for (const start of starts) assert.ok(starts.filter(t => t <= start && start - t < 60000).length <= 28);
  assert.equal(starts[28] - starts[0], 60050);
  assert.equal(h.timers.size, 0);
});

test("429 backoff releases body capacity and honours Retry-After alongside independent requests", async () => {
  const attempts = new Map();
  const h = overlapHarness(url => {
    const n = (attempts.get(url) || 0) + 1; attempts.set(url, n);
    return url === rawURL(1) && n === 1 ? { status: 429, retryAfter: "60", delay: 100 }
      : { delay: 2000 };
  });
  const requests = Promise.all([1, 2, 3].map(n => rawRequest(h, n)));
  await h.finish(requests);
  assert.equal(h.calls.length, 4);
  assert.deepEqual(h.calls.map(c => c.at - 1_000_000), [0, 60000, 60400, 62000]);
  assert.equal(h.peak.openf1, 2);
  assert.equal(h.timers.size, 0);
});

for (const delay of [100, 2000]) test(`four-driver dependent telemetry graph with ${delay} ms bodies preserves inputs and bounded pacing`, async () => {
  const t0 = Date.parse("2026-09-20T11:00:00Z");
  const h = overlapHarness(url => {
    const endpoint = new URL(url).pathname;
    const rows = endpoint.endsWith("/laps")
      ? [{ lap_number: 4, lap_duration: 90, date_start: new Date(t0).toISOString(), is_pit_out_lap: false }]
      : endpoint.endsWith("/car_data") ? Array.from({ length: 4 }, (_, i) => ({ date: new Date(t0 + i * 270).toISOString(),
        speed: 250, throttle: 100, brake: 0, n_gear: 8, rpm: 10000, drs: 12 }))
      : endpoint.endsWith("/location") ? Array.from({ length: 4 }, (_, i) => ({ date: new Date(t0 + i * 270).toISOString(), x: 100 + i, y: 200 + i })) : [];
    return { delay, data: rows };
  });
  h.context.DataTelemetryView = { create: () => ({}) };
  for (const name of ["core/mat4", "data/telemetry-model", "data/telemetry"]) {
    let source = await readFile(new URL(`../../js/${name}.js`, import.meta.url), "utf8");
    if (name === "data/telemetry") source = source.replace("return { loadTelemetry, closeTelemPopup };",
      "return { loadTelemetry, closeTelemPopup, fetchDriverTel };");
    vm.runInContext(source, h.context, { filename: absSrc(`js/${name}.js`) });
  }
  const controller = vm.runInContext("DataTelemetry.create({})", h.context);
  const values = await h.finish(Promise.all([1, 4, 16, 44].map((num, i) => controller.fetchDriverTel(123, { num }, i === 0))));
  assert.equal(h.calls.length, 14);
  assert.ok(values.every(value => value.car.length === 4 && value.loc.length === 4));
  for (const num of [1, 4, 16, 44]) {
    const driver = h.calls.filter(c => new URL(c.url).searchParams.get("driver_number") === String(num));
    assert.ok(driver[0].url.includes("/laps?"));
    assert.ok(driver.slice(1).every(c => c.at >= driver[0].at + delay), "lap metadata settles before its dependent time-window requests start");
  }
  assert.equal(h.now - 1_000_000, delay === 100 ? 5300 : 14400,
    "fast bodies stay pacing-bound; slow bodies overlap within the two-request cap");
  assert.equal(h.peak.openf1, delay === 100 ? 1 : 2);
  assert.equal(h.timers.size, 0);
});

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
  let calls = 0, now = 1_000_000;
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({
    fetch: async () => {
      calls++;
      return { ok: false, status: 429, headers: { get: (k) => (/retry-after/i.test(k) ? retryAfter : null) }, text: async () => "" };
    },
    AbortController,
    localStorage: { length: 0, getItem: () => null, setItem() {}, key: () => null, removeItem() {} },
    Date: Clock,
    setTimeout(fn, ms) { if (ms === 15000) return 0; timers.push({ fn: () => { now += ms; fn(); }, ms }); return timers.length; }, clearTimeout() {},   // skip the fetch deadline
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
    "apex26.api.https://api.openf1.org/v1/car_data?session_key=1&driver_number=1&date%3E=a&date%3C=b",
    "apex26.api.https://api.openf1.org/v1/location?session_key=1&driver_number=1&date%3E=a&date%3C=b",
    "apex26.api.https://api.openf1.org/v1/car_data?session_key=2&driver_number=4&date%3E=a&date%3C=b",
    "apex26.api.https://api.openf1.org/v1/location?session_key=2&driver_number=4&date%3E=a&date%3C=b",
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

test("carData drops rows with unparseable dates (same rule as locationData)", async () => {
  const rows = [
    { date: "2026-07-26T14:00:00.000Z", speed: 280, throttle: 100, brake: 0, n_gear: 8, rpm: 10000, drs: 0 },
    { date: "not-a-date", speed: 50, throttle: 0, brake: 100, n_gear: 1, rpm: 2000, drs: 0 },
    { date: "2026-07-26T14:00:01.000Z", speed: 290, throttle: 100, brake: 0, n_gear: 8, rpm: 10500, drs: 0 },
  ];
  const locRows = rows.map((r) => ({ date: r.date, x: 10, y: 20 }));
  let path = "";
  const context = vm.createContext({
    fetch: async (url) => {
      path = String(url);
      const body = /\/location\?/.test(path) ? locRows : rows;
      return { ok: true, status: 200, headers: { get: () => null },
        json: async () => body, text: async () => JSON.stringify(body) };
    },
    AbortController, localStorage: { length: 0, getItem: () => null, setItem() {}, key: () => null, removeItem() {} },
    Date, setTimeout, clearTimeout,
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.api=F1API", context);
  const car = await context.api.carData(1, 44, "2026-07-26T14:00:00.000Z", "2026-07-26T14:00:02.000Z");
  // Behaviour pin (avoid source-text match pins): windowed filters must use the
  // same percent-encoding as deltaUrl so proxies cannot truncate the range.
  assert.ok(path.includes("date%3E=" + encodeURIComponent("2026-07-26T14:00:00.000Z")),
    "windowed start filter matches deltaUrl encoding: " + path);
  assert.ok(path.includes("date%3C=" + encodeURIComponent("2026-07-26T14:00:02.000Z")),
    "windowed end filter is percent-encoded too: " + path);
  assert.equal(/date>=|date<=/.test(path), false, "bare >/< must not appear in the OpenF1 URL");
  const loc = await context.api.locationData(1, 44, "2026-07-26T14:00:00.000Z", "2026-07-26T14:00:02.000Z");
  assert.equal(car.length, 2, "bad date row must be dropped");
  assert.equal(car[0].t, 0);
  assert.ok(Math.abs(car[1].t - 1) < 1e-9, "second sample is 1 s after the first, got " + car[1].t);
  assert.equal(car[0].speed, 280);
  assert.equal(car[1].speed, 290);
  assert.ok(car.every((c) => c.date > 0), "no sentinel date:0");
  assert.equal(loc.length, 2, "locationData already dropped the bad date");
});

test("telemetry and locations sort valid timestamps and keep the first valid duplicate", async () => {
  const at = (s) => new Date(Date.parse("2026-07-26T14:00:00Z") + s * 1000).toISOString();
  const rows = [{ date: at(2), speed: 72, x: 30, y: 40 }, { date: "bad", speed: 999, x: 1, y: 2 },
    { date: at(0), speed: 36, x: 10, y: 20 }, { date: at(1), speed: 54, x: 20, y: 30 },
    { date: at(1), speed: 999, x: 999, y: 999 }];
  const context = vm.createContext({ fetch: async () => ({ ok: true, status: 200,
    headers: { get: () => null }, json: async () => rows }), AbortController, Date, setTimeout, clearTimeout });
  seedLog(context);
  const api = vm.runInContext(apiSource + ";F1API", context);
  const car = await api.carData(1, 44), loc = await api.locationData(1, 44);
  assert.deepEqual(Array.from(car, (r) => r.t), [0, 1, 2]);
  assert.deepEqual(Array.from(car, (r) => r.speed), [36, 54, 72]);
  assert.deepEqual(Array.from(loc, (r) => r.x), [10, 20, 30]);
  let distance = 0;
  for (let i = 1; i < car.length; i++) distance += car[i].speed / 3.6 * (car[i].t - car[i - 1].t);
  assert.equal(distance, 35, "integration advances along the sorted clock");
});

test("export gather waits 90 s when fastestLap returns HTTP 429", async () => {
  const exportSrc = await readFile(new URL("../../js/data/export.js", import.meta.url), "utf8");
  const sleeps = [];
  const logs = [];
  let lapCalls = 0;
  const context = vm.createContext({
    Date, setTimeout: (fn, ms) => { sleeps.push(ms); queueMicrotask(fn); return sleeps.length; },
    clearTimeout() {},
    TextEncoder, Uint8Array, Uint32Array, Math, JSON, Promise, Object, Array, String, Number, isFinite,
    Log: { info() {}, warn() {}, debug() {}, error() {} },
    F1API: {
      meetings: async () => [{ meetingKey: 1, circuit: "Monza", country: "Italy", name: "Italian Grand Prix" }],
      sessionsForMeeting: async () => [{ sessionKey: 9, name: "Qualifying" }],
      sessionDrivers: async () => [{ num: 16, code: "LEC" }],
      fastestLap: async () => {
        lapCalls++;
        if (lapCalls === 1) {
          const e = new Error("HTTP 429 for https://api.openf1.org/v1/laps");
          e.status = 429;
          throw e;
        }
        return { dateStart: "2026-07-26T14:00:00.000Z", lapDuration: 80 };
      },
      locationData: async () => {
        const pts = [];
        // This successful candidate covers its declared 80 s lap, including both boundaries.
        for (let i = 0; i < 40; i++) pts.push({ x: i, y: i * 2, date: Date.parse("2026-07-26T14:00:00.000Z") + i * 80000 / 39 });
        return pts;
      },
    },
  });
  vm.runInContext(exportSrc + ";globalThis.DataExport=DataExport", context);
  const { gatherStartLines } = context.DataExport.create({
    el: () => ({}), clear() {}, isOpen: () => true,
  });
  const out = await gatherStartLines(2026, (m) => logs.push(m));
  assert.ok(logs.some((m) => /rate limited/.test(m)), "outer 429 path must log the wait: " + logs.join(" | "));
  assert.ok(sleeps.includes(90000), "must sleep 90 s before retry, sleeps=" + sleeps.join(","));
  assert.ok(lapCalls >= 2, "meeting retried after the wait");
  assert.ok(out.circuits.Monza, "circuit captured after the rate-limit retry");
});

test("meetings(null) uses the clock season, never ?year=null", async () => {
  let path = "";
  const context = vm.createContext({
    fetch: async (url) => {
      path = String(url);
      return { ok: true, status: 200, headers: { get: () => null },
        json: async () => [], text: async () => "[]" };
    },
    AbortController, localStorage: { length: 0, getItem: () => null, setItem() {}, key: () => null, removeItem() {} },
    Date, setTimeout, clearTimeout, encodeURIComponent,
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.api=F1API", context);
  await context.api.meetings(null);
  assert.match(path, /\/meetings\?year=\d{4}$/);
  assert.doesNotMatch(path, /year=null/);
  await context.api.meetings(undefined);
  assert.match(path, /\/meetings\?year=\d{4}$/);
});

test("export Download: the ZIP holds the JSON then one map per circuit, with CRC-32s and a central directory that match", async () => {
  // makeZip / crc32 are private to DataExport.create, so this drives the real
  // path: Gather (mocked F1API) → Download → the Blob handed to createObjectURL.
  const { crc32 } = await import("node:zlib");
  const exportSrc = await readFile(new URL("../../js/data/export.js", import.meta.url), "utf8");
  class El {
    constructor(tag, cls, text) {
      this.tagName = String(tag).toUpperCase(); this.className = cls || ""; this.textContent = text || "";
      this.children = []; this.attrs = {}; this.on = {}; this.disabled = false;
      const set = new Set(this.className.split(" ").filter(Boolean));
      this.classList = { toggle: (c, v) => (v ? set.add(c) : set.delete(c)), contains: (c) => set.has(c) };
    }
    appendChild(c) { this.children.push(c); return c; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    addEventListener(t, fn) { this.on[t] = fn; }
    click() { if (this.on.click) this.on.click(); }
    remove() {}
  }
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const noop2d = new Proxy({}, { get: () => () => {}, set: () => true });
  let zipBlob = null;
  const context = vm.createContext({
    Date, setTimeout: (fn) => { queueMicrotask(fn); return 1; }, clearTimeout() {},
    TextEncoder, Uint8Array, Uint32Array, Math, JSON, Promise, Object, Array, String, Number, isFinite, Blob,
    Log: { info() {}, warn() {}, debug() {}, error() {} },
    URL: { createObjectURL: (b) => { zipBlob = b; return "blob:zip"; }, revokeObjectURL() {} },
    document: {
      body: { appendChild() {} },
      createElement: (tag) => tag === "canvas"
        ? { width: 0, height: 0, getContext: () => noop2d, toBlob: (cb) => cb(new Blob([PNG])) }
        : new El(tag),
    },
    F1API: {
      meetings: async () => [{ meetingKey: 1, circuit: "Monza" }, { meetingKey: 2, circuit: "Marina Bay" }],
      sessionsForMeeting: async () => [{ sessionKey: 9, name: "Qualifying" }],
      sessionDrivers: async () => [{ num: 16, code: "LEC" }],
      fastestLap: async () => ({ dateStart: "2026-07-26T14:00:00.000Z", lapDuration: 80 }),
      // ZIP coverage needs complete candidate laps; epoch-zero dates are outside this lap.
      locationData: async () => Array.from({ length: 40 }, (_, i) => ({
        x: i, y: i * 2, date: Date.parse("2026-07-26T14:00:00.000Z") + i * 80000 / 39
      })),
    },
  });
  vm.runInContext(exportSrc + ";globalThis.DataExport=DataExport", context);
  const wrap = await context.DataExport.create({ el: (t, c, x) => new El(t, c, x), clear() {}, isOpen: () => true }).loadExport();
  const [gather, download] = wrap.children.find((c) => c.className === "dh-export-row").children;
  const settle = async (done) => { for (let i = 0; i < 5000 && !done(); i++) await new Promise((r) => setImmediate(r)); };
  gather.click();
  await settle(() => !download.disabled);
  assert.equal(download.disabled, false, "gather finished and unlocked Download");
  download.click();
  await settle(() => zipBlob);
  assert.ok(zipBlob, "Download produced a ZIP blob");
  assert.equal(zipBlob.type, "application/zip");
  const z = Buffer.from(await zipBlob.arrayBuffer());
  // Local entries, in order.
  const local = [];
  for (let o = 0; z.readUInt32LE(o) === 0x04034b50;) {
    const n = z.readUInt16LE(o + 26), sz = z.readUInt32LE(o + 22);
    const name = z.toString("utf8", o + 30, o + 30 + n), data = z.subarray(o + 30 + n, o + 30 + n + sz);
    assert.equal(z.readUInt32LE(o + 18), sz, `${name}: stored, so compressed size = size`);
    assert.equal(z.readUInt32LE(o + 14), crc32(data), `${name}: local CRC-32`);
    local.push({ name, offset: o, data });
    o += 30 + n + sz;
  }
  assert.deepEqual(local.map((e) => e.name), ["startlines-2026.json", "img/Monza.png", "img/Marina_Bay.png"],
    "JSON first, then one map per circuit in gather order (safeName applied)");
  const json = JSON.parse(local[0].data.toString("utf8"));
  assert.equal(json.year, 2026);
  assert.deepEqual(Object.keys(json.circuits), ["Monza", "Marina Bay"]);
  assert.deepEqual([...local[1].data], [...PNG]);
  // End of central directory → central entries agree with the local ones.
  const eocd = z.length - 22;
  assert.equal(z.readUInt32LE(eocd), 0x06054b50);
  assert.equal(z.readUInt16LE(eocd + 10), local.length);
  let c = z.readUInt32LE(eocd + 16);
  assert.equal(c + z.readUInt32LE(eocd + 12), eocd, "central directory ends at the EOCD record");
  for (const e of local) {
    assert.equal(z.readUInt32LE(c), 0x02014b50);
    const n = z.readUInt16LE(c + 28);
    assert.equal(z.toString("utf8", c + 46, c + 46 + n), e.name);
    assert.equal(z.readUInt32LE(c + 16), crc32(e.data), `${e.name}: central CRC-32`);
    assert.equal(z.readUInt32LE(c + 42), e.offset, `${e.name}: central offset points at its local header`);
    c += 46 + n;
  }
});

// Scripted fetch: `routes` maps a URL substring to a response spec (or a
// function returning one); the clock is owned so TTL and stale-copy age are exact.
function routeHarness(routes, { store = new Map(), start = Date.parse("2026-10-15T12:00:00Z") } = {}) {
  let now = start;
  const calls = [];
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const context = vm.createContext({
    fetch: async (url) => {
      calls.push(String(url));
      const key = Object.keys(routes).find((k) => String(url).includes(k));
      let spec = key ? routes[key] : { status: 200, body: [] };
      if (typeof spec === "function") spec = spec();
      if (spec === "offline") throw new TypeError("Failed to fetch");
      const text = typeof spec.body === "string" ? spec.body : JSON.stringify(spec.body);
      return { ok: spec.status >= 200 && spec.status < 300, status: spec.status,
        headers: { get: () => null }, json: async () => JSON.parse(text), text: async () => text };
    },
    AbortController,
    localStorage: { get length() { return store.size; }, key: (i) => [...store.keys()][i] ?? null,
      getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    Date: FakeDate, setTimeout: (f) => setImmediate(f), clearTimeout() {},
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.__api=F1API", context);
  return { api: context.__api, context, calls, store, tick: (ms) => { now += ms; }, now: () => now };
}

const NO_RESULTS = { status: 404, body: { detail: "No results found." } };

// #2185: OpenF1 answers "no data yet" with HTTP 404 {"detail":"No results found."}
// (measured 2026-10-15: session_result?session_key=11392, pit?session_key=9934).
test("#2185 an OpenF1 404 'No results found.' resolves [] and is cached; any other 404 rejects", async () => {
  const h = routeHarness({ "/session_result": NO_RESULTS, "/pit?": NO_RESULTS,
    "/laps?": NO_RESULTS, "/weather?": { status: 404, body: { detail: "Not Found" } } });
  assert.deepEqual([...await h.api.sessionResult(11392, 60e3)], []);
  assert.deepEqual([...await h.api.request("https://api.openf1.org/v1/pit?session_key=9934", 60e3)], []);
  assert.equal(await h.api.fastestLap(9934, 1), null, "no laps → the no-lap branch, not a rejection");
  const before = h.calls.length;
  await h.api.sessionResult(11392, 60e3);
  assert.equal(h.calls.length, before, "the empty answer is cached under the normal TTL");
  await assert.rejects(h.api.weather(7, 60e3), (e) => e.status === 404);
});

// #2190 (1): a refetch that fails and serves the localStorage copy reports
// WHEN that copy was written, so the tab footnote cannot say "just now".
test("#2190 a stale-cache serve is reported with the entry's time; a fresh fetch is not", async () => {
  const url = "https://api.openf1.org/v1/weather?session_key=7";
  const store = new Map();
  const h = routeHarness({ "/weather?": "offline" }, { store });
  const written = h.now() - 3 * 3600e3;
  store.set("apex26.api." + url, JSON.stringify({ t: written, data: [{ rainfall: 1 }] }));
  const mark = h.api.staleMark();
  assert.equal((await h.api.request(url, 60e3)).length, 1, "the offline copy is served");
  assert.equal(h.api.staleSince(mark), written);
  const mark2 = h.api.staleMark();
  const g = routeHarness({ "/weather?": { status: 200, body: [{ rainfall: 0 }] } });
  await g.api.request(url, 60e3);
  assert.equal(h.api.staleSince(mark2), null, "nothing stale since the second mark");
  assert.equal(g.api.staleSince(0), null, "a network answer is never stale");
});

// #2190 (2): a body over CACHE_MAX_CHARS stays out of localStorage but is held
// in a small in-memory LRU, so the next request inside its TTL is not refetched,
// and an older small disk entry no longer stands in for it.
test("#2190 an oversize body is served from memory within its TTL and replaces the disk copy", async () => {
  const url = "https://api.openf1.org/v1/position?session_key=9999";
  const big = Array.from({ length: 6000 }, (_, i) => ({ driver_number: 1, position: 1, date: "2026-10-04T12:00:" + String(i).padStart(6, "0") }));
  const store = new Map();
  let offline = false;
  const h = routeHarness({ "/position?": () => offline ? "offline" : { status: 200, body: big } }, { store });
  store.set("apex26.api." + url, JSON.stringify({ t: h.now() - 2 * 3600e3, data: [{ position: 20 }] }));
  const ttl = 60 * 60e3;
  assert.equal((await h.api.request(url, ttl)).length, big.length);
  assert.equal(store.has("apex26.api." + url), false, "the small, older disk entry is dropped");
  const n = h.calls.length;
  assert.equal((await h.api.request(url, ttl)).length, big.length);
  assert.equal(h.calls.length, n, "second request within TTL: no network");
  h.tick(ttl + 1); offline = true;
  assert.equal((await h.api.request(url, ttl)).length, big.length, "stale fallback is the big body, not the old disk one");
  offline = false;
  for (let i = 0; i < 4; i++) await h.api.request("https://api.openf1.org/v1/position?session_key=" + (100 + i), ttl);
  offline = true;
  await assert.rejects(h.api.request(url, ttl), "the LRU holds 4 bodies: the oldest is evicted, not kept forever");
});

for (const headersDelay of [0, 200]) test(`429 headers at ${headersDelay} ms pause pending starts across cancel/reopen`, async () => {
  const h = overlapHarness(url => url === rawURL(1)
    ? { status: 429, retryAfter: "60", delay: null, headersDelay } : { delay: 10 });
  const jobs = [1, 2, 3, 4].map(n => rawRequest(h, n).catch(e => e));
  await h.flush(); await h.advance(1600);
  assert.equal(h.calls.length, 1, "known headers stop even a reservation already sleeping for 400 ms");
  const other = h.api.request("https://api.jolpi.ca/ergast/f1/2026.json", 0, { cache: false });
  await h.flush(); await h.advance(10); await other;
  assert.equal(h.calls.length, 2, "unrelated provider starts while the throttle body is stalled");
  assert.equal(h.api.cancelAll(), 1);
  assert.ok((await Promise.all(jobs)).every(e => e.cancelled));
  assert.equal(h.timers.size, 0, "cancel cleans body deadlines and shared pause waits");
  const fresh = rawRequest(h, 5); await h.flush();
  await h.advance(60000 + headersDelay - (h.now - 1_000_000) - 1);
  assert.equal(h.calls.length, 2, "reopen retains the announced provider window");
  await h.advance(1);
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].at, 1_060_000 + headersDelay);
  await h.advance(10); await fresh;
  assert.equal(h.timers.size, 0);
});

for (const status of [401, 403]) test(`${status} headers retain per-request auth semantics without a permanent provider lock`, async () => {
  const h = overlapHarness(url => url === rawURL(1) ? { status, delay: null, retryAfter: "60" } : { delay: 10 });
  const refused = rawRequest(h, 1).catch(e => e), sibling = rawRequest(h, 2);
  await h.flush(); await h.advance(410); await sibling;
  assert.equal(h.calls.length, 2, "auth refusal does not invent a provider-wide lifetime");
  await h.advance(14590);
  assert.equal((await refused).status, status, "body timeout preserves auth status and never retries");
  const fresh = rawRequest(h, 3); await h.flush(); await h.advance(10); await fresh;
  assert.equal(h.calls.length, 3);
  assert.equal(h.timers.size, 0);
});


test("429 header microtasks interleaved with a waking pacing reservation cannot pass the final start gate", async () => {
  for (let hops = 0; hops < 12; hops++) {
    let headers, known = false, lateStarts = 0;
    const h = overlapHarness(url => {
      if (url === rawURL(1)) return { status: 429, retryAfter: "60", delay: null,
        headersReady: resolve => { headers = resolve; }, headerRead: () => { known = true; } };
      if (known) lateStarts++;
      return { delay: 10 };
    }, ms => {
        if (ms !== 400) return;
        let pending = Promise.resolve();
        for (let i = 0; i < hops; i++) pending = pending.then(() => {});
        pending.then(headers);
      });
    const jobs = [rawRequest(h, 1), rawRequest(h, 2)].map(p => p.catch(e => e));
    await h.flush(); await h.advance(400);
    // Some orders legitimately start before headers are delivered. In every
    // order, once headers publish their window a third start must be blocked.
    assert.equal(known, true);
    assert.equal(lateStarts, 0, `pacing wake must not cross a published throttle, microtask offset ${hops}`);
    const before = h.calls.length;
    const third = rawRequest(h, 3).catch(e => e);
    await h.flush(); await h.advance(800);
    assert.equal(h.calls.length, before, `no start after known throttle, microtask offset ${hops}`);
    h.api.cancelAll();
    assert.ok((await Promise.all([...jobs, third])).every(e => e.cancelled || Array.isArray(e)));
    assert.equal(h.timers.size, 0);
  }
});

test("RACE IT caches bulk positions without serializing them and fresh bypasses that cache", async () => {
  const big = Array.from({ length: 10000 }, (_, i) => ({ driver_number: i % 22 + 1,
    position: i % 22 + 1, date: "2026-10-01T12:00:00.000Z" }));
  const h = routeHarness({ "/position?": { status: 200, body: big } });
  const serialized = [];
  h.context.JSON = { parse: JSON.parse, stringify(value) {
    if (value && Array.isArray(value.data) && value.data.length === big.length) serialized.push(value);
    return JSON.stringify(value);
  } };
  evalRealRace(h.context, ";globalThis.realRace=DataRealRace");
  const first = await h.context.realRace.fetchRaw(123, false);
  assert.equal(first.positions.length, big.length);
  assert.equal(serialized.length, 0, "the bulk history never reaches JSON.stringify");
  assert.equal(h.store.has("apex26.api.https://api.openf1.org/v1/position?session_key=123"), false);
  const positionCalls = () => h.calls.filter((url) => url.includes("/position?")).length;
  const second = await h.context.realRace.fetchRaw(123, false);
  assert.equal(second.positions, first.positions, "same parsed object reused from memory");
  assert.equal(positionCalls(), 1);
  // Separate provider windows: this test is about cache policy, not quota pacing.
  h.tick(60001);
  await h.context.realRace.fetchRaw(123, true);
  assert.equal(positionCalls(), 2, "explicit refresh still downloads positions");
  assert.equal(serialized.length, 0);
});

test("memory-only cache retains stale fallback, auth refusal, LRU and explicit invalidation", async () => {
  const url = "https://api.openf1.org/v1/position?session_key=7";
  const key = "apex26.api." + url, policy = { cache: "memory" }, ttl = 1000;
  let reply = { status: 200, body: [{ position: 1 }] };
  const h = routeHarness({ "/position?": () => reply });
  h.store.set(key, JSON.stringify({ t: h.now() - ttl - 1, data: [{ position: 20 }] }));
  const first = await h.api.request(url, ttl, policy);
  assert.equal(h.store.has(key), false, "successful memory write removes older disk copy");
  assert.equal(await h.api.request(url, ttl, policy), first);
  h.tick(ttl + 1); reply = "offline";
  const mark = h.api.staleMark();
  assert.equal(await h.api.request(url, ttl, policy), first);
  assert.notEqual(h.api.staleSince(mark), null);
  reply = { status: 403, body: { detail: "forbidden" } };
  await assert.rejects(h.api.request(url, ttl, policy), (e) => e.status === 403);
  reply = { status: 200, body: [{ position: 2 }] };
  for (let i = 0; i < 4; i++) await h.api.request(url + i, ttl, policy);
  reply = "offline";
  await assert.rejects(h.api.request(url, ttl, policy), "oldest memory entry was evicted");
  h.api.forget(url + 3);
  await assert.rejects(h.api.request(url + 3, ttl, policy), "forget clears memory too");
});

test("memory-only requests deduplicate by policy and detach after cancellation", async () => {
  const h = cancelHarness();
  const url = "https://api.openf1.org/v1/position?session_key=7";
  const first = h.api.request(url, 0, { cache: "memory" });
  const duplicate = h.api.request(url, 0, { cache: "memory" });
  const disk = h.api.request(url, 0);
  assert.equal(first, duplicate);
  assert.notEqual(first, disk, "different write policies cannot inherit each other's in-flight job");
  const outcomes = Promise.all([first, duplicate, disk].map((p) => p.catch((e) => e)));
  await h.settle();
  h.api.cancelAll();
  for (const error of await outcomes) assert.equal(error.cancelled, true);
  const fresh = h.api.request(url, 0, { cache: "memory" });
  await h.settle(); await h.fireTimers();
  assert.equal((await fresh)[0].rainfall, 3);
  assert.equal(h.calls.length, 2, "cancelled queued disk request never fetched; reopened request did");
});


test("a 30-day Retry-After date keeps its full pause using bounded cancellable timer chunks", async () => {
  const pauseMs = 30 * 24 * 60 * 60 * 1000;
  const h = overlapHarness(url => url === rawURL(1)
    ? { status: 429, retryAfter: new Date(1_000_000 + pauseMs).toUTCString(), delay: 0 }
    : { delay: 0 }, ms => assert.ok(Number.isFinite(ms) && ms >= 0 && ms <= 90000,
      "every fired timer uses a safe bounded delay"));
  const failed = rawRequest(h, 1).catch(e => e), pending = rawRequest(h, 2).catch(e => e);
  await h.flush(); await h.advance(400);
  assert.equal((await failed).retryAfterMs, pauseMs);
  const safeTimers = () => {
    for (const timer of h.timers.values()) {
      assert.ok(timer.at - h.now > 0 && timer.at - h.now <= 90000,
        "every remaining pause chunk is finite, positive and below the platform timer limit");
    }
  };
  safeTimers();
  await h.advance(90000); safeTimers();
  assert.equal(h.calls.length, 1, "the long window never becomes an overflowed immediate timer");
  h.api.cancelAll(); assert.equal((await pending).cancelled, true);
  assert.equal(h.timers.size, 0);
  const reopened = rawRequest(h, 3); await h.flush(); safeTimers();
  // Virtual time exercises every bounded chunk through the original deadline.
  await h.advance(pauseMs - (h.now - 1_000_000) - 1); safeTimers();
  assert.equal(h.calls.length, 1, "cancel/reopen retains the valid long server window");
  await h.advance(1); await reopened;
  assert.equal(h.calls[1].at, 1_000_000 + pauseMs);
  assert.equal(h.timers.size, 0);
});

test("a finite Retry-After seconds value that overflows milliseconds cannot install an infinite pause", async () => {
  const h = overlapHarness(url => url === rawURL(1)
    ? { status: 429, retryAfter: "1e308", delay: 0 } : { delay: 0 });
  const failed = rawRequest(h, 1).catch(e => e), sibling = rawRequest(h, 2);
  await h.flush(); await h.advance(400); await sibling;
  assert.equal(h.calls.length, 2, "nonfinite converted milliseconds are ignored");
  h.api.cancelAll(); assert.equal((await failed).cancelled, true);
  assert.equal(h.timers.size, 0);
  const reopened = rawRequest(h, 3); await h.flush(); await h.advance(400); await reopened;
  assert.equal(h.calls.length, 3, "invalid header cannot leave a permanent provider pause");
  assert.equal(h.timers.size, 0);
});

test("driverStandings refuses a body whose StandingsLists season disagrees with the asked year", async () => {
  const body = {
    MRData: {
      StandingsTable: {
        StandingsLists: [{
          season: "2025",
          round: "24",
          DriverStandings: [{
            position: "1", points: "99", wins: "3",
            Driver: { givenName: "Max", familyName: "Verstappen", code: "VER", permanentNumber: "1" },
            Constructors: [{ name: "Red Bull Racing" }]
          }]
        }]
      }
    }
  };
  const warns = [];
  const context = vm.createContext({
    fetch: async () => ({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => body, text: async () => JSON.stringify(body)
    }),
    AbortController, Date, setTimeout, clearTimeout,
    localStorage: { length: 0, getItem: () => null, setItem() {}, key: () => null, removeItem() {} }
  });
  seedLog(context);
  context.Log.warn = function (ch, msg) { warns.push([ch, msg]); };
  vm.runInContext(apiSource + ";globalThis.api=F1API", context, { filename: absSrc("js/data/api.js") });
  const mismatched = await context.api.driverStandings(2026);
  // Length pin (not deepEqual []): VM-realm arrays fail host deepStrictEqual.
  assert.equal(mismatched.length, 0, "wrong-season body must not paint as this year's table");
  assert.ok(warns.some((w) => /standings season mismatch/.test(String(w[1]))));
  body.MRData.StandingsTable.StandingsLists[0].season = "2026";
  // Same URL was cached with the mismatched body — drop it so the OK season is fetched.
  const driverUrl = "https://api.jolpi.ca/ergast/f1/2026/driverstandings.json";
  context.api.forget(driverUrl);
  const ok = await context.api.driverStandings(2026);
  assert.equal(ok.length, 1);
  assert.equal(ok[0].code, "VER");
  // A list with no season field stays accepted (legacy / truncated bodies).
  delete body.MRData.StandingsTable.StandingsLists[0].season;
  context.api.forget(driverUrl);
  const legacy = await context.api.driverStandings(2026);
  assert.equal(legacy.length, 1);
});

test("constructorStandings also refuses a mismatched StandingsLists season", async () => {
  const body = {
    MRData: {
      StandingsTable: {
        StandingsLists: [{
          season: "2024",
          ConstructorStandings: [{ position: "1", points: "860", wins: "9", Constructor: { name: "McLaren" } }]
        }]
      }
    }
  };
  const context = vm.createContext({
    fetch: async () => ({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => body, text: async () => JSON.stringify(body)
    }),
    AbortController, Date, setTimeout, clearTimeout,
    localStorage: { length: 0, getItem: () => null, setItem() {}, key: () => null, removeItem() {} }
  });
  seedLog(context);
  vm.runInContext(apiSource + ";globalThis.api=F1API", context, { filename: absSrc("js/data/api.js") });
  assert.equal((await context.api.constructorStandings(2026)).length, 0);
  body.MRData.StandingsTable.StandingsLists[0].season = "2026";
  context.api.forget("https://api.jolpi.ca/ergast/f1/2026/constructorstandings.json");
  const ok = await context.api.constructorStandings(2026);
  assert.equal(ok[0].name, "McLaren");
});
