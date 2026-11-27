/* Apex 26 — DrillRegistry: the one host for LEARN's on-track scenario drills (#6920 U4.1, #6559 step 0).
   A drill is a frozen descriptor, define({id, lesson, setup, begin, guide}): `setup` names the session it races
   (flow, session, track id, weather, changeable, grid, duel, dirtyAir, wind), `begin(G, port)` places the cars once
   the grid is up (false = could not start), `guide(G)` builds its render-only lesson cues ({draw, hide, car, remove}).
   create(G, hooks) is game.js's host: launch(id) snapshots the player's settings, writes the drill's and starts the
   race; end(reason) puts every one back (the flow through G's setter, MenuQuitTail.keepFlow last, #6713).
   active() and guide() are read every frame: they return stable references and allocate nothing. `staging` stays a
   plain field on the active drill, so game.js holds the countdown until begin() runs.
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
  const get = id => defs.get(id) || null;
  const ids = () => [...defs.keys()];
  const forLesson = lesson => [...defs.values()].filter(d => d.lesson === lesson);

  /** hooks: { retry() (the coach's RETRY LAP), setDirtyAir(level) (raceDirtyAir is a game.js let) }. The host builds
   *  the DrillPort (types/game-ctx.d.ts) a drill's begin() gets: G's own members plus those two, never all of G. */
  function create(G, hooks) {
    const { setDirtyAir } = hooks;
    const port = Object.freeze({
      startRace: () => G.startRace(),
      goRolling: () => G.goRolling(),
      retry: () => hooks.retry(),
      physState: () => (typeof window !== "undefined" && window.__apex ? window.__apex.physState() : null),   // null while LAZY_AGENT is absent
      announce: (msg, dur, kind) => G.announce(msg, dur, kind),
      store: G.store,
    });
    let current = null;

    // Use the production race, wind, aero and checkpoint code. These settings
    // belong to the drill and are restored when its race ends or cannot start.
    function launch(id) {
      const d = defs.get(id);
      if (!d || current || G.state !== "menu" || G.netPlay.active()) return false;
      const s = d.setup;
      const track = Tracks.LIST.findIndex(def => def.id === s.track);
      if (track < 0) return false;
      const previous = {
        flow: G.flow, session: G.session, track: G.trackIdx, weather: G.raceWeather, changeable: G.raceChangeable, grid: G.raceGrid,
        duel: G.duel, dirtyAir: G.raceDirtyAir, wind: Wind.level(), goal: G.coach.practiceGoal(),
      };
      // The quit tail runs after restore(): it gets the player's flow (#6713).
      const quitFlow = { flow: G.flow, session: G.session };
      const guide = d.guide ? d.guide(G) : null;
      current = {
        id,
        guide,
        staging: false,
        begin() {
          this.staging = false;
          if (guide) guide.hide();
          return d.begin(G, port);
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
      setDirtyAir(s.dirtyAir);
      Wind.setLevel(s.wind);
      port.startRace();
      return true;
    }

    /** The drill's race ended or could not start (game.js quitToMenu): restore first, then forget it. */
    function end(reason) {
      if (!current) return false;
      current.restore();   // reason ("quit"): the one end today; drills that score a finish will read it
      current = null;
      return true;
    }

    return {
      launch,
      begin: () => (current ? current.begin() : false),
      end,
      retry: () => (current ? hooks.retry() : false),   // the coach's RETRY LAP, for __apex.drillRetry (js/agent/apex-drill.js)
      active: () => current,
      guide: () => (current ? current.guide : null),
      state: () => (current ? { id: current.id, staging: current.staging } : null),
    };
  }

  return { define, get, ids, forLesson, create };
})();
Object.freeze(DrillRegistry);
