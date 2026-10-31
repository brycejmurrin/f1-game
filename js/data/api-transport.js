/* Apex 26 — paced API transport: bounded bodies, cache, timeouts, retries and cancellation. */
const F1Transport = (function () {
  "use strict";

  // The adapter owns platform resources; policy below receives only capabilities.
  // fetch resolves at headers, so an attempt owns its deadline through body read.
  function createEffects() {
    const controllers = new Set(), waits = new Set();
    function attempt(url, deadlineMs, consume) {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      if (controller) controllers.add(controller);
      let timer, onAbort;
      const timeout = new Promise(function (_resolve, reject) {
        timer = setTimeout(function () {
          reject(new Error("Request timed out for " + url));
          if (controller) controller.abort();
        }, deadlineMs);
      });
      const cancelled = controller ? new Promise(function (_resolve, reject) {
        onAbort = function () { reject(cancelledError(url)); };
        controller.signal.addEventListener("abort", onAbort, { once: true });
      }) : null;
      let network;
      try {
        network = Promise.resolve(fetch(url, controller ? { signal: controller.signal } : undefined)).then(consume);
      } catch (e) { network = Promise.reject(e); }
      // Even a broken fetch/body that ignores abort must release capacity.
      return Promise.race(cancelled ? [network, timeout, cancelled] : [network, timeout]).finally(function () {
        clearTimeout(timer);
        if (controller) {
          controller.signal.removeEventListener("abort", onAbort);
          controllers.delete(controller);
        }
      });
    }
    function wait(ms, url) {
      return new Promise(function (resolve, reject) {
        const cancel = function () {
          clearTimeout(timer); waits.delete(cancel); reject(cancelledError(url));
        };
        const timer = setTimeout(function () { waits.delete(cancel); resolve(); }, ms);
        waits.add(cancel);
      });
    }
    function cancelAll() {
      waits.forEach(function (cancel) { cancel(); });
      let aborted = 0;
      controllers.forEach(function (controller) {
        try { controller.abort(); aborted++; } catch (e) { /* already settled */ }
      });
      controllers.clear();
      return aborted;
    }
    return {
      attempt, wait, cancelAll,
      now: function () { return Date.now(); },
      read: function (key) { return localStorage.getItem(key); },
      write: function (key, value) { localStorage.setItem(key, value); },
      remove: function (key) { localStorage.removeItem(key); },
      keys: function () {
        const keys = [], n = localStorage.length;
        for (let i = 0; i < n; i++) keys.push(localStorage.key(i));
        return keys;
      },
      info: function (message) { Log.info("data", message); },
      warn: function (...args) { Log.warn("data", ...args); }
    };
  }

  function cancelledError(url) {
    const error = new Error("Cancelled request for " + url);
    error.cancelled = true;
    return error;
  }

  function create(OPENF1, TTL_HISTORIC) {
    return createTransport(OPENF1, TTL_HISTORIC, createEffects());
  }

  /** @param {ReturnType<typeof createEffects>} effects */
  function createTransport(OPENF1, TTL_HISTORIC, effects) {
    const CACHE_PREFIX = "apex26.api.";
    const CACHE_MAX_CHARS = 256 * 1024;
    const MIN_GAP_MS = 400;
    const MAX_RETRY = 2;         // retries on 429 / 5xx before giving up
    const RETRY_BASE_MS = 10000; // 10 s first retry — OpenF1 rate-limits hard; short
    const RETRY_CAP_MS = 25000;  //   delays only eat more quota, so wait longer
    // Retry-After is honoured AS SENT up to this ceiling. OpenF1 commonly asks
    // for 60 s, and a 25 s clamp fires both retries INSIDE that window —
    // two more 429s, quota burned, nothing gained. Past the ceiling the request
    // fails fast instead (stale cache if there is one): that is what a tab can
    // act on; a 90 s+ sleep behind a spinner is not.
    const RETRY_AFTER_MAX_MS = 90000;
    const FETCH_TIMEOUT_MS = 15000;
    const MAX_ACTIVE = 2;                 // bound response bodies independently of start-rate pacing

    const MINUTE = 60 * 1000;
    const CACHE_SWEEP_MS = 5 * MINUTE;     // a response batch must not rescan localStorage per item

    // OpenF1's minute budget must not block an unrelated Jolpica request.
    const openF1Lane = { queue: Promise.resolve(), lastNetAt: 0, pauseUntil: 0, active: new Set() };
    const otherLane = { queue: Promise.resolve(), lastNetAt: 0, pauseUntil: 0, active: new Set() };
    // OPENF1'S FREE TIER IS 30 REQUESTS A MINUTE (and 3/s — https://openf1.org/).
    // MIN_GAP_MS alone allowed ~150/min: a 4-lane TELEMETRY compare is ~18
    // requests, two in a minute tripped 429s whose +10 s/+20 s retries landed in
    // the same window, and the tab showed "Couldn't load telemetry." A sliding
    // window holds OpenF1 under the cap instead.
    const OPENF1_PER_MIN = 28, _of1Recent = [];
    let netGen = 0;                       // bumped by cancelAll(); a request born before it is stale
    const pendingWaits = new Set();       // policy-only capacity reservations (adapter owns timer waits)
    const inFlight = new Map();           // generation + cache policy + URL -> shared request Promise
    const failWarnAt = Object.create(null); // endpoint name -> last Log.warn ms
    const FAIL_WARN_MS = 30 * 1000;
    let lastCacheSweepAt = -Infinity;
    // Bodies over CACHE_MAX_CHARS (/position, long car_data windows) skip
    // localStorage; a few are kept here so a revisit inside the TTL is no refetch.
    const MEM_MAX = 4;
    const memCache = new Map();           // URL -> {t, data}, insertion order = LRU order
    // Each stale-cache serve (refetch failed, older copy returned) is logged as
    // {seq, t} so a tab can stamp its footnote with the copy's age (#2190).
    let staleSeq = 0;
    const staleLog = [];

    // Cached payloads serialize as {"t":<ms>,"data":…} — t first — so sweeps can
    // read the timestamp with a prefix match instead of JSON.parsing every
    // multi-MB response body. Legacy/corrupt entries fall back to a full parse.
    function cacheEntryT(raw) {
      if (typeof raw !== "string") return null;
      const m = /^\{"t":(\d+)[,}]/.exec(raw);
      if (m) return +m[1];
      try {
        const obj = JSON.parse(raw);
        return obj && typeof obj.t === "number" ? obj.t : null;
      } catch (e) { return null; }
    }

    function purgeExpiredCache(maxAge) {
      if (maxAge == null) maxAge = TTL_HISTORIC;
      let removed = 0;
      try {
        const keys = effects.keys();
        const now = effects.now();
        const doomed = [];
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          if (!key || key.indexOf(CACHE_PREFIX) !== 0) continue;
          const t = cacheEntryT(effects.read(key));
          if (t == null || (now - t) > maxAge || t > now) doomed.push(key);   // future-stamped = clock skew, not fresh
        }
        for (let i = 0; i < doomed.length; i++) {
          try { effects.remove(doomed[i]); removed++; } catch (e) { /* ignore */ }
        }
      } catch (e) { /* no storage */ }
      return removed;
    }

    // Quota fallback. Evict what is actually eating the quota: windowed
    // telemetry bodies (car_data / location — tens of KB per lap, cached 7 d)
    // go first, largest first; everything else follows oldest first. Pure age
    // order evicted the small, fresh schedule / standings entries that sit
    // between telemetry laps while the laps themselves survived the purge.
    function purgeOldestCache(count) {
      let removed = 0;
      try {
        const entries = [];
        const keys = effects.keys();
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          if (!key || key.indexOf(CACHE_PREFIX) !== 0) continue;
          const raw = effects.read(key);
          const t = cacheEntryT(raw);   // null (corrupt) → oldest
          entries.push({
            key, t: t || 0,
            size: typeof raw === "string" ? raw.length : 0,
            telem: /\/(car_data|location)\?/.test(key)
          });
        }
        entries.sort(function (a, b) {
          if (a.telem !== b.telem) return a.telem ? -1 : 1;
          if (a.telem) return b.size - a.size;
          return a.t - b.t;
        });
        const n = Math.min(count || 8, entries.length);
        for (let i = 0; i < n; i++) {
          try { effects.remove(entries[i].key); removed++; } catch (e) { /* ignore */ }
        }
      } catch (e) { /* no storage */ }
      return removed;
    }

    function readCache(url) {
      const mem = memCache.get(url);
      if (mem) { memCache.delete(url); memCache.set(url, mem); return mem; }
      try {
        const raw = effects.read(CACHE_PREFIX + url);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (obj && typeof obj.t === "number" && Object.prototype.hasOwnProperty.call(obj, "data")) return obj;
      } catch (e) { /* corrupt entry / no storage: ignore */ }
      return null;
    }

    function writeMemory(url, data) {
      memCache.delete(url);
      memCache.set(url, { t: effects.now(), data });
      while (memCache.size > MEM_MAX) memCache.delete(memCache.keys().next().value);
      try { effects.remove(CACHE_PREFIX + url); } catch (e) { /* no storage */ }
    }

    function writeCache(url, data, memoryOnly) {
      // Known bulk histories never need a temporary full JSON string merely to
      // discover that they exceed the disk budget. Keep normal cache semantics.
      if (memoryOnly) { writeMemory(url, data); return; }
      const key = CACHE_PREFIX + url;
      const payload = JSON.stringify({ t: effects.now(), data });
      // A multi-MB body (/position, car_data) would take the origin's whole
      // localStorage quota from the game's own saves: keep it in memory only,
      // and drop an older small disk copy so it cannot stand in as the stale fallback.
      if (payload.length > CACHE_MAX_CHARS) {
        writeMemory(url, data);
        return;
      }
      memCache.delete(url);
      const now = effects.now();
      let swept = false;
      if (now - lastCacheSweepAt >= CACHE_SWEEP_MS) {
        purgeExpiredCache();
        lastCacheSweepAt = now;
        swept = true;
      }
      try {
        effects.write(key, payload);
        return;
      } catch (e) {
        effects.warn("apex26: api cache write failed (quota?)", e);
      }
      if (!swept) purgeExpiredCache();   // just ran above? once is enough
      purgeOldestCache(16);
      try {
        effects.write(key, payload);
      } catch (e2) {
        effects.warn("apex26: api cache write still failing after purge", e2);
      }
    }

    function endpointName(url) {
      const noQ = String(url || "").split("?")[0];
      if (/driverstandings/i.test(noQ)) return "driverstandings";
      if (/constructorstandings/i.test(noQ)) return "constructorstandings";
      if (/\/last\/results/i.test(noQ)) return "last-results";
      if (/\/meetings/i.test(noQ)) return "meetings";
      if (/\/sessions/i.test(noQ)) return "sessions";
      if (/\/position/i.test(noQ)) return "position";
      if (/\/intervals/i.test(noQ)) return "intervals";
      if (/\/drivers/i.test(noQ)) return "drivers";
      if (/\/laps/i.test(noQ)) return "laps";
      if (/\/car_data/i.test(noQ)) return "car_data";
      if (/\/location/i.test(noQ)) return "location";
      if (/\/stints/i.test(noQ)) return "stints";
      // `/pit?session_key=…` is the real OpenF1 path (pits() below); the old
      // /\/pits/ never matched it, so every pit fetch logged under the generic tail.
      if (/\/pits?(\/|$)/i.test(noQ)) return "pits";
      if (/\/weather/i.test(noQ)) return "weather";
      if (/\d{4}\.json$/i.test(noQ)) return "schedule";
      const last = noQ.split("/").filter(Boolean).pop() || "api";
      return last.replace(/\.json$/i, "").slice(0, 32);
    }

    // Own the entire attempt, including reading/parsing the body. fetch() itself
    // resolves at headers; timing only that Promise leaves a stalled response
    // body holding its provider's queue slot forever.
    function fetchTimed(url, lane, consume) {
      const myGen = netGen;
      let responseError = null;
      return effects.attempt(url, FETCH_TIMEOUT_MS, function (res) {
        // Remember failure headers BEFORE awaiting the body. A rejected body
        // or the original attempt deadline must not turn a known 401/403
        // into an offline error eligible for stale-cache fallback.
        if (!res.ok) {
          responseError = httpError(url, res);
          // Publish exposed throttle windows at headers, even when the error
          // body stalls. Cancellation does not erase the server's window;
          // late headers from an obsolete attempt cannot extend it.
          if (myGen === netGen && responseError.status === 429 && responseError.retryAfterMs > 0) {
            lane.pauseUntil = Math.max(lane.pauseUntil, effects.now() + responseError.retryAfterMs);
          }
        }
        return consume(res, responseError);
      }).catch(function (err) {
        if (!responseError || (err && err.cancelled) || err === responseError) throw err;
        // Wrap rather than mutate a body implementation's rejection (which
        // may be primitive or frozen). Keep timeout/body diagnostics as well
        // as the response's authoritative retry policy.
        const failure = new Error(err && err.message ? err.message : responseError.message);
        failure.status = responseError.status;
        failure.retryAfterMs = responseError.retryAfterMs;
        failure.cause = err;
        throw failure;
      });
    }

    function httpError(url, res) {
      const err = new Error("HTTP " + res.status + " for " + url);
      err.status = res.status;
      err.retryAfterMs = 0;
      // Retry-After is not CORS-safelisted: absent unless the provider exposes
      // it. Honour exposed seconds / HTTP-date as sent; request() applies the
      // existing ceiling instead of retrying inside the server's quota window.
      const hdr = res.headers && res.headers.get && res.headers.get("retry-after");
      let ra = parseFloat(hdr);
      if (!isFinite(ra) && hdr) ra = (Date.parse(hdr) - effects.now()) / 1000;
      const retryMs = Math.round(ra * 1000);
      if (isFinite(retryMs) && retryMs > 0 && isFinite(effects.now() + retryMs)) err.retryAfterMs = retryMs;
      return err;
    }

    // Single attempt: status/error handling only. Retries live in request(), where
    // the backoff sleep happens OUTSIDE the provider's queue slot — inside it, one
    // 429 stalled every other endpoint behind up to ~75 s of pure sleeping
    // (2 × 10-20 s backoff + 3 × 15 s timeouts on the shared chain).
    function fetchOnce(url, lane) {
      lane.lastNetAt = effects.now();
      // Count actual attempts, never a reservation cancelled during pacing.
      if (lane === openF1Lane) _of1Recent.push(lane.lastNetAt);
      return fetchTimed(url, lane, function (res, httpErr) {
        if (!res.ok) {
          return res.text().then(function (txt) {
            try {
              const j = JSON.parse(txt);
              // OpenF1 answers a query with no data yet as HTTP 404
              // {"detail":"No results found."} — an empty answer, not a failure.
              if (res.status === 404 && j && /no results found/i.test(String(j.detail || ""))) return [];
              // JSON null / a non-JSON body keeps the generic HTTP message.
              if (j && (j.detail || j.error)) httpErr.message = String(j.detail || j.error);
            } catch (e) {
              if (!(e instanceof SyntaxError)) throw e;
            }
            throw httpErr;
          });
        }
        return res.json();
      });
    }

    function warnFetchFail(name, kind) {
      const now = effects.now();
      if (now - (failWarnAt[name] || 0) < FAIL_WARN_MS) return;
      failWarnAt[name] = now;
      effects.warn("fetch " + name + " fail" + (kind ? " " + kind : ""));
    }

    function waitForRequest(ms, url) { return effects.wait(ms, url); }

    function waitForCapacity(lane, url) {
      if (lane.active.size < MAX_ACTIVE) return null;
      let cancel;
      const cancelled = new Promise(function (_resolve, reject) {
        cancel = function () { reject(cancelledError(url)); };
        pendingWaits.add(cancel);
      });
      return Promise.race([Promise.race(lane.active), cancelled]).finally(function () {
        pendingWaits.delete(cancel);
      });
    }

    function request(url, ttl, options) {
      const myGen = netGen;
      const lane = url.indexOf(OPENF1) === 0 ? openF1Lane : otherLane;
      // false bypasses both tiers; "memory" keeps TTL/stale reuse but skips
      // disk writes. Existing disk entries may still satisfy either cached tier.
      const cachePolicy = options && options.cache === false ? "network" :
        options && options.cache === "memory" ? "memory" : "cache";
      const cache = cachePolicy !== "network";
      const quiet = ttl <= 0 || (options && options.cache === false);
      const name = endpointName(url);
      const hit = cache ? readCache(url) : null;
      // age < 0 is an entry stamped by a clock that has since been stepped back:
      // it would read as fresh for as long as the skew lasts, so refetch instead.
      const age = hit ? effects.now() - hit.t : 0;
      if (ttl > 0 && hit && age >= 0 && age < ttl) return Promise.resolve(hit.data);
      // The queue paces network hits; it must not turn two callers for the same
      // resource into two sequential hits. Cache policy is part of the key so a
      // live delta request never inherits stale fallback from a cached request.
      // Generation is part of it so work started after cancelAll() can never
      // attach to the cancelled Promise from the closed hub.
      const flightKey = myGen + "|" + cachePolicy + "|" + url;
      const shared = inFlight.get(flightKey);
      if (shared) return shared;

      // Only capacity/start reservations are serialized. Each attempt owns its
      // body until settlement, with at most MAX_ACTIVE bodies per provider.
      // Backoff sleeps hold neither a reservation nor response capacity.
      // A cancelAll() between any two of these checks drops the request: a
      // queued one never waits or fetches, an aborted one never retries or
      // sleeps, a late completion never reaches the caller.
      function startAfterProviderGate() {
        if (myGen !== netGen) throw cancelledError(url);
        const wait = lane.pauseUntil - effects.now();
        // Check and start in one callback: headers can arrive between any two
        // Promise reactions, including after a pacing reservation wakes.
        // Browser timers overflow above the signed 32-bit delay range.
        // Keep the server deadline, but revisit it in cancellable chunks.
        if (wait > 0) return waitForRequest(Math.min(wait, RETRY_AFTER_MAX_MS), url).then(startAfterProviderGate);
        const work = fetchOnce(url, lane);
        const release = function () { lane.active.delete(owned); };
        const owned = work.then(release, release);
        lane.active.add(owned);
        // Keep body settlement outside the serialized start chain.
        return { work };
      }

      function attempt(n) {
        const reservation = lane.queue
          .then(function () {
            if (myGen !== netGen) throw cancelledError(url);
            return waitForCapacity(lane, url);
          })
          .then(function () {
            if (myGen !== netGen) throw cancelledError(url);
            let wait = lane.lastNetAt + MIN_GAP_MS - effects.now();
            if (lane === openF1Lane) {
              const now = effects.now();
              while (_of1Recent.length && now - _of1Recent[0] >= 60000) _of1Recent.shift();
              if (_of1Recent.length >= OPENF1_PER_MIN) wait = Math.max(wait, _of1Recent[0] + 60000 - now + 50);
            }
            if (wait > 0) return waitForRequest(wait, url);
            return null;
          })
          .then(startAfterProviderGate);
        lane.queue = reservation.then(function () {}, function () {});
        return reservation.then(function (started) { return started.work; }).catch(function (err) {
          if (myGen !== netGen) throw cancelledError(url);
          const status = err && err.status;
          if ((status === 429 || (status >= 500 && status < 600)) && n < MAX_RETRY) {
            const ra = (err && err.retryAfterMs) || 0;
            if (ra > RETRY_AFTER_MAX_MS) throw err;   // server wants longer than a tab will wait: fail fast, same error shape
            const back = ra || Math.min(RETRY_BASE_MS * Math.pow(2, n), RETRY_CAP_MS);
            return waitForRequest(back, url).then(function () { return attempt(n + 1); });
          }
          throw err;
        });
      }

      const job = attempt(0)
        .then(function (json) {
          if (myGen !== netGen) throw cancelledError(url);
          if (cache) writeCache(url, json, cachePolicy === "memory");
          if (!quiet) effects.info("fetch " + name + " ok");
          return json;
        })
        .catch(function (err) {
          if (err && err.cancelled) throw err;   // asked for: no stale-cache fallback, no fail warning
          // Never paper over live-session auth lockouts with stale cache — that
          // makes LIVE look "updated" while silently serving old classification.
          const msg = (err && err.message) || "";
          const status = err && err.status;
          if (hit && status !== 401 && status !== 403 && msg.indexOf("Live F1 session") === -1 && msg.indexOf("HTTP 401") === -1 && msg.indexOf("HTTP 403") === -1) {
            warnFetchFail(name, "stale");
            staleLog.push({ seq: ++staleSeq, t: hit.t });
            if (staleLog.length > 64) staleLog.shift();
            return hit.data;
          }
          warnFetchFail(name, "");
          throw err;
        });

      inFlight.set(flightKey, job);
      const forget = function () {
        if (inFlight.get(flightKey) === job) inFlight.delete(flightKey);
      };
      job.then(forget, forget);
      return job;
    }

    // Drop every request born before now: cancel pacing/backoff waits and
    // abort fetches. Queued / late-completing work fails its generation check.
    // Keep actual attempt timestamps: reopening never resets server quotas.
    function cancelAll() {
      netGen++;
      // A reopen must create fresh work immediately, even while the aborted
      // Promise is still unwinding through fetch/queue cleanup.
      inFlight.clear();
      pendingWaits.forEach(function (cancel) { cancel(); });
      const aborted = effects.cancelAll();
      if (aborted) effects.info("api cancelAll aborted " + aborted);
      return aborted;
    }

    // staleMark() before a load, staleSince(mark) after it: the oldest
    // stale-copy time served in between, or null when every answer was fresh.
    function staleMark() { return staleSeq; }
    function staleSince(mark) {
      let t = null;
      for (let i = 0; i < staleLog.length; i++) {
        if (staleLog[i].seq > mark && (t === null || staleLog[i].t < t)) t = staleLog[i].t;
      }
      return t;
    }

    /** Drop one URL from BOTH caches. A body over CACHE_MAX_CHARS lives only in memCache, so clearing
     *  localStorage alone leaves it served until the page reloads (an unfinished race's /position grid). */
    function forget(url) {
      memCache.delete(url);
      try { effects.remove(CACHE_PREFIX + url); } catch (e) { /* no storage */ }
    }

    return { request, cancelAll, cacheEntryT, staleMark, staleSince, forget };
  }

  return { create };
})();
Object.freeze(F1Transport);
