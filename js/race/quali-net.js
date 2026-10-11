/* Apex 26 — FRIEND-RACE QUALIFYING: wait for every rival's lap before gridding up.
 * Peer times arrive on NetPlay EV.QUALI / EV.QLIVE; the q-go button shows why the
 * grid is still locked. QualiNet.create(hooks) — game.js passes openQuali and the
 * quali sheet rebuild; netPlay/netLobby are read at call time. */
const QualiNet = (function () {
  "use strict";

  function create(hooks) {
    const { $, fmtTime, isQuali, getPlayer, getCars, openQuali, applyPeerQuali,
      getNetPlay, getNetLobby } = hooks;

    // driverId -> seconds, one entry per rival who has driven.
    let qualiPeers = new Map();
    // driverId -> {t, frac, at} — lap IN PROGRESS only; never mixed into classification.
    let qualiLive = new Map();
    let qualiLiveAt = 0;
    let qualiNetDone = null;
    let qualiHadRivals = false;

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

    function refreshQualiGate() {
      const b = $("q-go");
      if (!b) return;
      const w = waiting();
      b.disabled = w;
      if (!w) {
        b.textContent = (qualiNetDone && qualiHadRivals && !rivalDriverIds().length)
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
    }

    function clearPeers() { qualiPeers.clear(); }

    function resetSoft() {
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
      qualiNetDone = null;
      qualiHadRivals = false;
      qualiLive.clear();
      netLobby.cancel();
    }

    function resetOnBackWithAbort() {
      const netLobby = getNetLobby();
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
    };
  }

  return { create };
})();
Object.freeze(QualiNet);
