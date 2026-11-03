import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// #4683: fetch-depth 0 fetched all 355 branch heads; the trusted-rows checkout timed out at 10 min.
const yml = readFileSync(new URL("../../.github/workflows/land.yml", import.meta.url), "utf8");
const job = (name) => {
  const i = yml.indexOf(`\n  ${name}:\n`);
  assert.ok(i >= 0, name);
  const m = /\n  [a-z-]+:\n/.exec(yml.slice(i + 2));
  return yml.slice(i, m ? i + 2 + m.index : undefined);
};

for (const name of ["trusted-rows", "land-gate"]) {
  test(`${name}: shallow checkout then one-branch unshallow`, () => {
    const j = job(name);
    assert.match(j, /fetch-depth: 1\b/);
    assert.doesNotMatch(j, /fetch-depth: 0/);
    assert.match(j, /git fetch --quiet --no-tags --unshallow origin "\+refs\/heads\/\$\{DEPLOY_BRANCH\}/);
  });
}

test("trusted-rows has the same 20 min cap as land-gate", () => {
  assert.match(job("trusted-rows"), /timeout-minutes: 20\b/);
});
