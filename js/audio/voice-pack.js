"use strict";
var VoicePack = (() => {
  const VOICES = Object.freeze({
    george: { name: "George · British", voice: "bm_george", speaker: "radio", speed: 1.12 },
    michael: { name: "Michael · American", voice: "am_michael", speaker: "radio", speed: 1.08 },
    fable: { name: "Fable · British", voice: "bm_fable", speaker: "announcer", speed: 1.12 },
    bella: { name: "Bella · American", voice: "af_bella", speaker: "announcer", speed: 1.05 },
    emma: { name: "Emma · British", voice: "bf_emma", speaker: "control", speed: 1.06 },
    heart: { name: "Heart · American", voice: "af_heart", speaker: "coach", speed: 1.02 },
  });
  const choices = (speaker) => Object.entries(VOICES)
    .sort(([, a], [, b]) => (b.speaker === speaker) - (a.speaker === speaker))
    .map(([id, v]) => ({ id, name: v.name }));
  const packFor = (id, speaker) => (VOICES[id] ? (VOICES[id].speaker === speaker || !speaker ? id : id + "-" + speaker) : null);
  const lineKey = (text) => "@line:" + String(text || "").toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  const PAUSE = Object.freeze({ ".": 0.1, "!": 0.1, "?": 0.1, ",": 0.05, ";": 0.08, ":": 0.08 });
  const MAX_WORDS = 12;
  const CACHE_MAX = 80;
  const BLOB_OK = typeof Blob === "function" && !!Blob.prototype && typeof Blob.prototype.arrayBuffer === "function";
  const CACHE_S = (typeof GLX !== "undefined" && GLX && GLX.isMobile) ? 24 : 90;
  const SLACK_S = 0.2;
  const RETRY_MS = 30000;
  const WATCHDOG_MS = 4000;

  function norm(text) {
    const out = [];
    const s = String(text == null ? "" : text).toLowerCase()
      .replace(/[—–]/g, ", ").replace(/["“”()]/g, " ");
    const re = /([.,!?;:])(?=\s|$)|[^\s.,!?;:]+(?:[.:][^\s.,!?;:]+)*/g;
    let m;
    while ((m = re.exec(s))) {
      if (m[1]) { if (out.length && typeof out[out.length - 1] === "string") out.push({ p: PAUSE[m[1]] }); continue; }
      const w = m[0].replace(/^'+|'+$/g, "");
      const t = /^(\d{1,2}):(\d\d)(?:\.(\d))?$/.exec(w);
      if (t) {
        out.push(String(+t[1]));
        if (t[2][0] === "0") out.push("oh");
        out.push(String(+t[2]));
        if (t[3] != null) out.push("point", t[3]);
      } else out.push(w);
    }
    while (out.length && typeof out[out.length - 1] !== "string") out.pop();
    return out;
  }

  const keyOf = (words) => words.join(" ");

  function compose(text, has) {
    if (String(text || "").trim() && has(lineKey(text))) return [{ k: lineKey(text) }];
    const toks = norm(text);
    const seq = [];
    let i = 0;
    while (i < toks.length) {
      const t = toks[i];
      if (typeof t !== "string") { seq.push(t); i++; continue; }
      let hit = 0;
      for (let n = Math.min(MAX_WORDS, toks.length - i); n > 0 && !hit; n--) {
        const run = toks.slice(i, i + n);
        if (run.some((w) => typeof w !== "string")) continue;
        if (has(keyOf(run))) hit = n;
      }
      if (!hit) return null;
      seq.push({ k: keyOf(toks.slice(i, i + hit)) });
      i += hit;
    }
    return seq.length ? seq : null;
  }

  function isAnnouncerPack(id) {
    if (!id) return false;
    if (/-announcer$/.test(id)) return true;
    return !!(VOICES[id] && VOICES[id].speaker === "announcer");
  }

  const OPUS_PROBE = Object.freeze({
    ogg: "T2dnUwACAAAAAAAAAAAAAAAAAAAAAAIotXIBE09wdXNIZWFkAQE4AYC7AAAAAABPZ2dTAAAAAAAAAAAAAAAAAAABAAAASZW+VAEuT3B1c1RhZ3MGAAAAZmZtcGVnAQAAABQAAABlbmNvZGVyPUxhdmMgbGlib3B1c09nZ1MABHgMAAAAAAAAAAAAAAIAAAB5JR4OBEU7Mh94ggG3bEck6gJGb/q2A4yBNNboXgHrG7Fe78l4GPIKsyFBzNGmn+GKm4ada4HqBJ7rQIorR1AoCdBGUwB0TbafesP0APl4oz/3rJiFA1wmClefivKNPWyFTMAT6kG2Yed3+3cUzFh1rzUSx/cLIQV4W+FGeLL14n2PtXj6aSnTy3iboxJRRQCs41GbcyG875GH/caGJGY0Sci32GDsrhkNeobIkg5fhZVJgoXdRj72lCmLeAZNpoExSNLAZ4ssddqo352sB/U6sgIJS3M97fBiZw==",
    webm: "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAKXEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHGTbuMU6uEElTDZ1OsggEwTbuMU6uEHFO7a1OsggKB7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmoCrXsYMPQkBNgIRMYXZmV0GETGF2ZkSJiEBRAAAAAAAAFlSua+WuAQAAAAAAAFzXgQFzxYgAAAAAAAAAAZyBACK1nIN1bmSIgQCGhkFfT1BVU1aqg2MuoFa7hATEtACDgQLhkZ+BAbWIQOdwAAAAAABiZIEQY6KTT3B1c0hlYWQBATgBgLsAAAAAABJUw2fRc3POY8CLY8WIAAAAAAAAAAFnyJlFo4dFTkNPREVSRIeMTGF2YyBsaWJvcHVzZ8ihRaOIRFVSQVRJT05Eh5MwMDowMDowMC4wNjgwMDAwMDAAH0O2dUD154EAo8mBAACAeIIBt2xHJOoCRm/6tgOMgTTW6F4B6xuxXu/JeBjyCrMhQczRpp/hipuGnWuB6gSe60CKK0dQKAnQRlMAdE22n3rD9AD5o7+BABWAeKM/96yYhQNcJgpXn4ryjT1shUzAE+pBtmHnd/t3FMxYda81Esf3CyEFeFvhRniy9eJ9j7V4+mkp08ujtoEAKYB4m6MSUUUArONRm3MhvO+Rh/3GhiRmNEnIt9hg7K4ZDXqGyJIOX4WVSYKF3UY+9pQpi6CsoaOBAD0AeAZNpoExSNLAZ4ssddqo352sB/U6sgIJS3M97fBiZ3WihADN/mAcU7trkbuPs4EAt4r3gQHxggGG8IED",
    caf: "Y2FmZgABAABkZXNjAAAAAAAAACBA53AAAAAAAG9wdXMAAAAAAAAAAAAAA8AAAAABAAAAAGNoYW4AAAAAAAAADABkAAEAAAAAAAAAAGluZm8AAAAAAAAAGgAAAAFlbmNvZGVyAExhdmY2MC4xNi4xMDAAZGF0YQAAAAAAAADVAAAAAHiCAbdsRyTqAkZv+rYDjIE01uheAesbsV7vyXgY8gqzIUHM0aaf4Yqbhp1rgeoEnutAiitHUCgJ0EZTAHRNtp96w/QA+XijP/esmIUDXCYKV5+K8o09bIVMwBPqQbZh53f7dxTMWHWvNRLH9wshBXhb4UZ4svXifY+1ePppKdPLeJujElFFAKzjUZtzIbzvkYf9xoYkZjRJyLfYYOyuGQ16hsiSDl+FlUmChd1GPvaUKYt4Bk2mgTFI0sBniyx12qjfnawH9TqyAglLcz3t8GJncGFrdAAAAAAAAAAcAAAAAAAAAAQAAAAAAAAPAAAAAAAAAAAARTsyHw==",
  });
  const PROBE_MS = 2000;
  let codecProbe = null;
  let codecKnown = null;
  function codecs() {
    if (codecProbe) return codecProbe;
    const OAC = typeof OfflineAudioContext === "function" ? OfflineAudioContext : null;
    if (!OAC || typeof atob !== "function") { codecKnown = {}; return (codecProbe = Promise.resolve(codecKnown)); }
    codecProbe = Promise.all(Object.keys(OPUS_PROBE).map((k) => new Promise((resolve) => {
      let settled = false, timer = null;
      const done = (ok) => { if (settled) return; settled = true; if (timer) clearTimeout(timer); resolve([k, ok]); };
      try {
        const bytes = Uint8Array.from(atob(OPUS_PROBE[k]), (c) => c.charCodeAt(0));
        const ctx = new OAC(1, 4800, 48000);
        timer = setTimeout(() => done(false), PROBE_MS);
        const p = ctx.decodeAudioData(bytes.buffer, (buf) => done(!!(buf && buf.length > 0)), () => done(false));
        if (p && typeof p.catch === "function") p.catch(() => done(false));
      } catch (_) { done(false); }
    }))).then((rows) => { const out = {}; for (const [k, ok] of rows) out[k] = ok; return (codecKnown = out); });
    return codecProbe;
  }

  function create(G, opts) {
    codecs();
    const base = (opts && opts.base) || "assets/voice/";
    let tick = 0;
    const voices = {};
    const wanted = new Set();
    const live = {};
    let spoke = 0, missed = 0, lastSeq = null;
    let raceLoad = false;
    const deferred = new Set();

    function voice(id) {
      return voices[id] || (voices[id] = { id, state: "idle", man: null, bin: null, cache: new Map(), stamp: new Map(), secs: 0 });
    }
    function raceLoadGate(on) {
      raceLoad = !!on;
      if (raceLoad || !deferred.size) return;
      const ids = [...deferred];
      deferred.clear();
      for (const id of ids) if (wanted.has(id)) ensure(id);
    }
    function ensure(id) {
      wanted.add(id);
      const v = voice(id);
      if (v.state === "failed" && Date.now() - v.failedAt > RETRY_MS) v.state = "idle";
      if (v.state !== "idle" || typeof fetch !== "function") return v.state;
      if (raceLoad && isAnnouncerPack(id)) { deferred.add(id); return v.state; }
      v.state = "loading";
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { reject(new Error("pack fetch timed out")); if (controller) { try { controller.abort(); } catch (_) {  } } }, 15000);
      });
      const get = (f, t) => {
        try { return Promise.resolve(fetch(base + f, controller ? { signal: controller.signal } : undefined))
          .then((r) => { if (!r.ok) throw new Error(f + " " + r.status); return r[t](); }); }
        catch (e) { return Promise.reject(e); }
      };
      const verify = async (bin, meta) => {
        if (!meta || !/^[0-9a-f]{64}$/.test(meta.sha256) || !bin || meta.bytes !== bin.byteLength || !bin.byteLength) throw new Error("voice binary integrity metadata missing or invalid");
        if (typeof crypto === "undefined" || !crypto.subtle) throw new Error("voice binary integrity verification unavailable");
        const digest = await crypto.subtle.digest("SHA-256", bin);
        const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
        if (hex !== meta.sha256) throw new Error("voice binary integrity mismatch");
        return bin;
      };
      const opusOf = (man) => {
        const o = man && man.opus;
        return o && o.clips && typeof o.file === "string" && /^[\w.-]+$/.test(o.file) &&
          Object.prototype.hasOwnProperty.call(OPUS_PROBE, o.container) ? o : null;
      };
      const known = codecKnown;
      const noOpus = !!known && !Object.keys(OPUS_PROBE).some((k) => known[k] === true);
      const mp3Early = noOpus ? get(id + ".bin", "arrayBuffer") : null;
      if (mp3Early) mp3Early.catch(() => {});
      const pair = Promise.all([get(id + ".json", "json"), codecs()])
        .then(async ([man, can]) => {
          const o = opusOf(man);
          if (o && can[o.container] === true) {
            try {
              const bin = await verify(await get(o.file, "arrayBuffer"), o.binary);
              return [Object.assign({}, man, { clips: o.clips }), bin, "opus-" + o.container];
            } catch (e) { Log.info("audio", "VoicePack " + id + " opus unavailable, using mp3: " + (e && e.message)); }
          }
          return [man, await verify(await (mp3Early || get(id + ".bin", "arrayBuffer")), man && man.binary), "mp3"];
        });
      v.loading = Promise.race([timeout, pair])
        .then(([man, bin, fmt]) => {
          if (!man || !man.clips || !(bin && bin.byteLength)) throw new Error("empty pack");
          v.bytes = bin.byteLength;
          v.man = man; v.bin = BLOB_OK ? new Blob([bin]) : bin; v.fmt = fmt; v.state = "ready";
          Log.info("audio", "VoicePack " + id + " ready: " + Object.keys(man.clips).length + " clips (" + fmt + ")");
        })
        .catch((e) => { v.state = "failed"; v.failedAt = Date.now(); Log.info("audio", "VoicePack " + id + " unavailable: " + (e && e.message)); })
        .finally(() => {
          clearTimeout(timer);
          if (!wanted.has(id) && voices[id] === v) delete voices[id];
        });
      return v.state;
    }
    function ensureStaged(tiers) {
      if (!tiers || !tiers.length || typeof fetch !== "function") return;
      const uniq = [];
      const seen = new Set();
      for (const tier of tiers) {
        const ids = [];
        for (const id of tier || []) {
          if (!id || seen.has(id)) continue;
          seen.add(id);
          wanted.add(id);
          if (isAnnouncerPack(id)) { if (raceLoad) deferred.add(id); continue; }
          ids.push(id);
        }
        if (ids.length) uniq.push(ids);
      }
      if (!uniq.length) return;
      const run = async () => {
        for (const tier of uniq) {
          const ids = tier.filter((id) => wanted.has(id) && !isAnnouncerPack(id));
          for (const id of ids) ensure(id);
          await Promise.all(ids.map((id) => (voice(id).loading || Promise.resolve())));
        }
      };
      run();
    }
    const ready = (id) => !!(voices[id] && voices[id].state === "ready");
    const hasKey = (v) => (k) => Object.prototype.hasOwnProperty.call(v.man.clips, k);

    function plan(id, text) {
      if (!ready(id)) return null;
      const v = voices[id];
      const seq = compose(text, hasKey(v));
      if (!seq) return null;
      let secs = 0;
      let prevClip = false;
      for (const s of seq) {
        secs += s.k ? (+v.man.clips[s.k][2] || 0) - (prevClip ? 0.05 : 0) : s.p;
        prevClip = !!s.k;
      }
      return { seq, secs };
    }

    const clipS = (v, k) => Math.max(0, +(v.man.clips[k] || [])[2] || 0);
    function decode(v, k) {
      const gen = GameAudio.ctxGen ? GameAudio.ctxGen() : 0;
      if (v.gen !== gen) { v.cache.clear(); v.stamp.clear(); v.secs = 0; v.gen = gen; }
      const hit = v.cache.get(k);
      if (hit) { v.cache.delete(k); v.cache.set(k, hit); v.stamp.set(k, ++tick); return hit; }
      const [off, len] = v.man.clips[k];
      const part = v.bin.slice(off, off + len);
      const p = BLOB_OK && typeof part.arrayBuffer === "function" ? part.arrayBuffer().then((ab) => GameAudio.decodeClip(ab)) : GameAudio.decodeClip(part);
      v.cache.set(k, p);
      v.stamp.set(k, ++tick);
      v.secs += clipS(v, k);
      p.catch(() => { if (v.cache.get(k) === p) { v.cache.delete(k); v.stamp.delete(k); v.secs -= clipS(v, k); } });
      while (v.cache.size > CACHE_MAX) {
        const old = v.cache.keys().next().value;
        if (old === k) break;
        v.cache.delete(old); v.stamp.delete(old); v.secs -= clipS(v, old);
      }
      for (;;) {
        let total = 0, oldV = null, oldK = null, oldT = Infinity;
        for (const w of Object.values(voices)) {
          total += w.secs;
          const first = w.cache.keys().next();
          if (first.done) continue;
          const t = w.stamp.get(first.value);
          if (t < oldT) { oldT = t; oldV = w; oldK = first.value; }
        }
        if (!oldV || total <= CACHE_S || (oldV === v && oldK === k)) break;
        oldV.cache.delete(oldK); oldV.stamp.delete(oldK); oldV.secs -= clipS(oldV, oldK);
      }
      return p;
    }
    function flushDecoded() {
      for (const w of Object.values(voices)) { w.cache.clear(); w.stamp.clear(); w.secs = 0; }
    }

    function stop(channel) {
      for (const ch of channel ? [channel] : Object.keys(live)) {
        const l = live[ch];
        if (!l) continue;
        delete live[ch];
        try { l.stop(); } catch (e) {  }
      }
    }
    function remaining(channel) {
      let end = 0;
      for (const ch of channel ? [channel] : Object.keys(live)) if (live[ch]) {
        if (!live[ch].h) return Infinity;
        end = Math.max(end, live[ch].end);
      }
      return end > 0 ? Math.max(0, end - GameAudio.now()) : 0;
    }

    function speak(id, text, o) {
      const pl = plan(id, text);
      if (!pl) { missed++; return false; }
      const opt = o || {};
      if (opt.budgetS != null && pl.secs > opt.budgetS + SLACK_S) { missed++; return false; }
      if (!GameAudio.radioVoice || !GameAudio.decodeClip) return false;
      const ch = opt.channel || "radio";
      stop(ch);
      const v = voices[id];
      const at = GameAudio.now() + Math.max(0, +opt.leadS || 0);
      let ended = false;
      const done = () => { if (!ended) { ended = true; if (opt.onEnd) opt.onEnd(); } };
      const release = () => { if (live[ch] === token) delete live[ch]; done(); };
      const token = { stop: done, end: at + pl.secs };
      live[ch] = token;
      const watchdog = setTimeout(() => { if (!token.h) release(); }, WATCHDOG_MS);
      const gen0 = GameAudio.ctxGen ? GameAudio.ctxGen() : 0;
      Promise.all(pl.seq.map((s) => (s.k ? decode(v, s.k) : s.p)))
        .then((parts) => {
          clearTimeout(watchdog);
          if (live[ch] !== token) return;
          if ((GameAudio.ctxGen ? GameAudio.ctxGen() : 0) !== gen0) { release(); return; }
          if (opt.valid && !opt.valid()) { release(); return; }
          const start = Math.max(at, GameAudio.now() + 0.02);
          if (opt.budgetS != null && start + pl.secs > at + opt.budgetS + SLACK_S) { release(); return; }
          const h = GameAudio.radioVoice(parts, start, {
            channel: ch, fx: opt.fx, volume: opt.volume == null ? 1 : opt.volume });
          if (!h) { release(); return; }
          token.h = h;
          token.stop = () => { h.stop(); done(); };
          token.end = h.end;
          setTimeout(release, Math.max(0, (h.end - GameAudio.now()) * 1000) + 30);
          if (opt.onStart != null) {
            try {
              if (typeof opt.onStart === "function") opt.onStart();
              else Log.info("audio", "VoicePack onStart ignored: observer is not a function");
            } catch (e) { Log.info("audio", "VoicePack onStart observer failed: " + (e && e.message)); }
          }
        })
        .catch(() => { clearTimeout(watchdog); release(); });
      spoke++; lastSeq = pl.seq.map((s) => s.k || "|");
      return true;
    }

    function releaseExcept(keep) {
      wanted.clear();
      for (const id of keep || []) wanted.add(id);
      for (const id of Object.keys(voices)) {
        const v = voices[id];
        if (!wanted.has(id) && v.state !== "loading") delete voices[id];
      }
    }

    return {
      ensure, ensureStaged, raceLoadGate, ready, plan, speak, stop, remaining, releaseExcept, flushDecoded,
      load(id) { ensure(id); return (voice(id).loading || Promise.resolve()).then(() => ready(id)); },
      busy: (channel) => (channel ? !!live[channel] : Object.keys(live).length > 0),
      debug: () => ({ voices: Object.fromEntries(Object.values(voices).map((v) => [v.id, v.state])), spoke, missed, last: lastSeq,
        raceLoad, deferred: [...deferred],
        formats: Object.fromEntries(Object.values(voices).filter((v) => v.fmt).map((v) => [v.id, { fmt: v.fmt, bytes: v.bin ? v.bytes | 0 : 0 }])),
        heapBytes: Object.fromEntries(Object.values(voices).filter((v) => v.bin).map((v) => [v.id, typeof v.bin.byteLength === "number" ? v.bin.byteLength : 0])),
        cache: Object.fromEntries(Object.values(voices).map((v) => [v.id, { clips: v.cache.size, secs: +v.secs.toFixed(2) }])), cacheS: CACHE_S }),
    };
  }

  return Object.freeze({ create, codecs, norm, compose, keyOf, lineKey, choices, packFor, VOICES });
})();
