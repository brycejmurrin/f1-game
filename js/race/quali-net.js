const QualiNet = (function () {
  "use strict";

  const OVERRIDE_AFTER_MS = 15000;
  const GATE_TIMEOUT_MS = 60000;
  const WAIT_MS = GATE_TIMEOUT_MS;

  function create(hooks) {
    const { $, fmtTime, isQuali, getPlayer, getCars, openQuali, applyPeerQuali,
      getNetPlay, getNetLobby } = hooks;
    const clock = hooks.now || (() => performance.now());
    const setTimer = hooks.setTimer || hooks.setTimeout || ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = hooks.clearTimer || hooks.clearTimeout || ((h) => clearTimeout(h));

    let qualiPeers = new Map();
    let qualiLive = new Map();
    let qualiLiveAt = 0;
    let qualiNetDone = null;
    let qualiHadRivals = false;
    let gateSince = null;
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

    function waiting() {
      if (!rawWaiting()) {
        if (gateTimer != null) { clearTimer(gateTimer); gateTimer = null; }
        gateSince = null;
        return false;
      }
      if (gateTimedOut) return false;
      if (gateSince == null) gateSince = clock();
      if (clock() - gateSince >= GATE_TIMEOUT_MS) {
        gateTimedOut = true;
        if (gateTimer != null) { clearTimer(gateTimer); gateTimer = null; }
        return false;
      }
      return !canForce();
    }

    function canForce() {
      return rawWaiting() && gateSince != null && !gateTimedOut &&
        clock() - gateSince >= OVERRIDE_AFTER_MS && isHost();
    }

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
        const stillSilent = rivalDriverIds().some((id) => !(qualiPeers.get(id) > 0));
        b.textContent = (qualiNetDone && qualiHadRivals && !rivalDriverIds().length)
          ? "RIVAL LEFT — TO THE GRID"
          : (gateTimedOut && stillSilent ? "NO LAP FROM THEM — TO THE GRID" : "TO THE GRID");
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
      return openQuali(true, done || null);
    }

    function onPeerQualiLive(d) {
      if (!d || d.driverId == null || isMine(d.driverId)) return;
      qualiLive.set(d.driverId, { t: +d.t || 0, frac: +d.frac || 0, at: performance.now() });
      refreshQualiGate();
    }

    const isMine = (id) => { const p = getPlayer(); return !!(p && id != null && id === p.driverId); };

    function onPeerQuali(d) {
      if (d && isMine(d.driverId)) return;
      if (d && d.driverId != null) qualiLive.delete(d.driverId);
      const t = d ? Number(d.t) : NaN;
      if (d && d.driverId != null && (t === Infinity || (Number.isFinite(t) && t > 0))) {
        qualiPeers.set(d.driverId, t);
      }
      if (!isQuali()) return;
      const player = getPlayer();
      const mine = player && player.lastLap > 0 ? player.lastLap
        : (player && player.best < Infinity ? player.best : (player && player.qualiCut ? Infinity : 0));
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

    function arm(netDone) {
      qualiNetDone = netDone || null;
      qualiLive.clear();
      qualiHadRivals = false;
      gateReset();
    }

    function markDone() {}
    const timedOut = () => gateTimedOut;
    const canLeave = () => gateTimedOut;

    function clearPeers() { qualiPeers.clear(); }

    function resetSoft() {
      qualiNetDone = null;
      qualiLive.clear();
      qualiPeers.clear();
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
      const player = getPlayer();
      if (qualiNetDone && player && player.driverId != null) reportQuali(player.driverId, Infinity);
      qualiNetDone = null;
      qualiHadRivals = false;
      qualiPeers.clear();
      qualiLive.clear();
      gateReset();
      netLobby.abortQuali();
    }

    try { Log.info("game", "QualiNet ready"); } catch {  }

    return {
      onPeerQuali, onPeerQualiLive, openQualiForNet, refreshQualiGate,
      reportLive, reportQuali, driven, waiting, canForce, arm, clearPeers, resetSoft,
      hasArmed, takeGoCallback, resetOnQuitWithCancel, resetOnBackWithAbort,
      markDone, timedOut, canLeave, WAIT_MS,
    };
  }

  return { create };
})();
Object.freeze(QualiNet);
