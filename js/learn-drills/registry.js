/* Apex 26 — DrillRegistry: the one host for LEARN's on-track scenario drills (#6920 U4.1, #6559 step 0).
   A drill is a frozen descriptor, define({id, lesson, setup, begin, guide}): `setup` names the session it races
   (flow, session, track id, weather, changeable, grid, duel, dirtyAir, wind), `begin(G, port)` places the cars once
   the grid is up (false = could not start), `guide(G)` builds its render-only lesson cues ({draw, hide, car, remove}).
   create(G, hooks) is game.js's host: launch(id) snapshots the player's settings, writes the drill's and starts the
   race; end(reason) puts every one back (the flow through G's setter, MenuQuitTail.keepFlow last, #6713).
   active() and guide() are read every frame: they return stable references and allocate nothing. `staging` stays a
   plain field on the active drill, so game.js holds the countdown until begin() runs.
   A scored drill also names `goal` (the RaceInsights practice goal whose finish ends one run), `sample(G, acc)` (a
   read-only accumulator, run by tick() while the run is live), `score(G, last, acc)` and `medals` (DrillCard.medalOf
   tiers); `stage(G)` (optional) sets a drill-scoped knob `setup` does not name and returns its undo, run by end().
   tick() turns each finished run into a result, persists it (DrillCard.record, apex26.learnMedals.v1) and
   shows the card: RETRY is retry() (the coach's checkpoint), BACK TO LESSON quits the race, and end() then reopens
   the lesson with {type:"apex-learn-result"} posted into it (#6559 step 2, #7039). `variants` ([{id, label, cta?,
   dirtyAir?}], the first is the default) are runs of one drill scored and saved apart: the card's NEXT button is
   rerun(next id), which applies the variant's dirtyAir and retries in place (#6559 step 5, A6). `medals` is a tier
   object or a pure (r, history) function, history this launch's earlier results (#6559 §1a).
   THE ARC NEVER REACHES THE DRIVER: nothing in js/learn-drills/ reads curvature or the racing line
   (tests/unit/drill-registry.test.mjs). Not RaceInsights.DRILLS (practice goals): a separate namespace.
   LAZY_LEARN; js/ui/learn-door.js defines the Aero drill lazily (its open()), never at eval: the bundle loads with no
   edges, so list order is not evaluation order. */
const DrillRegistry = (function () {
  "use strict";

  const SETUP = ["flow", "session", "track", "weather", "changeable", "grid", "duel", "dirtyAir", "wind"];
  const defs = new Map();

  function define(desc) {
    if (!desc || typeof desc.id !== "string" || !desc.id || typeof desc.begin !== "function" || !desc.setup ||
        SETUP.some(k => !(k in desc.setup))) throw new Error("DrillRegistry.define: bad descriptor " + (desc && desc.id));
    if (defs.has(desc.id)) return defs.get(desc.id);   // idempotent: the lazy definer runs on every LEARN open
    const d = Object.freeze({ ...desc, setup: Object.freeze({ ...desc.setup }) });
    defs.set(d.id, d);
    return d;
  }
  let foreign = false;
  /** A drill host outside this registry (the Thumb drill) marks itself live, so launch() refuses meanwhile. */
  const hold = on => { foreign = !!on; };
  const get = id => defs.get(id) || null;
  const ids = () => [...defs.keys()];
  const forLesson = lesson => [...defs.values()].filter(d => d.lesson === lesson);
  /** The named variant, else the drill's first; a drill with none runs as "classic". */
  const variantOf = (d, id) => (d.variants || []).find(v => v.id === id) || (d.variants || [])[0] || { id: "classic" };

  /** hooks: { retry() (the coach's RETRY LAP), setDirtyAir(level) (raceDirtyAir is a game.js let), insights() (the
   *  coach's RaceInsights), reopenLesson?(lesson, result) (default LearnDoor.reopen) }. The host builds the DrillPort
   *  (types/game-ctx.d.ts) a drill's begin() and guide() get: G's own members plus the host's retry, never all of G. */
  function create(G, hooks) {
    const { setDirtyAir } = hooks;
    const port = Object.freeze({
      startRace: () => G.startRace(),
      goRolling: () => G.goRolling(),
      retry: () => retry(),
      rerun: (variant) => rerun(variant),   // a variant chip: that variant's run from the checkpoint
      physState: () => (typeof window !== "undefined" && window.__apex ? window.__apex.physState() : null),   // null while LAZY_AGENT is absent
      announce: (msg, dur, kind) => G.announce(msg, dur, kind),
      store: G.store,
    });
    let current = null;
    let lastResult = null;

    // Use the production race, wind, aero and checkpoint code. These settings
    // belong to the drill and are restored when its race ends or cannot start.
    function launch(id, variant) {
      const d = defs.get(id);
      if (!d || current || G.state !== "menu" || G.netPlay.active()) return false;
      if (foreign) return false;   // another drill host (the Thumb drill) is live: one at a time
      const s = d.setup;
      const track = Tracks.LIST.findIndex(def => def.id === s.track);
      if (track < 0) return false;
      const previous = {
        flow: G.flow, session: G.session, track: G.trackIdx, weather: G.raceWeather, changeable: G.raceChangeable, grid: G.raceGrid,
        duel: G.duel, dirtyAir: G.raceDirtyAir, wind: Wind.level(), goal: G.coach.practiceGoal(),
      };
      // The quit tail runs after restore(): it gets the player's flow (#6713).
      const quitFlow = { flow: G.flow, session: G.session };
      const guide = d.guide ? d.guide(G, port) : null;
      /** @type {null | (() => void)} */
      let undo = null;   // stage(G)'s own undo: a drill-scoped knob outside `setup` (the Thermal Lab's tyre wear)
      lastResult = null;
      current = {
        id,
        d,
        guide,
        staging: false,
        run: null,       // {acc, prog}: the live run's accumulator, made on its first tick
        result: null,    // the last finished run's result, while its card is up
        attempt: 0,
        failed: false,
        variant: variantOf(d, variant).id,
        history: [],     // this launch's finished results, oldest first (a medal function's second argument)
        begin() {
          this.staging = false;
          if (guide) guide.hide();
          const ok = d.begin(G, port);
          if (!ok) this.failed = true;   // game.js quits; end() then reopens nothing
          return ok;
        },
        restore() {
          if (guide) guide.remove();
          G.flow = previous.flow;   // through the setter: re-engages Career and SeasonCal for the player's own flow
          G.session = previous.session;
          G.trackIdx = previous.track;
          G.raceWeather = previous.weather;
          G.raceChangeable = previous.changeable;
          G.raceGrid = previous.grid;
          G.duel = previous.duel;
          setDirtyAir(previous.dirtyAir);
          Wind.setLevel(previous.wind);
          G.coach.setPracticeGoal(previous.goal);
          if (undo) undo();
          if (typeof MenuQuitTail !== "undefined") MenuQuitTail.keepFlow(quitFlow.flow, quitFlow.session);
        },
      };
      UiExperience.leavePracticePick();
      G.flow = s.flow;
      G.session = s.session;
      G.trackIdx = track;
      G.raceWeather = s.weather;
      G.raceChangeable = s.changeable;
      G.raceGrid = s.grid;
      G.duel = s.duel;
      setDirtyAir(variantOf(d, variant).dirtyAir || s.dirtyAir);
      Wind.setLevel(s.wind);
      if (typeof d.stage === "function") undo = d.stage(G) || null;
      port.startRace();
      return true;
    }

    /** The drill's race ended or could not start (game.js quitToMenu): restore first, forget it, then reopen its
     *  lesson with the last result (#6555 A2). A start that never placed the cars reopens nothing. */
    function end(reason) {
      if (!current) return false;
      const { d, failed } = current, result = lastResult;
      if (typeof DrillCard !== "undefined") DrillCard.hide();
      current.restore();
      current = null;
      lastResult = null;
      if (!failed && reason !== "place-failed") {
        const reopen = hooks.reopenLesson || ((lesson, r) => typeof LearnDoor !== "undefined" && LearnDoor.reopen(lesson, r));
        reopen(d.lesson, result ? { id: d.id, result } : null);
      }
      return true;
    }

    /** RETRY (the card, the guide's chip): back to the begin() checkpoint, a fresh run. */
    function retry() {
      if (!current) return false;
      if (typeof DrillCard !== "undefined") DrillCard.hide();
      current.result = null;
      current.run = null;
      return !!hooks.retry();
    }

    /** NEXT VARIANT (the card): the variant's dirty-air level, then a fresh run from the begin() checkpoint. */
    function rerun(variant) {
      if (!current || !current.d.variants) return false;
      const v = variantOf(current.d, variant);
      if (v.id !== variant) return false;
      current.variant = v.id;
      setDirtyAir(v.dirtyAir || current.d.setup.dirtyAir);
      return retry();
    }

    /** One finished run: score, medal, save, card. */
    function finish(last) {
      const a = current, d = a.d;
      const scored = d.score(G, last, a.run.acc, a.variant);
      const r = { id: d.id, variant: a.variant, title: d.title || d.id, attempt: ++a.attempt, ...scored };
      r.medal = typeof d.medals === "function" ? d.medals(r, a.history.slice()) : DrillCard.medalOf(r, d.medals);
      a.history.push(r);
      const saved = DrillCard.record(G.store, d.id + "|" + r.variant, r);
      r.best = saved.row ? saved.row.best : undefined;
      r.improved = saved.improved;
      a.result = lastResult = r;
      a.run = null;
      Log.info("ui", "drill " + d.id + " " + Number(r.value).toFixed(1) + " " + r.unit + " " + (r.medal || "no medal"));
      const vs = d.variants || [], k = vs.findIndex(v => v.id === a.variant), nv = vs.length > 1 ? vs[(k + 1) % vs.length] : null;
      const next = nv ? { label: nv.cta || "TRY " + nv.label.toUpperCase(), run: () => rerun(nv.id) } : null;
      DrillCard.show(r, { retry, back: () => G.quitToMenu(), next, paused: () => !!G.paused });
      return r;
    }

    /** Called where the coach updates (game.js). Samples the live run read-only; a finished run becomes a result.
     *  A run is the goal's RaceInsights drill, finished once after this host saw it live: RETRY, the RECOVER key and
     *  REWIND restart it, and a backward jump in progress starts a new accumulator. */
    function tick() {
      try { return drillTickBody(); } catch (e) {
        Log.warn("ui", "drill tick failed: " + (e && e.message || e));
        if (current) current.run = null;   // drop the run: the next tick starts a fresh accumulator
        return null;
      }
    }
    function drillTickBody() {
      const a = current;
      if (!a || !a.d.goal || G.state !== "race" || !hooks.insights) return null;
      const insights = hooks.insights(), p = G.player;
      const s = insights && insights.summary();
      if (!p || !s || !s.drill || s.drill.mode !== a.d.goal) return null;
      if (!s.drill.done) {
        if (!a.run || p.prog < a.run.prog - 10) {
          if (a.result && typeof DrillCard !== "undefined") DrillCard.hide();   // a new run took the card's place
          a.result = null;
          a.run = { acc: {}, prog: p.prog };
        }
        a.run.prog = p.prog;
        if (a.d.sample) a.d.sample(G, a.run.acc, port);
        return null;
      }
      if (!a.run || !s.lastDrill) return null;
      return finish(s.lastDrill);
    }

    return {
      launch,
      begin: () => (current ? current.begin() : false),
      end,
      tick,
      retry,
      rerun,
      lastResult: () => lastResult,
      active: () => current,
      guide: () => (current ? current.guide : null),
      state: () => (current ? { id: current.id, variant: current.variant, staging: current.staging, attempt: current.attempt, live: !!current.run,
        result: current.result ? { value: current.result.value, medal: current.result.medal } : null } : null),
    };
  }

  return { define, get, ids, forLesson, create, hold };
})();
Object.freeze(DrillRegistry);
