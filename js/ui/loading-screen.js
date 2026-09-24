"use strict";
/* Apex 26 — PRE-RACE LOADING SCREEN.
 *
 * The flyby used to play BEHIND the race-settings sheet, where it competed
 * with the settings rows for attention and made the menu look like a paused
 * race. It now plays here instead, in the gap the player already pays for:
 * between pressing RACE! and the grid appearing.
 *
 * THE CARD AND THE FLYBY RUN TOGETHER. They used to be two phases — cinematic
 * first, card afterwards — because the card was there to stall behind while
 * loadTrack() did its ~1.1 s of synchronous work. That is not what the wait is
 * any more: the world is BUILT UNDER RACE SETTINGS (scheduleFlybyTrack, and
 * loadTrack memoises on builtTrackId, so the call at race start is nearly free),
 * so by the time RACE! is pressed there is nothing to hide. Showing the card
 * afterwards just meant the flyby and the circuit's details never shared the
 * screen. The card now fades in at the start and stays for the whole sequence.
 *
 * With no pre-built world to fly over — a circuit picked a moment ago, scenery
 * still downloading — there is no cinematic to play: the card goes up alone and
 * the build runs immediately behind it.
 *
 * Any pointer or key ends the screen early: it is a flourish, and a flourish
 * that cannot be skipped is a wait.
 */
const LoadingScreen = (function () {
  // The whole sequence's budget. js/camera/flyby-seq.js spends it across eight
  // shots as FRACTIONS, so retuning this number rebalances them all rather than
  // truncating the last one. 24 s is 3 s a shot, which is what a pan needs to
  // read as a move rather than a jerk. Skippable with any pointer or key.
  const FLY_MS = 24000;
  // With nothing to fly over, just long enough for the card's fade to land
  // before the build takes the main thread.
  const CARD_MS = 700;
  /* THE HABITUAL SKIPPER. A player who has skipped the last SKIP_STREAK flybys
   * in a row has told us what they think of 24 s; they get SHORT_FLY_MS instead.
   * The shots are fractions of the budget and the announcer is fitted to it, so
   * both follow without a second sequence. One flyby left to play out resets
   * the streak — the long cut comes back for anyone who watched it again.
   * Stored as `apex26.flySkips` through the game's store. */
  const SHORT_FLY_MS = 12000;
  const SKIP_STREAK = 3;
  /** The flyby's budget for a stored streak. Pure; hostile input is no streak. */
  function flyMsFor(skips) {
    const n = Number.isFinite(+skips) ? +skips : 0;
    return n >= SKIP_STREAK ? SHORT_FLY_MS : FLY_MS;
  }
  /** The streak after one flyby: a skip extends it, a flyby watched to the end
   *  clears it. Capped so a stored number never grows without bound. */
  function nextSkips(skips, skipped) {
    const n = Number.isFinite(+skips) && +skips > 0 ? Math.floor(+skips) : 0;
    return skipped ? Math.min(n + 1, 99) : 0;
  }

  /* ── THE CARD'S OWN GEOMETRY ────────────────────────────────────────────
   * The card is a lower third over a moving camera, and where a lower third
   * belongs depends on the shot. The shipped placement suits the shipped
   * sequence; an author who re-frames the flyby (js/camera/flyby-panel.js)
   * usually has to move the card with it, and a player on a 21:9 monitor or a
   * phone in portrait wants it somewhere else again. So it is three numbers,
   * authored in the flyby editor beside the shots they are framed against.
   *
   * THREE KNOBS, EACH DOING EXACTLY ONE THING. A width slider AND a size
   * slider was the first shape and it was two controls for one question — the
   * author could not tell which one had made the card too big. SIZE scales the
   * whole plate, type and outline together; X and Y move it. Nothing else.
   *
   * The UNITS ARE THE SCREEN'S, not the card's: a translate in percent would be
   * a percentage of the card, so the same saved number would move a scaled card
   * further than an unscaled one. vw/vh means "a fifth of the way across",
   * which is what an author picking a position actually means. */
  const CARD = Object.freeze({
    scale: { label: "CARD SIZE", min: 0.6, max: 1.6, step: 0.02, unit: "x", def: 1 },
    x: { label: "CARD X", min: -40, max: 40, step: 1, unit: " vw", def: 0 },
    y: { label: "CARD Y", min: -70, max: 6, step: 1, unit: " vh", def: 0 },
  });
  const CARD_KEYS = Object.freeze(Object.keys(CARD));

  /** A COMPLETE, in-range geometry from anything at all — a saved object from a
   *  future build, a hand-edited store, null. Pure, and the only way this
   *  module ever reads one: a partial geometry reaching the stylesheet would
   *  put `NaNvw` in a custom property, where CSS drops the declaration and the
   *  card silently keeps the PREVIOUS value rather than the default. */
  function clampCard(geom) {
    const out = {};
    for (const k of CARD_KEYS) {
      const d = CARD[k];
      const v = geom && Number.isFinite(+geom[k]) ? +geom[k] : d.def;
      out[k] = Math.min(d.max, Math.max(d.min, v));
    }
    return out;
  }

  /** True when every field is the shipped value. NULL IS STORED FOR THIS, never
   *  a copy of the defaults — the same rule the flyby shot list follows, and for
   *  the same reason: a stored copy pins the player to today's numbers and
   *  silently ignores every later change to them. */
  function cardPristine(geom) {
    const g = clampCard(geom);
    return CARD_KEYS.every((k) => g[k] === CARD[k].def);
  }

  /** The custom properties css/overlays.css reads off #ld-card. */
  function cardVars(geom) {
    const g = clampCard(geom);
    return {
      "--ld-card-scale": String(g.scale),
      "--ld-card-x": g.x + "vw",
      "--ld-card-y": g.y + "vh",
    };
  }

  function create(hooks) {
    const { $, Tracks, TrackMaps, Flags, store } = hooks;
    /* The announcer may arrive as a THUNK rather than an instance, and js/game.js
     * passes one. `announcer` there is a `let` that starts at Announcer.inert()
     * and is reassigned at the module wires; today those wires run before this
     * screen is created, but that ordering is not a contract anyone maintains,
     * and a captured inert() would fail SILENTLY — play() returning false is
     * indistinguishable from the player having turned the announcer off. */
    const ann = () => {
      const a = typeof hooks.announcer === "function" ? hooks.announcer() : hooks.announcer;
      return a && typeof a.play === "function" ? a : null;
    };

    let timer = 0, phase = "", build = null, el = null, flyT0 = 0, flyMs = FLY_MS;

    function readSkips() {
      try { return store && store.get ? store.get("flySkips", 0) : 0; } catch (_) { return 0; }
    }
    /** Record how the flyby ended. Only a FLYBY counts — the no-world card is
     *  700 ms and nobody is choosing anything by letting it run. */
    function noteFlyby(skipped) {
      if (phase !== "run") return;
      try { if (store && store.set) store.set("flySkips", nextSkips(readSkips(), skipped)); }
      catch (_) { /* storage refused: the streak just does not build */ }
    }

    // The map's slot in the card, in CSS px. fitCanvas keeps the circuit's own
    // aspect inside it, so a wide circuit gets the width and a tall one the height.
    const MAP_W = 210, MAP_H = 150;

    // The live geometry, read from the store on first use and kept after.
    let geom = null;
    function cardGeom() {
      if (geom) return geom;
      let saved = null;
      try { saved = store && store.get ? store.get("ldCard", null) : null; } catch (_) { saved = null; }
      geom = clampCard(saved);
      return geom;
    }
    /** Patch the geometry, save it and push it at the card. Returns the clamped
     *  result so the editor's sliders show what actually took effect rather than
     *  what they asked for. */
    function setCardGeom(patch) {
      geom = clampCard(Object.assign({}, cardGeom(), patch));
      try { if (store && store.set) store.set("ldCard", cardPristine(geom) ? null : geom); }
      catch (e) { Log.warn("game", "loading card geometry did not save", e); }
      applyCard();
      return Object.assign({}, geom);
    }
    /** Write the three custom properties. Inline on the element, not a class:
     *  the values are continuous and the stylesheet cannot enumerate them. */
    function applyCard() {
      const c = $("ld-card");
      if (!c || !c.style || typeof c.style.setProperty !== "function") return;
      const vars = cardVars(cardGeom());
      for (const k in vars) c.style.setProperty(k, vars[k]);
    }

    const WX = { dry: "DRY", wet: "WET", rain: "RAIN", overcast: "CLOUDY", fog: "FOG" };
    const TOD = { dawn: "DAWN", day: "DAY", dusk: "DUSK", night: "NIGHT" };

    function root() { return el || (el = $("loading")); }

    function paint(info) {
      const t = info.track;
      if (!t) return;
      $("ld-flag").innerHTML = Flags.svg(t.country);
      $("ld-name").textContent = t.name + (t.night ? " ☾" : "");
      $("ld-gp").textContent = t.gp || t.country || "";
      // The same numbers the select card shows, minus the ones that need the
      // built world — this paints before any build has necessarily happened.
      const km = t.lengthKm || 0;
      const turns = TrackMaps.corners(t).length;
      const rows = [
        ["LAPS", info.laps ? String(info.laps) : "—"],
        ["LENGTH", km ? km.toFixed(3) + " km" : "—"],
        ["TURNS", turns ? String(turns) : "—"],
        ["WEATHER", WX[info.weather] || "DRY"],
        ["TIME", TOD[info.tod] || (t.night ? "NIGHT" : "DAY")],
      ];
      drawMap(t);
      const meta = $("ld-meta");
      if (typeof meta.replaceChildren === "function") meta.replaceChildren(); else meta.textContent = "";
      for (const [k, v] of rows) {
        const pair = document.createElement("div");
        const dt = document.createElement("dt"); dt.textContent = k;
        const dd = document.createElement("dd"); dd.textContent = v;
        pair.append(dt, dd);
        meta.appendChild(pair);
      }
    }

    /** The lap outline, on the circuit picker's recipe: white line, dark casing,
     *  red start marker, no corner/sector/DRS furniture. Sized from the
     *  circuit's own aspect, and oversampled for HiDPI the way the picker's
     *  preview is, with the line weight scaled by the same ratio so it keeps
     *  its visual thickness. Wrapped: a map that will not draw must never stop
     *  a race from starting. */
    function drawMap(t) {
      const cv = $("ld-map");
      // TrackMaps comes from `hooks`, not window: every module here is a bare
      // lexical `const` at script scope, so window.TrackMaps is undefined and a
      // window-based guard would silently skip the map on every boot.
      if (!cv || !TrackMaps || typeof TrackMaps.draw !== "function") return;
      try {
        const fit = TrackMaps.fitCanvas(cv, MAP_W, MAP_H, t, true);
        // THE CARD'S SCALE IS PART OF THE OVERSAMPLE. A canvas laid out at 210
        // CSS px and then scaled to 1.6 by the card is a 210 px raster stretched
        // across 336 — the one element on the card that cannot reflow, and the
        // one that shows it. Folding the scale in here draws the pixels the
        // player actually sees. Still capped at 3: the cap is about memory.
        const ratio = Math.min(3, Math.max(1, (window.devicePixelRatio || 1) * cardGeom().scale));
        if (ratio > 1.01) {
          cv.width = Math.round(fit.w * ratio);
          cv.height = Math.round(fit.h * ratio);
        }
        const br = fit.w ? (cv.width / fit.w) : 1;
        const lw = Math.max(2, Math.round(Math.min(fit.w, fit.h) / 42));
        TrackMaps.draw(cv, t, {
          color: "#ffffff", casing: "rgba(0,0,0,0.55)", startColor: "#e10600",
          width: lw * br, pad: Math.round(lw * 1.5) * br,
          corners: false, sectors: false, drs: false,
        });
      } catch (_) { /* no outline is a smaller loss than no race */ }
    }

    function setPhase(p) {
      phase = p;
      const r = root();
      if (r) r.dataset.phase = p;
    }

    function fire() {
      clearTimeout(timer);
      timer = 0;
      const go = build;
      build = null;
      if (go) go();
    }

    /** A skip goes straight to the race. There is no second half to advance to
     *  any more, and the build behind it is already warm. */
    // A keydown AUTO-REPEAT is not a new press: holding Enter a beat long on
    // RACE! used to skip the flyby on the first repeat.
    // Once per run: the listeners stay up until startRace lowers the screen, and a
    // triple tap counted three skips (the short flyby arrived a run early).
    function onSkip(e) { if (e && e.type === "keydown" && e.repeat) return; if (phase && build) { noteFlyby(true); fire(); } }
    /* THE PAD SKIPS TOO. No UI layer is open during the flyby, so the gamepad
     * walker sends no synthetic keydown and a controller-only player (TV, a
     * handheld) waited the full FLY_MS before every race. Poll the pads while
     * the screen is up: a button counts only as a fresh press, so one still
     * held from the menu has to come up first. */
    let padTimer = 0;
    const padHeld = new Set();
    function padButtons(fn) {
      let pads = [];
      try { pads = (typeof navigator !== "undefined" && navigator.getGamepads && navigator.getGamepads()) || []; } catch (_) { pads = []; }
      for (const p of pads) {
        if (!p || !p.buttons) continue;
        for (let i = 0; i < p.buttons.length; i++) fn(p.index + ":" + i, !!(p.buttons[i] && p.buttons[i].pressed));
      }
    }
    function pollPad() {
      let fresh = false;
      padButtons((k, down) => {
        if (!down) padHeld.delete(k);
        else if (!padHeld.has(k)) { padHeld.add(k); fresh = true; }
      });
      if (fresh) onSkip();
    }

    /** Show the screen and run `go` once the card is up. `info.hasWorld` false
     *  (no pre-built track to fly over) skips the flyby: an empty black hold
     *  is not a cinematic, it is a stall with extra steps. */
    function run(info, go) {
      stop();
      build = typeof go === "function" ? go : null;
      const r = root();
      if (!r) { fire(); return; }          // no markup: degrade to "just race"
      paint(info);
      applyCard();
      r.hidden = false;
      addEventListener("pointerdown", onSkip, true);
      addEventListener("keydown", onSkip, true);
      padHeld.clear();
      padButtons((k, down) => { if (down) padHeld.add(k); });   // held from the menu: not a skip
      if (typeof setInterval === "function") padTimer = setInterval(pollPad, 100);
      flyT0 = Date.now();
      // "run" is the flyby WITH the card up; "card" is the no-world fallback.
      // Both show the card, so the stylesheet reveals it for either.
      setPhase(info.hasWorld ? "run" : "card");
      const life = info.hasWorld ? flyMsFor(readSkips()) : CARD_MS;
      flyMs = info.hasWorld ? life : FLY_MS;
      // The letterbox (css/overlays.css) opens on the flyby's last beat, so it
      // needs the budget this run actually has, not the 24 s it usually is.
      if (r.style && typeof r.style.setProperty === "function") r.style.setProperty("--ld-fly", life + "ms");
      timer = setTimeout(() => { noteFlyby(false); fire(); }, life);
      /* THE ANNOUNCER (js/audio/announcer.js) reads the card aloud, and it is
       * given THIS SCREEN'S budget so the skip that ends the flyby ends the
       * voice too. Without that a skipped 24 s welcome keeps talking over the
       * formation lap — speechSynthesis is not in the WebAudio graph, so
       * nothing else would have stopped it.
       *
       * ONLY OVER THE FLYBY. The no-world path is a 700 ms fade, and 700 ms of
       * "Welcome to—" cut off mid-word is worse than silence. */
      if (info.hasWorld) {
        const a = ann();
        if (a) { try { a.play(info, life); } catch (e) { Log.warn("audio", "announcer failed", e); } }
      }
    }

    /** Close and disarm. Called by clearMenuScreens() once the race owns the
     *  screen, and by anything that cancels the run before the build fires. */
    function stop() {
      clearTimeout(timer);
      timer = 0;
      build = null;
      phase = "";
      // The voice outlives the screen unless something cancels it: the screen's
      // own budget timer is cleared above, and speechSynthesis has no owner.
      const a = ann();
      if (a) { try { a.stop(); } catch (_) { /* a synth mid-teardown */ } }
      removeEventListener("pointerdown", onSkip, true);
      removeEventListener("keydown", onSkip, true);
      if (padTimer) { clearInterval(padTimer); padTimer = 0; }
      const r = root();
      if (r) { r.hidden = true; r.dataset.phase = ""; }
    }

    /* THE EDITOR'S HOLD. The card's size and position cannot be authored blind,
     * and the screen they belong to only exists for the 24 s between RACE! and
     * the grid — so the flyby editor puts the real card up, over the real
     * scene, and leaves it there while the sliders move.
     *
     * A THIRD PHASE, not `run` with the timer suppressed. "card" and "run" both
     * arm a skip handler and own the screen; this one is a preview under a
     * panel, so it must not swallow the clicks the panel is there to receive
     * (css/overlays.css turns pointer events off for it) and must not report
     * itself active(), which is what keeps game.js drawing the world for a
     * loading screen that is genuinely loading. */
    function hold(info) {
      stop();
      const r = root();
      if (!r || !info || !info.track) return false;
      paint(info);
      applyCard();
      r.hidden = false;
      setPhase("hold");
      return true;
    }

    return {
      run, stop, hold,
      /** The flyby editor's three sliders. setCard() PATCHES — it merges onto
       *  what is there, so a size slider does not reset the position. RESET is
       *  resetCard(), which drops the geometry first: clampCard(null) is every
       *  shipped default, and storing it then clears the key, because pristine
       *  is stored as null. */
      card: () => Object.assign({}, cardGeom()),
      setCard: (patch) => setCardGeom(patch),
      resetCard() { geom = clampCard(null); return setCardGeom({}); },
      /** How far through the FLYBY the screen is, 0..1. The shot sequencer is
       *  driven by this rather than by the wall clock, so the sequence keeps its
       *  shape when FLY_MS is retuned (or shortened for a habitual skipper),
       *  and a phase skipped by a keypress does not
       *  leave the camera mid-move. 1 once the card is up, 0 when nothing runs. */
      progress() {
        if (phase !== "run" || !flyT0) return 0;
        return Math.max(0, Math.min(1, (Date.now() - flyT0) / flyMs));
      },
      /** True while the screen owns the canvas — game.js keeps the world
       *  drawn for exactly this window and blanks every other menu. */
      active() { return phase === "run" || phase === "card"; },
      phase() { return phase; },
    };
  }

  return { create, FLY_MS, SHORT_FLY_MS, SKIP_STREAK, flyMsFor, nextSkips, CARD_MS, CARD, CARD_KEYS, clampCard, cardPristine, cardVars };
})();
Object.freeze(LoadingScreen);
