/* assert-match-ratchet.test.mjs — pin-shaped asserts under tests/unit only ever go down (#1682).
 *
 * Source-text pins break on refactors that change no behaviour. Converting
 * them (gfx-backend-canary first) lowers the count; a new pin raises it and
 * fails until the change converts one, or raises the ceiling deliberately with
 * a reason (`node tools/check/ratchets.mjs --update --fragment --reason="<why>"`).
 *
 * The count is `tree.assertPins` in tests/data/ratchets.json (raises are
 * ratchets.d fragments, so two PRs that each add one stay mergeable), and it
 * counts `assert.ok(x.includes(` alongside the regex form: the 2026-10 commits
 * that swapped one for the other lowered the number with every pin intact.
 *
 * DIFF-RELATIVE (2026-10-26). On a PR the row fails only on growth the PR adds
 * against its base (the merge ref's first parent; locally the merge-base with
 * the deploy branch); the absolute ceiling runs with APEX_RATCHET_ABSOLUTE=1,
 * which ci.yml sets on push and schedule. tools/check/ratchets.mjs ratchetMode.
 *
 * Run: node --test tests/unit/assert-match-ratchet.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinVerdict, pinSites, pinPatterns } from "../../tools/check/ratchets.mjs";

const count = (t) => (t.match(pinPatterns.ASSERT_PIN) || []).length;

test("the pin pattern counts assert.match and assert.ok(x.includes(, not other asserts", () => {
  assert.equal(count("assert.match(src, /x/);"), 1);
  assert.equal(count('assert.ok(src.includes("x"));'), 1);
  assert.equal(count('assert.ok(!game.src.includes("x"), "gone");'), 1);
  assert.equal(count("assert.ok(a > 1); assert.equal(src, 'x');"), 0);
  assert.equal(count("assert.doesNotMatch(src, /x/);"), 0);
});

test("pin-shaped asserts under tests/unit never grow (convert source pins to behaviour)", async () => {
  const v = await pinVerdict("assertPins");
  const biggest = async () => (await pinSites("assertPins")).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => `${f} ${n}`).join(", ");
  assert.ok(v.ok,
    `${v.value} pin-shaped asserts (ceiling ${v.ceiling}${v.base ? `; base ${v.base.value}/${v.base.ceiling}` : ""}) — ` +
    `this change adds pins: convert a source pin to a VM/behaviour assertion (#1682 / gfx-backend-canary). Biggest: ${await biggest()}`);
  if (v.inherited) console.log(`assert-match-ratchet: over by ${v.over}, inherited from the base (${v.why})`);
  assert.ok(v.looseOk,
    `${v.value} pin-shaped asserts is far under the ceiling ${v.ceiling}: ` +
    "node tools/check/ratchets.mjs --update --lower-only so the ratchet keeps its grip");
});
