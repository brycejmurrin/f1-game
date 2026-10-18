// ratchet-reason.test.mjs — silent absorb is 20; a Ratchet-Reason trailer lifts it to 40.
// Run: node --test tests/unit/ratchet-reason.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { absorbLimit, trailerReason, ABSORB_SILENT, ABSORB_WITH_REASON, readCommitMessage } from "../../tools/hooks/ratchet-reason.mjs";
import { autoRaiseBlockReason } from "../../tools/check/ratchets.mjs";

const row = (over) => ({ file: "js/game.js", metric: "lines", ceiling: 10, value: 10 + over, over });

test("no trailer keeps the silent cap, so 21 lines are refused and a trailer of 'extract' allows them", () => {
  assert.equal(trailerReason("extract the block\n"), null);
  assert.equal(trailerReason("Ratchet-Reason:\n"), null);
  assert.equal(trailerReason("Ratchet-Reason:   \n"), null);
  assert.equal(absorbLimit("just a subject"), ABSORB_SILENT);
  assert.equal(absorbLimit(""), ABSORB_SILENT);
  assert.match(autoRaiseBlockReason(row(21), absorbLimit("")), /past the 20-line/);
  const msg = "carve\n\nRatchet-Reason: extract\n";
  assert.equal(trailerReason(msg), "extract");
  assert.equal(absorbLimit(msg), ABSORB_WITH_REASON);
  assert.equal(autoRaiseBlockReason(row(21), absorbLimit(msg)), null);
  assert.match(autoRaiseBlockReason(row(41), absorbLimit(msg)), /past the 40-line/);
});

test("the auto-raise CLI with no =N asks absorbLimit for the commit message", () => {
  const src = fs.readFileSync(new URL("../../tools/check/ratchets.mjs", import.meta.url), "utf8");
  assert.match(src, /auto\.includes\("="\) \? \(Number\(auto\.split\("="\)\[1\]\) \|\| 40\) : absorbLimit\(readCommitMessage\(\)\)/);
});

test("a shell with no hook env sees no commit message", () => {
  assert.equal(readCommitMessage({}), "");
  assert.equal(readCommitMessage({ APEX_COMMIT_MESSAGE: "Ratchet-Reason: extract" }), "Ratchet-Reason: extract");
});
