// validation-cli-lighting.test.mjs — bounded negative contracts: an invalid or uncovered
// request cannot report green. tools/lighting/preset-validation.mjs and the lighting-tuner scripts: one snapshot validator, and --check reports real deltas without writing shipped presets.
// Regrouped per tool out of validation-cli.test.mjs (#3043 T5-30), assertions unchanged.
// Run: node --test tests/unit/validation-cli-lighting.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { validatePresets, presetChanges } from "../../tools/lighting/preset-validation.mjs";
import { ROOT, cli, fixture } from "../helpers/validation-cli.mjs";

test("lighting snapshots share exact profile/knob/range/grid validation", () => {
  assert.deepEqual(validatePresets({ "monza|night|wet": { keyMul: 1.005 }, "*|dusk": { keyMul: 1 }, "*|dawn|dry": { ambientMul: 0.5 }, "custom-1234abcd|day|dry": { keyMul: 1 } }), []);
  for (const obj of [{ invalid: { keyMul: 1 } }, { "monza|night|wet": { typo: 1 } }, { "monza|day|dry": { keyMul: 100 } }, { "monza|day|dry": { keyMul: 1.0001 } }])
    assert.ok(validatePresets(obj).length > 0);
  assert.deepEqual(presetChanges({ z: { keyMul: 1 }, a: { keyMul: 1 } }, { a: { keyMul: 2 }, b: {} }), { added: ["b"], deleted: ["z"], changed: ["a"] });
});

test("lighting check mode reports actual snapshot/delta changes without writing shipped presets", (t) => {
  const dir = fixture(t), before = fs.readFileSync(path.join(ROOT, "js/lighting/presets.js"));
  const snapshot = path.join(dir, "snapshot.json"), edits = path.join(dir, "edits.js");
  fs.writeFileSync(snapshot, JSON.stringify({ "*": { keyMul: 1 } }));
  fs.writeFileSync(edits, 'window.LightEdits = {"monza|night|wet":{"keyMul":1.005}};');
  for (const [tool, input] of [["bake", snapshot], ["merge-proposals", edits]]) {
    const result = cli(`.claude/skills/lighting-tuner/scripts/${tool}.mjs`, [input, "--check", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mode, "check");
    if (tool === "merge-proposals") {
      assert.deepEqual(report.changes, { added: [], deleted: [], changed: ["monza|night|wet"] });
    } else {
      // bake is a FULL replace: the one-profile snapshot changes "*" and deletes the rest
      assert.deepEqual([report.changes.added, report.changes.changed], [[], ["*"]]);
      assert.ok(report.changes.deleted.includes("monza|night|wet"), "bake reports shipped profiles it would delete");
      assert.equal(report.profiles, 1);
    }
  }
  assert.deepEqual(fs.readFileSync(path.join(ROOT, "js/lighting/presets.js")), before);
  fs.writeFileSync(edits, 'window.LightEdits = {"monza|night|wet":{"typo":1}};');
  const bad = cli(".claude/skills/lighting-tuner/scripts/merge-proposals.mjs", [edits, "--check"]);
  assert.equal(bad.status, 1);
  assert.ok(bad.stderr.includes(path.relative(ROOT, edits)), "diagnostic retains the input path");
  for (const input of [
    'window.LightEdits = {"monza|night|wet":{"wetness":0.5}};',
    JSON.stringify({ track: "monza", combos: { "night|wet": { wetness: 0.5 } } }),
  ]) {
    fs.writeFileSync(edits, input);
    const wet = cli(".claude/skills/lighting-tuner/scripts/merge-proposals.mjs", [edits, "--check"]);
    assert.equal(wet.status, 1, "physics wetness cannot be baked through either proposal shape");
    assert.match(wet.stderr, /wetness must not be baked/);
  }
  assert.deepEqual(fs.readFileSync(path.join(ROOT, "js/lighting/presets.js")), before);
});
