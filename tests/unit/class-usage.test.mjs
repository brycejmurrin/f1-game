// THE DIRECTION THE INVENTORY NEVER CHECKED: applied, defined nowhere.
//
// `component-inventory.test.mjs` guards DEFINED-but-unapplied — a rule in css/
// that nothing wears. This is the mirror, and the expensive one. An element
// wearing a name no rule matches reads as styled: the reviewer takes intent off
// the class, the element quietly inherits whatever its siblings give it, and
// nothing anywhere fails. Three of the four UI findings of 2026-09-22 were
// exactly this, and the sweep that found them was a throwaway script — so the
// same three could have come back the next week.
//
// A missing rule is not automatically a defect, which is why this asserts an
// EXPLAINED set rather than an empty one: every name is either queried by JS (a
// state hook, no rule wanted) or carries a reason in KNOWN. Adding a class with
// no rule and no reason is what fails.
import { test } from "node:test";
import assert from "node:assert";
import { sweep, KNOWN } from "../../tools/check/class-usage.mjs";

test("every applied class is defined, queried, or explained", () => {
  const bad = sweep().undef.filter((u) => !u.queried && !(u.cls in KNOWN));
  assert.deepStrictEqual(bad.map((u) => u.cls), [],
    "these classes are applied but no css/ rule defines them, no JS queries " +
    "them, and tools/check/class-usage.mjs's KNOWN does not say why: " +
    bad.map((u) => `${u.cls} (${u.sites.join(", ")})`).join("; "));
});

// KNOWN is an explanation list, not a suppression list. A name that gets a rule
// — or leaves the markup — must leave KNOWN too, or the next reader trusts a
// reason that stopped being true.
test("KNOWN names no class that is now defined or gone", () => {
  const { undef } = sweep();
  const live = new Set(undef.map((u) => u.cls));
  const stale = Object.keys(KNOWN).filter((c) => !live.has(c)).sort();
  assert.deepStrictEqual(stale, [],
    "tools/check/class-usage.mjs KNOWN explains classes that are no longer " +
    "applied-but-undefined (they got a rule, or left the markup): " + stale.join(", "));
});

// The extraction is the part that can rot silently: if a regex stops matching,
// `undef` empties out and both tests above pass while seeing nothing. Anchor on
// the busiest reader (`Dom.el(tag, cls)`) and on index.html's class attributes,
// each with a class this tree will not plausibly lose.
test("the sweep still reads both markup and Dom.el()", () => {
  const { applied } = sweep();
  assert.ok(applied.size > 300, `only ${applied.size} classes seen — extraction regressed`);
  assert.ok(applied.get("set-row")?.has("index.html"), "index.html class attributes are not being read");
  const viaEl = [...applied.entries()].filter(([, s]) => [...s].some((x) => x.startsWith("js/")));
  assert.ok(viaEl.length > 150, `only ${viaEl.length} classes seen from js/ — extraction regressed`);
});
