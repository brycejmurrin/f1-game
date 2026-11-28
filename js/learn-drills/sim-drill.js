/* Apex 26 — SimDrill: the runtime the strategy drills share (#6559 kind "sim", steps 16-17; design #6554 §0).
   A strategy drill is a DECISION game: the race is held, the player makes a call, and DrillFork (js/race/drill-fork.js)
   RUNS every option from the same saved world; the card shows what each call was worth. No number is invented: each
   one is a branch's own lap times. Bryce's decision 3 (#6559): the AI drives your car while you make the calls, so
   "your car" is the drill race's AI car and every call goes through the production pit API (DrillFork's decisions,
   the AI pit wall's own plan); the player's car waits parked on the run-off, because the session ends without it.
   THE LIVE RACE IS HELD the whole drill (G.agentCtl.freeze: the frame keeps rendering, physics never steps), so a
   branch's ticks are the only ticks: DrillFork's rule that the host holds live play while a job runs. Branches are
   time-sliced from a frame callback (SLICE_MS of sim per frame), never from inside G.update. sync(true) (tests)
   makes drain() run the queue in one call instead.
   panel() is the drill's one decision card: a top-centre status block plus two big thumb buttons at the bottom
   corners (64 px, inside the safe areas, #6554 §1.3); keys name each button. Read-only on the cars: a drill writes
   car state only in its own placement (begin() and the round staging that replays it from the captured base).
   THE ARC NEVER REACHES THE DRIVER: nothing here reads curvature or the racing line; the AI's own law drives.
   LAZY_LEARN; DrillFork is its own bundle (LAZY_DRILL_FORK), loaded here on the first sim drill. */
const SimDrill = (function () {
  "use strict";

  const PARK = Object.freeze({ steer: 0, throttle: false, brake: true });
  const PARK_X = 20;        // m: the player's car waits off the road, clear of the drill car's line
  const SLICE_MS = 8;       // sim wall time per frame: the phone stays responsive while a branch runs
  let syncMode = false;

  async function ensureFork() {
    if (typeof DrillFork !== "undefined") return true;
    if (typeof ScriptLoader === "undefined" || typeof ApexRoster === "undefined") return false;
    await ScriptLoader.create().load(ApexRoster.LAZY_DRILL_FORK, [], { strict: true }).catch(() => false);
    return typeof DrillFork !== "undefined";
  }
  const frame = (f) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(f) : setTimeout(f, 0));

  /** Placement (a begin()-time write): park the player, put `you` on `lap` with `wear` on its set, `beforePitM`
   *  metres short of the pit entry at speed. The fuel load follows the lap (fuelLap), the set dates from lap 1. */
  function place(G, you, o) {
    const L = G.track.total, p = G.player;
    p.x = p.xVis = p.rPrevX = PARK_X;
    p.speed = 0;
    const entry = (you.s + G.pits.toEntry(you)) % L, s = (((entry - o.beforePitM) % L) + L) % L;
    you.s = you._prevS = you.rPrevS = s;
    you.prog = (o.lap - 1) * L + s;
    you.lap = you.fuelLap = o.lap;
    you.tyreLap0 = 1;
    you.tyreWear = o.wear;
    you.x = you.xVis = you.rPrevX = TrackLine.at(G.track, s).x;
    you.speed = G.vTop() * (o.speedFrac || 0.8);
    you.gear = 7;
    RealRace.seatOnRoad(G.track, you);
  }

  /** The branch queue over one DrillFork. run(F, list, cb): list [{key, decisions, until, opts}], cb({key: job}). */
  function create(G) {
    let df = null, queue = [], pending = false;
    const exact = { exact: true };
    function pump() {
      pending = false;
      const q = queue[0];
      if (!q) return;
      if (df.step(q.job, SLICE_MS)) { queue.shift(); q.done(q.job); }
      if (queue.length) schedule();
    }
    function schedule() { if (!syncMode && !pending) { pending = true; frame(pump); } }
    function run(F, list, cb) {
      const out = {};
      let left = list.length;
      for (const b of list) {
        const job = df.branch(F, b.decisions, b.until, Object.assign({ input: PARK }, b.opts));
        queue.push({ job, done: (j) => { out[b.key] = j; if (--left === 0) cb(out); } });
      }
      schedule();
    }
    return {
      ready: async () => { if (!(await ensureFork())) return false; df = DrillFork.create(G); return true; },
      fork: () => df.fork(),
      run,
      busy: () => queue.length > 0,
      /** Tests and tools: run every queued branch now. */
      drain() { while (queue.length) { const q = queue[0]; df.run(q.job); queue.shift(); q.done(q.job); } },
      cancel() { const q = queue; queue = []; for (const x of q) df.cancel(x.job); },
      capture: () => G.coach.captureWorld(),
      restore: (w) => G.coach.restoreWorld(w, exact),
    };
  }

  // ── the decision card ──────────────────────────────────────────────────────
  let el = null, keyFn = null, shownText = "";
  const BTN = "position:fixed;bottom:calc(12px + env(safe-area-inset-bottom));min-width:132px;min-height:64px;padding:0 18px;" +
    "font:700 18px/1 system-ui,sans-serif;letter-spacing:.06em;border:2px solid #fff;border-radius:12px;color:#fff;pointer-events:auto;";
  function hide() {
    if (el) el.remove();
    el = null;
    if (keyFn && typeof removeEventListener === "function") removeEventListener("keydown", keyFn, true);
    keyFn = null;
  }
  /** spec: {title, lines: [string], buttons: [{label, key, side: "left"|"right", run}]} — replaces the card. */
  function panel(spec) {
    hide();
    if (typeof document === "undefined" || !document.body) return null;
    el = document.createElement("div");
    el.id = "sim-drill";
    shownText = [spec.title, ...(spec.lines || []), ...(spec.buttons || []).map((b) => b.label)].join("\n");
    el.setAttribute("role", "status");
    el.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:40;font:15px/1.35 system-ui,sans-serif;color:#fff;";
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;top:calc(8px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);" +
      "max-width:min(520px,calc(100vw - 32px));padding:10px 14px;background:rgba(10,14,22,.86);border-radius:12px;";
    const h = document.createElement("div");
    h.style.cssText = "font-weight:700;letter-spacing:.04em;margin-bottom:4px;";
    h.textContent = spec.title;
    box.appendChild(h);
    for (const line of spec.lines || []) { const d = document.createElement("div"); d.textContent = line; box.appendChild(d); }
    el.appendChild(box);
    const keys = {};
    for (const b of spec.buttons || []) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = b.label;
      btn.dataset.simKey = b.key;
      btn.style.cssText = BTN + (b.side === "left" ? "left:calc(16px + env(safe-area-inset-left));background:#b3261e;"
        : "right:calc(16px + env(safe-area-inset-right));background:#1d4f91;");
      btn.addEventListener("click", () => b.run());
      el.appendChild(btn);
      keys[b.key] = b.run;
    }
    document.body.appendChild(el);
    if (Object.keys(keys).length && typeof addEventListener === "function") {
      keyFn = (e) => {
        const f = keys[(e.key || "").toLowerCase()];
        if (!f || e.repeat) return;
        e.preventDefault();
        e.stopPropagation();
        f();
      };
      addEventListener("keydown", keyFn, true);
    }
    return el;
  }

  return Object.freeze({ create, place, panel, hide, PARK, shown: () => (el ? shownText : null), sync: (on) => { syncMode = !!on; return syncMode; } });
})();
