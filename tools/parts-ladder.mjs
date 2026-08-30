#!/usr/bin/env node
// Is a catalog option ever worth buying? Offline, no browser.
//
// AUTHOR-TIME + guard. tests/unit/parts-ladder.test.mjs imports liveSet()/
// dominated()/LADDER from here.
//
// tools/parts-sweep.mjs answers "does this option LOOK different". This answers
// the other half: "would anyone ever PICK it". They are independent failures —
// an option can be unmistakable on track and still be a row no rational player
// clicks, because something cheaper is better on every axis a player could care
// about. Measured on the shipped catalog, 66 of the 177 rows a team sees were
// never optimal under ANY preference at ANY price.
//
// THE MODEL. A build is chosen under some taste (how much you value speed vs
// accel vs cornering vs braking) and some budget pressure (how many credits a
// point of stat is worth to you). Stats are MULTIPLIERS that compound across
// twelve categories, so value is additive in their LOGS, and an option is LIVE
// when it maximises
//
//     sum_i w_i * log(stat_i)  -  lambda * cost
//
// for at least one positive weight vector w and one price lambda. That is the
// upper convex hull of the (cost, log-stat) set: everything strictly inside it
// is a row that some cheaper-or-equal option beats on every axis you might
// weigh. No threshold to tune and nothing to calibrate — an option is either on
// the hull or it is not.
//
// lambda needs no sweep and no range. Fix a weight vector and the value of every
// option collapses to one number v_i = w.L_i, and "wins for SOME lambda > 0" is
// exactly "is a vertex of the upper convex hull of the 2-D points (cost, v)" —
// lambda->0 picks the highest v, lambda->infinity the cheapest, and every vertex
// between them wins on its own interval. So one monotone-chain hull per weight
// vector answers ALL prices at once, exactly. Sampling lambda instead (this tool
// did, at 240 steps over a derived range) is both slower and only as complete as
// the grid.
//
// WHAT THE ANSWER LOOKS LIKE. Dead rows are almost never a single mispriced
// option; they are a price curve that CONVEXES. If each rung up a category buys
// more stat per credit than the rung below it, the whole middle of the ladder
// sits under the chord from the cheap end to the dear end and nothing between
// them is ever worth buying. Diminishing returns — every rung dearer per point
// than the one below — is what puts a row on the hull, and it is the fix that
// costs the physics nothing, because `cost` is economy-only.
//
//   node tools/parts-ladder.mjs                  every category
//   node tools/parts-ladder.mjs --cats=wheels    a subset
//   node tools/parts-ladder.mjs --team=mclaren   one team's visible rows
//   node tools/parts-ladder.mjs --verbose        name every dead row
//   node tools/parts-ladder.mjs --json
//
// Exits non-zero when a PAID option is strictly dominated by a cheaper one —
// that is a trap a player can only fall into, and it is never intended.
import { loadParts } from "./parts-sweep.mjs";

export const LADDER = Object.freeze({
  SAMPLES: 20000,        // weight vectors per category; lambda is exact, not sampled
});

const STATS = ["speed", "accel", "cornering", "braking"];
const statOf = (opt, k) => (opt && opt[k] !== undefined ? opt[k] : 1);
// log, so twelve multiplied categories are twelve added terms.
const logs = (opt) => STATS.map((k) => Math.log(statOf(opt, k)));

// Strict domination: cheaper (or equal) AND at least as good on every stat,
// better on at least one. This is the part that needs no model at all — if it
// fires, the option is indefensible under any taste whatsoever.
export function dominated(options) {
  const out = [];
  for (const a of options) {
    for (const b of options) {
      if (a === b) continue;
      const ca = a.cost || 0, cb = b.cost || 0;
      if (cb > ca) continue;
      let better = cb < ca, worse = false;
      for (const k of STATS) {
        const va = statOf(a, k), vb = statOf(b, k);
        if (vb > va) better = true;
        if (vb < va) { worse = true; break; }
      }
      if (!worse && better) { out.push({ dead: a, by: b }); break; }
    }
  }
  return out;
}

// The options that maximise value for SOME taste and SOME price.
export function liveSet(options, samples) {
  const rows = options.map((o) => ({ o, c: o.cost || 0, L: logs(o) }));
  if (rows.length < 2) return new Set(rows.map((r) => r.o.id));
  // Cost order is fixed across every weight vector, so sort ONCE. Ties broken
  // later by value, which is the only part that moves.
  rows.sort((a, b) => a.c - b.c);
  const live = new Set();
  // Deterministic weights: a fixed low-discrepancy sweep rather than Math.random,
  // so two runs of this tool are comparable and a guard test cannot flake.
  const golden = 0.6180339887498949;
  const w = new Array(STATS.length);
  const v = new Array(rows.length);
  const stack = new Array(rows.length);
  const N = samples || LADDER.SAMPLES;
  for (let s = 0; s < N; s++) {
    let sum = 0;
    for (let i = 0; i < STATS.length; i++) {
      // Kronecker sequence per axis, offset so no axis repeats another's order.
      const t = ((s + 1) * golden * (i + 1) * 1.7137) % 1;
      w[i] = t * t + 1e-6;             // squared, to reach near-single-axis tastes
      sum += w[i];
    }
    for (let i = 0; i < STATS.length; i++) w[i] /= sum;
    for (let i = 0; i < rows.length; i++) {
      let x = 0;
      for (let k = 0; k < STATS.length; k++) x += w[k] * rows[i].L[k];
      v[i] = x;
    }
    // Upper hull over (cost, value), monotone chain in one pass. A point joins
    // only if it is dearer AND better than the last kept one (otherwise some
    // cheaper row already beats it at every lambda), and the chain's slopes must
    // strictly decrease — a point on or under the chord between its neighbours
    // is never optimal at any price.
    let top = 0;
    for (let i = 0; i < rows.length; i++) {
      if (top > 0 && v[i] <= v[stack[top - 1]] + 1e-12) continue;     // dearer, no better
      while (top > 0 && rows[i].c === rows[stack[top - 1]].c) top--;  // same price, better
      while (top > 1) {
        const a = stack[top - 2], b = stack[top - 1];
        const cross = (rows[b].c - rows[a].c) * (v[i] - v[a]) -
                      (rows[i].c - rows[a].c) * (v[b] - v[a]);
        if (cross >= -1e-15) top--; else break;
      }
      stack[top++] = i;
    }
    for (let i = 0; i < top; i++) live.add(rows[stack[i]].o.id);
  }
  return live;
}

// One team's visible rows, with exact cost-and-stat clones collapsed: a
// SIGNATURE is a reskin of its equivalent, so counting both as separate dead
// rows would double-count a design that is working as intended.
export function visibleRows(Parts, cat, team) {
  const seen = new Map();
  for (const opt of cat.options) {
    if (team && !Parts.isOptionAvailable(opt, team)) continue;
    const sig = (opt.cost || 0) + "|" + STATS.map((k) => statOf(opt, k)).join(",");
    if (!seen.has(sig)) seen.set(sig, opt);
  }
  return [...seen.values()];
}

export function sweepLadder({ M, cats, teamId } = {}) {
  const mods = M || loadParts();
  const team = teamId ? mods.Teams.LIST.find((t) => t.id === teamId) : null;
  const out = [];
  for (const cat of mods.Parts.CATALOG) {
    if (cats && !cats.includes(cat.id)) continue;
    const rows = visibleRows(mods.Parts, cat, team);
    const live = liveSet(rows);
    const dead = rows.filter((o) => !live.has(o.id));
    const traps = dominated(rows).filter(({ dead: d }) => (d.cost || 0) > 0);
    // Flat stat cells: a category that never moves an axis is one the player
    // cannot express a preference over.
    const flat = STATS.filter((k) => {
      const vs = rows.map((o) => statOf(o, k));
      return Math.max(...vs) - Math.min(...vs) < 1e-9;
    });
    out.push({ cat: cat.id, shown: rows.length, live: live.size, dead, traps, flat });
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const has = (n) => args.includes("--" + n);
  const val = (n) => { const a = args.find((x) => x.startsWith("--" + n + "=")); return a && a.slice(n.length + 3); };
  const cats = (val("cats") || "").split(",").filter(Boolean);
  const teamId = val("team") || null;

  const rows = sweepLadder({ cats: cats.length ? cats : null, teamId });
  if (has("json")) { console.log(JSON.stringify(rows, null, 1)); return; }

  const F = (v, w) => String(v).padEnd(w);
  console.log(F("category", 12) + F("shown", 7) + F("live", 6) + F("dead", 6) +
              F("dead%", 7) + F("traps", 7) + "flat stats");
  let shown = 0, dead = 0, traps = 0;
  for (const r of rows) {
    shown += r.shown; dead += r.dead.length; traps += r.traps.length;
    console.log(F(r.cat, 12) + F(r.shown, 7) + F(r.live, 6) + F(r.dead.length, 6) +
      F((100 * r.dead.length / r.shown).toFixed(0) + "%", 7) +
      F(r.traps.length || "", 7) + (r.flat.join(",") || "-"));
    if (has("verbose")) {
      for (const d of r.dead)
        console.log("     dead  " + d.id.padEnd(24) + String(d.cost || 0).padStart(4) + "cr  " +
          STATS.map((k) => statOf(d, k).toFixed(2)).join(" "));
      for (const t of r.traps)
        console.log("     TRAP  " + t.dead.id + " (" + (t.dead.cost || 0) + "cr) is beaten on every " +
          "stat by " + t.by.id + " (" + (t.by.cost || 0) + "cr)");
    }
  }
  console.log("\n" + shown + " rows" + (teamId ? " visible to " + teamId : "") +
    " · " + dead + " never optimal (" + (100 * dead / shown).toFixed(1) + "%)" +
    " · " + traps + " paid traps");
  if (traps) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith("parts-ladder.mjs")) main();
