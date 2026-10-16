// episode-diff.mjs — WHICH per-car field broke seeded replay? Dump and diff.
// @doc Names the per-car field that broke seeded replay: replays a seed N times in the VM, diffs cold vs warm.
//
//   node tools/check/episode-diff.mjs                    # monza, seed 42, 3 episodes
//   node tools/check/episode-diff.mjs --track spa --seed 7
//   node tools/check/episode-diff.mjs --json             # {ok, digestsMatch, fields:[...]}
//
// WHY THIS EXISTS. "Same seed + same inputs => same result" has been broken four
// times, always by the same shape: a per-car field that reads like a per-tick
// output is actually carried across ticks, and it sits outside a clear list next
// to fields that are in it (the drivetrain; `_prevS`; then `accSm` and `lane` on
// 2026-09-08). tests/unit/determinism-replay-vm.test.mjs and the browser spec
// both tell you THAT replay broke. Neither tells you WHICH field, and that is
// the whole cost: on 2026-09-08 two sessions spent a day each on one instance,
// and three code-read hypotheses were measured wrong before anyone dumped the
// state (docs/notes/DEFECT-LEDGER.md §7).
//
// What finally worked, both times, was mechanical: snapshot every primitive on
// every car right after reset(), run the episode, reset again, and diff the two
// snapshots. The leak names itself — it is the field that is `undefined` on the
// cold pass and holds a value on the warm one. This is that procedure, so the
// ledger's advice ("on a determinism break, dump and diff FIRST") is a command
// rather than a suggestion.
//
// It reports fields whether or not the digests differ: a field that leaks
// without moving THIS scenario is still a leak, and the next controller change
// may be the one that makes it matter — which is exactly how `accSm` sat
// harmless until a new lateral controller changed which cars are beside each
// other on lap 1.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

// Every primitive on a car. Objects become a stable tag rather than being
// walked: the leaks of this class have all been numbers and booleans, and a
// deep walk would drown the diff in team/track back-references.
export function snapshot(cars) {
  return cars.map((c) => {
    const o = {};
    for (const k of Object.keys(c)) {
      const v = c[k], t = typeof v;
      if (v === null || t === "number" || t === "boolean" || t === "string") o[k] = v;
      else if (t === "undefined") o[k] = "<undefined>";
      else if (t === "object") o[k] = "<object>";
      else o[k] = "<" + t + ">";
    }
    return o;
  });
}

/**
 * Replay `episodes` episodes of one seed in the VM and diff the first two
 * post-reset snapshots. Returns every per-car field that differs between the
 * cold (episode 0) and warm (episode 1) snapshot — the "leaks by construction"
 * shape this file exists to name. `game`, when passed, is an already-booted
 * `createGame()` handle (a test suite's `before()`), so callers that need
 * several tracks don't each pay a fresh boot.
 *
 * @returns {Promise<{digestsMatch:boolean, rows:Array, fields:Array}>}
 */
export async function episodeLeaks({ track = "monza", seed = 42, episodes = 3, seconds = 4, game } = {}) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("seed must be a uint32 integer");
  if (!Number.isSafeInteger(episodes) || episodes < 2 || episodes > 100) throw new Error("episodes must be an integer in [2, 100]");
  if (!Number.isFinite(seconds) || seconds < 0.05 || seconds > 120) throw new Error("seconds must be in [0.05, 120]");
  if (typeof track !== "string" || !/^[a-z0-9_]+$/.test(track)) throw new Error("track must be a circuit id");
  const owned = !game;
  const g = game || await createGame({ track });
  try {
    if (owned) await g.race(track);
    const A = g.apex;
    const digests = [], snaps = [];

    for (let e = 0; e < episodes; e++) {
      A.headless(true);
      try {
      const reset = A.reset(0.02, 55, 0, seed);
      if (!reset || reset.ok === false || reset.error) throw new Error("Episode reset failed");
      // The snapshot is taken AFTER reset and BEFORE the first tick: that is the
      // state the episode starts from, and the only place the leak is visible
      // without being tangled up in the divergence it causes.
      if (!Array.isArray(g.G.cars) || !g.G.cars.length) throw new Error("Episode reset produced an empty field");
      if (snaps.length && g.G.cars.length !== snaps[0].length) throw new Error("Car count changed across episodes");
      snaps.push(snapshot(g.G.cars));
      const r = A.rollout({ seconds, input: { steer: 0.05, throttle: true } });
      const f = A.field({ detail: "full" });
      if (!r || r.ok === false || r.error || !r.ran || !Number.isSafeInteger(r.ran.ticks) || r.ran.ticks <= 0)
        throw new Error(`Rollout failed or ran zero ticks: ${JSON.stringify(r)}`);
      if (!Number.isFinite(r.distanceM) || !r.to || !Number.isFinite(r.to.frac) || !Number.isFinite(r.to.lap)
          || !r.speedKph || !["min", "max", "mean", "final"].every((k) => Number.isFinite(r.speedKph[k])))
        throw new Error("Rollout returned an incomplete or non-finite digest");
      if (!f || f.ok === false || f.error || !Array.isArray(f.positions) || f.positions.length !== g.G.cars.length
          || !f.positions.every((p) => typeof p.code === "string" && Number.isFinite(p.pace)))
        throw new Error("Field returned an incomplete or non-finite grid");
      digests.push(JSON.stringify({
        distanceM: r.distanceM, speed: r.speedKph, to: r.to,
        grid: f.positions.map((p) => p.code + ":" + p.pace).join(","),
      }));
      } finally { A.headless(false); }
    }

    const digestsMatch = digests.every((d) => d === digests[0]);
    // Episode 1 is the cold one — it creates the scratch. Comparing it with
    // episode 2 is what exposes the leak; later episodes agree with 2.
    const fields = [];
    for (let i = 0; i < snaps[0].length; i++) {
      const cold = snaps[0][i], warm = snaps[1][i];
      for (const k of new Set([...Object.keys(cold), ...Object.keys(warm)])) {
        if (JSON.stringify(cold[k]) !== JSON.stringify(warm[k])) {
          fields.push({ car: i, code: cold.code || warm.code || String(i), field: k,
                        cold: cold[k], warm: warm[k] });
        }
      }
    }
    // One row per FIELD for the human summary — 22 cars leaking the same field is
    // one defect, not 22.
    const byField = new Map();
    for (const f of fields) {
      const e = byField.get(f.field) || { field: f.field, cars: 0, example: f };
      e.cars++; byField.set(f.field, e);
    }
    const rows = [...byField.values()].sort((a, b) => b.cars - a.cars);
    return { digestsMatch, rows, fields, episodesChecked: snaps.length, carsChecked: snaps[0].length };
  } finally {
    if (owned) g.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (name, def) => {
    const i = argv.indexOf("--" + name);
    return i >= 0 && argv[i + 1] != null ? argv[i + 1] : def;
  };
  const has = (name) => argv.includes("--" + name);

  try {
  const allowed = new Set(["--track", "--seed", "--episodes", "--seconds", "--json", "--help"]);
  for (let i = 0; i < argv.length; i++) {
    if (!allowed.has(argv[i])) throw new Error(`Unknown option: ${argv[i]}`);
    if (!["--json", "--help"].includes(argv[i])) {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`${argv[i]} requires a value`);
      i++;
    }
  }
  if (has("help")) { console.log("Usage: episode-diff.mjs [--track id] [--seed uint32] [--episodes 2..100] [--seconds 0.05..120] [--json]"); process.exit(0); }
  const track = flag("track", "monza");
  const seed = Number(flag("seed", 42));
  const episodes = Number(flag("episodes", 3));
  const seconds = Number(flag("seconds", 4));
  const asJson = has("json");

  const { digestsMatch, rows, episodesChecked, carsChecked } = await episodeLeaks({ track, seed, episodes, seconds });

  if (asJson) {
    console.log(JSON.stringify({ ok: digestsMatch, track, seed, episodes, episodesChecked, carsChecked, digestsMatch,
                                 fieldCount: rows.length, fields: rows }, null, 2));
  } else {
    console.log(`episode-diff: ${track}, seed ${seed}, ${episodes} episodes of ${seconds}s`);
    console.log(`  digests ${digestsMatch ? "MATCH — replay is deterministic" : "DIFFER — replay is BROKEN"}`);
    if (!rows.length) {
      console.log("  no per-car field differs between the cold and warm episode");
    } else {
      console.log(`  ${rows.length} field(s) not restored by a re-grid`
                  + (digestsMatch ? " (harmless in THIS scenario — still leaks)" : ""));
      for (const r of rows) {
        const ex = r.example;
        console.log(`    ${r.field.padEnd(20)} ${String(r.cars).padStart(2)} car(s)`
                    + `   e.g. ${ex.code}: ${JSON.stringify(ex.cold)} -> ${JSON.stringify(ex.warm)}`);
      }
      console.log("  A field one car reads OFF ANOTHER is one tick stale by design,");
      console.log("  so on tick 1 it must hold the grid's value. Clear it in apex.js");
      console.log("  reset() (and gridUp() for the paths a real player takes).");
    }
  }
  process.exit(digestsMatch ? 0 : 1);
  } catch (e) {
    if (has("json")) console.log(JSON.stringify({ ok: false, error: e.message }));
    else console.error(`episode-diff: ${e.message}`);
    process.exitCode = 1;
  }
}
