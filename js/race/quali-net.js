/* Apex 26 — FRIEND-RACE QUALIFYING: wait for every rival's lap before gridding up.
 * Peer times arrive on NetPlay EV.QUALI / EV.QLIVE; the q-go button shows why the
 * grid is still locked. QualiNet.create(hooks) — game.js passes openQuali and the
 * quali sheet rebuild; netPlay/netLobby are read at call time. */
const QualiNet = (function () {
  "use strict";

  // The gate never waits forever: a rival who BACKed out, went AFK or sits in a
  // hidden tab keeps the connection (and the 6 s silence timeout) alive but
  // never posts a time. After GATE_TIMEOUT_MS everyone's gate opens and the
  // missing seat is gridded from the model; the HOST may skip the wait earlier,
  // after OVERRIDE_AFTER_MS ("START ANYWAY").
  const OVERRIDE_AFTER_MS = 15000;
  const GATE_TIMEOUT_MS = 60000;

  function create(hooks) {
    const { $, fmtTime, isQuali, getPlayer, getCars, openQuali, applyPeerQuali,
      getNetPlay, getNetLobby } = hooks;
    // Injectable for tests; the game passes neither.
    const clock = hooks.now || (() => performance.now());
    const setTimer = hooks.setTimeout || ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = hooks.clearTimeout || ((h) => clearTimeout(h));

    // driverId -> seconds, one entry per rival who has driven.
    let qualiPeers = new Map();
    // driverId -> {t, frac, at} — lap IN PROGRESS only; never mixed into classification.
    let qualiLive = new Map();
    let qualiLiveAt = 0;
    let qualiNetDone = null;
    let qualiHadRivals = false;
    let gateSince = null;     // when the gate first held the player after their own lap
    let gateTimedOut = false;
    let gateTimer = null;

    function gateReset() {
      gateSince = null; gateTimedOut = false;
      if (gateTimer != null) { clearTimer(gateTimer); gateTimer = null; }
    }

    function rivalDriverIds() {
      const netPlay = getNetPlay();
      const netLobby = getNetLobby();
      const fromNet = netPlay.rivalDriverIds();
      if (fromNet.length) return fromNet;
      if (!netLobby || !netLobby.roomState) return [];
      const peers = netLobby.roomState().peers || [];
      // A HELLO with no string team would id as "undefined:0" — a rival that
      // can never post a lap, so TO THE GRID waited for it forever.
      return peers.filter((p) => p && typeof p.team === "string" && p.team)
        .map((p) => p.team + ":" + (p.driver || 0));
    }

    function reportLive(driverId, t, frac) {
      const netPlay = getNetPlay();
      const netLobby = getNetLobby();
      const now = performance.now();
      if (now - qualiLiveAt < 400) return false;
      qualiLiveAt = now;
      if (netPlay && netPlay.active && netPlay.active() && netPlay.reportQualiLive) {
        return netPlay.reportQualiLive(driverId, t, frac);
      }
      if (netLobby && netLobby.reportQualiLive) return netLobby.reportQualiLive(driverId, t, frac);
      return false;
    }

    function reportQuali(driverId, t) {
      const netPlay = getNetPlay();
      const netLobby = getNetLobby();
      if (netPlay && netPlay.active && netPlay.active() && netPlay.reportQuali) return netPlay.reportQuali(driverId, t);
      if (netLobby && netLobby.reportQuali) return netLobby.reportQuali(driverId, t);
      return false;
    }

    function rawWaiting() {
      if (!qualiNetDone) return false;
      const rivals = rivalDriverIds();
      if (rivals.length) qualiHadRivals = true;
      if (!rivals.length) return false;
      return rivals.some((id) => !(qualiPeers.get(id) > 0));
    }

    const isHost = () => {
      const netLobby = getNetLobby();
      return !!(netLobby && netLobby.roomState && netLobby.roomState().role === "host");
    };

    // The ONLY place the wait clock runs: it starts the first time the gate holds
    // and the deadlines are measured from there.
    function waiting() {
      if (!rawWaiting()) { gateSince = null; return false; }
      if (gateTimedOut) return false;
      if (gateSince == null) gateSince = clock();
      if (clock() - gateSince >= GATE_TIMEOUT_MS) { gateTimedOut = true; return false; }
      // The host's START ANYWAY: the gate stops holding the host (q-go then
      // proceeds exactly as for a complete field); guests wait out the cap.
      return !canForce();
    }

    /** Host only, OVERRIDE_AFTER_MS into the wait. */
    function canForce() {
      return rawWaiting() && gateSince != null && !gateTimedOut &&
        clock() - gateSince >= OVERRIDE_AFTER_MS && isHost();
    }

    // Nothing else re-evaluates the gate while every rival is silent, so the
    // deadlines get their own wake-up.
    function armGateTimer() {
      if (gateTimer != null || gateSince == null || gateTimedOut) return;
      const age = clock() - gateSince;
      const next = (age < OVERRIDE_AFTER_MS ? OVERRIDE_AFTER_MS : GATE_TIMEOUT_MS) - age;
      gateTimer = setTimer(() => { gateTimer = null; refreshQualiGate(); }, Math.max(50, next + 20));
    }

    function refreshQualiGate() {
      const b = $("q-go");
      if (!b) return;
      const w = waiting();
      if (gateSince != null) armGateTimer();
      if (!w && canForce()) { b.disabled = false; b.textContent = "START ANYWAY"; return; }
      b.disabled = w;
      if (!w) {
        b.textContent = (qualiNetDone && qualiHadRivals && !rivalDriverIds().length)
          ? "RIVAL LEFT — TO THE GRID"
          : (gateTimedOut ? "NO LAP FROM THEM — TO THE GRID" : "TO THE GRID");
        return;
      }
      const rivals = rivalDriverIds();
      const outstanding = rivals.filter((id) => !(qualiPeers.get(id) > 0));
      const left = outstanding.length;
      const live = [];
      for (const id of outstanding) {
        const l = qualiLive.get(id);
        if (l && performance.now() - l.at < 3000) {
          const cars = getCars();
          const c = cars && cars.find((x) => x.driverId === id);
          live.push((c ? c.code : "") + " " + fmtTime(l.t));
        }
      }
      if (live.length) { b.textContent = live.join("   ") + "…"; return; }
      b.textContent = left > 1 ? "WAITING FOR " + left + " LAPS…" : "WAITING FOR THEIR LAP…";
    }

    function openQualiForNet(done) {
      // Armed INSIDE openQuali: it is async, so a qualiNetDone set out here was
      // wiped by its continuation and netPlay.start() was unreachable.
      return openQuali(true, done || null);
    }

    function onPeerQualiLive(d) {
      if (!d || d.driverId == null || isMine(d.driverId)) return;
      qualiLive.set(d.driverId, { t: +d.t || 0, frac: +d.frac || 0, at: performance.now() });
      refreshQualiGate();
    }

    // A peer entry never speaks for THIS player's driverId (belt to the
    // lobby's sender binding): the local lap is the only source of our time.
    const isMine = (id) => { const p = getPlayer(); return !!(p && id != null && id === p.driverId); };

    function onPeerQuali(d) {
      if (d && isMine(d.driverId)) return;
      if (d && d.driverId != null) qualiLive.delete(d.driverId);
      // NetPlay.validQuali is the wire's single validation site; this is the
      // belt to that braces, because a stored t reaches toFixed() in
      // quali-model.js and a string or boolean there throws mid-sheet.
      const t = d ? Number(d.t) : NaN;
      // Infinity = NO TIME (validQuali's noTime marker): drove, no valid lap.
      if (d && d.driverId != null && (t === Infinity || (Number.isFinite(t) && t > 0))) qualiPeers.set(d.driverId, t);
      if (!isQuali()) return;
      const player = getPlayer();
      const mine = player && player.lastLap > 0 ? player.lastLap
        : (player && player.best < Infinity ? player.best : 0);
      applyPeerQuali(mine);
      refreshQualiGate();
    }

    function driven(myTime) {
      const m = new Map();
      const player = getPlayer();
      if (myTime > 0 && player) m.set(player.driverId, myTime);
      for (const [id, t] of qualiPeers) if (t > 0 && !(player && id === player.driverId)) m.set(id, t);
      return m.size ? m : 0;
    }

    /** Called from openQuali after quali.clear — arms the lobby go-callback. */
    function arm(netDone) {
      qualiNetDone = netDone || null;
      qualiLive.clear();
      qualiHadRivals = false;
      gateReset();
    }

    function clearPeers() { qualiPeers.clear(); }

    function resetSoft() {
      qualiNetDone = null;
      qualiLive.clear();
      qualiHadRivals = false;
      gateReset();
    }

    function hasArmed() { return !!qualiNetDone; }

    function takeGoCallback() {
      const go = qualiNetDone;
      qualiNetDone = null;
      return go;
    }

    function resetOnQuitWithCancel() {
      const netLobby = getNetLobby();
      qualiNetDone = null;
      qualiHadRivals = false;
      qualiLive.clear();
      gateReset();
      netLobby.cancel();
    }

    function resetOnBackWithAbort() {
      const netLobby = getNetLobby();
      // Leaving the sheet without a lap is a NO TIME, said out loud: a silent
      // BACK left every rival waiting on a seat that was never going to drive.
      const player = getPlayer();
      if (qualiNetDone && player && player.driverId != null) reportQuali(player.driverId, Infinity);
      qualiNetDone = null;
      qualiHadRivals = false;
      qualiPeers.clear();
      qualiLive.clear();
      gateReset();
      netLobby.abortQuali();
    }

    try { Log.info("game", "QualiNet ready"); } catch { /* Log absent in isolated VM */ }

    return {
      onPeerQuali, onPeerQualiLive, openQualiForNet, refreshQualiGate,
      reportLive, reportQuali, driven, waiting, canForce, arm, clearPeers, resetSoft,
      hasArmed, takeGoCallback, resetOnQuitWithCancel, resetOnBackWithAbort,
    };
  }

  return { create };
})();
Object.freeze(QualiNet);
