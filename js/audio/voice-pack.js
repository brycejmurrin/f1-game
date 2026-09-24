"use strict";
/* VoicePack — recorded radio voice, composed from clips the way Crew Chief does
 * it: fixed phrases, driver surnames, positions, numbers and gaps are separate
 * recordings, and a line is spoken by splicing the ones it needs. A line the
 * pack cannot cover whole is NOT spoken from the pack; RadioVoice falls back
 * to speech synthesis for it, so nothing is ever half-said.
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
const VoicePack = (() => {
  const PAUSE = Object.freeze({ ".": 0.1, "!": 0.1, "?": 0.1, ",": 0.05, ";": 0.08, ":": 0.08 });
  const MAX_WORDS = 12;          // longest key the greedy matcher tries
  const CACHE_MAX = 80;          // decoded clips kept
  const SLACK_S = 0.4;           // a composed line may run this far past the card's budget

  /** Speakable text (RadioVoice.speakable's output) → words and pauses.
   *  A pause is punctuation FOLLOWED BY a space or the end, so "1.4" stays a word. */
  function norm(text) {
    const out = [];
    const s = String(text == null ? "" : text).toLowerCase()
      .replace(/[—–]/g, ", ").replace(/["“”()]/g, " ");
    const re = /([.,!?;:])(?=\s|$)|[^\s.,!?;:]+(?:[.:][^\s.,!?;:]+)*/g;
    let m;
    while ((m = re.exec(s))) {
      if (m[1]) { if (out.length && typeof out[out.length - 1] === "string") out.push({ p: PAUSE[m[1]] }); }
      else out.push(m[0].replace(/^'+|'+$/g, ""));
    }
    while (out.length && typeof out[out.length - 1] !== "string") out.pop();
    return out;
  }

  /** The key for a run of words: lower case, single spaces. */
  const keyOf = (words) => words.join(" ");

  /** Greedy longest-match of `text` over the keys `has` accepts. Returns a list
   *  of { k } clips and { p } pauses, or null when any word is not covered. */
  function compose(text, has) {
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
    const voices = {};   // id -> { state, man, bin, cache: Map }
    let live = null;     // the transmission playing: { stop, end }
    let spoke = 0, missed = 0, lastSeq = null;

    function voice(id) {
      return voices[id] || (voices[id] = { id, state: "idle", man: null, bin: null, cache: new Map() });
    }
    /** Start fetching a voice. Idempotent; never throws; boot never waits on it. */
    function ensure(id) {
      const v = voice(id);
      if (v.state !== "idle" || typeof fetch !== "function") return v.state;
      v.state = "loading";
      const get = (f, t) => fetch(base + f).then((r) => { if (!r.ok) throw new Error(f + " " + r.status); return r[t](); });
      Promise.all([get(id + ".json", "json"), get(id + ".bin", "arrayBuffer")])
        .then(([man, bin]) => {
          if (!man || !man.clips || !(bin && bin.byteLength)) throw new Error("empty pack");
          v.man = man; v.bin = bin; v.state = "ready";
          Log.info("audio", "VoicePack " + id + " ready: " + Object.keys(man.clips).length + " clips");
        })
        .catch((e) => { v.state = "failed"; Log.info("audio", "VoicePack " + id + " unavailable: " + (e && e.message)); });
      return v.state;
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

    function decode(v, k) {
      const hit = v.cache.get(k);
      if (hit) { v.cache.delete(k); v.cache.set(k, hit); return hit; }   // LRU touch
      const [off, len] = v.man.clips[k];
      const p = GameAudio.decodeClip(v.bin.slice(off, off + len));
      v.cache.set(k, p);
      p.catch(() => v.cache.delete(k));
      while (v.cache.size > CACHE_MAX) v.cache.delete(v.cache.keys().next().value);
      return p;
    }

    function stop() {
      if (live) { const l = live; live = null; try { l.stop(); } catch (e) { /* already ended */ } }
    }

    /** Speak `text` from voice `id` after `leadS`, if the pack covers all of it
     *  and it fits `budgetS`. Returns false (nothing scheduled) otherwise, so
     *  the caller falls back to speech synthesis. `onEnd` runs once, when the
     *  line finishes or is cut. */
    function speak(id, text, o) {
      const pl = plan(id, text);
      if (!pl) { missed++; return false; }
      const opt = o || {};
      if (opt.budgetS != null && pl.secs > opt.budgetS + SLACK_S) { missed++; return false; }
      if (!GameAudio.radioVoice || !GameAudio.decodeClip) return false;
      stop();
      const v = voices[id];
      const at = GameAudio.now() + Math.max(0, +opt.leadS || 0);
      let ended = false;
      const done = () => { if (!ended) { ended = true; if (opt.onEnd) opt.onEnd(); } };
      const token = { stop: done, end: at + pl.secs };
      live = token;
      Promise.all(pl.seq.map((s) => (s.k ? decode(v, s.k) : s.p)))
        .then((parts) => {
          if (live !== token) return;                       // preempted while decoding
          const h = GameAudio.radioVoice(parts, Math.max(at, GameAudio.now() + 0.02), {
            channel: opt.channel || "radio", volume: opt.volume == null ? 1 : opt.volume });
          if (!h) { live = null; done(); return; }
          token.stop = () => { h.stop(); done(); };
          token.end = h.end;
          setTimeout(() => { if (live === token) live = null; done(); }, Math.max(0, (h.end - GameAudio.now()) * 1000) + 30);
        })
        .catch(() => { if (live === token) live = null; done(); });
      spoke++; lastSeq = pl.seq.map((s) => s.k || "|");
      return true;
    }

    return {
      ensure, ready, plan, speak, stop,
      busy: () => !!live,
      debug: () => ({ voices: Object.fromEntries(Object.values(voices).map((v) => [v.id, v.state])), spoke, missed, last: lastSeq }),
    };
  }

  return Object.freeze({ create, norm, compose, keyOf, PAUSE, MAX_WORDS });
})();
