/* Apex 26 — COOLDOWN LAP (CooldownLap): post-flag drive beat for the ceremony
   flow (docs/plans/2026-10-27-cooldown-podium.md slice 2 / #4068). Pure exits,
   AI cool/park policy, and a touch SKIP control (≥44 CSS px). RaceCeremony
   (#4067) owns phase ownership and endRace wiring; this module never reaches
   into game.js. One `create(G)`; optional deps inject pit/box probes. */
"use strict";

var CooldownLap = (function () {
  const WALL_S = 45;             // wall-clock budget (plan open Q1 default)
  const LAP_BUDGET = 1;          // one lap of progress (frac of track.total)
  const PARK_SPEED = 2.5;        // m/s: "parked at box" crawl ceiling
  const COOL_SPEED_FRAC = 0.55;  // AI cool pace vs session ref (no attack)
  const SKIP_LABEL = "SKIP TO PARC FERMÉ";
  const TAP_MIN_CSS_PX = 44;     // phone touch floor (AGENTS.md §Coordination)

  /** Solo GP / sprint / season / career race — same spirit as ResultsCam modes. */
  function sessionEligible(G) {
    if (!G) return false;
    if (G.timeTrial) return false;
    if (G.session === "quali" || G.session === "practice") return false;
    if (G.duel) return false;
    if (G.netPlay && typeof G.netPlay.active === "function" && G.netPlay.active()) return false;
    if (G.watchMode || (G.realRace && typeof G.realRace.isWatch === "function" && G.realRace.isWatch())) return false;
    return G.session === "race" || G.session === "sprint";
  }

  /** Retired / DSQ players skip the drive beat (plan: partial ceremony). */
  function playerCanDrive(player) {
    if (!player) return false;
    if (player.retired || player.dsq) return false;
    return true;
  }

  /**
   * Pure exit classifier. `sample` may carry:
   *   progDelta — laps of progress since start (s-delta / track.total)
   *   inPitLane — Tracks.inPitLane (or PitLane.inLane)
   *   atBox — parked in box (in pit + speed ≤ PARK_SPEED)
   *   age — wall seconds since start (optional; st.age wins when omitted)
   */
  function exitReason(st, sample) {
    if (!st || !st.live) return null;
    if (st.skipRequested) return "skip";
    const age = (sample && Number.isFinite(sample.age)) ? sample.age : st.age;
    if (sample) {
      if (sample.atBox || sample.inPitLane) return "pit";
      if (Number.isFinite(sample.progDelta) && sample.progDelta >= (st.lapBudget || LAP_BUDGET)) return "lap";
    }
    if (Number.isFinite(age) && age >= (st.wallBudget || WALL_S)) return "time";
    return null;
  }

  /**
   * AI cool / park policy for the cooldown window. Never returns attack.
   * sample: { inPitLane, nearPit, finished, speed, vRef }
   */
  function aiPolicy(car, sample) {
    const s = sample || {};
    const vRef = (s.vRef > 0 ? s.vRef : 0) || 0;
    if (s.atBox || (s.inPitLane && (s.speed || 0) <= PARK_SPEED)) {
      return { mode: "park", attack: false, targetSpeed: 0, targetSpeedFrac: 0 };
    }
    if (s.nearPit || s.inPitLane || s.finished) {
      const crawl = Math.min(PARK_SPEED * 2, vRef > 0 ? vRef * 0.15 : PARK_SPEED * 2);
      return { mode: "park", attack: false, targetSpeed: crawl, targetSpeedFrac: vRef > 0 ? crawl / vRef : 0 };
    }
    const cool = vRef > 0 ? vRef * COOL_SPEED_FRAC : 0;
    return { mode: "cool", attack: false, targetSpeed: cool, targetSpeedFrac: COOL_SPEED_FRAC };
  }

  /** Pure: whether a mounted SKIP control meets the phone tap floor. */
  function skipTargetOk(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return false;
    const r = el.getBoundingClientRect();
    return r.width >= TAP_MIN_CSS_PX && r.height >= TAP_MIN_CSS_PX;
  }

  function create(G, deps) {
    const d = deps || {};
    let live = false;
    let age = 0;
    let startProg = 0;
    let skipRequested = false;
    let exit = null;
    let drive = true;
    let wallBudget = WALL_S;
    let lapBudget = LAP_BUDGET;
    let skipEl = null;
    let skipHandler = null;

    function progOf(c) {
      if (!c) return 0;
      if (Number.isFinite(c.prog)) return c.prog;
      const total = G.track && G.track.total;
      if (!(total > 0) || !Number.isFinite(c.s)) return 0;
      return c.s / total;
    }

    function samplePlayer() {
      const c = G.player;
      if (!c) return { progDelta: 0, inPitLane: false, atBox: false };
      const inPit = d.inPitLane ? !!d.inPitLane(c) :
        (typeof Tracks !== "undefined" && Tracks.inPitLane && G.track
          ? Tracks.inPitLane(G.track, c.s, c.x) : false);
      const speed = c.speed || 0;
      const atBox = d.atBox ? !!d.atBox(c) : (inPit && speed <= PARK_SPEED);
      return {
        progDelta: progOf(c) - startProg,
        inPitLane: inPit,
        atBox,
        age,
      };
    }

    function status() {
      const sample = live ? samplePlayer() : null;
      const remLap = live && sample
        ? Math.max(0, lapBudget - (sample.progDelta || 0))
        : 0;
      const remWall = live ? Math.max(0, wallBudget - age) : 0;
      return {
        phase: live ? "cooldown" : (exit ? "done" : "idle"),
        live,
        age,
        exit,
        drive,
        skipRequested,
        eligible: sessionEligible(G),
        remLap,
        remWall,
        wallBudget,
        lapBudget,
        skipLabel: SKIP_LABEL,
        camera: "chase",
      };
    }

    function clearSkip() {
      if (skipEl && skipHandler) skipEl.removeEventListener("click", skipHandler);
      if (skipEl && skipEl.parentNode) skipEl.parentNode.removeChild(skipEl);
      skipEl = null;
      skipHandler = null;
    }

    function reset() {
      live = false;
      age = 0;
      startProg = 0;
      skipRequested = false;
      exit = null;
      drive = true;
      wallBudget = WALL_S;
      lapBudget = LAP_BUDGET;
      clearSkip();
    }

    /**
     * Arm the cooldown beat. opts: { drive?: bool, wallS?, lapBudget? }.
     * Returns false when the session is ineligible or already live.
     */
    function start(opts) {
      const o = opts || {};
      if (live) return false;
      if (!sessionEligible(G) && o.force !== true) return false;
      reset();
      drive = o.drive != null ? !!o.drive : playerCanDrive(G.player);
      if (Number.isFinite(o.wallS) && o.wallS > 0) wallBudget = o.wallS;
      if (Number.isFinite(o.lapBudget) && o.lapBudget > 0) lapBudget = o.lapBudget;
      startProg = progOf(G.player);
      live = true;
      age = 0;
      exit = null;
      skipRequested = false;
      if (typeof Log !== "undefined" && Log.info) {
        Log.info("game", "CooldownLap.start drive=" + drive + " wall=" + wallBudget + "s");
      }
      return true;
    }

    function skip() {
      if (!live) return false;
      skipRequested = true;
      return true;
    }

    /** Advance; returns an exit reason string when the beat ends, else null. */
    function tick(dt, sample) {
      if (!live) return exit;
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      age += step;
      const reason = exitReason({
        live, age, skipRequested, wallBudget, lapBudget,
      }, sample || samplePlayer());
      if (!reason) return null;
      exit = reason;
      live = false;
      clearSkip();
      if (typeof Log !== "undefined" && Log.info) {
        Log.info("game", "CooldownLap.exit reason=" + reason + " age=" + age.toFixed(2));
      }
      return reason;
    }

    /**
     * Mount a SKIP control into `host`. Returns the button, or null when DOM
     * is unavailable. Hit target uses --tap / TAP_MIN_CSS_PX (≥44 CSS px).
     */
    function mountSkip(host, onSkip) {
      clearSkip();
      if (!host || typeof document === "undefined" || !document.createElement) return null;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "ceremony-cooldown-skip";
      btn.className = "bigbtn";
      btn.textContent = SKIP_LABEL;
      btn.setAttribute("data-ceremony-skip", "cooldown");
      // Inline floor (not a new CSS class): tree cssClasses ratchet is shrink-only.
      btn.style.minHeight = "max(var(--tap), " + TAP_MIN_CSS_PX + "px)";
      btn.style.minWidth = "max(var(--tap), " + TAP_MIN_CSS_PX + "px)";
      skipHandler = function () {
        skip();
        if (typeof onSkip === "function") onSkip();
      };
      btn.addEventListener("click", skipHandler);
      host.appendChild(btn);
      skipEl = btn;
      return btn;
    }

    return {
      start, tick, skip, reset, status, mountSkip,
      live: () => live,
      exit: () => exit,
      driveAllowed: () => live && drive,
      cameraOwner: () => (live ? "chase" : null),
      skipEl: () => skipEl,
    };
  }

  return {
    WALL_S, LAP_BUDGET, PARK_SPEED, COOL_SPEED_FRAC, SKIP_LABEL, TAP_MIN_CSS_PX,
    sessionEligible, playerCanDrive, exitReason, aiPolicy, skipTargetOk, create,
  };
})();
Object.freeze(CooldownLap);
