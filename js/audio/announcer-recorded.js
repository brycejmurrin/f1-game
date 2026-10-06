"use strict";
/* A recorded read owns its pending load as well as its playing clips. Unknown
 * event copy stays on the card; never change speakers halfway through it. */
const RecordedAnnouncer = (() => {
  function create(G) {
    let generation = 0, live = false, timer = null, deadline = null;
    const pack = () => G.radio && G.radio.pack;
    function planLine(p, id, text) {
      let spoken = text, plan = p.plan(id, spoken);
      if (!plan) {
        // Unbounded lap counts and duel names stay on the card. A recorded
        // generic session cue still gives the introduction its finish.
        spoken = text.replace(/^the sprint\.\s+\d+ laps,\s*/i, "the sprint, ")
          .replace(/^a duel with [^.]+\.\s*(?=just the two of you)/i, "a duel. ")
          .replace(/^\d+ laps\.\s*(?=let's go racing)/i, "");
        if (spoken !== text) plan = p.plan(id, spoken);
      }
      return { text: spoken, original: text, plan };
    }
    function stop() {
      generation++; live = false;
      clearTimeout(timer); clearTimeout(deadline); timer = deadline = null;
      if (pack()) pack().stop("intro");
    }
    function play(lines, budgetMs, landLast) {
      stop();
      const p = pack();
      if (!p || !G.soundOn) return false;
      const id = G.radio.recordedPack ? G.radio.recordedPack("announcer") : G.radio.recordedVoice("announcer"), gen = generation;
      const end = budgetMs > 0 ? Date.now() + budgetMs : Infinity;
      live = true;
      if (budgetMs > 0) deadline = setTimeout(stop, budgetMs);
      // G.paused: a load that resolves after a pause must not start a stale clip
      // on resume. stop() already bumps generation; this is the in-flight gate.
      const valid = () => gen === generation && G.soundOn && !G.paused
        && !(typeof document !== "undefined" && document.hidden);
      const ready = p.load ? p.load(id) : Promise.resolve(p.ready(id));
      ready.then((ok) => {
        if (!valid()) return;
        if (!ok) { stop(); return; }
        const queue = lines.map((text) => planLine(p, id, text)).filter((r) => r.plan);
        let i = 0;
        const next = () => {
          if (!valid()) return;
          if (i >= queue.length) { live = false; clearTimeout(deadline); deadline = null; return; }
          const row = queue[i++], left = (end - Date.now()) / 1000;
          if (row.plan.secs > left) { next(); return; }
          const closing = queue[queue.length - 1];
          const reserve = landLast && closing.original === lines[lines.length - 1] && i < queue.length ? closing.plan.secs + 0.85 : 0;
          if (reserve && row.plan.secs + reserve > left) { next(); return; }
          const wait = landLast && i === queue.length && row.original === lines[lines.length - 1] && Number.isFinite(left)
            ? Math.max(0, (left - row.plan.secs - 0.6) * 1000) : 0;
          timer = setTimeout(() => {
            timer = null;
            if (!valid()) return;
            const ok = p.speak(id, row.text, { channel: "intro", fx: "announcer", volume: G.radio.volume(),
              budgetS: (end - Date.now()) / 1000, valid,
              onEnd: () => { if (valid()) timer = setTimeout(next, 250); } });
            if (!ok) next();
          }, wait);
        };
        next();
      }).catch(() => { if (valid()) stop(); });
      return true;
    }
    function readMs(lines) {
      const p = pack();
      if (!p) return 0;
      const id = G.radio.recordedPack ? G.radio.recordedPack("announcer") : G.radio.recordedVoice("announcer");
      p.ensure(id);
      if (!p.ready(id)) return 0; // The loading screen keeps its normal flyby while loading.
      const covered = lines.map((text) => planLine(p, id, text).plan).filter(Boolean);
      return covered.length ? Math.round(covered.reduce((n, row) => n + row.secs + 0.25, 0) * 1000 + 600) : 0;
    }
    return { play, readMs, stop, speaking: () => live };
  }
  return Object.freeze({ create });
})();
