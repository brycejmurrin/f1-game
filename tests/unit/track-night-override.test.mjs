// `js/track/` reads the BUILD's night, never the circuit's authored default.
//
// `def.night` is what the circuit file declares. `track._night` is what THIS
// build was asked for — the TIME OF DAY setting in game.js overrides the default, and
// tracks.js hands the resolved value to every scenery module as `NIGHT`. Reading
// `def.night` inside a scenery emitter therefore ignores the player's choice: a
// night-def circuit raced by day renders that prop's night dress in daylight,
// and a day-def circuit raced at night renders its day dress in the dark.
//
// This has now been fixed twice — once in tracks.js (written up in place) and
// scenery-structures.js ferrisWheel — so it is a recurring class, not an
// incident. The sanctioned sites RESOLVE def.night into track._night / NIGHT;
// the extracted props resolver now lives in scenery/build-props.js. Everything
// else in js/track/ is a defect.
//
// Note the deliberate asymmetry: js/game/ is NOT covered. There `def.night` is
// read through the `raceTimeOfDay === "default" && def.night` idiom, which is
// how the effective time of day is DERIVED — the correct use.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "js/track");

// tracks.js resolves the override. The extracted props builder retains the
// legacy direct-call fallback only when track._night is absent; its behavioral
// seam below pins that explicit false/true overrides always win.
const SANCTIONED = new Map([["tracks.js", 2], ["scenery/build-props.js", 1]]);

function scanNightReads(root) {
  const offenders = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { visit(full); continue; }
      if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
      const file = path.relative(root, full).split(path.sep).join("/");
      const src = readFileSync(full, "utf8");
      // Comments explain the trap and must not count as executable reads.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      const hits = (code.match(/\bdef\s*\.\s*night\b/g) || []).length;
      const allowed = SANCTIONED.get(file) || 0;
      if (hits > allowed) offenders.push(`${file}: ${hits} def.night read(s), ${allowed} sanctioned`);
    }
  }
  visit(root);
  return offenders.sort();
}

test("no js/track/ module reads def.night except the sanctioned resolvers", () => {
  const offenders = scanNightReads(DIR);
  assert.deepEqual(offenders, [],
    "js/track/ must read the destructured NIGHT (the build's value), not def.night " +
    "(the circuit's authored default).\n  " + offenders.join("\n  "));
});

test("scanner accepts nested build night and comments, but finds nested authored defaults", () => {
  mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const fixture = mkdtempSync(path.join(ROOT, "artifacts/night-override-"));
  try {
    mkdirSync(path.join(fixture, "scenery/deep"), { recursive: true });
    writeFileSync(path.join(fixture, "tracks.js"), "const a = def.night; const b = def . night;\n");
    writeFileSync(path.join(fixture, "scenery/deep/nature.js"),
      "/* def.night */ const lights = NIGHT; // def.night\n");
    writeFileSync(path.join(fixture, "scenery/ignored.txt"), "def.night");
    assert.deepEqual(scanNightReads(fixture), [], "sanctioned root reads and nested comments/build value are accepted");
    writeFileSync(path.join(fixture, "scenery/deep/structures.js"), "const lights = def.night;\n");
    writeFileSync(path.join(fixture, "scenery/tracks.js"), "const lights = def . night;\n");
    assert.deepEqual(scanNightReads(fixture), [
      "scenery/deep/structures.js: 1 def.night read(s), 0 sanctioned",
      "scenery/tracks.js: 1 def.night read(s), 0 sanctioned",
    ], "recursive paths are checked; a nested tracks.js does not inherit the root allowance");
    writeFileSync(path.join(fixture, "tracks.js"), "def.night; def.night; def.night;\n");
    assert.ok(scanNightReads(fixture).includes("tracks.js: 3 def.night read(s), 2 sanctioned"),
      "the root allowance remains capped at exactly two reads");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("props resolver honors both build overrides and only falls back when absent", () => {
  const source = readFileSync(path.join(DIR, "scenery/build-props.js"), "utf8");
  const declaration = source.match(/const NIGHT = [^;]+;/)?.[0];
  assert.ok(declaration, "the props builder's production NIGHT resolver exists");
  const resolve = new Function("track", "def", `${declaration} return NIGHT;`);
  assert.equal(resolve({ _night: false }, { night: true }), false, "day build overrides authored night");
  assert.equal(resolve({ _night: true }, { night: false }), true, "night build overrides authored day");
  for (const track of [{}, { _night: null }]) {
    assert.equal(resolve(track, { night: true }), true, "direct caller falls back to authored night");
    assert.equal(resolve(track, { night: false }), false, "direct caller falls back to authored day");
  }
});
