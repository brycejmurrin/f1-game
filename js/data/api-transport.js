const F1Transport = (function () {
  "use strict";

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
        try { controller.abort(); aborted++; } catch (e) {  }
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

  function createTransport(OPENF1, TTL_HISTORIC, effects) {
    const CACHE_PREFIX = "apex26.api.";
    const CACHE_MAX_CHARS = 256 * 1024;
    const MIN_GAP_MS = 400;
    const MAX_RETRY = 2;
    const RETRY_BASE_MS = 10000;
    const RETRY_CAP_MS = 25000;
    const RETRY_AFTER_MAX_MS = 90000;
    const FETCH_TIMEOUT_MS = 15000;
    const MAX_ACTIVE = 2;

    const MINUTE = 60 * 1000;
    const CACHE_SWEEP_MS = 5 * MINUTE;

    const openF1Lane = { queue: Promise.resolve(), lastNetAt: 0, pauseUntil: 0, active: new Set() };
    const otherLane = { queue: Promise.resolve(), lastNetAt: 0, pauseUntil: 0, active: new Set() };
    const OPENF1_PER_MIN = 28, _of1Recent = [];
    let netGen = 0;
    const pendingWaits = new Set();
    const inFlight = new Map();
    const failWarnAt = Object.create(null);
    const FAIL_WARN_MS = 30 * 1000;
    let lastCacheSweepAt = -Infinity;
    const MEM_MAX = 4;
    const memCache = new Map();
    let staleSeq = 0;
    const staleLog = [];

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
          if (t == null || (now - t) > maxAge || t > now) doomed.push(key);
        }
        for (let i = 0; i < doomed.length; i++) {
          try { effects.remove(doomed[i]); removed++; } catch (e) {  }
        }
      } catch (e) {  }
      return removed;
    }

    function purgeOldestCache(count) {
      let removed = 0;
      try {
        const entries = [];
        const keys = effects.keys();
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          if (!key || key.indexOf(CACHE_PREFIX) !== 0) continue;
          const raw = effects.read(key);
          const t = cacheEntryT(raw);
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
          try { effects.remove(entries[i].key); removed++; } catch (e) {  }
        }
      } catch (e) {  }
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
      } catch (e) {  }
      return null;
    }

    function writeMemory(url, data) {
      memCache.delete(url);
      memCache.set(url, { t: effects.now(), data });
      while (memCache.size > MEM_MAX) memCache.delete(memCache.keys().next().value);
      try { effects.remove(CACHE_PREFIX + url); } catch (e) {  }
    }

    function writeCache(url, data, memoryOnly) {
      if (memoryOnly) { writeMemory(url, data); return; }
      const key = CACHE_PREFIX + url;
      const payload = JSON.stringify({ t: effects.now(), data });
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
      if (!swept) purgeExpiredCache();
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
      if (/\/pits?(\/|$)/i.test(noQ)) return "pits";
      if (/\/weather/i.test(noQ)) return "weather";
      if (/\d{4}\.json$/i.test(noQ)) return "schedule";
      const last = noQ.split("/").filter(Boolean).pop() || "api";
      return last.replace(/\.json$/i, "").slice(0, 32);
    }

    function fetchTimed(url, lane, consume) {
      const myGen = netGen;
      let responseError = null;
      return effects.attempt(url, FETCH_TIMEOUT_MS, function (res) {
        if (!res.ok) {
          responseError = httpError(url, res);
          if (myGen === netGen && responseError.status === 429 && responseError.retryAfterMs > 0) {
            lane.pauseUntil = Math.max(lane.pauseUntil, effects.now() + responseError.retryAfterMs);
          }
        }
        return consume(res, responseError);
      }).catch(function (err) {
        if (!responseError || (err && err.cancelled) || err === responseError) throw err;
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
      const hdr = res.headers && res.headers.get && res.headers.get("retry-after");
      let ra = parseFloat(hdr);
      if (!isFinite(ra) && hdr) ra = (Date.parse(hdr) - effects.now()) / 1000;
      const retryMs = Math.round(ra * 1000);
      if (isFinite(retryMs) && retryMs > 0 && isFinite(effects.now() + retryMs)) err.retryAfterMs = retryMs;
      return err;
    }

    function fetchOnce(url, lane) {
      lane.lastNetAt = effects.now();
      if (lane === openF1Lane) _of1Recent.push(lane.lastNetAt);
      return fetchTimed(url, lane, function (res, httpErr) {
        if (!res.ok) {
          return res.text().then(function (txt) {
            try {
              const j = JSON.parse(txt);
              if (res.status === 404 && j && /no results found/i.test(String(j.detail || ""))) return [];
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
      const cachePolicy = options && options.cache === false ? "network" :
        options && options.cache === "memory" ? "memory" : "cache";
      const cache = cachePolicy !== "network";
      const quiet = ttl <= 0 || (options && options.cache === false);
      const name = endpointName(url);
      const hit = cache ? readCache(url) : null;
      const age = hit ? effects.now() - hit.t : 0;
      if (ttl > 0 && hit && age >= 0 && age < ttl) return Promise.resolve(hit.data);
      const flightKey = myGen + "|" + cachePolicy + "|" + url;
      const shared = inFlight.get(flightKey);
      if (shared) return shared;

      function startAfterProviderGate() {
        if (myGen !== netGen) throw cancelledError(url);
        const wait = lane.pauseUntil - effects.now();
        if (wait > 0) return waitForRequest(Math.min(wait, RETRY_AFTER_MAX_MS), url).then(startAfterProviderGate);
        const work = fetchOnce(url, lane);
        const release = function () { lane.active.delete(owned); };
        const owned = work.then(release, release);
        lane.active.add(owned);
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
            if (ra > RETRY_AFTER_MAX_MS) throw err;
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
          if (err && err.cancelled) throw err;
          const status = err && err.status;
          if (hit && status !== 401 && status !== 403) {
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

    function cancelAll() {
      netGen++;
      inFlight.clear();
      pendingWaits.forEach(function (cancel) { cancel(); });
      const aborted = effects.cancelAll();
      if (aborted) effects.info("api cancelAll aborted " + aborted);
      return aborted;
    }

    function staleMark() { return staleSeq; }
    function staleSince(mark) {
      let t = null;
      for (let i = 0; i < staleLog.length; i++) {
        if (staleLog[i].seq > mark && (t === null || staleLog[i].t < t)) t = staleLog[i].t;
      }
      return t;
    }

    function forget(url) {
      memCache.delete(url);
      try { effects.remove(CACHE_PREFIX + url); } catch (e) {  }
    }

    return { request, cancelAll, cacheEntryT, staleMark, staleSince, forget };
  }

  return { create };
})();
Object.freeze(F1Transport);
