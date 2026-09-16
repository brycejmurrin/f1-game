"use strict";
/* Apex 26 — PRE-RACE LOADING SCREEN.
 *
 * The flyby used to play BEHIND the race-settings sheet, where it competed
 * with the settings rows for attention and made the menu look like a paused
 * race. It now plays here instead, in the gap the player already pays for:
 * between pressing RACE! and the grid appearing.
 *
 * Two phases, and the split is load-bearing:
 *   FLY  — the canvas shows the cinematic camera over the world that
 *          scheduleFlybyTrack() already pre-built under the picker. Nothing
 *          heavy runs, so the frames are smooth.
 *   CARD — the wordmark and the circuit card fade in over the world. ONLY
 *          THEN does the caller run its build. loadTrack() is ~1.1 s of
 *          SYNCHRONOUS work with no progress signal (js/game.js), so it can
 *          only ever stall whatever is on screen — a static DOM card stalls
 *          invisibly, a moving camera stalls as a freeze.
 *
 * Any pointer or key during FLY skips to CARD: the screen is a flourish, and
 * a flourish that cannot be skipped is a wait.
 */
const LoadingScreen = (function () {
  // A CINEMATIC NEEDS LONG ENOUGH TO READ AS ONE. The first cut was 1.5 s + 0.42 s
  // and played as a flicker: the camera barely moved before the card took the
  // screen. These are the budget for the whole screen, and it is skippable with
  // any pointer or key — an intro nobody can cut past is a wait, not a flourish.
  const FLY_MS = 10000;   // cinematic hold before the card arrives
  // Fade (0.4 s, css) PLUS a hold: the card carries a lap outline now, and a
  // map nobody has time to look at is decoration. The build starts when this
  // elapses and then owns the screen for its ~1.1 s, so the card is readable
  // for roughly 2.7 s in total.
  const CARD_MS = 1600;

  function create(hooks) {
    const { $, Tracks, TrackMaps, Flags } = hooks;

    let timer = 0, phase = "", build = null, el = null, flyT0 = 0;

    // The map's slot in the card, in CSS px. fitCanvas keeps the circuit's own
    // aspect inside it, so a wide circuit gets the width and a tall one the height.
    const MAP_W = 210, MAP_H = 150;

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
        const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
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

    function toCard() {
      if (phase !== "fly") return;
      clearTimeout(timer);
      setPhase("card");
      timer = setTimeout(fire, CARD_MS);
    }

    function fire() {
      clearTimeout(timer);
      timer = 0;
      const go = build;
      build = null;
      if (go) go();
    }

    function onSkip() { toCard(); }

    /** Show the screen and run `go` once the card is up. `info.hasWorld` false
     *  (no pre-built track to fly over) skips the flyby: an empty black hold
     *  is not a cinematic, it is a stall with extra steps. */
    function run(info, go) {
      stop();
      build = typeof go === "function" ? go : null;
      const r = root();
      if (!r) { fire(); return; }          // no markup: degrade to "just race"
      paint(info);
      r.hidden = false;
      addEventListener("pointerdown", onSkip, true);
      addEventListener("keydown", onSkip, true);
      if (info.hasWorld) {
        flyT0 = Date.now();
        setPhase("fly");
        timer = setTimeout(toCard, FLY_MS);
      } else {
        setPhase("card");
        timer = setTimeout(fire, CARD_MS);
      }
    }

    /** Close and disarm. Called by clearMenuScreens() once the race owns the
     *  screen, and by anything that cancels the run before the build fires. */
    function stop() {
      clearTimeout(timer);
      timer = 0;
      build = null;
      phase = "";
      removeEventListener("pointerdown", onSkip, true);
      removeEventListener("keydown", onSkip, true);
      const r = root();
      if (r) { r.hidden = true; r.dataset.phase = ""; }
    }

    return {
      run, stop,
      /** How far through the FLYBY the screen is, 0..1. The shot sequencer is
       *  driven by this rather than by the wall clock, so the sequence keeps its
       *  shape when FLY_MS is retuned, and a phase skipped by a keypress does not
       *  leave the camera mid-move. 1 once the card is up, 0 when nothing runs. */
      progress() {
        if (phase === "card") return 1;
        if (phase !== "fly" || !flyT0) return 0;
        return Math.max(0, Math.min(1, (Date.now() - flyT0) / FLY_MS));
      },
      /** True while the screen owns the canvas — game.js keeps the world
       *  drawn for exactly this window and blanks every other menu. */
      active() { return phase === "fly" || phase === "card"; },
      phase() { return phase; },
    };
  }

  return { create, FLY_MS, CARD_MS };
})();
Object.freeze(LoadingScreen);
