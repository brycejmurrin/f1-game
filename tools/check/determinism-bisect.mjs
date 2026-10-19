#!/usr/bin/env node
// @doc First-divergent-step finder: compare two per-step game-vm state traces (seeds or builds).
// @skill agent-view
//
// Pairs with the opt-in createGame({ stepTrace: true }) / APEX_STEP_TRACE=1 trace
// in tools/lib/game-vm.cjs (#2963). A breakpoint shows one step; a determinism
// red is a difference between two runs — this names the first step and fields.
//
//   node tools/check/determinism-bisect.mjs                     # seed 42 twice
//   node tools/check/determinism-bisect.mjs --seed-a 42 --seed-b 7 --steps 60
//   node tools/check/determinism-bisect.mjs --trace-a a.json --trace-b b.json
//   node tools/check/determinism-bisect.mjs --json               # machine result
//
// Exit 0 when traces match (or when --seed-a/--seed-b are meant to diverge and
// a divergence is found with --expect-diverge). Exit 1 on an unexpected mismatch.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { createGame, captureStepState } = require("../lib/game-vm.cjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Stable JSON for hashing — sorted object keys, finite numbers only. */
export function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}

export function hashState(state) {
  const body = { player: state.player, field: state.field, rng: state.rng, timers: state.timers };
  return createHash("sha1").update(stableStringify(body)).digest("hex");
}

/** Flatten a step state into comparable leaf paths → values. */
export function flattenState(state, prefix = "") {
  const out = {};
  const walk = (v, p) => {
    if (v === null || typeof v !== "object") {
      out[p] = v;
      return;
    }
    if (Array.isArray(v)) {
      out[p + ".length"] = v.length;
      v.forEach((x, i) => walk(x, p + "[" + i + "]"));
      return;
    }
    for (const k of Object.keys(v).sort()) walk(v[k], p ? p + "." + k : k);
  };
  walk({ player: state.player, field: state.field, rng: state.rng, timers: state.timers }, prefix);
  return out;
}

/**
 * Compare two step-trace arrays. Returns null when identical, else
 * { step, fields: string[], a, b, hashA, hashB }.
 */
export function findFirstDivergence(traceA, traceB) {
  const n = Math.min(traceA.length, traceB.length);
  for (let i = 0; i < n; i++) {
    const a = traceA[i], b = traceB[i];
    const ha = hashState(a), hb = hashState(b);
    if (ha === hb) continue;
    const fa = flattenState(a), fb = flattenState(b);
    const fields = [];
    for (const k of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
      if (fa[k] !== fb[k]) fields.push(k);
    }
    return { step: a.step != null ? a.step : i, fields, a, b, hashA: ha, hashB: hb };
  }
  if (traceA.length !== traceB.length) {
    return {
      step: n,
      fields: ["trace.length"],
      a: { length: traceA.length },
      b: { length: traceB.length },
      hashA: null,
      hashB: null,
    };
  }
  return null;
}

/**
 * Boot game-vm, reset to seed, step `steps` times with optional per-tick inject.
 * inject(stepIndex, handle) runs AFTER each tick's snapshot (affects later steps).
 * injectBefore(stepIndex, handle) runs BEFORE the tick (affects that step's snapshot).
 */
export async function runStepTrace({
  track = "monza",
  seed = 42,
  steps = 30,
  dt = 1 / 60,
  input = { throttle: true, steer: 0.05 },
  inject = null,
  injectBefore = null,
  game = null,
} = {}) {
  const owned = !game;
  const g = game || await createGame({ track, stepTrace: true });
  try {
    if (owned) await g.race(track);
    const A = g.apex;
    A.headless(true);
    A.reset(0.02, 55, 0, seed);
    A.setInput(input);
    g.clearStepTrace();
    for (let i = 0; i < steps; i++) {
      if (typeof injectBefore === "function") injectBefore(i, g);
      g.step(1, dt);
      if (typeof inject === "function") inject(i, g);
    }
    A.clearInput();
    A.headless(false);
    return g.stepTrace.slice();
  } finally {
    if (owned) g.close();
  }
}

function parseArgs(argv) {
  const out = {
    track: "monza",
    seedA: 42,
    seedB: 42,
    steps: 60,
    json: false,
    expectDiverge: false,
    traceA: null,
    traceB: null,
    writeA: null,
    writeB: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v == null) throw new Error("missing value for " + a);
      return v;
    };
    if (a === "--track") out.track = next();
    else if (a === "--seed" || a === "--seed-a") out.seedA = +next();
    else if (a === "--seed-b") out.seedB = +next();
    else if (a === "--steps") out.steps = +next();
    else if (a === "--json") out.json = true;
    else if (a === "--expect-diverge") out.expectDiverge = true;
    else if (a === "--trace-a") out.traceA = next();
    else if (a === "--trace-b") out.traceB = next();
    else if (a === "--write-a") out.writeA = next();
    else if (a === "--write-b") out.writeB = next();
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error("unknown arg: " + a);
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node tools/check/determinism-bisect.mjs [options]
  --track <id>          circuit (default monza)
  --seed / --seed-a <n> left seed (default 42)
  --seed-b <n>          right seed (default same as seed-a)
  --steps <n>           physics ticks to record (default 60)
  --trace-a <file>      load left trace JSON instead of running
  --trace-b <file>      load right trace JSON instead of running
  --write-a / --write-b save run traces as JSON
  --expect-diverge      exit 0 when a divergence is found
  --json                print {ok, diverge, ...}`);
    return;
  }

  let traceA, traceB;
  if (opts.traceA || opts.traceB) {
    if (!opts.traceA || !opts.traceB) throw new Error("--trace-a and --trace-b must be used together");
    traceA = JSON.parse(fs.readFileSync(opts.traceA, "utf8"));
    traceB = JSON.parse(fs.readFileSync(opts.traceB, "utf8"));
  } else {
    const g = await createGame({ track: opts.track, stepTrace: true });
    try {
      await g.race(opts.track);
      traceA = await runStepTrace({ track: opts.track, seed: opts.seedA, steps: opts.steps, game: g });
      traceB = await runStepTrace({ track: opts.track, seed: opts.seedB, steps: opts.steps, game: g });
    } finally {
      g.close();
    }
  }
  if (opts.writeA) fs.writeFileSync(opts.writeA, JSON.stringify(traceA));
  if (opts.writeB) fs.writeFileSync(opts.writeB, JSON.stringify(traceB));

  const diverge = findFirstDivergence(traceA, traceB);
  const ok = opts.expectDiverge ? !!diverge : !diverge;
  const result = {
    ok,
    diverge: diverge
      ? { step: diverge.step, fields: diverge.fields, hashA: diverge.hashA, hashB: diverge.hashB }
      : null,
    stepsA: traceA.length,
    stepsB: traceB.length,
    seedA: opts.seedA,
    seedB: opts.seedB,
    track: opts.track,
  };
  if (opts.json) {
    console.log(JSON.stringify(result));
  } else if (diverge) {
    console.log(`first divergence at step ${diverge.step}`);
    console.log(`fields (${diverge.fields.length}): ${diverge.fields.slice(0, 40).join(", ")}${diverge.fields.length > 40 ? " …" : ""}`);
  } else {
    console.log(`match: ${traceA.length} steps identical`);
  }
  process.exit(ok ? 0 : 1);
}

export { captureStepState, ROOT };

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((e) => {
    console.error("FAIL:", e && e.stack || e);
    process.exit(1);
  });
}
