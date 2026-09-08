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

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] != null ? argv[i + 1] : def;
};
const has = (name) => argv.includes("--" + name);

const track = flag("track", "monza");
const seed = Number(flag("seed", 42));
const episodes = Math.max(2, Number(flag("episodes", 3)));
const seconds = Number(flag("seconds", 4));
const asJson = has("json");

// Every primitive on a car. Objects become a stable tag rather than being
// walked: the leaks of this class have all been numbers and booleans, and a
// deep walk would drown the diff in team/track back-references.
function snapshot(cars) {
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

const g = await createGame({ track });
try {
  await g.race(track);
  const A = g.apex;
  const digests = [], snaps = [];

  for (let e = 0; e < episodes; e++) {
    A.headless(true);
    A.reset(0.02, 55, 0, seed);
    // The snapshot is taken AFTER reset and BEFORE the first tick: that is the
    // state the episode starts from, and the only place the leak is visible
    // without being tangled up in the divergence it causes.
    snaps.push(snapshot(g.G.cars));
    const r = A.rollout({ seconds, input: { steer: 0.05, throttle: true } });
    const f = A.field({ detail: "full" });
    A.headless(false);
    digests.push(JSON.stringify({
      distanceM: r.distanceM, speed: r.speedKph, to: r.to,
      grid: f.positions.map((p) => p.code + ":" + p.pace).join(","),
    }));
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

  if (asJson) {
    console.log(JSON.stringify({ ok: true, track, seed, episodes, digestsMatch,
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
} finally {
  g.close();
}
