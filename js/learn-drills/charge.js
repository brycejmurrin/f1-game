/* Apex 26 — CHARGE-SUSTAINING LAP: LEARN's hybrid lesson on track (#6559 step 13, #6550 D2). The store is a stock;
   deploy and harvest are flows. A 1-lap Monza race (a race, not a Time Trial: EnergyPlan ignores the plan in TT), the
   player rolling 20 m past the line at 0.8 vTop with 2.0 Apex MJ in the store (half of ES_MJ 4), the one rival placed
   well up the road. The card's three sector chips cycle the per-sector plan MANUAL -> DEPLOY -> SAVE
   (EnergyPlan.setPlan, the very plan game.js acts on at each sector entry; BOOST still overrides mid-sector), and the
   widget draws the store over the lap: EnergyPlan.forecast's line against the actual trace. The run is RaceInsights'
   "charge" goal and ends at a gate CHARGE_LINE m before the line.
   SCORE: the lap's mean speed in dash km/h (standard pace, so the same at every PACE; higher is better: the gate is a
   fixed distance, so it orders laps as the lap time does). It counts only if the lap is CHARGE-SUSTAINING (the store
   at the gate >= the store at the start): a lap that borrowed gets no medal (medals()) and the card says by
   how much. Medal tiers come from VM rollouts of every plan (tests/data/learn-drill-refs.json "charge",
   tests/unit/drill-charge-vm.test.mjs).
   THE LEDGER (#6550 addition 2, display-only): each sample takes the change in the player's energy and attributes it
   from flags already on the car (deploying -> deploy; brakeDemand > 0.05 -> brake; throttleDemand 0 -> coast; else
   part-load), per timing sector, and times the braking spent at a full store (harvest a full battery clipped). It is
   a sum of the measured deltas, so the four columns add up to the real change. Physics reads none of it.
   Units: in-car numbers are Apex MJ (a full store is ~5 s of BOOST), never the FIA allowance (the lab teaches that).
   THE ARC NEVER REACHES THE DRIVER: sample(), score() and the widget read the player's energy, pedals, deploy flag,
   sector index and speed, never curvature or the racing line. begin() is the only car write (placement and the
   store); stage() sets a neutral plan and its undo restores the player's own. LAZY_LEARN: defined at eval when the
   registry is up, else by LearnDoor.defineDrills. */
const ChargeDrill = (function () {
  "use strict";

  const START_M = 20;          // arc metres past the line
  const START_K = 0.8;         // of vTop(): a flying lap down the main straight
  const STORE = 0.5;           // c.energy at the start: 2.0 Apex MJ of ES_MJ 4
  const RIVAL_AHEAD = 1500;    // m: the drill race's one other car, well up the road and quicker
  const CLASSES = Object.freeze(["deploy", "brake", "coast", "part"]);
  const LABEL = Object.freeze({ manual: "MANUAL", deploy: "DEPLOY", save: "SAVE" });
  // Mean-speed tiers (km/h) from the VM rollouts of every plan (tests/data/learn-drill-refs.json "charge"; the rule in
  // its "rule" field). cleanRequired: a lap that ends with less store than it started earns no medal.
  const MEDALS = Object.freeze({ bronze: 202.1, silver: 202.4, gold: 202.8, goldClean: true, cleanRequired: true });
  /** The medal rule (#6559 §1a: a function, so a lap that borrowed earns nothing however quick; was drill-card's cleanRequired). */
  function medals(r) {
    if (!r || !r.clean || !Number.isFinite(r.value)) return null;
    if (r.value >= MEDALS.gold) return "gold";
    return r.value >= MEDALS.silver ? "silver" : r.value >= MEDALS.bronze ? "bronze" : null;
  }
  const ES = () => PhysicsConsts.ES_MJ || 4;
  const mj = (v, sign) => (sign && v >= 0 ? "+" : "") + (v * ES()).toFixed(2);

  // ── the ledger (display-only) ───────────────────────────────────────────────
  /** A fresh ledger: per sector the energy (0..1 store) each class moved, and the clipped-harvest seconds. */
  const ledger = () => ({ e: null, t: null, sec: [0, 1, 2].map(() => ({ deploy: 0, brake: 0, coast: 0, part: 0 })), clippedS: 0, exits: [null, null, null] });
  /** Which flow the car is in, from flags it already carries. */
  function classOf(c) {
    if (c.deploying) return "deploy";
    if ((c.brakeDemand || 0) > 0.05) return "brake";
    if (!(c.throttleDemand > 0)) return "coast";
    return "part";
  }
  /** One sample: the measured change since the last one, attributed to the class and sector the car is in now. */
  function ledgerAdd(L, c, t) {
    const sec = c._secIdx >= 0 && c._secIdx < 3 ? c._secIdx : 0, e = +c.energy || 0;
    if (L.e != null) {
      L.sec[sec][classOf(c)] += e - L.e;
      if ((c.brakeDemand || 0) > 0.05 && e >= 1 - 1e-6) L.clippedS += Math.max(0, t - L.t);
    }
    if (L.lastSec != null && sec !== L.lastSec) L.exits[L.lastSec] = L.e;   // the store as the car left that sector
    L.lastSec = sec;
    L.e = e;
    L.t = t;
    return L;
  }
  const sectorNet = (row) => CLASSES.reduce((a, k) => a + row[k], 0);
  /** "S2 · deploy −1.10 · brake +0.70 · coast +0.10 · part +0.20 MJ" */
  const strip = (L, sec) => "S" + (sec + 1) + " · " + CLASSES.map(k => k + " " + mj(L.sec[sec][k], true)).join(" · ") + " MJ";

  // ── the run ─────────────────────────────────────────────────────────────────
  /** Read-only accumulator, one call per host tick (registry.js tick). */
  function sample(G, acc) {
    const c = G.player;
    if (!c) return;
    if (!acc.L) {
      acc.L = ledger();
      acc.e0 = +c.energy || 0;
      acc.plan = EnergyPlan.plan();
      acc.fc = EnergyPlan.forecast(acc.e0, 0, !!c.boostOn).rows.map(r => r.end);
      acc.depS = 0;
      acc.prog0 = c.prog;
    }
    acc.prog = c.prog;
    if (c.deploying && acc.L.t != null) acc.depS += Math.max(0, G.raceT - acc.L.t);
    ledgerAdd(acc.L, c, G.raceT);
  }

  /** The result: mean speed over the lap, the ledger, net store, one verdict. last is RaceInsights' lastDrill. */
  function score(G, last, acc) {
    const L = acc.L || ledger(), e0 = acc.e0 == null ? STORE : acc.e0;
    const eEnd = L.e == null ? e0 : L.e, net = eEnd - e0, sustaining = net >= -1e-9;
    const secs = +(last.seconds || 0), dist = Math.max(0, (acc.prog || 0) - (acc.prog0 || 0));
    const AO = AppearanceOpts;
    const kmhOf = v => (G.dashKph ? G.dashKph(Math.abs(v)) : Math.abs(v) * 3.6);
    const value = secs > 0 && dist > 0 ? +kmhOf(dist / secs).toFixed(1) : 0;
    const unit = AO && AO.units && AO.units() === "mph" ? "mph" : "km/h";
    const shown = AO && AO.speed ? AO.speed(value) : value;
    const clean = !!last.clean && sustaining;
    const reason = !last.clean ? (last.reason || "lap not clean") : sustaining ? "" : "borrowed " + (-net * ES()).toFixed(2) + " MJ";
    const verdict = !last.clean ? "The lap ended: " + reason + ". Drive the lap clean to the gate."
      : !sustaining ? "Fast, but the lap borrowed " + (-net * ES()).toFixed(2) + " Apex MJ from the next one. Swap a DEPLOY for SAVE or MANUAL and keep the store level."
      : L.clippedS > 0.5 ? "Charge-sustaining, +" + mj(net) + " MJ, but " + L.clippedS.toFixed(1) + " s of braking hit a full store: that harvest was lost. DEPLOY earlier to make room."
      : "Charge-sustaining: the store ended " + mj(net, true) + " MJ. Spend any surplus where the push is strongest, and the lap gets quicker.";
    return {
      value, unit, better: "high", clean, reason, lapS: +secs.toFixed(2), netMJ: +(net * ES()).toFixed(3),
      metrics: [
        ["Lap to the gate", secs.toFixed(2), "s"],
        ["Store start / end", mj(e0) + " / " + mj(eEnd), "MJ"],
        ...[0, 1, 2].map(s => ["S" + (s + 1) + " " + (LABEL[(acc.plan || [])[s]] || "") + " net (forecast)",
          mj(sectorNet(L.sec[s]), true) + (acc.fc ? " (" + mj(acc.fc[s] - (s ? acc.fc[s - 1] : e0), true) + ")" : ""), "MJ"]),
        ["Braking at a full store", L.clippedS.toFixed(1), "s"],
      ],
      ledger: L.sec.map(row => ({ ...row })), clippedS: +L.clippedS.toFixed(2), shown, verdict,
    };
  }

  function begin(G) {
    const track = G.track, player = G.player, rival = G.cars.find(c => c !== player);
    if (!player || !track || G.state !== "count") return false;
    const place = (c, s, speed, gear) => {
      c.s = c._prevS = c.prog = c.rPrevS = G.wrapS(s);
      c.lap = 1;
      c.x = c.xVis = c.rPrevX = TrackLine.at(track, c.s).x;
      c.speed = speed;
      c.gear = gear;
      RealRace.seatOnRoad(track, c);
    };
    place(player, START_M, G.vTop() * START_K, 7);
    player.energy = STORE;
    player.boostOn = false;
    if (rival) place(rival, START_M + RIVAL_AHEAD, G.vTop() * 0.85, 7);
    if (!G.goRolling()) return false;
    G.snapGameCam();
    G.coach.setPracticeGoal("charge");
    return G.coach.mark();
  }

  /** A neutral plan for the drill (the chips start at MANUAL); the undo restores the player's own plan. */
  function stage() {
    const previous = EnergyPlan.plan();
    EnergyPlan.setPlan(EnergyPlan.NEUTRAL);
    return () => EnergyPlan.setPlan(previous);
  }

  /** The live card: the store over the lap (forecast line, actual trace), the three plan chips, the sector's ledger
   *  strip and RETRY. Render-only: its own ledger reads the car; a chip writes only the plan. */
  function guide(G, port) {
    const root = document.createElement("div");
    root.id = "learn-charge-guide";
    root.hidden = true;
    const scope = document.createElement("canvas");
    scope.width = 280; scope.height = 148;
    scope.setAttribute("aria-hidden", "true");
    const ctx = scope.getContext("2d");
    const task = document.createElement("strong");
    task.setAttribute("role", "status");
    const readout = document.createElement("span");
    const chips = document.createElement("div");
    chips.id = "learn-charge-chips";
    const chip = [0, 1, 2].map(sec => {
      const b = document.createElement("button");
      b.type = "button";
      b.id = "learn-charge-s" + (sec + 1);
      b.addEventListener("click", () => {
        const p = EnergyPlan.plan(), POL = EnergyPlan.POLICIES;
        p[sec] = POL[(POL.indexOf(p[sec]) + 1) % POL.length];
        EnergyPlan.setPlan(p);
        label();
      });
      chips.append(b);
      return b;
    });
    const label = () => EnergyPlan.plan().forEach((p, s) => { chip[s].textContent = "S" + (s + 1) + " " + LABEL[p]; chip[s].dataset.policy = p; });
    label();
    const retry = document.createElement("button");
    retry.type = "button";
    retry.id = "learn-charge-retry";
    retry.textContent = "RETRY";
    retry.addEventListener("click", () => port.retry());
    chips.append(retry);
    const copy = document.createElement("div");
    copy.append(task, readout, chips);
    root.append(scope, copy);
    document.body.append(root);
    const W = scope.width, H = scope.height, PAD = 10;
    const xOf = f => PAD + Math.min(1, Math.max(0, f)) * (W - 2 * PAD);
    const yOf = e => H - PAD - Math.min(1, Math.max(0, e)) * (H - 2 * PAD);
    let L = ledger(), trace = [], e0 = null, lastProg = -Infinity, next = 0;
    function paint(c, frac) {
      ctx.clearRect(0, 0, W, H);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, yOf(e0)); ctx.lineTo(W - PAD, yOf(e0));   // the start store: end at or above it
      for (const f of [1 / 3, 2 / 3]) { ctx.moveTo(xOf(f), PAD); ctx.lineTo(xOf(f), H - PAD); }
      ctx.stroke();
      ctx.setLineDash([]);
      const fc = EnergyPlan.forecast(e0, 0, false).rows;
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(e0));
      fc.forEach((r, i) => ctx.lineTo(xOf((i + 1) / 3), yOf(r.end)));
      ctx.stroke();
      ctx.strokeStyle = "#00dcff";
      ctx.beginPath();
      trace.forEach(([f, e], i) => (i ? ctx.lineTo(xOf(f), yOf(e)) : ctx.moveTo(xOf(f), yOf(e))));
      ctx.stroke();
      ctx.fillStyle = c.deploying ? "#00dcff" : "#ffffff";
      ctx.beginPath(); ctx.arc(xOf(frac), yOf(c.energy), 5, 0, Math.PI * 2); ctx.fill();
    }
    function draw() {
      if (G.state !== "race") { root.hidden = true; return false; }
      const now = performance.now();
      if (now < next) return false;
      next = now + 100;   // 10 Hz is enough for a ledger
      const c = G.player, track = G.track;
      if (!c || !track) return false;
      if (c.prog < lastProg - 10 || e0 == null) { L = ledger(); trace = []; e0 = c.energy; }   // RETRY: a new run
      lastProg = c.prog;
      ledgerAdd(L, c, G.raceT);
      const frac = ((c.s % track.total) + track.total) % track.total / track.total;
      trace.push([frac, c.energy]);
      if (trace.length > 1200) trace.shift();
      paint(c, frac);
      root.hidden = false;
      const net = c.energy - e0;
      task.textContent = "End the lap with at least " + mj(e0) + " MJ. Net now " + mj(net, true) + " MJ.";
      const status = strip(L, L.lastSec || 0);
      if (readout.textContent !== status) readout.textContent = status;
      return false;   // no road markings
    }
    return { draw, car: () => null, hide() { root.hidden = true; }, remove() { root.remove(); } };
  }

  function define() {
    if (typeof DrillRegistry === "undefined") return null;   // LAZY_LEARN has no edges: js/ui/learn-door.js defines it again once the registry is up
    return DrillRegistry.define({
      id: "charge", lesson: "hybrid", title: "Charge-Sustaining Lap",
      setup: { flow: "gp", session: "race", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "off" },
      stage, begin, guide, goal: "charge", sample, score,
      medals,
    });
  }
  define();

  return Object.freeze({ define, sample, score, begin, stage, ledger, ledgerAdd, classOf, strip, sectorNet, MEDALS, medals, STORE, START_K, START_M });
})();
