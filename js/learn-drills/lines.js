/* Apex 26 — RACING LINES: the apex-choice drill (#6559 step 10, #6551 §3). LEARN's racing-line lesson on track: a
   solo Monza Time Trial placed on the run to the Parabolica (the last curated turn, a right-hander onto the main
   straight). Each run aims at one apex cone on the inside kerb, EARLY, GEOMETRIC or LATE: the cones are offsets in
   arc around the curated turn, at the road's half-width less 1 m (track metadata and width, never the arc). The run
   is RaceInsights' "apex" goal; this file measures minimum speed through the turn, exit speed 320 m past it and the
   time to a gate 650 m past it. The lesson: the score is the gate, not the minimum speed.
   A run COUNTS when the car passes its cone within 1.5 m. Medals (stageOf below, per launch): bronze = all three
   apexes counted; silver = plus the right answer to "which apex won to the gate?", asked by the widget from the
   player's own runs; gold = plus a later run on the winning apex, within 0.5 m of its cone, that beats the player's
   best gate time there. The result's value is that stage (0..3), so the card's tiers are {1, 2, 3}.
   THE ARC NEVER REACHES THE DRIVER: sample(), score() and the widget read the player's arc position, lateral offset,
   speed and the race clock, and the road's half-width (Tracks.sample). The racing line is shown nowhere here and read
   only by begin() to seat the car (TrackLine.at, as the Aero drill places its cars); no curvature is read at all
   (tests/unit/drill-registry.test.mjs greps js/learn-drills/; tests/unit/curvature-contract-vm.test.mjs drives this
   drill with the arc swapped). Nothing is written to a car outside begin(). LAZY_LEARN: defined at eval when the
   registry is up, else by LearnDoor.defineDrills (bundle order is not evaluation order). */
const LinesDrill = (function () {
  "use strict";

  const INSIDE = 1;           // the Parabolica's inside kerb is +x (the VM test pins it to the racing line's apex side)
  const KERB_IN = 1;          // the cone sits this far in from the road edge (#6551 §3: hw - 1 m)
  const LEAD_M = 420;         // the start, metres before the curated turn: flat out, then the braking zone
  const EXIT_M = 320, GATE_M = 650;   // exit speed and the timing gate, metres past the turn mark (its arc runs to ~+290)
  const MIN_SPAN = 300;       // minimum speed is read within this many metres either side of the turn
  const HIT_M = 1.5, GOLD_M = 0.5;    // a counted run, and the gold run's precision
  const TRACE_DX = 10;        // speed trace resolution, metres
  const VARIANTS = Object.freeze([
    { id: "early", label: "Early", off: -30, task: "Clip the EARLY cone: turn in sooner, carry speed in" },
    { id: "geometric", label: "Geometric", off: 80, task: "Clip the GEOMETRIC cone: the middle of the turn" },
    { id: "late", label: "Late", off: 180, task: "Clip the LATE cone: turn in later, open the exit" },
  ]);
  const MEDALS = Object.freeze({ bronze: 1, silver: 2, gold: 3, goldClean: true });
  const variantOf = id => VARIANTS.find(v => v.id === id) || VARIANTS[0];

  // One launch's runs (a fresh book per launch: the registry calls guide() once per launch).
  let book = newBook(), variant = VARIANTS[0].id;
  function newBook() { return { runs: [], answer: null }; }

  /** Pure: the best counted gate time per apex ({early: s, …}, missing apexes absent). */
  function bests(runs) {
    const out = {};
    for (const r of runs) if (r.counted && (!(r.variant in out) || r.gateS < out[r.variant])) out[r.variant] = r.gateS;
    return out;
  }
  /** Pure: the apex that won to the gate, once all three are counted; else null. */
  function winner(runs) {
    const b = bests(runs);
    if (!VARIANTS.every(v => v.id in b)) return null;
    return VARIANTS.reduce((w, v) => (b[v.id] < b[w.id] ? v : w)).id;
  }
  /** Pure: the medal stage of a book (0 none, 1 bronze, 2 silver, 3 gold). Gold is a run AFTER the answer, on the
   *  winning apex, within GOLD_M of its cone, faster than every earlier counted run there. */
  function stageOf(bk) {
    const w = winner(bk.runs);
    if (!w) return 0;
    if (!bk.answer || bk.answer.pick !== w) return 1;
    const gold = bk.runs.some((r, i) => i >= bk.answer.after && r.variant === w && r.counted && r.miss <= GOLD_M &&
      bk.runs.slice(0, i).every(o => !(o.variant === w && o.counted) || r.gateS < o.gateS));
    return gold ? 3 : 2;
  }
  /** The widget's question: recorded once per launch, after all three apexes count. True when it was taken. */
  function answer(pick) {
    if (book.answer || !winner(book.runs) || !VARIANTS.some(v => v.id === pick)) return false;
    book.answer = { pick, after: book.runs.length };
    return true;
  }

  /** Read-only accumulator, one call per host tick: the marks of this run, then each one as the car crosses it. */
  function sample(G, acc) {
    const p = G.player, tr = G.track;
    if (!p || !tr || !tr.def.turns || !tr.def.turns.length) return;
    if (acc.turn == null) {
      const f = tr.def.turns[tr.def.turns.length - 1], L = tr.total, v = variantOf(variant);
      acc.variant = v.id;
      acc.turn = p.prog + ((f * L - p.s) % L + L) % L;
      acc.cone = acc.turn + v.off;
      const at = Tracks.sample(tr, G.wrapS(acc.cone), { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 });
      acc.coneX = INSIDE * (at.hw - KERB_IN);
      acc.t0 = G.raceT; acc.vMin = Infinity; acc.trace = []; acc.next = acc.turn - MIN_SPAN;
      acc.prev = null;
    }
    const now = { prog: p.prog, x: p.x, v: Math.abs(p.speed), t: G.raceT }, q = acc.prev;
    acc.prev = now;
    if (!q || now.prog <= q.prog) return;
    const cross = m => (q.prog < m && now.prog >= m ? (m - q.prog) / (now.prog - q.prog) : -1);
    let f = cross(acc.cone);
    if (f >= 0) acc.miss = Math.abs(M4.lerp(q.x, now.x, f) - acc.coneX);
    if ((f = cross(acc.turn + EXIT_M)) >= 0) acc.vExit = M4.lerp(q.v, now.v, f);
    if ((f = cross(acc.turn + GATE_M)) >= 0) acc.gateS = M4.lerp(q.t, now.t, f) - acc.t0;
    if (Math.abs(now.prog - acc.turn) <= MIN_SPAN) acc.vMin = Math.min(acc.vMin, now.v);
    while (acc.next <= now.prog && acc.next <= acc.turn + GATE_M) {
      const g = cross(acc.next);
      acc.trace.push(+(g >= 0 ? M4.lerp(q.v, now.v, g) : now.v).toFixed(2));
      acc.next += TRACE_DX;
    }
  }

  function kmhOf(G) {
    const AO = typeof AppearanceOpts !== "undefined" ? AppearanceOpts : null;   // RaceInsights' own speed display
    return v => { const k = G.dashKph ? G.dashKph(Math.abs(v)) : Math.abs(v) * 3.6; return (AO ? AO.speed(k) : Math.round(k)) + (AO && AO.units() === "mph" ? " mph" : " km/h"); };
  }

  /** The result: one run joins the book, the value is the book's stage. Measured metrics only. */
  function score(G, last, acc) {
    const v = variantOf(acc.variant), miss = Number.isFinite(acc.miss) ? acc.miss : Infinity;
    const gateS = Number.isFinite(acc.gateS) ? acc.gateS : null;
    const counted = !!last.clean && miss <= HIT_M && gateS != null;
    const run = { variant: v.id, miss, vMin: Number.isFinite(acc.vMin) ? acc.vMin : 0, vExit: acc.vExit || 0, gateS, counted, trace: acc.trace || [] };
    book.runs.push(run);
    const stage = stageOf(book), b = bests(book.runs), kmh = kmhOf(G), w = winner(book.runs);
    // The next run aims at an apex not yet counted; with all three in, it stays on the one just driven.
    const todo = VARIANTS.find(o => !(o.id in b));
    if (todo) variant = todo.id;
    // Against the player's own EARLY run, as #6551 §3's card reads ("LATE: min 182 km/h (−9 vs EARLY)").
    const ref = v.id !== "early" && counted ? book.runs.find(r => r.counted && r.variant === "early") || null : null;
    const sign = d => (d < 0 ? "−" : "+");
    const dv = (a, b) => (ref ? " (" + sign(a - b) + kmh(a - b) + " vs EARLY)" : "");
    const dt = (a, b) => (ref ? " (" + sign(a - b) + Math.abs(a - b).toFixed(2) + " s vs EARLY)" : "");
    const reason = !last.clean ? last.reason || "run ended" : !Number.isFinite(miss) ? "never reached the cone" : miss > HIT_M ? "missed the cone by " + miss.toFixed(1) + " m" : gateS == null ? "never reached the gate" : "";
    const verdict = !counted ? "Not counted: " + reason + ". Pass within " + HIT_M + " m of the " + v.label.toUpperCase() + " cone."
      : !w ? v.label.toUpperCase() + " counted. " + VARIANTS.filter(o => !(o.id in b)).map(o => o.label.toUpperCase()).join(" and ") + " to go, then say which apex won to the gate."
      : !book.answer ? "All three apexes are in. Answer on the widget: which one won to the gate?"
      : stage === 1 ? "The gate says " + w.toUpperCase() + " won: exit speed down a long straight beats minimum speed."
      : stage === 2 ? "Right: " + w.toUpperCase() + ". For gold, beat your gate time there within " + GOLD_M + " m of the cone."
      : "Gold: you read your own data and drove the winning apex faster still.";
    return {
      value: stage, unit: "/ 3", better: "high", clean: counted, reason, gateS,
      metrics: [
        [v.label + " cone miss", Number.isFinite(miss) ? miss.toFixed(1) : "—", "m"],
        ["Minimum speed", kmh(run.vMin) + dv(run.vMin, ref && ref.vMin), ""],
        ["Exit +" + EXIT_M + " m", kmh(run.vExit) + dv(run.vExit, ref && ref.vExit), ""],
        ["Gate +" + GATE_M + " m", gateS == null ? "—" : gateS.toFixed(2) + " s" + dt(gateS, ref && ref.gateS), ""],
        ["Apexes counted", VARIANTS.filter(o => o.id in b).map(o => o.label).join(", ") || "none", ""],
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
    player.x = player.xVis = player.rPrevX = TrackLine.at(track, s).x;   // placement only (#6559 §1e rule 2)
    player.speed = G.vTop() * 0.92;
    player.gear = 7;
    RealRace.seatOnRoad(track, player);
    if (!G.goRolling()) return false;
    G.snapGameCam();
    G.coach.setPracticeGoal("apex");
    return G.coach.mark();
  }

  const COLOURS = { early: "#ff8a00", geometric: "#ffffff", late: "#00dcff" };
  /** The live widget: the three apexes' speed traces, the cone readout, the chips, RETRY and the question. */
  function guide(G, port) {
    book = newBook();
    variant = VARIANTS[0].id;
    const kmh = kmhOf(G);
    const root = document.createElement("div");
    root.id = "learn-lines-guide";
    root.hidden = true;
    const scope = document.createElement("canvas");
    scope.width = 280; scope.height = 148;
    scope.setAttribute("aria-hidden", "true");
    const ctx = scope.getContext("2d");
    const task = document.createElement("strong");
    task.setAttribute("role", "status");
    const readout = document.createElement("span");
    const chips = document.createElement("div");
    const ask = document.createElement("div");
    ask.hidden = true;
    const copy = document.createElement("div");
    copy.append(task, readout, chips, ask);
    root.append(scope, copy);
    const button = (id, text, fn) => {
      const b = document.createElement("button");
      b.type = "button"; b.id = id; b.textContent = text;
      b.addEventListener("click", fn);
      return b;
    };
    const pick = VARIANTS.map(v => button("learn-lines-" + v.id, v.label.toUpperCase(), () => { variant = v.id; port.retry(); }));
    chips.append(...pick, button("learn-lines-retry", "RETRY", () => port.retry()));
    const q = document.createElement("strong");
    q.textContent = "Which apex won to the gate?";
    ask.append(q, ...VARIANTS.map(v => button("learn-lines-ask-" + v.id, v.label.toUpperCase(), () => { answer(v.id); ask.hidden = true; })));
    document.body.append(root);
    let next = 0, painted = -1;
    function paint() {
      const w = scope.width, h = scope.height, n = Math.ceil((MIN_SPAN + GATE_M) / TRACE_DX) + 1;
      ctx.clearRect(0, 0, w, h);
      const best = {};
      for (const r of book.runs) if (r.counted && (!best[r.variant] || r.gateS < best[r.variant].gateS)) best[r.variant] = r;
      const all = Object.values(best).flatMap(r => r.trace);
      if (!all.length) return;
      const lo = Math.min(...all), hi = Math.max(...all, lo + 1);
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.beginPath(); const tx = (MIN_SPAN / (MIN_SPAN + GATE_M)) * w; ctx.moveTo(tx, 0); ctx.lineTo(tx, h); ctx.stroke();   // the turn
      for (const [id, r] of Object.entries(best)) {
        ctx.strokeStyle = COLOURS[id]; ctx.lineWidth = 2; ctx.beginPath();
        r.trace.forEach((v, i) => { const x = i / (n - 1) * w, y = h - 6 - (v - lo) / (hi - lo) * (h - 12); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
      }
    }
    function draw() {
      if (G.state !== "race") { root.hidden = true; return false; }
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (now < next) return false;
      next = now + 100;   // 10 Hz: text and a chart, nothing per frame
      const p = G.player, tr = G.track;
      if (!p || !tr) return false;
      root.hidden = false;
      if (painted !== book.runs.length) { painted = book.runs.length; paint(); }
      const v = variantOf(variant), L = tr.total, turnS = tr.def.turns[tr.def.turns.length - 1] * L;
      const toCone = ((turnS + v.off - p.s) % L + L) % L;
      task.textContent = v.task;
      readout.textContent = toCone < 600 ? "Cone in " + Math.round(toCone) + " m · aim " + KERB_IN + " m off the inside kerb · " + kmh(p.speed)
        : kmh(p.speed) + " · gate " + GATE_M + " m past the turn";
      for (const b of pick) b.setAttribute("aria-pressed", String(b.id === "learn-lines-" + variant));
      ask.hidden = !!book.answer || !winner(book.runs);
      return false;   // no road markings: the driving line keeps the road
    }
    return { draw, car: () => null, hide() { root.hidden = true; }, remove() { root.remove(); } };
  }

  function define() {
    if (typeof DrillRegistry === "undefined") return null;
    return DrillRegistry.define({
      id: "lines", lesson: "racing-line", title: "Monza Racing Lines Drill",
      setup: { flow: "gp", session: "tt", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "off" },
      begin, guide, goal: "apex", sample, score, medals: MEDALS,
    });
  }
  define();

  return Object.freeze({ define, bests, winner, stageOf, answer, sample, score, VARIANTS, MEDALS, INSIDE, HIT_M, GOLD_M, EXIT_M, GATE_M,
    /** Test and agent seam: the apex the next run aims at, and the launch's book (a copy). */
    aim(id) { if (VARIANTS.some(v => v.id === id)) variant = id; return variant; },
    book: () => ({ runs: book.runs.map(r => ({ ...r, trace: r.trace.slice() })), answer: book.answer ? { ...book.answer } : null }) });
})();
Object.freeze(LinesDrill);
