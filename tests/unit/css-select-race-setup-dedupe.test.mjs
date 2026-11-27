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

// #7143 (#6455 row 6, Bryce's decision A): `light` is unconditional and `system` sits inside
// @media (prefers-color-scheme: light), so CSS cannot spell the 20 tokens once. Both blocks stay;
// this guard keeps them identical, and the count pinned so a new token must land in both.
const tokens = read("tokens.css");
function declsAfter(open) {
  const i = tokens.indexOf(open);
  assert.ok(i >= 0, `${open} not found`);
  const body = tokens.slice(tokens.indexOf("{", i) + 1, tokens.indexOf("\n  }", i) >= 0 && open.startsWith("  ") ? tokens.indexOf("\n  }", i) : tokens.indexOf("\n}", i));
  const out = new Map();
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].replace(/\s+/g, " ").trim());
  return out;
}

test("the light and system light-token blocks declare the same 20 properties with the same values", () => {
  const light = declsAfter(':root[data-ui-theme="light"] {');
  const system = declsAfter('  :root[data-ui-theme="system"] {');
  assert.equal(light.size, 20, "light block token count");
  assert.deepEqual([...system].sort(), [...light].sort());
});
