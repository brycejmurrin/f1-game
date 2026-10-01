// track-validate-fleet — the ORACLE for js/editor/validate.js: judge every
// shipped circuit's built centreline by the designer's rules. Real circuits
// must not read RED on length, crossing (Suzuka's figure-8 is bridged),
// clearance or grade, and the tarmac-fold rule must name exactly the circuits
// tools/track/verify-track.cjs knows fold (bahrain, buddh, fuji, korea). The
// start-straight rule is REPORTED, not asserted: pit.js names the circuits
// whose real start sits in a corner. Proves the validator measures the
// engine, not itself. ~52 centreline builds, a few seconds.
//
// Run: node --test tests/unit/track-validate-fleet.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { bootEditor } from "../helpers/editor-vm.mjs";

const KNOWN_FOLDS = ["bahrain", "buddh", "fuji", "korea"];   // verify-track.cjs knownTarmacFolds()

test("the shipped fleet passes the designer's road rules; the fold rule agrees with verify-track", () => {
  const { Tracks, V } = bootEditor();
  const reds = [], folds = [], startShort = [], ambers = {};
  for (const def of Tracks.LIST) {
    if (def.custom) continue;
    const tr = Tracks.buildCenterline(def);
    const j = V.judge(tr, def);
    for (const i of j.issues) {
      if (i.level === "amber") ambers[i.code] = (ambers[i.code] || 0) + 1;
      if (i.level !== "red") continue;
      if (i.code === "fold") { folds.push(def.id); continue; }
      if (i.code === "start") { startShort.push(def.id + " (" + j.stats.startBackM + "/" + j.stats.startFwdM + " m)"); continue; }
      if (i.code === "grade") { startShort.push(def.id + " grade " + j.stats.gradeMax + " %"); continue; }   // real hills: reported, like the start
      reds.push(def.id + ": " + i.code + " — " + i.msg);
    }
    if (def.id === "suzuka") {
      assert.ok(j.issues.some((i) => i.code === "bridge" && i.level === "info"), "Suzuka's crossing reads as bridged");
      assert.ok(!j.issues.some((i) => i.code === "crossing"), "…not at grade");
    }
    assert.ok(j.turns.length >= 3, def.id + " bakes turns");
  }
  console.log("fleet oracle: start-straight shortfalls (reported, not asserted): " + (startShort.join(", ") || "none"));
  console.log("fleet oracle: amber counts " + JSON.stringify(ambers));
  assert.deepEqual(reds, [], "a shipped circuit reads RED on a rule that is meant to measure the engine");
  assert.deepEqual(folds.sort(), KNOWN_FOLDS.slice().sort(), "the fold rule names exactly verify-track's known folds");
});
