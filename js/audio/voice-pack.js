"use strict";
/* VoicePack — recorded radio voice, composed from clips the way Crew Chief does
 * it: fixed phrases, driver surnames, positions, numbers and gaps are separate
 * recordings, and a line is spoken by splicing the ones it needs. A line the
 * pack cannot cover whole is NOT spoken from the pack; RadioVoice falls back
 * to speech synthesis for it, so nothing is ever half-said.
 *
 * ONE PACK PER RADIO CHANNEL (RadioVoice.PACK_VOICE): the engineer, the
 * commentator, race control and the coach each have their own voice and only
 * their own lines.
 *
 * The clips are Kokoro-82M renders (Apache-2.0), made offline by
 * tools/gen/voicepack.mjs into ONE file per voice: `assets/voice/<id>.bin` is
 * the MP3 clips back to back, each a complete file, and `<id>.json` maps a key
 * to its [byteOffset, byteLength, seconds]. One fetch; each clip is decoded on
 * first use and a small cache keeps the recent ones (a decoded second is
 * ~190 KB at 48 kHz, the whole pack decoded would be ~60 MB).
 *
 * The pure half (norm, compose) is shared with the generator, so the keys the
 * tool writes are exactly the keys the game looks up.
 */
var VoicePack = (() => {
  // Author-time generator and player picker share this catalogue. `speaker` is
  // the voice's OWN channel; every voice can speak every channel (packFor), each
  // from a pack holding only that channel's words. The spotter speaks in the
  // engineer's chosen voice, from that voice's radio pack.
  const VOICES = Object.freeze({
    george: { name: "George · British", voice: "bm_george", speaker: "radio", speed: 1.12 },
    michael: { name: "Michael · American", voice: "am_michael", speaker: "radio", speed: 1.08 },
    fable: { name: "Fable · British", voice: "bm_fable", speaker: "announcer", speed: 1.12 },
    bella: { name: "Bella · American", voice: "af_bella", speaker: "announcer", speed: 1.05 },
    emma: { name: "Emma · British", voice: "bf_emma", speaker: "control", speed: 1.06 },
    heart: { name: "Heart · American", voice: "af_heart", speaker: "coach", speed: 1.02 },
  });
  // Every voice, the channel's own ones first (the shipped default heads the list).
  const choices = (speaker) => Object.entries(VOICES)
    .sort(([, a], [, b]) => (b.speaker === speaker) - (a.speaker === speaker))
    .map(([id, v]) => ({ id, name: v.name }));
  /** The pack a voice speaks `speaker` from: `<id>` on its own channel,
   *  `<id>-<speaker>` on any other (tools/gen/voicepack.mjs --speaker). */
  const packFor = (id, speaker) => (VOICES[id] ? (VOICES[id].speaker === speaker || !speaker ? id : id + "-" + speaker) : null);
  // Full utterances retain their punctuation and performance. Keep them in a
  // separate namespace so older fragment packs remain valid.
  const lineKey = (text) => "@line:" + String(text || "").toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  const PAUSE = Object.freeze({ ".": 0.1, "!": 0.1, "?": 0.1, ",": 0.05, ";": 0.08, ":": 0.08 });
  const MAX_WORDS = 12;          // longest key the greedy matcher tries
  const CACHE_MAX = 80;          // decoded clips kept (second bound)
  // DECODED SECONDS kept per voice (perf-memory M-5): 80 clips had no size cap,
  // and an announcer clip averages ~2 s (up to 6.5 s), so a voice could pin
  // ~160 s ≈ 30 MB of PCM. Evicted clips re-decode from the kept .bin.
  // ~190 KB per decoded second: 24 s ≈ 4.6 MB on a phone, 90 s ≈ 17 MB desktop.
  const CACHE_S = (typeof GLX !== "undefined" && GLX && GLX.isMobile) ? 24 : 90;
  // A composed line may run this far past the card's budget — never more than
  // RadioVoice.LEAD_RESERVE_S, or the card hides under the last syllable.
  const SLACK_S = 0.2;
  const RETRY_MS = 30000;        // a failed fetch (offline, 404) is tried again after this
  const WATCHDOG_MS = 4000;      // a decode that never settles frees the channel after this

  /** Speakable text (RadioVoice.speakable's output) → words and pauses.
   *  A pause is punctuation FOLLOWED BY a space or the end, so "1.4" stays a word.
   *  A lap time is read the way the broadcast reads one — "1:32.4" is "1 32
   *  point 4", "1:05.3" is "1 oh 5 point 3" — so it splices from number clips
   *  instead of needing a clip per time. */
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

  /** The key for a run of words: lower case, single spaces. */
  const keyOf = (words) => words.join(" ");

  /** Greedy longest-match of `text` over the keys `has` accepts. Returns a list
   *  of { k } clips and { p } pauses, or null when any word is not covered. */
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

  function create(G, opts) {
    const base = (opts && opts.base) || "assets/voice/";
    const voices = {};   // id -> { state, man, bin, cache: Map, gen, failedAt }
    // The transmissions playing, ONE PER CHANNEL: the engineer preempting the
    // engineer is a replacement, but an engineer line must never cut a spotter
    // call mid-word (and the spotter never speaks over the engineer — it asks
    // busy() first).
    const live = {};     // channel -> { stop, end }
    let spoke = 0, missed = 0, lastSeq = null;

    function voice(id) {
      return voices[id] || (voices[id] = { id, state: "idle", man: null, bin: null, cache: new Map(), secs: 0 });
    }
    /** Start fetching a voice. Idempotent; never throws; boot never waits on it. */
    function ensure(id) {
      const v = voice(id);
      if (v.state === "failed" && Date.now() - v.failedAt > RETRY_MS) v.state = "idle";
      if (v.state !== "idle" || typeof fetch !== "function") return v.state;
      v.state = "loading";
      const get = (f, t) => fetch(base + f).then((r) => { if (!r.ok) throw new Error(f + " " + r.status); return r[t](); });
      v.loading = Promise.all([get(id + ".json", "json"), get(id + ".bin", "arrayBuffer")])
        .then(([man, bin]) => {
          if (!man || !man.clips || !(bin && bin.byteLength)) throw new Error("empty pack");
          v.man = man; v.bin = bin; v.state = "ready";
          Log.info("audio", "VoicePack " + id + " ready: " + Object.keys(man.clips).length + " clips");
        })
        .catch((e) => { v.state = "failed"; v.failedAt = Date.now(); Log.info("audio", "VoicePack " + id + " unavailable: " + (e && e.message)); });
      return v.state;
    }
    /** Lap-1 radio: the engineer and spotter share one pack; it must win bandwidth
     *  over the coach and announcer on a cold cache. Each tier's fetches start only
     *  after the previous tier's loads settle (ready, failed, or already cached).
     *  Idempotent; never throws; callers do not await it. */
    function ensureStaged(tiers) {
      if (!tiers || !tiers.length || typeof fetch !== "function") return;
      const uniq = [];
      const seen = new Set();
      for (const tier of tiers) {
        const ids = [];
        for (const id of tier || []) {
          if (!id || seen.has(id)) continue;
          seen.add(id);
          ids.push(id);
        }
        if (ids.length) uniq.push(ids);
      }
      if (!uniq.length) return;
      const run = async () => {
        for (const tier of uniq) {
          for (const id of tier) ensure(id);
          await Promise.all(tier.map((id) => (voice(id).loading || Promise.resolve())));
        }
      };
      run();
    }
    const ready = (id) => !!(voices[id] && voices[id].state === "ready");
    const hasKey = (v) => (k) => Object.prototype.hasOwnProperty.call(v.man.clips, k);

    /** The composed clip list for `text`, and its length in seconds, or null. */
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
      // Decoded buffers belong to the AudioContext that made them; a rebuilt
      // context (GameAudio.rebuildCtx) starts the cache again.
      const gen = GameAudio.ctxGen ? GameAudio.ctxGen() : 0;
      if (v.gen !== gen) { v.cache.clear(); v.secs = 0; v.gen = gen; }
      const hit = v.cache.get(k);
      if (hit) { v.cache.delete(k); v.cache.set(k, hit); return hit; }   // LRU touch
      const [off, len] = v.man.clips[k];
      const p = GameAudio.decodeClip(v.bin.slice(off, off + len));
      v.cache.set(k, p);
      v.secs += clipS(v, k);
      p.catch(() => { if (v.cache.get(k) === p) { v.cache.delete(k); v.secs -= clipS(v, k); } });
      // Oldest first, never the clip just added: a line already holds its
      // promises, so an eviction only means the next use decodes again.
      while (v.cache.size > 1 && (v.cache.size > CACHE_MAX || v.secs > CACHE_S)) {
        const old = v.cache.keys().next().value;
        v.cache.delete(old); v.secs -= clipS(v, old);
      }
      return p;
    }

    /** Cut the transmission on `channel`, or every channel when none is named. */
    function stop(channel) {
      for (const ch of channel ? [channel] : Object.keys(live)) {
        const l = live[ch];
        if (!l) continue;
        delete live[ch];
        try { l.stop(); } catch (e) { /* already ended */ }
      }
    }
    /** Seconds until quiet; Infinity while decoding makes the end unknown. */
    function remaining(channel) {
      let end = 0;
      for (const ch of channel ? [channel] : Object.keys(live)) if (live[ch]) {
        if (!live[ch].h) return Infinity;
        end = Math.max(end, live[ch].end);
      }
      return end > 0 ? Math.max(0, end - GameAudio.now()) : 0;
    }

    /** Speak `text` from voice `id` after `leadS`, if the pack covers all of it
     *  and it fits `budgetS`. Returns false (nothing scheduled) otherwise, so
     *  the caller can leave an unavailable line written. `onEnd` runs once, when the
     *  line finishes or is cut. */
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
      // A decode that never settles (a context closed under it) must not hold
      // the channel — busy() would silence the spotter for the rest of the race.
      const watchdog = setTimeout(() => { if (!token.h) release(); }, WATCHDOG_MS);
      const gen0 = GameAudio.ctxGen ? GameAudio.ctxGen() : 0;
      Promise.all(pl.seq.map((s) => (s.k ? decode(v, s.k) : s.p)))
        .then((parts) => {
          clearTimeout(watchdog);
          if (live[ch] !== token) return;                   // preempted while decoding
          // A context rebuilt mid-decode restarts its clock near 0: `at` is in
          // the old one and would schedule the line minutes ahead, holding the
          // channel (and the spotter) for all of it.
          if ((GameAudio.ctxGen ? GameAudio.ctxGen() : 0) !== gen0) { release(); return; }
          if (opt.valid && !opt.valid()) { release(); return; }
          const start = Math.max(at, GameAudio.now() + 0.02);
          // Decode time belongs to the original card, not a fresh budget.
          // If the whole line no longer fits, leave it written instead of
          // starting late and cutting it off in the middle of an instruction.
          if (opt.budgetS != null && start + pl.secs > at + opt.budgetS + SLACK_S) { release(); return; }
          const h = GameAudio.radioVoice(parts, start, {
            channel: ch, fx: opt.fx, volume: opt.volume == null ? 1 : opt.volume });
          if (!h) { release(); return; }
          token.h = h;
          token.stop = () => { h.stop(); done(); };
          token.end = h.end;
          setTimeout(release, Math.max(0, (h.end - GameAudio.now()) * 1000) + 30);
        })
        .catch(() => { clearTimeout(watchdog); release(); });
      spoke++; lastSeq = pl.seq.map((s) => s.k || "|");
      return true;
    }

    return {
      ensure, ensureStaged, ready, plan, speak, stop, remaining,
      load(id) { ensure(id); return (voice(id).loading || Promise.resolve()).then(() => ready(id)); },
      busy: (channel) => (channel ? !!live[channel] : Object.keys(live).length > 0),
      debug: () => ({ voices: Object.fromEntries(Object.values(voices).map((v) => [v.id, v.state])), spoke, missed, last: lastSeq,
        cache: Object.fromEntries(Object.values(voices).map((v) => [v.id, { clips: v.cache.size, secs: +v.secs.toFixed(2) }])), cacheS: CACHE_S }),
    };
  }

  return Object.freeze({ create, norm, compose, keyOf, lineKey, choices, packFor, VOICES, PAUSE, MAX_WORDS, SLACK_S });
})();
