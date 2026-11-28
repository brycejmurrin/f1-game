/* Apex 26 — GRIP & BRAKING: the friction-circle drill (#6559 step 4, #6551 §2, #7040). LEARN's braking lesson on
   track: a solo Monza Time Trial placed at speed on the run to the Parabolica (the last curated turn), driven V-LINE
   (brake straight, release, turn), TRAIL (turn in while bleeding the brake off) or FREE. A 148 px circle shows the
   tyre's one grip budget as the car spends it: y = axFrac (the brake's share), x = the lateral use of what the brake
   left, max(frontUtil, rearUtil) x sqrt(1 - axFrac^2); a dot on the rim is the whole budget in use.
   A run is RaceInsights' "grip" goal: it ends at a gate 150 m past the turn (race-insights.js). RIM USE, the score, is
   the time-weighted mean of sqrt(lat^2 + long^2), capped at 1, from the first firm brake (> 0.5) to the apex. Fails:
   off the track or contact (RaceInsights), wheels locked over 0.3 s, a spin. Medals (MEDALS below): bronze a clean
   run, silver and gold the VM-derived rim-use tiers, gold also a gate time within 0.15 s of your best TRAIL run this
   launch. Reference runs: tests/helpers/drill-drive-vm.mjs --write-grip; pins: tests/unit/drill-grip{,-vm}.test.mjs.
   THE ARC NEVER REACHES THE DRIVER: sample(), score() and the widget read only port.physState() (the host's
   DrillRegistry.physOf: the player's car, no __apex needed, #7342) and the race clock; the widget's variant is the
   host's (port.variant(), so the card's NEXT moves it too); the turn and its gate are the curated track.def.turns, never the curvature table. Nothing is written
   to a car outside begin()'s placement, as the Aero drill places its cars. LAZY_LEARN: defined at eval when the
   registry is already up, else by LearnDoor.defineDrills (bundle order is not evaluation order). */
const GripDrill = (function () {
  "use strict";

  const FIRM = 0.5;          // pedal that opens the zone (RaceInsights' FIRM_BRAKE)
  const LOCK = 0.25;         // c.wheelLock that is a lock-up (player-forces' own haptic threshold)
  const LOCK_S = 0.3;        // a lock held this long fails the run
  const SPIN_DEG = 60;       // body slip past this is a spin
  const LEAD_M = 650;        // the start, metres before the apex: flat out, then the whole braking zone
  // Tiers from the VM reference runs (tests/data/learn-drill-refs.json "grip", #6559 §1e rule 4): silver = their
  // median clean rim use, gold = the best clean one; pinned by tests/unit/drill-grip-vm.test.mjs.
  const MEDALS = Object.freeze({ silver: 45, gold: 52, goldGateS: 0.15 });
  const VARIANTS = Object.freeze([
    { id: "vline", label: "V-line", task: "Brake hard in a straight line, release, then turn" },
    { id: "trail", label: "Trail", task: "Turn in while you bleed the brake off" },
    { id: "free", label: "Free", task: "Your own way: ride the rim of the circle" },
  ]);
  const clamp01 = v => Math.max(0, Math.min(1, v || 0));

  /** Pure: the dot. {x, y, r}: lateral and longitudinal use of one grip budget, and its radius (rim use). */
  function circle(ps) {
    const y = clamp01(ps.axFrac), x = clamp01(Math.max(ps.frontUtil || 0, ps.rearUtil || 0)) * Math.sqrt(1 - y * y);
    return { x, y, r: Math.min(1, Math.hypot(x, y)) };
  }

  /** The medal rule (#6559 §1a: a function, because gold also compares with your best TRAIL run). */
  function medals(r, history) {
    if (!r.clean) return null;
    const trails = history.concat(r).filter(h => h.variant === "trail" && h.clean && Number.isFinite(h.gateS));
    const best = trails.length ? Math.min(...trails.map(h => h.gateS)) : Infinity;
    if (r.value >= MEDALS.gold && Number.isFinite(best) && r.gateS <= best + MEDALS.goldGateS) return "gold";
    return r.value >= MEDALS.silver ? "silver" : "bronze";
  }

  /** Read-only accumulator, one call per host tick (registry.js tick): the zone, the rim integral and the fails. */
  function sample(G, acc, port) {
    const ps = port && port.physState(), d = G.coach.insights.summary().drill;
    if (!ps || ps.error || !d) return;
    const dt = acc.t == null ? 0 : Math.max(0, G.raceT - acc.t);
    acc.t = G.raceT;
    if (acc.n == null) Object.assign(acc, { n: 0, rimS: 0, zoneS: 0, trailS: 0, stabS: 0, lockS: 0, peak: 0, fail: "", vMin: Infinity });
    acc.n++;
    if (acc.brakeAt == null && ps.brakeDemand > FIRM) { acc.brakeAt = ps.prog; acc.brakeV = ps.speed; }
    const c = circle(ps);
    if (acc.brakeAt != null && ps.prog <= d.apexProg) {
      acc.rimS += c.r * dt;
      acc.zoneS += dt;
      if (ps.brakeDemand > 0.05 && c.x > 0.3) acc.trailS += dt;   // braking and turning at once
      if (ps.brakeDemand > FIRM) acc.peak = Math.max(acc.peak, -ps.axEstSm);
      if (ps.speed < acc.vMin) { acc.vMin = ps.speed; acc.vMinAt = ps.prog; }
    }
    if (ps.brakeStab < 0.98) acc.stabS += dt;
    acc.lockS = ps.wheelLock > LOCK ? acc.lockS + dt : 0;
    if (!acc.fail && acc.lockS > LOCK_S) acc.fail = "locked the fronts";
    if (!acc.fail && (Math.abs(ps.slipDeg) > SPIN_DEG || ps.wrongWay)) acc.fail = "spun the car";
    acc.vGate = ps.speed;
  }

  /** The result: rim use in %, measured metrics only, one verdict sentence. last is RaceInsights' lastDrill. */
  function score(G, last, acc, variant) {
    const rim = acc.zoneS > 0 ? acc.rimS / acc.zoneS : 0, value = +(100 * rim).toFixed(1);
    const clean = !!last.clean && !acc.fail, reason = acc.fail || last.reason || "";
    // AppearanceOpts and PhysicsConsts are eager; a score runs only inside a booted race, so neither is guarded.
    const kmh = v => { const k = G.dashKph ? G.dashKph(Math.abs(v)) : Math.abs(v) * 3.6; return AppearanceOpts.speed(k) + (AppearanceOpts.units() === "mph" ? " mph" : " km/h"); };
    // v^2/2a at the hardest deceleration the car produced: what the stop to the slowest point WOULD have taken.
    const used = acc.vMinAt != null ? acc.vMinAt - acc.brakeAt : 0;
    const ideal = acc.peak > 1 && acc.brakeV > acc.vMin ? (acc.brakeV ** 2 - acc.vMin ** 2) / (2 * acc.peak) : used;
    const slack = Math.max(0, used - ideal);
    const name = (VARIANTS.find(v => v.id === variant) || VARIANTS[2]).label;
    const verdict = !clean ? "The run ended: " + reason + ". Ease the pedal as the wheel turns, so the circle never asks for more than it has."
      : acc.brakeAt == null ? "No firm brake: the zone never opened. Brake hard for the Parabolica, then turn."
      : rim >= MEDALS.silver / 100 ? "You rode the rim at " + value.toFixed(0) + " %: the brake handed its grip to the turn as the turn needed it."
      : "You used " + value.toFixed(0) + " % of the circle: braking alone, then turning alone, leaves the middle of it unused.";
    return {
      value, unit: "%", better: "high", clean, reason, gateS: +(last.seconds || 0).toFixed(2),
      metrics: [
        [name + " rim use", value.toFixed(0), "%"],
        ["Peak decel", (acc.peak || 0).toFixed(0) + " of " + PhysicsConsts.LONG_GRIP, "m/s²"],
        ["Braking slack", slack.toFixed(0), "m"],
        ["Gate time", (last.seconds || 0).toFixed(2), "s"],
        ["Exit", kmh(acc.vGate || 0), ""],
        ["Run", clean ? "clean" + (acc.stabS > 0.2 ? " · rear brake eased" : "") : reason, ""],
      ],
      verdict,
    };
  }

  function begin(G) {
    const track = G.track, player = G.player, turns = track && track.def.turns;
    if (!player || !turns || !turns.length || G.state !== "count") return false;
    const s = G.wrapS(turns[turns.length - 1] * track.total - LEAD_M);
    player.s = player._prevS = player.prog = player.rPrevS = s;
    player.lap = 1;
    player.x = player.xVis = player.rPrevX = TrackLine.at(track, s).x;
    player.speed = G.vTop() * 0.92;
    player.gear = 7;
    RealRace.seatOnRoad(track, player);
    if (!G.goRolling()) return false;
    G.snapGameCam();
    G.coach.setPracticeGoal("grip");
    return G.coach.mark();
  }

  /** The live widget: the circle with a 2 s tail, decel, % of the circle, the variant chips and RETRY. Render-only. */
  function guide(G, port) {
    const root = document.createElement("div");
    root.id = "learn-grip-guide";
    root.hidden = true;
    const scope = document.createElement("canvas");
    scope.width = scope.height = 148;
    scope.setAttribute("aria-hidden", "true");
    const ctx = scope.getContext("2d");
    const task = document.createElement("strong");
    task.id = "learn-grip-task";
    task.setAttribute("role", "status");
    const readout = document.createElement("span");
    const chips = document.createElement("div");
    const copy = document.createElement("div");
    copy.append(task, readout, chips);
    root.append(scope, copy);
    const variant = () => port.variant() || VARIANTS[0].id;   // the host's: a chip, or the card's NEXT (rerun)
    const buttons = VARIANTS.map(v => {
      const b = document.createElement("button");
      b.type = "button";
      b.id = "learn-grip-" + v.id;
      b.textContent = v.label.toUpperCase();
      b.addEventListener("click", () => port.rerun(v.id));
      return b;
    });
    const retry = document.createElement("button");
    retry.type = "button";
    retry.id = "learn-grip-retry";
    retry.textContent = "RETRY";
    retry.addEventListener("click", () => port.retry());
    chips.append(...buttons, retry);
    document.body.append(root);
    const TAIL = 30, tail = new Float32Array(TAIL * 2);   // 2 s at 15 Hz
    let head = 0, filled = 0, next = 0;
    function paint(c, locked) {
      const w = scope.width, m = w / 2, R = m - 8;
      ctx.clearRect(0, 0, w, w);
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(m, m, R, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(m - R, m); ctx.lineTo(m + R, m); ctx.moveTo(m, m - R); ctx.lineTo(m, m + R); ctx.stroke();
      ctx.fillStyle = "rgba(0,220,255,.45)";
      for (let k = 0; k < filled; k++) {
        const i = (head - 1 - k + TAIL) % TAIL;
        ctx.fillRect(m + tail[i * 2] * R - 1.5, m - tail[i * 2 + 1] * R - 1.5, 3, 3);
      }
      ctx.fillStyle = locked ? "#ff8a00" : "#ffffff";
      ctx.beginPath(); ctx.arc(m + c.x * R, m - c.y * R, 6, 0, Math.PI * 2); ctx.fill();
    }
    function draw() {
      if (G.state !== "race") { root.hidden = true; return false; }
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (now < next) return false;
      next = now + 66;   // 15 Hz: physState() builds an object, the widget needs no more
      const ps = port.physState();
      if (!ps || ps.error) return false;
      const c = circle(ps), sx = c.x * Math.sign(ps.yawRate || 1);   // left or right of the circle by the yaw
      tail[head * 2] = sx; tail[head * 2 + 1] = c.y;
      head = (head + 1) % TAIL; filled = Math.min(TAIL, filled + 1);
      paint({ x: sx, y: c.y }, ps.wheelLock > LOCK);
      root.hidden = false;
      const vid = variant();
      task.textContent = (VARIANTS.find(v => v.id === vid) || VARIANTS[0]).task;
      readout.textContent = Math.max(0, -ps.axEstSm).toFixed(0) + " m/s² · " + Math.round(100 * c.r) + " % of the circle"
        + (ps.brakeStab < 0.98 ? " · rear brake share eased" : "");
      for (const b of buttons) b.setAttribute("aria-pressed", String(b.id === "learn-grip-" + vid));
      return false;   // no road markings: the replay ghost keeps the road
    }
    return { draw, car: () => null, hide() { root.hidden = true; }, remove() { root.remove(); } };
  }

  function define() {
    if (typeof DrillRegistry === "undefined") return null;
    return DrillRegistry.define({
      id: "grip", lesson: "braking", title: "Monza Grip & Braking Drill",
      setup: { flow: "gp", session: "tt", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "off" },
      variants: VARIANTS,
      begin, guide, goal: "grip", sample, score, medals,
    });
  }
  define();

  return Object.freeze({ define, circle, medals, sample, score, MEDALS, VARIANTS, FIRM, LOCK, LOCK_S, SPIN_DEG });
})();
