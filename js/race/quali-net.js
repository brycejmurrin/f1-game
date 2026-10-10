/* Apex 26 — FRIEND-RACE QUALIFYING: wait for every rival's lap before gridding up.
 * Peer times arrive on NetPlay EV.QUALI / EV.QLIVE; the q-go button shows why the
 * grid is still locked. QualiNet.create(hooks) — game.js passes openQuali and the
 * quali sheet rebuild; netPlay/netLobby are read at call time. */
const QualiNet = (function () {
  "use strict";

  // How long a player who has driven waits for a silent rival before TO THE GRID
  // opens WITHOUT them. A rival who stays in the room but never posts (AFK, tab
  // asleep) would otherwise hold the sheet forever: BACK only shakes while waiting.
  const WAIT_MS = 90000;

  function create(hooks) {
    const { $, fmtTime, isQuali, getPlayer, getCars, openQuali, applyPeerQuali,
      getNetPlay, getNetLobby } = hooks;
    const now = hooks.now || (() => performance.now());
    const setTimer = hooks.setTimer || ((f, ms) => setTimeout(f, ms));
    const clearTimer = hooks.clearTimer || ((h) => clearTimeout(h));

    // driverId -> seconds, one entry per rival who has driven.
    let qualiPeers = new Map();
    // driverId -> {t, frac, at} — lap IN PROGRESS only; never mixed into classification.
    let qualiLive = new Map();
    let qualiLiveAt = 0;
    let qualiNetDone = null;
    let qualiHadRivals = false;
    let iDone = false;          // the player has a result on the sheet: the wait is theirs now
    let waitSince = 0, waitTimer = null, waitExpired = false;
    const droppedIds = new Set();   // rivals the wait gave up on (graded no-time until they post)

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

    function waiting() {
      if (!qualiNetDone) return false;
      const rivals = rivalDriverIds();
      if (rivals.length) qualiHadRivals = true;
      if (!rivals.length) return false;
      return rivals.some((id) => !(qualiPeers.get(id) > 0));
    }

    function stopWait() {
      if (waitTimer != null) clearTimer(waitTimer);
      waitTimer = null; waitSince = 0;
    }

    // Bounded wait: the clock runs only while the player has a result AND a rival is
    // outstanding. At the bound every outstanding rival is graded NO TIME, exactly as a
    // guest's abort does (Infinity = drove, no valid lap), and the sheet is regraded.
    function expireWait() {
      stopWait();
      waitExpired = true;
      for (const id of rivalDriverIds()) {
        if (!(qualiPeers.get(id) > 0)) { qualiPeers.set(id, Infinity); droppedIds.add(id); }
      }
      const player = getPlayer();
      const mine = player && player.lastLap > 0 ? player.lastLap
        : (player && player.best < Infinity ? player.best : 0);
      if (isQuali()) applyPeerQuali(mine);
    }

    function refreshQualiGate() {
      const b = $("q-go");
      if (iDone && waiting()) {
        if (!waitSince) { waitSince = now(); waitTimer = setTimer(refreshQualiGate, WAIT_MS + 50); }
        else if (now() - waitSince >= WAIT_MS) expireWait();
      } else if (waitSince) stopWait();
      if (!b) return;
      const w = waiting();
      b.disabled = w;
      if (!w) {
        b.textContent = droppedIds.size ? "TO THE GRID WITHOUT THEM"
          : (qualiNetDone && qualiHadRivals && !rivalDriverIds().length)
            ? "RIVAL LEFT — TO THE GRID" : "TO THE GRID";
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
      if (d && d.driverId != null && (t === Infinity || (Number.isFinite(t) && t > 0))) {
        qualiPeers.set(d.driverId, t);
        if (Number.isFinite(t)) droppedIds.delete(d.driverId);   // a late real lap beats the timeout's no-time
      }
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
      resetWait();
    }

    function resetWait() { stopWait(); iDone = false; waitExpired = false; droppedIds.clear(); }
    /** The player's own session is run (q-done): the bounded wait starts from here. */
    function markDone() { iDone = true; }
    const timedOut = () => waitExpired;
    /** BACK/Escape may leave the sheet once the wait has been given up on. */
    const canLeave = () => waitExpired;

    function clearPeers() { qualiPeers.clear(); }

    function resetSoft() {
      resetWait();
      qualiNetDone = null;
      qualiLive.clear();
      qualiHadRivals = false;
    }

    function hasArmed() { return !!qualiNetDone; }

    function takeGoCallback() {
      const go = qualiNetDone;
      qualiNetDone = null;
      return go;
    }

    function resetOnQuitWithCancel() {
      const netLobby = getNetLobby();
      resetWait();
      qualiNetDone = null;
      qualiHadRivals = false;
      qualiLive.clear();
      netLobby.cancel();
    }

    function resetOnBackWithAbort() {
      const netLobby = getNetLobby();
      resetWait();
      qualiNetDone = null;
      qualiHadRivals = false;
      qualiPeers.clear();
      qualiLive.clear();
      netLobby.abortQuali();
    }

    try { Log.info("game", "QualiNet ready"); } catch { /* Log absent in isolated VM */ }

    return {
      onPeerQuali, onPeerQualiLive, openQualiForNet, refreshQualiGate,
      reportLive, reportQuali, driven, waiting, arm, clearPeers, resetSoft,
      hasArmed, takeGoCallback, resetOnQuitWithCancel, resetOnBackWithAbort,
      markDone, timedOut, canLeave, WAIT_MS,
    };
  }

  return { create, WAIT_MS };
})();
Object.freeze(QualiNet);
