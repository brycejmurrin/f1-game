// html-sink-lint — every innerHTML / outerHTML / insertAdjacentHTML in js/
// writes a source constant, or is in tests/data/html-sink-allowlist.json with
// a reason its dynamic parts cannot carry player text.
//
// The class this holds: a custom team's driver name (settable by an imported
// garage file) reached `el.innerHTML` through js/ui/aria-state.js paintOnOff —
// stored XSS, fixed 2026-09-24 by escaping. The audit that followed read every
// sink by hand; this makes the NEXT one fail here instead of in a player's
// browser. Stale and miscounted allowlist entries fail too, so the list cannot
// quietly outlive the code it vouches for.
//
// Run: node --test tests/unit/html-sink-lint.test.mjs   (pure source scan, ~1 s)
import test from "node:test";
import assert from "node:assert/strict";
import { lintSource, isConstantHtml, audit, readAllowlist } from "../../tools/check/html-sink-lint.mjs";

const keys = (src) => lintSource(src, "f.js").sites.map((s) => s.key);

test("constant markup is not a site", () => {
  for (const src of [
    `el.innerHTML = "";`,
    `el.innerHTML = "<b>x</b>";`,
    "el.innerHTML = `<i>${1}</i>`;",
    "el.innerHTML = `<i>plain</i>`;",
    `el.innerHTML = '<a>' + "b" + '</a>';`,
    `el.innerHTML = on ? "&#9654;" : "&#10074;";`,
    `document.body.insertAdjacentHTML("afterbegin", '<aside>' + '</aside>');`,
    `el.textContent = name;`,
  ]) assert.deepEqual(keys(src), [], src);
});

test("anything that interpolates a value is a site, keyed by receiver and sink", () => {
  assert.deepEqual(keys(`el.innerHTML = name;`), ["f.js::el.innerHTML"]);
  assert.deepEqual(keys("el.innerHTML = `<b>${name}</b>`;"), ["f.js::el.innerHTML"]);
  assert.deepEqual(keys(`a.b.innerHTML = "<b>" + t.name + "</b>";`), ["f.js::a.b.innerHTML"]);
  assert.deepEqual(keys(`el.innerHTML += x;`), ["f.js::el.innerHTML"], "+= appends markup too");
  assert.deepEqual(keys(`el["innerHTML"] = x;`), ["f.js::el.innerHTML"], "the computed spelling is the same sink");
  assert.deepEqual(keys(`el.outerHTML = x;`), ["f.js::el.outerHTML"]);
  assert.deepEqual(keys(`el.insertAdjacentHTML("beforeend", row);`), ["f.js::el.insertAdjacentHTML"]);
  assert.deepEqual(keys(`$("x").innerHTML = f(t);`), ['f.js::$("x").innerHTML']);
  assert.deepEqual(keys(`el.innerHTML = on ? name : "";`), ["f.js::el.innerHTML"],
    "a ternary is constant only when BOTH arms are");
});

test("the constant test is structural, not a regex over the text", () => {
  const parse = (e) => lintSource(`x.innerHTML = ${e};`, "f.js").sites.length === 0;
  assert.equal(parse(`"a" + ("b" + "c")`), true);
  assert.equal(parse(`"a" + ("b" + c)`), false);
  assert.equal(parse(`"a" - "b"`), false, "only + concatenates");
  assert.equal(isConstantHtml(null), false);
});

test("a malicious-shaped site in a fixture is caught", () => {
  // The shape of the 2026-09-24 bug, before the escape.
  const src = `function paint(el){ const html = wrap(el.textContent); if (html) el.innerHTML = html; }`;
  assert.equal(lintSource(src, "fixture.js").sites.length, 1);
});

test("every HTML sink in js/ is constant or audited, and the allowlist is exact", () => {
  const a = audit();
  assert.deepEqual(a.parseErrors, [], "a js/ file failed to parse");
  assert.deepEqual(a.unaudited.map((s) => `${s.file}:${s.line} ${s.key}`), [],
    "unaudited HTML sink — build the node with Dom.el()/textContent or escape the " +
    "dynamic part; only a site that cannot carry player text belongs in the allowlist");
  assert.deepEqual(a.stale, [], "allowlist entries with no matching site — delete them");
  assert.deepEqual(a.miscounted, [], "an audited key gained or lost a site — re-audit it");
  for (const [k, v] of Object.entries(readAllowlist())) {
    assert.ok(v && typeof v.reason === "string" && v.reason.length >= 20, `${k} needs a real reason`);
  }
  // Anti-vacuity: the walk really sees the audited population.
  assert.ok(Object.keys(readAllowlist()).length >= 5, "the allowlist should not be empty");
});
