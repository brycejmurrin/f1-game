/* Apex 26 — Scopes: WHEN a lifecycle transition clears what (#6920 U2.1, #6949).
 *
 * WHY. Each race transition in game.js used to carry its own hand-written reset
 * list, and the lists differ ON PURPOSE: endRace clears race control only (a full
 * clear at the chequered flag would sweep the debris and hand IncidentSim's
 * takeovers back), a red-flag restart never resets race control (the flag machine
 * continues through raceCtl.rewound()), and a mid-quali quit hands takeovers back
 * BEFORE the field swap. Here a module registers its clear once, with the
 * transitions (`why`s) it answers, and each site names its transition.
 *
 *   Scopes.register(scope, { id, exit(ctx), enter(ctx), snapshot(), after:[ids],
 *                            touches:[keys], on:[whys], enterOn:[whys], phase })
 *   Scopes.exit(scope, ctx)    → every matching registrant's exit(), in `after` order
 *   Scopes.enter(scope, ctx)   → the exits, then every matching enter()
 *   Scopes.snapshot(scope)     → { id: snapshot() } for registrants that have one
 *
 * ctx.why is one of WHYS. A registrant runs only for the whys in its `on` list
 * (its enter() for `enterOn`, default `on`) and only when ctx.phase equals its
 * own `phase` (both absent by default): a phase is a second point inside one
 * transition, e.g. the red-flag pass-watch clear that must follow the re-grid.
 *
 * ORDER. Registrants run in topological `after` order, registration order
 * breaking ties. An `after` id must already be registered in that scope (an
 * unknown id throws at register), so a cycle cannot form except by re-registering
 * an id, which re-checks and throws too. Exits must be idempotent: a transition
 * may run twice (resetEpisodeOwners from an agent loop), and the bus keeps no
 * "already exited" state of its own.
 *
 * ERRORS. A throwing registrant is logged (Log.warn("scopes", id, e)), the rest
 * still run, and the FIRST error is rethrown once all have run — startRace's
 * caller must still see the rejection (tests/unit/start-race-latch.test.mjs
 * replaces DebrisWorld.reset with a throwing stub).
 *
 * OVERLAP. Two registrants of one scope that name the same `touches` key with no
 * `after` between them race on that state: a dev Log.warn fires once per pair.
 *
 * Scopes says WHEN; SimState (js/core/sim-state.js, #6860 decision B) says WHAT
 * the sim state is. A registrant calls its module's own reset; it never keeps a
 * second list of sim state. Registrants look modules up at CALL time
 * (`exit: () => DebrisWorld.reset()`), never a captured reference, so a test stub
 * of the module is honoured. Nothing here is read by the physics step.
 */
"use strict";
const Scopes = (function () {
  const SCOPES = ["circuit", "race", "session", "camera-mode", "audio-context"];
  const WHYS = ["start", "restart-red", "restart-declined", "finish", "quit", "episode"];
  const regs = {};   // scope → [{ id, exit, enter, snapshot, after, touches, on, enterOn, phase, seq }]
  for (const s of SCOPES) regs[s] = [];
  const warned = new Set();
  let seq = 0;

  function list(scope) {
    const l = regs[scope];
    if (!l) throw new Error("Scopes: unknown scope " + JSON.stringify(scope));
    return l;
  }
  function whys(v, what, id) {
    const a = v == null ? [] : Array.isArray(v) ? v.slice() : [v];
    for (const w of a) if (WHYS.indexOf(w) < 0) throw new Error("Scopes.register(" + id + "): unknown " + what + " why " + JSON.stringify(w));
    return Object.freeze(a);
  }
  // Kahn over `after` edges; ties go to registration order. Throws on a cycle.
  function sorted(l) {
    const out = [], done = new Set(), byId = new Map(l.map((r) => [r.id, r]));
    const pending = l.slice().sort((a, b) => a.seq - b.seq);
    while (pending.length) {
      const i = pending.findIndex((r) => r.after.every((d) => done.has(d) || !byId.has(d)));
      if (i < 0) throw new Error("Scopes: `after` cycle among " + pending.map((r) => r.id).join(", "));
      const r = pending.splice(i, 1)[0];
      out.push(r); done.add(r.id);
    }
    return out;
  }

  function register(scope, spec) {
    const l = list(scope);
    const id = spec && spec.id;
    if (typeof id !== "string" || !id) throw new Error("Scopes.register(" + scope + "): an id is required");
    const r = {
      id,
      exit: typeof spec.exit === "function" ? spec.exit : null,
      enter: typeof spec.enter === "function" ? spec.enter : null,
      snapshot: typeof spec.snapshot === "function" ? spec.snapshot : null,
      after: Object.freeze((spec.after || []).slice()),
      touches: Object.freeze((spec.touches || []).slice()),
      on: whys(spec.on, "on", id),
      enterOn: null,
      phase: spec.phase == null ? null : String(spec.phase),
      seq: 0,
    };
    r.enterOn = spec.enterOn == null ? r.on : whys(spec.enterOn, "enterOn", id);
    const others = l.filter((o) => o.id !== id);
    for (const d of r.after) {
      if (d === id || !others.some((o) => o.id === d)) throw new Error("Scopes.register(" + scope + "/" + id + "): unknown `after` id " + JSON.stringify(d));
    }
    const at = l.findIndex((o) => o.id === id);
    r.seq = at >= 0 ? l[at].seq : seq++;
    const next = others.concat([r]);
    const ord = sorted(next);   // throws on a cycle before anything is replaced
    l.length = 0; for (const o of ord) l.push(o);
    // Overlap: a shared `touches` key with no `after` edge either way.
    for (const o of others) {
      if (o.after.indexOf(id) >= 0 || r.after.indexOf(o.id) >= 0) continue;
      const k = r.touches.find((t) => o.touches.indexOf(t) >= 0);
      if (k === undefined) continue;
      const pair = scope + ":" + [o.id, id].sort().join("|");
      if (warned.has(pair)) continue;
      warned.add(pair);
      if (typeof Log !== "undefined") Log.warn("scopes", "overlap: " + o.id + " and " + id + " both touch " + JSON.stringify(k) + " with no `after` between them (" + scope + ")");
    }
    return id;
  }

  function matches(r, ctx, key) {
    return r[key].indexOf(ctx.why) >= 0 && r.phase === (ctx.phase == null ? null : String(ctx.phase));
  }
  function check(ctx) {
    if (!ctx || WHYS.indexOf(ctx.why) < 0) throw new Error("Scopes: ctx.why must be one of " + WHYS.join(", ") + " (got " + JSON.stringify(ctx && ctx.why) + ")");
  }
  function run(l, ctx, key, fn, err) {
    for (const r of l) {
      if (!r[fn] || !matches(r, ctx, key)) continue;
      try { r[fn](ctx); } catch (e) {
        if (typeof Log !== "undefined") Log.warn("scopes", r.id, e);
        if (!err.e) err.e = e;
      }
    }
  }
  function exit(scope, ctx) {
    const l = list(scope); check(ctx);
    const err = {};
    run(l, ctx, "on", "exit", err);
    if (err.e) throw err.e;
  }
  function enter(scope, ctx) {
    const l = list(scope); check(ctx);
    const err = {};
    run(l, ctx, "on", "exit", err);
    run(l, ctx, "enterOn", "enter", err);
    if (err.e) throw err.e;
  }
  function snapshot(scope) {
    const out = {};
    for (const r of list(scope)) if (r.snapshot) out[r.id] = r.snapshot();
    return out;
  }
  // Read-only view for tests and __apex: ids in run order, with their filters.
  function ids(scope) { return list(scope).map((r) => r.id); }
  function describe(scope) {
    return list(scope).map((r) => ({ id: r.id, on: r.on.slice(), enterOn: r.enterOn.slice(), phase: r.phase,
      after: r.after.slice(), touches: r.touches.slice() }));
  }

  return { SCOPES: Object.freeze(SCOPES.slice()), WHYS: Object.freeze(WHYS.slice()),
    register, exit, enter, snapshot, ids, describe };
})();
Object.freeze(Scopes);
