/* Apex 26 — HARVEST STOP: LEARN's brake-blend drill on track (#6559 step 11, #6550 D3a). A solo Monza Time Trial placed
   just past the line at 80 % of top speed with the store at 85 %. Flat out, then brake to a stop on a marker
   MARK_M metres down the straight (RaceInsights' "harvest" goal: the run ends at the stop, or fails 100 m past the
   marker). The MGU-K harvests the first slice of every stop, so the store fills part way down: from then on the
   discs do all the braking and the harvest is clipped. The widget splits the car's measured deceleration into motor
   and friction (brakeSplit below, display-only, #6550 addition 3a) and counts the distance to the marker.
   SCORE: stop accuracy in % (100 on the marker, 0 at SPAN_M or more off it; higher is better). Harvest is SHOWN
   (Apex MJ gained, seconds clipped at a full store, the motor's share), never scored: pedal-dependent harvest (#6550
   3b) is not approved, so the harvest rate is the same whatever the pedal and scoring it would teach nothing.
   Clean = a firm brake to the stop, not past the overrun gate. Medal tiers come from VM rollouts
   (tests/data/learn-drill-refs.json "harvest", tests/unit/drill-harvest-vm.test.mjs).
   THE ARC NEVER REACHES THE DRIVER: sample(), score() and the widget read the player's speed, arc position, energy,
   pedals and measured deceleration only. begin() is the only write (placement and the store), as the Taper Hunt
   places its car. LAZY_LEARN: defined at eval when the registry is up, else by LearnDoor.defineDrills. */
const HarvestDrill = (function () {
  "use strict";

  const START_M = 20;        // arc metres past the line: the whole run is one lap, no line crossing
  const START_K = 0.8;       // of vTop()
  const STORE = 0.85;        // c.energy at the start: the store fills part way through the stop
  const MARK_M = 330;        // the marker, metres past the start (RaceInsights' overrun gate is 100 m further)
  const SPAN_M = 50;         // metres off the marker that score 0 %
  // Accuracy tiers (%) from the VM brake-point sweep (tests/data/learn-drill-refs.json "harvest", the rule in its "rule" field).
  const MEDALS = Object.freeze({ bronze: 45.7, silver: 72.8, gold: 89.1, goldClean: true });
  const MJ = v => (v * (PhysicsConsts.ES_MJ || 4)).toFixed(2);
  const G0 = 9.81;
  // BRAKE BLEND, DISPLAY ONLY (#6550 addition 3a): how a deceleration (std m/s²) would split between the MGU-K and the
  // discs. The motor takes the first slice, up to REGEN_DECEL_CAP faded by PaceMath.regenSpeedAt (the physics' own
  // fade), and none once the store is full; the discs take the rest, so motor + friction === decel exactly. No force
  // reads it: the harvest stays game.js's fixed brake rate (pedal-dependent harvest, #6550 3b, is not approved).
  const REGEN_DECEL_CAP = 4;   // std m/s² (~0.4 g): the readout's motor ceiling, a label like ES_MJ, not a power model
  function brakeSplit(decel, vs, energy) {
    const d = Math.max(0, decel || 0);
    const motor = energy >= 1 ? 0 : Math.min(d, REGEN_DECEL_CAP * PaceMath.regenSpeedAt(vs));
    return { motor, friction: d - motor };
  }

  /** Signed metres from the marker to the car along the road: + past it (long), − short of it. */
  function offMark(G, s) {
    const L = G.track && G.track.total;
    const d = s - G.wrapS(START_M + MARK_M);
    return L > 0 ? ((d + L / 2) % L + L) % L - L / 2 : d;
  }

  /** The car's standard-pace speed and deceleration, and the display split of that deceleration. */
  function blendOf(G, c) {
    const k = PhysicsConsts.VMAX / Math.max(1e-6, G.vTop());
    const vs = Math.abs(c.speed) * k, decel = (c.brakeDemand || 0) > 0.05 ? Math.max(0, -(c.axEstSm || 0)) * k : 0;
    return { vs, decel, ...brakeSplit(decel, vs, c.energy) };
  }

  /** Read-only accumulator, one call per host tick (registry.js tick). */
  function sample(G, acc) {
    const c = G.player;
    if (!c) return;
    const dt = acc.t == null ? 0 : Math.max(0, G.raceT - acc.t);
    acc.t = G.raceT;
    if (acc.e == null) Object.assign(acc, { e: c.energy, brakeS: 0, harvest: 0, clipS: 0, motorS: 0, decelS: 0, vBrake: null });
    const b = blendOf(G, c);
    if ((c.brakeDemand || 0) > 0.05) {
      if (acc.vBrake == null) acc.vBrake = Math.abs(c.speed);
      acc.brakeS += dt;
      acc.harvest += Math.max(0, c.energy - acc.e);
      if (c.energy >= 1) acc.clipS += dt;
      acc.motorS += b.motor * dt;
      acc.decelS += b.decel * dt;
    }
    acc.e = c.energy;
    acc.off = offMark(G, c.s);
  }

  /** The result: stop accuracy in %, the metres and the harvest as metrics, one verdict. last is RaceInsights'
   *  lastDrill. */
  function score(G, last, acc) {
    const off = acc.off == null ? -MARK_M : acc.off, miss = Math.abs(off);
    const clean = !!last.clean;
    const value = clean ? +(100 * Math.max(0, 1 - miss / SPAN_M)).toFixed(1) : 0;
    const share = acc.decelS > 0 ? 100 * acc.motorS / acc.decelS : 0;
    const AO = AppearanceOpts;
    const kmh = v => { const k = G.dashKph ? G.dashKph(Math.abs(v)) : Math.abs(v) * 3.6; return (AO ? AO.speed(k) : Math.round(k)) + (AO && AO.units() === "mph" ? " mph" : " km/h"); };
    const where = miss < 0.5 ? "on the marker" : miss.toFixed(1) + " m " + (off > 0 ? "past" : "short of") + " the marker";
    const clip = (acc.clipS || 0) > 0.05 ? " Harvest clipped for " + acc.clipS.toFixed(1) + " s: the store was full, so the discs did all of that braking." : "";
    const verdict = !clean ? "The run ended: " + (last.reason || "no stop") + ". Stay flat out, then brake firmly and hold it to a stop on the marker."
      : (miss < 3 ? "Stopped " + where + "." : off > 0 ? "Stopped " + where + ": brake a little earlier." : "Stopped " + where + ": brake a little later.") + clip;
    return {
      value, unit: "%", better: "high", clean, reason: clean ? "" : last.reason || "",
      offM: +off.toFixed(2),
      metrics: [
        ["Stop", clean ? where : last.reason || "no stop", ""],
        ["Braked from", kmh(acc.vBrake || 0), ""],
        ["Harvested (Apex MJ)", MJ(acc.harvest || 0), "MJ"],
        ["Clipped at a full store", (acc.clipS || 0).toFixed(1), "s"],
        ["Motor share of braking", share.toFixed(0), "%"],
        ["Brake time", (acc.brakeS || 0).toFixed(2), "s"],
      ],
      verdict,
    };
  }

  function begin(G) {
    const track = G.track, player = G.player;
    if (!player || !track || G.state !== "count") return false;
    const s = G.wrapS(START_M);
    player.s = player._prevS = player.prog = player.rPrevS = s;
    player.lap = 1;
    player.x = player.xVis = player.rPrevX = TrackLine.at(track, s).x;
    player.speed = G.vTop() * START_K;
    player.gear = 7;
    player.energy = STORE;
    player.boostOn = false;
    RealRace.seatOnRoad(track, player);
    if (!G.goRolling()) return false;
    G.snapGameCam();
    G.coach.setPracticeGoal("harvest");
    return G.coach.mark();
  }

  /** The live widget: a decel bar split motor (blue) and friction (orange) over the distance to the marker. */
  function guide(G, port) {
    const root = document.createElement("div");
    root.id = "learn-harvest-guide";
    root.hidden = true;
    const scope = document.createElement("canvas");
    scope.width = 280; scope.height = 148;
    scope.setAttribute("aria-hidden", "true");
    const ctx = scope.getContext("2d");
    const task = document.createElement("strong");
    task.setAttribute("role", "status");
    const readout = document.createElement("span");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.id = "learn-harvest-retry";
    retry.textContent = "RETRY";
    retry.addEventListener("click", () => port.retry());
    const copy = document.createElement("div");
    copy.append(task, readout, retry);
    root.append(scope, copy);
    document.body.append(root);
    const W = scope.width, H = scope.height, PAD = 10, GMAX = 6;
    let next = 0;
    function paint(b, off, energy) {
      ctx.clearRect(0, 0, W, H);
      const xg = g => PAD + Math.min(1, g / GMAX) * (W - 2 * PAD);
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fillRect(PAD, 18, W - 2 * PAD, 28);
      ctx.fillStyle = "#319bcc";   // motor: the brake-blend lab's palette
      ctx.fillRect(PAD, 18, xg(b.motor / G0) - PAD, 28);
      ctx.fillStyle = "#ff8a1f";   // friction
      ctx.fillRect(xg(b.motor / G0), 18, xg(b.decel / G0) - xg(b.motor / G0), 28);
      ctx.fillStyle = "rgba(255,255,255,.8)";
      ctx.font = "12px sans-serif";
      ctx.fillText("motor", PAD, 62);
      ctx.fillText("discs", PAD + 52, 62);
      ctx.fillText("store " + Math.round(100 * energy) + " %", W - PAD - 72, 62);
      // The road ahead: the marker at a fixed place, the car sliding up to it (100 m either side).
      const yR = 112, xM = W * 0.7, xOf = d => Math.max(PAD, Math.min(W - PAD, xM + d / 100 * (xM - PAD)));
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(PAD, yR); ctx.lineTo(W - PAD, yR); ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(xM - 2, yR - 16, 4, 32);
      ctx.fillStyle = Math.abs(off) < 3 ? "#3ddc84" : "#00dcff";
      ctx.beginPath(); ctx.arc(xOf(off), yR, 6, 0, Math.PI * 2); ctx.fill();
    }
    function draw() {
      if (G.state !== "race") { root.hidden = true; return false; }
      const now = performance.now();
      if (now < next) return false;
      next = now + 66;   // 15 Hz is enough for a gauge
      const c = G.player;
      if (!c) return false;
      const b = blendOf(G, c), off = offMark(G, c.s);
      paint(b, off, c.energy);
      root.hidden = false;
      const toGo = -off;
      task.textContent = b.vs < 0.5 ? "Stopped " + Math.abs(off).toFixed(1) + " m " + (off > 0 ? "past" : "short of") + " the marker"
        : c.energy >= 1 && b.decel > 0 ? "Store full: the discs do all the braking"
        : toGo > 0 ? "Stop on the marker: " + Math.round(toGo) + " m" : "Past the marker: stop the car";
      const status = "Brake " + (b.decel / G0).toFixed(1) + " g · motor " + (b.motor / G0).toFixed(1) + " g · discs " + (b.friction / G0).toFixed(1) + " g · " + MJ(c.energy) + " MJ";
      if (readout.textContent !== status) readout.textContent = status;
      return false;   // no road markings
    }
    return { draw, car: () => null, hide() { root.hidden = true; }, remove() { root.remove(); } };
  }

  function define() {
    if (typeof DrillRegistry === "undefined") return null;   // LAZY_LEARN has no edges: js/ui/learn-door.js defines it again once the registry is up
    return DrillRegistry.define({
      id: "harvest", lesson: "brake-blend", title: "Monza Harvest Stop",
      setup: { flow: "gp", session: "tt", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "off" },
      begin, guide, goal: "harvest", sample, score,
      medals: MEDALS,
    });
  }
  define();

  return Object.freeze({ define, sample, score, begin, offMark, brakeSplit, REGEN_DECEL_CAP, MEDALS, STORE, START_K, START_M, MARK_M, SPAN_M });
})();
