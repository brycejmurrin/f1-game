// Characterization pin for every gap formatter (#6504, gardener carve 8).
// Two families, recorded as they print today, byte for byte:
//   TIMING SHEET (3 dp, unsigned "+"): results.js → Dom.fmtGap, and the
//     real-race-script.js copy, which DIFFERS (null "—", 0 "", a negative or
//     NaN printed through) and so keeps its own body;
//   HUD (2 dp under ~10 s, signed): HudReadouts.fmtGap / fmtGapSec, plus the
//     boot-without-HudReadouts fallbacks in hud-relative.js and
//     replay-broadcast.js, which must print what HudReadouts prints.
// A change to any row is a behaviour change, not a carve.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { seedDom } from "../helpers/seed-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// One function body lifted out of a module's source into a sandbox.
function lift(file, re, globals = {}) {
  const m = read(file).match(re);
  assert.ok(m, `${file}: ${re} found`);
  const ctx = vm.createContext({ ...globals });
  vm.runInContext(m[0] + "; this.fmtGap = fmtGap;", ctx, { filename: absSrc(file) });
  return ctx.fmtGap;
}
const HR = (() => {
  const c = vm.createContext({});
  vm.runInContext(read("js/ui/hud-readouts.js") + "; this.HudReadouts = HudReadouts;", c, { filename: absSrc("js/ui/hud-readouts.js") });
  return c.HudReadouts;
})();

const Dom = seedDom(vm.createContext({})).Dom;

const IN = [-1, -0, 0, 0.0005, 0.999, 9.994, 9.995, 59.999, 60, 99.5, 3599.9, NaN, Infinity, null, undefined, "+1 LAP"];
const label = (v) => (Object.is(v, -0) ? "-0" : typeof v === "string" ? JSON.stringify(v) : String(v));
const run = (f) => IN.map((v) => { try { return f(v); } catch { return "THROWS"; } });
function table(name, f, want) {
  const got = run(f);
  IN.forEach((v, i) => assert.equal(got[i], want[i], `${name}(${label(v)})`));
}

test("timing sheet: results.js gap cells print through Dom.fmtGap", () => {
  table("Dom.fmtGap", (v) => Dom.fmtGap(v),
    ["—", "—", "—", "+0.001", "+0.999", "+9.994", "+9.995", "+59.999", "+60.000", "+99.500", "+3599.900",
      null, null, null, null, "+1 LAP"]);
  // No local copy, and both cells (race gap, qualifying gap) route through Dom.fmtGap.
  assert.deepEqual(read("js/data/results.js").match(/(?:function |Dom\.)?fmtGap\((?:r\.gap|qGap|v)?/g),
    ["Dom.fmtGap(r.gap", "Dom.fmtGap(qGap"], "results.js: no copy; race + quali cells call Dom.fmtGap");
});

test("timing sheet: the real-race-script.js outlier prints as it did (null —, 0 blank, negative/NaN printed through)", () => {
  table("RealRaceScript.fmtGap", lift("js/data/real-race-script.js", /function fmtGap\(v\) \{.*\}/),
    ["+-1.000", "", "", "+0.001", "+0.999", "+9.994", "+9.995", "+59.999", "+60.000", "+99.500", "+3599.900",
      "+NaN", "+Infinity", "—", "—", "THROWS"]);
});

test("HUD: HudReadouts.fmtGapSec / fmtGap on the edge table", () => {
  table("HudReadouts.fmtGapSec", (v) => HR.fmtGapSec(v, "standard"),
    ["1.00", "0.00", "0.00", "0.00", "1.00", "9.99", "10.0", "60.0", "60.0", "99.5", "3599.9", "--", "--", "0.00", "--", "--"]);
  table("HudReadouts.fmtGapSec broadcast", (v) => HR.fmtGapSec(v, "broadcast"),
    ["1.00", "0.00", "0.00", "0.00", "1.00", "9.99", "9.99", "60.00", "60.00", "99.50", "3599.90", "--", "--", "0.00", "--", "--"]);
  table("HudReadouts.fmtGap", (v) => HR.fmtGap(v, false, "standard"),
    ["+1.00", "+0.00", "+0.00", "+0.00", "+1.00", "+9.99", "+10.0", "+60.0", "+60.0", "+99+", "+99+", "+--", "+--", "+0.00", "+--", "+--"]);
});

test("HUD: the hud-relative.js fallback prints what HudReadouts.fmtGap prints", () => {
  const re = /function fmtGap\(sec, ahead, profile\) \{[\s\S]*?\n  \}/;
  const bare = lift("js/ui/hud-relative.js", re), wired = lift("js/ui/hud-relative.js", re, { HudReadouts: HR });
  // Numbers and null only: REL never passes a string or undefined.
  for (const v of IN.filter((x) => typeof x === "number" || x === null)) {
    for (const ahead of [true, false]) for (const p of ["standard", "broadcast"]) {
      assert.equal(bare(v, ahead, p), HR.fmtGap(v, ahead, p), `bare(${label(v)}, ${ahead}, ${p})`);
      assert.equal(wired(v, ahead, p), HR.fmtGap(v, ahead, p), `wired(${label(v)}, ${ahead}, ${p})`);
    }
  }
});

test("HUD: the replay-broadcast.js tower cell, with and without HudReadouts", () => {
  const re = /function fmtGap\(r, mode, profile\) \{[\s\S]*?\n  \}/;
  const bare = lift("js/race/replay-broadcast.js", re), wired = lift("js/race/replay-broadcast.js", re, { HudReadouts: HR });
  const row = (gap) => ({ pos: 2, gap, interval: gap });
  for (const f of [bare, wired]) {
    assert.equal(f({ out: true }, "gap"), "OUT");
    assert.equal(f({ finished: true }, "gap"), "FIN");
    assert.equal(f({ pit: true }, "gap"), "PIT");
    assert.equal(f({ pos: 1 }, "gap"), "LEADER");
    assert.equal(f({ pos: 1 }, "interval"), "INTERVAL");
    assert.equal(f({ pos: 3, down: 1 }, "gap"), "+1 LAP");
    assert.equal(f({ pos: 3, down: 2 }, "gap"), "+2 LAPS");
    assert.equal(f(row(null), "gap"), "");
    assert.equal(f(row(undefined), "interval"), "");
  }
  for (const v of [0, 0.0005, 0.999, 9.994, 9.995, 59.999, 60, 99.5, 3599.9]) {
    for (const p of [undefined, "standard", "broadcast"]) {
      assert.equal(bare(row(v), "gap", p), "+" + HR.fmtGapSec(v, p), `bare(${v}, ${p})`);
      assert.equal(wired(row(v), "interval", p), "+" + HR.fmtGapSec(v, p), `wired(${v}, ${p})`);
    }
  }
});
