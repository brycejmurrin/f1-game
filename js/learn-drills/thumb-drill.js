/* Apex 26 — THUMB DRILL, LEARN's on-track sequel to the Vegas Thumb Trainer (#6927). You drive a Las Vegas Time Trial
   on the real car, with your own touch dock and profile; each corner shows the trainer's script cues on a card and is
   scored live, brake, arrow and gas timing, by the trainer's own score() (ThumbTrainer.script/score: one copy of the
   SHAPES and the maths). A lap card sums the 17 corners. RETRY and REWIND are the coach's (pause menu, or RETRY LAP on
   the card): the drill sees the clock jump back and drops what the jump undid.
   THE ARC NEVER REACHES THE DRIVER: this file reads the player's inputs (Input), the car's arc position and speed, and
   the circuit's turn list. It reads no curvature or racing line and writes nothing to a car
   (tests/unit/thumb-drill.test.mjs forbids both). LAZY_LEARN; started from LEARN or the trainer's TRY IT ON TRACK.
   No game.js branch: it stages the session through G like the aero drill, and restores it when the state returns to
   the menu, which it watches from its own frame loop. */
const ThumbDrill = (function () {
  "use strict";

  const BUF_S = 5;            // seconds of samples kept: longer than the longest script (3 s) plus its lead
  const MIN_SAMPLES = 8;      // a window with fewer rows (a pause, a rewind) is not scored
  const JUMP_M = 200;         // more arc than any car covers between two frames: a teleport, not driving

  /** The Vegas apexes in arc metres, in CORNERS order (def.turns are racing-lap fractions). */
  function apexes(def, total, corners) {
    return corners.map((c, i) => ({ name: c.name, s: (def.turns[i] || 0) * total }));
  }
  const fwd = (a, b, total) => ((b - a) % total + total) % total;   // forward metres from a to b

  /** Pure: the scorer. TT is ThumbTrainer (script/score). step(sample) takes one frame,
   *  {t (race clock s), s (arc m), a (signed arrow -1..1), b (brake 0..1), g (gas 0..1)}, and returns
   *  {scored: [{name, all, arrow, brake, gas, tips}], lap: null | {corners, all}, jumped}. */
  function createScorer(TT, marks, total) {
    let buf = [], pending = [], prev = null, results = new Map(), closing = null;
    function reset() { buf = []; pending = []; prev = null; results = new Map(); closing = null; }
    function windowFor(p) {
      const C = TT.script(p.name);
      return buf.map(r => ({ t: r.t - p.tApex + C.apex, s: r.a, b: r.b, g: r.g })).filter(r => r.t >= 0 && r.t <= C.dur);
    }
    function lapOf(map) {
      const corners = marks.filter(m => map.has(m.name)).map(m => ({ name: m.name, ...map.get(m.name) }));
      return corners.length ? { corners, all: corners.reduce((a, c) => a + c.all, 0) / corners.length } : null;
    }
    function step(x) {
      const out = { scored: [], lap: null, jumped: false };
      if (prev && x.t <= prev.t) {
        if (x.t === prev.t) return out;    // paused: the clock stood still
        // RETRY / REWIND: the world went back. Drop the windows it undid and the corners after the car's new place.
        out.jumped = true;
        buf = []; pending = []; closing = null;
        for (const m of marks) if (results.has(m.name) && m.s > x.s) results.delete(m.name);
        prev = x; buf.push(x);
        return out;
      }
      if (prev) {
        const d = fwd(prev.s, x.s, total);
        if (d > total - JUMP_M) { prev = x; buf.push(x); return out; }   // rolled back a little (a spin, a reverse): no crossings
        if (d > JUMP_M) {   // a teleport forward (a debug jump, a reset to the road): no corner was driven through
          out.jumped = true;
          buf = []; pending = []; closing = null;
          prev = x; buf.push(x);
          return out;
        }
        for (const m of marks) {
          const to = fwd(prev.s, m.s, total);
          if (to > 0 && to <= d) pending.push({ name: m.name, tApex: prev.t + (x.t - prev.t) * to / Math.max(1e-6, d), lap: !!closing });
        }
        if (x.s < prev.s) {   // the line: a corner still open (T17's window runs past it) joins the lap it began in
          if (closing) { out.lap = lapOf(closing.results); }
          closing = { results, open: new Set(pending.filter(p => !p.lap).map(p => p.name)) };
          for (const p of pending) p.lap = true;
          results = new Map();
        }
      }
      buf.push(x);
      while (buf.length && buf[0].t < x.t - BUF_S) buf.shift();
      pending = pending.filter(p => {
        const C = TT.script(p.name);
        if (x.t < p.tApex + (C.dur - C.apex)) return true;
        const rec = windowFor(p);
        const into = closing && closing.open.has(p.name) ? closing : null;
        if (rec.length >= MIN_SAMPLES) {
          const r = TT.score(p.name, rec);
          (into ? into.results : results).set(p.name, r);
          out.scored.push({ name: p.name, ...r });
        }
        if (into) into.open.delete(p.name);
        return false;
      });
      if (closing && !closing.open.size) { out.lap = lapOf(closing.results) || out.lap; closing = null; }
      prev = x;
      return out;
    }
    return { step, reset, results: () => new Map(results), pending: () => pending.slice() };
  }

  /** Pure: the cue for where the car is. Ahead of an apex the script time is apex − (metres to go / speed); after it,
   *  apex + the time since. Display only. */
  function cueAt(TT, marks, total, s, speed, t, recent) {
    const v = Math.max(5, speed);
    let after = null, ahead = null;
    for (const p of recent) {
      const C = TT.script(p.name), u = C.apex + (t - p.tApex);
      if (u <= C.dur && (!after || u < after.u)) after = { name: p.name, C, u };
    }
    for (const m of marks) {
      const C = TT.script(m.name), toGo = fwd(s, m.s, total) / v;
      if (toGo > 0 && toGo <= C.apex + 0.6 && (!ahead || toGo < ahead.toGo)) ahead = { name: m.name, C, toGo, u: Math.max(0, C.apex - toGo) };
    }
    // A corner past its apex keeps the cue until its exit; then the next one's script takes over (T14 into T15).
    const pick = after && (after.u <= after.C.tOut || !ahead) ? after : ahead;
    if (pick) return { name: pick.name, text: lineAt(pick.C, pick.u), u: pick.u };
    const next = marks.reduce((a, m) => fwd(s, m.s, total) < fwd(s, a.s, total) ? m : a, marks[0]);
    const C = TT.script(next.name);
    return { name: next.name, text: "Next: " + C.name + " " + (C.dir < 0 ? "◀" : "▶") + " " + C.label, u: null };
  }
  function lineAt(C, u) {
    let text = C.cues[0][1];
    for (const [at, cue] of C.cues) if (u >= at - 0.15) text = cue;
    return text;
  }

  const pct = v => Math.round(v * 100) + "%";

  let live = null;

  /** Stage a Las Vegas Time Trial and drive it with the cues. onFail runs when it cannot start (it reopens LEARN). */
  function launch(G, { onFail } = {}) {
    if (live) return false;   // already driving: onFail would reopen LEARN over it
    if (typeof DrillRegistry !== "undefined" && G.drills?.()?.active()) return false;   // a registry drill is live: one drill host at a time
    if (G.state !== "menu" || G.netPlay?.active?.() || typeof ThumbTrainer === "undefined") { onFail?.(); return false; }
    const vegas = Tracks.LIST.findIndex(d => d.id === "vegas");
    if (vegas < 0) { onFail?.(); return false; }
    const previous = { flow: G.flow, session: G.session, track: G.trackIdx, goal: G.coach.practiceGoal() };
    const quitFlow = { flow: G.flow, session: G.session };
    if (typeof UiExperience !== "undefined" && UiExperience.leavePracticePick) UiExperience.leavePracticePick();
    G.flow = "gp";
    G.session = "tt";
    G.trackIdx = vegas;
    if (typeof DrillRegistry !== "undefined") DrillRegistry.hold(true);
    const handle = live = run(G, onFail, () => {
      G.flow = previous.flow;   // through the setter, as the aero drill restores it
      G.session = previous.session;
      G.trackIdx = previous.track;
      G.coach.setPracticeGoal(previous.goal);
      if (typeof MenuQuitTail !== "undefined") MenuQuitTail.keepFlow(quitFlow.flow, quitFlow.session);
    });
    Log.info("ui", "ThumbDrill launch vegas");
    // startRace is async: a rejection (circuit load, entry refused) never reaches a try/catch, so hook the promise.
    const failed = (e) => { Log.warn("ui", "ThumbDrill could not start: " + (e && e.message || e)); handle.fail(); };
    try {
      const p = G.startRace();
      if (p && typeof p.then === "function") p.then(undefined, failed);
    } catch (e) {
      failed(e);
      return false;
    }
    return true;
  }

  function run(G, onFail, restore) {
    const TT = ThumbTrainer;
    // Bests ride the trainer's own store (ThumbTrainer.readBest/writeBest), in their own `track` field: the on-track
    // numbers never overwrite the off-track ones.
    const best = Object.assign({}, TT.readBest().track);
    const keys = { left: false, right: false };
    let scorer = null, marks = null, total = 0, raf = 0, left = false, raced = false, marked = false, armedLap = false;
    let flash = null, cardUntil = 0;
    let loadSeen = performance.now();
    const root = document.createElement("div");
    root.id = "thumb-drill";
    root.hidden = true;
    const cue = document.createElement("strong");
    cue.setAttribute("role", "status");
    const sub = document.createElement("span");
    root.append(cue, sub);
    const card = document.createElement("div");
    card.id = "thumb-drill-lap";
    card.hidden = true;
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Thumb drill lap summary");
    const head = document.createElement("strong");
    const grid = document.createElement("div");
    grid.id = "td-corners";
    const bar = document.createElement("div");
    bar.id = "td-actions";
    const retry = document.createElement("button");
    retry.type = "button"; retry.id = "td-retry"; retry.textContent = "RETRY LAP";
    const onward = document.createElement("button");
    onward.type = "button"; onward.id = "td-drive"; onward.textContent = "DRIVE ON";
    bar.append(retry, onward);
    card.append(head, grid, bar);
    document.body.append(root, card);
    retry.onclick = () => { card.hidden = true; G.coach.retry(); };
    onward.onclick = () => { card.hidden = true; };

    // Desktop fallback for the arrows (← →), read beside the game's own handler, never instead of it.
    function onKey(e) {
      if (e.key === "ArrowLeft") keys.left = e.type === "keydown";
      if (e.key === "ArrowRight") keys.right = e.type === "keydown";
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    function sample(c) {
      const lv = Input.touchLevels ? Input.touchLevels() : { left: 0, right: 0 };
      const l = Math.max(lv.left, keys.left ? 1 : 0), r = Math.max(lv.right, keys.right ? 1 : 0);
      return { t: G.raceT, s: c.s, a: l && !r ? -l : r && !l ? r : 0, b: Input.brakeLevel(), g: Input.throttleLevel() };
    }
    function showLap(lap) {
      const prevBest = best.lap || 0;
      best.lap = Math.max(prevBest, lap.all);
      for (const c of lap.corners) best[c.name] = Math.max(best[c.name] || 0, c.all);
      TT.writeBest(Object.assign(TT.readBest(), { track: best }));
      head.textContent = `LAP THUMBS ${pct(lap.all)} · ${lap.corners.length}/${marks.length} corners · best ${pct(best.lap)}` + (lap.all > prevBest && prevBest ? " · NEW BEST" : "");
      grid.replaceChildren(...lap.corners.map(c => {
        const cell = document.createElement("span");
        cell.textContent = c.name + " " + pct(c.all);
        cell.dataset.grade = c.all >= 0.85 ? "good" : c.all >= 0.65 ? "ok" : "low";
        return cell;
      }));
      card.hidden = false;
      Log.info("ui", "ThumbDrill lap " + pct(lap.all));
    }
    function tick() {
      raf = requestAnimationFrame(tick);
      if (G.state === "menu") {
        // The race loads with the state still "menu" behind #loading (minutes on a slow box): wait while it is up. Back
        // at the menu after a race, or 5 s after a load that never became one (a refused or failed start), restore.
        const loading = document.getElementById("loading");
        if (!raced && loading && !loading.hidden) loadSeen = performance.now();
        if (raced) stop();
        else if (performance.now() - loadSeen > 5000) fail();
        return;
      }
      raced = true;
      const c = G.player;
      if (!c || !G.track || G.state !== "race") { root.hidden = true; return; }
      if (!scorer) {
        total = G.track.total;
        marks = apexes(G.track.def, total, TT.CORNERS);
        scorer = createScorer(TT, marks, total);
      }
      if (!marked && G.coach.canPractice && G.coach.canPractice()) {
        G.coach.setPracticeGoal("lap");
        marked = G.coach.mark();
      }
      const x = sample(c), r = scorer.step(x);
      if (r.jumped) { flash = null; card.hidden = true; }
      if (!card.hidden && x.t > cardUntil) card.hidden = true;
      for (const s of r.scored) flash = { s, until: x.t + 1.6 };
      if (r.lap) {
        showLap(r.lap);
        cardUntil = x.t + 8;   // it steps aside for the next lap on its own
        // RETRY LAP returns to the start of the lap just driven: move the checkpoint to this line once.
        if (!armedLap && G.coach.mark()) armedLap = true;
      }
      root.hidden = !card.hidden;   // the lap card takes the cue card's place while it is up
      if (flash && x.t <= flash.until) {
        const s = flash.s;
        cue.textContent = `${s.name} ${pct(s.all)} · arrow ${pct(s.arrow)} · brake ${pct(s.brake)} · gas ${pct(s.gas)}`;
        sub.textContent = s.tips[0] || "";
      } else {
        const q = cueAt(TT, marks, total, x.s, c.speed || 0, x.t, scorer.pending());   // a corner past its apex keeps the cue
        const C = TT.script(q.name);
        cue.textContent = q.text;
        sub.textContent = q.u == null ? "" : C.name + " " + (C.dir < 0 ? "◀ LEFT" : "▶ RIGHT") + " · " + C.label + (best[C.name] ? " · best " + pct(best[C.name]) : "");
      }
    }
    /** The start never became a race: restore, then reopen LEARN (once; a stop() that already ran owns the exit). */
    function fail() {
      if (left || raced) return;   // a rejection that lands after the race began is the game's own quit, not a failed start
      stop();
      onFail?.();
    }
    function stop() {
      if (left) return;
      left = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      root.remove(); card.remove();
      live = null;
      if (typeof DrillRegistry !== "undefined") DrillRegistry.hold(false);
      restore();
      Log.info("ui", "ThumbDrill closed");
    }
    raf = requestAnimationFrame(tick);
    return { stop, fail, state: () => ({ cue: cue.textContent, sub: sub.textContent, lap: !card.hidden, marked, scored: scorer ? scorer.results().size : 0 }) };
  }

  return Object.freeze({ launch, stop: () => live?.stop(), state: () => live?.state() || null, apexes, createScorer, cueAt });
})();
Object.freeze(ThumbDrill);
