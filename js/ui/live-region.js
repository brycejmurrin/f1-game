/* Apex 26 — LiveRegion: the ONE writer of #announce-live, the always-present
   polite region screen readers hear the race through. Four voices used to
   write it on their own handles — the radio card (js/game.js showAnnounce),
   the flag (js/ui/hud.js sayFlag), the spoken HUD (js/ui/hud-readouts.js
   speaker) and the SESSION ONLY warning (js/ui/select-screen.js) — each as
   "clear, then write 60 ms later". Two in one tick landed ~1 ms apart, so the
   first line was replaced before any reader saw it: a safety car and a radio
   call fired together spoke only one.
   Now: one timer, one short queue by priority. A line is written with the
   same clear-then-write BEAT (a repeated line is still a change); a written
   line then HOLDs the region for HOLD_MS before a queued one replaces it; a
   more urgent line jumps a less urgent one that has not been written yet, or
   cuts its hold short. Stale HUD lines (a position from five seconds ago) are
   dropped rather than read late. No DOM of its own, no state of the game. */
const LiveRegion = (function () {
  "use strict";

  // flag > penalty > save warning > radio > spoken HUD. Unknown kinds are radio.
  const PRIO = Object.freeze({ flag: 5, penalty: 4, save: 3, radio: 2, hud: 1 });
  const BEAT_MS = 60;     // clear, then write: the beat every writer already used
  const HOLD_MS = 1200;   // how long a written line owns the region before the next
  const MAX_Q = 4;        // a burst past this drops its least urgent, oldest lines
  const STALE_MS = { hud: 4000, radio: 10000 };   // queued longer than this: not worth reading late

  let el = null, phase = "idle", current = null, timer = 0, seq = 0;
  const queue = [];
  const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

  function region() {
    if (!el && typeof document !== "undefined" && document.getElementById) el = document.getElementById("announce-live");
    return el;
  }
  // radioKind("penalty-hit") -> "penalty"; the radio card's other kinds are radio.
  function kindOf(k) { return PRIO[k] ? k : /^penalty/.test(String(k || "")) ? "penalty" : "radio"; }

  function enqueue(item) {
    // A newer FLAG or HUD line supersedes a queued one of its kind (it is state,
    // not news); the same text twice is one line. NEWER, by seq: a line pushed
    // BACK by a preempting flag is the older reading, and it used to delete the
    // newer one queued behind it — the reader then heard the stale position.
    const superseding = item.kind === "flag" || item.kind === "hud";
    if (superseding && queue.some((q) => q.kind === item.kind && q.seq > item.seq)) return;
    for (let i = queue.length - 1; i >= 0; i--) {
      const q = queue[i];
      if (q.text === item.text || ((item.kind === "flag" || item.kind === "hud") && q.kind === item.kind)) queue.splice(i, 1);
    }
    queue.push(item);
    queue.sort((a, b) => b.p - a.p || a.seq - b.seq);
    // The queue is urgent-first, oldest-first within a priority, so the lowest priority's FIRST entry is the oldest to drop.
    while (queue.length > MAX_Q) queue.splice(queue.findIndex((q) => q.p === queue[queue.length - 1].p), 1);
  }
  function write(item) {
    const r = region();
    current = item;
    if (!r) { phase = "idle"; current = null; return; }
    r.textContent = "";
    phase = "beat";
    timer = setTimeout(() => {
      r.textContent = item.text;
      item.at = now();
      phase = "hold";
      timer = setTimeout(pump, HOLD_MS);
    }, BEAT_MS);
  }
  function pump() {
    timer = 0; phase = "idle"; current = null;
    const t = now();
    while (queue.length) {
      const next = queue.shift();
      const stale = STALE_MS[next.kind];
      if (stale && t - next.queuedAt > stale) continue;
      write(next);
      return;
    }
  }

  /** Speak `text` on the polite region. `kind`: flag | penalty | save | radio | hud
   *  (a radio-card kind such as "penalty-hit" maps onto these). Returns true when
   *  the line starts now, false when it waits its turn. */
  function say(text, kind) {
    if (text == null || text === "") return false;
    const k = kindOf(kind);
    const item = { text: String(text), kind: k, p: PRIO[k], seq: seq++, queuedAt: now(), at: 0 };
    if (phase === "idle") { write(item); return true; }
    if (current && item.p > current.p) {
      clearTimeout(timer);
      // Not yet on screen: it waits behind the urgent line. Already written:
      // the reader has had it; the hold just ends early.
      if (phase === "beat") enqueue(current);
      write(item);
      return true;
    }
    enqueue(item);
    return false;
  }

  /** A new session: nothing queued from the last one is read into this one. */
  function reset() {
    clearTimeout(timer);
    timer = 0; phase = "idle"; current = null; queue.length = 0;
  }

  /** Test / debug view of the announcer (never a source of game state). */
  function state() {
    return { phase, current: current ? current.text : null, queued: queue.map((q) => q.kind + ":" + q.text) };
  }

  return { say, reset, state, PRIO, BEAT_MS, HOLD_MS };
})();
Object.freeze(LiveRegion);
