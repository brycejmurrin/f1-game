/* Apex 26 — DIVE TEST: the Suspension & Anti-Dive lesson on track (#6559 step 9, #6555 §2; Bryce's decision D2, #6559).
   A solo Monza Time Trial placed just past the line at 80 % of top speed: brake hard and hold it to a full stop
   (RaceInsights' "braking" goal: firm brake, held, to a standstill). Two variants of one stop, scored and saved apart:
   LOWER ANTI-DIVE (the shipped dive) and HIGHER ANTI-DIVE (BodyAttitude.setPitchScale(HIGH_SCALE), the lab's own
   0.45 index, learn/suspension/lab.js). Before the higher run's first firm brake the player predicts what happens to
   the front load: less, same or more.
   THE LESSON IS THE MODEL'S OWN: load transfer comes from the measured deceleration (game.js's axEstSm term,
   FRONT_WEIGHT + clamp(-axEstSm / LAT_MAX * WT_LONG)), and pitch feeds no force. The scale moves only what is seen
   (the body, the camera nod, the floor and the plank sparks), so the same pedal trace stops in the same metres
   (pinned bit-identical by tests/unit/drill-dive-vm.test.mjs). The card says so.
   MEDALS (a pure function of this launch's results): bronze = a clean lower run and a clean higher run; silver = and the
   prediction was "same"; gold = and the two stops (RaceInsights' stop scaled to 50 m/s) within REPEAT_M of each other:
   the same braking twice, so the comparison is fair. Pitch is never scored: it is the variable under study.
   THE ARC NEVER REACHES THE DRIVER: sample(), score() and the guide read speed, pedals, axEstSm and the c.ba* body
   fields only; begin() is the only car write (placement), vary() the only knob (cosmetic). LAZY_LEARN: defined at eval
   when the registry is up, else by LearnDoor.defineDrills. */
const DiveDrill = (function () {
  "use strict";

  const START_M = 20;        // arc metres past the line: a long straight to the Rettifilo
  const START_K = 0.8;       // of vTop()
  const HIGH_SCALE = 0.45;   // the lab's higher anti-dive pitch index (learn/suspension/lab.js)
  const REPEAT_M = 3;        // gold: the two stop scores within this many metres
  const FIRM = 0.5;          // RaceInsights' FIRM_BRAKE
  const G0 = 9.81;
  // cta: the card's NEXT button when this variant is the next one (registry finish()).
  const VARIANTS = Object.freeze([
    Object.freeze({ id: "low", label: "Lower anti-dive", cta: "RE-RUN LOWER ANTI-DIVE", scale: 1 }),
    Object.freeze({ id: "high", label: "Higher anti-dive", cta: "TRY HIGHER ANTI-DIVE", scale: HIGH_SCALE }),
  ]);
  const PREDICT = Object.freeze([["less", "Less"], ["same", "Same"], ["more", "More"]]);
  let prediction = null;     // this launch's front-load prediction for the higher run (the guide's chips)
  let braked = false;        // this run's first firm brake is in: a pick now would not count, so the chips go

  /** The front axle's load share the grip model uses this frame: game.js's own term, from the measured axEstSm. */
  function frontShare(c) {
    const P = PhysicsConsts;
    const wt = Math.max(-0.16, Math.min(0.18, -(c.axEstSm || 0) / P.LAT_MAX * P.WT_LONG));
    return P.FRONT_WEIGHT + wt;
  }

  /** Read-only accumulator, one call per host tick: peaks from the first firm brake to the stop. */
  function sample(G, acc) {
    const c = G.player;
    if (!c) return;
    const dt = acc.t == null ? 0 : Math.max(0, G.raceT - acc.t);
    acc.t = G.raceT;
    if (acc.decel == null) { braked = false; Object.assign(acc, { decel: 0, front: PhysicsConsts.FRONT_WEIGHT, pitch: 0, clear: Infinity, scrapeM: 0, vBrake: null, guess: null }); }
    if (acc.vBrake == null && (c.brakeDemand || 0) > FIRM) { acc.vBrake = Math.abs(c.speed); acc.guess = prediction; braked = true; }
    if (acc.vBrake == null) return;
    acc.decel = Math.max(acc.decel, -(c.axEstSm || 0));
    acc.front = Math.max(acc.front, frontShare(c));
    acc.pitch = Math.max(acc.pitch, c.baPitch || 0);
    if (Number.isFinite(c.baClear)) acc.clear = Math.min(acc.clear, c.baClear);
    if ((c.baScrape || 0) > 0) acc.scrapeM += Math.abs(c.speed) * dt;
  }

  const deg = rad => rad * 180 / Math.PI;
  const mm = m => (Number.isFinite(m) ? (m * 1000).toFixed(0) : "—");

  /** The result. value = the front load moved at the peak, in % of the car's weight (the lesson's invariant). */
  function score(G, last, acc, variant, history) {
    const clean = !!last.clean && acc.vBrake != null;
    const moved = 100 * ((acc.front ?? PhysicsConsts.FRONT_WEIGHT) - PhysicsConsts.FRONT_WEIGHT);
    const stop = Number.isFinite(last.score) ? +last.score.toFixed(1) : null;
    const k = PhysicsConsts.VMAX / Math.max(1e-6, G.vTop());   // standard-pace m/s² for the g readout
    const run = {
      variant, clean, stop, moved: +moved.toFixed(1), decelG: +((acc.decel || 0) * k / G0).toFixed(2),
      pitchDeg: +deg(acc.pitch || 0).toFixed(2), clearMm: Number.isFinite(acc.clear) ? +(acc.clear * 1000).toFixed(1) : null,
      scrapeM: +(acc.scrapeM || 0).toFixed(1), guess: variant === "high" ? acc.guess : null,
    };
    const reason = clean ? "" : last.reason || "no firm stop";
    const note = " In Apex, anti-dive is shown on the body and floor; the grip model uses the measured deceleration.";
    const verdict = !clean ? "The run ended: " + reason + ". Brake firmly and hold it to a full stop."
      : variant === "high" ? "Front load moved " + run.moved.toFixed(0) + " % and the nose dipped " + run.pitchDeg.toFixed(1)
        + "°: less pitch, the same load path." + (run.guess ? "" : " Predict before you brake next time.") + note
      : "Front load moved " + run.moved.toFixed(0) + " % and the nose dipped " + run.pitchDeg.toFixed(1) + "°. Now try higher anti-dive." + note;
    return compare({
      value: clean ? run.moved : 0, unit: "% load", better: "high", clean, reason, run,
      metrics: [
        ["Front load moved", run.moved.toFixed(0), "%"],
        ["Peak deceleration", run.decelG.toFixed(2), "g"],
        ["Nose dip", run.pitchDeg.toFixed(2), "°"],
        ["Lowest floor clearance", mm(acc.clear), "mm"],
        ["Plank scraped", run.scrapeM.toFixed(0), "m"],
        ["Stop (from 50 m/s)", stop == null ? "—" : stop.toFixed(1), "m"],
      ],
      verdict,
    }, history);
  }

  /** The medal: earned on a higher-anti-dive run, against this launch's latest clean lower run (header). Pure. */
  function medals(r, history) {
    const b = r && r.run;
    if (!b || b.variant !== "high" || !b.clean) return null;
    const a = (history || []).map(h => h.run).filter(h => h && h.variant === "low" && h.clean).pop();
    if (!a) return null;
    if (b.guess !== "same") return "bronze";
    return a.stop != null && b.stop != null && Math.abs(a.stop - b.stop) <= REPEAT_M ? "gold" : "silver";
  }

  /** The A | B table for the higher run's card: the lower run beside it, when this launch has one. */
  function compare(r, history) {
    const b = r.run, a = (history || []).map(h => h.run).filter(h => h && h.variant === "low" && h.clean).pop();
    if (!b || b.variant !== "high" || !a) return r;
    const pair = (x, y, f) => f(x) + " | " + f(y);
    const fix = n => v => (v == null ? "—" : Number(v).toFixed(n));
    r.metrics = [
      ["Front load moved (lower | higher)", pair(a.moved, b.moved, fix(0)), "%"],
      ["Nose dip (lower | higher)", pair(a.pitchDeg, b.pitchDeg, fix(2)), "°"],
      ["Lowest floor clearance (lower | higher)", pair(a.clearMm, b.clearMm, fix(0)), "mm"],
      ["Peak deceleration (lower | higher)", pair(a.decelG, b.decelG, fix(2)), "g"],
      ["Stop (from 50 m/s) (lower | higher)", pair(a.stop, b.stop, fix(1)), "m"],
      ["Your prediction", b.guess ? b.guess + (b.guess === "same" ? " ✓" : " ✗") : "none", ""],
    ];
    r.verdict = "Front load moved " + a.moved.toFixed(0) + " % both times" + (Math.abs(a.moved - b.moved) >= 1 ? " (" + b.moved.toFixed(0) + " % the second)" : "")
      + ". The nose dipped " + a.pitchDeg.toFixed(1) + "° vs " + b.pitchDeg.toFixed(1) + "°. In Apex, anti-dive is shown on the body and floor; the grip model uses the measured deceleration.";
    return r;
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
    player.boostOn = false;
    RealRace.seatOnRoad(track, player);
    if (!G.goRolling()) return false;
    G.snapGameCam();
    G.coach.setPracticeGoal("braking");
    return G.coach.mark();
  }

  /** The variant's pitch scale (registry vary(): at launch and on every rerun). A new higher run asks again. */
  function vary(G, id) {
    const v = VARIANTS.find(x => x.id === id) || VARIANTS[0];
    BodyAttitude.setPitchScale(v.scale);
    if (v.id === "high") prediction = null;
  }
  /** stage(): the undo end() runs puts the shipped dive back. */
  function stage() {
    prediction = null;
    return () => { BodyAttitude.setPitchScale(1); prediction = null; };
  }

  /** The live card: a side-view car pitched ×10, front/rear load bars, the floor clearance, the prediction chips on
   *  the higher run, RETRY. Render-only; the chips write only this file's prediction. */
  function guide(G, port) {
    const root = document.createElement("div");
    root.id = "learn-dive-guide";
    root.hidden = true;
    const scope = document.createElement("canvas");
    scope.width = 280; scope.height = 148;
    scope.setAttribute("aria-hidden", "true");
    const ctx = scope.getContext("2d");
    const task = document.createElement("strong");
    task.setAttribute("role", "status");
    const readout = document.createElement("span");
    const chips = document.createElement("div");
    chips.id = "learn-dive-predict";
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "Predict the front load with higher anti-dive");
    chips.hidden = true;
    const pick = id => { prediction = id; chips.hidden = true; };
    for (const [id, label] of PREDICT) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.predict = id;
      b.textContent = label;
      b.addEventListener("click", () => pick(id));
      chips.append(b);
    }
    const retry = document.createElement("button");
    retry.type = "button";
    retry.id = "learn-dive-retry";
    retry.textContent = "RETRY";
    retry.addEventListener("click", () => port.retry());
    const copy = document.createElement("div");
    copy.append(task, readout, chips, retry);
    root.append(scope, copy);
    document.body.append(root);
    // Desktop: 1 / 2 / 3 pick a chip while they are up (#6559 §1e rule 5).
    const onKey = e => {
      if (chips.hidden || root.hidden || e.repeat || G.paused) return;
      const i = ["1", "2", "3"].indexOf(e.key);
      if (i >= 0) pick(PREDICT[i][0]);
    };
    document.addEventListener("keydown", onKey);
    const W = scope.width, H = scope.height;
    let next = 0;
    function paint(c, share) {
      ctx.clearRect(0, 0, W, H);
      // Side view: the road, the wheels, and the body pitched about the contact patch ×10 (labelled).
      const yRoad = 96, xF = 196, xR = 76, rW = 14;
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(10, yRoad); ctx.lineTo(W - 10, yRoad); ctx.stroke();
      ctx.fillStyle = "#222"; ctx.strokeStyle = "rgba(255,255,255,.6)";
      for (const x of [xR, xF]) { ctx.beginPath(); ctx.arc(x, yRoad - rW, rW, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      const clear = Number.isFinite(c.baClear) ? c.baClear : 0.04;
      ctx.save();
      ctx.translate((xF + xR) / 2, yRoad - rW);
      ctx.rotate((c.baPitch || 0) * 10);   // + = nose down; the nose is to the right
      ctx.fillStyle = clear < 0.014 ? "#ff5a4f" : "#00dcff";
      ctx.beginPath(); ctx.moveTo(-78, -6); ctx.lineTo(70, -2); ctx.lineTo(96, 4); ctx.lineTo(-80, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
      // Load bars: front and rear share of the car's weight.
      const bar = (x, label, f) => {
        ctx.fillStyle = "rgba(255,255,255,.12)"; ctx.fillRect(x, 14, 18, 52);
        ctx.fillStyle = "#3ddc84"; ctx.fillRect(x, 14 + 52 * (1 - f), 18, 52 * f);
        ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = "11px sans-serif";
        ctx.fillText(label + " " + Math.round(100 * f) + "%", x - 6, 80);
      };
      bar(W - 34, "F", share); bar(14, "R", 1 - share);
      ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.font = "11px sans-serif";
      ctx.fillText("pitch ×10 · floor " + mm(clear) + " mm", 62, 134);
    }
    function draw() {
      if (G.state !== "race") { root.hidden = true; return false; }
      const now = performance.now();
      if (now < next) return false;
      next = now + 66;   // 15 Hz is enough for a gauge
      const c = G.player;
      if (!c) return false;
      const share = frontShare(c);
      paint(c, share);
      root.hidden = false;
      const high = port.variant() === "high", moving = Math.abs(c.speed) * PhysicsConsts.VMAX / Math.max(1e-6, G.vTop()) > 1;   // standard-pace m/s
      chips.hidden = !(high && prediction == null && moving && !braked);
      task.textContent = !moving ? "Stopped: compare the dip and the load"
        : high && prediction == null && !braked ? "Higher anti-dive: predict the front load, then brake"
        : (high ? "Higher anti-dive" : "Lower anti-dive") + ": brake hard and hold it to a stop";
      const status = "Front " + Math.round(100 * share) + " % · nose " + deg(c.baPitch || 0).toFixed(1) + "°" + (prediction && high ? " · you said " + prediction : "");
      if (readout.textContent !== status) readout.textContent = status;
      return false;   // no road markings
    }
    return { draw, car: () => null, hide() { root.hidden = true; }, remove() { document.removeEventListener("keydown", onKey); root.remove(); } };
  }

  function define() {
    if (typeof DrillRegistry === "undefined") return null;   // LAZY_LEARN has no edges: js/ui/learn-door.js defines it again once the registry is up
    return DrillRegistry.define({
      id: "dive", lesson: "suspension", title: "Monza Dive Test",
      setup: { flow: "gp", session: "tt", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "off" },
      variants: VARIANTS.map(({ id, label, cta }) => ({ id, label, cta })),
      begin, guide, goal: "braking", sample, stage, vary,
      score, medals,
    });
  }
  define();

  return Object.freeze({ define, sample, score, medals, compare, frontShare, vary, stage, begin,
    predict: id => { prediction = PREDICT.some(p => p[0] === id) ? id : null; return prediction; },
    VARIANTS, HIGH_SCALE, REPEAT_M, START_K, START_M });
})();
