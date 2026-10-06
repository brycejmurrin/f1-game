/* Apex 26 — serialized API transport: cache, rate limits, timeouts, retries and cancellation. */
const F1Transport = (function () {
  "use strict";

  function create(OPENF1, TTL_HISTORIC) {
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

    const MINUTE = 60 * 1000;
    const CACHE_SWEEP_MS = 5 * MINUTE;     // a response batch must not rescan localStorage per item

    // OpenF1's minute budget must not block an unrelated Jolpica request.
    const openF1Lane = { queue: Promise.resolve(), lastNetAt: 0 };
    const otherLane = { queue: Promise.resolve(), lastNetAt: 0 };
    // OPENF1'S FREE TIER IS 30 REQUESTS A MINUTE (and 3/s — https://openf1.org/).
    // MIN_GAP_MS alone allowed ~150/min: a 4-lane TELEMETRY compare is ~18
    // requests, two in a minute tripped 429s whose +10 s/+20 s retries landed in
    // the same window, and the tab showed "Couldn't load telemetry." A sliding
    // window holds OpenF1 under the cap instead.
    const OPENF1_PER_MIN = 28, _of1Recent = [];
    let netGen = 0;                       // bumped by cancelAll(); a request born before it is stale
    const liveControllers = new Set();    // AbortControllers of fetches on the wire
    const pendingWaits = new Set();       // cancellation hooks for pacing / retry sleeps
    const inFlight = new Map();           // generation + cache policy + URL -> shared request Promise
    const failWarnAt = Object.create(null); // endpoint name -> last Log.warn ms
    const FAIL_WARN_MS = 30 * 1000;
    let lastCacheSweepAt = -Infinity;

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
        if (typeof localStorage === "undefined" || localStorage == null) return 0;
        const n = localStorage.length;
        if (typeof n !== "number") return 0;
        const now = Date.now();
        const doomed = [];
        for (let i = 0; i < n; i++) {
          const key = localStorage.key(i);
          if (!key || key.indexOf(CACHE_PREFIX) !== 0) continue;
          const t = cacheEntryT(localStorage.getItem(key));
          if (t == null || (now - t) > maxAge || t > now) doomed.push(key);   // future-stamped = clock skew, not fresh
        }
        for (let i = 0; i < doomed.length; i++) {
          try { localStorage.removeItem(doomed[i]); removed++; } catch (e) { /* ignore */ }
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
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || key.indexOf(CACHE_PREFIX) !== 0) continue;
          const raw = localStorage.getItem(key);
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
          try { localStorage.removeItem(entries[i].key); removed++; } catch (e) { /* ignore */ }
        }
      } catch (e) { /* no storage */ }
      return removed;
    }

    function readCache(url) {
      try {
        const raw = localStorage.getItem(CACHE_PREFIX + url);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (obj && typeof obj.t === "number" && Object.prototype.hasOwnProperty.call(obj, "data")) return obj;
      } catch (e) { /* corrupt entry / no storage: ignore */ }
      return null;
    }

    function writeCache(url, data) {
      const key = CACHE_PREFIX + url;
      const payload = JSON.stringify({ t: Date.now(), data });
      // A multi-MB body (/position, car_data) would take the origin's whole
      // localStorage quota from the game's own saves: keep it in memory only.
      if (payload.length > CACHE_MAX_CHARS) return;
      const now = Date.now();
      let swept = false;
      if (now - lastCacheSweepAt >= CACHE_SWEEP_MS) {
        purgeExpiredCache();
        lastCacheSweepAt = now;
        swept = true;
      }
      try {
        localStorage.setItem(key, payload);
        return;
      } catch (e) {
        Log.warn("data", "apex26: api cache write failed (quota?)", e);
      }
      if (!swept) purgeExpiredCache();   // just ran above? once is enough
      purgeOldestCache(16);
      try {
        localStorage.setItem(key, payload);
      } catch (e2) {
        Log.warn("data", "apex26: api cache write still failing after purge", e2);
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
    function fetchTimed(url, consume) {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      if (controller) liveControllers.add(controller);
      let timer = null;
      let onAbort = null;
      let responseError = null;
      const timeout = new Promise(function (_resolve, reject) {
        timer = setTimeout(function () {
          reject(new Error("Request timed out for " + url));
          if (controller) controller.abort();
        }, FETCH_TIMEOUT_MS);
      });
      const cancelled = controller ? new Promise(function (_resolve, reject) {
        onAbort = function () { reject(cancelledError(url)); };
        controller.signal.addEventListener("abort", onAbort, { once: true });
      }) : null;
      let network;
      try {
        network = Promise.resolve(fetch(url, controller ? { signal: controller.signal } : undefined)).then(function (res) {
          // Remember failure headers BEFORE awaiting the body. A rejected body
          // or the original attempt deadline must not turn a known 401/403
          // into an offline error eligible for stale-cache fallback.
          if (!res.ok) responseError = httpError(url, res);
          return consume(res, responseError);
        });
      }
      catch (e) { network = Promise.reject(e); }
      // Promise.race is intentional even with AbortController: a broken fetch
      // or body implementation that ignores abort must release its provider queue.
      return Promise.race(cancelled ? [network, timeout, cancelled] : [network, timeout]).catch(function (err) {
        if (!responseError || (err && err.cancelled) || err === responseError) throw err;
        // Wrap rather than mutate a body implementation's rejection (which
        // may be primitive or frozen). Keep timeout/body diagnostics as well
        // as the response's authoritative retry policy.
        const failure = new Error(err && err.message ? err.message : responseError.message);
        failure.status = responseError.status;
        failure.retryAfterMs = responseError.retryAfterMs;
        failure.cause = err;
        throw failure;
      }).finally(function () {
        clearTimeout(timer);
        if (controller) {
          controller.signal.removeEventListener("abort", onAbort);
          liveControllers.delete(controller);
        }
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
      if (!isFinite(ra) && hdr) ra = (Date.parse(hdr) - Date.now()) / 1000;
      if (isFinite(ra) && ra > 0) err.retryAfterMs = Math.round(ra * 1000);
      return err;
    }

    // Single attempt: status/error handling only. Retries live in request(), where
    // the backoff sleep happens OUTSIDE the provider's queue slot — inside it, one
    // 429 stalled every other endpoint behind up to ~75 s of pure sleeping
    // (2 × 10-20 s backoff + 3 × 15 s timeouts on the shared chain).
    function fetchOnce(url, lane) {
      lane.lastNetAt = Date.now();
      // Count actual attempts, never a reservation cancelled during pacing.
      if (lane === openF1Lane) _of1Recent.push(lane.lastNetAt);
      return fetchTimed(url, function (res, httpErr) {
        if (!res.ok) {
          return res.text().then(function (txt) {
            try {
              const j = JSON.parse(txt);
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
      const now = Date.now();
      if (now - (failWarnAt[name] || 0) < FAIL_WARN_MS) return;
      failWarnAt[name] = now;
      Log.warn("data", "fetch " + name + " fail" + (kind ? " " + kind : ""));
    }

    function cancelledError(url) {
      const e = new Error("Cancelled request for " + url);
      e.cancelled = true;   // the shape js/data/export.js already recognises
      return e;
    }

    function waitForRequest(ms, url) {
      return new Promise(function (resolve, reject) {
        const cancel = function () {
          clearTimeout(timer); pendingWaits.delete(cancel);
          reject(cancelledError(url));
        };
        const timer = setTimeout(function () { pendingWaits.delete(cancel); resolve(); }, ms);
        pendingWaits.add(cancel);
      });
    }

    function request(url, ttl, options) {
      const myGen = netGen;
      const lane = url.indexOf(OPENF1) === 0 ? openF1Lane : otherLane;
      const cache = !options || options.cache !== false;
      const quiet = ttl <= 0 || (options && options.cache === false);
      const name = endpointName(url);
      const hit = cache ? readCache(url) : null;
      // age < 0 is an entry stamped by a clock that has since been stepped back:
      // it would read as fresh for as long as the skew lasts, so refetch instead.
      const age = hit ? Date.now() - hit.t : 0;
      if (ttl > 0 && hit && age >= 0 && age < ttl) return Promise.resolve(hit.data);
      // The queue paces network hits; it must not turn two callers for the same
      // resource into two sequential hits. Cache policy is part of the key so a
      // live delta request never inherits stale fallback from a cached request.
      // Generation is part of it so work started after cancelAll() can never
      // attach to the cancelled Promise from the closed hub.
      const flightKey = myGen + "|" + (cache ? "cache|" : "network|") + url;
      const shared = inFlight.get(flightKey);
      if (shared) return shared;

      // Each attempt claims ONE queue slot (MIN_GAP pacing included) and releases
      // it before any backoff sleep, so other endpoints proceed while this one
      // waits out a 429 — the chain stays alive per-slot, not per-job.
      // A cancelAll() between any two of these checks drops the request: a
      // queued one never waits or fetches, an aborted one never retries or
      // sleeps, a late completion never reaches the caller.
      function attempt(n) {
        const slot = lane.queue
          .then(function () {
            if (myGen !== netGen) throw cancelledError(url);
            let wait = lane.lastNetAt + MIN_GAP_MS - Date.now();
            if (lane === openF1Lane) {
              const now = Date.now();
              while (_of1Recent.length && now - _of1Recent[0] >= 60000) _of1Recent.shift();
              if (_of1Recent.length >= OPENF1_PER_MIN) wait = Math.max(wait, _of1Recent[0] + 60000 - now + 50);
            }
            if (wait > 0) return waitForRequest(wait, url);
            return null;
          })
          .then(function () {
            if (myGen !== netGen) throw cancelledError(url);
            return fetchOnce(url, lane);
          });
        lane.queue = slot.then(function () {}, function () {});
        return slot.catch(function (err) {
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
          if (cache) writeCache(url, json);
          if (!quiet) Log.info("data", "fetch " + name + " ok");
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
      let aborted = 0;
      liveControllers.forEach(function (c) {
        try { c.abort(); aborted++; } catch (e) { /* already settled */ }
      });
      liveControllers.clear();
      if (aborted) Log.info("data", "api cancelAll aborted " + aborted);
      return aborted;
    }

    return { request, cancelAll, cacheEntryT };
  }

  return { create };
})();
Object.freeze(F1Transport);
