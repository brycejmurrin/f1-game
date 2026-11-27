/* Apex 26 — TELEMETRY DETECTIVE: compare two runs at the SAME DISTANCE (#6559 step 14, #6551 §4). LEARN's telemetry
   lesson on track: a solo Monza Time Trial, placed at speed on sector 2 (the two Lesmos), timed by RaceInsights'
   "sector" goal. RUN 1 is the reference. Each later run is laid over it on a 5 m grid: time, speed, brake and
   throttle. analyze() finds the PEAK-LOSS WINDOW (the 100 m where the time lost grows most) and its CAUSE: the lane
   that differs first in it (from LOOK m before), EARLY BRAKE / LOW MIN SPEED / LATE THROTTLE. On the card the player scrubs the
   delta-by-distance chart (drag, or the arrow keys), taps a cause chip and THIS CORNER (pick()):
   bronze = the pick is within 60 m of the window, silver = the cause too, gold = a later FIX IT run (RETRY) wins
   back at least 60 % of the time lost in that window, and is faster overall than the run you solved. The score is the seconds you located (the window's loss once
   you find it) or won back (a FIX IT run): a higher score is better. Pins: tests/unit/drill-telemetry{,-vm}.test.mjs;
   reference runs: node tests/unit/drill-telemetry-vm.test.mjs --write.
   READ-ONLY: sample() reads the player's own speed, pedals, progress and the race clock. Nothing reads curvature or
   the racing line. Nothing is written to a car outside begin()'s placement (as grip.js places it). LAZY_LEARN:
   defined at eval when the registry is already up, else by LearnDoor.defineDrills. */
const TelemetryDrill = (function () {
  "use strict";

  const STEP = 5;            // m: the grid both traces are resampled onto
  const WIN = 100;           // m: the peak-loss window
  const LOOK = 60;           // m before the window where its cause may start (you brake before you lose)
  const NEAR = 60;           // m: bronze, a pick this close to the window
  const FIX = 0.6;           // gold: the FIX IT run wins back this share of the window's loss
  const LEAD = 40;           // m past the sector-1 line: the start
  const CAUSES = Object.freeze([
    { id: "brake", label: "EARLY BRAKE" },
    { id: "speed", label: "LOW MIN SPEED" },
    { id: "throttle", label: "LATE THROTTLE" },
  ]);
  const label = id => (CAUSES.find(c => c.id === id) || { label: "NO CLEAR CAUSE" }).label;

  // One launch's state: the reference run and the run the player has solved. guide() (once per launch) resets it.
  let S = { ref: null, solved: null, panel: null };

  /** Read-only recorder, one call per host tick: the first sample at or past each 5 m point, time interpolated. */
  function sample(G, acc) {
    const p = G.player;
    if (!p) return;
    if (acc.t == null) {   // a new run: a panel the last card never showed is stale
      Object.assign(acc, { p0: p.prog, t0: G.raceT, t: [], v: [], b: [], th: [], lastD: 0, lastT: 0 });
      S.pending = null;
    }
    const d = p.prog - acc.p0, t = G.raceT - acc.t0;
    while (acc.t.length * STEP <= d) {
      const at = acc.t.length * STEP, k = d > acc.lastD ? (at - acc.lastD) / (d - acc.lastD) : 1;
      acc.t.push(+(acc.lastT + Math.max(0, Math.min(1, k)) * (t - acc.lastT)).toFixed(3));
      acc.v.push(+p.speed.toFixed(2));
      acc.b.push(+(p.brakeDemand || 0).toFixed(2));
      acc.th.push(+(p.throttleDemand || 0).toFixed(2));
    }
    acc.lastD = d; acc.lastT = t;
  }

  /** Pure: run vs ref on their common grid. {dt[], window:{from,to,loss}, cause, causeAt, total}. */
  function analyze(ref, run) {
    const n = Math.min(ref.t.length, run.t.length), w = WIN / STEP, dt = [];
    for (let i = 0; i < n; i++) dt.push(+(run.t[i] - ref.t[i]).toFixed(3));
    let best = 0, from = 0;
    for (let i = 0; i + w < n; i++) if (dt[i + w] - dt[i] > best) { best = dt[i + w] - dt[i]; from = i; }
    let cause = null, causeAt = null;
    for (let i = Math.max(0, from - LOOK / STEP); i <= Math.min(n - 1, from + w) && !cause; i++) {
      if (run.b[i] > 0.2 && ref.b[i] <= 0.2 && ref.th[i] > 0.5) cause = "brake";   // on the brake while the ref was still flat out
      else if (ref.th[i] > 0.5 && run.th[i] <= 0.5 && run.b[i] <= 0.2) cause = "throttle";
      else if (ref.v[i] - run.v[i] > 1.5) cause = "speed";
      if (cause) causeAt = i * STEP;
    }
    return { dt, window: { from: from * STEP, to: (from + w) * STEP, loss: +best.toFixed(3) }, cause, causeAt, total: n ? dt[n - 1] : 0 };
  }

  /** Pure: the time this run lost (positive) over a window of the grid, vs the reference. */
  const lossIn = (ref, run, win) => {
    const a = win.from / STEP, b = Math.min(win.to / STEP, ref.t.length - 1, run.t.length - 1);
    return b > a ? +((run.t[b] - ref.t[b]) - (run.t[a] - ref.t[a])).toFixed(3) : 0;
  };

  /** Pure: a pick's medal. at = metres into the run, cause = a CAUSES id. */
  function judge(analysis, at, cause) {
    const w = analysis.window, off = at < w.from ? w.from - at : at > w.to ? at - w.to : 0;
    if (!(w.loss > 0) || off > NEAR) return { medal: null, near: false, causeOk: false };
    const causeOk = !!analysis.cause && cause === analysis.cause;
    return { medal: causeOk ? "silver" : "bronze", near: true, causeOk };
  }

  /** The medal rule (#6559 §1a: a function). A FIX IT run that wins back 60 % of a solved silver window is gold;
   *  any other run earns its medal on the card, from pick(). */
  function medals(r) {
    if (r.fix && r.fix.silver && r.fix.faster && r.fix.frac >= FIX && r.clean) return "gold";
    return r.pickMedal || null;
  }

  const secs = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);

  function score(G, last, acc) {
    const clean = !!last.clean, reason = last.reason || "";
    const run = acc.t ? { t: acc.t, v: acc.v, b: acc.b, th: acc.th } : null;
    const seconds = +(last.seconds || 0).toFixed(2);
    if (!S.ref) {
      if (clean && run && run.t.length > WIN / STEP) S.ref = { ...run, seconds };
      return {
        value: 0, unit: "s", better: "high", clean, reason,
        metrics: [["Reference", seconds.toFixed(2), "s"], ["Samples", String(run ? run.t.length : 0), "every 5 m"], ["Run", clean ? "clean" : reason, ""]],
        verdict: S.ref ? "Reference recorded. RETRY and drive it again: the card then shows where the second run lost time."
          : "The reference must be clean: " + (reason || "too short") + ". RETRY.",
      };
    }
    const a = run ? analyze(S.ref, run) : null;
    // A FIX IT run counts only when it is clean: a crash short of the solved window would read as all of it won back.
    const fix = S.solved && run && clean ? (() => {
      const now = lossIn(S.ref, run, S.solved.window);
      const won = +(S.solved.window.loss - now).toFixed(3);
      // ...and the whole run beats the solved one: a window won back while losing more elsewhere is no fix.
      return { won, frac: S.solved.window.loss > 0 ? won / S.solved.window.loss : 0, silver: S.solved.medal === "silver", faster: !!a && a.total < S.solved.total };
    })() : null;
    const value = fix && fix.won > 0 && fix.faster ? fix.won : 0;
    const metrics = [
      ["Run vs reference", secs(a ? a.total : 0), "s"],
      ["Worst 100 m", a ? a.window.loss.toFixed(2) + " s · " + a.window.from + "–" + a.window.to : "—", a ? "m" : ""],
      ["Reference", S.ref.seconds.toFixed(2), "s"],
      ["This run", seconds.toFixed(2), "s"],
    ];
    if (fix) metrics.push(["FIX IT", (fix.won >= 0 ? "won back " : "lost ") + Math.abs(fix.won).toFixed(2) + " s · " + Math.round(100 * fix.frac), "%"]);
    metrics.push(["Run", clean ? "clean" : reason, ""]);
    const verdict = !clean ? "The run ended: " + reason + ". RETRY to compare a full sector."
      : fix && fix.frac >= FIX && fix.silver && fix.faster ? "Case closed: you won back " + Math.round(100 * fix.frac) + " % of the time at " + S.solved.window.from + " m."
      : !a || a.window.loss < 0.02 ? "No time lost anywhere against the reference: the traces overlap. Try a different line, then compare."
      : "You lost " + secs(a.total) + " s. Scrub the chart to the corner where the gap grows fastest, name the cause, tap THIS CORNER.";
    S.pending = a && clean ? { a } : null;
    return { value, unit: "s", better: "high", clean, reason, metrics: metrics.slice(0, 6), verdict, analysis: a, fix };
  }

  /** THIS CORNER (the card, or a test): judge the pick on the last result, upgrade its medal, save, and remember the
   *  solved window for the FIX IT run. The result object is the host's own (G.drills().lastResult()). */
  function pick(G, at, cause) {
    const host = G.drills && G.drills(), r = host && host.lastResult();
    if (!r || r.id !== "telemetry" || !r.analysis || !r.clean) return null;
    const j = judge(r.analysis, at, cause);
    r.pick = { at, cause };
    if (j.medal && (!r.medal || r.medal === "bronze")) {
      r.pickMedal = j.medal;
      r.medal = medals(r) || j.medal;
      r.value = Math.max(r.value, r.analysis.window.loss);
      if (!S.solved || j.medal === "silver" || S.solved.medal !== "silver") S.solved = { window: r.analysis.window, medal: j.medal, total: r.analysis.total };
      DrillCard.record(G.store, "telemetry|" + (r.variant || "classic"), r);
    }
    const found = label(r.analysis.cause);
    r.verdict = !j.near ? "Not there: the gap grows fastest " + r.analysis.window.from + "–" + r.analysis.window.to + " m. Scrub again."
      : (j.causeOk ? "Right corner, right cause: " + found + "." : "Right corner. The trace says " + found + ": compare the lanes.")
        + " You found " + r.analysis.window.loss.toFixed(2) + " s of your " + secs(r.analysis.total) + " s. RETRY is your FIX IT run.";
    if (typeof document !== "undefined") {
      const m = document.getElementById("drill-card-medal"), v = document.getElementById("drill-card-verdict");
      if (m) { m.dataset.medal = r.medal || "none"; m.textContent = (r.medal ? r.medal.toUpperCase() : "NO MEDAL") + " · " + r.value.toFixed(2) + " s located"; }
      if (v) v.textContent = r.verdict;
    }
    return { medal: r.medal, ...j };
  }

  function begin(G) {
    const track = G.track, player = G.player, sectors = track && track.def.sectors;
    if (!player || !sectors || !sectors.length || G.state !== "count") return false;
    const s = G.wrapS(sectors[0] * track.total + LEAD);
    player.s = player._prevS = player.prog = player.rPrevS = s;
    player.lap = 1;
    player.x = player.xVis = player.rPrevX = TrackLine.at(track, s).x;
    player.speed = G.vTop() * 0.9;
    player.gear = 7;
    RealRace.seatOnRoad(track, player);
    if (!G.goRolling()) return false;
    G.sectorIdx = 1;   // the run's sector, LEAD m past the S1 line: the sector goal then ends at the S2 line, not now
    G.snapGameCam();
    G.coach.setPracticeGoal("sector");
    return G.coach.mark();
  }

  /** The scrub panel on the result card: delta-by-distance with the speed, brake and throttle lanes of both runs,
   *  a cursor (drag, or ←/→), the cause chips and THIS CORNER (Enter). Render-only; pick() judges. */
  function buildPanel(G, a) {
    const root = document.createElement("div");
    root.id = "learn-telemetry-scrub";
    const chart = document.createElement("canvas");
    chart.width = 400; chart.height = 150;
    chart.tabIndex = 0;
    chart.setAttribute("role", "slider");
    chart.setAttribute("aria-label", "Distance cursor");
    const ctx = chart.getContext && chart.getContext("2d");
    const read = document.createElement("span");
    read.setAttribute("role", "status");
    const chips = document.createElement("div");
    let at = 0, cause = null;
    const ref = S.ref, n = a.dt.length, maxM = (n - 1) * STEP;
    const lo = Math.min(0, ...a.dt), hi = Math.max(0.05, ...a.dt);
    function paint() {
      const i = Math.min(n - 1, Math.round(at / STEP));
      read.textContent = "at " + at + " m: Δ " + secs(a.dt[i]) + " s · ref " + ref.v[i].toFixed(0) + " m/s, brake " + ref.b[i].toFixed(1)
        + ", throttle " + ref.th[i].toFixed(1);
      chart.setAttribute("aria-valuenow", String(at));
      if (!ctx) return;
      const W = chart.width, H = chart.height, x = k => (k / Math.max(1, n - 1)) * W;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,180,0,.18)";
      ctx.fillRect(x(a.window.from / STEP), 0, x(WIN / STEP), H);
      const lane = (arr, top, h, color) => {
        ctx.strokeStyle = color; ctx.beginPath();
        for (let k = 0; k < n; k++) { const y = top + h - Math.max(0, Math.min(1, arr[k])) * h; k ? ctx.lineTo(x(k), y) : ctx.moveTo(x(k), y); }
        ctx.stroke();
      };
      ctx.lineWidth = 2;
      lane(a.dt.map(v => (v - lo) / (hi - lo)), 0, 60, "#ffffff");
      ctx.lineWidth = 1;
      const vMax = Math.max(...ref.v);
      lane(ref.v.map(v => v / vMax), 64, 30, "rgba(0,220,255,.8)");
      lane(ref.b, 98, 22, "rgba(255,80,80,.8)");
      lane(ref.th, 124, 22, "rgba(80,255,120,.8)");
      ctx.strokeStyle = "#ffcc00"; ctx.beginPath(); ctx.moveTo(x(at / STEP), 0); ctx.lineTo(x(at / STEP), H); ctx.stroke();
    }
    const move = clientX => {
      const box = chart.getBoundingClientRect ? chart.getBoundingClientRect() : { left: 0, width: chart.width };
      at = Math.max(0, Math.min(maxM, Math.round(((clientX - box.left) / Math.max(1, box.width)) * maxM / STEP) * STEP));
      paint();
    };
    chart.addEventListener("pointerdown", e => { chart.setPointerCapture && chart.setPointerCapture(e.pointerId); move(e.clientX); });
    chart.addEventListener("pointermove", e => { if (e.buttons) move(e.clientX); });
    chart.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); at = Math.max(0, Math.min(maxM, at + (e.key === "ArrowLeft" ? -STEP : STEP) * 4)); paint(); }
      else if (e.key === "Enter") { e.preventDefault(); go.click(); }
    });
    const chipEls = CAUSES.map(c => {
      const b = document.createElement("button");
      b.type = "button"; b.id = "learn-telemetry-" + c.id; b.textContent = c.label;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => { cause = c.id; for (const el of chipEls) el.setAttribute("aria-pressed", String(el === b)); });
      return b;
    });
    const go = document.createElement("button");
    go.type = "button"; go.id = "learn-telemetry-pick"; go.textContent = "THIS CORNER";
    go.addEventListener("click", () => { pick(G, at, cause); });
    chips.append(...chipEls, go);
    root.append(chart, read, chips);
    paint();
    return root;
  }

  /** Live: Δ vs the reference at this distance, while the run is on. Render-only; the card gets the scrub panel. */
  function guide(G) {
    S = { ref: null, solved: null, panel: null, pending: null };
    const root = document.createElement("div");
    root.id = "learn-telemetry-guide";
    root.hidden = true;
    const task = document.createElement("strong");
    task.setAttribute("role", "status");
    const readout = document.createElement("span");
    root.append(task, readout);
    document.body.append(root);
    let next = 0;
    function draw() {
      if (S.pending && typeof document !== "undefined") {
        const card = document.getElementById("drill-card");
        if (card) { if (S.panel) S.panel.remove(); S.panel = buildPanel(G, S.pending.a); card.insertBefore(S.panel, document.getElementById("drill-card-actions")); S.pending = null; }
      }
      if (G.state !== "race") { root.hidden = true; return false; }
      const now = typeof performance !== "undefined" ? performance.now() : 0;
      if (now < next) return false;
      next = now + 100;   // 10 Hz
      root.hidden = false;
      const host = G.drills(), st = host.state(), live = host.active(), acc = live && live.run && live.run.acc, p = G.player;
      task.textContent = !S.ref ? "Run 1: set the reference through the Lesmos" : S.solved ? "FIX IT: win the time back at " + S.solved.window.from + " m" : "Run " + ((st && st.attempt) + 1) + ": beat your reference";
      const i = S.ref && acc && acc.t && p ? acc.t.length - 1 : -1;
      readout.textContent = i >= 0 && i < S.ref.t.length ? i * STEP + " m · Δ " + secs(acc.t[i] - S.ref.t[i]) + " s · ref " + S.ref.v[i].toFixed(0) + " m/s, you " + p.speed.toFixed(0) : "";
      return false;
    }
    return { draw, car: () => null, hide() { root.hidden = true; }, remove() { root.remove(); if (S.panel) S.panel.remove(); S.pending = null; } };
  }

  function define() {
    if (typeof DrillRegistry === "undefined") return null;
    return DrillRegistry.define({
      id: "telemetry", lesson: "telemetry", title: "Monza Telemetry Detective",
      setup: { flow: "gp", session: "tt", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "off" },
      begin, guide, goal: "sector", sample, score, medals,
    });
  }
  define();

  return Object.freeze({ define, sample, analyze, lossIn, judge, medals, score, pick, CAUSES, STEP, WIN, NEAR, FIX, LOOK });
})();
