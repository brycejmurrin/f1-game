// `js/track/` reads the BUILD's night, never the circuit's authored default.
//
// `def.night` is what the circuit file declares. `track._night` is what THIS
// build was asked for — game.js's TIME OF DAY setting overrides the default, and
// tracks.js hands the resolved value to every scenery module as `NIGHT`. Reading
// `def.night` inside a scenery emitter therefore ignores the player's choice: a
// night-def circuit raced by day renders that prop's night dress in daylight,
// and a day-def circuit raced at night renders its day dress in the dark.
//
// This has now been fixed twice — once in tracks.js (written up in place) and
// scenery-structures.js ferrisWheel — so it is a recurring class, not an
// incident. Two sites in tracks.js are sanctioned: they are the ones that
// RESOLVE def.night into track._night / NIGHT. Everything else in js/track/ is
// a defect.
//
// Note the deliberate asymmetry: js/game/ is NOT covered. There `def.night` is
// read through the `raceTimeOfDay === "default" && def.night` idiom, which is
// how the effective time of day is DERIVED — the correct use.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "js/track");

// tracks.js resolves the override; those two reads are the contract, not a bug.
const SANCTIONED = new Map([["tracks.js", 2]]);

test("no js/track/ module reads def.night except the two that resolve it", () => {
  const offenders = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".js"))) {
    const src = readFileSync(path.join(DIR, file), "utf8");
    // Strip block and line comments: the fix in tracks.js and the one in
    // scenery-structures.js both EXPLAIN the trap in prose, and a guard that
    // matches its own warning is the failure mode this repo keeps hitting.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    const hits = (code.match(/\bdef\s*\.\s*night\b/g) || []).length;
    const allowed = SANCTIONED.get(file) || 0;
    if (hits > allowed) offenders.push(`${file}: ${hits} def.night read(s), ${allowed} sanctioned`);
  }
  assert.deepEqual(offenders, [],
    "js/track/ must read the destructured NIGHT (the build's value), not def.night " +
    "(the circuit's authored default).\n  " + offenders.join("\n  "));
});
