// race-entry-cover.test.mjs — RaceEntryProfile.stallHandoffCover reads game state through bindGame (#5965).
// game.js's G and loadingScreen are function-scoped consts inside its IIFE: the old `typeof G` / `typeof loadingScreen`
// reads from this script were always false, so only the armed window ever counted as cover.
// Run: node --test tests/unit/race-entry-cover.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = "js/perf/race-entry-profile.js";

function load() {
  const ctx = { Math, Object, Array, Number, String, JSON, Map, Set, console, performance: { now: () => 0 } };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, SRC), "utf8").replace(/^const\b/gm, "var"), ctx, { filename: absSrc(SRC) });
  return ctx.RaceEntryProfile;
}

test("stallHandoffCover: the countdown and the loading phases cover once game.js binds its getters", () => {
  const P = load();
  assert.equal(P.stallHandoffCover(), false, "unbound and disarmed: no cover");
  let state = "menu", phase = "";
  P.bindGame({ state: () => state, loadPhase: () => phase });
  assert.equal(P.stallHandoffCover(), false, "menu, no loading phase: no cover");
  state = "count";
  assert.equal(P.stallHandoffCover(), true, "the countdown is covered with the profile disarmed");
  state = "race";
  for (const p of ["handoff", "busy", "build", "garage", "prep"]) { phase = p; assert.equal(P.stallHandoffCover(), true, p); }
  phase = "run";
  assert.equal(P.stallHandoffCover(), false, "the flyby (run) is not a cover phase");
  P.bindGame({ state: () => { throw Error("mid-boot"); }, loadPhase: () => { throw Error("mid-boot"); } });
  assert.equal(P.stallHandoffCover(), false, "a getter that throws mid-boot is no cover and no crash");
});
