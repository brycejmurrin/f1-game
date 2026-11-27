// #7143 (#6455 row 12): the phone type-floor block lives in css/race-setup.css only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../../css/${f}`, import.meta.url), "utf8");
const RULE = 'body:not(.desktop) #sel-preview-gp { font-size: var(--fs-micro); }';

test("the select/race-setup phone type floor is spelled once, in race-setup.css", () => {
  assert.equal(read("select.css").split(RULE).length - 1, 0, "select.css must not repeat the block");
  assert.equal(read("race-setup.css").split(RULE).length - 1, 1, "race-setup.css owns the block");
});

test("the dropped select.css selectors are still covered by race-setup.css", () => {
  const rs = read("race-setup.css");
  for (const sel of [".track-group-head", ".sur-rnd", "#mb-career-sub", ".trb"]) {
    assert.ok(rs.includes(`body:not(.desktop) ${sel}`) || rs.includes(sel), sel);
  }
});
